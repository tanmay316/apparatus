import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, Tooltip, XAxis, YAxis } from 'recharts';
import { format } from 'date-fns';
import {
  Activity, ArrowDown, ArrowUp, Crown, Dumbbell, EyeOff, Footprints, Lightbulb, Loader2, Lock, Minus, Salad, Swords, UserPlus, type LucideIcon,
} from 'lucide-react';
import type { CardioActivityType } from '@/types';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { CAN_UPSELL, useHasPro } from '@/stores/subscription-store';
import { historyQuery } from '@/services/history';
import { CompareProRequiredError, loadCompareTarget, loadNutritionCompare } from '@/services/compare';
import { compareAthletes, nutritionEdges, type Comparison, type Momentum, type NutritionSide } from '@/lib/athlete-compare';
import { RANGE_LABEL, RANGE_OPTIONS, rangeDays, type TimeRange } from '@/lib/time-range';
import { formatPaceSec } from '@/lib/cardio-analysis';
import { getAvatarUrl } from '@/lib/avatar';
import { niceTicks, ScrollChart } from '@/components/ui/ScrollChart';
import { Pills, ToolCard } from '@/components/insights/TrainingTools';
import { ProBadge, ProLock } from '@/components/insights/ProLock';
import { BRAND } from '@/lib/brand';

const ME = 'rgb(var(--viz-cardio))';
const THEM = '#a855f7';
const tick = { fontSize: 11, fill: 'rgb(var(--color-bone-dim))' };
const tooltipStyle = { borderRadius: 12, border: '1px solid rgb(var(--color-bone) / 0.1)', background: 'rgb(var(--color-ink-2))', color: 'rgb(var(--color-bone))', fontSize: 12 };
const NOUN: Record<CardioActivityType, string> = { run: 'Run', walk: 'Walk', cycle: 'Ride' };
const MOMENTUM_COLOR: Record<Momentum['tone'], string> = { up: '#059669', flat: '#0284c7', down: '#d97706', idle: 'rgb(var(--color-bone-dim))' };
const hours = (m: number) => (m >= 90 ? `${Math.round(m / 6) / 10} h` : `${m} min`);
const signed = (n: number | null, unit = '%') => (n === null ? '—' : `${n > 0 ? '+' : ''}${n}${unit}`);

function Avatar({ src, name, size = 56 }: { src?: string | null; name: string; size?: number }) {
  const theme = useUIStore(s => s.theme);
  return <img src={src || getAvatarUrl(name, theme)} alt="" className="rounded-full object-cover bg-bone/10" style={{ width: size, height: size }} />;
}

function ScoreRing({ value, color, size = 84 }: { value: number; color: string; size?: number }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--color-bone) / 0.08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(value / 100) * c} ${c}`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[26px] font-bold tabular-nums text-bone">{value}</span>
    </div>
  );
}

function Notice({ icon: Icon, title, text, children }: { icon: LucideIcon; title: string; text: string; children?: ReactNode }) {
  return (
    <section className="pro-panel p-6 text-center">
      <span className="mx-auto w-12 h-12 rounded-full bg-bone/[0.06] flex items-center justify-center text-bone-dim"><Icon size={22} /></span>
      <h2 className="mt-3 text-[17px] font-semibold text-bone">{title}</h2>
      <p className="mt-1 text-[13px] text-bone-dim leading-snug max-w-[320px] mx-auto">{text}</p>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

/** One metric, both athletes: values on the sides, bars meeting in the middle. */
function VersusRow({ label, me, them, fmt = String, higherIsBetter = true }: { label: string; me: number; them: number; fmt?: (n: number) => string; higherIsBetter?: boolean }) {
  const max = Math.max(Math.abs(me), Math.abs(them), 1e-9);
  const meWins = higherIsBetter ? me > them : me < them;
  const themWins = higherIsBetter ? them > me : them < me;
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between text-[14px] tabular-nums">
        <span className={`font-semibold ${meWins ? 'text-bone' : 'text-bone-dim'}`}>{fmt(me)}</span>
        <span className="text-[12px] text-bone-dim">{label}</span>
        <span className={`font-semibold ${themWins ? 'text-bone' : 'text-bone-dim'}`}>{fmt(them)}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1">
        <div className="h-2.5 rounded-l-full bg-bone/[0.06] overflow-hidden flex justify-end">
          <div className="h-full rounded-l-full" style={{ width: `${Math.max(me ? 4 : 0, (Math.abs(me) / max) * 100)}%`, background: ME, opacity: meWins ? 1 : 0.45 }} />
        </div>
        <div className="h-2.5 rounded-r-full bg-bone/[0.06] overflow-hidden">
          <div className="h-full rounded-r-full" style={{ width: `${Math.max(them ? 4 : 0, (Math.abs(them) / max) * 100)}%`, background: THEM, opacity: themWins ? 1 : 0.45 }} />
        </div>
      </div>
    </div>
  );
}

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-bone-dim">—</span>;
  const Icon = value > 0 ? ArrowUp : value < 0 ? ArrowDown : Minus;
  const color = value > 0 ? '#059669' : value < 0 ? '#e11d48' : 'rgb(var(--color-bone-dim))';
  return <span className="inline-flex items-center gap-0.5 font-semibold tabular-nums" style={{ color }}><Icon size={13} />{Math.abs(value)}%</span>;
}

function EdgeList({ title, color, items, empty }: { title: string; color: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-2xl p-3.5" style={{ background: `color-mix(in srgb, ${color} 9%, transparent)` }}>
      <div className="text-[13px] font-semibold" style={{ color }}>{title}</div>
      {items.length ? (
        <ul className="mt-1.5 space-y-1.5">
          {items.map(t => <li key={t} className="text-[13px] text-bone leading-snug flex gap-2"><span className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />{t}</li>)}
        </ul>
      ) : <p className="mt-1 text-[12.5px] text-bone-dim">{empty}</p>}
    </div>
  );
}

function Hero({ c, myName, myPhoto, name, photo, range }: { c: Comparison; myName: string; myPhoto?: string; name: string; photo?: string; range: TimeRange }) {
  const first = name.split(' ')[0] || name;
  const verdict = c.leader === 'me' ? "You're ahead" : c.leader === 'them' ? `${first} is ahead` : c.leader === 'tie' ? 'Neck and neck' : 'No training yet';
  const sideCol = (who: 'me' | 'them') => {
    const s = who === 'me' ? c.me : c.them;
    const color = who === 'me' ? ME : THEM;
    return (
      <div className="flex-1 min-w-0 flex flex-col items-center text-center">
        <div className="relative">
          <Avatar src={who === 'me' ? myPhoto : photo} name={who === 'me' ? myName : name} size={52} />
          {c.leader === who && <Crown size={18} className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-amber-500 fill-amber-400" />}
        </div>
        <div className="mt-1.5 text-[14px] font-semibold text-bone truncate max-w-full">{who === 'me' ? 'You' : first}</div>
        <div className="mt-2"><ScoreRing value={s.score} color={color} /></div>
        <div className="mt-2 text-[13px] font-semibold" style={{ color: MOMENTUM_COLOR[s.momentum.tone] }}>{s.momentum.label}</div>
        <div className="text-[11.5px] text-bone-dim leading-snug">{s.momentum.text}</div>
      </div>
    );
  };
  return (
    <section className="pro-panel p-4 sm:p-5">
      <div className="text-center">
        <div className="text-[12px] uppercase tracking-wider text-bone-dim">{RANGE_LABEL[range]}</div>
        <div className="text-[22px] font-bold text-bone leading-tight mt-0.5">{verdict}</div>
      </div>
      <div className="mt-4 flex items-start gap-2">
        {sideCol('me')}
        <div className="self-center text-[13px] font-bold text-bone-dim px-1">VS</div>
        {sideCol('them')}
      </div>
      <p className="mt-3 text-[11.5px] text-bone-dim text-center leading-snug">Momentum score: consistency, improvement and personal records. It rewards progress, not who is stronger.</p>
    </section>
  );
}

function NutritionCard({ uid, name, days, enabled }: { uid: string; name: string; days: number; enabled: boolean }) {
  const first = name.split(' ')[0] || name;
  const { data, isLoading, error } = useQuery({
    queryKey: ['nutrition-compare', uid, days],
    queryFn: () => loadNutritionCompare(uid, days),
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const body = (() => {
    if (isLoading) return <div className="py-8 flex justify-center text-bone-dim"><Loader2 size={20} className="animate-spin" /></div>;
    if (error instanceof CompareProRequiredError) return <p className="text-[13px] text-bone-dim">Nutrition comparison is part of {BRAND.name} Pro.</p>;
    if (error || !data) return <p className="text-[13px] text-bone-dim">Couldn't load nutrition right now. Try again later.</p>;
    const me = data.me;
    const them = data.them;
    if (data.status !== 'ok' || !them) {
      const text = data.status === 'private'
        ? `${first} keeps their nutrition private. They can share a summary from Settings › Privacy.`
        : data.status === 'not_following' ? `Follow ${first} to compare nutrition.` : 'Nutrition comparison is unavailable right now.';
      return (
        <>
          <div className="flex items-start gap-2.5 rounded-2xl p-3 bg-bone/[0.04]"><EyeOff size={17} className="text-bone-dim shrink-0 mt-0.5" /><p className="text-[13px] text-bone-dim leading-snug">{text}</p></div>
          <NutritionNumbers me={me} />
        </>
      );
    }
    if (me.loggedDays === 0 && them.loggedDays === 0) return <p className="text-[13px] text-bone-dim">Neither of you logged meals in this period.</p>;
    const edges = nutritionEdges(me, them, name);
    const pctFmt = (n: number) => `${n}%`;
    return (
      <>
        <div className="flex justify-between text-[12px] font-semibold"><span style={{ color: ME }}>You</span><span style={{ color: THEM }}>{first}</span></div>
        <div className="divide-y divide-line/50">
          <VersusRow label="Days logged" me={me.loggedDays} them={them.loggedDays} />
          {me.proteinHitPct !== null && them.proteinHitPct !== null && <VersusRow label="Protein goal hit" me={me.proteinHitPct} them={them.proteinHitPct} fmt={pctFmt} />}
          {me.calorieOnTargetPct !== null && them.calorieOnTargetPct !== null && <VersusRow label="Calories on target" me={me.calorieOnTargetPct} them={them.calorieOnTargetPct} fmt={pctFmt} />}
          {me.avgHealthScore !== null && them.avgHealthScore !== null && <VersusRow label="Meal quality" me={me.avgHealthScore} them={them.avgHealthScore} />}
          {me.avgProtein !== null && them.avgProtein !== null && <VersusRow label="Protein / day (g)" me={me.avgProtein} them={them.avgProtein} />}
        </div>
        {them.loggedDays === 0 && <p className="mt-2 text-[12.5px] text-bone-dim">{first} hasn't logged meals in this period{them.lastLogged ? ` (last on ${format(new Date(`${them.lastLogged}T12:00:00`), 'MMM d')})` : ''}.</p>}
        {me.loggedDays === 0 && <p className="mt-2 text-[12.5px] text-bone-dim">You haven't logged meals in this period. Log today's meals to compare.</p>}
        {(edges.theirEdge.length > 0 || edges.myEdge.length > 0) && (
          <ul className="mt-3 space-y-1.5">
            {[...edges.theirEdge, ...edges.myEdge].map(t => <li key={t} className="text-[12.5px] text-bone leading-snug">• {t}</li>)}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-bone-dim">Goal hit rates use each person's own targets, so different body sizes compare fairly.</p>
      </>
    );
  })();
  return (
    <ToolCard icon={Salad} title="Nutrition" subtitle="Logging consistency and how often each of you hits your own goals" color="#16a34a">
      {body}
    </ToolCard>
  );
}

function NutritionNumbers({ me }: { me: NutritionSide }) {
  if (!me.loggedDays) return null;
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      <div className="pro-tile p-2.5"><div className="text-[10.5px] uppercase tracking-wider text-bone-dim">Your days</div><div className="text-[20px] font-bold text-bone tabular-nums">{me.loggedDays}</div></div>
      <div className="pro-tile p-2.5"><div className="text-[10.5px] uppercase tracking-wider text-bone-dim">Protein hit</div><div className="text-[20px] font-bold text-bone tabular-nums">{me.proteinHitPct ?? '—'}{me.proteinHitPct !== null ? '%' : ''}</div></div>
      <div className="pro-tile p-2.5"><div className="text-[10.5px] uppercase tracking-wider text-bone-dim">On target</div><div className="text-[20px] font-bold text-bone tabular-nums">{me.calorieOnTargetPct ?? '—'}{me.calorieOnTargetPct !== null ? '%' : ''}</div></div>
    </div>
  );
}

function CompareBody({ c, name, range }: { c: Comparison; name: string; range: TimeRange }) {
  const first = name.split(' ')[0] || name;
  const data = c.labels.map((label, i) => ({ label, me: c.me.series[i] || 0, them: c.them.series[i] || 0 }));
  const ticks = niceTicks(0, Math.max(30, ...data.flatMap(d => [d.me, d.them])));
  const slot = data.length <= 7 ? 44 : data.length <= 14 ? 36 : 30;
  return (
    <div className="space-y-3">
      <ToolCard icon={Lightbulb} title="Why" subtitle="What is making the difference" color="#d97706">
        <div className="space-y-2.5">
          <EdgeList title={`${first}'s edge`} color={THEM} items={c.theirEdge} empty={`Nothing where ${first} is clearly ahead.`} />
          <EdgeList title="Your edge" color={ME} items={c.myEdge} empty="Nothing where you're clearly ahead yet." />
        </div>
        <div className="mt-3 rounded-2xl p-3.5 border border-amber-500/30" style={{ background: 'color-mix(in srgb, #d97706 8%, transparent)' }}>
          <div className="text-[12px] uppercase tracking-wider font-semibold text-amber-600 dark:text-amber-400">Your move</div>
          <p className="mt-0.5 text-[14px] font-semibold text-bone leading-snug">{c.action}</p>
        </div>
      </ToolCard>

      <ToolCard icon={Swords} title="Head to head" subtitle={RANGE_LABEL[range]}>
        <div className="flex justify-between text-[12px] font-semibold"><span style={{ color: ME }}>You</span><span style={{ color: THEM }}>{first}</span></div>
        <div className="divide-y divide-line/50">
          <VersusRow label="Active days" me={c.me.activeDays} them={c.them.activeDays} />
          <VersusRow label="Training time" me={c.me.minutes} them={c.them.minutes} fmt={hours} />
          <VersusRow label="Sessions" me={c.me.sessions} them={c.them.sessions} />
          {(c.me.workouts + c.them.workouts > 0) && <VersusRow label="Workouts" me={c.me.workouts} them={c.them.workouts} />}
          {(c.me.distanceKm + c.them.distanceKm > 0) && <VersusRow label="Distance (km)" me={c.me.distanceKm} them={c.them.distanceKm} />}
          {(c.me.prs + c.them.prs > 0) && <VersusRow label="Personal records" me={c.me.prs} them={c.them.prs} />}
          {c.me.trendPct !== null && c.them.trendPct !== null && <VersusRow label="vs previous period" me={c.me.trendPct} them={c.them.trendPct} fmt={n => signed(n)} />}
        </div>
      </ToolCard>

      <ToolCard icon={Activity} title="Training time" subtitle="Minutes of cardio and strength, side by side">
        <div className="flex items-center gap-4 text-[12px] mb-2">
          <span className="flex items-center gap-1.5 text-bone"><span className="w-2.5 h-2.5 rounded-full" style={{ background: ME }} /> You · {hours(c.me.minutes)}</span>
          <span className="flex items-center gap-1.5 text-bone"><span className="w-2.5 h-2.5 rounded-full" style={{ background: THEM }} /> {first} · {hours(c.them.minutes)}</span>
        </div>
        <ScrollChart count={data.length} slot={slot} height={200} ticks={ticks} top={8} bottom={24} axisWidth={40} format={v => `${Math.round(v)}m`} tickStyle={{ color: 'rgb(var(--color-bone-dim))' }}>
          {w => (
            <BarChart width={w} height={200} data={data} margin={{ top: 8, right: 6, bottom: 0, left: 0 }} barGap={2}>
              <XAxis dataKey="label" height={24} tick={tick} axisLine={false} tickLine={false} minTickGap={12} />
              <YAxis hide domain={[ticks[0], ticks[ticks.length - 1]]} allowDataOverflow />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, k: string) => [`${v} min`, k === 'me' ? 'You' : first]} />
              <Bar isAnimationActive={false} dataKey="me" fill={ME} radius={[4, 4, 0, 0]} maxBarSize={14} />
              <Bar isAnimationActive={false} dataKey="them" fill={THEM} radius={[4, 4, 0, 0]} maxBarSize={14} />
            </BarChart>
          )}
        </ScrollChart>
      </ToolCard>

      {(c.me.workouts + c.them.workouts > 0) && (
        <ToolCard icon={Dumbbell} title="Strength progress" subtitle="Best set (est. 1RM, reps or hold) and how much it improved" color="rgb(var(--viz-strength))">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="pro-tile p-3"><div className="text-[11px] uppercase tracking-wider text-bone-dim">Your lifts</div><div className="text-[22px] font-bold tabular-nums" style={{ color: ME }}><Change value={c.me.liftProgressPct} /></div><div className="text-[12px] text-bone-dim">{c.me.prs} PRs · {c.me.workouts} workouts</div></div>
            <div className="pro-tile p-3"><div className="text-[11px] uppercase tracking-wider text-bone-dim">{first}'s lifts</div><div className="text-[22px] font-bold tabular-nums" style={{ color: THEM }}><Change value={c.them.liftProgressPct} /></div><div className="text-[12px] text-bone-dim">{c.them.prs} PRs · {c.them.workouts} workouts</div></div>
          </div>
          {c.lifts.length > 0 ? (
            <div className="mt-3 divide-y divide-line/50">
              {c.lifts.map(l => {
                const unit = l.unit === 'kg' ? ' kg' : l.unit === 's' ? ' s' : ' reps';
                return (
                  <div key={l.name} className="py-2.5">
                    <div className="text-[13.5px] font-semibold text-bone">{l.name}</div>
                    <div className="mt-1 grid grid-cols-2 gap-2 text-[13px] tabular-nums">
                      <div><span style={{ color: ME }} className="font-semibold">{l.me.best}{unit}</span> <Change value={l.me.changePct} /></div>
                      <div className="text-right"><span style={{ color: THEM }} className="font-semibold">{l.them.best}{unit}</span> <Change value={l.them.changePct} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="mt-3 text-[12.5px] text-bone-dim">No lifts in common in this period, so only overall progress is compared.</p>}
        </ToolCard>
      )}

      {c.cardio.length > 0 && (
        <ToolCard icon={Footprints} title="Cardio" subtitle="Distance, pace and speed change vs the period before">
          <div className="space-y-3">
            {c.cardio.map(x => {
              const rate = (s: typeof x.me) => (x.type === 'cycle' ? (s.kmh ? `${s.kmh} km/h` : '—') : s.paceSec ? `${formatPaceSec(s.paceSec)} /km` : '—');
              return (
                <div key={x.type} className="rounded-2xl p-3 bg-bone/[0.03] border border-line/50">
                  <div className="text-[13.5px] font-semibold text-bone">{NOUN[x.type]}</div>
                  <div className="mt-1.5 grid grid-cols-2 gap-2 text-[13px] tabular-nums">
                    <div>
                      <div className="text-[18px] font-bold" style={{ color: ME }}>{x.me.km} km</div>
                      <div className="text-bone-dim">{x.me.sessions} × · {rate(x.me)}</div>
                      <div><Change value={x.me.changePct} /></div>
                    </div>
                    <div className="text-right">
                      <div className="text-[18px] font-bold" style={{ color: THEM }}>{x.them.km} km</div>
                      <div className="text-bone-dim">{x.them.sessions} × · {rate(x.them)}</div>
                      <div><Change value={x.them.changePct} /></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ToolCard>
      )}
    </div>
  );
}

export function ComparePage() {
  const { uid = '' } = useParams<{ uid: string }>();
  const { profile: me } = useAuthStore();
  const hasPro = useHasPro();
  const [range, setRange] = useState<TimeRange>('30d');
  const asOf = format(new Date(), 'yyyy-MM-dd');

  const { data: target, isLoading: loadingTarget } = useQuery({
    queryKey: ['compare-target', me?.uid, uid],
    queryFn: () => loadCompareTarget(me!.uid, uid),
    enabled: !!me?.uid && !!uid,
    staleTime: 2 * 60_000,
  });
  const { data: myWorkouts = [], isLoading: loadingW } = useQuery(historyQuery('workouts', me?.uid));
  const { data: myCardio = [], isLoading: loadingC } = useQuery(historyQuery('cardio', me?.uid));

  const name = target?.profile?.displayName || 'Athlete';
  const first = name.split(' ')[0] || name;
  const comparison = useMemo(
    () => (target?.access === 'ok' ? compareAthletes({ workouts: myWorkouts, cardio: myCardio }, { workouts: target.workouts, cardio: target.cardio }, range, asOf, name) : null),
    [target, myWorkouts, myCardio, range, asOf, name],
  );
  const nutritionDays = comparison ? Math.min(365, comparison.days) : rangeDays(range, asOf);

  const header = (
    <h1 className="px-1 text-[20px] font-semibold text-bone flex items-center gap-2 min-w-0">
      <span className="truncate">You vs {first}</span> <ProBadge />
    </h1>
  );

  let content: ReactNode;
  if (loadingTarget || loadingW || loadingC || !target) {
    content = <div className="py-20 flex justify-center text-bone-dim"><Loader2 size={24} className="animate-spin" /></div>;
  } else if (target.access === 'self') {
    content = <Notice icon={Swords} title="That's you" text="Open the profile of an athlete you follow and tap Compare." />;
  } else if (target.access === 'not_found') {
    content = <Notice icon={EyeOff} title="Athlete not found" text="This account may have been deleted." />;
  } else if (target.access === 'not_following') {
    content = (
      <Notice icon={UserPlus} title={`Follow ${first} to compare`} text="You can compare yourself with athletes you follow.">
        {target.profile?.username && <Link to={`/profile/${target.profile.username}`} className="dx-btn !h-10 !px-4 !text-[13px] inline-flex">View profile</Link>}
      </Notice>
    );
  } else if (target.access === 'stats_hidden') {
    content = <Notice icon={Lock} title={`${first} keeps their stats private`} text="They turned off “Show stats” in their privacy settings, so their training can't be compared." />;
  } else if (!hasPro && !CAN_UPSELL) {
    content = <Notice icon={Crown} title={`Compare is part of ${BRAND.name} Pro`} text={`Get ${BRAND.name} Pro in the Android app to compare yourself with athletes you follow.`} />;
  } else if (comparison) {
    const noShared = target.workouts.length + target.cardio.length === 0;
    content = (
      <div className="space-y-3">
        <Pills value={range} options={RANGE_OPTIONS} onChange={setRange} label="Time range" />
        {noShared ? (
          <Notice icon={EyeOff} title={`${first} hasn't shared any sessions`} text={`Once ${first} logs a workout or cardio session for followers, you'll see how you compare.`} />
        ) : (
          <ProLock title={`Compare with ${first}`} reason={`See who is improving faster, why, and what to do next with ${BRAND.name} Pro.`} maxHeight={640}>
            <div className="space-y-3">
              <Hero c={comparison} myName={me?.displayName || 'You'} myPhoto={me?.photoURL} name={name} photo={target.profile?.photoURL} range={range} />
              {comparison.me.sessions === 0 && <Notice icon={Activity} title="You haven't trained in this period" text="Log a workout or cardio session to get on the board." />}
              {comparison.them.sessions === 0 && comparison.them.lastActive && (
                <p className="px-1 text-[13px] text-bone-dim">{first} hasn't trained in this period. Last session on {format(new Date(`${comparison.them.lastActive}T12:00:00`), 'MMM d')}.</p>
              )}
              <CompareBody c={comparison} name={name} range={range} />
              <NutritionCard uid={uid} name={name} days={nutritionDays} enabled={hasPro} />
              <p className="px-1 pb-2 text-[11.5px] text-bone-dim leading-snug">Only the sessions {first} shares with followers are compared. Private sessions stay private.</p>
            </div>
          </ProLock>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-3 pb-6">
      {header}
      {content}
    </div>
  );
}
