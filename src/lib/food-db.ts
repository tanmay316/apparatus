/**
 * Food lookup for manual logging: a built-in list of common foods (instant, offline)
 * plus Open Food Facts search and barcode lookup (free, no key).
 * Values are per 100 g and are typical estimates.
 */

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface FoodEntry {
  id: string;
  name: string;
  brand?: string;
  per100: Macros;
  serving: { label: string; grams: number };
  source: 'local' | 'off' | 'saved';
  image?: string;
}

type Row = [name: string, kcal: number, p: number, c: number, f: number, fib: number, serving: string, grams: number];

const COMMON: Row[] = [
  ['White rice, cooked', 130, 2.7, 28, 0.3, 0.4, '1 cup', 158],
  ['Brown rice, cooked', 123, 2.7, 25.6, 1, 1.6, '1 cup', 150],
  ['Roti / chapati', 297, 9.6, 49, 7.5, 5, '1 roti', 40],
  ['Paratha, plain', 326, 6.4, 45, 13, 4, '1 paratha', 80],
  ['Aloo paratha', 250, 5, 33, 11, 3, '1 paratha', 120],
  ['Dal (cooked lentils)', 116, 9, 20, 0.4, 8, '1 bowl', 200],
  ['Rajma curry', 140, 7, 18, 4, 6, '1 bowl', 200],
  ['Chickpeas, cooked', 164, 8.9, 27.4, 2.6, 7.6, '1 cup', 164],
  ['Paneer', 265, 18.3, 1.2, 20.8, 0, '100 g', 100],
  ['Chicken breast, cooked', 165, 31, 0, 3.6, 0, '1 breast', 150],
  ['Chicken curry', 150, 14, 5, 8, 1, '1 bowl', 200],
  ['Chicken biryani', 170, 8, 20, 6.5, 1, '1 plate', 300],
  ['Egg, boiled', 155, 12.6, 1.1, 10.6, 0, '1 large egg', 50],
  ['Egg white', 52, 10.9, 0.7, 0.2, 0, '1 egg white', 33],
  ['Omelette (2 eggs)', 154, 10.6, 0.7, 11.7, 0, '1 omelette', 120],
  ['Idli', 130, 4.4, 27, 0.6, 1.5, '1 idli', 40],
  ['Dosa, plain', 168, 3.9, 29, 3.7, 1, '1 dosa', 100],
  ['Poha', 130, 2.5, 24, 3, 1.2, '1 plate', 150],
  ['Upma', 120, 3, 18, 4, 1.5, '1 plate', 150],
  ['Khichdi', 120, 4.5, 20, 2.5, 2.5, '1 bowl', 250],
  ['Samosa', 262, 3.5, 24, 17, 2, '1 samosa', 80],
  ['Tofu, firm', 144, 17.3, 2.8, 8.7, 2.3, '100 g', 100],
  ['Salmon, cooked', 206, 22, 0, 12, 0, '1 fillet', 150],
  ['Tuna, canned in water', 116, 25.5, 0, 0.8, 0, '1 can', 100],
  ['Pasta, cooked', 158, 5.8, 30.9, 0.9, 1.8, '1 cup', 180],
  ['Instant noodles (dry)', 440, 9, 62, 17, 2, '1 pack', 70],
  ['Pizza, cheese', 266, 11.4, 33, 9.7, 2.3, '1 slice', 107],
  ['Burger', 250, 12.7, 30, 9.8, 1.5, '1 burger', 110],
  ['French fries', 312, 3.4, 41, 15, 3.8, '1 medium', 117],
  ['White bread', 265, 9, 49, 3.2, 2.7, '1 slice', 28],
  ['Whole wheat bread', 247, 13, 41, 3.4, 7, '1 slice', 32],
  ['Oats (dry)', 389, 16.9, 66.3, 6.9, 10.6, '1/2 cup', 40],
  ['Banana', 89, 1.1, 22.8, 0.3, 2.6, '1 medium', 118],
  ['Apple', 52, 0.3, 13.8, 0.2, 2.4, '1 medium', 182],
  ['Orange', 47, 0.9, 11.8, 0.1, 2.4, '1 medium', 131],
  ['Mango', 60, 0.8, 15, 0.4, 1.6, '1 cup', 165],
  ['Grapes', 69, 0.7, 18, 0.2, 0.9, '1 cup', 151],
  ['Avocado', 160, 2, 8.5, 14.7, 6.7, '1 avocado', 150],
  ['Potato, boiled', 87, 1.9, 20, 0.1, 1.8, '1 medium', 150],
  ['Sweet potato, baked', 90, 2, 20.7, 0.2, 3.3, '1 medium', 150],
  ['Broccoli', 34, 2.8, 6.6, 0.4, 2.6, '1 cup', 90],
  ['Spinach', 23, 2.9, 3.6, 0.4, 2.2, '1 cup', 30],
  ['Cucumber', 15, 0.7, 3.6, 0.1, 0.5, '1/2 cucumber', 150],
  ['Milk, whole', 61, 3.2, 4.8, 3.3, 0, '1 glass', 250],
  ['Milk, skim', 34, 3.4, 5, 0.1, 0, '1 glass', 250],
  ['Curd / plain yogurt', 61, 3.5, 4.7, 3.3, 0, '1 bowl', 150],
  ['Greek yogurt, nonfat', 59, 10.2, 3.6, 0.4, 0, '1 cup', 170],
  ['Whey protein powder', 400, 80, 8, 6, 0, '1 scoop', 30],
  ['Peanut butter', 588, 25, 20, 50, 6, '2 tbsp', 32],
  ['Almonds', 579, 21, 21.6, 49.9, 12.5, '1 handful', 28],
  ['Peanuts', 567, 25.8, 16.1, 49.2, 8.5, '1 handful', 28],
  ['Cheddar cheese', 403, 25, 1.3, 33, 0, '1 slice', 28],
  ['Butter', 717, 0.9, 0.1, 81, 0, '1 tbsp', 14],
  ['Ghee', 900, 0, 0, 100, 0, '1 tsp', 5],
  ['Olive oil', 884, 0, 0, 100, 0, '1 tbsp', 14],
  ['Honey', 304, 0.3, 82, 0, 0.2, '1 tbsp', 21],
  ['Sugar', 387, 0, 100, 0, 0, '1 tsp', 4],
  ['Dark chocolate (70%)', 598, 7.8, 45.9, 42.6, 10.9, '2 squares', 20],
  ['Masala chai', 45, 1.5, 7, 1.4, 0, '1 cup', 150],
  ['Coffee, black', 1, 0.1, 0, 0, 0, '1 cup', 240],
  ['Cola', 42, 0, 10.6, 0, 0, '1 can', 330],
  ['Orange juice', 45, 0.7, 10.4, 0.2, 0.2, '1 glass', 250],
];

export const LOCAL_FOODS: FoodEntry[] = COMMON.map(([name, calories, protein, carbs, fat, fiber, label, grams], i) => ({
  id: `local-${i}`,
  name,
  per100: { calories, protein, carbs, fat, fiber },
  serving: { label: `${label} (${grams} g)`, grams },
  source: 'local',
}));

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export function searchLocal(query: string, limit = 12): FoodEntry[] {
  const q = norm(query);
  if (!q) return LOCAL_FOODS.slice(0, limit);
  const words = q.split(' ');
  return LOCAL_FOODS
    .map(f => {
      const n = norm(f.name);
      if (!words.every(w => n.includes(w))) return null;
      const score = (n.startsWith(q) ? 0 : 1) + (n.split(' ').some(t => t.startsWith(words[0])) ? 0 : 1);
      return { f, score };
    })
    .filter((x): x is { f: FoodEntry; score: number } => !!x)
    .sort((a, b) => a.score - b.score || a.f.name.length - b.f.name.length)
    .slice(0, limit)
    .map(x => x.f);
}

export function portion(per100: Macros, grams: number): Macros {
  const k = grams / 100;
  const r = (v: number) => Math.round(v * k * 10) / 10;
  return { calories: Math.round(per100.calories * k), protein: r(per100.protein), carbs: r(per100.carbs), fat: r(per100.fat), fiber: r(per100.fiber) };
}

// ─── Open Food Facts ─────────────────────────────────────────

const OFF = 'https://world.openfoodfacts.org';
const OFF_FIELDS = 'code,product_name,brands,nutriments,serving_size,serving_quantity,image_front_small_url';

const num = (v: unknown) => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

function fromOff(p: any): FoodEntry | null {
  const n = p?.nutriments || {};
  let kcal = num(n['energy-kcal_100g']);
  if (!kcal && n.energy_100g) kcal = num(n.energy_100g) / 4.184;
  const name = String(p?.product_name || '').trim();
  if (!name || !kcal || kcal > 950) return null;
  const grams = num(p.serving_quantity);
  const servingGrams = grams > 0 && grams <= 2000 ? grams : 100;
  const image = typeof p.image_front_small_url === 'string' && p.image_front_small_url.startsWith('https://') ? p.image_front_small_url : undefined;
  return {
    id: `off-${p.code || name}`,
    name: name.slice(0, 80),
    brand: String(p.brands || '').split(',')[0].trim().slice(0, 40) || undefined,
    per100: {
      calories: Math.round(kcal),
      protein: Math.round(num(n.proteins_100g) * 10) / 10,
      carbs: Math.round(num(n.carbohydrates_100g) * 10) / 10,
      fat: Math.round(num(n.fat_100g) * 10) / 10,
      fiber: Math.round(num(n.fiber_100g) * 10) / 10,
    },
    serving: { label: grams > 0 && p.serving_size ? String(p.serving_size).slice(0, 30) : '100 g', grams: servingGrams },
    source: 'off',
    image,
  };
}

export async function searchOpenFoodFacts(query: string, signal?: AbortSignal): Promise<FoodEntry[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${OFF_FIELDS}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Food search failed (${res.status})`);
  const data = await res.json();
  const seen = new Set<string>();
  return (Array.isArray(data?.products) ? data.products : [])
    .map(fromOff)
    .filter((f: FoodEntry | null): f is FoodEntry => {
      if (!f) return false;
      const key = `${f.name}|${f.brand || ''}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export const isBarcode = (code: string) => /^\d{8,14}$/.test(code);

export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<FoodEntry | null> {
  if (!isBarcode(code)) return null;
  const res = await fetch(`${OFF}/api/v2/product/${code}.json?fields=${OFF_FIELDS}`, { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Barcode lookup failed (${res.status})`);
  const data = await res.json();
  return data?.status === 1 ? fromOff({ ...data.product, code }) : null;
}
