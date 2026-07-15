import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { TrendingUp, Flame, Zap, Clock, Dumbbell, Trophy } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { getWorkoutsByDateRange, getUserWorkouts } from '@/services/workouts';
import type { Workout } from '@/types';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

function formatNumber(n: number) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

// ─── Volume Chart (Canvas-based) ──────────────────────────
function VolumeChart({ workouts }: { workouts: Workout[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    
    // Group by week
    const weeklyVolume: Record<string, number> = {};
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i * 7);
      const weekKey = getWeekKey(d);
      weeklyVolume[weekKey] = 0;
    }
    
    for (const workout of workouts) {
      const d = new Date(workout.date);
      const weekKey = getWeekKey(d);
      if (weekKey in weeklyVolume) {
        weeklyVolume[weekKey] += workout.volume || 0;
      }
    }
    
    const keys = Object.keys(weeklyVolume).sort();
    const values = keys.map(k => weeklyVolume[k]);
    const maxVal = Math.max(...values, 1);
    
    const padding = { left: 50, right: 20, top: 20, bottom: 30 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const barW = Math.min(chartW / keys.length - 8, 40);
    
    ctx.clearRect(0, 0, w, h);
    
    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
      
      ctx.fillStyle = 'rgba(216,207,195,0.4)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(formatNumber(Math.round(maxVal * (1 - i / 4))), padding.left - 8, y + 4);
    }
    
    // Bars
    for (let i = 0; i < values.length; i++) {
      const x = padding.left + (chartW / keys.length) * i + (chartW / keys.length - barW) / 2;
      const barH = (values[i] / maxVal) * chartH;
      const y = padding.top + chartH - barH;
      
      // Gradient bar
      const grad = ctx.createLinearGradient(x, y, x, padding.top + chartH);
      grad.addColorStop(0, 'rgba(79,158,141,0.9)');
      grad.addColorStop(1, 'rgba(79,158,141,0.3)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
      ctx.fill();
      
      // Week label
      ctx.fillStyle = 'rgba(216,207,195,0.5)';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`W${i + 1}`, x + barW / 2, padding.top + chartH + 18);
    }
  }, [workouts]);
  
  return (
    <canvas 
      ref={canvasRef} 
      className="w-full" 
      style={{ height: '220px' }}
    />
  );
}

function getWeekKey(d: Date): string {
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}

// ─── Workout Heatmap ──────────────────────────────────────
function WorkoutHeatmap({ workouts }: { workouts: Workout[] }) {
  const weeks = 12;
  const today = new Date();
  const cells: { date: string; count: number; isToday: boolean }[] = [];
  
  // Build date → count map
  const dateMap: Record<string, number> = {};
  for (const w of workouts) {
    dateMap[w.date] = (dateMap[w.date] || 0) + 1;
  }
  
  // Generate last 12 weeks of cells
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - weeks * 7 + (7 - today.getDay()));
  
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];
    cells.push({
      date: dateStr,
      count: dateMap[dateStr] || 0,
      isToday: dateStr === todayStr,
    });
  }
  
  // Group into columns (weeks)
  const columns: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    columns.push(cells.slice(i, i + 7));
  }
  
  return (
    <div className="flex gap-1">
      {columns.map((col, ci) => (
        <div key={ci} className="flex flex-col gap-1">
          {col.map((cell, ri) => (
            <div
              key={ri}
              title={`${cell.date}: ${cell.count} workout${cell.count !== 1 ? 's' : ''}`}
              className={`w-3.5 h-3.5 rounded-sm transition-colors ${
                cell.isToday ? 'ring-1 ring-amber ring-offset-1 ring-offset-ink' : ''
              } ${
                cell.count === 0 ? 'bg-line/40' :
                cell.count === 1 ? 'bg-teal/50' :
                cell.count >= 2 ? 'bg-teal' : ''
              }`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Personal Records ────────────────────────────────────
function PersonalRecords({ workouts }: { workouts: Workout[] }) {
  // Find best volume per exercise
  const bestByExercise: Record<string, { maxWeight: number; maxReps: number; date: string }> = {};
  
  for (const w of workouts) {
    for (const ex of w.exercises || []) {
      if (!bestByExercise[ex.name]) {
        bestByExercise[ex.name] = { maxWeight: 0, maxReps: 0, date: w.date };
      }
      for (const set of ex.sets || []) {
        const wght = Number(set.weight) || 0;
        const rps = Number(set.reps) || 0;
        
        if (wght > bestByExercise[ex.name].maxWeight) {
          bestByExercise[ex.name].maxWeight = wght;
          bestByExercise[ex.name].date = w.date;
        }
        if (rps > bestByExercise[ex.name].maxReps) {
          bestByExercise[ex.name].maxReps = rps;
        }
      }
    }
  }
  
  const records = Object.entries(bestByExercise)
    .filter(([, v]) => v.maxWeight > 0 || v.maxReps > 0)
    .sort((a, b) => b[1].maxWeight - a[1].maxWeight)
    .slice(0, 10);
  
  if (records.length === 0) {
    return (
      <div className="text-center text-bone-dim text-sm py-8 border border-dashed border-line rounded-lg">
        No personal records yet. Start logging weights to track PRs!
      </div>
    );
  }
  
  return (
    <div className="space-y-2">
      {records.map(([name, data]) => (
        <div key={name} className="flex items-center justify-between p-3 bg-ink-2 rounded-lg border border-line/30">
          <div>
            <div className="text-sm font-bold">{name}</div>
            <div className="font-mono text-[10px] text-bone-dim">{data.date}</div>
          </div>
          <div className="flex gap-4 text-right">
            {data.maxWeight > 0 && (
              <div>
                <div className="font-mono text-teal font-bold">{data.maxWeight} kg</div>
                <div className="font-mono text-[9px] text-bone-dim">BEST WEIGHT</div>
              </div>
            )}
            {data.maxReps > 0 && (
              <div>
                <div className="font-mono text-amber font-bold">{data.maxReps}</div>
                <div className="font-mono text-[9px] text-bone-dim">BEST REPS</div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────
export function ProgressPage() {
  const { profile, stats } = useAuthStore();
  
  // Fetch all workouts for charts (last 90 days)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const startDate = ninetyDaysAgo.toISOString().split('T')[0];
  const endDate = new Date().toISOString().split('T')[0];
  
  const { data: recentWorkouts = [], isLoading } = useQuery({
    queryKey: ['progressWorkouts', profile?.uid, startDate],
    queryFn: () => getWorkoutsByDateRange(profile!.uid, startDate, endDate),
    enabled: !!profile,
  });
  
  // Fetch all workouts for PRs
  const { data: allWorkouts = [] } = useQuery({
    queryKey: ['allWorkouts', profile?.uid],
    queryFn: () => getUserWorkouts(profile!.uid, 500),
    enabled: !!profile,
  });
  
  if (!profile || !stats) return null;
  
  const xp = stats.xp || 0;
  const level = Math.floor(xp / 500) + 1;
  const levelXp = xp % 500;
  const levelProgress = (levelXp / 500) * 100;
  
  return (
    <motion.div variants={container} initial="hidden" animate="show">
      <motion.div variants={item} className="pb-5 border-b border-line mb-6">
        <div className="font-mono text-amber text-xs tracking-widest mb-1">ANALYTICS</div>
        <h1 className="font-display text-3xl mb-1">Progress</h1>
        <p className="text-bone-dim text-sm max-w-xl">Track your training metrics, volume trends, and personal records over time.</p>
      </motion.div>
      
      {/* Level bar */}
      <motion.div variants={item} className="card p-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-amber" />
            <span className="font-mono text-sm font-bold">LEVEL {level}</span>
          </div>
          <span className="font-mono text-xs text-bone-dim">{levelXp} / 500 XP</span>
        </div>
        <div className="w-full h-2 bg-line rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-gradient-to-r from-teal to-amber rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${levelProgress}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </div>
      </motion.div>

      {/* Stat Cards */}
      <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { icon: <Dumbbell size={18} />, value: stats.totalWorkouts, label: 'WORKOUTS', color: 'text-teal' },
          { icon: <TrendingUp size={18} />, value: formatNumber(stats.totalVolume), label: 'VOLUME (kg·reps)', color: 'text-amber' },
          { icon: <Flame size={18} />, value: formatNumber(stats.totalCalories), label: 'CALORIES', color: 'text-danger' },
          { icon: <Clock size={18} />, value: Math.round(stats.totalDurationMin / 60), label: 'HOURS', color: 'text-teal' },
        ].map((s, i) => (
          <div key={i} className="card p-4 text-center">
            <div className={`mb-2 flex justify-center ${s.color}`}>{s.icon}</div>
            <div className="text-2xl font-bold font-mono">{s.value}</div>
            <div className="font-mono text-[9px] text-bone-dim tracking-wider mt-1">{s.label}</div>
          </div>
        ))}
      </motion.div>
      
      {/* Streak */}
      <motion.div variants={item} className="grid grid-cols-2 gap-3 mb-6">
        <div className="card p-4 text-center">
          <div className="text-3xl font-bold font-mono text-amber">{stats.currentStreak}</div>
          <div className="font-mono text-[10px] text-bone-dim tracking-wider">CURRENT STREAK</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-3xl font-bold font-mono text-teal">{stats.longestStreak}</div>
          <div className="font-mono text-[10px] text-bone-dim tracking-wider">LONGEST STREAK</div>
        </div>
      </motion.div>

      {/* Volume Chart */}
      <motion.div variants={item} className="card p-5 mb-6">
        <h3 className="font-display text-base mb-4 flex items-center gap-2">
          <TrendingUp size={16} className="text-teal" /> Weekly Volume
        </h3>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-teal border-t-transparent rounded-full animate-spin" />
          </div>
        ) : recentWorkouts.length === 0 ? (
          <div className="text-center text-bone-dim text-sm py-12 border border-dashed border-line rounded">
            No workout data yet. Complete your first workout to see volume trends!
          </div>
        ) : (
          <VolumeChart workouts={recentWorkouts} />
        )}
      </motion.div>

      {/* Heatmap */}
      <motion.div variants={item} className="card p-5 mb-6">
        <h3 className="font-display text-base mb-4">Workout Activity — Last 12 Weeks</h3>
        <div className="overflow-x-auto pb-2">
          <WorkoutHeatmap workouts={recentWorkouts} />
        </div>
        <div className="flex items-center gap-2 mt-3 text-[10px] font-mono text-bone-dim">
          <span>Less</span>
          <div className="w-3 h-3 rounded-sm bg-line/40" />
          <div className="w-3 h-3 rounded-sm bg-teal/50" />
          <div className="w-3 h-3 rounded-sm bg-teal" />
          <span>More</span>
        </div>
      </motion.div>

      {/* Personal Records */}
      <motion.div variants={item} className="card p-5 mb-6">
        <h3 className="font-display text-base mb-4 flex items-center gap-2">
          <Trophy size={16} className="text-amber" /> Personal Records
        </h3>
        <PersonalRecords workouts={allWorkouts} />
      </motion.div>
    </motion.div>
  );
}
