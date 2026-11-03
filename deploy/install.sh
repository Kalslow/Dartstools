#!/bin/bash
# Installe (ou met à jour) le tournoi de fléchettes sur un serveur Linux, en service
# systemd « tournoi » séparé des autres services de la machine.
# Usage, depuis le dépôt : bash deploy/install.sh   (sudo est demandé pour systemd)
# Variable optionnelle : TOURNOI_PORT (8090 par défaut).
# L'état du tournoi (state.json, backups/) est conservé lors d'une mise à jour.
set -euo pipefail
PORT="${TOURNOI_PORT:-8090}"
U="${SUDO_USER:-$(id -un)}"
DIR="/home/$U/tournoi"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "== Tournoi de fléchettes : installation dans $DIR (port $PORT)"
command -v python3 >/dev/null || { echo "python3 introuvable"; exit 1; }
[ -f "$SRC/tournoi/server.py" ] || { echo "Sources introuvables dans $SRC/tournoi"; exit 1; }
if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
  if ! systemctl is-active --quiet tournoi 2>/dev/null; then echo "Le port $PORT est déjà utilisé par autre chose. Arrêt."; exit 1; fi
fi

mkdir -p "$DIR"
rm -rf "$DIR/web"
rm -f "$DIR/app.html"                  # ancienne version (1.0.0) en un seul fichier
cp "$SRC/tournoi/server.py" "$DIR/"
cp -r "$SRC/tournoi/web" "$DIR/"
chown -R "$U:$U" "$DIR"

sed -e "s|@USER@|$U|g" -e "s|@DIR@|$DIR|g" -e "s|@PORT@|$PORT|g" "$SRC/deploy/tournoi.service" \
  | sudo tee /etc/systemd/system/tournoi.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable tournoi >/dev/null 2>&1
sudo systemctl restart tournoi
sleep 2
if curl -fs "http://localhost:$PORT/api/version" >/dev/null; then
  IP=$(hostname -I | awk '{print $1}')
  echo ""
  echo "OK — le tournoi tourne ($(curl -fs "http://localhost:$PORT/api/version"))."
  echo "  Saisie (iPad)    : http://$(hostname).local:$PORT   ou   http://$IP:$PORT"
  echo "  Écran (PC / TV)  : http://$(hostname).local:$PORT/tv   ou   http://$IP:$PORT/tv"
else
  echo "Le service ne répond pas. Logs : sudo journalctl -u tournoi -n 30"; exit 1
fi
