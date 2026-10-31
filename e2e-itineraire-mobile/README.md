# Bancs de test — itinéraire (mobile / desktop)

Chromium réel (WebGL logiciel), vrai MapLibre, vrai routage, vraie interface. Seuls Supabase, le fond de carte et le service
d'itinéraire externe sont simulés localement. La ligne bleue est mesurée sur les PIXELS réels du canvas (UI masquée pendant la mesure),
en distinguant « rendue » et « visible par l'utilisateur » (hors feuille, navigation basse, barres).

    pip install playwright pillow && playwright install chromium
    cd e2e-itineraire-mobile
    python3 run_prod_scenario.py   # SCÉNARIO DE PRODUCTION (build Vite) : Section Informatique, GPS hors campus, 14 étapes (83 contrôles)
    python3 run_tests.py           # parcours campus interne, serveur de dev (86 contrôles)
    python3 run_service_errors.py  # service d'itinéraire en échec (404/503), vu par un visiteur
    python3 repro_x.py             # reproduit l'ancien défaut (croix destructive) — ne s'applique qu'à l'ancien code

Limites : émulation Chromium (iPhone 13 / Pixel 7), pas Safari iOS (WebKit) ni du matériel réel.
