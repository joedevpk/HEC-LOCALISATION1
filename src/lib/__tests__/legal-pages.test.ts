import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrivacyPage } from '@/pages/PrivacyPage';
import { TermsPage } from '@/pages/TermsPage';
import { CookiesPage } from '@/pages/CookiesPage';
import { BillingPage } from '@/pages/BillingPage';

// Rendu serveur (sans navigateur) : vérifie que chaque page légale se
// construit sans erreur et contient les mentions exigées — et aucune des
// promesses interdites.
const html = (c: Parameters<typeof createElement>[0]) => renderToStaticMarkup(createElement(c));

const FORBIDDEN = [/100\s?%\s?(sécurisé|conforme)/i, /ne partageons aucune donnée/i, /jamais conserv/i];

describe('pages légales', () => {
  const pages = {
    privacy: html(PrivacyPage),
    terms: html(TermsPage),
    cookies: html(CookiesPage),
    billing: html(BillingPage),
  };

  it('se rendent avec leur titre', () => {
    expect(pages.privacy).toContain('Politique de confidentialité');
    expect(pages.terms).toContain("Conditions d&#x27;utilisation");
    expect(pages.cookies).toContain('Politique de cookies');
    expect(pages.billing).toContain('Tarifs et paiements');
  });

  it('expliquent la géolocalisation sans prétendre à un historique GPS', () => {
    expect(pages.privacy).toContain('déterminer votre position sur la carte et faciliter la navigation');
    expect(pages.privacy).toContain("n&#x27;en conserve pas d&#x27;historique");
  });

  it('contiennent la mention obligatoire sur le guidage indicatif', () => {
    expect(pages.terms).toContain(
      'ne remplacent pas les indications de sécurité, les consignes du campus ou les instructions du personnel autorisé',
    );
  });

  it("n'inventent ni paiement ni remboursement", () => {
    expect(pages.billing).toContain('ne propose actuellement aucun achat ou abonnement payant');
    expect(pages.billing.toLowerCase()).not.toContain('remboursement fictif');
  });

  it('affichent « à renseigner » plutôt qu’un contact inventé', () => {
    expect(pages.privacy).toContain('Coordonnées officielles à renseigner');
    expect(pages.privacy).not.toMatch(/@[a-z0-9-]+\.(cd|com|org)/i);
  });

  it('ne contiennent aucune fausse promesse', () => {
    for (const [name, page] of Object.entries(pages)) {
      for (const re of FORBIDDEN) expect(page, `${name} ${re}`).not.toMatch(re);
    }
  });
});
