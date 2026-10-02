@echo off
rem Shows the Orbis login token, creating it when there is none. Options: --novo  --sim  --sem-copiar  --ajuda
setlocal
chcp 65001 >nul
title Orbis - token de login
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao foi encontrado. Instale o Node.js 22.12 ou mais novo em https://nodejs.org e rode de novo.
  pause
  exit /b 1
)
node "%~dp0token.mjs" %*
echo.
pause
