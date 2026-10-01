import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Apple, Flame, Settings2, Plus, ScanLine, Search, Bookmark, Dumbbell, Sparkles, Beef, Wheat, Droplet,
  Footprints, Minus, GlassWater, Heart, Leaf, RefreshCw, AlertCircle, Loader2, Coffee, Sun, Cookie, Moon, Pencil,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { analyzeFood, hasTrackableNutrition, logMeal, wakeUpServer } from '@/services/nutrition-api';
import { getDailySteps, DEFAULT_STEP_GOAL } from '@/services/cardio';
import {
  dateKey, logFoodEntries, logFoodEntry, logQuickEntry, MAX_SAVED_FOODS, mealTypeForNow, stepsCalories, useNutritionSetup, useTrainingBurned,
  useUpdateNutritionSetup, waterGoalFor, type SavedFood,
} from '@/services/nutrition-setup';
import { shiftDate } from '@/lib/analysis-common';
import { lookupBarcode, type FoodEntry } from '@/lib/food-db';
import { streakFrom } from '@/lib/nutrition-plan';
import NutritionOnboarding from '@/components/nutrition/NutritionOnboarding';
import FoodCamera, { type CapturedPhoto, type ScanMode } from '@/components/nutrition/FoodCamera';
import MealDetailSheet from '@/components/nutrition/MealDetailSheet';
import { ExerciseSheet, FoodPortionSheet, FoodSearchSheet, MultiLogSheet, QuickAddSheet, type BasketItem } from '@/components/nutrition/FoodSheets';
import { NutritionProgress, NutritionSettingsSheet } from '@/components/nutrition/NutritionProgress';
import { NumberSheet, Ring, useLockBody } from '@/components/nutrition/cal-ui';
import { GearPicks } from '@/components/market/GearPicks';
import {
  mealDate, mealName, sumTotals, useMealHistory, useMealThumb, useRefreshNutrition, type LoggedMeal,
} from '@/components/nutrition/use-nutrition-data';

interface PendingScan {
  id: string;
  photo: CapturedPhoto;
  startedAt: number;
  status: 'analyzing' | 'error';
  message?: string;
  mealType: string;
}

const MEAL_GROUPS = [
  { id: 'breakfast', label: 'Breakfast', icon: Coffee },
  { id: 'lunch', label: 'Lunch', icon: Sun },
  { id: 'snack', label: 'Snacks', icon: Cookie },
  { id: 'dinner', label: 'Dinner', icon: Moon },
] as const;
type MealGroup = typeof MEAL_GROUPS[number]['id'];

const groupOf = (t?: string): MealGroup => {
  const k = (t || '').toLowerCase();
  return k === 'breakfast' || k === 'lunch' || k === 'dinner' ? k : 'snack';
};

const LABEL_NOTE = 'This photo shows a nutrition facts label. Read the per-serving values from the label and report one serving of this product.';

// ─── Small pieces ────────────────────────────────────────────

function WeekStrip({ selected, onSelect, byDay, goal }: { selected: string; onSelect: (k: string) => void; byDay: Map<string, LoggedMeal[]>; goal: number }) {
  const today = dateKey();
  const dow = new Date().getDay();
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(today, i - dow));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
      {days.map(k => {
        const d = new Date(`${k}T12:00:00`);
        const future = k > today;
        const eaten = sumTotals(byDay.get(k) || []).calories;
        const isSel = k === selected;
        return (
          <button
            key={k}
            type="button"
            disabled={future}
            onClick={() => onSelect(k)}
            aria-pressed={isSel}
            aria-label={format(d, 'EEEE, MMM d')}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 0', borderRadius: 16, background: isSel ? 'var(--cal-card)' : 'transparent', boxShadow: isSel ? 'var(--cal-shadow)' : undefined, opacity: future ? 0.4 : 1 }}
          >
            <span className="cal-muted" style={{ fontSize: 12, fontWeight: 700 }}>{format(d, 'EEEEE')}</span>
            {eaten > 0 ? (
              <Ring size={34} stroke={2.6} pct={eaten / Math.max(goal, 1)} color={eaten > goal * 1.05 ? 'var(--cal-bad)' : 'var(--cal-good)'}>
                <span className="cal-tabular" style={{ fontSize: 13, fontWeight: 800 }}>{d.getDate()}</span>
              </Ring>
            ) : (
              <span className="cal-tabular" style={{ width: 34, height: 34, borderRadius: 34, border: '1.8px dashed var(--cal-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, opacity: 0.85 }}>{d.getDate()}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function MacroCard({ label, left, goal, icon: Icon, color }: { label: string; left: number; goal: number; icon: typeof Beef; color: string }) {
  const over = left < 0;
  return (
    <div className="cal-card" style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div className="cal-tabular" style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: over ? 'var(--cal-bad)' : undefined }}>{Math.abs(Math.round(left))}g</div>
        <div className="cal-muted" style={{ fontSize: 12, fontWeight: 600 }}>{label} {over ? 'over' : 'left'}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Ring size={62} stroke={6} pct={1 - Math.max(0, left) / Math.max(goal, 1)} color={color}>
          <Icon size={18} color={color} />
        </Ring>
      </div>
    </div>
  );
}

function PagerDots({ count, index }: { count: number; index: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} style={{ width: i === index ? 16 : 6, height: 6, borderRadius: 6, background: i === index ? 'var(--cal-text)' : 'var(--cal-muted)', opacity: i === index ? 1 : 0.35, transition: 'width 0.2s' }} />
      ))}
    </div>
  );
}

function MacroChips({ meal }: { meal: Pick<LoggedMeal, 'protein' | 'carbs' | 'fat'> }) {
  return (
    <div className="cal-tabular" style={{ display: 'flex', gap: 12, fontSize: 12.5, fontWeight: 700 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Beef size={13} color="var(--cal-protein)" />{Math.round(meal.protein || 0)}g</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Wheat size={13} color="var(--cal-carbs)" />{Math.round(meal.carbs || 0)}g</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Droplet size={13} color="var(--cal-fat)" />{Math.round(meal.fat || 0)}g</span>
    </div>
  );
}

function Thumb({ imageId }: { imageId: number | null }) {
  const { data } = useMealThumb(imageId);
  return (
    <div style={{ width: 92, height: 92, borderRadius: 16, overflow: 'hidden', flexShrink: 0, background: 'var(--cal-card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {data ? <img src={data} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Apple size={26} className="cal-muted" />}
    </div>
  );
}

function MealCard({ meal, onClick }: { meal: LoggedMeal; onClick: () => void }) {
  return (
    <motion.button layout type="button" onClick={onClick} className="cal-card" style={{ width: '100%', minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, padding: 10, textAlign: 'left' }}>
      <Thumb imageId={meal.image_id} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mealName(meal)}</span>
          <span className="cal-card-2" style={{ padding: '3px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, flexShrink: 0 }}>{format(mealDate(meal), 'h:mm a')}</span>
        </div>
        <div className="cal-tabular" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 15, fontWeight: 800 }}>
          <Flame size={15} /> {Math.round(meal.calories || 0)} calories
        </div>
        <MacroChips meal={meal} />
      </div>
    </motion.button>
  );
}

function PendingCard({ scan, onRetry, onDismiss }: { scan: PendingScan; onRetry: () => void; onDismiss: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (scan.status !== 'analyzing') return;
    const t = window.setInterval(() => setNow(Date.now()), 120);
    return () => window.clearInterval(t);
  }, [scan.status]);
  // Eases towards 95% over ~10 s; the real result snaps it to done.
  const pct = Math.min(95, Math.round(95 * (1 - Math.exp(-(now - scan.startedAt) / 4200))));
  const error = scan.status === 'error';
  return (
    <motion.div layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className="cal-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10 }}>
      <div style={{ position: 'relative', width: 92, height: 92, borderRadius: 16, overflow: 'hidden', flexShrink: 0 }}>
        <img src={scan.photo.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: error ? 'grayscale(0.6)' : undefined }} />
        {!error && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ring size={54} stroke={5} pct={pct / 100} color="#fff" track="rgba(255,255,255,0.25)">
              <span className="cal-tabular" style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>{pct}%</span>
            </Ring>
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {error ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: 'var(--cal-bad)' }}><AlertCircle size={15} /> Couldn&apos;t analyze</div>
            <div className="cal-muted" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{scan.message}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" onClick={onRetry} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px', borderRadius: 999, background: 'var(--cal-primary)', color: 'var(--cal-on-primary)', fontSize: 12.5, fontWeight: 700 }}><RefreshCw size={13} /> Retry</button>
              <button type="button" onClick={onDismiss} style={{ height: 30, padding: '0 12px', borderRadius: 999, background: 'var(--cal-card-2)', fontSize: 12.5, fontWeight: 700 }}>Dismiss</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{scan.photo.mode === 'label' ? 'Reading label…' : 'Analyzing food…'}</div>
            <div className="cal-skeleton" style={{ height: 9, width: '80%', marginTop: 10 }} />
            <div className="cal-skeleton" style={{ height: 9, width: '55%', marginTop: 8 }} />
            <div className="cal-muted" style={{ fontSize: 11.5, marginTop: 8 }}>You can keep using the app</div>
          </>
        )}
      </div>
    </motion.div>
  );
}

function AddMenu({ onPick, onClose }: { onPick: (id: 'exercise' | 'saved' | 'database' | 'scan' | 'astra') => void; onClose: () => void }) {
  useLockBody();
  const tiles = [
    { id: 'exercise' as const, label: 'Log exercise', icon: Dumbbell },
    { id: 'saved' as const, label: 'Saved foods', icon: Bookmark },
    { id: 'database' as const, label: 'Food database', icon: Search },
    { id: 'scan' as const, label: 'Scan food', icon: ScanLine },
  ];
  return (
    <div className="cal" style={{ position: 'fixed', inset: 0, zIndex: 10000 }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: 'spring', damping: 26, stiffness: 380 }}
        style={{ position: 'absolute', left: 20, right: 20, bottom: 'calc(env(safe-area-inset-bottom) + 170px)', maxWidth: 420, margin: '0 auto' }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {tiles.map(t => (
            <button key={t.id} type="button" onClick={() => onPick(t.id)} className="cal-card" style={{ height: 112, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 15, fontWeight: 700 }}>
              <t.icon size={26} />
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => onPick('astra')} className="cal-card" style={{ width: '100%', marginTop: 12, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 700 }}>
          <Sparkles size={18} /> Ask Astra
        </button>
      </motion.div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────

export default function NutritionDashboard() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const profile = useAuthStore(s => s.profile);
  const { showToast } = useUIStore();
  const setupQ = useNutritionSetup();
  const setup = setupQ.data;
  const updateSetup = useUpdateNutritionSetup();
  const history = useMealHistory();
  const refresh = useRefreshNutrition();

  const [tab, setTab] = useState<'home' | 'progress'>('home');
  const [selected, setSelected] = useState(dateKey());
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState<PendingScan[]>([]);
  const [menu, setMenu] = useState(false);
  const [camera, setCamera] = useState<ScanMode | null>(null);
  const [search, setSearch] = useState<'all' | 'saved' | null>(null);
  const [portionFood, setPortionFood] = useState<FoodEntry | null>(null);
  const [quickAdd, setQuickAdd] = useState(false);
  const [exercise, setExercise] = useState(false);
  const [settings, setSettings] = useState(false);
  const [redo, setRedo] = useState(false);
  const [openMeal, setOpenMeal] = useState<LoggedMeal | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [review, setReview] = useState(false);
  // Meal chosen from a section's "+" (otherwise the time of day decides).
  const [addMealType, setAddMealType] = useState<string | undefined>();
  const [portionGrams, setPortionGrams] = useState<number | undefined>();
  const [editWater, setEditWater] = useState(false);
  const pagerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { wakeUpServer(); }, []);
  useEffect(() => {
    const onRefresh = () => refresh();
    window.addEventListener('refresh-nutrition', onRefresh);
    return () => window.removeEventListener('refresh-nutrition', onRefresh);
  }, [refresh]);

  const today = dateKey();
  const goals = setup?.goals ?? { calories: 2000, protein: 140, carbs: 220, fat: 65, fiber: 28 };
  const byDay = history.byDay;
  const dayMeals = byDay.get(selected) || [];
  const totals = sumTotals(dayMeals);

  const burnedQ = useTrainingBurned(selected);
  const stepsQ = useQuery({
    queryKey: ['daily-steps', user?.uid, selected],
    queryFn: () => getDailySteps(user!.uid, selected),
    enabled: !!user?.uid,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const manualBurned = setup?.burned?.[selected] || 0;
  // Steps outside tracked walks/runs (those are already in cardio calories).
  const extraSteps = Math.max(0, (stepsQ.data ?? 0) - (burnedQ.data?.cardioSteps || 0));
  const burned = {
    workouts: burnedQ.data?.workouts || 0,
    cardio: burnedQ.data?.cardio || 0,
    steps: stepsCalories(extraSteps, setup?.answers?.weightKg || 70),
    manual: manualBurned,
  };
  const burnedTotal = burned.workouts + burned.cardio + burned.steps + burned.manual;
  const addBurned = setup?.prefs?.addBurned !== false;

  const yesterday = shiftDate(selected, -1);
  const yMeals = byDay.get(yesterday);
  const rollover = setup?.prefs?.rollover && yMeals?.length ? Math.max(0, Math.min(200, Math.round(goals.calories - sumTotals(yMeals).calories))) : 0;
  const bonus = (addBurned ? burnedTotal : 0) + rollover;
  const dayGoal = goals.calories + bonus;
  const calLeft = Math.round(dayGoal - totals.calories);
  const streak = streakFrom(new Set(byDay.keys()), today, shiftDate);

  const stepGoal = profile?.stepGoal || DEFAULT_STEP_GOAL;
  const waterGoal = waterGoalFor(setup);
  const water = setup?.water?.[selected] || 0;
  const scored = dayMeals.filter(m => m.health_score != null);
  const healthAvg = scored.length ? Math.round(scored.reduce((s, m) => s + (m.health_score || 0), 0) / scored.length / 10) : null;
  const grouped = useMemo(() => {
    const g: Record<MealGroup, LoggedMeal[]> = { breakfast: [], lunch: [], snack: [], dinner: [] };
    for (const m of dayMeals) g[groupOf(m.meal_type)].push(m);
    for (const k of Object.keys(g) as MealGroup[]) g[k].sort((a, b) => mealDate(a).getTime() - mealDate(b).getTime());
    return g;
  }, [dayMeals]);

  // ─── Actions ───
  const runScan = useCallback(async (scan: PendingScan) => {
    setPending(list => list.map(p => (p.id === scan.id ? { ...p, status: 'analyzing', startedAt: Date.now(), message: undefined } : p)));
    const mealType = scan.mealType;
    try {
      const res = await analyzeFood(scan.photo.base64, scan.photo.mime, mealType, undefined, undefined, scan.photo.mode === 'label' ? LABEL_NOTE : '');
      if (!hasTrackableNutrition(res)) throw new Error(res.message || (res.status === 'not_food' ? "We couldn't find any food in that photo." : 'The food scanner is busy. Try again in a moment.'));
      await logMeal(res, mealType, res.assistant_message_id, res.image_id);
      await refresh();
      setPending(list => list.filter(p => p.id !== scan.id));
      setSelected(dateKey());
    } catch (err: any) {
      setPending(list => list.map(p => (p.id === scan.id ? { ...p, status: 'error', message: err?.message || 'Something went wrong.' } : p)));
    }
  }, [refresh]);

  const onPhoto = (photo: CapturedPhoto) => {
    setCamera(null);
    setTab('home');
    const scan: PendingScan = { id: `${Date.now()}`, photo, startedAt: Date.now(), status: 'analyzing', mealType: addMealType || mealTypeForNow() };
    setAddMealType(undefined);
    setPending(list => [scan, ...list]);
    runScan(scan);
  };

  const onBarcode = async (code: string) => {
    setCamera(null);
    setLookingUp(true);
    try {
      const food = await lookupBarcode(code);
      if (food) setPortionFood(food);
      else showToast(`No product found for ${code}. Try the food database or a photo.`, 'error');
    } catch {
      showToast('Barcode lookup failed. Check your connection.', 'error');
    } finally {
      setLookingUp(false);
    }
  };

  const saved = setup?.saved || [];
  const savedIds = new Set(saved.map(s => s.id));
  const writeSaved = async (list: SavedFood[]) => {
    try {
      await updateSetup({ saved: list }, prev => ({ ...prev, saved: list }));
    } catch {
      showToast('Could not update saved foods', 'error');
    }
  };
  const toggleSavedFood = (food: FoodEntry) => {
    if (savedIds.has(food.id)) return writeSaved(saved.filter(s => s.id !== food.id));
    const entry: SavedFood = { id: food.id, name: food.name, per100: food.per100, serving: food.serving, ...(food.brand ? { brand: food.brand } : {}) };
    writeSaved([entry, ...saved].slice(0, MAX_SAVED_FOODS));
    showToast('Saved to your foods', 'success');
  };
  const toggleSavedMeal = (meal: LoggedMeal) => {
    const id = `meal-${meal.id}`;
    if (savedIds.has(id)) return writeSaved(saved.filter(s => s.id !== id));
    const grams = (meal.items || []).reduce((s, i) => s + (i.weight_grams || 0), 0);
    const base = grams > 0 ? grams : 100;
    const k = 100 / base;
    const r = (v: number) => Math.round((v || 0) * k * 10) / 10;
    const entry: SavedFood = {
      id,
      name: mealName(meal),
      per100: { calories: Math.round((meal.calories || 0) * k), protein: r(meal.protein), carbs: r(meal.carbs), fat: r(meal.fat), fiber: r(meal.fiber) },
      serving: { label: grams > 0 ? `1 serving (${Math.round(grams)} g)` : '1 serving', grams: base },
    };
    writeSaved([entry, ...saved].slice(0, MAX_SAVED_FOODS));
    showToast('Meal saved to your foods', 'success');
  };

  const closePortion = () => { setPortionFood(null); setPortionGrams(undefined); };
  const closeSearch = () => { setSearch(null); setAddMealType(undefined); };
  const openSearch = (tab: 'all' | 'saved', mealType?: string) => { setAddMealType(mealType); setSearch(tab); };

  const logPortion = async (grams: number, mealType: string) => {
    if (!portionFood) return;
    try {
      await logFoodEntry(portionFood, grams, mealType);
      await refresh();
      const id = portionFood.id;
      setBasket(list => list.filter(b => b.food.id !== id));
      closePortion();
      if (!review) closeSearch();
      setSelected(dateKey());
      showToast(`Added to ${mealType}`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not log this food', 'error');
    }
  };

  const MAX_BASKET = 30;
  const putInBasket = (food: FoodEntry, grams: number) => setBasket(list => (
    list.some(b => b.food.id === food.id)
      ? list.map(b => (b.food.id === food.id ? { food, grams } : b))
      : [...list, { food, grams }].slice(0, MAX_BASKET)
  ));
  const toggleBasket = (food: FoodEntry) => setBasket(list => (
    list.some(b => b.food.id === food.id)
      ? list.filter(b => b.food.id !== food.id)
      : [...list, { food, grams: food.serving.grams }].slice(0, MAX_BASKET)
  ));
  const removeFromBasket = (id: string) => {
    const next = basket.filter(b => b.food.id !== id);
    setBasket(next);
    if (!next.length) setReview(false);
  };
  const logBasket = async (mealType: string) => {
    const n = basket.length;
    try {
      await logFoodEntries(basket, mealType);
      await refresh();
      setBasket([]);
      setReview(false);
      closeSearch();
      setSelected(dateKey());
      showToast(`Logged ${n} ${n === 1 ? 'food' : 'foods'} to ${mealType}`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not log these foods', 'error');
    }
  };

  const saveWaterGoal = async (ml: number) => {
    try {
      await updateSetup({ waterGoal: ml }, prev => ({ ...prev, waterGoal: ml }));
    } catch {
      showToast('Could not save water goal', 'error');
    }
  };

  const setWater = async (ml: number) => {
    const v = Math.max(0, Math.min(8000, ml));
    try {
      await updateSetup({ water: { [selected]: v } }, prev => ({ ...prev, water: { ...(prev.water || {}), [selected]: v } }));
    } catch {
      showToast('Could not save water', 'error');
    }
  };

  const setPref = async (k: 'addBurned' | 'rollover', v: boolean) => {
    const prefs = { ...(setup?.prefs || { addBurned: true, rollover: false }), [k]: v };
    try {
      await updateSetup({ prefs }, prev => ({ ...prev, prefs }));
    } catch {
      showToast('Could not save setting', 'error');
    }
  };

  const addManualBurned = async (kcal: number) => {
    const v = manualBurned + kcal;
    try {
      await updateSetup({ burned: { [selected]: v } }, prev => ({ ...prev, burned: { ...(prev.burned || {}), [selected]: v } }));
      showToast(`+${kcal} calories burned`, 'success');
    } catch {
      showToast('Could not save exercise', 'error');
    }
  };

  const onMenu = (id: 'exercise' | 'saved' | 'database' | 'scan' | 'astra') => {
    setMenu(false);
    if (id === 'scan') setCamera('food');
    else if (id === 'database') openSearch('all');
    else if (id === 'saved') openSearch('saved');
    else if (id === 'exercise') setExercise(true);
    else window.dispatchEvent(new Event('open-ai-bot'));
  };

  const onPagerScroll = () => {
    const el = pagerRef.current;
    if (el) setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };

  // ─── Gates ───
  if (!user) return null;
  if (setupQ.isLoading) {
    return (
      <div className="cal" style={{ maxWidth: 560, margin: '0 auto', paddingTop: 12 }}>
        <div className="cal-skeleton" style={{ height: 28, width: 140, borderRadius: 10 }} />
        <div className="cal-skeleton" style={{ height: 150, borderRadius: 22, marginTop: 20 }} />
        <div className="cal-skeleton" style={{ height: 120, borderRadius: 22, marginTop: 12 }} />
      </div>
    );
  }
  if (setupQ.isError) {
    return (
      <div className="cal" style={{ maxWidth: 560, margin: '40px auto', textAlign: 'center' }}>
        <AlertCircle size={28} style={{ margin: '0 auto' }} className="cal-muted" />
        <p style={{ marginTop: 10, fontWeight: 700 }}>Couldn&apos;t load your nutrition plan</p>
        <button type="button" className="cal-btn" style={{ marginTop: 16, height: 46 }} onClick={() => setupQ.refetch()}>Try again</button>
      </div>
    );
  }
  if (!setup || redo) {
    return <NutritionOnboarding existing={setup} onDone={() => setRedo(false)} onClose={redo ? () => setRedo(false) : () => navigate('/')} />;
  }

  const isToday = selected === today;
  const hasEntries = dayMeals.length > 0 || (isToday && pending.length > 0);

  return (
    <div className="cal" style={{ width: '100%', minWidth: 0, maxWidth: 560, margin: '0 auto', paddingTop: 4, paddingBottom: 110 }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <h1 style={{ flex: 1, fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em' }}>Nutrition</h1>
        <span className="cal-card" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 36, padding: '0 12px', borderRadius: 999, fontSize: 14, fontWeight: 800 }} title="Day streak">
          <Flame size={16} color="var(--cal-carbs)" /> <span className="cal-tabular">{streak}</span>
        </span>
        <button type="button" onClick={() => setSettings(true)} className="cal-card" aria-label="Nutrition settings" style={{ width: 36, height: 36, borderRadius: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Settings2 size={17} /></button>
      </header>

      <div className="cal-seg" role="tablist" style={{ marginBottom: 14 }}>
        <button type="button" role="tab" aria-selected={tab === 'home'} onClick={() => setTab('home')}>Today</button>
        <button type="button" role="tab" aria-selected={tab === 'progress'} onClick={() => setTab('progress')}>Progress</button>
      </div>

      {tab === 'progress' ? (
        <NutritionProgress setup={setup} byDay={byDay} goals={goals} />
      ) : (
        <>
          <WeekStrip selected={selected} onSelect={setSelected} byDay={byDay} goal={goals.calories} />

          {history.isError && (
            <div className="cal-card" style={{ marginTop: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600 }}>
              <AlertCircle size={16} color="var(--cal-bad)" />
              <span style={{ flex: 1 }}>Couldn&apos;t reach the nutrition server.</span>
              <button type="button" onClick={() => history.refetch()} style={{ fontWeight: 800 }}>Retry</button>
            </div>
          )}

          {/* Summary pager */}
          <div ref={pagerRef} onScroll={onPagerScroll} className="cal-pager" style={{ display: 'flex', overflowX: 'auto', marginTop: 12, marginLeft: -4, marginRight: -4 }}>
            {/* Page 1: calories + macros */}
            <div style={{ flex: '0 0 100%', padding: '4px 4px 6px' }}>
              <div className="cal-card" style={{ padding: '20px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cal-tabular" style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: calLeft < 0 ? 'var(--cal-bad)' : undefined }}>
                    {history.isLoading ? '—' : Math.abs(calLeft).toLocaleString()}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 14, fontWeight: 600 }} className="cal-muted">Calories {calLeft < 0 ? 'over' : 'left'}</div>
                  {(burnedTotal > 0 || rollover > 0) && (
                    <div className="cal-tabular" style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11.5, fontWeight: 700 }}>
                      {burnedTotal > 0 && (addBurned ? (
                        <button type="button" onClick={() => setExercise(true)} className="cal-card-2" style={{ padding: '3px 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Flame size={11} color="var(--cal-carbs)" /> +{burnedTotal} burned
                        </button>
                      ) : (
                        <button type="button" onClick={() => setPref('addBurned', true)} className="cal-card-2" style={{ padding: '3px 8px', borderRadius: 999 }}>
                          {burnedTotal} burned · add to goal
                        </button>
                      ))}
                      {rollover > 0 && <span className="cal-card-2" style={{ padding: '3px 8px', borderRadius: 999, color: 'var(--cal-fat)' }}>+{rollover} rollover</span>}
                    </div>
                  )}
                </div>
                <Ring size={108} stroke={9} pct={totals.calories / Math.max(dayGoal, 1)} color={calLeft < 0 ? 'var(--cal-bad)' : 'var(--cal-text)'}>
                  <Flame size={26} />
                </Ring>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 10 }}>
                <MacroCard label="Protein" left={goals.protein - totals.protein} goal={goals.protein} icon={Beef} color="var(--cal-protein)" />
                <MacroCard label="Carbs" left={goals.carbs - totals.carbs} goal={goals.carbs} icon={Wheat} color="var(--cal-carbs)" />
                <MacroCard label="Fats" left={goals.fat - totals.fat} goal={goals.fat} icon={Droplet} color="var(--cal-fat)" />
              </div>
            </div>

            {/* Page 2: activity + water */}
            <div style={{ flex: '0 0 100%', padding: '4px 4px 6px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="cal-card" style={{ padding: 16 }}>
                  <div className="cal-tabular" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>{(stepsQ.data ?? 0).toLocaleString()}</div>
                  <div className="cal-muted" style={{ fontSize: 12.5, fontWeight: 600 }}>/{stepGoal.toLocaleString()} steps</div>
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
                    <Ring size={70} stroke={6} pct={(stepsQ.data ?? 0) / stepGoal} color="var(--cal-good)"><Footprints size={20} /></Ring>
                  </div>
                </div>
                <button type="button" onClick={() => setExercise(true)} className="cal-card" style={{ padding: 16, textAlign: 'left' }}>
                  <div className="cal-tabular" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>{burnedTotal}</div>
                  <div className="cal-muted" style={{ fontSize: 12.5, fontWeight: 600 }}>Calories burned</div>
                  <div className="cal-muted cal-tabular" style={{ marginTop: 10, display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dumbbell size={13} /> Workouts <b style={{ marginLeft: 'auto', color: 'var(--cal-text)' }}>{burned.workouts}</b></span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Footprints size={13} /> Cardio <b style={{ marginLeft: 'auto', color: 'var(--cal-text)' }}>{burned.cardio}</b></span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Footprints size={13} /> Steps <b style={{ marginLeft: 'auto', color: 'var(--cal-text)' }}>{burned.steps}</b></span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={13} /> Manual <b style={{ marginLeft: 'auto', color: 'var(--cal-text)' }}>{burned.manual}</b></span>
                  </div>
                </button>
              </div>
              <div className="cal-card" style={{ padding: 16, marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="cal-option-icon" style={{ width: 44, height: 44, background: 'var(--cal-card-2)', color: 'var(--cal-water)' }}><GlassWater size={20} /></span>
                <button type="button" onClick={() => setEditWater(true)} aria-label="Edit water goal" style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700 }}>Water <Pencil size={12} className="cal-muted" /></div>
                  <div className="cal-muted cal-tabular" style={{ fontSize: 13, fontWeight: 600 }}>{water.toLocaleString()} / {waterGoal.toLocaleString()} ml</div>
                  <div style={{ marginTop: 6, height: 5, borderRadius: 5, background: 'var(--cal-card-2)' }}>
                    <div style={{ width: `${Math.min(100, (water / waterGoal) * 100)}%`, height: '100%', borderRadius: 5, background: 'var(--cal-water)', transition: 'width 0.3s' }} />
                  </div>
                </button>
                <button type="button" className="cal-icon-btn" aria-label="Remove a glass" onClick={() => setWater(water - 250)} disabled={water <= 0}><Minus size={17} /></button>
                <button type="button" className="cal-icon-btn" aria-label="Add a glass" onClick={() => setWater(water + 250)} style={{ background: 'var(--cal-primary)', color: 'var(--cal-on-primary)' }}><Plus size={17} /></button>
              </div>
            </div>

            {/* Page 3: fibre + health score */}
            <div style={{ flex: '0 0 100%', padding: '4px 4px 6px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <MacroCard label="Fiber" left={goals.fiber - totals.fiber} goal={goals.fiber} icon={Leaf} color="var(--cal-fiber)" />
                <div className="cal-card" style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div className="cal-tabular" style={{ fontSize: 20, fontWeight: 800 }}>{healthAvg != null ? `${healthAvg}/10` : '—'}</div>
                    <div className="cal-muted" style={{ fontSize: 12, fontWeight: 600 }}>Health score</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <Ring size={62} stroke={6} pct={(healthAvg ?? 0) / 10} color={healthAvg == null ? 'var(--cal-muted)' : healthAvg >= 7 ? 'var(--cal-good)' : healthAvg >= 5 ? 'var(--cal-carbs)' : 'var(--cal-bad)'}>
                      <Heart size={18} color="var(--cal-protein)" />
                    </Ring>
                  </div>
                </div>
              </div>
              <div className="cal-card" style={{ padding: '14px 16px', marginTop: 10, fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>
                <span className="cal-muted">Daily targets · </span>
                <span className="cal-tabular">{goals.calories.toLocaleString()} cal · {goals.protein}g protein · {goals.carbs}g carbs · {goals.fat}g fat</span>
              </div>
            </div>
          </div>
          <PagerDots count={3} index={page} />

          {/* Meals */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '22px 2px 10px' }}>
            <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>{isToday ? 'Today\'s meals' : format(new Date(`${selected}T12:00:00`), 'EEEE, MMM d')}</h2>
            {dayMeals.length > 0 && <span className="cal-muted cal-tabular" style={{ fontSize: 13, fontWeight: 600 }}>{Math.round(totals.calories).toLocaleString()} cal</span>}
          </div>

          {history.isLoading ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {[0, 1].map(i => <div key={i} className="cal-skeleton" style={{ height: 112, borderRadius: 22 }} />)}
            </div>
          ) : hasEntries || isToday ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 18 }}>
              {isToday && pending.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
                  <AnimatePresence initial={false}>
                    {pending.map(p => (
                      <PendingCard key={p.id} scan={p} onRetry={() => runScan(p)} onDismiss={() => setPending(list => list.filter(x => x.id !== p.id))} />
                    ))}
                  </AnimatePresence>
                </div>
              )}
              {MEAL_GROUPS.map(g => {
                const list = grouped[g.id];
                if (!list.length && !isToday) return null;
                const t = sumTotals(list);
                return (
                  <section key={g.id} aria-label={g.label}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 2px 8px' }}>
                      <span className="cal-option-icon" style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--cal-card)' }}><g.icon size={16} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 800 }}>{g.label}</div>
                        {list.length > 0 && (
                          <div className="cal-muted cal-tabular" style={{ fontSize: 12, fontWeight: 600 }}>
                            {Math.round(t.calories).toLocaleString()} cal · P {Math.round(t.protein)}g · C {Math.round(t.carbs)}g · F {Math.round(t.fat)}g
                          </div>
                        )}
                      </div>
                      {isToday && (
                        <button type="button" onClick={() => openSearch('all', g.id)} className="cal-icon-btn" aria-label={`Add to ${g.label.toLowerCase()}`} style={{ width: 34, height: 34, background: 'var(--cal-card)' }}><Plus size={17} /></button>
                      )}
                    </div>
                    {list.length > 0 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
                        {list.map(m => <MealCard key={m.id} meal={m} onClick={() => setOpenMeal(m)} />)}
                      </div>
                    ) : (
                      <div className="cal-card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderStyle: 'dashed' }}>
                        <button type="button" onClick={() => openSearch('all', g.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 8px', fontSize: 14, fontWeight: 700, textAlign: 'left' }}>
                          <Search size={16} className="cal-muted" /> Add {g.label.toLowerCase()}
                        </button>
                        <button type="button" onClick={() => { setAddMealType(g.id); setCamera('food'); }} className="cal-icon-btn" aria-label={`Scan ${g.label.toLowerCase()}`} style={{ width: 40, height: 40, background: 'var(--cal-card-2)' }}><ScanLine size={17} /></button>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="cal-card" style={{ padding: '26px 20px', textAlign: 'center' }}>
              <div style={{ width: 54, height: 54, borderRadius: 18, margin: '0 auto', background: 'var(--cal-card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ScanLine size={24} /></div>
              <div style={{ marginTop: 12, fontSize: 16, fontWeight: 800 }}>{isToday ? "You haven't uploaded any food" : 'Nothing logged this day'}</div>
              <div className="cal-muted" style={{ marginTop: 4, fontSize: 13.5, lineHeight: 1.45 }}>Start tracking {isToday ? "today's" : 'your'} meals by taking a quick picture.</div>
              {isToday && <button type="button" className="cal-btn" style={{ marginTop: 16, height: 46, fontSize: 15 }} onClick={() => setCamera('food')}><ScanLine size={17} /> Scan food</button>}
            </div>
          )}

          <GearPicks
            placement="nutrition"
            variant="cal"
            context={[
              { lose: 'lose weight fat loss', gain: 'gain weight muscle gain bulk', maintain: 'maintain weight' }[setup.answers?.goal as 'lose' | 'gain' | 'maintain'] || '',
              setup.answers?.diet || '',
              ...(setup.answers?.accomplish || []),
            ]}
          />
        </>
      )}

      {/* Floating add button */}
      <motion.button
        type="button"
        onClick={() => setMenu(m => !m)}
        whileTap={{ scale: 0.92 }}
        aria-label={menu ? 'Close menu' : 'Add'}
        className="fixed right-5 lg:right-10 bottom-[calc(env(safe-area-inset-bottom)+92px)] lg:bottom-10"
        style={{ zIndex: menu ? 10001 : 200, width: 60, height: 60, borderRadius: 60, background: 'var(--cal-primary)', color: 'var(--cal-on-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}
      >
        <motion.span animate={{ rotate: menu ? 45 : 0 }} style={{ display: 'flex' }}><Plus size={28} /></motion.span>
      </motion.button>

      {lookingUp && (
        <div className="cal" style={{ position: 'fixed', inset: 0, zIndex: 10012, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="cal-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700 }}><Loader2 size={18} className="animate-spin" /> Looking up product…</div>
        </div>
      )}

      <AnimatePresence>
        {menu && <AddMenu key="menu" onPick={onMenu} onClose={() => setMenu(false)} />}
        {camera && <FoodCamera key="camera" initialMode={camera} onPhoto={onPhoto} onBarcode={onBarcode} onClose={() => { setCamera(null); setAddMealType(undefined); }} />}
        {search && !portionFood && !quickAdd && !review && (
          <FoodSearchSheet
            key="search"
            initialTab={search}
            saved={saved}
            basket={basket}
            onPick={setPortionFood}
            onToggle={toggleBasket}
            onReview={() => setReview(true)}
            onQuickAdd={() => setQuickAdd(true)}
            onClose={closeSearch}
          />
        )}
        {portionFood && (
          <FoodPortionSheet
            key={`portion-${portionFood.id}`}
            food={portionFood}
            initialGrams={portionGrams ?? basket.find(b => b.food.id === portionFood.id)?.grams}
            initialMealType={addMealType}
            isSaved={savedIds.has(portionFood.id)}
            onToggleSave={() => toggleSavedFood(portionFood)}
            onLog={logPortion}
            onAddToList={grams => {
              putInBasket(portionFood, grams);
              closePortion();
              if (!search) setReview(true);
            }}
            onClose={closePortion}
          />
        )}
        {review && !portionFood && basket.length > 0 && (
          <MultiLogSheet
            key="review"
            items={basket}
            initialMealType={addMealType}
            onChange={(id, grams) => setBasket(list => list.map(b => (b.food.id === id ? { ...b, grams } : b)))}
            onRemove={removeFromBasket}
            onEdit={b => { setPortionGrams(b.grams); setPortionFood(b.food); }}
            onAddMore={() => { setReview(false); if (!search) setSearch('all'); }}
            onLog={logBasket}
            onClose={() => setReview(false)}
          />
        )}
        {quickAdd && (
          <QuickAddSheet
            key="quick"
            initialMealType={addMealType}
            onClose={() => setQuickAdd(false)}
            onLog={async (name, m, mealType) => {
              try {
                await logQuickEntry(name, m, mealType);
                await refresh();
                setQuickAdd(false);
                closeSearch();
                setSelected(dateKey());
                showToast(`Added to ${mealType}`, 'success');
              } catch (err: any) {
                showToast(err?.message || 'Could not log this entry', 'error');
              }
            }}
          />
        )}
        {editWater && (
          <NumberSheet
            key="water-goal"
            title="Daily water goal"
            value={waterGoal}
            unit="ml"
            min={500}
            max={8000}
            onSave={saveWaterGoal}
            onClose={() => setEditWater(false)}
          />
        )}
        {exercise && <ExerciseSheet key="exercise" burned={burned} onManual={addManualBurned} onClose={() => setExercise(false)} />}
        {settings && <NutritionSettingsSheet key="settings" setup={setup} onEditPlan={() => { setSettings(false); setRedo(true); }} onClose={() => setSettings(false)} />}
        {openMeal && (
          <MealDetailSheet
            key={`meal-${openMeal.id}`}
            meal={openMeal}
            isSaved={savedIds.has(`meal-${openMeal.id}`)}
            onToggleSave={toggleSavedMeal}
            onChanged={refresh}
            onClose={() => setOpenMeal(null)}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
