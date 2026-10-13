@echo off
rem Double-click to run the CBD Ops Hub on this computer, then open http://localhost:3000.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)

if not exist .env.local (
  echo Paste your JobTread grant key and press Enter. It is saved only in .env.local on this computer.
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
