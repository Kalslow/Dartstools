@echo off
chcp 65001 >nul
rem Double-cliquer sur ce fichier pour lancer le tournoi sur un PC Windows (Python 3 requis).
title Tournoi de fléchettes
cd /d "%~dp0"

set "PY="
py -3 --version >nul 2>&1 && set "PY=py -3"
if not defined PY (python --version >nul 2>&1 && set "PY=python")
if not defined PY goto :sans_python

%PY% tournoi\server.py --ouvrir
echo.
pause
exit /b

:sans_python
echo Python 3 n'est pas installé sur cet ordinateur.
echo.
echo   1. Téléchargez-le sur https://www.python.org/downloads/ (la page va s'ouvrir).
echo   2. Pendant l'installation, cochez la case "Add python.exe to PATH".
echo   3. Double-cliquez à nouveau sur ce fichier.
echo.
start "" https://www.python.org/downloads/
pause
exit /b 1
