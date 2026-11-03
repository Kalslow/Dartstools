#!/bin/bash
# Construit dist/install_tournoi.sh : un seul fichier autonome (application + installateur),
# à copier sur le serveur Linux quand on n'y clone pas le dépôt.
#   bash scripts/build-installer.sh
#   scp dist/install_tournoi.sh utilisateur@serveur:/tmp/ && ssh -t utilisateur@serveur bash /tmp/install_tournoi.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION=$(sed -n 's/^VERSION = "\(.*\)"/\1/p' "$ROOT/tournoi/server.py")
OUT="$ROOT/dist/install_tournoi.sh"
mkdir -p "$ROOT/dist"
{
  cat <<HEADER
#!/bin/bash
# Tournoi de fléchettes v$VERSION — installateur autonome.
# Généré par scripts/build-installer.sh depuis le dépôt DartsTools : ne pas modifier à la main.
# Usage : bash install_tournoi.sh
set -euo pipefail
TMP=\$(mktemp -d); trap 'rm -rf "\$TMP"' EXIT
sed '1,/^__PAYLOAD__\$/d' "\$0" | base64 -d | tar -xz -C "\$TMP"
bash "\$TMP/deploy/install.sh"
exit
__PAYLOAD__
HEADER
  tar -C "$ROOT" -cz --exclude='__pycache__' tournoi deploy | base64 -w 76
} > "$OUT"
chmod +x "$OUT"
echo "$OUT (v$VERSION, $(wc -c < "$OUT") octets)"
