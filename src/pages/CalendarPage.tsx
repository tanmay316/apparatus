import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Clock, TrendingUp, Flame } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { getWorkoutsByDateRange } from '@/services/workouts';
import type { Workout } from '@/types';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad2(n: number) { return n.toString().padStart(2, '0'); }

export function CalendarPage() {
  const { profile } = useAuthStore();
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Calculate date range for this month
  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);
  const startDate = `${currentYear}-${pad2(currentMonth + 1)}-01`;
  const endDate = `${currentYear}-${pad2(currentMonth + 1)}-${pad2(lastDay.getDate())}`;

  const { data: workouts = [], isLoading } = useQuery({
    queryKey: ['calendarWorkouts', profile?.uid, startDate, endDate],
    queryFn: () => getWorkoutsByDateRange(profile!.uid, startDate, endDate),
    enabled: !!profile,
  });

  // Build date → workouts map
  const dateMap: Record<string, Workout[]> = {};
  for (const w of workouts) {
    if (!dateMap[w.date]) dateMap[w.date] = [];
    dateMap[w.date].push(w);
  }

  // Calendar grid cells
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  const cells: { day: number | null; dateStr: string }[] = [];
  // Leading empty cells
  for (let i = 0; i < startDayOfWeek; i++) {
    cells.push({ day: null, dateStr: '' });
  }
  // Day cells
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

  const selectedWorkouts = selectedDate ? (dateMap[selectedDate] || []) : [];

  return (
    <motion.div variants={container} initial="hidden" animate="show">
      <motion.div variants={item} className="pb-5 border-b border-line mb-6">
        <div className="font-mono text-amber text-xs tracking-widest mb-1">SCHEDULE</div>
        <h1 className="font-display text-3xl mb-1">Calendar</h1>
        <p className="text-bone-dim text-sm max-w-xl">View your workout schedule and history at a glance.</p>
      </motion.div>

      {/* Month Navigation */}
      <motion.div variants={item} className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-6">
          <button onClick={prevMonth} className="p-2 rounded-lg border border-line hover:border-teal hover:text-teal transition-colors">
            <ChevronLeft size={18} />
          </button>
          <h2 className="font-display text-xl tracking-wider">
            {MONTHS[currentMonth]} {currentYear}
          </h2>
          <button onClick={nextMonth} className="p-2 rounded-lg border border-line hover:border-teal hover:text-teal transition-colors">
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
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-teal border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, i) => {
              if (cell.day === null) {
                return <div key={i} className="aspect-square" />;
              }
              const hasWorkout = !!dateMap[cell.dateStr];
              const isToday = cell.dateStr === todayStr;
              const isSelected = cell.dateStr === selectedDate;

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(cell.dateStr)}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm font-mono relative transition-all ${
                    isSelected
                      ? 'bg-teal text-ink font-bold ring-2 ring-teal ring-offset-2 ring-offset-ink'
                      : isToday
                      ? 'bg-amber/15 text-amber font-bold border border-amber/30'
                      : hasWorkout
                      ? 'bg-teal/10 text-bone hover:bg-teal/20 border border-teal/20'
                      : 'text-bone-dim hover:bg-ink-3 border border-transparent'
                  }`}
                >
                  {cell.day}
                  {hasWorkout && !isSelected && (
                    <div className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-teal" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Selected day detail */}
      {selectedDate && (
        <motion.div
          variants={item}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <CalIcon size={16} className="text-teal" />
            <h3 className="font-display text-base">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
          </div>

          {selectedWorkouts.length === 0 ? (
            <div className="text-center text-bone-dim text-sm py-6 border border-dashed border-line rounded-lg">
              No workouts recorded on this day. Rest day? 🧘
            </div>
          ) : (
            <div className="space-y-3">
              {selectedWorkouts.map((w, i) => (
                <div key={i} className="bg-ink-2 rounded-lg p-4 border border-line/30">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-bold text-sm">{w.planTitle || 'Workout'}</div>
                      <div className="font-mono text-xs text-teal">{w.dayTitle || ''}</div>
                    </div>
                    <span className="font-mono text-[10px] text-bone-dim bg-ink-3 px-2 py-0.5 rounded">
                      {w.exercises?.length || 0} exercises
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-line/30">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Clock size={12} className="text-teal" />
                      <span className="font-mono text-bone-dim">{w.durationMin} min</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <TrendingUp size={12} className="text-amber" />
                      <span className="font-mono text-bone-dim">{(w.volume || 0).toLocaleString()} kg·r</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <Flame size={12} className="text-danger" />
                      <span className="font-mono text-bone-dim">{w.calories} kcal</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
