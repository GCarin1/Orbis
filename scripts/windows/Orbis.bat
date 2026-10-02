@echo off
rem Starts Orbis, or restarts it when it is already running. Options: --rapido  --instalar  --sem-navegador  --ajuda
setlocal
chcp 65001 >nul
title Orbis
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao foi encontrado. Instale o Node.js 22.12 ou mais novo em https://nodejs.org e rode de novo.
  pause
  exit /b 1
)
node "%~dp0orbis-launcher.mjs" %*
set "CODE=%ERRORLEVEL%"
if not "%CODE%"=="0" (
  echo.
  echo O Orbis terminou com erro, codigo %CODE%. Leia as mensagens acima.
  pause
)
exit /b %CODE%
