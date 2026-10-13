@echo off
rem Double-click to run the CBD Ops Hub on this computer, then open http://localhost:3000.
rem The first run copies the app to %LOCALAPPDATA%\CBD Ops Hub\app, outside OneDrive,
rem and points the desktop icon there. Running a newer download's copy updates it.
set "APP_HOME=%LOCALAPPDATA%\CBD Ops Hub\app"

if /i not "%~dp0"=="%APP_HOME%\" (
  echo Installing the app to %APP_HOME% ...
  robocopy "%~dp0." "%APP_HOME%" /E /XD node_modules .next .data /XF .env.local /NFL /NDL /NJH /NJS /NP >nul
  if errorlevel 8 (
    echo Couldn't copy the app to %APP_HOME%.
    pause
    exit /b 1
  )
  rem Force a rebuild so an update takes effect.
  if exist "%APP_HOME%\.next" rmdir /s /q "%APP_HOME%\.next"
  if exist "%~dp0.env.local" if not exist "%APP_HOME%\.env.local" copy "%~dp0.env.local" "%APP_HOME%\.env.local" >nul
  powershell -NoProfile -Command "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d 'CBD Ops Hub.lnk')); $s.TargetPath=(Join-Path $env:LOCALAPPDATA 'CBD Ops Hub\app\start-windows.bat'); $s.WorkingDirectory=(Join-Path $env:LOCALAPPDATA 'CBD Ops Hub\app'); $s.IconLocation=(Join-Path $env:SystemRoot 'System32\imageres.dll') + ',1'; $s.Save()" >nul 2>nul
  echo Installed. The CBD Ops Hub icon on your desktop now starts it from there.
  echo You can delete the downloaded folder.
  call "%APP_HOME%\start-windows.bat"
  exit /b
)

cd /d "%APP_HOME%"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Installing it now; click Yes if Windows asks.
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo Couldn't install Node.js automatically. Install the LTS version from https://nodejs.org and run this again.
    pause
    exit /b 1
  )
  echo Node.js is installed. Close this window and double-click the CBD Ops Hub icon on your desktop.
  pause
  exit /b 0
)

if not exist .env.local (
  echo Paste your JobTread grant key and press Enter. It is saved only on this computer.
  set /p JTKEY=JobTread key: 
  call echo JOBTREAD_GRANT_KEY=%%JTKEY%%> .env.local
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
