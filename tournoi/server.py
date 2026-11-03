#!/usr/bin/env python3
"""Tournoi de fléchettes — serveur local (Python standard, aucune dépendance).
Sert la page de saisie (/) et l'écran projecteur (/tv) depuis web/, et garde l'état
du tournoi dans state.json (avec sauvegardes dans backups/)."""
import json, os, shutil, socket, sys, threading, time, webbrowser
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

VERSION = "1.5.0"
PORT = int(os.environ.get("TOURNOI_PORT", "8090"))
DIR = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(DIR, "state.json")
BACKUPS = os.path.join(DIR, "backups")
WEB = os.path.realpath(os.path.join(DIR, "web"))
INDEX = os.path.join(WEB, "index.html")
TYPES = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".js": "text/javascript; charset=utf-8"}
KEEP_BACKUPS = 200
lock = threading.Lock()


def load():
    try:
        with open(STATE, encoding="utf-8") as f:
            d = json.load(f)
            if isinstance(d, dict) and "v" in d and "state" in d:
                return d
    except Exception:
        pass
    return {"v": 0, "state": None}


data = load()


def save(d, reset=False):
    if reset:
        # Nouveau tournoi : les sauvegardes du tournoi précédent sont effacées
        shutil.rmtree(BACKUPS, ignore_errors=True)
    tmp = STATE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False)
        f.flush(); os.fsync(f.fileno())
    os.replace(tmp, STATE)
    os.makedirs(BACKUPS, exist_ok=True)
    shutil.copy(STATE, os.path.join(BACKUPS, time.strftime("state-%Y%m%d-%H%M%S.json")))
    files = sorted(os.listdir(BACKUPS))
    for old in files[:-KEEP_BACKUPS]:
        try: os.remove(os.path.join(BACKUPS, old))
        except OSError: pass


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype="application/json; charset=utf-8"):
        b = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def send_file(self, f):
        with open(f, "rb") as fh:
            return self.send(200, fh.read(), TYPES[os.path.splitext(f)[1]])

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/saisie", "/tv"):
            return self.send_file(INDEX)
        if path.startswith(("/css/", "/js/")):
            # Fichiers de web/ uniquement : tout chemin qui en sort (../) est refusé
            f = os.path.realpath(os.path.join(WEB, path.lstrip("/")))
            if f.startswith(WEB + os.sep) and os.path.isfile(f) and os.path.splitext(f)[1] in TYPES:
                return self.send_file(f)
            return self.send(404, {"error": "introuvable"})
        if path == "/api/state":
            q = self.path.split("?", 1)[1] if "?" in self.path else ""
            with lock:
                # Réponse minuscule quand rien n'a changé (l'écran interroge chaque seconde)
                if q == f"v={data['v']}":
                    return self.send(200, {"v": data["v"], "same": True})
                return self.send(200, data)
        if path == "/api/version":
            return self.send(200, {"version": VERSION})
        self.send(404, {"error": "introuvable"})

    def do_POST(self):
        if self.path.split("?")[0] != "/api/state":
            return self.send(404, {"error": "introuvable"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if n > 2_000_000:
                return self.send(413, {"error": "trop gros"})
            body = json.loads(self.rfile.read(n) or b"{}")
            base, state, reset = body.get("base"), body.get("state"), body.get("reset") is True
            if not isinstance(state, dict):
                raise ValueError
        except Exception:
            return self.send(400, {"error": "requête invalide"})
        global data
        with lock:
            if base != data["v"]:
                return self.send(409, data)
            data = {"v": data["v"] + 1, "state": state}
            save(data, reset)
            return self.send(200, {"v": data["v"]})


class Server(ThreadingHTTPServer):
    # Sous Windows, SO_REUSEADDR laisserait un 2e serveur écouter sur le même port sans erreur
    allow_reuse_address = os.name != "nt"


def local_ip():
    """Adresse de cette machine sur le réseau local (celle à taper sur l'iPad), ou None."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))   # UDP : aucun paquet envoyé, choisit juste l'interface
            ip = s.getsockname()[0]
        return None if ip.startswith("127.") or ip == "0.0.0.0" else ip
    except OSError:
        return None


if __name__ == "__main__":
    try:
        httpd = Server(("0.0.0.0", PORT), H)
    except OSError:
        print(f"Le port {PORT} est déjà utilisé : le tournoi est peut-être déjà lancé dans une autre fenêtre.",
              flush=True)
        sys.exit(1)
    url = f"http://{local_ip() or 'localhost'}:{PORT}"
    print(f"Tournoi de fléchettes {VERSION} — le serveur tourne. Ne fermez pas cette fenêtre pendant le tournoi.\n\n"
          f"  Saisie (iPad, téléphone) : {url}\n"
          f"  Écran (TV, projecteur)   : {url}/tv\n\n"
          "Les appareils doivent être connectés au même réseau (Wi-Fi) que cet ordinateur.", flush=True)
    if "--ouvrir" in sys.argv[1:]:
        threading.Thread(target=webbrowser.open, args=(f"http://localhost:{PORT}/tv",), daemon=True).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServeur arrêté.")
