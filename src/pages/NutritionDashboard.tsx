import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Apple, Plus, ScanLine, MessageSquare, Flame, Beef, Wheat, Droplet, TrendingUp, ChefHat, CalendarDays, BarChart3, SlidersHorizontal, Loader2 } from 'lucide-react';
import CameraScanner from '@/components/nutrition/CameraScanner';
import NutritionResultCard from '@/components/nutrition/NutritionResultCard';
import NutritionChat from '@/components/nutrition/NutritionChat';
import NutritionProfileModal from '@/components/nutrition/NutritionProfileModal';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { analyzeFood, getTodayNutrition, getNutritionHistory, type FoodAnalyzeResponse, type TodayNutrition } from '@/services/nutrition-api';
import MealDetailsModal from '@/components/nutrition/MealDetailsModal';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

function MacroRing({ value, max, label, color, size = 64, strokeWidth = 5, loading = false }: {
  value: number; max: number; label: string; color: string; size?: number; strokeWidth?: number; loading?: boolean;
}) {
  const pct = Math.min((value / Math.max(max, 1)) * 100, 100);
  const radius = (size - strokeWidth) / 2;
  const circum = 2 * Math.PI * radius;
  
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="-rotate-90 w-full h-full" viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="currentColor"
            className="text-white/[0.06]" strokeWidth={strokeWidth} />
          <motion.circle
            cx={size/2} cy={size/2} r={radius} fill="none" stroke={color}
            strokeWidth={strokeWidth} strokeLinecap="round"
            strokeDasharray={circum}
            initial={{ strokeDashoffset: circum }}
            animate={{ strokeDashoffset: loading ? circum : circum - (pct / 100) * circum }}
            transition={{ duration: 1.2, delay: 0.3, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {loading ? (
            <Loader2 size={14} className="animate-spin text-bone-dim" />
          ) : (
            <span className="text-xs font-mono text-bone font-bold">{value.toFixed(0)}</span>
          )}
        </div>
      </div>
      <span className="text-[10px] text-bone-dim uppercase tracking-wider font-medium">{label}</span>
    </div>
  );
}

export default function NutritionDashboard() {
  const [showScanner, setShowScanner] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanResult, setScanResult] = useState<FoodAnalyzeResponse | null>(null);
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
      // API might not be running yet — show placeholder
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
      setScanResult(result);
      setShowScanner(false);
      // Refresh today's data
      loadToday();
    } catch (err: any) {
      setError(err.message || 'Failed to analyze food. Check your API keys.');
      setShowScanner(false);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const caloriesConsumed = todayData?.total_calories || 0;
  const proteinConsumed = todayData?.total_protein || 0;
  const carbsConsumed = todayData?.total_carbs || 0;
  const fatConsumed = todayData?.total_fat || 0;
  const fiberConsumed = todayData?.total_fiber || 0;
  const caloriesLeft = Math.max(0, goals.calories - caloriesConsumed);

  return (
    <>
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-5 max-w-4xl mx-auto pb-28">
        {/* Header */}
        <motion.div variants={item} className="flex items-center justify-between pb-4 border-b border-line">
          <div>
            <div className="font-mono text-sienna text-xs tracking-widest mb-1">YOUR DAILY FUEL</div>
            <h1 className="font-display text-3xl mb-1">Nutrition</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowProfile(true)}
              className="w-10 h-10 rounded-xl bg-white/[0.04] border border-line text-bone-dim flex items-center justify-center hover:bg-white/[0.08] hover:text-sienna transition-colors"
              title="Nutrition Profile & Goals"
            >
              <SlidersHorizontal size={18} />
            </button>
          </div>
        </motion.div>

        {/* Error */}
        {error && (
          <motion.div variants={item} className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-300">
            {error}
          </motion.div>
        )}

        {/* Scan Result */}
        {scanResult && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-display uppercase tracking-wider text-bone-dim">Scan Result</h2>
              <button
                onClick={() => setScanResult(null)}
                className="text-xs text-bone-dim hover:text-bone transition-colors"
              >
                Dismiss
              </button>
            </div>
            <NutritionResultCard result={scanResult} onClose={() => setScanResult(null)} />
          </div>
        )}

        {/* Calorie Ring Hero */}
        <motion.div variants={item} className="card p-6 bg-gradient-to-br from-ink-2 to-ink relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-sienna/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
          <h2 className="text-xs font-display uppercase tracking-wider text-bone-dim mb-4">Daily Progress</h2>
          <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8">
            {/* Calorie Ring */}
            <div className="relative w-32 h-32 shrink-0">
              <svg className="w-32 h-32 -rotate-90" viewBox="0 0 128 128">
                <circle cx="64" cy="64" r="56" fill="none" stroke="currentColor"
                  className="text-white/[0.06]" strokeWidth="8" />
                <motion.circle
                  cx="64" cy="64" r="56" fill="none" stroke="#c87941"
                  strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 56}
                  initial={{ strokeDashoffset: 2 * Math.PI * 56 }}
                  animate={{
                    strokeDashoffset: 2 * Math.PI * 56 - (Math.min(caloriesConsumed / goals.calories, 1) * 2 * Math.PI * 56)
                  }}
                  transition={{ duration: 1.2, delay: 0.3, ease: 'easeOut' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {loadingToday ? (
                  <div className="flex flex-col items-center justify-center gap-1">
                    <Loader2 size={24} className="animate-spin text-sienna" />
                    <span className="text-[10px] text-bone-dim uppercase tracking-wider">Syncing...</span>
                  </div>
                ) : (
                  <>
                    <motion.span
                      className="text-2xl font-display font-bold text-bone"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                    >
                      {caloriesLeft.toFixed(0)}
                    </motion.span>
                    <span className="text-[10px] text-bone-dim uppercase tracking-wider">kcal left</span>
                  </>
                )}
              </div>
            </div>

            {/* Macro Rings */}
            <div className="flex-1 flex flex-wrap md:flex-nowrap items-center justify-center md:justify-between w-full md:pl-6 gap-6 md:gap-2 md:border-l border-line/30 md:ml-2 pt-6 md:pt-0 border-t md:border-t-0">
              <MacroRing value={proteinConsumed} max={goals.protein} label="Protein" color="#c87941" loading={loadingToday} />
              <MacroRing value={carbsConsumed} max={goals.carbs} label="Carbs" color="#eab308" loading={loadingToday} />
              <MacroRing value={fatConsumed} max={goals.fat} label="Fat" color="#06b6d4" loading={loadingToday} />
              <MacroRing value={fiberConsumed} max={goals.fiber} label="Fiber" color="#10b981" loading={loadingToday} />
            </div>
          </div>
        </motion.div>

        {/* Today's Meals */}
        <motion.div variants={item} className="space-y-3">
          <h2 className="text-xs font-display uppercase tracking-wider text-bone-dim mb-2">Today's Meals</h2>

          {todayData?.meals && todayData.meals.length > 0 ? (
            todayData.meals.map((meal: any, i: number) => (
              <div 
                key={i} 
                onClick={() => setSelectedMeal(meal)}
                className="card p-4 flex items-center justify-between cursor-pointer hover:bg-ink-2 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-ink border border-line flex items-center justify-center">
                    <Apple size={16} className="text-sienna" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-bone text-sm capitalize">{meal.meal_type}</h3>
                    <p className="text-xs text-bone-dim">{meal.calories?.toFixed(0)} kcal • {meal.protein?.toFixed(0)}g protein</p>
                  </div>
                </div>
                {meal.health_grade && (
                  <span className={`text-xs font-display font-bold px-2 py-1 rounded-lg ${
                    ['A+', 'A'].includes(meal.health_grade) ? 'bg-emerald-500/20 text-emerald-400' :
                    ['B+', 'B'].includes(meal.health_grade) ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-orange-500/20 text-orange-400'
                  }`}>
                    {meal.health_grade}
                  </span>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-10 bg-white/[0.02] border border-line border-dashed rounded-2xl">
              <Apple size={32} className="mx-auto text-bone-dim/50 mb-3" />
              <p className="text-sm text-bone-dim">No meals logged today.</p>
              <p className="text-xs text-bone-dim mt-1">Open the AI Chatbot to scan your food!</p>
            </div>
          )}
        </motion.div>

        {/* History (Past 7 Days) */}
        {historyData && historyData.length > 0 && (
          <motion.div variants={item} className="space-y-3 mt-8">
            <h2 className="text-xs font-display uppercase tracking-wider text-bone-dim mb-2">Past 7 Days</h2>
            {historyData
              .filter(m => {
                // Filter out today's meals since they are already shown above
                const today = new Date().toDateString();
                return new Date(m.logged_at).toDateString() !== today;
              })
              .map((meal: any, i: number) => (
                <div 
                  key={i} 
                  onClick={() => setSelectedMeal(meal)}
                  className="card p-4 flex items-center justify-between cursor-pointer hover:bg-ink-2 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-ink border border-line flex items-center justify-center">
                      <CalendarDays size={16} className="text-bone-dim" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-bone text-sm capitalize">{meal.meal_type}</h3>
                      <p className="text-xs text-bone-dim">
                        {new Date(meal.logged_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} • {meal.calories?.toFixed(0)} kcal
                      </p>
                    </div>
                  </div>
                  {meal.health_grade && (
                    <span className={`text-xs font-display font-bold px-2 py-1 rounded-lg ${
                      ['A+', 'A'].includes(meal.health_grade) ? 'bg-emerald-500/20 text-emerald-400' :
                      ['B+', 'B'].includes(meal.health_grade) ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-orange-500/20 text-orange-400'
                    }`}>
                      {meal.health_grade}
                    </span>
                  )}
                </div>
              ))}
          </motion.div>
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
          />
        )}
      </AnimatePresence>
    </>
  );
}
