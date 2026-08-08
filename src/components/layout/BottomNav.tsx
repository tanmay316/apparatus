import React, { useRef, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Dumbbell, Apple, TrendingUp, Users, Navigation, Zap, Footprints, Bike, X, ChevronRight, MapPin, ArrowRight } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isToday, isYesterday, format } from 'date-fns';
import type { Activity } from '@/types';

const TABS = [
  { id: "home", path: "/", label: "Home", icon: Dumbbell },
  { id: "nutrition", path: "/nutrition", label: "Nutrition", icon: Apple },
  { id: "action", path: "#", label: "Start", icon: MapPin }, // Center action
  { id: "progress", path: "/progress", label: "Progress", icon: TrendingUp },
  { id: "community", path: "/communities", label: "Community", icon: Users },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { user } = useAuthStore();
  const workoutStore = useWorkoutStore();
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);

  useEffect(() => {
    if (sheetOpen && user) {
      const q = query(
        collection(db, 'activities'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(2)
      );
      getDocs(q).then(snap => {
        setRecentActivities(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Activity));
      }).catch(console.error);
    }
  }, [sheetOpen, user]);

  const formatActivityDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = new Date(timestamp.seconds * 1000);
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'EEEE');
  };

  const isWorkoutRoute = location.pathname.startsWith("/workout/") || location.pathname.startsWith("/cardio");

  const activeIndex = useMemo(() => {
    const index = TABS.findIndex((tab) => {
      if (tab.id === "action") return false;
      if (tab.id === "home") return location.pathname === "/";
      if (tab.id === "community")
        return location.pathname.startsWith("/communities");
      return location.pathname.startsWith(tab.path);
    });
    return index;
  }, [location.pathname]);

  // Removed line width effect since we are stacking icon and text vertically.

  const handleActionClick = (path: string) => {
    setSheetOpen(false);
    navigate(path);
  };

  if (isWorkoutRoute) return null;

  return (
    <>
      <style>{`
        .nav-tab-icon-active { color: #5d2a1a; }
        .dark .nav-tab-icon-active { color: #ffffff; }
        .nav-tab-icon-inactive { color: rgba(93, 42, 26, 0.7); }
        .dark .nav-tab-icon-inactive { color: rgba(255, 255, 255, 0.6); }
      `}</style>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-[420px] z-[200]">
        <nav
          className="bg-gradient-to-r from-[#5d2a1a]/10 to-[#d9a441]/10 dark:from-ink-2/90 dark:to-ink/90 backdrop-blur-xl border border-[#5d2a1a]/20 dark:border-white/20 rounded-[32px] shadow-2xl p-2"
          style={
            { "--component-active-color": "var(--sienna)" } as React.CSSProperties
          }
        >
          <div className="flex items-center justify-between h-[64px] relative gap-1">
            {TABS.map((tab, index) => {
              const isAction = tab.id === "action";
              const isActive = index === activeIndex;
              const IconComponent = tab.icon;

              if (isAction) {
                return (
                  <div key={tab.id} className="flex-1 flex items-center justify-center h-full">
                    <button
                      onClick={() => setSheetOpen(true)}
                      className={`relative flex flex-col items-center justify-center w-full h-full rounded-[24px] transition-all duration-300 active:scale-95 border border-transparent ${sheetOpen
                          ? "bg-black/10 dark:bg-white/20 border-black/10 dark:border-white/40"
                          : "hover:bg-black/5 dark:hover:bg-white/10"
                        }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-sienna flex items-center justify-center text-white shadow-lg">
                        <IconComponent size={20} strokeWidth={2.5} />
                      </div>
                    </button>
                  </div>
                );
              }

              return (
                <div key={tab.id} className="flex-1 flex items-center justify-center h-full">
                  <Link
                    to={tab.path}
                    className={`relative flex flex-col items-center justify-center w-full h-full rounded-[28px] transition-all duration-300 ease-out border ${isActive
                      ? "bg-white/40 dark:bg-white/15 border-sienna dark:border-white/30 shadow-[0_2px_10px_rgba(0,0,0,0.05)] dark:shadow-[0_0_15px_rgba(255,255,255,0.1)] nav-tab-icon-active"
                      : "bg-transparent border-transparent hover:bg-black/5 dark:hover:bg-white/5 nav-tab-icon-inactive"
                      }`}
                  >
                    <IconComponent
                      size={20}
                      strokeWidth={isActive ? 2.5 : 2}
                      className="transition-all duration-300 mb-0.5"
                    />
                    <span
                      className="text-[10px] font-sans font-medium tracking-wide transition-all duration-300"
                    >
                      {tab.label}
                    </span>
                  </Link>
                </div>
              );
            })}
          </div>
        </nav>
      </div>

      <AnimatePresence>
        {sheetOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSheetOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[290] touch-none"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 z-[300] bg-white dark:bg-ink rounded-t-3xl p-6 max-w-[600px] mx-auto shadow-[0_-10px_40px_rgba(0,0,0,0.2)] max-h-[90vh] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="font-mono text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                  Start Activity
                </div>
                <button
                  onClick={() => setSheetOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <h3 className="font-serif text-[28px] font-medium tracking-tight text-[#17191c] dark:text-bone mb-6">
                What are you doing today?
              </h3>

              <div className="flex flex-col gap-3">
                {/* Active Workout Quick Continue */}
                {workoutStore.isActive && (
                  <button
                    onClick={() => handleActionClick('/workout/tracking')}
                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-[#17191c] dark:bg-white text-white dark:text-black hover:scale-[1.01] transition-transform active:scale-95 text-left mb-2 shadow-md"
                  >
                    <div>
                      <h4 className="font-serif text-lg font-bold">Continue Workout</h4>
                      <p className="text-sm font-sans text-gray-400 dark:text-gray-600">
                        {workoutStore.planTitle} • {workoutStore.dayTitle}
                      </p>
                    </div>
                    <div className="px-4 py-2 rounded-full bg-white/10 dark:bg-black/5 text-xs font-bold uppercase tracking-wider">
                      Continue
                    </div>
                  </button>
                )}

                {/* Workout */}
                <button
                  onClick={() => handleActionClick('/plans')}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-left group"
                >
                  <div className="w-12 h-12 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
                    <Dumbbell size={22} className="group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[17px] text-bone tracking-tight">Weight Training</h4>
                    <p className="text-[13px] text-bone-dim">Log sets, reps & PRs</p>
                  </div>
                  <ChevronRight size={20} className="text-gray-300 dark:text-gray-600 group-hover:text-gray-500" />
                </button>

                {/* Run */}
                <button
                  onClick={() => handleActionClick('/cardio?type=run')}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-left group"
                >
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                    <Zap size={22} className="group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[17px] text-bone tracking-tight">Run</h4>
                    <p className="text-[13px] text-bone-dim">GPS • Pace • Distance</p>
                  </div>
                  <ChevronRight size={20} className="text-gray-300 dark:text-gray-600 group-hover:text-gray-500" />
                </button>

                {/* Walk */}
                <button
                  onClick={() => handleActionClick('/cardio?type=walk')}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-left group"
                >
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                    <Footprints size={22} className="group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[17px] text-bone tracking-tight">Walk</h4>
                    <p className="text-[13px] text-bone-dim">Walking & Hiking</p>
                  </div>
                  <ChevronRight size={20} className="text-gray-300 dark:text-gray-600 group-hover:text-gray-500" />
                </button>

                {/* Ride */}
                <button
                  onClick={() => handleActionClick('/cardio?type=cycle')}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-left group"
                >
                  <div className="w-12 h-12 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
                    <Bike size={22} className="group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[17px] text-bone tracking-tight">Ride</h4>
                    <p className="text-[13px] text-bone-dim">Cycling • Speed • Route</p>
                  </div>
                  <ChevronRight size={20} className="text-gray-300 dark:text-gray-600 group-hover:text-gray-500" />
                </button>
              </div>

              {/* Recent */}
              {recentActivities.length > 0 && (
                <div className="mt-8">
                  <h4 className="font-mono text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3 px-1">
                    Recent
                  </h4>
                  <div className="flex flex-col gap-2">
                    {recentActivities.map(act => (
                      <div key={act.id} className="flex items-center justify-between p-3 rounded-xl bg-[#fdfbfb] dark:bg-white/5 border border-[#ececec] dark:border-white/10">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">
                            {act.type === 'walk' ? '🚶' : act.type === 'run' ? '🏃' : act.type === 'cycle' ? '🚴' : '🏋️'}
                          </span>
                          <span className="font-sans font-semibold text-sm text-[#17191c] dark:text-bone truncate max-w-[200px]">
                            {act.summary}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-gray-400 shrink-0">
                          {formatActivityDate(act.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="h-6" /> {/* safe area spacing */}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
