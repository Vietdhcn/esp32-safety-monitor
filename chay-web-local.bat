@echo off
title Web local - Tram giam sat an toan
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\chay-web-local.ps1"
echo.
echo Web local da dung. Neu co loi, xem tools\web-local.log.
pause
