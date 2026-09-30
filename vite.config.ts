import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Mode hors-ligne (ÉTAPE 35 du cahier des charges) : précharge
    // l'application (JS/CSS/HTML) pour qu'elle s'ouvre sans réseau, et met
    // en cache les données déjà consultées (campus/bâtiments/salles via
    // l'API REST Supabase, photos via Supabase Storage) pour un repli
    // honnête sur "dernier contenu disponible". `manifest: false` : on
    // garde `public/manifest.json`, déjà référencé dans index.html, comme
    // unique source — pas de deuxième manifeste généré en parallèle.
    // Volontairement PAS de cache des tuiles cartographiques ni du GPS :
    // le prompt maître interdit explicitement de prétendre qu'une carte
    // satellite ou une géolocalisation fonctionnent hors-ligne si ce
    // n'est pas réellement le cas.
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-maskable-192x192.png',
        'pwa-maskable-512x512.png',
      ],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,json,png}'],
        navigateFallbackDenylist: [/^\/auth/, /^\/rest\//, /^\/storage\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Données du campus (bâtiments, salles, étages, réseau de
            // chemins…) via l'API REST Supabase : toujours la version la
            // plus fraîche quand le réseau répond, repli sur la dernière
            // version connue sinon.
            // LISTE BLANCHE de tables publiques : les données privées
            // (favoris, réservations, notifications, signalements,
            // historique, paramètres, planning, profils) ne sont JAMAIS
            // mises en cache par le service worker — sinon elles
            // resteraient lisibles sur un appareil partagé après
            // déconnexion.
            urlPattern: ({ url }) =>
              /^\/rest\/v1\/(campuses|buildings|floors|locations|building_images|location_images|route_nodes|route_segments|campus_events|announcements)(\?|$)/.test(
                url.pathname + url.search,
              ),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'hec-campus-data',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Photos institutionnelles HEC (Hero, galerie) : fichiers
            // statiques publics de l'application, jamais de donnée privée.
            // Mises en cache à la première consultation (elles ne sont pas
            // dans le précache, qui ne couvre pas .webp).
            urlPattern: ({ url }) => url.pathname.startsWith('/images/hec/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'hec-institutional-photos',
              expiration: { maxEntries: 30, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Photos de bâtiments/salles déjà consultées (Supabase
            // Storage) : elles ne changent pas une fois publiées, donc
            // cache-first — vraiment disponibles hors-ligne, pas une
            // promesse en l'air.
            urlPattern: ({ url }) => url.pathname.startsWith('/storage/v1/object/public/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'hec-campus-photos',
              expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    // MapLibre (~800 Ko) et Supabase sont de gros blocs stables : dans des
    // chunks séparés, ils restent en cache navigateur/PWA d'un déploiement
    // à l'autre et ne bloquent plus le premier affichage de la page
    // d'accueil (qui n'a pas besoin de la carte).
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/maplibre-gl')) return 'maplibre';
          if (id.includes('node_modules/@supabase')) return 'supabase';
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'react';
          if (id.includes('node_modules/qrcode')) return 'qrcode';
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});
