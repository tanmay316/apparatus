import { Bike, Footprints, Zap, type LucideIcon } from 'lucide-react';
import type { CardioActivity, CardioActivityType } from '@/types';

export function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/** "1h 12m" / "34m" — for totals where seconds are noise. */
export function formatDurationShort(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export function formatPaceMs(paceMs: number): string {
  if (paceMs <= 0 || !isFinite(paceMs)) return '--:--';
  const secPerKm = paceMs / 1000;
  if (secPerKm > 3600) return '>60:00';
  return `${Math.floor(secPerKm / 60)}:${String(Math.floor(secPerKm % 60)).padStart(2, '0')}`;
}

export function formatPace(distKm: number, durationSec: number): string {
  if (distKm <= 0 || durationSec <= 0) return '--:--';
  const secPerKm = durationSec / distKm;
  return `${Math.floor(secPerKm / 60)}:${String(Math.floor(secPerKm % 60)).padStart(2, '0')}`;
}

export function activityStartMs(a: Pick<CardioActivity, 'startedAt' | 'date'>): number {
  const ts = a.startedAt as any;
  if (ts?.toMillis) return ts.toMillis();
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
  const parsed = new Date(a.date).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function activityMovingSec(a: Pick<CardioActivity, 'movingDurationSec' | 'durationSec'>) {
  return a.movingDurationSec || a.durationSec || 0;
}

export function formatActivityDate(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday · ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · ${time}`;
}

function partOfDay(ms: number) {
  const h = new Date(ms).getHours();
  if (h < 5) return 'Night';
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  if (h < 21) return 'Evening';
  return 'Night';
}

export interface CardioTypeMeta {
  label: string;
  noun: string;
  verb: string;
  icon: LucideIcon;
  /** Tailwind text + soft background classes. */
  tint: string;
  accent: string;
  hint: string;
}

export const CARDIO_TYPES: Record<CardioActivityType, CardioTypeMeta> = {
  walk: { label: 'Walk', noun: 'walk', verb: 'Walking', icon: Footprints, tint: 'text-emerald-500 bg-emerald-500/10', accent: '#10b981', hint: 'Steps, distance and your route.' },
  run: { label: 'Run', noun: 'run', verb: 'Running', icon: Zap, tint: 'text-cyan-500 bg-cyan-500/10', accent: '#06b6d4', hint: 'Live pace, splits and distance.' },
  cycle: { label: 'Ride', noun: 'ride', verb: 'Cycling', icon: Bike, tint: 'text-purple-500 bg-purple-500/10', accent: '#a855f7', hint: 'Speed, elevation and route.' },
};

export function activityTitle(a: Pick<CardioActivity, 'type' | 'startedAt' | 'date'>) {
  return `${partOfDay(activityStartMs(a))} ${CARDIO_TYPES[a.type]?.noun ?? 'session'}`;
}

/** Pace for walks/runs, speed for rides. */
export function primaryRate(a: Pick<CardioActivity, 'type' | 'distanceKm' | 'avgSpeedKmh' | 'movingDurationSec' | 'durationSec'>) {
  const sec = activityMovingSec(a);
  if (a.type === 'cycle') {
    const speed = a.avgSpeedKmh || (sec > 0 ? a.distanceKm / (sec / 3600) : 0);
    return { value: speed.toFixed(1), unit: 'km/h', label: 'Avg speed' };
  }
  return { value: formatPace(a.distanceKm, sec), unit: '/km', label: 'Avg pace' };
}
