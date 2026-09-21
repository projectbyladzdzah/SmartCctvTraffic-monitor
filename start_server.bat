@echo off
chcp 65001 >nul
title Server Pemantauan CCTV Surakarta
cls
echo.
echo  ==============================================================
echo        MEMULAI SERVER CCTV MONITORING SYSTEM (PORT 5000)
echo  ==============================================================
echo.
echo  [*] Menghubungkan ke Node.js runtime...
cd /d "%~dp0\backend"
node server.js
pause
