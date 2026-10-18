import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execute = promisify(execFile);

test("Windows install, start and stop work with spaced profile paths", {
  skip: process.platform !== "win32",
  timeout: 30000,
}, async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vistemu windows test "));
  const source = path.join(tempRoot, "release files");
  const local = path.join(tempRoot, "Local AppData");
  const roaming = path.join(tempRoot, "Roaming AppData");
  const pidFile = path.join(local, "VistemuBridge", "bridge.pid");
  let bridgePid;
  try {
    await fs.mkdir(path.join(source, "runtime"), { recursive: true });
    await fs.copyFile(process.execPath, path.join(source, "runtime", "node.exe"));
    for (const folder of ["src", "node_modules", "platform-tools"]) {
      await fs.cp(path.resolve(folder), path.join(source, "app", folder), { recursive: true });
    }
    for (const filename of ["install.ps1", "start.ps1", "stop.ps1", "README.txt"]) {
      await fs.copyFile(path.resolve("windows", filename), path.join(source, filename));
    }
    const probe = net.createServer();
    probe.listen(0, "127.0.0.1");
    await once(probe, "listening");
    const port = probe.address().port;
    await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
    const env = { ...process.env, LOCALAPPDATA: local, APPDATA: roaming, PORT: String(port) };
    delete env.VISTEMU_TOKEN_FILE;
    const runScript = (filename) => execute("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(source, filename),
    ], { env, windowsHide: true, timeout: 15000 });

    await runScript("install.ps1");
    const menu = path.join(roaming, "Microsoft", "Windows", "Start Menu", "Programs", "Vistemu Bridge");
    await fs.access(path.join(menu, "Start Vistemu Bridge.lnk"));
    await fs.access(path.join(menu, "Stop Vistemu Bridge.lnk"));
    await runScript("start.ps1");
    bridgePid = Number((await fs.readFile(pidFile, "utf8")).trim());
    assert.ok(Number.isSafeInteger(bridgePid) && bridgePid > 0);
    const deadline = Date.now() + 10000;
    let healthy = false;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) });
        healthy = response.ok && (await response.text()).includes("Vistemu bridge is running");
        if (healthy) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(healthy, "Installed bridge must start successfully from a spaced path");
    assert.match((await fs.readFile(path.join(roaming, "Vistemu", "bridge-token.txt"), "utf8")).trim(), /^[a-f0-9]{64}$/);
    await runScript("stop.ps1");
    await assert.rejects(fs.access(pidFile));
  } finally {
    if (!bridgePid) {
      bridgePid = Number(await fs.readFile(pidFile, "utf8").catch(() => "0"));
    }
    if (bridgePid > 0) {
      try { process.kill(bridgePid); } catch {}
    }
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});