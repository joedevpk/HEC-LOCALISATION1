"""Vérification en NAVIGATEUR RÉEL (Chromium + WebGL) du VRAI composant CampusMap, sur ordinateur
et mobile, avec des styles de fond LOCAUX (aucun fournisseur de tuiles, aucune clé, aucun réseau).

  pip install playwright && playwright install chromium
  python3 scripts/browser-check/campusmap-integration.py

Vérifie : changement de mode (dont changements rapides) sans perte de l'itinéraire ni des lieux
publics ; style illisible → repli honnête (raison « style ») puis retour au mode normal ; mode non
configuré → refus avec message, fond actuel conservé ; taille des marqueurs ; pas de défilement
horizontal sur mobile. NE vérifie PAS : un vrai fournisseur (MapTiler…), le GPS, Supabase.
Données de test FICTIVES. Le banc d'essai (harness/) n'appartient pas à l'application."""
import os, subprocess, sys, time, urllib.request, json, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
PORT = 5199
BASE = f"http://localhost:{PORT}"
ST = "/scripts/browser-check/harness/styles"
ENV = {**os.environ,
       "VITE_SUPABASE_URL": "https://example.invalid", "VITE_SUPABASE_ANON_KEY": "test",
       "VITE_MAP_PROVIDER": "custom",
       "VITE_MAP_STYLE_URL_PLAN": f"{ST}/plan.json", "VITE_MAP_STYLE_URL_SATELLITE": f"{ST}/satellite.json",
       "VITE_MAP_STYLE_URL_TOPO": f"{ST}/topo.json",
       "VITE_MAP_STYLE_URL_DARK": f"{ST}/introuvable-dark.json",   # volontairement absent : panne de style
       # HYBRID volontairement NON configuré : mode indisponible chez ce « fournisseur »
       }
results = []
def check(name, ok, detail=""):
    results.append((name, bool(ok), detail)); print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""))

server = subprocess.Popen(["npx", "vite", "--port", str(PORT), "--strictPort"], cwd=ROOT, env=ENV,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(80):
        try: urllib.request.urlopen(BASE, timeout=1); break
        except Exception: time.sleep(0.5)
    else: print("Serveur Vite injoignable"); sys.exit(2)

    ROUTE = [[15.2995, -4.3005], [15.2998, -4.3000], [15.3005, -4.2995]]
    POIS = [{"id": "node/1", "source": "osm", "name": "Lieu test 1", "category": "pharmacy", "lng": 15.3001, "lat": -4.3001},
            {"id": "node/2", "source": "osm", "name": "Lieu test 2", "category": "restaurant", "lng": 15.2999, "lat": -4.2999}]
    HAS_BG = "id => !!window.__map && !!window.__map.getLayer(id)"
    STATE = """async () => { const m = window.__map;
      await new Promise(r => { const t = setTimeout(r, 4000); m.once('idle', () => { clearTimeout(t); r(); }); });
      return { route: !!m.getSource('route') && !!m.getLayer('route-line') && m.querySourceFeatures('route').length > 0,
               pois: !!m.getSource('external-pois') && !!m.getLayer('poi-unclustered') && new Set(m.querySourceFeatures('external-pois').map(f => f.properties.id)).size === 2,
               layers: m.getStyle().layers.map(l => l.id).filter(i => i.startsWith('bg') || i === 'base') }; }"""

    def run(label, ctx_kwargs):
        errors = []
        with sync_playwright() as p:
            b = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
            ctx = b.new_context(**ctx_kwargs); page = ctx.new_page()
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.route(lambda u: not u.startswith(BASE), lambda r: r.abort())
            page.goto(f"{BASE}/scripts/browser-check/harness/index.html")
            page.wait_for_function(HAS_BG, arg="bg-plan", timeout=30000)
            page.evaluate("([r, p]) => { window.__h.setRoute(r); window.__h.setPois(p); }", [ROUTE, POIS])
            time.sleep(1.0)
            s = page.evaluate(STATE)
            check(f"[{label}] carte chargée avec le fond du mode Plan, itinéraire et lieux publics présents", s["route"] and s["pois"] and "bg-plan" in s["layers"], str(s))

            # changements rapides de mode (plan → satellite → topo → plan → satellite → topo)
            page.evaluate("""() => new Promise(res => { const seq = ['satellite','topo','plan','satellite','topo']; let i = 0;
              const t = setInterval(() => { window.__h.setMode(seq[i++]); if (i >= seq.length) { clearInterval(t); res(); } }, 40); })""")
            page.wait_for_function(HAS_BG, arg="bg-topo", timeout=15000)
            s = page.evaluate(STATE)
            check(f"[{label}] après 5 changements rapides : bon fond final, itinéraire et lieux publics conservés",
                  s["route"] and s["pois"] and s["layers"] == ["bg-topo"], str(s))

            # style illisible (mode Sombre) → repli honnête
            n0 = len(page.evaluate("window.__events"))
            page.evaluate("window.__h.setMode('dark')")
            page.wait_for_function("() => window.__events.some(e => e.t === 'fallback' && e.on === true)", timeout=15000)
            ev = [e for e in page.evaluate("window.__events") if e["t"] == "fallback" and e["on"]][-1]
            check(f"[{label}] style Sombre introuvable → repli signalé avec la raison « style »", ev.get("reason") == "style", str(ev))
            page.wait_for_function(HAS_BG, arg="base", timeout=15000)
            t0 = time.time()
            page.wait_for_function("() => !!window.__map.getSource('external-pois') && !!window.__map.getLayer('poi-unclustered')", timeout=8000)
            dt = time.time() - t0
            check(f"[{label}] lieux publics restaurés rapidement sur le fond de secours ({dt:.2f} s, tuiles de secours en échec)", dt < 1.5, f"{dt:.2f}s")
            s = page.evaluate(STATE)
            check(f"[{label}] fond de secours affiché et couches métier restaurées", "base" in s["layers"] and s["route"] and s["pois"], str(s))
            page.evaluate("window.__h.setMode('plan')")
            page.wait_for_function(HAS_BG, arg="bg-plan", timeout=15000)
            off = [e for e in page.evaluate("window.__events") if e["t"] == "fallback" and not e["on"]]
            s = page.evaluate(STATE)
            check(f"[{label}] retour au mode Plan : secours levé, bon fond, couches conservées", bool(off) and s["layers"] == ["bg-plan"] and s["route"] and s["pois"], str(s))

            # mode non configuré (Hybride) → refus, fond conservé
            page.evaluate("window.__h.setMode('satellite')"); page.wait_for_function(HAS_BG, arg="bg-satellite", timeout=15000)
            page.evaluate("window.__h.setMode('hybrid')")
            page.wait_for_function("() => window.__events.some(e => e.t === 'rejected')", timeout=10000)
            rej = [e for e in page.evaluate("window.__events") if e["t"] == "rejected"][-1]
            time.sleep(0.8); s = page.evaluate(STATE)
            check(f"[{label}] mode Hybride non configuré → refusé avec message, mode réel = satellite, fond et couches conservés",
                  rej["applied"] == "satellite" and "VITE_MAP_STYLE_URL_HYBRID" in rej["msg"] and s["layers"] == ["bg-satellite"] and s["route"] and s["pois"], str(rej) + str(s))

            # marqueurs : taille bornée à zoom lointain et proche
            sizes = {}
            for z in (14, 19):
                page.evaluate(f"window.__map.jumpTo({{zoom: {z}, center: [15.3, -4.3]}})"); time.sleep(0.8)
                sizes[z] = page.evaluate("""() => [...document.querySelectorAll('.maplibregl-marker')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })""")
            allsz = [d for v in sizes.values() for d in v]
            vw = ctx_kwargs["viewport"]["width"]
            # Comportement voulu (classe hec-zoom-far) : à faible zoom la pastille se réduit à son
            # code ; à proche zoom elle affiche le nom, avec une largeur bornée.
            check(f"[{label}] marqueurs présents ; réduits à faible zoom, bornés à proche zoom ({sizes})",
                  len(allsz) >= 2 and all(w <= 48 and h <= 48 for w, h in sizes[14]) and all(w <= min(260, vw) and h <= 48 for w, h in sizes[19]), str(sizes))

            overflow = page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
            canvas = page.evaluate("() => { const c = document.querySelector('canvas.maplibregl-canvas').getBoundingClientRect(); return [Math.round(c.width), Math.round(c.height)]; }")
            check(f"[{label}] aucun défilement horizontal ; canevas = écran ({canvas})", overflow <= 0 and canvas[0] == vw, f"overflow={overflow}")
            check(f"[{label}] aucune exception JavaScript non gérée", not errors, "; ".join(errors)[:300])
            b.close()

    run("ordinateur 1280×800", {"viewport": {"width": 1280, "height": 800}})
    run("mobile 390×844 tactile", {"viewport": {"width": 390, "height": 844}, "device_scale_factor": 3, "is_mobile": True, "has_touch": True,
        "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"})
finally:
    server.terminate()
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} vérifications réussies")
sys.exit(1 if failed else 0)
