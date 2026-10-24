"""Vérification en NAVIGATEUR RÉEL (Chromium + WebGL) du comportement de MapLibre lors d'un
changement de style, avec des styles LOCAUX (aucun fournisseur externe, aucune clé).

  pip install playwright && playwright install chromium
  python3 scripts/browser-check/maplibre-style-switch.py

Établit : (1) setStyle par défaut (diff) retire les sources de l'application sans 'style.load' ;
(2) diff:false émet 'style.load' ; (3) un style.json introuvable émet une erreur SANS sourceId et,
en mode diff, laisse l'ANCIEN fond affiché ; (4) un nouveau style se charge après un échec.
Ce script teste MapLibre, pas votre application ni un fournisseur de tuiles."""
import http.server, json, pathlib, shutil, socketserver, tempfile, threading
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parents[2]
dist = root / "node_modules" / "maplibre-gl" / "dist"
tmp = pathlib.Path(tempfile.mkdtemp())
for f in ("maplibre-gl.js", "maplibre-gl.css"):
    shutil.copy(dist / f, tmp / f)
def style(layer_id, color):
    return json.dumps({"version": 8, "sources": {}, "layers": [{"id": layer_id, "type": "background", "paint": {"background-color": color}}]})
(tmp / "a.json").write_text(style("bg", "#ff0000"))
(tmp / "b.json").write_text(style("bg2", "#0000ff"))
(tmp / "index.html").write_text('<link rel="stylesheet" href="maplibre-gl.css"><div id="m" style="width:400px;height:300px"></div><script src="maplibre-gl.js"></script>')

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(tmp), **k)
    def log_message(self, *a): pass
srv = socketserver.TCPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

JS = """
async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const map = new maplibregl.Map({container:'m', style:'/a.json', center:[0,0], zoom:1, fadeDuration:0});
  await new Promise(r => map.on('load', r));
  const addRoute = () => { if(!map.getSource('route')){ map.addSource('route',{type:'geojson',data:{type:'FeatureCollection',features:[]}}); map.addLayer({id:'route-line',type:'line',source:'route'});} };
  addRoute(); const out = {};
  let sl = false; const onSL = () => { sl = true; }; map.on('style.load', onSL);
  map.setStyle('/b.json'); await wait(1500);
  out.diff_default = { styleLoadFired: sl, appSourceSurvives: !!map.getSource('route') };
  addRoute(); sl = false;
  map.setStyle('/a.json', {diff:false}); await wait(1500);
  out.diff_false = { styleLoadFired: sl };
  map.off('style.load', onSL);
  const errs = []; map.on('error', (e) => errs.push({ sourceId: e.sourceId ?? null, status: e.error && e.error.status }));
  map.setStyle('/missing.json'); await wait(1200);
  out.missing_style_diff = { errors: errs.slice(), oldStyleStillDisplayed: !!map.getLayer('bg') };
  map.setStyle('/missing2.json', {diff:false}); await wait(1200);
  sl = false; map.on('style.load', () => { sl = true; });
  map.setStyle('/b.json', {diff:false}); await wait(1500);
  out.recovers_after_failure = sl && !!map.getLayer('bg2');
  return out;
}
"""
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
    pg = b.new_page(); pg.goto(f"http://127.0.0.1:{srv.server_address[1]}/index.html")
    res = pg.evaluate(JS); print(json.dumps(res, indent=1)); b.close()
srv.shutdown()
ok = (not res["diff_default"]["styleLoadFired"] and not res["diff_default"]["appSourceSurvives"] and res["diff_false"]["styleLoadFired"]
      and res["missing_style_diff"]["errors"] and res["missing_style_diff"]["errors"][0]["sourceId"] is None
      and res["missing_style_diff"]["oldStyleStillDisplayed"] and res["recovers_after_failure"])
print("RÉSULTAT :", "comportement confirmé" if ok else "DIFFÉRENT de l'attendu : réexaminer CampusMap")
raise SystemExit(0 if ok else 1)
