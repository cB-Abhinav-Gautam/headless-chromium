# headless-chromium

A small, always-current headless Chromium for server-side rendering (PDF
receipts, reports, screenshots) inside Docker images.

| | Image size added | Chromium version |
|---|---|---|
| Debian `chromium` package | ~770 MB | current |
| Debian `chromium-headless-shell` | ~540 MB | current |
| `@sparticuz/chromium` | ~80 MB | lags Chrome by months (153 when Chrome was 156) |
| **this** | **~85 MB + ~25 MB of Debian libraries** | **latest Stable at every image build** |

## How it works

1. `build.sh` downloads Google's **Chrome for Testing headless shell** for the
   latest Stable release (or `CHROME_VERSION`) straight from Google's bucket.
   Nothing in this repository re-hosts Chromium.
2. The shell links `libgbm`, but only uses it for hardware GPU buffers, which
   headless rendering never touches. Debian's real `libgbm1` pulls in Mesa and
   LLVM (~190 MB), so a stub with the same symbols, each reporting "no device",
   is compiled and bundled instead. Chromium falls back to software rendering.
3. `check-needed.js` fails the build if Google adds a shared library that the
   apt list below does not cover.
4. Everything is packed into `chromium.tar.zst` (zstd level 19, ~85 MB).
5. At runtime `index.js` unpacks it once per container into
   `<tmp>/headless-chromium/<version>` (~270 MB, about 2 seconds, checksum
   verified, safe when several processes start at once).

Linux x86-64 only: Google does not publish Chrome for Testing for Linux arm64.

## Use in a Dockerfile

```dockerfile
FROM node:24-trixie-slim AS chromium
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip git gcc libc6-dev binutils \
 && rm -rf /var/lib/apt/lists/*
ARG HEADLESS_CHROMIUM_REF=v1.0.0
# Empty = latest Chrome Stable; set to pin, e.g. 156.0.8078.80
ARG CHROME_VERSION=
RUN git clone --depth 1 --branch "$HEADLESS_CHROMIUM_REF" https://github.com/cB-Abhinav-Gautam/headless-chromium.git /src \
 && CHROME_VERSION="$CHROME_VERSION" /src/build.sh /opt/headless-chromium

FROM node:24-trixie-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libnss3 libglib2.0-0t64 libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64 libdbus-1-3 \
      libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libxkbcommon0 \
      libasound2t64 libexpat1 libudev1 \
      fontconfig-config fonts-liberation fonts-lohit-deva \
 && rm -rf /var/lib/apt/lists/*
# Debian's fontconfig maps Arial/Times/Courier to Liberation.
ENV FONTCONFIG_PATH=/etc/fonts
COPY --from=chromium /opt/headless-chromium /opt/headless-chromium
```

The runtime packages are Debian's own, so they get Debian security updates
whenever the image is rebuilt. Rebuilding also picks up the newest Chrome, so
rebuild regularly (or pin `CHROME_VERSION` and bump it deliberately).

Fonts: Liberation covers Latin text and the rupee sign with Arial/Times
metrics; Lohit covers Devanagari. Add other `fonts-*` packages as needed.

## Use from Node

```js
const chromium = require("/opt/headless-chromium");
const puppeteer = require("puppeteer-core");

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  env: chromium.env(),   // puts the bundled libgbm stub on LD_LIBRARY_PATH
  args: chromium.args,   // container flags only; web security stays on
  headless: "shell",
});
```

## Security notes

- `chromium.args` deliberately leaves web security on. With
  `--disable-web-security` (as some Lambda-oriented packages default to), HTML
  containing `<iframe src="file:///etc/hostname">` puts that file into the PDF.
- When rendering HTML that includes user-entered values, also escape them and
  abort `file:` requests (`page.setRequestInterception(true)`).
- The CI workflow renders a page with exactly that iframe and fails if the file
  leaks.

## CI

`.github/workflows/check.yml` builds against the newest Chrome Stable inside
`node:24-trixie-slim` and renders a PDF with Hindi text and the rupee sign, on
every push and weekly.
