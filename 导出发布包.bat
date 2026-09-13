@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "SRC=%~dp0release\inkdesk"
set "OUT=%~dp0release\inkdesk-publish"
set "DST=%OUT%\inkdesk"
set "ZIP=%~dp0release\inkdesk-1.0.0.zip"
set "SEVENZ=%~dp0release\inkdesk-1.0.0.7z"
set "SFXOUT=%~dp0release\inkdesk-发送用.exe"
set "SEVEN=C:\Program Files\7-Zip\7z.exe"
set "SFX=C:\Program Files\7-Zip\7z.sfx"

if not exist "%SRC%\inkdesk.exe" (
  echo inkdesk.exe not found. Run 打包成EXE.bat first.
  pause
  exit /b 1
)

echo Making a publish zip without your drafts...
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%DST%"
robocopy "%SRC%" "%DST%" /E /XD data /NFL /NDL /NJH /NJS /nc /ns /np
if errorlevel 8 (
  echo Copy failed.
  pause
  exit /b 1
)
if exist "%ZIP%" del /f "%ZIP%"
if exist "%SEVEN%" (
  "%SEVEN%" a -tzip -mx=9 -mfb=258 "%ZIP%" "%DST%" >nul
  "%SEVEN%" a -t7z -mx=9 -m0=lzma2 -md=32m "%SEVENZ%" "%DST%" >nul
  if exist "%SFX%" (
    if exist "%SFXOUT%" del /f "%SFXOUT%"
    copy /b "%SFX%" + "%SEVENZ%" "%SFXOUT%" >nul
  )
) else (
  powershell -NoProfile -Command "Compress-Archive -LiteralPath '%DST%' -DestinationPath '%ZIP%' -CompressionLevel Optimal"
)
if errorlevel 1 (
  echo Zip failed. Folder is still here:
  echo   %DST%
  pause
  exit /b 1
)

echo.
echo Send this self-extracting exe (about 76MB):
echo   %SFXOUT%
echo Or the 7z:
echo   %SEVENZ%
echo Or this zip:
echo   %ZIP%
echo.
echo Recipients unzip the inkdesk folder and run inkdesk.exe.
echo Your drafts stay in:
echo   %SRC%\data
pause
