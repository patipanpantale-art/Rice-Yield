@echo off
chcp 65001 >nul
title Stop Rice Sandbox Servers
echo ======================================================================
echo   กำลังปิดการทำงานของเซิร์ฟเวอร์ Rice Sandbox (Port 8000 และ 3000)...
echo ======================================================================

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo.
echo เรียบร้อย! เซิร์ฟเวอร์ทั้งหมดหยุดทำงานแล้ว
timeout /t 2 >nul
