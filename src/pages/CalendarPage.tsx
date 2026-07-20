import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Calendar as CalIcon, Clock, TrendingUp, Flame,
  BookOpen, Plus, User, Check, X, Search, ChevronDown, Download, Sparkles, MapPin
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getWorkoutsByDateRange } from '@/services/workouts';
import { getUserPlans, getPlan, getPlanDays, getPublicPlansForUser, clonePlan } from '@/services/plans';
import { getFollowing, getUsersByUids } from '@/services/social';
import { getUserEventRegistrations, getEventsByIds } from '@/services/events';
import type { Workout, Plan, PlanDay, AppEvent } from '@/types';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad2(n: number) { return n.toString().padStart(2, '0'); }

function getWorkoutMaxWeight(w: Workout): number {
  if (!w.exercises) return 0;
  let max = 0;
  for (const ex of w.exercises) {
    if (ex.sets) {
      for (const s of ex.sets) {
        if (s.completed && s.weight && s.weight > max) {
          max = s.weight;
        }
      }
    }
  }
  return max;
}

export function CalendarPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuthStore();
  const { showToast, theme } = useUIStore();
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(new Date().toISOString().split('T')[0]);

  // Modals / Selection States
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedFollowerUid, setSelectedFollowerUid] = useState<string>('');
  const [selectedFollowerPlanId, setSelectedFollowerPlanId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Fetch workouts in month range
  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);
  const startDate = `${currentYear}-${pad2(currentMonth + 1)}-01`;
  const endDate = `${currentYear}-${pad2(currentMonth + 1)}-${pad2(lastDay.getDate())}`;

  const { data: workouts = [], isLoading: isLoadingWorkouts } = useQuery({
    queryKey: ['calendarWorkouts', profile?.uid, startDate, endDate],
    queryFn: () => getWorkoutsByDateRange(profile!.uid, startDate, endDate),
    enabled: !!profile,
  });

  // 2. Fetch User's plans
  const { data: allPlans = [] } = useQuery({
    queryKey: ['userPlans', profile?.uid],
    queryFn: () => getUserPlans(profile!.uid),
    enabled: !!profile?.uid,
  });

  // 3. Fetch Active Plan
  const { data: activePlan } = useQuery({
    queryKey: ['activePlan', profile?.activePlanId],
    queryFn: () => getPlan(profile!.activePlanId!),
    enabled: !!profile?.activePlanId,
  });

  // 4. Fetch Active Plan Days
  const { data: activePlanDays = [] } = useQuery({
    queryKey: ['activePlanDays', profile?.activePlanId],
    queryFn: () => getPlanDays(profile!.activePlanId!),
    enabled: !!profile?.activePlanId,
  });

  // 5. Fetch Followed Profiles for Import feature
  const { data: followingUids = [] } = useQuery({
    queryKey: ['followingUsers', profile?.uid],
    queryFn: () => getFollowing(profile!.uid),
    enabled: !!profile?.uid,
  });

  const { data: followedAthletes = [] } = useQuery({
    queryKey: ['followedProfiles', followingUids],
    queryFn: () => getUsersByUids(followingUids),
    enabled: followingUids.length > 0,
  });

  // 6. Fetch Follower's Public Plans
  const { data: followerPlans = [] } = useQuery({
    queryKey: ['followerPlans', selectedFollowerUid],
    queryFn: () => getPublicPlansForUser(selectedFollowerUid),
    enabled: !!selectedFollowerUid,
  });

  // 7. Fetch Follower's Selected Plan Days (Live Preview)
  const { data: followerPlanDays = [] } = useQuery({
    queryKey: ['followerPlanDays', selectedFollowerPlanId],
    queryFn: () => getPlanDays(selectedFollowerPlanId),
    enabled: !!selectedFollowerPlanId,
  });

  // 8. Fetch User's Event Registrations
  const { data: eventRegistrations = [] } = useQuery({
    queryKey: ['userEventRegistrations', profile?.uid],
    queryFn: () => getUserEventRegistrations(profile!.uid),
    enabled: !!profile?.uid,
  });

  const registeredEventIds = eventRegistrations.map(r => r.eventId);
  
  // 9. Fetch details for registered events
  const { data: registeredEvents = [] } = useQuery({
    queryKey: ['registeredEvents', registeredEventIds],
    queryFn: () => getEventsByIds(registeredEventIds),
    enabled: registeredEventIds.length > 0,
  });

  // Build date → workouts map
  const dateMap: Record<string, Workout[]> = {};
  for (const w of workouts) {
    if (!dateMap[w.date]) dateMap[w.date] = [];
    dateMap[w.date].push(w);
  }

  // Build date → events map
  const eventDateMap: Record<string, AppEvent[]> = {};
  for (const e of registeredEvents) {
    if (e.dateTime && e.dateTime.start) {
      const dateStr = e.dateTime.start.toDate().toISOString().split('T')[0];
      if (!eventDateMap[dateStr]) eventDateMap[dateStr] = [];
      eventDateMap[dateStr].push(e);
    }
  }

  // Calendar grid calculation
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  const cells: { day: number | null; dateStr: string }[] = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    cells.push({ day: null, dateStr: '' });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentYear}-${pad2(currentMonth + 1)}-${pad2(d)}`;
    cells.push({ day: d, dateStr });
  }

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
    setSelectedDate(null);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
    setSelectedDate(null);
  };

  const handleActivePlanChange = async (newPlanId: string) => {
    if (!newPlanId) return;
    try {
      await useAuthStore.getState().updateProfile({ activePlanId: newPlanId });
      queryClient.invalidateQueries({ queryKey: ['activePlan'] });
      queryClient.invalidateQueries({ queryKey: ['activePlanDays'] });
      queryClient.invalidateQueries({ queryKey: ['calendarWorkouts'] });
      showToast('Active plan switched successfully');
    } catch (e: any) {
      showToast(e.message || 'Failed to switch plan', 'error');
    }
  };

  const handleImportPlan = async () => {
    if (!selectedFollowerPlanId || !profile) return;
    try {
      const planToClone = followerPlans.find(p => p.id === selectedFollowerPlanId);
      const displayName = profile.displayName || 'Athlete';
      const clonedId = await clonePlan(selectedFollowerPlanId, 'plans', profile.uid, displayName);
      
      // Auto-set as active plan
      await useAuthStore.getState().updateProfile({ activePlanId: clonedId });
      
      queryClient.invalidateQueries({ queryKey: ['activePlan'] });
      queryClient.invalidateQueries({ queryKey: ['activePlanDays'] });
      queryClient.invalidateQueries({ queryKey: ['userPlans'] });
      
      showToast('Plan imported and set as active!');
      setIsImportModalOpen(false);
      setSelectedFollowerUid('');
      setSelectedFollowerPlanId('');
    } catch (e: any) {
      showToast(e.message || 'Cloning failed', 'error');
    }
  };

  // Resolve scheduled plan day for the selected date
  const getScheduledDayForSelectedDate = (): PlanDay | null => {
    if (!selectedDate || activePlanDays.length === 0) return null;
    const dateObj = new Date(selectedDate + 'T00:00:00');
    const rawDayOfWeek = dateObj.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const weekdayNumber = rawDayOfWeek === 0 ? 7 : rawDayOfWeek; // Map Sunday to 7
    return activePlanDays.find(d => d.dayNumber === weekdayNumber) || null;
  };

  const selectedWorkouts = selectedDate ? (dateMap[selectedDate] || []) : [];
  const selectedEvents = selectedDate ? (eventDateMap[selectedDate] || []) : [];
  const scheduledDay = getScheduledDayForSelectedDate();

  // Filter followed athletes by search query
  const filteredAthletes = followedAthletes.filter(ath =>
    ath.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ath.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item} className="pb-5 border-b border-line mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="font-mono text-amber text-xs tracking-widest mb-1">SCHEDULE</div>
          <h1 className="font-display text-3xl mb-1">Calendar</h1>
          <p className="text-bone-dim text-sm max-w-xl">View scheduled training days, events, and completed activity details.</p>
        </div>

        {/* Top Actions: Selector & Follower Import */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Active Plan Selector */}
          <div className="flex flex-col">
            <span className="text-[9px] font-mono text-bone-dim uppercase tracking-wider mb-1">Active Plan</span>
            <div className="relative">
              <select
                value={profile?.activePlanId || ''}
                onChange={(e) => handleActivePlanChange(e.target.value)}
                className="appearance-none bg-ink-2 border border-line rounded-xl px-3 py-2 pr-8 text-xs font-sans text-bone hover:border-sienna transition-colors focus:outline-none focus:ring-1 focus:ring-sienna min-w-[160px]"
              >
                <option value="" disabled>No active plan</option>
                {allPlans.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-bone-dim pointer-events-none" />
            </div>
          </div>

          {/* Import Button */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="btn-secondary py-2 px-3 text-xs inline-flex items-center gap-1.5 self-end mt-4 h-[34px] rounded-xl hover:text-sienna hover:border-sienna/50"
          >
            <Plus size={13} /> Import Plan
          </button>
        </div>
      </motion.div>

      {/* Main Grid: Calendar left, day details right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Calendar Card */}
        <motion.div variants={item} className="card p-5 lg:col-span-2 h-fit">
          <div className="flex items-center justify-between mb-6">
            <button onClick={prevMonth} className="p-2 rounded-lg border border-line hover:border-sienna hover:text-sienna transition-colors">
              <ChevronLeft size={18} />
            </button>
            <h2 className="font-display text-xl tracking-wider">
              {MONTHS[currentMonth]} {currentYear}
            </h2>
            <button onClick={nextMonth} className="p-2 rounded-lg border border-line hover:border-sienna hover:text-sienna transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {WEEKDAYS.map(wd => (
              <div key={wd} className="text-center font-mono text-[10px] text-bone-dim tracking-wider py-1">
                {wd.toUpperCase()}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          {isLoadingWorkouts ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-sienna border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, i) => {
                if (cell.day === null) {
                  return <div key={i} className="aspect-square" />;
                }
                const hasWorkout = !!dateMap[cell.dateStr];
                const dayEvents = eventDateMap[cell.dateStr] || [];
                const hasEvent = dayEvents.length > 0;
                const isToday = cell.dateStr === todayStr;
                const isSelected = cell.dateStr === selectedDate;

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(cell.dateStr)}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-mono relative transition-all ${
                      isSelected
                        ? 'bg-sienna text-bone font-bold ring-2 ring-sienna ring-offset-2 ring-offset-ink'
                        : isToday
                        ? 'bg-amber/15 text-amber font-bold border border-amber/30'
                        : (hasWorkout || hasEvent)
                        ? 'bg-sienna/10 text-bone hover:bg-sienna/20 border border-sienna/20'
                        : 'text-bone-dim hover:bg-ink-3 border border-transparent'
                    }`}
                  >
                    {cell.day}
                    {hasWorkout && !isSelected && (
                      <div className="absolute bottom-1.5 w-1.5 h-1.5 rounded-full bg-sienna" />
                    )}
                    {hasEvent && !isSelected && (
                      <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber shadow" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Selected day details panel */}
        <motion.div variants={item} className="space-y-4 lg:col-span-1">
          
          {selectedDate && (
            <div className="card p-5 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-line">
                <CalIcon size={16} className="text-sienna" />
                <h3 className="font-display text-base">
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                </h3>
              </div>

              {/* SECTION A: SCHEDULED PLAN WORKOUT */}
              <div className="bg-ink bg-white/[0.01] rounded-xl p-4 border border-line/45 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen size={14} className="text-amber" />
                    <span className="font-mono text-xs text-bone-dim uppercase tracking-wider">Scheduled workout</span>
                  </div>
                  {scheduledDay && (
                    <span className="font-sans text-[11px] font-medium uppercase px-2 py-0.5 rounded-full bg-sienna/10 text-sienna border border-sienna/20">
                      Day {scheduledDay.dayNumber}
                    </span>
                  )}
                </div>

                {scheduledDay ? (
                  <div>
                    <div className="font-display text-lg text-bone font-medium mb-1">{scheduledDay.title}</div>
                    <div className="text-xs text-bone-dim font-mono mb-3">Estimated time: {scheduledDay.time || '~45 min'}</div>
                    <div className="space-y-1">
                      <div className="text-[10px] font-mono text-bone-dim uppercase tracking-wider">Exercises list:</div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {[...(scheduledDay.warmup || []), ...(scheduledDay.skillWork || []), ...(scheduledDay.strength || []), ...(scheduledDay.cooldown || [])].map((ex, idx) => (
                          <span key={idx} className="text-xs font-mono bg-ink-2 px-2 py-0.5 rounded border border-line/40 text-bone">
                            {ex.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-bone-dim font-mono py-1">
                    Rest Day 🧘 (No scheduled plan workout)
                  </div>
                )}
              </div>

              {/* SECTION C: EVENTS */}
              {selectedEvents.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="text-[10px] font-mono text-bone-dim uppercase tracking-wider flex items-center gap-2">
                    <MapPin size={12} className="text-amber" /> Registered Events
                  </div>
                  {selectedEvents.map(e => (
                    <div key={e.id} className="bg-ink-2 rounded-xl p-4 border border-line/30 space-y-2">
                      <div className="font-bold text-sm text-bone">{e.title}</div>
                      <div className="flex items-center gap-2 text-xs text-bone-dim font-mono">
                        <CalIcon size={12} />
                        {e.dateTime?.start?.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-bone-dim font-mono">
                        <MapPin size={12} />
                        <span className="truncate">{e.location.venueName}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* SECTION B: LOGGED WORKOUTS */}
              <div className="space-y-3">
                <div className="text-[10px] font-mono text-bone-dim uppercase tracking-wider">Logged Activity</div>
                
                {selectedWorkouts.length === 0 ? (
                  <div className="text-center text-bone-dim text-xs py-6 border border-dashed border-line rounded-xl">
                    No workouts logged on this day.
                  </div>
                ) : (
                  selectedWorkouts.map((w, i) => {
                    const maxWeightVal = getWorkoutMaxWeight(w);
                    return (
                      <div key={i} className="bg-ink-2 rounded-xl p-4 border border-line/30 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-bold text-sm text-bone">{w.planTitle || 'Workout'}</div>
                            <div className="font-mono text-xs text-sienna">{w.dayTitle || ''}</div>
                          </div>
                          <span className="font-mono text-[10px] text-bone-dim bg-ink-3 px-2 py-0.5 rounded">
                            {w.exercises?.length || 0} exercises
                          </span>
                        </div>

                        {/* Metric Strip: Time | Max Lift | Calories */}
                        <div className="grid grid-cols-3 gap-2 py-2 border-y border-line/20 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <Clock size={12} className="text-sienna" />
                            <span className="text-[9px] font-mono text-bone-dim uppercase">TIME</span>
                            <span className="font-mono text-xs text-bone font-semibold">{w.durationMin}m</span>
                          </div>
                          <div className="flex flex-col items-center gap-0.5">
                            <TrendingUp size={12} className="text-amber" />
                            <span className="text-[9px] font-mono text-bone-dim uppercase">MAX LIFT</span>
                            <span className="font-mono text-xs text-bone font-semibold">{maxWeightVal > 0 ? `${maxWeightVal}kg` : 'BW'}</span>
                          </div>
                          <div className="flex flex-col items-center gap-0.5">
                            <Flame size={12} className="text-danger" />
                            <span className="text-[9px] font-mono text-bone-dim uppercase">KCAL</span>
                            <span className="font-mono text-xs text-bone font-semibold">{w.calories}</span>
                          </div>
                        </div>

                        {/* Logged Exercise names list only */}
                        {w.exercises && w.exercises.length > 0 && (
                          <div className="pt-1">
                            <div className="text-[9px] font-mono text-bone-dim uppercase tracking-wider mb-1.5">Crushed Exercises:</div>
                            <div className="flex flex-wrap gap-1">
                              {w.exercises.map((ex, idx) => (
                                <span key={idx} className="text-[10px] font-mono bg-ink px-1.5 py-0.5 rounded border border-line/30 text-bone-dim">
                                  {ex.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* FOLLOWER PLAN IMPORT MODAL */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsImportModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-ink-2 border border-line w-full max-w-lg rounded-[28px] overflow-hidden shadow-2xl relative z-10 flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-5 border-b border-line flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-amber animate-pulse" />
                  <h3 className="font-display text-lg text-bone">Import Follower's Plan</h3>
                </div>
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="w-7 h-7 rounded-full bg-ink flex items-center justify-center border border-line hover:border-bone-dim text-bone-dim hover:text-bone transition-all"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Body Content */}
              <div className="p-6 overflow-y-auto space-y-4 flex-1">
                
                {/* Step 1: Search and Select Follower */}
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-bone-dim uppercase tracking-wider block">1. Select Followed Athlete</label>
                  
                  {followingUids.length === 0 ? (
                    <div className="text-xs text-bone-dim font-mono py-2 bg-ink/30 border border-line/35 rounded-xl text-center">
                      You are not following any athletes yet.
                    </div>
                  ) : (
                    <>
                      {/* Search Bar */}
                      <div className="relative mb-2">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-bone-dim" />
                        <input
                          type="text"
                          placeholder="Search athletes..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="input-field pl-9 bg-ink"
                        />
                      </div>

                      {/* Athletes List */}
                      <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto pr-1 border border-line/30 rounded-xl p-2 bg-ink">
                        {filteredAthletes.map(ath => {
                          const isSelected = selectedFollowerUid === ath.uid;
                          return (
                            <button
                              key={ath.uid}
                              type="button"
                              onClick={() => {
                                setSelectedFollowerUid(ath.uid);
                                setSelectedFollowerPlanId('');
                              }}
                              className={`flex items-center gap-3 p-2 rounded-lg text-left transition-all border ${
                                isSelected
                                  ? 'bg-sienna/20 border-sienna text-bone font-semibold'
                                  : 'bg-transparent border-transparent text-bone-dim hover:bg-white/5 hover:text-bone'
                              }`}
                            >
                              <img
                                src={ath.photoURL}
                                alt=""
                                className="w-7 h-7 rounded-full object-cover border border-line/50"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold truncate">{ath.displayName}</div>
                                <div className="text-[10px] font-mono text-bone-dim">@{ath.username}</div>
                              </div>
                              {isSelected && <Check size={12} className="text-sienna" />}
                            </button>
                          );
                        })}
                        {filteredAthletes.length === 0 && (
                          <div className="text-center py-4 text-xs font-mono text-bone-dim">No matching athletes</div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Step 2: Select Public Plan */}
                {selectedFollowerUid && (
                  <div className="space-y-2 pt-2 border-t border-line/20">
                    <label className="text-[10px] font-mono text-bone-dim uppercase tracking-wider block">2. Choose public Plan</label>
                    
                    {followerPlans.length === 0 ? (
                      <div className="text-xs text-bone-dim font-mono py-4 bg-ink/30 border border-line/35 rounded-xl text-center">
                        This athlete has no public plans.
                      </div>
                    ) : (
                      <div className="relative">
                        <select
                          value={selectedFollowerPlanId}
                          onChange={(e) => setSelectedFollowerPlanId(e.target.value)}
                          className="appearance-none w-full bg-ink border border-line rounded-xl px-3 py-2.5 pr-8 text-xs font-sans text-bone hover:border-sienna transition-colors focus:outline-none"
                        >
                          <option value="" disabled>Select a plan...</option>
                          {followerPlans.map(p => (
                            <option key={p.id} value={p.id}>{p.title} ({p.daysPerWeek} days)</option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-bone-dim pointer-events-none" />
                      </div>
                    )}
                  </div>
                )}

                {/* Step 3: Plan Preview */}
                {selectedFollowerPlanId && followerPlanDays.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-line/20">
                    <label className="text-[10px] font-mono text-bone-dim uppercase tracking-wider block">Plan Preview (Click to see days)</label>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1 border border-line/30 rounded-xl p-3 bg-ink">
                      {followerPlanDays.map((day) => {
                        const allExs = [...(day.warmup || []), ...(day.skillWork || []), ...(day.strength || []), ...(day.cooldown || [])];
                        return (
                          <div key={day.id} className="text-xs pb-2 border-b border-line/10 last:border-b-0 last:pb-0">
                            <div className="font-bold text-bone flex items-center justify-between">
                              <span>Day {day.dayNumber}: {day.title}</span>
                              <span className="text-[10px] font-mono text-sienna">{day.time || '~45m'}</span>
                            </div>
                            <div className="text-bone-dim text-[11px] mt-1 pl-1 font-mono leading-relaxed">
                              {allExs.map(e => e.name).join(', ') || 'Rest Day / No exercises'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-line bg-ink-3/45 flex items-center justify-end gap-2 flex-shrink-0">
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="btn-secondary py-2 px-4 text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportPlan}
                  disabled={!selectedFollowerPlanId}
                  className="btn-primary py-2 px-4 text-xs rounded-xl flex items-center gap-1.5"
                >
                  <Download size={13} /> Import & Set Active
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
