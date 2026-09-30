import type { CampusLocation } from './types';

export type Language = 'fr' | 'en' | 'ln';

export type ThemeMode = 'light' | 'dark' | 'system';

export type TextSize = 'small' | 'normal' | 'large';

export interface UserSettings {
  language: Language;
  theme: ThemeMode;
  text_size: TextSize;
  high_contrast: boolean;
  reduce_motion: boolean;
  accessible_nav: boolean;
  notif_announcements: boolean;
  notif_events: boolean;
  notif_room_changes: boolean;
  notif_courses: boolean;
  notif_bookings: boolean;
  notif_maintenance: boolean;
  notif_alerts: boolean;
}

export const defaultSettings: UserSettings = {
  language: 'fr',
  theme: 'system',
  text_size: 'normal',
  high_contrast: false,
  reduce_motion: false,
  accessible_nav: true,
  notif_announcements: true,
  notif_events: true,
  notif_room_changes: true,
  notif_courses: true,
  notif_bookings: true,
  notif_maintenance: true,
  notif_alerts: true,
};

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  related_id: string | null;
  created_at: string;
}

export type BookingStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface Booking {
  id: string;
  user_id: string;
  location_id: string;
  date: string;
  start_time: string;
  end_time: string;
  purpose: string;
  status: BookingStatus;
  created_at: string;
  location?: CampusLocation;
}

export type ReportStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';

export interface Report {
  id: string;
  user_id: string;
  category: string;
  description: string;
  location_label: string;
  status: ReportStatus;
  created_at: string;
}

export interface ScheduleEntry {
  id: string;
  campus_id: string;
  course_name: string;
  teacher_name: string;
  room_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room?: CampusLocation | null;
}

export interface QRCode {
  id: string;
  location_id: string;
  code: string;
  is_active: boolean;
  created_at: string;
}


