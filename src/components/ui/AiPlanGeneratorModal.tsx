import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, ChevronRight, CheckCircle2, Target, CalendarDays, Dumbbell, AlignLeft, ArrowRight, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import { createPlan, savePlanDay } from '@/services/plans';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'goal' | 'days' | 'equipment' | 'custom' | 'generating' | 'result';

export function AiPlanGeneratorModal({ isOpen, onClose }: Props) {
  const { user } = useAuthStore();
  const { theme, showToast } = useUIStore();
  const [step, setStep] = useState<Step>('goal');
  
  const [goal, setGoal] = useState('');
  const [days, setDays] = useState(4);
  const [equipment, setEquipment] = useState('Full Gym');
  const [customInfo, setCustomInfo] = useState('');
  
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  
  const queryClient = useQueryClient();

  const themeStyles = theme === 'dark' ? {
    '--bg': '#0a0d14',
    '--card': '#141720',
    '--border': '#222736',
    '--text': '#f3f4f6',
    '--muted': '#8b92a5',
    '--teal': '#d7b29d',
    '--amber': '#d9a441',
  } as React.CSSProperties : {
    '--bg': '#f7f8fb',
    '--card': '#ffffff',
    '--border': '#e5e7eb',
    '--text': '#111827',
    '--muted': '#6b7280',
    '--teal': '#2f7a6d',
    '--amber': '#c98a1f',
  } as React.CSSProperties;

  useEffect(() => {
    if (isOpen) {
      setStep('goal');
      setGoal('');
      setDays(4);
      setEquipment('Full Gym');
      setCustomInfo('');
      setGeneratedPlan(null);
    }
  }, [isOpen]);

  const handleGenerate = async () => {
    setStep('generating');
    
    // TODO: Connect real LLM API here.
    // Simulating API call for now.
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    setGeneratedPlan({
      title: `${goal || 'Hypertrophy'} Mastery`,
      description: `A highly optimized ${days}-day split focused on ${goal || 'building muscle'}. Tailored for ${equipment}.`,
      days: Array.from({ length: days }).map((_, i) => ({
        dayNumber: i + 1,
        title: `Day ${i + 1} - ${['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full Body'][i % 6]}`,
        time: '45-60 min',
        warmup: [{ name: 'Jumping Jacks', sets: '2 x 30s', tempo: '', rest: '10s' }, { name: 'Arm Circles', sets: '2 x 15', tempo: '', rest: '10s' }],
        strength: [
          { name: 'Bench Press', sets: '3 x 10', tempo: '2010', rest: '90s', cues: [], yt: '' },
          { name: 'Squat', sets: '3 x 8', tempo: '3010', rest: '120s', cues: [], yt: '' }
        ],
        cooldown: [{ name: 'Stretching', sets: '1 x 60s', tempo: '', rest: '0s' }]
      }))
    });
    
    setStep('result');
    setExpandedDay(null);
  };

  const handleSaveToLibrary = async () => {
    if (!user || !generatedPlan) return;
    try {
      const planId = await createPlan({
        creatorId: user.uid,
        ownerId: user.uid,
        title: generatedPlan.title,
        description: generatedPlan.description,
        isPublic: false,
        tags: [goal, equipment],
        likesCount: 0,
        savesCount: 0,
        daysPerWeek: generatedPlan.days.length,
      });
      
      for (let i = 0; i < generatedPlan.days.length; i++) {
        const d = generatedPlan.days[i];
        await savePlanDay(planId, {
          order: i + 1,
          dayNumber: d.dayNumber,
          title: d.title,
          time: d.time,
          type: 'strength',
          skill: '',
          warmup: d.warmup,
          skillWork: [],
          strength: d.strength,
          cooldown: d.cooldown
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      showToast('Plan saved to your library! 🎉');
      onClose();
    } catch (e) {
      showToast('Failed to save plan', 'error');
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div style={themeStyles} className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        className="w-full max-w-lg bg-[var(--bg)] rounded-3xl overflow-hidden shadow-2xl border border-[var(--border)] text-[var(--text)] flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border)] shrink-0 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-[40px] rounded-full mix-blend-screen" />
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="font-serif text-xl font-medium">Apparatus AI</h2>
              <p className="text-xs font-mono text-[var(--muted)] uppercase tracking-wider">Plan Generator</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--card)] transition-colors relative z-10 text-[var(--muted)] hover:text-[var(--text)]">
            <X size={18} />
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6 bg-[var(--card)]">
          <AnimatePresence mode="wait">
            
            {step === 'goal' && (
              <motion.div key="goal" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                <div className="flex items-center gap-3 text-sienna mb-2">
                  <Target size={20} />
                  <h3 className="font-sans font-semibold">What's your main goal?</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {['Hypertrophy', 'Strength', 'Endurance', 'Weight Loss'].map(g => (
                    <button
                      key={g}
                      onClick={() => setGoal(g)}
                      className={`p-4 rounded-2xl border-2 text-left transition-all ${goal === g ? 'border-sienna bg-sienna/5 shadow-md scale-[1.02]' : 'border-[var(--border)] hover:border-[var(--muted)] bg-[var(--bg)]'}`}
                    >
                      <div className="font-sans font-bold mb-1">{g}</div>
                      <div className="text-xs text-[var(--muted)] font-mono">Focus on {g.toLowerCase()}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-4">
                  <p className="text-xs font-mono text-[var(--muted)] mb-2 uppercase tracking-wide">Or type your own</p>
                  <input
                    type="text"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="e.g. Calisthenics front lever"
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 focus:outline-none focus:border-sienna text-sm font-medium"
                  />
                </div>
                <div className="flex justify-end pt-4">
                  <button disabled={!goal} onClick={() => setStep('days')} className="flex items-center gap-2 px-6 py-3 bg-sienna text-bone rounded-xl font-bold text-sm hover:scale-105 active:scale-95 transition-all disabled:opacity-50">
                    Next Step <ChevronRight size={16} />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'days' && (
              <motion.div key="days" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                <div className="flex items-center gap-3 text-sienna mb-2">
                  <CalendarDays size={20} />
                  <h3 className="font-sans font-semibold">Training days per week?</h3>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden">
                  {[2, 3, 4, 5, 6].map(d => (
                    <button
                      key={d}
                      onClick={() => setDays(d)}
                      className={`w-20 h-24 shrink-0 rounded-2xl border-2 flex flex-col items-center justify-center transition-all ${days === d ? 'border-sienna bg-sienna/5 shadow-md scale-[1.05]' : 'border-[var(--border)] hover:border-[var(--muted)] bg-[var(--bg)]'}`}
                    >
                      <div className="text-3xl font-serif font-medium mb-1">{d}</div>
                      <div className="text-[10px] font-mono text-[var(--muted)] uppercase">Days</div>
                    </button>
                  ))}
                </div>
                <div className="flex justify-between pt-4">
                  <button onClick={() => setStep('goal')} className="text-sm font-medium text-[var(--muted)] hover:text-[var(--text)]">Back</button>
                  <button onClick={() => setStep('equipment')} className="flex items-center gap-2 px-6 py-3 bg-sienna text-bone rounded-xl font-bold text-sm hover:scale-105 active:scale-95 transition-all">
                    Next Step <ChevronRight size={16} />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'equipment' && (
              <motion.div key="equipment" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                <div className="flex items-center gap-3 text-sienna mb-2">
                  <Dumbbell size={20} />
                  <h3 className="font-sans font-semibold">Available equipment?</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {['Full Gym', 'Dumbbells Only', 'Bodyweight', 'Kettlebells & Bands'].map(eq => (
                    <button
                      key={eq}
                      onClick={() => setEquipment(eq)}
                      className={`p-4 rounded-2xl border-2 text-left transition-all ${equipment === eq ? 'border-sienna bg-sienna/5 shadow-md scale-[1.02]' : 'border-[var(--border)] hover:border-[var(--muted)] bg-[var(--bg)]'}`}
                    >
                      <div className="font-sans font-bold mb-1">{eq}</div>
                    </button>
                  ))}
                </div>
                <div className="flex justify-between pt-4">
                  <button onClick={() => setStep('days')} className="text-sm font-medium text-[var(--muted)] hover:text-[var(--text)]">Back</button>
                  <button onClick={() => setStep('custom')} className="flex items-center gap-2 px-6 py-3 bg-sienna text-bone rounded-xl font-bold text-sm hover:scale-105 active:scale-95 transition-all">
                    Next Step <ChevronRight size={16} />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'custom' && (
              <motion.div key="custom" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                <div className="flex items-center gap-3 text-sienna mb-2">
                  <AlignLeft size={20} />
                  <h3 className="font-sans font-semibold">Any custom requests? (Optional)</h3>
                </div>
                <div>
                  <textarea
                    value={customInfo}
                    onChange={(e) => setCustomInfo(e.target.value)}
                    placeholder="e.g. Focus a lot on rear delts, avoid heavy deadlifts due to back pain, workout max 45 mins..."
                    className="w-full h-32 bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 focus:outline-none focus:border-sienna text-sm font-medium resize-none"
                  />
                </div>
                <div className="flex justify-between pt-4">
                  <button onClick={() => setStep('equipment')} className="text-sm font-medium text-[var(--muted)] hover:text-[var(--text)]">Back</button>
                  <button onClick={handleGenerate} className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-amber-950 rounded-xl font-bold text-sm hover:scale-105 active:scale-95 transition-all shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                    <Sparkles size={16} /> Generate Plan
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'generating' && (
              <motion.div key="generating" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-12 text-center">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full" />
                  <div className="w-16 h-16 bg-[var(--bg)] border-2 border-amber-500/50 rounded-full flex items-center justify-center relative z-10">
                    <Sparkles size={24} className="text-amber-500 animate-pulse" />
                  </div>
                </div>
                <h3 className="font-serif text-xl font-medium mb-2">Consulting the Coach...</h3>
                <p className="text-sm text-[var(--muted)] max-w-xs font-mono">Synthesizing {days} days of {goal.toLowerCase()} programming for {equipment.toLowerCase()}...</p>
                <div className="w-full max-w-xs h-1 bg-[var(--border)] rounded-full mt-6 overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 4, ease: 'easeInOut' }}
                    className="h-full bg-gradient-to-r from-sienna to-amber-500" 
                  />
                </div>
              </motion.div>
            )}

            {step === 'result' && generatedPlan && (
              <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="flex items-center gap-3 text-emerald-600 mb-2">
                  <CheckCircle2 size={24} />
                  <h3 className="font-sans font-semibold">Your Plan is Ready</h3>
                </div>
                
                <div className="bg-[var(--bg)] p-5 rounded-2xl border border-[var(--border)]">
                  <h4 className="font-serif text-xl font-medium mb-2">{generatedPlan.title}</h4>
                  <p className="text-sm text-[var(--muted)] mb-4">{generatedPlan.description}</p>
                  
                  <div className="space-y-3 mt-4 border-t border-[var(--border)] pt-4">
                    {generatedPlan.days.map((d: any) => (
                      <div key={d.dayNumber} className="flex flex-col p-3 rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden transition-all">
                        <div 
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => setExpandedDay(expandedDay === d.dayNumber ? null : d.dayNumber)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-sienna/10 text-sienna flex flex-col items-center justify-center font-bold font-mono shrink-0">
                              <span className="text-[10px] leading-none uppercase">Day</span>
                              <span className="leading-none">{d.dayNumber}</span>
                            </div>
                            <div>
                              <div className="font-bold text-sm">{d.title}</div>
                              <div className="text-xs text-[var(--muted)] font-mono flex items-center gap-1">
                                <Clock size={10} /> {d.time}
                              </div>
                            </div>
                          </div>
                          <div className="text-[var(--muted)] px-2">
                            {expandedDay === d.dayNumber ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </div>
                        
                        <AnimatePresence>
                          {expandedDay === d.dayNumber && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="pt-4 mt-3 border-t border-[var(--border)] space-y-3">
                                {d.warmup.length > 0 && (
                                  <div>
                                    <div className="text-[10px] uppercase font-bold text-[var(--muted)] mb-1 font-sans">Warm-up</div>
                                    {d.warmup.map((ex: any, idx: number) => (
                                      <div key={idx} className="flex justify-between items-center text-xs py-1">
                                        <span className="text-[var(--text)]">{ex.name}</span>
                                        <span className="text-[var(--muted)] font-mono">{ex.sets}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {d.strength.length > 0 && (
                                  <div>
                                    <div className="text-[10px] uppercase font-bold text-[var(--muted)] mb-1 font-sans">Strength</div>
                                    {d.strength.map((ex: any, idx: number) => (
                                      <div key={idx} className="flex justify-between items-center text-xs py-1">
                                        <span className="text-[var(--text)]">{ex.name}</span>
                                        <span className="text-[var(--muted)] font-mono">{ex.sets}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {d.cooldown.length > 0 && (
                                  <div>
                                    <div className="text-[10px] uppercase font-bold text-[var(--muted)] mb-1 font-sans">Cool-down</div>
                                    {d.cooldown.map((ex: any, idx: number) => (
                                      <div key={idx} className="flex justify-between items-center text-xs py-1">
                                        <span className="text-[var(--text)]">{ex.name}</span>
                                        <span className="text-[var(--muted)] font-mono">{ex.sets}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-2 gap-3">
                  <button onClick={() => setStep('custom')} className="text-sm font-medium text-[var(--muted)] hover:text-[var(--text)] px-4">Tweak it</button>
                  <button onClick={handleSaveToLibrary} className="flex items-center gap-2 px-6 py-3 bg-sienna text-bone rounded-xl font-bold text-sm hover:scale-105 active:scale-95 transition-all">
                    Add to Library <ArrowRight size={16} />
                  </button>
                </div>
              </motion.div>
            )}
            
          </AnimatePresence>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
