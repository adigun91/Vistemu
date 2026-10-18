import browser from "webextension-polyfill";
import type { DeviceProfile } from "../devices/types";
import type { CustomDeviceInput } from "../devices/registry";

export type Orientation = "portrait" | "landscape";

export type ExtensionMessage =
  | { type: "OPEN_EMULATOR"; url?: string; deviceId?: string }
  | { type: "GET_DEVICES" }
  | { type: "ADD_CUSTOM_DEVICE"; input: CustomDeviceInput }
  | { type: "REMOVE_CUSTOM_DEVICE"; id: string }
  | { type: "SET_DEVICE_STATE"; tabId?: number; deviceId: string; orientation: Orientation; zoom: number };

export type ExtensionResponse =
  | { ok: true; devices: DeviceProfile[] }
  | { ok: true }
  | { ok: false; error: string };

export async function sendMessage<T = ExtensionResponse>(message: ExtensionMessage): Promise<T> {
  return (await browser.runtime.sendMessage(message)) as T;
}
