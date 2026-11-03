#!/usr/bin/env bash
# Downloads the Chrome for Testing headless shell zip into <dir>, with its
# version in <dir>/CHROME_VERSION, for build.sh to pack later via CHROME_ZIP.
# Use it on a CI runner when the docker build itself has no internet access.
#
#   ./fetch.sh <dir>                       # latest Stable
#   CHROME_VERSION=156.0.8078.80 ./fetch.sh <dir>
#
# Needs only bash and curl.
set -euo pipefail
DIR="${1:?usage: fetch.sh <dir>}"
if [ -z "${CHROME_VERSION:-}" ]; then
  CHROME_VERSION="$(curl -fsSL https://googlechromelabs.github.io/chrome-for-testing/LATEST_RELEASE_STABLE)"
fi
case "$CHROME_VERSION" in *[!0-9.]*|"") echo "fetch.sh: bad version '$CHROME_VERSION'" >&2; exit 1;; esac
mkdir -p "$DIR"
curl -fsSL --retry 3 -o "$DIR/chrome-headless-shell-linux64.zip" \
  "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-headless-shell-linux64.zip"
echo "$CHROME_VERSION" > "$DIR/CHROME_VERSION"
echo "fetch.sh: Chrome ${CHROME_VERSION} -> $DIR"
