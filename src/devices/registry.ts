import builtinDevices from "./devices.json";
import type { DeviceProfile } from "./types";
import { getCustomDevices, saveCustomDevices } from "../lib/storage";

export const BUILTIN_DEVICES = builtinDevices as DeviceProfile[];

export async function getAllDevices(): Promise<DeviceProfile[]> {
  const custom = await getCustomDevices();
  return [...BUILTIN_DEVICES, ...custom];
}

export async function getDeviceById(id: string): Promise<DeviceProfile | undefined> {
  const all = await getAllDevices();
  return all.find((d) => d.id === id);
}

export interface CustomDeviceInput {
  name: string;
  category: DeviceProfile["category"];
  os: DeviceProfile["os"];
  width: number;
  height: number;
  dpr: number;
  userAgent: string;
  platform: string;
  touch: boolean;
  maxTouchPoints: number;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function validateCustomDevice(input: CustomDeviceInput): string[] {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push("Name is required.");
  if (!Number.isFinite(input.width) || input.width < 100 || input.width > 4000) {
    errors.push("Width must be between 100 and 4000 CSS px.");
  }
  if (!Number.isFinite(input.height) || input.height < 100 || input.height > 4000) {
    errors.push("Height must be between 100 and 4000 CSS px.");
  }
  if (!Number.isFinite(input.dpr) || input.dpr <= 0 || input.dpr > 6) {
    errors.push("Device pixel ratio must be between 0 and 6.");
  }
  if (!input.userAgent.trim()) errors.push("User-Agent string is required.");
  return errors;
}

export async function addCustomDevice(input: CustomDeviceInput): Promise<DeviceProfile> {
  const errors = validateCustomDevice(input);
  if (errors.length > 0) throw new Error(errors.join(" "));

  const existing = await getCustomDevices();
  const baseId = `custom-${slugify(input.name)}` || `custom-${Date.now()}`;
  let id = baseId;
  let suffix = 1;
  while (existing.some((d) => d.id === id)) {
    id = `${baseId}-${suffix++}`;
  }

  const device: DeviceProfile = { ...input, id, custom: true };
  await saveCustomDevices([...existing, device]);
  return device;
}

export async function removeCustomDevice(id: string): Promise<void> {
  const existing = await getCustomDevices();
  await saveCustomDevices(existing.filter((d) => d.id !== id));
}
