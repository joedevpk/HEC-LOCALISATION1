// Disponibilité de l'installation PWA (problème 1 — "l'installation
// n'apparaît pas comme attendu sur mobile").
//
// Le manifest, les icônes et le Service Worker sont corrects (voir audit) :
// Chrome/Edge sur Android ne proposent l'installation automatique
// ("mini-infobar") qu'après une heuristique d'engagement (visites
// répétées, temps passé sur le site) qui peut prendre plusieurs
// minutes/sessions avant de se déclencher. Rien à corriger côté
// manifest/SW : la pratique recommandée (web.dev/Chrome) est de capturer
// nous-mêmes l'événement `beforeinstallprompt` dès qu'il est disponible et
// d'offrir un déclenchement explicite (bouton), plutôt que de dépendre
// uniquement du timing du navigateur.
//
// Ce module ne remplace ni le manifest ni le Service Worker existants :
// il expose seulement, de façon fiable, la possibilité d'installer quand
// le navigateur la propose réellement (aucune icône/état inventés — si le
// navigateur ne propose rien, `isPwaInstallAvailable()` reste `false`).

import { useEffect, useState } from 'react';

/** Événement non standard (Chromium uniquement) — absent des types DOM de
 * TypeScript, donc déclaré ici explicitement plutôt que d'utiliser `any`. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

type Listener = (available: boolean) => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;
const listeners = new Set<Listener>();

function notify(): void {
  const available = deferredPrompt !== null;
  listeners.forEach((listener) => listener(available));
}

/** À appeler une seule fois, le plus tôt possible (voir main.tsx) : pose
 * les écouteurs globaux `beforeinstallprompt`/`appinstalled`. Idempotent —
 * un rappel accidentel ne pose pas de second écouteur. */
export function initPwaInstallListener(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    // Empêche la mini-infobar automatique de Chrome : on garde la main
    // pour proposer l'installation via notre propre bouton, au moment où
    // l'utilisateur le demande plutôt qu'au moment choisi par Chrome.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

/** Abonnement pour un composant React (voir usePwaInstallAvailable dans
 * SettingsPage). Retourne la fonction de désabonnement. */
export function subscribePwaInstall(listener: Listener): () => void {
  listeners.add(listener);
  listener(deferredPrompt !== null);
  return () => {
    listeners.delete(listener);
  };
}

export function isPwaInstallAvailable(): boolean {
  return deferredPrompt !== null;
}

/** Déclenche la boîte de dialogue d'installation native du navigateur.
 * Retourne `true` si l'utilisateur a accepté, `false` sinon (refus, ou
 * simplement non disponible — jamais d'erreur levée pour ce cas normal). */
export async function promptPwaInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const promptEvent = deferredPrompt;
  // Un `beforeinstallprompt` ne peut être utilisé qu'une fois : on le
  // consomme immédiatement, avant même la réponse de l'utilisateur.
  deferredPrompt = null;
  notify();
  await promptEvent.prompt();
  const choice = await promptEvent.userChoice;
  return choice.outcome === 'accepted';
}

// ---------------------------------------------------------------------
// iOS (Safari, et tout navigateur sur iOS — WebKit imposé par Apple) :
// `beforeinstallprompt` n'existe pas et n'existera jamais sur cette
// plateforme. Aucune installation programmatique n'est possible ; c'est
// une limitation d'Apple, pas un bug de l'app. La seule voie est manuelle
// (Partager -> "Sur l'écran d'accueil"), donc `isPwaInstallAvailable()`
// reste toujours `false` sur iOS : on ne peut qu'informer l'utilisateur
// de la marche à suivre, jamais déclencher quoi que ce soit à sa place.
// ---------------------------------------------------------------------

/** Détecte iOS/iPadOS. iPadOS 13+ envoie un user-agent "Macintosh" mais
 * reste tactile (`ontouchend` absent sur un vrai Mac) — vérifié en plus
 * du user-agent classique pour ne pas manquer les iPad récents. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isClassicIosUa = /iPad|iPhone|iPod/.test(ua);
  const isIpadOsAsMac = ua.includes('Macintosh') && 'ontouchend' in document;
  return isClassicIosUa || isIpadOsAsMac;
}

/** L'app tourne déjà en mode installé (icône sur l'écran d'accueil),
 * qu'on soit sur iOS (`navigator.standalone`, propriété non standard
 * Safari) ou sur les navigateurs standards (`display-mode: standalone`). */
export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

/** Hook React partagé — s'abonne à `subscribePwaInstall`. Centralisé ici
 * plutôt que dupliqué dans chaque page qui en a besoin (Réglages,
 * Accueil, Bienvenue). */
export function usePwaInstallAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => subscribePwaInstall(setAvailable), []);
  return available;
}
