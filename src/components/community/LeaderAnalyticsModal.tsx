import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { X, TrendingUp, Users, Activity, Flame, Award, Calendar, BarChart2, UserCheck, UserX } from 'lucide-react';
import type { Community } from '@/types';
import { getCommunityLiveStats, getLeaderAnalytics } from '@/services/events';

export function LeaderAnalyticsModal({ community, onClose }: { community: Community; onClose: () => void }) {
  
  const { data: liveStats } = useQuery({
    queryKey: ['communityLiveStats', community.id],
    queryFn: () => getCommunityLiveStats(community.id!),
    enabled: !!community.id,
  });

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['leaderAnalytics', community.id],
    queryFn: () => getLeaderAnalytics(community.id!),
    enabled: !!community.id,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/80 backdrop-blur-sm sm:overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} className="bg-ink rounded-t-[32px] sm:rounded-[32px] p-5 sm:p-8 max-w-3xl w-full sm:border border-t border-line shadow-2xl max-h-[90dvh] sm:max-h-[90vh] flex flex-col space-y-6">
        
        <div className="flex justify-between items-start shrink-0 border-b border-line pb-4">
          <div>
            <div className="flex items-center gap-2 text-sienna text-xs font-mono uppercase tracking-widest mb-1">
              <BarChart2 size={14} /> Community Leader Analytics
            </div>
            <h2 className="font-display text-2xl text-bone">{community.name} Overview</h2>
            <p className="text-xs text-bone-dim mt-0.5">Real-time engagement, growth, and member activity insights.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-ink-2 text-bone-dim transition-colors"><X size={20} /></button>
        </div>

        {isLoading ? (
          <div className="py-20 text-center font-mono text-bone-dim">Loading analytics...</div>
        ) : (
          <div className="overflow-y-auto space-y-6 pr-1">
            {/* Top Key Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-ink-2 border border-line/30">
                <div className="flex items-center justify-between text-bone-dim mb-1">
                  <span className="text-[10px] font-mono uppercase">Total Members</span>
                  <Users size={16} className="text-sienna" />
                </div>
                <div className="font-display text-2xl text-bone">{community.membersCount || 0}</div>
                <span className="text-[10px] text-emerald-400 font-mono">Members</span>
              </div>

              <div className="p-4 rounded-2xl bg-ink-2 border border-line/30">
                <div className="flex items-center justify-between text-bone-dim mb-1">
                  <span className="text-[10px] font-mono uppercase">Active Streaks</span>
                  <Activity size={16} className="text-emerald-400" />
                </div>
                <div className="font-display text-2xl text-bone">{liveStats?.activeStreaks || 0}</div>
                <span className="text-[10px] text-bone-dim font-mono">Current Streaks</span>
              </div>

              <div className="p-4 rounded-2xl bg-ink-2 border border-line/30">
                <div className="flex items-center justify-between text-bone-dim mb-1">
                  <span className="text-[10px] font-mono uppercase">Workouts Today</span>
                  <Flame size={16} className="text-amber" />
                </div>
                <div className="font-display text-2xl text-bone">{liveStats?.workoutsToday || 0}</div>
                <span className="text-[10px] text-amber font-mono">{liveStats?.caloriesBurnedToday ? Math.round(liveStats.caloriesBurnedToday/1000) : 0}K kcal burned</span>
              </div>

              <div className="p-4 rounded-2xl bg-ink-2 border border-line/30">
                <div className="flex items-center justify-between text-bone-dim mb-1">
                  <span className="text-[10px] font-mono uppercase">PRs Today</span>
                  <Award size={16} className="text-sienna" />
                </div>
                <div className="font-display text-2xl text-bone">{liveStats?.prsToday || 0}</div>
                <span className="text-[10px] text-sienna font-mono">Top performance</span>
              </div>
            </div>

            {/* Growth & Activity Bar Chart Visualization */}
            <div className="card p-5 space-y-4">
              <h3 className="font-display text-lg text-bone flex items-center gap-2">
                <TrendingUp size={18} className="text-sienna" /> Weekly Engagement
              </h3>
              <div className="h-40 flex items-end justify-between gap-2 pt-4 px-2 border-b border-line/30">
                {analytics?.chartData?.map((item: any) => (
                  <div key={item.day} className="flex-1 flex flex-col items-center gap-2 group">
                    <span className="text-[10px] font-mono text-bone-dim opacity-0 group-hover:opacity-100 transition-opacity">{item.count}</span>
                    <div className="w-full bg-sienna/20 rounded-t-lg group-hover:bg-sienna transition-colors relative" style={{ height: `${item.val}%`, minHeight: '4px' }}>
                      <div className="absolute top-0 left-0 right-0 h-1.5 bg-sienna rounded-t-lg" />
                    </div>
                    <span className="text-xs font-mono text-bone-dim">{item.day}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Member Analytics: Most Active vs Inactive */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card p-5 space-y-3">
                <h3 className="font-display text-base text-bone flex items-center gap-2">
                  <UserCheck size={16} className="text-emerald-400" /> Most Active Athletes
                </h3>
                <div className="space-y-2">
                  {analytics?.mostActive?.length ? analytics.mostActive.map((u: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-ink-2">
                      <span className="font-semibold text-bone">{i + 1}. {u.name}</span>
                      <span className="font-mono text-sienna">{u.workouts} sessions • {u.streak}</span>
                    </div>
                  )) : (
                    <div className="text-xs font-mono text-bone-dim py-2 text-center">No active members found.</div>
                  )}
                </div>
              </div>

              <div className="card p-5 space-y-3">
                <h3 className="font-display text-base text-bone flex items-center gap-2">
                  <UserX size={16} className="text-rose-400" /> Inactive Members (&gt;14 days)
                </h3>
                <div className="space-y-2">
                  {analytics?.inactive?.length ? analytics.inactive.map((u: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-ink-2 opacity-80">
                      <span className="text-bone">{u.name}</span>
                      <span className="font-mono text-rose-400 text-[10px]">{u.lastActiveStr}</span>
                    </div>
                  )) : (
                    <div className="text-xs font-mono text-bone-dim py-2 text-center">No inactive members.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-line/30 flex justify-end shrink-0">
          <button onClick={onClose} className="btn-secondary px-6 py-2">Close Dashboard</button>
        </div>
      </motion.div>
    </div>
  );
}
