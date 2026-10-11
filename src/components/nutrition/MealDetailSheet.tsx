import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Bookmark, BookmarkCheck, Flame, Loader2, Minus, Plus, Trash2, Wand2, X, Apple } from 'lucide-react';
import { format } from 'date-fns';
import { useUIStore } from '@/stores/ui-store';
import { deleteMeal, updateMealItems, updateMealType } from '@/services/nutrition-api';
import { foodHealthScore } from '@/lib/nutrition-plan';
import { mealDate, mealName, useMealImage, type LoggedMeal, type MealItem } from './use-nutrition-data';
import { HealthScoreBar, MacroTiles, MealTypeChips } from './FoodSheets';
import { useLockBody } from './cal-ui';

interface Props {
  meal: LoggedMeal;
  isSaved: boolean;
  onToggleSave: (meal: LoggedMeal) => void;
  onChanged: () => void;
  onClose: () => void;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function scaleItem(it: MealItem, k: number): MealItem {
  return {
    food_name: it.food_name,
    weight_grams: Math.round((it.weight_grams || 0) * k),
    calories: Math.round((it.calories || 0) * k),
    protein: r1((it.protein || 0) * k),
    carbs: r1((it.carbs || 0) * k),
    fat: r1((it.fat || 0) * k),
    fiber: r1((it.fiber || 0) * k),
  };
}

export default function MealDetailSheet({ meal, isSaved, onToggleSave, onChanged, onClose }: Props) {
  useLockBody();
  const { showToast, confirm } = useUIStore();
  const image = useMealImage(meal.image_id);
  const original = useMemo(() => (meal.items?.length ? meal.items : [{
    food_name: mealName(meal), weight_grams: 0, calories: meal.calories || 0, protein: meal.protein || 0, carbs: meal.carbs || 0, fat: meal.fat || 0, fiber: meal.fiber || 0,
  }]), [meal]);
  // Per-item portion factor relative to what was logged (1 = unchanged, 0 = removed).
  const [factors, setFactors] = useState<number[]>(() => original.map(() => 1));
  const [servings, setServings] = useState(1);
  const [mealType, setMealType] = useState(meal.meal_type === 'snacks' ? 'snack' : meal.meal_type);
  const [fixing, setFixing] = useState(false);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  const items = original.map((it, i) => scaleItem(it, factors[i] * servings)).filter((_, i) => factors[i] > 0);
  const totals = items.reduce((t, it) => ({
    calories: t.calories + it.calories, protein: t.protein + it.protein, carbs: t.carbs + it.carbs, fat: t.fat + it.fat, fiber: t.fiber + it.fiber,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  const score = meal.health_score != null && servings === 1 && factors.every(f => f === 1)
    ? Math.max(1, Math.min(10, Math.round(meal.health_score / 10)))
    : foodHealthScore(totals);
  const itemsChanged = servings !== 1 || factors.some(f => f !== 1);
  const typeChanged = mealType !== meal.meal_type;
  const dirty = itemsChanged || typeChanged;

  const setGrams = (i: number, grams: number) => {
    const base = original[i].weight_grams || 0;
    if (base <= 0) return;
    setFactors(f => f.map((v, j) => (j === i ? Math.max(0, grams / (base * servings)) : v)));
  };

  const save = async () => {
    if (!dirty) return onClose();
    if (items.length === 0) return remove();
    setBusy('save');
    try {
      if (itemsChanged) await updateMealItems(meal.id, items, mealType);
      else await updateMealType(meal.id, mealType);
      onChanged();
      onClose();
    } catch (err: any) {
      showToast(err?.status === 404 || err?.status === 405 ? 'Editing meals needs the latest server update.' : err?.message || 'Could not save changes', 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const ok = await confirm({ title: 'Delete this meal?', message: 'It will be removed from your log.', confirmText: 'Delete', type: 'danger', icon: 'trash' });
    if (!ok) return;
    setBusy('delete');
    try {
      await deleteMeal(meal.id);
      onChanged();
      onClose();
    } catch (err: any) {
      showToast(err?.status === 404 || err?.status === 405 ? 'Deleting meals needs the latest server update.' : err?.message || 'Could not delete meal', 'error');
    } finally {
      setBusy(null);
    }
  };

  const when = mealDate(meal);

  return createPortal(
    <motion.div
      className="cal cal-screen"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      transition={{ duration: 0.22 }}
      style={{ position: 'fixed', inset: 0, zIndex: 10015, display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ position: 'relative', height: image.data ? '42vh' : 180, minHeight: image.data ? 260 : 180, background: 'var(--cal-card-2)' }}>
          {image.data ? (
            <img src={image.data} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, paddingTop: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="cal-muted">
              {meal.image_id && image.isLoading ? <Loader2 size={22} className="animate-spin" /> : <Apple size={34} />}
            </div>
          )}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 110, background: image.data ? 'linear-gradient(180deg, rgba(0,0,0,0.5), transparent)' : undefined }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', paddingTop: 'max(14px, var(--sat))', color: image.data ? '#fff' : 'var(--cal-text)' }}>
            <button type="button" onClick={onClose} aria-label="Back" style={{ width: 40, height: 40, borderRadius: 40, background: image.data ? 'rgba(0,0,0,0.35)' : 'var(--cal-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ArrowLeft size={19} /></button>
            <div style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: 700 }}>Nutrition</div>
            <button type="button" onClick={remove} disabled={!!busy} aria-label="Delete meal" style={{ width: 40, height: 40, borderRadius: 40, background: image.data ? 'rgba(0,0,0,0.35)' : 'var(--cal-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {busy === 'delete' ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}
            </button>
          </div>
        </div>

        <div style={{ position: 'relative', marginTop: -24, borderRadius: '26px 26px 0 0', background: 'var(--cal-bg)', padding: '20px 18px 24px', maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button type="button" onClick={() => onToggleSave(meal)} aria-label={isSaved ? 'Saved' : 'Save meal'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
              {isSaved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
            </button>
            <span className="cal-card-2" style={{ padding: '5px 10px', borderRadius: 999, fontSize: 12.5, fontWeight: 700 }}>{format(when, 'h:mm a')}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 10 }}>
            <h2 style={{ flex: 1, fontSize: 23, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.2 }}>{mealName({ ...meal, items: items.length ? items : meal.items })}</h2>
            <div className="cal-card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 999, flexShrink: 0 }}>
              <button type="button" onClick={() => setServings(s => Math.max(0.5, s - 0.5))} aria-label="Fewer servings" style={{ width: 26, height: 26, borderRadius: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cal-card-2)' }}><Minus size={13} /></button>
              <span className="cal-tabular" style={{ minWidth: 22, textAlign: 'center', fontSize: 15, fontWeight: 800 }}>{servings}</span>
              <button type="button" onClick={() => setServings(s => Math.min(10, s + 0.5))} aria-label="More servings" style={{ width: 26, height: 26, borderRadius: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cal-card-2)' }}><Plus size={13} /></button>
            </div>
          </div>

          <div className="cal-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', marginTop: 16 }}>
            <span className="cal-option-icon" style={{ width: 44, height: 44, background: 'var(--cal-card-2)' }}><Flame size={20} /></span>
            <div>
              <div className="cal-muted" style={{ fontSize: 13, fontWeight: 600 }}>Calories</div>
              <div className="cal-tabular" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{Math.round(totals.calories)}</div>
            </div>
          </div>
          <div style={{ marginTop: 8 }}><MacroTiles m={totals} /></div>
          <div style={{ marginTop: 8 }}><HealthScoreBar score={score} /></div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 2px 10px' }}>
            <span style={{ fontSize: 17, fontWeight: 800 }}>Ingredients</span>
            {fixing && <button type="button" onClick={() => setFixing(false)} className="cal-muted" style={{ fontSize: 13, fontWeight: 700 }}>Done editing</button>}
          </div>
          {original.map((it, i) => {
            if (factors[i] <= 0) return null;
            const shown = scaleItem(it, factors[i] * servings);
            return (
              <div key={i} className="cal-card-2" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.food_name}</div>
                  <div className="cal-muted cal-tabular" style={{ fontSize: 12.5, fontWeight: 600 }}>{shown.calories} cal · P {Math.round(shown.protein)} · C {Math.round(shown.carbs)} · F {Math.round(shown.fat)}</div>
                </div>
                {fixing && it.weight_grams > 0 ? (
                  <>
                    <span style={{ position: 'relative' }}>
                      <input
                        inputMode="numeric"
                        aria-label={`${it.food_name} grams`}
                        className="cal-tabular"
                        value={shown.weight_grams}
                        onChange={e => setGrams(i, Number(e.target.value.replace(/\D/g, '').slice(0, 4)) || 0)}
                        style={{ width: 74, height: 38, borderRadius: 12, padding: '0 22px 0 10px', background: 'var(--cal-card)', color: 'var(--cal-text)', fontWeight: 700, fontSize: 15, outline: 'none' }}
                      />
                      <span className="cal-muted" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12 }}>g</span>
                    </span>
                    <button type="button" onClick={() => setFactors(f => f.map((v, j) => (j === i ? 0 : v)))} aria-label={`Remove ${it.food_name}`} style={{ width: 34, height: 34, borderRadius: 34, background: 'var(--cal-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={15} /></button>
                  </>
                ) : (
                  shown.weight_grams > 0 && <span className="cal-muted cal-tabular" style={{ fontSize: 13, fontWeight: 700 }}>{shown.weight_grams} g</span>
                )}
              </div>
            );
          })}

          <div className="cal-muted" style={{ fontSize: 13, fontWeight: 700, margin: '18px 2px 8px' }}>Meal</div>
          <MealTypeChips value={mealType} onChange={setMealType} />
        </div>
      </div>

      <div style={{ flexShrink: 0, display: 'flex', gap: 10, padding: '12px 18px', paddingBottom: 'max(16px, var(--sab))', borderTop: '1px solid var(--cal-border)', maxWidth: 560, width: '100%', margin: '0 auto' }}>
        <button type="button" className="cal-btn-ghost" style={{ flex: 1 }} onClick={() => setFixing(f => !f)} disabled={!!busy}>
          <Wand2 size={17} /> {fixing ? 'Editing…' : 'Fix results'}
        </button>
        <button type="button" className="cal-btn" style={{ flex: 1, height: 52 }} onClick={save} disabled={!!busy}>
          {busy === 'save' ? <Loader2 size={18} className="animate-spin" /> : dirty ? 'Save' : 'Done'}
        </button>
      </div>
    </motion.div>,
    document.body,
  );
}
