@echo off
setlocal
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"
if not exist "%APP_DIR%node_modules\electron\dist\electron.exe" (
  echo Electron is not installed in this fork yet.
  exit /b 1
)
start "" "%APP_DIR%node_modules\electron\dist\electron.exe" .
exit /b 0
