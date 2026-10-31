"""
Banc de test réel (Chromium + WebGL logiciel) pour HEC Localisation.
- Lance le vrai front (Vite) ; Supabase et le fond de carte sont SIMULÉS localement
  (aucun accès réseau externe nécessaire) ; MapLibre, le routage et l'UI sont les vrais.
- La présence de la ligne bleue est mesurée sur les PIXELS réellement rendus
  (capture d'écran), pas sur un état interne.
"""
import json, os, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

PROJECT = os.environ.get("HEC_PROJECT", os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
PORT = int(os.environ.get("HEC_PORT", "5199"))
BASE = f"http://localhost:{PORT}"
OUT = os.environ.get("HEC_SHOTS", os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots"))
os.makedirs(OUT, exist_ok=True)

C = dict(lng=15.3000, lat=-4.3800)
CAMPUS = {"id": "c1", "name": "HEC Test Campus", "tagline": "Banc de test", "city": "Kinshasa",
          "center_lng": 15.3004, "center_lat": -4.3802, "default_zoom": 17, "created_at": "2026-01-01"}
BUILDINGS = [
    {"id": "b1", "campus_id": "c1", "name": "Bloc A", "code": "A", "description": "", "category": "academic",
     "color": "#1e3a8a", "center_lng": 15.3000, "center_lat": -4.3800, "floor_count": 1, "archived_at": None},
    {"id": "b2", "campus_id": "c1", "name": "Bibliothèque", "code": "B", "description": "", "category": "library",
     "color": "#047857", "center_lng": 15.3008, "center_lat": -4.3804, "floor_count": 1, "archived_at": None},
]
def loc(id, name, lng, lat, b):
    return {"id": id, "building_id": b, "floor_id": None, "name": name, "code": id.upper(), "kind": "entrance",
            "category": "entrance", "description": "Point de test", "capacity": None, "lng": lng, "lat": lat,
            "is_accessible": True, "archived_at": None, "building": None, "floor": None}
LOCATIONS = [loc("loc-a", "Entrée Bloc A", 15.3000, -4.3800, "b1"),
             loc("loc-lib", "Entrée Bibliothèque", 15.3008, -4.3804, "b2")]
NODES = [{"id": f"n{i}", "campus_id": "c1", "lng": x, "lat": y, "type": "intersection", "label": None, "accessible": True, "archived_at": None}
         for i, (x, y) in enumerate([(15.3000, -4.3800), (15.3004, -4.3800), (15.3004, -4.3804), (15.3008, -4.3804)], 1)]
SEGS = [{"id": f"s{i}", "campus_id": "c1", "from_node": f"n{i}", "to_node": f"n{i+1}", "distance": 44.0,
         "accessible": True, "segment_type": "walkway", "archived_at": None} for i in range(1, 4)]
TABLES = {"campuses": [CAMPUS], "buildings": BUILDINGS, "locations": LOCATIONS, "route_nodes": NODES, "route_segments": SEGS}
STYLE = {"version": 8, "name": "test", "sources": {},
         "layers": [{"id": "bg", "type": "background", "paint": {"background-color": "#e8edf3"}}]}

def start_vite():
    env = dict(os.environ, VITE_SUPABASE_URL=BASE, VITE_SUPABASE_ANON_KEY="test-anon-key",
               VITE_MAP_PROVIDER="custom", VITE_MAP_STYLE_URL=f"{BASE}/__test/style.json")
    p = subprocess.Popen(["npx", "vite", "--port", str(PORT), "--strictPort", "--host", "127.0.0.1"],
                         cwd=PROJECT, env=env, stdout=open("/tmp/vite.log", "w"), stderr=subprocess.STDOUT)
    for _ in range(120):
        try:
            urllib.request.urlopen(BASE, timeout=1); return p
        except Exception: time.sleep(0.5)
    raise RuntimeError("vite n'a pas démarré")

def install_mocks(ctx):
    def rest(route):
        req = route.request
        table = req.url.split("/rest/v1/")[1].split("?")[0]
        rows = TABLES.get(table, [])
        accept = req.headers.get("accept", "")
        body = json.dumps(rows[0] if ("vnd.pgrst.object" in accept and rows) else rows)
        route.fulfill(status=200, content_type="application/json", body=body)
    ctx.route("**/rest/v1/**", rest)
    ctx.route("**/__test/style.json", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(STYLE)))
    ctx.route("**/auth/v1/**", lambda r: r.fulfill(status=200, content_type="application/json", body="{}"))
    ctx.route("**/storage/v1/**", lambda r: r.fulfill(status=404, body=""))
    # tout le reste hors localhost est bloqué (aucun réseau externe)
    ctx.route(lambda url: not url.startswith(BASE) and not url.startswith("data:") and not url.startswith("blob:"),
              lambda r: r.abort())

def blue_pixels(page, tag=None):
    """
    Mesure le tracé bleu (#1e5eff) sur les pixels RÉELS du canvas MapLibre.
    Toute l'UI est masquée pendant la capture (les boutons ont la même teinte).
    Retourne (total_rendu, visible_par_l_utilisateur) où 'visible' exclut les
    zones recouvertes par le panneau/feuille basse, la navigation basse et les barres du haut.
    """
    from PIL import Image
    import io
    rects = page.evaluate("""() => {
      const out = [];
      const sel = ['div[class*="z-30"][class*="bottom-0"]', 'nav.fixed', 'aside',
                   'div[class*="top-[max(0.75rem"]', 'div[class*="z-20"][class*="top-4"]'];
      for (const s of sel) document.querySelectorAll(s).forEach(e => {
        const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
        if (r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden')
          out.push([r.left, r.top, r.right, r.bottom]);
      });
      return out; }""")
    page.add_style_tag(content="*{visibility:hidden!important;transition:none!important;animation:none!important} canvas.maplibregl-canvas{visibility:visible!important}")
    page.wait_for_timeout(300)
    png = page.screenshot()
    page.evaluate("""() => document.querySelectorAll('style').forEach(s => { if (s.textContent.startsWith('*{visibility:hidden')) s.remove(); })""")
    im = Image.open(io.BytesIO(png)).convert("RGB")
    if tag: im.save(f"{OUT}/{tag}.png")
    dpr = page.evaluate("window.devicePixelRatio")
    px = im.load(); w, h = im.size; total = vis = 0
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if abs(r - 0x1e) < 28 and abs(g - 0x5e) < 28 and b > 215:
                total += 1
                cx, cy = x / dpr, y / dpr
                if not any(l <= cx <= rr and t <= cy <= bb for l, t, rr, bb in rects): vis += 1
    return total, vis

LAUNCH = dict(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"])
