#!/bin/bash
# Double-cliquer sur ce fichier pour lancer le tournoi sur un Mac (Python 3 requis).
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 n'est pas installé : téléchargez-le sur https://www.python.org/downloads/ puis relancez ce fichier."
  open "https://www.python.org/downloads/"
  exit 1
fi
python3 tournoi/server.py --ouvrir
