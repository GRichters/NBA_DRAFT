@echo off
chcp 65001 >nul
title Gerar Draft100.exe
cd /d "%~dp0.."
where node >nul 2>nul || (echo Instale o Node.js 22 em https://nodejs.org && pause && exit /b)
if not exist "node_modules\socket.io" call npm install --omit=dev
cd build
if not exist "node_modules\esbuild" call npm install
node build-exe.js
pause
