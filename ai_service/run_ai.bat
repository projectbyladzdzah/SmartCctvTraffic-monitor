@echo off
title AI Vehicle Counting Service - Batas Kota (CPU Mode)
echo ===============================================================
echo     AI Vehicle Counting Service - 4 CCTV Batas Kota
echo     Mode: CPU Ultra-Ringan (YOLOv8n + ByteTrack)
echo ===============================================================
echo.

cd /d "%~dp0"

echo [1/3] Memeriksa dependensi Python...
pip install -r requirements.txt --quiet

echo [2/3] Memulai AI Worker...
python main.py %*

pause
