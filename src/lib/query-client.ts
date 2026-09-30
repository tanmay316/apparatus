import { QueryClient, dehydrate, hydrate, type DehydratedState } from '@tanstack/react-query';
import { deserialize, idbDelete, idbGet, idbSet, isPersistable, serialize } from '@/lib/persist';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      // Restored data must outlive the gap before the first screen subscribes.
      gcTime: 1000 * 60 * 30,
      retry: 1,
    },
  },
});

const CACHE_KEY = 'query-cache.v1';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 3;
const MAX_QUERY_CHARS = 1_500_000;

interface PersistedCache {
  uid: string;
  savedAt: number;
  queries: string[];
}

/** Restores the last saved query cache for `uid` (never another user's). */
export async function restoreQueryCache(uid: string | undefined) {
  if (!uid) return;
  try {
    const saved = await idbGet<PersistedCache>(CACHE_KEY);
    if (!saved || saved.uid !== uid || Date.now() - saved.savedAt > MAX_AGE_MS) return;
    const queries = saved.queries.map(q => deserialize<DehydratedState['queries'][number]>(q));
    hydrate(queryClient, { mutations: [], queries });
  } catch (err) {
    console.warn('Query cache restore failed:', err);
  }
}

let currentUid: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  const uid = currentUid;
  if (!uid) return;
  try {
    const state = dehydrate(queryClient, {
      shouldDehydrateQuery: q => q.queryKey[0] !== 'nutrition-image' && q.state.status === 'success' && q.state.data !== undefined && isPersistable(q.state.data),
    });
    const queries: string[] = [];
    for (const q of state.queries) {
      const text = serialize(q);
      if (text.length <= MAX_QUERY_CHARS) queries.push(text);
    }
    await idbSet(CACHE_KEY, { uid, savedAt: Date.now(), queries } satisfies PersistedCache);
  } catch (err) {
    console.warn('Query cache save failed:', err);
  }
}

let persisting = false;

/** Saves the query cache (debounced) and immediately when the app goes to the background. */
export function startQueryPersistence() {
  if (persisting) return;
  persisting = true;
  queryClient.getQueryCache().subscribe(event => {
    if (event.type !== 'updated' || event.action.type !== 'success' || !currentUid) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void saveNow(); }, 4000);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void saveNow();
  });
}

export function setQueryPersistenceUser(uid: string | null) {
  if (currentUid && currentUid !== uid) {
    queryClient.clear();
    idbDelete(CACHE_KEY).catch(() => {});
  }
  currentUid = uid;
}
