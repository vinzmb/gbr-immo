; Inno Setup Script für GBR-Immo
; Erzeugt einen Windows-Installer (Setup.exe). Node wird mitgeliefert,
; die App bleibt browserbasiert. Daten liegen unter %APPDATA%\GBR-Immo.
;
; Bauen: zuerst installer\build.bat ausführen (baut die App + holt Node),
; dann diese Datei mit dem Inno Setup Compiler (ISCC) übersetzen.

#define AppName "GBR-Immo"
#define AppVersion "1.0.0"
#define AppPublisher "GBR-Immo"

[Setup]
AppId={{8E2A1F90-GBR0-IMMO-0001-APP000000001}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
; Installation ohne Adminrechte ins Benutzerprofil:
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputBaseFilename=GBR-Immo-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; Optional eigenes Icon: lege installer\icon.ico ab und entferne die Kommentare:
; SetupIconFile=icon.ico
UninstallDisplayIcon={app}\runtime\node.exe

[Languages]
Name: "de"; MessagesFile: "compiler:Languages\German.isl"

[Tasks]
Name: "desktopicon"; Description: "Desktop-Verknüpfung erstellen"; GroupDescription: "Verknüpfungen:"

[Files]
; Die gesamte gebaute App (von build.bat im Ordner _build bereitgestellt).
Source: "_build\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "wscript.exe"; Parameters: """{app}\launch.vbs"""; WorkingDir: "{app}"
Name: "{group}\{#AppName} beenden"; Filename: "{app}\stop.bat"; WorkingDir: "{app}"
Name: "{group}\{#AppName} deinstallieren"; Filename: "{uninstallexe}"
Name: "{userdesktop}\{#AppName}"; Filename: "wscript.exe"; Parameters: """{app}\launch.vbs"""; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "wscript.exe"; Parameters: """{app}\launch.vbs"""; Description: "{#AppName} jetzt starten"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Programmdateien werden entfernt; der Datenordner (%APPDATA%\GBR-Immo) bleibt
; absichtlich erhalten, damit keine Eingaben verloren gehen.
Type: filesandordirs; Name: "{app}"
