import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
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

export async function resolveExerciseVideo(exerciseName: string, directYtLink?: string, signal?: AbortSignal): Promise<string | null> {
  if (signal?.aborted) return null;

  // 1. Check direct link
  if (directYtLink) {
    const match = directYtLink.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/i);
    if (match?.[1]) return match[1];
  }

  const norm = normalizeExerciseName(exerciseName);
  const curated = findCuratedVideo(exerciseName);

  if (signal?.aborted) return null;

  // 2. Check Firestore Cache
  try {
    const docRef = doc(db, 'exerciseVideoMappings', norm);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.expiresAt > Date.now()) {
        // If explicitly refreshed or customized by user, respect user choice
        if (data.source === 'user-refreshed' || (Array.isArray(data.dislikedVideoIds) && data.dislikedVideoIds.length > 0)) {
          return data.status === 'found' ? data.youtubeId : null;
        }
        // If we have a verified curated video, use it over unvetted search results
        if (curated) {
          return curated;
        }
        return data.status === 'found' ? data.youtubeId : null;
      }
    }
  } catch (err) {
    console.warn("Failed to check cache:", err);
  }

  if (signal?.aborted) return null;

  // 3. Check Curated Catalog (instant high quality match)
  if (curated) {
    return curated;
  }

  if (signal?.aborted) return null;
  
  // Helper to cache success and return video
  const cacheAndReturn = (videoId: string, title: string, source: string, nextPageToken?: string | null) => {
    setDoc(doc(db, 'exerciseVideoMappings', norm), {
      youtubeId: videoId,
      exerciseName: norm,
      title: title,
      status: 'found',
      source,
      nextPageToken: nextPageToken || null,
      dislikedVideoIds: [],
      updatedAt: Date.now(),
      expiresAt: Date.now() + 2 * 365 * 24 * 60 * 60 * 1000 
    }, { merge: true }).catch(console.warn);
    return videoId;
  };

  const searchQuery = `${cleanExerciseName(exerciseName) || exerciseName} exercise form tutorial`;

  // 4. Try YouTube Data API (fetching top 5 with relevance order)
  try {
    const apiKey = Capacitor.isNativePlatform() ? YT_ANDROID_KEY : YT_WEB_KEY;
    const params = new URLSearchParams({
      part: 'snippet',
      maxResults: '5',
      q: searchQuery,
      type: 'video',
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      order: 'relevance',
      relevanceLanguage: 'en',
      key: apiKey,
    });
    
    const ytAbort = new AbortController();
    const timeout = setTimeout(() => ytAbort.abort(), 4000);
    
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, { 
      signal: signal ? AbortSignal.any([signal, ytAbort.signal]) : ytAbort.signal 
    });
    clearTimeout(timeout);
    
    if (res.ok) {
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        let bestVideo: string | null = null;
        let maxScore = -999;
        let bestTitle = '';

        data.items.forEach((item: any) => {
          const vId = item.id?.videoId;
          if (!vId) return;
          const score = scoreVideo(item.snippet?.title || '', exerciseName);
          if (score > maxScore) {
            maxScore = score;
            bestVideo = vId;
            bestTitle = item.snippet?.title || '';
          }
        });

        if (bestVideo && maxScore > -100) {
          return cacheAndReturn(bestVideo, bestTitle, 'youtube', data.nextPageToken);
        }
      } else {
        // Cache failure (7 days TTL)
        setDoc(doc(db, 'exerciseVideoMappings', norm), {
          youtubeId: null,
          exerciseName: norm,
          status: 'not_found',
          updatedAt: Date.now(),
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 
        }, { merge: true }).catch(console.warn);
      }
      return null;
    }
  } catch (err) {
    console.warn("YouTube API request failed, falling back:", err);
  }

  if (signal?.aborted) return null;

  // 5. Fallback to Invidious
  const fallbackPromises = INVIDIOUS_INSTANCES.map(async (instance) => {
    const invAbort = new AbortController();
    const timeout = setTimeout(() => invAbort.abort(), 6000);
    
    try {
      const res = await fetch(
        `${instance}/api/v1/search?q=${encodeURIComponent(searchQuery)}&type=video&sort_by=relevance`,
        { signal: signal ? AbortSignal.any([signal, invAbort.signal]) : invAbort.signal }
      );
      if (!res.ok) throw new Error('Bad response');
      const results = await res.json();
      
      if (results && results.length > 0) {
        let bestVideo: string | null = null;
        let maxScore = -999;
        let bestTitle = '';
        
        results.slice(0, 5).forEach((item: any) => {
          if (!item.videoId) return;
          const score = scoreVideo(item.title || '', exerciseName);
          if (score > maxScore) {
            maxScore = score;
            bestVideo = item.videoId;
            bestTitle = item.title;
          }
        });
        
        if (bestVideo && maxScore > -100) {
          return { videoId: bestVideo, title: bestTitle };
        }
      }
      throw new Error('No results');
    } finally {
      clearTimeout(timeout);
    }
  });

  try {
    const fastestResult = await Promise.any(fallbackPromises);
    if (fastestResult) {
      return cacheAndReturn(fastestResult.videoId, fastestResult.title, 'invidious');
    }
  } catch (e) {
    console.warn("All Invidious fallback instances failed.");
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

  // 1. Fetch current Firestore cache document for this exercise to get previous state
  let dislikedList: string[] = [];
  let existingPageToken: string | null = null;
  let pageNumber = 1;

  try {
    const docRef = doc(db, 'exerciseVideoMappings', norm);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (Array.isArray(data.dislikedVideoIds)) {
        dislikedList = [...data.dislikedVideoIds];
      }
      if (data.nextPageToken) {
        existingPageToken = data.nextPageToken;
      }
      if (typeof data.pageNumber === 'number') {
        pageNumber = data.pageNumber;
      }
    }
  } catch (err) {
    console.warn("Failed to read existing cache before refresh:", err);
  }

  // Add current video to disliked list
  if (currentVideoId && !dislikedList.includes(currentVideoId)) {
    dislikedList.push(currentVideoId);
  }

  const apiKey = Capacitor.isNativePlatform() ? YT_ANDROID_KEY : YT_WEB_KEY;
  const cleanedName = cleanExerciseName(exerciseName) || exerciseName;
  const searchQuery = `${cleanedName} exercise form tutorial`;

  // Helper to save to Firestore and return
  const saveAndReturn = async (newVideoId: string, title: string, source: string, nextPageToken?: string | null, newPageNum?: number) => {
    const updatedDisliked = Array.from(new Set(dislikedList));
    if (!updatedDisliked.includes(newVideoId)) {
      // do not add newVideoId to disliked yet, only when refreshed again
    }
    try {
      await setDoc(doc(db, 'exerciseVideoMappings', norm), {
        youtubeId: newVideoId,
        exerciseName: norm,
        title: title,
        status: 'found',
        source,
        dislikedVideoIds: updatedDisliked,
        nextPageToken: nextPageToken || null,
        pageNumber: newPageNum || pageNumber + 1,
        updatedAt: Date.now(),
        expiresAt: Date.now() + 2 * 365 * 24 * 60 * 60 * 1000 // 2 years TTL
      }, { merge: true });
    } catch (e) {
      console.warn("Failed to write refreshed video to Firestore:", e);
    }
    return { youtubeId: newVideoId, title };
  };

  // 2. CHECK CURATED ALTERNATIVES FIRST!
  // If we have verified curated alternative videos that haven't been shown yet, return next one instantly!
  const curatedVideos = getAllCuratedVideos(exerciseName);
  if (curatedVideos.length > 0) {
    const unusedCurated = curatedVideos.find(id => !dislikedList.includes(id));
    if (unusedCurated) {
      return await saveAndReturn(unusedCurated, `${cleanedName} technique demonstration`, 'curated-alternate');
    }
  }

  // 3. Query YouTube Data API
  try {
    const searchYouTube = async (token?: string | null) => {
      const params = new URLSearchParams({
        part: 'snippet',
        maxResults: '5',
        q: searchQuery,
        type: 'video',
        videoEmbeddable: 'true',
        videoSyndicated: 'true',
        order: 'relevance',
        relevanceLanguage: 'en',
        key: apiKey,
      });
      if (token) {
        params.set('pageToken', token);
      }

      const ytAbort = new AbortController();
      const timeout = setTimeout(() => ytAbort.abort(), 4000);
      const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, {
        signal: signal ? AbortSignal.any([signal, ytAbort.signal]) : ytAbort.signal
      });
      clearTimeout(timeout);

      if (!res.ok) return null;
      return await res.json();
    };

    let ytData = await searchYouTube(existingPageToken);

    if ((!ytData || !ytData.items || ytData.items.length === 0) && existingPageToken) {
      ytData = await searchYouTube(null);
    }

    if (ytData && ytData.items && ytData.items.length > 0) {
      const candidateItems = ytData.items.filter((item: any) => {
        const vId = item.id?.videoId;
        return vId && !dislikedList.includes(vId);
      });

      if (candidateItems.length > 0) {
        let bestVideo = candidateItems[0].id.videoId;
        let maxScore = -999;
        let bestTitle = candidateItems[0].snippet?.title || '';

        candidateItems.forEach((item: any) => {
          const score = scoreVideo(item.snippet?.title || '', exerciseName);
          if (score > maxScore) {
            maxScore = score;
            bestVideo = item.id.videoId;
            bestTitle = item.snippet?.title || '';
          }
        });

        if (bestVideo && maxScore > -100) {
          return await saveAndReturn(bestVideo, bestTitle, 'youtube', ytData.nextPageToken);
        }
      } else if (ytData.nextPageToken) {
        const nextPageData = await searchYouTube(ytData.nextPageToken);
        if (nextPageData && nextPageData.items && nextPageData.items.length > 0) {
          const nextCandidates = nextPageData.items.filter((item: any) => {
            const vId = item.id?.videoId;
            return vId && !dislikedList.includes(vId);
          });
          if (nextCandidates.length > 0) {
            let bestVideo = nextCandidates[0].id.videoId;
            let maxScore = -999;
            let bestTitle = nextCandidates[0].snippet?.title || '';
            nextCandidates.forEach((item: any) => {
              const score = scoreVideo(item.snippet?.title || '', exerciseName);
              if (score > maxScore) {
                maxScore = score;
                bestVideo = item.id.videoId;
                bestTitle = item.snippet?.title || '';
              }
            });
            if (bestVideo && maxScore > -100) {
              return await saveAndReturn(bestVideo, bestTitle, 'youtube', nextPageData.nextPageToken);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("YouTube API refresh search failed, falling back:", err);
  }

  if (signal?.aborted) return null;

  // 4. Fallback to Invidious
  const nextPage = pageNumber + 1;
  const fallbackPromises = INVIDIOUS_INSTANCES.map(async (instance) => {
    const invAbort = new AbortController();
    const timeout = setTimeout(() => invAbort.abort(), 6000);
    try {
      const res = await fetch(
        `${instance}/api/v1/search?q=${encodeURIComponent(searchQuery)}&type=video&sort_by=relevance&page=${nextPage}`,
        { signal: signal ? AbortSignal.any([signal, invAbort.signal]) : invAbort.signal }
      );
      if (!res.ok) throw new Error('Bad response');
      const results = await res.json();
      if (results && results.length > 0) {
        const top5 = results.slice(0, 5);
        const candidates = top5.filter((item: any) => item.videoId && !dislikedList.includes(item.videoId));
        if (candidates.length > 0) {
          let bestVideo = candidates[0].videoId;
          let maxScore = -999;
          let bestTitle = candidates[0].title || '';
          candidates.forEach((item: any) => {
            const score = scoreVideo(item.title || '', exerciseName);
            if (score > maxScore) {
              maxScore = score;
              bestVideo = item.videoId;
              bestTitle = item.title || '';
            }
          });
          if (bestVideo && maxScore > -100) {
            return { videoId: bestVideo, title: bestTitle, page: nextPage };
          }
        }
      }
      throw new Error('No new candidates on this page');
    } finally {
      clearTimeout(timeout);
    }
  });

  try {
    const fastestResult = await Promise.any(fallbackPromises);
    if (fastestResult) {
      return await saveAndReturn(fastestResult.videoId, fastestResult.title, 'invidious', null, fastestResult.page);
    }
  } catch (e) {
    console.warn("Invidious fallback refresh instances failed or no new candidates.");
  }

  // 5. Guaranteed Cycle Fallback: If we have curated videos, cycle back to the other curated video!
  if (curatedVideos.length > 0) {
    const cycleVid = curatedVideos.find(id => id !== currentVideoId) || curatedVideos[0];
    if (cycleVid && cycleVid !== currentVideoId) {
      dislikedList = currentVideoId ? [currentVideoId] : [];
      return await saveAndReturn(cycleVid, `${cleanedName} technique demonstration`, 'curated-cycle', null, 1);
    }
  }

  // 6. Final Cycle fallback for uncurated exercises
  if (dislikedList.length > 1) {
    dislikedList = currentVideoId ? [currentVideoId] : [];
    try {
      const fallbackVid = await resolveExerciseVideo(exerciseName, directYtLink, signal);
      if (fallbackVid && fallbackVid !== currentVideoId) {
        return await saveAndReturn(fallbackVid, `${cleanedName} demonstration`, 'youtube-cycle', null, 1);
      }
    } catch (cycleErr) {
      console.warn("Cycle refresh failed:", cycleErr);
    }
  }

  return null;
}
