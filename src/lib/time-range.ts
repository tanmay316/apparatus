import { shiftDate } from '@/lib/analysis-common';

/** Shared time filter for Progress and Pro analytics. */
export type TimeRange = '7d' | '30d' | '90d' | '1y' | 'all';

export const RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '1M' },
  { value: '90d', label: '3M' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'All' },
];

export const RANGE_LABEL: Record<TimeRange, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 3 months',
  '1y': 'Last 12 months',
  all: 'All time',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const parts = (key: string) => key.split('-').map(Number) as [number, number, number];

function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** First day (inclusive) of the range. "All" starts at the earliest record, or a year back without one. */
export function rangeStart(range: TimeRange, asOf: string, earliest?: string | null): string {
  switch (range) {
    case '7d': return shiftDate(asOf, -6);
    case '30d': return shiftDate(asOf, -29);
    case '90d': return shiftDate(asOf, -89);
    case '1y': return shiftDate(asOf, -364);
    case 'all': return earliest && earliest < asOf ? earliest : shiftDate(asOf, -364);
  }
}

export function rangeDays(range: TimeRange, asOf: string, earliest?: string | null): number {
  return daysBetween(rangeStart(range, asOf, earliest), asOf) + 1;
}

export function earliestDate(...lists: { date?: string }[][]): string | null {
  let min: string | null = null;
  for (const list of lists) for (const x of list) if (x.date && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && (!min || x.date < min)) min = x.date;
  return min;
}

export interface RangeBucket { start: string; end: string; label: string }
export type BucketSize = 'day' | 'week' | 'month';

/** Day buckets up to a month, weeks up to ~6 months, months beyond. */
export function bucketSize(range: TimeRange, asOf: string, earliest?: string | null): BucketSize {
  const days = rangeDays(range, asOf, earliest);
  return days <= 31 ? 'day' : days <= 190 ? 'week' : 'month';
}

export function rangeBuckets(range: TimeRange, asOf: string, earliest?: string | null): RangeBucket[] {
  const start = rangeStart(range, asOf, earliest);
  const size = bucketSize(range, asOf, earliest);
  const out: RangeBucket[] = [];
  if (size === 'day') {
    for (let d = start; d <= asOf; d = shiftDate(d, 1)) {
      const [y, m, dd] = parts(d);
      out.push({ start: d, end: d, label: range === '7d' ? DAYS[new Date(y, m - 1, dd).getDay()] : `${dd} ${MONTHS[m - 1]}` });
    }
    return out;
  }
  if (size === 'week') {
    const [y, m, d] = parts(start);
    let ws = shiftDate(start, -((new Date(y, m - 1, d).getDay() + 6) % 7));
    while (ws <= asOf) {
      const [, mm, dd] = parts(ws);
      out.push({ start: ws, end: shiftDate(ws, 6), label: `${dd} ${MONTHS[mm - 1]}` });
      ws = shiftDate(ws, 7);
    }
    return out;
  }
  let [y, m] = parts(start);
  const [ey, em] = parts(asOf);
  const multiYear = y !== ey;
  while (y < ey || (y === ey && m <= em)) {
    const s = `${y}-${String(m).padStart(2, '0')}-01`;
    const e = `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    out.push({ start: s, end: e, label: multiYear ? `${MONTHS[m - 1]} ’${String(y).slice(2)}` : MONTHS[m - 1] });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** Index of the bucket that holds `date`, or -1. Buckets must be sorted and contiguous. */
export function bucketIndex(buckets: RangeBucket[], date: string): number {
  let lo = 0;
  let hi = buckets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (date < buckets[mid].start) hi = mid - 1;
    else if (date > buckets[mid].end) lo = mid + 1;
    else return mid;
  }
  return -1;
}
