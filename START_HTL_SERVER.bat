@echo off
title Hi-Tech Lab Central Incident Server
echo ====================================================
echo Starting Thiruvarur Hi-Tech Lab Incident Server...
echo ====================================================

cd /d "%~dp0"
start /B node server.js
timeout /t 3 >nul
start /B npx --yes cloudflared tunnel --url http://localhost:10000

echo.
echo ====================================================
echo Server is running in the background!
echo Opening Engineer Workbench in Chrome...
echo ====================================================
timeout /t 2 >nul
start http://localhost:10000/engineer
