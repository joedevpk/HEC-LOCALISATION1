// ---------------------------------------------------------------------
// Informations légales configurables — JAMAIS inventées.
//
// Les coordonnées officielles et l'identité du responsable du service
// ne sont pas connues du code : elles sont fournies par l'établissement
// via des variables d'environnement PUBLIQUES (Vite). Tant qu'elles sont
// absentes, les pages affichent un encart « à renseigner » au lieu d'un
// contact fictif, et la page /admin/compliance le signale « À vérifier ».
//
//   VITE_CONTACT_EMAIL     ex. l'adresse officielle de contact
//   VITE_CONTACT_PHONE     (optionnel)
//   VITE_CONTACT_ADDRESS   (optionnel) adresse postale officielle
//   VITE_LEGAL_ENTITY      (optionnel) dénomination officielle du
//                          responsable du service, si différente de
//                          « Haute École de Commerce de Kinshasa »
// ---------------------------------------------------------------------

function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export const legalConfig = {
  institutionName: 'Haute École de Commerce de Kinshasa',
  entity: clean(import.meta.env.VITE_LEGAL_ENTITY),
  contactEmail: clean(import.meta.env.VITE_CONTACT_EMAIL),
  contactPhone: clean(import.meta.env.VITE_CONTACT_PHONE),
  contactAddress: clean(import.meta.env.VITE_CONTACT_ADDRESS),
  /** Date de dernière rédaction des textes légaux (mettre à jour à chaque modification de fond). */
  lastUpdated: '30 septembre 2026',
};

export const hasOfficialContact = legalConfig.contactEmail !== null;

/** Clés de stockage local réellement utilisées (documentées sur /cookies). */
export const STORAGE_KEYS = {
  settings: 'hec-settings',
  privacyPrefs: 'hec-privacy-prefs',
  pwaBannerDismissed: 'hec_pwa_banner_dismissed',
  onboardingSeenPrefix: 'hec_onboarding_seen_',
  oauthPending: 'hec_oauth_pending',
  chunkReload: 'hec:chunk-reload',
} as const;
