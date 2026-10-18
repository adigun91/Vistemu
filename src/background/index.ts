import browser from "webextension-polyfill";
import { getAllDevices, getDeviceById, addCustomDevice, removeCustomDevice } from "../devices/registry";
import { getTabState, setTabState, clearTabState } from "../lib/storage";
import { applyMainWorldOverrides, applyIsolatedWorldSetup } from "../lib/inject-functions";
import type { ExtensionMessage } from "../lib/messaging";

browser.action.onClicked.addListener(async () => {
  await browser.tabs.create({ url: browser.runtime.getURL("emulator.html") });
});

/** Injects device overrides into the emulated iframe's direct child frame(s) of an emulator tab. */
async function injectForTab(tabId: number, explicitFrameId?: number): Promise<void> {
  const state = await getTabState(tabId);
  if (!state) return;

  const device = await getDeviceById(state.deviceId);
  if (!device) return;

  const dims =
    state.orientation === "landscape"
      ? { width: device.height, height: device.width }
      : { width: device.width, height: device.height };

  let frameIds: number[];
  if (explicitFrameId !== undefined) {
    frameIds = [explicitFrameId];
  } else {
    const frames = await browser.webNavigation.getAllFrames({ tabId });
    frameIds = (frames ?? []).filter((f) => f.parentFrameId === 0).map((f) => f.frameId);
  }
  if (frameIds.length === 0) return;

  try {
    await browser.scripting.executeScript({
      target: { tabId, frameIds },
      world: "MAIN",
      func: applyMainWorldOverrides,
      args: [device, dims, state.orientation],
    });
    await browser.scripting.executeScript({
      target: { tabId, frameIds },
      world: "ISOLATED",
      func: applyIsolatedWorldSetup,
      args: [device],
    });
  } catch (err) {
    // Expected when the target frame forbids scripting (e.g. browser-internal pages) or
    // when the extension lacks host permission for that origin yet.
    console.warn("[vistemu] injection skipped:", err);
  }
}

browser.webNavigation.onCommitted.addListener((details) => {
  // Our emulator page hosts exactly one iframe, so any non-top frame is it.
  if (details.frameId !== 0) {
    void injectForTab(details.tabId, details.frameId);
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  void clearTabState(tabId);
});

browser.runtime.onMessage.addListener((raw: unknown, sender: { tab?: { id?: number } }) => {
  const message = raw as ExtensionMessage;

  switch (message.type) {
    case "OPEN_EMULATOR": {
      const params = new URLSearchParams();
      if (message.url) params.set("url", message.url);
      if (message.deviceId) params.set("device", message.deviceId);
      const query = params.toString();
      return browser.tabs
        .create({ url: browser.runtime.getURL("emulator.html") + (query ? `?${query}` : "") })
        .then(() => ({ ok: true as const }));
    }

    case "GET_DEVICES":
      return getAllDevices().then((devices) => ({ ok: true as const, devices }));

    case "ADD_CUSTOM_DEVICE":
      return addCustomDevice(message.input)
        .then(() => ({ ok: true as const }))
        .catch((err: Error) => ({ ok: false as const, error: err.message }));

    case "REMOVE_CUSTOM_DEVICE":
      return removeCustomDevice(message.id).then(() => ({ ok: true as const }));

    case "SET_DEVICE_STATE": {
      const tabId = sender.tab?.id ?? message.tabId;
      if (tabId === undefined) return Promise.resolve({ ok: false as const, error: "Unknown tab." });
      return setTabState(tabId, {
        deviceId: message.deviceId,
        orientation: message.orientation,
        zoom: message.zoom,
      })
        .then(() => injectForTab(tabId))
        .then(() => ({ ok: true as const }));
    }

    default:
      return undefined;
  }
});
