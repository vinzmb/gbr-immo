' Startet GBR-Immo ohne sichtbares Konsolenfenster.
' Nutzt das mitgelieferte Node (runtime\node.exe) und legt die Daten unter
' %APPDATA%\GBR-Immo ab, damit App-Updates die Daten nie berühren.
Set sh = CreateObject("WScript.Shell")
dir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
sh.Environment("PROCESS")("GBR_DATA_DIR") = sh.ExpandEnvironmentStrings("%APPDATA%\GBR-Immo")

nodeExe = dir & "runtime\node.exe"
If Not (CreateObject("Scripting.FileSystemObject")).FileExists(nodeExe) Then
  nodeExe = "node" ' Fallback: Node aus dem System
End If

sh.Run """" & nodeExe & """ """ & dir & "server\index.js""", 0, False
