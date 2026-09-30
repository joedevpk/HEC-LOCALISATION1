# Stratégie de test multi‑visiteurs (règle 19)

**Statut : aucun test de charge n'a été exécuté.** Ce document prépare les scénarios ; les résultats sont à renseigner après exécution.

## Ce qui a été fait pour limiter la charge (vérifié par lecture du code)
- Un chargement initial = 1 requête `campuses` + 2 en parallèle (`buildings`, `locations`) puis 4 secondaires ; plus de re‑création du contexte à chaque rendu.
- Limites ajoutées : événements 200, annonces 50, réservations 100, signalements 100 (notifications 50 et historique 6 l'étaient déjà).
- Délai maximal de 15 s (60 s pour les envois de fichiers) sur toutes les requêtes Supabase.
- Service worker : `NetworkFirst` sur les tables publiques uniquement, photos en `CacheFirst`.
- Index SQL correspondant aux tris/filtres émis (migration 20260930090000).
- La carte (MapLibre) et les pages admin sont chargées à la demande.

## Scénarios (outil recommandé : k6 — https://k6.io)
| Palier | Utilisateurs simultanés | Parcours par utilisateur |
|---|---|---|
| A | 10 | accueil → `campuses`, `buildings`, `locations`, `route_nodes`, `route_segments` (lecture) |
| B | 50 | idem + recherche + fiche lieu (`location_images`) |
| C | 100 | idem, montée en 2 min, plateau 5 min |

Script k6 minimal (lecture publique — n'écrit rien) :
```js
import http from 'k6/http'; import { check, sleep } from 'k6';
export const options = { stages: [{duration:'1m',target:10},{duration:'3m',target:10},{duration:'30s',target:0}],
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<800'] } };
const U = __ENV.SUPABASE_URL, K = __ENV.SUPABASE_ANON_KEY;
const H = { headers: { apikey: K, Authorization: `Bearer ${K}` } };
export default function () {
  for (const t of ['campuses?select=id&limit=1','buildings?select=id,name&limit=100','locations?select=id,name&limit=500',
                   'route_nodes?select=id&limit=2000','route_segments?select=id&limit=4000']) {
    check(http.get(`${U}/rest/v1/${t}`, H), { ok: (r) => r.status === 200 });
  }
  sleep(2);
}
```
**Ne jamais lancer ce test contre la production aux heures d'usage** : utiliser un projet de test.

## À observer
Temps de réponse p95, taux d'erreur, requêtes/s et CPU dans *Supabase → Reports*, limites de l'offre (connexions, egress). Consigner ici les valeurs mesurées.
