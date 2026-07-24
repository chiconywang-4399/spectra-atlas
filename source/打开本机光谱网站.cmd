@echo off
chcp 65001 >nul
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0打开本机光谱网站.ps1"
if errorlevel 1 pause
