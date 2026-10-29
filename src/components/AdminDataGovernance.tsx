import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, BadgeCheck, Download, ExternalLink, FileUp, Loader2, RotateCcw } from 'lucide-react';
import {
  archiveBuilding, archiveLocation, getAuditLog, getBuildings, getLocations, importCampusData,
  restoreBuilding, restoreLocation, setVerificationStatus, type AuditEntry,
} from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { isFullAdminRole } from '@/lib/roles';
import { VerificationBadge } from '@/components/VerificationBadge';
import { COORD_ISSUE_LABEL, buildInventory, type InventoryRow } from '@/lib/data-quality';
import { csvTemplate, parseCsv, validateImport, type ImportPreview } from '@/lib/csv-import';
import type { Building, Campus, CampusLocation } from '@/lib/types';

type Tab = 'quality' | 'import' | 'audit';
type Filter = 'all' | 'unconfirmed' | 'demo' | 'suspicious' | 'nophoto' | 'archived';

const btn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-hec-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500 disabled:opacity-50';

const ACTION_LABEL: Record<string, string> = {
  create: 'Création', update: 'Modification', delete: 'Suppression', archive: 'Archivage', restore: 'Restauration',
  validate: 'Validation', status_change: 'Changement de statut', move: 'Déplacement (coordonnées)', replace_photo: 'Photo remplacée', import: 'Import CSV',
};
const ENTITY_LABEL: Record<string, string> = {
  buildings: 'Bâtiment', locations: 'Salle / lieu', floors: 'Étage', building_images: 'Photo de bâtiment', location_images: 'Photo de salle', campus_data: 'Données du campus',
};

export function AdminDataGovernance({ campus }: { campus: Campus }) {
  const { profile } = useAuth();
  const isValidator = isFullAdminRole(profile?.role);
  const [tab, setTab] = useState<Tab>('quality');
  const tabs: Array<[Tab, string]> = [['quality', 'Qualité des données'], ['import', 'Import CSV'], ['audit', 'Journal d’audit']];
  return (
    <div className="mt-6 min-w-0">
      <div role="tablist" aria-label="Gouvernance des données" className="flex flex-wrap gap-2">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`min-h-11 rounded-lg px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500 ${tab === k ? 'bg-hec-950 text-white' : 'border border-slate-300 bg-white text-hec-800'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'quality' && <QualityTab campus={campus} isValidator={isValidator} />}
      {tab === 'import' && <ImportTab campus={campus} />}
      {tab === 'audit' && <AuditTab isValidator={isValidator} />}
    </div>
  );
}

function useCampusData(campus: Campus) {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [locations, setLocations] = useState<CampusLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [b, l] = await Promise.all([getBuildings(campus.id, true), getLocations(true)]);
      setBuildings(b); setLocations(l);
    } catch (e) { setError(e instanceof Error ? e.message : 'Chargement impossible.'); }
    finally { setLoading(false); }
  }, [campus.id]);
  useEffect(() => { void reload(); }, [reload]);
  return { buildings, locations, loading, error, reload };
}

function QualityTab({ campus, isValidator }: { campus: Campus; isValidator: boolean }) {
  const { buildings, locations, loading, error, reload } = useCampusData(campus);
  const [filter, setFilter] = useState<Filter>('unconfirmed');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const inv = useMemo(() => buildInventory(buildings, locations, [campus.center_lng, campus.center_lat]), [buildings, locations, campus]);
  const rows = inv.rows.filter((r) =>
    filter === 'all' ? true : filter === 'archived' ? r.archived
    : r.archived ? false
    : filter === 'unconfirmed' ? !r.status.confirmed : filter === 'demo' ? r.demo
    : filter === 'suspicious' ? r.issues.length > 0 : !r.hasPhoto);
  const byId = useMemo(() => new Map<string, Building | CampusLocation>([...buildings, ...locations].map((e) => [e.id, e])), [buildings, locations]);

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setActionError(null);
    try { await fn(); await reload(); } catch (e) { setActionError(e instanceof Error ? e.message : 'Action impossible.'); } finally { setBusy(null); }
  };
  const t = inv.totals;
  const cards: Array<[string, number]> = [
    ['Bâtiments', t.buildings], ['Salles / lieux', t.locations], ['Validés', t.validated], ['Non validés', t.pending],
    ['Données de démonstration', t.demo], ['Sans photo', t.withoutPhoto], ['Coordonnées suspectes', t.suspicious], ['Archivés', t.archived],
  ];
  return (
    <div className="mt-4 min-w-0">
      <p className="text-sm text-slate-700">
        Inventaire en lecture seule : rien n’est modifié tant que vous ne cliquez pas sur une action. Une donnée « non validée » reste visible
        du public, mais signalée comme non confirmée.
      </p>
      {loading ? <p className="mt-4 flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</p> : error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : (
        <>
          {buildings.length > 0 && buildings.every((b) => b.verification_status === undefined) && (
            <p role="status" className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Les colonnes de validation n’existent pas encore : appliquez les migrations 20261026090000 puis 20261027090000. Tout est considéré comme non validé.
            </p>
          )}
          <dl className="mt-4 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr))]">
            {cards.map(([label, n]) => (
              <div key={label} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
                <dt className="text-xs font-medium text-slate-600">{label}</dt>
                <dd className="font-display text-2xl font-bold text-hec-950">{n}</dd>
              </div>
            ))}
          </dl>
          <label className="mt-4 block text-sm font-medium text-slate-700">Afficher
            <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="mt-1 block min-h-11 w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 text-sm sm:w-auto">
              <option value="unconfirmed">À valider (non confirmés)</option><option value="demo">Données de démonstration</option>
              <option value="suspicious">Coordonnées suspectes</option><option value="nophoto">Sans photo</option>
              <option value="archived">Archivés</option><option value="all">Tout</option>
            </select>
          </label>
          {actionError && <p role="alert" className="mt-3 break-words rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}
          {!isValidator && <p className="mt-3 text-xs text-slate-600">La validation est réservée aux administrateurs ; vous pouvez saisir, corriger et archiver.</p>}
          {rows.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-700">Aucun élément pour ce filtre.</p> : (
            <ul className="mt-3 space-y-2">
              {rows.map((r) => <Row key={`${r.kind}-${r.id}`} r={r} entity={byId.get(r.id)} isValidator={isValidator} busy={busy} act={act} />)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Row({ r, entity, isValidator, busy, act }: {
  r: InventoryRow; entity: Building | CampusLocation | undefined; isValidator: boolean; busy: string | null;
  act: (key: string, fn: () => Promise<void>) => Promise<void>;
}) {
  const table = r.kind === 'building' ? 'buildings' : 'locations';
  const key = `${r.kind}-${r.id}`;
  const lng = r.kind === 'building' ? (entity as Building | undefined)?.center_lng : (entity as CampusLocation | undefined)?.lng;
  const lat = r.kind === 'building' ? (entity as Building | undefined)?.center_lat : (entity as CampusLocation | undefined)?.lat;
  return (
    <li className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">{r.kind === 'building' ? 'Bâtiment' : 'Salle / lieu'}</span>
        <span className="min-w-0 break-words font-semibold text-hec-950">{r.name}</span>
        {r.code && <span className="text-xs text-slate-600">{r.code}</span>}
        <VerificationBadge entity={entity} />
      </div>
      {r.issues.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs font-medium text-amber-900">
          {r.issues.map((i) => <li key={i} className="flex items-start gap-1"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{COORD_ISSUE_LABEL[i]}</li>)}
        </ul>
      )}
      {!r.hasPhoto && !r.archived && <p className="mt-1 text-xs text-slate-600">Photo non disponible.</p>}
      {lng !== undefined && lat !== undefined && (
        <p className="mt-1 break-words text-xs text-slate-600">
          {lat.toFixed(6)}, {lng.toFixed(6)} ·{' '}
          <a className="inline-flex items-center gap-1 font-semibold text-hec-700 underline" target="_blank" rel="noopener noreferrer"
            href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=19/${lat}/${lng}`}>Vérifier sur la carte <ExternalLink className="h-3 w-3" /></a>
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {isValidator && !r.archived && (
          <button className={btn} disabled={!!busy} onClick={() => void act(key, () => setVerificationStatus(table, r.id, r.status.status === 'validated' ? 'pending' : 'validated'))}>
            {busy === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
            {r.status.status === 'validated' ? 'Retirer la validation' : 'Valider'}
          </button>
        )}
        {r.archived ? (
          <button className={btn} disabled={!!busy} onClick={() => void act(key, () => (r.kind === 'building' ? restoreBuilding(r.id) : restoreLocation(r.id)))}><RotateCcw className="h-4 w-4" /> Restaurer</button>
        ) : (
          <button className={btn} disabled={!!busy} onClick={() => { if (confirm(`Archiver « ${r.name} » ? Il sera masqué du public et restaurable.`)) void act(key, () => (r.kind === 'building' ? archiveBuilding(r.id) : archiveLocation(r.id))); }}><Archive className="h-4 w-4" /> Archiver</button>
        )}
      </div>
    </li>
  );
}

function ImportTab({ campus }: { campus: Campus }) {
  const { buildings, locations, loading, error, reload } = useCampusData(campus);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [fail, setFail] = useState<string | null>(null);

  const ctx = useMemo(() => {
    const live = buildings.filter((b) => !b.archived_at);
    const codeById = new Map(live.map((b) => [b.id, b.code.trim().toLowerCase()]));
    return {
      campusCenter: [campus.center_lng, campus.center_lat] as [number, number],
      existingBuildingCodes: new Set(live.map((b) => b.code.trim().toLowerCase())),
      existingRoomKeys: new Set(locations.filter((l) => !l.archived_at && l.building_id && l.code).map((l) => `${codeById.get(l.building_id as string) ?? ''}|${l.code.trim().toLowerCase()}`)),
    };
  }, [buildings, locations, campus]);

  const onFile = async (f: File | undefined) => {
    setPreview(null); setResult(null); setFail(null); setConfirmed(false);
    if (!f) return;
    setFileName(f.name);
    const text = await f.text();
    setPreview(validateImport(parseCsv(text), ctx, f.size));
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csvTemplate()], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'modele-import-hec.csv'; a.click(); URL.revokeObjectURL(url);
  };
  const run = async () => {
    if (!preview?.canImport) return;
    setBusy(true); setFail(null);
    try {
      const r = await importCampusData({ campus_id: campus.id, buildings: preview.buildings, rooms: preview.rooms });
      setResult(`Import réussi : ${r.buildings_created} bâtiment(s), ${r.rooms_created} salle(s), ${r.floors_created} étage(s) créés — tous « en attente de validation ».`);
      setPreview(null); setConfirmed(false); await reload();
    } catch (e) {
      setFail(`${e instanceof Error ? e.message : 'Import refusé.'} Aucune donnée n'a été écrite.`);
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-4 min-w-0">
      <p className="text-sm text-slate-700">
        Importez des bâtiments et des salles depuis un CSV (format : <code>docs/IMPORT_CSV.md</code>). Les coordonnées sont obligatoires et jamais déduites.
        Tout est vérifié avant écriture ; l’écriture est « tout ou rien », et les données importées restent <strong>non validées</strong> jusqu’à revue.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={btn} onClick={download}><Download className="h-4 w-4" /> Télécharger le modèle</button>
        <label className={`${btn} cursor-pointer`}><FileUp className="h-4 w-4" /> Choisir un fichier CSV
          <input type="file" accept=".csv,text/csv" className="sr-only" disabled={loading || busy} onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {result && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">{result}</p>}
      {fail && <p role="alert" className="mt-3 break-words rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{fail}</p>}
      {preview && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-3" aria-label="Prévisualisation de l’import">
          <h3 className="break-words text-sm font-semibold text-hec-950">Prévisualisation — {fileName}</h3>
          <ul className="mt-2 grid gap-2 text-sm [grid-template-columns:repeat(auto-fill,minmax(10rem,1fr))]">
            <li>Bâtiments à créer : <strong>{preview.buildings.length}</strong></li><li>Salles à créer : <strong>{preview.rooms.length}</strong></li>
            <li>Doublons ignorés : <strong>{preview.skipped}</strong></li><li>Avertissements : <strong>{preview.warnings}</strong></li>
            <li className={preview.errors ? 'font-semibold text-red-700' : ''}>Erreurs bloquantes : <strong>{preview.errors}</strong></li>
          </ul>
          {preview.issues.length > 0 && (
            <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto text-xs">
              {preview.issues.map((i, k) => (
                <li key={k} className={`break-words rounded px-2 py-1 ${i.severity === 'error' ? 'bg-red-50 text-red-800' : i.severity === 'warning' ? 'bg-amber-50 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>
                  <strong>{i.severity === 'error' ? 'Erreur' : i.severity === 'warning' ? 'Avertissement' : 'Ignoré'}</strong>{i.line ? ` — ligne ${i.line}` : ''} : {i.message}
                </li>
              ))}
            </ul>
          )}
          {preview.canImport ? (
            <div className="mt-3">
              <label className="flex items-start gap-2 text-sm text-slate-800"><input type="checkbox" className="mt-1 h-5 w-5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                <span>J’ai relu ce récapitulatif : créer {preview.buildings.length} bâtiment(s) et {preview.rooms.length} salle(s) en statut « non validé ».</span></label>
              <button className={`${btn} mt-2 bg-hec-950 text-white hover:bg-hec-900`} disabled={!confirmed || busy} onClick={() => void run()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Importer
              </button>
            </div>
          ) : <p className="mt-3 text-sm font-medium text-red-700">{preview.errors ? 'Corrigez les erreurs puis rechargez le fichier : rien ne sera écrit tant qu’il en reste.' : 'Rien à importer.'}</p>}
        </section>
      )}
    </div>
  );
}

function AuditTab({ isValidator }: { isValidator: boolean }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!isValidator) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await getAuditLog(100);
        if (cancelled) return;
        setEntries(list);
        const ids = [...new Set(list.map((e) => e.actor_id).filter((x): x is string => !!x))];
        if (ids.length) {
          const { data } = await supabase.from('profiles').select('id, full_name').in('id', ids);
          if (!cancelled) setNames(Object.fromEntries((data ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? ''])));
        }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Lecture impossible.'); }
    })();
    return () => { cancelled = true; };
  }, [isValidator]);
  if (!isValidator) return <p className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-700">Le journal d’audit est réservé aux administrateurs.</p>;
  if (error) return <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!entries) return <p className="mt-4 flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</p>;
  if (entries.length === 0) return <p className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-700">Aucune opération enregistrée (le journal est alimenté une fois la migration 20261027090000 appliquée).</p>;
  return (
    <ul className="mt-4 space-y-2">
      {entries.map((e) => (
        <li key={e.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <strong className="text-hec-950">{ACTION_LABEL[e.action] ?? e.action}</strong>
            <span className="text-slate-700">{ENTITY_LABEL[e.entity_type] ?? e.entity_type}</span>
            {e.entity_label && <span className="min-w-0 break-words text-slate-800">« {e.entity_label} »</span>}
          </div>
          <p className="mt-1 break-words text-xs text-slate-600">
            {new Date(e.created_at).toLocaleString('fr-FR')} · {e.actor_id ? (names[e.actor_id] || `utilisateur ${e.actor_id.slice(0, 8)}`) : 'système'}{e.actor_role ? ` (${e.actor_role})` : ''}
          </p>
          {e.details.changes && Object.keys(e.details.changes).length > 0 && (
            <ul className="mt-1 text-xs text-slate-700">
              {Object.entries(e.details.changes).map(([k, v]) => <li key={k} className="break-words">{k} : {String(v.from ?? '∅')} → {String(v.to ?? '∅')}</li>)}
            </ul>
          )}
          {e.action === 'import' && <p className="mt-1 break-words text-xs text-slate-700">{JSON.stringify(e.details)}</p>}
        </li>
      ))}
    </ul>
  );
}
