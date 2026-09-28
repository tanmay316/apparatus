import React, { useRef, useState, useMemo, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Download, Check, Share2, ChevronLeft, ChevronRight, Loader2,
  Smartphone, Square as SquareIcon, LayoutTemplate, Map as MapIcon, Palette,
} from 'lucide-react';
import { format } from 'date-fns';
import { toCanvas } from 'html-to-image';
import html2canvas from 'html2canvas';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { useUIStore } from '@/stores/ui-store';
import { RouteMap, MAP_THEMES, type MapThemeKey } from '@/components/cardio/RouteMap';
import type { RoutePoint } from '@/types';

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

function formatDuration(sec: number): string {
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.floor(sec % 60)}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

type ShareLayout =
  | 'pro-glass'
  | 'sunset-glow'
  | 'cyber-neon'
  | 'map-hero'
  | 'path-minimal'
  | 'stats-pro'
  | 'polaroid-vintage'
  | 'a-shape-stencil'
  | 'transparent-sticker';

const LAYOUT_OPTIONS: { id: ShareLayout; label: string; short: string }[] = [
  { id: 'pro-glass', label: 'Pro Glass', short: 'Glass' },
  { id: 'sunset-glow', label: 'Sunset Dusk', short: 'Sunset' },
  { id: 'cyber-neon', label: 'Cyber Neon', short: 'Neon' },
  { id: 'map-hero', label: 'Map Hero', short: 'Map' },
  { id: 'path-minimal', label: 'Pure Path', short: 'Route' },
  { id: 'stats-pro', label: 'Telemetry', short: 'Stats' },
  { id: 'polaroid-vintage', label: 'Polaroid', short: 'Polaroid' },
  { id: 'a-shape-stencil', label: 'A-Stencil', short: 'Stencil' },
  { id: 'transparent-sticker', label: 'Sticker', short: 'Sticker' },
];

const AVAILABLE_THEMES = Object.keys(MAP_THEMES) as MapThemeKey[];

const PATH_COLORS = [
  { id: 'gradient', swatch: 'linear-gradient(90deg, #fbbf24, #f43f5e, #a855f7)', label: 'Aurora' },
  { id: '#f97316', swatch: '#f97316', label: 'Orange' },
  { id: '#06b6d4', swatch: '#06b6d4', label: 'Cyan' },
  { id: '#10b981', swatch: '#10b981', label: 'Emerald' },
  { id: '#a855f7', swatch: '#a855f7', label: 'Purple' },
  { id: '#f43f5e', swatch: '#f43f5e', label: 'Rose' },
  { id: '#ffffff', swatch: '#ffffff', label: 'White' },
];

const TEXT_COLORS = [
  { id: 'orange', label: 'Amber', cls: 'text-amber-500', swatch: '#f59e0b' },
  { id: 'gradient', label: 'Aurora', cls: 'bg-gradient-to-r from-[#fbbf24] via-[#f43f5e] to-[#a855f7] text-transparent bg-clip-text', swatch: 'linear-gradient(90deg, #fbbf24, #f43f5e, #a855f7)' },
  { id: 'cyan', label: 'Cyan', cls: 'text-cyan-400', swatch: '#22d3ee' },
  { id: 'emerald', label: 'Emerald', cls: 'text-emerald-400', swatch: '#34d399' },
  { id: 'purple', label: 'Purple', cls: 'text-purple-400', swatch: '#c084fc' },
  { id: 'rose', label: 'Rose', cls: 'text-rose-400', swatch: '#fb7185' },
  { id: 'white', label: 'White', cls: 'text-white', swatch: '#ffffff' },
];

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

const CARD_BG: Partial<Record<ShareLayout, string>> = {
  'sunset-glow': 'linear-gradient(180deg, #1c0b29 0%, #35102a 50%, #0d0402 100%)',
  'cyber-neon': '#03060f',
};

/* ─── Template thumbnails ─────────────────────────────────────── */

const THUMB_ROUTE = 'M14 60 C 20 42, 30 52, 34 36 S 48 24, 46 14';

function LayoutThumb({ id }: { id: ShareLayout }) {
  const W = 60, H = 88;
  const line = (x: number, y: number, w: number, fill = 'rgba(255,255,255,0.85)', h = 3) => (
    <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} />
  );
  const mapBg = (c: string) => (
    <>
      <rect width={W} height={H} fill={c} />
      <path d="M0 30 L60 22 M0 58 L60 66 M22 0 L18 88 M44 0 L48 88" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
    </>
  );
  const route = (c: string, w = 2.2) => (
    <path d={THUMB_ROUTE} fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
  );
  const checker = (
    <>
      <defs>
        <pattern id={`thumb-chk-${id}`} width={8} height={8} patternUnits="userSpaceOnUse">
          <rect width={8} height={8} fill="#2b2b2b" />
          <rect width={4} height={4} fill="#3b3b3b" />
          <rect x={4} y={4} width={4} height={4} fill="#3b3b3b" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill={`url(#thumb-chk-${id})`} />
    </>
  );

  let body: React.ReactNode;
  switch (id) {
    case 'pro-glass':
      body = (
        <>
          {mapBg('#1d2530')}
          {route('#f97316')}
          <rect x={5} y={60} width={50} height={23} rx={5} fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.2)" strokeWidth={0.5} />
          {line(9, 65, 24, '#fff', 4)}
          {line(9, 74, 11)}
          {line(24, 74, 11)}
          {line(39, 74, 11, '#f59e0b')}
        </>
      );
      break;
    case 'sunset-glow':
      body = (
        <>
          <defs>
            <linearGradient id="thumb-sunset" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1c0b29" />
              <stop offset="50%" stopColor="#35102a" />
              <stop offset="100%" stopColor="#0d0402" />
            </linearGradient>
          </defs>
          <rect width={W} height={H} fill="url(#thumb-sunset)" />
          {route('#fb923c')}
          {line(7, 64, 26, '#fde68a', 5)}
          {line(7, 74, 12, 'rgba(255,255,255,0.7)')}
          {line(23, 74, 12, 'rgba(255,255,255,0.7)')}
          {line(39, 74, 12, '#fbbf24')}
        </>
      );
      break;
    case 'cyber-neon':
      body = (
        <>
          <rect width={W} height={H} fill="#03060f" />
          {line(7, 7, 22, '#22d3ee', 2)}
          {route('#00f5d4', 2.5)}
          {line(7, 64, 26, '#67e8f9', 5)}
          {line(7, 74, 12, 'rgba(255,255,255,0.7)')}
          {line(23, 74, 12, 'rgba(255,255,255,0.7)')}
          {line(39, 74, 12, '#22d3ee')}
        </>
      );
      break;
    case 'map-hero':
      body = (
        <>
          {mapBg('#2a3340')}
          {route('#f97316', 2.6)}
          <rect x={5} y={70} width={50} height={13} rx={6.5} fill="rgba(0,0,0,0.8)" />
          {line(10, 75, 12, '#fff')}
          {line(26, 75, 9)}
          {line(40, 75, 10)}
        </>
      );
      break;
    case 'path-minimal':
      body = (
        <>
          {checker}
          {route('#ffffff', 2.4)}
          {line(7, 74, 22, '#fff', 5)}
          {line(7, 81, 16, 'rgba(255,255,255,0.6)', 2)}
        </>
      );
      break;
    case 'stats-pro':
      body = (
        <>
          <rect width={W} height={H} fill="#090605" />
          {line(7, 8, 20, '#fff', 2.5)}
          {line(7, 44, 30, '#fff', 7)}
          {[0, 1, 2].map(i => (
            <g key={i}>
              {line(7 + i * 16, 60, 12, 'rgba(255,255,255,0.4)', 2)}
              {line(7 + i * 16, 65, 12, i === 2 ? '#f59e0b' : '#fff', 4)}
              {line(7 + i * 16, 74, 12, 'rgba(255,255,255,0.4)', 2)}
              {line(7 + i * 16, 79, 12, '#fff', 4)}
            </g>
          ))}
        </>
      );
      break;
    case 'polaroid-vintage':
      body = (
        <>
          <rect width={W} height={H} fill="#090605" />
          <rect x={6} y={14} width={48} height={60} rx={3} fill="#fcfbf9" />
          <rect x={10} y={18} width={40} height={40} rx={2} fill="#2f3b2c" />
          <path d="M16 50 C 20 38, 28 44, 32 32 S 42 24, 44 22" fill="none" stroke="#f43f5e" strokeWidth={1.8} strokeLinecap="round" />
          {line(16, 63, 28, '#111', 3)}
          {line(20, 69, 20, '#9ca3af', 2)}
        </>
      );
      break;
    case 'a-shape-stencil':
      body = (
        <>
          <rect width={W} height={H} fill="#090605" />
          <path d="M30 12 L10 76 L21 76 L30 46 L39 76 L50 76 Z" fill="#3b4a5c" />
          <path d="M22 66 C 26 52, 30 58, 32 44 S 36 30, 34 24" fill="none" stroke="#f97316" strokeWidth={1.8} strokeLinecap="round" />
          {line(7, 81, 18, 'rgba(255,255,255,0.8)', 2.5)}
        </>
      );
      break;
    case 'transparent-sticker':
    default:
      body = (
        <>
          {checker}
          {line(7, 8, 20, '#fff', 2.5)}
          {route('#f43f5e', 2.4)}
          {line(7, 64, 26, '#fff', 5)}
          {line(7, 74, 12, 'rgba(255,255,255,0.7)')}
          {line(23, 74, 12, 'rgba(255,255,255,0.7)')}
          {line(39, 74, 12, '#f59e0b')}
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
      <path d="M10 50 C 16 34, 26 40, 30 28 S 44 18, 50 10" fill="none" stroke="#f97316" strokeWidth={2.6} strokeLinecap="round" />
    </svg>
  );
}

/* ─── Small chrome primitives ─────────────────────────────────── */

function RoundButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
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

function ControlHeading({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="hidden md:block text-[13px] font-semibold text-bone">{children}</h3>
      {hint && <p className="text-xs text-bone-dim md:mt-0.5">{hint}</p>}
    </div>
  );
}

function Swatch({ fill, selected, label, onClick, disabled }: {
  fill: string; selected: boolean; label: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      className={`shrink-0 w-8 h-8 rounded-full transition-transform disabled:cursor-not-allowed ${
        selected ? 'ring-2 ring-bone ring-offset-2 ring-offset-[rgb(var(--color-ink))] scale-105' : 'hover:scale-105'
      }`}
      style={{ background: fill, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' }}
    />
  );
}

/* ════════════════════════════════════════════════════════════════
   Modal
   ════════════════════════════════════════════════════════════════ */

export function CardioShareModal({ data, mapTheme = 'street', onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [didCopy, setDidCopy] = useState(false);
  const [layout, setLayout] = useState<ShareLayout>('pro-glass');
  const [aspectRatio, setAspectRatio] = useState<'9/16' | '1/1'>('9/16');
  const [selectedTheme, setSelectedTheme] = useState<MapThemeKey>(mapTheme === 'dark' ? 'dark' : (mapTheme as MapThemeKey));
  const [activeTab, setActiveTab] = useState<'layout' | 'theme' | 'colors'>('layout');
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });

  const [recenterTrigger] = useState(0);
  const [pathColor, setPathColor] = useState('gradient');
  const [textColor, setTextColor] = useState('orange');

  const typeLabel = data.type === 'walk' ? 'WALK' : data.type === 'run' ? 'RUN' : 'RIDE';
  const typeName = data.type === 'walk' ? 'Walk' : data.type === 'run' ? 'Run' : 'Ride';
  const displayDate = format(new Date(data.date), 'EEEE, MMM d, yyyy');
  const shortDate = format(new Date(data.date), 'MMM d, yyyy');

  // Dynamic fallback for avgSpeed if missing or 0
  const avgSpeed = (data.avgSpeedKmh !== undefined && data.avgSpeedKmh > 0)
    ? data.avgSpeedKmh
    : (data.durationSec > 0 && data.distanceKm > 0
        ? Math.round((data.distanceKm / (data.durationSec / 3600)) * 10) / 10
        : undefined);

  // Normalize route safely in case it is passed as a string or has alternative field names
  const normalizedRoute: RoutePoint[] = useMemo(() => {
    let raw: any = data.route;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = [];
      }
    }
    if (!Array.isArray(raw)) return [];
    return raw
      .map((p: any) => {
        if (!p) return null;
        let lat: number | undefined;
        let lng: number | undefined;
        if (Array.isArray(p) && p.length >= 2) {
          lat = Number(p[0]);
          lng = Number(p[1]);
        } else if (typeof p === 'object') {
          lat = Number(p.lat !== undefined ? p.lat : p.latitude);
          lng = Number(p.lng !== undefined ? p.lng : p.longitude);
        }
        if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) return null;
        return {
          lat,
          lng,
          alt: p.alt ?? p.altitude,
          speed: p.speed,
          ts: p.ts || Date.now(),
        };
      })
      .filter(Boolean) as RoutePoint[];
  }, [data.route]);

  const lineColor = pathColor === 'gradient' ? 'url(#route-gradient)' : pathColor;
  const currentTextColorCls = TEXT_COLORS.find(t => t.id === textColor)?.cls || TEXT_COLORS[0].cls;

  const isPolaroid = layout === 'polaroid-vintage';
  const isTransparent = layout === 'transparent-sticker' || layout === 'path-minimal';
  const isSolidBg = layout === 'stats-pro';
  const isAShape = layout === 'a-shape-stencil';
  const isCyber = layout === 'cyber-neon';
  const isSunset = layout === 'sunset-glow';

  const showMapBackground = !isSolidBg && !isPolaroid && !isTransparent;
  const showPathBackground = isTransparent || isAShape;
  const hideMapTiles = isTransparent;

  const mapStyleUsed = showMapBackground || (showPathBackground && !hideMapTiles);
  const colorsLocked = isCyber || isSunset || isPolaroid;

  // ─── Responsive preview scaling (card is always designed at 360px wide) ───
  const designH = aspectRatio === '1/1' ? DESIGN_W : Math.round((DESIGN_W * 16) / 9);
  const scale = stageSize.w > 0 && stageSize.h > 0
    ? Math.min(stageSize.w / DESIGN_W, stageSize.h / designH, 1.25)
    : 0;

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

  // Escape to close, arrow keys to switch template, lock background scroll.
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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const getCanvas = async (): Promise<HTMLCanvasElement | null> => {
    if (!cardRef.current) return null;

    let canvas: HTMLCanvasElement | null = null;
    // The preview card is rounded, but the exported image is a full-bleed
    // rectangle: rounded corners in a PNG become transparent pixels that
    // galleries/social apps render as white squares.
    const solidBg = isTransparent ? undefined : '#090605';

    // 1. Try html-to-image with skipFonts and cacheBust disabled
    try {
      canvas = await toCanvas(cardRef.current, {
        pixelRatio: PIXEL_RATIO,
        cacheBust: false,
        skipFonts: true,
        backgroundColor: solidBg,
        style: { borderRadius: '0' },
      });
    } catch (err) {
      console.warn('html-to-image toCanvas failed, attempting html2canvas fallback:', err);
    }

    // 2. Fallback to html2canvas if html-to-image threw an error
    if (!canvas && cardRef.current) {
      try {
        canvas = await html2canvas(cardRef.current, {
          scale: PIXEL_RATIO,
          useCORS: true,
          allowTaint: true,
          backgroundColor: solidBg ?? null,
          logging: false,
          onclone: (_doc, el) => { el.style.borderRadius = '0'; },
        });
      } catch (h2cErr) {
        console.error('html2canvas also failed:', h2cErr);
      }
    }

    return canvas;
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      await new Promise(r => setTimeout(r, 60));
      const canvas = await getCanvas();
      if (!canvas) {
        useUIStore.getState().showToast('Could not generate share image', 'error');
        return;
      }

      const fileName = `apparatus-${data.type}-${format(new Date(data.date), 'yyyy-MM-dd')}.png`;

      // 1. Native Mobile App (Capacitor) - save directly to device storage, no share sheet.
      if (Capacitor.isNativePlatform()) {
        try {
          const base64Data = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
          await Filesystem.writeFile({
            path: `Apparatus/${fileName}`,
            data: base64Data,
            directory: Directory.Documents,
            recursive: true,
          });

          setDidCopy(true);
          setTimeout(() => setDidCopy(false), 2200);
          useUIStore.getState().showToast('Saved to Documents/Apparatus', 'success');
          return;
        } catch (capErr: any) {
          if (capErr?.name === 'AbortError' || capErr?.message?.includes('canceled') || capErr?.message?.includes('cancelled')) {
            return;
          }
          console.error('Capacitor download/save error:', capErr);
        }
      }

      // 2. Web Browser Download (Blob URL method)
      canvas.toBlob((blob) => {
        if (!blob) {
          const url = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        }

        setDidCopy(true);
        setTimeout(() => setDidCopy(false), 2200);
        useUIStore.getState().showToast('Workout card saved!', 'success');
      }, 'image/png');

    } catch (err) {
      console.error('Failed to generate image:', err);
      useUIStore.getState().showToast('Failed to save image. Please try again.', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    try {
      setDownloading(true);
      await new Promise(r => setTimeout(r, 60));
      const canvas = await getCanvas();
      if (!canvas) {
        useUIStore.getState().showToast('Could not generate share image', 'error');
        return;
      }

      const fileName = `apparatus-${data.type}-${format(new Date(data.date), 'yyyy-MM-dd')}.png`;

      // 1. Native Mobile App (Capacitor)
      if (Capacitor.isNativePlatform()) {
        try {
          const base64Data = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
          const fileResult = await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Cache,
          });

          await Share.share({
            title: `My Apparatus ${typeLabel}`,
            text: `Completed a ${data.distanceKm.toFixed(2)} km ${typeLabel} with Apparatus! 🔥`,
            files: [fileResult.uri],
            dialogTitle: 'Share Workout Story',
          });
          return;
        } catch (capErr: any) {
          if (capErr?.name === 'AbortError' || capErr?.message?.includes('canceled') || capErr?.message?.includes('cancelled')) {
            return;
          }
          console.error('Capacitor share error:', capErr);
        }
      }

      // 2. Web Browser Share (Web Share API)
      canvas.toBlob(async (blob) => {
        if (!blob) {
          handleDownload();
          return;
        }
        const file = new File([blob], fileName, { type: 'image/png' });

        if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: `My Apparatus ${typeLabel}`,
              text: `Completed a ${data.distanceKm.toFixed(2)} km ${typeLabel} with Apparatus! 🔥`,
              files: [file],
            });
          } catch (shareErr: any) {
            if (shareErr?.name !== 'AbortError') {
              console.error('Navigator share failed:', shareErr);
              handleDownload();
            }
          }
        } else {
          handleDownload();
        }
      }, 'image/png');
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Failed to share:', err);
        useUIStore.getState().showToast('Failed to share card. Try saving image directly.', 'error');
      }
    } finally {
      setDownloading(false);
    }
  };

  const layoutIndex = LAYOUT_OPTIONS.findIndex(l => l.id === layout);

  const goPrevious = () => {
    const prev = (layoutIndex - 1 + LAYOUT_OPTIONS.length) % LAYOUT_OPTIONS.length;
    setLayout(LAYOUT_OPTIONS[prev].id);
  };

  const goNext = () => {
    const next = (layoutIndex + 1) % LAYOUT_OPTIONS.length;
    setLayout(LAYOUT_OPTIONS[next].id);
  };

  const cardBackground = isTransparent ? 'transparent' : (CARD_BG[layout] || '#090605');

  /* ─── Capture template (fixed 360px design; identical in every theme) ─── */
  const cardTemplate = (
    <div
      ref={cardRef}
      className="relative overflow-hidden flex flex-col rounded-[2.2rem]"
      style={{ width: DESIGN_W, height: designH, background: cardBackground }}
    >
      {/* Background Map Layer */}
      {(showMapBackground || showPathBackground) && (
        <div className="absolute inset-0 z-0">
          {(normalizedRoute.length > 0 || data.currentLocation) ? (
            <div
              className="w-full h-full pointer-events-auto"
              style={isAShape ? {
                WebkitMaskImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M50 5 L15 95 L35 95 L50 50 L65 95 L85 95 Z' fill='black'/></svg>")`,
                WebkitMaskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                transform: 'scale(1.08)',
              } : {}}
            >
              <RouteMap
                route={normalizedRoute}
                currentLocation={data.currentLocation}
                theme={selectedTheme}
                height="100%"
                highlightColor={
                  isCyber ? '#00f5d4' :
                  isSunset ? '#fb923c' :
                  isTransparent && pathColor === 'gradient' ? '#f43f5e' : lineColor
                }
                hideMap={hideMapTiles}
                noGlow={false}
                isCapturing={downloading}
                recenterTrigger={recenterTrigger}
                fitToContainer
                showZoomControls={false}
                cardioType={data.type}
                hideMarkers={isTransparent || isAShape}
                hideStartMarker
                mapPaddingBottomRight={layout === 'map-hero' ? [20, 40] : [40, 180]}
                mapPaddingTopLeft={isAShape ? [60, 40] : [40, 40]}
              />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center font-mono text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
              No GPS Track Recorded
            </div>
          )}

          {/* Gradient Vignettes / Atmospheric Overlays */}
          {!isTransparent && !isPolaroid && (
            <>
              {isSunset ? (
                <>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#150502]/90 via-[#3d0f28]/40 to-[#190729]/50 mix-blend-color z-[1000] pointer-events-none" />
                  <div className="absolute inset-x-0 bottom-0 h-[65%] bg-gradient-to-t from-[#120401]/95 via-[#230919]/60 to-transparent z-[1000] pointer-events-none" />
                </>
              ) : isCyber ? (
                <>
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#00f5d415,_transparent_70%)] z-[1000] pointer-events-none" />
                  <div className="absolute inset-x-0 bottom-0 h-[65%] bg-gradient-to-t from-[#02050c]/95 via-[#02050c]/60 to-transparent z-[1000] pointer-events-none" />
                </>
              ) : (
                <>
                  <div className="absolute inset-x-0 bottom-0 h-[65%] bg-gradient-to-t from-[#090605]/90 via-[#090605]/50 to-transparent z-[1000] pointer-events-none" />
                  <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#090605]/70 to-transparent z-[1000] pointer-events-none" />
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Solid Telemetry Background with Signature Watermark */}
      {isSolidBg && (
        <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden opacity-5 pointer-events-none">
          <div className="font-sans text-[80px] font-black text-white tracking-widest rotate-12">
            APPARATUS
          </div>
        </div>
      )}

      {/* Foreground UI Layer */}
      <div className="relative z-10 w-full h-full flex flex-col justify-between p-6 pointer-events-none">

        {/* Header Brand Bar */}
        {!isPolaroid && (
          <div className="flex items-center justify-between w-full">
            {isCyber ? (
              <span className="font-mono tracking-[0.25em] text-[13px] font-black text-cyan-400" style={{ textShadow: '0 0 8px rgba(6,182,212,0.8)' }}>
                // APPARATUS_SYS
              </span>
            ) : (
              <span className={`font-sans tracking-[0.3em] text-[15px] font-black ${isSunset ? 'text-amber-200' : 'text-white'}`} style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                APPARATUS
              </span>
            )}

            <span
              className={`text-[11px] font-mono font-bold tracking-wider px-2.5 py-1 rounded-full backdrop-blur-md uppercase border ${
                isCyber
                  ? 'border-cyan-400/40 text-cyan-300'
                  : isSunset
                  ? 'border-amber-500/30 text-amber-300'
                  : `border-white/10 ${currentTextColorCls}`
              }`}
              style={{ background: isCyber ? 'rgba(8,51,68,0.6)' : isSunset ? 'rgba(69,26,3,0.6)' : 'rgba(0,0,0,0.4)' }}
            >
              {typeLabel}
            </span>
          </div>
        )}

        {/* Polaroid Frame */}
        {isPolaroid && (
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none p-5 pb-8">
            <div className="rounded-2xl p-4 pb-8 w-full" style={{ background: '#fcfbf9', border: '1px solid rgba(0,0,0,0.1)', boxShadow: '0 25px 50px rgba(0,0,0,0.7)' }}>
              <div className="w-full aspect-square rounded-xl overflow-hidden relative" style={{ background: '#111827' }}>
                <RouteMap route={normalizedRoute} theme="satellite" height="100%" fitToContainer showZoomControls={false} hideStartMarker hideMap={false} highlightColor="#f43f5e" cardioType={data.type} />
              </div>
              <div className="mt-5 flex flex-col items-center gap-1 font-sans">
                <div className="text-2xl font-black italic tracking-tight" style={{ color: '#111827' }}>{data.distanceKm.toFixed(2)} km {typeLabel}</div>
                <div className="text-xs font-mono font-bold text-center" style={{ color: '#6b7280' }}>{formatDuration(data.durationSec)} · {data.avgPace} · {displayDate}</div>
              </div>
            </div>
          </div>
        )}

        {/* Map Hero Layout (Floating Capsule Bottom Bar) */}
        {layout === 'map-hero' && (
          <div className="mt-auto w-full">
            <div
              className="backdrop-blur-2xl border border-white/20 rounded-3xl p-4 flex items-center justify-between"
              style={{ background: 'rgba(0,0,0,0.8)', boxShadow: '0 20px 40px rgba(0,0,0,0.7)' }}
            >
              <div className="flex flex-col">
                <span className="text-[10px] font-mono font-bold text-white/60 uppercase">Distance</span>
                <span className="font-mono text-3xl font-black text-white">{data.distanceKm.toFixed(2)} <span className="text-xs font-bold text-amber-400">km</span></span>
              </div>
              <div className="h-8 w-px bg-white/15" />
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-mono font-bold text-white/60 uppercase">Time</span>
                <span className="font-mono text-xl font-bold text-white">{formatDuration(data.durationSec)}</span>
              </div>
              <div className="h-8 w-px bg-white/15" />
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-mono font-bold text-white/60 uppercase">Pace</span>
                <span className="font-mono text-xl font-bold text-white">{data.avgPace.replace(' /km', '')}</span>
              </div>
            </div>
          </div>
        )}

        {/* Pro Glass / Sunset / Cyber / Stats / Stencil / Sticker overlay */}
        {!isPolaroid && layout !== 'path-minimal' && layout !== 'map-hero' && (
          <div className={`flex flex-col gap-3 mb-1 w-full ${layout === 'pro-glass' ? 'bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-3xl p-4 shadow-xl' : ''}`}>
            {/* Distance Hero */}
            <div className="flex items-end justify-between">
              <div>
                <div className={`text-[10px] font-mono font-bold uppercase tracking-widest mb-0.5 ${isCyber ? 'text-cyan-400' : isSunset ? 'text-amber-300' : 'text-white/70'}`}>
                  Total Distance
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={`font-mono text-[56px] leading-none font-black tracking-tight ${isCyber ? 'text-cyan-300' : isSunset ? 'text-amber-200' : 'text-white'}`}
                    style={{ textShadow: isCyber ? '0 0 12px rgba(6,182,212,0.8)' : '0 2px 6px rgba(0,0,0,0.35)' }}
                  >
                    {data.distanceKm.toFixed(2)}
                  </span>
                  <span className={`font-mono text-lg font-bold uppercase ${isCyber ? 'text-cyan-400' : isSunset ? 'text-amber-300' : 'text-white/80'}`}>
                    km
                  </span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/70 mb-0.5">
                  Date
                </div>
                <div className="text-xs font-mono font-medium text-white/90">
                  {shortDate}
                </div>
              </div>
            </div>

            {/* Metric grid */}
            <div className="grid grid-cols-3 gap-y-3 gap-x-2 pt-1">
              <div className="flex flex-col">
                <div className="text-[10px] font-mono font-bold text-white/60 uppercase tracking-wider mb-0.5">Time</div>
                <div className="font-mono text-[22px] leading-tight font-black text-white tracking-tight">{formatDuration(data.durationSec)}</div>
              </div>

              <div className="flex flex-col">
                <div className="text-[10px] font-mono font-bold text-white/60 uppercase tracking-wider mb-0.5">Pace</div>
                <div className="font-mono text-[22px] leading-tight font-black text-white tracking-tight">{data.avgPace.replace(' /km', '')}</div>
              </div>

              <div className="flex flex-col">
                <div className={`text-[10px] font-mono font-bold uppercase tracking-wider mb-0.5 ${isCyber ? 'text-cyan-400' : isSunset ? 'text-amber-400' : currentTextColorCls}`}>Calories</div>
                <div className={`font-mono text-[22px] leading-tight font-black tracking-tight ${isCyber ? 'text-cyan-300' : isSunset ? 'text-amber-300' : currentTextColorCls}`}>{data.calories}</div>
              </div>

              {avgSpeed !== undefined && (
                <div className="flex flex-col">
                  <div className="text-[10px] font-mono font-bold text-white/60 uppercase tracking-wider mb-0.5">Avg Spd</div>
                  <div className="font-mono text-[22px] leading-tight font-black text-white tracking-tight">{avgSpeed.toFixed(1)} <span className="text-xs font-normal text-white/60">km/h</span></div>
                </div>
              )}

              {data.elevationGainM !== undefined && (
                <div className="flex flex-col">
                  <div className="text-[10px] font-mono font-bold text-white/60 uppercase tracking-wider mb-0.5">Elevation</div>
                  <div className="font-mono text-[22px] leading-tight font-black text-white tracking-tight">{data.elevationGainM}m</div>
                </div>
              )}

              {(data.steps !== undefined && data.steps > 0) && (
                <div className="flex flex-col">
                  <div className="text-[10px] font-mono font-bold text-white/60 uppercase tracking-wider mb-0.5">Steps</div>
                  <div className="font-mono text-[22px] leading-tight font-black text-white tracking-tight">{data.steps.toLocaleString()}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Minimalist Path Corner Stamp */}
        {layout === 'path-minimal' && (
          <div className="mt-auto flex items-end justify-between gap-3">
            <div>
              <div className="font-mono text-4xl font-black text-white">{data.distanceKm.toFixed(2)} km</div>
              <div className="text-xs font-mono text-white/70">{formatDuration(data.durationSec)} · {data.avgPace}</div>
            </div>
            <div className="text-xs font-mono font-bold text-white/60 uppercase text-right">{displayDate}</div>
          </div>
        )}
      </div>
    </div>
  );

  const TABS = [
    { id: 'layout' as const, label: 'Template', icon: LayoutTemplate },
    { id: 'theme' as const, label: 'Map', icon: MapIcon },
    { id: 'colors' as const, label: 'Colours', icon: Palette },
  ];

  const tabVisibility = (id: typeof activeTab) => `${activeTab === id ? '' : 'hidden'} md:block`;
  const hScroll = 'flex md:grid gap-3 overflow-x-auto md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="pro-scope fixed inset-0 z-[9999] flex md:items-center md:justify-center md:p-6 font-sans select-none"
      >
        {/* Desktop backdrop */}
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
            {/* Mobile top bar */}
            <div className="md:hidden flex items-center gap-2 px-3 pb-2" style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
              <RoundButton onClick={onClose} label="Close"><X size={18} /></RoundButton>
              <div className="flex-1 min-w-0 text-center">
                <div className="text-[15px] font-semibold text-bone leading-tight">Share activity</div>
                <div className="text-[11px] text-bone-dim truncate">{typeName} · {shortDate}</div>
              </div>
              <RoundButton
                onClick={() => setAspectRatio(prev => (prev === '9/16' ? '1/1' : '9/16'))}
                label={aspectRatio === '9/16' ? 'Switch to square' : 'Switch to story'}
              >
                {aspectRatio === '9/16' ? <Smartphone size={17} /> : <SquareIcon size={16} />}
              </RoundButton>
            </div>

            {/* Stage */}
            <div ref={stageRef} className="flex-1 min-h-0 flex items-center justify-center px-6 py-2 md:p-8">
              <div
                className="relative shrink-0"
                style={{ width: DESIGN_W * scale, height: designH * scale, visibility: scale ? 'visible' : 'hidden' }}
              >
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

            {/* Template pager */}
            <div className="flex items-center justify-center gap-4 pb-3 md:pb-6 pt-1">
              <RoundButton onClick={goPrevious} label="Previous template"><ChevronLeft size={18} /></RoundButton>
              <div className="w-32 text-center">
                <div className="text-[13px] font-semibold text-bone truncate">{LAYOUT_OPTIONS[layoutIndex].label}</div>
                <div className="flex justify-center gap-1 mt-1.5">
                  {LAYOUT_OPTIONS.map(o => (
                    <span
                      key={o.id}
                      className={`h-1 rounded-full transition-all duration-300 ${o.id === layout ? 'w-4 bg-bone' : 'w-1 bg-bone/25'}`}
                    />
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
            {/* Desktop header */}
            <div className="hidden md:flex items-start justify-between gap-3 px-6 pt-6 pb-5 border-b border-line">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-bone leading-tight">Share activity</h2>
                <p className="text-xs text-bone-dim mt-1 truncate">{typeName} · {displayDate}</p>
              </div>
              <RoundButton onClick={onClose} label="Close"><X size={18} /></RoundButton>
            </div>

            {/* Mobile tabs */}
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
                        <motion.span
                          layoutId="share-tab"
                          className="absolute inset-0 rounded-full pro-thumb"
                          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                        />
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

            {/* Options */}
            <div className="md:flex-1 md:min-h-0 overflow-y-auto overscroll-contain px-4 md:px-6 pt-4 pb-3 md:py-6 md:space-y-8 min-h-[132px]">
              {/* Template */}
              <section className={tabVisibility('layout')}>
                <ControlHeading>Template</ControlHeading>
                <div className={`${hScroll} md:grid-cols-4`}>
                  {LAYOUT_OPTIONS.map(opt => {
                    const selected = layout === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setLayout(opt.id)}
                        aria-pressed={selected}
                        className="shrink-0 w-[62px] md:w-auto flex flex-col items-center gap-1.5 group"
                      >
                        <span
                          className={`block w-full aspect-[60/88] rounded-xl overflow-hidden transition-all ${
                            selected
                              ? 'ring-2 ring-bone ring-offset-2 ring-offset-[rgb(var(--color-ink))]'
                              : 'ring-1 ring-line group-hover:ring-bone-dim/50'
                          }`}
                        >
                          <LayoutThumb id={opt.id} />
                        </span>
                        <span className={`text-[11px] font-medium ${selected ? 'text-bone' : 'text-bone-dim'}`}>{opt.short}</span>
                      </button>
                    );
                  })}
                </div>
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
                        className={`flex items-center gap-2.5 p-3 rounded-2xl text-left transition-colors border ${
                          selected ? 'border-bone bg-bone/[0.04]' : 'border-line hover:border-bone-dim/50'
                        }`}
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
                <ControlHeading hint={mapStyleUsed ? undefined : "This template doesn't show map tiles."}>Map style</ControlHeading>
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
                        <span
                          className={`block w-full aspect-square rounded-xl overflow-hidden transition-all ${
                            selected
                              ? 'ring-2 ring-bone ring-offset-2 ring-offset-[rgb(var(--color-ink))]'
                              : 'ring-1 ring-line group-hover:ring-bone-dim/50'
                          }`}
                        >
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
                <ControlHeading hint={colorsLocked ? 'This template uses its own colour palette.' : undefined}>Colours</ControlHeading>
                <div className={`space-y-3 ${colorsLocked ? 'opacity-40 pointer-events-none' : ''}`}>
                  {[
                    { label: 'Route', items: PATH_COLORS, value: pathColor, set: setPathColor },
                    { label: 'Accent', items: TEXT_COLORS, value: textColor, set: setTextColor },
                  ].map(row => (
                    <div key={row.label} className="flex items-center gap-3">
                      <span className="w-14 shrink-0 text-xs font-medium text-bone-dim">{row.label}</span>
                      <div className="flex-1 flex items-center gap-2.5 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {row.items.map(c => (
                          <Swatch
                            key={c.id}
                            fill={c.swatch}
                            label={`${row.label}: ${c.label}`}
                            selected={row.value === c.id}
                            disabled={colorsLocked}
                            onClick={() => row.set(c.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Actions */}
            <div
              className="flex items-center gap-2.5 px-4 md:px-6 pt-3 md:pt-4 md:pb-6 border-t border-line"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
            >
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="h-12 px-5 rounded-full pro-track text-bone text-sm font-semibold flex items-center justify-center gap-2 hover:bg-bone/10 transition-colors disabled:opacity-50"
              >
                {didCopy ? <Check size={18} className="text-viz-elev" /> : <Download size={18} />}
                {didCopy ? 'Saved' : 'Save'}
              </button>
              <button
                type="button"
                onClick={handleShare}
                disabled={downloading}
                className="flex-1 h-12 rounded-full bg-bone text-ink text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {downloading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Preparing…
                  </>
                ) : (
                  <>
                    <Share2 size={18} /> Share
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
