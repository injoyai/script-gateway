@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "WEB_DIR=%ROOT%\web"
set "BACKEND_PORT=8200"

echo.
echo ================================================
echo   script-gateway 一键启动（开发模式）
echo   后端 Go  +  前端 CRA dev server
echo ================================================
echo.

REM ---- 环境检查 ----
where go >nul 2>nul
if errorlevel 1 (
    echo [ERROR] 未检测到 Go，请先安装 Go 1.25+ 并加入 PATH
    pause
    exit /b 1
)

if not exist "%WEB_DIR%\package.json" (
    echo [ERROR] 未找到前端目录: %WEB_DIR%
    pause
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] 未检测到 Node.js，请先安装 Node.js 16+ 并加入 PATH
    pause
    exit /b 1
)

REM ---- 前端依赖 ----
if not exist "%WEB_DIR%\node_modules" (
    echo [INFO] 首次运行，安装前端依赖（npm install）...
    pushd "%WEB_DIR%"
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install 失败
        popd
        pause
        exit /b 1
    )
    popd
    echo.
)

REM ---- 启动后端 ----
echo [INFO] 启动后端: go run main.go （端口 %BACKEND_PORT%，首次编译稍慢）
start "script-gateway backend" /D "%ROOT%" cmd /k "chcp 65001 >nul && go run main.go"

REM ---- 启动前端 ----
echo [INFO] 启动前端: npm start （端口 3000，/api 代理到 %BACKEND_PORT%）
start "script-gateway frontend" /D "%WEB_DIR%" cmd /k "chcp 65001 >nul && npm start"

echo.
echo ================================================
echo   已启动，请等待两端就绪：
echo   前端:  http://localhost:3000
echo   后端:  http://localhost:%BACKEND_PORT%
echo   前端已通过 proxy 将 /api 请求转发到后端
echo ================================================
echo.
echo 注意: 后端依赖 MySQL（见 config/config.yaml），请确保数据库已启动。
echo 停止: 关闭对应窗口即可。
echo.
endlocal
exit /b 0
