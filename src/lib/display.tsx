import {
  Accessibility,
  Armchair,
  BookOpen,
  Building2,
  Car,
  DoorOpen,
  FlaskConical,
  GraduationCap,
  LandPlot,
  MapPin,
  Presentation,
  Users,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import type {
  BuildingCategory,
  CampusLocation,
  RouteNodeType,
  RouteSegmentType,
} from '@/lib/types';

export const kindLabels: Record<string, string> = {
  room: 'Salle',
  office: 'Bureau',
  service: 'Service',
  poi: "Point d'intérêt",
  entrance: 'Entrée',
  exit: 'Sortie',
  facility: 'Équipement',
};

export const categoryLabels: Record<string, string> = {
  lecture_hall: 'Amphithéâtre',
  classroom: 'Salle de cours',
  lab: 'Laboratoire',
  office: 'Bureau',
  library: 'Bibliothèque',
  study: 'Espace de travail',
  admin: 'Administration',
  food: 'Restauration',
  student_life: 'Vie étudiante',
  entrance: 'Entrée',
  parking: 'Parking',
  general: 'Général',
};

export const buildingCategoryLabels: Record<BuildingCategory, string> = {
  academic: 'Académique',
  library: 'Bibliothèque',
  admin: 'Administration',
  student_life: 'Vie étudiante',
};

export function categoryLabel(loc: CampusLocation): string {
  return categoryLabels[loc.category] ?? kindLabels[loc.kind] ?? 'Lieu';
}

export function locationIcon(loc: CampusLocation): LucideIcon {
  switch (loc.category) {
    case 'lecture_hall':
      return Presentation;
    case 'classroom':
      return GraduationCap;
    case 'lab':
      return FlaskConical;
    case 'library':
    case 'study':
      return BookOpen;
    case 'food':
      return Utensils;
    case 'parking':
      return Car;
    case 'entrance':
      return DoorOpen;
    case 'student_life':
      return Users;
    default:
      break;
  }
  switch (loc.kind) {
    case 'office':
      return Armchair;
    case 'service':
      return LandPlot;
    case 'entrance':
    case 'exit':
      return DoorOpen;
    case 'poi':
      return MapPin;
    default:
      return Building2;
  }
}

export function locationColor(loc: CampusLocation): string {
  return loc.building?.color ?? '#1e5eff';
}

export function accessibilityIcon() {
  return Accessibility;
}

// ---------------------------------------------------------------------
// Réseau de navigation (route_nodes / route_segments) — outil admin de
// tracé des chemins.
// ---------------------------------------------------------------------
export const routeNodeTypeLabels: Record<RouteNodeType, string> = {
  entrance: 'Entrée',
  intersection: 'Intersection',
  corridor: 'Couloir',
  stairs: 'Escalier',
  elevator: 'Ascenseur',
  ramp: 'Rampe',
  poi: "Point d'intérêt",
};

export const routeNodeTypeColors: Record<RouteNodeType, string> = {
  entrance: '#16a34a',
  intersection: '#1e5eff',
  corridor: '#64748b',
  stairs: '#f59e0b',
  elevator: '#8b5cf6',
  ramp: '#0ea5e9',
  poi: '#ef4444',
};

export const routeSegmentTypeLabels: Record<RouteSegmentType, string> = {
  walkway: 'Allée',
  corridor: 'Couloir',
  stairs: 'Escalier',
  ramp: 'Rampe',
  elevator: 'Ascenseur',
};
