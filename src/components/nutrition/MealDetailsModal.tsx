import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Apple, Beef, Droplet, Flame, Wheat, Activity, ChevronDown } from 'lucide-react';
import { getNutritionImage, updateMealType } from '@/services/nutrition-api';

interface MealDetailsModalProps {
  meal: any;
  onClose: () => void;
  onUpdate?: (mealId: number, newType: string) => void;
}

export default function MealDetailsModal({ meal, onClose, onUpdate }: MealDetailsModalProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [mealType, setMealType] = useState(meal.meal_type);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    setMealType(meal.meal_type);
  }, [meal.meal_type]);

  useEffect(() => {
    if (meal.image_id) {
      getNutritionImage(meal.image_id).then(res => {
        setImageUrl(`data:${res.mime_type};base64,${res.base64_data}`);
      }).catch(console.error);
    }
  }, [meal.image_id]);

  const handleTypeChange = async (newType: string) => {
    const previousType = mealType;
    try {
      setIsUpdating(true);
      setMealType(newType);
      if (onUpdate) onUpdate(meal.id, newType);
      await updateMealType(meal.id, newType);
    } catch (err) {
      console.error('Failed to update meal type', err);
      setMealType(previousType); // revert on error
      if (onUpdate) onUpdate(meal.id, previousType);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-lg bg-ink-2 border border-line rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
      >
        <div className="flex items-center justify-between p-5 border-b border-line/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-ink border border-line flex items-center justify-center">
              <Apple className="text-sienna w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 relative group cursor-pointer">
                <select 
                  value={mealType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  disabled={isUpdating}
                  className={`bg-transparent text-lg font-display font-bold text-bone capitalize focus:outline-none appearance-none cursor-pointer pr-5 ${isUpdating ? 'opacity-50' : ''}`}
                >
                  <option value="breakfast" className="bg-ink text-bone">Breakfast Details</option>
                  <option value="lunch" className="bg-ink text-bone">Lunch Details</option>
                  <option value="dinner" className="bg-ink text-bone">Dinner Details</option>
                  <option value="snack" className="bg-ink text-bone">Snack Details</option>
                </select>
                <ChevronDown size={14} className="text-bone-dim absolute right-0 pointer-events-none group-hover:text-bone transition-colors" />
              </div>
              <p className="text-xs text-bone-dim">{new Date(meal.logged_at).toLocaleString()}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-bone-dim hover:text-bone hover:bg-ink rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-6">
          {imageUrl && (
            <div className="w-full aspect-video rounded-2xl overflow-hidden border border-line/50 relative">
              <img src={imageUrl} alt="Meal" className="w-full h-full object-cover" />
              {meal.health_grade && (
                <div className={`absolute top-3 right-3 px-3 py-1 rounded-xl font-display font-bold text-sm backdrop-blur-md border ${
                  ['A+', 'A'].includes(meal.health_grade) ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                  ['B+', 'B'].includes(meal.health_grade) ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                  'bg-orange-500/20 text-orange-400 border-orange-500/30'
                }`}>
                  Grade {meal.health_grade}
                </div>
              )}
            </div>
          )}

          {/* Totals */}
          <div>
            <h3 className="text-xs font-display uppercase tracking-wider text-bone-dim mb-3">Total Macros</h3>
            <div className="grid grid-cols-5 gap-2">
              <div className="bg-ink rounded-xl p-3 border border-line/30 flex flex-col items-center justify-center text-center">
                <Flame className="text-sienna mb-1 w-4 h-4" />
                <span className="text-xs text-bone-dim font-medium uppercase tracking-wider">Cals</span>
                <span className="text-sm font-mono font-bold text-bone">{meal.calories?.toFixed(0)}</span>
              </div>
              <div className="bg-ink rounded-xl p-3 border border-line/30 flex flex-col items-center justify-center text-center">
                <Beef className="text-sienna mb-1 w-4 h-4" />
                <span className="text-xs text-bone-dim font-medium uppercase tracking-wider">Pro</span>
                <span className="text-sm font-mono font-bold text-bone">{meal.protein?.toFixed(0)}</span>
              </div>
              <div className="bg-ink rounded-xl p-3 border border-line/30 flex flex-col items-center justify-center text-center">
                <Wheat className="text-yellow-500 mb-1 w-4 h-4" />
                <span className="text-xs text-bone-dim font-medium uppercase tracking-wider">Carb</span>
                <span className="text-sm font-mono font-bold text-bone">{meal.carbs?.toFixed(0)}</span>
              </div>
              <div className="bg-ink rounded-xl p-3 border border-line/30 flex flex-col items-center justify-center text-center">
                <Droplet className="text-cyan-500 mb-1 w-4 h-4" />
                <span className="text-xs text-bone-dim font-medium uppercase tracking-wider">Fat</span>
                <span className="text-sm font-mono font-bold text-bone">{meal.fat?.toFixed(0)}</span>
              </div>
              <div className="bg-ink rounded-xl p-3 border border-line/30 flex flex-col items-center justify-center text-center">
                <Activity className="text-emerald-500 mb-1 w-4 h-4" />
                <span className="text-xs text-bone-dim font-medium uppercase tracking-wider">Fib</span>
                <span className="text-sm font-mono font-bold text-bone">{meal.fiber?.toFixed(0)}</span>
              </div>
            </div>
          </div>

          {/* Items */}
          {meal.items && meal.items.length > 0 && (
            <div>
              <h3 className="text-xs font-display uppercase tracking-wider text-bone-dim mb-3">Ingredients</h3>
              <div className="space-y-2">
                {meal.items.map((item: any, i: number) => (
                  <div key={i} className="bg-ink border border-line/30 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-bone capitalize">{item.food_name}</h4>
                      <p className="text-xs text-bone-dim">{item.weight_grams}g</p>
                    </div>
                    <div className="text-right text-xs font-mono text-bone-dim space-y-1">
                      <div><span className="text-bone font-medium">{item.calories.toFixed(0)}</span> kcal</div>
                      <div className="flex gap-2">
                        <span className="text-sienna">{item.protein.toFixed(1)}g P</span>
                        <span className="text-yellow-500">{item.carbs.toFixed(1)}g C</span>
                        <span className="text-cyan-500">{item.fat.toFixed(1)}g F</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
