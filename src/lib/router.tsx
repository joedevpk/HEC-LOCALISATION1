import { useCallback, useEffect, useState } from 'react';

export interface Route {
  path: string;
  params: URLSearchParams;
}

// Les QR codes physiques pointent vers une VRAIE URL de chemin
// (ex: https://mon-domaine/qr/HEC-BAT-A-001), pas vers une route en hash.
// L'hébergeur statique doit rediriger ce chemin vers index.html (SPA
// fallback) — voir le README ajouté pour la config Vercel/Netlify/nginx.
// Une fois index.html chargé, ce pont convertit ce chemin physique en
// route interne en hash (#/qr-scan?code=...) AVANT le premier rendu React,
// pour que le routeur (basé sur location.hash) prenne le relais normalement.
const PHYSICAL_QR_PATH = /^\/qr\/([^/]+)\/?$/;

export function bootstrapDeepLinks(): void {
  if (window.location.hash) return; // une route en hash existe déjà, ne rien faire
  const match = window.location.pathname.match(PHYSICAL_QR_PATH);
  if (!match) return;
  const code = decodeURIComponent(match[1]);
  const query = new URLSearchParams({ code }).toString();
  // replaceState d'abord pour nettoyer la barre d'adresse, puis on fixe le
  // hash : évite une entrée d'historique intermédiaire inutile.
  window.history.replaceState(null, '', '/');
  window.location.hash = `/qr-scan?${query}`;
}

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path: path || '/', params: new URLSearchParams(query) };
}

export function navigate(path: string, params?: Record<string, string>) {
  const query = params
    ? '?' + new URLSearchParams(params).toString()
    : '';
  window.location.hash = path + query;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const handler = () => setRoute(parseHash());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  return route;
}

export function useNavigate() {
  return useCallback(
    (path: string, params?: Record<string, string>) => navigate(path, params),
    [],
  );
}
