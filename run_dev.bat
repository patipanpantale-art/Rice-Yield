@echo off
chcp 65001 >nul
title Rice Yield Sandbox - Local Dev Launcher
echo ======================================================================
echo    โปรแกรมจำลองพื้นที่เพาะปลูกเสมือนจริงเชิงแผนที่ เพื่อการวิเคราะห์ผลผลิตข้าว
echo    Interactive Map-Based Sandbox Simulator for Rice Yield Analytics
echo ======================================================================
echo.

set SCRIPT_DIR=%~dp0
set PYTHON_PATH=D:\All\pyt\python.exe

if not exist "%PYTHON_PATH%" (
    set PYTHON_PATH=python
)

echo [1/4] ตรวจสอบและเคลียร์ Port 8000 / 3000 ที่อาจค้างอยู่...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

echo [2/4] กำลังเปิด Backend API Server (FastAPI) ที่ Port 8000...
start "Rice Backend API (Port 8000)" cmd /k "chcp 65001 >nul && cd /d "%SCRIPT_DIR%backend" && "%PYTHON_PATH%" -m uvicorn main:app --reload --port 8000"

echo [3/4] กำลังเปิด Frontend Web Server ที่ Port 3000...
start "Rice Frontend (Port 3000)" cmd /k "chcp 65001 >nul && cd /d "%SCRIPT_DIR%frontend" && "%PYTHON_PATH%" -m http.server 3000"

echo [4/4] รอระบบเริ่มต้น 2 วินาที แล้วเปิดหน้าเว็บเบราว์เซอร์...
timeout /t 2 /nobreak >nul
start http://localhost:3000

echo.
echo ======================================================================
echo   ระบบพร้อมใช้งานแล้ว!
echo   - Frontend Web App: http://localhost:3000
echo   - Backend API Docs: http://localhost:8000/docs
echo.
echo   * หากต้องการหยุดระบบ ให้ปิดหน้าต่างของ Backend และ Frontend ที่เด้งขึ้นมา
echo   * หรือดับเบิลคลิกไฟล์ stop_dev.bat เพื่อปิดอัตโนมัติ
echo ======================================================================
echo.
pause
