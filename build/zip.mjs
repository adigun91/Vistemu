import archiver from "archiver";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(import.meta.url), "..", "..");

async function zipDir(browser) {
  const srcDir = path.join(root, "dist", browser);
  if (!fs.existsSync(srcDir)) {
    console.warn(`Skipping ${browser}: ${srcDir} does not exist. Run "npm run build" first.`);
    return;
  }
  const outFile = path.join(root, `vistemu-${browser}.zip`);
  const output = fs.createWriteStream(outFile);
  const archive = archiver("zip", { zlib: { level: 9 } });

  await new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(srcDir, false);
    archive.finalize();
  });

  console.log(`Packaged ${outFile} (${archive.pointer()} bytes)`);
}

for (const browser of ["chrome", "firefox"]) {
  await zipDir(browser);
}
