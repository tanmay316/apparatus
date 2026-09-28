import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronRight, Clock, Dumbbell, Flame, Navigation, Play, Share2, Timer, Trash2, TrendingUp, Trophy } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { RouteMap } from '@/components/cardio/RouteMap';
import type { CardioActivity, CardioActivityType } from '@/types';
import {
  CARDIO_TYPES, activityMovingSec, activityStartMs, activityTitle, formatActivityDate, formatDuration, formatDurationShort, formatPace, primaryRate,
} from './cardio-format';

const LAST_TYPE_KEY = 'apparatus_last_cardio_type';
const PAGE = 15;
const DAY_MS = 86_400_000;

type Filter = 'all' | CardioActivityType;

function GpsPill({ status }: { status: string }) {
  const ok = status === 'active';
  const bad = status === 'error' || status === 'denied';
  const label = ok ? 'GPS ready' : status === 'denied' ? 'Location off' : bad ? 'GPS error' : status === 'degraded' ? 'Weak GPS' : 'Finding GPS…';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-[11px] font-semibold ${ok ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : bad ? 'bg-rose-500/12 text-rose-500' : 'bg-amber-500/12 text-amber-600 dark:text-amber-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-500 animate-pulse' : bad ? 'bg-rose-500' : 'bg-amber-500 animate-pulse'}`} />
      {label}
    </span>
  );
}

function StartCard({ gpsStatus, onStart }: { gpsStatus: string; onStart: (t: CardioActivityType) => void }) {
  const [type, setType] = useState<CardioActivityType>(() => {
    const saved = localStorage.getItem(LAST_TYPE_KEY);
    return saved === 'walk' || saved === 'run' || saved === 'cycle' ? saved : 'run';
  });
  const meta = CARDIO_TYPES[type];

  const start = () => {
    localStorage.setItem(LAST_TYPE_KEY, type);
    onStart(type);
  };

  return (
    <section className="dx-card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="dx-eyebrow">Outdoor GPS</div>
          <h2 className="text-lg font-bold">Start a session</h2>
        </div>
        <GpsPill status={gpsStatus} />
      </div>

      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Activity type">
        {(Object.keys(CARDIO_TYPES) as CardioActivityType[]).map(t => {
          const m = CARDIO_TYPES[t];
          const selected = t === type;
          return (
            <button
              key={t}
              role="radio"
              aria-checked={selected}
              onClick={() => setType(t)}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-all active:scale-[0.97] ${
                selected ? 'border-[var(--dx-accent)] bg-[var(--dx-accent-soft)] text-[var(--dx-text)]' : 'border-[var(--dx-border)] bg-[var(--dx-card-2)] text-[var(--dx-muted)]'
              }`}
            >
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.tint}`}><m.icon size={20} /></span>
              <span className="text-[13px] font-semibold">{m.label}</span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-[var(--dx-muted)] mt-3">{meta.hint}</p>
      <button onClick={start} className="dx-btn w-full !h-12 !rounded-2xl mt-3 text-[15px] font-bold gap-2">
        <Play size={18} fill="currentColor" /> Start {meta.noun}
      </button>
    </section>
  );
}

function WeekCard({ activities }: { activities: CardioActivity[] }) {
  const week = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = today.getTime() - 6 * DAY_MS;
    const days = Array.from({ length: 7 }, (_, i) => ({ ms: start + i * DAY_MS, km: 0 }));
    let km = 0, sec = 0, kcal = 0, sessions = 0, prevKm = 0;
    for (const a of activities) {
      const ms = activityStartMs(a);
      if (ms >= start) {
        const idx = Math.min(6, Math.floor((ms - start) / DAY_MS));
        days[idx].km += a.distanceKm || 0;
        km += a.distanceKm || 0;
        sec += activityMovingSec(a);
        kcal += a.calories || 0;
        sessions++;
      } else if (ms >= start - 7 * DAY_MS) {
        prevKm += a.distanceKm || 0;
      }
    }
    const max = Math.max(...days.map(d => d.km), 0.1);
    const change = prevKm > 0 ? Math.round(((km - prevKm) / prevKm) * 100) : null;
    return { days, km, sec, kcal, sessions, max, change };
  }, [activities]);

  return (
    <section className="dx-card p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="dx-eyebrow">Last 7 days</div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-4xl font-black tabular-nums tracking-tight">{week.km.toFixed(1)}</span>
            <span className="text-sm font-semibold text-[var(--dx-muted)]">km</span>
          </div>
        </div>
        {week.change !== null && (
          <span className={`inline-flex items-center gap-1 px-2 h-6 rounded-full text-[11px] font-bold ${week.change >= 0 ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/12 text-rose-500'}`}>
            <TrendingUp size={12} className={week.change < 0 ? 'rotate-180' : ''} /> {week.change > 0 ? '+' : ''}{week.change}% vs prior week
          </span>
        )}
      </div>

      <div className="flex items-end gap-1.5 h-20 mt-4" aria-hidden>
        {week.days.map((d, i) => {
          const isToday = i === 6;
          return (
            <div key={d.ms} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              <div
                className={`w-full max-w-[28px] rounded-md ${d.km > 0 ? `bg-[var(--dx-accent)] ${isToday ? '' : 'opacity-55'}` : 'bg-[var(--dx-card-2)]'}`}
                style={{ height: d.km > 0 ? `${Math.max(10, (d.km / week.max) * 100)}%` : '6px' }}
                title={`${d.km.toFixed(1)} km`}
              />
              <span className={`text-[10px] ${isToday ? 'font-bold text-[var(--dx-text)]' : 'text-[var(--dx-muted)]'}`}>
                {new Date(d.ms).toLocaleDateString([], { weekday: 'narrow' })}
              </span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4">
        {[
          { icon: Timer, label: 'Sessions', value: String(week.sessions) },
          { icon: Clock, label: 'Moving', value: formatDurationShort(week.sec) },
          { icon: Flame, label: 'Energy', value: `${week.kcal.toLocaleString()}` , unit: 'kcal' },
        ].map(s => (
          <div key={s.label} className="dx-inset rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-1 text-[10.5px] text-[var(--dx-muted)]"><s.icon size={11} /> {s.label}</div>
            <div className="text-[17px] font-bold tabular-nums mt-0.5">{s.value}{s.unit && <span className="text-[10px] font-medium text-[var(--dx-muted)] ml-0.5">{s.unit}</span>}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BestsCard({ activities }: { activities: CardioActivity[] }) {
  const bests = useMemo(() => {
    const out: { label: string; value: string; sub: string }[] = [];
    const longest = activities.reduce<CardioActivity | null>((b, a) => (!b || a.distanceKm > b.distanceKm ? a : b), null);
    if (longest && longest.distanceKm > 0) out.push({ label: 'Longest distance', value: `${longest.distanceKm.toFixed(2)} km`, sub: CARDIO_TYPES[longest.type]?.label ?? '' });
    const longestTime = activities.reduce<CardioActivity | null>((b, a) => (!b || activityMovingSec(a) > activityMovingSec(b) ? a : b), null);
    if (longestTime && activityMovingSec(longestTime) > 0) out.push({ label: 'Longest session', value: formatDurationShort(activityMovingSec(longestTime)), sub: CARDIO_TYPES[longestTime.type]?.label ?? '' });
    const runs = activities.filter(a => a.type === 'run' && a.distanceKm >= 1 && activityMovingSec(a) > 0);
    const fastest = runs.reduce<CardioActivity | null>((b, a) => (!b || activityMovingSec(a) / a.distanceKm < activityMovingSec(b) / b.distanceKm ? a : b), null);
    if (fastest) out.push({ label: 'Fastest run pace', value: `${formatPace(fastest.distanceKm, activityMovingSec(fastest))} /km`, sub: `${fastest.distanceKm.toFixed(1)} km run` });
    const rides = activities.filter(a => a.type === 'cycle' && a.distanceKm >= 2);
    const fastRide = rides.reduce<CardioActivity | null>((b, a) => (!b || (a.avgSpeedKmh || 0) > (b.avgSpeedKmh || 0) ? a : b), null);
    if (fastRide?.avgSpeedKmh) out.push({ label: 'Fastest ride', value: `${fastRide.avgSpeedKmh.toFixed(1)} km/h`, sub: `${fastRide.distanceKm.toFixed(1)} km avg` });
    return out;
  }, [activities]);

  if (!bests.length) return null;
  return (
    <section className="dx-card p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={16} className="text-amber-500" />
        <h2 className="text-base font-bold">Personal bests</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {bests.map(b => (
          <div key={b.label} className="dx-inset rounded-xl p-3">
            <div className="text-[10.5px] text-[var(--dx-muted)]">{b.label}</div>
            <div className="text-[17px] font-bold tabular-nums mt-0.5">{b.value}</div>
            <div className="text-[10.5px] text-[var(--dx-muted)]">{b.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HistoryRow({ activity, expanded, onToggle, onShare, onDelete }: {
  activity: CardioActivity; expanded: boolean; onToggle: () => void; onShare: () => void; onDelete: () => void;
}) {
  const theme = useUIStore(s => s.theme);
  const meta = CARDIO_TYPES[activity.type] ?? CARDIO_TYPES.walk;
  const rate = primaryRate(activity);
  const sec = activityMovingSec(activity);
  const hasRoute = Array.isArray(activity.route) && activity.route.length > 1;
  const note = activity.notes && !/^(Auto-saved session|Effort: \w+)$/.test(activity.notes) ? activity.notes : '';

  return (
    <div className="dx-card overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-3.5 text-left" aria-expanded={expanded}>
        <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${meta.tint}`}><meta.icon size={19} /></span>
        <span className="flex-1 min-w-0">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-[14.5px] truncate">{activityTitle(activity)}</span>
            <span className="text-[15px] font-bold tabular-nums shrink-0">{activity.distanceKm.toFixed(2)}<span className="text-[10px] font-medium text-[var(--dx-muted)] ml-0.5">km</span></span>
          </span>
          <span className="flex items-center justify-between gap-2 text-[12px] text-[var(--dx-muted)] mt-0.5">
            <span className="truncate">{formatActivityDate(activityStartMs(activity))}</span>
            <span className="shrink-0 tabular-nums">{formatDuration(sec)} · {rate.value}{rate.unit === '/km' ? '/km' : ` ${rate.unit}`}</span>
          </span>
        </span>
        <ChevronDown size={16} className={`text-[var(--dx-muted)] shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-3.5 pb-3.5 space-y-3">
              {hasRoute && (
                <div className="relative h-44 rounded-xl overflow-hidden pointer-events-none">
                  <RouteMap
                    route={activity.route}
                    theme={theme === 'dark' ? 'dark' : 'light'}
                    height="100%"
                    fitToContainer
                    interactive={false}
                    variant="card"
                    noGlow
                    highlightColor={meta.accent}
                    cardioType={activity.type}
                    mapPaddingTopLeft={[20, 20]}
                    mapPaddingBottomRight={[20, 20]}
                  />
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: rate.label, value: rate.value, unit: rate.unit },
                  { label: 'Calories', value: String(activity.calories || 0), unit: 'kcal' },
                  { label: 'Elevation', value: String(Math.round(activity.elevationGainM || 0)), unit: 'm' },
                  { label: 'Max speed', value: (activity.maxSpeedKmh || 0).toFixed(1), unit: 'km/h' },
                  ...(activity.steps ? [{ label: 'Steps', value: activity.steps.toLocaleString(), unit: '' }] : []),
                  ...(activity.pausedDurationSec ? [{ label: 'Paused', value: formatDurationShort(activity.pausedDurationSec), unit: '' }] : []),
                ].map(s => (
                  <div key={s.label} className="dx-inset rounded-xl px-2.5 py-2">
                    <div className="text-[10px] text-[var(--dx-muted)] truncate">{s.label}</div>
                    <div className="text-[15px] font-bold tabular-nums">{s.value}{s.unit && <span className="text-[10px] font-medium text-[var(--dx-muted)] ml-0.5">{s.unit}</span>}</div>
                  </div>
                ))}
              </div>
              {note && <p className="text-[13px] text-[var(--dx-muted)] whitespace-pre-wrap break-words">{note}</p>}
              <div className="flex gap-2">
                <button onClick={onShare} className="dx-btn-secondary flex-1 !h-10 !rounded-xl !text-[13px] font-semibold gap-1.5"><Share2 size={14} /> Share</button>
                <button onClick={onDelete} className="dx-btn-secondary !h-10 !w-10 !px-0 !rounded-xl text-rose-500" aria-label="Delete session"><Trash2 size={15} /></button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export interface CardioHubProps {
  activities: CardioActivity[];
  loading: boolean;
  gpsStatus: string;
  onStart: (type: CardioActivityType) => void;
  onShare: (activity: CardioActivity) => void;
  onDelete: (activity: CardioActivity) => void;
}

export function CardioHub({ activities, loading, gpsStatus, onStart, onShare, onDelete }: CardioHubProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [visible, setVisible] = useState(PAGE);
  const [expanded, setExpanded] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: activities.length, walk: 0, run: 0, cycle: 0 };
    activities.forEach(a => { if (a.type in c) c[a.type]++; });
    return c;
  }, [activities]);

  const filtered = useMemo(() => (filter === 'all' ? activities : activities.filter(a => a.type === filter)), [activities, filter]);

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: CardioActivity[]; km: number }[] = [];
    for (const a of filtered.slice(0, visible)) {
      const d = new Date(activityStartMs(a));
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        g = { key, label: d.toLocaleDateString([], { month: 'long', year: 'numeric' }), items: [], km: 0 };
        out.push(g);
      }
      g.items.push(a);
      g.km += a.distanceKm || 0;
    }
    return out;
  }, [filtered, visible]);

  return (
    <div className="dx space-y-4 max-w-3xl mx-auto">
      <div className="pt-1">
        <div className="dx-eyebrow flex items-center gap-1.5"><Navigation size={11} /> Cardio & endurance</div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Activity hub</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <StartCard gpsStatus={gpsStatus} onStart={onStart} />
        <WeekCard activities={activities} />
      </div>

      <BestsCard activities={activities} />

      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-3 mt-2">
          <h2 className="text-lg font-bold">History</h2>
          <div className="dx-segment w-full sm:w-auto" role="tablist">
            {(['all', 'run', 'walk', 'cycle'] as Filter[]).map(f => (
              <button key={f} role="tab" aria-selected={filter === f} onClick={() => { setFilter(f); setVisible(PAGE); }}>
                {f === 'all' ? 'All' : CARDIO_TYPES[f].label}{counts[f] ? ` ${counts[f]}` : ''}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="dx-card h-[72px] animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="dx-card p-8 text-center">
            <div className="text-sm font-bold">No {filter === 'all' ? 'cardio' : CARDIO_TYPES[filter].noun} sessions yet</div>
            <p className="text-xs text-[var(--dx-muted)] mt-1">Pick an activity above and swipe to start. Your route and stats land here.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map(g => (
              <div key={g.key}>
                <div className="flex items-baseline justify-between px-1 mb-2">
                  <span className="text-[12px] font-semibold text-[var(--dx-muted)] uppercase tracking-wider">{g.label}</span>
                  <span className="text-[12px] text-[var(--dx-muted)] tabular-nums">{g.items.length} · {g.km.toFixed(1)} km</span>
                </div>
                <div className="space-y-2">
                  {g.items.map(a => (
                    <HistoryRow
                      key={a.id}
                      activity={a}
                      expanded={expanded === a.id}
                      onToggle={() => setExpanded(expanded === a.id ? null : a.id!)}
                      onShare={() => onShare(a)}
                      onDelete={() => onDelete(a)}
                    />
                  ))}
                </div>
              </div>
            ))}
            {filtered.length > visible && (
              <button onClick={() => setVisible(v => v + PAGE)} className="dx-btn-secondary w-full !h-11 !rounded-2xl !text-[13px] font-semibold">
                Show more ({filtered.length - visible} left)
              </button>
            )}
          </div>
        )}
      </section>

      <Link to="/plans" className="dx-card p-4 flex items-center gap-3 hover:border-[var(--dx-border-strong)]">
        <span className="w-11 h-11 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0"><Dumbbell size={19} /></span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-[14.5px]">Strength training</span>
          <span className="block text-xs text-[var(--dx-muted)]">Log sets, reps and progressive overload</span>
        </span>
        <ChevronRight size={17} className="text-[var(--dx-muted)]" />
      </Link>
      <div className="h-2" />
    </div>
  );
}
