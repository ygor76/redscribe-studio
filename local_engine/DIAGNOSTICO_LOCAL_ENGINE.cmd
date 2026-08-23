@echo off
setlocal
cd /d "%~dp0"
set "PATH=%~dp0tools;%PATH%"
set "PYTHONPATH=%~dp0app;%~dp0runtime\Lib\site-packages"
set "REDSCRIBE_WEB_URL=https://redscribe-studio-production.up.railway.app"
set "REDSCRIBE_LOCAL_PORT=8765"
set "REDSCRIBE_OPEN_WEB=0"

echo =============================================
echo RedScribe Local Engine - Diagnostico
echo =============================================
echo.
"%~dp0runtime\python.exe" "%~dp0app\bridge_bootstrap.py"
echo.
echo O engine foi encerrado. Verifique tambem:
echo %%LOCALAPPDATA%%\RedScribe\logs\local_engine.log
pause
