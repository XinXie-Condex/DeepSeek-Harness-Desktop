; DeepSeek for Windows 安装脚本（Inno Setup 6）
#define MyAppName "DeepSeek"
#define MyAppVersion "1.0.1"
#define MyAppPublisher "Condex"

[Setup]
AppId={{4D2C7A1E-9B3F-4E8A-B6C5-2F1D8E9A7C41}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputBaseFilename=DeepSeek-Setup-{#MyAppVersion}
OutputDir=.
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\DeepSeek.exe
PrivilegesRequired=admin
DisableProgramGroupPage=yes

[Files]
Source: "windows\publish\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\DeepSeek.exe"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\DeepSeek.exe"

[Run]
Filename: "{app}\DeepSeek.exe"; Description: "启动 {#MyAppName}"; Flags: nowait postinstall skipifsilent
