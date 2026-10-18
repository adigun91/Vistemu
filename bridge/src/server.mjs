// Local-only WebSocket bridge: binds strictly to 127.0.0.1 so nothing on the
// network (or even other machines on the same Wi-Fi) can reach it. No cloud,
// no accounts, no API keys — the only trust boundary is "your own machine".
import http from "node:http";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { WebSocketServer } from "ws";
import * as adb from "./adb.mjs";
import { detectEmulators } from "./emulators.mjs";

const PORT = Number(process.env.PORT || 8787);
const MAX_APK_BYTES = 300 * 1024 * 1024;
const MAX_JSON_BYTES = 64 * 1024;
const TOKEN_DIR = process.env.APPDATA
  ? path.join(process.env.APPDATA, "Vistemu")
  : path.join(os.homedir(), ".config", "vistemu");
const TOKEN_FILE = process.env.VISTEMU_TOKEN_FILE || path.join(TOKEN_DIR, "bridge-token.txt");

async function loadOrCreateToken() {
  await fs.mkdir(TOKEN_DIR, { recursive: true });
  try {
    const token = (await fs.readFile(TOKEN_FILE, "utf8")).trim();
    if (/^[a-f0-9]{64}$/.test(token)) return token;
  } catch {
    // Generate a new pairing token when none exists yet.
  }
  const token = crypto.randomBytes(32).toString("hex");
  await fs.writeFile(TOKEN_FILE, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  return token;
}

const pairingToken = await loadOrCreateToken();

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Vistemu bridge is running\n");
});

// WebSocket has no same-origin policy, so any webpage open in the browser could otherwise
// script a connection to this loopback port and drive it (install APKs, tap/swipe the phone,
// adb-connect to attacker hosts). Only the extension's own pages — or non-browser clients that
// send no Origin header at all — are allowed through.
const ALLOWED_ORIGIN_PROTOCOLS = new Set(["chrome-extension:", "moz-extension:", "edge-extension:", "safari-web-extension:"]);

const wss = new WebSocketServer({
  server,
  maxPayload: MAX_APK_BYTES,
  perMessageDeflate: false,
  verifyClient: (info, done) => {
    const origin = info.origin || info.req.headers.origin;
    if (!origin) {
      done(true);
      return;
    }
    let parsedOrigin;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      done(false, 403, "Invalid origin");
      return;
    }
    if (ALLOWED_ORIGIN_PROTOCOLS.has(parsedOrigin.protocol)) {
      done(true);
    } else {
      done(false, 403, "Forbidden origin");
    }
  },
});

async function selectedDeviceSerial(currentSerial, send) {
  if (!currentSerial || !(await adb.listDevices()).some((device) => device.serial === currentSerial)) {
    send({ type: "error", message: "Select a connected Android device first." });
    return null;
  }
  return currentSerial;
}

async function safeRun(fn, send, label) {
  try {
    await fn();
    send({ type: "ack", for: label });
  } catch (err) {
    send({ type: "error", message: `${label} failed: ${err instanceof Error ? err.message : String(err)}` });
  }
}

wss.on("connection", (ws) => {
  let currentSerial = null;
  let streamTimer = null;
  let pendingUpload = null; // { name }
  let authenticated = false;
  const authTimer = setTimeout(() => ws.close(1008, "Pairing required"), 5000);

  const send = (obj) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(obj));

  const stopStream = () => {
    if (streamTimer) {
      clearInterval(streamTimer);
      streamTimer = null;
    }
  };

  async function handleMessage(data, isBinary) {
    if (!authenticated) {
      if (isBinary || data.length > MAX_JSON_BYTES) {
        ws.close(1008, "Pairing required");
        return;
      }
      let authMessage;
      try {
        authMessage = JSON.parse(data.toString());
      } catch {
        ws.close(1008, "Pairing required");
        return;
      }
      const supplied = typeof authMessage?.token === "string" ? Buffer.from(authMessage.token) : Buffer.alloc(0);
      const expected = Buffer.from(pairingToken);
      if (authMessage?.type !== "authenticate" || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
        send({ type: "error", code: "PAIRING_REQUIRED", message: "Pair this extension with the token in the Vistemu app-data folder." });
        ws.close(1008, "Pairing required");
        return;
      }
      authenticated = true;
      clearTimeout(authTimer);
      send({ type: "ack", for: "authenticate" });
      return;
    }

    if (isBinary) {
      if (!pendingUpload) {
        send({ type: "error", message: "Received binary data with no pending upload." });
        return;
      }
      const { name, size } = pendingUpload;
      pendingUpload = null;

      if (data.length === 0 || data.length > MAX_APK_BYTES || data.length !== size) {
        send({ type: "installResult", ok: false, error: "APK upload size is invalid or exceeds the 300 MiB limit." });
        return;
      }

      let tmpPath;
      try {
        const serial = await selectedDeviceSerial(currentSerial, send);
        if (!serial) return;
        tmpPath = path.join(os.tmpdir(), `vistemu-${crypto.randomUUID()}.apk`);
        await fs.writeFile(tmpPath, data);

        const before = await adb.listThirdPartyPackages(serial);
        await adb.installApk(serial, tmpPath);
        const after = await adb.listThirdPartyPackages(serial);
        const newPackage = after.find((p) => !before.includes(p)) ?? null;
        send({ type: "installResult", ok: true, packages: after, newPackage });
        if (newPackage) await adb.launchApp(serial, newPackage);
      } catch (err) {
        send({ type: "installResult", ok: false, error: err instanceof Error ? err.message : String(err) });
      } finally {
        if (tmpPath) await fs.unlink(tmpPath).catch(() => {});
      }
      return;
    }

    let message;
    if (data.length > MAX_JSON_BYTES) {
      send({ type: "error", message: "Message exceeds the 64 KiB limit." });
      return;
    }
    try {
      message = JSON.parse(data.toString());
    } catch {
      send({ type: "error", message: "Invalid JSON message." });
      return;
    }

    if (!message || typeof message !== "object" || Array.isArray(message) || typeof message.type !== "string") {
      send({ type: "error", message: "Expected a command object with a string type." });
      return;
    }

    switch (message.type) {
      case "listDevices": {
        const devices = await adb.listDevices().catch(() => []);
        send({ type: "devices", devices });
        break;
      }
      case "selectDevice":
        if (typeof message.serial !== "string" || !/^[a-zA-Z0-9._:-]{1,128}$/.test(message.serial)) {
          send({ type: "error", message: "Invalid device serial." });
          break;
        }
        if (!(await adb.listDevices()).some((device) => device.serial === message.serial)) {
          send({ type: "error", message: "Selected device is not currently connected." });
          break;
        }
        currentSerial = message.serial;
        send({ type: "ack", for: "selectDevice" });
        break;
      case "connectEmulator": {
        try {
          const result = await adb.connectEmulator(String(message.hostPort));
          const devices = await adb.listDevices().catch(() => []);
          send({ type: "ack", for: "connectEmulator", message: result });
          send({ type: "devices", devices });
        } catch (err) {
          send({ type: "error", message: `connectEmulator failed: ${err instanceof Error ? err.message : String(err)}` });
        }
        break;
      }
      case "disconnectEmulator":
        await safeRun(() => adb.disconnectEmulator(String(message.hostPort)), send, "disconnectEmulator");
        send({ type: "devices", devices: await adb.listDevices().catch(() => []) });
        break;
      case "listEmulators": {
        const emulators = await detectEmulators().catch(() => []);
        send({ type: "emulators", emulators });
        break;
      }
      case "installApkMeta":
        if (typeof message.name !== "string" || !message.name.toLowerCase().endsWith(".apk") ||
            !Number.isSafeInteger(message.size) || message.size <= 0 || message.size > MAX_APK_BYTES) {
          send({ type: "error", message: "Choose a valid APK smaller than 300 MiB." });
          break;
        }
        pendingUpload = { name: path.basename(message.name), size: message.size };
        break;
      case "listPackages": {
        if (!currentSerial) {
          send({ type: "packages", packages: [] });
          break;
        }
        const packages = await adb.listThirdPartyPackages(currentSerial).catch(() => []);
        send({ type: "packages", packages });
        break;
      }
      case "launchApp":
        if (typeof message.package !== "string" || !/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(message.package)) {
          send({ type: "error", message: "Invalid Android package name." });
          break;
        }
        {
          const serial = await selectedDeviceSerial(currentSerial, send);
          if (serial) await safeRun(() => adb.launchApp(serial, message.package), send, "launchApp");
        }
        break;
      case "uninstall":
        if (typeof message.package !== "string" || !/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(message.package)) {
          send({ type: "error", message: "Invalid Android package name." });
          break;
        }
        {
          const serial = await selectedDeviceSerial(currentSerial, send);
          if (serial) await safeRun(() => adb.uninstall(serial, message.package), send, "uninstall");
        }
        break;
      case "tap":
        if (![message.x, message.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 100000)) {
          send({ type: "error", message: "Tap coordinates are invalid." });
          break;
        }
        {
          const serial = await selectedDeviceSerial(currentSerial, send);
          if (serial) await safeRun(() => adb.tap(serial, message.x, message.y), send, "tap");
        }
        break;
      case "swipe":
        if (![message.x1, message.y1, message.x2, message.y2].every((value) => Number.isFinite(value) && value >= 0 && value <= 100000) ||
            !Number.isInteger(message.durationMs ?? 200) || (message.durationMs ?? 200) < 50 || (message.durationMs ?? 200) > 60000) {
          send({ type: "error", message: "Swipe coordinates or duration are invalid." });
          break;
        }
        {
          const serial = await selectedDeviceSerial(currentSerial, send);
          if (serial) {
            await safeRun(
              () => adb.swipe(serial, message.x1, message.y1, message.x2, message.y2, message.durationMs ?? 200),
              send,
              "swipe"
            );
          }
        }
        break;
      case "key":
        if (!Number.isInteger(message.keycode) || message.keycode < 0 || message.keycode > 10000) {
          send({ type: "error", message: "Invalid key code." });
          break;
        }
        {
          const serial = await selectedDeviceSerial(currentSerial, send);
          if (serial) await safeRun(() => adb.keyevent(serial, message.keycode), send, "key");
        }
        break;
      case "text":
        if (typeof message.value !== "string" || message.value.length > 2000) {
          send({ type: "error", message: "Text input must be 2,000 characters or fewer." });
          break;
        }
        {
          const serial = await selectedDeviceSerial(currentSerial, send);
          if (serial) await safeRun(() => adb.inputText(serial, message.value), send, "text");
        }
        break;
      case "screenSize": {
        if (!currentSerial) {
          send({ type: "error", message: "No device selected." });
          break;
        }
        const size = await adb.screenSize(currentSerial).catch((err) => {
          send({ type: "error", message: `screenSize failed: ${err.message}` });
          return null;
        });
        if (size) send({ type: "screenSize", ...size });
        break;
      }
      case "startStream": {
        stopStream();
        const fps = Number.isFinite(message.fps) ? Math.min(8, Math.max(1, message.fps)) : 4;
        const intervalMs = Math.max(125, Math.round(1000 / fps));
        streamTimer = setInterval(async () => {
          if (!currentSerial || ws.readyState !== ws.OPEN) return;
          try {
            const png = await adb.screencapPng(currentSerial);
            send({ type: "frame", seq: Date.now() });
            ws.send(png, { binary: true });
          } catch {
            // transient capture failures (device locked/busy) are expected; next tick retries
          }
        }, intervalMs);
        break;
      }
      case "stopStream":
        stopStream();
        break;
      default:
        send({ type: "error", message: `Unknown message type: ${message.type}` });
    }
  }

  ws.on("message", (data, isBinary) => {
    void handleMessage(data, isBinary).catch(() => {
      send({ type: "error", message: "Device command failed. Check that the selected device is connected." });
    });
  });

  ws.on("error", () => {
    clearTimeout(authTimer);
    stopStream();
  });

  ws.on("close", () => {
    clearTimeout(authTimer);
    stopStream();
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Vistemu bridge listening on ws://127.0.0.1:${PORT} (loopback only)`);
  console.log(`Pairing token file: ${TOKEN_FILE}`);
});
