import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { EXERCISE_ONTOLOGY } from './exercise-ontology';

const YT_WEB_KEY = 'AIzaSyA3NioUdgkc2Lh9YBxtl5ZgSctL2-izpII';
const YT_ANDROID_KEY = 'AIzaSyD0XhRfSlGyZZLQXx8A7hM5WPMOcg2UycE';

const INVIDIOUS_INSTANCES = [
  'https://inv.tux.pizza',
  'https://invidious.flokinet.to',
  'https://invidious.nerdvpn.de',
  'https://invidious.slipfox.xyz',
  'https://inv.nkl.sh',
  'https://invidious.einfachzocken.eu',
  'https://vid.puffyan.us',
  'https://invidious.fdn.fr'
];

export interface CuratedExerciseEntry {
  youtubeId: string;
  alternates?: string[];
  verifiedAt: string;
}

export const EXERCISE_VIDEO_MAP: Record<string, CuratedExerciseEntry> = {
  // 100% Verified YouTube Fitness Technique Videos
  "push up": { youtubeId: "IODxDxXQbk4", alternates: ["Wphvhfl4f8g", "_4EGPVYuqCQ", "Y-5s5u96r3M"], verifiedAt: "2024-01-01" },
  "pull up": { youtubeId: "eGo4IYL9INw", alternates: ["brhRXlOhsAM", "_7jWf2yY6h0", "dvkRYjVp4lc"], verifiedAt: "2024-01-01" },
  "bench press": { youtubeId: "4Y2ZdHCOXok", alternates: ["rT7DgCr-3pg", "vthMCtgVtVU"], verifiedAt: "2024-01-01" },
  "squat": { youtubeId: "gcNh17Ckjgg", alternates: ["bEv6CCg2BC8", "0tn5K9NlCfo"], verifiedAt: "2024-01-01" },
  "deadlift": { youtubeId: "r4MzxtBKyNE", alternates: ["op9kVnSso6Q", "ytGaGIn3SjE"], verifiedAt: "2024-01-01" },
  "overhead press": { youtubeId: "QAQ64B6IQzE", alternates: ["2yjwXTZQDDI", "5yWaNOvgFCM"], verifiedAt: "2024-01-01" },
  "barbell row": { youtubeId: "9Gf-Tic7UgQ", alternates: ["GZbfZ033f74", "j3IgkO7VPhk"], verifiedAt: "2024-01-01" },
  "romanian deadlift": { youtubeId: "JCXUYuzwNrM", alternates: ["r4MzxtBKyNE", "v8k9gA3O2Lg"], verifiedAt: "2024-01-01" },
  "bulgarian split squat": { youtubeId: "2C-uNgKwPLE", alternates: ["QOVaHwm-Q6U"], verifiedAt: "2024-01-01" },
  "chin up": { youtubeId: "brhRXlOhsAM", alternates: ["eGo4IYL9INw"], verifiedAt: "2024-01-01" },
  "dips": { youtubeId: "2z8JmcrW-As", alternates: ["yN6Q1UI_xkE", "Wphvhfl4f8g"], verifiedAt: "2024-01-01" },
  "dip": { youtubeId: "2z8JmcrW-As", alternates: ["yN6Q1UI_xkE"], verifiedAt: "2024-01-01" },
  "parallel bar dips": { youtubeId: "2z8JmcrW-As", alternates: ["yN6Q1UI_xkE"], verifiedAt: "2024-01-01" },
  "lunges": { youtubeId: "QOVaHwm-Q6U", alternates: ["2C-uNgKwPLE"], verifiedAt: "2024-01-01" },
  "lunge": { youtubeId: "QOVaHwm-Q6U", alternates: ["2C-uNgKwPLE"], verifiedAt: "2024-01-01" },
  "lateral raise": { youtubeId: "WJm942YGjz0", alternates: ["V8dZ3pyiCBo"], verifiedAt: "2024-01-01" },
  "bicep curl": { youtubeId: "in7PaeYlhrM", alternates: ["soxrZlIl35U", "zC3nLlEvin4"], verifiedAt: "2024-01-01" },
  "barbell bicep curl": { youtubeId: "in7PaeYlhrM", alternates: ["soxrZlIl35U"], verifiedAt: "2024-01-01" },
  "incline dumbbell curl": { youtubeId: "soxrZlIl35U", alternates: ["in7PaeYlhrM"], verifiedAt: "2024-01-01" },
  "dumbbell hammer curl": { youtubeId: "zC3nLlEvin4", alternates: ["in7PaeYlhrM"], verifiedAt: "2024-01-01" },
  "hammer curl": { youtubeId: "zC3nLlEvin4", alternates: ["in7PaeYlhrM"], verifiedAt: "2024-01-01" },
  "tricep extension": { youtubeId: "nRiJVZDpdL0", alternates: ["vB5OHsJ3EME"], verifiedAt: "2024-01-01" },
  "rope tricep pushdown": { youtubeId: "vB5OHsJ3EME", alternates: ["nRiJVZDpdL0"], verifiedAt: "2024-01-01" },
  "close grip bench press": { youtubeId: "4Y2ZdHCOXok", alternates: ["nRiJVZDpdL0"], verifiedAt: "2024-01-01" },
  "leg press": { youtubeId: "IZxyjW7OSvc", alternates: ["0tn5K9NlCfo"], verifiedAt: "2024-01-01" },
  "leg curl": { youtubeId: "ELOCsoDSmrg", alternates: ["JCXUYuzwNrM"], verifiedAt: "2024-01-01" },
  "leg extension": { youtubeId: "YyvSfVjQeL0", alternates: ["IZxyjW7OSvc"], verifiedAt: "2024-01-01" },
  "calf raise": { youtubeId: "-M4-G8p8fmc", alternates: ["4K_K1G9_q20"], verifiedAt: "2024-01-01" },
  "standing calf raise": { youtubeId: "-M4-G8p8fmc", alternates: ["4K_K1G9_q20"], verifiedAt: "2024-01-01" },
  "lat pulldown": { youtubeId: "CAwf7n6Luuc", alternates: ["eGo4IYL9INw"], verifiedAt: "2024-01-01" },
  "cable row": { youtubeId: "GZbfZ033f74", alternates: ["9Gf-Tic7UgQ"], verifiedAt: "2024-01-01" },
  "face pull": { youtubeId: "V8dZ3pyiCBo", alternates: ["WJm942YGjz0"], verifiedAt: "2024-01-01" },
  "shrugs": { youtubeId: "cJRVVxmytaM", alternates: ["Fk9j6pQ6xIU"], verifiedAt: "2024-01-01" },
  "hip thrust": { youtubeId: "Zp26q4BY5CE", alternates: ["r4MzxtBKyNE"], verifiedAt: "2024-01-01" },
  "cable crossover": { youtubeId: "taI4XduLpTk", alternates: ["eGjt4jcEAwg"], verifiedAt: "2024-01-01" },
  "pec deck": { youtubeId: "eGjt4jcEAwg", alternates: ["taI4XduLpTk"], verifiedAt: "2024-01-01" },
  "hack squat": { youtubeId: "0tn5K9NlCfo", alternates: ["gcNh17Ckjgg"], verifiedAt: "2024-01-01" },
  "front squat": { youtubeId: "vEdzU9gEoU0", alternates: ["gcNh17Ckjgg"], verifiedAt: "2024-01-01" },
  "zercher squat": { youtubeId: "U3eG8lq6t_Y", alternates: ["vEdzU9gEoU0"], verifiedAt: "2024-01-01" },
  "t bar row": { youtubeId: "j3IgkO7VPhk", alternates: ["9Gf-Tic7UgQ"], verifiedAt: "2024-01-01" },
  "good morning": { youtubeId: "v8k9gA3O2Lg", alternates: ["JCXUYuzwNrM"], verifiedAt: "2024-01-01" },
  "glute ham raise": { youtubeId: "CGB_J9i88zM", alternates: ["1-w8tN81BOU"], verifiedAt: "2024-01-01" },
  "reverse hyper": { youtubeId: "1-w8tN81BOU", alternates: ["CGB_J9i88zM"], verifiedAt: "2024-01-01" },
  "ab rollout": { youtubeId: "L_93Jd73wF4", alternates: ["pSHjTRCQxIw"], verifiedAt: "2024-01-01" },
  "plank": { youtubeId: "pSHjTRCQxIw", alternates: ["JB2oyawG9KI"], verifiedAt: "2024-01-01" },
  "russian twist": { youtubeId: "wkD8rjkodUI", alternates: ["pRACGN2rvvk"], verifiedAt: "2024-01-01" },
  "leg raise": { youtubeId: "JB2oyawG9KI", alternates: ["pSHjTRCQxIw"], verifiedAt: "2024-01-01" },
  "hanging leg raise": { youtubeId: "JB2oyawG9KI", alternates: ["pSHjTRCQxIw"], verifiedAt: "2024-01-01" },
  "crunch": { youtubeId: "Xyd_fa5zoEU", alternates: ["JB2oyawG9KI"], verifiedAt: "2024-01-01" },
  "cable woodchopper": { youtubeId: "pRACGN2rvvk", alternates: ["wkD8rjkodUI"], verifiedAt: "2024-01-01" },
  "farmers walk": { youtubeId: "Fk9j6pQ6xIU", alternates: ["cJRVVxmytaM"], verifiedAt: "2024-01-01" },
  "kettlebell swing": { youtubeId: "YSxHifyI6s8", alternates: ["r4MzxtBKyNE"], verifiedAt: "2024-01-01" },
  "snatch": { youtubeId: "L5qBOMuHj3Q", alternates: ["8miqQQJEsO0"], verifiedAt: "2024-01-01" },
  "clean and jerk": { youtubeId: "8miqQQJEsO0", alternates: ["L5qBOMuHj3Q"], verifiedAt: "2024-01-01" },
  "muscle up": { youtubeId: "vGqE_vF_1z4", alternates: ["eGo4IYL9INw", "2z8JmcrW-As"], verifiedAt: "2024-01-01" },
  "front lever": { youtubeId: "5Eewn0rUjPQ", alternates: ["eGo4IYL9INw"], verifiedAt: "2024-01-01" },
  "back lever": { youtubeId: "Gz-uX7_nL90", alternates: ["5Eewn0rUjPQ"], verifiedAt: "2024-01-01" },
  "planche": { youtubeId: "l-F9x4v3sE0", alternates: ["IODxDxXQbk4"], verifiedAt: "2024-01-01" },
  "human flag": { youtubeId: "3yT126H8vJg", alternates: ["5Eewn0rUjPQ"], verifiedAt: "2024-01-01" },
  "handstand push up": { youtubeId: "5_V_G_2B1K4", alternates: ["sposDXWEB0A", "QAQ64B6IQzE"], verifiedAt: "2024-01-01" },
  "pistol squat": { youtubeId: "vq5-vdgJDG8", alternates: ["2C-uNgKwPLE", "gcNh17Ckjgg"], verifiedAt: "2024-01-01" },
  "dragon flag": { youtubeId: "moyFIv_q67k", alternates: ["JB2oyawG9KI"], verifiedAt: "2024-01-01" },
  "australian rows": { youtubeId: "dvkRYjVp4lc", alternates: ["GZbfZ033f74"], verifiedAt: "2024-01-01" },
  "inverted rows": { youtubeId: "dvkRYjVp4lc", alternates: ["GZbfZ033f74"], verifiedAt: "2024-01-01" },
  "pike push ups": { youtubeId: "sposDXWEB0A", alternates: ["5_V_G_2B1K4"], verifiedAt: "2024-01-01" },
  "diamond push ups": { youtubeId: "_4EGPVYuqCQ", alternates: ["IODxDxXQbk4"], verifiedAt: "2024-01-01" },
  "l sit": { youtubeId: "IUZJoSP66HI", alternates: ["JB2oyawG9KI"], verifiedAt: "2024-01-01" }
};

// Register aliases from ontology
EXERCISE_ONTOLOGY.forEach(ex => {
  const normName = normalizeExerciseName(ex.name);
  if (EXERCISE_VIDEO_MAP[normName]) {
    ex.aliases.forEach(alias => {
      const normAlias = normalizeExerciseName(alias);
      if (!EXERCISE_VIDEO_MAP[normAlias]) {
        EXERCISE_VIDEO_MAP[normAlias] = EXERCISE_VIDEO_MAP[normName];
      }
    });
  }
});

export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strips common warmup/sets/noise suffixes to find root exercise name
 */
export function cleanExerciseName(name: string): string {
  let cleaned = normalizeExerciseName(name);
  const noisePatterns = [
    /\b(warm\s*up|warmup|prep|activation|routine|drill|hold|practice|progression|attempts?|negatives?|slow|light|assisted|feet elevated|each direction|both directions|each side|per side|unilateral)\b/gi,
    /\b(\d+\s*x\s*\d+|\d+\s*min|\d+\s*sec|x\d+)\b/gi
  ];
  for (const pattern of noisePatterns) {
    cleaned = cleaned.replace(pattern, ' ');
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Gets all curated video IDs (primary + alternates) for an exercise
 */
export function getAllCuratedVideos(name: string): string[] {
  const norm = normalizeExerciseName(name);
  if (EXERCISE_VIDEO_MAP[norm]) {
    const entry = EXERCISE_VIDEO_MAP[norm];
    return [entry.youtubeId, ...(entry.alternates || [])];
  }

  const cleaned = cleanExerciseName(name);
  if (cleaned && EXERCISE_VIDEO_MAP[cleaned]) {
    const entry = EXERCISE_VIDEO_MAP[cleaned];
    return [entry.youtubeId, ...(entry.alternates || [])];
  }

  const variations = [
    cleaned.replace(/s\b/g, ''),
    cleaned + 's',
    cleaned.replace(/\bpush ups\b/g, 'push up'),
    cleaned.replace(/\bpull ups\b/g, 'pull up'),
    cleaned.replace(/\bdips\b/g, 'dip')
  ];

  for (const v of variations) {
    const vNorm = normalizeExerciseName(v);
    if (EXERCISE_VIDEO_MAP[vNorm]) {
      const entry = EXERCISE_VIDEO_MAP[vNorm];
      return [entry.youtubeId, ...(entry.alternates || [])];
    }
  }

  for (const [key, value] of Object.entries(EXERCISE_VIDEO_MAP)) {
    if (key.length >= 4 && (norm.includes(key) || (cleaned.length >= 4 && cleaned.includes(key)))) {
      return [value.youtubeId, ...(value.alternates || [])];
    }
  }

  return [];
}

/**
 * Checks curated list by exact name, cleaned name, singular/plural, or fuzzy token match
 */
export function findCuratedVideo(name: string, excludedIds: string[] = []): string | null {
  const allVideos = getAllCuratedVideos(name);
  for (const vid of allVideos) {
    if (!excludedIds.includes(vid)) {
      return vid;
    }
  }
  return allVideos[0] || null;
}

const BAD_TERMS = new Set([
  'challenge', 'compilation', 'reaction', 'motivation', 'pr', 'shorts', 'competition', 'vlog', 'prank', 'fails'
]);

const STOPWORDS = new Set([
  'warm', 'up', 'warmup', 'prep', 'routine', 'drill', 'hold', 'practice', 'progression',
  'exercise', 'form', 'technique', 'tutorial', 'how', 'to', 'for', 'the', 'and', 'with', 'on', 'in',
  'proper', 'demonstration', 'demo', 'mistake', 'mistakes', 'guide', 'activation', 'mobility'
]);

export function scoreVideo(title: string, exerciseName: string): number {
  const normTitle = normalizeExerciseName(title);
  const titleTokens = new Set(normTitle.split(' '));
  const normEx = normalizeExerciseName(exerciseName);
  const cleanedEx = cleanExerciseName(exerciseName);
  const exerciseTokens = normEx.split(' ');

  let score = 0;

  // Extract core keywords from exercise
  const coreTokens = exerciseTokens.filter(t => t.length > 2 && !STOPWORDS.has(t));

  // 1. Exact / Substring phrase match (Huge bonus)
  if (normTitle.includes(normEx) || (cleanedEx.length >= 4 && normTitle.includes(cleanedEx))) {
    score += 120;
  }

  // 2. Token match check
  let matchedCoreCount = 0;
  for (const token of coreTokens) {
    if (titleTokens.has(token) || normTitle.includes(token)) {
      score += 35;
      matchedCoreCount++;
    }
  }

  // 3. Heavy penalty if title misses core subject tokens completely
  if (coreTokens.length > 0 && matchedCoreCount === 0) {
    score -= 300;
  }

  // Variation mismatch penalty
  const VARIATION_TERMS = new Set([
    'dumbbell', 'barbell', 'machine', 'smith', 'cable', 'band', 'kettlebell', 
    'bulgarian', 'hack', 'incline', 'decline', 'seated', 'standing', 'single', 'one'
  ]);
  for (const vToken of VARIATION_TERMS) {
    if (titleTokens.has(vToken) && !exerciseTokens.includes(vToken)) {
      score -= 40; 
    }
  }

  // Quality indicator terms
  if (titleTokens.has('form')) score += 15;
  if (titleTokens.has('technique')) score += 15;
  if (titleTokens.has('tutorial')) score += 15;
  if (titleTokens.has('how')) score += 10;
  if (titleTokens.has('mobility')) score += 10;

  // Bad clickbait / compilation terms
  for (const bad of BAD_TERMS) {
    if (titleTokens.has(bad)) score -= 60;
  }

  return score;
}

// ─── Network helpers ──────────────────────────────────────────

/** The web API key is restricted to the hosting origin. */
const WEB_REFERER = 'https://apparatus-46b1b.web.app/';
const ANDROID_PACKAGE = 'com.tms.apparatus';
/** A "not found" result is retried after this long instead of blocking for days. */
const NOT_FOUND_RETRY_MS = 6 * 60 * 60 * 1000;
const FOUND_TTL_MS = 2 * 365 * 24 * 60 * 60 * 1000;

function anySignal(signals: (AbortSignal | undefined)[]): AbortSignal {
  const list = signals.filter(Boolean) as AbortSignal[];
  const native = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof native === 'function') return native(list);
  const ctrl = new AbortController();
  list.forEach(s => (s.aborted ? ctrl.abort() : s.addEventListener('abort', () => ctrl.abort(), { once: true })));
  return ctrl.signal;
}

export function parseYoutubeId(link?: string | null): string | null {
  if (!link) return null;
  const trimmed = link.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/i);
  return match?.[1] ?? null;
}

const playableCache = new Map<string, boolean>();

/**
 * Checks that a YouTube video still exists. Removed/invalid IDs return YouTube's
 * 120px-wide placeholder thumbnail. Slow networks resolve as playable (and are
 * not cached) so a video is never hidden just because the check timed out.
 */
export function isPlayableYoutubeId(id: string, timeoutMs = 5000): Promise<boolean> {
  if (!/^[\w-]{11}$/.test(id)) return Promise.resolve(false);
  const known = playableCache.get(id);
  if (known !== undefined) return Promise.resolve(known);
  if (typeof Image === 'undefined') return Promise.resolve(true);

  return new Promise(resolve => {
    let done = false;
    const img = new Image();
    const finish = (ok: boolean, cache: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (cache) playableCache.set(id, ok);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(true, false), timeoutMs);
    img.onload = () => finish(img.naturalWidth > 120, true);
    img.onerror = () => finish(!navigator.onLine, navigator.onLine);
    img.referrerPolicy = 'no-referrer';
    img.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  });
}

interface YtSearchResult {
  /** False when the request itself failed (network/quota), not "zero results". */
  ok: boolean;
  items: { id: string; title: string }[];
  nextPageToken: string | null;
}

async function youtubeSearch(q: string, pageToken: string | null, signal?: AbortSignal): Promise<YtSearchResult> {
  const fail: YtSearchResult = { ok: false, items: [], nextPageToken: null };
  const params = new URLSearchParams({
    part: 'snippet',
    maxResults: '8',
    q,
    type: 'video',
    videoEmbeddable: 'true',
    videoSyndicated: 'true',
    order: 'relevance',
    relevanceLanguage: 'en',
    safeSearch: 'strict',
  });
  if (pageToken) params.set('pageToken', pageToken);

  const attempt = async (key: string, androidHeaders: boolean): Promise<{ status: number; data: any }> => {
    params.set('key', key);
    const url = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;
    if (Capacitor.isNativePlatform()) {
      // The WebView's fetch() sends the app's local origin as Referer, which the
      // key doesn't allow (this is why videos were missing in the APK). Native
      // HTTP can send the headers the keys are actually restricted to.
      const res = await CapacitorHttp.get({
        url,
        headers: androidHeaders ? { 'X-Android-Package': ANDROID_PACKAGE } : { Referer: WEB_REFERER },
        connectTimeout: 5000,
        readTimeout: 5000,
      });
      let data = res.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { data = null; }
      }
      return { status: res.status, data };
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(url, { signal: anySignal([signal, ctrl.signal]) });
      return { status: res.status, data: res.ok ? await res.json() : null };
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let r = await attempt(YT_WEB_KEY, false);
    if ((r.status === 403 || r.status === 400) && Capacitor.isNativePlatform()) {
      r = await attempt(YT_ANDROID_KEY, true);
    }
    if (r.status < 200 || r.status >= 300 || !r.data) return fail;
    const items = (Array.isArray(r.data.items) ? r.data.items : [])
      .map((it: any) => ({ id: it.id?.videoId as string, title: (it.snippet?.title as string) || '' }))
      .filter((it: { id: string }) => !!it.id);
    return { ok: true, items, nextPageToken: r.data.nextPageToken || null };
  } catch {
    return fail;
  }
}

async function invidiousSearch(q: string, page: number, signal?: AbortSignal): Promise<{ id: string; title: string }[]> {
  const attempts = INVIDIOUS_INSTANCES.map(async instance => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(
        `${instance}/api/v1/search?q=${encodeURIComponent(q)}&type=video&sort_by=relevance&page=${page}`,
        { signal: anySignal([signal, ctrl.signal]) }
      );
      if (!res.ok) throw new Error('Bad response');
      const results = await res.json();
      if (!Array.isArray(results) || results.length === 0) throw new Error('No results');
      return results
        .filter((it: any) => it.videoId)
        .map((it: any) => ({ id: it.videoId as string, title: (it.title as string) || '' }));
    } finally {
      clearTimeout(timer);
    }
  });
  try {
    return await Promise.any(attempts);
  } catch {
    return [];
  }
}

/** Ranks search hits by title relevance, dropping clearly unrelated ones. */
function rankCandidates(items: { id: string; title: string }[], exerciseName: string, exclude: Set<string>) {
  return items
    .filter(it => !exclude.has(it.id))
    .map(it => ({ ...it, score: scoreVideo(it.title, exerciseName) }))
    .filter(it => it.score > -100)
    .sort((a, b) => b.score - a.score);
}

async function readMapping(norm: string): Promise<any | null> {
  try {
    const snap = await getDoc(doc(db, 'exerciseVideoMappings', norm));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.warn('Failed to read video cache:', err);
    return null;
  }
}

function searchQueryFor(exerciseName: string) {
  return `${cleanExerciseName(exerciseName) || exerciseName} exercise form tutorial`;
}

/**
 * Resolves a playable technique video for an exercise. Every candidate is
 * checked for availability before being returned, so a dead curated/cached ID
 * falls through to the next source instead of leaving the player empty.
 */
export async function resolveExerciseVideo(exerciseName: string, directYtLink?: string, signal?: AbortSignal): Promise<string | null> {
  if (signal?.aborted) return null;

  const tried = new Set<string>();
  const playable = async (id?: string | null) => {
    if (!id || tried.has(id) || signal?.aborted) return false;
    tried.add(id);
    return isPlayableYoutubeId(id);
  };

  // 1. Direct link set on the exercise
  const direct = parseYoutubeId(directYtLink);
  if (direct && await playable(direct)) return direct;

  const norm = normalizeExerciseName(exerciseName);
  const cached = await readMapping(norm);
  const disliked = new Set<string>(Array.isArray(cached?.dislikedVideoIds) ? cached.dislikedVideoIds : []);
  const cachedId: string | null = cached?.status === 'found' && cached.expiresAt > Date.now() ? cached.youtubeId : null;

  // 2. A video the user explicitly picked via "change video"
  const userPinned = cached?.source === 'user-refreshed' || disliked.size > 0;
  if (userPinned && await playable(cachedId)) return cachedId;

  // 3. Curated catalogue
  for (const id of getAllCuratedVideos(exerciseName)) {
    if (disliked.has(id)) continue;
    if (await playable(id)) return id;
  }

  // 4. Previously found search result
  if (await playable(cachedId)) return cachedId;

  if (signal?.aborted) return null;

  // Don't hammer the API if a search came back empty very recently.
  if (cached?.status === 'not_found' && Date.now() - (cached.updatedAt || 0) < NOT_FOUND_RETRY_MS) {
    return null;
  }

  const cacheAndReturn = (videoId: string, title: string, source: string, nextPageToken?: string | null) => {
    setDoc(doc(db, 'exerciseVideoMappings', norm), {
      youtubeId: videoId,
      exerciseName: norm,
      title: title,
      status: 'found',
      source,
      nextPageToken: nextPageToken || null,
      dislikedVideoIds: Array.from(disliked),
      updatedAt: Date.now(),
      expiresAt: Date.now() + FOUND_TTL_MS
    }, { merge: true }).catch(console.warn);
    return videoId;
  };

  const searchQuery = searchQueryFor(exerciseName);

  // 5. YouTube Data API
  const yt = await youtubeSearch(searchQuery, null, signal);
  for (const c of rankCandidates(yt.items, exerciseName, disliked)) {
    if (await playable(c.id)) return cacheAndReturn(c.id, c.title, 'youtube', yt.nextPageToken);
  }

  if (signal?.aborted) return null;

  // 6. Invidious fallback
  const inv = await invidiousSearch(searchQuery, 1, signal);
  for (const c of rankCandidates(inv.slice(0, 8), exerciseName, disliked)) {
    if (await playable(c.id)) return cacheAndReturn(c.id, c.title, 'invidious');
  }

  // Only remember a miss when the search actually ran - a network/quota error
  // must not hide the video for every user.
  if (yt.ok || inv.length > 0) {
    setDoc(doc(db, 'exerciseVideoMappings', norm), {
      youtubeId: null,
      exerciseName: norm,
      status: 'not_found',
      updatedAt: Date.now(),
      expiresAt: Date.now() + NOT_FOUND_RETRY_MS
    }, { merge: true }).catch(console.warn);
  }

  return null;
}

/**
 * Refreshes and changes the technique video for a single exercise.
 * Fetches the next top 5 results (excluding any previously selected/disliked video),
 * scores and updates only that specific exercise's cached mapping in Firestore.
 */
export async function refreshExerciseVideo(
  exerciseName: string,
  currentVideoId?: string | null,
  directYtLink?: string,
  signal?: AbortSignal
): Promise<{ youtubeId: string; title: string } | null> {
  if (signal?.aborted) return null;

  const norm = normalizeExerciseName(exerciseName);
  const cached = await readMapping(norm);
  const disliked = new Set<string>(Array.isArray(cached?.dislikedVideoIds) ? cached.dislikedVideoIds : []);
  const existingPageToken: string | null = cached?.nextPageToken || null;
  const pageNumber: number = typeof cached?.pageNumber === 'number' ? cached.pageNumber : 1;

  if (currentVideoId) disliked.add(currentVideoId);
  const direct = parseYoutubeId(directYtLink);
  if (direct && direct !== currentVideoId) disliked.delete(direct);

  const cleanedName = cleanExerciseName(exerciseName) || exerciseName;
  const searchQuery = searchQueryFor(exerciseName);

  const tried = new Set<string>();
  const playable = async (id?: string | null) => {
    if (!id || id === currentVideoId || tried.has(id) || signal?.aborted) return false;
    tried.add(id);
    return isPlayableYoutubeId(id);
  };

  const saveAndReturn = async (newVideoId: string, title: string, nextPageToken?: string | null, newPageNum?: number) => {
    try {
      await setDoc(doc(db, 'exerciseVideoMappings', norm), {
        youtubeId: newVideoId,
        exerciseName: norm,
        title,
        status: 'found',
        source: 'user-refreshed',
        dislikedVideoIds: Array.from(disliked),
        nextPageToken: nextPageToken || null,
        pageNumber: newPageNum || pageNumber + 1,
        updatedAt: Date.now(),
        expiresAt: Date.now() + FOUND_TTL_MS
      }, { merge: true });
    } catch (e) {
      console.warn('Failed to write refreshed video to Firestore:', e);
    }
    return { youtubeId: newVideoId, title };
  };

  // 1. Unused curated alternatives (skipping any that no longer exist)
  const curatedVideos = getAllCuratedVideos(exerciseName);
  for (const id of curatedVideos) {
    if (disliked.has(id)) continue;
    if (await playable(id)) return saveAndReturn(id, `${cleanedName} technique demonstration`);
    disliked.add(id);
  }

  // 2. YouTube search - continue from the stored page, then from the top.
  const tokens: (string | null)[] = existingPageToken ? [existingPageToken, null] : [null];
  for (const start of tokens) {
    let token = start;
    for (let page = 0; page < 2; page++) {
      if (signal?.aborted) return null;
      const yt = await youtubeSearch(searchQuery, token, signal);
      if (!yt.ok) break;
      for (const c of rankCandidates(yt.items, exerciseName, disliked)) {
        if (await playable(c.id)) return saveAndReturn(c.id, c.title, yt.nextPageToken);
        disliked.add(c.id);
      }
      if (!yt.nextPageToken) break;
      token = yt.nextPageToken;
    }
  }

  if (signal?.aborted) return null;

  // 3. Invidious fallback
  const nextPage = pageNumber + 1;
  const inv = await invidiousSearch(searchQuery, nextPage, signal);
  for (const c of rankCandidates(inv.slice(0, 8), exerciseName, disliked)) {
    if (await playable(c.id)) return saveAndReturn(c.id, c.title, null, nextPage);
  }

  // 4. Every alternative has been seen - cycle back through earlier picks
  //    (direct link, curated, previously skipped) so the button always works.
  const cycle = [direct, ...curatedVideos, ...Array.from(disliked)];
  for (const id of cycle) {
    if (!id || id === currentVideoId) continue;
    tried.delete(id);
    if (await playable(id)) {
      disliked.clear();
      if (currentVideoId) disliked.add(currentVideoId);
      return saveAndReturn(id, `${cleanedName} demonstration`, null, 1);
    }
  }

  return null;
}
