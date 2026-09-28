import React, { useRef, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Dumbbell, Apple, TrendingUp, Users, Navigation, Zap, Footprints, Bike, X, ChevronRight, MapPin, ArrowRight, Activity as ActivityIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useCardioStore } from '@/stores/cardio-store';
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
  { id: "community", path: "/community", label: "Community", icon: Users },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { user } = useAuthStore();
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);

  const cardioStore = useCardioStore();
  const workoutStore = useWorkoutStore();

  const isCardioActive = cardioStore.isTracking;
  const activeCardioType = cardioStore.activityType; // 'walk' | 'run' | 'cycle'
  const isWorkoutActive = workoutStore.isActive;
  const hasActiveSession = isCardioActive || isWorkoutActive;

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

  const mainPages = ["/", "/nutrition", "/progress", "/community", "/plans", "/explore"];
  const isHiddenRoute = !mainPages.includes(location.pathname);

  const activeIndex = useMemo(() => {
    const index = TABS.findIndex((tab) => {
      if (tab.id === "action") return false;
      if (tab.id === "home") return location.pathname === "/";
      if (tab.id === "community")
        return location.pathname.startsWith("/community");
      return location.pathname.startsWith(tab.path);
    });
    return index;
  }, [location.pathname]);

  const handleActionClick = (path: string) => {
    setSheetOpen(false);
    navigate(path);
  };

  if (isHiddenRoute) return null;

  return (
    <>
      <style>{`
        .bottom-app-nav {
          background: #ffffff;
          border: 1px solid rgba(23, 25, 28, 0.07);
          box-shadow: 0 12px 32px -10px rgba(23, 25, 28, 0.22), 0 2px 8px rgba(23, 25, 28, 0.06);
        }
        .bn-tab { color: #7a7e88; -webkit-tap-highlight-color: transparent; }
        .bn-tab .bn-pill { transition: background-color .2s ease, transform .2s ease; }
        .bn-tab[aria-current='page'] { color: rgb(var(--color-sienna)); }
        .bn-tab[aria-current='page'] .bn-pill { background: rgb(var(--color-sienna) / 0.1); }
        .bn-tab:active .bn-pill { transform: scale(0.92); }
        [data-theme='dark'] .bn-tab { color: #b99a8a; }
        [data-theme='dark'] .bn-tab[aria-current='page'] { color: #ffd1b5; }
        [data-theme='dark'] .bn-tab[aria-current='page'] .bn-pill { background: rgba(239, 173, 128, 0.16); }

        @keyframes pulseActiveGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(4, 120, 87, 0.5); }
          50% { box-shadow: 0 0 0 6px rgba(4, 120, 87, 0); }
        }
        .animate-active-glow {
          animation: pulseActiveGlow 2s infinite ease-in-out;
        }
      `}</style>
      <div className="bottom-nav-shell fixed bottom-[calc(env(safe-area-inset-bottom,0px)+10px)] left-1/2 -translate-x-1/2 w-[calc(100%-24px)] max-w-[440px] z-[500]">
        <nav
          className="bottom-app-nav rounded-[26px] px-1.5 py-1.5"
          aria-label="Primary"
        >
          <div className="flex items-center justify-between h-[60px] relative">
            {TABS.map((tab, index) => {
              const isAction = tab.id === "action";
              const isActive = index === activeIndex;
              const IconComponent = tab.icon;

              if (isAction) {
                return (
                  <div key={tab.id} className="flex-1 flex items-center justify-center h-full">
                    <button
                      onClick={() => setSheetOpen(true)}
                      aria-label="Start activity"
                      className="relative flex items-center justify-center w-full h-full active:scale-95 transition-transform"
                    >
                      <span
                        className={`relative w-12 h-12 rounded-full flex items-center justify-center ${hasActiveSession ? 'bg-emerald-700 text-white animate-active-glow' : 'bg-sienna'}`}
                        style={hasActiveSession ? undefined : { boxShadow: '0 6px 16px -4px rgb(var(--color-sienna) / 0.55)' }}
                      >
                        <IconComponent size={21} strokeWidth={2.4} />
                        {hasActiveSession && (
                          <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-70"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-600 border-2 border-white"></span>
                          </span>
                        )}
                      </span>
                    </button>
                  </div>
                );
              }

              return (
                <div key={tab.id} className="flex-1 flex items-center justify-center h-full min-w-0">
                  <Link
                    to={tab.path}
                    aria-current={isActive ? 'page' : undefined}
                    className="bn-tab flex flex-col items-center justify-center gap-1 w-full h-full min-w-0"
                  >
                    <span className="bn-pill flex items-center justify-center w-14 h-8 rounded-full">
                      <IconComponent size={21} strokeWidth={isActive ? 2.4 : 2} />
                    </span>
                    <span className={`text-[10.5px] leading-none tracking-tight truncate ${isActive ? 'font-semibold' : 'font-medium'}`}>
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
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[510] touch-none"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 z-[520] bg-white dark:bg-ink rounded-t-3xl p-6 max-w-[600px] mx-auto shadow-[0_-10px_40px_rgba(0,0,0,0.2)] max-h-[90vh] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="font-mono text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                  <ActivityIcon size={12} className="text-sienna" /> Start Activity
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
                {/* Workout / Weight Training */}
                {(() => {
                  const isThisActive = isWorkoutActive;
                  return (
                    <button
                      onClick={() => {
                        if (isThisActive && workoutStore.planId && workoutStore.dayId) {
                          handleActionClick(`/workout/${workoutStore.planId}/day/${workoutStore.dayId}`);
                        } else {
                          handleActionClick('/plans');
                        }
                      }}
                      className={`relative flex items-center gap-4 p-4 rounded-2xl transition-all text-left group overflow-hidden ${
                        isThisActive
                          ? "bg-emerald-500/15 dark:bg-emerald-500/20 border-2 border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.35)] animate-pulse"
                          : "bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-transparent"
                      }`}
                    >
                      {isThisActive && (
                        <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-emerald-500/20 rounded-full blur-xl pointer-events-none" />
                      )}
                      <div className={`relative w-8 h-12 flex items-center justify-center shrink-0 ${
                        isThisActive ? "text-emerald-500" : "text-orange-500"
                      }`}>
                        <Dumbbell size={22} className={isThisActive ? "animate-pulse" : ""} />
                        {isThisActive && (
                          <span className="absolute top-2 -right-1 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-[17px] text-bone tracking-tight">Weight Training</h4>
                          {isThisActive && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-black uppercase bg-emerald-500 text-white shadow-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span> Live Active
                            </span>
                          )}
                        </div>
                        <p className={`text-[13px] ${isThisActive ? "text-emerald-600 dark:text-emerald-300 font-semibold" : "text-bone-dim"}`}>
                          {isThisActive ? "Workout in progress" : "Log sets, reps & PRs"}
                        </p>
                      </div>
                      {isThisActive ? (
                        <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-mono text-xs font-bold shrink-0">
                          Resume <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                        </div>
                      ) : (
                        <ChevronRight size={20} className="text-gray-300 dark:text-gray-600 group-hover:text-gray-500" />
                      )}
                    </button>
                  );
                })()}

                {/* Run */}
                {(() => {
                  const isThisActive = isCardioActive && activeCardioType === 'run';
                  return (
                    <button
                      onClick={() => handleActionClick(isThisActive ? '/cardio' : '/cardio?type=run')}
                      className={`relative flex items-center gap-4 p-4 rounded-2xl transition-all text-left group overflow-hidden ${
                        isThisActive
                          ? "bg-emerald-500/15 dark:bg-emerald-500/20 border-2 border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.35)] animate-pulse"
                          : "bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-transparent"
                      }`}
                    >
                      {isThisActive && (
                        <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-emerald-500/20 rounded-full blur-xl pointer-events-none" />
                      )}
                      <div className={`relative w-8 h-12 flex items-center justify-center shrink-0 ${
                        isThisActive ? "text-emerald-500" : "text-blue-500"
                      }`}>
                        <Zap size={22} className={isThisActive ? "animate-pulse" : ""} />
                        {isThisActive && (
                          <span className="absolute top-2 -right-1 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-[17px] text-bone tracking-tight">Run</h4>
                          {isThisActive && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-black uppercase bg-emerald-500 text-white shadow-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span> Live Active
                            </span>
                          )}
                        </div>
                        <p className={`text-[13px] ${isThisActive ? "text-emerald-600 dark:text-emerald-300 font-semibold" : "text-bone-dim"}`}>
                          {isThisActive ? "Running in progress" : "GPS • Pace • Distance"}
                        </p>
                      </div>
                      {isThisActive ? (
                        <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-mono text-xs font-bold shrink-0">
                          Resume <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                        </div>
                      ) : (
                        <ChevronRight size={20} className="text-gray-300 dark:text-gray-600 group-hover:text-gray-500" />
                      )}
                    </button>
                  );
                })()}

                {/* Walk */}
                {(() => {
                  const isThisActive = isCardioActive && activeCardioType === 'walk';
                  return (
                    <button
                      onClick={() => handleActionClick(isThisActive ? '/cardio' : '/cardio?type=walk')}
                      className={`relative flex items-center gap-4 p-4 rounded-2xl transition-all text-left group overflow-hidden ${
                        isThisActive
                          ? "bg-emerald-500/15 dark:bg-emerald-500/20 border-2 border-emerald-500 shadow-[0_0_25px_rgba(10,185,129,0.35)] animate-pulse"
                          : "bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-transparent"
                      }`}
                    >
                      {isThisActive && (
                        <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-emerald-500/20 rounded-full blur-xl pointer-events-none" />
                      )}
                      <div className={`relative w-8 h-12 flex items-center justify-center shrink-0 ${
                        isThisActive ? "text-emerald-500" : "text-emerald-500"
                      }`}>
                        <Footprints size={22} className={isThisActive ? "animate-pulse" : ""} />
                        {isThisActive && (
                          <span className="absolute top-2 -right-1 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-[17px] text-bone tracking-tight">Walk</h4>
                          {isThisActive && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-black uppercase bg-emerald-500 text-white shadow-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span> Live Active
                            </span>
                          )}
                        </div>
                        <p className={`text-[13px] ${isThisActive ? "text-emerald-600 dark:text-emerald-300 font-semibold" : "text-bone-dim"}`}>
                          {isThisActive ? "Walking in progress" : "Walking & Hiking"}
                        </p>
                      </div>
                      {isThisActive ? (
                        <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-mono text-xs font-bold shrink-0">
                          Resume <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                        </div>
                      ) : (
                        <ChevronRight size={20} className="text-gray-300 dark:text-gray-600 group-hover:text-gray-500" />
                      )}
                    </button>
                  );
                })()}

                {/* Ride */}
                {(() => {
                  const isThisActive = isCardioActive && activeCardioType === 'cycle';
                  return (
                    <button
                      onClick={() => handleActionClick(isThisActive ? '/cardio' : '/cardio?type=cycle')}
                      className={`relative flex items-center gap-4 p-4 rounded-2xl transition-all text-left group overflow-hidden ${
                        isThisActive
                          ? "bg-emerald-500/15 dark:bg-emerald-500/20 border-2 border-emerald-500 shadow-[0_0_25px_rgba(10,185,129,0.35)] animate-pulse"
                          : "bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-transparent"
                      }`}
                    >
                      {isThisActive && (
                        <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-emerald-500/20 rounded-full blur-xl pointer-events-none" />
                      )}
                      <div className={`relative w-8 h-12 flex items-center justify-center shrink-0 ${
                        isThisActive ? "text-emerald-500" : "text-purple-500"
                      }`}>
                        <Bike size={22} className={isThisActive ? "animate-pulse" : ""} />
                        {isThisActive && (
                          <span className="absolute top-2 -right-1 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-[17px] text-bone tracking-tight">Ride</h4>
                          {isThisActive && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-black uppercase bg-emerald-500 text-white shadow-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span> Live Active
                            </span>
                          )}
                        </div>
                        <p className={`text-[13px] ${isThisActive ? "text-emerald-600 dark:text-emerald-300 font-semibold" : "text-bone-dim"}`}>
                          {isThisActive ? "Cycling in progress" : "Speed • Route • Elevation"}
                        </p>
                      </div>
                      {isThisActive ? (
                        <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-mono text-xs font-bold shrink-0">
                          Resume <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                        </div>
                      ) : (
                        <ChevronRight size={20} className="text-gray-300 dark:text-gray-600 group-hover:text-gray-500" />
                      )}
                    </button>
                  );
                })()}
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
