import browser from "webextension-polyfill";
import { getCustomDevices } from "../lib/storage";
import {
  getRemoteFarmUrl,
  setRemoteFarmUrl,
  getBridgePairingToken,
  setBridgePairingToken,
  clearBridgePairingToken,
} from "../lib/storage";
import { sendMessage } from "../lib/messaging";
import type { CustomDeviceInput } from "../devices/registry";
import { initFooterYear } from "../lib/footer";

const ALL_URLS = { origins: ["<all_urls>"] };

const permissionStatus = document.getElementById("permission-status") as HTMLSpanElement;
const grantBtn = document.getElementById("grant-permission") as HTMLButtonElement;
const revokeBtn = document.getElementById("revoke-permission") as HTMLButtonElement;
const form = document.getElementById("device-form") as HTMLFormElement;
const formError = document.getElementById("form-error") as HTMLParagraphElement;
const list = document.getElementById("custom-device-list") as HTMLUListElement;
const remoteFarmInput = document.getElementById("remote-farm-url") as HTMLInputElement;
const saveRemoteFarmBtn = document.getElementById("save-remote-farm") as HTMLButtonElement;
const bridgeTokenInput = document.getElementById("bridge-token") as HTMLInputElement;
const bridgeTokenStatus = document.getElementById("bridge-token-status") as HTMLSpanElement;
const saveBridgeTokenBtn = document.getElementById("save-bridge-token") as HTMLButtonElement;
const clearBridgeTokenBtn = document.getElementById("clear-bridge-token") as HTMLButtonElement;

async function refreshPermissionStatus() {
  const granted = await browser.permissions.contains(ALL_URLS);
  permissionStatus.textContent = granted ? "Granted for all sites" : "Not granted";
  revokeBtn.hidden = !granted;
  grantBtn.hidden = granted;
}

async function refreshDeviceList() {
  const devices = await getCustomDevices();
  list.innerHTML = "";
  if (devices.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No custom devices yet.";
    list.appendChild(empty);
    return;
  }
  for (const device of devices) {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${device.name} — ${device.width}×${device.height} @${device.dpr}x`;
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", async () => {
      await sendMessage({ type: "REMOVE_CUSTOM_DEVICE", id: device.id });
      await refreshDeviceList();
    });
    item.append(label, removeBtn);
    list.appendChild(item);
  }
}

grantBtn.addEventListener("click", async () => {
  await browser.permissions.request(ALL_URLS);
  await refreshPermissionStatus();
});

revokeBtn.addEventListener("click", async () => {
  await browser.permissions.remove(ALL_URLS);
  await refreshPermissionStatus();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.hidden = true;

  const data = new FormData(form);
  const input: CustomDeviceInput = {
    name: String(data.get("name") ?? ""),
    category: String(data.get("category") ?? "phone") as CustomDeviceInput["category"],
    os: String(data.get("os") ?? "android") as CustomDeviceInput["os"],
    width: Number(data.get("width")),
    height: Number(data.get("height")),
    dpr: Number(data.get("dpr")),
    platform: String(data.get("platform") ?? ""),
    userAgent: String(data.get("userAgent") ?? ""),
    touch: data.get("touch") === "on",
    maxTouchPoints: Number(data.get("maxTouchPoints") ?? 0),
  };

  const response = await sendMessage({ type: "ADD_CUSTOM_DEVICE", input });
  if (!response.ok) {
    formError.textContent = response.error;
    formError.hidden = false;
    return;
  }
  form.reset();
  await refreshDeviceList();
});

saveRemoteFarmBtn.addEventListener("click", async () => {
  await setRemoteFarmUrl(remoteFarmInput.value.trim());
  saveRemoteFarmBtn.textContent = "Saved ✓";
  setTimeout(() => (saveRemoteFarmBtn.textContent = "Save"), 1500);
});

saveBridgeTokenBtn.addEventListener("click", async () => {
  const token = bridgeTokenInput.value.trim();
  if (token.length < 32 || token.length > 256) {
    bridgeTokenStatus.textContent = "Token must be 32–256 characters";
    return;
  }
  await setBridgePairingToken(token);
  bridgeTokenInput.value = "";
  bridgeTokenStatus.textContent = "Paired. Reopen the emulator tab to connect.";
});

clearBridgeTokenBtn.addEventListener("click", async () => {
  await clearBridgePairingToken();
  bridgeTokenInput.value = "";
  bridgeTokenStatus.textContent = "Pairing removed";
});

async function init() {
  await refreshPermissionStatus();
  await refreshDeviceList();
  remoteFarmInput.value = await getRemoteFarmUrl();
  bridgeTokenStatus.textContent = (await getBridgePairingToken()) ? "Paired" : "Not paired";
}

void init();
initFooterYear();
