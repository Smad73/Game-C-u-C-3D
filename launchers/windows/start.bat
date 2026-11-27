@echo off
rem NOVA FISHING LIVE 3D - khoi chay tren Windows (bam dup). Chi la vo mong: moi logic nam trong server.js.
rem Noi dung chi dung ky tu ASCII vi cmd.exe xu ly UTF-8 khong on dinh.
cd /d "%~dp0..\.."
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Tai ban LTS 22.13 tro len tai https://nodejs.org roi bam dup lai tep nay.
  pause
  exit /b 1
)
node server.js
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
  echo.
  echo Game da dung voi ma %EXITCODE% - 0 la tat an toan, 3 la tat nhung chua chac da luu du, 2 la loi cau hinh.
  pause
)
exit /b %EXITCODE%
