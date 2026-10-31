"""
Scénario de PRODUCTION (build Vite, pas le serveur de dev) : trajet EXTERNE depuis une position hors campus
(service d'itinéraire simulé en succès), destination « Section Informatique » choisie par la recherche.
La ligne bleue est mesurée sur les pixels réels du canvas MapLibre (UI masquée pendant la mesure).
"""
from harness import *
import json, sys

R = []
def check(profile, name, ok, detail=""):
    R.append(dict(profile=profile, test=name, ok=bool(ok), detail=detail))
    print(f"  [{'OK ' if ok else 'ÉCHEC'}] {name}  {detail}")

def geom(page):
    return page.evaluate("""() => {
      const c = document.querySelector('canvas.maplibregl-canvas'); const m = c.closest('.maplibregl-map');
      const cr = c.getBoundingClientRect(), mr = m.getBoundingClientRect();
      const vis = e => e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
      const nav = [...document.querySelectorAll('nav.fixed')].find(vis);
      const pill = [...document.querySelectorAll('[data-route-pill]')].find(vis);
      const sheet = [...document.querySelectorAll('[data-sheet-state]')].find(vis);
      return { sized: Math.abs(cr.width - mr.width) < 1.5 && Math.abs(cr.height - mr.height) < 1.5 && cr.width > 100,
               same: c.__mark === 'initial', box: [Math.round(cr.width), Math.round(cr.height)],
               overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
               navTop: nav ? nav.getBoundingClientRect().top : null,
               pillBottom: pill ? pill.getBoundingClientRect().bottom : null,
               sheetBottom: sheet ? sheet.getBoundingClientRect().bottom : null,
               pillRight: pill ? pill.getBoundingClientRect().right : null, vw: innerWidth }; }""")

def blue(page, profile, label, expect=True, tag=None):
    t, v = blue_pixels(page, tag=tag)
    check(profile, f"{label} : tracé bleu {'visible' if expect else 'ABSENT'}", (t > 300 and v > 300) if expect else t == 0,
          f"(rendu={t}px, visible={v}px)")
    return t, v

def geo_ok(page, profile, label):
    g = geom(page)
    check(profile, f"{label} : canvas = conteneur, MÊME instance de carte, pas de débordement",
          g["sized"] and g["same"] and not g["overflowX"], f"{g['box']}")
    if g["navTop"] is not None:
        if g["pillBottom"] is not None:
            check(profile, f"{label} : bouton « Afficher l'itinéraire » au-dessus de la navigation basse, dans l'écran",
                  g["pillBottom"] <= g["navTop"] + 1 and g["pillRight"] <= g["vw"], f"(bas bouton={g['pillBottom']:.0f}, haut nav={g['navTop']:.0f})")
        if g["sheetBottom"] is not None:
            check(profile, f"{label} : feuille sans chevauchement de la navigation", g["sheetBottom"] <= g["navTop"] + 1)

def run(p, profile, device):
    print(f"\n===== {profile} =====")
    cnt = {}
    b, ctx = prod_context(p, device, cnt); page = ctx.new_page()
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    mobile = device is not None
    # 1-2. ouvrir, géolocalisation autorisée (permission accordée au contexte)
    page.goto(f"{BASE}/#/map"); page.wait_for_selector("canvas.maplibregl-canvas", timeout=30000); page.wait_for_timeout(2000)
    page.evaluate("document.querySelector('canvas.maplibregl-canvas').__mark='initial'")
    # 3. destination « Section Informatique » (recherche)
    if mobile: page.get_by_text("Rechercher une salle", exact=False).first.click(); page.wait_for_timeout(500)
    page.locator("input:visible").first.fill("Section Info"); page.wait_for_timeout(1500)
    page.get_by_text("Section Informatique").first.click(); page.wait_for_timeout(800)
    # 4. calcul depuis une position HORS campus
    page.get_by_role("button", name="Me guider").first.click()
    page.locator("span:visible", has_text="Distance").first.wait_for(timeout=25000); page.wait_for_timeout(2500)
    check(profile, "4. calcul par le service externe (position hors campus)", cnt.get("ors") == 1, f"(appels={cnt.get('ors')})")
    blue(page, profile, "5. trajet calculé", tag=f"prod_{profile}_5"); geo_ok(page, profile, "5")
    page.screenshot(path=f"{OUT}/prod_{profile}_5_ui.png")

    if mobile:
        # contrôle de conception : aucune commande destructive parmi les boutons rapides de l'en-tête
        hdr = page.evaluate("""() => [...document.querySelectorAll('[data-sheet-state] [role=region] > div:first-child button')]
                                  .filter(b => b.offsetParent).map(b => b.getAttribute('aria-label'))""")
        check(profile, "en-tête de la feuille : uniquement Réduire / Masquer (aucune croix destructive)",
              hdr == ["Réduire le panneau d'itinéraire", "Masquer le panneau (l'itinéraire reste sur la carte)"], str(hdr))
        # 6-7. masquer la feuille
        page.locator("[data-route-hide]:visible").click(); page.wait_for_timeout(700)
        check(profile, "6. feuille masquée, bouton « Afficher l'itinéraire » visible", page.locator("[data-route-pill]").is_visible())
        blue(page, profile, "7. feuille MASQUÉE", tag=f"prod_{profile}_7"); geo_ok(page, profile, "7")
        check(profile, "7. aucun nouveau calcul au masquage", cnt["ors"] == 1, f"(appels={cnt['ors']})")
        page.screenshot(path=f"{OUT}/prod_{profile}_7_hidden_ui.png")
        # 7b. le GPS bouge de ~90 m pendant que la feuille est masquée
        ctx.set_geolocation({"latitude": -4.3892, "longitude": 15.3095, "accuracy": 12}); page.wait_for_timeout(300)
        blue(page, profile, "7b. GPS qui bouge, juste après (recalcul en cours)")
        page.wait_for_timeout(3500)
        check(profile, "7b. feuille toujours masquée après le recalcul", page.locator("[data-route-pill]").is_visible())
        blue(page, profile, "7b. après le recalcul", tag=f"prod_{profile}_7b")
        # 8. rouvrir
        page.get_by_role("button", name="Afficher l'itinéraire").click(); page.wait_for_timeout(600)
        check(profile, "8. panneau rouvert (même panneau, étapes disponibles)", page.get_by_role("button", name="Voir les", exact=False).is_visible())
        blue(page, profile, "8. panneau rouvert")
        # 9. réduire puis agrandir
        page.locator("[data-route-collapse]:visible").click(); page.wait_for_timeout(600)
        sm = page.locator("[data-route-summary]:visible")
        check(profile, "9. réduit : résumé destination + distance + durée", sm.count() == 1 and "Section Informatique" in sm.inner_text()
              and "km" in sm.inner_text() or "m ·" in sm.inner_text(), sm.inner_text().replace("\n", " | ")[:90] if sm.count() else "")
        blue(page, profile, "9. panneau réduit"); geo_ok(page, profile, "9")
        page.get_by_role("button", name="Afficher les étapes").click(); page.wait_for_timeout(600)
        check(profile, "9. agrandi", page.locator("[data-route-collapse]:visible").count() == 1)
        blue(page, profile, "9. panneau agrandi")
        # 10. démarrer la navigation
        page.get_by_role("button", name="Démarrer").first.click(); page.wait_for_timeout(1500)
        check(profile, "10. navigation démarrée (feuille réduite, état affiché)",
              page.locator("[data-sheet-state='collapsed']").count() == 1 and page.locator("p:visible", has_text="navigation en cours").count() > 0)
        blue(page, profile, "10. navigation active"); geo_ok(page, profile, "10")
        # 11. masquer / rouvrir PENDANT la navigation
        page.get_by_role("button", name="Masquer le panneau").click(); page.wait_for_timeout(500)
        blue(page, profile, "11. masqué pendant la navigation", tag=f"prod_{profile}_11")
        page.get_by_role("button", name="Afficher l'itinéraire").click(); page.wait_for_timeout(500)
        check(profile, "11. rouvert : navigation toujours active", page.get_by_role("button", name="Arrêter la navigation").first.is_visible())
        # Arrêter la navigation : n'efface pas le trajet
        page.get_by_role("button", name="Arrêter la navigation").first.click(); page.wait_for_timeout(700)
        check(profile, "« Arrêter la navigation » : navigation arrêtée", page.get_by_role("button", name="Démarrer").first.is_visible())
        t, _ = blue_pixels(page)
        check(profile, "« Arrêter la navigation » n'efface pas le trajet (tracé toujours rendu, feuille ouverte par-dessus)", t > 300, f"(rendu={t}px)")
        page.locator("[data-route-hide]:visible").click(); page.wait_for_timeout(500)
        blue(page, profile, "après Arrêter + masquage : tracé visible sur la carte")
    else:
        page.get_by_role("button", name="Masquer le panneau").click(); page.wait_for_timeout(700)
        blue(page, profile, "7. panneau MASQUÉ", tag=f"prod_{profile}_7"); geo_ok(page, profile, "7")
        page.get_by_role("button", name="Afficher le panneau du campus").click(); page.wait_for_timeout(700)
        blue(page, profile, "8. panneau réaffiché")
        page.get_by_role("button", name="Démarrer").click(); page.wait_for_timeout(1000)
        blue(page, profile, "10. navigation active")
        page.get_by_role("button", name="Arrêter la navigation").click(); page.wait_for_timeout(500)
        blue(page, profile, "« Arrêter la navigation » n'efface pas le trajet")

    # 12-13. quitter l'onglet Carte puis revenir
    page.evaluate("location.hash = '#/'"); page.wait_for_timeout(1200)
    check(profile, "12. carte quittée", page.locator("canvas.maplibregl-canvas").count() == 0)
    page.evaluate("location.hash = '#/map'"); page.wait_for_selector("canvas.maplibregl-canvas", timeout=30000)
    page.locator("span:visible", has_text="Distance").first.wait_for(timeout=25000); page.wait_for_timeout(2500)
    page.evaluate("document.querySelector('canvas.maplibregl-canvas').__mark='initial'")
    check(profile, "13. retour : itinéraire restauré (destination « Section Informatique »)",
          page.locator("[role=region] :visible", has_text="Section Informatique").count() > 0)
    blue(page, profile, "13. retour sur la carte", tag=f"prod_{profile}_13")

    # 14. fermeture DÉFINITIVE : seul geste destructif
    if mobile: page.locator("[data-route-close]:visible").click()
    else: page.get_by_role("button", name="Fermer l'itinéraire").first.click()
    page.wait_for_timeout(1500)
    blue(page, profile, "14. fermeture définitive (seul moment où le tracé disparaît)", expect=False)
    check(profile, "aucune erreur JS", not errs, "; ".join(errs[:2]))
    b.close()

prev = build_and_preview()
try:
    with sync_playwright() as p:
        run(p, "iphone13", "iPhone 13"); run(p, "pixel7", "Pixel 7"); run(p, "desktop", None)
finally:
    prev.terminate()
bad = [r for r in R if not r["ok"]]
json.dump(R, open(f"{OUT}/prod_results.json", "w"), ensure_ascii=False, indent=1)
print(f"\nTOTAL : {len(R)-len(bad)}/{len(R)} OK")
for r in bad: print("  ÉCHEC:", r["profile"], r["test"], r["detail"])
sys.exit(1 if bad else 0)
