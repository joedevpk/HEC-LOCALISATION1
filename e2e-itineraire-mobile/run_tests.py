from harness import *
import json, sys

RESULTS = []
def check(profile, name, ok, detail=""):
    RESULTS.append(dict(profile=profile, test=name, ok=bool(ok), detail=detail))
    print(f"  [{'OK ' if ok else 'ÉCHEC'}] {name}  {detail}")

def geometry(page):
    return page.evaluate("""() => {
      const c = document.querySelector('canvas.maplibregl-canvas');
      const m = c.closest('.maplibregl-map');
      const cr = c.getBoundingClientRect(), mr = m.getBoundingClientRect();
      const nav = [...document.querySelectorAll('nav.fixed')].find(n => getComputedStyle(n).display !== 'none');
      const sheet = [...document.querySelectorAll('[data-sheet-state]')].find(e => getComputedStyle(e).display !== 'none');
      return {
        canvasOk: Math.abs(cr.width - mr.width) < 1.5 && Math.abs(cr.height - mr.height) < 1.5 && cr.width > 100,
        canvasBuf: [c.width, c.height], box: [Math.round(cr.width), Math.round(cr.height)],
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        sheetBottom: sheet ? sheet.getBoundingClientRect().bottom : null,
        navTop: nav ? nav.getBoundingClientRect().top : null,
        sameCanvas: c.__mark === 'initial',
      }; }""")

def px(page, profile, label, tag=None, expect=True):
    total, vis = blue_pixels(page, tag=tag)
    check(profile, f"{label} : ligne bleue {'visible' if expect else 'absente'}",
          (total > 300 and vis > 300) if expect else total == 0, f"(rendu={total}px, visible utilisateur={vis}px)")
    return total, vis

def geo_ok(page, profile, label):
    g = geometry(page)
    check(profile, f"{label} : canvas = conteneur, même instance de carte", g["canvasOk"] and g["sameCanvas"], f"{g['box']}")
    check(profile, f"{label} : aucun débordement horizontal", not g["overflowX"])
    if g["sheetBottom"] is not None and g["navTop"] is not None:
        check(profile, f"{label} : feuille ne chevauche pas la navigation basse", g["sheetBottom"] <= g["navTop"] + 1,
              f"(bas feuille={g['sheetBottom']:.0f}, haut nav={g['navTop']:.0f})")

def wait_route(page):
    page.locator("span:visible", has_text="Distance").first.wait_for(timeout=25000)
    page.wait_for_timeout(2500)

def run(p, profile, device):
    print(f"\n===== {profile} =====")
    b = p.chromium.launch(**LAUNCH)
    kw = p.devices[device] if device else dict(viewport={"width": 1440, "height": 900})
    ctx = b.new_context(**kw, geolocation={"latitude": -4.3800, "longitude": 15.3000, "accuracy": 10}, permissions=["geolocation"])
    install_mocks(ctx); page = ctx.new_page()
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    mobile = device is not None
    page.goto(f"{BASE}/#/map?loc=loc-lib")
    page.wait_for_selector("canvas.maplibregl-canvas", timeout=30000); page.wait_for_timeout(2000)
    page.evaluate("document.querySelector('canvas.maplibregl-canvas').__mark='initial'")
    px(page, profile, "0. avant calcul", expect=False)

    # 1-2
    page.get_by_role("button", name="Me guider").first.click(); wait_route(page)
    px(page, profile, "1-2. itinéraire calculé", tag=f"{profile}_1_route"); geo_ok(page, profile, "1")
    page.screenshot(path=f"{OUT}/{profile}_1_ui.png")

    # 3. masquer les étapes / 5. réafficher
    page.get_by_role("button", name="Voir les", exact=False).click(); page.wait_for_timeout(300)
    check(profile, "étapes affichées", page.get_by_role("button", name="Masquer les étapes").is_visible())
    page.get_by_role("button", name="Masquer les étapes").click(); page.wait_for_timeout(500)
    px(page, profile, "3-4. après « Masquer les étapes »")
    page.get_by_role("button", name="Voir les", exact=False).click(); page.wait_for_timeout(400)
    check(profile, "5. étapes réaffichées", page.get_by_role("button", name="Masquer les étapes").is_visible())
    check(profile, "distance/durée toujours affichées", page.locator("p:visible", has_text="min").count() > 0)
    px(page, profile, "5. étapes réaffichées")

    # 6. réduire / agrandir / masquer
    if mobile:
        page.get_by_role("button", name="Réduire le panneau").click(); page.wait_for_timeout(500)
        check(profile, "6. panneau réduit : résumé distance/durée visible", page.locator("[data-route-summary]").is_visible())
        px(page, profile, "6. panneau réduit", tag=f"{profile}_6_collapsed"); geo_ok(page, profile, "6 réduit")
        page.get_by_role("button", name="Agrandir le panneau").click(); page.wait_for_timeout(500)
        check(profile, "6. panneau agrandi", page.get_by_role("button", name="Réduire le panneau").is_visible())
        px(page, profile, "6. panneau agrandi")
        page.get_by_role("button", name="Réduire le panneau").click(); page.wait_for_timeout(400)
        page.get_by_role("button", name="Masquer le panneau").click(); page.wait_for_timeout(500)
        check(profile, "6. panneau masqué : pastille de réouverture visible", page.locator("[data-route-pill]").is_visible())
        px(page, profile, "6. panneau MASQUÉ", tag=f"{profile}_6_hidden"); geo_ok(page, profile, "6 masqué")
        page.screenshot(path=f"{OUT}/{profile}_6_hidden_ui.png")
        page.locator("[data-route-pill]").click(); page.wait_for_timeout(400)
        page.get_by_role("button", name="Afficher les étapes").click(); page.wait_for_timeout(500)
        check(profile, "réouverture : détail et étapes toujours là", page.get_by_role("button", name="Masquer les étapes").is_visible())
    else:
        page.get_by_role("button", name="Masquer le panneau").click(); page.wait_for_timeout(700)
        px(page, profile, "6. panneau MASQUÉ", tag=f"{profile}_6_hidden"); geo_ok(page, profile, "6 masqué")
        page.get_by_role("button", name="Afficher le panneau du campus").click(); page.wait_for_timeout(700)
        px(page, profile, "6. panneau réaffiché")

    # 7. Démarrer
    if mobile:
        page.get_by_role("button", name="Démarrer").first.click(); page.wait_for_timeout(1500)
        check(profile, "7. Démarrer : navigation active, feuille réduite", page.locator("[data-sheet-state='collapsed']").count() == 1
              and page.locator("p:visible, span:visible", has_text="navigation en cours").count() > 0)
    else:
        page.get_by_role("button", name="Démarrer").click(); page.wait_for_timeout(1200)
        check(profile, "7. Démarrer : navigation active", page.get_by_role("button", name="Arrêter la navigation").is_visible())
    px(page, profile, "7. navigation démarrée", tag=f"{profile}_7_started"); geo_ok(page, profile, "7")
    page.screenshot(path=f"{OUT}/{profile}_7_started_ui.png")

    # 8. revenir à la carte (quitter l'onglet puis revenir)
    if mobile:
        page.get_by_role("button", name="Masquer le panneau").click(); page.wait_for_timeout(300)
        page.locator("nav.fixed button, nav.fixed a", has_text="Accueil").first.click()
    else:
        page.evaluate("location.hash = '#/'")
    page.wait_for_timeout(1200)
    check(profile, "8. on a bien quitté la carte", page.locator("canvas.maplibregl-canvas").count() == 0)
    page.evaluate("location.hash = '#/map'")  # équivaut à l'onglet « Carte » (lien sans paramètre)
    page.wait_for_selector("canvas.maplibregl-canvas", timeout=30000)
    try:
        wait_route(page); check(profile, "8. retour carte : panneau d'itinéraire restauré", True)
    except Exception:
        check(profile, "8. retour carte : panneau d'itinéraire restauré", False)
    px(page, profile, "8. retour sur la carte", tag=f"{profile}_8_back")
    page.evaluate("document.querySelector('canvas.maplibregl-canvas').__mark='initial'")

    # fermeture explicite = seul geste qui termine l'itinéraire
    page.get_by_role("button", name="Fermer l'itinéraire").first.click(); page.wait_for_timeout(1200)
    px(page, profile, "fermeture explicite (croix)", expect=False)
    check(profile, "aucune erreur JS", not errs, "; ".join(errs[:2]))
    b.close()

vite = start_vite()
try:
    with sync_playwright() as p:
        run(p, "iphone13", "iPhone 13")
        run(p, "pixel7", "Pixel 7")
        run(p, "desktop", None)
finally:
    vite.terminate()
bad = [r for r in RESULTS if not r["ok"]]
json.dump(RESULTS, open(f"{OUT}/results.json", "w"), ensure_ascii=False, indent=1)
print(f"\nTOTAL : {len(RESULTS)-len(bad)}/{len(RESULTS)} OK")
for r in bad: print("  ÉCHEC:", r["profile"], r["test"], r["detail"])
sys.exit(1 if bad else 0)
