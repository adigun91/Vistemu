import browser from "webextension-polyfill";
import { getAllDevices } from "../devices/registry";
import type { DeviceProfile } from "../devices/types";
import {
  getLastUrl,
  setLastUrl,
  isPermissionBannerDismissed,
  dismissPermissionBanner,
  getRemoteFarmUrl,
} from "../lib/storage";
import { sendMessage } from "../lib/messaging";
import { initFooterYear } from "../lib/footer";
import { initRealDevice, showToast } from "./real-device";

const ALL_URLS = { origins: ["<all_urls>"] };

const banner = document.getElementById("permission-banner") as HTMLDivElement;
const grantBtn = document.getElementById("grant-permission") as HTMLButtonElement;
const dismissBtn = document.getElementById("dismiss-banner") as HTMLButtonElement;
const urlForm = document.getElementById("url-form") as HTMLFormElement;
const urlInput = document.getElementById("url-input") as HTMLInputElement;
const deviceSelect = document.getElementById("device-select") as HTMLSelectElement;
const orientationToggle = document.getElementById("orientation-toggle") as HTMLButtonElement;
const zoomRange = document.getElementById("zoom-range") as HTMLInputElement;
const bezelToggle = document.getElementById("bezel-toggle") as HTMLInputElement;
const wrapper = document.getElementById("device-wrapper") as HTMLDivElement;
const bezel = document.getElementById("device-bezel") as HTMLDivElement;
const notch = document.getElementById("notch") as HTMLDivElement;
const viewportFrame = document.getElementById("viewport-frame") as HTMLIFrameElement;
const viewportStage = document.getElementById("stage") as HTMLElement;

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 1.5;

const CATEGORY_LABELS: Record<DeviceProfile["category"], string> = {
  phone: "Phones",
  tablet: "Tablets",
  ipad: "iPads",
  foldable: "Foldables",
  desktop: "Desktop (reference)",
};

let devices: DeviceProfile[] = [];
let currentDevice: DeviceProfile;
let orientation: "portrait" | "landscape" = "portrait";
let zoom = 0.9;
let zoomPreference = zoom;
let bezelOn = true;

function getDims(device: DeviceProfile, orient: "portrait" | "landscape") {
  return orient === "landscape"
    ? { width: device.height, height: device.width }
    : { width: device.width, height: device.height };
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function populateSelect(list: DeviceProfile[]) {
  deviceSelect.innerHTML = "";
  const groups = new Map<DeviceProfile["category"], DeviceProfile[]>();
  for (const device of list) {
    const bucket = groups.get(device.category) ?? [];
    bucket.push(device);
    groups.set(device.category, bucket);
  }
  for (const [category, items] of groups) {
    const group = document.createElement("optgroup");
    group.label = CATEGORY_LABELS[category];
    for (const device of items) {
      const option = document.createElement("option");
      option.value = device.id;
      option.textContent = device.custom ? `${device.name} (custom)` : device.name;
      group.appendChild(option);
    }
    deviceSelect.appendChild(group);
  }
}

function updateWrapperScale() {
  const dims = getDims(currentDevice, orientation);
  wrapper.style.transform = `scale(${zoom})`;
  wrapper.style.width = `${Math.round(dims.width * zoom)}px`;
  wrapper.style.height = `${Math.round(dims.height * zoom)}px`;
}

function getStageFitZoom(): number {
  const dims = getDims(currentDevice, orientation);
  const stageStyle = getComputedStyle(viewportStage);
  const horizontalPadding = parseFloat(stageStyle.paddingLeft) + parseFloat(stageStyle.paddingRight);
  const verticalPadding = parseFloat(stageStyle.paddingTop) + parseFloat(stageStyle.paddingBottom);
  const bezelExtra = bezelOn ? 20 : 0;
  const availableWidth = viewportStage.clientWidth - horizontalPadding;
  const availableHeight = viewportStage.clientHeight - verticalPadding;

  if (availableWidth <= 0 || availableHeight <= 0) return zoom;

  const fit = Math.min(
    availableWidth / (dims.width + bezelExtra),
    availableHeight / (dims.height + bezelExtra)
  );
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, fit));
}

function applyStageFit() {
  if (!currentDevice) return;
  const previousZoom = zoom;
  zoom = Math.min(zoomPreference, getStageFitZoom());
  zoomRange.value = String(zoom);
  updateWrapperScale();
  if (zoom !== previousZoom) void notifyBackground();
}

async function notifyBackground() {
  const tab = await browser.tabs.getCurrent();
  await sendMessage({
    type: "SET_DEVICE_STATE",
    tabId: tab?.id,
    deviceId: currentDevice.id,
    orientation,
    zoom,
  });
}

function applyDevice(device: DeviceProfile) {
  currentDevice = device;
  const dims = getDims(device, orientation);
  viewportFrame.width = String(dims.width);
  viewportFrame.height = String(dims.height);
  bezel.classList.toggle("no-bezel", !bezelOn);

  const showNotch = bezelOn && Boolean(device.safeArea?.top) && orientation === "portrait";
  notch.classList.toggle("hidden", !showNotch);
  if (device.safeArea) notch.style.height = `${device.safeArea.top}px`;

  applyStageFit();
  void notifyBackground();
}

function loadUrl(raw: string) {
  const url = normalizeUrl(raw);
  urlInput.value = url;
  viewportFrame.src = url;
  void setLastUrl(url);
}

async function refreshPermissionBanner() {
  const [hasPermission, dismissed] = await Promise.all([
    browser.permissions.contains(ALL_URLS),
    isPermissionBannerDismissed(),
  ]);
  banner.hidden = hasPermission || dismissed;
}

urlForm.addEventListener("submit", (e) => {
  e.preventDefault();
  loadUrl(urlInput.value);
});

deviceSelect.addEventListener("change", () => {
  const device = devices.find((d) => d.id === deviceSelect.value);
  if (device) applyDevice(device);
});

orientationToggle.addEventListener("click", () => {
  orientation = orientation === "portrait" ? "landscape" : "portrait";
  applyDevice(currentDevice);
});

zoomRange.addEventListener("input", () => {
  zoomPreference = parseFloat(zoomRange.value);
  applyStageFit();
  void notifyBackground();
});

bezelToggle.addEventListener("change", () => {
  bezelOn = bezelToggle.checked;
  applyDevice(currentDevice);
});

grantBtn.addEventListener("click", async () => {
  const granted = await browser.permissions.request(ALL_URLS);
  if (granted) banner.hidden = true;
});

dismissBtn.addEventListener("click", async () => {
  banner.hidden = true;
  await dismissPermissionBanner();
});

const viewportResizeObserver = new ResizeObserver(() => applyStageFit());
viewportResizeObserver.observe(viewportStage);

document.getElementById("open-device-farm")?.addEventListener("click", async () => {
  const template = await getRemoteFarmUrl();
  if (!template) {
    showToast("No device-farm URL configured \u2014 set one in Manage devices \u2192 Remote device farm.", "error");
    return;
  }
  const url = template.replace("{deviceId}", encodeURIComponent(currentDevice?.id ?? ""));
  if (!/^https?:\/\//i.test(url)) {
    showToast("Device-farm URL must start with http:// or https://", "error");
    return;
  }
  await browser.tabs.create({ url });
});

async function init() {
  devices = await getAllDevices();
  populateSelect(devices);

  const params = new URLSearchParams(location.search);
  const requestedDevice = devices.find((d) => d.id === params.get("device")) ?? devices[0];
  if (!requestedDevice) return;

  deviceSelect.value = requestedDevice.id;
  zoomRange.value = String(zoom);

  await refreshPermissionBanner();
  applyDevice(requestedDevice);

  const requestedUrl = params.get("url") ?? (await getLastUrl()) ?? "https://example.com";
  loadUrl(requestedUrl || "https://example.com");
}

initRealDevice();
void init();
initFooterYear();