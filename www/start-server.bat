@echo off
REM SPDX-License-Identifier: GPL-3.0-only
REM Local preview only. Production is nginx.
REM This used to launch src/server-main.js, which no longer exists; the batch
REM file kept pointing at it after the ZK auth server was retired.
echo ==========================================
echo FIBEMATE site preview (read-only)
echo ==========================================
echo.

node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed.
    exit /b 1
)

echo Open http://127.0.0.1:8080/ once the server prints its line.
echo.
node "%~dp0..\scripts\preview-site.cjs" --root "%~dp0."
pause
