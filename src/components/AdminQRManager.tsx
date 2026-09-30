import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, MapPin, Plus, Power, QrCode, RefreshCw, Trash2 } from 'lucide-react';
import type { PostgrestError } from '@supabase/supabase-js';
import { useCampus } from '@/context/CampusContext';
import { Button, EmptyState } from '@/components/ui';
import { kindLabels } from '@/lib/display';
import { createQRCode, deleteQRCode, getQRCodes, toggleQRCode } from '@/lib/extension-api';
import { buildQrUrl, renderQrToCanvas, suggestQrCode } from '@/lib/qr-utils';

interface QRItem {
  id: string;
  location_id: string;
  code: string;
  is_active: boolean;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as PostgrestError).code === '23505';
}

/** Aperçu live (canvas) du QR en cours de création — mêmes utilitaires que
 * QRPage, pour confirmer visuellement avant l'enregistrement. Le canvas
 * n'existe que si `code` est renseigné, un ref callback (state) suffit donc
 * à déclencher le rendu dès qu'il apparaît. */
function LivePreview({ code }: { code: string }) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvas || !code) return;
    let cancelled = false;
    renderQrToCanvas(canvas, buildQrUrl(code), { size: 160, margin: 1 }).catch((err) => {
      if (!cancelled) console.error('QR preview error:', err);
    });
    return () => {
      cancelled = true;
    };
  }, [canvas, code]);

  if (!code) {
    return (
      <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl border border-dashed border-slate-200 text-slate-300">
        <QrCode className="h-6 w-6" />
      </div>
    );
  }

  return (
    <canvas
      ref={setCanvas}
      width={80}
      height={80}
      style={{ width: 80, height: 80 }}
      className="shrink-0 rounded-xl border border-slate-100 bg-white"
      aria-label="Aperçu du QR code"
    />
  );
}

export function AdminQRManager() {
  const { locations } = useCampus();
  const [codes, setCodes] = useState<QRItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [locationId, setLocationId] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Les lieux archivés ne doivent pas recevoir de nouveau QR — useCampus()
  // les exclut déjà par défaut, le filtre ici est une sécurité en plus.
  const activeLocations = locations
    .filter((l) => !l.archived_at)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const reload = async () => {
    setLoading(true);
    try {
      setCodes(await getQRCodes());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const suggestFor = (locId: string) => {
    const loc = locations.find((l) => l.id === locId);
    if (!loc) return '';
    const existingCount = codes.filter((c) => c.location_id === locId).length;
    return suggestQrCode(loc.code || loc.name, existingCount);
  };

  const startCreate = () => {
    const firstId = activeLocations[0]?.id ?? '';
    setLocationId(firstId);
    setCode(firstId ? suggestFor(firstId) : '');
    setCodeTouched(false);
    setError(null);
    setCreating(true);
  };

  const cancelCreate = () => {
    setCreating(false);
    setError(null);
  };

  const handleLocationChange = (id: string) => {
    setLocationId(id);
    // Tant que l'admin n'a pas touché au champ "Code" à la main, on garde le
    // code synchronisé avec le lieu sélectionné.
    if (!codeTouched) setCode(suggestFor(id));
  };

  const regenerate = () => {
    if (!locationId) return;
    setCode(suggestFor(locationId));
    setCodeTouched(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!locationId || !trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createQRCode(locationId, trimmed);
      setCodes((prev) => [created, ...prev]);
      setCreating(false);
    } catch (err) {
      if (isUniqueViolation(err)) {
        setError('Ce code existe déjà. Modifiez-le ou régénérez-en un autre.');
      } else {
        setError(err instanceof Error ? err.message : 'Création impossible.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    await toggleQRCode(id, active);
    setCodes((prev) => prev.map((c) => (c.id === id ? { ...c, is_active: active } : c)));
  };

  const handleDelete = async (qr: QRItem) => {
    const loc = locations.find((l) => l.id === qr.location_id);
    if (
      !confirm(
        `Supprimer définitivement le QR "${qr.code}" (${loc?.name ?? 'lieu inconnu'}) ? Un exemplaire déjà imprimé ne mènera plus nulle part. Cette action est irréversible.`,
      )
    )
      return;
    try {
      await deleteQRCode(qr.id);
      setCodes((prev) => prev.filter((c) => c.id !== qr.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <QrCode className="h-4 w-4 text-hec-500" />
          <h2 className="font-display text-lg font-bold text-hec-950">QR codes</h2>
        </div>
        {!creating && (
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={startCreate}
            disabled={activeLocations.length === 0}
          >
            Nouveau QR code
          </Button>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Associez un code à un lieu pour obtenir un QR scannable. L'image n'est
        jamais stockée : elle est redessinée à l'affichage à partir du code
        enregistré ici.
      </p>

      {activeLocations.length === 0 && !loading && (
        <div className="mt-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-700">
          Ajoutez d'abord un lieu (onglet « Salles &amp; lieux ») avant de créer un QR code.
        </div>
      )}

      {creating && (
        <form
          onSubmit={submit}
          className="mt-4 space-y-4 rounded-2xl border border-slate-100 bg-white p-5"
        >
          <div className="flex items-start gap-4">
            <div className="flex-1 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Lieu
                </span>
                <select
                  value={locationId}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-hec-950 focus:border-hec-400 focus:outline-none focus:ring-4 focus:ring-hec-100"
                >
                  {activeLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} · {kindLabels[l.kind] ?? l.kind}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Code
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setCodeTouched(true);
                    }}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-sm font-medium text-hec-950 focus:border-hec-400 focus:outline-none focus:ring-4 focus:ring-hec-100"
                  />
                  <button
                    type="button"
                    onClick={regenerate}
                    title="Régénérer une suggestion"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-hec-600"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
              </label>
            </div>

            <div className="pt-6">
              <LivePreview code={code.trim()} />
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-600">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={cancelCreate}>
              Annuler
            </Button>
            <Button type="submit" size="sm" loading={saving}>
              Générer
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </p>
      ) : codes.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<QrCode className="h-5 w-5" />}
            title="Aucun QR code"
            description="Créez le premier QR code pour un lieu du campus."
          />
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {codes.map((qr) => {
            const loc = locations.find((l) => l.id === qr.location_id);
            return (
              <div
                key={qr.id}
                className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3.5"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
                  <MapPin className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-hec-950">
                    {loc?.name ?? 'Lieu inconnu'}
                  </p>
                  <p className="truncate font-mono text-xs text-slate-500">{qr.code}</p>
                </div>
                <button
                  onClick={() => handleToggle(qr.id, !qr.is_active)}
                  title={qr.is_active ? 'Désactiver' : 'Activer'}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    qr.is_active
                      ? 'border-emerald-100 text-emerald-600 hover:bg-emerald-50'
                      : 'border-slate-200 text-slate-400 hover:bg-slate-50'
                  }`}
                >
                  <Power className="h-3.5 w-3.5" />
                  {qr.is_active ? 'Actif' : 'Inactif'}
                </button>
                <button
                  onClick={() => handleDelete(qr)}
                  title="Supprimer définitivement"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
