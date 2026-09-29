export type InsightTone = 'good' | 'warn' | 'info';
export interface Insight { tone: InsightTone; title: string; text: string }

export function startMs(item: { startedAt?: any; date?: string }): number {
  const ts = item.startedAt;
  if (ts?.toMillis) return ts.toMillis();
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
  const t = item.date ? new Date(`${item.date}T12:00:00`).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

export function shiftDate(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, (d || 1) + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
