from harness import *
import sys
vite = start_vite()
def run(p, name, device):
    b = p.chromium.launch(**LAUNCH)
    kw = p.devices[device] if device else dict(viewport={"width":1440,"height":900})
    ctx = b.new_context(**kw, geolocation={"latitude": -4.3800, "longitude": 15.3000, "accuracy": 10}, permissions=["geolocation"])
    install_mocks(ctx); page = ctx.new_page()
    page.goto(f"{BASE}/#/map?loc=loc-lib")
    page.wait_for_selector("canvas.maplibregl-canvas", timeout=30000); page.wait_for_timeout(2000)
    print(f"\n=== {name} ===")
    print("bleu avant itinéraire :", blue_pixels(page))
    page.get_by_role("button", name="Me guider").first.click()
    page.locator("span:visible", has_text="Distance").first.wait_for(timeout=20000)
    page.wait_for_timeout(2500)
    page.screenshot(path=f"{OUT}/base_{name}_1_route.png")
    print("1. itinéraire calculé, bleu :", blue_pixels(page))
    page.get_by_role("button", name="Voir les", exact=False).click(); page.wait_for_timeout(300)
    page.get_by_role("button", name="Masquer les étapes").click(); page.wait_for_timeout(600)
    print("2. après 'Masquer les étapes', bleu :", blue_pixels(page))
    if device:
        page.get_by_role("button", name="Fermer l'itinéraire").click(); page.wait_for_timeout(1500)
        page.screenshot(path=f"{OUT}/base_{name}_2_closed.png")
        print("3. après la croix (seul moyen de masquer le panneau mobile), bleu :", blue_pixels(page))
    else:
        page.get_by_role("button", name="Masquer le panneau").click(); page.wait_for_timeout(1500)
        page.screenshot(path=f"{OUT}/base_{name}_2_hidden.png")
        print("3. après 'Masquer le panneau' desktop, bleu :", blue_pixels(page))
    b.close()
try:
    with sync_playwright() as p:
        run(p, "iphone", "iPhone 13"); run(p, "desktop", None)
finally:
    vite.terminate()
