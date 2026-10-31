"""Reproduction du comportement réel : on touche la croix de la feuille « Itinéraire » (code actuel)."""
from harness import *
prev = build_and_preview()
try:
    with sync_playwright() as p:
        c = {}
        b, ctx = prod_context(p, "iPhone 13", c); page = ctx.new_page()
        page.goto(f"{BASE}/#/map"); page.wait_for_selector("canvas.maplibregl-canvas", timeout=30000); page.wait_for_timeout(2000)
        page.get_by_text("Rechercher une salle", exact=False).first.click(); page.wait_for_timeout(500)
        page.locator("input:visible").first.fill("Section Info"); page.wait_for_timeout(1500)
        page.get_by_text("Section Informatique").first.click(); page.wait_for_timeout(800)
        page.get_by_role("button", name="Me guider").first.click()
        page.locator("span:visible", has_text="Distance").first.wait_for(timeout=25000); page.wait_for_timeout(2500)
        page.screenshot(path=f"{OUT}/repro_1.png")
        print("1. trajet externe calculé (appels route-walking:", c.get("ors"), ") bleu:", blue_pixels(page))
        btns = page.evaluate("[...document.querySelectorAll('[data-sheet-state] button')].filter(b=>b.offsetParent).map(b=>(b.getAttribute('aria-label')||b.textContent).trim().slice(0,50))")
        print("   boutons visibles dans la feuille:", btns)
        page.get_by_role("button", name="Fermer l'itinéraire").first.click(); page.wait_for_timeout(1500)
        print("2. après la croix en haut à droite de la feuille, bleu:", blue_pixels(page))
        b.close()
finally: prev.terminate()
