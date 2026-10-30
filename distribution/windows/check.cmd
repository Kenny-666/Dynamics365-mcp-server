@echo off
setlocal
"%~dp0runtime\node\node.exe" "%~dp0diagnose.cjs"
set "D365_CHECK_EXIT=%errorlevel%"
if /I not "%~1"=="--no-pause" pause
exit /b %D365_CHECK_EXIT%
