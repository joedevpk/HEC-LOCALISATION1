// src/lib/qr-utils.ts
//
// Utilitaires de génération de VRAIS QR codes (standard QR, scannables)
// à partir de la librairie `qrcode` (https://www.npmjs.com/package/qrcode).
//
// Installation requise :
//   npm install qrcode
//   npm install -D @types/qrcode

import QRCode from 'qrcode';

/**
 * Construit l'URL profonde publique vers un lieu à partir de son code QR.
 * Priorité :
 *   1. VITE_APP_URL (variable d'environnement, à définir dans .env / .env.production)
 *   2. window.location.origin (fallback en runtime navigateur)
 *
 * Exemple : https://campus.hec.cd/qr/HEC-BAT-A-001
 */
export function buildQrUrl(code: string): string {
  const envBase = import.meta.env.VITE_APP_URL as string | undefined;
  const base = (envBase && envBase.trim().length > 0)
    ? envBase.trim()
    : (typeof window !== 'undefined' ? window.location.origin : '');

  const cleanBase = base.replace(/\/+$/, '');
  const cleanCode = encodeURIComponent(code);

  return `${cleanBase}/qr/${cleanCode}`;
}

export interface QrRenderOptions {
  /** Taille en pixels (PNG) ou viewBox (SVG). Par défaut 512. */
  size?: number;
  /** Marge (quiet zone) en modules. Par défaut 2, ne pas descendre sous 1 pour rester scannable. */
  margin?: number;
  /** Niveau de correction d'erreur. 'M' par défaut, bon compromis lisibilité/densité. */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  darkColor?: string;
  lightColor?: string;
}

const DEFAULTS: Required<Omit<QrRenderOptions, 'darkColor' | 'lightColor'>> & {
  darkColor: string;
  lightColor: string;
} = {
  size: 512,
  margin: 2,
  errorCorrectionLevel: 'M',
  darkColor: '#111d47',
  lightColor: '#ffffff',
};

/** Dessine un vrai QR code sur un <canvas> existant (pour l'aperçu live dans l'UI). */
export async function renderQrToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  options: QrRenderOptions = {},
): Promise<void> {
  const opts = { ...DEFAULTS, ...options };
  await QRCode.toCanvas(canvas, text, {
    width: opts.size,
    margin: opts.margin,
    errorCorrectionLevel: opts.errorCorrectionLevel,
    color: { dark: opts.darkColor, light: opts.lightColor },
  });
}

/** Génère un vrai QR code en PNG (data URL), pour téléchargement. */
export async function generateQrPngDataUrl(
  text: string,
  options: QrRenderOptions = {},
): Promise<string> {
  const opts = { ...DEFAULTS, ...options };
  return QRCode.toDataURL(text, {
    width: opts.size,
    margin: opts.margin,
    errorCorrectionLevel: opts.errorCorrectionLevel,
    color: { dark: opts.darkColor, light: opts.lightColor },
  });
}

/** Génère un vrai QR code en SVG (markup texte), pour téléchargement ou impression. */
export async function generateQrSvgMarkup(
  text: string,
  options: QrRenderOptions = {},
): Promise<string> {
  const opts = { ...DEFAULTS, ...options };
  return QRCode.toString(text, {
    type: 'svg',
    width: opts.size,
    margin: opts.margin,
    errorCorrectionLevel: opts.errorCorrectionLevel,
    color: { dark: opts.darkColor, light: opts.lightColor },
  });
}

/** Déclenche le téléchargement d'un fichier à partir d'un Blob ou d'une data URL. */
export function triggerDownload(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function safeFileName(code: string): string {
  return code.replace(/[^a-zA-Z0-9_-]/g, '-');
}

/** Nettoie une chaîne pour en faire un segment de code sûr : majuscules,
 * sans accents, uniquement [A-Z0-9-], tirets simples, sans tiret aux bords. */
function slugifySegment(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Propose un code de QR lisible (ex. `HEC-BAT-A-001`) pour un lieu donné,
 * à partir de son `code` (ou, à défaut, de son nom) et du nombre de QR déjà
 * associés à ce lieu (suffixe séquentiel -001, -002…). Reste éditable par
 * l'admin avant l'enregistrement — l'unicité réelle est garantie côté
 * Supabase (contrainte unique sur `qr_codes.code`), pas par ce calcul.
 */
export function suggestQrCode(locationLabel: string, existingCountForLocation: number): string {
  const base = slugifySegment(locationLabel) || 'LIEU';
  const seq = String(existingCountForLocation + 1).padStart(3, '0');
  return `HEC-${base}-${seq}`;
}
