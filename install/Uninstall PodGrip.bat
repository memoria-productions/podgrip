@echo off
rem Double-click to remove PodGrip from Adobe Premiere Pro.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Uninstall
pause
