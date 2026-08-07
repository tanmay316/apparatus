import React, { useRef, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Dumbbell, Apple, TrendingUp, Users, Navigation, Zap, Footprints, Bike, X, ChevronRight, MapPin } from 'lucide-react';

const TABS = [
  { id: 'home', path: '/', label: 'Home', icon: Dumbbell },
  { id: 'nutrition', path: '/nutrition', label: 'Nutrition', icon: Apple },
  { id: 'action', path: '#', label: 'Start', icon: MapPin }, // Center action
  { id: 'progress', path: '/progress', label: 'Progress', icon: TrendingUp },
  { id: 'community', path: '/communities', label: 'Community', icon: Users },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isWorkoutRoute = location.pathname.startsWith('/workout/');
  if (isWorkoutRoute) return null;

  const activeIndex = useMemo(() => {
    const index = TABS.findIndex((tab) => {
      if (tab.id === 'action') return false;
      if (tab.id === 'home') return location.pathname === '/';
      if (tab.id === 'community') return location.pathname.startsWith('/communities');
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
        activeItemElement.style.setProperty('--lineWidth', `${textWidth}px`);
      }
    };

    const timer = setTimeout(setLineWidth, 50);
    window.addEventListener('resize', setLineWidth);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', setLineWidth);
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
        style={{ '--component-active-color': 'var(--sienna)' } as React.CSSProperties}
      >
        <div className="flex items-center justify-around h-[64px] max-w-[600px] mx-auto px-4 relative">
          {TABS.map((tab, index) => {
            const isAction = tab.id === 'action';
            const isActive = index === activeIndex;
            const IconComponent = tab.icon;

            if (isAction) {
              return (
                <button
                  key={tab.id}
                  onClick={() => setSheetOpen(true)}
                  className={`relative flex items-center justify-center w-12 h-12 rounded-full transition-transform active:scale-95 ${
                    sheetOpen 
                      ? 'bg-sienna text-white shadow-md'
                      : 'bg-transparent text-gray-500 hover:bg-gray-100'
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
                    ? 'bg-white shadow-[inset_3px_3px_8px_rgba(0,0,0,0.05),inset_-3px_-3px_8px_rgba(255,255,255,1)] text-[#5d2a1a]' 
                    : 'text-gray-400 hover:text-gray-600 bg-white shadow-[3px_3px_8px_rgba(0,0,0,0.05),-3px_-3px_8px_rgba(255,255,255,1)]'
                }`}
                style={{ '--lineWidth': '0px' } as React.CSSProperties}
              >
                <div className="flex items-center justify-center shrink-0">
                  <IconComponent size={20} strokeWidth={isActive ? 2.5 : 2} className="transition-all duration-300" />
                </div>
                <strong
                  ref={(el) => (textRefs.current[index] = el)}
                  className="font-sans text-[12px] font-bold tracking-wide whitespace-nowrap transition-all duration-300 ease-out"
                  style={{
                    width: isActive ? 'var(--lineWidth)' : '0px',
                    opacity: isActive ? 1 : 0,
                    marginLeft: isActive ? '6px' : '0px',
                    overflow: 'hidden',
                    display: 'inline-block'
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
              className="fixed bottom-0 left-0 right-0 z-[300] bg-gradient-to-b from-slate-50 to-white dark:from-ink-2 dark:to-ink rounded-t-3xl p-6 max-w-[600px] mx-auto shadow-[0_-10px_40px_rgba(0,0,0,0.2)]"
            >
              <div className="flex items-center justify-between mb-8 px-2">
                <h3 className="font-serif text-2xl font-medium tracking-tight text-bone">Start Activity</h3>
                <button
                  onClick={() => setSheetOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-200/50 dark:bg-white/10 flex items-center justify-center text-slate-500 hover:text-bone transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleActionClick('/cardio?type=run')}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-left group"
                >
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                    <Zap size={22} className="group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[17px] text-bone tracking-tight">Running</h4>
                    <p className="text-[13px] text-bone-dim">Track pace, distance & route</p>
                  </div>
                  <ChevronRight size={20} className="text-gray-300 dark:text-gray-600 group-hover:text-gray-500" />
                </button>

                <button
                  onClick={() => handleActionClick('/cardio?type=walk')}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-left group"
                >
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                    <Footprints size={22} className="group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[17px] text-bone tracking-tight">Walking</h4>
                    <p className="text-[13px] text-bone-dim">Casual walk or hike tracking</p>
                  </div>
                  <ChevronRight size={20} className="text-gray-300 dark:text-gray-600 group-hover:text-gray-500" />
                </button>

                <button
                  onClick={() => handleActionClick('/cardio?type=cycle')}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-left group"
                >
                  <div className="w-12 h-12 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
                    <Bike size={22} className="group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[17px] text-bone tracking-tight">Cycling</h4>
                    <p className="text-[13px] text-bone-dim">Track speed, elevation & map</p>
                  </div>
                  <ChevronRight size={20} className="text-gray-300 dark:text-gray-600 group-hover:text-gray-500" />
                </button>

                <div className="h-px bg-gray-100 dark:bg-white/10 w-full my-2" />

                <button
                  onClick={() => handleActionClick('/plans')}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-left group"
                >
                  <div className="w-12 h-12 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
                    <Dumbbell size={22} className="group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[17px] text-bone tracking-tight">Weight Training</h4>
                    <p className="text-[13px] text-bone-dim">Log sets, reps & volume</p>
                  </div>
                  <ChevronRight size={20} className="text-gray-300 dark:text-gray-600 group-hover:text-gray-500" />
                </button>
              </div>
              <div className="h-6" /> {/* safe area spacing */}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
