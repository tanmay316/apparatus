const KEY = 'apparatus.chunk-reload';

export function isChunkLoadError(err: unknown): boolean {
  const message = String((err as { message?: unknown } | null)?.message ?? err ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(message);
}

/** A deploy replaced the hashed chunks this page still references: reload once to pick up the new build. */
export function reloadForStaleChunk(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) || 0) < 30_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
