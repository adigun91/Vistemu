import AdmZip from "adm-zip";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const bridgeRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const projectRoot = path.resolve(bridgeRoot, "..");
const stageRoot = path.join(bridgeRoot, "release", "windows-x64");
const appRoot = path.join(stageRoot, "app");
const runtimeRoot = path.join(stageRoot, "runtime");
const adbPath = path.join(bridgeRoot, "platform-tools", "adb.exe");
const outputPath = path.join(projectRoot, "vistemu-bridge-windows-x64.zip");

async function copyDirectory(source, destination) {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.cp(source, destination, { recursive: true });
}

async function main() {
  if (process.platform !== "win32") throw new Error("Build the Windows bridge package on Windows.");
  await fs.access(adbPath).catch(() => {
    throw new Error('ADB is missing. Run "npm run setup" in bridge/ before packaging.');
  });

  await fs.rm(stageRoot, { recursive: true, force: true });
  await fs.mkdir(appRoot, { recursive: true });
  await fs.mkdir(runtimeRoot, { recursive: true });

  await fs.copyFile(process.execPath, path.join(runtimeRoot, "node.exe"));
  await fs.cp(path.join(bridgeRoot, "src"), path.join(appRoot, "src"), { recursive: true });
  await fs.cp(path.join(bridgeRoot, "node_modules"), path.join(appRoot, "node_modules"), { recursive: true });
  await fs.cp(path.join(bridgeRoot, "platform-tools"), path.join(appRoot, "platform-tools"), { recursive: true });
  await fs.copyFile(path.join(bridgeRoot, "package.json"), path.join(appRoot, "package.json"));
  await fs.copyFile(path.join(bridgeRoot, "windows", "install.ps1"), path.join(stageRoot, "install.ps1"));
  await fs.copyFile(path.join(bridgeRoot, "windows", "start.ps1"), path.join(stageRoot, "start.ps1"));
  await fs.copyFile(path.join(bridgeRoot, "windows", "stop.ps1"), path.join(stageRoot, "stop.ps1"));
  await fs.copyFile(path.join(bridgeRoot, "windows", "README.txt"), path.join(stageRoot, "README.txt"));
  await fs.copyFile(path.join(bridgeRoot, "windows", "VistemuBridge.iss"), path.join(stageRoot, "VistemuBridge.iss"));
  const nodeLicense = path.join(path.dirname(process.execPath), "LICENSE");
  if (await fs.access(nodeLicense).then(() => true).catch(() => false)) {
    await fs.copyFile(nodeLicense, path.join(runtimeRoot, "NODE-LICENSE.txt"));
  }

  const archive = new AdmZip();
  async function addDirectory(source, archivePath) {
    for (const entry of await fs.readdir(source, { withFileTypes: true })) {
      const sourcePath = path.join(source, entry.name);
      const relativePath = path.posix.join(archivePath, entry.name);
      if (entry.isDirectory()) await addDirectory(sourcePath, relativePath);
      else archive.addFile(relativePath, await fs.readFile(sourcePath));
    }
  }
  await addDirectory(stageRoot, "VistemuBridge");
  archive.writeZip(outputPath);
  console.log(`Created ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
