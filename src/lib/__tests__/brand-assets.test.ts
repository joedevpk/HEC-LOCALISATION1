import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');

describe('logo officiel HEC', () => {
  const logoPath = resolve(root, 'public/images/hec-logo.png');

  it('est présent dans public/images (fichier fourni, non redessiné)', () => {
    expect(existsSync(logoPath)).toBe(true);
  });

  it('conserve ses proportions d\'origine (PNG 199×254)', () => {
    const buf = readFileSync(logoPath);
    // Signature PNG puis chunk IHDR : largeur/hauteur en big-endian aux octets 16-23.
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(buf.readUInt32BE(16)).toBe(199);
    expect(buf.readUInt32BE(20)).toBe(254);
  });

  it('les icônes PWA référencées existent', () => {
    for (const f of ['pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-192x192.png', 'pwa-maskable-512x512.png', 'apple-touch-icon.png', 'favicon.svg']) {
      expect(existsSync(resolve(root, 'public', f)), f).toBe(true);
    }
  });

  it('le composant Logo utilise le logo officiel et son texte alternatif', () => {
    const ui = readFileSync(resolve(root, 'src/components/ui.tsx'), 'utf8');
    expect(ui).toContain("'/images/hec-logo.png'");
    expect(ui).toContain('Logo officiel de la Haute École de Commerce de Kinshasa');
  });
});
