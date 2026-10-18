// Thin wrapper around the standalone `adb` binary (child_process only — no Android
// Studio, no SDK manager, no network calls). Prefers the copy fetched by
// scripts/setup-platform-tools.mjs, falling back to an `adb` already on PATH.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const bundledAdb = path.join(root, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb");
const ADB_BIN = fs.existsSync(bundledAdb) ? bundledAdb : "adb";

async function run(args, { binary = false } = {}) {
  const { stdout } = await execFileAsync(ADB_BIN, args, {
    maxBuffer: 64 * 1024 * 1024,
    encoding: binary ? "buffer" : "utf8",
  });
  return stdout;
}

export async function listDevices() {
  const out = await run(["devices", "-l"]);
  return out
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state, ...rest] = line.split(/\s+/);
      const modelMatch = rest.join(" ").match(/model:(\S+)/);
      return { serial, state, model: modelMatch ? modelMatch[1] : undefined };
    })
    .filter((d) => d.state === "device");
}

export async function installApk(serial, apkPath) {
  await run(["-s", serial, "install", "-r", apkPath]);
}

export async function uninstall(serial, pkg) {
  await run(["-s", serial, "uninstall", pkg]);
}

export async function listThirdPartyPackages(serial) {
  const out = await run(["-s", serial, "shell", "pm", "list", "packages", "-3"]);
  return out
    .split("\n")
    .map((line) => line.trim().replace(/^package:/, ""))
    .filter(Boolean);
}

/** Launches an app's launcher activity by package name only — no aapt/manifest parsing needed. */
export async function launchApp(serial, pkg) {
  await run(["-s", serial, "shell", "monkey", "-p", pkg, "-c", "android.intent.category.LAUNCHER", "1"]);
}

export async function tap(serial, x, y) {
  await run(["-s", serial, "shell", "input", "tap", String(Math.round(x)), String(Math.round(y))]);
}

export async function swipe(serial, x1, y1, x2, y2, durationMs) {
  await run([
    "-s",
    serial,
    "shell",
    "input",
    "swipe",
    String(Math.round(x1)),
    String(Math.round(y1)),
    String(Math.round(x2)),
    String(Math.round(y2)),
    String(Math.round(durationMs)),
  ]);
}

export async function keyevent(serial, code) {
  await run(["-s", serial, "shell", "input", "keyevent", String(code)]);
}

export async function inputText(serial, value) {
  // adb shell re-parses this string on the device's own shell, so spaces must become
  // %s and shell metacharacters are escaped defensively even though this is self-directed.
  const escaped = value.replace(/\s/g, "%s").replace(/(["'`$\\])/g, "\\$1");
  await run(["-s", serial, "shell", "input", "text", escaped]);
}

export async function screenSize(serial) {
  const out = await run(["-s", serial, "shell", "wm", "size"]);
  const match = out.match(/(\d+)x(\d+)/);
  if (!match) throw new Error("Could not parse `adb shell wm size` output.");
  return { width: Number(match[1]), height: Number(match[2]) };
}

export async function screencapPng(serial) {
  return run(["-s", serial, "exec-out", "screencap", "-p"], { binary: true });
}

const HOST_PORT_PATTERN = /^(?:127\.0\.0\.1|localhost):(\d{1,5})$/i;

function validateLocalHostPort(hostPort) {
  const match = HOST_PORT_PATTERN.exec(hostPort);
  const port = match ? Number(match[1]) : NaN;
  if (!match || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Expected a local loopback address and valid port (e.g. 127.0.0.1:5555), got "${hostPort}".`);
  }
}

/**
 * Connects adb to a local Android emulator app (BlueStacks, LDPlayer, NoxPlayer,
 * MEmu, Windows Subsystem for Android, …) that already exposes its own adb port
 * on 127.0.0.1 — these run entirely on this PC, no phone involved.
 */
export async function connectEmulator(hostPort) {
  validateLocalHostPort(hostPort);
  const out = await run(["connect", hostPort]);
  if (!/connected to/i.test(out)) {
    throw new Error(out.trim() || `adb connect ${hostPort} failed.`);
  }
  return out.trim();
}

export async function disconnectEmulator(hostPort) {
  validateLocalHostPort(hostPort);
  await run(["disconnect", hostPort]);
}
