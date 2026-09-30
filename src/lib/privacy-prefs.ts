// ---------------------------------------------------------------------
// Préférences de confidentialité de l'appareil (stockage local).
//
// Une seule préférence existe, et elle correspond à un VRAI
// comportement de l'application : enregistrer ou non, côté serveur,
// les recherches effectuées par un utilisateur connecté (table
// `search_history`, voir logSearch dans api.ts). Par défaut : activé
// (comportement historique de l'application).
//
// Stockée uniquement sur cet appareil (`hec-privacy-prefs`) : elle n'est
// envoyée à aucun serveur.
// ---------------------------------------------------------------------
import { STORAGE_KEYS } from '@/lib/legal-config';

export interface PrivacyPrefs {
  /** Enregistrer mes recherches dans mon compte (historique). */
  saveSearchHistory: boolean;
}

export const defaultPrivacyPrefs: PrivacyPrefs = { saveSearchHistory: true };

export function readPrivacyPrefs(): PrivacyPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.privacyPrefs);
    if (!raw) return defaultPrivacyPrefs;
    const parsed = JSON.parse(raw) as Partial<PrivacyPrefs>;
    return {
      saveSearchHistory:
        typeof parsed.saveSearchHistory === 'boolean'
          ? parsed.saveSearchHistory
          : defaultPrivacyPrefs.saveSearchHistory,
    };
  } catch {
    return defaultPrivacyPrefs;
  }
}

export function writePrivacyPrefs(prefs: PrivacyPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEYS.privacyPrefs, JSON.stringify(prefs));
  } catch {
    /* stockage indisponible : la préférence reste celle par défaut */
  }
}
