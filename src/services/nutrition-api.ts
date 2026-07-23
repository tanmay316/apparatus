/**
 * Nutrition API Service.
 * Handles all communication with the Python FastAPI backend.
 */
import { auth } from '@/lib/firebase';

const API_BASE = import.meta.env.VITE_NUTRITION_API_URL || 'http://localhost:8000/api/v1';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken();
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API Error ${res.status}`);
  }
  return res.json();
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
  provider_used: string;
  latency_ms: number;
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
  vision?: VisionResult;
  nutrition?: NutritionResult;
  errors?: string[];
  session_id?: number;
  image_id?: number;
}



// ─── Chat ────────────────────────────────────────────────

export interface ChatMessageResponse {
  response: string;
  session_id: number;
  tokens_used: number;
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
): Promise<ChatMessageResponse> {
  return apiRequest<ChatMessageResponse>('/nutrition/chat', {
    method: 'POST',
    body: JSON.stringify({ message, session_id: sessionId }),
  });
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

export async function analyzeFood(base64Data: string, mimeType: string, mealType: string = 'snack', sessionId?: number) {
  return apiRequest<any>('/nutrition/food/analyze', {
    method: 'POST',
    body: JSON.stringify({ image_base64: base64Data, mime_type: mimeType, meal_type: mealType, session_id: sessionId }),
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
