import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, ReferenceLine, Tooltip, BarChart, Bar, Cell } from 'recharts';
import { format } from 'date-fns';
import { Flame, Scale, Target, Loader2, ChevronRight, RotateCcw } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { addMeasurement, getMeasurements } from '@/services/measurements';
import { shiftDate } from '@/lib/analysis-common';
import { bmiCategory, bmiOf, buildPlan, kgToLb, lbToKg, streakFrom, type MacroGoals } from '@/lib/nutrition-plan';
import { dateKey, syncPlanToBackend, useUpdateNutritionSetup, waterGoalFor, type NutritionSetup } from '@/services/nutrition-setup';
import { CalSheet, MACRO_META, NumberSheet, Ruler, type MacroKey } from './cal-ui';
import { HISTORY_DAYS, sumTotals, useMealHistory, type LoggedMeal } from './use-nutrition-data';
import { NutritionInsights } from '@/components/insights/NutritionInsights';
import { niceTicks, ScrollChart } from '@/components/ui/ScrollChart';
import { bucketIndex, bucketSize, RANGE_LABEL, RANGE_OPTIONS, rangeBuckets, rangeDays, rangeStart, type TimeRange } from '@/lib/time-range';

export function useMeasurements() {
  const uid = useAuthStore(s => s.user?.uid);
  return useQuery({ queryKey: ['measurements', uid], queryFn: () => getMeasurements(uid!), enabled: !!uid });
}

export function LogWeightSheet({ currentKg, imperial, onClose }: { currentKg: number; imperial: boolean; onClose: () => void }) {
  const uid = useAuthStore(s => s.user?.uid);
  const qc = useQueryClient();
  const { showToast } = useUIStore();
  const [kg, setKg] = useState(Math.round(currentKg * 2) / 2);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!uid) return;
    setBusy(true);
    try {
      await addMeasurement(uid, { date: dateKey(), weight: Math.round(kg * 10) / 10 });
      qc.invalidateQueries({ queryKey: ['measurements', uid] });
      showToast('Weight logged', 'success');
      onClose();
    } catch {
      showToast('Could not save your weight', 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <CalSheet title="Log weight" onClose={onClose} footer={<button type="button" className="cal-btn" style={{ width: '100%' }} disabled={busy} onClick={save}>{busy ? <Loader2 size={18} className="animate-spin" /> : 'Save'}</button>}>
      <div style={{ textAlign: 'center', margin: '10px 0 16px' }}>
        <div className="cal-tabular" style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em' }}>{imperial ? Math.round(kgToLb(kg)) : kg.toFixed(1)} {imperial ? 'lb' : 'kg'}</div>
        <div className="cal-muted" style={{ fontSize: 13, fontWeight: 600 }}>{format(new Date(), 'EEEE, MMM d')}</div>
      </div>
      {imperial ? (
        <Ruler min={66} max={550} step={1} value={Math.round(kgToLb(kg))} onChange={lb => setKg(Math.round(lbToKg(lb) * 10) / 10)} />
      ) : (
        <Ruler min={30} max={250} step={0.1} value={kg} onChange={setKg} majorEvery={10} />
      )}
    </CalSheet>
  );
}

export function NutritionProgress({ setup, byDay: recentByDay, goals }: { setup: NutritionSetup; byDay: Map<string, LoggedMeal[]>; goals: MacroGoals }) {
  const { data: measurements = [], isLoading } = useMeasurements();
  const [logWeight, setLogWeight] = useState(false);
  const [range, setRange] = useState<TimeRange>('30d');
  const today = dateKey();
  // Longer ranges load more history; the dashboard's 60 days are reused for shorter ones.
  const fetchDays = range === 'all' ? 730 : rangeDays(range, today);
  const long = useMealHistory(Math.max(HISTORY_DAYS, fetchDays));
  const byDay = fetchDays > HISTORY_DAYS && long.data ? long.byDay : recentByDay;
  const a = setup.answers;
  const imperial = a.units === 'imperial';
  const unit = imperial ? 'lb' : 'kg';
  const show = (kg: number) => (imperial ? Math.round(kgToLb(kg)) : Math.round(kg * 10) / 10);

  const weights = useMemo(() => measurements.filter(m => typeof m.weight === 'number' && m.weight > 0).sort((x, y) => x.date.localeCompare(y.date)), [measurements]);
  const trendWeights = useMemo(() => weights.map(w => ({ date: w.date, weight: w.weight! })), [weights]);
  const earliest = useMemo(() => {
    const dates = [...byDay.keys(), ...weights.map(w => w.date)].filter(d => d <= today).sort();
    return dates[0] || null;
  }, [byDay, weights, today]);
  const from = rangeStart(range, today, earliest);
  const windowDays = rangeDays(range, today, earliest);
  const current = weights.length ? weights[weights.length - 1].weight! : a.weightKg;
  const start = a.weightKg;
  const goal = a.goal === 'maintain' ? a.weightKg : a.targetWeightKg;
  const span = start - goal;
  const pct = a.goal === 'maintain' ? 1 : Math.max(0, Math.min(1, span !== 0 ? (start - current) / span : 0));
  const bmi = bmiOf(current, a.heightCm);
  const cat = bmiCategory(bmi);

  const chart = weights.filter(w => w.date >= from).map(w => ({ d: w.date, v: show(w.weight!) }));
  const chartVals = chart.map(p => p.v).concat(a.goal !== 'maintain' ? [show(goal)] : []);
  const chartTicks = niceTicks(Math.floor(Math.min(...chartVals) - 1), Math.ceil(Math.max(...chartVals) + 1));
  const week = Array.from({ length: 7 }, (_, i) => {
    const k = shiftDate(today, i - 6);
    const t = sumTotals(recentByDay.get(k) || []);
    return { k, label: format(new Date(`${k}T12:00:00`), 'EEEEE'), v: Math.round(t.calories) };
  });
  // Calories per day, or the average logged day per week / month on longer ranges.
  const cal = useMemo(() => {
    const buckets = rangeBuckets(range, today, earliest);
    const acc = buckets.map(() => ({ kcal: 0, days: 0 }));
    for (const [k, meals] of byDay) {
      const i = bucketIndex(buckets, k);
      const kcal = sumTotals(meals).calories;
      if (i < 0 || kcal <= 0) continue;
      acc[i].kcal += kcal;
      acc[i].days += 1;
    }
    const bars = buckets.map((b, i) => {
      const v = acc[i].days ? Math.round(acc[i].kcal / acc[i].days) : 0;
      return { k: b.start, label: b.label, v, days: acc[i].days, over: v > goals.calories * 1.05 };
    });
    const loggedDays = acc.reduce((s, x) => s + x.days, 0);
    const avg = loggedDays ? Math.round(acc.reduce((s, x) => s + x.kcal, 0) / loggedDays) : 0;
    return { bars, avg, loggedDays, size: bucketSize(range, today, earliest) };
  }, [byDay, range, today, earliest, goals.calories]);
  const calTicks = niceTicks(0, Math.max(goals.calories * 1.1, ...cal.bars.map(b => b.v)));
  const streak = streakFrom(new Set(recentByDay.keys()), today, shiftDate);

  const scalePos = Math.max(0, Math.min(1, (bmi - 15) / (40 - 15)));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div role="tablist" aria-label="Time range" className="cal-seg">
        {RANGE_OPTIONS.map(o => (
          <button key={o.value} type="button" role="tab" aria-selected={range === o.value} onClick={() => setRange(o.value)}>{o.label}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="cal-card" style={{ padding: 16 }}>
          <div className="cal-muted" style={{ fontSize: 13, fontWeight: 700 }}>Current weight</div>
          <div className="cal-tabular" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 4 }}>{show(current)} <span style={{ fontSize: 14 }}>{unit}</span></div>
          <div style={{ marginTop: 10, height: 6, borderRadius: 6, background: 'var(--cal-card-2)' }}>
            <div style={{ width: `${pct * 100}%`, height: '100%', borderRadius: 6, background: 'var(--cal-primary)' }} />
          </div>
          <div className="cal-muted cal-tabular" style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>Goal {show(goal)} {unit}</div>
          <button type="button" onClick={() => setLogWeight(true)} className="cal-btn" style={{ width: '100%', height: 40, fontSize: 14, marginTop: 12 }}>Log weight</button>
        </div>
        <div className="cal-card" style={{ padding: 16, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }} className="cal-muted"><Flame size={14} color="var(--cal-carbs)" /> Day streak</div>
          <div className="cal-tabular" style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 4 }}>{streak}</div>
          <div style={{ display: 'flex', gap: 4, marginTop: 'auto' }}>
            {week.map(d => (
              <div key={d.k} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ height: 22, borderRadius: 6, background: d.v > 0 ? 'var(--cal-carbs)' : 'var(--cal-card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {d.v > 0 && <Flame size={11} color="#fff" />}
                </div>
                <div className="cal-muted" style={{ fontSize: 10, fontWeight: 700, marginTop: 3 }}>{d.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="cal-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Weight progress</div>
          <div className="cal-muted" style={{ fontSize: 12.5, fontWeight: 600 }}>{RANGE_LABEL[range]}</div>
        </div>
        <div style={{ height: 200, marginTop: 12 }}>
          {isLoading ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 className="animate-spin cal-muted" size={20} /></div>
          ) : chart.length >= 2 ? (
            <ScrollChart count={chart.length} slot={26} height={200} ticks={chartTicks} top={8} bottom={24} tickStyle={{ color: 'var(--cal-muted)' }}>
              {cw => (
                <LineChart width={cw} height={200} data={chart} margin={{ top: 8, right: 12, bottom: 0, left: 6 }}>
                  <XAxis dataKey="d" height={24} tickFormatter={d => format(new Date(`${d}T12:00:00`), 'MMM d')} tick={{ fontSize: 11, fill: 'var(--cal-muted)' }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis hide domain={[chartTicks[0], chartTicks[chartTicks.length - 1]]} allowDataOverflow />
                  <Tooltip formatter={(v: number) => [`${v} ${unit}`, 'Weight']} labelFormatter={d => format(new Date(`${d}T12:00:00`), 'MMM d, yyyy')} contentStyle={{ borderRadius: 12, border: 'none', background: 'var(--cal-card)', color: 'var(--cal-text)' }} />
                  {a.goal !== 'maintain' && <ReferenceLine y={show(goal)} stroke="var(--cal-good)" strokeDasharray="4 4" />}
                  <Line isAnimationActive={false} type="monotone" dataKey="v" stroke="var(--cal-text)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--cal-card)', strokeWidth: 2 }} />
                </LineChart>
              )}
            </ScrollChart>
          ) : (
            <div className="cal-card-2" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 16 }}>
              <Scale size={24} className="cal-muted" />
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>{weights.length ? 'No weigh-ins in this period' : 'Log your weight to see your trend'}</div>
              <div className="cal-muted" style={{ fontSize: 12.5, marginTop: 2 }}>{weights.length ? 'Pick a longer range or log today\'s weight.' : 'Weigh in once a week, same time of day.'}</div>
            </div>
          )}
        </div>
      </div>

      <div className="cal-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Calories</div>
            <div className="cal-muted" style={{ fontSize: 12.5, fontWeight: 600 }}>{cal.size === 'day' ? 'Per day' : `Average logged day per ${cal.size}`} · {RANGE_LABEL[range]}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="cal-tabular" style={{ fontSize: 18, fontWeight: 800 }}>{cal.avg ? cal.avg.toLocaleString() : '—'}</div>
            <div className="cal-muted" style={{ fontSize: 11.5, fontWeight: 600 }}>avg · {cal.loggedDays} day{cal.loggedDays === 1 ? '' : 's'} logged</div>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          {cal.loggedDays === 0 ? (
            <div className="cal-card-2 cal-muted" style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>No meals logged in this period</div>
          ) : (
            <ScrollChart count={cal.bars.length} slot={cal.bars.length > 20 ? 20 : 34} height={180} ticks={calTicks} top={8} bottom={24} tickStyle={{ color: 'var(--cal-muted)' }}>
              {cw => (
                <BarChart width={cw} height={180} data={cal.bars} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                  <XAxis dataKey="label" height={24} tick={{ fontSize: 11, fill: 'var(--cal-muted)' }} axisLine={false} tickLine={false} minTickGap={10} />
                  <YAxis hide domain={[calTicks[0], calTicks[calTicks.length - 1]]} allowDataOverflow />
                  <Tooltip cursor={{ fill: 'var(--cal-card-2)' }} contentStyle={{ borderRadius: 12, border: 'none', background: 'var(--cal-card)', color: 'var(--cal-text)', fontSize: 12 }}
                    formatter={(v: number, _k, p) => [`${v.toLocaleString()} cal`, cal.size === 'day' ? 'Eaten' : `Avg of ${(p?.payload as { days: number }).days} days`]} />
                  <ReferenceLine y={goals.calories} stroke="var(--cal-muted)" strokeDasharray="4 4" />
                  <Bar isAnimationActive={false} dataKey="v" radius={[6, 6, 6, 6]} maxBarSize={22}>
                    {cal.bars.map(d => <Cell key={d.k} fill={d.over ? 'var(--cal-bad)' : 'var(--cal-text)'} />)}
                  </Bar>
                </BarChart>
              )}
            </ScrollChart>
          )}
        </div>
      </div>

      <div className="cal-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Your BMI</div>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: `color-mix(in srgb, ${cat.color} 16%, transparent)`, color: cat.color }}>{cat.label}</span>
        </div>
        <div className="cal-tabular" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 6 }}>{bmi.toFixed(1)}</div>
        <div style={{ position: 'relative', marginTop: 12 }}>
          <div style={{ display: 'flex', height: 8, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ flex: 3.5, background: '#4C8DF6' }} />
            <div style={{ flex: 6.5, background: '#22C55E' }} />
            <div style={{ flex: 5, background: '#F5A524' }} />
            <div style={{ flex: 10, background: '#EF4444' }} />
          </div>
          <div style={{ position: 'absolute', top: -4, left: `calc(${scalePos * 100}% - 2px)`, width: 4, height: 16, borderRadius: 4, background: 'var(--cal-text)' }} />
        </div>
        <div className="cal-muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, marginTop: 6 }}>
          <span>Underweight</span><span>Healthy</span><span>Overweight</span><span>Obese</span>
        </div>
      </div>

      <NutritionInsights setup={setup} byDay={byDay} goals={goals} weights={trendWeights} range={range} windowDays={windowDays} from={from} />

      <AnimatePresence>
        {logWeight && <LogWeightSheet currentKg={current} imperial={imperial} onClose={() => setLogWeight(false)} />}
      </AnimatePresence>
    </div>
  );
}

export function NutritionSettingsSheet({ setup, onEditPlan, onClose }: { setup: NutritionSetup; onEditPlan: () => void; onClose: () => void }) {
  const update = useUpdateNutritionSetup();
  const { showToast } = useUIStore();
  const [editing, setEditing] = useState<MacroKey | null>(null);
  const [editWater, setEditWater] = useState(false);
  const a = setup.answers;
  const imperial = a.units === 'imperial';
  const w = (kg: number) => (imperial ? `${Math.round(kgToLb(kg))} lb` : `${Math.round(kg * 10) / 10} kg`);

  const saveGoals = async (goals: MacroGoals) => {
    try {
      await update({ goals }, prev => ({ ...prev, goals }));
      syncPlanToBackend(a, goals).catch(() => {});
    } catch {
      showToast('Could not save targets', 'error');
    }
  };
  const setPref = async (k: 'addBurned' | 'rollover', v: boolean) => {
    const prefs = { ...setup.prefs, [k]: v };
    try {
      await update({ prefs }, prev => ({ ...prev, prefs }));
    } catch {
      showToast('Could not save setting', 'error');
    }
  };

  const Row = ({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) => (
    <button type="button" onClick={onClick} disabled={!onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 2px', borderBottom: '1px solid var(--cal-border)', textAlign: 'left' }}>
      <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{label}</span>
      <span className="cal-muted cal-tabular" style={{ fontSize: 15, fontWeight: 600 }}>{value}</span>
      {onClick && <ChevronRight size={17} className="cal-muted" />}
    </button>
  );

  const Toggle = ({ label, sub, on, onChange }: { label: string; sub: string; on: boolean; onChange: (v: boolean) => void }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 2px' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{label}</div>
        <div className="cal-muted" style={{ fontSize: 12.5 }}>{sub}</div>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} style={{ width: 50, height: 30, borderRadius: 30, background: on ? 'var(--cal-primary)' : 'var(--cal-card-2)', position: 'relative', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 24, height: 24, borderRadius: 24, background: on ? 'var(--cal-on-primary)' : 'var(--cal-card)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
      </button>
    </div>
  );

  return (
    <CalSheet title="Nutrition settings" onClose={onClose}>
      <div className="cal-card" style={{ padding: '4px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, padding: '10px 2px 2px' }} className="cal-muted">Daily targets</div>
        {(Object.keys(MACRO_META) as MacroKey[]).map(k => (
          <Row key={k} label={MACRO_META[k].label} value={`${setup.goals[k]}${k === 'calories' ? ' cal' : ' g'}`} onClick={() => setEditing(k)} />
        ))}
        <Row label="Water" value={`${waterGoalFor(setup).toLocaleString()} ml`} onClick={() => setEditWater(true)} />
        <button type="button" onClick={() => saveGoals((({ calories, protein, carbs, fat, fiber }) => ({ calories, protein, carbs, fat, fiber }))(buildPlan(a)))} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 2px', fontSize: 14, fontWeight: 700 }}>
          <RotateCcw size={15} /> Auto-generate targets
        </button>
      </div>

      <div className="cal-card" style={{ padding: '4px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, padding: '10px 2px 2px' }} className="cal-muted">Your plan</div>
        <Row label="Goal" value={a.goal === 'lose' ? 'Lose weight' : a.goal === 'gain' ? 'Gain weight' : 'Maintain'} />
        <Row label="Starting weight" value={w(a.weightKg)} />
        {a.goal !== 'maintain' && <Row label="Goal weight" value={w(a.targetWeightKg)} />}
        <Row label="Height" value={imperial ? `${Math.floor(a.heightCm / 30.48)}′${Math.round((a.heightCm / 2.54) % 12)}″` : `${a.heightCm} cm`} />
        <Row label="Diet" value={a.diet[0].toUpperCase() + a.diet.slice(1)} />
        <button type="button" onClick={onEditPlan} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 2px', fontSize: 14, fontWeight: 700 }}>
          <Target size={15} /> Redo my plan
        </button>
      </div>

      <div className="cal-card" style={{ padding: '4px 14px' }}>
        <Toggle label="Add burned calories" sub="Workouts and cardio raise today's goal" on={setup.prefs?.addBurned !== false} onChange={v => setPref('addBurned', v)} />
        <Toggle label="Rollover calories" sub="Carry up to 200 unused calories to the next day" on={!!setup.prefs?.rollover} onChange={v => setPref('rollover', v)} />
      </div>

      <AnimatePresence>
        {editing && (
          <NumberSheet
            title={`${MACRO_META[editing].label} target`}
            value={setup.goals[editing]}
            unit={editing === 'calories' ? 'kcal' : 'g'}
            min={editing === 'calories' ? 800 : 0}
            max={editing === 'calories' ? 8000 : editing === 'carbs' ? 1200 : editing === 'protein' ? 600 : editing === 'fat' ? 400 : 150}
            onSave={v => saveGoals({ ...setup.goals, [editing]: v })}
            onClose={() => setEditing(null)}
            z={10030}
          />
        )}
        {editWater && (
          <NumberSheet
            title="Daily water goal"
            value={waterGoalFor(setup)}
            unit="ml"
            min={500}
            max={8000}
            onSave={v => update({ waterGoal: v }, prev => ({ ...prev, waterGoal: v })).catch(() => showToast('Could not save water goal', 'error'))}
            onClose={() => setEditWater(false)}
            z={10030}
          />
        )}
      </AnimatePresence>
    </CalSheet>
  );
}
