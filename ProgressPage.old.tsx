import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, Flame, Zap, Clock, Dumbbell, Trophy, Calendar as CalIcon,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, MapPin, Footprints,
  Bike, Activity, Timer, Gauge, Share2, Award, Sparkles, Plus, Play,
  ArrowLeft, Check, X, Search, BookOpen, Layers, Filter, Mountain
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { RouteMap } from '@/components/cardio/RouteMap';
import { CardioShareModal, type CardioShareData } from '@/components/ui/CardioShareModal';
import { getUserWorkouts, getWorkoutsByDateRange } from '@/services/workouts';
import { getUserCardioActivities } from '@/services/cardio';
import { getUserPlans, getPlan, getPlanDays, getPublicPlansForUser, clonePlan } from '@/services/plans';
import { getFollowing, getUsersByUids } from '@/services/social';
import { getUserEventRegistrations, getEventsByIds } from '@/services/events';
import { getMeasurements } from '@/services/measurements';
import type { Workout, CardioActivity, Plan, PlanDay, AppEvent } from '@/types';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

function pad2(n: number) { return n.toString().padStart(2, '0'); }

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatNumber(n: number) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
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

function getWorkoutMaxWeight(w: Workout): number {
  if (!w.exercises) return 0;
  let max = 0;
  for (const ex of w.exercises) {
    if (ex.sets) {
      for (const s of ex.sets) {
        if (s.completed && s.weight && s.weight > max) {
          max = s.weight;
        }
      }
    }
  }
  return max;
}

// ─── SVG Cardio Distance Chart ──────────────────────────
function CardioDistanceChart({ activities }: { activities: CardioActivity[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Group distance by day sorted chronologically
  const dayDistMap = useMemo(() => {
    const map = new Map<string, { distance: number; count: number; date: string }>();
    const sorted = [...activities].sort((a, b) => {
      const tA = a.startedAt?.seconds || 0;
      const tB = b.startedAt?.seconds || 0;
      return tA - tB;
    });

    for (const act of sorted) {
      const dKey = getCardioDateStr(act);
      const prev = map.get(dKey) || { distance: 0, count: 0, date: dKey };
      prev.distance += act.distanceKm || 0;
      prev.count += 1;
      map.set(dKey, prev);
    }
    return Array.from(map.values()).slice(-14); // show last 14 active days
  }, [activities]);

  if (dayDistMap.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-bone-dim text-xs font-mono border border-dashed border-line/40 rounded-2xl bg-ink-2/30">
        <Activity size={24} className="text-cyan-400 mb-2 opacity-50" />
        No cardio recorded in this period yet.
      </div>
    );
  }

  const maxDist = Math.max(...dayDistMap.map(d => d.distance), 1);
  const width = 500;
  const height = 180;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 25;
  const padBottom = 35;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const points = dayDistMap.map((d, i) => {
    const x = padLeft + (dayDistMap.length > 1 ? (i / (dayDistMap.length - 1)) * plotW : plotW / 2);
    const y = padTop + plotH - (d.distance / maxDist) * plotH;
    return { x, y, ...d };
  });

  // Generate smooth cubic bezier curve
  let curveD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cpX1 = p0.x + (p1.x - p0.x) / 2;
    const cpY1 = p0.y;
    const cpX2 = p0.x + (p1.x - p0.x) / 2;
    const cpY2 = p1.y;
    curveD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
  }

  const areaD = `${curveD} L ${points[points.length - 1].x} ${padTop + plotH} L ${points[0].x} ${padTop + plotH} Z`;

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
        <defs>
          <linearGradient id="cardio-dist-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
          const y = padTop + plotH * (1 - ratio);
          const val = (maxDist * ratio).toFixed(1);
          return (
            <g key={idx}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <text x={padLeft - 8} y={y + 3} textAnchor="end" fill="rgba(216,207,195,0.4)" fontSize="9" fontFamily="JetBrains Mono, monospace">
                {val}k
              </text>
            </g>
          );
        })}

        {/* Area fill under curve */}
        <path d={areaD} fill="url(#cardio-dist-grad)" />

        {/* Glow & stroke line */}
        <path d={curveD} fill="none" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" />

        {/* Data points */}
        {points.map((p, i) => {
          const isHovered = hoverIndex === i;
          return (
            <g
              key={i}
              className="cursor-pointer"
              onMouseEnter={() => setHoverIndex(i)}
              onTouchStart={() => setHoverIndex(i)}
            >
              {isHovered && (
                <line x1={p.x} y1={padTop} x2={p.x} y2={padTop + plotH} stroke="#06b6d4" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={isHovered ? 5.5 : 3.5}
                fill={isHovered ? '#22d3ee' : '#06b6d4'}
                stroke="#090605"
                strokeWidth="2"
                className="transition-all"
              />
              {/* X axis date label */}
              {(dayDistMap.length <= 7 || i % 2 === 0 || i === dayDistMap.length - 1) && (
                <text x={p.x} y={padTop + plotH + 18} textAnchor="middle" fill="rgba(216,207,195,0.5)" fontSize="8.5" fontFamily="JetBrains Mono, monospace">
                  {p.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip badge */}
      {hoverIndex !== null && points[hoverIndex] && (
        <div
          className="absolute z-20 pointer-events-none -translate-x-1/2 -top-2 bg-[#0d1620] border border-cyan-500/40 text-cyan-200 px-2.5 py-1 rounded-lg text-[10px] font-mono shadow-xl backdrop-blur-md"
          style={{
            left: `${(points[hoverIndex].x / width) * 100}%`,
          }}
        >
          <div className="font-bold text-white text-xs">{points[hoverIndex].distance.toFixed(2)} km</div>
          <div className="text-cyan-400/80">{points[hoverIndex].date} · {points[hoverIndex].count} session{points[hoverIndex].count > 1 ? 's' : ''}</div>
        </div>
      )}
    </div>
  );
}

// ─── SVG Speed / Pace Progression Curve ──────────────────
function CardioSpeedTrendChart({ activities }: { activities: CardioActivity[] }) {
  const speedPoints = useMemo(() => {
    const list = [...activities]
      .filter(a => (a.distanceKm || 0) > 0 && (a.durationSec || 0) > 0)
      .sort((a, b) => (a.startedAt?.seconds || 0) - (b.startedAt?.seconds || 0))
      .slice(-12);

    return list.map(a => {
      const spd = a.avgSpeedKmh || ((a.distanceKm / (a.durationSec / 3600)));
      return {
        date: getCardioDateStr(a),
        speed: Math.round(spd * 10) / 10,
        type: a.type,
      };
    });
  }, [activities]);

  if (speedPoints.length < 2) return null;

  const maxSpeed = Math.max(...speedPoints.map(p => p.speed), 5);
  const minSpeed = Math.max(0, Math.min(...speedPoints.map(p => p.speed)) - 1);
  const range = maxSpeed - minSpeed || 1;

  const width = 500;
  const height = 130;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 15;
  const padBottom = 25;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const pts = speedPoints.map((p, i) => ({
    x: padLeft + (i / (speedPoints.length - 1)) * plotW,
    y: padTop + plotH - ((p.speed - minSpeed) / range) * plotH,
    ...p
  }));

  let pathD = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const cpX1 = p0.x + (p1.x - p0.x) / 2;
    const cpY1 = p0.y;
    const cpX2 = p0.x + (p1.x - p0.x) / 2;
    const cpY2 = p1.y;
    pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
  }

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
        <line x1={padLeft} y1={padTop + plotH} x2={width - padRight} y2={padTop + plotH} stroke="rgba(255,255,255,0.08)" />
        <path d={pathD} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="3 3" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill="#f59e0b" stroke="#090605" strokeWidth="1.5" />
            <text x={p.x} y={padTop + plotH + 16} textAnchor="middle" fill="rgba(216,207,195,0.5)" fontSize="8" fontFamily="JetBrains Mono, monospace">
              {p.date.slice(5)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Volume Chart for Strength ──────────────────────────
function VolumeChart({ workouts }: { workouts: Workout[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const weeklyVolume: Record<string, number> = {};
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i * 7);
      const yearStart = new Date(d.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
      const weekKey = `W${weekNum.toString().padStart(2, '0')}`;
      weeklyVolume[weekKey] = 0;
    }

    for (const workout of workouts) {
      const d = new Date(workout.date);
      const yearStart = new Date(d.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
      const weekKey = `W${weekNum.toString().padStart(2, '0')}`;
      if (weekKey in weeklyVolume) {
        weeklyVolume[weekKey] += workout.volume || 0;
      }
    }

    const keys = Object.keys(weeklyVolume);
    const values = keys.map(k => weeklyVolume[k]);
    const maxVal = Math.max(...values, 1);

    const padding = { left: 45, right: 15, top: 15, bottom: 25 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const barW = Math.min(chartW / keys.length - 8, 32);

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = padding.top + (chartH / 3) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(216,207,195,0.4)';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(formatNumber(Math.round(maxVal * (1 - i / 3))), padding.left - 6, y + 3);
    }

    // Bars
    for (let i = 0; i < values.length; i++) {
      const x = padding.left + (chartW / keys.length) * i + (chartW / keys.length - barW) / 2;
      const barH = (values[i] / maxVal) * chartH;
      const y = padding.top + chartH - barH;

      const grad = ctx.createLinearGradient(x, y, x, padding.top + chartH);
      grad.addColorStop(0, '#EB593C');
      grad.addColorStop(1, 'rgba(235,89,60,0.25)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
      ctx.fill();

      ctx.fillStyle = 'rgba(216,207,195,0.5)';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(keys[i], x + barW / 2, padding.top + chartH + 16);
    }
  }, [workouts]);

  return <canvas ref={canvasRef} className="w-full" style={{ height: '180px' }} />;
}

// ─── Unified 12-Week Activity Heatmap (Strength + Cardio) ──────────
function UnifiedHeatmap({ workouts, cardio }: { workouts: Workout[]; cardio: CardioActivity[] }) {
  const weeks = 12;
  const today = new Date();
  const cells: { date: string; strength: number; cardio: number; isToday: boolean }[] = [];

  const strengthMap: Record<string, number> = {};
  for (const w of workouts) {
    strengthMap[w.date] = (strengthMap[w.date] || 0) + 1;
  }

  const cardioMap: Record<string, number> = {};
  for (const c of cardio) {
    const k = getCardioDateStr(c);
    cardioMap[k] = (cardioMap[k] || 0) + 1;
  }

  const startDate = new Date(today);
  startDate.setDate(today.getDate() - weeks * 7 + (7 - today.getDay()));

  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr = toDateKey(d);
    const todayStr = toDateKey(today);
    cells.push({
      date: dateStr,
      strength: strengthMap[dateStr] || 0,
      cardio: cardioMap[dateStr] || 0,
      isToday: dateStr === todayStr,
    });
  }

  const columns: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    columns.push(cells.slice(i, i + 7));
  }

  return (
    <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {columns.map((col, ci) => (
        <div key={ci} className="flex flex-col gap-1">
          {col.map((cell, ri) => {
            const hasStrength = cell.strength > 0;
            const hasCardio = cell.cardio > 0;
            return (
              <div
                key={ri}
                title={`${cell.date}: ${cell.strength} strength, ${cell.cardio} cardio`}
                className={`w-3.5 h-3.5 rounded-sm transition-all ${
                  cell.isToday ? 'ring-1 ring-amber-400 ring-offset-1 ring-offset-ink' : ''
                } ${
                  hasStrength && hasCardio ? 'bg-gradient-to-br from-sienna to-cyan-400' :
                  hasStrength ? 'bg-sienna' :
                  hasCardio ? 'bg-cyan-500' :
                  'bg-line/40'
                }`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Main Progress & Merged Calendar Page Component ───────────────────
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
  const [activeCategory, setActiveCategory] = useState<'overview' | 'cardio' | 'strength' | 'body'>('overview');
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

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
  const { data: allWorkouts = [], isLoading: isLoadingWorkouts } = useQuery({
    queryKey: ['allWorkouts', profile?.uid],
    queryFn: () => getUserWorkouts(profile!.uid, 500),
    enabled: !!profile?.uid,
  });

  // 2. Fetch user cardio activities
  const { data: allCardio = [], isLoading: isLoadingCardio } = useQuery({
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

  // ─── Time-range Filtered Activities for Overall Progress ───
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

  // ─── Cardio KPIs Calculation ───────────────────────────
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
    const avgPaceStr = totalDist > 0 ? `${paceMin}:${paceRemSec.toString().padStart(2, '0')}` : '—';

    // Type Breakdown
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

      // Fastest Pace (runs or walks over 0.5km)
      if (dist >= 0.5 && dur > 0) {
        const paceSec = dur / dist;
        const currentBestPaceSec = fastestPace
          ? (fastestPace.movingDurationSec || fastestPace.durationSec) / fastestPace.distanceKm
          : Infinity;
        if (paceSec < currentBestPaceSec && paceSec >= 120) { // realistic > 2min/km
          fastestPace = c;
        }
      }

      // Max Speed
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

  // ─── Horizontal Week Date Strip Calculation ────────────
  const weekDays = useMemo(() => {
    const today = new Date();
    const current = new Date(today);
    current.setDate(today.getDate() + weekOffset * 7);

    // Start week on Monday
    const dayOfWeek = current.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(current);
    monday.setDate(current.getDate() - diffToMonday);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = toDateKey(d);
      const todayStr = toDateKey(new Date());

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

  // ─── Month Calendar Grid Calculation ───────────────────
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

  // Day navigation helpers
  const handlePrevDay = () => {
    if (!selectedDate) return;
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDate(toDateKey(d));
  };

  const handleNextDay = () => {
    if (!selectedDate) return;
    const d = new Date(selectedDate + 'T00:00:00');
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

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  if (!profile || !stats) return null;

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

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="max-w-4xl mx-auto space-y-5 pb-20">
      
      {/* ─── Page Header & Athlete Level Banner ───────────────── */}
      <motion.div variants={item} className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-sienna text-[10px] tracking-widest uppercase font-bold flex items-center gap-1.5">
              <Sparkles size={12} className="text-amber-400" /> APPARATUS ATHLETICS
            </div>
            <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-bone font-black mt-0.5">
              Progress & Log
            </h1>
          </div>

          {/* Quick Month View Toggle Button */}
          <button
            onClick={() => setIsMonthViewOpen(!isMonthViewOpen)}
            className={`px-3 py-1.5 rounded-full text-xs font-mono font-bold flex items-center gap-1.5 border transition-all ${
              isMonthViewOpen
                ? 'bg-sienna border-sienna text-white shadow-[0_0_12px_rgba(235,89,60,0.4)]'
                : 'bg-ink-2/80 border-line/60 text-bone-dim hover:text-bone hover:border-line'
            }`}
          >
            <CalIcon size={14} />
            <span>Month</span>
            {isMonthViewOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* Compact Level XP Bar */}
        <div className="bg-ink-2/90 border border-line/60 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-sm backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 font-mono font-bold text-xs">
              L{level}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold font-sans text-bone">Athlete Level {level}</span>
              <span className="text-[10px] font-mono text-bone-dim">{levelXp} / 500 XP</span>
            </div>
          </div>
          <div className="w-32 sm:w-48 h-2 bg-ink rounded-full overflow-hidden border border-line/40">
            <motion.div
              className="h-full bg-gradient-to-r from-sienna to-amber-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${levelProgress}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </div>
      </motion.div>

      {/* ─── Interactive Calendar Navigation Deck ───────────────── */}
      <motion.div variants={item} className="bg-ink-2/80 border border-line/60 rounded-3xl p-3.5 sm:p-4 shadow-sm backdrop-blur-md">
        
        {/* Top Control Bar: Overall Pill, Week Slider, Month Grid */}
        <div className="flex items-center justify-between gap-2 mb-3">
          {/* Overall Progress Reset Pill */}
          <button
            onClick={() => setSelectedDate(null)}
            className={`px-3.5 py-1.5 rounded-full font-mono text-xs font-bold transition-all flex items-center gap-1.5 ${
              selectedDate === null
                ? 'bg-gradient-to-r from-sienna to-amber-500 text-white shadow-md'
                : 'bg-ink border border-line/60 text-bone-dim hover:text-bone'
            }`}
          >
            <Activity size={12} />
            <span>Overall</span>
          </button>

          {/* Week Offset Slider Controls */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setWeekOffset(w => w - 1)}
              className="w-7 h-7 rounded-full bg-ink border border-line/60 flex items-center justify-center text-bone-dim hover:text-bone hover:border-line transition-all"
              title="Previous Week"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              onClick={() => setWeekOffset(0)}
              className="px-2.5 py-1 rounded-full bg-ink border border-line/50 text-[10px] font-mono text-bone-dim hover:text-bone transition-all"
            >
              Current
            </button>
            <button
              onClick={() => setWeekOffset(w => w + 1)}
              className="w-7 h-7 rounded-full bg-ink border border-line/60 flex items-center justify-center text-bone-dim hover:text-bone hover:border-line transition-all"
              title="Next Week"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        {/* Horizontal Weekly Day Selector Pills (Designed like Apple / Modern Fitness UI) */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {weekDays.map(day => {
            const isSelected = selectedDate === day.dateStr;
            return (
              <button
                key={day.dateStr}
                onClick={() => setSelectedDate(isSelected ? null : day.dateStr)}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all relative select-none ${
                  isSelected
                    ? 'bg-gradient-to-b from-[#EB593C] to-[#C84A31] text-white shadow-[0_4px_16px_rgba(235,89,60,0.4)] scale-[1.02] border border-white/20'
                    : day.isToday
                    ? 'bg-amber-500/10 border border-amber-500/40 text-amber-300'
                    : 'bg-ink/70 border border-line/40 text-bone hover:border-line/80'
                }`}
              >
                <span className={`text-[10px] font-mono uppercase tracking-wider mb-0.5 ${isSelected ? 'text-white/80' : 'text-bone-dim'}`}>
                  {day.dayName}
                </span>
                <span className="font-mono text-base font-black">
                  {day.dayNum}
                </span>

                {/* Dot Indicators */}
                <div className="flex items-center gap-1 mt-1 h-1.5">
                  {day.hasWorkout && (
                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-sienna'}`} title="Strength Workout" />
                  )}
                  {day.hasCardio && (
                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-cyan-200' : 'bg-cyan-400'}`} title="Cardio Session" />
                  )}
                  {day.hasEvent && (
                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-amber-200' : 'bg-amber-400'}`} title="Registered Event" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Collapsible Month Calendar Drawer */}
        <AnimatePresence>
          {isMonthViewOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden pt-4 mt-3 border-t border-line/60"
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <button
                  onClick={() => {
                    if (calendarMonth === 0) {
                      setCalendarMonth(11);
                      setCalendarYear(y => y - 1);
                    } else {
                      setCalendarMonth(m => m - 1);
                    }
                  }}
                  className="p-1.5 rounded-lg bg-ink border border-line/60 text-bone-dim hover:text-bone"
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="font-display text-sm tracking-wider font-bold">
                  {MONTH_NAMES[calendarMonth]} {calendarYear}
                </div>
                <button
                  onClick={() => {
                    if (calendarMonth === 11) {
                      setCalendarMonth(0);
                      setCalendarYear(y => y + 1);
                    } else {
                      setCalendarMonth(m => m + 1);
                    }
                  }}
                  className="p-1.5 rounded-lg bg-ink border border-line/60 text-bone-dim hover:text-bone"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Month Weekdays */}
              <div className="grid grid-cols-7 gap-1 text-center font-mono text-[9px] text-bone-dim tracking-wider mb-1">
                {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(w => (
                  <div key={w} className="py-0.5">{w}</div>
                ))}
              </div>

              {/* Month Grid Cells */}
              <div className="grid grid-cols-7 gap-1">
                {monthCells.map((cell, idx) => {
                  if (cell.day === null) return <div key={idx} className="aspect-square" />;
                  const isSelected = selectedDate === cell.dateStr;
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedDate(isSelected ? null : cell.dateStr);
                        setIsMonthViewOpen(false); // smoothly collapse on select
                      }}
                      className={`aspect-square rounded-xl flex flex-col items-center justify-center font-mono text-xs relative transition-all ${
                        isSelected
                          ? 'bg-gradient-to-b from-[#EB593C] to-[#C84A31] text-white font-bold shadow-md'
                          : cell.isToday
                          ? 'bg-amber-500/15 text-amber-300 font-bold border border-amber-500/40'
                          : 'bg-ink/60 border border-line/30 text-bone hover:border-line'
                      }`}
                    >
                      {cell.day}
                      <div className="flex gap-0.5 absolute bottom-1">
                        {cell.hasWorkout && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-sienna'}`} />}
                        {cell.hasCardio && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-cyan-200' : 'bg-cyan-400'}`} />}
                        {cell.hasEvent && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-amber-200' : 'bg-amber-400'}`} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ─── SPECIFIC DAY DETAIL VIEW (When a date is clicked) ─── */}
      {selectedDate !== null ? (
        <motion.div
          key={selectedDate}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Day Navigation Banner */}
          <div className="bg-ink-2/90 border border-line/60 rounded-3xl p-4 flex items-center justify-between gap-3 shadow-sm backdrop-blur-md">
            <button
              onClick={() => setSelectedDate(null)}
              className="px-3 py-1.5 rounded-full bg-ink border border-line text-xs font-mono font-bold text-bone-dim hover:text-bone flex items-center gap-1.5 transition-all"
            >
              <ArrowLeft size={13} /> All Progress
            </button>

            <div className="text-center flex-1 min-w-0">
              <div className="text-[10px] font-mono text-sienna uppercase font-bold tracking-widest">
                {selectedDate === toDateKey(new Date()) ? 'TODAY' : 'DAY LOG'}
              </div>
              <h2 className="font-display text-base sm:text-lg font-bold truncate text-bone">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </h2>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevDay}
                className="w-8 h-8 rounded-full bg-ink border border-line/60 flex items-center justify-center text-bone-dim hover:text-bone transition-all"
                title="Previous Day"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={handleNextDay}
                className="w-8 h-8 rounded-full bg-ink border border-line/60 flex items-center justify-center text-bone-dim hover:text-bone transition-all"
                title="Next Day"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Daily Quick KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="card p-3 text-center">
              <div className="text-[10px] font-mono text-bone-dim uppercase tracking-wider mb-0.5">Strength Vol</div>
              <div className="font-mono text-lg font-black text-amber-400">
                {formatNumber(selectedDayWorkouts.reduce((s, w) => s + (w.volume || 0), 0))} <span className="text-[10px] font-normal text-bone-dim">kg</span>
              </div>
            </div>
            <div className="card p-3 text-center">
              <div className="text-[10px] font-mono text-bone-dim uppercase tracking-wider mb-0.5">Cardio Dist</div>
              <div className="font-mono text-lg font-black text-cyan-400">
                {selectedDayCardio.reduce((s, c) => s + (c.distanceKm || 0), 0).toFixed(2)} <span className="text-[10px] font-normal text-bone-dim">km</span>
              </div>
            </div>
            <div className="card p-3 text-center">
              <div className="text-[10px] font-mono text-bone-dim uppercase tracking-wider mb-0.5">Active Time</div>
              <div className="font-mono text-lg font-black text-white">
                {formatDurationSec(
                  selectedDayWorkouts.reduce((s, w) => s + (w.durationMin || 0) * 60, 0) +
                  selectedDayCardio.reduce((s, c) => s + (c.movingDurationSec || c.durationSec || 0), 0)
                )}
              </div>
            </div>
            <div className="card p-3 text-center">
              <div className="text-[10px] font-mono text-bone-dim uppercase tracking-wider mb-0.5">Calories</div>
              <div className="font-mono text-lg font-black text-rose-400">
                {selectedDayWorkouts.reduce((s, w) => s + (w.calories || 0), 0) +
                 selectedDayCardio.reduce((s, c) => s + (c.calories || 0), 0)} <span className="text-[10px] font-normal text-bone-dim">kcal</span>
              </div>
            </div>
          </div>

          {/* CARDIO SESSIONS ON THIS DAY */}
          {selectedDayCardio.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 font-display text-sm uppercase tracking-wider text-cyan-400">
                <Footprints size={16} /> Cardio Activities ({selectedDayCardio.length})
              </div>
              {selectedDayCardio.map((c, idx) => (
                <div key={idx} className="bg-ink-2/90 border border-cyan-500/20 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                        {c.type === 'run' ? <Flame size={18} /> : c.type === 'cycle' ? <Bike size={18} /> : <Footprints size={18} />}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-bone uppercase tracking-wide">
                          {c.type} Session
                        </div>
                        <div className="text-[10px] font-mono text-bone-dim">
                          {c.startedAt?.seconds ? format(new Date(c.startedAt.seconds * 1000), 'h:mm a') : 'Completed'}
                        </div>
                      </div>
                    </div>

                    <button
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
                      className="px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono text-xs font-bold flex items-center gap-1.5 hover:bg-cyan-500/20 transition-all shadow-sm"
                    >
                      <Share2 size={13} /> Share Story
                    </button>
                  </div>

                  {/* Cardio Metrics Grid */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 py-3 border-y border-line/40 text-center">
                    <div>
                      <div className="text-[9px] font-mono text-bone-dim uppercase">Distance</div>
                      <div className="font-mono text-base font-black text-cyan-300">{c.distanceKm.toFixed(2)} km</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-mono text-bone-dim uppercase">Duration</div>
                      <div className="font-mono text-base font-black text-white">{formatDurationSec(c.movingDurationSec || c.durationSec)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-mono text-bone-dim uppercase">Pace</div>
                      <div className="font-mono text-base font-black text-white">{c.avgPace.replace(' /km', '')}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-mono text-bone-dim uppercase">Avg Spd</div>
                      <div className="font-mono text-base font-black text-amber-300">{c.avgSpeedKmh?.toFixed(1) || '—'} <span className="text-[9px]">kph</span></div>
                    </div>
                    <div>
                      <div className="text-[9px] font-mono text-bone-dim uppercase">Calories</div>
                      <div className="font-mono text-base font-black text-rose-400">{c.calories || 0}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-mono text-bone-dim uppercase">Elevation</div>
                      <div className="font-mono text-base font-black text-emerald-400">{c.elevationGainM || 0}m</div>
                    </div>
                  </div>

                  {/* Route Map Preview */}
                  {c.route && c.route.length > 1 && (
                    <div className="w-full h-44 rounded-2xl overflow-hidden relative border border-line/40 shadow-inner">
                      <RouteMap
                        route={c.route}
                        theme="dark"
                        height="100%"
                        fitToContainer
                        showZoomControls={false}
                        cardioType={c.type}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* STRENGTH WORKOUTS ON THIS DAY */}
          {selectedDayWorkouts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 font-display text-sm uppercase tracking-wider text-sienna">
                <Dumbbell size={16} /> Strength Workouts ({selectedDayWorkouts.length})
              </div>
              {selectedDayWorkouts.map((w, idx) => (
                <div key={idx} className="bg-ink-2/90 border border-sienna/20 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-base text-bone">{w.planTitle || 'Workout'}</div>
                      <div className="text-xs font-mono text-sienna">{w.dayTitle || 'Training Session'}</div>
                    </div>
                    <span className="font-mono text-[10px] text-bone-dim bg-ink px-2.5 py-1 rounded-full border border-line/40">
                      {w.exercises?.length || 0} exercises
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 border-y border-line/30 text-center">
                    <div>
                      <div className="text-[9px] font-mono text-bone-dim uppercase">Duration</div>
                      <div className="font-mono text-sm font-bold text-white">{w.durationMin || 0} min</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-mono text-bone-dim uppercase">Volume</div>
                      <div className="font-mono text-sm font-bold text-amber-400">{formatNumber(w.volume || 0)} kg</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-mono text-bone-dim uppercase">Calories</div>
                      <div className="font-mono text-sm font-bold text-rose-400">{w.calories || 0} kcal</div>
                    </div>
                  </div>

                  {/* Exercises Details */}
                  {w.exercises && w.exercises.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {w.exercises.map((ex, exIdx) => {
                        const completedSets = ex.sets?.filter(s => s.completed !== false) || [];
                        return (
                          <div key={exIdx} className="bg-ink p-2.5 rounded-xl border border-line/30 flex items-center justify-between text-xs">
                            <span className="font-bold text-bone truncate mr-2">{ex.name}</span>
                            <span className="font-mono text-[11px] text-amber-400 shrink-0">
                              {completedSets.map(s => `${s.reps || s.seconds || 0}${s.seconds ? 's' : ''}${s.weight ? `@${s.weight}kg` : ''}`).join(', ') || 'No sets'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* REGISTERED EVENTS ON THIS DAY */}
          {selectedDayEvents.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 font-display text-sm uppercase tracking-wider text-amber-400">
                <MapPin size={16} /> Community Events ({selectedDayEvents.length})
              </div>
              {selectedDayEvents.map(e => (
                <div key={e.id} className="card p-4 space-y-1.5 border-amber-500/20">
                  <div className="font-bold text-sm text-bone">{e.title}</div>
                  <div className="flex items-center gap-2 text-xs text-bone-dim font-mono">
                    <CalIcon size={12} />
                    {e.dateTime?.start?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="text-xs text-bone-dim font-mono truncate">{e.location?.venueName}</div>
                </div>
              ))}
            </div>
          )}

          {/* EMPTY STATE IF NOTHING LOGGED */}
          {selectedDayWorkouts.length === 0 && selectedDayCardio.length === 0 && selectedDayEvents.length === 0 && (
            <div className="card p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-ink border border-line/60 flex items-center justify-center mx-auto text-bone-dim">
                <CalIcon size={24} />
              </div>
              <h3 className="font-display text-base font-bold text-bone">Rest Day / No Activities Logged</h3>
              <p className="text-xs text-bone-dim max-w-sm mx-auto">
                No workouts or cardio sessions recorded on this date. Take rest or log past training.
              </p>
            </div>
          )}
        </motion.div>
      ) : (
        /* ─── OVERALL PROGRESS VIEW (Default) ──────────────────── */
        <motion.div variants={item} className="space-y-5">
          
          {/* Top Control Bar: Category Switcher & Timeframe Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Category Tabs */}
            <div className="flex bg-ink-2 p-1 rounded-2xl border border-line/60 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[
                { id: 'overview', label: 'Overview', icon: Activity },
                { id: 'cardio', label: 'Cardio', icon: Footprints },
                { id: 'strength', label: 'Strength', icon: Dumbbell },
                { id: 'body', label: 'Body Log', icon: Trophy },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveCategory(tab.id as any)}
                  className={`flex-1 min-w-[75px] py-1.5 px-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeCategory === tab.id
                      ? 'bg-sienna text-white shadow-sm'
                      : 'text-bone-dim hover:text-bone'
                  }`}
                >
                  <tab.icon size={13} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Timeframe Chips */}
            <div className="flex bg-ink p-1 rounded-xl border border-line/40 self-end sm:self-auto">
              {(['7d', '30d', '90d', 'all'] as const).map(tf => (
                <button
                  key={tf}
                  onClick={() => setTimeRange(tf)}
                  className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold uppercase transition-all ${
                    timeRange === tf ? 'bg-line/60 text-white shadow-xs' : 'text-bone-dim hover:text-bone'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* ─── OVERALL / COMBINED HERO METRICS ──────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-4 text-center">
              <div className="text-sienna mb-1.5 flex justify-center"><Dumbbell size={18} /></div>
              <div className="text-2xl font-bold font-mono text-bone">{filteredWorkouts.length}</div>
              <div className="font-mono text-[9px] text-bone-dim tracking-wider uppercase mt-0.5">Strength Sessions</div>
            </div>

            <div className="card p-4 text-center">
              <div className="text-cyan-400 mb-1.5 flex justify-center"><Footprints size={18} /></div>
              <div className="text-2xl font-bold font-mono text-cyan-300">{cardioKPIs.totalDist.toFixed(1)} <span className="text-xs">km</span></div>
              <div className="font-mono text-[9px] text-bone-dim tracking-wider uppercase mt-0.5">Cardio Distance</div>
            </div>

            <div className="card p-4 text-center">
              <div className="text-amber mb-1.5 flex justify-center"><TrendingUp size={18} /></div>
              <div className="text-2xl font-bold font-mono text-amber-300">{formatNumber(filteredWorkouts.reduce((s, w) => s + (w.volume || 0), 0))}</div>
              <div className="font-mono text-[9px] text-bone-dim tracking-wider uppercase mt-0.5">Volume (kg)</div>
            </div>

            <div className="card p-4 text-center">
              <div className="text-rose-400 mb-1.5 flex justify-center"><Flame size={18} /></div>
              <div className="text-2xl font-bold font-mono text-rose-300">
                {formatNumber(filteredWorkouts.reduce((s, w) => s + (w.calories || 0), 0) + cardioKPIs.totalCal)}
              </div>
              <div className="font-mono text-[9px] text-bone-dim tracking-wider uppercase mt-0.5">Total Calories</div>
            </div>
          </div>

          {/* ─── STREAKS CARD ─────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-3.5 text-center">
              <div className="text-3xl font-bold font-mono text-amber flex items-center justify-center gap-1.5">
                <Flame size={22} className="text-amber-500 animate-pulse" /> {stats.currentStreak}
              </div>
              <div className="font-mono text-[10px] text-bone-dim tracking-wider uppercase mt-0.5">Current Streak</div>
            </div>
            <div className="card p-3.5 text-center">
              <div className="text-3xl font-bold font-mono text-sienna">{stats.longestStreak}</div>
              <div className="font-mono text-[10px] text-bone-dim tracking-wider uppercase mt-0.5">Longest Streak</div>
            </div>
          </div>

          {/* ─── TAB 1: CARDIO SECTION (Full Suite of KPIs, Graphs, PRs) ─── */}
          {(activeCategory === 'cardio' || activeCategory === 'overview') && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-5 rounded-full bg-cyan-400" />
                  <h2 className="font-display text-lg tracking-wide uppercase text-bone font-bold">
                    Cardio Telemetry & Progress
                  </h2>
                </div>
                <span className="font-mono text-xs text-cyan-400 font-bold">
                  {cardioKPIs.totalSessions} Sessions Logged
                </span>
              </div>

              {/* Comprehensive Cardio KPI Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-ink-2/90 border border-cyan-500/20 rounded-2xl p-3.5 text-center shadow-sm">
                  <div className="text-[10px] font-mono text-bone-dim uppercase tracking-wider mb-1">Total Distance</div>
                  <div className="font-mono text-xl sm:text-2xl font-black text-cyan-300">
                    {cardioKPIs.totalDist.toFixed(2)} <span className="text-xs font-normal text-cyan-400/80">km</span>
                  </div>
                </div>

                <div className="bg-ink-2/90 border border-cyan-500/20 rounded-2xl p-3.5 text-center shadow-sm">
                  <div className="text-[10px] font-mono text-bone-dim uppercase tracking-wider mb-1">Moving Time</div>
                  <div className="font-mono text-xl sm:text-2xl font-black text-white">
                    {formatDurationSec(cardioKPIs.totalSec)}
                  </div>
                </div>

                <div className="bg-ink-2/90 border border-cyan-500/20 rounded-2xl p-3.5 text-center shadow-sm">
                  <div className="text-[10px] font-mono text-bone-dim uppercase tracking-wider mb-1">Avg Speed</div>
                  <div className="font-mono text-xl sm:text-2xl font-black text-amber-300">
                    {cardioKPIs.avgSpeed.toFixed(1)} <span className="text-xs font-normal text-amber-400/80">km/h</span>
                  </div>
                </div>

                <div className="bg-ink-2/90 border border-cyan-500/20 rounded-2xl p-3.5 text-center shadow-sm">
                  <div className="text-[10px] font-mono text-bone-dim uppercase tracking-wider mb-1">Avg Pace</div>
                  <div className="font-mono text-xl sm:text-2xl font-black text-white">
                    {cardioKPIs.avgPaceStr} <span className="text-xs font-normal text-white/60">/km</span>
                  </div>
                </div>

                <div className="bg-ink-2/90 border border-cyan-500/20 rounded-2xl p-3.5 text-center shadow-sm">
                  <div className="text-[10px] font-mono text-bone-dim uppercase tracking-wider mb-1">Calories Burned</div>
                  <div className="font-mono text-xl sm:text-2xl font-black text-rose-400">
                    {formatNumber(cardioKPIs.totalCal)} <span className="text-xs font-normal text-rose-400/80">kcal</span>
                  </div>
                </div>

                <div className="bg-ink-2/90 border border-cyan-500/20 rounded-2xl p-3.5 text-center shadow-sm">
                  <div className="text-[10px] font-mono text-bone-dim uppercase tracking-wider mb-1">Elevation Gain</div>
                  <div className="font-mono text-xl sm:text-2xl font-black text-emerald-400">
                    {cardioKPIs.totalElev} <span className="text-xs font-normal text-emerald-400/80">m</span>
                  </div>
                </div>

                <div className="bg-ink-2/90 border border-cyan-500/20 rounded-2xl p-3.5 text-center shadow-sm">
                  <div className="text-[10px] font-mono text-bone-dim uppercase tracking-wider mb-1">Total Steps</div>
                  <div className="font-mono text-xl sm:text-2xl font-black text-cyan-200">
                    {formatNumber(cardioKPIs.totalSteps)}
                  </div>
                </div>

                <div className="bg-ink-2/90 border border-cyan-500/20 rounded-2xl p-3.5 text-center shadow-sm">
                  <div className="text-[10px] font-mono text-bone-dim uppercase tracking-wider mb-1">Activities</div>
                  <div className="font-mono text-xl sm:text-2xl font-black text-bone">
                    {cardioKPIs.totalSessions}
                  </div>
                </div>
              </div>

              {/* Activity Breakdown (Walk vs Run vs Cycle) */}
              <div className="card p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-mono text-bone-dim uppercase">
                  <span>Activity Distribution</span>
                  <span>{cardioKPIs.totalDist.toFixed(1)} km Total</span>
                </div>

                {/* Progress bar split */}
                <div className="h-2.5 w-full bg-ink rounded-full overflow-hidden flex border border-line/40">
                  {cardioKPIs.totalDist > 0 ? (
                    <>
                      <div
                        style={{ width: `${(cardioKPIs.runDist / cardioKPIs.totalDist) * 100}%` }}
                        className="bg-cyan-500 h-full"
                        title={`Run: ${cardioKPIs.runDist.toFixed(1)}km`}
                      />
                      <div
                        style={{ width: `${(cardioKPIs.cycleDist / cardioKPIs.totalDist) * 100}%` }}
                        className="bg-amber-500 h-full"
                        title={`Cycle: ${cardioKPIs.cycleDist.toFixed(1)}km`}
                      />
                      <div
                        style={{ width: `${(cardioKPIs.walkDist / cardioKPIs.totalDist) * 100}%` }}
                        className="bg-emerald-500 h-full"
                        title={`Walk: ${cardioKPIs.walkDist.toFixed(1)}km`}
                      />
                    </>
                  ) : (
                    <div className="w-full bg-line/40 h-full" />
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono">
                  <div className="bg-ink/60 p-2.5 rounded-xl border border-cyan-500/20">
                    <div className="text-cyan-400 flex items-center justify-center gap-1 text-xs font-bold mb-0.5">
                      <Flame size={13} /> Runs ({cardioKPIs.runsCount})
                    </div>
                    <div className="text-sm font-bold text-bone">{cardioKPIs.runDist.toFixed(1)} km</div>
                  </div>

                  <div className="bg-ink/60 p-2.5 rounded-xl border border-amber-500/20">
                    <div className="text-amber-400 flex items-center justify-center gap-1 text-xs font-bold mb-0.5">
                      <Bike size={13} /> Cycles ({cardioKPIs.cyclesCount})
                    </div>
                    <div className="text-sm font-bold text-bone">{cardioKPIs.cycleDist.toFixed(1)} km</div>
                  </div>

                  <div className="bg-ink/60 p-2.5 rounded-xl border border-emerald-500/20">
                    <div className="text-emerald-400 flex items-center justify-center gap-1 text-xs font-bold mb-0.5">
                      <Footprints size={13} /> Walks ({cardioKPIs.walksCount})
                    </div>
                    <div className="text-sm font-bold text-bone">{cardioKPIs.walkDist.toFixed(1)} km</div>
                  </div>
                </div>
              </div>

              {/* Cardio Distance Progression Chart */}
              <div className="card p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold flex items-center gap-2 text-cyan-400">
                    <TrendingUp size={16} /> Distance Progression (km)
                  </h3>
                  <span className="text-[10px] font-mono text-bone-dim">Daily Trend</span>
                </div>
                <CardioDistanceChart activities={filteredCardio} />
              </div>

              {/* Cardio Speed Curve */}
              {filteredCardio.length >= 2 && (
                <div className="card p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-bold flex items-center gap-2 text-amber-400">
                      <Gauge size={16} /> Speed Progression (km/h)
                    </h3>
                    <span className="text-[10px] font-mono text-bone-dim">Recent Sessions</span>
                  </div>
                  <CardioSpeedTrendChart activities={filteredCardio} />
                </div>
              )}

              {/* Cardio Personal Records (PRs) */}
              <div className="card p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-2 font-display text-sm uppercase tracking-wide text-amber-400 font-bold">
                  <Trophy size={16} /> Cardio Personal Records (All Time)
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                  {cardioPRs.maxDist && (
                    <div className="bg-ink/80 p-3 rounded-2xl border border-cyan-500/30 space-y-1">
                      <div className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider font-bold flex items-center gap-1">
                        <Award size={12} /> Longest Distance
                      </div>
                      <div className="font-mono text-xl font-black text-white">
                        {cardioPRs.maxDist.distanceKm.toFixed(2)} <span className="text-xs font-normal text-white/60">km</span>
                      </div>
                      <div className="text-[9px] font-mono text-bone-dim">
                        {getCardioDateStr(cardioPRs.maxDist)} · {cardioPRs.maxDist.type.toUpperCase()}
                      </div>
                    </div>
                  )}

                  {cardioPRs.fastestPace && (
                    <div className="bg-ink/80 p-3 rounded-2xl border border-amber-500/30 space-y-1">
                      <div className="text-[9px] font-mono text-amber-400 uppercase tracking-wider font-bold flex items-center gap-1">
                        <Timer size={12} /> Best Pace
                      </div>
                      <div className="font-mono text-xl font-black text-white">
                        {cardioPRs.fastestPace.avgPace.replace(' /km', '')} <span className="text-xs font-normal text-white/60">/km</span>
                      </div>
                      <div className="text-[9px] font-mono text-bone-dim">
                        {getCardioDateStr(cardioPRs.fastestPace)} · {cardioPRs.fastestPace.type.toUpperCase()}
                      </div>
                    </div>
                  )}

                  {cardioPRs.maxSpeed && (
                    <div className="bg-ink/80 p-3 rounded-2xl border border-emerald-500/30 space-y-1">
                      <div className="text-[9px] font-mono text-emerald-400 uppercase tracking-wider font-bold flex items-center gap-1">
                        <Gauge size={12} /> Top Avg Speed
                      </div>
                      <div className="font-mono text-xl font-black text-white">
                        {cardioPRs.maxSpeed.avgSpeedKmh?.toFixed(1) || '—'} <span className="text-xs font-normal text-white/60">km/h</span>
                      </div>
                      <div className="text-[9px] font-mono text-bone-dim">
                        {getCardioDateStr(cardioPRs.maxSpeed)} · {cardioPRs.maxSpeed.type.toUpperCase()}
                      </div>
                    </div>
                  )}

                  {cardioPRs.longestDur && (
                    <div className="bg-ink/80 p-3 rounded-2xl border border-line/50 space-y-1">
                      <div className="text-[9px] font-mono text-bone-dim uppercase tracking-wider font-bold flex items-center gap-1">
                        <Clock size={12} /> Longest Session
                      </div>
                      <div className="font-mono text-xl font-black text-white">
                        {formatDurationSec(cardioPRs.longestDur.movingDurationSec || cardioPRs.longestDur.durationSec)}
                      </div>
                      <div className="text-[9px] font-mono text-bone-dim">
                        {getCardioDateStr(cardioPRs.longestDur)} · {cardioPRs.longestDur.type.toUpperCase()}
                      </div>
                    </div>
                  )}

                  {cardioPRs.maxCal && (
                    <div className="bg-ink/80 p-3 rounded-2xl border border-rose-500/30 space-y-1">
                      <div className="text-[9px] font-mono text-rose-400 uppercase tracking-wider font-bold flex items-center gap-1">
                        <Flame size={12} /> Most Calories
                      </div>
                      <div className="font-mono text-xl font-black text-rose-300">
                        {cardioPRs.maxCal.calories} <span className="text-xs font-normal text-rose-400/70">kcal</span>
                      </div>
                      <div className="text-[9px] font-mono text-bone-dim">
                        {getCardioDateStr(cardioPRs.maxCal)}
                      </div>
                    </div>
                  )}

                  {cardioPRs.maxElev && (
                    <div className="bg-ink/80 p-3 rounded-2xl border border-cyan-500/30 space-y-1">
                      <div className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider font-bold flex items-center gap-1">
                        <Mountain size={12} /> Max Elevation
                      </div>
                      <div className="font-mono text-xl font-black text-white">
                        {cardioPRs.maxElev.elevationGainM} <span className="text-xs font-normal text-white/60">m</span>
                      </div>
                      <div className="text-[9px] font-mono text-bone-dim">
                        {getCardioDateStr(cardioPRs.maxElev)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── TAB 2: STRENGTH SECTION (Volume Trends, PRs) ───── */}
          {(activeCategory === 'strength' || activeCategory === 'overview') && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-5 rounded-full bg-sienna" />
                  <h2 className="font-display text-lg tracking-wide uppercase text-bone font-bold">
                    Strength & Hypertrophy
                  </h2>
                </div>
                <span className="font-mono text-xs text-sienna font-bold">
                  {filteredWorkouts.length} Workouts Logged
                </span>
              </div>

              {/* Weekly Volume Canvas Chart */}
              <div className="card p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold flex items-center gap-2 text-sienna">
                    <TrendingUp size={16} /> Weekly Training Volume (kg·reps)
                  </h3>
                  <span className="text-[10px] font-mono text-bone-dim">8-Week Trend</span>
                </div>
                <VolumeChart workouts={filteredWorkouts} />
              </div>

              {/* Strength PRs */}
              <div className="card p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-2 font-display text-sm uppercase tracking-wide text-amber-400 font-bold">
                  <Trophy size={16} /> Exercise Personal Records
                </div>
                {strengthPRs.length === 0 ? (
                  <div className="text-center text-bone-dim text-xs py-8 border border-dashed border-line/40 rounded-xl">
                    No strength PRs recorded yet. Start logging weighted sets to view PRs!
                  </div>
                ) : (
                  <div className="space-y-2">
                    {strengthPRs.map(([name, data]) => (
                      <div key={name} className="flex items-center justify-between p-3 bg-ink rounded-xl border border-line/40 shadow-xs">
                        <div>
                          <div className="text-sm font-bold text-bone">{name}</div>
                          <div className="font-mono text-[10px] text-bone-dim">{data.date}</div>
                        </div>
                        <div className="flex gap-4 text-right">
                          {data.maxWeight > 0 && (
                            <div>
                              <div className="font-mono text-sienna font-bold">{data.maxWeight} kg</div>
                              <div className="font-mono text-[9px] text-bone-dim">BEST WEIGHT</div>
                            </div>
                          )}
                          {data.maxReps > 0 && (
                            <div>
                              <div className="font-mono text-amber font-bold">{data.maxReps}</div>
                              <div className="font-mono text-[9px] text-bone-dim">BEST REPS</div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── TAB 3: 12-WEEK UNIFIED ACTIVITY HEATMAP ──────────── */}
          {(activeCategory === 'overview') && (
            <div className="card p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-bone">Activity Heatmap — Last 12 Weeks</h3>
                <div className="flex items-center gap-2 text-[10px] font-mono text-bone-dim">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-xs bg-sienna" /> Strength</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-xs bg-cyan-400" /> Cardio</span>
                </div>
              </div>
              <UnifiedHeatmap workouts={allWorkouts} cardio={allCardio} />
            </div>
          )}

          {/* ─── TAB 4: BODY LOG (Physical Progress) ──────────────── */}
          {(activeCategory === 'body' || activeCategory === 'overview') && (
            <div className="card p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-[10px] text-sienna uppercase font-bold tracking-widest">BODY LOG</div>
                  <h3 className="font-display text-base font-bold mt-0.5 text-bone">Physical Measurements</h3>
                </div>
                <Trophy size={16} className="text-amber-400" />
              </div>

              {latestMeasurement ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="bg-ink p-3 rounded-xl border border-line/40 text-center">
                    <div className="font-mono text-lg font-bold text-bone">{latestMeasurement.weight ?? '—'} kg</div>
                    <div className="text-[10px] font-mono text-bone-dim">
                      WEIGHT {metricDelta('weight') != null ? `(${metricDelta('weight')! > 0 ? '+' : ''}${metricDelta('weight')!.toFixed(1)})` : ''}
                    </div>
                  </div>
                  <div className="bg-ink p-3 rounded-xl border border-line/40 text-center">
                    <div className="font-mono text-lg font-bold text-bone">{latestMeasurement.bodyfat ?? '—'}%</div>
                    <div className="text-[10px] font-mono text-bone-dim">
                      BODY FAT {metricDelta('bodyfat') != null ? `(${metricDelta('bodyfat')! > 0 ? '+' : ''}${metricDelta('bodyfat')!.toFixed(1)})` : ''}
                    </div>
                  </div>
                  <div className="bg-ink p-3 rounded-xl border border-line/40 text-center">
                    <div className="font-mono text-lg font-bold text-bone">{latestMeasurement.waist ?? '—'} cm</div>
                    <div className="text-[10px] font-mono text-bone-dim">
                      WAIST {metricDelta('waist') != null ? `(${metricDelta('waist')! > 0 ? '+' : ''}${metricDelta('waist')!.toFixed(1)})` : ''}
                    </div>
                  </div>
                  <div className="bg-ink p-3 rounded-xl border border-line/40 text-center">
                    <div className="font-mono text-lg font-bold text-amber-400">{measurements.length}</div>
                    <div className="text-[10px] font-mono text-bone-dim">LOG ENTRIES</div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-bone-dim py-2">
                  No body measurements recorded yet. Add entries in Body Log to track weight and body composition trends.
                </p>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* ─── CARDIO SHARE MODAL ───────────────────────────────── */}
      {cardioShareData && (
        <CardioShareModal
          data={cardioShareData}
          onClose={() => setCardioShareData(null)}
        />
      )}

      {/* ─── FOLLOWER PLAN IMPORT MODAL (Retained from Calendar) ─ */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={() => setIsImportModalOpen(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg bg-ink-2 border border-line rounded-3xl p-6 z-10 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center pb-2 border-b border-line/40">
                <h3 className="font-display text-lg font-bold text-bone">Import Athlete Plan</h3>
                <button onClick={() => setIsImportModalOpen(false)} className="text-bone-dim hover:text-bone">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-mono text-bone-dim uppercase">Select Followed Athlete</label>
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
                    <label className="text-xs font-mono text-bone-dim uppercase mt-3 block">Available Plans</label>
                    {followerPlans.length === 0 ? (
                      <div className="text-xs text-bone-dim py-4 text-center">This athlete has no public plans.</div>
                    ) : (
                      <div className="space-y-2">
                        {followerPlans.map(p => (
                          <div key={p.id} className="p-3 bg-ink rounded-xl border border-line/40 flex items-center justify-between">
                            <div>
                              <div className="font-bold text-sm text-bone">{p.title}</div>
                              <div className="text-xs text-bone-dim font-mono">{p.description}</div>
                            </div>
                            <button
                              onClick={() => handleClonePlan(p.id!)}
                              className="px-3 py-1.5 rounded-full bg-sienna text-white text-xs font-bold font-mono"
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
