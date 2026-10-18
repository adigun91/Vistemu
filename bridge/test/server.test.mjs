import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import WebSocket from "ws";

const token = "a".repeat(64);
let tempRoot;
let serverProcess;
let port;
let baseUrl;
let stderr = "";

async function getFreePort() {
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  const freePort = address.port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return freePort;
}

async function waitForServer() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) throw new Error(`Bridge exited early: ${stderr}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Bridge did not start: ${stderr}`);
}

function openSocket({ origin } = {}) {
  const headers = origin ? { Origin: origin } : undefined;
  return new WebSocket(`ws://127.0.0.1:${port}`, { headers });
}

async function receiveJson(ws) {
  const [data, isBinary] = await once(ws, "message");
  assert.equal(isBinary, false);
  return JSON.parse(data.toString());
}

async function authenticatedSocket() {
  const ws = openSocket();
  await once(ws, "open");
  ws.send(JSON.stringify({ type: "authenticate", token }));
  assert.deepEqual(await receiveJson(ws), { type: "ack", for: "authenticate" });
  return ws;
}

before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vistemu-bridge-test-"));
  const tokenFile = path.join(tempRoot, "bridge-token.txt");
  await fs.writeFile(tokenFile, `${token}\n`, { encoding: "utf8" });
  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}/`;
  serverProcess = spawn(process.execPath, [path.resolve("src/server.mjs")], {
    cwd: path.resolve("."),
    env: { ...process.env, PORT: String(port), VISTEMU_TOKEN_FILE: tokenFile },
    stdio: ["ignore", "ignore", "pipe"],
  });
  serverProcess.stderr.setEncoding("utf8");
  serverProcess.stderr.on("data", (chunk) => (stderr += chunk));
  await waitForServer();
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
    await once(serverProcess, "exit");
  }
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

test("bridge health endpoint starts on loopback", async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Vistemu bridge is running/);
});

test("browser pages from non-extension origins are rejected", async () => {
  const ws = openSocket({ origin: "https://attacker.example" });
  ws.on("error", () => {});
  const [, response] = await once(ws, "unexpected-response");
  assert.equal(response.statusCode, 403);
  response.resume();
  ws.terminate();
});

test("device commands require authentication before dispatch", async () => {
  const ws = openSocket();
  await once(ws, "open");
  ws.send(JSON.stringify({ type: "listDevices" }));
  const message = await receiveJson(ws);
  assert.equal(message.code, "PAIRING_REQUIRED");
  await once(ws, "close");
});

test("valid pairing unlocks harmless list operations", async () => {
  const ws = await authenticatedSocket();
  ws.send(JSON.stringify({ type: "listDevices" }));
  const message = await receiveJson(ws);
  assert.equal(message.type, "devices");
  assert.ok(Array.isArray(message.devices));
  ws.close();
});

test("incorrect pairing token is rejected even from an extension origin", async () => {
  const ws = openSocket({ origin: "chrome-extension://test-extension" });
  await once(ws, "open");
  const closed = once(ws, "close");
  ws.send(JSON.stringify({ type: "authenticate", token: "b".repeat(64) }));
  assert.equal((await receiveJson(ws)).code, "PAIRING_REQUIRED");
  const [code] = await closed;
  assert.equal(code, 1008);
});

test("malformed command shapes do not crash the bridge", async () => {
  const ws = await authenticatedSocket();
  try {
    for (const value of [null, [], true, "tap", {}, { type: 42 }]) {
      ws.send(JSON.stringify(value));
      assert.equal((await receiveJson(ws)).type, "error");
    }
    ws.send(JSON.stringify({ type: "listDevices" }));
    assert.equal((await receiveJson(ws)).type, "devices");
  } finally {
    ws.close();
  }
});

test("APK uploads require an explicitly selected connected device", async () => {
  const ws = await authenticatedSocket();
  ws.send(JSON.stringify({ type: "installApkMeta", name: "test.apk", size: 4 }));
  ws.send(Buffer.from("test"));
  const message = await receiveJson(ws);
  assert.equal(message.type, "error");
  assert.match(message.message, /Select a connected Android device/);
  ws.close();
});

test("untrusted emulator targets and oversized APK metadata are rejected", async () => {
  const ws = await authenticatedSocket();
  ws.send(JSON.stringify({ type: "connectEmulator", hostPort: "attacker.example:5555" }));
  const hostMessage = await receiveJson(ws);
  assert.equal(hostMessage.type, "error");
  assert.match(hostMessage.message, /loopback/i);

  ws.send(JSON.stringify({ type: "installApkMeta", name: "payload.apk", size: 400 * 1024 * 1024 }));
  const uploadMessage = await receiveJson(ws);
  assert.equal(uploadMessage.type, "error");
  assert.match(uploadMessage.message, /300 MiB/i);
  ws.close();
});

test("device actions are blocked unless a connected device is selected", async () => {
  const ws = await authenticatedSocket();
  ws.send(JSON.stringify({ type: "tap", x: 10, y: 10 }));
  const message = await receiveJson(ws);
  assert.equal(message.type, "error");
  assert.match(message.message, /Select a connected Android device/);
  ws.close();
});
