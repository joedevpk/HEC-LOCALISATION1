import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Configuration de test séparée de vite.config.ts : on n'y charge ni le
// plugin PWA ni React (les tests portent sur la logique pure : routage,
// GPS, validation), ce qui garde les tests rapides et déterministes.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
