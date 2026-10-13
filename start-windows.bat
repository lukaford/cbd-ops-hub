@echo off
rem Double-click to run the CBD Ops Hub on this computer, then open http://localhost:3000.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Installing it now; click Yes if Windows asks.
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo Couldn't install Node.js automatically. Install the LTS version from https://nodejs.org and run this again.
    pause
    exit /b 1
  )
  echo Node.js is installed. Close this window and double-click start-windows.bat again.
  pause
  exit /b 0
)

if not exist .env.local (
  echo Paste your JobTread grant key and press Enter. It is saved only in .env.local on this computer.
  set /p JTKEY=JobTread key: 
  call echo JOBTREAD_GRANT_KEY=%%JTKEY%%> .env.local
)

rem Put a "CBD Ops Hub" icon on the desktop that starts this file.
if not exist "%USERPROFILE%\Desktop\CBD Ops Hub.lnk" (
  powershell -NoProfile -Command "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut(\"$d\CBD Ops Hub.lnk\"); $s.TargetPath='%~f0'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%SystemRoot%\System32\imageres.dll,1'; $s.Save()" >nul 2>nul
)

if not exist node_modules (
  echo Installing, this takes a few minutes the first time...
  call npm install || (pause & exit /b 1)
)

if not exist .next\BUILD_ID (
  call npm run build || (pause & exit /b 1)
)

start "" http://localhost:3000
call npm run start
pause
