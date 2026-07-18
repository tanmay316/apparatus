import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Folder, Clock, Hash, Trash2, Copy, Archive } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getUserPlans, createPlan, archivePlan, deletePlan, clonePlan } from '@/services/plans';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import type { Plan } from '@/types';

export function PlanList() {
  const { user, profile, updateProfile } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['plans', user?.uid],
    queryFn: () => getUserPlans(user!.uid),
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: (title: string) => createPlan({
      ownerId: user!.uid,
      ownerName: user!.displayName || 'User',
      title,
      description: '',
      type: 'custom',
      tags: [],
      daysPerWeek: 0,
      estimatedDuration: '',
      isPublic: false,
      isArchived: false,
      clonedFrom: null,
      usageCount: 0,
    }),
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      showToast('Plan created');
      navigate(`/plans/${newId}`);
    },
    onError: () => showToast('Failed to create plan', 'error'),
  });

  const archiveMutation = useMutation({
    mutationFn: (planId: string) => archivePlan(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans', user?.uid] });
      showToast('Plan archived');
    },
    onError: () => showToast('Could not archive plan', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (planId: string) => deletePlan(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans', user?.uid] });
      showToast('Plan deleted');
    },
    onError: () => showToast('Could not delete plan', 'error'),
  });

  const duplicateMutation = useMutation({
    mutationFn: (planId: string) => clonePlan(planId, 'plans', user!.uid, profile?.displayName || user!.displayName || 'User'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans', user?.uid] });
      showToast('Plan duplicated');
    },
    onError: () => showToast('Could not duplicate plan', 'error'),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createMutation.mutate(newTitle.trim());
  };

  const handleSetActive = async (e: React.MouseEvent, planId: string) => {
    e.preventDefault(); // Prevent navigating to the link
    try {
      await updateProfile({ activePlanId: planId });
      showToast('Active plan updated');
    } catch (error) {
      showToast('Failed to update active plan', 'error');
    }
  };

  const stopCardAction = (event: React.MouseEvent) => event.stopPropagation();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-line">
        <div>
          <div className="font-mono text-amber text-xs tracking-widest mb-1">PROGRAMMING</div>
          <h1 className="font-display text-2xl">My Plans</h1>
        </div>
        <button 
          onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={16} /> New Plan
        </button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.form
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 20 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="card p-4 overflow-hidden"
            onSubmit={handleCreate}
          >
            <div className="flex gap-3">
              <input 
                autoFocus
                type="text" 
                placeholder="E.g. Upper/Lower Powerbuilding..."
                className="input-field flex-1 text-base"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                disabled={createMutation.isPending}
              />
              <button 
                type="submit" 
                disabled={!newTitle.trim() || createMutation.isPending}
                className="btn-primary"
              >
                {createMutation.isPending ? 'Saving...' : 'Create'}
              </button>
              <button 
                type="button" 
                onClick={() => setShowCreate(false)}
                className="btn-secondary"
                disabled={createMutation.isPending}
              >
                Cancel
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-sienna border-t-transparent rounded-full animate-spin" />
        </div>
      ) : plans.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-line rounded-lg">
          <Folder size={48} className="mx-auto text-bone-dim mb-4 opacity-50" />
          <h3 className="font-display text-lg mb-2">No plans yet</h3>
          <p className="text-sm text-bone-dim mb-6 max-w-sm mx-auto">
            Create your own custom workout plan from scratch, or explore the sample plans to find a proven template.
          </p>
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => setShowCreate(true)} className="btn-primary">Create Plan</button>
            <Link to="/explore" className="btn-secondary">Explore Samples</Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link to={`/plans/${plan.id}`} className="card-hover block h-full">
                <div className="p-5 flex flex-col h-full relative">
                  {profile?.activePlanId === plan.id && (
                    <div className="absolute top-0 right-0 bg-sienna text-bone text-[10px] font-bold px-3 py-1 rounded-bl-lg rounded-tr-lg">
                      ACTIVE
                    </div>
                  )}
                  
                  <div className="flex justify-between items-start mb-2 pr-12">
                    <h3 className="font-display text-lg leading-tight group-hover:text-sienna transition-colors">
                      {plan.title}
                    </h3>
                    {plan.type === 'sample' && (
                      <span className="tag-amber ml-2">SAMPLE</span>
                    )}
                  </div>
                  
                  <p className="text-sm text-bone-dim mb-4 line-clamp-2">
                    {plan.description || 'No description provided.'}
                  </p>
                  
                  <div className="mt-auto flex items-center justify-between pt-4 border-t border-line/50">
                    <div className="flex gap-4 font-mono text-[11px] text-bone-dim">
                      <div className="flex items-center gap-1.5">
                        <Hash size={12} /> {plan.daysPerWeek} days/week
                      </div>
                      {plan.estimatedDuration && (
                        <div className="flex items-center gap-1.5">
                          <Clock size={12} /> {plan.estimatedDuration}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 z-10 relative">
                      {profile?.activePlanId !== plan.id && <button onClick={(e) => handleSetActive(e, plan.id!)} className="text-xs font-mono text-sienna hover:text-sienna/80">Set Active</button>}
                      <button onClick={(e) => { stopCardAction(e); duplicateMutation.mutate(plan.id!); }} className="text-bone-dim hover:text-sienna p-1" title="Duplicate plan" aria-label={`Duplicate ${plan.title}`}><Copy size={14} /></button>
                      <button onClick={(e) => { stopCardAction(e); if (confirm(`Archive ${plan.title}?`)) archiveMutation.mutate(plan.id!); }} className="text-bone-dim hover:text-amber p-1" title="Archive plan" aria-label={`Archive ${plan.title}`}><Archive size={14} /></button>
                      <button onClick={(e) => { stopCardAction(e); if (confirm(`Delete ${plan.title} permanently?`)) deleteMutation.mutate(plan.id!); }} className="text-bone-dim hover:text-danger p-1" title="Delete plan" aria-label={`Delete ${plan.title}`}><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
