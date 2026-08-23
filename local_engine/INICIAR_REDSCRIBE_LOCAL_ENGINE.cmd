@echo off
setlocal
cd /d "%~dp0"
set "PATH=%~dp0tools;%PATH%"
set "PYTHONPATH=%~dp0app;%~dp0runtime\Lib\site-packages"
set "REDSCRIBE_WEB_URL=https://redscribe-studio-production.up.railway.app"
set "REDSCRIBE_LOCAL_PORT=8765"
set "REDSCRIBE_OPEN_WEB=1"

if not exist "%~dp0runtime\pythonw.exe" (
  echo Nao foi encontrado o runtime do RedScribe Local Engine.
  pause
  exit /b 1
)

start "RedScribe Local Engine" /min "%~dp0runtime\pythonw.exe" "%~dp0app\bridge_bootstrap.py"
exit /b 0
