import { useState, useEffect, useRef, useMemo, useId, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, Flame, Zap, Clock, Dumbbell, Trophy, Calendar as CalIcon,
  ChevronLeft, ChevronRight, ChevronDown, MapPin, Footprints, Bike, Activity,
  Timer, Gauge, Share2, Mountain, X, Scale, Ruler, Percent, ArrowUpRight,
  ArrowDownRight, LayoutGrid, Layers, type LucideIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { RouteMap } from '@/components/cardio/RouteMap';
import { CardioShareModal, type CardioShareData } from '@/components/ui/CardioShareModal';
import { getUserWorkouts } from '@/services/workouts';
import { getUserCardioActivities } from '@/services/cardio';
import { getUserPlans, getPlan, getPlanDays, getPublicPlansForUser, clonePlan } from '@/services/plans';
import { getFollowing, getUsersByUids } from '@/services/social';
import { getUserEventRegistrations, getEventsByIds } from '@/services/events';
import { getMeasurements } from '@/services/measurements';
import { effectiveStreak } from '@/lib/stats';
import type { Workout, CardioActivity, AppEvent } from '@/types';

/* ════════════════════════════════════════════════════════════════
   Helpers
   ════════════════════════════════════════════════════════════════ */

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } } };

function pad2(n: number) { return n.toString().padStart(2, '0'); }

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

function formatNumber(n: number) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return Math.round(n).toLocaleString();
}

function formatDurationSec(sec: number): string {
  if (!sec || sec <= 0) return '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function getCardioDateStr(c: CardioActivity): string {
  if (c.date && c.date.length === 10) return c.date;
  if (c.startedAt && c.startedAt.seconds) {
    return toDateKey(new Date(c.startedAt.seconds * 1000));
  }
  return toDateKey(new Date());
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * exp;
}

function shortTick(v: number): string {
  if (v >= 1000) return `${+(v / 1000).toFixed(1)}k`;
  return `${+v.toFixed(1)}`;
}

const CARDIO_META: Record<string, { label: string; icon: LucideIcon }> = {
  run: { label: 'Run', icon: Activity },
  walk: { label: 'Walk', icon: Footprints },
  cycle: { label: 'Ride', icon: Bike },
};

const cardioMeta = (type: string) => CARDIO_META[type] || { label: 'Cardio', icon: Activity };

const TONE = {
  neutral: 'text-bone bg-bone/[0.07]',
  cardio: 'text-viz-cardio bg-viz-cardio/10',
  strength: 'text-viz-strength bg-viz-strength/10',
  speed: 'text-viz-speed bg-viz-speed/10',
  energy: 'text-viz-energy bg-viz-energy/10',
  elev: 'text-viz-elev bg-viz-elev/10',
  event: 'text-viz-event bg-viz-event/10',
} as const;
type Tone = keyof typeof TONE;
type VizTone = Exclude<Tone, 'neutral'>;

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/* ════════════════════════════════════════════════════════════════
   UI primitives
   ════════════════════════════════════════════════════════════════ */

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`pro-panel ${className}`}>{children}</section>;
}

function SectionHeader({ title, subtitle, dotClass, right }: {
  title: string; subtitle?: string; dotClass?: string; right?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 px-1">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-bone">
          {dotClass && <span className={`w-2 h-2 rounded-full ${dotClass}`} />}
          {title}
        </h2>
        {subtitle && <p className="text-xs text-bone-dim mt-0.5 truncate">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

function CardTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-bone">{title}</h3>
        {subtitle && <p className="text-xs text-bone-dim mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

function Stat({ label, value, unit, icon: Icon, tone = 'neutral', sub }: {
  label: string; value: ReactNode; unit?: string; icon?: LucideIcon; tone?: Tone; sub?: ReactNode;
}) {
  return (
    <div className="pro-tile p-3.5 sm:p-4 min-w-0">
      <div className="flex items-center gap-2 mb-2.5">
        {Icon && (
          <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${TONE[tone]}`}>
            <Icon size={13} strokeWidth={2.25} />
          </span>
        )}
        <span className="pro-label truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1 min-w-0">
        <span className="text-[22px] leading-none font-semibold tracking-tight text-bone tabular-nums truncate">{value}</span>
        {unit && <span className="text-xs font-medium text-bone-dim">{unit}</span>}
      </div>
      {sub && <div className="text-[11px] text-bone-dim mt-1.5 truncate">{sub}</div>}
    </div>
  );
}

function Segmented<T extends string>({ id, value, options, onChange, size = 'md', className = '' }: {
  id: string;
  value: T;
  options: { value: T; label: string; icon?: LucideIcon }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div role="tablist" className={`pro-track relative flex p-1 rounded-full ${className}`}>
      {options.map(opt => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`relative flex-1 flex items-center justify-center whitespace-nowrap rounded-full font-medium transition-colors ${
              size === 'sm' ? 'h-7 px-3 text-xs' : 'h-8 px-3.5 text-[13px]'
            } ${active ? 'text-bone' : 'text-bone-dim hover:text-bone'}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full pro-thumb"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {Icon && <Icon size={14} className="hidden sm:block" />}
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function IconButton({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="w-8 h-8 rounded-full pro-track flex items-center justify-center text-bone-dim hover:text-bone transition-colors"
    >
      {children}
    </button>
  );
}

function LinkButton({ onClick, children, toneClass = 'text-bone-dim hover:text-bone' }: {
  onClick: () => void; children: ReactNode; toneClass?: string;
}) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-0.5 text-[13px] font-medium shrink-0 transition-colors ${toneClass}`}>
      {children}
      <ChevronRight size={14} />
    </button>
  );
}

function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4 rounded-2xl pro-track">
      <div className="w-10 h-10 rounded-full pro-thumb flex items-center justify-center text-bone-dim mb-3">
        <Icon size={18} />
      </div>
      <div className="text-sm font-medium text-bone">{title}</div>
      {text && <p className="text-xs text-bone-dim mt-1 max-w-xs">{text}</p>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Charts (SVG, rendered at true pixel width, theme-token coloured)
   ════════════════════════════════════════════════════════════════ */

type ChartPoint = { key: string; label: string; value: number; sub?: string };

const CHART_PAD = { l: 34, r: 10, t: 14, b: 24 };

function ChartTooltip({ x, y, width, point, unit, fmt }: {
  x: number; y: number; width: number; point: ChartPoint; unit: string; fmt: (v: number) => string;
}) {
  const left = Math.min(Math.max(x, 56), width - 56);
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-xl bg-bone text-ink px-2.5 py-1.5 text-center whitespace-nowrap"
      style={{ left, top: y, transform: 'translate(-50%, calc(-100% - 10px))' }}
    >
      <div className="text-[13px] font-semibold tabular-nums">{fmt(point.value)} {unit}</div>
      <div className="text-[10px] opacity-70">{point.label}{point.sub ? ` · ${point.sub}` : ''}</div>
    </div>
  );
}

function useLabelStep(count: number, plotW: number) {
  const maxLabels = Math.max(2, Math.floor(plotW / 58));
  return Math.max(1, Math.ceil(count / maxLabels));
}

function LineChart({ data, tone, unit, height = 188, yMin = 0, fmt = v => v.toFixed(1) }: {
  data: ChartPoint[]; tone: VizTone; unit: string; height?: number; yMin?: number; fmt?: (v: number) => string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradId = `lg${useId().replace(/:/g, '')}`;
  const color = `rgb(var(--viz-${tone}))`;

  const w = Math.max(width, 200);
  const plotW = w - CHART_PAD.l - CHART_PAD.r;
  const plotH = height - CHART_PAD.t - CHART_PAD.b;
  const maxV = Math.max(...data.map(d => d.value), yMin + 0.1);
  const yMax = yMin + niceCeil(maxV - yMin);
  const n = data.length;

  const pts = data.map((d, i) => ({
    x: CHART_PAD.l + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW),
    y: CHART_PAD.t + plotH - ((d.value - yMin) / (yMax - yMin)) * plotH,
  }));

  let line = '';
  pts.forEach((p, i) => {
    if (i === 0) { line = `M${p.x},${p.y}`; return; }
    const prev = pts[i - 1];
    const cx = (prev.x + p.x) / 2;
    line += ` C${cx},${prev.y} ${cx},${p.y} ${p.x},${p.y}`;
  });
  const baseY = CHART_PAD.t + plotH;
  const area = n > 0 ? `${line} L${pts[n - 1].x},${baseY} L${pts[0].x},${baseY} Z` : '';
  const step = useLabelStep(n, plotW);
  const ticks = [0, 1, 2, 3].map(i => yMin + ((yMax - yMin) * i) / 3);
  const active = hover ?? n - 1;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }} onMouseLeave={() => setHover(null)}>
      {width > 0 && n > 0 && (
        <svg width={w} height={height} className="block overflow-visible">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.22 }} />
              <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
            </linearGradient>
          </defs>

          {ticks.map((t, i) => {
            const y = CHART_PAD.t + plotH - (i / 3) * plotH;
            return (
              <g key={i}>
                <line x1={CHART_PAD.l} x2={w - CHART_PAD.r} y1={y} y2={y} className="stroke-line" strokeDasharray={i === 0 ? undefined : '3 4'} />
                <text x={CHART_PAD.l - 8} y={y + 3.5} textAnchor="end" className="fill-bone-dim" fontSize={10}>{shortTick(t)}</text>
              </g>
            );
          })}

          <path d={area} fill={`url(#${gradId})`} />
          <path d={line} fill="none" style={{ stroke: color }} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />

          {hover !== null && (
            <line x1={pts[hover].x} x2={pts[hover].x} y1={CHART_PAD.t} y2={baseY} className="stroke-bone-dim" strokeOpacity={0.35} strokeDasharray="3 3" />
          )}

          {pts.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={i === active ? 4.5 : n <= 16 ? 2.5 : 0}
              style={{ fill: i === active ? color : 'rgb(var(--color-ink))', stroke: color }}
              strokeWidth={i === active ? 2.5 : 1.5}
            />
          ))}

          {data.map((d, i) => {
            const show = i % step === 0 || (i === n - 1 && (n - 1) % step >= step / 2);
            if (!show) return null;
            return (
              <text key={d.key} x={pts[i].x} y={height - 6} textAnchor="middle" className="fill-bone-dim" fontSize={10}>
                {d.label}
              </text>
            );
          })}

          {pts.map((p, i) => {
            const left = i === 0 ? CHART_PAD.l : (pts[i - 1].x + p.x) / 2;
            const right = i === n - 1 ? w - CHART_PAD.r : (p.x + pts[i + 1].x) / 2;
            return (
              <rect
                key={`hit-${i}`}
                x={left}
                y={CHART_PAD.t}
                width={Math.max(right - left, 1)}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onTouchStart={() => setHover(i)}
              />
            );
          })}
        </svg>
      )}
      {width > 0 && hover !== null && (
        <ChartTooltip x={pts[hover].x} y={pts[hover].y} width={w} point={data[hover]} unit={unit} fmt={fmt} />
      )}
    </div>
  );
}

function roundedTopRect(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

function BarChart({ data, tone, unit, height = 188, fmt = formatNumber }: {
  data: ChartPoint[]; tone: VizTone; unit: string; height?: number; fmt?: (v: number) => string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const color = `rgb(var(--viz-${tone}))`;

  const w = Math.max(width, 200);
  const plotW = w - CHART_PAD.l - CHART_PAD.r;
  const plotH = height - CHART_PAD.t - CHART_PAD.b;
  const yMax = niceCeil(Math.max(...data.map(d => d.value), 1));
  const n = data.length;
  const slot = plotW / Math.max(n, 1);
  const barW = Math.min(slot * 0.56, 30);
  const baseY = CHART_PAD.t + plotH;
  const step = useLabelStep(n, plotW);
  const ticks = [0, 1, 2, 3].map(i => (yMax * i) / 3);

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={w} height={height} className="block overflow-visible">
          {ticks.map((t, i) => {
            const y = baseY - (i / 3) * plotH;
            return (
              <g key={i}>
                <line x1={CHART_PAD.l} x2={w - CHART_PAD.r} y1={y} y2={y} className="stroke-line" strokeDasharray={i === 0 ? undefined : '3 4'} />
                <text x={CHART_PAD.l - 8} y={y + 3.5} textAnchor="end" className="fill-bone-dim" fontSize={10}>{shortTick(t)}</text>
              </g>
            );
          })}

          {data.map((d, i) => {
            const cx = CHART_PAD.l + slot * i + slot / 2;
            const h = (d.value / yMax) * plotH;
            const isLast = i === n - 1;
            const isActive = hover === i || (hover === null && isLast);
            const show = i % step === 0 || isLast;
            return (
              <g key={d.key}>
                <path
                  d={roundedTopRect(cx - barW / 2, baseY - h, barW, h, 6)}
                  style={{ fill: color, opacity: isActive ? 1 : 0.45, transition: 'opacity 150ms' }}
                />
                {show && (
                  <text
                    x={cx}
                    y={height - 6}
                    textAnchor="middle"
                    className={isLast ? 'fill-bone' : 'fill-bone-dim'}
                    fontWeight={isLast ? 600 : 400}
                    fontSize={10}
                  >
                    {isLast ? 'This wk' : d.label}
                  </text>
                )}
                <rect
                  x={cx - slot / 2}
                  y={CHART_PAD.t}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onTouchStart={() => setHover(i)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {width > 0 && hover !== null && (
        <ChartTooltip
          x={CHART_PAD.l + slot * hover + slot / 2}
          y={baseY - (data[hover].value / yMax) * plotH}
          width={w}
          point={data[hover]}
          unit={unit}
          fmt={fmt}
        />
      )}
    </div>
  );
}

function CardioDistanceChart({ activities }: { activities: CardioActivity[] }) {
  const data = useMemo<ChartPoint[]>(() => {
    const byDay: Record<string, { dist: number; count: number }> = {};
    for (const c of activities) {
      const d = getCardioDateStr(c);
      byDay[d] = byDay[d] || { dist: 0, count: 0 };
      byDay[d].dist += c.distanceKm || 0;
      byDay[d].count += 1;
    }
    return Object.keys(byDay).sort().slice(-14).map(k => ({
      key: k,
      label: format(parseDateKey(k), 'MMM d'),
      value: +byDay[k].dist.toFixed(2),
      sub: `${byDay[k].count} session${byDay[k].count === 1 ? '' : 's'}`,
    }));
  }, [activities]);

  if (data.length === 0) {
    return <EmptyState icon={Footprints} title="No cardio in this period" text="Record a walk, run or ride to see your distance trend." />;
  }
  return <LineChart data={data} tone="cardio" unit="km" fmt={v => v.toFixed(2)} />;
}

function CardioSpeedChart({ activities }: { activities: CardioActivity[] }) {
  const data = useMemo<ChartPoint[]>(() => {
    return [...activities]
      .sort((a, b) => getCardioDateStr(a).localeCompare(getCardioDateStr(b)))
      .slice(-12)
      .map((c, i) => {
        const dur = c.movingDurationSec || c.durationSec || 0;
        const spd = c.avgSpeedKmh || (dur > 0 ? (c.distanceKm || 0) / (dur / 3600) : 0);
        return {
          key: `${getCardioDateStr(c)}-${i}`,
          label: format(parseDateKey(getCardioDateStr(c)), 'MMM d'),
          value: +spd.toFixed(1),
          sub: cardioMeta(c.type).label,
        };
      });
  }, [activities]);

  const minV = Math.min(...data.map(d => d.value));
  const yMin = Math.max(0, Math.floor(minV - 1));
  return <LineChart data={data} tone="speed" unit="km/h" yMin={yMin} />;
}

function WeeklyVolumeChart({ workouts }: { workouts: Workout[] }) {
  const data = useMemo<ChartPoint[]>(() => {
    const thisMonday = mondayOf(new Date());
    const buckets: { key: string; label: string; value: number; sessions: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const m = new Date(thisMonday);
      m.setDate(m.getDate() - i * 7);
      buckets.push({ key: toDateKey(m), label: format(m, 'MMM d'), value: 0, sessions: 0 });
    }
    const index = new Map(buckets.map((b, i) => [b.key, i]));
    for (const w of workouts) {
      if (!w.date) continue;
      const k = toDateKey(mondayOf(parseDateKey(w.date.slice(0, 10))));
      const i = index.get(k);
      if (i !== undefined) {
        buckets[i].value += w.volume || 0;
        buckets[i].sessions += 1;
      }
    }
    return buckets.map(b => ({
      key: b.key,
      label: b.label,
      value: b.value,
      sub: `${b.sessions} session${b.sessions === 1 ? '' : 's'}`,
    }));
  }, [workouts]);

  return <BarChart data={data} tone="strength" unit="kg" />;
}

function ConsistencyHeatmap({ workouts, cardio }: { workouts: Workout[]; cardio: CardioActivity[] }) {
  const WEEKS = 12;
  const { cells, startDate, activeDays, strengthDays, cardioDays } = useMemo(() => {
    const strength = new Set(workouts.map(w => w.date));
    const cardioSet = new Set(cardio.map(getCardioDateStr));
    const today = new Date();
    const todayKey = toDateKey(today);
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    start.setDate(start.getDate() - start.getDay() - (WEEKS - 1) * 7);

    const out: { key: string; s: boolean; c: boolean; future: boolean; today: boolean }[] = [];
    let a = 0, sd = 0, cd = 0;
    for (let i = 0; i < WEEKS * 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = toDateKey(d);
      const future = key > todayKey;
      const s = !future && strength.has(key);
      const c = !future && cardioSet.has(key);
      if (s || c) a++;
      if (s) sd++;
      if (c) cd++;
      out.push({ key, s, c, future, today: key === todayKey });
    }
    return { cells: out, startDate: start, activeDays: a, strengthDays: sd, cardioDays: cd };
  }, [workouts, cardio]);

  const cellBg = (cell: (typeof cells)[number]) => {
    if (cell.s && cell.c) return 'linear-gradient(135deg, rgb(var(--viz-strength)) 50%, rgb(var(--viz-cardio)) 50%)';
    if (cell.s) return 'rgb(var(--viz-strength))';
    if (cell.c) return 'rgb(var(--viz-cardio))';
    return 'rgb(var(--color-bone) / 0.07)';
  };

  const side = [
    { label: 'Active days', value: activeDays, dot: 'bg-bone' },
    { label: 'Strength', value: strengthDays, dot: 'bg-viz-strength' },
    { label: 'Cardio', value: cardioDays, dot: 'bg-viz-cardio' },
  ];

  return (
    <div className="flex flex-col sm:flex-row gap-5 sm:gap-8 sm:items-center">
      <div className="w-full sm:max-w-[400px]">
        <div className="grid grid-rows-7 grid-flow-col auto-cols-fr gap-[3px] sm:gap-1">
          {cells.map(cell => (
            <div
              key={cell.key}
              title={`${format(parseDateKey(cell.key), 'EEE, MMM d')}${cell.s ? ' · Strength' : ''}${cell.c ? ' · Cardio' : ''}`}
              className="aspect-square rounded-[4px]"
              style={{
                background: cellBg(cell),
                opacity: cell.future ? 0.35 : 1,
                outline: cell.today ? '1.5px solid rgb(var(--color-bone))' : undefined,
                outlineOffset: cell.today ? 1 : undefined,
              }}
            />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-bone-dim mt-2">
          <span>{format(startDate, 'MMM d')}</span>
          <span>Today</span>
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-1 gap-2 sm:gap-4 flex-1">
        {side.map(s => (
          <div key={s.label} className="pro-tile sm:bg-transparent p-3 sm:p-0">
            <div className="flex items-center gap-1.5 pro-label">
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              {s.label}
            </div>
            <div className="text-xl font-semibold text-bone tabular-nums mt-1">
              {s.value}
              <span className="text-xs font-medium text-bone-dim ml-1">/ {WEEKS * 7}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Page
   ════════════════════════════════════════════════════════════════ */

type Category = 'overview' | 'cardio' | 'strength' | 'body';
type Range = '7d' | '30d' | '90d' | 'all';

const RANGE_LABEL: Record<Range, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  all: 'All time',
};

export function ProgressPage({
  initialDate = null,
  initialCalendarOpen = false,
}: {
  initialDate?: string | null;
  initialCalendarOpen?: boolean;
} = {}) {
  const { profile, stats } = useAuthStore();
  const { showToast, theme } = useUIStore();
  const queryClient = useQueryClient();

  // Navigation & Date State
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate);
  const [isMonthViewOpen, setIsMonthViewOpen] = useState(initialCalendarOpen);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week
  const [activeCategory, setActiveCategory] = useState<Category>('overview');
  const [timeRange, setTimeRange] = useState<Range>('30d');

  // Month navigation for expanded month grid
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  // Share modal state
  const [cardioShareData, setCardioShareData] = useState<CardioShareData | null>(null);

  // Follower import modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedFollowerUid, setSelectedFollowerUid] = useState<string>('');
  const [selectedFollowerPlanId, setSelectedFollowerPlanId] = useState<string>('');

  // 1. Fetch user workouts
  const { data: allWorkouts = [] } = useQuery({
    queryKey: ['allWorkouts', profile?.uid],
    queryFn: () => getUserWorkouts(profile!.uid, 500),
    enabled: !!profile?.uid,
  });

  // 2. Fetch user cardio activities
  const { data: allCardio = [] } = useQuery({
    queryKey: ['allCardioActivities', profile?.uid],
    queryFn: () => getUserCardioActivities(profile!.uid, 500),
    enabled: !!profile?.uid,
  });

  // 3. Fetch user plans
  const { data: allPlans = [] } = useQuery({
    queryKey: ['userPlans', profile?.uid],
    queryFn: () => getUserPlans(profile!.uid),
    enabled: !!profile?.uid,
  });

  // 4. Fetch active plan & days
  const { data: activePlan } = useQuery({
    queryKey: ['activePlan', profile?.activePlanId],
    queryFn: () => getPlan(profile!.activePlanId!),
    enabled: !!profile?.activePlanId,
  });

  const { data: activePlanDays = [] } = useQuery({
    queryKey: ['activePlanDays', profile?.activePlanId],
    queryFn: () => getPlanDays(profile!.activePlanId!),
    enabled: !!profile?.activePlanId,
  });

  // 5. Fetch registered events
  const { data: eventRegistrations = [] } = useQuery({
    queryKey: ['userEventRegistrations', profile?.uid],
    queryFn: () => getUserEventRegistrations(profile!.uid),
    enabled: !!profile?.uid,
  });

  const registeredEventIds = useMemo(() => eventRegistrations.map(r => r.eventId), [eventRegistrations]);

  const { data: registeredEvents = [] } = useQuery({
    queryKey: ['registeredEvents', registeredEventIds],
    queryFn: () => getEventsByIds(registeredEventIds),
    enabled: registeredEventIds.length > 0,
  });

  // 6. Fetch measurements
  const { data: measurements = [] } = useQuery({
    queryKey: ['measurements', profile?.uid],
    queryFn: () => getMeasurements(profile!.uid, 100),
    enabled: !!profile?.uid,
  });

  // 7. Followed users for plan import
  const { data: followingUids = [] } = useQuery({
    queryKey: ['followingUsers', profile?.uid],
    queryFn: () => getFollowing(profile!.uid),
    enabled: !!profile?.uid,
  });

  const { data: followedAthletes = [] } = useQuery({
    queryKey: ['followedProfiles', followingUids],
    queryFn: () => getUsersByUids(followingUids),
    enabled: followingUids.length > 0,
  });

  const { data: followerPlans = [] } = useQuery({
    queryKey: ['followerPlans', selectedFollowerUid],
    queryFn: () => getPublicPlansForUser(selectedFollowerUid),
    enabled: !!selectedFollowerUid,
  });

  // ─── Build Date Maps for Fast Lookups ───────────────────
  const workoutsByDate = useMemo(() => {
    const map: Record<string, Workout[]> = {};
    for (const w of allWorkouts) {
      if (!map[w.date]) map[w.date] = [];
      map[w.date].push(w);
    }
    return map;
  }, [allWorkouts]);

  const cardioByDate = useMemo(() => {
    const map: Record<string, CardioActivity[]> = {};
    for (const c of allCardio) {
      const dKey = getCardioDateStr(c);
      if (!map[dKey]) map[dKey] = [];
      map[dKey].push(c);
    }
    return map;
  }, [allCardio]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, AppEvent[]> = {};
    for (const e of registeredEvents) {
      if (e.dateTime?.start) {
        const dStr = toDateKey(e.dateTime.start.toDate());
        if (!map[dStr]) map[dStr] = [];
        map[dStr].push(e);
      }
    }
    return map;
  }, [registeredEvents]);

  // ─── Time-range Filtered Activities ─────────────────────
  const filteredCardio = useMemo(() => {
    if (timeRange === 'all') return allCardio;
    const daysBack = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffStr = toDateKey(cutoff);
    return allCardio.filter(c => getCardioDateStr(c) >= cutoffStr);
  }, [allCardio, timeRange]);

  const filteredWorkouts = useMemo(() => {
    if (timeRange === 'all') return allWorkouts;
    const daysBack = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffStr = toDateKey(cutoff);
    return allWorkouts.filter(w => w.date >= cutoffStr);
  }, [allWorkouts, timeRange]);

  // ─── Cardio KPIs ────────────────────────────────────────
  const cardioKPIs = useMemo(() => {
    const totalDist = filteredCardio.reduce((s, c) => s + (c.distanceKm || 0), 0);
    const totalSec = filteredCardio.reduce((s, c) => s + (c.movingDurationSec || c.durationSec || 0), 0);
    const totalCal = filteredCardio.reduce((s, c) => s + (c.calories || 0), 0);
    const totalElev = filteredCardio.reduce((s, c) => s + (c.elevationGainM || 0), 0);
    const totalSteps = filteredCardio.reduce((s, c) => s + (c.steps || 0), 0);
    const totalSessions = filteredCardio.length;

    const avgSpeed = totalSec > 0 ? (totalDist / (totalSec / 3600)) : 0;
    const avgPaceSec = totalDist > 0 ? totalSec / totalDist : 0;
    const paceMin = Math.floor(avgPaceSec / 60);
    const paceRemSec = Math.round(avgPaceSec % 60);
    const avgPaceStr = totalDist > 0 ? `${paceMin}:${paceRemSec.toString().padStart(2, '0')}` : '-';

    const walks = filteredCardio.filter(c => c.type === 'walk');
    const runs = filteredCardio.filter(c => c.type === 'run');
    const cycles = filteredCardio.filter(c => c.type === 'cycle');

    const walkDist = walks.reduce((s, c) => s + (c.distanceKm || 0), 0);
    const runDist = runs.reduce((s, c) => s + (c.distanceKm || 0), 0);
    const cycleDist = cycles.reduce((s, c) => s + (c.distanceKm || 0), 0);

    return {
      totalDist,
      totalSec,
      totalCal,
      totalElev,
      totalSteps,
      totalSessions,
      avgSpeed,
      avgPaceStr,
      walksCount: walks.length,
      walkDist,
      runsCount: runs.length,
      runDist,
      cyclesCount: cycles.length,
      cycleDist,
    };
  }, [filteredCardio]);

  // ─── Cardio Personal Records (All Time) ────────────────
  const cardioPRs = useMemo(() => {
    let maxDist: CardioActivity | null = null;
    let fastestPace: CardioActivity | null = null;
    let maxSpeed: CardioActivity | null = null;
    let longestDur: CardioActivity | null = null;
    let maxCal: CardioActivity | null = null;
    let maxElev: CardioActivity | null = null;
    let maxSteps: CardioActivity | null = null;

    for (const c of allCardio) {
      const dist = c.distanceKm || 0;
      const dur = c.movingDurationSec || c.durationSec || 0;

      if (!maxDist || dist > (maxDist.distanceKm || 0)) {
        if (dist > 0) maxDist = c;
      }

      if (dist >= 0.5 && dur > 0) {
        const paceSec = dur / dist;
        const currentBestPaceSec = fastestPace
          ? (fastestPace.movingDurationSec || fastestPace.durationSec) / fastestPace.distanceKm
          : Infinity;
        if (paceSec < currentBestPaceSec && paceSec >= 120) {
          fastestPace = c;
        }
      }

      const spd = c.avgSpeedKmh || (dur > 0 && dist > 0 ? (dist / (dur / 3600)) : 0);
      const currentBestSpd = maxSpeed ? (maxSpeed.avgSpeedKmh || (maxSpeed.distanceKm / (maxSpeed.durationSec / 3600))) : 0;
      if (spd > currentBestSpd && spd > 0) {
        maxSpeed = c;
      }

      if (!longestDur || dur > (longestDur.movingDurationSec || longestDur.durationSec || 0)) {
        if (dur > 0) longestDur = c;
      }

      if (!maxCal || (c.calories || 0) > (maxCal.calories || 0)) {
        if ((c.calories || 0) > 0) maxCal = c;
      }

      if (!maxElev || (c.elevationGainM || 0) > (maxElev.elevationGainM || 0)) {
        if ((c.elevationGainM || 0) > 0) maxElev = c;
      }

      if (!maxSteps || (c.steps || 0) > (maxSteps.steps || 0)) {
        if ((c.steps || 0) > 0) maxSteps = c;
      }
    }

    return { maxDist, fastestPace, maxSpeed, longestDur, maxCal, maxElev, maxSteps };
  }, [allCardio]);

  // ─── Strength Personal Records (All Time) ──────────────
  const strengthPRs = useMemo(() => {
    const bestByExercise: Record<string, { maxWeight: number; maxReps: number; date: string }> = {};

    for (const w of allWorkouts) {
      for (const ex of w.exercises || []) {
        if (!bestByExercise[ex.name]) {
          bestByExercise[ex.name] = { maxWeight: 0, maxReps: 0, date: w.date };
        }
        for (const set of ex.sets || []) {
          const wght = Number(set.weight) || 0;
          const rps = Number(set.reps) || 0;
          if (wght > bestByExercise[ex.name].maxWeight) {
            bestByExercise[ex.name].maxWeight = wght;
            bestByExercise[ex.name].date = w.date;
          }
          if (rps > bestByExercise[ex.name].maxReps) {
            bestByExercise[ex.name].maxReps = rps;
          }
        }
      }
    }

    return Object.entries(bestByExercise)
      .filter(([, v]) => v.maxWeight > 0 || v.maxReps > 0)
      .sort((a, b) => b[1].maxWeight - a[1].maxWeight)
      .slice(0, 10);
  }, [allWorkouts]);

  // ─── Week Strip ─────────────────────────────────────────
  const weekDays = useMemo(() => {
    const today = new Date();
    const current = new Date(today);
    current.setDate(today.getDate() + weekOffset * 7);
    const monday = mondayOf(current);
    const todayStr = toDateKey(new Date());

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = toDateKey(d);
      days.push({
        date: d,
        dateStr,
        dayNum: d.getDate(),
        dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()],
        isToday: dateStr === todayStr,
        hasWorkout: !!(workoutsByDate[dateStr] && workoutsByDate[dateStr].length > 0),
        hasCardio: !!(cardioByDate[dateStr] && cardioByDate[dateStr].length > 0),
        hasEvent: !!(eventsByDate[dateStr] && eventsByDate[dateStr].length > 0),
      });
    }
    return days;
  }, [weekOffset, workoutsByDate, cardioByDate, eventsByDate]);

  // ─── Month Grid ─────────────────────────────────────────
  const monthCells = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const todayStr = toDateKey(new Date());

    const cells: { day: number | null; dateStr: string; hasWorkout: boolean; hasCardio: boolean; hasEvent: boolean; isToday: boolean }[] = [];

    for (let i = 0; i < startDayOfWeek; i++) {
      cells.push({ day: null, dateStr: '', hasWorkout: false, hasCardio: false, hasEvent: false, isToday: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calendarYear}-${pad2(calendarMonth + 1)}-${pad2(d)}`;
      cells.push({
        day: d,
        dateStr,
        hasWorkout: !!(workoutsByDate[dateStr] && workoutsByDate[dateStr].length > 0),
        hasCardio: !!(cardioByDate[dateStr] && cardioByDate[dateStr].length > 0),
        hasEvent: !!(eventsByDate[dateStr] && eventsByDate[dateStr].length > 0),
        isToday: dateStr === todayStr,
      });
    }
    return cells;
  }, [calendarYear, calendarMonth, workoutsByDate, cardioByDate, eventsByDate]);

  // Day detail items for selected date
  const selectedDayWorkouts = useMemo(() => {
    if (!selectedDate) return [];
    return workoutsByDate[selectedDate] || [];
  }, [selectedDate, workoutsByDate]);

  const selectedDayCardio = useMemo(() => {
    if (!selectedDate) return [];
    return cardioByDate[selectedDate] || [];
  }, [selectedDate, cardioByDate]);

  const selectedDayEvents = useMemo(() => {
    if (!selectedDate) return [];
    return eventsByDate[selectedDate] || [];
  }, [selectedDate, eventsByDate]);

  const handlePrevDay = () => {
    if (!selectedDate) return;
    const d = parseDateKey(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(toDateKey(d));
  };

  const handleNextDay = () => {
    if (!selectedDate) return;
    const d = parseDateKey(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(toDateKey(d));
  };

  const handleClonePlan = async (planId: string) => {
    if (!profile) return;
    try {
      await clonePlan(planId, 'plans', profile.uid, profile.displayName || profile.username || 'User');
      showToast('Plan added to your library!');
      setIsImportModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['userPlans'] });
    } catch {
      showToast('Failed to import plan');
    }
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(calendarYear, calendarMonth + delta, 1);
    setCalendarMonth(d.getMonth());
    setCalendarYear(d.getFullYear());
  };

  if (!profile || !stats) return null;

  // ─── Derived (non-hook) values ─────────────────────────
  const xp = stats.xp || 0;
  const level = Math.floor(xp / 500) + 1;
  const levelXp = xp % 500;
  const levelProgress = (levelXp / 500) * 100;

  const latestMeasurement = measurements[0];
  const firstMeasurement = measurements[measurements.length - 1];
  const metricDelta = (key: 'weight' | 'bodyfat' | 'waist') =>
    latestMeasurement?.[key] != null && firstMeasurement?.[key] != null
      ? Number(latestMeasurement[key]) - Number(firstMeasurement[key])
      : null;

  const rangeLabel = RANGE_LABEL[timeRange];
  const mapTheme = theme === 'dark' ? 'dark' : 'light';
  const todayKey = toDateKey(new Date());

  const strengthVolume = filteredWorkouts.reduce((s, w) => s + (w.volume || 0), 0);
  const strengthCalories = filteredWorkouts.reduce((s, w) => s + (w.calories || 0), 0);
  const strengthMinutes = filteredWorkouts.reduce((s, w) => s + (w.durationMin || 0), 0);
  const strengthSets = filteredWorkouts.reduce(
    (s, w) => s + (w.exercises || []).reduce((es, ex) => es + (ex.sets || []).filter(st => st.completed !== false).length, 0),
    0,
  );
  const thisWeekVolume = allWorkouts
    .filter(w => w.date >= toDateKey(mondayOf(new Date())))
    .reduce((s, w) => s + (w.volume || 0), 0);

  const weekStart = weekDays[0].date;
  const weekEnd = weekDays[6].date;
  const weekTitle = weekOffset === 0 ? 'This week' : weekOffset === -1 ? 'Last week' : weekOffset === 1 ? 'Next week'
    : weekOffset < 0 ? `${-weekOffset} weeks ago` : `In ${weekOffset} weeks`;
  const weekRange = weekStart.getMonth() === weekEnd.getMonth()
    ? `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'd')}`
    : `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d')}`;

  const isOverview = activeCategory === 'overview';
  const showCardio = isOverview || activeCategory === 'cardio';
  const showStrength = isOverview || activeCategory === 'strength';
  const showBody = isOverview || activeCategory === 'body';

  const mixTotal = cardioKPIs.runDist + cardioKPIs.cycleDist + cardioKPIs.walkDist;
  const activityMix = [
    { key: 'run', label: 'Run', dist: cardioKPIs.runDist, count: cardioKPIs.runsCount, bar: 'bg-viz-cardio' },
    { key: 'cycle', label: 'Ride', dist: cardioKPIs.cycleDist, count: cardioKPIs.cyclesCount, bar: 'bg-viz-speed' },
    { key: 'walk', label: 'Walk', dist: cardioKPIs.walkDist, count: cardioKPIs.walksCount, bar: 'bg-viz-elev' },
  ];

  const prDate = (c: CardioActivity) => {
    const d = getCardioDateStr(c);
    return `${format(parseDateKey(d), 'MMM d, yyyy')} · ${cardioMeta(c.type).label}`;
  };
  const cardioPrItems = [
    cardioPRs.maxDist && { key: 'dist', label: 'Longest distance', value: (cardioPRs.maxDist.distanceKm || 0).toFixed(2), unit: 'km', icon: MapPin, tone: 'cardio' as Tone, act: cardioPRs.maxDist },
    cardioPRs.fastestPace && { key: 'pace', label: 'Best pace', value: (cardioPRs.fastestPace.avgPace || '-').replace(' /km', ''), unit: '/km', icon: Timer, tone: 'speed' as Tone, act: cardioPRs.fastestPace },
    cardioPRs.maxSpeed && { key: 'speed', label: 'Top avg speed', value: cardioPRs.maxSpeed.avgSpeedKmh ? cardioPRs.maxSpeed.avgSpeedKmh.toFixed(1) : '-', unit: 'km/h', icon: Gauge, tone: 'event' as Tone, act: cardioPRs.maxSpeed },
    cardioPRs.longestDur && { key: 'dur', label: 'Longest session', value: formatDurationSec(cardioPRs.longestDur.movingDurationSec || cardioPRs.longestDur.durationSec), unit: '', icon: Clock, tone: 'neutral' as Tone, act: cardioPRs.longestDur },
    cardioPRs.maxCal && { key: 'cal', label: 'Most calories', value: String(cardioPRs.maxCal.calories || 0), unit: 'kcal', icon: Flame, tone: 'energy' as Tone, act: cardioPRs.maxCal },
    cardioPRs.maxElev && { key: 'elev', label: 'Most elevation', value: String(cardioPRs.maxElev.elevationGainM || 0), unit: 'm', icon: Mountain, tone: 'elev' as Tone, act: cardioPRs.maxElev },
  ].filter(Boolean) as { key: string; label: string; value: string; unit: string; icon: LucideIcon; tone: Tone; act: CardioActivity }[];

  const bodyMetrics = [
    { key: 'weight' as const, label: 'Weight', unit: 'kg', icon: Scale },
    { key: 'bodyfat' as const, label: 'Body fat', unit: '%', icon: Percent },
    { key: 'waist' as const, label: 'Waist', unit: 'cm', icon: Ruler },
  ];

  const dayTotals = {
    volume: selectedDayWorkouts.reduce((s, w) => s + (w.volume || 0), 0),
    distance: selectedDayCardio.reduce((s, c) => s + (c.distanceKm || 0), 0),
    seconds:
      selectedDayWorkouts.reduce((s, w) => s + (w.durationMin || 0) * 60, 0) +
      selectedDayCardio.reduce((s, c) => s + (c.movingDurationSec || c.durationSec || 0), 0),
    calories:
      selectedDayWorkouts.reduce((s, w) => s + (w.calories || 0), 0) +
      selectedDayCardio.reduce((s, c) => s + (c.calories || 0), 0),
  };

  const dayDots = (d: { hasWorkout: boolean; hasCardio: boolean; hasEvent: boolean }, size = 'w-1.5 h-1.5') => (
    <span className="flex items-center justify-center gap-[3px] h-1.5">
      {d.hasWorkout && <span className={`${size} rounded-full bg-viz-strength`} />}
      {d.hasCardio && <span className={`${size} rounded-full bg-viz-cardio`} />}
      {d.hasEvent && <span className={`${size} rounded-full bg-viz-event`} />}
    </span>
  );

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="pro-scope max-w-4xl mx-auto space-y-4 sm:space-y-5 pb-24 font-sans">

      {/* ─── Header ──────────────────────────────────────────── */}
      <motion.div variants={item} className="flex items-end justify-between gap-3 px-1 pt-1">
        <div>
          <p className="text-[13px] font-medium text-bone-dim">{format(new Date(), 'EEEE, MMMM d')}</p>
          <h1 className="text-[28px] sm:text-[32px] leading-tight font-bold tracking-tight text-bone">Progress</h1>
        </div>
        <button
          type="button"
          onClick={() => setIsMonthViewOpen(o => !o)}
          aria-expanded={isMonthViewOpen}
          className={`h-9 pl-3 pr-2.5 rounded-full flex items-center gap-1.5 text-[13px] font-medium transition-colors ${
            isMonthViewOpen ? 'bg-bone text-ink' : 'pro-track text-bone hover:bg-bone/10'
          }`}
        >
          <CalIcon size={15} />
          Calendar
          <ChevronDown size={14} className={`transition-transform ${isMonthViewOpen ? 'rotate-180' : ''}`} />
        </button>
      </motion.div>

      {/* ─── Level & streak summary ───────────────────────────── */}
      <motion.div variants={item}>
        <Panel className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-viz-strength/10 text-viz-strength flex flex-col items-center justify-center shrink-0">
              <span className="text-[9px] font-semibold uppercase tracking-wider leading-none opacity-80">Lvl</span>
              <span className="text-lg font-bold leading-tight tabular-nums">{level}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-semibold text-bone truncate">Athlete level {level}</span>
                <span className="text-xs text-bone-dim tabular-nums shrink-0">{levelXp} / 500 XP</span>
              </div>
              <div className="mt-2 h-2 rounded-full pro-track overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-viz-strength"
                  initial={{ width: 0 }}
                  animate={{ width: `${levelProgress}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
              <p className="text-[11px] text-bone-dim mt-1.5">{500 - levelXp} XP to level {level + 1}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 mt-4 pt-4 border-t border-line">
            {[
              { label: 'Current streak', value: effectiveStreak(stats), unit: 'days', icon: Flame, tone: 'energy' as Tone },
              { label: 'Best streak', value: stats.longestStreak || 0, unit: 'days', icon: Trophy, tone: 'speed' as Tone },
              { label: 'Sessions', value: allWorkouts.length + allCardio.length, unit: 'total', icon: Zap, tone: 'cardio' as Tone },
            ].map((s, i) => (
              <div key={s.label} className={`px-2 sm:px-4 ${i > 0 ? 'border-l border-line' : ''} ${i === 0 ? 'pl-0 sm:pl-0' : ''}`}>
                <div className="flex items-center gap-1.5">
                  <s.icon size={13} className={TONE[s.tone].split(' ')[0]} />
                  <span className="pro-label truncate">{s.label}</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl font-semibold text-bone tabular-nums">{s.value}</span>
                  <span className="text-[11px] text-bone-dim">{s.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </motion.div>

      {/* ─── Week strip & month calendar ──────────────────────── */}
      <motion.div variants={item}>
        <Panel className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 mb-3.5">
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-bone">{weekTitle}</div>
              <div className="text-xs text-bone-dim">{weekRange}</div>
            </div>
            <div className="flex items-center gap-1.5">
              {weekOffset !== 0 && (
                <button
                  type="button"
                  onClick={() => setWeekOffset(0)}
                  className="h-8 px-3 rounded-full pro-track text-xs font-medium text-bone hover:bg-bone/10 transition-colors"
                >
                  Today
                </button>
              )}
              <IconButton onClick={() => setWeekOffset(w => w - 1)} label="Previous week"><ChevronLeft size={16} /></IconButton>
              <IconButton onClick={() => setWeekOffset(w => w + 1)} label="Next week"><ChevronRight size={16} /></IconButton>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {weekDays.map(day => {
              const isSelected = selectedDate === day.dateStr;
              return (
                <button
                  key={day.dateStr}
                  type="button"
                  onClick={() => setSelectedDate(isSelected ? null : day.dateStr)}
                  aria-pressed={isSelected}
                  className={`flex flex-col items-center gap-1.5 py-2 rounded-2xl transition-colors ${isSelected ? 'bg-bone/[0.06]' : 'hover:bg-bone/[0.04]'}`}
                >
                  <span className={`text-[11px] font-medium ${day.isToday ? 'text-viz-strength' : 'text-bone-dim'}`}>{day.dayName}</span>
                  <span
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-[15px] font-semibold tabular-nums transition-colors ${
                      isSelected
                        ? 'bg-bone text-ink'
                        : day.isToday
                        ? 'text-viz-strength ring-[1.5px] ring-inset ring-viz-strength'
                        : 'text-bone'
                    }`}
                  >
                    {day.dayNum}
                  </span>
                  {dayDots(day)}
                </button>
              );
            })}
          </div>

          <AnimatePresence initial={false}>
            {isMonthViewOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t border-line">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[15px] font-semibold text-bone">
                      {format(new Date(calendarYear, calendarMonth, 1), 'MMMM yyyy')}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <IconButton onClick={() => shiftMonth(-1)} label="Previous month"><ChevronLeft size={16} /></IconButton>
                      <IconButton onClick={() => shiftMonth(1)} label="Next month"><ChevronRight size={16} /></IconButton>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 text-center mb-1">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => (
                      <div key={i} className="text-[11px] font-medium text-bone-dim py-1">{w}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-y-1">
                    {monthCells.map((cell, idx) => {
                      if (cell.day === null) return <div key={idx} />;
                      const isSelected = selectedDate === cell.dateStr;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setSelectedDate(isSelected ? null : cell.dateStr);
                            setIsMonthViewOpen(false);
                          }}
                          className="flex flex-col items-center gap-1 py-1 rounded-xl hover:bg-bone/[0.04] transition-colors"
                        >
                          <span
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-medium tabular-nums ${
                              isSelected
                                ? 'bg-bone text-ink font-semibold'
                                : cell.isToday
                                ? 'text-viz-strength font-semibold ring-[1.5px] ring-inset ring-viz-strength'
                                : 'text-bone'
                            }`}
                          >
                            {cell.day}
                          </span>
                          {dayDots(cell, 'w-1 h-1')}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-center gap-4 mt-3 text-[11px] text-bone-dim">
                    <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-viz-strength" />Strength</span>
                    <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-viz-cardio" />Cardio</span>
                    <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-viz-event" />Event</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Panel>
      </motion.div>

      {selectedDate !== null ? (
        /* ═══════════════ DAY DETAIL ═══════════════ */
        <motion.div
          key={selectedDate}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-4"
        >
          <Panel className="p-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="h-9 pl-2 pr-3 rounded-full flex items-center gap-1 text-[13px] font-medium text-bone-dim hover:text-bone hover:bg-bone/[0.05] transition-colors"
            >
              <ChevronLeft size={16} /> Overview
            </button>
            <div className="flex-1 min-w-0 text-center">
              <div className="pro-label">{selectedDate === todayKey ? 'Today' : format(parseDateKey(selectedDate), 'EEEE')}</div>
              <div className="text-[15px] font-semibold text-bone truncate">{format(parseDateKey(selectedDate), 'MMMM d, yyyy')}</div>
            </div>
            <div className="flex items-center gap-1.5 pr-1">
              <IconButton onClick={handlePrevDay} label="Previous day"><ChevronLeft size={16} /></IconButton>
              <IconButton onClick={handleNextDay} label="Next day"><ChevronRight size={16} /></IconButton>
            </div>
          </Panel>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Stat label="Volume" value={formatNumber(dayTotals.volume)} unit="kg" icon={Dumbbell} tone="strength" />
            <Stat label="Distance" value={dayTotals.distance.toFixed(2)} unit="km" icon={Footprints} tone="cardio" />
            <Stat label="Active time" value={formatDurationSec(dayTotals.seconds)} icon={Clock} tone="neutral" />
            <Stat label="Calories" value={formatNumber(dayTotals.calories)} unit="kcal" icon={Flame} tone="energy" />
          </div>

          {selectedDayCardio.length > 0 && (
            <div className="space-y-3">
              <SectionHeader title="Cardio" subtitle={`${selectedDayCardio.length} activit${selectedDayCardio.length === 1 ? 'y' : 'ies'}`} dotClass="bg-viz-cardio" />
              {selectedDayCardio.map((c, idx) => {
                const meta = cardioMeta(c.type);
                const metrics = [
                  { label: 'Distance', value: (c.distanceKm || 0).toFixed(2), unit: 'km' },
                  { label: 'Time', value: formatDurationSec(c.movingDurationSec || c.durationSec), unit: '' },
                  { label: 'Pace', value: (c.avgPace || '-').replace(' /km', ''), unit: '/km' },
                  { label: 'Avg speed', value: c.avgSpeedKmh ? c.avgSpeedKmh.toFixed(1) : '-', unit: 'km/h' },
                  { label: 'Calories', value: String(c.calories || 0), unit: 'kcal' },
                  { label: 'Elevation', value: String(c.elevationGainM || 0), unit: 'm' },
                ];
                return (
                  <Panel key={idx} className="p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${TONE.cardio}`}>
                          <meta.icon size={18} />
                        </span>
                        <div className="min-w-0">
                          <div className="text-[15px] font-semibold text-bone truncate">{meta.label}</div>
                          <div className="text-xs text-bone-dim">
                            {c.startedAt?.seconds ? format(new Date(c.startedAt.seconds * 1000), 'h:mm a') : 'Completed'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCardioShareData({
                          type: c.type,
                          date: c.date || new Date().toISOString(),
                          distanceKm: c.distanceKm || 0,
                          durationSec: c.movingDurationSec || c.durationSec || 0,
                          calories: c.calories || 0,
                          avgPace: c.avgPace || '0:00 /km',
                          avgSpeedKmh: c.avgSpeedKmh,
                          maxSpeedKmh: c.maxSpeedKmh,
                          elevationGainM: c.elevationGainM,
                          route: c.route || [],
                          steps: c.steps,
                        })}
                        className="h-9 px-3.5 rounded-full pro-track text-[13px] font-medium text-bone flex items-center gap-1.5 hover:bg-bone/10 transition-colors shrink-0"
                      >
                        <Share2 size={14} /> Share
                      </button>
                    </div>

                    {c.route && c.route.length > 1 && (
                      <div className="mt-4 h-48 sm:h-56 rounded-2xl overflow-hidden border border-line">
                        <RouteMap
                          route={c.route}
                          theme={mapTheme}
                          height="100%"
                          fitToContainer
                          showZoomControls={false}
                          cardioType={c.type}
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-4 mt-4 pt-4 border-t border-line">
                      {metrics.map(m => (
                        <div key={m.label} className="min-w-0">
                          <div className="pro-label truncate">{m.label}</div>
                          <div className="mt-1 flex items-baseline gap-0.5">
                            <span className="text-[17px] font-semibold text-bone tabular-nums truncate">{m.value}</span>
                            {m.unit && <span className="text-[11px] text-bone-dim">{m.unit}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Panel>
                );
              })}
            </div>
          )}

          {selectedDayWorkouts.length > 0 && (
            <div className="space-y-3">
              <SectionHeader title="Strength" subtitle={`${selectedDayWorkouts.length} workout${selectedDayWorkouts.length === 1 ? '' : 's'}`} dotClass="bg-viz-strength" />
              {selectedDayWorkouts.map((w, idx) => (
                <Panel key={idx} className="p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${TONE.strength}`}>
                        <Dumbbell size={18} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold text-bone truncate">{w.planTitle || 'Workout'}</div>
                        <div className="text-xs text-bone-dim truncate">{w.dayTitle || 'Training session'}</div>
                      </div>
                    </div>
                    <span className="text-xs text-bone-dim shrink-0">{w.exercises?.length || 0} exercises</span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-line">
                    {[
                      { label: 'Duration', value: String(w.durationMin || 0), unit: 'min' },
                      { label: 'Volume', value: formatNumber(w.volume || 0), unit: 'kg' },
                      { label: 'Calories', value: String(w.calories || 0), unit: 'kcal' },
                    ].map(m => (
                      <div key={m.label}>
                        <div className="pro-label">{m.label}</div>
                        <div className="mt-1 flex items-baseline gap-0.5">
                          <span className="text-[17px] font-semibold text-bone tabular-nums">{m.value}</span>
                          <span className="text-[11px] text-bone-dim">{m.unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {w.exercises && w.exercises.length > 0 && (
                    <div className="mt-4 divide-y divide-line rounded-2xl pro-tile overflow-hidden">
                      {w.exercises.map((ex, exIdx) => {
                        const completedSets = ex.sets?.filter(s => s.completed !== false) || [];
                        return (
                          <div key={exIdx} className="px-3.5 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-bone truncate">{ex.name}</span>
                              <span className="text-[11px] text-bone-dim shrink-0">{completedSets.length} sets</span>
                            </div>
                            {completedSets.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {completedSets.map((s, si) => {
                                  const base = s.seconds ? `${s.seconds}s` : `${s.reps || 0}`;
                                  return (
                                    <span key={si} className="px-2 py-0.5 rounded-md bg-bone/[0.06] text-[11px] font-medium text-bone tabular-nums">
                                      {s.weight ? `${base} × ${s.weight} kg` : s.seconds ? base : `${base} reps`}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Panel>
              ))}
            </div>
          )}

          {selectedDayEvents.length > 0 && (
            <div className="space-y-3">
              <SectionHeader title="Events" subtitle={`${selectedDayEvents.length} registered`} dotClass="bg-viz-event" />
              <Panel className="divide-y divide-line overflow-hidden">
                {selectedDayEvents.map(e => (
                  <div key={e.id} className="flex items-center gap-3 p-4">
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${TONE.event}`}>
                      <MapPin size={18} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-bone truncate">{e.title}</div>
                      <div className="text-xs text-bone-dim truncate">
                        {e.dateTime?.start?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {e.location?.venueName ? ` · ${e.location.venueName}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </Panel>
            </div>
          )}

          {selectedDayWorkouts.length === 0 && selectedDayCardio.length === 0 && selectedDayEvents.length === 0 && (
            <Panel className="p-4">
              <EmptyState
                icon={CalIcon}
                title="Nothing logged"
                text="No workouts, cardio or events on this day. Rest days count too."
              />
            </Panel>
          )}
        </motion.div>
      ) : (
        /* ═══════════════ OVERVIEW ═══════════════ */
        <motion.div variants={item} className="space-y-5 sm:space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <Segmented<Category>
              id="category"
              value={activeCategory}
              onChange={setActiveCategory}
              className="w-full sm:w-auto"
              options={[
                { value: 'overview', label: 'Overview', icon: LayoutGrid },
                { value: 'cardio', label: 'Cardio', icon: Footprints },
                { value: 'strength', label: 'Strength', icon: Dumbbell },
                { value: 'body', label: 'Body', icon: Scale },
              ]}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-bone-dim sm:hidden">{rangeLabel}</span>
              <Segmented<Range>
                id="range"
                size="sm"
                value={timeRange}
                onChange={setTimeRange}
                options={[
                  { value: '7d', label: '7D' },
                  { value: '30d', label: '30D' },
                  { value: '90d', label: '90D' },
                  { value: 'all', label: 'All' },
                ]}
              />
            </div>
          </div>

          {isOverview && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <Stat label="Workouts" value={filteredWorkouts.length} icon={Dumbbell} tone="strength" sub={`${strengthMinutes} min training`} />
              <Stat label="Distance" value={cardioKPIs.totalDist.toFixed(1)} unit="km" icon={Footprints} tone="cardio" sub={`${cardioKPIs.totalSessions} cardio sessions`} />
              <Stat label="Volume" value={formatNumber(strengthVolume)} unit="kg" icon={TrendingUp} tone="speed" sub="Total lifted" />
              <Stat label="Calories" value={formatNumber(strengthCalories + cardioKPIs.totalCal)} unit="kcal" icon={Flame} tone="energy" sub="Strength + cardio" />
            </div>
          )}

          {/* ─── Cardio ─── */}
          {showCardio && (
            <div className="space-y-3">
              <SectionHeader
                title="Cardio"
                subtitle={`${cardioKPIs.totalSessions} sessions · ${rangeLabel}`}
                dotClass="bg-viz-cardio"
                right={isOverview && <LinkButton onClick={() => setActiveCategory('cardio')} toneClass="text-viz-cardio">Details</LinkButton>}
              />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {!isOverview && <Stat label="Distance" value={cardioKPIs.totalDist.toFixed(1)} unit="km" icon={MapPin} tone="cardio" />}
                <Stat label="Moving time" value={formatDurationSec(cardioKPIs.totalSec)} icon={Clock} tone="neutral" />
                <Stat label="Avg pace" value={cardioKPIs.avgPaceStr} unit="/km" icon={Timer} tone="speed" />
                <Stat label="Avg speed" value={cardioKPIs.avgSpeed.toFixed(1)} unit="km/h" icon={Gauge} tone="event" />
                <Stat label="Elevation" value={formatNumber(cardioKPIs.totalElev)} unit="m" icon={Mountain} tone="elev" />
                {!isOverview && <Stat label="Calories" value={formatNumber(cardioKPIs.totalCal)} unit="kcal" icon={Flame} tone="energy" />}
                {!isOverview && <Stat label="Steps" value={formatNumber(cardioKPIs.totalSteps)} icon={Footprints} tone="neutral" />}
                {!isOverview && <Stat label="Activities" value={cardioKPIs.totalSessions} icon={Activity} tone="cardio" />}
              </div>

              {!isOverview && mixTotal > 0 && (
                <Panel className="p-4 sm:p-5">
                  <CardTitle title="Activity mix" subtitle="Share of distance by type" />
                  <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px] pro-track">
                    {activityMix.filter(m => m.dist > 0).map(m => (
                      <motion.div
                        key={m.key}
                        className={`h-full ${m.bar}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${(m.dist / mixTotal) * 100}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    {activityMix.map(m => (
                      <div key={m.key} className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs text-bone-dim">
                          <span className={`w-2 h-2 rounded-full ${m.bar}`} />
                          {m.label}
                          <span className="ml-auto sm:ml-1 tabular-nums">{mixTotal > 0 ? Math.round((m.dist / mixTotal) * 100) : 0}%</span>
                        </div>
                        <div className="mt-1 text-[17px] font-semibold text-bone tabular-nums">
                          {m.dist.toFixed(1)} <span className="text-[11px] font-medium text-bone-dim">km</span>
                        </div>
                        <div className="text-[11px] text-bone-dim">{m.count} session{m.count === 1 ? '' : 's'}</div>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              <Panel className="p-4 sm:p-5">
                <CardTitle
                  title="Distance"
                  subtitle="Daily totals · last 14 active days"
                  right={
                    <div className="text-right shrink-0">
                      <div className="text-lg font-semibold text-bone tabular-nums leading-tight">
                        {cardioKPIs.totalDist.toFixed(1)} <span className="text-xs font-medium text-bone-dim">km</span>
                      </div>
                      <div className="text-[11px] text-bone-dim">{rangeLabel}</div>
                    </div>
                  }
                />
                <CardioDistanceChart activities={filteredCardio} />
              </Panel>

              {!isOverview && filteredCardio.length >= 2 && (
                <Panel className="p-4 sm:p-5">
                  <CardTitle
                    title="Speed trend"
                    subtitle="Average speed · last 12 sessions"
                    right={
                      <div className="text-right shrink-0">
                        <div className="text-lg font-semibold text-bone tabular-nums leading-tight">
                          {cardioKPIs.avgSpeed.toFixed(1)} <span className="text-xs font-medium text-bone-dim">km/h</span>
                        </div>
                        <div className="text-[11px] text-bone-dim">Period avg</div>
                      </div>
                    }
                  />
                  <CardioSpeedChart activities={filteredCardio} />
                </Panel>
              )}

              {!isOverview && (
                <Panel className="p-4 sm:p-5">
                  <CardTitle title="Personal records" subtitle="Your all-time cardio bests" />
                  {cardioPrItems.length === 0 ? (
                    <EmptyState icon={Trophy} title="No records yet" text="Complete a cardio session to set your first record." />
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {cardioPrItems.map(pr => (
                        <div key={pr.key} className="pro-tile p-3.5">
                          <div className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${TONE[pr.tone]}`}>
                              <pr.icon size={13} />
                            </span>
                            <span className="pro-label truncate">{pr.label}</span>
                          </div>
                          <div className="mt-2.5 flex items-baseline gap-1">
                            <span className="text-xl font-semibold text-bone tabular-nums">{pr.value}</span>
                            {pr.unit && <span className="text-xs text-bone-dim">{pr.unit}</span>}
                          </div>
                          <div className="text-[11px] text-bone-dim mt-1 truncate">{prDate(pr.act)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              )}
            </div>
          )}

          {/* ─── Strength ─── */}
          {showStrength && (
            <div className="space-y-3">
              <SectionHeader
                title="Strength"
                subtitle={`${filteredWorkouts.length} workouts · ${rangeLabel}`}
                dotClass="bg-viz-strength"
                right={isOverview && <LinkButton onClick={() => setActiveCategory('strength')} toneClass="text-viz-strength">Details</LinkButton>}
              />

              {!isOverview && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <Stat label="Workouts" value={filteredWorkouts.length} icon={Dumbbell} tone="strength" />
                  <Stat label="Volume" value={formatNumber(strengthVolume)} unit="kg" icon={TrendingUp} tone="speed" />
                  <Stat label="Sets" value={strengthSets} icon={Layers} tone="neutral" />
                  <Stat
                    label="Avg duration"
                    value={filteredWorkouts.length ? Math.round(strengthMinutes / filteredWorkouts.length) : 0}
                    unit="min"
                    icon={Clock}
                    tone="neutral"
                  />
                </div>
              )}

              <Panel className="p-4 sm:p-5">
                <CardTitle
                  title="Weekly volume"
                  subtitle="Total load lifted · last 8 weeks"
                  right={
                    <div className="text-right shrink-0">
                      <div className="text-lg font-semibold text-bone tabular-nums leading-tight">
                        {formatNumber(thisWeekVolume)} <span className="text-xs font-medium text-bone-dim">kg</span>
                      </div>
                      <div className="text-[11px] text-bone-dim">This week</div>
                    </div>
                  }
                />
                <WeeklyVolumeChart workouts={allWorkouts} />
              </Panel>

              <Panel className="p-4 sm:p-5">
                <CardTitle
                  title="Personal records"
                  subtitle="Heaviest set per exercise"
                  right={isOverview && strengthPRs.length > 3 && (
                    <LinkButton onClick={() => setActiveCategory('strength')}>See all</LinkButton>
                  )}
                />
                {strengthPRs.length === 0 ? (
                  <EmptyState icon={Trophy} title="No lifts recorded" text="Log a strength workout to start tracking your records." />
                ) : (
                  <div className="divide-y divide-line">
                    {(isOverview ? strengthPRs.slice(0, 3) : strengthPRs).map(([name, pr], i) => (
                      <div key={name} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold tabular-nums shrink-0 ${
                            i === 0 ? TONE.speed : 'bg-bone/[0.06] text-bone-dim'
                          }`}
                        >
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-bone truncate">{name}</div>
                          <div className="text-[11px] text-bone-dim">
                            {pr.date ? format(parseDateKey(pr.date.slice(0, 10)), 'MMM d, yyyy') : ''}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[15px] font-semibold text-bone tabular-nums">
                            {pr.maxWeight > 0 ? <>{pr.maxWeight} <span className="text-[11px] font-medium text-bone-dim">kg</span></> : '-'}
                          </div>
                          <div className="text-[11px] text-bone-dim tabular-nums">{pr.maxReps} reps max</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          )}

          {/* ─── Consistency ─── */}
          {isOverview && (
            <div className="space-y-3">
              <SectionHeader title="Consistency" subtitle="Last 12 weeks of training" dotClass="bg-bone" />
              <Panel className="p-4 sm:p-5">
                <ConsistencyHeatmap workouts={allWorkouts} cardio={allCardio} />
              </Panel>
            </div>
          )}

          {/* ─── Body ─── */}
          {showBody && (
            <div className="space-y-3">
              <SectionHeader
                title="Body"
                subtitle={measurements.length ? `${measurements.length} measurement${measurements.length === 1 ? '' : 's'} logged` : 'No measurements yet'}
                dotClass="bg-viz-elev"
              />
              {measurements.length === 0 ? (
                <Panel className="p-4">
                  <EmptyState icon={Scale} title="No measurements" text="Log your weight, body fat and waist to track changes over time." />
                </Panel>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {bodyMetrics.map(m => {
                    const v = latestMeasurement?.[m.key];
                    const delta = metricDelta(m.key);
                    const Arrow = delta != null && delta < 0 ? ArrowDownRight : ArrowUpRight;
                    return (
                      <Stat
                        key={m.key}
                        label={m.label}
                        value={v != null ? Number(v).toFixed(1) : '-'}
                        unit={v != null ? m.unit : undefined}
                        icon={m.icon}
                        tone="elev"
                        sub={
                          delta != null && measurements.length > 1 ? (
                            <span className="inline-flex items-center gap-0.5 tabular-nums">
                              {delta !== 0 && <Arrow size={12} />}
                              {delta > 0 ? '+' : ''}{delta.toFixed(1)} {m.unit} since first log
                            </span>
                          ) : 'Latest entry'
                        }
                      />
                    );
                  })}
                  <Stat label="Entries" value={measurements.length} icon={CalIcon} tone="neutral" sub="Total logs" />
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* ─── Cardio share modal ─── */}
      {cardioShareData && (
        <CardioShareModal
          data={cardioShareData}
          onClose={() => setCardioShareData(null)}
        />
      )}

      {/* ─── Follower plan import modal ─── */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsImportModalOpen(false)} />
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              className="pro-panel relative w-full sm:max-w-lg rounded-b-none sm:rounded-[24px] p-5 sm:p-6 z-10 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-bone">Import athlete plan</h3>
                <IconButton onClick={() => setIsImportModalOpen(false)} label="Close"><X size={16} /></IconButton>
              </div>

              <div className="space-y-3">
                <label className="pro-label block">Followed athlete</label>
                <CustomSelect
                  value={selectedFollowerUid}
                  onChange={(uid) => {
                    setSelectedFollowerUid(uid);
                    setSelectedFollowerPlanId('');
                  }}
                  placeholder="Select athlete..."
                  options={followedAthletes.map(a => ({ value: a.uid, label: a.displayName || a.username || 'Athlete' }))}
                />

                {selectedFollowerUid && (
                  <>
                    <label className="pro-label block pt-2">Available plans</label>
                    {followerPlans.length === 0 ? (
                      <div className="text-xs text-bone-dim py-4 text-center">This athlete has no public plans.</div>
                    ) : (
                      <div className="space-y-2">
                        {followerPlans.map(p => (
                          <div key={p.id} className="pro-tile p-3.5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-bone truncate">{p.title}</div>
                              <div className="text-xs text-bone-dim line-clamp-2">{p.description}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleClonePlan(p.id!)}
                              className="h-8 px-3.5 rounded-full bg-bone text-ink text-xs font-semibold shrink-0"
                            >
                              Import
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
