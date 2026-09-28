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
    <div className={`w-16 h-16 shrink-0 rounded-2xl bg-gradient-to-br ${colors[grade] || colors['C']} flex flex-col items-center justify-center`}>
      <span className="text-[22px] font-bold text-white leading-none">{grade}</span>
      <span className="mt-1 text-[10px] text-white/85 font-semibold tabular">{score}/100</span>
    </div>
  );
}

function MacroRing({ value, max, label, color, icon: Icon }: {
  value: number; max: number; label: string; color: string; icon: any;
}) {
  const pct = Math.min((value / Math.max(max, 1)) * 100, 100);
  const circumference = 2 * Math.PI * 26;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0">
      <div className="relative w-14 h-14">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 60 60">
          <circle cx="30" cy="30" r="26" fill="none" strokeWidth="5" style={{ stroke: 'var(--dx-card-2)' }} />
          <motion.circle
            cx="30" cy="30" r="26" fill="none" stroke={color}
            strokeWidth="5" strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon size={15} style={{ color }} />
        </div>
      </div>
      <div className="text-center">
        <div className="text-[14px] font-semibold tabular leading-none">{value.toFixed(0)}g</div>
        <div className="mt-1 text-[10.5px] dx-muted">{label}</div>
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

  if (!nutrition || !healthScore) return null;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="dx space-y-3"
    >
      {/* Health Score Hero */}
      <motion.div variants={item} className="dx-card p-4">
        <div className="flex items-center gap-4">
          <GradeBadge grade={healthScore.grade} score={healthScore.score} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[16px] font-semibold">Health score</h2>
              <span className="inline-flex items-baseline gap-1 shrink-0">
                <Flame size={13} className="dx-accent self-center" />
                <span className="text-[16px] font-semibold tabular">{(nutrition.total_calories ?? 0).toFixed(0)}</span>
                <span className="text-[11px] dx-muted">kcal</span>
              </span>
            </div>
            <p className="mt-1 text-[12.5px] dx-muted line-clamp-2">
              {vision?.raw_description || 'Your meal has been analyzed'}
            </p>
            {vision?.provider_used && vision?.latency_ms != null && (
              <span className="dx-tag mt-2">via {vision.provider_used} · {vision.latency_ms.toFixed(0)}ms</span>
            )}
          </div>
        </div>
      </motion.div>

      {/* Macro Rings */}
      <motion.div variants={item} className="dx-card p-4">
        <h3 className="dx-eyebrow mb-3">Macronutrients</h3>
        <div className="grid grid-cols-4 gap-2">
          <MacroRing value={nutrition.total_protein ?? 0} max={50} label="Protein" color="#c87941" icon={Beef} />
          <MacroRing value={nutrition.total_carbs ?? 0} max={80} label="Carbs" color="#eab308" icon={Wheat} />
          <MacroRing value={nutrition.total_fat ?? 0} max={30} label="Fat" color="#06b6d4" icon={Droplet} />
          <MacroRing value={nutrition.total_fiber ?? 0} max={10} label="Fiber" color="#10b981" icon={TrendingUp} />
        </div>
      </motion.div>

      {/* Detected Foods */}
      <motion.div variants={item} className="dx-card overflow-hidden">
        <h3 className="dx-eyebrow px-4 pt-4 pb-2">Detected foods</h3>
        <div className="dx-list">
          {(nutrition.items || []).map((food: any, i: number) => (
            <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <div className="text-[14px] font-semibold capitalize truncate">{food.name}</div>
                <div className="mt-0.5 flex gap-2 text-[11px] tabular dx-muted">
                  <span>P {(food.protein ?? 0).toFixed(1)}</span>
                  <span>C {(food.carbs ?? 0).toFixed(1)}</span>
                  <span>F {(food.fat ?? 0).toFixed(1)}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[14px] font-semibold tabular">{(food.calories ?? 0).toFixed(0)} <span className="text-[11px] font-medium dx-muted">kcal</span></div>
                <div className="text-[11px] dx-muted tabular">{food.weight_grams ?? 0}g</div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <motion.div variants={item} className="dx-card p-4">
          <h3 className="dx-eyebrow mb-2.5">Suggestions</h3>
          <div className="space-y-2.5">
            {recommendations.map((tip, i) => (
              <div key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed">
                <AlertCircle size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--dx-warning)' }} />
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Healthy Swaps */}
      {swaps.length > 0 && (
        <motion.div variants={item} className="dx-card overflow-hidden">
          <h3 className="dx-eyebrow px-4 pt-4 pb-2">Healthy swaps</h3>
          <div className="dx-list">
            {swaps.map((swap: any, i: number) => (
              <div key={i} className="px-4 py-2.5 text-[13px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="dx-muted">{swap.original}</span>
                  <ArrowRight size={13} className="dx-accent shrink-0" />
                  <span className="font-semibold">{swap.swap}</span>
                </div>
                {swap.benefit && <div className="mt-0.5 text-[11.5px] dx-muted">{swap.benefit}</div>}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Hydration */}
      {hydration && (
        <motion.div variants={item} className="rounded-2xl p-3.5 flex items-center gap-3" style={{ background: 'rgba(6, 182, 212, 0.1)' }}>
          <Droplets size={18} className="shrink-0" style={{ color: '#0891b2' }} />
          <p className="text-[13px]">{hydration}</p>
        </motion.div>
      )}
    </motion.div>
  );
}
