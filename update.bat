@echo off
title Update CCTV Monitor dari GitHub
cd /d "%~dp0"
echo ===================================================
echo 1. Mengambil update terbaru dari GitHub...
echo ===================================================
git pull origin main

echo ===================================================
echo 2. Memperbarui dependencies jika ada...
echo ===================================================
call npm install
cd backend
call npm install
cd ..

echo ===================================================
echo 3. Membangun ulang frontend...
echo ===================================================
call npm run build

echo ===================================================
echo Update selesai! Silakan restart start_server.bat
echo ===================================================
pause
