// Detects local Android emulator apps already installed on this PC so the UI can
// show "already installed" vs. offer an official download link. We never download,
// bundle, or silently install third-party emulator binaries ourselves — browser
// extensions (and this bridge) can't do that, and redistributing their installers
// would violate each vendor's license terms anyway.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const EMULATOR_CATALOG = [
  {
    id: "bluestacks",
    name: "BlueStacks 5",
    hostPort: "127.0.0.1:5555",
    downloadUrl: "https://www.bluestacks.com/download.html",
    registryPattern: /bluestacks/i,
  },
  {
    id: "ldplayer",
    name: "LDPlayer",
    hostPort: "127.0.0.1:5555",
    downloadUrl: "https://www.ldplayer.net/",
    registryPattern: /ldplayer/i,
  },
  {
    id: "noxplayer",
    name: "NoxPlayer",
    hostPort: "127.0.0.1:62001",
    downloadUrl: "https://www.bignox.com/",
    registryPattern: /nox\s*(app\s*)?player/i,
  },
  {
    id: "memu",
    name: "MEmu",
    hostPort: "127.0.0.1:21503",
    downloadUrl: "https://www.memuplay.com/",
    registryPattern: /memu/i,
  },
  {
    id: "wsa",
    name: "Windows Subsystem for Android",
    hostPort: "127.0.0.1:58526",
    downloadUrl: "https://learn.microsoft.com/windows/android/wsa/",
    appxPattern: "MicrosoftCorporationII.WindowsSubsystemForAndroid",
  },
];

const UNINSTALL_KEYS = [
  "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  "HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
];

async function runPowerShell(script) {
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    maxBuffer: 8 * 1024 * 1024,
    encoding: "utf8",
  });
  return stdout;
}

/** Display names of installed desktop programs, read from the Win32 uninstall registry keys. */
async function listInstalledDisplayNames() {
  const script = UNINSTALL_KEYS.map(
    (key) =>
      `Get-ItemProperty "${key}\\*" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty DisplayName -ErrorAction SilentlyContinue`
  ).join("; ");
  const out = await runPowerShell(script);
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function isAppxInstalled(namePrefix) {
  const script = `if (Get-AppxPackage -Name "${namePrefix}*" -ErrorAction SilentlyContinue) { "true" } else { "false" }`;
  const out = await runPowerShell(script);
  return out.trim().toLowerCase() === "true";
}

/** Returns the emulator catalog annotated with whether each one is already installed on this PC. */
export async function detectEmulators() {
  if (process.platform !== "win32") {
    // Detection is Windows-only for now; still return the catalog so the UI can offer download links.
    return EMULATOR_CATALOG.map(({ registryPattern, appxPattern, ...rest }) => ({ ...rest, installed: false }));
  }

  let displayNames = [];
  try {
    displayNames = await listInstalledDisplayNames();
  } catch {
    // reg/PowerShell unavailable or blocked — treat everything as "unknown" (shown as not installed)
  }

  const results = [];
  for (const entry of EMULATOR_CATALOG) {
    const { registryPattern, appxPattern, ...rest } = entry;
    let installed = false;
    if (registryPattern) {
      installed = displayNames.some((name) => registryPattern.test(name));
    } else if (appxPattern) {
      installed = await isAppxInstalled(appxPattern).catch(() => false);
    }
    results.push({ ...rest, installed });
  }
  return results;
}
