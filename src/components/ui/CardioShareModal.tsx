import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Download, Check, Share2, ChevronLeft, ChevronRight, Loader2, Smartphone, Square as SquareIcon,
  LayoutTemplate, Map as MapIcon, Palette, ImagePlus, Trash2, Crown, Footprints, Bike,
} from 'lucide-react';
import { format } from 'date-fns';
import { toCanvas } from 'html-to-image';
import html2canvas from 'html2canvas';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { useUIStore } from '@/stores/ui-store';
import { CAN_UPSELL, requirePro, useHasPro } from '@/stores/subscription-store';
import { RouteMap, MAP_THEMES, type MapThemeKey } from '@/components/cardio/RouteMap';
import { computeSplits } from '@/lib/cardio-analysis';
import { compressImageFile } from '@/utils/image-compression';
import type { RoutePoint } from '@/types';
import { lockBodyScroll } from '@/lib/scroll-lock';
import { BRAND } from '@/lib/brand';

export interface CardioShareData {
  type: 'walk' | 'run' | 'cycle';
  date: string;
  distanceKm: number;
  durationSec: number;
  calories: number;
  avgPace: string;
  avgSpeedKmh?: number;
  maxSpeedKmh?: number;
  elevationGainM?: number;
  route?: RoutePoint[];
  currentLocation?: { lat: number; lng: number } | null;
  steps?: number;
}

interface Props {
  data: CardioShareData;
  mapTheme?: MapThemeKey;
  onClose: () => void;
}

type ShareLayout = 'map' | 'stack' | 'bold' | 'summary' | 'splits' | 'photo' | 'editorial' | 'route';

const LAYOUT_OPTIONS: { id: ShareLayout; label: string; short: string }[] = [
  { id: 'map', label: 'Map', short: 'Map' },
  { id: 'stack', label: 'Stats Sticker', short: 'Stats' },
  { id: 'bold', label: 'Bold', short: 'Bold' },
  { id: 'summary', label: 'Summary', short: 'Summary' },
  { id: 'splits', label: 'Splits', short: 'Splits' },
  { id: 'photo', label: 'Photo', short: 'Photo' },
  { id: 'editorial', label: 'Editorial', short: 'Editorial' },
  { id: 'route', label: 'Route Sticker', short: 'Route' },
];

/** Free users can preview these, but saving/sharing them needs Pro. */
const PRO_LAYOUTS = new Set<ShareLayout>(['splits', 'photo', 'editorial']);
const TRANSPARENT_LAYOUTS = new Set<ShareLayout>(['stack', 'route']);

const ACCENTS = [
  { id: 'ember', label: 'Ember', hex: '#FC5200' },
  { id: 'volt', label: 'Volt', hex: '#D4FF3A' },
  { id: 'ice', label: 'Ice', hex: '#38BDF8' },
  { id: 'crimson', label: 'Crimson', hex: '#F43F5E' },
  { id: 'violet', label: 'Violet', hex: '#A78BFA' },
  { id: 'gold', label: 'Gold', hex: '#F5B301' },
  { id: 'mint', label: 'Mint', hex: '#34D399' },
  { id: 'white', label: 'White', hex: '#FFFFFF' },
];

const AVAILABLE_THEMES = Object.keys(MAP_THEMES) as MapThemeKey[];

/** Stylised colour palettes used only for the map-style picker previews. */
const MAP_PREVIEW: Partial<Record<MapThemeKey, { base: string; road: string; park: string; water: string }>> = {
  street: { base: '#f2efe9', road: '#ffffff', park: '#cfe8c3', water: '#aad3df' },
  dark: { base: '#1f1f1f', road: '#3a3a3a', park: '#272727', water: '#141414' },
  light: { base: '#ececec', road: '#ffffff', park: '#e0e0e0', water: '#d4d4d4' },
  satellite: { base: '#34402c', road: '#565a47', park: '#233722', water: '#15283a' },
  terrain: { base: '#e8e4d8', road: '#ffffff', park: '#c9dcb0', water: '#a7c8de' },
  cyclosm: { base: '#f2efe9', road: '#b07acb', park: '#b9dfa6', water: '#aad3df' },
};

/** Fixed design size of the exported card (logical px). Exported at 3x → 1080 px wide. */
const DESIGN_W = 360;
const PIXEL_RATIO = 3;
const FONT = "Inter, 'SF Pro Display', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const PAPER = '#F2EFE8';
const INK = '#111111';

// ─── Formatting ──────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');

function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s % 60)}` : `${m}:${pad2(s % 60)}`;
}

function paceText(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '–';
  const total = Math.round(secPerKm);
  return `${Math.floor(total / 60)}:${pad2(total % 60)}`;
}

/** "5:30 /km" → 330 */
function parsePace(text: string): number {
  const m = /(\d+):(\d{1,2})/.exec(text || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isLight(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6;
}

function partOfDay(d: Date): string {
  const h = d.getHours();
  if (h >= 4 && h < 12) return 'Morning';
  if (h < 17 && h >= 12) return 'Afternoon';
  if (h < 21 && h >= 17) return 'Evening';
  return 'Night';
}

// ─── Route geometry ──────────────────────────────────────────

type Pt = [number, number];

function normalizeRoute(raw: unknown): RoutePoint[] {
  let value: any = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { value = []; }
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((p: any) => {
      if (!p) return null;
      const lat = Number(Array.isArray(p) ? p[0] : p.lat ?? p.latitude);
      const lng = Number(Array.isArray(p) ? p[1] : p.lng ?? p.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng, alt: p.alt ?? p.altitude, speed: p.speed, ts: Number(p.ts) || 0 };
    })
    .filter(Boolean) as RoutePoint[];
}

/** Web-Mercator projection (unit square), thinned to keep the SVG light. */
function project(route: RoutePoint[]): Pt[] {
  if (route.length < 2) return [];
  const step = Math.max(1, Math.ceil(route.length / 600));
  const out: Pt[] = [];
  const toPt = (p: RoutePoint): Pt => {
    const lat = Math.max(-85, Math.min(85, p.lat));
    const s = Math.sin((lat * Math.PI) / 180);
    return [(p.lng + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
  };
  for (let i = 0; i < route.length; i += step) out.push(toPt(route[i]));
  if ((route.length - 1) % step !== 0) out.push(toPt(route[route.length - 1]));
  return out;
}

function fitPath(pts: Pt[], w: number, h: number, pad: number) {
  if (pts.length < 2) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const dx = Math.max(maxX - minX, 1e-12);
  const dy = Math.max(maxY - minY, 1e-12);
  const s = Math.min((w - 2 * pad) / dx, (h - 2 * pad) / dy);
  const ox = (w - (maxX - minX) * s) / 2 - minX * s;
  const oy = (h - (maxY - minY) * s) / 2 - minY * s;
  const mapped = pts.map(([x, y]) => [x * s + ox, y * s + oy] as Pt);
  const d = mapped.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  return { d, start: mapped[0], end: mapped[mapped.length - 1] };
}

function haversineM(a: RoutePoint, b: RoutePoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Altitude sampled evenly by distance; null when the route has no usable altitude. */
function elevationSeries(route: RoutePoint[], buckets = 48): number[] | null {
  const pts = route.filter(p => typeof p.alt === 'number' && Number.isFinite(p.alt));
  if (pts.length < 10) return null;
  const dist = [0];
  for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + haversineM(pts[i - 1], pts[i]));
  const total = dist[dist.length - 1];
  if (total < 200) return null;
  const out: number[] = [];
  let j = 0;
  for (let b = 0; b < buckets; b++) {
    const target = (total * b) / (buckets - 1);
    while (j < dist.length - 2 && dist[j + 1] < target) j++;
    const span = dist[j + 1] - dist[j];
    const f = span > 0 ? Math.min(1, Math.max(0, (target - dist[j]) / span)) : 0;
    out.push(pts[j].alt! + f * (pts[j + 1].alt! - pts[j].alt!));
  }
  const range = Math.max(...out) - Math.min(...out);
  return range >= 3 ? out : null;
}

// ─── Card primitives ─────────────────────────────────────────

function Wordmark({ color = '#FFFFFF', size = 12 }: { color?: string; size?: number }) {
  return <span style={{ color, fontSize: size, fontWeight: 800, letterSpacing: '0.32em', lineHeight: 1 }}>{BRAND.upper}</span>;
}

function RouteSvg({ pts, width, height, color, stroke = 4, pad = 6, glow = true, ends = true, endFill = '#FFFFFF', endColor }: {
  pts: Pt[]; width: number; height: number; color: string; stroke?: number; pad?: number; glow?: boolean; ends?: boolean; endFill?: string; endColor?: string;
}) {
  const fit = useMemo(() => fitPath(pts, width, height, pad + stroke * 1.8), [pts, width, height, pad, stroke]);
  if (!fit) return <div style={{ width, height }} />;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }} aria-hidden>
      {glow && <path d={fit.d} fill="none" stroke={color} strokeOpacity={0.22} strokeWidth={stroke * 3.2} strokeLinecap="round" strokeLinejoin="round" />}
      <path d={fit.d} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      {ends && (
        <>
          <circle cx={fit.start[0]} cy={fit.start[1]} r={stroke * 1.15} fill={endFill} stroke={color} strokeWidth={stroke * 0.6} />
          <circle cx={fit.end[0]} cy={fit.end[1]} r={stroke * 1.35} fill={endColor || color} stroke={endFill} strokeWidth={stroke * 0.55} />
        </>
      )}
    </svg>
  );
}

function ElevationArea({ values, width, height, color }: { values: number[]; width: number; height: number; color: string }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 2 - ((v - min) / span) * (height - 6)] as Pt);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }} aria-hidden>
      <defs>
        <linearGradient id="cardio-elev-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.45} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line}L${width} ${height}L0 ${height}Z`} fill="url(#cardio-elev-fill)" />
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

function Stat({ label, value, unit, color = '#FFFFFF', labelColor = 'rgba(255,255,255,0.6)', size = 22, align = 'left' }: {
  label: string; value: string; unit?: string; color?: string; labelColor?: string; size?: number; align?: 'left' | 'center' | 'right';
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start', minWidth: 0 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: labelColor, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ marginTop: 4, fontSize: size, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, color, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {value}
        {unit && <span style={{ fontSize: Math.round(size * 0.5), fontWeight: 700, marginLeft: 3, opacity: 0.7 }}>{unit}</span>}
      </span>
    </div>
  );
}

// ─── Template thumbnails ─────────────────────────────────────

const THUMB_ROUTE = 'M14 60 C 20 42, 30 52, 34 36 S 48 24, 46 14';

function LayoutThumb({ id, accent }: { id: ShareLayout; accent: string }) {
  const W = 60, H = 88;
  const line = (x: number, y: number, w: number, fill = 'rgba(255,255,255,0.85)', h = 3) => <rect key={`${x}-${y}-${w}-${fill}-${h}`} x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} />;
  const route = (c: string, w = 2.2, d = THUMB_ROUTE) => <path d={d} fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />;
  const checker = (
    <>
      <defs>
        <pattern id={`cthumb-chk-${id}`} width={8} height={8} patternUnits="userSpaceOnUse">
          <rect width={8} height={8} fill="#2b2b2b" />
          <rect width={4} height={4} fill="#3b3b3b" />
          <rect x={4} y={4} width={4} height={4} fill="#3b3b3b" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill={`url(#cthumb-chk-${id})`} />
    </>
  );
  const ink = isLight(accent) ? '#0A0A0A' : '#FFFFFF';
  let body: ReactNode;
  switch (id) {
    case 'map':
      body = (
        <>
          <rect width={W} height={H} fill="#1c1d21" />
          <path d="M0 30 L60 22 M0 58 L60 66 M22 0 L18 88 M44 0 L48 88" stroke="rgba(255,255,255,0.07)" strokeWidth={3} />
          {route(accent, 2.6, 'M14 50 C 20 32, 30 42, 34 26 S 48 18, 46 10')}
          <rect y={56} width={W} height={32} fill="rgba(0,0,0,0.6)" />
          {line(6, 62, 26, '#fff', 6)}
          {[0, 1, 2].map(i => line(6 + i * 17, 76, 12, 'rgba(255,255,255,0.75)', 3))}
        </>
      );
      break;
    case 'stack':
      body = (
        <>
          {checker}
          {[0, 1, 2].map(i => (
            <g key={i}>
              {line(20, 8 + i * 15, 20, 'rgba(255,255,255,0.6)', 2)}
              {line(14, 12 + i * 15, 32, '#fff', 5)}
            </g>
          ))}
          {route(accent, 2.2, 'M18 80 C 22 66, 30 72, 32 60 S 42 52, 42 50')}
        </>
      );
      break;
    case 'bold':
      body = (
        <>
          <rect width={W} height={H} fill={accent} />
          {route(hexToRgba(ink === '#FFFFFF' ? '#FFFFFF' : '#000000', 0.55), 2, 'M14 36 C 20 20, 30 30, 34 16 S 48 10, 46 6')}
          <text x={6} y={66} fontSize={24} fontWeight={900} fill={ink} fontFamily={FONT} letterSpacing={-1.5}>5.02</text>
          {line(6, 70, 24, ink, 2)}
          {[0, 1, 2].map(i => line(6 + i * 17, 79, 12, ink, 3))}
        </>
      );
      break;
    case 'summary':
      body = (
        <>
          <rect width={W} height={H} fill="#000" />
          <circle cx={11} cy={11} r={5} fill={hexToRgba(accent, 0.3)} />
          {line(19, 8, 22, '#fff', 3)}
          {line(19, 13, 14, 'rgba(255,255,255,0.4)', 2)}
          {[['#FFD60A', accent], ['#64D2FF', '#FF375F'], ['#30D158', '#BF5AF2']].map((row, r) => row.map((c, i) => (
            <g key={`${r}-${i}`}>
              {line(6 + i * 26, 26 + r * 20, 14, 'rgba(255,255,255,0.35)', 2)}
              {line(6 + i * 26, 31 + r * 20, 22, c, 5)}
            </g>
          )))}
        </>
      );
      break;
    case 'splits':
      body = (
        <>
          <rect width={W} height={H} fill="#0B0B0E" />
          {line(6, 6, 20, '#fff', 2)}
          {line(6, 11, 30, '#fff', 4)}
          {[34, 42, 30, 46, 38, 40].map((w, i) => (
            <g key={i}>
              {line(6, 22 + i * 7, 5, 'rgba(255,255,255,0.5)', 3)}
              {line(14, 22 + i * 7, w, i === 3 ? accent : 'rgba(255,255,255,0.25)', 3)}
            </g>
          ))}
          <path d="M6 80 L14 74 L22 76 L32 68 L42 72 L54 66 L54 84 L6 84 Z" fill={hexToRgba(accent, 0.35)} />
        </>
      );
      break;
    case 'photo':
      body = (
        <>
          <defs>
            <linearGradient id="cthumb-photo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5b6472" />
              <stop offset="100%" stopColor="#1f242c" />
            </linearGradient>
          </defs>
          <rect width={W} height={H} fill="url(#cthumb-photo)" />
          <path d="M8 52 L22 34 L32 44 L42 30 L54 52 Z" fill="rgba(255,255,255,0.18)" />
          <rect y={56} width={W} height={32} fill="rgba(0,0,0,0.5)" />
          {route('#fff', 1.6, 'M40 82 C 42 74, 46 78, 48 70 S 54 64, 54 62')}
          {line(6, 64, 26, '#fff', 5)}
          {[0, 1, 2].map(i => line(6 + i * 11, 76, 8, i === 0 ? accent : '#fff', 3))}
        </>
      );
      break;
    case 'editorial':
      body = (
        <>
          <rect width={W} height={H} fill={PAPER} />
          {line(6, 6, 18, INK, 2)}
          <rect x={6} y={11} width={48} height={1} fill={INK} />
          <text x={5} y={34} fontSize={20} fontWeight={900} fill={INK} fontFamily={FONT} letterSpacing={-1.5}>5.02</text>
          {route(INK, 1.4, 'M14 62 C 20 48, 30 56, 34 44 S 48 38, 46 36')}
          {[0, 1, 2].map(i => (
            <g key={i}>
              {line(6, 70 + i * 5, 12, 'rgba(17,17,17,0.6)', 2)}
              <rect x={20} y={71 + i * 5} width={22} height={0.6} fill="rgba(17,17,17,0.35)" />
              {line(44, 70 + i * 5, 10, INK, 2)}
            </g>
          ))}
        </>
      );
      break;
    case 'route':
    default:
      body = (
        <>
          {checker}
          <path d="M14 64 C 20 42, 30 52, 34 32 S 48 20, 46 12" fill="none" stroke={accent} strokeOpacity={0.3} strokeWidth={6} strokeLinecap="round" />
          {route(accent, 2.4, 'M14 64 C 20 42, 30 52, 34 32 S 48 20, 46 12')}
          {line(16, 74, 28, '#fff', 4)}
          {line(20, 81, 20, 'rgba(255,255,255,0.6)', 2)}
        </>
      );
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {body}
    </svg>
  );
}

function MapThumb({ theme }: { theme: MapThemeKey }) {
  const p = MAP_PREVIEW[theme] || { base: MAP_THEMES[theme].bg, road: '#ffffff', park: MAP_THEMES[theme].bg, water: MAP_THEMES[theme].bg };
  return (
    <svg viewBox="0 0 60 60" className="block w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width={60} height={60} fill={p.base} />
      <path d="M0 44 Q 18 36 32 48 T 60 44 V60 H0 Z" fill={p.water} />
      <rect x={36} y={5} width={19} height={15} rx={3} fill={p.park} />
      <path d="M0 20 L60 14 M18 0 L24 60 M0 34 L60 30 M44 0 L40 60" stroke={p.road} strokeWidth={3} fill="none" />
      <path d="M10 50 C 16 34, 26 40, 30 28 S 44 18, 50 10" fill="none" stroke="#FC5200" strokeWidth={2.6} strokeLinecap="round" />
    </svg>
  );
}

// ─── Chrome primitives ───────────────────────────────────────

function RoundButton({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="w-10 h-10 rounded-full pro-track flex items-center justify-center text-bone hover:bg-bone/10 transition-colors shrink-0"
    >
      {children}
    </button>
  );
}

function ControlHeading({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="hidden md:block text-[13px] font-semibold text-bone">{children}</h3>
      {hint && <p className="text-xs text-bone-dim md:mt-0.5">{hint}</p>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Modal
   ════════════════════════════════════════════════════════════════ */

export function CardioShareModal({ data, mapTheme, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [layout, setLayout] = useState<ShareLayout>('map');
  const [aspectRatio, setAspectRatio] = useState<'9/16' | '1/1'>('9/16');
  const [activeTab, setActiveTab] = useState<'layout' | 'theme' | 'colors'>('layout');
  const [selectedTheme, setSelectedTheme] = useState<MapThemeKey>(mapTheme && mapTheme in MAP_THEMES ? mapTheme : 'dark');
  const [accentId, setAccentId] = useState(ACCENTS[0].id);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [didSave, setDidSave] = useState(false);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });

  const accent = ACCENTS.find(a => a.id === accentId)?.hex || ACCENTS[0].hex;
  // White/volt vanish on the paper template, so fall back to ink there.
  const paperAccent = isLight(accent) ? INK : accent;
  const hasPro = useHasPro();
  const layoutLocked = !hasPro && PRO_LAYOUTS.has(layout);
  const unlockTemplate = () => requirePro(`The ${LAYOUT_OPTIONS.find(l => l.id === layout)?.label} template is part of ${BRAND.name} Pro.`);
  const isSquare = aspectRatio === '1/1';
  const designH = isSquare ? DESIGN_W : Math.round((DESIGN_W * 16) / 9);
  const isTransparent = TRANSPARENT_LAYOUTS.has(layout);

  // ─── Session data ───
  const route = useMemo(() => normalizeRoute(data.route), [data.route]);
  const pts = useMemo(() => project(route), [route]);
  const hasRoute = pts.length >= 2;
  const elevation = useMemo(() => elevationSeries(route), [route]);
  const isRide = data.type === 'cycle';
  const splitKm = isRide ? 5 : 1;
  const splits = useMemo(
    () => (route.every(p => p.ts > 0) ? computeSplits({ route, type: data.type, distanceKm: data.distanceKm }, splitKm) : []),
    [route, data.type, data.distanceKm, splitKm],
  );

  const day = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data.date || '');
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(data.date);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [data.date]);
  // Start time: first GPS fix if it carries a wall-clock timestamp, else the ISO date's time.
  const startedAt = useMemo(() => {
    const ts = route[0]?.ts;
    if (ts && ts > 1e12) return new Date(ts);
    return /T\d{2}:\d{2}/.test(data.date || '') ? day : null;
  }, [route, data.date, day]);

  const typeName = data.type === 'walk' ? 'Walk' : data.type === 'run' ? 'Run' : 'Ride';
  const title = startedAt ? `${partOfDay(startedAt)} ${typeName}` : typeName;
  const dateLine = startedAt ? format(startedAt, 'EEE, MMM d · h:mm a') : format(day, 'EEE, MMM d, yyyy');
  const shortDate = format(day, 'MMM d, yyyy');

  const km = Math.max(0, data.distanceKm || 0);
  const sec = Math.max(0, data.durationSec || 0);
  const distText = km.toFixed(2);
  const speed = data.avgSpeedKmh && data.avgSpeedKmh > 0 ? data.avgSpeedKmh : sec > 0 ? km / (sec / 3600) : 0;
  const paceSec = parsePace(data.avgPace) || (km > 0 ? sec / km : 0);

  const m = {
    distance: { label: 'Distance', value: distText, unit: 'km' },
    time: { label: 'Time', value: clock(sec), unit: undefined as string | undefined },
    pace: isRide
      ? { label: 'Avg speed', value: speed.toFixed(1), unit: 'km/h' }
      : { label: 'Avg pace', value: paceText(paceSec), unit: '/km' },
    calories: { label: 'Calories', value: String(Math.round(data.calories || 0)), unit: 'kcal' },
    elevation: (data.elevationGainM || 0) > 0 ? { label: 'Elev gain', value: String(Math.round(data.elevationGainM!)), unit: 'm' } : null,
    steps: (data.steps || 0) > 0 ? { label: 'Steps', value: data.steps!.toLocaleString(), unit: undefined } : null,
    maxSpeed: (data.maxSpeedKmh || 0) > 0 ? { label: 'Max speed', value: data.maxSpeedKmh!.toFixed(1), unit: 'km/h' } : null,
  };
  const trio = [m.pace, m.time, m.elevation && isRide ? m.elevation : m.calories];

  // ─── Responsive preview scaling ───
  const scale = stageSize.w > 0 && stageSize.h > 0 ? Math.min(stageSize.w / DESIGN_W, stageSize.h / designH, 1.25) : 0;

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      setStageSize({ w: Math.max(0, w), h: Math.max(0, h) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cycle = (dir: 1 | -1) =>
      setLayout(cur => {
        const idx = LAYOUT_OPTIONS.findIndex(l => l.id === cur);
        return LAYOUT_OPTIONS[(idx + dir + LAYOUT_OPTIONS.length) % LAYOUT_OPTIONS.length].id;
      });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') cycle(-1);
      else if (e.key === 'ArrowRight') cycle(1);
    };
    const unlock = lockBodyScroll();
    window.addEventListener('keydown', onKey);
    return () => {
      unlock();
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const layoutIndex = LAYOUT_OPTIONS.findIndex(l => l.id === layout);
  const goPrevious = () => setLayout(LAYOUT_OPTIONS[(layoutIndex - 1 + LAYOUT_OPTIONS.length) % LAYOUT_OPTIONS.length].id);
  const goNext = () => setLayout(LAYOUT_OPTIONS[(layoutIndex + 1) % LAYOUT_OPTIONS.length].id);

  const pickPhoto = async (file?: File | null) => {
    if (!file) return;
    try {
      setPhoto(await compressImageFile(file, 1440, 1920, 0.85));
      setLayout('photo');
    } catch {
      useUIStore.getState().showToast('Could not load that photo', 'error');
    }
  };

  // ─── Export ───
  const cardBg = layout === 'bold' ? accent : layout === 'editorial' ? PAPER : isTransparent ? 'transparent' : layout === 'summary' ? '#000000' : '#0B0B0D';
  const fileName = `${BRAND.slug}-${data.type}-${format(day, 'yyyy-MM-dd')}.png`;

  const getCanvas = async (): Promise<HTMLCanvasElement | null> => {
    if (!cardRef.current) return null;
    const solidBg = isTransparent ? undefined : cardBg;
    try {
      // Lay the card out at 3x inside the snapshot so vector routes and type stay sharp.
      return await toCanvas(cardRef.current, {
        pixelRatio: 1,
        width: DESIGN_W * PIXEL_RATIO,
        height: designH * PIXEL_RATIO,
        cacheBust: false,
        skipFonts: true,
        backgroundColor: solidBg,
        style: {
          borderRadius: '0',
          width: `${DESIGN_W}px`,
          height: `${designH}px`,
          transform: `scale(${PIXEL_RATIO})`,
          transformOrigin: 'top left',
        },
      });
    } catch (err) {
      console.warn('html-to-image failed, falling back to html2canvas:', err);
    }
    try {
      return await html2canvas(cardRef.current, {
        scale: PIXEL_RATIO,
        useCORS: true,
        allowTaint: true,
        backgroundColor: solidBg ?? null,
        logging: false,
        onclone: (_doc, el) => { el.style.borderRadius = '0'; },
      });
    } catch (err) {
      console.error('html2canvas also failed:', err);
      return null;
    }
  };

  const downloadCanvas = (canvas: HTMLCanvasElement) => {
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const flashSaved = () => {
    setDidSave(true);
    setTimeout(() => setDidSave(false), 2200);
  };

  const handleSave = async () => {
    if (layoutLocked && !unlockTemplate()) return;
    setBusy(true);
    try {
      await new Promise(r => setTimeout(r, 60));
      const canvas = await getCanvas();
      if (!canvas) {
        useUIStore.getState().showToast('Could not generate share image', 'error');
        return;
      }
      if (Capacitor.isNativePlatform()) {
        await Filesystem.writeFile({
          path: `${BRAND.name}/${fileName}`,
          data: canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''),
          directory: Directory.Documents,
          recursive: true,
        });
        useUIStore.getState().showToast(`Saved to Documents/${BRAND.name}`, 'success');
      } else {
        downloadCanvas(canvas);
        useUIStore.getState().showToast('Activity card saved', 'success');
      }
      flashSaved();
    } catch (err) {
      console.error('Save failed:', err);
      useUIStore.getState().showToast('Failed to save image. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const shareText = `${title}: ${distText} km in ${clock(sec)}. Tracked with ${BRAND.name}.`;

  const handleShare = async () => {
    if (layoutLocked && !unlockTemplate()) return;
    setBusy(true);
    try {
      await new Promise(r => setTimeout(r, 60));
      const canvas = await getCanvas();
      if (!canvas) {
        useUIStore.getState().showToast('Could not generate share image', 'error');
        return;
      }
      if (Capacitor.isNativePlatform()) {
        const file = await Filesystem.writeFile({
          path: fileName,
          data: canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''),
          directory: Directory.Cache,
        });
        await Share.share({ title, text: shareText, files: [file.uri], dialogTitle: 'Share activity' });
        return;
      }
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title, text: shareText, files: [file] });
      } else {
        downloadCanvas(canvas);
        flashSaved();
      }
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();
      if (err?.name !== 'AbortError' && !msg.includes('cancel')) {
        console.error('Share failed:', err);
        useUIStore.getState().showToast('Failed to share card. Try saving the image instead.', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  // ─── Card templates (fixed 360px design) ───
  const pad = isSquare ? 20 : 24;
  const innerW = DESIGN_W - pad * 2;
  const TypeIcon = isRide ? Bike : Footprints;

  const header = (color = '#FFFFFF', sub = 'rgba(255,255,255,0.65)') => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Wordmark color={color} />
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', color: sub }}>{shortDate}</span>
    </div>
  );

  const statsRow = (items: ({ label: string; value: string; unit?: string } | null)[], opts: { size?: number; color?: string; labelColor?: string; divider?: string } = {}) => {
    const list = items.filter(Boolean) as { label: string; value: string; unit?: string }[];
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }}>
        {list.map((s, i) => (
          <div key={s.label} style={{ paddingLeft: i ? 12 : 0, borderLeft: i && opts.divider ? `1px solid ${opts.divider}` : undefined, minWidth: 0 }}>
            <Stat label={s.label} value={s.value} unit={s.unit} size={opts.size ?? 20} color={opts.color} labelColor={opts.labelColor} />
          </div>
        ))}
      </div>
    );
  };

  const noRoute = (color: string) => (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color }}>
      No GPS route
    </div>
  );

  let content: ReactNode;
  switch (layout) {
    case 'map': {
      content = (
        <div style={{ position: 'absolute', inset: 0, background: '#0B0B0D' }}>
          <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
            {hasRoute || data.currentLocation ? (
              <RouteMap
                route={route}
                currentLocation={data.currentLocation}
                theme={selectedTheme}
                height="100%"
                highlightColor={accent}
                isCapturing={busy}
                fitToContainer
                showZoomControls={false}
                interactive={false}
                cardioType={data.type}
                hideMarkers
                recenterTrigger={isSquare ? 1 : 0}
                mapPaddingTopLeft={[34, isSquare ? 80 : 150]}
                mapPaddingBottomRight={[34, isSquare ? 130 : 250]}
              />
            ) : noRoute('rgba(255,255,255,0.3)')}
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: isSquare ? 100 : 190, zIndex: 1000, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0) 100%)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: isSquare ? 170 : 320, zIndex: 1000, pointerEvents: 'none', background: 'linear-gradient(0deg, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.72) 45%, rgba(0,0,0,0) 100%)' }} />
          <div style={{ position: 'absolute', inset: 0, zIndex: 1001, pointerEvents: 'none', padding: pad, display: 'flex', flexDirection: 'column' }}>
            {header()}
            <div style={{ marginTop: isSquare ? 8 : 14 }}>
              <div style={{ fontSize: isSquare ? 18 : 24, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff', lineHeight: 1.1 }}>{title}</div>
              {!isSquare && <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>{dateLine}</div>}
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: isSquare ? 46 : 68, fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 0.9, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{distText}</span>
              <span style={{ fontSize: isSquare ? 15 : 18, fontWeight: 800, color: accent }}>km</span>
            </div>
            <div style={{ marginTop: isSquare ? 12 : 16, paddingTop: isSquare ? 10 : 14, borderTop: '1px solid rgba(255,255,255,0.16)' }}>
              {statsRow(trio, { size: isSquare ? 17 : 20, divider: 'rgba(255,255,255,0.14)' })}
            </div>
          </div>
        </div>
      );
      break;
    }

    case 'stack': {
      const rows = [m.distance, m.pace, m.time];
      const valueSize = isSquare ? 30 : 40;
      content = (
        <div style={{ position: 'absolute', inset: 0, padding: pad, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: isSquare ? 10 : 16, textShadow: '0 1px 10px rgba(0,0,0,0.35)' }}>
          {rows.map(r => (
            <div key={r.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: isSquare ? 11 : 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{r.label}</span>
              <span style={{ marginTop: 2, fontSize: valueSize, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.05, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                {r.value}
                {r.unit && <span style={{ fontSize: Math.round(valueSize * 0.45), fontWeight: 700, marginLeft: 4 }}>{r.unit}</span>}
              </span>
            </div>
          ))}
          {hasRoute && (
            <div style={{ marginTop: isSquare ? 2 : 8, filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.35))' }}>
              <RouteSvg pts={pts} width={isSquare ? 120 : 200} height={isSquare ? 70 : 170} color={accent} stroke={isSquare ? 3 : 4} glow={false} ends={false} />
            </div>
          )}
          <Wordmark size={isSquare ? 9 : 10} />
        </div>
      );
      break;
    }

    case 'bold': {
      const ink = isLight(accent) ? '#0A0A0A' : '#FFFFFF';
      const soft = isLight(accent) ? 'rgba(10,10,10,0.62)' : 'rgba(255,255,255,0.72)';
      const bigSize = isSquare ? 88 : distText.length > 5 ? 112 : 132;
      content = (
        <div style={{ position: 'absolute', inset: 0, padding: pad, display: 'flex', flexDirection: 'column', background: accent }}>
          {header(ink, soft)}
          {hasRoute && !isSquare && (
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center' }}>
              <RouteSvg pts={pts} width={innerW} height={290} color={ink} stroke={4} glow={false} endFill={accent} />
            </div>
          )}
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', minHeight: 0 }}>
            {hasRoute && isSquare && <RouteSvg pts={pts} width={120} height={100} color={ink} stroke={3} glow={false} endFill={accent} />}
          </div>
          <div style={{ fontSize: isSquare ? 11 : 13, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: soft }}>{title}</div>
          <div style={{ marginTop: 2, fontSize: bigSize, fontWeight: 900, letterSpacing: '-0.065em', lineHeight: 0.86, color: ink, marginLeft: -4, fontVariantNumeric: 'tabular-nums' }}>{distText}</div>
          <div style={{ marginTop: 6, fontSize: isSquare ? 12 : 14, fontWeight: 900, letterSpacing: '0.34em', color: ink }}>KILOMETERS</div>
          <div style={{ marginTop: isSquare ? 12 : 20, paddingTop: isSquare ? 10 : 14, borderTop: `2px solid ${ink}` }}>
            {statsRow(trio, { size: isSquare ? 17 : 21, color: ink, labelColor: soft })}
          </div>
        </div>
      );
      break;
    }

    case 'summary': {
      const tiles = [
        { ...m.time, color: '#FFD60A' },
        { ...m.distance, color: accent === '#FFFFFF' ? '#64D2FF' : accent },
        { ...m.pace, color: '#64D2FF' },
        { ...m.calories, color: '#FF375F' },
        ...(m.elevation ? [{ ...m.elevation, color: '#30D158' }] : []),
        ...(isRide && m.maxSpeed ? [{ ...m.maxSpeed, color: '#BF5AF2' }] : m.steps ? [{ ...m.steps, color: '#BF5AF2' }] : []),
      ].slice(0, isSquare ? 4 : 6);
      const rows: (typeof tiles)[] = [];
      for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));
      content = (
        <div style={{ position: 'absolute', inset: 0, padding: pad, display: 'flex', flexDirection: 'column', background: '#000' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: isSquare ? 40 : 48, height: isSquare ? 40 : 48, borderRadius: 999, background: hexToRgba(accent === '#FFFFFF' ? '#64D2FF' : accent, 0.2), color: accent === '#FFFFFF' ? '#64D2FF' : accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <TypeIcon size={isSquare ? 20 : 24} strokeWidth={2.2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: isSquare ? 17 : 20, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em', lineHeight: 1.15 }}>Outdoor {typeName}</div>
              <div style={{ marginTop: 3, fontSize: 11, fontWeight: 500, color: '#8E8E93' }}>{dateLine}</div>
            </div>
            {hasRoute && (
              <div style={{ width: isSquare ? 52 : 64, height: isSquare ? 52 : 64, borderRadius: 14, background: '#1C1C1E', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RouteSvg pts={pts} width={isSquare ? 44 : 54} height={isSquare ? 44 : 54} color={accent === '#FFFFFF' ? '#64D2FF' : accent} stroke={2} glow={false} ends={false} />
              </div>
            )}
          </div>
          <div style={{ marginTop: isSquare ? 14 : 22, fontSize: 12, fontWeight: 700, color: '#fff' }}>Workout details</div>
          <div style={{ marginTop: 8, borderRadius: 16, background: '#1C1C1E', padding: isSquare ? '4px 14px' : '6px 16px' }}>
            {rows.map((row, r) => (
              <div key={r} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: isSquare ? '10px 0' : '14px 0', borderTop: r ? '1px solid #2C2C2E' : undefined }}>
                {row.map(t => (
                  <div key={t.label} style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#8E8E93' }}>{t.label}</div>
                    <div style={{ marginTop: 3, fontSize: isSquare ? 24 : 30, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.05, color: t.color, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {t.value}
                      {t.unit && <span style={{ fontSize: isSquare ? 13 : 15, fontWeight: 600, marginLeft: 2 }}>{t.unit === 'kcal' ? 'CAL' : t.unit.toUpperCase()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {!isSquare && elevation && (
            <div style={{ marginTop: 14, borderRadius: 16, background: '#1C1C1E', padding: '12px 16px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 500, color: '#8E8E93' }}>
                <span>Elevation</span>
                <span style={{ color: '#30D158', fontWeight: 600 }}>{Math.round(Math.min(...elevation))}–{Math.round(Math.max(...elevation))} m</span>
              </div>
              <div style={{ marginTop: 8 }}><ElevationArea values={elevation} width={innerW - 32} height={54} color="#30D158" /></div>
            </div>
          )}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', justifyContent: 'center' }}><Wordmark color="rgba(255,255,255,0.55)" size={10} /></div>
        </div>
      );
      break;
    }

    case 'splits': {
      const maxRows = isSquare ? 6 : 10;
      const shown = splits.slice(0, maxRows);
      const full = splits.filter(s => !s.partial);
      const fastest = full.length ? Math.min(...full.map(s => s.paceSec)) : 0;
      const maxKmh = Math.max(1, ...shown.map(s => s.kmh));
      const minKmh = Math.min(...shown.map(s => s.kmh));
      const rowH = isSquare ? 19 : 22;
      content = (
        <div style={{ position: 'absolute', inset: 0, padding: pad, display: 'flex', flexDirection: 'column', background: '#0B0B0D' }}>
          {header()}
          <div style={{ marginTop: isSquare ? 10 : 16, fontSize: isSquare ? 19 : 24, fontWeight: 900, letterSpacing: '-0.02em', color: '#fff', lineHeight: 1.05, textTransform: 'uppercase' }}>{title}</div>
          <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>{distText} km · {clock(sec)} · {m.pace.value} {m.pace.unit}</div>
          {!isSquare && hasRoute && (
            <div style={{ marginTop: 14, borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'center', padding: 8 }}>
              <RouteSvg pts={pts} width={innerW - 18} height={splits.length > 6 ? 118 : 160} color={accent} stroke={3} endFill="#0B0B0D" />
            </div>
          )}
          <div style={{ marginTop: isSquare ? 12 : 16, display: 'flex', fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.45)' }}>
            <span style={{ width: 34 }}>KM</span>
            <span style={{ width: 52 }}>{isRide ? 'KM/H' : 'PACE'}</span>
            <span style={{ flex: 1 }} />
          </div>
          {shown.length > 0 ? (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {shown.map(s => {
                const best = !s.partial && s.paceSec === fastest;
                const w = 0.35 + 0.65 * (maxKmh === minKmh ? 1 : (s.kmh - minKmh) / (maxKmh - minKmh));
                return (
                  <div key={s.index} style={{ display: 'flex', alignItems: 'center', height: rowH }}>
                    <span style={{ width: 34, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums' }}>{s.partial ? s.km.toFixed(1) : s.index * splitKm}</span>
                    <span style={{ width: 52, fontSize: 13, fontWeight: 800, color: best ? accent : '#fff', fontVariantNumeric: 'tabular-nums' }}>{isRide ? s.kmh.toFixed(1) : paceText(s.paceSec)}</span>
                    <div style={{ flex: 1, height: rowH - 8, borderRadius: 4, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.round(w * 100)}%`, height: '100%', borderRadius: 4, background: best ? accent : 'rgba(255,255,255,0.22)' }} />
                    </div>
                  </div>
                );
              })}
              {splits.length > shown.length && (
                <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>+{splits.length - shown.length} more splits</div>
              )}
            </div>
          ) : (
            <div style={{ marginTop: 8, padding: '14px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>
              Splits appear for GPS-tracked sessions over {splitKm} km.
            </div>
          )}
          <div style={{ flex: 1 }} />
          {!isSquare && elevation && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>ELEVATION{m.elevation ? ` · +${m.elevation.value} M` : ''}</div>
              <ElevationArea values={elevation} width={innerW} height={46} color={accent} />
            </div>
          )}
          <div style={{ paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
            {statsRow([m.time, m.calories, m.elevation || m.steps], { size: isSquare ? 16 : 19, divider: 'rgba(255,255,255,0.12)' })}
          </div>
        </div>
      );
      break;
    }

    case 'photo':
      content = (
        <div style={{ position: 'absolute', inset: 0, background: '#111' }}>
          {photo ? (
            <img src={photo} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #3a4150 0%, #14171d 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'rgba(255,255,255,0.55)' }}>
              <div style={{ width: 54, height: 54, borderRadius: 18, border: '1.5px dashed rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ImagePlus size={24} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Add a photo to use this template</div>
            </div>
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 20%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.88) 100%)' }} />
          <div style={{ position: 'absolute', inset: 0, padding: pad, display: 'flex', flexDirection: 'column' }}>
            {header()}
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.24em', textTransform: 'uppercase', color: accent }}>{title}</div>
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ fontSize: isSquare ? 44 : 60, fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 0.9, color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,0.35)' }}>{distText}</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>km</span>
                </div>
              </div>
              {hasRoute && <RouteSvg pts={pts} width={isSquare ? 72 : 96} height={isSquare ? 64 : 88} color="#FFFFFF" stroke={2.6} glow={false} endColor={accent} endFill="#FFFFFF" />}
            </div>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.22)' }}>
              {statsRow(trio, { size: isSquare ? 17 : 20, divider: 'rgba(255,255,255,0.2)' })}
            </div>
          </div>
        </div>
      );
      break;

    case 'editorial': {
      const table = [m.time, m.pace, m.calories, m.elevation, isRide ? m.maxSpeed : m.steps].filter(Boolean).slice(0, isSquare ? 3 : 5) as { label: string; value: string; unit?: string }[];
      content = (
        <div style={{ position: 'absolute', inset: 0, padding: pad, display: 'flex', flexDirection: 'column', background: PAPER, color: INK }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Wordmark color={INK} size={11} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(17,17,17,0.6)' }}>NO. {format(day, 'MMdd')}</span>
          </div>
          <div style={{ marginTop: 10, height: 2, background: INK }} />
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', color: 'rgba(17,17,17,0.7)' }}>
            <span>{typeName.toUpperCase()} REPORT</span>
            <span>{format(day, 'dd.MM.yyyy')}</span>
          </div>
          <div style={{ marginTop: isSquare ? 6 : 14, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <span style={{ fontSize: isSquare ? 84 : 112, fontWeight: 900, letterSpacing: '-0.07em', lineHeight: 0.84, marginLeft: -4, fontVariantNumeric: 'tabular-nums' }}>{distText}</span>
            <span style={{ marginTop: 4, fontSize: 14, fontWeight: 900, letterSpacing: '0.08em', color: paperAccent }}>KM</span>
          </div>
          <div style={{ marginTop: 10, fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: 'italic', fontSize: isSquare ? 16 : 20, color: 'rgba(17,17,17,0.85)' }}>{title}{startedAt ? `, ${format(startedAt, 'h:mm a')}` : ''}</div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {!isSquare && hasRoute && <RouteSvg pts={pts} width={innerW} height={200} color={INK} stroke={2.6} glow={false} endFill={PAPER} endColor={paperAccent} />}
          </div>
          <div>
            {table.map(r => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: isSquare ? '5px 0' : '7px 0', borderTop: '1px solid rgba(17,17,17,0.14)' }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(17,17,17,0.6)' }}>{r.label}</span>
                <span style={{ flex: 1, borderBottom: '1px dotted rgba(17,17,17,0.3)', transform: 'translateY(-3px)' }} />
                <span style={{ fontSize: isSquare ? 14 : 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                  {r.value}{r.unit && <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 3, color: 'rgba(17,17,17,0.6)' }}>{r.unit}</span>}
                </span>
              </div>
            ))}
            <div style={{ height: 2, background: INK }} />
          </div>
        </div>
      );
      break;
    }

    case 'route':
    default:
      content = (
        <div style={{ position: 'absolute', inset: 0, padding: pad, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: isSquare ? 10 : 18, textShadow: '0 1px 10px rgba(0,0,0,0.4)' }}>
          {hasRoute ? (
            <RouteSvg pts={pts} width={isSquare ? 240 : innerW} height={isSquare ? 220 : 380} color={accent} stroke={isSquare ? 4 : 5} />
          ) : (
            <div style={{ position: 'relative', width: innerW, height: isSquare ? 200 : 360 }}>{noRoute('rgba(255,255,255,0.6)')}</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: isSquare ? 26 : 32, fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1 }}>{distText}<span style={{ fontSize: 14, marginLeft: 4 }}>km</span></span>
            <span style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{clock(sec)} · {m.pace.value} {m.pace.unit}</span>
          </div>
          <Wordmark size={10} />
        </div>
      );
  }

  const cardTemplate = (
    <div
      ref={cardRef}
      className="relative overflow-hidden rounded-[2.2rem]"
      style={{ width: DESIGN_W, height: designH, background: cardBg, fontFamily: FONT } as CSSProperties}
    >
      {content}
    </div>
  );

  const TABS = [
    { id: 'layout' as const, label: 'Template', icon: LayoutTemplate },
    { id: 'theme' as const, label: 'Map style', icon: MapIcon },
    { id: 'colors' as const, label: 'Colour', icon: Palette },
  ];

  const tabVisibility = (id: typeof activeTab) => `${activeTab === id ? '' : 'hidden'} md:block`;
  const hScroll = 'flex md:grid gap-3 overflow-x-auto md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
  const mapStyleUsed = layout === 'map';
  const subtitle = `${distText} km · ${shortDate}`;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="pro-scope fixed inset-0 z-[9999] flex md:items-center md:justify-center md:p-6 font-sans select-none"
      >
        <div className="absolute inset-0 hidden md:block bg-black/60 backdrop-blur-sm" onClick={onClose} />

        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Share activity"
          initial={{ opacity: 0, y: 16, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative flex flex-col md:flex-row w-full h-full md:max-w-[1000px] md:h-[min(800px,calc(100dvh-48px))] md:rounded-[28px] overflow-hidden bg-[rgb(var(--color-ink))] md:border md:border-line"
          style={{ boxShadow: '0 30px 80px rgba(0,0,0,0.35)' }}
        >
          {/* ═════ Preview column ═════ */}
          <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-[rgb(var(--color-ink-2))]">
            <div className="md:hidden flex items-center gap-2 px-3 pb-2" style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
              <RoundButton onClick={onClose} label="Close"><X size={18} /></RoundButton>
              <div className="flex-1 min-w-0 text-center">
                <div className="text-[15px] font-semibold text-bone leading-tight">Share activity</div>
                <div className="text-[11px] text-bone-dim truncate">{title} · {subtitle}</div>
              </div>
              <RoundButton
                onClick={() => setAspectRatio(prev => (prev === '9/16' ? '1/1' : '9/16'))}
                label={aspectRatio === '9/16' ? 'Switch to square' : 'Switch to story'}
              >
                {aspectRatio === '9/16' ? <Smartphone size={17} /> : <SquareIcon size={16} />}
              </RoundButton>
            </div>

            <div ref={stageRef} className="flex-1 min-h-0 flex items-center justify-center px-6 py-2 md:p-8">
              <div className="relative shrink-0" style={{ width: DESIGN_W * scale, height: designH * scale, visibility: scale ? 'visible' : 'hidden' }}>
                <div
                  className={`absolute left-0 top-0 rounded-[2.2rem] overflow-hidden ${isTransparent ? 'pro-checker' : ''}`}
                  style={{
                    width: DESIGN_W,
                    height: designH,
                    transform: `scale(${scale || 1})`,
                    transformOrigin: 'top left',
                    boxShadow: '0 24px 60px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.04)',
                  }}
                >
                  {cardTemplate}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 pb-3 md:pb-6 pt-1">
              <RoundButton onClick={goPrevious} label="Previous template"><ChevronLeft size={18} /></RoundButton>
              <div className="w-32 text-center">
                <div className="text-[13px] font-semibold text-bone truncate">{LAYOUT_OPTIONS[layoutIndex].label}</div>
                <div className="flex justify-center gap-1 mt-1.5">
                  {LAYOUT_OPTIONS.map(o => (
                    <span key={o.id} className={`h-1 rounded-full transition-all duration-300 ${o.id === layout ? 'w-4 bg-bone' : 'w-1 bg-bone/25'}`} />
                  ))}
                </div>
              </div>
              <RoundButton onClick={goNext} label="Next template"><ChevronRight size={18} /></RoundButton>
            </div>
          </div>

          {/* ═════ Controls column / bottom sheet ═════ */}
          <div
            className="relative shrink-0 md:w-[380px] flex flex-col bg-[rgb(var(--color-ink))] rounded-t-[28px] md:rounded-none border-t md:border-t-0 md:border-l border-line"
            style={{ boxShadow: '0 -10px 30px rgba(0,0,0,0.06)' }}
          >
            <div className="hidden md:flex items-start justify-between gap-3 px-6 pt-6 pb-5 border-b border-line">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-bone leading-tight">Share activity</h2>
                <p className="text-xs text-bone-dim mt-1 truncate">{title} · {subtitle}</p>
              </div>
              <RoundButton onClick={onClose} label="Close"><X size={18} /></RoundButton>
            </div>

            <div className="md:hidden px-4 pt-4">
              <div role="tablist" className="pro-track flex p-1 rounded-full">
                {TABS.map(t => {
                  const active = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveTab(t.id)}
                      className={`relative flex-1 h-9 rounded-full text-[13px] font-medium transition-colors ${active ? 'text-bone' : 'text-bone-dim'}`}
                    >
                      {active && (
                        <motion.span layoutId="cardio-share-tab" className="absolute inset-0 rounded-full pro-thumb" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
                      )}
                      <span className="relative flex items-center justify-center gap-1.5">
                        <t.icon size={14} />
                        {t.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="md:flex-1 md:min-h-0 overflow-y-auto overscroll-contain px-4 md:px-6 pt-4 pb-3 md:py-6 md:space-y-8 min-h-[132px]">
              {/* Template */}
              <section className={tabVisibility('layout')}>
                <ControlHeading>Template</ControlHeading>
                <div className={`${hScroll} md:grid-cols-4`}>
                  {LAYOUT_OPTIONS.filter(opt => CAN_UPSELL || hasPro || !PRO_LAYOUTS.has(opt.id)).map(opt => {
                    const selected = layout === opt.id;
                    return (
                      <button key={opt.id} type="button" onClick={() => setLayout(opt.id)} aria-pressed={selected} className="shrink-0 w-[62px] md:w-auto flex flex-col items-center gap-1.5 group">
                        <span className={`relative block w-full aspect-[60/88] rounded-xl overflow-hidden transition-all ${selected ? 'ring-2 ring-bone ring-offset-2 ring-offset-[rgb(var(--color-ink))]' : 'ring-1 ring-line group-hover:ring-bone-dim/50'}`}>
                          <LayoutThumb id={opt.id} accent={accent} />
                          {!hasPro && PRO_LAYOUTS.has(opt.id) && (
                            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/70 text-[#f5b301] flex items-center justify-center" aria-label="Pro">
                              <Crown size={9} />
                            </span>
                          )}
                        </span>
                        <span className={`text-[11px] font-medium ${selected ? 'text-bone' : 'text-bone-dim'}`}>{opt.short}</span>
                      </button>
                    );
                  })}
                </div>
                {layout === 'photo' && (
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="flex-1 h-10 rounded-full pro-track text-bone text-[13px] font-semibold flex items-center justify-center gap-2">
                      <ImagePlus size={16} /> {photo ? 'Change photo' : 'Add photo'}
                    </button>
                    {photo && (
                      <button type="button" onClick={() => setPhoto(null)} className="w-10 h-10 rounded-full pro-track text-bone flex items-center justify-center" aria-label="Remove photo" title="Remove photo">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
              </section>

              {/* Format (desktop; mobile uses the top-bar toggle) */}
              <section className="hidden md:block">
                <ControlHeading>Format</ControlHeading>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: '9/16' as const, label: 'Story', sub: '1080 × 1920', icon: Smartphone },
                    { id: '1/1' as const, label: 'Square', sub: '1080 × 1080', icon: SquareIcon },
                  ]).map(f => {
                    const selected = aspectRatio === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setAspectRatio(f.id)}
                        aria-pressed={selected}
                        className={`flex items-center gap-2.5 p-3 rounded-2xl text-left transition-colors border ${selected ? 'border-bone bg-bone/[0.04]' : 'border-line hover:border-bone-dim/50'}`}
                      >
                        <f.icon size={18} className={selected ? 'text-bone' : 'text-bone-dim'} />
                        <span>
                          <span className="block text-[13px] font-semibold text-bone">{f.label}</span>
                          <span className="block text-[11px] text-bone-dim tabular-nums">{f.sub}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Map style */}
              <section className={tabVisibility('theme')}>
                <ControlHeading hint={mapStyleUsed ? undefined : 'Only the Map template shows map tiles.'}>Map style</ControlHeading>
                <div className={`${hScroll} md:grid-cols-4 ${mapStyleUsed ? '' : 'opacity-40 pointer-events-none'}`}>
                  {AVAILABLE_THEMES.map(t => {
                    const selected = selectedTheme === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setSelectedTheme(t)}
                        aria-pressed={selected}
                        disabled={!mapStyleUsed}
                        className="shrink-0 w-[62px] md:w-auto flex flex-col items-center gap-1.5 group"
                      >
                        <span className={`block w-full aspect-square rounded-xl overflow-hidden transition-all ${selected ? 'ring-2 ring-bone ring-offset-2 ring-offset-[rgb(var(--color-ink))]' : 'ring-1 ring-line group-hover:ring-bone-dim/50'}`}>
                          <MapThumb theme={t} />
                        </span>
                        <span className={`text-[11px] font-medium ${selected ? 'text-bone' : 'text-bone-dim'}`}>{MAP_THEMES[t].label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Colours */}
              <section className={tabVisibility('colors')}>
                <ControlHeading>Accent colour</ControlHeading>
                <div className="flex items-center gap-2.5 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap">
                  {ACCENTS.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setAccentId(c.id)}
                      aria-label={c.label}
                      aria-pressed={accentId === c.id}
                      title={c.label}
                      className={`shrink-0 w-8 h-8 rounded-full transition-transform ${accentId === c.id ? 'ring-2 ring-bone ring-offset-2 ring-offset-[rgb(var(--color-ink))] scale-105' : 'hover:scale-105'}`}
                      style={{ background: c.hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' }}
                    />
                  ))}
                </div>
              </section>
            </div>

            <div className="flex items-center gap-2.5 px-4 md:px-6 pt-3 md:pt-4 md:pb-6 border-t border-line" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
              <button
                type="button"
                onClick={handleSave}
                disabled={busy || (layout === 'photo' && !photo)}
                className="h-12 px-5 rounded-full pro-track text-bone text-sm font-semibold flex items-center justify-center gap-2 hover:bg-bone/10 transition-colors disabled:opacity-50"
              >
                {didSave ? <Check size={18} className="text-viz-elev" /> : <Download size={18} />}
                {didSave ? 'Saved' : 'Save'}
              </button>
              <button
                type="button"
                onClick={handleShare}
                disabled={busy || (layout === 'photo' && !photo)}
                className="flex-1 h-12 rounded-full bg-bone text-ink text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {busy ? <><Loader2 size={18} className="animate-spin" /> Preparing…</> : layoutLocked ? <><Crown size={17} /> Unlock with Pro</> : <><Share2 size={18} /> Share</>}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
