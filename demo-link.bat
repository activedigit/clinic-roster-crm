@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo   DEMO MODE - public link for showing the client
echo ============================================================
echo.
echo  Starting the local server in a separate window...
start "Roster Server (keep open)" cmd /k node server.js
timeout /t 3 >nul

echo.
echo  Your ADMIN TOKEN (you will need it):
echo.
node -e "try{console.log('     '+require('./data/db.json').adminToken)}catch(e){console.log('     (server is starting, token will be in the server window)')}"
echo.
echo ------------------------------------------------------------
echo  In a moment a public address will appear below, like:
echo      https://something-random.trycloudflare.com
echo.
echo  To open the manager dashboard, visit:
echo      https://something-random.trycloudflare.com/admin/YOUR-TOKEN
echo.
echo  The staff links shown there become public automatically -
echo  send them to the client / staff to try from any phone.
echo.
echo  KEEP THIS WINDOW AND THE SERVER WINDOW OPEN during the demo.
echo  To end the demo: close both windows.
echo ------------------------------------------------------------
echo.
echo  Creating the public link (first run downloads a small tool)...
echo.
npx -y cloudflared tunnel --url http://localhost:3000

echo.
echo  (Public link closed) - press any key to exit
pause >nul
