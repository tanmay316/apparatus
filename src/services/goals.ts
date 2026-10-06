import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { sanitizeGoals, type TrainingGoal } from '@/lib/pro-insights';

export const goalsRef = (uid: string) => doc(db, 'users', uid, 'private', 'goals');

export async function getTrainingGoals(uid: string): Promise<TrainingGoal[]> {
  const snap = await getDoc(goalsRef(uid));
  return snap.exists() ? sanitizeGoals(snap.data().items) : [];
}

export function useTrainingGoals() {
  const uid = useAuthStore(s => s.user?.uid);
  return useQuery({
    queryKey: ['training-goals', uid],
    queryFn: () => getTrainingGoals(uid!),
    enabled: !!uid,
    staleTime: 5 * 60_000,
  });
}

/** Replace the goal list; the cache updates first so the UI responds instantly. */
export function useSaveTrainingGoals() {
  const uid = useAuthStore(s => s.user?.uid);
  const qc = useQueryClient();
  return async (goals: TrainingGoal[]) => {
    if (!uid) throw new Error('Not signed in');
    const key = ['training-goals', uid];
    const prev = qc.getQueryData<TrainingGoal[]>(key);
    const items = sanitizeGoals(goals);
    qc.setQueryData(key, items);
    try {
      await setDoc(goalsRef(uid), { items, updatedAt: serverTimestamp() });
    } catch (err) {
      qc.setQueryData(key, prev);
      throw err;
    }
  };
}
