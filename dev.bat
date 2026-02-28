@echo off
chcp 65001 >nul
echo ========================================
echo   CRM Dev Mode
echo ========================================
echo.
echo Backend: http://localhost:3001
echo Frontend: http://localhost:3000
echo.

REM Start backend in new window
start "CRM Backend" cmd /k "cd /d C:\CRM\backend && node src/index.js"

REM Wait for backend to start
timeout /t 2 /nobreak > nul

REM Start frontend in new window
start "CRM Frontend" cmd /k "cd /d C:\CRM\frontend && npm run dev"

echo Both services started in new windows.
echo Press any key to close this window...
pause > nul
