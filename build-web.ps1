# ====================================================================
#  前端编译脚本 (PowerShell)
#  功能：自动检测依赖、安装并构建 web/ 目录下的 React 前端项目
#  输出：web/build/ 目录（可直接由后端 Static 服务托管）
#  用法：在项目根目录执行 ./build-web.ps1
# ====================================================================

$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$WebDir = Join-Path $Root "web"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  前端编译脚本 - script-gateway" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# 检查 web 目录
if (-not (Test-Path $WebDir)) {
    Write-Host "[错误] 未找到前端目录: $WebDir" -ForegroundColor Red
    exit 1
}

Set-Location $WebDir

# 检查 Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[错误] 未检测到 Node.js，请先安装 Node.js (建议 v16+)" -ForegroundColor Red
    exit 1
}

# 检查 npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "[错误] 未检测到 npm" -ForegroundColor Red
    exit 1
}

Write-Host "[信息] Node 版本: $(node -v)" -ForegroundColor Gray
Write-Host "[信息] npm  版本: $(npm -v)" -ForegroundColor Gray
Write-Host ""

# 检查依赖是否已安装
if (-not (Test-Path "node_modules")) {
    Write-Host "[步骤 1/2] 安装依赖 (npm install)..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[错误] 依赖安装失败" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[步骤 1/2] 依赖已存在，跳过安装 (如需重装请先删除 web\node_modules)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[步骤 2/2] 开始构建 (npm run build)..." -ForegroundColor Yellow
Write-Host ""

npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[错误] 构建失败" -ForegroundColor Red
    exit 1
}

$BuildDir = Join-Path $WebDir "build"
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  构建成功！" -ForegroundColor Green
Write-Host "  产物目录: $BuildDir" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""

exit 0
