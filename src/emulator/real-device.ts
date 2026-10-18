import { getBridgePairingToken } from "../lib/storage";

const BRIDGE_URL = "ws://127.0.0.1:8787";
const MAX_APK_BYTES = 300 * 1024 * 1024;
const KEYCODE_BACK = 4;
const KEYCODE_HOME = 3;
const KEYCODE_APP_SWITCH = 187;

type BridgeMessage =
  | { type: "devices"; devices: { serial: string; model?: string }[] }
  | { type: "packages"; packages: string[] }
  | { type: "installResult"; ok: boolean; packages?: string[]; newPackage?: string | null; error?: string }
  | { type: "screenSize"; width: number; height: number }
  | { type: "frame"; seq: number }
  | { type: "ack"; for: string; message?: string }
  | { type: "error"; message: string; code?: string }
  | { type: "emulators"; emulators: EmulatorStatus[] };

interface EmulatorStatus {
  id: string;
  name: string;
  hostPort: string;
  downloadUrl: string;
  installed: boolean;
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let awaitingFrame = false;
let screenSize = { width: 1080, height: 2400 };
let streaming = false;
let authenticated = false;
let pairingRejected = false;

let statusEl: HTMLSpanElement;
let deviceSelect: HTMLSelectElement;
let packageSelect: HTMLSelectElement;
let apkInput: HTMLInputElement;
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let canvasEmpty: HTMLParagraphElement;
let emulatorStatusList: HTMLUListElement;
const frameImage = new Image();

function send(message: Record<string, unknown>) {
  if (authenticated && ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

export function showToast(message: string, kind: "success" | "error" = "success") {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add("fading");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }, 3200);
}

function setStatus(text: string, kind: "connecting" | "connected" | "disconnected" = "connecting") {
  statusEl.textContent = `Bridge: ${text}`;
  statusEl.classList.remove("is-connecting", "is-connected", "is-disconnected");
  statusEl.classList.add(`is-${kind}`);
}

async function connect() {
  const token = await getBridgePairingToken();
  if (!token) {
    pairingRejected = true;
    setStatus("pair in Vistemu Settings", "disconnected");
    return;
  }
  pairingRejected = false;
  authenticated = false;
  setStatus("connecting…", "connecting");
  ws = new WebSocket(BRIDGE_URL);
  ws.binaryType = "arraybuffer";

  ws.addEventListener("open", () => {
    ws?.send(JSON.stringify({ type: "authenticate", token }));
  });

  ws.addEventListener("close", () => {
    authenticated = false;
    setStatus(pairingRejected ? "pairing required — check Vistemu Settings" : "disconnected — start Vistemu Bridge", "disconnected");
    streaming = false;
    if (!pairingRejected) reconnectTimer = setTimeout(() => void connect(), 3000);
  });

  ws.addEventListener("error", () => {
    /* close handler schedules the retry */
  });

  ws.addEventListener("message", onMessage);
}

function onMessage(event: MessageEvent) {
  if (event.data instanceof ArrayBuffer) {
    if (!awaitingFrame) return;
    awaitingFrame = false;
    const blob = new Blob([event.data], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    frameImage.onload = () => {
      canvas.width = frameImage.width;
      canvas.height = frameImage.height;
      ctx.drawImage(frameImage, 0, 0);
      URL.revokeObjectURL(url);
      canvas.classList.add("has-frame");
      canvasEmpty.classList.add("hidden");
    };
    frameImage.src = url;
    return;
  }

  let message: BridgeMessage;
  try {
    message = JSON.parse(event.data as string) as BridgeMessage;
  } catch {
    return;
  }

  switch (message.type) {
    case "devices":
      populateDevices(message.devices);
      break;
    case "frame":
      awaitingFrame = true;
      break;
    case "packages":
      populatePackages(message.packages);
      break;
    case "emulators":
      populateEmulatorStatus(message.emulators);
      break;
    case "installResult":
      onInstallResult(message);
      break;
    case "screenSize":
      screenSize = { width: message.width, height: message.height };
      break;
    case "ack":
      if (message.for === "authenticate") {
        authenticated = true;
        setStatus("connected", "connected");
        send({ type: "listDevices" });
        send({ type: "listEmulators" });
      }
      if (message.for === "connectEmulator" && message.message) {
        showToast(message.message, "success");
      }
      break;
    case "error":
      if (message.code === "PAIRING_REQUIRED") {
        pairingRejected = true;
        setStatus("pairing required — check Vistemu Settings", "disconnected");
      }
      showToast(message.message, "error");
      break;
    default:
      break;
  }
}

function populateDevices(devices: { serial: string; model?: string }[]) {
  const previous = deviceSelect.value;
  deviceSelect.innerHTML = "";
  if (devices.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No device connected";
    deviceSelect.appendChild(opt);
    return;
  }
  for (const device of devices) {
    const opt = document.createElement("option");
    opt.value = device.serial;
    opt.textContent = device.model ? `${device.model} (${device.serial})` : device.serial;
    deviceSelect.appendChild(opt);
  }
  deviceSelect.value = devices.some((d) => d.serial === previous) ? previous : (devices[0]?.serial ?? "");
  onDeviceSelected();
}

/** Shows which local emulator apps are already installed vs. a link to grab them — we never install anything ourselves. */
function populateEmulatorStatus(emulators: EmulatorStatus[]) {
  emulatorStatusList.innerHTML = "";
  for (const emulator of emulators) {
    const li = document.createElement("li");
    li.className = "emulator-status-row";

    const label = document.createElement("span");
    label.textContent = emulator.name;
    li.appendChild(label);

    if (emulator.installed) {
      const badge = document.createElement("span");
      badge.className = "emulator-badge installed";
      badge.textContent = "Installed";
      li.appendChild(badge);
    } else {
      const link = document.createElement("a");
      link.className = "emulator-badge missing";
      link.href = emulator.downloadUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Download";
      li.appendChild(link);
    }

    emulatorStatusList.appendChild(li);
  }
}

function populatePackages(packages: string[]) {
  const previous = packageSelect.value;
  packageSelect.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = packages.length ? "Select app…" : "No apps installed";
  packageSelect.appendChild(empty);
  for (const pkg of packages) {
    const opt = document.createElement("option");
    opt.value = pkg;
    opt.textContent = pkg;
    packageSelect.appendChild(opt);
  }
  if (packages.includes(previous)) packageSelect.value = previous;
}

function onInstallResult(message: Extract<BridgeMessage, { type: "installResult" }>) {
  if (!message.ok) {
    showToast(`Install failed: ${message.error ?? "unknown error"}`, "error");
    return;
  }
  if (message.packages) populatePackages(message.packages);
  if (message.newPackage) {
    packageSelect.value = message.newPackage;
    showToast(`Installed and launched ${message.newPackage}`, "success");
  } else {
    showToast("Installed — pick the app from \"Installed\" and click Launch", "success");
  }
}

function onDeviceSelected() {
  const serial = deviceSelect.value;
  if (!serial) return;
  send({ type: "selectDevice", serial });
  send({ type: "screenSize" });
  send({ type: "listPackages" });
  if (!streaming) {
    streaming = true;
    send({ type: "startStream", fps: 4 });
  }
}

function canvasToDeviceCoords(clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = screenSize.width / rect.width;
  const scaleY = screenSize.height / rect.height;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

function wireCanvasInput() {
  let start: { x: number; y: number; time: number; clientX: number; clientY: number } | null = null;

  canvas.addEventListener("pointerdown", (e) => {
    const point = canvasToDeviceCoords(e.clientX, e.clientY);
    start = { ...point, time: performance.now(), clientX: e.clientX, clientY: e.clientY };
  });

  canvas.addEventListener("pointerup", (e) => {
    if (!start) return;
    const end = canvasToDeviceCoords(e.clientX, e.clientY);
    const movedPx = Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY);
    const durationMs = Math.max(50, Math.round(performance.now() - start.time));

    if (movedPx < 12) {
      send({ type: "tap", x: end.x, y: end.y });
    } else {
      send({ type: "swipe", x1: start.x, y1: start.y, x2: end.x, y2: end.y, durationMs });
    }
    start = null;
  });
}

function wireControls() {
  document.getElementById("rd-refresh")?.addEventListener("click", () => send({ type: "listDevices" }));
  deviceSelect.addEventListener("change", onDeviceSelected);

  document.getElementById("rd-install")?.addEventListener("click", async () => {
    const file = apkInput.files?.[0];
    if (!file) return;
    if (file.size <= 0 || file.size > MAX_APK_BYTES) {
      showToast("Choose an APK smaller than 300 MiB.", "error");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".apk")) {
      showToast("Choose an .apk file.", "error");
      return;
    }
    send({ type: "installApkMeta", name: file.name, size: file.size });
    const buffer = await file.arrayBuffer();
    ws?.send(buffer);
  });

  document.getElementById("rd-launch")?.addEventListener("click", () => {
    if (packageSelect.value) send({ type: "launchApp", package: packageSelect.value });
  });

  document.getElementById("rd-uninstall")?.addEventListener("click", () => {
    if (packageSelect.value) send({ type: "uninstall", package: packageSelect.value });
  });

  document.getElementById("rd-back")?.addEventListener("click", () => send({ type: "key", keycode: KEYCODE_BACK }));
  document.getElementById("rd-home")?.addEventListener("click", () => send({ type: "key", keycode: KEYCODE_HOME }));
  document
    .getElementById("rd-recents")
    ?.addEventListener("click", () => send({ type: "key", keycode: KEYCODE_APP_SWITCH }));

  const textForm = document.getElementById("rd-text-form") as HTMLFormElement;
  const textInput = document.getElementById("rd-text-input") as HTMLInputElement;
  textForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!textInput.value) return;
    send({ type: "text", value: textInput.value });
    textInput.value = "";
  });

  const presetSelect = document.getElementById("rd-emulator-preset") as HTMLSelectElement;
  const hostPortInput = document.getElementById("rd-emulator-hostport") as HTMLInputElement;
  presetSelect.addEventListener("change", () => {
    if (presetSelect.value) hostPortInput.value = presetSelect.value;
  });

  document.getElementById("rd-emulator-connect")?.addEventListener("click", () => {
    const hostPort = hostPortInput.value.trim() || presetSelect.value;
    if (!hostPort) return;
    send({ type: "connectEmulator", hostPort });
  });

  document.getElementById("rd-emulator-disconnect")?.addEventListener("click", () => {
    const hostPort = hostPortInput.value.trim() || presetSelect.value;
    if (!hostPort) return;
    send({ type: "disconnectEmulator", hostPort });
  });
}

export function initRealDevice() {
  statusEl = document.getElementById("bridge-status") as HTMLSpanElement;
  deviceSelect = document.getElementById("rd-device-select") as HTMLSelectElement;
  packageSelect = document.getElementById("rd-package-select") as HTMLSelectElement;
  apkInput = document.getElementById("rd-apk-input") as HTMLInputElement;
  canvas = document.getElementById("rd-canvas") as HTMLCanvasElement;
  ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  canvasEmpty = document.getElementById("rd-canvas-empty") as HTMLParagraphElement;
  emulatorStatusList = document.getElementById("rd-emulator-status") as HTMLUListElement;

  wireCanvasInput();
  wireControls();
  void connect();
}
