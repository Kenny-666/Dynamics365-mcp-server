@echo off
setlocal
"%~dp0runtime\node\node.exe" "%~dp0client-config.cjs"
set "D365_CONFIG_EXIT=%errorlevel%"
if /I not "%~1"=="--no-pause" pause
exit /b %D365_CONFIG_EXIT%
