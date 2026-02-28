@echo off
chcp 65001 >nul
echo ========================================
echo   CRM System Starting...
echo ========================================
echo.

REM Kill any process already using port 3001
echo Checking port 3001...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3001 "') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo Port 3001 cleared.
echo.

REM Build frontend
echo [1/2] Building frontend...
cd /d C:\CRM\frontend
call npm run build
if %errorlevel% neq 0 (
    echo Frontend build failed!
    pause
    exit /b 1
)

REM Start backend
echo.
echo [2/2] Starting server...
cd /d C:\CRM\backend
echo.
echo ========================================
echo  System started!
echo  Open browser: http://localhost:3001
echo ========================================
echo.
node src/index.js
