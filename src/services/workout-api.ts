import { auth } from '@/lib/firebase';

const API_BASE = import.meta.env.VITE_NUTRITION_API_URL || 'http://localhost:8000/api/v1';

export async function generateWorkoutPlan(payload: {
  goal: string;
  days: number;
  equipment: string;
  customInfo: string;
}) {
  const user = auth.currentUser;
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
    throw new Error(errorData.detail || 'Failed to generate workout plan');
  }

  return response.json();
}
