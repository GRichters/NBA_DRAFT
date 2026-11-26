@echo off
chcp 65001 >nul
title Publicar versao nova do Draft 100
cd /d "%~dp0"
where node >nul 2>nul || (echo Instale o Node.js 22 em https://nodejs.org && pause && exit /b)
where git >nul 2>nul || (echo Instale o Git em https://git-scm.com && pause && exit /b)
if not exist "node_modules\socket.io" call npm install --omit=dev
echo.
echo  [1] Correcao pequena   (ex.: 1.5.1 vira 1.5.2)
echo  [2] Novidade           (ex.: 1.5.1 vira 1.6.0)
echo.
set /p tipo=Digite 1 ou 2 e aperte Enter:
if "%tipo%"=="2" (node scripts\publicar.js minor) else (node scripts\publicar.js patch)
pause
