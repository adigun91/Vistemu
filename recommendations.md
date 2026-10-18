# Recommendations

## Current release status

Vistemu 1.0.0 includes token pairing, loopback-only bridge access, command and
upload validation, optional website permissions, privacy disclosures, browser
ZIP packaging, and a separate Windows bridge bundle and Inno Setup installer.
The bridge suite currently has 10 passing tests, including isolated Windows
install/start/stop checks under profile paths containing spaces. Typecheck,
Chrome/Firefox builds, and both dependency audits passed during release prep.

The installer is compiled but unsigned. Public distribution still requires a
verified publisher signing certificate or managed signing service, signing
tooling, timestamping, and signature verification. A trusted signature does not
guarantee that Windows SmartScreen will never display a warning.

Before publication, host privacy-policy.html at a stable HTTPS address, set a
real publisher contact, capture actual extension screenshots, and complete
Chrome/Edge/Firefox plus physical Android and local-emulator acceptance tests.
The Vistemu name has not received legal trademark clearance.

## Priority 1: Make the core workflows dependable

- Extend the existing repeatable bridge tests with extension UI tests for device selection, orientation, zoom, footer year, and emulator detection. Typecheck and build alone do not verify those user workflows.
- Add clear bridge startup guidance to the UI or setup flow. The Real APK Device mode depends on `bridge/` running, and port `8787` can already be occupied by an older bridge process. Show a helpful status/error and document how to identify and restart that process.
- Test the bridge against both a physical USB device and at least one local emulator. Automated tests can validate protocol behavior, but installation, launch, and screen mirroring still need device-level verification.

## Priority 2: Keep the local bridge secure

- Keep the bridge bound to `127.0.0.1`; do not expose it on `0.0.0.0` or the LAN. Continue rejecting browser connections from untrusted origins.
- Preserve mandatory random-token pairing for every client, including extension-origin and no-Origin clients. Keep the persisted token private and document rotation and re-pairing.
- Preserve existing request validation and upload limits, and add regression tests whenever a new bridge command is introduced. Keep using `execFile` with argument arrays rather than shell command strings.
- Avoid logging uploaded APK contents, user-entered text, or other potentially sensitive device data. Keep temporary APK cleanup reliable on both success and failure paths.

## Priority 3: Make setup and limitations clear

- Provide a guided first-run check for Node.js, the bundled `adb` tools, bridge availability, and Android USB debugging. Explain that local emulator applications must be installed separately and enabled for ADB; they cannot be bundled into the browser extension.
- Clearly distinguish viewport emulation from native APK testing in the UI. The viewport mode tests responsive web/PWA behavior; the bridge runs an APK on a connected Android device or locally installed emulator.
- Keep the remote device-farm setting optional. Add it to the main workflow only if there is a real configured service and a clear privacy/security model; the current extension does not provide a hosted farm.

## Priority 4: Improve compatibility and release readiness

- Run a browser smoke test in real Chrome/Edge and Firefox extension contexts. Opening built pages with `file://` is not a valid runtime test because `webextension-polyfill` requires the extension APIs.
- Test representative sites with restrictive iframe policies and show a useful explanation when `X-Frame-Options` or `frame-ancestors` prevents loading; do not try to bypass those browser protections.
- Before store distribution, review each browser's manifest requirements, permissions, privacy disclosures, package contents, and versioning. Keep `<all_urls>` optional and requested only from a user action.
- Add a short changelog and a release checklist covering typecheck, both browser builds, extension smoke tests, bridge integration tests, and device-level APK testing.

## Suggested order

1. Run the committed bridge tests and add core extension UI coverage.
2. Add bridge health/startup guidance and validate real-device plus local-emulator flows.
3. Complete verified publisher signing and host the privacy policy over HTTPS.
4. Complete Chrome/Edge and Firefox smoke testing, then finalize store screenshots and submission materials.
