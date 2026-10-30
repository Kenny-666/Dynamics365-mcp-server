@echo off
"%~dp0runtime\node\node.exe" "%~dp0launch.cjs"
exit /b %errorlevel%
