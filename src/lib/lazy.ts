import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { logWarn } from '@/lib/logger';

const RELOAD_FLAG = 'hec:chunk-reload';

/**
 * `React.lazy` robuste pour une PWA : après un déploiement, les anciens
 * fichiers JS hachés n'existent plus ("Failed to fetch dynamically
 * imported module"). On retente une fois, puis on recharge la page UNE
 * seule fois (drapeau en sessionStorage, jamais de boucle) pour récupérer
 * la nouvelle version — au lieu d'un écran d'erreur définitif.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (firstError) {
      try {
        await new Promise((r) => setTimeout(r, 400));
        return await factory();
      } catch (secondError) {
        logWarn('chunk.load', secondError);
        try {
          if (typeof window !== 'undefined' && !sessionStorage.getItem(RELOAD_FLAG)) {
            sessionStorage.setItem(RELOAD_FLAG, '1');
            window.location.reload();
            // Promesse volontairement jamais résolue : la page se recharge.
            return await new Promise<never>(() => undefined);
          }
        } catch {
          /* sessionStorage indisponible : on laisse l'ErrorBoundary afficher [Réessayer] */
        }
        throw firstError;
      }
    }
  });
}

/** À appeler quand l'app a démarré correctement : réarme le rechargement auto. */
export function clearChunkReloadFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* ignoré */
  }
}
