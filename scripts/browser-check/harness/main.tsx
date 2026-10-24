/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — banc d'essai de vérification en navigateur ; n'appartient pas à l'application.
// Données FICTIVES de test (aucun lieu réel) ; styles de fond locaux (aucun fournisseur externe).
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { CampusMap } from '@/components/CampusMap';

const campus = { id: 'c', name: 'Test', tagline: '', city: '', center_lng: 15.3, center_lat: -4.3, default_zoom: 17 };
const buildings = [
  { id: 'b1', campus_id: 'c', name: 'Bâtiment test A', code: 'A', description: '', category: 'academic', color: '#2563eb', center_lng: 15.3003, center_lat: -4.2998, floor_count: 2 },
  { id: 'b2', campus_id: 'c', name: 'Bâtiment test B avec un nom volontairement très long pour tester la taille', code: 'B', description: '', category: 'library', color: '#d97706', center_lng: 15.2996, center_lat: -4.3003, floor_count: 1 },
];
const events = [];
window.__events = events;

function Harness() {
  const [mode, setMode] = useState('plan');
  const [route, setRoute] = useState(null);
  const [pois, setPois] = useState([]);
  useEffect(() => { window.__h = { setMode, setRoute, setPois }; }, []);
  return (
    <CampusMap
      campus={campus} buildings={buildings} poiLocations={[]} externalPois={pois}
      focusLocation={null} originLocation={null} routeCoordinates={route} styleMode={mode} manualPickMode={false}
      onSelectBuilding={() => {}} onSelectLocation={() => {}} onSelectExternalPOI={() => {}}
      onManualPick={() => {}} onGeolocate={() => {}} onGeolocateError={() => {}}
      onMapError={(m, k) => events.push({ t: 'mapError', m, k })}
      onMapReady={(map) => { window.__map = map; events.push({ t: 'ready' }); }}
      onFallbackProvider={(on, reason) => events.push({ t: 'fallback', on, reason })}
      onStyleModeRejected={(applied, msg) => { events.push({ t: 'rejected', applied, msg }); setMode(applied); }}
      onGeolocateControlReady={() => {}}
    />
  );
}
createRoot(document.getElementById('root')).render(<StrictMode><Harness /></StrictMode>);
