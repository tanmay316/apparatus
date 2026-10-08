import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2, MessageCircle, RefreshCw, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { CAN_UPSELL, requirePro, useHasPro, useSubscriptionStore } from '@/stores/subscription-store';
import {
  askCoach, buildWeeklyFacts, getCachedSummary, lastWeekRange, ProRequiredError, requestSummary, type AISummary, type SummaryKind,
} from '@/services/ai-insights';
import type { Facts } from '@/lib/ai-facts';
import { localDateKey } from '@/lib/stats';
import type { CardioActivity, Workout } from '@/types';
import { ProBadge, ProLock } from './ProLock';
import { BRAND } from '@/lib/brand';

const SAMPLE: AISummary = {
  headline: 'Your fastest 5 km this month',
  points: ['Second half was quicker than the first: smart pacing.', 'Weekly distance rose steadily without a big jump.', 'Fatigue is building, so recovery matters this week.'],
  action: 'Keep tomorrow easy and conversational, then do intervals on Thursday.',
  source: 'ai',
};

/** Opens the AI coach with a question about what's on screen (Pro). */
export function AskAIButton({ prompt, variant = 'app', label = 'Ask AI' }: { prompt: string | (() => string); variant?: 'app' | 'cal'; label?: string }) {
  const hasPro = useHasPro();
  if (!hasPro && !CAN_UPSELL) return null;
  const onClick = () => {
    if (!requirePro(`Ask the AI coach about your charts and sessions with ${BRAND.name} Pro.`)) return;
    askCoach(typeof prompt === 'function' ? prompt() : prompt);
  };
  const cal = variant === 'cal';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cal ? 'cal-card-2' : 'shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11.5px] font-semibold border border-line/60 text-bone hover:bg-bone/[0.06]'}
      style={cal ? { display: 'inline-flex', alignItems: 'center', gap: 4, height: 28, padding: '0 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 } : undefined}
    >
      <Sparkles size={12} style={{ color: '#d97706' }} /> {label}
    </button>
  );
}

/** Characters of `total` shown so far; types out at ~120 chars/s when enabled. */
function useReveal(total: number, enabled: boolean) {
  const [shown, setShown] = useState(enabled ? 0 : total);
  useEffect(() => {
    if (!enabled) { setShown(total); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const n = Math.min(total, Math.round(((now - start) / 1000) * 120));
      setShown(n);
      if (n < total) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [total, enabled]);
  return shown;
}

function SummaryBody({ s, askPrompt, cal, reveal }: { s: AISummary; askPrompt?: string; cal?: boolean; reveal?: boolean }) {
  const muted = cal ? 'cal-muted' : 'text-bone-dim';
  const parts = [s.headline, ...s.points, s.action || ''];
  const shown = useReveal(parts.reduce((n, p) => n + p.length, 0), !!reveal);
  let budget = shown;
  const [headline, ...rest] = parts.map(p => {
    const out = p.slice(0, Math.max(0, budget));
    budget -= p.length;
    return out;
  });
  const action = rest.pop() || '';
  const points = rest;
  const done = shown >= parts.reduce((n, p) => n + p.length, 0);
  return (
    <>
      <div className={`text-[16px] font-semibold leading-snug ${cal ? '' : 'text-bone'}`}>{headline}</div>
      <ul className="mt-2 space-y-1.5">
        {points.map((p, i) => p && (
          <li key={i} className={`flex gap-2 text-[13px] leading-relaxed ${muted}`}>
            <span className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#d97706' }} />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      {action && (
        <div className="mt-3 flex gap-2 items-start p-2.5 rounded-xl text-[13px] font-semibold" style={{ background: 'rgba(217,119,6,0.12)', color: cal ? 'var(--cal-text)' : 'rgb(var(--color-bone))' }}>
          <ArrowRight size={15} className="shrink-0 mt-0.5" style={{ color: '#d97706' }} /> {action}
        </div>
      )}
      {askPrompt && done && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className={`text-[10.5px] ${muted}`}>{s.source === 'fallback' ? 'Quick summary · the AI coach was busy' : 'AI coach · based on your numbers only'}</span>
          <AskAIButton variant={cal ? 'cal' : 'app'} label="Ask a follow-up" prompt={`${askPrompt}\n\nYour summary: ${s.headline}. ${s.points.join(' ')} Next: ${s.action}\n\nExplain this in more detail and tell me exactly what to do next.`} />
        </div>
      )}
    </>
  );
}

type SummaryCardProps = {
  kind: SummaryKind;
  summaryKey: string;
  facts: () => Facts | null | Promise<Facts | null>;
  askPrompt?: string;
  variant?: 'app' | 'cal';
  title?: string;
};

/**
 * AI coach summary for a session or the week. Pro users get it automatically; free users can
 * make 1 session summary a week, after which (and for the weekly report) they see a teaser.
 */
export function AISummaryCard(props: SummaryCardProps) {
  // Remount per session so state from a previously selected session never leaks.
  return <SummaryCard key={`${props.kind}_${props.summaryKey}`} {...props} />;
}

/** Last week's report on the Progress overview; hidden when nothing was logged that week. */
export function WeeklyReportCard({ workouts, cardio }: { workouts: Workout[]; cardio: CardioActivity[] }) {
  const uid = useAuthStore(s => s.user?.uid);
  const range = useMemo(() => lastWeekRange(localDateKey()), []);
  const inWeek = (d?: string) => !!d && d >= range.start && d <= range.end;
  const active = workouts.some(w => inWeek(w.date)) || cardio.some(c => inWeek(c.date));
  if (!uid || !active) return null;
  return (
    <AISummaryCard
      kind="weekly"
      summaryKey={range.key}
      facts={() => buildWeeklyFacts(uid, range, { workouts, cardio })}
      askPrompt={`About my training week ${range.start} to ${range.end}.`}
    />
  );
}

function SummaryCard({ kind, summaryKey, facts, askPrompt, variant = 'app', title }: SummaryCardProps) {
  const uid = useAuthStore(s => s.user?.uid);
  const hasPro = useHasPro();
  const usage = useSubscriptionStore(s => s.usage.ai_summary);
  const queryClient = useQueryClient();
  const qk = ['ai-summary', uid, kind, summaryKey];
  const cached = useQuery({ queryKey: qk, queryFn: () => getCachedSummary(uid!, kind, summaryKey), enabled: !!uid, staleTime: Infinity });
  const [fresh, setFresh] = useState<AISummary | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'locked' | 'empty'>('idle');
  const [errMsg, setErrMsg] = useState('');
  const tried = useRef(false);

  const generate = async () => {
    if (!uid) return;
    setStatus('loading');
    try {
      const f = await facts();
      if (!f) { setStatus('empty'); return; }
      const res = await requestSummary(kind, summaryKey, f);
      setFresh(res);
      setStatus('idle');
      if (res.source === 'ai') {
        queryClient.setQueryData(qk, res);
        if (!hasPro && !res.cached) useSubscriptionStore.getState().bumpUsage('ai_summary');
      }
    } catch (err) {
      setErrMsg(err instanceof Error && !(err instanceof TypeError) ? err.message : '');
      setStatus(err instanceof ProRequiredError ? 'locked' : 'error');
    }
  };

  useEffect(() => {
    if (tried.current || !uid || !cached.isSuccess || cached.data || !hasPro) return;
    tried.current = true;
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, cached.isSuccess, cached.data, hasPro, summaryKey]);

  const s = fresh || cached.data;
  const cal = variant === 'cal';
  const shell = cal ? 'cal-card' : 'rounded-2xl border p-3.5 sm:p-4';
  const shellStyle = cal ? { padding: 16 } : { borderColor: 'rgba(217,119,6,0.35)', background: 'linear-gradient(135deg, rgba(217,119,6,0.08), transparent 60%)' };
  const header = (
    <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#d97706' }}>
      <Sparkles size={13} /> {title || (kind === 'weekly' ? 'Weekly AI coach report' : 'AI coach')}
      <span className="ml-auto"><ProBadge /></span>
    </div>
  );

  if (status === 'empty') return null;
  if (s) return <div className={shell} style={shellStyle}>{header}<SummaryBody s={s} askPrompt={askPrompt} cal={cal} reveal={!!fresh && !fresh.cached} /></div>;

  if (status === 'loading' || (hasPro && (cached.isLoading || !tried.current))) {
    return (
      <div className={shell} style={shellStyle}>
        {header}
        <div className={`flex items-center gap-2 text-[13px] ${cal ? 'cal-muted' : 'text-bone-dim'}`}>
          <Loader2 size={15} className="animate-spin" /> {kind === 'weekly' ? 'Writing your weekly report…' : 'Reading your session…'}
        </div>
      </div>
    );
  }

  const outOfFree = !!usage && usage.used >= usage.limit;
  if (!hasPro && (kind === 'weekly' || status === 'locked' || outOfFree)) {
    return (
      <ProLock
        variant={variant}
        title={kind === 'weekly' ? 'Weekly AI coach report' : 'Unlimited AI summaries'}
        reason={kind === 'weekly' ? 'Every Monday, a personal report on your training, recovery and nutrition.' : "You've used this week's free AI summary. Pro gives you one for every session."}
        maxHeight={260}
      >
        <div className={shell} style={shellStyle}>{header}<SummaryBody s={SAMPLE} cal={cal} /></div>
      </ProLock>
    );
  }

  return (
    <div className={shell} style={shellStyle}>
      {header}
      {status === 'error' ? (
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[13px] ${cal ? 'cal-muted' : 'text-bone-dim'}`}>{errMsg || 'The AI coach is busy right now.'}</span>
          <button type="button" onClick={generate} className="inline-flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: '#d97706' }}><RefreshCw size={13} /> Retry</button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className={`text-[13px] leading-snug ${cal ? 'cal-muted' : 'text-bone-dim'}`}>
            Get a plain-English breakdown of this {kind === 'cardio' ? 'session' : 'workout'} and what to do next.
            {!hasPro && <b className={cal ? '' : 'text-bone'}> 1 free this week.</b>}
          </span>
          <button type="button" onClick={generate} className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-semibold" style={{ background: 'linear-gradient(135deg,#f5b544,#d97706)', color: '#1a1206' }}>
            <MessageCircle size={14} /> Summarise
          </button>
        </div>
      )}
    </div>
  );
}
