import { AlertTriangle, CheckCircle2, Info, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Insight } from '@/lib/analysis-common';
import { useHasPro } from '@/stores/subscription-store';
import { ProLock } from '@/components/insights/ProLock';

export const TONE_STYLE = {
  up: { background: 'rgba(5, 150, 105, 0.12)', color: '#059669' },
  down: { background: 'rgba(225, 29, 72, 0.12)', color: '#e11d48' },
  flat: { background: 'rgba(107, 114, 128, 0.14)', color: '#6b7280' },
  new: { background: 'rgba(2, 132, 199, 0.12)', color: '#0284c7' },
};

export type Trend = keyof typeof TONE_STYLE;

export const trendOf = (change?: number, higherIsBetter = true): Trend => {
  if (change === undefined) return 'new';
  if (change === 0) return 'flat';
  return (change > 0) === higherIsBetter ? 'up' : 'down';
};

export function TrendChip({ trend, children }: { trend: Trend; children: ReactNode }) {
  return <span className="shrink-0 px-1.5 py-px rounded-md font-mono text-[11px] font-bold" style={TONE_STYLE[trend]}>{children}</span>;
}

export function Headline({ trend, title, subtitle }: { trend: Trend; title: string; subtitle: string }) {
  const Icon = trend === 'down' ? TrendingDown : trend === 'up' ? TrendingUp : Minus;
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl bg-bone/[0.04] border border-line/60">
      <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={TONE_STYLE[trend]}>
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-bone">{title}</div>
        <div className="text-[11.5px] text-bone-dim leading-snug">{subtitle}</div>
      </div>
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 mt-5 mb-2">
      <h3 className="text-[12px] font-semibold uppercase tracking-wider text-bone-dim">{children}</h3>
      {right && <span className="text-[11px] text-bone-dim">{right}</span>}
    </div>
  );
}

export function StatGrid({ items }: { items: { label: string; value: string; unit?: string; sub?: ReactNode }[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(s => (
        <div key={s.label} className="rounded-xl px-2.5 py-2 bg-bone/[0.04] border border-line/50 min-w-0">
          <div className="text-[10.5px] text-bone-dim truncate">{s.label}</div>
          <div className="text-[15px] font-bold text-bone tabular-nums truncate">
            {s.value}{s.unit && <span className="text-[10px] font-medium text-bone-dim ml-0.5">{s.unit}</span>}
          </div>
          {s.sub && <div className="text-[10.5px] text-bone-dim truncate">{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}

const INSIGHT_ICON = {
  good: { icon: CheckCircle2, color: '#059669' },
  warn: { icon: AlertTriangle, color: '#d97706' },
  info: { icon: Info, color: '#0284c7' },
};

export function InsightList({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;
  return (
    <ul className="space-y-2">
      {insights.map((insight, i) => {
        const { icon: Icon, color } = INSIGHT_ICON[insight.tone];
        return (
          <li key={i} className="flex gap-2.5 p-3 rounded-2xl border border-line/60">
            <Icon size={16} className="shrink-0 mt-0.5" style={{ color }} />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-bone leading-snug">{insight.title}</div>
              <p className="text-[12px] text-bone-dim leading-relaxed mt-0.5">{insight.text}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** First `free` insights for everyone; the rest are part of Pro. */
export function GatedInsights({ insights, free = 2 }: { insights: Insight[]; free?: number }) {
  const hasPro = useHasPro();
  if (hasPro || insights.length <= free) return <InsightList insights={insights} />;
  const rest = insights.length - free;
  return (
    <div className="space-y-2">
      <InsightList insights={insights.slice(0, free)} />
      <ProLock compact title={`${rest} more coaching insight${rest > 1 ? 's' : ''}`} maxHeight={150}>
        <InsightList insights={insights.slice(free, free + 2)} />
      </ProLock>
    </div>
  );
}

/** "before → after" with a signed delta chip. */
export function Compare({ label, before, after, delta, trend }: { label: string; before?: string; after: string; delta?: string; trend?: Trend }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11.5px]">
      <span className="text-bone-dim">{label}</span>
      <span className="flex items-center gap-1.5 font-mono tabular-nums">
        {before !== undefined && <span className="text-bone-dim">{before} →</span>}
        <span className="text-bone font-semibold">{after}</span>
        {delta && trend && <TrendChip trend={trend}>{delta}</TrendChip>}
      </span>
    </div>
  );
}
