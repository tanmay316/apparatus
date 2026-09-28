import { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { ArrowRight, ChevronRight } from 'lucide-react';

const KNOB = 60;
const PAD = 6;

/**
 * Text-less swipe-to-start pill. Drag the knob past ~85% of the track to
 * trigger `onComplete`; otherwise it springs back. Enter/Space also start.
 * Colours come from the CardioTracker theme vars (--card, --border, --sienna, --muted).
 */
export function SwipeToStart({ onComplete, disabled = false }: { onComplete: () => void; disabled?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackW, setTrackW] = useState(0);
  const [done, setDone] = useState(false);
  const x = useMotionValue(0);
  const maxX = Math.max(0, trackW - KNOB - PAD * 2);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setTrackW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const progress = useTransform(x, (v) => (maxX > 0 ? Math.min(1, Math.max(0, v / maxX)) : 0));
  const chevronOpacity = useTransform(progress, [0, 0.5], [1, 0]);
  // scaleX keeps the trail on the compositor (no layout/paint per frame).
  const fillScale = useTransform(x, (v) => (trackW > 0 ? Math.min(1, (v + KNOB + PAD * 2) / trackW) : 0));

  const complete = () => {
    if (done || disabled) return;
    setDone(true);
    animate(x, maxX, { duration: 0.16, ease: [0.2, 0.8, 0.2, 1] });
    window.setTimeout(onComplete, 170);
  };

  const handleDragEnd = () => {
    if (done) return;
    if (maxX > 0 && x.get() >= maxX * 0.65) complete();
    else animate(x, 0, { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] });
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Swipe to start"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={done ? 100 : 0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
          e.preventDefault();
          complete();
        }
      }}
      className="swipe-start-track relative w-full max-w-[340px] mx-auto rounded-full select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[var(--sienna)]"
      style={{ height: KNOB + PAD * 2, touchAction: 'pan-y', opacity: disabled ? 0.6 : 1, transform: 'translateZ(0)' }}
    >
      {/* Progress trail */}
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{ scaleX: fillScale, originX: 0, background: 'var(--sienna)', opacity: 0.16, willChange: 'transform' }}
      />

      {/* Animated chevrons */}
      <motion.div
        className="absolute right-6 top-0 bottom-0 flex items-center pointer-events-none"
        style={{ opacity: chevronOpacity }}
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="-ml-2 flex"
            style={{ color: 'var(--sienna)' }}
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
          >
            <ChevronRight size={22} strokeWidth={2.6} />
          </motion.span>
        ))}
      </motion.div>

      {/* Knob */}
      <motion.div
        drag={done || disabled ? false : 'x'}
        dragConstraints={{ left: 0, right: maxX }}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        className="absolute top-0 flex items-center justify-center rounded-full cursor-grab active:cursor-grabbing"
        style={{
          x,
          left: PAD,
          top: PAD,
          width: KNOB,
          height: KNOB,
          background: 'var(--sienna)',
          color: '#fff',
          boxShadow: '0 6px 16px rgba(235, 89, 60, 0.35)',
          touchAction: 'none',
          willChange: 'transform',
        }}
      >
        <ArrowRight size={26} strokeWidth={2.6} />
      </motion.div>
    </div>
  );
}
