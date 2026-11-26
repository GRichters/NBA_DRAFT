@echo off
chcp 65001 >nul
title Draft 100 - Leilao NBA
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  O Node.js nao esta instalado neste computador.
  echo  Baixe a versao LTS em https://nodejs.org , instale e abra este arquivo de novo.
  echo.
  start https://nodejs.org
  pause
  exit /b
)

if not exist "node_modules\socket.io" (
  echo Instalando dependencias pela primeira vez...
  call npm install --omit=dev
)

echo.
echo  Se o Windows perguntar sobre o Firewall, clique em PERMITIR (redes privadas e publicas)
echo  para que seus amigos do Radmin consigam entrar.
echo.
node server.js
pause
