export type DeviceOS = "android" | "ios" | "ipados" | "windows" | "other";
export type DeviceCategory = "phone" | "tablet" | "ipad" | "foldable" | "desktop";

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DeviceProfile {
  /** Stable unique id, e.g. "iphone-15-pro" */
  id: string;
  name: string;
  category: DeviceCategory;
  os: DeviceOS;
  /** CSS pixel width/height in portrait orientation */
  width: number;
  height: number;
  /** Device pixel ratio used to emulate screen density */
  dpr: number;
  userAgent: string;
  platform: string;
  touch: boolean;
  maxTouchPoints: number;
  /** Notch / rounded-corner insets, in CSS px, portrait orientation */
  safeArea?: SafeAreaInsets;
  /** True for devices added by the user via the options page */
  custom?: boolean;
}

export interface DeviceState {
  deviceId: string | null;
  orientation: "portrait" | "landscape";
  zoom: number;
  showBezel: boolean;
  enabled: boolean;
}
