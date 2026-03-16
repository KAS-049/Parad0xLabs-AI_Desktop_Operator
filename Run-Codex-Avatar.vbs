Set shell = CreateObject("WScript.Shell")
appDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run Chr(34) & appDir & "\Run-Codex-Avatar-Dev.cmd" & Chr(34), 1, False
