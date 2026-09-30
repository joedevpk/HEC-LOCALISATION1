import { useEffect, useState, type FormEvent } from 'react';
import {
  Archive,
  ArchiveRestore,
  Building2,
  DoorOpen,
  Images,
  Layers,
  Loader2,
  MapPin,
  MapPinned,
  Pencil,
  Plus,
  Route as RouteIcon,
  Trash2,
  X,
} from 'lucide-react';
import { useCampus } from '@/context/CampusContext';
import { Button, EmptyState } from '@/components/ui';
import { buildingCategoryLabels, categoryLabels, kindLabels } from '@/lib/display';
import { AdminRouteEditor } from '@/components/AdminRouteEditor';
import {
  archiveBuilding,
  archiveLocation,
  createBuilding,
  createFloor,
  createLocation,
  deleteBuilding,
  deleteFloor,
  deleteLocation,
  getBuildings,
  getFloors,
  getLocations,
  restoreBuilding,
  restoreLocation,
  updateBuilding,
  updateLocation,
} from '@/lib/api';
import { BuildingImagesPanel } from '@/components/BuildingImagesPanel';
import { LocationImagesPanel } from '@/components/LocationImagesPanel';
import { BuildingPositionPicker } from '@/components/BuildingPositionPicker';
import type {
  Building,
  BuildingCategory,
  Campus,
  CampusLocation,
  Floor,
  LocationKind,
} from '@/lib/types';

type Tab = 'buildings' | 'locations' | 'routes';

export function AdminCampusManager({ campus }: { campus: Campus }) {
  const [tab, setTab] = useState<Tab>('buildings');
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingsLoading, setBuildingsLoading] = useState(true);

  const reloadBuildings = async () => {
    setBuildingsLoading(true);
    try {
      setBuildings(await getBuildings(campus.id));
    } finally {
      setBuildingsLoading(false);
    }
  };

  useEffect(() => {
    reloadBuildings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campus.id]);

  return (
    <div className="mt-6">
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
        <TabButton active={tab === 'buildings'} onClick={() => setTab('buildings')} icon={<Building2 className="h-4 w-4" />}>
          Bâtiments
        </TabButton>
        <TabButton active={tab === 'locations'} onClick={() => setTab('locations')} icon={<DoorOpen className="h-4 w-4" />}>
          Salles &amp; lieux
        </TabButton>
        <TabButton active={tab === 'routes'} onClick={() => setTab('routes')} icon={<RouteIcon className="h-4 w-4" />}>
          Chemins
        </TabButton>
      </div>

      {tab === 'buildings' && (
        <BuildingsManager
          campus={campus}
          buildings={buildings}
          loading={buildingsLoading}
          onChanged={reloadBuildings}
        />
      )}
      {tab === 'locations' && <LocationsManager campus={campus} buildings={buildings} />}
      {tab === 'routes' && <AdminRouteEditor campus={campus} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
        active ? 'bg-hec-950 text-white' : 'text-slate-500 hover:text-hec-700'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

/* ------------------------------- Buildings ------------------------------- */

const buildingCategories: BuildingCategory[] = [
  'academic',
  'library',
  'admin',
  'student_life',
];

const emptyBuildingForm = (campusId: string) => ({
  campus_id: campusId,
  name: '',
  code: '',
  description: '',
  category: 'academic' as BuildingCategory,
  color: '#1e5eff',
  center_lng: 0,
  center_lat: 0,
  floor_count: 1,
});

function BuildingsManager({
  campus,
  buildings,
  loading,
  onChanged,
}: {
  campus: Campus;
  buildings: Building[];
  loading: boolean;
  onChanged: () => void;
}) {
  const { reload: reloadCampus } = useCampus();
  const [editing, setEditing] = useState<Building | 'new' | null>(null);
  const [form, setForm] = useState(emptyBuildingForm(campus.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [floorsBuildingId, setFloorsBuildingId] = useState<string | null>(null);
  const [imagesBuildingId, setImagesBuildingId] = useState<string | null>(null);
  const [pickingPosition, setPickingPosition] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedBuildings, setArchivedBuildings] = useState<Building[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);

  const loadArchived = async () => {
    setArchivedLoading(true);
    try {
      const all = await getBuildings(campus.id, true);
      setArchivedBuildings(all.filter((b) => !!b.archived_at));
    } finally {
      setArchivedLoading(false);
    }
  };

  const toggleArchived = () => {
    const next = !showArchived;
    setShowArchived(next);
    if (next) loadArchived();
  };

  const startCreate = () => {
    setForm(emptyBuildingForm(campus.id));
    setError(null);
    setEditing('new');
  };

  const startEdit = (b: Building) => {
    setForm({
      campus_id: b.campus_id,
      name: b.name,
      code: b.code,
      description: b.description,
      category: b.category,
      color: b.color,
      center_lng: b.center_lng,
      center_lat: b.center_lat,
      floor_count: b.floor_count,
    });
    setError(null);
    setEditing(b);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing === 'new') {
        await createBuilding(form);
      } else if (editing) {
        await updateBuilding(editing.id, form);
      }
      setEditing(null);
      onChanged();
      reloadCampus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setSaving(false);
    }
  };

  const archive = async (b: Building) => {
    if (
      !confirm(
        `Archiver le bâtiment "${b.name}" ? Il sera masqué de la carte, de la recherche et de la navigation, mais pourra être restauré depuis "Bâtiments archivés".`,
      )
    )
      return;
    try {
      await archiveBuilding(b.id);
      onChanged();
      reloadCampus();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Archivage impossible.');
    }
  };

  const restore = async (b: Building) => {
    try {
      await restoreBuilding(b.id);
      onChanged();
      reloadCampus();
      loadArchived();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Restauration impossible.');
    }
  };

  const removeForever = async (b: Building) => {
    if (
      !confirm(
        `Supprimer définitivement le bâtiment "${b.name}" et toutes ses salles ? Cette action est irréversible.`,
      )
    )
      return;
    try {
      await deleteBuilding(b.id);
      loadArchived();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {buildings.length} bâtiment(s) sur {campus.name}
        </p>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={startCreate}>
          Ajouter un bâtiment
        </Button>
      </div>

      {editing && (
        <form
          onSubmit={submit}
          className="mt-4 space-y-3 rounded-2xl border border-hec-100 bg-hec-50/40 p-5"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-bold text-hec-950">
              {editing === 'new' ? 'Nouveau bâtiment' : `Modifier « ${editing.name} »`}
            </h3>
            <button type="button" onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Nom" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
            <TextInput label="Code" value={form.code} onChange={(v) => setForm({ ...form, code: v })} required />
          </div>

          <TextArea
            label="Description"
            value={form.description}
            onChange={(v) => setForm({ ...form, description: v })}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <FieldLabel>Catégorie</FieldLabel>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as BuildingCategory })}
                className={selectClass}
              >
                {buildingCategories.map((c) => (
                  <option key={c} value={c}>
                    {buildingCategoryLabels[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Couleur</FieldLabel>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="h-11 w-11 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
                />
                <input
                  type="text"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <NumberInput
              label="Nombre d'étages"
              value={form.floor_count}
              onChange={(v) => setForm({ ...form, floor_count: v })}
              min={1}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <NumberInput
              label="Longitude (centre)"
              value={form.center_lng}
              onChange={(v) => setForm({ ...form, center_lng: v })}
              step="any"
              required
            />
            <NumberInput
              label="Latitude (centre)"
              value={form.center_lat}
              onChange={(v) => setForm({ ...form, center_lat: v })}
              step="any"
              required
            />
          </div>
          <button
            type="button"
            onClick={() => setPickingPosition(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hec-200 bg-white px-3 py-1.5 text-xs font-semibold text-hec-700 hover:border-hec-300 hover:bg-hec-50"
          >
            <MapPinned className="h-3.5 w-3.5" /> Positionner sur la carte
          </button>
          <p className="text-xs text-slate-400">
            Astuce : longitude/latitude du campus « {campus.name} » : {campus.center_lng},{' '}
            {campus.center_lat} — partez de ces valeurs puis ajustez, ou utilisez le bouton
            ci-dessus pour cliquer directement sur la carte.
          </p>

          {pickingPosition && (
            <BuildingPositionPicker
              campus={campus}
              initialLng={form.center_lng}
              initialLat={form.center_lat}
              title={form.name || 'Nouveau bâtiment'}
              onCancel={() => setPickingPosition(false)}
              onConfirm={([lng, lat]) => {
                setForm({ ...form, center_lng: lng, center_lat: lat });
                setPickingPosition(false);
              }}
            />
          )}

          {error && <FormError>{error}</FormError>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Annuler
            </Button>
            <Button type="submit" size="sm" loading={saving}>
              Enregistrer
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </p>
      ) : buildings.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Building2 className="h-5 w-5" />}
            title="Aucun bâtiment"
            description="Ajoutez le premier bâtiment du campus pour pouvoir y placer des salles."
          />
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {buildings.map((b) => (
            <div key={b.id}>
              <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3.5">
                {b.primary_image_url ? (
                  <img
                    src={b.primary_image_url}
                    alt={b.name}
                    className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-white"
                  />
                ) : (
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                    style={{ background: b.color }}
                  >
                    {b.code || b.name[0]}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-hec-950">{b.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {buildingCategoryLabels[b.category]} · {b.floor_count} étage(s)
                  </p>
                </div>
                <button
                  onClick={() => setImagesBuildingId(imagesBuildingId === b.id ? null : b.id)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-hec-600"
                  title="Photos"
                >
                  <Images className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setFloorsBuildingId(floorsBuildingId === b.id ? null : b.id)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-hec-600"
                  title="Étages"
                >
                  <Layers className="h-4 w-4" />
                </button>
                <button
                  onClick={() => startEdit(b)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-hec-600"
                  title="Modifier"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => archive(b)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                  title="Archiver"
                >
                  <Archive className="h-4 w-4" />
                </button>
              </div>
              {imagesBuildingId === b.id && (
                <BuildingImagesPanel building={b} onChanged={onChanged} />
              )}
              {floorsBuildingId === b.id && <FloorsPanel building={b} />}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={toggleArchived}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-hec-700"
        >
          <Archive className="h-3.5 w-3.5" />
          {showArchived ? 'Masquer les bâtiments archivés' : 'Voir les bâtiments archivés'}
        </button>
        {showArchived && (
          <div className="mt-3 space-y-2">
            {archivedLoading ? (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
              </p>
            ) : archivedBuildings.length === 0 ? (
              <p className="text-sm text-slate-400">Aucun bâtiment archivé.</p>
            ) : (
              archivedBuildings.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3.5"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-500">
                    {b.code || b.name[0]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-500">{b.name}</p>
                    <p className="truncate text-xs text-slate-400">Archivé — masqué du public</p>
                  </div>
                  <button
                    onClick={() => restore(b)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                    title="Restaurer"
                  >
                    <ArchiveRestore className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removeForever(b)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"
                    title="Supprimer définitivement"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FloorsPanel({ building }: { building: Building }) {
  const [floors, setFloors] = useState<Floor[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState(0);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = () => {
    setLoading(true);
    getFloors(building.id)
      .then(setFloors)
      .finally(() => setLoading(false));
  };

  useEffect(reload, [building.id]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createFloor({
        building_id: building.id,
        level,
        name: name.trim(),
        sort_order: floors.length,
      });
      setName('');
      setLevel(0);
      reload();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (f: Floor) => {
    if (!confirm(`Supprimer l'étage "${f.name}" ?`)) return;
    await deleteFloor(f.id);
    reload();
  };

  return (
    <div className="ml-4 mt-1 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Étages de {building.name}
      </p>
      {loading ? (
        <p className="mt-2 text-xs text-slate-400">Chargement…</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {floors.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-sm">
              <span className="font-medium text-hec-950">
                {f.name} <span className="text-slate-400">(niveau {f.level})</span>
              </span>
              <button onClick={() => remove(f)} className="text-slate-400 hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {floors.length === 0 && (
            <p className="text-xs text-slate-400">Aucun étage pour l'instant.</p>
          )}
        </div>
      )}
      <form onSubmit={add} className="mt-3 flex items-end gap-2">
        <div className="flex-1">
          <FieldLabel>Nom de l'étage</FieldLabel>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rez-de-chaussée"
            className={inputClass}
          />
        </div>
        <div className="w-20">
          <FieldLabel>Niveau</FieldLabel>
          <input
            type="number"
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
            className={inputClass}
          />
        </div>
        <Button type="submit" size="sm" loading={saving} disabled={!name.trim()}>
          Ajouter
        </Button>
      </form>
    </div>
  );
}

/* ------------------------------- Locations -------------------------------- */

const locationKinds: LocationKind[] = [
  'room',
  'office',
  'service',
  'poi',
  'entrance',
  'exit',
  'facility',
];

function emptyLocationForm(building?: Building) {
  return {
    building_id: building?.id ?? null,
    floor_id: null as string | null,
    name: '',
    code: '',
    kind: 'room' as LocationKind,
    category: 'classroom',
    description: '',
    capacity: null as number | null,
    lng: building?.center_lng ?? 0,
    lat: building?.center_lat ?? 0,
    is_accessible: true,
  };
}

function LocationsManager({
  campus,
  buildings,
}: {
  campus: Campus;
  buildings: Building[];
}) {
  const { locations, reload: reloadCampus } = useCampus();
  const [filterBuilding, setFilterBuilding] = useState<string>('all');
  const [editing, setEditing] = useState<CampusLocation | 'new' | null>(null);
  const [form, setForm] = useState(emptyLocationForm());
  const [floors, setFloors] = useState<Floor[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickingPosition, setPickingPosition] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedLocations, setArchivedLocations] = useState<CampusLocation[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [imagesLocationId, setImagesLocationId] = useState<string | null>(null);

  const loadArchived = async () => {
    setArchivedLoading(true);
    try {
      const all = await getLocations(true);
      setArchivedLocations(all.filter((l) => !!l.archived_at));
    } finally {
      setArchivedLoading(false);
    }
  };

  const toggleArchived = () => {
    const next = !showArchived;
    setShowArchived(next);
    if (next) loadArchived();
  };

  useEffect(() => {
    if (form.building_id) {
      getFloors(form.building_id).then(setFloors);
    } else {
      setFloors([]);
    }
  }, [form.building_id]);

  const startCreate = () => {
    const b = buildings.find((x) => x.id === filterBuilding) ?? buildings[0];
    setForm(emptyLocationForm(b));
    setError(null);
    setEditing('new');
  };

  const startEdit = (loc: CampusLocation) => {
    setForm({
      building_id: loc.building_id,
      floor_id: loc.floor_id,
      name: loc.name,
      code: loc.code,
      kind: loc.kind,
      category: loc.category,
      description: loc.description,
      capacity: loc.capacity,
      lng: loc.lng,
      lat: loc.lat,
      is_accessible: loc.is_accessible,
    });
    setError(null);
    setEditing(loc);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing === 'new') {
        await createLocation(form);
      } else if (editing) {
        await updateLocation(editing.id, form);
      }
      setEditing(null);
      reloadCampus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setSaving(false);
    }
  };

  const archive = async (loc: CampusLocation) => {
    if (
      !confirm(
        `Archiver "${loc.name}" ? Ce lieu sera masqué de la carte, de la recherche et de la navigation, mais pourra être restauré depuis "Salles archivées".`,
      )
    )
      return;
    try {
      await archiveLocation(loc.id);
      reloadCampus();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Archivage impossible.');
    }
  };

  const restore = async (loc: CampusLocation) => {
    try {
      await restoreLocation(loc.id);
      reloadCampus();
      loadArchived();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Restauration impossible.');
    }
  };

  const removeForever = async (loc: CampusLocation) => {
    if (
      !confirm(`Supprimer définitivement "${loc.name}" ? Cette action est irréversible.`)
    )
      return;
    try {
      await deleteLocation(loc.id);
      loadArchived();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  };

  const filtered =
    filterBuilding === 'all'
      ? locations
      : locations.filter((l) => l.building_id === filterBuilding);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={filterBuilding}
          onChange={(e) => setFilterBuilding(e.target.value)}
          className={`${selectClass} w-auto`}
        >
          <option value="all">Tous les bâtiments</option>
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          icon={<Plus className="h-4 w-4" />}
          onClick={startCreate}
          disabled={buildings.length === 0}
        >
          Ajouter une salle / un lieu
        </Button>
      </div>
      {buildings.length === 0 && (
        <p className="mt-2 text-xs text-amber-600">
          Créez d'abord un bâtiment (onglet « Bâtiments ») avant d'ajouter des salles.
        </p>
      )}

      {editing && (
        <form
          onSubmit={submit}
          className="mt-4 space-y-3 rounded-2xl border border-hec-100 bg-hec-50/40 p-5"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-bold text-hec-950">
              {editing === 'new' ? 'Nouvelle salle / lieu' : `Modifier « ${editing.name} »`}
            </h3>
            <button type="button" onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Nom" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
            <TextInput label="Code" value={form.code} onChange={(v) => setForm({ ...form, code: v })} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Bâtiment</FieldLabel>
              <select
                value={form.building_id ?? ''}
                onChange={(e) =>
                  setForm({ ...form, building_id: e.target.value || null, floor_id: null })
                }
                className={selectClass}
              >
                <option value="">Aucun (lieu extérieur)</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Étage</FieldLabel>
              <select
                value={form.floor_id ?? ''}
                onChange={(e) => setForm({ ...form, floor_id: e.target.value || null })}
                className={selectClass}
                disabled={!form.building_id}
              >
                <option value="">Aucun</option>
                {floors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Type</FieldLabel>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as LocationKind })}
                className={selectClass}
              >
                {locationKinds.map((k) => (
                  <option key={k} value={k}>
                    {kindLabels[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Catégorie</FieldLabel>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={selectClass}
              >
                {Object.entries(categoryLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <TextArea
            label="Description"
            value={form.description}
            onChange={(v) => setForm({ ...form, description: v })}
          />

          <NumberInput
            label="Capacité"
            value={form.capacity ?? ''}
            onChange={(v) => setForm({ ...form, capacity: v })}
            min={0}
          />

          <div>
            <FieldLabel>Position</FieldLabel>
            <button
              type="button"
              onClick={() => setPickingPosition(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hec-200 bg-white px-3 py-1.5 text-xs font-semibold text-hec-700 hover:border-hec-300 hover:bg-hec-50"
            >
              <MapPinned className="h-3.5 w-3.5" /> Choisir sur la carte
            </button>
            <p className="mt-1.5 text-xs text-slate-400">
              {form.lng !== 0 || form.lat !== 0
                ? `Position sélectionnée · ${form.lng.toFixed(6)}, ${form.lat.toFixed(6)}`
                : "Aucune position sélectionnée pour l'instant."}
            </p>
          </div>

          {pickingPosition && (
            <BuildingPositionPicker
              campus={campus}
              initialLng={form.lng}
              initialLat={form.lat}
              title={form.name || 'Nouvelle salle / lieu'}
              onCancel={() => setPickingPosition(false)}
              onConfirm={([lng, lat]) => {
                setForm({ ...form, lng, lat });
                setPickingPosition(false);
              }}
            />
          )}

          <details className="text-xs text-slate-400">
            <summary className="cursor-pointer select-none font-semibold uppercase tracking-wide">
              Détails techniques
            </summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <NumberInput
                label="Longitude"
                value={form.lng}
                onChange={(v) => setForm({ ...form, lng: v })}
                step="any"
                required
              />
              <NumberInput
                label="Latitude"
                value={form.lat}
                onChange={(v) => setForm({ ...form, lat: v })}
                step="any"
                required
              />
            </div>
          </details>

          <label className="flex items-center gap-2 text-sm font-medium text-hec-950">
            <input
              type="checkbox"
              checked={form.is_accessible}
              onChange={(e) => setForm({ ...form, is_accessible: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-hec-500 focus:ring-hec-300"
            />
            Accessible aux personnes à mobilité réduite
          </label>

          {error && <FormError>{error}</FormError>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Annuler
            </Button>
            <Button type="submit" size="sm" loading={saving}>
              Enregistrer
            </Button>
          </div>
        </form>
      )}

      {filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<MapPin className="h-5 w-5" />}
            title="Aucune salle"
            description="Ajoutez une salle ou un lieu pour qu'il apparaisse sur la carte et dans la recherche."
          />
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {filtered.map((loc) => (
            <div key={loc.id}>
              <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3.5">
                {loc.primary_image_url || loc.building?.primary_image_url ? (
                  <img
                    src={loc.primary_image_url ?? loc.building?.primary_image_url ?? ''}
                    alt={loc.name}
                    className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-white"
                  />
                ) : (
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
                    <MapPin className="h-4 w-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-hec-950">{loc.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {kindLabels[loc.kind]} · {loc.building?.name ?? 'Extérieur'}
                    {loc.floor ? ` · ${loc.floor.name}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => setImagesLocationId(imagesLocationId === loc.id ? null : loc.id)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-hec-600"
                  title="Photos"
                >
                  <Images className="h-4 w-4" />
                </button>
                <button
                  onClick={() => startEdit(loc)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-hec-600"
                  title="Modifier"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => archive(loc)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                  title="Archiver"
                >
                  <Archive className="h-4 w-4" />
                </button>
              </div>
              {imagesLocationId === loc.id && (
                <LocationImagesPanel
                  location={loc}
                  onChanged={reloadCampus}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={toggleArchived}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-hec-700"
        >
          <Archive className="h-3.5 w-3.5" />
          {showArchived ? 'Masquer les salles archivées' : 'Voir les salles archivées'}
        </button>
        {showArchived && (
          <div className="mt-3 space-y-2">
            {archivedLoading ? (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
              </p>
            ) : archivedLocations.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune salle archivée.</p>
            ) : (
              archivedLocations.map((loc) => (
                <div
                  key={loc.id}
                  className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3.5"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-200 text-slate-400">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-500">{loc.name}</p>
                    <p className="truncate text-xs text-slate-400">Archivée — masquée du public</p>
                  </div>
                  <button
                    onClick={() => restore(loc)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                    title="Restaurer"
                  >
                    <ArchiveRestore className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removeForever(loc)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"
                    title="Supprimer définitivement"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- Fields ---------------------------------- */

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-hec-950 placeholder:text-slate-400 focus:border-hec-400 focus:outline-none focus:ring-4 focus:ring-hec-100';
const selectClass = inputClass;

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
      {children}
    </span>
  );
}

function FormError({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-600">
      {children}
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={inputClass}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className={inputClass}
      />
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  min,
  step,
  required,
}: {
  label: string;
  value: number | string;
  onChange: (v: number) => void;
  min?: number;
  step?: string | number;
  required?: boolean;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.valueAsNumber || Number(e.target.value) || 0)}
        min={min}
        step={step}
        required={required}
        className={inputClass}
      />
    </label>
  );
}
