# Changelog

## Unreleased

- `fetch.sh` and `CHROME_ZIP`: download on the CI runner and pack inside a
  `docker build` that has no internet access.
- README: Wolfi (Chainguard) package list.
- Default zstd level 9 instead of 19: packing drops from ~2.5 min to ~6 s
  for ~11 MB more (~96 MB). `ZSTD_LEVEL` overrides it.
- README rewritten as full documentation.

## 2026-11-03

- First version: `build.sh` packages Google's Chrome for Testing headless shell
  with a generated libgbm stub, `check-needed.js` guards the shared library
  list, `index.js` unpacks at runtime with checksum verification, and CI
  renders a test PDF in `node:24-trixie-slim`.
