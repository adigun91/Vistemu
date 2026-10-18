# Vistemu — Mobile Web & APK Testing

A cross-browser extension (Chrome, Edge, Firefox — Manifest V3) for emulating
phone/tablet/iPad viewports so mobile web apps and PWAs can be tested on a PC.

## What this actually emulates (read this first)

A browser extension runs inside the browser's own sandbox — it **cannot** boot a
real Android/iOS/Windows OS or run native `.apk`/`.ipa` binaries. There is no
virtualization capability available to an extension. So "emulation" here means:

- **Viewport emulation**: the page is loaded in an iframe sized to the exact CSS
  pixel dimensions of the chosen device, so responsive breakpoints (`@media`
  width/orientation queries) evaluate exactly as they would on that device.
- **Identity spoofing**: `navigator.userAgent`, `platform`, `vendor`,
  `maxTouchPoints`, `screen.*` and `devicePixelRatio` are overridden to match the
  device profile, injected via `chrome.scripting.executeScript` (MAIN world).
- **Touch simulation**: mouse/pointer input is translated into synthetic
  `TouchEvent`s so touch-gated code paths can be exercised from a desktop mouse.
- **Device catalog**: curated phones, tablets, iPads, foldables and
  Windows devices, plus a UI for adding fully custom device profiles.

This covers the vast majority of real-world "does my site/PWA work on an
iPhone / Pixel / iPad / Surface" testing needs. It does not, by itself, run real
native app binaries — no browser extension can, since there's no OS/ART
virtualization available in an extension sandbox. For that, see **Real APK
Device mode** below, which drives your own physical Android phone instead.

Note also that sites sending `X-Frame-Options`/`Content-Security-Policy:
frame-ancestors` will refuse to load in the iframe — this is a browser security
feature the extension intentionally does not try to bypass.

## Real APK Device mode (run a locally-built `.apk` before you publish it)

The emulator tab has a second mode, **"Real APK Device"**, for testing an
actual `.apk` you built — not a viewport simulation. Since no browser sandbox
can execute Android bytecode, this mode drives **your own physical Android
phone over USB** through a small local bridge. No Android Studio, no emulator
images, no cloud service, and no API keys:

- `bridge/` is a standalone Node.js server (separate from the extension bundle,
  since it needs `child_process`/filesystem access the extension sandbox
  doesn't have).
- It shells out to the official, standalone **`adb`** binary (Android SDK
  Platform-Tools — a ~15 MB Google-distributed command-line tool, *not* the
  Android Studio IDE) to install, launch, uninstall, screenshot-stream, and
  send taps/swipes/text/back/home/recents to your connected phone.
- It listens only on `127.0.0.1:8787` (loopback). WebSocket clients must
  authenticate with a random pairing token, and browser pages from normal web
  origins are rejected.

One-time setup:

```bash
cd bridge
npm install
npm run setup   # downloads adb from dl.google.com straight into bridge/platform-tools/
```

Every time you want to use it:

```bash
cd bridge
npm start       # keep this running: ws://127.0.0.1:8787 (loopback only)
```

On first start, the bridge creates a pairing token at
`%APPDATA%\Vistemu\bridge-token.txt`. Open Vistemu Settings → Local Android
bridge pairing, paste the token, save, then reopen the emulator tab. Keep the
token private: it grants control of connected Android devices.

Then, on your Android phone: Settings → About phone → tap "Build number" 7
times to unlock Developer Options → enable **USB debugging** → connect the
phone by USB cable → accept the "Allow USB debugging" prompt on the phone.

In the emulator tab, switch to the **Real APK Device** tab, click **Refresh**
to detect the phone, choose your locally-built `.apk` file, and click
**Install & Launch**. The phone's screen mirrors into the panel (polled
screenshots, a few frames per second — not real-time video, but enough for
functional UI testing); click/drag on it to tap/swipe, and use Back/Home/
Recents and the text box to drive input. This is genuinely your phone's
hardware and OS executing the APK, so it's as close to "what a user will see"
as testing gets, short of handing someone the device.

### Running it on the PC instead of your phone

If you'd rather not touch your own phone at all, the same panel can drive a
free Android emulator app running locally on this PC instead — no Android
Studio, no cloud account. Install one of these once, like any other desktop
program:

| App | Default adb address | Notes |
|---|---|---|
| BlueStacks 5 | `127.0.0.1:5555` | Settings → Advanced → enable "Android Debug Bridge" |
| LDPlayer | `127.0.0.1:5555`+ | Multiple instances use consecutive ports (5555, 5556, …) |
| NoxPlayer | `127.0.0.1:62001` | Settings → enable adb debugging |
| MEmu | `127.0.0.1:21503` | adb enabled by default |
| Windows Subsystem for Android | `127.0.0.1:58526` | Enable "Developer mode" in the WSA settings app |

Pick the matching preset in the **"Local emulator"** dropdown (or type the
`host:port` yourself), click **Connect**, then click **Refresh** — it shows up
in the "Phone" dropdown exactly like a USB device, because to `adb` it *is*
just another device. Install/Launch/mirror/input all work identically; the
APK runs entirely inside that local emulator app on your PC.

> **Verified:** bridge files syntax-check clean, `npm run typecheck` and
> `npm run build` both pass. You'll need to install one of those emulator apps
> (BlueStacks is the most common free option) and enable its ADB debugging
> setting once — then it's just Connect → Refresh → Install & Launch, same as
> with your phone.

## Project layout

```
src/
  background/   service worker (Chrome/Edge) / background script (Firefox)
  devices/      device profile types, curated JSON database, custom-device registry
  emulator/     the main emulator tab UI: viewport mode + Real APK Device mode
  popup/        toolbar-icon launcher popup
  options/      custom device manager, permission control, remote-farm setting
  lib/          storage, messaging, and the self-contained injection functions
build/
  esbuild.config.mjs   bundles each entry point into dist/<browser>/
  manifest.base.json   shared manifest fields
  manifest.chrome.json manifest.firefox.json  per-browser overrides
  make-icons.mjs       generates icons/*.png (no image-library dependency)
  zip.mjs              packages dist/<browser>/ into a store-ready .zip
bridge/
  src/server.mjs       local-only (127.0.0.1), paired WebSocket server
  src/adb.mjs          thin wrapper around the standalone adb binary
  scripts/setup-platform-tools.mjs  downloads adb (not Android Studio) once
  windows/             per-user Windows install/start/stop scripts and Inno Setup source
```

## Build & load locally

```bash
npm install
npm run icons   # one-time: generates icons/icon{16,32,48,128}.png
npm run build   # outputs dist/chrome and dist/firefox
```

**Chrome / Edge**: open `chrome://extensions` (or `edge://extensions`), enable
Developer mode, "Load unpacked", select `dist/chrome`.

**Firefox**: open `about:debugging#/runtime/this-firefox`, "Load Temporary
Add-on…", select any file inside `dist/firefox` (e.g. `manifest.json`).

`npm run watch` rebuilds on change (reload the extension in the browser after
each rebuild). `npm run zip` produces `vistemu-chrome.zip` /
`vistemu-firefox.zip` for store submission.

## Using it

1. Click the toolbar icon → enter a URL (defaults to the last one you used) →
   "Open emulator".
2. In the emulator tab: pick a device, rotate, zoom, toggle the bezel.
3. First time loading a given site, grant the one-time "Enable testing on any
   site" permission (requested on demand, not at install time) so the
   extension is allowed to script that origin's frame.
4. Vistemu Settings → manage optional site access, pair the local Android
  bridge, add custom device profiles, or configure an optional remote device
  farm.

## Why `<all_urls>` is an *optional* permission

The manifest declares `optional_host_permissions: ["<all_urls>"]` rather than a
mandatory permission. The extension only requests it at runtime, from a direct
user gesture (the "Enable testing on any site" button), following the
least-privilege practice recommended for browser extensions — it is not granted
silently at install time.

## Known limitations / next steps

- `devicePixelRatio`/`screen.*` overrides use `Object.defineProperty`, which
  some engine versions may treat as non-configurable; the code degrades
  gracefully (viewport width/height emulation — the part that drives responsive
  layout — is unaffected either way).
- Safari support would require packaging via Xcode's Safari Web Extension
  converter; the WebExtension source here is compatible with that tooling but
  it isn't wired into this repo's build.
- The "remote device farm" field (Options page) is a separate, optional
  connection point for your own cloud/self-hosted device-streaming service; it
  is not required for and unrelated to Real APK Device mode above.
- Real APK Device mode mirrors the screen via polled `adb exec-out screencap`
  (a few FPS), not a real-time video codec — smooth enough for functional
  testing, not for judging animation smoothness. It requires a USB-connected
  Android phone or a separately installed local Android emulator; there is no
  zero-install path for iOS (`.ipa`) since iOS
  execution requires a Mac with Xcode, which this bridge intentionally does
  not attempt to replace.

## Packaging and distribution

Build the browser extension packages from the project root:

```bash
npm install
npm run icons
npm run build
npm run zip
```

This creates `vistemu-chrome.zip` and `vistemu-firefox.zip` in the project
root. The Chrome package can also be submitted to Edge Add-ons. For local
testing, extract the ZIP and load the extracted folder as an unpacked extension
in the browser's developer/extensions page. For public distribution, submit
each package to its browser's extension store and follow that store's review,
developer-registration and review requirements. Set a real publisher contact
address, review permissions and disclosures, and capture store screenshots from
the extension loaded in a real browser context before submission.

The extension package provides viewport emulation by itself. Real APK
installation and mirroring require the separate Vistemu Bridge. A Windows
release bundle can be prepared on Windows after `npm install` and
`npm run setup` in `bridge/` have installed bridge dependencies and ADB:

```powershell
cd bridge
npm run package:windows
```

This produces `vistemu-bridge-windows-x64.zip` containing a Node runtime, bridge
dependencies, Android Platform-Tools, and per-user install/start/stop scripts.
Extract it and run `install.ps1`; no administrator rights are requested. The
Inno Setup definition and build helper are in `bridge/windows/`. To compile the
GUI installer, install Inno Setup 6 and run `bridge/windows/build-installer.ps1`
after packaging. The installer is **unsigned by default**. Publishing a signed
installer requires the publisher's code-signing certificate and Windows SDK
`signtool.exe`; pass the certificate thumbprint to the build script. Do not
distribute the executable until its signature is verified.

The bridge bundle remains a separate install because browser stores do not
allow an extension to install or launch native desktop software. The extension
still works for viewport emulation without it. Vistemu supports native APK
testing only for Android devices/emulators; it does not claim iOS native-app
support.

The privacy policy is in `privacy-policy.html`. Host that file at a stable,
public HTTPS URL (for example, a project website or GitHub Pages) and use that
URL in each store listing. It explains local settings, optional host access,
the pairing token, ADB commands, APK transfers, screenshots, and the lack of
analytics or a hosted backend.

## Release validation checklist

See [recommendations.md](recommendations.md) for implemented safeguards and
remaining publication requirements. The Windows installer has been compiled
with Inno Setup 6.7.3, but is not publisher-signed. Build outputs and dependency
directories are intentionally excluded from Git; regenerate them using the
commands above.

- From the project root run `npm run typecheck`, `npm run build`, and
  `npm run zip`. Then run `npm --prefix bridge test` after bridge dependencies
  and Platform-Tools are installed. On Windows this also tests per-user
  install/start/stop and shortcuts in isolated folders with spaces in their paths.
- Load `dist/chrome` in Chrome and Edge and `dist/firefox` in Firefox; verify
  popup, emulator, Settings, optional permission grant/revoke, responsive
  layout, and privacy-policy link.
- Install the Windows bridge bundle on a clean Windows user profile, pair it
  with the extension, then verify USB phone and local emulator flows, APK
  install/launch/uninstall, mirroring, and input controls.
- Capture store screenshots from the real extension page, not a `file://` tab.
- Submit each browser package through its developer portal. Store accounts,
  final hosted policy URL, publisher contact, code-signing certificate, and
  physical-device testing are publisher-provided release prerequisites.
