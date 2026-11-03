"""Tests du serveur (Python standard) : python3 -m unittest discover -s tests"""
import json, os, shutil, sys, tempfile, threading, unittest, urllib.error, urllib.request
from http.server import ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tournoi"))
import server  # noqa: E402


class ServerTest(unittest.TestCase):
    def setUp(self):
        # État dans un dossier temporaire : jamais le state.json du dépôt ou du serveur
        self.tmp = tempfile.mkdtemp()
        server.STATE = os.path.join(self.tmp, "state.json")
        server.BACKUPS = os.path.join(self.tmp, "backups")
        server.data = server.load()
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.H)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        shutil.rmtree(self.tmp)

    def req(self, path, body=None):
        r = urllib.request.Request(self.base + path, headers={"Content-Type": "application/json"},
                                   data=None if body is None else json.dumps(body).encode())
        try:
            with urllib.request.urlopen(r) as resp:
                return resp.status, resp.headers.get("Content-Type"), resp.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers.get("Content-Type"), e.read()

    def test_pages(self):
        for path in ("/", "/saisie", "/tv"):
            st, ct, body = self.req(path)
            self.assertEqual(st, 200, path)
            self.assertTrue(ct.startswith("text/html"), ct)
            self.assertIn(b"/js/app.js", body)

    def test_fichiers_web(self):
        for path, ct in (("/css/app.css", "text/css"), ("/js/logic.js", "text/javascript"),
                         ("/js/app.js", "text/javascript")):
            st, t, _ = self.req(path)
            self.assertEqual(st, 200, path)
            self.assertTrue(t.startswith(ct), t)

    def test_rien_hors_de_web(self):
        for path in ("/js/../../server.py", "/css/../../state.json", "/js/absent.js", "/js/", "/server.py"):
            st, _, _ = self.req(path)
            self.assertEqual(st, 404, path)

    def test_version(self):
        st, _, body = self.req("/api/version")
        self.assertEqual((st, json.loads(body)), (200, {"version": server.VERSION}))

    def test_etat_versionne(self):
        st, _, body = self.req("/api/state?v=-1")
        self.assertEqual(json.loads(body), {"v": 0, "state": None})
        # Rien de changé depuis v=0 : réponse minuscule
        self.assertEqual(json.loads(self.req("/api/state?v=0")[2]), {"v": 0, "same": True})

        st, _, body = self.req("/api/state", {"base": 0, "state": {"players": ["A", "B"]}})
        self.assertEqual((st, json.loads(body)), (200, {"v": 1}))
        self.assertEqual(json.loads(self.req("/api/state?v=0")[2]),
                         {"v": 1, "state": {"players": ["A", "B"]}})

        # Enregistré sur disque, avec une sauvegarde
        with open(server.STATE, encoding="utf-8") as f:
            self.assertEqual(json.load(f)["v"], 1)
        self.assertEqual(len(os.listdir(server.BACKUPS)), 1)

    def test_conflit_entre_appareils(self):
        self.req("/api/state", {"base": 0, "state": {"players": ["A"]}})
        # Un 2e appareil encore en v0 : refusé, il reçoit l'état actuel
        st, _, body = self.req("/api/state", {"base": 0, "state": {"players": ["B"]}})
        self.assertEqual(st, 409)
        self.assertEqual(json.loads(body), {"v": 1, "state": {"players": ["A"]}})

    def test_requete_invalide(self):
        for body in ({"base": 0}, {"base": 0, "state": []}, {"base": 0, "state": "x"}):
            self.assertEqual(self.req("/api/state", body)[0], 400, body)
        self.assertEqual(self.req("/api/autre", {"base": 0, "state": {}})[0], 404)

    def test_nouveau_tournoi_efface_les_sauvegardes(self):
        self.req("/api/state", {"base": 0, "state": {"players": ["A", "B"]}})
        anciennes = [f"state-ancien-{k}.json" for k in range(5)]
        for nom in anciennes:
            open(os.path.join(server.BACKUPS, nom), "w").close()
        # Saisie ordinaire : les sauvegardes s'accumulent
        self.req("/api/state", {"base": 1, "state": {"players": ["A", "B", "C"]}})
        self.assertTrue(set(anciennes) <= set(os.listdir(server.BACKUPS)))
        # « Nouveau tournoi » : il ne reste que la sauvegarde du nouvel état
        st, _, body = self.req("/api/state", {"base": 2, "state": {"players": []}, "reset": True})
        self.assertEqual((st, json.loads(body)), (200, {"v": 3}))
        sauvegardes = os.listdir(server.BACKUPS)
        self.assertEqual(len(sauvegardes), 1)
        with open(os.path.join(server.BACKUPS, sauvegardes[0]), encoding="utf-8") as f:
            self.assertEqual(json.load(f), {"v": 3, "state": {"players": []}})

    def test_reprise_apres_redemarrage(self):
        self.req("/api/state", {"base": 0, "state": {"title": "Tournoi"}})
        self.assertEqual(server.load(), {"v": 1, "state": {"title": "Tournoi"}})


if __name__ == "__main__":
    unittest.main()
