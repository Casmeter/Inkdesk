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
echo inkdesk.exe not found. Run 打包成EXE.bat first.
pause
