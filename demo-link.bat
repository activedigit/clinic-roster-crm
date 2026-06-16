@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo   DEMO MODE - public link to send your client
echo ============================================================
echo.
echo  Starting the local server in a separate window...
start "Roster Server (keep open)" cmd /k node server.js
timeout /t 3 >nul

echo.
echo  Creating the public link and full ready-to-send addresses...
echo.
node --no-deprecation share.js

echo.
echo  (Public link closed) - press any key to exit
pause >nul
