import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { getNutritionHistory, getNutritionImage } from '@/services/nutrition-api';
import { dateKey } from '@/services/nutrition-setup';

export interface MealItem {
  food_name: string;
  weight_grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface LoggedMeal {
  id: number;
  meal_type: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  health_score: number | null;
  health_grade: string | null;
  logged_at: string;
  image_id: number | null;
  items: MealItem[];
}

export interface DayTotals { calories: number; protein: number; carbs: number; fat: number; fiber: number; count: number }

/** Server timestamps look like "2026-09-30 06:12:03.1+00:00". */
export function mealDate(meal: Pick<LoggedMeal, 'logged_at'>): Date {
  const raw = String(meal.logged_at || '');
  const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function mealName(meal: Pick<LoggedMeal, 'items' | 'meal_type'>): string {
  const names = (meal.items || []).map(i => cap(String(i.food_name || '').trim())).filter(Boolean);
  if (names.length === 0) return cap(meal.meal_type || 'Meal');
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1].toLowerCase()}`;
  return `${names[0]}, ${names[1].toLowerCase()} +${names.length - 2} more`;
}

export function sumTotals(meals: LoggedMeal[]): DayTotals {
  return meals.reduce<DayTotals>((t, m) => ({
    calories: t.calories + (m.calories || 0),
    protein: t.protein + (m.protein || 0),
    carbs: t.carbs + (m.carbs || 0),
    fat: t.fat + (m.fat || 0),
    fiber: t.fiber + (m.fiber || 0),
    count: t.count + 1,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, count: 0 });
}

export const HISTORY_DAYS = 60;

export function useMealHistory(days = HISTORY_DAYS) {
  const uid = useAuthStore(s => s.user?.uid);
  const q = useQuery({
    queryKey: ['nutrition-history', uid, days],
    queryFn: async () => ((await getNutritionHistory(days))?.history || []) as LoggedMeal[],
    enabled: !!uid,
    staleTime: 20_000,
  });
  const byDay = useMemo(() => {
    const map = new Map<string, LoggedMeal[]>();
    for (const m of q.data || []) {
      const k = dateKey(mealDate(m));
      const list = map.get(k);
      if (list) list.push(m);
      else map.set(k, [m]);
    }
    for (const list of map.values()) list.sort((a, b) => mealDate(b).getTime() - mealDate(a).getTime());
    return map;
  }, [q.data]);
  return { ...q, byDay };
}

export function useRefreshNutrition() {
  const qc = useQueryClient();
  const uid = useAuthStore(s => s.user?.uid);
  return () => qc.invalidateQueries({ queryKey: ['nutrition-history', uid] });
}

/** Full-size meal photo (not persisted). */
export function useMealImage(imageId: number | null | undefined) {
  return useQuery({
    queryKey: ['nutrition-image', imageId],
    queryFn: async () => {
      const res = await getNutritionImage(imageId!);
      return `data:${res.mime_type};base64,${res.base64_data}`;
    },
    enabled: !!imageId,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  });
}

function shrink(dataUrl: string, size = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, size / Math.min(img.width, img.height));
      const w = Math.round(img.width * s), h = Math.round(img.height * s);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('no canvas'));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => reject(new Error('bad image'));
    img.src = dataUrl;
  });
}

/** Small persisted thumbnail for list rows. */
export function useMealThumb(imageId: number | null | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['meal-thumb', imageId],
    queryFn: async () => {
      const full = await qc.fetchQuery({
        queryKey: ['nutrition-image', imageId],
        queryFn: async () => {
          const res = await getNutritionImage(imageId!);
          return `data:${res.mime_type};base64,${res.base64_data}`;
        },
        staleTime: Infinity,
      });
      return shrink(full);
    },
    enabled: !!imageId,
    staleTime: Infinity,
    gcTime: 24 * 3600_000,
    retry: 1,
  });
}
