import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Check, Share2, LocateFixed, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { toCanvas } from 'html-to-image';
import { RouteMap, MAP_THEMES, type MapThemeKey } from '@/components/cardio/RouteMap';
import type { RoutePoint } from '@/types';

export interface CardioShareData {
  type: 'walk' | 'run' | 'cycle';
  date: string;
  distanceKm: number;
  durationSec: number;
  calories: number;
  avgPace: string;
  avgSpeedKmh?: number;
  maxSpeedKmh?: number;
  elevationGainM?: number;
  route?: RoutePoint[];
  currentLocation?: { lat: number; lng: number } | null;
  steps?: number;
}

interface Props {
  data: CardioShareData;
  mapTheme?: MapThemeKey;
  onClose: () => void;
}

function formatDuration(sec: number): string {
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

type ShareLayout = 
  | 'map-stats' | 'map-distance' | 'map-only' | 'map-path-only'
  | 'path-stats' | 'path-distance' | 'path-only' | 'path-only-nomarker'
  | 'stats-only'
  | 'polaroid-transparent'
  | 'a-shape' | 'a-shape-transparent';

const LAYOUTS: ShareLayout[] = [
  'map-stats', 'map-distance', 'map-only', 'map-path-only',
  'path-stats', 'path-distance', 'path-only', 'path-only-nomarker',
  'stats-only', 
  'polaroid-transparent',
  'a-shape', 'a-shape-transparent'
];

const AVAILABLE_THEMES = Object.keys(MAP_THEMES) as MapThemeKey[];

export function CardioShareModal({ data, mapTheme = 'street', onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [didCopy, setDidCopy] = useState(false);
  const [layoutIndex, setLayoutIndex] = useState(0);
  const [selectedTheme, setSelectedTheme] = useState<MapThemeKey>(mapTheme === 'dark' ? 'dark' : mapTheme as MapThemeKey);
  
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [pathColor, setPathColor] = useState('gradient');
  const [textColor, setTextColor] = useState('orange');

  const typeLabel = data.type === 'walk' ? 'WALK' : data.type === 'run' ? 'RUN' : 'RIDE';
  const displayDate = format(new Date(data.date), 'EEEE, MMM d, yyyy');
  
  const PATH_COLORS = [
    { id: 'gradient', bg: 'bg-gradient-to-r from-[#fbbf24] via-[#f43f5e] to-[#a855f7]' },
    { id: '#f97316', bg: 'bg-orange-500' },
    { id: '#3b82f6', bg: 'bg-blue-500' },
    { id: '#10b981', bg: 'bg-emerald-500' },
    { id: '#a855f7', bg: 'bg-purple-500' },
    { id: '#f43f5e', bg: 'bg-rose-500' },
  ];

  const TEXT_COLORS = [
    { id: 'orange', cls: 'text-orange-500', bg: 'bg-orange-500' },
    { id: 'gradient', cls: 'bg-gradient-to-r from-[#fbbf24] via-[#f43f5e] to-[#a855f7] text-transparent bg-clip-text', bg: 'bg-gradient-to-r from-[#fbbf24] via-[#f43f5e] to-[#a855f7]' },
    { id: 'blue', cls: 'text-blue-500', bg: 'bg-blue-500' },
    { id: 'emerald', cls: 'text-emerald-500', bg: 'bg-emerald-500' },
    { id: 'purple', cls: 'text-purple-500', bg: 'bg-purple-500' },
    { id: 'rose', cls: 'text-rose-500', bg: 'bg-rose-500' },
    { id: 'white', cls: 'text-white', bg: 'bg-white' },
  ];

  const lineColor = pathColor === 'gradient' ? 'url(#route-gradient)' : pathColor;
  const currentTextColorCls = TEXT_COLORS.find(t => t.id === textColor)?.cls || TEXT_COLORS[0].cls;

  const safeLayoutIndex = layoutIndex >= LAYOUTS.length ? 0 : layoutIndex;
  const layout = LAYOUTS[safeLayoutIndex];
  
  const isPolaroid = layout === 'polaroid-transparent';
  const isTransparent = layout.includes('path-') || isPolaroid || layout === 'a-shape-transparent';
  const isSolidBg = layout === 'stats-only';
  const isAShape = layout.includes('a-shape');
  
  const showMapBackground = !isSolidBg && !isPolaroid && !isTransparent; // Only for map-* and a-shape layouts
  // `map-path-only` is the fourth layout and is also a transparent route card.
  // It must mount the map layer even though its name does not start with path-.
  const showPathBackground = layout.startsWith('path-') || layout === 'map-path-only' || layout === 'a-shape-transparent';
  const hideMarkers = layout === 'map-path-only' || layout === 'path-only-nomarker';

  const hideMapTiles = isTransparent;
  const showOverlayStats = layout === 'map-stats' || layout === 'path-stats';
  const showDistanceOnly = layout === 'map-distance' || layout === 'path-distance';

  const getCanvas = async () => {
    if (!cardRef.current) return null;
    const canvas = await toCanvas(cardRef.current, {
      pixelRatio: 2,
      backgroundColor: isTransparent ? undefined : '#1f110d',
    });
    
    // Apply clipping to match the 1.8rem border-radius of the card
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.globalCompositeOperation = 'destination-in';
      const clipCanvas = document.createElement('canvas');
      clipCanvas.width = canvas.width;
      clipCanvas.height = canvas.height;
      const clipCtx = clipCanvas.getContext('2d');
      if (clipCtx) {
        // 1.8rem is roughly 28.8px at default base size. 
        // We multiply by scale=2 -> approx 58px.
        const radius = 58; 
        clipCtx.beginPath();
        clipCtx.moveTo(radius, 0);
        clipCtx.lineTo(canvas.width - radius, 0);
        clipCtx.quadraticCurveTo(canvas.width, 0, canvas.width, radius);
        clipCtx.lineTo(canvas.width, canvas.height - radius);
        clipCtx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - radius, canvas.height);
        clipCtx.lineTo(radius, canvas.height);
        clipCtx.quadraticCurveTo(0, canvas.height, 0, canvas.height - radius);
        clipCtx.lineTo(0, radius);
        clipCtx.quadraticCurveTo(0, 0, radius, 0);
        clipCtx.closePath();
        clipCtx.fill();
        ctx.drawImage(clipCanvas, 0, 0);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    return canvas;
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      await new Promise(r => setTimeout(r, 50));
      const canvas = await getCanvas();
      if (!canvas) return;
      
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = `apparatus-${data.type}-${format(new Date(data.date), 'yyyy-MM-dd')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setDidCopy(true);
      setTimeout(() => setDidCopy(false), 2000);
    } catch (err) {
      console.error('Failed to generate image:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    try {
      setDownloading(true);
      await new Promise(r => setTimeout(r, 50));
      const canvas = await getCanvas();
      if (!canvas) return;

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `apparatus-${data.type}-${format(new Date(data.date), 'yyyy-MM-dd')}.png`, { type: 'image/png' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `My Apparatus ${typeLabel}`,
            files: [file],
          });
        } else {
          alert('Sharing is not supported on this device. Please use Save instead.');
        }
      });
    } catch (err) {
      console.error('Failed to share:', err);
    } finally {
      setDownloading(false);
    }
  };

  const goPrevious = () => setLayoutIndex((prev) => (prev - 1 + LAYOUTS.length) % LAYOUTS.length);
  const goNext = () => setLayoutIndex((prev) => (prev + 1) % LAYOUTS.length);
  const swipeStartX = useRef<number | null>(null);
  const handleCardPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.leaflet-container')) return;
    swipeStartX.current = event.clientX;
  };
  const handleCardPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (swipeStartX.current == null || (event.target as HTMLElement).closest('.leaflet-container')) {
      swipeStartX.current = null;
      return;
    }
    const delta = event.clientX - swipeStartX.current;
    swipeStartX.current = null;
    if (Math.abs(delta) >= 55) delta < 0 ? goNext() : goPrevious();
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[999] flex flex-col items-center bg-black/90 backdrop-blur-md touch-none overflow-y-auto px-4"
      >
        <div className="relative w-full max-w-[400px] shrink-0 mx-auto mt-2 sm:mt-4">
          
          {/* The Card to capture */}
          <motion.div 
            // Keep the map fully interactive. The former parent drag listener
            // captured pinch/drag gestures before Leaflet could handle them.
            drag={false}
            onPointerDown={handleCardPointerDown}
            onPointerUp={handleCardPointerUp}
            className={`w-full relative overflow-hidden rounded-[2rem] shadow-xl cursor-grab active:cursor-grabbing border-4 border-white/10`}
            style={{ 
              aspectRatio: isSolidBg ? '1 / 1' : '9 / 16',
              backgroundImage: isTransparent ? `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h12v12H0V0zm12 12h12v12H12V12zM0 12h12v12H0V12zm12-12h12v12H12V0z' fill='%23222' fill-opacity='0.4' fill-rule='evenodd'/%3E%3C/svg%3E")` : 'none'
            }}
          >
            {/* Close Button (Overlay on UI, not captured in image) */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-white/70 hover:text-white rounded-full bg-black/40 backdrop-blur-md z-[200]"
            >
              <X size={20} />
            </button>

            <div
              ref={cardRef}
              className={`w-full h-full relative overflow-hidden flex flex-col rounded-[1.8rem] ${isTransparent ? 'bg-transparent' : 'bg-[#1f110d]'}`}
            >
              {/* Background Map Layer */}
              {(showMapBackground || showPathBackground) && (
                <div className="absolute inset-0 z-0">
                  {(data.route && data.route.length > 0) || data.currentLocation ? (
                    <div 
                      className="w-full h-full pointer-events-auto"
                      onPointerDown={(event) => event.stopPropagation()}
                      onWheel={(event) => event.stopPropagation()}
                      style={isAShape ? {
                        WebkitMaskImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M50 5 L15 95 L35 95 L50 50 L65 95 L85 95 Z' fill='black'/></svg>")`,
                        WebkitMaskSize: 'contain',
                        WebkitMaskRepeat: 'no-repeat',
                        WebkitMaskPosition: 'center',
                        transform: 'scale(1.1)' // Scale up slightly to fit better
                      } : {}}
                    >
                      <RouteMap 
                          route={data.route || []}
                          currentLocation={data.currentLocation}
                          theme={selectedTheme}
                          height="100%"
                          // Leaflet's gradient definition is injected asynchronously.
                          // Transparent exports must still show the original route,
                          // so use a solid fallback for the gradient selection.
                          highlightColor={isTransparent && pathColor === 'gradient' ? '#f43f5e' : lineColor}
                          hideMap={hideMapTiles}
                          noGlow={true}
                          isCapturing={downloading}
                          recenterTrigger={recenterTrigger}
                          fitToContainer
                          showZoomControls
                          cardioType={data.type}
                          hideMarkers={hideMarkers}
                          hideStartMarker
                          mapPaddingBottomRight={showOverlayStats ? [40, 200] : showDistanceOnly ? [40, 100] : [40, 40]}
                          mapPaddingTopLeft={isAShape ? [60, 40] : [40, 40]}
                        />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/30 font-medium">
                      No GPS recorded
                    </div>
                  )}
                  {/* Strava-like bottom gradient for text readability if overlay stats are shown */}
                  {(showOverlayStats || showDistanceOnly) && (
                    <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-black/60 via-black/20 to-transparent z-[1000]" />
                  )}
                  {/* Subtle top gradient for logo */}
                  {(showOverlayStats || showDistanceOnly || layout === 'map-only' || layout === 'path-only' || layout === 'map-path-only' || layout === 'path-only-nomarker') && !isAShape && (
                    <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/30 to-transparent z-[1000]" />
                  )}
                </div>
              )}

              {/* Solid Background with App Logo Watermark (for Stats layout) */}
              {isSolidBg && (
                <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden opacity-5">
                  <svg viewBox="0 0 100 100" className="w-[150%] h-auto absolute" style={{ transform: 'rotate(45deg)' }}>
                    <rect x="25" y="25" width="50" height="50" fill="none" stroke="white" strokeWidth="4" rx="8" />
                  </svg>
                </div>
              )}

              {/* Content Foreground */}
              <div className="relative z-10 w-full h-full flex flex-col justify-between p-6 pointer-events-none">
                
                {/* Header Logo (Hidden for polaroid) */}
                {!isPolaroid && !isAShape && (
                  <div className={`flex flex-col items-center justify-center gap-1 ${isSolidBg ? 'mt-4' : 'mt-2'}`}>
                    <span className="cardio-share-brand font-sans tracking-[0.3em] text-[18px] font-black text-white drop-shadow-md">
                      ΛPPΛRΛTUS
                    </span>
                  </div>
                )}

                {/* Center space filler (Hidden for polaroid) */}
                {!isPolaroid && <div className="flex-1" />}

                {/* Stats Overlay */}
                {(showOverlayStats || showDistanceOnly) && (
                  <div className="flex flex-col gap-3 mb-2 w-full">
                    <div className="flex items-end gap-2 mb-2">
                      <div className="flex items-baseline gap-2">
                        <span className="font-display text-6xl font-black text-white">
                          {data.distanceKm.toFixed(2)}
                        </span>
                        <span className="text-xl font-bold text-white/90 uppercase tracking-widest pl-1">
                          km
                        </span>
                      </div>
                      <span className={`text-xl font-black uppercase tracking-widest ml-auto mb-1 ${currentTextColorCls}`}>
                        {typeLabel}
                      </span>
                    </div>
                    
                    {showOverlayStats && (
                      <div className="grid grid-cols-3 gap-y-4 gap-x-2">
                        <div>
                          <div className="text-[9px] font-bold text-white/80 uppercase tracking-widest mb-0.5">Time</div>
                          <div className="font-display font-bold text-xl text-white">
                            {formatDuration(data.durationSec)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] font-bold text-white/80 uppercase tracking-widest mb-0.5">Pace</div>
                          <div className="font-display font-bold text-xl text-white">
                            {data.avgPace.replace(' /km', '')}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] font-bold text-white/80 uppercase tracking-widest mb-0.5">Speed</div>
                          <div className="font-display font-bold text-xl text-white">
                            {data.avgSpeedKmh?.toFixed(1) || '0.0'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] font-bold text-white/80 uppercase tracking-widest mb-0.5">Max Spd</div>
                          <div className="font-display font-bold text-xl text-white">
                            {data.maxSpeedKmh?.toFixed(1) || '0.0'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] font-bold text-white/80 uppercase tracking-widest mb-0.5">Elev</div>
                          <div className="font-display font-bold text-xl text-white">
                            {data.elevationGainM || 0}m
                          </div>
                        </div>
                        {data.steps !== undefined && data.steps > 0 && (
                          <div>
                            <div className="text-[9px] font-bold text-white/80 uppercase tracking-widest mb-0.5">Steps</div>
                            <div className="font-display font-bold text-xl text-white">
                              {data.steps.toLocaleString()}
                            </div>
                          </div>
                        )}
                        <div>
                          <div className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${currentTextColorCls}`}>Calories</div>
                          <div className={`font-display font-bold text-xl ${currentTextColorCls}`}>
                            {data.calories}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Centered Stats for Stats-only view */}
                {/* Centered Stats for Stats-only view */}
                {layout === 'stats-only' && (
                  <div className="flex-1 flex flex-col items-center justify-center w-full">
                    <div className="text-center mb-10">
                      <div className="font-display text-[5.5rem] leading-none font-black text-white tracking-tighter">
                        {data.distanceKm.toFixed(2)}
                      </div>
                      <div className="text-sm font-bold text-white/60 uppercase tracking-widest mt-1">
                        Kilometers
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-y-8 gap-x-2 w-full max-w-[320px]">
                      <div className="text-center">
                        <div className="font-display font-bold text-2xl text-white mb-1">{formatDuration(data.durationSec)}</div>
                        <div className="text-[9px] font-bold text-white/50 uppercase tracking-widest">Time</div>
                      </div>
                      <div className="text-center">
                        <div className="font-display font-bold text-2xl text-white mb-1">{data.avgPace.replace(' /km', '')}</div>
                        <div className="text-[9px] font-bold text-white/50 uppercase tracking-widest">Pace</div>
                      </div>
                      <div className="text-center">
                        <div className={`font-display font-bold text-2xl mb-1 ${currentTextColorCls}`}>{data.calories}</div>
                        <div className={`text-[9px] font-bold opacity-80 uppercase tracking-widest ${currentTextColorCls}`}>Cals</div>
                      </div>
                      <div className="text-center">
                        <div className="font-display font-bold text-2xl text-white mb-1">{data.avgSpeedKmh?.toFixed(1) || '0.0'}</div>
                        <div className="text-[9px] font-bold text-white/50 uppercase tracking-widest">Speed</div>
                      </div>
                      <div className="text-center">
                        <div className="font-display font-bold text-2xl text-white mb-1">{data.maxSpeedKmh?.toFixed(1) || '0.0'}</div>
                        <div className="text-[9px] font-bold text-white/50 uppercase tracking-widest">Max</div>
                      </div>
                      <div className="text-center">
                        <div className="font-display font-bold text-2xl text-white mb-1">{data.elevationGainM || 0}m</div>
                        <div className="text-[9px] font-bold text-white/50 uppercase tracking-widest">Elev</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Polaroid */}
                {isPolaroid && (
                  <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none p-6 pb-12">
                    <div className="bg-[#fcfbf9] rounded-sm p-4 pb-10 shadow-[0_20px_40px_rgba(0,0,0,0.6)] w-full rotate-[1deg] border border-black/5">
                      <div className="w-full aspect-square bg-gray-200 rounded-sm overflow-hidden relative">
                        <RouteMap route={data.route || []} theme="satellite" height="100%" fitToContainer showZoomControls hideStartMarker hideMap={false} highlightColor="#f43f5e" cardioType={data.type as any} />
                      </div>
                      <div className="mt-6 flex flex-col items-center gap-1 font-sans text-gray-800">
                        <div className="text-2xl font-black italic">{data.distanceKm.toFixed(2)} km {typeLabel}</div>
                        <div className="text-sm opacity-60 font-bold">{formatDuration(data.durationSec)} • {displayDate}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Just Date for map-only variants */}
                {(layout === 'map-only' || layout === 'path-only' || layout === 'map-path-only' || layout === 'path-only-nomarker' || isAShape) && (
                  <div className={`text-right ${isAShape ? 'mt-auto' : ''}`}>
                    <span className="text-xs font-bold text-white/80 drop-shadow-md uppercase tracking-wider bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-sm">
                      {displayDate}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Explicit swipe affordances; map gestures remain available between
                the controls and these buttons also work for mouse users. */}
            <button
              type="button"
              aria-label="Previous card"
              onClick={goPrevious}
              className="absolute left-2 top-1/2 z-[210] -translate-y-1/2 rounded-full bg-black/45 p-2 text-white/80 shadow-md backdrop-blur-sm hover:bg-black/65 hover:text-white"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              aria-label="Next card"
              onClick={goNext}
              className="absolute right-2 top-1/2 z-[210] -translate-y-1/2 rounded-full bg-black/45 p-2 text-white/80 shadow-md backdrop-blur-sm hover:bg-black/65 hover:text-white"
            >
              <ChevronRight size={22} />
            </button>
          </motion.div>

          {/* Dots Indicator */}
          <div className="flex items-center justify-center gap-1.5 mt-3">
            {LAYOUTS.map((_, idx) => (
              <div 
                key={idx} 
                className={`h-1.5 rounded-full transition-all duration-300 ${idx === layoutIndex ? 'w-5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]' : 'w-1.5 bg-white/20'}`}
              />
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="w-full max-w-[400px] mx-auto px-4 pb-6 flex flex-col gap-2 mt-2">
          
          {/* Map theme selector (only when map tiles are visible) */}
          {!hideMapTiles && layout !== 'stats-only' && (
            <div className="w-full max-w-[95vw] mx-auto bg-white/5 backdrop-blur-xl rounded-[24px] border border-white/10 overflow-hidden">
              <div className="flex overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {AVAILABLE_THEMES.map(t => (
                  <button
                    key={t}
                    onClick={() => setSelectedTheme(t)}
                    className={`shrink-0 px-4 py-2 rounded-[20px] text-xs font-bold tracking-wide transition-all duration-300 ${
                      selectedTheme === t 
                        ? 'bg-gradient-to-r from-[#fbbf24] via-[#f43f5e] to-[#a855f7] text-white shadow-[0_4px_12px_rgba(244,63,94,0.4)]' 
                        : 'text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {MAP_THEMES[t].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Color Pickers */}
          <div className="w-full max-w-[95vw] mx-auto bg-white/5 backdrop-blur-xl rounded-[24px] border border-white/10 overflow-hidden p-3 flex flex-col gap-3">
            {/* Path Color */}
              <div className="flex min-w-0 items-center gap-3">
              <span className="text-xs font-bold text-white/60 uppercase tracking-wider w-16 shrink-0">Path</span>
              <div className="min-w-0 flex-1 flex overflow-x-auto gap-2 px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {PATH_COLORS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setPathColor(c.id)}
                    className={`shrink-0 w-8 h-8 rounded-full ${c.bg} transition-all duration-300 border-2 ${pathColor === c.id ? 'border-white ring-2 ring-white/30 shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 'border-transparent opacity-50 hover:opacity-100'}`}
                  />
                ))}
              </div>
            </div>
            
            {/* Text Color */}
              <div className="flex min-w-0 items-center gap-3">
              <span className="text-xs font-bold text-white/60 uppercase tracking-wider w-16 shrink-0">Text</span>
              <div className="min-w-0 flex-1 flex overflow-x-auto gap-2 px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {TEXT_COLORS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setTextColor(c.id)}
                    className={`shrink-0 w-8 h-8 rounded-full ${c.bg} transition-all duration-300 border-2 ${textColor === c.id ? 'border-white ring-2 ring-white/30 shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 'border-transparent opacity-50 hover:opacity-100'}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-center gap-6 w-full mt-2">
            <svg width="0" height="0" className="absolute">
              <defs>
                <linearGradient id="icon-gradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#fbbf24" offset="0%" />
                  <stop stopColor="#f43f5e" offset="50%" />
                  <stop stopColor="#a855f7" offset="100%" />
                </linearGradient>
              </defs>
            </svg>

            <button
              onClick={handleDownload}
              disabled={downloading}
              className="p-4 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all active:scale-[0.90] disabled:opacity-50"
              title="Save to Photos"
            >
              {didCopy ? <Check size={28} className="text-green-400" /> : <Download size={28} style={{ stroke: 'url(#icon-gradient)' }} />}
            </button>
            
            <button
              onClick={handleShare}
              disabled={downloading}
              className="p-4 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all active:scale-[0.90] disabled:opacity-50"
              title="Share Activity"
            >
              <Share2 size={28} style={{ stroke: 'url(#icon-gradient)' }} />
            </button>

            {(!hideMapTiles || showMapBackground || showPathBackground) && (
              <button
                onClick={() => setRecenterTrigger(prev => prev + 1)}
                disabled={downloading}
                className="p-4 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all active:scale-[0.90] disabled:opacity-50"
                title="Recenter Map"
              >
                <LocateFixed size={28} style={{ stroke: 'url(#icon-gradient)' }} />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
