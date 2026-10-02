@echo off
rem Creates the Orbis shortcuts, with the Orbis icon, on the Desktop and in the Start menu.
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0criar-atalhos.ps1"
if errorlevel 1 (
  echo.
  echo Nao foi possivel criar os atalhos. Leia a mensagem acima.
) else (
  echo.
  echo Pronto: procure Orbis e Orbis Token na area de trabalho e no menu Iniciar.
)
pause
