import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrainedWith } from '@/types';

export type { TrainedWith };

interface Partner extends TrainedWith {
  closeMs: number;
}

interface EncounterState {
  sessionKey: string | null;
  partners: Record<string, Partner>;
  begin: (sessionKey: string) => void;
  addCloseTime: (partner: TrainedWith, ms: number) => void;
}

/** Persisted so an app reload mid-session keeps who was met. */
export const useEncounterStore = create<EncounterState>()(persist(set => ({
  sessionKey: null,
  partners: {},
  begin: sessionKey => set(s => (s.sessionKey === sessionKey ? s : { sessionKey, partners: {} })),
  addCloseTime: (partner, ms) => set(s => {
    const prev = s.partners[partner.uid];
    return { partners: { ...s.partners, [partner.uid]: { ...partner, closeMs: (prev?.closeMs || 0) + ms } } };
  }),
}), { name: 'apparatus-encounters', version: 1 }));

export const cardioSessionKey = (startedAt: number) => `c:${startedAt}`;
export const workoutSessionKey = (startedAt: number) => `w:${startedAt}`;

/** Minimum time side by side before someone counts as "trained with". */
const MIN_CLOSE_MS = { cardio: 2 * 60_000, workout: 5 * 60_000 };

export function trainedWithFor(sessionKey: string, kind: 'cardio' | 'workout'): TrainedWith[] {
  const s = useEncounterStore.getState();
  if (s.sessionKey !== sessionKey) return [];
  return Object.values(s.partners)
    .filter(p => p.closeMs >= MIN_CLOSE_MS[kind])
    .sort((a, b) => b.closeMs - a.closeMs)
    .slice(0, 10)
    .map(p => {
      const out: TrainedWith = { uid: p.uid, displayName: p.displayName, activity: p.activity };
      if (p.username) out.username = p.username;
      if (p.photoURL) out.photoURL = p.photoURL;
      if (p.startedAt) out.startedAt = p.startedAt;
      return out;
    });
}
