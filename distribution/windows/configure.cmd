@echo off
if not exist "%~dp0.env" (
  copy "%~dp0.env.example" "%~dp0.env" >nul
  if errorlevel 1 exit /b 1
)
notepad.exe "%~dp0.env"
