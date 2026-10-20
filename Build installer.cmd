@echo off
title Build ArchipelagoVic installer
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is needed. Install Node.js LTS from https://nodejs.org and run this again. & pause & exit /b 1)
if not exist node_modules\electron\package.json call npm install || (echo npm install failed. & pause & exit /b 1)
echo Building the installer and the portable exe. This takes a few minutes the first time.
call npm run dist
if errorlevel 1 (echo. & echo The build failed. Scroll up for the reason. & pause & exit /b 1)
echo. & echo Done. Opening the dist folder.
start "" "%~dp0dist"
pause
