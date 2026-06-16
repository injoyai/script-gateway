@echo off
chcp 65001 >nul

set "ROOT=%~dp0"
set "WEB_DIR=%ROOT%web"

echo.
echo ================================================
echo   Run Frontend Dev Server - script-gateway
echo ================================================
echo.

if not exist "%WEB_DIR%\package.json" goto :no_web

pushd "%WEB_DIR%"

echo [INFO] Node:
call node -v
echo [INFO] npm:
call npm -v
echo.

if not exist "node_modules" goto :install
echo [1/2] Dependencies already installed
goto :run

:install
echo [1/2] Installing dependencies...
call npm install
if errorlevel 1 goto :install_fail

:run
echo.
echo [2/2] Starting dev server (proxy backend: http://localhost:8080)...
echo        Open: http://localhost:3000
echo.

call npm start
popd
exit /b 0

:install_fail
echo [ERROR] npm install failed
popd
exit /b 1

:no_web
echo [ERROR] Web directory not found: %WEB_DIR%
exit /b 1
