# Banc de test — itinéraire mobile / desktop

Test réel dans Chromium (WebGL logiciel) : vrai front (Vite), vrai MapLibre, vrai routage.
Seuls Supabase et le fond de carte sont simulés (fixtures locales, aucun réseau externe).
La ligne bleue est mesurée sur les **pixels rendus** du canvas (toute l'UI est masquée pendant la mesure),
en distinguant « rendue » et « visible par l'utilisateur » (hors feuille, navigation basse, barres).

    pip install playwright pillow && playwright install chromium
    cd e2e-itineraire-mobile && python3 run_tests.py     # iPhone 13, Pixel 7, desktop 1440x900
    python3 baseline.py                                  # reproduit le bug sur l'ancien comportement (croix)

Limite : émulation d'appareils dans Chromium, pas du matériel iPhone/Android réel.

    python3 run_service_errors.py   # service d'itinéraire externe en échec (404 / 503), vu par un visiteur (build de production)
