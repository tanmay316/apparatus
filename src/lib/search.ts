import Fuse, { type FuseOptionKey } from 'fuse.js';

export function normalizeQuery(q: string) {
  return q.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface Hit<T> { item: T; score: number }

/**
 * Fuzzy index tuned for short titles: location-independent matching, a 2-char minimum and a
 * boost for literal word-start matches so "push" ranks "Push-up" above "Pull-up".
 */
export function createSearchIndex<T>(items: T[], keys: FuseOptionKey<T>[], title: (item: T) => string) {
  const fuse = new Fuse(items, {
    keys,
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.34,
    minMatchCharLength: 2,
  });
  return (rawQuery: string, max = 50): Hit<T>[] => {
    const q = normalizeQuery(rawQuery);
    if (q.length < 2) return [];
    return fuse
      .search(q, { limit: max * 2 })
      .map(r => {
        const t = normalizeQuery(title(r.item));
        let score = r.score ?? 1;
        if (t === q) score *= 0.1;
        else if (t.startsWith(q)) score *= 0.3;
        else if (t.split(/[\s\-_/]+/).some(w => w.startsWith(q))) score *= 0.5;
        else if (t.includes(q)) score *= 0.7;
        return { item: r.item, score };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, max);
  };
}

/** Splits text into plain / matched segments for highlighting the query. */
export function highlightParts(text: string, rawQuery: string): { text: string; match: boolean }[] {
  const q = rawQuery.trim();
  if (!text || q.length < 2) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: { text: string; match: boolean }[] = [];
  let i = 0;
  for (let idx = lower.indexOf(needle); idx !== -1; idx = lower.indexOf(needle, i)) {
    if (idx > i) parts.push({ text: text.slice(i, idx), match: false });
    parts.push({ text: text.slice(idx, idx + needle.length), match: true });
    i = idx + needle.length;
  }
  if (i < text.length) parts.push({ text: text.slice(i), match: false });
  return parts.length ? parts : [{ text, match: false }];
}

// ─── Recent searches ─────────────────────────────────────────

const RECENT_KEY = 'apparatus_recent_searches';
const RECENT_MAX = 8;

export function getRecentSearches(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(q: string): string[] {
  const clean = q.trim().slice(0, 80);
  if (clean.length < 2) return getRecentSearches();
  const next = [clean, ...getRecentSearches().filter(s => s.toLowerCase() !== clean.toLowerCase())].slice(0, RECENT_MAX);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}

export function removeRecentSearch(q: string): string[] {
  const next = getRecentSearches().filter(s => s !== q);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}

export function clearRecentSearches() {
  localStorage.removeItem(RECENT_KEY);
}

// ─── In-app destinations ─────────────────────────────────────

export interface QuickLink { label: string; path: string; keywords: string }

export const QUICK_LINKS: QuickLink[] = [
  { label: 'Start cardio', path: '/cardio', keywords: 'run walk ride cycle gps cardio track' },
  { label: 'My plans', path: '/plans', keywords: 'plans program workout routine' },
  { label: 'Explore plans', path: '/explore', keywords: 'explore sample programs discover' },
  { label: 'Progress & calendar', path: '/progress', keywords: 'progress calendar history stats chart' },
  { label: 'Nutrition', path: '/nutrition', keywords: 'nutrition food meals calories macros diet' },
  { label: 'Skills', path: '/skills', keywords: 'skills calisthenics handstand planche muscle up tutor' },
  { label: 'Body log', path: '/measurements', keywords: 'body weight measurements log fat' },
  { label: 'Achievements', path: '/achievements', keywords: 'achievements badges medals trophies' },
  { label: 'Athlete ranks', path: '/ranks', keywords: 'rank tier level athlete' },
  { label: 'Activity feed', path: '/feed', keywords: 'feed activity posts friends following' },
  { label: 'Clans & events', path: '/community', keywords: 'community clans events challenges' },
  { label: 'Settings', path: '/settings', keywords: 'settings preferences account privacy notifications theme units' },
];

export const searchQuickLinks = createSearchIndex(QUICK_LINKS, [{ name: 'label', weight: 2 }, { name: 'keywords', weight: 1 }], l => l.label);
