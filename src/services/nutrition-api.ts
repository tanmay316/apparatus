/**
 * Nutrition API Service.
 * Handles all communication with the Python FastAPI backend.
 */
import { getSignedInUser } from '@/lib/firebase';
import { isProRequired } from '@/services/billing';
import { useSubscriptionStore } from '@/stores/subscription-store';

const API_BASE = import.meta.env.VITE_NUTRITION_API_URL || 'http://localhost:8000/api/v1';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = await getSignedInUser();
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken();
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store', // Prevent browser caching of GET requests
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    if (res.status === 402 && isProRequired(err.detail)) {
      useSubscriptionStore.getState().openPaywall(err.detail.message);
      throw new ApiError(err.detail.message, 402);
    }
    throw new ApiError(typeof err.detail === 'string' ? err.detail : `API Error ${res.status}`, res.status);
  }
  return res.json();
}

export async function wakeUpServer(): Promise<void> {
  try {
    // Lightweight unauthenticated ping to wake the free-tier instance.
    await fetch(`${API_BASE.replace('/api/v1', '')}/ping`, { mode: 'no-cors' });
  } catch {
    // Ignore errors for this background ping
  }
}

// ─── Food Scanner ────────────────────────────────────────

export interface DetectedFood {
  name: string;
  confidence: number;
  estimated_weight_grams: number | null;
  category: string | null;
}

export interface VisionResult {
  detected_foods: DetectedFood[];
  raw_description: string;
  is_food: boolean;
  plate_count: number;
  provider_used?: string;
  latency_ms?: number;
}

export interface NutritionItem {
  name: string;
  weight_grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface HealthScore {
  score: number;
  grade: string;
  breakdown: Record<string, number>;
  suggestions: string[];
}

export interface NutritionResult {
  nutrition: {
    items: NutritionItem[];
    total_calories: number;
    total_protein: number;
    total_carbs: number;
    total_fat: number;
    total_fiber: number;
  };
  health_score: HealthScore;
  recommendations: string[];
  healthy_swaps: Array<{ original: string; swap: string; benefit: string }>;
  hydration_suggestion: string;
}

export interface FoodAnalyzeResponse {
  success: boolean;
  /** ok = foods found; not_food = no food in the photo; failed = vision providers unavailable. */
  status?: 'ok' | 'not_food' | 'failed';
  message?: string;
  vision?: VisionResult;
  nutrition?: NutritionResult;
  errors?: string[];
  session_id?: number;
  image_id?: number;
  assistant_message_id?: string;
}

/** True when the result has items that can be tracked. */
export function hasTrackableNutrition(data?: FoodAnalyzeResponse | null): boolean {
  return !!data?.nutrition?.nutrition?.items?.length;
}



// ─── Chat ────────────────────────────────────────────────────────

export interface ChatMessageResponse {
  response: string;
  reasoning?: string | null;
  session_id: number;
  tokens_used: number;
  nutritionData?: FoodAnalyzeResponse | null;
  message_id?: string;
  tools_used?: string[];
  profile_updated?: boolean;
}

export interface ChatSessionItem {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export async function sendChatMessage(
  message: string,
  sessionId?: number,
  signal?: AbortSignal
): Promise<ChatMessageResponse> {
  return apiRequest<ChatMessageResponse>('/nutrition/chat', {
    method: 'POST',
    body: JSON.stringify({ message, session_id: sessionId }),
    signal,
  });
}

export type ChatStreamEvent =
  | { type: 'session'; session_id: number }
  | { type: 'status'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'replace'; text: string };

/**
 * Coach reply streamed token by token (NDJSON). Calls `onEvent` as text arrives and resolves with the
 * saved message. Falls back to the non-streaming endpoint on servers that don't have /chat/stream yet.
 */
export async function streamChatMessage(
  message: string,
  sessionId: number | undefined,
  signal: AbortSignal | undefined,
  onEvent: (e: ChatStreamEvent) => void,
): Promise<ChatMessageResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/nutrition/chat/stream`, {
    method: 'POST',
    cache: 'no-store',
    headers,
    body: JSON.stringify({ message, session_id: sessionId }),
    signal,
  });
  if (res.status === 404 || res.status === 405) return sendChatMessage(message, sessionId, signal);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    if (res.status === 402 && isProRequired(err.detail)) {
      useSubscriptionStore.getState().openPaywall(err.detail.message);
      throw new ApiError(err.detail.message, 402);
    }
    throw new ApiError(typeof err.detail === 'string' ? err.detail : `API Error ${res.status}`, res.status);
  }
  if (!res.body) return res.json();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done: ChatMessageResponse | null = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    let ev: any;
    try { ev = JSON.parse(line); } catch { return; }
    if (ev.type === 'done') done = ev as ChatMessageResponse;
    else onEvent(ev as ChatStreamEvent);
  };
  for (;;) {
    const { value, done: finished } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });
    let nl = buffer.indexOf('\n');
    while (nl >= 0) {
      handle(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf('\n');
    }
  }
  handle(buffer + decoder.decode());
  if (!done) throw new ApiError('The coach stopped responding. Please try again.', 0);
  return done;
}

export async function getChatSessions(): Promise<ChatSessionItem[]> {
  return apiRequest<ChatSessionItem[]>('/nutrition/chat/sessions');
}

export async function getChatSessionMessages(sessionId: number): Promise<Array<{ id: string; role: 'user' | 'assistant'; content: string; metadata_?: any }>> {
  return apiRequest<Array<{ id: string; role: 'user' | 'assistant'; content: string; metadata_?: any }>>(`/nutrition/chat/sessions/${sessionId}/messages`);
}

export async function deleteChatSession(sessionId: number): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/nutrition/chat/sessions/${sessionId}`, {
    method: 'DELETE',
  });
}

// ─── Recipe ──────────────────────────────────────────────

export async function generateRecipe(query: string) {
  return apiRequest<any>('/nutrition/recipe/generate', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

// ─── Meal Plan ───────────────────────────────────────────

export async function generateMealPlan(planType: string = 'daily') {
  return apiRequest<any>('/nutrition/meal-plan/generate', {
    method: 'POST',
    body: JSON.stringify({ plan_type: planType }),
  });
}

// ─── Food Logging ────────────────────────────────────────

export async function analyzeFood(base64Data: string, mimeType: string, mealType: string = 'snack', sessionId?: number, signal?: AbortSignal, note = '') {
  return apiRequest<FoodAnalyzeResponse>('/nutrition/food/analyze', {
    method: 'POST',
    body: JSON.stringify({ image_base64: base64Data, mime_type: mimeType, meal_type: mealType, session_id: sessionId, note: note.slice(0, 500) }),
    signal,
  });
}

// ─── Today / History ─────────────────────────────────────

export interface TodayNutrition {
  date: string;
  meal_count: number;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  total_fiber: number;
  meals: any[];
  goals?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
}

export async function getTodayNutrition(): Promise<TodayNutrition> {
  return apiRequest<TodayNutrition>('/nutrition/today');
}

export async function getNutritionHistory(days: number = 7) {
  return apiRequest<any>(`/nutrition/history?days=${days}`);
}

export async function logMeal(visionData: any, mealType: string = 'snack', messageId?: string, imageId?: number) {
  return apiRequest<any>('/nutrition/food/log', {
    method: 'POST',
    body: JSON.stringify({
      vision_data: visionData,
      meal_type: mealType,
      message_id: messageId,
      image_id: imageId
    }),
  });
}

export async function getNutritionImage(imageId: number) {
  return apiRequest<any>(`/nutrition/images/${imageId}`);
}

export async function getNutritionProfile() {
  return apiRequest<any>('/nutrition/profile');
}

export async function updateNutritionProfile(data: any) {
  return apiRequest<any>('/nutrition/profile', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateMealType(mealId: number, mealType: string) {
  return apiRequest<any>(`/nutrition/meals/${mealId}/type`, {
    method: 'PATCH',
    body: JSON.stringify({ meal_type: mealType }),
  });
}

export interface MealItemInput {
  food_name: string;
  weight_grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

/** Replace a logged meal's items (servings / portion fixes); totals are recomputed server-side. */
export async function updateMealItems(mealId: number, items: MealItemInput[], mealType?: string) {
  return apiRequest<any>(`/nutrition/meals/${mealId}`, {
    method: 'PATCH',
    body: JSON.stringify({ items, meal_type: mealType }),
  });
}

export async function deleteMeal(mealId: number) {
  return apiRequest<{ success: boolean }>(`/nutrition/meals/${mealId}`, { method: 'DELETE' });
}
