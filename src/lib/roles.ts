import type { Role } from './types';

/** Rôles ayant accès à /admin (ÉTAPE 6). */
export const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'CAMPUS_MANAGER'];

/**
 * Rôles ayant un accès administratif complet, notamment la gestion des
 * utilisateurs et l'attribution de rôles — contrairement à CAMPUS_MANAGER,
 * qui gère le campus (bâtiments, salles, cartographie, photos) mais pas
 * nécessairement les comptes utilisateurs (ÉTAPE 6).
 */
export const FULL_ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN'];

export function isAdminRole(role: Role | null | undefined): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

export function isFullAdminRole(role: Role | null | undefined): boolean {
  return !!role && FULL_ADMIN_ROLES.includes(role);
}

export function isSuperAdmin(role: Role | null | undefined): boolean {
  return role === 'SUPER_ADMIN';
}

/** Où envoyer l'utilisateur juste après connexion, selon son rôle (ÉTAPE 3). */
export function homeRouteForRole(role: Role | null | undefined): string {
  return isAdminRole(role) ? '/admin' : '/dashboard';
}
