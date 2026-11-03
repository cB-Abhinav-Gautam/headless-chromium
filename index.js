// Runtime side of headless-chromium. Lives next to chromium.tar.zst and
// manifest.json (the output of build.sh). The first executablePath() call
// unpacks Chromium to <tmp>/headless-chromium/<version> (~270MB, ~2s); later
// calls, and other processes in the same container, reuse it.
//
//   const chromium = require("/opt/headless-chromium");
//   const browser = await puppeteer.launch({
//     executablePath: await chromium.executablePath(),
//     env: chromium.env(),
//     args: chromium.args,
//     headless: "shell",
//   });
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { spawn } = require("child_process");

const manifest = require("./manifest.json");
const ARCHIVE = path.join(__dirname, "chromium.tar.zst");
const TARGET = path.join(os.tmpdir(), "headless-chromium", manifest.chromeVersion);
const EXE = path.join(TARGET, "chrome-headless-shell");
const DONE = path.join(TARGET, ".complete");

// Only what a container needs. Web security stays on (no
// --disable-web-security): rendered HTML must not read other origins or files.
const args = [
	"--no-sandbox",
	"--no-zygote",
	"--single-process",
	"--disable-gpu",
	"--disable-dev-shm-usage",
	"--font-render-hinting=none",
	"--no-default-browser-check",
	"--no-pings",
];

let unpacking = null;

const sha256 = (file) =>
	new Promise((resolve, reject) => {
		const hash = crypto.createHash("sha256");
		fs.createReadStream(file).on("error", reject).on("data", (d) => hash.update(d)).on("end", () => resolve(hash.digest("hex")));
	});

async function unpack() {
	if ((await sha256(ARCHIVE)) !== manifest.sha256) throw new Error("headless-chromium: archive checksum mismatch");
	const staging = `${TARGET}.${process.pid}.${Date.now()}`;
	await fs.promises.mkdir(staging, { recursive: true });
	try {
		await new Promise((resolve, reject) => {
			const tar = spawn("tar", ["-x", "-C", staging], { stdio: ["pipe", "ignore", "inherit"] });
			tar.on("error", reject);
			tar.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`headless-chromium: tar exited ${code}`))));
			fs.createReadStream(ARCHIVE).on("error", reject).pipe(zlib.createZstdDecompress()).on("error", reject).pipe(tar.stdin);
		});
		await fs.promises.writeFile(path.join(staging, ".complete"), manifest.chromeVersion);
		// Atomic publish; another process may have won the race, which is fine.
		await fs.promises.rename(staging, TARGET).catch(async (error) => {
			if (!fs.existsSync(DONE)) throw error;
		});
	} finally {
		await fs.promises.rm(staging, { recursive: true, force: true });
	}
}

async function executablePath() {
	if (fs.existsSync(DONE)) return EXE;
	unpacking = unpacking || unpack().finally(() => (unpacking = null));
	await unpacking;
	return EXE;
}

// Environment for the browser process: the bundled libgbm stub must be found
// before any system libgbm.
const env = (base = process.env) => ({
	...base,
	LD_LIBRARY_PATH: [path.join(TARGET, "lib"), base.LD_LIBRARY_PATH].filter(Boolean).join(":"),
});

module.exports = { executablePath, env, args, version: manifest.chromeVersion };
