# DartsTools — Tournoi de fléchettes

Application pour organiser un tournoi de fléchettes au bar. On saisit les joueurs et les scores
sur un iPad (ou un téléphone), et un écran (TV, projecteur) affiche les matchs en cours sur chaque
machine, les joueurs à suivre, les classements, le tableau de la phase finale et le podium.

Elle tourne sur un simple ordinateur (Windows, Mac ou Linux) du réseau local : pas besoin
d'Internet ni de compte.

## Démarrage rapide

1. **Télécharger** : sur la page GitHub du projet, bouton vert **Code** → **Download ZIP**, puis
   décompresser le fichier (Windows : clic droit → **Extraire tout**).
2. **Installer Python 3** si ce n'est pas déjà fait : [python.org/downloads](https://www.python.org/downloads/).
   Sous Windows, cocher **Add python.exe to PATH** pendant l'installation.
3. **Lancer** : double-cliquer sur **Lancer le tournoi - Windows.bat** (ou
   **Lancer le tournoi - Mac.command** sur Mac). Une fenêtre affiche deux adresses, et l'écran du
   tournoi s'ouvre dans le navigateur : touche **F11** pour le plein écran sur la TV.
4. **Connecter l'iPad** : sur l'iPad, connecté au même Wi-Fi que l'ordinateur, ouvrir dans Safari
   l'adresse « Saisie » affichée dans la fenêtre (par exemple `http://192.168.1.20:8090`).

Laisser la fenêtre ouverte pendant tout le tournoi : la fermer arrête le serveur. Les scores sont
enregistrés à chaque saisie et retrouvés au lancement suivant.

### En cas de problème

- **Windows demande d'autoriser Python sur le réseau** : cliquer sur **Autoriser** (réseaux
  privés). Sinon, l'iPad ne pourra pas se connecter.
- **L'iPad n'ouvre pas la page** : vérifier qu'il est sur le même Wi-Fi que l'ordinateur, et que
  ce réseau est déclaré « privé » dans Windows (Paramètres → Réseau et Internet). Certains Wi-Fi
  publics ou « invités » empêchent les appareils de se voir.
- **Mac : « développeur non identifié »** : clic droit sur le fichier → **Ouvrir**, ou Réglages
  Système → Confidentialité et sécurité → **Ouvrir quand même**.
- **« Le port 8090 est déjà utilisé »** : le tournoi est déjà lancé dans une autre fenêtre.

## Déroulement du tournoi

| Phase | Jeu | Règle |
|---|---|---|
| Poules, 2 tours | 301 | Matchs à 4 joueurs dès 16 inscrits (sinon 1 contre 1). Points : 1er 3 · 2e 2 · 3e 1 · dernier 0. Exempt : 3 points. |
| Classement des poules | — | Points, puis goal average (total des points marqués sur les 2 tours = 301 − reste). Il sert **uniquement** de tête de série pour le tour suivant. |
| Tour éliminatoire | 301 | Tout le monde joue. Qualifiés (16 à 4 par machine, 8 au plus en 1 contre 1) : vainqueurs d'abord, puis 2e, puis 3e ; à place égale, le plus petit reste. Le classement affiché repart de zéro : 1er 3 · 2e 2 · 3e 1 · 4e 0, goal average du match. Le nombre d'éliminés (inscrits − qualifiés) est annoncé dès les inscriptions. S'il n'y en a aucun (16 joueurs à 4 par machine, 8 ou moins en 1 contre 1), le tour s'appelle « Poules · Tour 3 » et fixe seulement l'ordre de la qualification. |
| Qualification | 301 | 4 matchs ; à 4 par machine les 2 premiers passent, en 1 contre 1 le vainqueur. |
| Tour 501 | 501 | À 4 par machine : 2 groupes de 4, les 2 premiers de chaque groupe passent en demi-finale. En 1 contre 1, ce tour est directement la demi-finale. |
| Demi-finales (4 par machine) | 501 | Les 4 demi-finalistes sont classés (place dans le groupe, puis plus petit reste, puis rang de qualification) : 1er contre 4e, 2e contre 3e. |
| Finale et petite finale | Cricket | Vainqueurs des demi-finales en finale, perdants en petite finale. Le gagnant est désigné sur l'iPad. |

Les matchs alternent entre la machine 1 et la machine 2. Testé jusqu'à 45 joueurs
(46 matchs, 23 par machine). Sur l'écran, les modules s'agrandissent selon la phase (classement
pendant les poules et le tour éliminatoire, tableau de la phase finale ensuite), et un tour de la
phase finale n'est révélé qu'une fois tous ses matchs joués.

## Pour aller plus loin

### Lancer en ligne de commande

Depuis le dossier du dépôt :

```bash
python3 tournoi/server.py
```

(sous Windows : `python tournoi\server.py`). L'option `--ouvrir` ouvre l'écran dans le navigateur ;
la variable d'environnement `TOURNOI_PORT` change le port (8090 par défaut). L'iPad et l'écran se
synchronisent par le serveur (l'écran l'interroge chaque seconde). L'état est enregistré dans
`tournoi/state.json` (ignoré par git) à chaque saisie, avec un historique dans `tournoi/backups/`
(200 dernières sauvegardes, effacées par « Nouveau tournoi »).

### Installation en service (Linux avec systemd)

Pour un serveur qui démarre tout seul et se relance en cas d'arrêt, sur toute distribution
Linux avec `python3`, `systemd` et `curl` (Debian, Ubuntu…).

**Depuis le dépôt :**

```bash
git clone https://github.com/Kalslow/Dartstools.git ~/Dartstools
bash ~/Dartstools/deploy/install.sh
```

**Sans git sur le serveur** — construire l'installateur autonome sur le PC, puis le copier
(remplacer `utilisateur@serveur` par l'utilisateur et l'adresse du serveur) :

```bash
bash scripts/build-installer.sh
scp dist/install_tournoi.sh utilisateur@serveur:/tmp/
ssh -t utilisateur@serveur bash /tmp/install_tournoi.sh
```

L'installateur copie l'application dans `~/tournoi`, crée le service systemd `tournoi`
(démarrage automatique, relance en cas d'arrêt) et vérifie qu'il répond. Une mise à jour
se fait de la même façon : l'état du tournoi est conservé. Port différent :
`TOURNOI_PORT=8091 bash deploy/install.sh`. Le service est bridé pour ne pas gêner les autres
services de la machine (`Nice=15`, `CPUQuota=25%`, `MemoryMax=100M`, E/S en priorité `idle`).

Commandes utiles sur le serveur :

```bash
systemctl status tournoi
sudo journalctl -u tournoi -n 30
sudo systemctl restart tournoi
```

### Développement

Serveur en Python 3 standard (aucune dépendance), interface en HTML/CSS/JavaScript sans
framework.

```text
Lancer le tournoi - *  lanceurs à double-cliquer (Windows, Mac)
tournoi/            application, copiée telle quelle dans ~/tournoi par l'installateur
  server.py         serveur HTTP : pages, fichiers web/, API de l'état
  web/index.html    page unique (saisie ou écran selon l'URL)
  web/css/app.css
  web/js/logic.js   règles du tournoi (fonctions pures, testées)
  web/js/app.js     synchronisation avec le serveur et affichage
deploy/             installateur et modèle d'unité systemd
scripts/            installateur autonome
tests/              tests du serveur (Python) et des règles (Node)
```

Tests (lancés aussi par GitHub Actions à chaque push) :

```bash
python3 -m unittest discover -s tests -v
node --test tests/logic.test.js
```

### API

| Méthode | Chemin | Réponse |
|---|---|---|
| GET | `/`, `/saisie`, `/tv` | page de l'application |
| GET | `/api/version` | `{"version": "1.5.0"}` |
| GET | `/api/state?v=<n>` | `{"v", "state"}`, ou `{"v", "same": true}` si rien n'a changé depuis la version `n` |
| POST | `/api/state` | corps `{"base": <version lue>, "state": {...}}`, avec `"reset": true` pour un nouveau tournoi (efface les sauvegardes) → `{"v"}` ; `409` avec l'état actuel si un autre appareil a enregistré entre-temps |

## Limites

- Aucune authentification : toute personne sur le réseau local peut modifier le tournoi.
  À n'utiliser que sur un réseau de confiance.
- Un seul tournoi à la fois ; « Nouveau tournoi » repart de zéro et efface le tournoi précédent
  ainsi que ses sauvegardes (`backups/` ne garde que celles du tournoi en cours, 200 au plus).
