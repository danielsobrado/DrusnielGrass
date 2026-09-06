@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "NODE_SCRIPT=%SCRIPT_DIR%loc.mjs"
set "PS_SCRIPT=%SCRIPT_DIR%loc.ps1"

where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
    if exist "%NODE_SCRIPT%" (
        node "%NODE_SCRIPT%" %*
        exit /b %ERRORLEVEL%
    )
)

where powershell >nul 2>nul
if %ERRORLEVEL% equ 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" %*
    exit /b %ERRORLEVEL%
)

where pwsh >nul 2>nul
if %ERRORLEVEL% equ 0 (
    pwsh -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" %*
    exit /b %ERRORLEVEL%
)

echo Error: Neither Node.js nor PowerShell could be found to run the LOC counter. >&2
exit /b 1
