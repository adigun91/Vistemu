// Downloads Google's official, standalone "SDK Platform-Tools" zip (adb only — this
// is NOT the Android Studio IDE, it's a ~15MB redistributable command-line tool) and
// extracts it next to this script. Safe to re-run; skips if adb is already present.
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const root = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const destDir = path.join(root, "platform-tools");
const platformSlug = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "darwin" : "linux";
const url = `https://dl.google.com/android/repository/platform-tools-latest-${platformSlug}.zip`;
const zipPath = path.join(root, ".platform-tools.zip");
const adbBinary = path.join(destDir, process.platform === "win32" ? "adb.exe" : "adb");

function download(targetUrl, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(targetUrl, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlink(dest, () => {});
          download(res.headers.location, dest).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode} for ${targetUrl}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
      })
      .on("error", reject);
  });
}

async function main() {
  if (fs.existsSync(adbBinary)) {
    console.log(`adb already present at ${adbBinary} — skipping download.`);
    return;
  }

  console.log(`Downloading Android SDK Platform-Tools from ${url} ...`);
  await download(url, zipPath);

  console.log("Extracting...");
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(root, true); // archive root entry is "platform-tools/"
  fs.unlinkSync(zipPath);

  if (!fs.existsSync(adbBinary)) {
    throw new Error(`Extraction finished but ${adbBinary} was not found.`);
  }
  console.log(`Done. adb is ready at ${adbBinary}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
