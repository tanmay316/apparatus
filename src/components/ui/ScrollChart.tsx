import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** Round tick values covering [lo, hi]; first and last tick are the chart's Y domain. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (hi - lo < 1e-9) hi = lo + 1;
  const raw = (hi - lo) / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.floor(lo / step) * step; out.length < 12; v += step) {
    out.push(Math.round(v * 1e6) / 1e6);
    if (v >= hi - step * 1e-6) break;
  }
  return out;
}

const shortNum = (v: number) => (Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(1)}k` : `${+v.toFixed(1)}`);

/**
 * Swipeable chart: fixed Y-axis labels on the left, the plot scrolls horizontally (no visible
 * scrollbar) and opens at the latest data. Children render the chart at the given pixel width with
 * a hidden YAxis using `domain={[ticks[0], ticks.at(-1)]}` and the same top/bottom margins.
 */
export function ScrollChart({ count, slot, height, ticks, top, bottom, axisWidth = 36, format = shortNum, tickStyle, children }: {
  count: number;
  /** Minimum px per data point. */
  slot: number;
  height: number;
  ticks: number[];
  /** Chart top margin. */
  top: number;
  /** Chart bottom margin + X axis height. */
  bottom: number;
  axisWidth?: number;
  format?: (v: number) => string;
  tickStyle?: CSSProperties;
  children: (width: number) => ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const viewW = Math.max(0, width - axisWidth);
  const contentW = Math.max(viewW, count * slot);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [contentW, count, width > 0]);

  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const plotH = height - top - bottom;
  const yOf = (v: number) => top + (1 - (v - lo) / (hi - lo || 1)) * plotH;

  return (
    <div ref={outer} style={{ position: 'relative', width: '100%', height }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: axisWidth, height, pointerEvents: 'none' }}>
        {ticks.map(t => (
          <span
            key={t}
            className="tabular-nums"
            style={{ position: 'absolute', right: 6, top: yOf(t), transform: 'translateY(-50%)', fontSize: 10.5, lineHeight: 1, whiteSpace: 'nowrap', ...tickStyle }}
          >
            {format(t)}
          </span>
        ))}
      </div>
      <div
        ref={scroller}
        className="[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ position: 'absolute', left: axisWidth, right: 0, top: 0, bottom: 0, overflowX: 'auto', overflowY: 'hidden', overscrollBehaviorX: 'contain' }}
      >
        {width > 0 && <div style={{ width: contentW, height }}>{children(contentW)}</div>}
      </div>
    </div>
  );
}
