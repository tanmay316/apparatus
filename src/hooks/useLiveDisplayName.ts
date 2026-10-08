import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface CachedName {
  name: string | null;
  photoURL: string | null;
  pro: boolean;
  listeners: Set<(name: string | null, photoURL: string | null, pro: boolean) => void>;
  unsubscribe: () => void;
}

// Shared cache so the same user rendered in many list items (feed, comments, chat) only
// opens a single Firestore listener per user instead of one per rendered row.
const cache = new Map<string, CachedName>();

function subscribe(userId: string, onChange: (name: string | null, photoURL: string | null, pro: boolean) => void) {
  let entry = cache.get(userId);
  if (!entry) {
    const listeners = new Set<(name: string | null, photoURL: string | null, pro: boolean) => void>();
    const unsubscribe = onSnapshot(doc(db, 'users', userId), snap => {
      const data = snap.data();
      const name = data?.displayName ?? null;
      const photoURL = data?.photoURL ?? null;
      // Server-written only (rules block clients from setting it).
      const pro = data?.proBadge === true;
      const current = cache.get(userId);
      if (current) {
        current.name = name;
        current.photoURL = photoURL;
        current.pro = pro;
        current.listeners.forEach(listener => listener(name, photoURL, pro));
      }
    }, () => { /* ignore permission/offline errors - fallback name is used */ });
    entry = { name: null, photoURL: null, pro: false, listeners, unsubscribe };
    cache.set(userId, entry);
  } else if (entry.name !== null || entry.photoURL !== null) {
    onChange(entry.name, entry.photoURL, entry.pro);
  }
  entry.listeners.add(onChange);
  return () => {
    const current = cache.get(userId);
    if (!current) return;
    current.listeners.delete(onChange);
    if (current.listeners.size === 0) {
      current.unsubscribe();
      cache.delete(userId);
    }
  };
}

/**
 * Resolves a user's *current* display name/photo live from their profile document instead
 * of trusting a denormalized copy stored on a post/message/membership at write time - so a
 * name change in Settings is immediately reflected everywhere the user appears.
 * Falls back to the provided values until the live document loads (or if the lookup fails).
 */
export function useLiveDisplayName(userId?: string | null, fallbackName?: string | null, fallbackPhoto?: string | null) {
  const [name, setName] = useState<string | null>(fallbackName ?? null);
  const [photoURL, setPhotoURL] = useState<string | null>(fallbackPhoto ?? null);
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    setName(fallbackName ?? null);
    setPhotoURL(fallbackPhoto ?? null);
    setIsPro(false);
    if (!userId) return;

    const unsubscribe = subscribe(userId, (liveName, livePhoto, livePro) => {
      setName(liveName || fallbackName || null);
      setPhotoURL(livePhoto || fallbackPhoto || null);
      setIsPro(livePro);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { displayName: name ?? fallbackName ?? '', photoURL: photoURL ?? fallbackPhoto ?? '', isPro };
}
