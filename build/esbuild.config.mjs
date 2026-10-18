import { build, context } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

const root = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const args = process.argv.slice(2);
const watch = args.includes("--watch");
const browserArg = args.find((a) => a.startsWith("--browser="))?.split("=")[1];
const browsers = browserArg ? [browserArg] : ["chrome", "firefox"];

const entryPoints = {
  background: "src/background/index.ts",
  popup: "src/popup/popup.ts",
  options: "src/options/options.ts",
  emulator: "src/emulator/emulator.ts",
};

const staticFilesByEntry = {
  popup: ["src/popup/popup.html", "src/popup/popup.css"],
  options: ["src/options/options.html", "src/options/options.css"],
  emulator: ["src/emulator/emulator.html", "src/emulator/emulator.css"],
};

async function readJson(relPath) {
  const text = await fs.readFile(path.join(root, relPath), "utf8");
  return JSON.parse(text);
}

async function writeManifest(browser, outDir) {
  const base = await readJson("build/manifest.base.json");
  const override = await readJson(`build/manifest.${browser}.json`);
  const merged = { ...base, ...override };
  await fs.writeFile(path.join(outDir, "manifest.json"), JSON.stringify(merged, null, 2));
}

async function copyStaticFiles(outDir) {
  for (const files of Object.values(staticFilesByEntry)) {
    for (const file of files) {
      const dest = path.join(outDir, path.basename(file));
      await fs.copyFile(path.join(root, file), dest);
    }
  }
  const iconsDir = path.join(root, "icons");
  if (existsSync(iconsDir)) {
    await fs.cp(iconsDir, path.join(outDir, "icons"), { recursive: true });
  }
  await fs.copyFile(path.join(root, "privacy-policy.html"), path.join(outDir, "privacy-policy.html"));
}

async function buildForBrowser(browser) {
  const outDir = path.join(root, "dist", browser);
  await fs.mkdir(outDir, { recursive: true });

  const options = {
    entryPoints: Object.fromEntries(
      Object.entries(entryPoints).map(([name, file]) => [name, path.join(root, file)])
    ),
    outdir: outDir,
    bundle: true,
    format: "iife",
    target: "es2022",
    sourcemap: true,
    logLevel: "info",
    define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production") },
  };

  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log(`[watch] esbuild watching for ${browser}...`);
  } else {
    await build(options);
  }

  await copyStaticFiles(outDir);
  await writeManifest(browser, outDir);
}

for (const browser of browsers) {
  await buildForBrowser(browser);
}

console.log(`Build complete for: ${browsers.join(", ")}`);
