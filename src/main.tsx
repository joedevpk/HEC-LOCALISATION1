import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from '@/context/AuthContext';
import { CampusProvider } from '@/context/CampusContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { bootstrapDeepLinks } from '@/lib/router';
import { initPwaInstallListener } from '@/lib/pwa-install';
import { installGlobalErrorHandlers } from '@/lib/logger';

// Doit s'exécuter avant le premier rendu : traduit un lien physique de QR
// code (/qr/:code) en route interne (#/qr-scan?code=...).
installGlobalErrorHandlers();
bootstrapDeepLinks();

// Le plus tôt possible également : Chrome peut émettre
// `beforeinstallprompt` dès les premiers instants de la page, avant même
// le premier rendu React (voir src/lib/pwa-install.ts).
initPwaInstallListener();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <SettingsProvider>
        <CampusProvider>
          <App />
        </CampusProvider>
      </SettingsProvider>
    </AuthProvider>
  </StrictMode>,
);
