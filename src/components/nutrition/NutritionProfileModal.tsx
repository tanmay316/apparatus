import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Calculator, Loader2, Check } from 'lucide-react';
import { getNutritionProfile, updateNutritionProfile } from '@/services/nutrition-api';

interface NutritionProfileModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export default function NutritionProfileModal({ onClose, onSaved }: NutritionProfileModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    weight_kg: '',
    height_cm: '',
    age: '',
    gender: 'male',
    activity_level: 'moderate',
    fitness_goal: 'build_muscle'
  });

  useEffect(() => {
    async function load() {
      try {
        const data = await getNutritionProfile();
        setFormData({
          weight_kg: data.weight_kg?.toString() || '',
          height_cm: data.height_cm?.toString() || '',
          age: data.age?.toString() || '',
          gender: data.gender || 'male',
          activity_level: data.activity_level || 'moderate',
          fitness_goal: data.fitness_goal || 'build_muscle',
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateNutritionProfile({
        weight_kg: parseFloat(formData.weight_kg) || null,
        height_cm: parseFloat(formData.height_cm) || null,
        age: parseInt(formData.age, 10) || null,
        gender: formData.gender,
        activity_level: formData.activity_level,
        fitness_goal: formData.fitness_goal,
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === 'undefined') return null;

  const activityOptions = [
    { value: 'sedentary', label: 'Sedentary', hint: 'Little or no exercise' },
    { value: 'light', label: 'Light', hint: '1–3 days a week' },
    { value: 'moderate', label: 'Moderate', hint: '3–5 days a week' },
    { value: 'active', label: 'Active', hint: '6–7 days a week' },
    { value: 'very_active', label: 'Very active', hint: 'Physical job or hard training' },
  ];
  const goalOptions = [
    { value: 'lose_fat', label: 'Lose fat', hint: 'Cut' },
    { value: 'maintain', label: 'Maintain', hint: 'Hold weight' },
    { value: 'recomposition', label: 'Recomposition', hint: 'Lose fat, gain muscle' },
    { value: 'build_muscle', label: 'Build muscle', hint: 'Bulk' },
  ];
  const numberFields = [
    { key: 'weight_kg', label: 'Weight', unit: 'kg', placeholder: '75' },
    { key: 'height_cm', label: 'Height', unit: 'cm', placeholder: '180' },
    { key: 'age', label: 'Age', unit: 'yrs', placeholder: '30' },
  ] as const;

  return createPortal(
    <div className="dx pro-scope dx-overlay z-[9999]">
      <div className="dx-backdrop" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        role="dialog"
        aria-modal="true"
        aria-label="Body metrics and goals"
        className="dx-sheet sm:max-w-md"
      >
        <div className="dx-sheet-handle" aria-hidden />
        <div className="dx-sheet-header items-center">
          <span className="dx-badge-icon"><Calculator size={18} /></span>
          <div className="flex-1 min-w-0">
            <h2 className="text-[18px] font-semibold tracking-tight">Body metrics</h2>
            <p className="text-[12px] dx-muted">Used to calculate your daily calories and macros</p>
          </div>
          <button onClick={onClose} className="dx-icon-btn dx-icon-btn--sm" aria-label="Close">
            <X size={17} />
          </button>
        </div>

        {loading ? (
          <div className="p-10 flex justify-center">
            <Loader2 className="animate-spin dx-accent" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
            <div className="dx-sheet-body space-y-5">
              <div className="grid grid-cols-3 gap-2.5">
                {numberFields.map(f => (
                  <div key={f.key}>
                    <label className="dx-label" htmlFor={`np-${f.key}`}>{f.label}</label>
                    <div className="relative">
                      <input
                        id={`np-${f.key}`}
                        type="number"
                        inputMode="decimal"
                        value={formData[f.key]}
                        onChange={e => setFormData({ ...formData, [f.key]: e.target.value })}
                        className="dx-input pr-9 tabular"
                        placeholder={f.placeholder}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] dx-muted">{f.unit}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <div className="dx-label">Gender</div>
                <div className="dx-segment" role="tablist">
                  {[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }].map(g => (
                    <button key={g.value} type="button" role="tab" aria-selected={formData.gender === g.value} onClick={() => setFormData({ ...formData, gender: g.value })}>
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="dx-label">Fitness goal</div>
                <div className="grid grid-cols-2 gap-2">
                  {goalOptions.map(o => {
                    const selected = formData.fitness_goal === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setFormData({ ...formData, fitness_goal: o.value })}
                        className="rounded-2xl p-3 text-left transition-colors"
                        style={selected
                          ? { background: 'var(--dx-accent-soft)', border: '1.5px solid var(--dx-accent)' }
                          : { background: 'var(--dx-card-2)', border: '1.5px solid transparent' }}
                      >
                        <span className="block text-[14px] font-semibold" style={selected ? { color: 'var(--dx-accent)' } : undefined}>{o.label}</span>
                        <span className="block text-[11.5px] dx-muted mt-0.5">{o.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="dx-label">Activity level</div>
                <div className="dx-inset dx-list overflow-hidden" role="radiogroup" aria-label="Activity level">
                  {activityOptions.map(o => {
                    const selected = formData.activity_level === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setFormData({ ...formData, activity_level: o.value })}
                        className="w-full flex items-center gap-3 px-3.5 py-3 text-left"
                      >
                        <span className="flex-1 min-w-0">
                          <span className="block text-[14px] font-semibold">{o.label}</span>
                          <span className="block text-[12px] dx-muted">{o.hint}</span>
                        </span>
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                          style={selected ? { background: 'var(--dx-accent)', color: 'var(--dx-on-accent)' } : { border: '2px solid var(--dx-border-strong)' }}
                        >
                          {selected && <Check size={12} strokeWidth={3} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="dx-sheet-footer">
              <button type="submit" disabled={saving} className="dx-btn w-full h-12 text-[15px]">
                {saving && <Loader2 size={16} className="animate-spin" />}
                Save & calculate macros
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>,
    document.body
  );
}
