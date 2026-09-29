import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Apple, Check, Flame, Beef, Droplet, Wheat, Activity } from 'lucide-react';
import { getNutritionImage, updateMealType } from '@/services/nutrition-api';

interface MealDetailsModalProps {
  meal: any;
  onClose: () => void;
  onUpdate?: (mealId: number, newType: string) => void;
}

export default function MealDetailsModal({ meal, onClose, onUpdate }: MealDetailsModalProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [mealType, setMealType] = useState(meal.meal_type);
  const [hasChanged, setHasChanged] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    setMealType(meal.meal_type);
    setHasChanged(false);
  }, [meal.meal_type]);

  useEffect(() => {
    if (meal.image_id) {
      getNutritionImage(meal.image_id).then(res => {
        setImageUrl(`data:${res.mime_type};base64,${res.base64_data}`);
      }).catch(console.error);
    }
  }, [meal.image_id]);

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value;
    setMealType(newType);
    setHasChanged(newType !== meal.meal_type);
  };

  const handleSave = async () => {
    try {
      setIsUpdating(true);
      await updateMealType(meal.id, mealType);
      setHasChanged(false);
      if (onUpdate) onUpdate(meal.id, mealType);
    } catch (err) {
      console.error('Failed to update meal type', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const gradeTone = ['A+', 'A'].includes(meal.health_grade)
    ? { background: 'var(--dx-success-soft)', color: 'var(--dx-success)' }
    : ['B+', 'B'].includes(meal.health_grade)
      ? { background: 'rgba(234, 179, 8, 0.16)', color: 'var(--dx-warning)' }
      : { background: 'rgba(249, 115, 22, 0.16)', color: '#ea580c' };
  const macros = [
    { label: 'Protein', value: meal.protein, color: '#c87941', icon: Beef },
    { label: 'Carbs', value: meal.carbs, color: '#eab308', icon: Wheat },
    { label: 'Fat', value: meal.fat, color: '#06b6d4', icon: Droplet },
    { label: 'Fiber', value: meal.fiber, color: '#10b981', icon: Activity },
  ];

  // Portaled so the page's stacking context can't put the bottom nav / AI button above it.
  return createPortal(
    <div className="dx pro-scope dx-overlay z-[9999]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="dx-backdrop"
      />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        role="dialog"
        aria-modal="true"
        aria-label="Meal details"
        className="dx-sheet sm:max-w-lg"
      >
        <div className="dx-sheet-handle" aria-hidden />
        <div className="dx-sheet-header items-center">
          <span className="dx-badge-icon"><Apple size={18} /></span>
          <div className="flex-1 min-w-0">
            <h2 className="text-[18px] font-semibold tracking-tight capitalize truncate">{mealType}</h2>
            <p className="text-[12px] dx-muted">{new Date(meal.logged_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          </div>
          <button onClick={onClose} className="dx-icon-btn dx-icon-btn--sm" aria-label="Close">
            <X size={17} />
          </button>
        </div>

        <div className="dx-sheet-body space-y-5">
          {imageUrl && (
            <div className="w-full aspect-video rounded-2xl overflow-hidden relative" style={{ background: 'var(--dx-card-2)' }}>
              <img src={imageUrl} alt="Meal" className="w-full h-full object-cover" />
              {meal.health_grade && (
                <span className="absolute top-3 right-3 dx-pill h-7 px-3 text-[12px] backdrop-blur-md" style={gradeTone}>
                  Grade {meal.health_grade}
                </span>
              )}
            </div>
          )}

          {/* Meal type */}
          <div>
            <div className="dx-eyebrow mb-2">Meal type</div>
            <div className={`dx-segment ${isUpdating ? 'opacity-50 pointer-events-none' : ''}`} role="tablist">
              {['breakfast', 'lunch', 'dinner', 'snack'].map(type => (
                <button
                  key={type}
                  role="tab"
                  aria-selected={mealType === type}
                  onClick={() => handleTypeChange({ target: { value: type } } as any)}
                  className="capitalize !px-1 !text-[12px] sm:!text-[13px]"
                >
                  {type}
                </button>
              ))}
            </div>
            {hasChanged && (
              <button onClick={handleSave} disabled={isUpdating} className="dx-btn w-full h-10 mt-2.5 text-[13px]">
                <Check size={15} /> {isUpdating ? 'Saving…' : 'Save meal type'}
              </button>
            )}
          </div>

          {/* Totals */}
          <div>
            <div className="dx-eyebrow mb-2">Nutrition</div>
            <div className="dx-inset p-4">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-[13px] dx-muted"><Flame size={16} className="dx-accent" /> Calories</span>
                <span className="text-[22px] font-semibold tabular leading-none">{meal.calories?.toFixed(0)} <span className="text-[12px] font-medium dx-muted">kcal</span></span>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {macros.map(({ label, value, color, icon: MacroIcon }) => (
                  <div key={label} className="rounded-xl p-2.5 text-center" style={{ background: 'var(--dx-card)' }}>
                    <MacroIcon size={15} className="mx-auto" style={{ color }} />
                    <div className="mt-1.5 text-[15px] font-semibold tabular leading-none">{value?.toFixed(0)}<span className="text-[11px] dx-muted">g</span></div>
                    <div className="mt-1 text-[10.5px] dx-muted">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Items */}
          {meal.items && meal.items.length > 0 && (
            <div>
              <div className="dx-eyebrow mb-2">Ingredients · {meal.items.length}</div>
              <div className="dx-inset dx-list overflow-hidden">
                {meal.items.map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3.5 py-3">
                    <div className="min-w-0">
                      <h4 className="text-[14px] font-semibold capitalize truncate">{item.food_name}</h4>
                      <p className="text-[12px] dx-muted tabular">{item.weight_grams}g</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[14px] font-semibold tabular">{item.calories.toFixed(0)} <span className="text-[11px] font-medium dx-muted">kcal</span></div>
                      <div className="mt-0.5 flex gap-2 text-[11px] tabular dx-muted">
                        <span>P {item.protein.toFixed(1)}</span>
                        <span>C {item.carbs.toFixed(1)}</span>
                        <span>F {item.fat.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
