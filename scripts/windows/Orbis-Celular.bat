@echo off
rem Starts Orbis for the Android app: it takes connections from the network (ORBIS_HOST=0.0.0.0)
rem and shows the address to type on the phone. Same options as Orbis.bat.
call "%~dp0Orbis.bat" --celular %*