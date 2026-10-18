#define MyAppName "Vistemu Bridge"
#define MyAppVersion "1.0.0"
#define MyPublisher "Autom8 Inc"

[Setup]
AppId={{A28B9818-110E-4B6D-AE75-35284A47D693}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyPublisher}
DefaultDirName={localappdata}\Programs\VistemuBridge
DefaultGroupName=Vistemu Bridge
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=installer
OutputBaseFilename=VistemuBridgeSetup-{#MyAppVersion}-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayIcon={app}\runtime\node.exe

[Files]
Source: "runtime\*"; DestDir: "{app}\runtime"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "start.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "stop.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "README.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Start Vistemu Bridge"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\start.ps1"""; WorkingDir: "{app}"
Name: "{group}\Stop Vistemu Bridge"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\stop.ps1"""; WorkingDir: "{app}"
Name: "{group}\Vistemu Bridge Setup Guide"; Filename: "{app}\README.txt"
Name: "{autodesktop}\Start Vistemu Bridge"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\start.ps1"""; WorkingDir: "{app}"
