import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { getMeasurements } from '@/services/measurements';

export function useUserWeight(userId?: string, fallbackProfileWeight?: number) {
  const { user, profile } = useAuthStore();
  const targetUid = userId || user?.uid;
  const isOwn = !userId || userId === user?.uid;

  const { data: measurements = [] } = useQuery({
    queryKey: ['measurements', targetUid],
    queryFn: () => getMeasurements(targetUid!),
    enabled: !!targetUid && isOwn,
  });

  if (isOwn) {
    const latestWeight = measurements.find(m => m.weight != null)?.weight;
    return latestWeight || profile?.weight;
  }

  return fallbackProfileWeight;
}
