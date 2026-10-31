"""Échec du service d'itinéraire externe, vu par un VISITEUR (build de production, pas le serveur de dev)."""
from harness import *
import subprocess, shutil, sys

DIST = "/tmp/dist_e2e"
env = dict(os.environ, VITE_SUPABASE_URL=BASE, VITE_SUPABASE_ANON_KEY="test-anon-key", VITE_MAP_PROVIDER="custom",
           VITE_MAP_STYLE_URL=f"{BASE}/__test/style.json", VITE_ROUTING_PROVIDER="proxy")
shutil.rmtree(DIST, ignore_errors=True)
r = subprocess.run(["npx", "vite", "build", "--outDir", DIST], cwd=PROJECT, env=env, capture_output=True, text=True)
assert r.returncode == 0, r.stderr[-500:]
prev = subprocess.Popen(["npx", "vite", "preview", "--outDir", DIST, "--port", str(PORT), "--strictPort", "--host", "127.0.0.1"],
                        cwd=PROJECT, env=env, stdout=open("/tmp/preview.log", "w"), stderr=subprocess.STDOUT)
for _ in range(60):
    try: urllib.request.urlopen(BASE, timeout=1); break
    except Exception: time.sleep(0.5)

RES = []
def check(name, ok, detail=""):
    RES.append(ok); print(f"  [{'OK ' if ok else 'ÉCHEC'}] {name}  {detail}")

def scenario(p, label, status, body):
    print(f"\n== {label} ==")
    b = p.chromium.launch(**LAUNCH)
    ctx = b.new_context(**p.devices["iPhone 13"], service_workers="block",
                        geolocation={"latitude": -4.3900, "longitude": 15.3100, "accuracy": 10}, permissions=["geolocation"])
    install_mocks(ctx)
    ctx.route("**/functions/v1/route-walking", lambda r: r.fulfill(status=status, content_type="application/json", body=body))
    page = ctx.new_page()
    page.goto(f"{BASE}/#/map?loc=loc-lib")
    page.wait_for_selector("canvas.maplibregl-canvas", timeout=30000); page.wait_for_timeout(2000)
    page.get_by_role("button", name="Me guider").first.click()
    alert = page.locator("[role=alert]:visible").first
    alert.wait_for(timeout=25000); page.wait_for_timeout(500)
    txt = alert.inner_text()
    page.screenshot(path=f"{OUT}/svc_{label}.png")
    return b, page, txt

try:
    with sync_playwright() as p:
        b, page, txt = scenario(p, "404_non_deploye", 404, "")
        print("   texte :", txt.replace("\n", " | "))
        check("titre clair, sans « Erreur de configuration »", "Erreur de configuration" not in txt and "pas encore disponible" in txt)
        check("aucun jargon technique côté visiteur", not any(w in txt.lower() for w in ["fonction", "déploy", "contactez un administrateur", "jeton"]))
        check("piste d'action concrète (lieu du campus)", "lieu du campus" in txt)
        check("pas de bouton Réessayer trompeur (config)", page.locator("[role=alert]:visible").first.get_by_role("button", name="Réessayer").count() == 0)
        # la piste proposée fonctionne vraiment : départ = lieu du campus → réseau interne → tracé bleu
        page.locator("select:visible").first.select_option(label="Entrée Bloc A")
        page.locator("span:visible", has_text="Distance").first.wait_for(timeout=20000); page.wait_for_timeout(2500)
        tot, vis = blue_pixels(page, tag=f"svc_404_depart_campus")
        check("départ « lieu du campus » : itinéraire calculé, ligne bleue visible", tot > 300 and vis > 300, f"(rendu={tot}px, visible={vis}px)")
        page.screenshot(path=f"{OUT}/svc_404_apres_depart_campus.png")
        b.close()

        b, page, txt = scenario(p, "503_indisponible", 503, '{"error":{"kind":"upstream_unavailable","message":"Le service de calcul d’itinéraire est momentanément indisponible."}}')
        print("   texte :", txt.replace("\n", " | "))
        check("503 : « momentanément indisponible » + bouton Réessayer", "momentanément indisponible" in txt.lower() and page.locator("[role=alert]:visible").first.get_by_role("button", name="Réessayer").count() > 0)
        b.close()
finally:
    prev.terminate()
print(f"\nTOTAL : {sum(RES)}/{len(RES)} OK"); sys.exit(0 if all(RES) else 1)
