import type { DeviceProfile } from "../devices/types";

/** Thin wrapper around browser.storage so call sites don't repeat promise/callback boilerplate. */
import browser from "webextension-polyfill";

const CUSTOM_DEVICES_KEY = "customDevices";
const LAST_URL_KEY = "lastUrl";
const PERMISSION_DISMISSED_KEY = "permissionBannerDismissed";
const REMOTE_FARM_URL_KEY = "remoteFarmUrl";
const BRIDGE_TOKEN_KEY = "bridgePairingToken";

export async function getBridgePairingToken(): Promise<string> {
  const result = await browser.storage.local.get(BRIDGE_TOKEN_KEY);
  return typeof result[BRIDGE_TOKEN_KEY] === "string" ? (result[BRIDGE_TOKEN_KEY] as string) : "";
}

export async function setBridgePairingToken(token: string): Promise<void> {
  await browser.storage.local.set({ [BRIDGE_TOKEN_KEY]: token.trim() });
}

export async function clearBridgePairingToken(): Promise<void> {
  await browser.storage.local.remove(BRIDGE_TOKEN_KEY);
}

/**
 * Optional, user-supplied URL for an externally hosted device farm / real-device
 * streaming service (e.g. a self-hosted Android emulator reachable over noVNC/WebRTC).
 * This extension does not host or provide such a service — it only stores the URL
 * and embeds it in an iframe when configured, so native-app testing is possible if
 * the developer already has such infrastructure.
 */
export async function getRemoteFarmUrl(): Promise<string> {
  const result = await browser.storage.local.get(REMOTE_FARM_URL_KEY);
  return typeof result[REMOTE_FARM_URL_KEY] === "string" ? (result[REMOTE_FARM_URL_KEY] as string) : "";
}

export async function setRemoteFarmUrl(url: string): Promise<void> {
  await browser.storage.local.set({ [REMOTE_FARM_URL_KEY]: url });
}

export async function getCustomDevices(): Promise<DeviceProfile[]> {
  const result = await browser.storage.local.get(CUSTOM_DEVICES_KEY);
  const devices = result[CUSTOM_DEVICES_KEY];
  return Array.isArray(devices) ? (devices as DeviceProfile[]) : [];
}

export async function saveCustomDevices(devices: DeviceProfile[]): Promise<void> {
  await browser.storage.local.set({ [CUSTOM_DEVICES_KEY]: devices });
}

export async function getLastUrl(): Promise<string> {
  const result = await browser.storage.local.get(LAST_URL_KEY);
  return typeof result[LAST_URL_KEY] === "string" ? (result[LAST_URL_KEY] as string) : "";
}

export async function setLastUrl(url: string): Promise<void> {
  await browser.storage.local.set({ [LAST_URL_KEY]: url });
}

export async function isPermissionBannerDismissed(): Promise<boolean> {
  const result = await browser.storage.local.get(PERMISSION_DISMISSED_KEY);
  return Boolean(result[PERMISSION_DISMISSED_KEY]);
}

export async function dismissPermissionBanner(): Promise<void> {
  await browser.storage.local.set({ [PERMISSION_DISMISSED_KEY]: true });
}

/** Per-tab emulation state lives in session storage so it clears when the browser closes. */
export interface TabEmulationState {
  deviceId: string;
  orientation: "portrait" | "landscape";
  zoom: number;
}

function tabKey(tabId: number): string {
  return `tabState:${tabId}`;
}

export async function getTabState(tabId: number): Promise<TabEmulationState | null> {
  const result = await browser.storage.session.get(tabKey(tabId));
  const state = result[tabKey(tabId)];
  return state ? (state as TabEmulationState) : null;
}

export async function setTabState(tabId: number, state: TabEmulationState): Promise<void> {
  await browser.storage.session.set({ [tabKey(tabId)]: state });
}

export async function clearTabState(tabId: number): Promise<void> {
  await browser.storage.session.remove(tabKey(tabId));
}
