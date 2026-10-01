import { useMemo, type ReactNode } from 'react';
import { Bar, BarChart, Cell, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { analyzeNutritionTrends, type NutritionMeal } from '@/lib/nutrition-trends';
import { kgToLb, type MacroGoals } from '@/lib/nutrition-plan';
import type { NutritionSetup } from '@/services/nutrition-setup';
import { dateKey } from '@/services/nutrition-setup';
import { Ring } from '@/components/nutrition/cal-ui';
import { ProBadge, ProLock } from './ProLock';
import { AskAIButton } from './AICoach';
import { niceTicks, ScrollChart } from '@/components/ui/ScrollChart';

const tooltipStyle = { borderRadius: 12, border: 'none', background: 'var(--cal-card)', color: 'var(--cal-text)', fontSize: 12 };
const tick = { fontSize: 10.5, fill: 'var(--cal-muted)' };
const ICON = { good: { Icon: CheckCircle2, color: 'var(--cal-good)' }, warn: { Icon: AlertTriangle, color: 'var(--cal-carbs)' }, info: { Icon: Info, color: 'var(--cal-fat)' } };

function Card({ title, sub, right, ask, children }: { title: string; sub?: string; right?: ReactNode; ask?: () => string; children: ReactNode }) {
  return (
    <div className="cal-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
        {(right || ask) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {right}
            {ask && <AskAIButton variant="cal" prompt={ask} />}
          </div>
        )}
      </div>
      {sub && <div className="cal-muted" style={{ fontSize: 12.5, fontWeight: 600, marginTop: 2 }}>{sub}</div>}
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function Body({ setup, byDay, goals, weights }: { setup: NutritionSetup; byDay: Map<string, NutritionMeal[]>; goals: MacroGoals; weights: { date: string; weight: number }[] }) {
  const a = setup.answers;
  const imperial = a.units === 'imperial';
  const show = (kg: number) => (imperial ? Math.round(kgToLb(kg) * 10) / 10 : Math.round(kg * 10) / 10);
  const unit = imperial ? 'lb' : 'kg';
  const t = useMemo(() => analyzeNutritionTrends(byDay, goals, a, weights, dateKey()), [byDay, goals, a, weights]);
  const days = t.days.map(d => ({ ...d, label: format(new Date(`${d.date}T12:00:00`), 'd') }));
  const weightData = t.weight.series.map(p => ({ d: p.date, w: show(p.weight), tr: show(p.trend) }));
  const weightVals = weightData.flatMap(p => [p.w, p.tr]).concat(a.goal !== 'maintain' ? [show(a.targetWeightKg)] : []);
  const weightTicks = niceTicks(Math.floor(Math.min(...weightVals) - 1), Math.ceil(Math.max(...weightVals) + 1));
  const intakeTicks = niceTicks(0, Math.max(goals.calories * 1.1, ...t.days.map(d => d.calories)));
  const calTick = { color: 'var(--cal-muted)' };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card
        title="Your real expenditure"
        sub={t.expenditure.source === 'adaptive' ? `Measured from ${t.expenditure.days} days of food and weight · ${t.expenditure.confidence} confidence` : 'Estimated from your profile until we have 10+ logged days and 3+ weigh-ins'}
        ask={() => `My ${t.expenditure.source === 'adaptive' ? `measured (${t.expenditure.days} days, ${t.expenditure.confidence} confidence)` : 'estimated'} daily expenditure is ${t.expenditure.tdee} calories. My current target is ${goals.calories} calories and the suggested target is ${t.suggestedCalories ?? t.expenditure.tdee}. My goal is to ${a.goal} weight. Should I change my calorie target?`}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <span className="cal-tabular" style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>{t.expenditure.tdee.toLocaleString()}</span>
          <span className="cal-muted" style={{ fontSize: 13, fontWeight: 700, paddingBottom: 4 }}>cal / day</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
          <div className="cal-card-2" style={{ padding: 12, borderRadius: 16 }}>
            <div className="cal-muted" style={{ fontSize: 12, fontWeight: 700 }}>Current target</div>
            <div className="cal-tabular" style={{ fontSize: 20, fontWeight: 800 }}>{goals.calories.toLocaleString()}</div>
          </div>
          <div className="cal-card-2" style={{ padding: 12, borderRadius: 16 }}>
            <div className="cal-muted" style={{ fontSize: 12, fontWeight: 700 }}>Suggested</div>
            <div className="cal-tabular" style={{ fontSize: 20, fontWeight: 800 }}>{(t.suggestedCalories ?? t.expenditure.tdee).toLocaleString()}</div>
          </div>
        </div>
      </Card>

      <Card
        title="Trend weight"
        sub={t.weight.ratePerWeek !== undefined ? `${t.weight.ratePerWeek > 0 ? '+' : ''}${show(t.weight.ratePerWeek)} ${unit} / week` : 'Weigh in a few times a week to see your trend'}
        right={t.weight.trendKg ? <span className="cal-tabular" style={{ fontSize: 18, fontWeight: 800 }}>{show(t.weight.trendKg)} {unit}</span> : undefined}
        ask={t.weight.trendKg ? () => `My trend weight is ${show(t.weight.trendKg!)} ${unit}${t.weight.ratePerWeek !== undefined ? `, changing ${show(t.weight.ratePerWeek)} ${unit} per week` : ''}. My target is ${show(a.targetWeightKg)} ${unit}${t.projection?.onTrack ? `, projected for ${t.projection.date}` : ''}. Am I on a healthy pace and what should I adjust?` : undefined}
      >
        {weightData.length >= 2 ? (
          <ScrollChart count={weightData.length} slot={22} height={160} ticks={weightTicks} top={6} bottom={24} tickStyle={calTick}>
            {w => (
              <LineChart width={w} height={160} data={weightData} margin={{ top: 6, right: 10, bottom: 0, left: 4 }}>
                <XAxis dataKey="d" height={24} tickFormatter={d => format(new Date(`${d}T12:00:00`), 'MMM d')} tick={tick} axisLine={false} tickLine={false} minTickGap={28} />
                <YAxis hide domain={[weightTicks[0], weightTicks[weightTicks.length - 1]]} allowDataOverflow />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={d => format(new Date(`${d}T12:00:00`), 'MMM d')} formatter={(v: number, k: string) => [`${v} ${unit}`, k === 'tr' ? 'Trend' : 'Scale']} />
                {a.goal !== 'maintain' && <ReferenceLine y={show(a.targetWeightKg)} stroke="var(--cal-good)" strokeDasharray="4 4" />}
                <Line isAnimationActive={false} type="monotone" dataKey="w" stroke="var(--cal-muted)" strokeWidth={0} dot={{ r: 2.5, fill: 'var(--cal-muted)' }} />
                <Line isAnimationActive={false} type="monotone" dataKey="tr" stroke="var(--cal-text)" strokeWidth={2.5} dot={false} />
              </LineChart>
            )}
          </ScrollChart>
        ) : null}
        {t.projection?.onTrack && (
          <div className="cal-card-2" style={{ padding: '10px 12px', borderRadius: 14, marginTop: 10, fontSize: 13, fontWeight: 700 }}>
            Goal {show(a.targetWeightKg)} {unit} by {format(new Date(`${t.projection.date}T12:00:00`), 'MMM d, yyyy')} <span className="cal-muted">({t.projection.weeks} weeks)</span>
          </div>
        )}
      </Card>

      <Card
        title="Consistency"
        sub="Last 30 days"
        ask={() => `In the last 30 days I was on my calorie target ${t.adherence.calories}% of days, hit my protein goal ${t.adherence.protein}% of days and logged food on ${t.adherence.logging}% of days. How can I be more consistent?`}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center' }}>
          {[
            { label: 'On calorie target', v: t.adherence.calories, color: 'var(--cal-text)' },
            { label: 'Protein goal hit', v: t.adherence.protein, color: 'var(--cal-protein)' },
            { label: 'Days logged', v: t.adherence.logging, color: 'var(--cal-good)' },
          ].map(x => (
            <div key={x.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Ring size={70} stroke={7} pct={x.v / 100} color={x.color}><span className="cal-tabular" style={{ fontSize: 15, fontWeight: 800 }}>{x.v}%</span></Ring>
              <span className="cal-muted" style={{ fontSize: 11.5, fontWeight: 700 }}>{x.label}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="30-day intake"
        right={<span className="cal-muted cal-tabular" style={{ fontSize: 12.5, fontWeight: 700 }}>Avg {t.avg30.calories.toLocaleString()} cal</span>}
        ask={() => `My daily calories over the last 30 days (logged days only): ${t.days.filter(d => d.logged).map(d => `${d.date.slice(5)} ${d.calories}`).join(', ')}. Average ${t.avg30.calories}, target ${goals.calories}. What patterns do you see?`}
      >
        <ScrollChart count={days.length} slot={18} height={150} ticks={intakeTicks} top={6} bottom={24} tickStyle={calTick}>
          {w => (
            <BarChart width={w} height={150} data={days} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
              <XAxis dataKey="label" height={24} tick={tick} axisLine={false} tickLine={false} interval={2} />
              <YAxis hide domain={[intakeTicks[0], intakeTicks[intakeTicks.length - 1]]} allowDataOverflow />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(_, p) => (p?.[0] ? format(new Date(`${(p[0].payload as { date: string }).date}T12:00:00`), 'EEE, MMM d') : '')} formatter={(v: number) => [`${v} cal`, 'Eaten']} />
              <ReferenceLine y={goals.calories} stroke="var(--cal-muted)" strokeDasharray="4 4" />
              <Bar isAnimationActive={false} dataKey="calories" radius={[4, 4, 4, 4]} maxBarSize={10}>
                {days.map(d => <Cell key={d.date} fill={!d.logged ? 'transparent' : Math.abs(d.calories - goals.calories) <= goals.calories * 0.1 ? 'var(--cal-good)' : d.calories > goals.calories ? 'var(--cal-bad)' : 'var(--cal-text)'} />)}
              </Bar>
            </BarChart>
          )}
        </ScrollChart>
      </Card>

      <Card
        title="Macros"
        sub={`Average per logged day · ${t.proteinPerKg} g protein per kg`}
        ask={() => `My average macros per logged day over 30 days: protein ${t.avg30.protein}g (goal ${goals.protein}g, ${t.proteinPerKg} g/kg), carbs ${t.avg30.carbs}g (goal ${goals.carbs}g), fat ${t.avg30.fat}g (goal ${goals.fat}g). Split ${t.split.protein}% protein / ${t.split.carbs}% carbs / ${t.split.fat}% fat. How should I adjust my diet?`}
      >
        <div style={{ display: 'flex', height: 10, borderRadius: 10, overflow: 'hidden', gap: 2 }}>
          <div style={{ width: `${t.split.protein}%`, background: 'var(--cal-protein)' }} />
          <div style={{ width: `${t.split.carbs}%`, background: 'var(--cal-carbs)' }} />
          <div style={{ width: `${t.split.fat}%`, background: 'var(--cal-fat)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
          {([['Protein', 'protein', 'var(--cal-protein)'], ['Carbs', 'carbs', 'var(--cal-carbs)'], ['Fat', 'fat', 'var(--cal-fat)']] as const).map(([label, k, color]) => (
            <div key={k}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }} className="cal-muted"><span style={{ width: 8, height: 8, borderRadius: 8, background: color }} />{label} {t.split[k]}%</div>
              <div className="cal-tabular" style={{ fontSize: 18, fontWeight: 800 }}>{t.avg7[k] || t.avg30[k]}g</div>
              <div className="cal-muted cal-tabular" style={{ fontSize: 11.5, fontWeight: 600 }}>30d {t.avg30[k]}g · goal {goals[k]}g</div>
            </div>
          ))}
        </div>
      </Card>

      {(t.meals.length > 0 || t.topFoods.length > 0) && (
        <Card title="Eating patterns" sub="Last 30 days">
          {t.meals.map(m => (
            <div key={m.type} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              <span style={{ width: 76, textTransform: 'capitalize' }}>{m.type}</span>
              <div className="cal-card-2" style={{ flex: 1, height: 8, borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ width: `${m.share}%`, height: '100%', background: 'var(--cal-text)', borderRadius: 8 }} />
              </div>
              <span className="cal-tabular cal-muted" style={{ width: 92, textAlign: 'right' }}>{m.avgCalories} cal · {m.share}%</span>
            </div>
          ))}
          {t.topFoods.length > 0 && (
            <>
              <div className="cal-muted" style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '14px 0 6px' }}>Most eaten</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {t.topFoods.map(f => (
                  <span key={f.name} className="cal-card-2" style={{ padding: '6px 10px', borderRadius: 999, fontSize: 12.5, fontWeight: 700 }}>{f.name} <span className="cal-muted">×{f.count}</span></span>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {t.insights.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {t.insights.map((ins, i) => {
            const { Icon, color } = ICON[ins.tone];
            return (
              <div key={i} className="cal-card" style={{ padding: 14, display: 'flex', gap: 10 }}>
                <Icon size={17} style={{ color, flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{ins.title}</div>
                  <div className="cal-muted" style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.45, marginTop: 2 }}>{ins.text}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Pro: adaptive expenditure, trend weight, adherence, macros and eating patterns. */
export function NutritionInsights(props: { setup: NutritionSetup; byDay: Map<string, NutritionMeal[]>; goals: MacroGoals; weights: { date: string; weight: number }[] }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 2px 0' }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>Smart insights</div>
        <ProBadge />
      </div>
      <ProLock variant="cal" title="Smart nutrition insights" reason="See your real calorie burn, trend weight and goal date, consistency, macro averages and eating patterns with Apparatus Pro." maxHeight={560}>
        <Body {...props} />
      </ProLock>
    </div>
  );
}
