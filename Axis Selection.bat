@echo off
rem Starts the Axis Selection dev server and opens it in the default browser.
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"

netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul
if %errorlevel%==0 (
  start "" "http://localhost:5173"
  exit /b
)

if not exist node_modules call npm install
title Axis Selection - close this window to stop the server
call npm run dev -- --port 5173 --strictPort --open
