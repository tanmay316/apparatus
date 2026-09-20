import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface CachedName {
  name: string | null;
  photoURL: string | null;
  listeners: Set<(name: string | null, photoURL: string | null) => void>;
  unsubscribe: () => void;
}

// Shared cache so the same user rendered in many list items (feed, comments, chat) only
// opens a single Firestore listener per user instead of one per rendered row.
const cache = new Map<string, CachedName>();

function subscribe(userId: string, onChange: (name: string | null, photoURL: string | null) => void) {
  let entry = cache.get(userId);
  if (!entry) {
    const listeners = new Set<(name: string | null, photoURL: string | null) => void>();
    const unsubscribe = onSnapshot(doc(db, 'users', userId), snap => {
      const data = snap.data();
      const name = data?.displayName ?? null;
      const photoURL = data?.photoURL ?? null;
      const current = cache.get(userId);
      if (current) {
        current.name = name;
        current.photoURL = photoURL;
        current.listeners.forEach(listener => listener(name, photoURL));
      }
    }, () => { /* ignore permission/offline errors — fallback name is used */ });
    entry = { name: null, photoURL: null, listeners, unsubscribe };
    cache.set(userId, entry);
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
 * of trusting a denormalized copy stored on a post/message/membership at write time — so a
 * name change in Settings is immediately reflected everywhere the user appears.
 * Falls back to the provided values until the live document loads (or if the lookup fails).
 */
export function useLiveDisplayName(userId?: string | null, fallbackName?: string | null, fallbackPhoto?: string | null) {
  const [name, setName] = useState<string | null>(fallbackName ?? null);
  const [photoURL, setPhotoURL] = useState<string | null>(fallbackPhoto ?? null);

  useEffect(() => {
    setName(fallbackName ?? null);
    setPhotoURL(fallbackPhoto ?? null);
    if (!userId) return;

    const unsubscribe = subscribe(userId, (liveName, livePhoto) => {
      setName(liveName || fallbackName || null);
      setPhotoURL(livePhoto || fallbackPhoto || null);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { displayName: name ?? fallbackName ?? '', photoURL: photoURL ?? fallbackPhoto ?? '' };
}
