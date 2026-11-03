// Lists the shared libraries chrome-headless-shell needs and fails if one is
// not covered by the documented Debian packages (or the bundled gbm stub), so
// a new Google dependency breaks the build instead of a production render.
const { execFileSync } = require("child_process");
const KNOWN = new Set([
  // glibc / gcc runtime (in every Debian base image)
  "libc.so.6", "libm.so.6", "libdl.so.2", "libpthread.so.0", "libgcc_s.so.1", "ld-linux-x86-64.so.2",
  // libnss3
  "libnss3.so", "libnssutil3.so", "libnspr4.so", "libplc4.so", "libplds4.so",
  // libglib2.0-0t64
  "libglib-2.0.so.0", "libgobject-2.0.so.0", "libgio-2.0.so.0",
  // libatk1.0-0t64, libatk-bridge2.0-0t64, libatspi2.0-0t64
  "libatk-1.0.so.0", "libatk-bridge-2.0.so.0", "libatspi.so.0",
  // libdbus-1-3, libexpat1, libudev1, libasound2t64, libxkbcommon0
  "libdbus-1.so.3", "libexpat.so.1", "libudev.so.1", "libasound.so.2", "libxkbcommon.so.0",
  // X11: libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2
  "libX11.so.6", "libxcb.so.1", "libXcomposite.so.1", "libXdamage.so.1", "libXext.so.6", "libXfixes.so.3", "libXrandr.so.2",
  // bundled stub
  "libgbm.so.1",
]);
const out = execFileSync("readelf", ["-d", process.argv[2]], { encoding: "utf8" });
const needed = [...out.matchAll(/\(NEEDED\).*\[(.+)\]/g)].map((m) => m[1]);
const unknown = needed.filter((n) => !KNOWN.has(n));
if (unknown.length) {
  console.error("headless-chromium: new shared libraries needed: " + unknown.join(", "));
  console.error("Add their Debian packages to the README's apt list and to KNOWN in check-needed.js.");
  process.exit(1);
}
console.log(`headless-chromium: ${needed.length} shared libraries, all covered`);
