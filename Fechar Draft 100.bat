@echo off
title Fechar Draft 100
echo.
echo  Fechando todas as janelas do Draft 100...
taskkill /F /T /IM Draft100.exe >nul 2>nul
if errorlevel 1 (
  echo  Nenhum Draft 100 estava aberto.
) else (
  echo  Pronto: o Draft 100 foi fechado.
)
del /F /Q "%LOCALAPPDATA%\Draft100\Draft100.exe.antigo" >nul 2>nul
echo.
echo  Agora abra o Draft100.exe de novo para instalar ou atualizar.
echo.
pause
