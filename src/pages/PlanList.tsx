import { useState, type FormEvent, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Archive, ArrowRight, Check, Clock, Compass, Copy, FolderPlus, Plus, Star, Trash2, X } from 'lucide-react';
import { getUserPlans, createPlan, archivePlan, deletePlan, clonePlan } from '@/services/plans';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { DaysPerWeek, PlanBadge, planCategory } from '@/components/plans/plan-meta';
import type { Plan } from '@/types';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

export function PlanList() {
  const { user, profile, updateProfile } = useAuthStore();
  const { showToast, confirm } = useUIStore();
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

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createMutation.mutate(newTitle.trim());
  };

  const stop = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const setActive = async (e: MouseEvent, planId: string) => {
    stop(e);
    try {
      await updateProfile({ activePlanId: planId });
      showToast('Active plan updated');
    } catch {
      showToast('Failed to update active plan', 'error');
    }
  };

  const onArchive = async (e: MouseEvent, plan: Plan) => {
    stop(e);
    const ok = await confirm({ title: 'Archive plan', message: `Archive "${plan.title}"? It will be hidden from your plans.`, confirmText: 'Archive', type: 'warning', icon: 'alert' });
    if (ok && plan.id) archiveMutation.mutate(plan.id);
  };

  const onDelete = async (e: MouseEvent, plan: Plan) => {
    stop(e);
    const ok = await confirm({ title: 'Delete plan', message: `Delete "${plan.title}" permanently? This cannot be undone.`, confirmText: 'Delete', type: 'danger', icon: 'trash' });
    if (ok && plan.id) deleteMutation.mutate(plan.id);
  };

  const activePlan = plans.find(p => p.id === profile?.activePlanId) || null;
  const otherPlans = activePlan ? plans.filter(p => p.id !== activePlan.id) : plans;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="dx pro-scope max-w-5xl mx-auto pt-1 sm:pt-4 space-y-4 pb-10">
      <motion.header variants={item} className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="dx-eyebrow">Training</div>
          <h1 className="text-[22px] sm:text-[27px] font-semibold tracking-tight leading-tight">My Plans</h1>
          <p className="text-[13px] dx-muted mt-0.5">{plans.length > 0 ? `${plans.length} program${plans.length === 1 ? '' : 's'} in your library` : 'Build or import your first program.'}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link to="/explore" className="dx-btn-secondary !h-10 !px-3.5 !text-[13px]" aria-label="Explore programs">
            <Compass size={16} /> <span className="hidden sm:inline">Explore</span>
          </Link>
          <button type="button" onClick={() => setShowCreate(v => !v)} className="dx-btn !h-10 !px-3.5 !text-[13px]">
            {showCreate ? <X size={16} /> : <Plus size={16} />} <span className="hidden sm:inline">{showCreate ? 'Cancel' : 'New plan'}</span>
          </button>
        </div>
      </motion.header>

      <AnimatePresence>
        {showCreate && (
          <motion.form
            key="create"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
            onSubmit={handleCreate}
          >
            <div className="dx-card p-4">
              <label className="dx-label" htmlFor="new-plan-title">Plan name</label>
              <div className="flex gap-2">
                <input
                  id="new-plan-title"
                  autoFocus
                  type="text"
                  placeholder="e.g. Upper / Lower Powerbuilding"
                  className="dx-input flex-1"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  disabled={createMutation.isPending}
                />
                <button type="submit" disabled={!newTitle.trim() || createMutation.isPending} className="dx-btn !h-11 shrink-0">
                  {createMutation.isPending ? 'Creating…' : <><Check size={16} /> Create</>}
                </button>
              </div>
              <p className="mt-2 text-[12px] dx-muted">You'll add training days and exercises on the next screen.</p>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="space-y-3">
          <div className="dx-card h-[190px] animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[0, 1].map(i => <div key={i} className="dx-card h-[170px] animate-pulse" />)}
          </div>
        </div>
      ) : plans.length === 0 ? (
        <motion.div variants={item} className="dx-card p-8 text-center">
          <span className="dx-badge-icon !w-14 !h-14 !rounded-2xl mx-auto"><FolderPlus size={24} /></span>
          <div className="mt-3 text-[16px] font-semibold">No plans yet</div>
          <p className="mt-1 text-[13px] dx-muted max-w-sm mx-auto">Create a custom program from scratch, or import a proven template and make it your own.</p>
          <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-2">
            <button type="button" onClick={() => setShowCreate(true)} className="dx-btn w-full sm:w-auto"><Plus size={16} /> Create plan</button>
            <Link to="/explore" className="dx-btn-secondary w-full sm:w-auto"><Compass size={16} /> Browse programs</Link>
          </div>
        </motion.div>
      ) : (
        <>
          {activePlan ? (
            <motion.section variants={item}>
              <Link to={`/plans/${activePlan.id}`} className="dx-hero p-5 sm:p-6 block">
                <div className="flex items-start gap-3">
                  <span className="dx-hero-icon"><Star size={20} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-75">Active program · {planCategory(activePlan).label}</div>
                    <h2 className="mt-1 text-[22px] sm:text-[26px] font-semibold leading-tight truncate">{activePlan.title}</h2>
                    <p className="mt-1.5 text-[13px] opacity-80 leading-relaxed line-clamp-2">{activePlan.description || 'Your current training program. Open it to see today’s session.'}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px]">
                  <DaysPerWeek days={activePlan.daysPerWeek} light />
                  {activePlan.estimatedDuration && <span className="inline-flex items-center gap-1 opacity-85"><Clock size={13} /> {activePlan.estimatedDuration}</span>}
                </div>
                <span className="dx-hero-btn w-full mt-4">Open program <ArrowRight size={16} /></span>
              </Link>
            </motion.section>
          ) : (
            <motion.div variants={item} className="dx-card p-4 flex items-center gap-3">
              <span className="dx-badge-icon"><Star size={18} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold">No active program</div>
                <div className="text-[12px] dx-muted">Set one as active to see it on your dashboard every day.</div>
              </div>
            </motion.div>
          )}

          {otherPlans.length > 0 && (
            <>
              <motion.div variants={item} className="flex items-center justify-between">
                <div className="dx-section-title">{activePlan ? 'Other plans' : 'Your plans'}</div>
                <span className="text-[12px] dx-muted tabular">{otherPlans.length}</span>
              </motion.div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {otherPlans.map(plan => (
                  <motion.div key={plan.id} variants={item}>
                    <Link to={`/plans/${plan.id}`} className="dx-card p-4 flex flex-col h-full">
                      <div className="flex items-start gap-3">
                        <PlanBadge plan={plan} size={40} />
                        <div className="flex-1 min-w-0">
                          <div className="dx-eyebrow">{plan.type === 'sample' ? 'Template' : planCategory(plan).label}</div>
                          <h3 className="mt-0.5 text-[15px] font-semibold leading-snug truncate">{plan.title}</h3>
                        </div>
                      </div>
                      <p className="mt-2 text-[13px] dx-muted leading-relaxed line-clamp-2 flex-1">{plan.description || 'No description yet.'}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        <DaysPerWeek days={plan.daysPerWeek} />
                        {plan.estimatedDuration && <span className="text-[11px] dx-muted inline-flex items-center gap-1"><Clock size={11} /> {plan.estimatedDuration}</span>}
                      </div>
                      <div className="mt-3 pt-3 flex items-center justify-between gap-2" style={{ borderTop: '1px solid var(--dx-border)' }}>
                        <button type="button" onClick={e => setActive(e, plan.id!)} className="dx-link !text-[12px]">
                          <Star size={13} /> Set active
                        </button>
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={e => { stop(e); duplicateMutation.mutate(plan.id!); }} className="dx-icon-btn dx-icon-btn--sm" title="Duplicate" aria-label={`Duplicate ${plan.title}`}><Copy size={15} /></button>
                          <button type="button" onClick={e => onArchive(e, plan)} className="dx-icon-btn dx-icon-btn--sm" title="Archive" aria-label={`Archive ${plan.title}`}><Archive size={15} /></button>
                          <button type="button" onClick={e => onDelete(e, plan)} className="dx-icon-btn dx-icon-btn--sm" title="Delete" aria-label={`Delete ${plan.title}`} style={{ color: '#dc2626' }}><Trash2 size={15} /></button>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </>
          )}

          {activePlan && (
            <motion.div variants={item} className="flex items-center justify-end gap-2 text-[12px] dx-muted">
              <span>Manage the active plan:</span>
              <button type="button" onClick={e => { stop(e); duplicateMutation.mutate(activePlan.id!); }} className="dx-link !text-[12px]"><Copy size={13} /> Duplicate</button>
              <button type="button" onClick={e => onArchive(e, activePlan)} className="dx-link !text-[12px]"><Archive size={13} /> Archive</button>
            </motion.div>
          )}

          <motion.div variants={item}>
            <Link to="/explore" className="dx-card p-4 flex items-center gap-3">
              <span className="dx-badge-icon"><Compass size={18} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold">Find a new program</div>
                <div className="text-[12px] dx-muted">Import proven templates for gym, calisthenics, home and conditioning.</div>
              </div>
              <ArrowRight size={18} className="dx-muted" />
            </Link>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
