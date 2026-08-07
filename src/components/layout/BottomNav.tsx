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

  const isWorkoutRoute = location.pathname.startsWith("/workout/");
  if (isWorkoutRoute) return null;

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

  const textRefs = useRef<(HTMLElement | null)[]>([]);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  useEffect(() => {
    const setLineWidth = () => {
      const activeItemElement = itemRefs.current[activeIndex];
      const activeTextElement = textRefs.current[activeIndex];

      if (activeItemElement && activeTextElement && activeIndex !== -1) {
        const textWidth = activeTextElement.scrollWidth;
        activeItemElement.style.setProperty("--lineWidth", `${textWidth}px`);
      }
    };

    const timer = setTimeout(setLineWidth, 50);
    window.addEventListener("resize", setLineWidth);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", setLineWidth);
    };
  }, [activeIndex]);

  const handleActionClick = (path: string) => {
    setSheetOpen(false);
    navigate(path);
  };

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-[200] bg-white border-t border-[#ececec] pb-safe shadow-lg"
        style={
          { "--component-active-color": "var(--sienna)" } as React.CSSProperties
        }
      >
        <div className="flex items-center justify-around h-[64px] max-w-[600px] mx-auto px-4 relative">
          {TABS.map((tab, index) => {
            const isAction = tab.id === "action";
            const isActive = index === activeIndex;
            const IconComponent = tab.icon;

            if (isAction) {
              return (
                <button
                  key={tab.id}
                  onClick={() => setSheetOpen(true)}
                  className={`relative flex items-center justify-center w-12 h-12 rounded-full transition-transform active:scale-95 ${
                    sheetOpen
                      ? "bg-sienna text-white shadow-md"
                      : "bg-transparent text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  <IconComponent size={24} strokeWidth={sheetOpen ? 2.5 : 2} />
                </button>
              );
            }

            return (
              <Link
                key={tab.id}
                to={tab.path}
                ref={(el) => (itemRefs.current[index] = el)}
                className={`relative flex items-center justify-center h-11 px-4 rounded-full transition-all duration-300 ease-out border-none ${
                  isActive
                    ? "bg-white shadow-[inset_3px_3px_8px_rgba(0,0,0,0.05),inset_-3px_-3px_8px_rgba(255,255,255,1)] text-[#5d2a1a]"
                    : "text-gray-400 hover:text-gray-600 bg-white shadow-[3px_3px_8px_rgba(0,0,0,0.05),-3px_-3px_8px_rgba(255,255,255,1)]"
                }`}
                style={{ "--lineWidth": "0px" } as React.CSSProperties}
              >
                <div className="flex items-center justify-center shrink-0">
                  <IconComponent
                    size={20}
                    strokeWidth={isActive ? 2.5 : 2}
                    className="transition-all duration-300"
                  />
                </div>
                <strong
                  ref={(el) => (textRefs.current[index] = el)}
                  className="font-sans text-[12px] font-bold tracking-wide whitespace-nowrap transition-all duration-300 ease-out"
                  style={{
                    width: isActive ? "var(--lineWidth)" : "0px",
                    opacity: isActive ? 1 : 0,
                    marginLeft: isActive ? "6px" : "0px",
                    overflow: "hidden",
                    display: "inline-block",
                  }}
                >
                  {tab.label}
                </strong>
              </Link>
            );
          })}
        </div>
      </nav>

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
                  className="flex items-center gap-4 p-4 rounded-2xl bg-[#FFF3ED] dark:bg-orange-950/40 hover:scale-[1.01] transition-transform active:scale-95 text-left"
                >
                  <div className="w-12 h-12 rounded-full bg-white dark:bg-orange-900/50 text-orange-500 flex items-center justify-center shrink-0 shadow-sm">
                    <Dumbbell size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[17px] text-[#5d2a1a] dark:text-orange-100 tracking-tight">Workout</h4>
                    <p className="text-[13px] text-orange-900/60 dark:text-orange-200/60 font-sans">Log sets, reps & PRs</p>
                  </div>
                  <ArrowRight size={20} className="text-orange-500/50" />
                </button>

                {/* Run */}
                <button
                  onClick={() => handleActionClick('/cardio?type=run')}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-[#EEF8FF] dark:bg-blue-950/40 hover:scale-[1.01] transition-transform active:scale-95 text-left"
                >
                  <div className="w-12 h-12 rounded-full bg-white dark:bg-blue-900/50 text-blue-500 flex items-center justify-center shrink-0 shadow-sm">
                    <Zap size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[17px] text-blue-950 dark:text-blue-100 tracking-tight">Run</h4>
                    <p className="text-[13px] text-blue-900/60 dark:text-blue-200/60 font-sans">GPS • Pace • Distance</p>
                  </div>
                  <ArrowRight size={20} className="text-blue-500/50" />
                </button>

                {/* Walk */}
                <button
                  onClick={() => handleActionClick('/cardio?type=walk')}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-[#ECFFF7] dark:bg-emerald-950/40 hover:scale-[1.01] transition-transform active:scale-95 text-left"
                >
                  <div className="w-12 h-12 rounded-full bg-white dark:bg-emerald-900/50 text-emerald-500 flex items-center justify-center shrink-0 shadow-sm">
                    <Footprints size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[17px] text-emerald-950 dark:text-emerald-100 tracking-tight">Walk</h4>
                    <p className="text-[13px] text-emerald-900/60 dark:text-emerald-200/60 font-sans">Walking & Hiking</p>
                  </div>
                  <ArrowRight size={20} className="text-emerald-500/50" />
                </button>

                {/* Ride */}
                <button
                  onClick={() => handleActionClick('/cardio?type=cycle')}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-[#F5EEFF] dark:bg-purple-950/40 hover:scale-[1.01] transition-transform active:scale-95 text-left"
                >
                  <div className="w-12 h-12 rounded-full bg-white dark:bg-purple-900/50 text-purple-500 flex items-center justify-center shrink-0 shadow-sm">
                    <Bike size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[17px] text-purple-950 dark:text-purple-100 tracking-tight">Ride</h4>
                    <p className="text-[13px] text-purple-900/60 dark:text-purple-200/60 font-sans">Cycling • Speed • Route</p>
                  </div>
                  <ArrowRight size={20} className="text-purple-500/50" />
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
