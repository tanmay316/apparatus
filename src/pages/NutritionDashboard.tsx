import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Apple, Plus, ScanLine, Flame, SlidersHorizontal, Loader2, Coffee, Sun, Moon, Cookie, ChevronRight, Target, UtensilsCrossed } from 'lucide-react';
import CameraScanner from '@/components/nutrition/CameraScanner';
import NutritionResultCard from '@/components/nutrition/NutritionResultCard';
import NutritionChat from '@/components/nutrition/NutritionChat';
import NutritionProfileModal from '@/components/nutrition/NutritionProfileModal';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { analyzeFood, getTodayNutrition, getNutritionHistory, hasTrackableNutrition, logMeal, type FoodAnalyzeResponse, type TodayNutrition } from '@/services/nutrition-api';
import MealDetailsModal from '@/components/nutrition/MealDetailsModal';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

const MEAL_ICONS: Record<string, typeof Coffee> = { breakfast: Coffee, lunch: Sun, dinner: Moon, snack: Cookie };

function gradeStyle(grade: string): React.CSSProperties {
  if (['A+', 'A'].includes(grade)) return { background: 'var(--dx-success-soft)', color: 'var(--dx-success)' };
  if (['B+', 'B'].includes(grade)) return { background: 'rgba(234, 179, 8, 0.14)', color: 'var(--dx-warning)' };
  return { background: 'rgba(249, 115, 22, 0.14)', color: '#ea580c' };
}

function MacroBar({ label, value, goal, color, loading }: { label: string; value: number; goal: number; color: string; loading: boolean }) {
  const pct = Math.min((value / Math.max(goal, 1)) * 100, 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="font-medium inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
          {label}
        </span>
        <span className="dx-muted tabular">
          <span className="font-semibold" style={{ color: 'var(--dx-text)' }}>{loading ? '–' : value.toFixed(0)}</span> / {goal}g
        </span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--dx-card-2)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: loading ? 0 : `${pct}%` }}
          transition={{ duration: 0.9, delay: 0.2, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

function MealRow({ meal, subtitle, onClick }: { meal: any; subtitle: string; onClick: () => void }) {
  const Icon = MEAL_ICONS[meal.meal_type] || Apple;
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--dx-card-2)] active:bg-[var(--dx-card-2)]">
      <span className="dx-badge-icon"><Icon size={17} /></span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-semibold capitalize truncate">{meal.meal_type}</span>
        <span className="block text-[12px] dx-muted truncate">{subtitle}</span>
      </span>
      {meal.health_grade && (
        <span className="dx-pill shrink-0" style={gradeStyle(meal.health_grade)}>{meal.health_grade}</span>
      )}
      <ChevronRight size={17} className="dx-muted shrink-0" />
    </button>
  );
}

export default function NutritionDashboard() {
  const [showScanner, setShowScanner] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanResult, setScanResult] = useState<FoodAnalyzeResponse | null>(null);
  const [scanTracked, setScanTracked] = useState(false);
  const [trackingScan, setTrackingScan] = useState(false);
  const [todayData, setTodayData] = useState<TodayNutrition | null>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loadingToday, setLoadingToday] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<any>(null);


  // Goals from API or defaults
  const goals = todayData?.goals || {
    calories: 2200,
    protein: 140,
    carbs: 250,
    fat: 65,
    fiber: 30,
  };

  const loadToday = useCallback(async () => {
    try {
      const data = await getTodayNutrition();
      setTodayData(data);
    } catch {
      // API might not be running yet - show placeholder
      setTodayData(null);
    } finally {
      setLoadingToday(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const data = await getNutritionHistory(7);
      if (data && data.history) {
        // filter out today's meals from history if needed, or just show all
        setHistoryData(data.history);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadToday();
    loadHistory();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        loadToday();
        loadHistory();
      }
    });
    return () => unsubscribe();
  }, [loadToday, loadHistory]);

  // Listen for refresh event from chat
  useEffect(() => {
    const handleRefresh = () => {
      loadToday();
      loadHistory();
    };
    window.addEventListener('refresh-nutrition', handleRefresh);
    return () => window.removeEventListener('refresh-nutrition', handleRefresh);
  }, [loadToday, loadHistory]);

  const handleCapture = async (base64: string, mimeType: string) => {
    setIsAnalyzing(true);
    setError('');
    try {
      const result = await analyzeFood(base64, mimeType, 'snack');
      setShowScanner(false);
      if (hasTrackableNutrition(result)) {
        setScanResult(result);
        setScanTracked(false);
      } else {
        setError(result.message || "Couldn't find any food in that photo. Try again.");
      }
    } catch (err: any) {
      setError(err.message || 'Failed to analyze food. Please try again.');
      setShowScanner(false);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleTrackScan = async () => {
    if (!scanResult || scanTracked) return;
    setTrackingScan(true);
    try {
      const hour = new Date().getHours();
      const mealType = hour >= 5 && hour < 11 ? 'breakfast' : hour < 16 ? 'lunch' : hour < 19 ? 'snack' : 'dinner';
      await logMeal(scanResult, mealType, scanResult.assistant_message_id, scanResult.image_id);
      setScanTracked(true);
      loadToday();
      loadHistory();
    } catch (err: any) {
      setError(err.message || 'Could not track this meal.');
    } finally {
      setTrackingScan(false);
    }
  };

  const handleMealTypeUpdate = useCallback((mealId: number, newType: string) => {
    setSelectedMeal((prev: any) => (prev && prev.id === mealId ? { ...prev, meal_type: newType } : prev));
    setTodayData((prev: any) => {
      if (!prev || !prev.meals) return prev;
      return {
        ...prev,
        meals: prev.meals.map((m: any) => (m.id === mealId ? { ...m, meal_type: newType } : m)),
      };
    });
    setHistoryData((prev: any[]) => {
      if (!prev) return prev;
      return prev.map((m: any) => (m.id === mealId ? { ...m, meal_type: newType } : m));
    });
    loadToday();
    loadHistory();
  }, [loadToday, loadHistory]);

  const caloriesConsumed = todayData?.total_calories || 0;
  const proteinConsumed = todayData?.total_protein || 0;
  const carbsConsumed = todayData?.total_carbs || 0;
  const fatConsumed = todayData?.total_fat || 0;
  const fiberConsumed = todayData?.total_fiber || 0;
  const caloriesLeft = Math.max(0, goals.calories - caloriesConsumed);
  const calPct = Math.min(caloriesConsumed / Math.max(goals.calories, 1), 1);
  const RING = 2 * Math.PI * 52;
  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  const pastByDay = (historyData || [])
    .filter(m => new Date(m.logged_at).toDateString() !== new Date().toDateString())
    .reduce<{ key: string; label: string; total: number; meals: any[] }[]>((groups, meal) => {
      const d = new Date(meal.logged_at);
      const key = d.toDateString();
      let group = groups.find(g => g.key === key);
      if (!group) {
        group = { key, label: d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }), total: 0, meals: [] };
        groups.push(group);
      }
      group.meals.push(meal);
      group.total += meal.calories || 0;
      return groups;
    }, []);

  return (
    <>
      <motion.div variants={container} initial="hidden" animate="show" className="dx pro-scope space-y-4 max-w-4xl mx-auto pt-1 sm:pt-4">
        {/* Header */}
        <motion.header variants={item} className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="dx-eyebrow">{todayLabel}</div>
            <h1 className="mt-1 text-[22px] sm:text-[27px] font-semibold tracking-tight leading-tight">Nutrition</h1>
          </div>
          <button onClick={() => setShowProfile(true)} className="dx-btn-secondary h-10 px-3.5 text-[13px] shrink-0" title="Body metrics & goals">
            <SlidersHorizontal size={15} /> Goals
          </button>
        </motion.header>

        {/* Error */}
        {error && (
          <motion.div variants={item} className="dx-card p-4 text-[13px] font-medium" style={{ color: '#dc2626', background: 'rgba(220, 38, 38, 0.06)' }}>
            {error}
          </motion.div>
        )}

        {/* Scan Result */}
        {scanResult && (
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="dx-section-title">Scan result</h2>
              <div className="flex items-center gap-3">
                <button onClick={handleTrackScan} disabled={scanTracked || trackingScan} className="dx-btn h-9 text-[13px]">
                  {scanTracked ? 'Tracked' : trackingScan ? 'Tracking…' : 'Track meal'}
                </button>
                <button onClick={() => setScanResult(null)} className="dx-link">Dismiss</button>
              </div>
            </div>
            <NutritionResultCard result={scanResult} onClose={() => setScanResult(null)} />
          </div>
        )}

        {/* Daily summary */}
        <motion.section variants={item} className="dx-card p-4 sm:p-5" aria-label="Daily progress">
          <div className="flex items-center gap-5">
            <div className="relative w-[124px] h-[124px] shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 124 124">
                <circle cx="62" cy="62" r="52" fill="none" strokeWidth="10" style={{ stroke: 'var(--dx-card-2)' }} />
                <motion.circle
                  cx="62" cy="62" r="52" fill="none"
                  strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={RING}
                  style={{ stroke: 'var(--dx-accent)' }}
                  initial={{ strokeDashoffset: RING }}
                  animate={{ strokeDashoffset: loadingToday ? RING : RING * (1 - calPct) }}
                  transition={{ duration: 1.1, delay: 0.2, ease: 'easeOut' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {loadingToday ? (
                  <Loader2 size={22} className="animate-spin dx-muted" />
                ) : (
                  <>
                    <span className="text-[26px] font-semibold tabular leading-none">{caloriesLeft.toFixed(0)}</span>
                    <span className="mt-1 text-[11px] dx-muted">kcal left</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0 space-y-3">
              {[
                { icon: Target, label: 'Goal', value: goals.calories },
                { icon: UtensilsCrossed, label: 'Eaten', value: caloriesConsumed },
                { icon: Flame, label: 'Remaining', value: caloriesLeft },
              ].map(({ icon: RowIcon, label, value }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <RowIcon size={15} className="dx-muted shrink-0" />
                  <span className="text-[13px] dx-muted flex-1">{label}</span>
                  <span className="text-[15px] font-semibold tabular">{loadingToday ? '–' : Math.round(value).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 pt-4 grid grid-cols-2 gap-x-5 gap-y-4 border-t" style={{ borderColor: 'var(--dx-border)' }}>
            <MacroBar label="Protein" value={proteinConsumed} goal={goals.protein} color="#c87941" loading={loadingToday} />
            <MacroBar label="Carbs" value={carbsConsumed} goal={goals.carbs} color="#eab308" loading={loadingToday} />
            <MacroBar label="Fat" value={fatConsumed} goal={goals.fat} color="#06b6d4" loading={loadingToday} />
            <MacroBar label="Fiber" value={fiberConsumed} goal={goals.fiber} color="#10b981" loading={loadingToday} />
          </div>
        </motion.section>

        {/* Astra shortcut */}
        <motion.button
          variants={item}
          onClick={() => window.dispatchEvent(new Event('open-ai-bot'))}
          className="dx-card w-full flex items-center gap-3 p-4 text-left transition-transform active:scale-[0.99]"
        >
          <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'var(--dx-accent)', color: 'var(--dx-on-accent)' }}>
            <ScanLine size={20} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold">Log a meal with Astra</span>
            <span className="block text-[12px] dx-muted truncate">Snap a photo or describe what you ate</span>
          </span>
          <ChevronRight size={18} className="dx-muted shrink-0" />
        </motion.button>

        {/* Today's Meals */}
        <motion.section variants={item}>
          <div className="flex items-baseline justify-between mb-2.5 px-0.5">
            <h2 className="dx-section-title">Today's meals</h2>
            {todayData?.meals && todayData.meals.length > 0 && (
              <span className="text-[12px] dx-muted">{todayData.meals.length} logged</span>
            )}
          </div>

          {loadingToday ? (
            <div className="dx-card dx-list overflow-hidden animate-pulse">
              {[0, 1].map(i => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-xl" style={{ background: 'var(--dx-card-2)' }} />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 rounded" style={{ background: 'var(--dx-card-2)' }} />
                    <div className="h-2.5 w-40 rounded" style={{ background: 'var(--dx-card-2)' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : todayData?.meals && todayData.meals.length > 0 ? (
            <div className="dx-card dx-list overflow-hidden">
              {todayData.meals.map((meal: any, i: number) => (
                <MealRow
                  key={meal.id || i}
                  meal={meal}
                  onClick={() => setSelectedMeal(meal)}
                  subtitle={`${meal.calories?.toFixed(0)} kcal · ${meal.protein?.toFixed(0)}g protein`}
                />
              ))}
            </div>
          ) : (
            <div className="dx-card text-center px-6 py-9">
              <span className="dx-badge-icon mx-auto !w-12 !h-12 !rounded-2xl"><Apple size={22} /></span>
              <p className="mt-3 text-[15px] font-semibold">No meals logged today</p>
              <p className="mt-1 text-[13px] dx-muted">Scan your food with Astra to track calories and macros.</p>
              <button onClick={() => window.dispatchEvent(new Event('open-ai-bot'))} className="dx-btn mt-4 h-10 text-[13px]">
                <Plus size={15} /> Log first meal
              </button>
            </div>
          )}
        </motion.section>

        {/* History (Past 7 Days) */}
        {pastByDay.length > 0 && (
          <motion.section variants={item} className="space-y-4">
            <h2 className="dx-section-title px-0.5">Past 7 days</h2>
            {pastByDay.map(group => (
              <div key={group.key}>
                <div className="flex items-baseline justify-between mb-2 px-0.5">
                  <span className="text-[12px] font-semibold dx-muted">{group.label}</span>
                  <span className="text-[12px] dx-muted tabular">{Math.round(group.total).toLocaleString()} kcal</span>
                </div>
                <div className="dx-card dx-list overflow-hidden">
                  {group.meals.map((meal: any, i: number) => (
                    <MealRow
                      key={meal.id || i}
                      meal={meal}
                      onClick={() => setSelectedMeal(meal)}
                      subtitle={`${new Date(meal.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${meal.calories?.toFixed(0)} kcal`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </motion.section>
        )}

      </motion.div>

      <AnimatePresence>
        {showProfile && (
          <NutritionProfileModal 
            onClose={() => setShowProfile(false)} 
            onSaved={loadToday}
          />
        )}
        {selectedMeal && (
          <MealDetailsModal
            meal={selectedMeal}
            onClose={() => setSelectedMeal(null)}
            onUpdate={handleMealTypeUpdate}
          />
        )}
      </AnimatePresence>
    </>
  );
}
