# Surveillance et journalisation

## Health check (règle 17)
`npm run healthcheck -- https://VOTRE_APP` vérifie l'application, le manifeste PWA et l'API Supabase (code de sortie 0/1).
Brancher **au choix** : Render (*Health Check Path* = `/`), UptimeRobot / Better Stack (HTTP sur l'URL de l'app), ou un cron / GitHub Actions qui exécute le script. Aucun fournisseur obligatoire.

## Journal d'erreurs (règle 18)
`src/lib/logger.ts` : `logError` / `logWarn`, erreurs globales (`window.error`, `unhandledrejection`) et `ErrorBoundary` centralisés. Chaque entrée : horodatage, route (sans paramètres), type, message, contexte non sensible. Mots de passe, jetons, clés, e‑mails et téléphones sont filtrés ; les annulations volontaires (`AbortError`) ne sont pas des erreurs.
Pour envoyer les erreurs critiques à un collecteur, définir `VITE_LOG_ENDPOINT` (URL HTTP quelconque). Sans elle : console + tampon mémoire de 50 entrées. Maximum 30 envois par session, dédupliqués sur 30 s.

## Vérification du déploiement
Après chaque déploiement : `npm run typecheck && npm test && npm run build`, puis `npm run healthcheck`.
