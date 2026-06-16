@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"
set "WEB_DIR=%ROOT%web"

echo.
echo ================================================
echo   Build Frontend - script-gateway
echo ================================================
echo.

if not exist "%WEB_DIR%" (
    echo [ERROR] Web directory not found: %WEB_DIR%
    exit /b 1
)

cd /d "%WEB_DIR%"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found, please install Node.js v16+
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm not found
    exit /b 1
)

echo [INFO] Node:
node -v
echo [INFO] npm:
npm -v
echo.

if not exist "node_modules" (
    echo [1/2] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed
        exit /b 1
    )
) else (
    echo [1/2] Dependencies already installed
)

echo.
echo [2/2] Building...
echo.

call npm run build
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed
    exit /b 1
)

echo.
echo ================================================
echo   Build success!
echo   Output: %WEB_DIR%\build
echo ================================================
echo.

endlocal
exit /b 0
