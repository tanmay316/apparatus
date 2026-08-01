import React, { useRef, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Dumbbell, BookOpen, Apple, TrendingUp, Users } from 'lucide-react';

const TABS = [
  { id: 'home', path: '/', label: 'Home', icon: Dumbbell },
  { id: 'plans', path: '/plans', label: 'Plans', icon: BookOpen },
  { id: 'nutrition', path: '/nutrition', label: 'Nutrition', icon: Apple },
  { id: 'progress', path: '/progress', label: 'Progress', icon: TrendingUp },
  { id: 'community', path: '/communities', label: 'Community', icon: Users },
];

export function BottomNav() {
  const location = useLocation();

  const isWorkoutRoute = location.pathname.startsWith('/workout/');
  if (isWorkoutRoute) return null;

  const activeIndex = useMemo(() => {
    const index = TABS.findIndex((tab) => {
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

      if (activeItemElement && activeTextElement) {
        // Use scrollWidth to get the true width of the text even if it's visually hidden
        const textWidth = activeTextElement.scrollWidth;
        activeItemElement.style.setProperty('--lineWidth', `${textWidth}px`);
      }
    };

    // Small delay to ensure fonts are loaded and DOM is ready
    const timer = setTimeout(setLineWidth, 50);

    window.addEventListener('resize', setLineWidth);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', setLineWidth);
    };
  }, [activeIndex]);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[200] bg-white/90 border-t border-[#ececec] backdrop-blur-xl pb-safe"
      style={{ '--component-active-color': 'var(--sienna)' } as React.CSSProperties}
    >
      <div className="flex items-center justify-around h-[64px] max-w-[600px] mx-auto px-4">
        {TABS.map((tab, index) => {
          const isActive = index === activeIndex;
          const IconComponent = tab.icon;
          const href = tab.path;

          return (
            <Link
              key={tab.id}
              to={href}
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
  );
}
