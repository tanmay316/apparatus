import { getSignedInUser } from '@/lib/firebase';
import { isProRequired } from '@/services/billing';
import { useSubscriptionStore } from '@/stores/subscription-store';

const API_BASE = import.meta.env.VITE_NUTRITION_API_URL || 'http://localhost:8000/api/v1';

export interface WorkoutPlanPayload {
  goal: string;
  days: number;
  equipment: string;
  customInfo: string;
  experience?: string;
  gender?: string;
  age?: number;
  weight?: number;
  sessionDuration?: number;
  injuries?: string;
  trainingStyle?: string;
  fitnessGoal?: string;
}

export async function generateWorkoutPlan(payload: WorkoutPlanPayload) {
  const user = await getSignedInUser();
  if (!user) throw new Error('Must be logged in to generate plans');

  const token = await user.getIdToken();

  const response = await fetch(`${API_BASE}/workout/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 402 && isProRequired(errorData.detail)) {
      useSubscriptionStore.getState().openPaywall(errorData.detail.message);
      throw new Error(errorData.detail.message);
    }
    throw new Error(errorData.detail || 'Failed to generate workout plan');
  }

  return response.json();
}
