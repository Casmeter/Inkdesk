@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Building inkdesk...
if not exist node_modules call npm install
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm run pack
if errorlevel 1 (
  echo Pack failed.
  pause
  exit /b 1
)
if not exist "release\inkdesk" mkdir "release\inkdesk"
xcopy /E /Y /Q "C:\Users\HP\motai-release\win-unpacked\*" "release\inkdesk\" >nul
if exist "release\墨台\data" if not exist "release\inkdesk\data" (
  xcopy /E /Y /Q "release\墨台\data\*" "release\inkdesk\data\" >nul
)
echo.
echo Done:
echo   %~dp0release\inkdesk\inkdesk.exe
pause
