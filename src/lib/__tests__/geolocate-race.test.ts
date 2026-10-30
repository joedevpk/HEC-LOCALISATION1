import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Régression passe 4 : MapLibre 4.x renvoie false de trigger() tant que le contrôle n'est pas initialisé
// (init asynchrone). Un lien profond ?nav= au démarrage à froid restait bloqué sur « Recherche de votre position… ».
describe('géolocalisation : contrôle natif pas encore prêt', () => {
  const map = readFileSync('src/components/CampusMap.tsx', 'utf8');
  const page = readFileSync('src/pages/MapPage.tsx', 'utf8');
  it('le déclencheur exposé renvoie le résultat de trigger() au lieu de l’ignorer', () => {
    expect(map).toMatch(/onGeolocateControlReady\?: \(trigger: \(\) => boolean\) => void/);
    expect(map).toMatch(/return geolocate\.trigger\(\) !== false;/);
  });
  it('MapPage retombe sur startLocationWatch quand le contrôle n’est pas prêt', () => {
    expect(page).toMatch(/geolocateTriggerRef\.current && geolocateTriggerRef\.current\(\)\) \{\s*return;/);
    expect(page).not.toMatch(/geolocateTriggerRef\.current\(\);\s*return;/);
  });
  it('la version de MapLibre installée a bien le comportement décrit (sinon réévaluer ce correctif)', () => {
    const lib = readFileSync('node_modules/maplibre-gl/dist/maplibre-gl-dev.js', 'utf8');
    expect(lib).toMatch(/if \(!this\._setup\) \{\s*performance\$1\.warnOnce\('Geolocate control triggered before added to a map'\);\s*return false;/);
  });
});
