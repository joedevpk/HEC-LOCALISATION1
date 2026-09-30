import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const base = 'public/images';

function svg(title, c1, c2) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
    <radialGradient id="r" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="white" stop-opacity="0.1"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#g)"/>
  <circle cx="1200" cy="300" r="400" fill="url(#r)"/>
  <circle cx="400" cy="600" r="300" fill="url(#r)"/>
  <text x="800" y="450" text-anchor="middle" font-family="sans-serif" font-size="56" font-weight="700" fill="white" opacity="0.12">${title}</text>
</svg>`;
}

function square(title, c1, c2) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <text x="400" y="420" text-anchor="middle" font-family="sans-serif" font-size="48" font-weight="700" fill="white" opacity="0.15">${title}</text>
</svg>`;
}

const files = {
  'hero/hero-1.svg': ['Ministère de l\'Entrepreneuriat', '#1736e1', '#13b6a1'],
  'hero/hero-2.svg': ['Innovation & Formation', '#1a2e8f', '#1736e1'],
  'hero/hero-3.svg': ['Incubateur HEC Kinshasa', '#0c756e', '#1736e1'],
  'hero/about-1.svg': ['À Propos', '#1736e1', '#1a2e8f'],
  'hero/vision-1.svg': ['Vision', '#0c756e', '#1736e1'],
  'hero/mission-1.svg': ['Mission', '#1a2e8f', '#13b6a1'],
  'hero/cabinet-1.svg': ['Cabinet', '#1736e1', '#eab407'],
  'hero/commissions-1.svg': ['Commissions', '#0c756e', '#1a2e8f'],
  'hero/piliers-1.svg': ['Nos Piliers', '#1736e1', '#13b6a1'],
  'hero/plan-1.svg': ['Plan d\'Action', '#1a2e8f', '#eab407'],
  'hero/innovation-1.svg': ['Innovation', '#0c756e', '#1736e1'],
  'hero/incubateur-1.svg': ['Incubateur', '#1736e1', '#13b6a1'],
  'hero/formations-1.svg': ['Formations', '#1a2e8f', '#1736e1'],
  'hero/projets-1.svg': ['Projets', '#0c756e', '#eab407'],
  'hero/actualites-1.svg': ['Actualités', '#1736e1', '#1a2e8f'],
  'hero/galerie-1.svg': ['Galerie', '#0c756e', '#13b6a1'],
  'hero/partenaires-1.svg': ['Partenaires', '#1736e1', '#eab407'],
  'hero/evenements-1.svg': ['Événements', '#1a2e8f', '#0c756e'],
  'hero/faq-1.svg': ['FAQ', '#1736e1', '#13b6a1'],
  'hero/contact-1.svg': ['Contact', '#0c756e', '#1736e1'],
  'hero/login-1.svg': ['Connexion', '#1a2e8f', '#1736e1'],
  'hero/register-1.svg': ['Inscription', '#1736e1', '#13b6a1'],
  'hero/forgot-1.svg': ['Mot de passe oublié', '#0c756e', '#1a2e8f'],
  'backgrounds/bg-1.svg': ['Background', '#0f172a', '#1736e1'],
  'backgrounds/bg-2.svg': ['Background', '#1a2e8f', '#0c756e'],
  'backgrounds/cta-bg.svg': ['Rejoignez-nous', '#1736e1', '#eab407'],
  'backgrounds/mesh-bg.svg': ['Mesh', '#0f172a', '#1a2e8f'],
  'formations/form-1.svg': ['Entrepreneuriat', '#1736e1', '#13b6a1'],
  'formations/form-2.svg': ['Innovation', '#0c756e', '#1736e1'],
  'formations/form-3.svg': ['Leadership', '#1a2e8f', '#eab407'],
  'formations/form-4.svg': ['Management', '#1736e1', '#1a2e8f'],
  'formations/form-5.svg': ['Finance', '#0c756e', '#eab407'],
  'formations/form-6.svg': ['Marketing Digital', '#1736e1', '#13b6a1'],
  'cabinet/cab-1.svg': ['Cabinet', '#1736e1', '#13b6a1'],
  'cabinet/cab-2.svg': ['Ministre', '#1a2e8f', '#1736e1'],
  'cabinet/cab-3.svg': ['Vice-Ministre', '#0c756e', '#eab407'],
  'cabinet/cab-4.svg': ['Directeur', '#1736e1', '#1a2e8f'],
  'gallery/gal-1.svg': ['Gallery', '#1736e1', '#0c756e'],
  'gallery/gal-2.svg': ['Gallery', '#0c756e', '#eab407'],
  'gallery/gal-3.svg': ['Gallery', '#1a2e8f', '#13b6a1'],
  'gallery/gal-4.svg': ['Gallery', '#1736e1', '#eab407'],
  'gallery/gal-5.svg': ['Gallery', '#13b6a1', '#1a2e8f'],
  'gallery/gal-6.svg': ['Gallery', '#eab407', '#1736e1'],
  'partners/part-1.svg': ['Partner', '#1736e1', '#13b6a1'],
  'partners/part-2.svg': ['Partner', '#1a2e8f', '#eab407'],
  'partners/part-3.svg': ['Partner', '#0c756e', '#1736e1'],
  'partners/part-4.svg': ['Partner', '#1736e1', '#1a2e8f'],
  'partners/part-5.svg': ['Partner', '#eab407', '#0c756e'],
  'partners/part-6.svg': ['Partner', '#13b6a1', '#1a2e8f'],
  'events/ev-1.svg': ['Event', '#1736e1', '#13b6a1'],
  'events/ev-2.svg': ['Event', '#0c756e', '#eab407'],
  'events/ev-3.svg': ['Event', '#1a2e8f', '#1736e1'],
  'news/news-1.svg': ['News', '#1736e1', '#13b6a1'],
  'news/news-2.svg': ['News', '#0c756e', '#1736e1'],
  'news/news-3.svg': ['News', '#1a2e8f', '#eab407'],
  'news/news-4.svg': ['News', '#1736e1', '#0c756e'],
  'projects/proj-1.svg': ['Project', '#1736e1', '#13b6a1'],
  'projects/proj-2.svg': ['Project', '#0c756e', '#eab407'],
  'projects/proj-3.svg': ['Project', '#1a2e8f', '#1736e1'],
};

for (const [path, [title, c1, c2]] of Object.entries(files)) {
  const fullPath = join(base, path);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  const isSquare = path.startsWith('cabinet/') || path.startsWith('partners/');
  writeFileSync(fullPath, isSquare ? square(title, c1, c2) : svg(title, c1, c2));
  console.log('Created', path);
}
console.log('All placeholder images created.');
