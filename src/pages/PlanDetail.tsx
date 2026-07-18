import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ArrowLeft, Trash2, Edit3, Lock, Eye, Play, Copy, GripVertical } from 'lucide-react';
import { motion } from 'framer-motion';
import { getPlan, getPlanDays, updatePlan, deletePlanDay, savePlanDay, archivePlan, reorderPlanDays, clonePlan } from '@/services/plans';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import type { PlanDay } from '@/types';

export function PlanDetail() {
  const { planId } = useParams<{ planId: string }>();
  const { user, profile, updateProfile } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [editingTitle, setEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [orderedDays, setOrderedDays] = useState<PlanDay[]>([]);
  const [draggedDayId, setDraggedDayId] = useState<string | null>(null);

  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => getPlan(planId!),
    enabled: !!planId,
  });

  const { data: days = [], isLoading: daysLoading } = useQuery({
    queryKey: ['planDays', planId],
    queryFn: () => getPlanDays(planId!),
    enabled: !!planId,
  });

  useEffect(() => {
    setOrderedDays(days);
  }, [days]);

  const isOwner = user && plan && user.uid === plan.ownerId;
  const isSample = plan?.type === 'sample';

  // Mutations
  const updateMutation = useMutation({
    mutationFn: (data: any) => updatePlan(planId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', planId] });
      setEditingTitle(false);
      showToast('Plan updated');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => archivePlan(planId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      showToast('Plan archived');
      // If we just archived the active plan, unset it
      if (profile?.activePlanId === planId) {
        updateProfile({ activePlanId: null });
      }
      navigate('/plans');
    },
  });

  const handleSetActive = async () => {
    try {
      await updateProfile({ activePlanId: planId! });
      showToast('Active plan updated');
    } catch (error) {
      showToast('Failed to update active plan', 'error');
    }
  };

  const addDayMutation = useMutation({
    mutationFn: () => savePlanDay(planId!, {
      dayNumber: orderedDays.length + 1,
      order: orderedDays.length + 1,
      title: 'New Day',
      skill: '',
      time: '~45 min',
      type: 'strength',
      warmup: [],
      skillWork: [],
      strength: [],
      cooldown: []
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planDays', planId] });
      showToast('Day added');
    },
  });

  const deleteDayMutation = useMutation({
    mutationFn: (dayId: string) => deletePlanDay(planId!, dayId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planDays', planId] });
      showToast('Day removed');
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (nextDays: PlanDay[]) => reorderPlanDays(planId!, nextDays.map(day => day.id!).filter(Boolean)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planDays', planId] });
      showToast('Training order updated');
    },
    onError: () => {
      setOrderedDays(days);
      showToast('Could not save training order', 'error');
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: () => clonePlan(planId!, 'plans', user!.uid, profile?.displayName || user!.displayName || 'User'),
    onSuccess: (newPlanId) => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      showToast('Plan duplicated');
      navigate(`/plans/${newPlanId}`);
    },
    onError: () => showToast('Could not duplicate plan', 'error'),
  });

  const handleDropDay = (targetId: string) => {
    if (!draggedDayId || draggedDayId === targetId) return;
    const fromIndex = orderedDays.findIndex(day => day.id === draggedDayId);
    const toIndex = orderedDays.findIndex(day => day.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const nextDays = [...orderedDays];
    const [moved] = nextDays.splice(fromIndex, 1);
    nextDays.splice(toIndex, 0, moved);
    setOrderedDays(nextDays);
    setDraggedDayId(null);
    reorderMutation.mutate(nextDays);
  };

  if (planLoading || daysLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-sienna border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!plan) {
    return <div className="text-center py-20 text-bone-dim">Plan not found or you don't have access.</div>;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Link to={isSample ? "/explore" : "/plans"} className="inline-flex items-center gap-2 text-sm text-bone-dim hover:text-bone mb-6 transition-colors">
        <ArrowLeft size={16} /> Back to {isSample ? "Explore" : "Plans"}
      </Link>

      <div className="border-b border-line pb-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <span className="font-mono text-amber text-xs tracking-widest uppercase">
                {isSample ? 'SAMPLE PLAN' : 'CUSTOM PLAN'}
              </span>
              {plan.isPublic ? <span className="flex items-center gap-1 text-[10px] text-sienna font-mono border border-sienna/30 px-1.5 rounded bg-sienna/10"><Eye size={10}/> PUBLIC</span> : <span className="flex items-center gap-1 text-[10px] text-bone-dim font-mono border border-line px-1.5 rounded bg-ink-2"><Lock size={10}/> PRIVATE</span>}
            </div>
            
            {editingTitle ? (
              <div className="flex items-center gap-2 mt-2">
                <input 
                  type="text"
                  autoFocus
                  className="input-field text-xl font-display py-1.5 px-3 max-w-sm"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
                <button onClick={() => updateMutation.mutate({ title: newTitle })} className="btn-primary py-1.5 px-3">Save</button>
                <button onClick={() => setEditingTitle(false)} className="btn-secondary py-1.5 px-3">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-3 group mt-1">
                <h1 className="font-display text-3xl">{plan.title}</h1>
                {isOwner && !isSample && (
                  <button onClick={() => { setNewTitle(plan.title); setEditingTitle(true); }} className="text-bone-dim hover:text-sienna opacity-0 group-hover:opacity-100 transition-opacity">
                    <Edit3 size={16} />
                  </button>
                )}
              </div>
            )}
            
            <p className="text-bone-dim text-sm mt-3 max-w-2xl">{plan.description || (isOwner && !isSample ? "Add a description to summarize this program." : "")}</p>
          </div>
          
          {isOwner && !isSample && (
            <div className="flex gap-2 shrink-0">
              {profile?.activePlanId === planId ? (
                <div className="btn-secondary opacity-50 cursor-default flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-sienna" /> Active Program
                </div>
              ) : (
                <button 
                  onClick={handleSetActive}
                  className="btn-primary"
                >
                  Set as Active
                </button>
              )}
              <button onClick={() => duplicateMutation.mutate()} disabled={duplicateMutation.isPending} className="btn-secondary flex items-center gap-2" title="Duplicate plan">
                <Copy size={15} /> Duplicate
              </button>
              <button 
                onClick={() => { if(confirm('Delete this plan forever?')) archiveMutation.mutate() }}
                className="btn-secondary hover:text-danger hover:border-danger"
                title="Archive plan"
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg tracking-wider">TRAINING SPLIT</h2>
        {isOwner && !isSample && (
          <button onClick={() => addDayMutation.mutate()} className="btn-secondary py-1.5 text-xs flex items-center gap-1.5">
            <Plus size={14} /> Add Day
          </button>
        )}
      </div>

      {days.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-line rounded-lg">
          <p className="text-bone-dim text-sm mb-4">No training days added to this plan yet.</p>
          {isOwner && !isSample && (
            <button onClick={() => addDayMutation.mutate()} className="btn-primary mx-auto">Add First Day</button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orderedDays.map((day, i) => (
            <motion.div 
              key={day.id} 
              className="card relative group hover:border-sienna/50 transition-colors flex flex-col h-full"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              draggable={!!isOwner && !isSample}
              onDragStart={() => setDraggedDayId(day.id || null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDropDay(day.id!)}
            >
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-sienna opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <Link to={`/plans/${planId}/day/${day.id}`} className="block p-5 flex-1 cursor-pointer">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-mono text-bone-dim text-[11px] tracking-widest flex items-center gap-2">{isOwner && !isSample && <GripVertical size={13} className="text-bone-dim/60" />} DAY {i + 1}</span>
                  <span className="font-mono text-bone-dim text-[10px]">{day.time}</span>
                </div>
                
                <h3 className="font-display text-xl mb-1">{day.title}</h3>
                {day.skill && <div className="font-mono text-amber text-xs mb-4">{day.skill}</div>}
                
                <div className="mt-4 pt-4 border-t border-line/50 font-mono text-[11px] text-bone-dim">
                  {(day.warmup.length + day.skillWork.length + day.strength.length + day.cooldown.length)} movements
                </div>
              </Link>
              
              {isOwner && !isSample && (
                <div className="px-5 pb-4 pt-2 border-t border-line/30 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                   <Link to={`/plans/${planId}/day/${day.id}`} className="text-xs text-sienna hover:text-sienna/80 font-mono font-bold flex items-center gap-1">
                    <Edit3 size={12}/> Edit
                   </Link>
                   <button 
                     onClick={(e) => { e.preventDefault(); if(confirm('Remove this day?')) deleteDayMutation.mutate(day.id!); }}
                     className="text-xs text-bone-dim hover:text-danger flex items-center gap-1"
                   >
                    <Trash2 size={12}/>
                   </button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
