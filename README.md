# headless-chromium

[![Build and render check](https://github.com/cB-Abhinav-Gautam/headless-chromium/actions/workflows/check.yml/badge.svg)](https://github.com/cB-Abhinav-Gautam/headless-chromium/actions/workflows/check.yml)

A small, always-current headless Chromium for server-side rendering (PDF
receipts, reports, screenshots) in Debian-based Node.js Docker images.

It takes Google's official **Chrome for Testing headless shell**, the same build
Puppeteer downloads, drops the one dependency that drags in a GPU stack, and
packs it to about 96 MB. The image stays small, and every rebuild picks up the
newest Chrome Stable release, so there's no lag behind Chrome security fixes.

- [Why](#why)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [Updating](#updating)
- [Security](#security)
- [Limitations](#limitations)
- [Troubleshooting](#troubleshooting)
- [Development and CI](#development-and-ci)
- [License](#license)

## Why

| Option | Image size added | Chromium version |
|---|---|---|
| Debian `chromium` package | ~770 MB | current |
| Debian `chromium-headless-shell` | ~540 MB | current |
| `@sparticuz/chromium` | ~80 MB | lags Chrome by months (153 while Chrome was at 156: ~1,100 fixed CVEs missing) |
| PhantomJS / `html-pdf` | ~70 MB | abandoned in 2018 |
| **headless-chromium** | **~96 MB + ~32 MB of Debian libraries and fonts** | **latest Stable at every image build** |

Small headless builds such as `@sparticuz/chromium` compile a custom Chromium
from source, which takes hours on large machines, so releases come months
apart. This project uses Google's own build and only repackages it, so it can
follow Chrome the day a release ships.

## Quick start

### 1. Dockerfile

```dockerfile
# Stage 1: package Chromium. None of these build tools reach the final image.
FROM node:24-trixie-slim AS chromium
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip git gcc libc6-dev binutils \
 && rm -rf /var/lib/apt/lists/*
# Pin this repository by commit SHA: a tag or branch can be moved, a SHA can't.
ARG HEADLESS_CHROMIUM_REF=<commit sha>
# Empty = latest Chrome Stable; set to pin, e.g. 156.0.8078.80
ARG CHROME_VERSION=
RUN git init -q /src \
 && git -C /src fetch -q --depth 1 https://github.com/cB-Abhinav-Gautam/headless-chromium.git "$HEADLESS_CHROMIUM_REF" \
 && git -C /src checkout -q FETCH_HEAD \
 && CHROME_VERSION="$CHROME_VERSION" /src/build.sh /opt/headless-chromium

# Stage 2: your app.
FROM node:24-trixie-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
      libnss3 libglib2.0-0t64 libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64 libdbus-1-3 \
      libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libxkbcommon0 \
      libasound2t64 libexpat1 libudev1 \
      fontconfig-config fonts-liberation fonts-lohit-deva \
 && rm -rf /var/lib/apt/lists/*
# Debian's fontconfig maps Arial/Times/Courier to Liberation.
ENV FONTCONFIG_PATH=/etc/fonts
ENV HEADLESS_CHROMIUM_DIR=/opt/headless-chromium
COPY --from=chromium /opt/headless-chromium /opt/headless-chromium
```

The stage-1 build takes about 30 seconds: the download plus a 6-second pack.

### Builds without internet access

Some CI runners (for example self-hosted Kubernetes runners) can reach GitHub
and Google, but the containers inside `docker build` can't. In that case,
download on the runner and hand the files to the build as a named context:

```yaml
- uses: actions/checkout@v4
  with:
    repository: cB-Abhinav-Gautam/headless-chromium
    ref: <commit sha>
    path: .headless-chromium
- run: .headless-chromium/fetch.sh .headless-chromium   # latest Stable zip + CHROME_VERSION
- run: docker build --build-context headless-chromium=.headless-chromium -f Dockerfile .
```

Add `.headless-chromium` to `.dockerignore` so it stays out of your app image.
Then replace stage 1's `git fetch` with:

```dockerfile
FROM node:24-trixie-slim AS chromium
RUN apt-get update \
 && apt-get install -y --no-install-recommends unzip gcc libc6-dev binutils \
 && rm -rf /var/lib/apt/lists/*
COPY --from=headless-chromium . /src
RUN CHROME_VERSION="$(cat /src/CHROME_VERSION)" CHROME_ZIP=/src/chrome-headless-shell-linux64.zip \
    /src/build.sh /opt/headless-chromium
```

`--build-context` needs BuildKit (the default builder since Docker 23).

### 2. Node

```js
const puppeteer = require("puppeteer-core");
const chromium = require(process.env.HEADLESS_CHROMIUM_DIR || "/opt/headless-chromium");

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(), // unpacks on first call
  env: chromium.env(),                             // puts the libgbm stub on LD_LIBRARY_PATH
  args: chromium.args,                             // container flags; web security stays on
  headless: "shell",
});
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.pdf({ path: "out.pdf", format: "A4", printBackground: true });
} finally {
  await browser.close();
}
```

Use `puppeteer-core` (no bundled browser download), not `puppeteer`.

## Configuration

| Variable | Where | Meaning |
|---|---|---|
| `CHROME_VERSION` | build | Chrome for Testing version to package. Empty = latest Stable. |
| `CHROME_ZIP` | build | Path to an already-downloaded zip (from `fetch.sh`); needs `CHROME_VERSION`. |
| `ZSTD_LEVEL` | build | Compression level, default `9` (~96 MB, ~6 s). `19` gives ~85 MB but takes ~2.5 min. |
| `HEADLESS_CHROMIUM_DIR` | runtime | Where the build output lives, conventionally `/opt/headless-chromium`. |
| `FONTCONFIG_PATH` | runtime | Set to `/etc/fonts` so Chromium uses Debian's font configuration and aliases. |
| `TMPDIR` | runtime | Chromium unpacks to `$TMPDIR/headless-chromium/<version>` (~270 MB). |

The loader exports `executablePath()`, `env(base?)`, `args` and `version`.

## How it works

1. **Download.** `build.sh` resolves the latest Stable version from Google's
   Chrome for Testing index (or uses `CHROME_VERSION`). It then downloads
   `chrome-headless-shell-linux64.zip` straight from Google's bucket. Nothing
   in this repository re-hosts Chromium.
2. **GPU library stub.** The shell links `libgbm`, but only uses it for
   hardware GPU buffers, which headless rendering never touches. Debian's real
   `libgbm1` pulls in Mesa and LLVM, about 190 MB. The build compiles a stub
   with the same symbols (generated from the binary, since Chromium binds every
   symbol at load time). Each function reports "no device", so Chromium falls
   back to software rendering.
3. **Dependency check.** `check-needed.js` reads the shell's `NEEDED` list and
   fails the build if Google adds a library the apt list above doesn't cover.
   A Chrome update can then break your image build, not a production render.
4. **Pack.** Everything, including Chromium's own `LICENSE.headless_shell`, is
   tarred and zstd-compressed to `chromium.tar.zst`, alongside a
   `manifest.json` with the version and SHA-256.
5. **Unpack at runtime.** The first `executablePath()` call verifies the
   checksum and unpacks to tmp with Node's built-in zstd and the system `tar`,
   in about a second. Concurrent callers, and other processes in the same
   container, share the result through an atomic rename.

## Updating

- **Chrome:** every image build fetches the newest Stable release. Rebuild
  images regularly, for example weekly, to pick up Chrome and Debian security
  fixes even when the app code hasn't changed. To freeze a version, set
  `CHROME_VERSION`.
- **This repository:** bump `HEADLESS_CHROMIUM_REF` to a newer commit SHA
  deliberately, after reading the diff.

## Security

- `chromium.args` deliberately leaves web security on. Some Lambda-oriented
  packages default to `--disable-web-security`. With that flag, HTML containing
  `<iframe src="file:///etc/hostname">` puts the file into the PDF. CI checks
  this case on every run.
- When the HTML includes user-entered values, escape them and abort `file:`
  requests:

  ```js
  await page.setRequestInterception(true);
  page.on("request", (r) => (/^file:/i.test(r.url()) ? r.abort() : r.continue()));
  ```

- `--no-sandbox` is needed in typical containers, which run as root without
  user namespaces. That makes the escaping and request blocking above matter
  more: render only HTML you control.
- The packed archive's SHA-256 is checked before every unpack.

See [SECURITY.md](SECURITY.md) to report a problem.

## Limitations

- **Linux x86-64 only.** Google doesn't publish Chrome for Testing for Linux arm64.
- **glibc only.** It won't run on Alpine (musl).
- **Runtime disk.** About 270 MB in tmp per container, after the first render.
- **First render.** It's slower by the unpack time, about 1 second.
- **Single process.** It runs in `--single-process` mode: one browser per
  render is the expected pattern, not long-lived multi-page sessions.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `error while loading shared libraries: libX…` | An apt package from the list is missing | Install the full list from the Quick start |
| Build fails: "new shared libraries needed" | Google added a dependency | Add its Debian package to the list and to `check-needed.js` |
| Text renders as boxes | No font covers the script | Add a `fonts-*` package (Noto for wide coverage) |
| Arial looks different | `FONTCONFIG_PATH` not set | Set `ENV FONTCONFIG_PATH=/etc/fonts` |
| `tar exited 2` | No `tar`, or tmp is read-only or full | Use a Debian base image; check `TMPDIR` space |

## Development and CI

```bash
./build.sh out/                    # needs curl unzip gcc binutils tar, Node >= 23.8
node -e 'require("./out").executablePath().then(console.log)'
```

`.github/workflows/check.yml` runs on every push, weekly, and on demand. It
builds against the newest Chrome Stable inside `node:24-trixie-slim`, with
exactly the apt list above. It then renders a PDF with Hindi text and the rupee
sign, and fails if an injected `file://` iframe leaks into it.

## License

The scripts in this repository are MIT licensed. Chromium is downloaded from
Google at build time and keeps its own license, shipped inside the archive as
`LICENSE.headless_shell`.
