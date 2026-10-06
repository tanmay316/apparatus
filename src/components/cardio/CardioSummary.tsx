import { useMemo } from 'react';
import { Check, Loader2, Share2, AlertTriangle, CloudOff } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { RouteMap } from '@/components/cardio/RouteMap';
import { CardioAnalysisView } from '@/components/analysis/CardioAnalysisView';
import { analyzeCardio } from '@/lib/cardio-analysis';
import type { CardioActivity } from '@/types';
import { CARDIO_TYPES, formatDuration, formatDurationShort, primaryRate } from './cardio-format';
import { CardioVisibilityPicker, type CardioVisibility } from './CardioVisibilityPicker';

export const EFFORT_LEVELS = [
  { id: 'easy', emoji: '😌', label: 'Easy' },
  { id: 'moderate', emoji: '🙂', label: 'Moderate' },
  { id: 'hard', emoji: '😅', label: 'Hard' },
  { id: 'brutal', emoji: '🥵', label: 'Brutal' },
  { id: 'max_effort', emoji: '💀', label: 'Max' },
] as const;

export type SaveState = 'saving' | 'saved' | 'skipped' | 'error';

interface Props {
  data: Partial<CardioActivity>;
  saveState: SaveState;
  effort: string;
  onEffort: (id: string) => void;
  notes: string;
  onNotes: (v: string) => void;
  onShare: () => void;
  onDone: () => void;
  onRetry: () => void;
  visibility: CardioVisibility;
  onVisibility: (v: CardioVisibility) => void;
  /** Earlier sessions, for comparison and coaching. Undefined while they load. */
  history?: CardioActivity[];
}

export function CardioSummary({ data, saveState, effort, onEffort, notes, onNotes, onShare, onDone, onRetry, visibility, onVisibility, history }: Props) {
  const theme = useUIStore(s => s.theme);
  const type = data.type || 'run';
  const meta = CARDIO_TYPES[type];
  const rate = primaryRate({
    type, distanceKm: data.distanceKm || 0, avgSpeedKmh: data.avgSpeedKmh || 0,
    movingDurationSec: data.movingDurationSec, durationSec: data.durationSec || 0,
  });
  const hasRoute = Array.isArray(data.route) && data.route.length > 1;

  const current = useMemo(() => {
    if (!data.distanceKm || data.distanceKm <= 0.01) return null;
    return {
      ...data,
      type,
      route: data.route || [],
      startedAt: data.startedAt ?? { seconds: Math.floor(Date.now() / 1000) },
    } as CardioActivity;
  }, [data, type]);
  const analysis = useMemo(() => (current && history ? analyzeCardio(current, history) : null), [current, history]);

  const stats = [
    { label: 'Moving time', value: formatDuration(data.durationSec || 0), unit: '' },
    { label: rate.label, value: rate.value, unit: rate.unit },
    { label: 'Calories', value: String(data.calories || 0), unit: 'kcal' },
    { label: 'Elevation', value: String(data.elevationGainM || 0), unit: 'm' },
    { label: 'Max speed', value: (data.maxSpeedKmh || 0).toFixed(1), unit: 'km/h' },
    data.steps
      ? { label: 'Steps', value: data.steps.toLocaleString(), unit: '' }
      : { label: 'Paused', value: formatDurationShort(data.pausedDurationSec || 0), unit: '' },
  ];

  return (
    <div className="dx max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3 pt-1">
        <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${meta.tint}`}><meta.icon size={22} /></span>
        <div className="min-w-0">
          <div className="dx-eyebrow">Session complete</div>
          <h1 className="text-2xl font-black tracking-tight">{meta.label} finished</h1>
        </div>
        <SaveBadge state={saveState} onRetry={onRetry} />
      </div>

      <section className="dx-card overflow-hidden">
        {hasRoute ? (
          <div className="relative h-56 sm:h-64 pointer-events-none">
            <RouteMap
              route={data.route!}
              theme={theme === 'dark' ? 'dark' : 'light'}
              height="100%"
              fitToContainer
              interactive={false}
              variant="card"
              noGlow
              highlightColor={meta.accent}
              cardioType={type}
              mapPaddingTopLeft={[24, 24]}
              mapPaddingBottomRight={[24, 64]}
            />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--dx-card)] to-transparent" />
          </div>
        ) : null}
        <div className={`px-5 ${hasRoute ? '-mt-12 relative' : 'pt-5'} pb-5`}>
          <div className="flex items-baseline gap-1.5">
            <span className="text-5xl font-black tabular-nums tracking-tight">{(data.distanceKm || 0).toFixed(2)}</span>
            <span className="text-base font-semibold text-[var(--dx-muted)]">km</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {stats.map(s => (
              <div key={s.label} className="dx-inset rounded-xl px-2.5 py-2.5">
                <div className="text-[10.5px] text-[var(--dx-muted)] truncate">{s.label}</div>
                <div className="text-[16px] font-bold tabular-nums">{s.value}{s.unit && <span className="text-[10px] font-medium text-[var(--dx-muted)] ml-0.5">{s.unit}</span>}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {analysis ? (
        <section className="dx-card p-4 sm:p-5">
          <h2 className="text-sm font-bold mb-3">Session analysis</h2>
          <CardioAnalysisView analysis={analysis} activity={current ?? undefined} history={history} />
        </section>
      ) : current && !history && (
        <section className="dx-card p-4 sm:p-5 flex items-center gap-2.5 text-[13px] text-[var(--dx-muted)]">
          <Loader2 size={16} className="animate-spin shrink-0" /> Comparing with your past sessions…
        </section>
      )}

      <section className="dx-card p-4 sm:p-5">
        <h2 className="text-sm font-bold mb-3">How did it feel?</h2>
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Effort">
          {EFFORT_LEVELS.map(e => (
            <button
              key={e.id}
              role="radio"
              aria-checked={effort === e.id}
              onClick={() => onEffort(e.id)}
              className={`py-2 rounded-xl flex flex-col items-center gap-0.5 border transition-colors ${
                effort === e.id ? 'border-[var(--dx-accent)] bg-[var(--dx-accent-soft)] text-[var(--dx-text)]' : 'border-[var(--dx-border)] text-[var(--dx-muted)]'
              }`}
            >
              <span className="text-xl leading-none">{e.emoji}</span>
              <span className="text-[10.5px] font-semibold">{e.label}</span>
            </button>
          ))}
        </div>
        <label htmlFor="cardio-notes" className="block text-sm font-bold mt-4 mb-2">Notes</label>
        <textarea
          id="cardio-notes"
          value={notes}
          maxLength={500}
          onChange={e => onNotes(e.target.value)}
          rows={3}
          placeholder="Route, weather, how your legs felt…"
          className="w-full rounded-xl px-3 py-2.5 text-sm bg-[var(--dx-card-2)] border border-[var(--dx-border)] text-[var(--dx-text)] placeholder:text-[var(--dx-muted)] focus:outline-none focus:border-[var(--dx-accent)] resize-none"
        />
        {saveState !== 'skipped' && (
          <>
            <h2 className="text-sm font-bold mt-4 mb-2">Who can see this</h2>
            <CardioVisibilityPicker value={visibility} onChange={onVisibility} disabled={saveState === 'saving'} />
          </>
        )}
      </section>

      <div className="sticky z-10 -mx-4 px-4 pt-3 pb-3 bg-gradient-to-t from-[rgb(var(--color-ink-3))] via-[rgb(var(--color-ink-3))] to-transparent" style={{ bottom: 0, paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
        <div className="flex gap-2">
          <button onClick={onShare} className="dx-btn-secondary flex-1 !h-12 !rounded-2xl gap-2"><Share2 size={17} /> Share</button>
          <button onClick={onDone} disabled={saveState === 'saving'} className="dx-btn flex-[1.4] !h-12 !rounded-2xl gap-2">
            {saveState === 'saving' ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />} Done
          </button>
        </div>
      </div>
    </div>
  );
}

function SaveBadge({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === 'saving') return <span className="ml-auto dx-pill dx-pill--neutral"><Loader2 size={11} className="animate-spin" /> Saving</span>;
  if (state === 'saved') return <span className="ml-auto dx-pill dx-pill--success"><Check size={11} /> Saved</span>;
  if (state === 'skipped') return <span className="ml-auto dx-pill dx-pill--neutral" title="Sessions under 10 m are not saved"><CloudOff size={11} /> Too short</span>;
  return (
    <button onClick={onRetry} className="ml-auto dx-pill bg-rose-500/12 text-rose-500"><AlertTriangle size={11} /> Retry save</button>
  );
}
