@echo off
chcp 65001 >nul
cd /d "%~dp0"
node server.js
echo.
echo (Server stopped) - press any key to close
pause >nul
