import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Settings, Loader2 } from 'lucide-react';
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

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-md bg-ink-2 border border-line rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-line">
          <div className="flex items-center gap-2 text-bone">
            <Settings size={18} className="text-sienna" />
            <h2 className="font-display">Body Metrics</h2>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 text-bone-dim hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="animate-spin text-sienna" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-bone-dim mb-1">Weight (kg)</label>
                <input
                  type="number"
                  value={formData.weight_kg}
                  onChange={e => setFormData({ ...formData, weight_kg: e.target.value })}
                  className="w-full bg-ink border border-line rounded-xl px-3 py-2 text-sm text-bone focus:border-sienna outline-none"
                  placeholder="e.g. 75"
                />
              </div>
              <div>
                <label className="block text-xs text-bone-dim mb-1">Height (cm)</label>
                <input
                  type="number"
                  value={formData.height_cm}
                  onChange={e => setFormData({ ...formData, height_cm: e.target.value })}
                  className="w-full bg-ink border border-line rounded-xl px-3 py-2 text-sm text-bone focus:border-sienna outline-none"
                  placeholder="e.g. 180"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-bone-dim mb-1">Age</label>
                <input
                  type="number"
                  value={formData.age}
                  onChange={e => setFormData({ ...formData, age: e.target.value })}
                  className="w-full bg-ink border border-line rounded-xl px-3 py-2 text-sm text-bone focus:border-sienna outline-none"
                  placeholder="e.g. 30"
                />
              </div>
              <div>
                <label className="block text-xs text-bone-dim mb-1">Gender</label>
                <select
                  value={formData.gender}
                  onChange={e => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full bg-ink border border-line rounded-xl px-3 py-2 text-sm text-bone focus:border-sienna outline-none appearance-none"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-bone-dim mb-1">Activity Level</label>
              <select
                value={formData.activity_level}
                onChange={e => setFormData({ ...formData, activity_level: e.target.value })}
                className="w-full bg-ink border border-line rounded-xl px-3 py-2 text-sm text-bone focus:border-sienna outline-none appearance-none"
              >
                <option value="sedentary">Sedentary (Little/No Exercise)</option>
                <option value="light">Light (1-3 days/week)</option>
                <option value="moderate">Moderate (3-5 days/week)</option>
                <option value="active">Active (6-7 days/week)</option>
                <option value="very_active">Very Active (Physical job/training)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-bone-dim mb-1">Fitness Goal</label>
              <select
                value={formData.fitness_goal}
                onChange={e => setFormData({ ...formData, fitness_goal: e.target.value })}
                className="w-full bg-ink border border-line rounded-xl px-3 py-2 text-sm text-bone focus:border-sienna outline-none appearance-none"
              >
                <option value="lose_fat">Lose Fat (Cut)</option>
                <option value="maintain">Maintain Weight</option>
                <option value="recomposition">Body Recomposition</option>
                <option value="build_muscle">Build Muscle (Bulk)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full mt-2 bg-sienna text-white py-3 rounded-xl font-bold hover:bg-sienna/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Save & Calculate Macros
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
