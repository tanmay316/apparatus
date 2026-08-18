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

export const EXERCISE_VIDEO_MAP: Record<string, { youtubeId: string, verifiedAt: string }> = {
  "push up": { youtubeId: "IODxDxXQbk4", verifiedAt: "2024-01-01" },
  "pull up": { youtubeId: "eGo4IYL9INw", verifiedAt: "2024-01-01" },
  "bench press": { youtubeId: "4Y2ZdHCOXok", verifiedAt: "2024-01-01" },
  "squat": { youtubeId: "gcNh17Ckjgg", verifiedAt: "2024-01-01" },
  "deadlift": { youtubeId: "r4MzxtBKyNE", verifiedAt: "2024-01-01" },
  "overhead press": { youtubeId: "QAQ64B6IQzE", verifiedAt: "2024-01-01" },
  "barbell row": { youtubeId: "9Gf-Tic7UgQ", verifiedAt: "2024-01-01" },
  "romanian deadlift": { youtubeId: "JCXUYuzwNrM", verifiedAt: "2024-01-01" },
  "bulgarian split squat": { youtubeId: "2C-uNgKwPLE", verifiedAt: "2024-01-01" },
  "chin up": { youtubeId: "brhRXlOhsAM", verifiedAt: "2024-01-01" },
  "dips": { youtubeId: "2z8JmcrW-As", verifiedAt: "2024-01-01" },
  "lunges": { youtubeId: "QOVaHwm-Q6U", verifiedAt: "2024-01-01" },
  "lateral raise": { youtubeId: "WJm942YGjz0", verifiedAt: "2024-01-01" },
  "bicep curl": { youtubeId: "in7PaeYlhrM", verifiedAt: "2024-01-01" },
  "tricep extension": { youtubeId: "nRiJVZDpdL0", verifiedAt: "2024-01-01" },
  "leg press": { youtubeId: "IZxyjW7OSvc", verifiedAt: "2024-01-01" },
  "leg curl": { youtubeId: "ELOCsoDSmrg", verifiedAt: "2024-01-01" },
  "leg extension": { youtubeId: "YyvSfVjQeL0", verifiedAt: "2024-01-01" },
  "calf raise": { youtubeId: "-M4-G8p8fmc", verifiedAt: "2024-01-01" },
  "lat pulldown": { youtubeId: "CAwf7n6Luuc", verifiedAt: "2024-01-01" },
  "cable row": { youtubeId: "GZbfZ033f74", verifiedAt: "2024-01-01" },
  "face pull": { youtubeId: "V8dZ3pyiCBo", verifiedAt: "2024-01-01" },
  "shrugs": { youtubeId: "cJRVVxmytaM", verifiedAt: "2024-01-01" },
  "hip thrust": { youtubeId: "Zp26q4BY5CE", verifiedAt: "2024-01-01" },
  "cable crossover": { youtubeId: "taI4XduLpTk", verifiedAt: "2024-01-01" },
  "pec deck": { youtubeId: "eGjt4jcEAwg", verifiedAt: "2024-01-01" },
  "hack squat": { youtubeId: "0tn5K9NlCfo", verifiedAt: "2024-01-01" },
  "front squat": { youtubeId: "vEdzU9gEoU0", verifiedAt: "2024-01-01" },
  "zercher squat": { youtubeId: "U3eG8lq6t_Y", verifiedAt: "2024-01-01" },
  "t bar row": { youtubeId: "j3IgkO7VPhk", verifiedAt: "2024-01-01" },
  "good morning": { youtubeId: "v8k9gA3O2Lg", verifiedAt: "2024-01-01" },
  "glute ham raise": { youtubeId: "CGB_J9i88zM", verifiedAt: "2024-01-01" },
  "reverse hyper": { youtubeId: "1-w8tN81BOU", verifiedAt: "2024-01-01" },
  "ab rollout": { youtubeId: "L_93Jd73wF4", verifiedAt: "2024-01-01" },
  "plank": { youtubeId: "pSHjTRCQxIw", verifiedAt: "2024-01-01" },
  "russian twist": { youtubeId: "wkD8rjkodUI", verifiedAt: "2024-01-01" },
  "leg raise": { youtubeId: "JB2oyawG9KI", verifiedAt: "2024-01-01" },
  "crunch": { youtubeId: "Xyd_fa5zoEU", verifiedAt: "2024-01-01" },
  "cable woodchopper": { youtubeId: "pRACGN2rvvk", verifiedAt: "2024-01-01" },
  "farmers walk": { youtubeId: "Fk9j6pQ6xIU", verifiedAt: "2024-01-01" },
  "kettlebell swing": { youtubeId: "YSxHifyI6s8", verifiedAt: "2024-01-01" },
  "snatch": { youtubeId: "L5qBOMuHj3Q", verifiedAt: "2024-01-01" },
  "clean and jerk": { youtubeId: "8miqQQJEsO0", verifiedAt: "2024-01-01" },
  "muscle up": { youtubeId: "vGqE_vF_1z4", verifiedAt: "2024-01-01" },
  "front lever": { youtubeId: "5Eewn0rUjPQ", verifiedAt: "2024-01-01" },
  "back lever": { youtubeId: "Gz-uX7_nL90", verifiedAt: "2024-01-01" },
  "planche": { youtubeId: "l-F9x4v3sE0", verifiedAt: "2024-01-01" },
  "human flag": { youtubeId: "3yT126H8vJg", verifiedAt: "2024-01-01" },
  "handstand push up": { youtubeId: "5_V_G_2B1K4", verifiedAt: "2024-01-01" },
  "pistol squat": { youtubeId: "vq5-vdgJDG8", verifiedAt: "2024-01-01" }
};

EXERCISE_ONTOLOGY.forEach(ex => {
  const normName = normalizeExerciseName(ex.name);
  if (EXERCISE_VIDEO_MAP[normName]) {
    ex.aliases.forEach(alias => {
      EXERCISE_VIDEO_MAP[normalizeExerciseName(alias)] = EXERCISE_VIDEO_MAP[normName];
    });
  }
});

export function normalizeExerciseName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

const BAD_TERMS = new Set([
  'challenge', 'workout', 'compilation', 'reaction', 'motivation', 'pr', 'shorts', 'competition'
]);

export function scoreVideo(title: string, exerciseName: string) {
  const titleTokens = new Set(normalizeExerciseName(title).split(' '));
  const exerciseTokens = normalizeExerciseName(exerciseName).split(' ');

  let score = 0;

  const VARIATION_TERMS = new Set([
    'dumbbell', 'barbell', 'machine', 'smith', 'cable', 'band', 'kettlebell', 
    'bulgarian', 'hack', 'incline', 'decline', 'seated', 'standing', 'single', 'one'
  ]);

  for (const token of exerciseTokens) {
    if (titleTokens.has(token)) score += 20;
  }

  // Heavily penalize videos that include variation keywords not present in the target exercise
  for (const vToken of VARIATION_TERMS) {
    if (titleTokens.has(vToken) && !exerciseTokens.includes(vToken)) {
      score -= 50; 
    }
  }

  if (titleTokens.has('form')) score += 20;
  if (titleTokens.has('technique')) score += 15;
  if (titleTokens.has('tutorial')) score += 10;
  if (titleTokens.has('how')) score += 5;
  if (titleTokens.has('mistakes')) score += 3;

  for (const bad of BAD_TERMS) {
    if (titleTokens.has(bad)) score -= 30;
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

  if (signal?.aborted) return null;
  // 2. Check Curated Catalog
  if (EXERCISE_VIDEO_MAP[norm]) {
    return EXERCISE_VIDEO_MAP[norm].youtubeId;
  }

  if (signal?.aborted) return null;
  // 3. Check Firestore Cache
  try {
    const docRef = doc(db, 'exerciseVideoMappings', norm);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.expiresAt > Date.now()) {
        return data.status === 'found' ? data.youtubeId : null;
      }
    }
  } catch (err) {
    console.warn("Failed to check cache:", err);
  }

  if (signal?.aborted) return null;
  
  // Create a helper to cache success and return video
  const cacheAndReturn = (videoId: string, title: string, source: string) => {
    setDoc(doc(db, 'exerciseVideoMappings', norm), {
      youtubeId: videoId,
      exerciseName: norm,
      title: title,
      status: 'found',
      source,
      updatedAt: Date.now(),
      expiresAt: Date.now() + 2 * 365 * 24 * 60 * 60 * 1000 
    }, { merge: true }).catch(console.warn);
    return videoId;
  };

  // 4. Try YouTube Data API
  try {
    const apiKey = Capacitor.isNativePlatform() ? YT_ANDROID_KEY : YT_WEB_KEY;
    const params = new URLSearchParams({
      part: 'snippet',
      maxResults: '5',
      q: `${exerciseName} proper form technique`,
      type: 'video',
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      order: 'viewCount',
      relevanceLanguage: 'en',
      key: apiKey,
    });
    
    // Add a short timeout to the YT fetch so we fallback quickly if it hangs
    const ytAbort = new AbortController();
    const timeout = setTimeout(() => ytAbort.abort(), 4000);
    
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, { 
      signal: signal ? AbortSignal.any([signal, ytAbort.signal]) : ytAbort.signal 
    });
    clearTimeout(timeout);
    
    if (res.ok) {
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        let bestVideo = data.items[0].id.videoId;
        let maxScore = -999;
        let bestTitle = data.items[0].snippet.title;

        data.items.forEach((item: any) => {
          const score = scoreVideo(item.snippet.title, exerciseName);
          if (score > maxScore) {
            maxScore = score;
            bestVideo = item.id.videoId;
            bestTitle = item.snippet.title;
          }
        });

        if (bestVideo) {
          return cacheAndReturn(bestVideo, bestTitle, 'youtube');
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
      // If YT API succeeded but found nothing, don't fallback.
      return null;
    }
  } catch (err) {
    console.warn("YouTube API request failed, falling back:", err);
  }

  if (signal?.aborted) return null;

  // 5. Fallback to Invidious (Race all instances for the fastest response)
  const fallbackPromises = INVIDIOUS_INSTANCES.map(async (instance) => {
    // Add a strict timeout to each instance to fail fast
    const invAbort = new AbortController();
    const timeout = setTimeout(() => invAbort.abort(), 6000);
    
    try {
      const res = await fetch(
        `${instance}/api/v1/search?q=${encodeURIComponent(`${exerciseName} proper form technique`)}&type=video&sort_by=views`,
        { signal: signal ? AbortSignal.any([signal, invAbort.signal]) : invAbort.signal }
      );
      if (!res.ok) throw new Error('Bad response');
      const results = await res.json();
      
      if (results && results.length > 0) {
        let bestVideo = results[0].videoId;
        let maxScore = -999;
        let bestTitle = results[0].title;
        
        results.slice(0, 5).forEach((item: any) => {
          const score = scoreVideo(item.title, exerciseName);
          if (score > maxScore) {
            maxScore = score;
            bestVideo = item.videoId;
            bestTitle = item.title;
          }
        });
        
        if (bestVideo) {
          return { videoId: bestVideo, title: bestTitle };
        }
      }
      throw new Error('No results');
    } finally {
      clearTimeout(timeout);
    }
  });

  try {
    // Promise.any will resolve with the FIRST successful instance
    const fastestResult = await Promise.any(fallbackPromises);
    if (fastestResult) {
      return cacheAndReturn(fastestResult.videoId, fastestResult.title, 'invidious');
    }
  } catch (e) {
    console.warn("All Invidious fallback instances failed.");
  }

  return null;
}
