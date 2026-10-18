import type { DeviceProfile } from "../devices/types";

/**
 * Runs inside the emulated page's MAIN world via chrome.scripting.executeScript.
 * Must be fully self-contained (no references to outer closures) because the
 * function body is serialized and re-executed in the target frame.
 */
export function applyMainWorldOverrides(
  device: DeviceProfile,
  dims: { width: number; height: number },
  orientation: "portrait" | "landscape"
): void {
  const define = (obj: object, prop: string, value: unknown) => {
    try {
      Object.defineProperty(obj, prop, { get: () => value, configurable: true });
    } catch {
      /* some engines expose non-configurable built-ins; skip rather than throw */
    }
  };

  define(navigator, "userAgent", device.userAgent);
  define(navigator, "platform", device.platform);
  define(navigator, "maxTouchPoints", device.touch ? device.maxTouchPoints : 0);
  define(navigator, "vendor", device.os === "ios" || device.os === "ipados" ? "Apple Computer, Inc." : "Google Inc.");
  define(window, "devicePixelRatio", device.dpr);
  define(screen, "width", dims.width);
  define(screen, "height", dims.height);
  define(screen, "availWidth", dims.width);
  define(screen, "availHeight", dims.height);
  define(screen, "orientation", {
    type: orientation === "portrait" ? "portrait-primary" : "landscape-primary",
    angle: orientation === "portrait" ? 0 : 90,
  });

  if (device.touch && !("ontouchstart" in window)) {
    define(window, "ontouchstart", null);
  }

  window.dispatchEvent(new Event("resize"));
  window.dispatchEvent(new Event("orientationchange"));
}

/**
 * Runs inside the emulated page's ISOLATED world. Translates mouse/pointer input
 * into synthetic Touch events so code paths gated on touchstart/touchmove/touchend
 * can be exercised from a desktop mouse.
 */
export function applyIsolatedWorldSetup(device: DeviceProfile): void {
  if (!device.touch) return;
  if ((window as unknown as { __deviceEmulatorTouchBridge?: boolean }).__deviceEmulatorTouchBridge) return;
  (window as unknown as { __deviceEmulatorTouchBridge?: boolean }).__deviceEmulatorTouchBridge = true;

  const makeTouch = (e: PointerEvent): Touch | null => {
    if (typeof Touch === "undefined") return null;
    return new Touch({
      identifier: e.pointerId,
      target: e.target as EventTarget,
      clientX: e.clientX,
      clientY: e.clientY,
      pageX: e.pageX,
      pageY: e.pageY,
      screenX: e.screenX,
      screenY: e.screenY,
    });
  };

  const dispatchTouch = (type: string, e: PointerEvent) => {
    const touch = makeTouch(e);
    if (!touch || typeof TouchEvent === "undefined") return;
    const touches = type === "touchend" || type === "touchcancel" ? [] : [touch];
    const event = new TouchEvent(type, {
      touches,
      targetTouches: touches,
      changedTouches: [touch],
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    e.target?.dispatchEvent(event);
  };

  document.addEventListener("pointerdown", (e) => e.pointerType === "mouse" && dispatchTouch("touchstart", e), true);
  document.addEventListener("pointermove", (e) => e.pointerType === "mouse" && dispatchTouch("touchmove", e), true);
  document.addEventListener("pointerup", (e) => e.pointerType === "mouse" && dispatchTouch("touchend", e), true);
}
