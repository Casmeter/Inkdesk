@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "release\inkdesk\inkdesk.exe" (
  start "" "%~dp0release\inkdesk\inkdesk.exe"
  exit /b 0
)
if exist "release\墨台\墨台.exe" (
  start "" "%~dp0release\墨台\墨台.exe"
  exit /b 0
)
echo Desktop build not found, starting in dev mode...
if not exist node_modules (
  echo First run, installing...
  call npm install
  if errorlevel 1 (
    echo Install Node.js first: https://nodejs.org
    pause
    exit /b 1
  )
)
call npm run electron
if errorlevel 1 pause
