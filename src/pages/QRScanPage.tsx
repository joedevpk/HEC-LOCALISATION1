import { useEffect, useState } from 'react';
import { AlertTriangle, MapPin, Navigation, QrCode as QrIcon, Users } from 'lucide-react';
import { useNavigate, useRoute } from '@/lib/router';
import { useCampus } from '@/context/CampusContext';
import { useSettings } from '@/context/SettingsContext';
import { getQRCodeByCode } from '@/lib/extension-api';
import { categoryLabel, locationIcon } from '@/lib/display';
import type { CampusLocation } from '@/lib/types';
import { Button, Logo, Spinner } from '@/components/ui';

type ScanState =
  | { status: 'loading' }
  | { status: 'not_found' }
  | { status: 'inactive' }
  | { status: 'found'; location: CampusLocation };

/**
 * Page publique, en lecture seule, affichée quand quelqu'un scanne un QR
 * code physique. Volontairement en dehors de l'AppShell : accessible sans
 * session, à tout visiteur (voir App.tsx, route '/qr-scan').
 *
 * Ne fait jamais d'écriture — voir getQRCodeByCode() dans extension-api.ts.
 */
export function QRScanPage() {
  const route = useRoute();
  const go = useNavigate();
  const { t } = useSettings();
  const { locations, loading: campusLoading } = useCampus();
  const [state, setState] = useState<ScanState>({ status: 'loading' });

  const code = route.params.get('code');

  useEffect(() => {
    let cancelled = false;

    if (!code) {
      setState({ status: 'not_found' });
      return;
    }
    // Le campus (donc `locations`) doit être chargé pour pouvoir résoudre
    // le lieu associé au QR — on attend qu'il soit prêt.
    if (campusLoading) return;

    getQRCodeByCode(code)
      .then((qr) => {
        if (cancelled) return;
        if (!qr) {
          setState({ status: 'not_found' });
          return;
        }
        if (!qr.is_active) {
          setState({ status: 'inactive' });
          return;
        }
        const loc = locations.find((l) => l.id === qr.location_id);
        if (!loc) {
          setState({ status: 'not_found' });
          return;
        }
        setState({ status: 'found', location: loc });
      })
      .catch((err) => {
        console.error('QR lookup error:', err);
        if (!cancelled) setState({ status: 'not_found' });
      });

    return () => {
      cancelled = true;
    };
  }, [code, campusLoading, locations]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex justify-center border-b border-slate-100 bg-white px-5 py-4">
        <Logo />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-8">
        {state.status === 'loading' && <Spinner label={t('common.loading')} />}

        {state.status === 'not_found' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-red-50 text-red-500">
              <QrIcon className="h-8 w-8" />
            </div>
            <p className="text-lg font-semibold text-hec-950">{t('qr.notFound')}</p>
          </div>
        )}

        {state.status === 'inactive' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-amber-50 text-amber-500">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <p className="text-lg font-semibold text-hec-950">{t('qr.inactive')}</p>
          </div>
        )}

        {state.status === 'found' && (
          <ScanResult location={state.location} onSeeOnMap={go} />
        )}
      </main>
    </div>
  );
}

function ScanResult({
  location,
  onSeeOnMap,
}: {
  location: CampusLocation;
  onSeeOnMap: (path: string, params?: Record<string, string>) => void;
}) {
  const { t } = useSettings();
  const Icon = locationIcon(location);
  const photo = location.primary_image_url ?? location.building?.primary_image_url ?? null;

  return (
    <div className="animate-fade-up">
      {photo && (
        <img
          src={photo}
          alt={location.name}
          className="mb-4 h-48 w-full rounded-2xl object-cover"
        />
      )}

      <div className="flex items-center gap-3">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white"
          style={{ background: location.building?.color ?? '#1e5eff' }}
        >
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-hec-500">
            {categoryLabel(location)}
          </p>
          <h1 className="font-display text-xl font-bold text-hec-950">
            {location.name}
          </h1>
        </div>
      </div>

      {location.description && (
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          {location.description}
        </p>
      )}

      {(location.building || location.capacity != null) && (
        <dl className="mt-4 grid grid-cols-2 gap-2.5">
          {location.building && (
            <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Bâtiment
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-hec-950">
                {location.building.name.split('—')[0].trim()}
              </dd>
            </div>
          )}
          {location.capacity != null && (
            <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Capacité
              </dt>
              <dd className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-hec-950">
                <Users className="h-3.5 w-3.5" />
                {location.capacity} places
              </dd>
            </div>
          )}
        </dl>
      )}

      <div className="mt-6 flex flex-col gap-2">
        <Button
          size="lg"
          icon={<Navigation className="h-5 w-5" />}
          onClick={() => onSeeOnMap('/map', { nav: location.id })}
        >
          {t('qr.startNavigation')}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          icon={<MapPin className="h-5 w-5" />}
          onClick={() => onSeeOnMap('/map', { loc: location.id })}
        >
          {t('common.seeOnMap')}
        </Button>
      </div>
    </div>
  );
}
