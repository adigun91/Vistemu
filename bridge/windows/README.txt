VISTEMU BRIDGE FOR WINDOWS
==========================

Install (current Windows user; no admin prompt required)
1. Extract the complete VistemuBridge release archive.
2. Right-click install.ps1 and choose Run with PowerShell, or run it from PowerShell.
3. Choose "Start Vistemu Bridge" from the Start Menu folder "Vistemu Bridge".
4. Open the Vistemu extension Settings, copy the token from:
   %APPDATA%\Vistemu\bridge-token.txt
   Paste it into Local Android bridge pairing and choose Save pairing.
5. Reopen the Vistemu emulator tab. The bridge should show Connected.

Stop
Choose "Stop Vistemu Bridge" in the Start Menu folder. The bridge listens only on 127.0.0.1:8787.

Android device
Enable Developer options and USB debugging on the Android phone, connect it by USB,
and approve the debugging prompt on the phone. For Xiaomi/MIUI, enable Install via USB too.

Privacy and security
The bridge executes local ADB commands, accepts APK uploads up to 300 MiB, and streams
screenshots from the selected Android device to the extension. Keep the pairing token
private. Do not expose the bridge port to a LAN or the public internet. The extension
requests site access only after the user clicks its permission button.

This installer bundle is not code-signed in this build. Windows SmartScreen may warn;
only distribute a signed build after signing with the publisher's verified certificate.
