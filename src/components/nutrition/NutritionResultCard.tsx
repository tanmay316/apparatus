import React from 'react';
import { motion } from 'framer-motion';
import { X, TrendingUp, Droplets, AlertCircle, ArrowRight, Flame, Beef, Wheat, Droplet } from 'lucide-react';
import type { FoodAnalyzeResponse } from '@/services/nutrition-api';

interface NutritionResultCardProps {
  result: FoodAnalyzeResponse;
  onClose: () => void;
  onLogMeal?: () => void;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};
const item = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

function GradeBadge({ grade, score }: { grade: string; score: number }) {
  const colors: Record<string, string> = {
    'A+': 'from-emerald-500 to-green-400',
    'A': 'from-emerald-500 to-green-400',
    'B+': 'from-lime-500 to-emerald-400',
    'B': 'from-yellow-500 to-lime-400',
    'C': 'from-amber-500 to-yellow-400',
    'D': 'from-orange-500 to-amber-400',
    'F': 'from-red-500 to-orange-400',
  };
  return (
    <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${colors[grade] || colors['C']} flex flex-col items-center justify-center shadow-lg`}>
      <span className="text-2xl font-display font-bold text-white">{grade}</span>
      <span className="text-[10px] text-white/80 font-medium">{score}/100</span>
    </div>
  );
}

function MacroRing({ value, max, label, color, icon: Icon }: {
  value: number; max: number; label: string; color: string; icon: any;
}) {
  const pct = Math.min((value / Math.max(max, 1)) * 100, 100);
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor"
            className="text-white/[0.06]" strokeWidth="4" />
          <motion.circle
            cx="32" cy="32" r="28" fill="none" stroke={color}
            strokeWidth="4" strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-semibold text-bone">{value.toFixed(0)}g</div>
        <div className="text-[10px] text-bone-dim uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}

export default function NutritionResultCard({ result, onClose, onLogMeal }: NutritionResultCardProps) {
  if (!result.nutrition) return null;

  const nutrition = result.nutrition.nutrition;
  const healthScore = result.nutrition.health_score;
  const recommendations = result.nutrition.recommendations || [];
  const swaps = result.nutrition.healthy_swaps || [];
  const hydration = result.nutrition.hydration_suggestion;
  const vision = result.vision;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-4 pb-24"
    >
      {/* Health Score Hero */}
      <motion.div variants={item} className="card p-5 bg-gradient-to-br from-ink-2 to-ink relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-sienna/5 rounded-full blur-3xl -translate-y-1/4 translate-x-1/4" />
        <div className="flex items-center gap-5">
          <GradeBadge grade={healthScore.grade} score={healthScore.score} />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-display font-semibold text-bone mb-1">Health Score</h2>
            <p className="text-xs text-bone-dim line-clamp-2">
              {vision?.raw_description || 'Your meal has been analyzed'}
            </p>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                <Flame size={14} className="text-sienna" />
                <span className="text-sm font-semibold text-bone">{nutrition.total_calories.toFixed(0)}</span>
                <span className="text-[10px] text-bone-dim">kcal</span>
              </div>
              {vision && (
                <div className="text-[10px] text-bone-dim bg-white/[0.04] px-2 py-0.5 rounded-full">
                  via {vision.provider_used} • {vision.latency_ms.toFixed(0)}ms
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Macro Rings */}
      <motion.div variants={item} className="card p-5">
        <h3 className="text-xs font-display uppercase tracking-wider text-bone-dim mb-4">Macronutrients</h3>
        <div className="grid grid-cols-4 gap-3">
          <MacroRing value={nutrition.total_protein} max={50} label="Protein" color="#c87941" icon={Beef} />
          <MacroRing value={nutrition.total_carbs} max={80} label="Carbs" color="#eab308" icon={Wheat} />
          <MacroRing value={nutrition.total_fat} max={30} label="Fat" color="#06b6d4" icon={Droplet} />
          <MacroRing value={nutrition.total_fiber} max={10} label="Fiber" color="#10b981" icon={TrendingUp} />
        </div>
      </motion.div>

      {/* Detected Foods */}
      <motion.div variants={item} className="card p-5">
        <h3 className="text-xs font-display uppercase tracking-wider text-bone-dim mb-3">Detected Foods</h3>
        <div className="space-y-2">
          {nutrition.items.map((food: any, i: number) => (
            <div key={i} className="flex items-center justify-between py-2 px-3 rounded-xl bg-white/[0.02] border border-line/30">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-bone capitalize">{food.name}</div>
                <div className="text-[10px] text-bone-dim">{food.weight_grams}g</div>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-mono">
                <span className="text-sienna">{food.calories.toFixed(0)} kcal</span>
                <span className="text-bone-dim">{food.protein.toFixed(1)}P</span>
                <span className="text-bone-dim">{food.carbs.toFixed(1)}C</span>
                <span className="text-bone-dim">{food.fat.toFixed(1)}F</span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <motion.div variants={item} className="card p-5">
          <h3 className="text-xs font-display uppercase tracking-wider text-bone-dim mb-3">AI Suggestions</h3>
          <div className="space-y-2">
            {recommendations.map((tip, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm text-bone">
                <AlertCircle size={14} className="text-amber mt-0.5 shrink-0" />
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Healthy Swaps */}
      {swaps.length > 0 && (
        <motion.div variants={item} className="card p-5">
          <h3 className="text-xs font-display uppercase tracking-wider text-bone-dim mb-3">Healthy Swaps</h3>
          <div className="space-y-2">
            {swaps.map((swap: any, i: number) => (
              <div key={i} className="flex items-center gap-2 py-2 px-3 rounded-xl bg-white/[0.02] border border-line/30 text-sm">
                <span className="text-bone-dim">{swap.original}</span>
                <ArrowRight size={14} className="text-sienna shrink-0" />
                <span className="text-bone font-medium">{swap.swap}</span>
                <span className="text-[10px] text-bone-dim ml-auto">{swap.benefit}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Hydration */}
      {hydration && (
        <motion.div variants={item} className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-4 flex items-center gap-3">
          <Droplets size={18} className="text-cyan-400 shrink-0" />
          <p className="text-sm text-bone">{hydration}</p>
        </motion.div>
      )}
    </motion.div>
  );
}
