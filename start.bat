@echo off
chcp 65001 >nul
cd /d "%~dp0"
title MovexGo Market API

where node >nul 2>nul || (echo [XATO] Node.js topilmadi. https://nodejs.org dan 22+ versiyani o'rnating. & pause & exit /b 1)

netstat -ano | findstr /r /c:":4700 .*LISTENING" >nul && (
  echo Server allaqachon ishlayapti: http://localhost:4700/
  start "" http://localhost:4700/
  pause
  exit /b 0
)

if not exist node_modules (
  echo Kutubxonalar o'rnatilmoqda...
  call npm install --no-audit --no-fund || (echo [XATO] npm install muvaffaqiyatsiz. & pause & exit /b 1)
)
if not exist data\movexgo.db (
  echo Demo baza yaratilmoqda...
  call npm run seed || (echo [XATO] seed muvaffaqiyatsiz. & pause & exit /b 1)
)

start "" cmd /c "timeout /t 2 >nul & start "" http://localhost:4700/"
call npm start
pause