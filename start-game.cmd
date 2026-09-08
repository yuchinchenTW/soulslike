@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js, then run this file again.
  pause
  exit /b 1
)
if not exist "node_modules\three\build\three.module.js" (
  call npm.cmd install --ignore-scripts --no-audit --no-fund
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
start "" http://127.0.0.1:4173
node server.mjs
pause
