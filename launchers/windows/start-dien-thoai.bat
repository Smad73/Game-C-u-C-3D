@echo off
rem NOVA FISHING LIVE 3D - che do DIEN THOAI (LAN) tren Windows. Hoi mat khau Admin (khong hien khi go) roi chay.
rem Luu y: ket noi LAN hien la HTTP, KHONG ma hoa - chi dung tren mang nha tin cay (xem docs/ADR/0020, 0023).
cd /d "%~dp0..\.."
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Tai ban LTS 22.13 tro len tai https://nodejs.org roi bam dup lai tep nay.
  pause
  exit /b 1
)
set "NOVA_MODE=lan"
node server.js
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
  echo.
  echo Game da dung voi ma %EXITCODE% - 0 la tat an toan, 3 la tat nhung chua chac da luu du, 2 la loi cau hinh.
  pause
)
exit /b %EXITCODE%
