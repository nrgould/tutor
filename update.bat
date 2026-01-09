@echo off
REM Eigen Update Script for Windows
REM Run this to pull latest changes and start the app

echo ================================
echo   Eigen - Pulling Updates...
echo ================================

git pull origin main

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo WARNING: Git pull failed. You may have local changes.
    echo          Try: git stash ^&^& update.bat
    pause
    exit /b 1
)

echo.
echo ================================
echo   Installing Dependencies...
echo ================================

call npm install

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo WARNING: npm install failed. Check your Node.js installation.
    pause
    exit /b 1
)

echo.
echo ================================
echo   Starting Eigen...
echo ================================
echo.

call npm run tauri dev
