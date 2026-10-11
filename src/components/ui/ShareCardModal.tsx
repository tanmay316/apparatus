import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Download, Check, Share2, ChevronLeft, ChevronRight, Loader2, Smartphone, Square as SquareIcon,
  LayoutTemplate, PersonStanding, Palette, ImagePlus, Trash2, Crown,
} from 'lucide-react';
import { toCanvas } from 'html-to-image';
import html2canvas from 'html2canvas';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { useUIStore } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import { CAN_UPSELL, requirePro, useHasPro } from '@/stores/subscription-store';
import { AnatomyFigureSVG } from '@/components/ui/AnatomySvg';
import {
  calculateShareVolume, getActiveMuscleScores, getActiveMusclesFromLogs, isWarmupOrCooldown, muscleFocus,
  type MuscleScore,
} from '@/lib/muscle-map';
import { calculateWorkoutCalories } from '@/lib/calories';
import { compressImageFile } from '@/utils/image-compression';
import { lockBodyScroll } from '@/lib/scroll-lock';
import { BRAND } from '@/lib/brand';

type SetEntry = { completed?: boolean; reps?: number; weight?: number; seconds?: number };

export interface ShareCardData {
  dayTitle: string;
  planTitle: string;
  date: string;
  durationMin: number;
  calories: number;
  volume?: number;
  sets?: number;
  exerciseNames: string[];
  exerciseLogs?: Array<{ name: string; section?: string; isPR?: boolean; sets: SetEntry[] }>;
  bodyweight?: number;
}

interface Props {
  data: ShareCardData;
  onClose: () => void;
}

type ShareLayout = 'hero' | 'overview' | 'split' | 'logbook' | 'poster' | 'clean' | 'photo' | 'sticker';
type Views = 'both' | 'front' | 'back';
type Gender = 'male' | 'female';

const LAYOUT_OPTIONS: { id: ShareLayout; label: string; short: string }[] = [
  { id: 'hero', label: 'Pro', short: 'Pro' },
  { id: 'overview', label: 'Overview', short: 'Overview' },
  { id: 'split', label: 'Muscle Map', short: 'Muscles' },
  { id: 'logbook', label: 'Logbook', short: 'Logbook' },
  { id: 'poster', label: 'Poster', short: 'Poster' },
  { id: 'clean', label: 'Clean', short: 'Clean' },
  { id: 'photo', label: 'Photo', short: 'Photo' },
  { id: 'sticker', label: 'Sticker', short: 'Sticker' },
];

/** Free users can preview these, but saving/sharing them needs Pro. */
const PRO_LAYOUTS = new Set<ShareLayout>(['overview', 'poster', 'photo', 'sticker']);

const ACCENTS = [
  { id: 'ember', label: 'Ember', hex: '#FF5A1F' },
  { id: 'volt', label: 'Volt', hex: '#C6FF00' },
  { id: 'ice', label: 'Ice', hex: '#38BDF8' },
  { id: 'crimson', label: 'Crimson', hex: '#F43F5E' },
  { id: 'violet', label: 'Violet', hex: '#A78BFA' },
  { id: 'gold', label: 'Gold', hex: '#F5B301' },
  { id: 'mint', label: 'Mint', hex: '#34D399' },
  { id: 'white', label: 'White', hex: '#FFFFFF' },
];

/** Fixed design size of the exported card (logical px). Exported at 3x → 1080 px wide. */
const DESIGN_W = 360;
const PIXEL_RATIO = 3;
const FONT = "Inter, 'SF Pro Display', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const CARD_BG: Record<ShareLayout, string> = {
  hero: '#07070A',
  overview: '#09090C',
  split: '#0B0B0E',
  logbook: '#0D0D10',
  poster: '#0A0A0A',
  clean: '#F4F1EC',
  photo: '#111111',
  sticker: 'transparent',
};

const DARK_INACTIVE = { fill: '#1E2029', stroke: '#2B2E3A' };
const LIGHT_INACTIVE = { fill: '#DEDAD2', stroke: '#CFC9BF' };

// ─── Data helpers ────────────────────────────────────────────

const isCounted = (s: SetEntry) =>
  s.completed !== false && (s.completed === true || Number(s.reps) > 0 || Number(s.weight) > 0 || Number(s.seconds) > 0);

function formatDuration(min: number): { value: string; unit: string } {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return { value: String(m), unit: 'min' };
  return { value: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, unit: 'h' };
}

const durationText = (min: number) => {
  const d = formatDuration(min);
  return `${d.value} ${d.unit}`;
};

function formatNumber(value: number): string {
  if (value >= 100000) return `${Math.round(value / 1000)}k`;
  return Math.round(value).toLocaleString();
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Card primitives ─────────────────────────────────────────

function Wordmark({ color = '#FFFFFF', size = 13 }: { color?: string; size?: number }) {
  return (
    <span style={{ color, fontSize: size, fontWeight: 800, letterSpacing: '0.32em', lineHeight: 1 }}>{BRAND.upper}</span>
  );
}

function Figures({ muscles, gender, views, color, light, height, glow = true, gap = 10 }: {
  muscles: MuscleScore[]; gender: Gender; views: Views; color: string; light?: boolean; height: number; glow?: boolean; gap?: number;
}) {
  const ratio = gender === 'female' ? 650 / 1450 : 727 / 1280;
  const inactive = light ? LIGHT_INACTIVE : DARK_INACTIVE;
  const list: ('front' | 'back')[] = views === 'both' ? ['front', 'back'] : [views];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap }}>
      {list.map(v => (
        <div key={v} style={{ height, width: height * ratio }}>
          <AnatomyFigureSVG
            view={v}
            activeMuscles={muscles}
            gender={gender}
            color={color}
            inactiveFill={inactive.fill}
            inactiveStroke={inactive.stroke}
            glow={glow}
            className="block w-full h-full"
          />
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, unit, accent, align = 'left', dark = true, size = 22 }: {
  label: string; value: string; unit?: string; accent?: string; align?: 'left' | 'center'; dark?: boolean; size?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : 'flex-start', minWidth: 0 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: dark ? 'rgba(255,255,255,0.55)' : 'rgba(17,17,17,0.5)' }}>{label}</span>
      <span style={{ marginTop: 3, fontSize: size, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, color: accent || (dark ? '#FFFFFF' : '#111111'), whiteSpace: 'nowrap' }}>
        {value}
        {unit && <span style={{ fontSize: Math.round(size * 0.48), fontWeight: 700, marginLeft: 2, opacity: 0.7 }}>{unit}</span>}
      </span>
    </div>
  );
}

// ─── Template thumbnails ─────────────────────────────────────

function ThumbFigure({ x, y, s, lit, base }: { x: number; y: number; s: number; lit: string; base: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle cx={6} cy={3} r={2.6} fill={base} />
      <rect x={2.5} y={6.5} width={7} height={10} rx={2.5} fill={lit} />
      <rect x={0} y={7} width={2} height={9} rx={1} fill={base} />
      <rect x={10} y={7} width={2} height={9} rx={1} fill={base} />
      <rect x={3} y={17} width={2.6} height={11} rx={1.2} fill={lit} />
      <rect x={6.4} y={17} width={2.6} height={11} rx={1.2} fill={lit} />
    </g>
  );
}

function LayoutThumb({ id, accent }: { id: ShareLayout; accent: string }) {
  const W = 60, H = 88;
  const line = (x: number, y: number, w: number, fill = 'rgba(255,255,255,0.85)', h = 3) => <rect key={`${x}-${y}-${w}-${fill}`} x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} />;
  const dim = '#2b2e3a';
  let body: ReactNode;
  switch (id) {
    case 'hero':
      body = (
        <>
          <rect width={W} height={H} fill="#07070A" />
          <circle cx={30} cy={34} r={26} fill={hexToRgba(accent, 0.18)} />
          {line(6, 7, 18, '#fff', 2)}
          {line(6, 13, 30, '#fff', 4)}
          <ThumbFigure x={16} y={22} s={1.05} lit={accent} base={dim} />
          <ThumbFigure x={31} y={22} s={1.05} lit={accent} base={dim} />
          <rect x={5} y={66} width={50} height={16} rx={4} fill="rgba(255,255,255,0.1)" />
          {[0, 1, 2, 3].map(i => line(8 + i * 12, 72, 8, i === 3 ? accent : '#fff', 3))}
        </>
      );
      break;
    case 'overview':
      body = (
        <>
          <rect width={W} height={H} fill="#09090C" />
          {line(6, 6, 20, '#fff', 2)}
          <ThumbFigure x={17} y={11} s={0.95} lit={accent} base={dim} />
          <ThumbFigure x={31} y={11} s={0.95} lit={accent} base={dim} />
          <rect x={5} y={42} width={50} height={9} rx={3} fill="rgba(255,255,255,0.1)" />
          {[0, 1, 2, 3].map(i => line(8 + i * 12, 45, 8, i === 0 ? accent : '#fff', 3))}
          {[0, 1, 2].map(r => [0, 1, 2].map(c => (
            <rect key={`${r}-${c}`} x={5 + c * 17} y={55 + r * 10} width={15} height={8} rx={2} fill="rgba(255,255,255,0.12)" />
          )))}
        </>
      );
      break;
    case 'split':
      body = (
        <>
          <rect width={W} height={H} fill="#0B0B0E" />
          {line(6, 7, 26, '#fff', 3)}
          <ThumbFigure x={16} y={14} s={0.9} lit={accent} base={dim} />
          <ThumbFigure x={31} y={14} s={0.9} lit={accent} base={dim} />
          {[0, 1, 2, 3].map(i => (
            <g key={i}>
              {line(6, 46 + i * 8, 48, 'rgba(255,255,255,0.12)', 3)}
              {line(6, 46 + i * 8, 48 - i * 10, accent, 3)}
            </g>
          ))}
          {line(6, 80, 48, 'rgba(255,255,255,0.4)', 2)}
        </>
      );
      break;
    case 'logbook':
      body = (
        <>
          <rect width={W} height={H} fill="#0D0D10" />
          {line(6, 7, 30, '#fff', 4)}
          {[0, 1, 2].map(i => line(6 + i * 17, 16, 13, i === 0 ? accent : 'rgba(255,255,255,0.7)', 3))}
          {[0, 1, 2, 3, 4, 5].map(i => (
            <g key={i}>
              <rect x={6} y={26 + i * 8} width={3} height={3} rx={1} fill={accent} />
              {line(12, 26 + i * 8, 26, 'rgba(255,255,255,0.8)', 3)}
              {line(42, 26 + i * 8, 12, 'rgba(255,255,255,0.35)', 3)}
            </g>
          ))}
          <ThumbFigure x={22} y={74} s={0.4} lit={accent} base={dim} />
          <ThumbFigure x={30} y={74} s={0.4} lit={accent} base={dim} />
        </>
      );
      break;
    case 'poster':
      body = (
        <>
          <rect width={W} height={H} fill="#0A0A0A" />
          <ThumbFigure x={28} y={10} s={2} lit={hexToRgba(accent, 0.7)} base="#1d1d22" />
          {line(6, 14, 34, '#fff', 8)}
          {line(6, 25, 28, accent, 8)}
          {line(6, 36, 20, '#fff', 8)}
          <rect x={6} y={72} width={48} height={0.8} fill="rgba(255,255,255,0.3)" />
          {[0, 1, 2].map(i => line(6 + i * 17, 76, 12, '#fff', 4))}
        </>
      );
      break;
    case 'clean':
      body = (
        <>
          <rect width={W} height={H} fill="#F4F1EC" />
          {line(6, 8, 16, 'rgba(17,17,17,0.5)', 2)}
          {line(6, 13, 30, '#111', 4)}
          <ThumbFigure x={16} y={24} s={1.05} lit={accent === '#FFFFFF' ? '#111111' : accent} base="#DEDAD2" />
          <ThumbFigure x={31} y={24} s={1.05} lit={accent === '#FFFFFF' ? '#111111' : accent} base="#DEDAD2" />
          {[0, 1, 2].map(i => line(8 + i * 16, 72, 11, '#111', 4))}
          {line(20, 81, 20, 'rgba(17,17,17,0.35)', 2)}
        </>
      );
      break;
    case 'photo':
      body = (
        <>
          <defs>
            <linearGradient id="thumb-photo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5b6472" />
              <stop offset="100%" stopColor="#1f242c" />
            </linearGradient>
          </defs>
          <rect width={W} height={H} fill="url(#thumb-photo)" />
          <path d="M8 58 L22 40 L32 50 L42 36 L54 58 Z" fill="rgba(255,255,255,0.18)" />
          <circle cx={44} cy={20} r={5} fill="rgba(255,255,255,0.25)" />
          <rect y={56} width={W} height={32} fill="rgba(0,0,0,0.5)" />
          {line(6, 64, 26, '#fff', 4)}
          {[0, 1, 2].map(i => line(6 + i * 13, 74, 9, i === 2 ? accent : '#fff', 3))}
          <ThumbFigure x={44} y={62} s={0.45} lit={accent} base="#444" />
        </>
      );
      break;
    case 'sticker':
    default:
      body = (
        <>
          <defs>
            <pattern id="thumb-chk" width={8} height={8} patternUnits="userSpaceOnUse">
              <rect width={8} height={8} fill="#2b2b2b" />
              <rect width={4} height={4} fill="#3b3b3b" />
              <rect x={4} y={4} width={4} height={4} fill="#3b3b3b" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#thumb-chk)" />
          <ThumbFigure x={16} y={14} s={1.05} lit={accent} base="#555a66" />
          <ThumbFigure x={31} y={14} s={1.05} lit={accent} base="#555a66" />
          {line(10, 62, 40, '#fff', 5)}
          {[0, 1, 2].map(i => line(10 + i * 14, 72, 10, '#fff', 3))}
        </>
      );
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {body}
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

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="pro-track flex p-1 rounded-full">
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex-1 h-8 rounded-full text-[12px] font-semibold transition-colors ${value === o.id ? 'pro-thumb text-bone' : 'text-bone-dim'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Modal
   ════════════════════════════════════════════════════════════════ */

export function ShareCardModal({ data, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { units } = useUIStore();
  const { profile } = useAuthStore();

  const [layout, setLayout] = useState<ShareLayout>('hero');
  const [aspectRatio, setAspectRatio] = useState<'9/16' | '1/1'>('9/16');
  const [activeTab, setActiveTab] = useState<'layout' | 'body' | 'colors'>('layout');
  const [gender, setGender] = useState<Gender>(profile?.gender?.toLowerCase() === 'female' ? 'female' : 'male');
  const [views, setViews] = useState<Views>('both');
  const [accentId, setAccentId] = useState(ACCENTS[0].id);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [didSave, setDidSave] = useState(false);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });

  const accent = ACCENTS.find(a => a.id === accentId)?.hex || ACCENTS[0].hex;
  const hasPro = useHasPro();
  const layoutLocked = !hasPro && PRO_LAYOUTS.has(layout);
  const unlockTemplate = () => requirePro(`The ${LAYOUT_OPTIONS.find(l => l.id === layout)?.label} template is part of ${BRAND.name} Pro.`);
  const isSquare = aspectRatio === '1/1';
  const designH = isSquare ? DESIGN_W : Math.round((DESIGN_W * 16) / 9);
  const imperial = units === 'imperial';
  const weightUnit = imperial ? 'lb' : 'kg';
  const toUnit = (kg: number) => (imperial ? kg * 2.20462 : kg);

  // ─── Session summary ───
  const summary = useMemo(() => {
    const logs = (data.exerciseLogs || [])
      .filter(l => !isWarmupOrCooldown(l.name, l.section))
      .map(l => ({ ...l, sets: (l.sets || []).filter(isCounted) }))
      .filter(l => l.sets.length > 0);
    const names = (data.exerciseNames || []).filter(n => !isWarmupOrCooldown(n));
    const muscles = logs.length > 0 ? getActiveMusclesFromLogs(logs) : getActiveMuscleScores(names);
    const totalSets = logs.length > 0 ? logs.reduce((n, l) => n + l.sets.length, 0) : data.sets || 0;
    const totalReps = logs.reduce((n, l) => n + l.sets.reduce((r, s) => r + (Number(s.reps) || 0), 0), 0);
    const volume = logs.length > 0 ? calculateShareVolume(logs) : data.volume || 0;
    const calories = data.calories > 0 ? data.calories : logs.length > 0 ? calculateWorkoutCalories(logs as any, data.bodyweight, data.durationMin) : 0;
    const topLift = Math.max(0, ...logs.flatMap(l => l.sets.map(s => Number(s.weight) || 0)));
    const exercises = logs.length > 0
      ? logs.map(l => ({ name: l.name, isPR: !!l.isPR, sets: l.sets }))
      : names.map(n => ({ name: n, isPR: false, sets: [] as SetEntry[] }));
    return { muscles, totalSets, totalReps, volume, calories, topLift, exercises, prCount: exercises.filter(e => e.isPR).length };
  }, [data]);

  const focus = useMemo(() => muscleFocus(summary.muscles, 5), [summary.muscles]);
  const focusLine = focus.slice(0, 3).map(f => f.label).join(' · ') || 'Full body';

  const setDetail = (sets: SetEntry[]) => {
    if (sets.length === 0) return '';
    const heaviest = sets.reduce((best, s) => ((Number(s.weight) || 0) > (Number(best.weight) || 0) ? s : best), sets[0]);
    const maxReps = Math.max(0, ...sets.map(s => Number(s.reps) || 0));
    const maxSec = Math.max(0, ...sets.map(s => Number(s.seconds) || 0));
    const w = Number(heaviest.weight) || 0;
    if (w > 0) return `${sets.length} × ${heaviest.reps || maxReps} · ${Math.round(toUnit(w) * 10) / 10} ${weightUnit}`;
    if (maxReps > 0) return `${sets.length} × ${maxReps}`;
    if (maxSec > 0) return `${sets.length} × ${maxSec}s`;
    return `${sets.length} sets`;
  };

  const volumeStat = summary.volume > 0
    ? { value: formatNumber(toUnit(summary.volume)), unit: weightUnit, label: 'Volume' }
    : { value: summary.totalReps > 0 ? formatNumber(summary.totalReps) : String(summary.totalSets), unit: '', label: summary.totalReps > 0 ? 'Reps' : 'Sets' };

  const duration = formatDuration(data.durationMin);
  const stats = [
    { label: 'Time', value: duration.value, unit: duration.unit },
    { label: volumeStat.label, value: volumeStat.value, unit: volumeStat.unit },
    { label: 'Sets', value: String(summary.totalSets) },
    { label: 'Kcal', value: String(summary.calories), accent: true },
  ];
  const statsNoDup = volumeStat.label === 'Sets' ? stats.filter((s, i) => !(s.label === 'Sets' && i === 2)) : stats;

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
  const isTransparent = layout === 'sticker';
  const fileName = `${BRAND.slug}-${(data.dayTitle || 'workout').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;

  const getCanvas = async (): Promise<HTMLCanvasElement | null> => {
    if (!cardRef.current) return null;
    const solidBg = isTransparent ? undefined : CARD_BG[layout];
    try {
      // Lay the card out at 3x inside the snapshot (instead of upscaling a 1x raster)
      // so the SVG figures and their glow stay sharp on every WebView.
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
        useUIStore.getState().showToast('Workout card saved', 'success');
      }
      flashSaved();
    } catch (err) {
      console.error('Save failed:', err);
      useUIStore.getState().showToast('Failed to save image. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const shareText = `${data.dayTitle}: ${summary.totalSets} sets in ${durationText(data.durationMin)}. Logged with ${BRAND.name}.`;

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
        await Share.share({ title: data.dayTitle, text: shareText, files: [file.uri], dialogTitle: 'Share workout' });
        return;
      }
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: data.dayTitle, text: shareText, files: [file] });
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
  // White accent is invisible on the light template, so fall back to ink there.
  const darkAccent = accent === '#FFFFFF' ? '#111111' : accent;
  const title = (data.dayTitle || 'Workout').trim();
  const titleWords = title.split(/\s+/);
  const figureArgs = { muscles: summary.muscles, gender, views, color: accent };
  const pad = isSquare ? 20 : 24;
  const visibleExercises = summary.exercises.slice(0, isSquare ? 4 : 8);
  const hiddenExercises = summary.exercises.length - visibleExercises.length;

  const headerRow = (dark = true) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Wordmark color={dark ? '#FFFFFF' : '#111111'} />
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(17,17,17,0.55)' }}>{data.date}</span>
    </div>
  );

  const statRow = (dark = true, size = 22, items = statsNoDup) => (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, gap: 8 }}>
      {items.map(s => (
        <Stat key={s.label} label={s.label} value={s.value} unit={s.unit} dark={dark} size={size} accent={s.accent ? (dark ? accent : darkAccent) : undefined} />
      ))}
    </div>
  );

  const eyebrow = (color: string) => (
    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.24em', textTransform: 'uppercase', color }}>
      {summary.prCount > 0 ? `${summary.prCount} personal record${summary.prCount > 1 ? 's' : ''}` : data.planTitle || 'Strength session'}
    </div>
  );

  let content: ReactNode;
  switch (layout) {
    case 'hero':
      content = (
        <div style={{ position: 'absolute', inset: 0, padding: pad, display: 'flex', flexDirection: 'column', background: `radial-gradient(90% 55% at 50% 42%, ${hexToRgba(accent, 0.22)} 0%, transparent 70%), #07070A` }}>
          {headerRow()}
          <div style={{ marginTop: isSquare ? 12 : 22 }}>
            {eyebrow(accent)}
            <div style={{ marginTop: 6, fontSize: isSquare ? 22 : 28, fontWeight: 900, lineHeight: 1.02, letterSpacing: '-0.02em', color: '#fff', textTransform: 'uppercase', maxHeight: isSquare ? 46 : 60, overflow: 'hidden' }}>{title}</div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
            <Figures {...figureArgs} height={isSquare ? 150 : 300} gap={isSquare ? 10 : 18} />
          </div>
          {!isSquare && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 14 }}>
              {focus.slice(0, 3).map(f => (
                <span key={f.muscle} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff', padding: '5px 10px', borderRadius: 999, background: hexToRgba(accent, 0.16), border: `1px solid ${hexToRgba(accent, 0.45)}` }}>{f.label}</span>
              ))}
            </div>
          )}
          <div style={{ padding: '14px 14px 12px', borderRadius: 18, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {statRow(true, isSquare ? 17 : 20)}
          </div>
        </div>
      );
      break;

    case 'overview': {
      const maxLift = summary.topLift > 0 ? String(Math.round(toUnit(summary.topLift) * 10) / 10) : 'BW';
      const kpis = [
        { label: 'Kcal', value: String(summary.calories), accent: true },
        { label: 'Time', value: duration.value, unit: duration.unit },
        { label: 'Sets', value: String(summary.totalSets) },
        { label: 'Max', value: maxLift, unit: summary.topLift > 0 ? weightUnit : undefined },
      ];
      const cells = summary.exercises.length > 9
        ? [...summary.exercises.slice(0, 8).map(e => e.name), `+${summary.exercises.length - 8} more`]
        : summary.exercises.map(e => e.name);
      const nameSize = isSquare ? 9.5 : 11;
      content = (
        <div style={{ position: 'absolute', inset: 0, padding: pad, display: 'flex', flexDirection: 'column', background: `radial-gradient(80% 40% at 50% 28%, ${hexToRgba(accent, 0.18)} 0%, transparent 70%), #09090C` }}>
          {headerRow()}
          {!isSquare && (
            <div style={{ marginTop: 10, fontSize: 18, fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.01em', color: '#fff', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          )}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
            <Figures {...figureArgs} views="both" height={isSquare ? 118 : 285} gap={isSquare ? 12 : 20} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, padding: isSquare ? '8px 10px' : '12px 12px 10px', borderRadius: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {kpis.map(k => (
              <Stat key={k.label} label={k.label} value={k.value} unit={k.unit} align="center" size={isSquare ? 15 : 19} accent={k.accent ? accent : undefined} />
            ))}
          </div>
          <div style={{ marginTop: isSquare ? 8 : 12, height: isSquare ? 98 : 168, flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridTemplateRows: 'repeat(3, minmax(0, 1fr))', gap: isSquare ? 4 : 6 }}>
            {cells.map((name, i) => {
              const more = summary.exercises.length > 9 && i === 8;
              // Number and name share one line height so the number sits on the name's first line.
              const lineH = Math.round(nameSize * 1.25);
              return (
                <div key={`${name}-${i}`} style={{ minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: more ? 'center' : 'flex-start', padding: isSquare ? '0 7px' : '0 9px', borderRadius: 10, background: more ? hexToRgba(accent, 0.14) : 'rgba(255,255,255,0.05)', border: `1px solid ${more ? hexToRgba(accent, 0.4) : 'rgba(255,255,255,0.08)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0, width: more ? 'auto' : '100%' }}>
                    {!more && (
                      <span style={{ width: isSquare ? 11 : 13, flexShrink: 0, fontSize: isSquare ? 8.5 : 10, lineHeight: `${lineH}px`, fontWeight: 800, color: accent, fontVariantNumeric: 'tabular-nums' }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    )}
                    <span style={{ minWidth: 0, flex: more ? 'none' : 1, fontSize: nameSize, fontWeight: 700, lineHeight: `${lineH}px`, color: '#fff', overflow: 'hidden', maxHeight: isSquare ? lineH : lineH * 3, whiteSpace: isSquare ? 'nowrap' : 'normal', textOverflow: 'ellipsis', wordBreak: 'break-word' }}>{name}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
      break;
    }

    case 'split': {
      const bars = focus.slice(0, 4);
      const barList = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: isSquare ? 9 : 12, flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.5)' }}>MUSCLE SPLIT</div>
          {bars.map(b => (
            <div key={b.muscle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: '#fff' }}>
                <span>{b.label}</span>
                <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>{b.pct}%</span>
              </div>
              <div style={{ marginTop: 5, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ width: `${b.pct}%`, height: '100%', borderRadius: 999, background: hexToRgba(accent, 0.35 + 0.65 * (b.pct / 100)) }} />
              </div>
            </div>
          ))}
        </div>
      );
      content = (
        <div style={{ position: 'absolute', inset: 0, padding: pad, display: 'flex', flexDirection: 'column', background: '#0B0B0E' }}>
          {headerRow()}
          <div style={{ marginTop: 14, flexShrink: 0, fontSize: isSquare ? 18 : 22, fontWeight: 900, lineHeight: 1.1, color: '#fff', textTransform: 'uppercase', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          {isSquare ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 16, minHeight: 0 }}>
              <Figures {...figureArgs} height={170} gap={6} />
              {barList}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0 18px', flexShrink: 0 }}>
                <Figures {...figureArgs} height={230} gap={16} />
              </div>
              {barList}
            </>
          )}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            {statRow(true, isSquare ? 16 : 18, statsNoDup.slice(0, 3))}
          </div>
        </div>
      );
      break;
    }

    case 'logbook':
      content = (
        <div style={{ position: 'absolute', inset: 0, padding: pad, display: 'flex', flexDirection: 'column', background: '#0D0D10' }}>
          {headerRow()}
          <div style={{ marginTop: 14, flexShrink: 0, fontSize: isSquare ? 19 : 24, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          <div style={{ marginTop: 12 }}>{statRow(true, isSquare ? 16 : 19)}</div>
          <div style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.1)', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {visibleExercises.map((ex, i) => (
              <div key={`${ex.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: isSquare ? '8px 0' : '10px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <span style={{ width: 18, fontSize: 11, fontWeight: 800, color: accent }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ex.name}</span>
                {ex.isPR && <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.1em', padding: '3px 5px', borderRadius: 4, background: accent, color: '#0D0D10' }}>PR</span>}
                <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>{setDetail(ex.sets)}</span>
              </div>
            ))}
            {hiddenExercises > 0 && (
              <div style={{ paddingTop: 8, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>+{hiddenExercises} more exercise{hiddenExercises > 1 ? 's' : ''}</div>
            )}
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Figures {...figureArgs} height={isSquare ? 44 : 64} gap={4} glow={false} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.45)' }}>FOCUS</div>
              <div style={{ marginTop: 3, fontSize: 12, fontWeight: 700, color: '#fff' }}>{focusLine}</div>
            </div>
          </div>
        </div>
      );
      break;

    case 'poster': {
      const size = isSquare ? 40 : titleWords.length > 3 ? 44 : 56;
      content = (
        <div style={{ position: 'absolute', inset: 0, background: '#0A0A0A', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: isSquare ? -30 : -40, bottom: isSquare ? 50 : 90, opacity: 0.95 }}>
            <Figures {...figureArgs} views={views === 'both' ? 'front' : views} height={isSquare ? 290 : 470} />
          </div>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(10,10,10,0.95) 0%, rgba(10,10,10,0.55) 55%, rgba(10,10,10,0) 100%)' }} />
          <div style={{ position: 'absolute', inset: 0, padding: pad, display: 'flex', flexDirection: 'column' }}>
            <Wordmark />
            <div style={{ marginTop: isSquare ? 16 : 36, maxWidth: 240 }}>
              {titleWords.slice(0, 4).map((w, i) => (
                <div key={i} style={{ fontSize: size, fontWeight: 900, lineHeight: 0.92, letterSpacing: '-0.03em', textTransform: 'uppercase', color: i % 2 === 1 ? accent : '#fff', wordBreak: 'break-word' }}>{w}</div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>{data.date}</div>
            <div style={{ flex: 1 }} />
            <div style={{ paddingTop: 12, borderTop: `2px solid ${accent}` }}>{statRow(true, isSquare ? 18 : 22)}</div>
          </div>
        </div>
      );
      break;
    }

    case 'clean':
      content = (
        <div style={{ position: 'absolute', inset: 0, padding: pad, display: 'flex', flexDirection: 'column', background: '#F4F1EC' }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', color: 'rgba(17,17,17,0.55)' }}>{data.date}</div>
          <div style={{ marginTop: 6, fontSize: isSquare ? 22 : 28, fontWeight: 800, color: '#111', letterSpacing: '-0.03em', lineHeight: 1.05, maxHeight: isSquare ? 48 : 62, overflow: 'hidden' }}>{title}</div>
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: 'rgba(17,17,17,0.6)' }}>{focusLine}</div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
            <Figures {...figureArgs} color={darkAccent} light glow={false} height={isSquare ? 160 : 320} gap={isSquare ? 10 : 20} />
          </div>
          <div style={{ padding: '14px 0', borderTop: '1px solid rgba(17,17,17,0.12)', borderBottom: '1px solid rgba(17,17,17,0.12)' }}>
            {statRow(false, isSquare ? 18 : 22)}
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
            <Wordmark color="#111111" size={11} />
          </div>
        </div>
      );
      break;

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
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.85) 100%)' }} />
          <div style={{ position: 'absolute', inset: 0, padding: pad, display: 'flex', flexDirection: 'column' }}>
            {headerRow()}
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                {eyebrow(accent)}
                <div style={{ marginTop: 6, fontSize: isSquare ? 20 : 26, fontWeight: 900, color: '#fff', textTransform: 'uppercase', lineHeight: 1.02, letterSpacing: '-0.02em', textShadow: '0 2px 10px rgba(0,0,0,0.4)' }}>{title}</div>
              </div>
              <Figures {...figureArgs} height={isSquare ? 70 : 96} gap={4} />
            </div>
            <div style={{ marginTop: 14 }}>{statRow(true, isSquare ? 17 : 21)}</div>
          </div>
        </div>
      );
      break;

    case 'sticker':
    default:
      content = (
        <div style={{ position: 'absolute', inset: 0, padding: pad, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: isSquare ? 10 : 18, textShadow: '0 2px 10px rgba(0,0,0,0.55)' }}>
          <div style={{ filter: 'drop-shadow(0 8px 18px rgba(0,0,0,0.5))' }}>
            <Figures {...figureArgs} height={isSquare ? 170 : 300} gap={isSquare ? 10 : 18} />
          </div>
          <div style={{ fontSize: isSquare ? 18 : 24, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '-0.01em', textAlign: 'center' }}>{title}</div>
          <div style={{ width: '100%', maxWidth: 300 }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${statsNoDup.length}, minmax(0, 1fr))`, gap: 8 }}>
              {statsNoDup.map(s => <Stat key={s.label} label={s.label} value={s.value} unit={s.unit} align="center" size={isSquare ? 17 : 21} accent={s.accent ? accent : undefined} />)}
            </div>
          </div>
          <Wordmark size={10} />
        </div>
      );
  }

  const cardTemplate = (
    <div
      ref={cardRef}
      className="relative overflow-hidden rounded-[2.2rem]"
      style={{ width: DESIGN_W, height: designH, background: CARD_BG[layout], fontFamily: FONT } as CSSProperties}
    >
      {content}
    </div>
  );

  const TABS = [
    { id: 'layout' as const, label: 'Template', icon: LayoutTemplate },
    { id: 'body' as const, label: 'Body', icon: PersonStanding },
    { id: 'colors' as const, label: 'Colour', icon: Palette },
  ];

  const tabVisibility = (id: typeof activeTab) => `${activeTab === id ? '' : 'hidden'} md:block`;
  const hScroll = 'flex md:grid gap-3 overflow-x-auto md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
  const subtitle = `${summary.exercises.length} exercise${summary.exercises.length === 1 ? '' : 's'} · ${data.date}`;

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
          aria-label="Share workout"
          initial={{ opacity: 0, y: 16, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative flex flex-col md:flex-row w-full h-full md:max-w-[1000px] md:h-[min(800px,calc(100dvh-48px))] md:rounded-[28px] overflow-hidden bg-[rgb(var(--color-ink))] md:border md:border-line"
          style={{ boxShadow: '0 30px 80px rgba(0,0,0,0.35)' }}
        >
          {/* ═════ Preview column ═════ */}
          <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-[rgb(var(--color-ink-2))]">
            <div className="md:hidden flex items-center gap-2 px-3 pb-2" style={{ paddingTop: 'max(var(--sat), 12px)' }}>
              <RoundButton onClick={onClose} label="Close"><X size={18} /></RoundButton>
              <div className="flex-1 min-w-0 text-center">
                <div className="text-[15px] font-semibold text-bone leading-tight">Share workout</div>
                <div className="text-[11px] text-bone-dim truncate">{subtitle}</div>
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
                <h2 className="text-lg font-semibold text-bone leading-tight">Share workout</h2>
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
                        <motion.span layoutId="workout-share-tab" className="absolute inset-0 rounded-full pro-thumb" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
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

              {/* Body */}
              <section className={`${tabVisibility('body')} space-y-3`}>
                <ControlHeading hint="Muscles are shaded by how much work they did this session.">Body</ControlHeading>
                <Segmented value={gender} onChange={setGender} options={[{ id: 'male', label: 'Male' }, { id: 'female', label: 'Female' }]} />
                <Segmented value={views} onChange={setViews} options={[{ id: 'both', label: 'Front + back' }, { id: 'front', label: 'Front' }, { id: 'back', label: 'Back' }]} />
                {focus.length > 0 && (
                  <div className="hidden md:block pt-1 space-y-2">
                    {focus.map(f => (
                      <div key={f.muscle} className="flex items-center gap-3">
                        <span className="w-24 text-xs text-bone-dim truncate">{f.label}</span>
                        <span className="flex-1 h-1.5 rounded-full bg-bone/10 overflow-hidden">
                          <span className="block h-full rounded-full" style={{ width: `${f.pct}%`, background: accent === '#FFFFFF' ? 'rgb(var(--color-bone))' : accent }} />
                        </span>
                        <span className="w-9 text-right text-xs text-bone-dim tabular-nums">{f.pct}%</span>
                      </div>
                    ))}
                  </div>
                )}
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

            <div className="flex items-center gap-2.5 px-4 md:px-6 pt-3 md:pt-4 md:pb-6 border-t border-line" style={{ paddingBottom: 'max(var(--sab), 16px)' }}>
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
