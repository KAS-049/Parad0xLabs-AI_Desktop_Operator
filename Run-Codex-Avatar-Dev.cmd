@echo off
setlocal
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"

set "NPM_CMD="
if exist "%ProgramFiles%\nodejs\npm.cmd" set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"
if not defined NPM_CMD if exist "%ProgramFiles(x86)%\nodejs\npm.cmd" set "NPM_CMD=%ProgramFiles(x86)%\nodejs\npm.cmd"

if not defined NPM_CMD (
  echo Node.js 22+ is required before this launcher can bootstrap the app.
  echo Install Node.js, reopen the terminal, and run this launcher again.
  pause
  exit /b 1
)

if not exist "%APP_DIR%node_modules\electron\dist\electron.exe" (
  echo Installing project dependencies...
  call "%NPM_CMD%" ci
  if errorlevel 1 (
    echo Dependency install failed.
    pause
    exit /b 1
  )
)

if not exist "%APP_DIR%dist\main\main.js" (
  echo Building the app...
  call "%NPM_CMD%" run build
  if errorlevel 1 (
    echo Build failed.
    pause
    exit /b 1
  )
)

if not exist "%APP_DIR%node_modules\electron\dist\electron.exe" (
  echo Electron is still missing after install.
  pause
  exit /b 1
)

start "" "%APP_DIR%node_modules\electron\dist\electron.exe" .
exit /b 0
