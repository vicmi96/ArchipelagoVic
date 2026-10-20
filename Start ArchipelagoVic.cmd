@echo off
setlocal
rem Starts ArchipelagoVic. The first run downloads Electron, about a minute.
cd /d "%~dp0"
title ArchipelagoVic
set "EXE=node_modules\electron\dist\electron.exe"
if exist "%EXE%" goto run

where node >nul 2>nul
if errorlevel 1 goto nonode

if exist "node_modules\electron\package.json" goto download
echo First run: installing Electron. This takes a minute...
call npm install --no-audit --no-fund
if errorlevel 1 goto failed

:download
if exist "%EXE%" goto run
rem npm sometimes installs the electron package without running its download step.
rem Run that step directly so the actual program files arrive.
echo Downloading the Electron program files...
node "node_modules\electron\install.js"
if not exist "%EXE%" goto failed

:run
start "" "%EXE%" .
exit /b 0

:nonode
echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this file again.
pause
exit /b 1

:failed
echo.
echo ArchipelagoVic could not download Electron.
echo  - Check your internet connection, then run this file again.
echo  - Antivirus can block the download. Allow it, then run this file again.
for /f "delims=" %%v in ('npm config get ignore-scripts 2^>nul') do if /i "%%v"=="true" echo  - npm is set to skip install scripts: ignore-scripts=true. That stops Electron's download. This file works around it, so check the messages above.
pause
exit /b 1
