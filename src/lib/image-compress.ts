// ---------------------------------------------------------------------
// Préparation des images avant envoi (PHASE 6, règles 14 et 15).
//
// - Formats acceptés : JPEG, PNG, WebP, AVIF (les mêmes que le bucket
//   Storage — la limite est aussi imposée CÔTÉ SERVEUR par la migration
//   20260930090000, jamais uniquement ici).
// - Une photo de téléphone (5–12 Mo) est redimensionnée (1920 px max) et
//   convertie en WebP : typiquement 200–600 Ko.
// - Limite finale : 5 Mo (MAX_IMAGE_BYTES). Avant compression on accepte
//   jusqu'à 25 Mo pour ne pas rejeter une photo brute d'appareil récent.
// ---------------------------------------------------------------------

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
/** Taille maximale d'une image ENVOYÉE (après compression). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Taille maximale d'un avatar (aucun envoi d'avatar n'existe encore :
 * constante prévue pour le jour où la fonctionnalité sera ajoutée). */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
/** Taille maximale acceptée AVANT compression. */
export const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;

const MAX_DIMENSION = 1920;
const KEEP_AS_IS_BYTES = 600 * 1024;

export class ImageValidationError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_IMAGE_TYPE' | 'IMAGE_TOO_LARGE' | 'IMAGE_DECODE_FAILED',
  ) {
    super(message);
    this.name = 'ImageValidationError';
  }
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* repli sur <img> ci-dessous */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('decode'));
      img.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Valide puis compresse une image. Renvoie un `File` prêt à l'envoi
 * (WebP quand le navigateur sait l'encoder, sinon JPEG). Lève une
 * `ImageValidationError` explicite (jamais de rejet silencieux).
 */
export async function prepareImageForUpload(
  file: File,
  maxBytes: number = MAX_IMAGE_BYTES,
): Promise<File> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new ImageValidationError(
      "Format d'image non supporté (utilisez JPEG, PNG, WebP ou AVIF).",
      'INVALID_IMAGE_TYPE',
    );
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new ImageValidationError(
      'Image trop volumineuse (25 Mo maximum avant compression).',
      'IMAGE_TOO_LARGE',
    );
  }

  // Déjà légère et dans un format web : on ne la dégrade pas.
  if (file.size <= KEEP_AS_IS_BYTES && (file.type === 'image/webp' || file.type === 'image/avif' || file.type === 'image/jpeg')) {
    return file;
  }

  let decoded: Awaited<ReturnType<typeof decode>>;
  try {
    decoded = await decode(file);
  } catch {
    // Impossible de décoder (ex. AVIF non supporté par ce navigateur) :
    // on n'envoie l'original que s'il respecte déjà la limite.
    if (file.size <= maxBytes) return file;
    throw new ImageValidationError(
      `Image illisible par ce navigateur et supérieure à ${Math.round(maxBytes / 1048576)} Mo.`,
      'IMAGE_DECODE_FAILED',
    );
  }

  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(decoded.width, decoded.height));
    let width = Math.max(1, Math.round(decoded.width * scale));
    let height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement('canvas');
    const attempts: Array<{ quality: number; shrink: number }> = [
      { quality: 0.82, shrink: 1 },
      { quality: 0.72, shrink: 1 },
      { quality: 0.68, shrink: 0.8 },
      { quality: 0.6, shrink: 0.65 },
    ];
    let best: Blob | null = null;
    for (const attempt of attempts) {
      const w = Math.max(1, Math.round(width * attempt.shrink));
      const h = Math.max(1, Math.round(height * attempt.shrink));
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) break;
      ctx.drawImage(decoded.source, 0, 0, w, h);
      let blob = await toBlob(canvas, 'image/webp', attempt.quality);
      // Certains navigateurs ignorent webp et renvoient du PNG (lourd).
      if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', attempt.quality);
      if (!blob) break;
      best = blob;
      // Objectif raisonnable : ~1 Mo ; on s'arrête dès que c'est atteint.
      if (blob.size <= 1024 * 1024) break;
    }
    width = height = 0;
    if (!best) {
      if (file.size <= maxBytes) return file;
      throw new ImageValidationError('Compression de l\'image impossible.', 'IMAGE_DECODE_FAILED');
    }
    // Ne renvoie jamais un fichier plus gros que l'original déjà acceptable.
    if (best.size >= file.size && file.size <= maxBytes) return file;
    if (best.size > maxBytes) {
      throw new ImageValidationError(
        `Image trop volumineuse (${Math.round(maxBytes / 1048576)} Mo maximum).`,
        'IMAGE_TOO_LARGE',
      );
    }
    const ext = best.type === 'image/webp' ? 'webp' : 'jpg';
    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([best], `${base}.${ext}`, { type: best.type, lastModified: Date.now() });
  } finally {
    decoded.close?.();
  }
}
