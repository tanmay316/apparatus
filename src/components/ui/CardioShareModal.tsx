import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Check } from 'lucide-react';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';
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
  | 'map-stats' | 'map-only' | 'path-stats' | 'path-only' | 'stats-only'
  | 'map-distance' | 'path-distance' 
  | 'polaroid-transparent';

const LAYOUTS: ShareLayout[] = [
  'map-stats', 'map-distance', 'map-only', 
  'path-stats', 'path-distance', 'path-only', 
  'stats-only', 
  'polaroid-transparent'
];

const AVAILABLE_THEMES = Object.keys(MAP_THEMES) as MapThemeKey[];

export function CardioShareModal({ data, mapTheme = 'street', onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [didCopy, setDidCopy] = useState(false);
  const [layoutIndex, setLayoutIndex] = useState(0);
  const [selectedTheme, setSelectedTheme] = useState<MapThemeKey>(mapTheme === 'dark' ? 'dark' : mapTheme as MapThemeKey);

  const typeLabel = data.type === 'walk' ? 'WALK' : data.type === 'run' ? 'RUN' : 'RIDE';
  const displayDate = format(new Date(data.date), 'EEEE, MMM d, yyyy');
  
  // Theme-based line color: gradient
  const lineColor = 'url(#route-gradient)';

  const safeLayoutIndex = layoutIndex >= LAYOUTS.length ? 0 : layoutIndex;
  const layout = LAYOUTS[safeLayoutIndex];
  
  const isPolaroid = layout === 'polaroid-transparent';
  const isTransparent = layout.includes('path-') || isPolaroid;
  const isSolidBg = layout === 'stats-only';
  
  const showMapBackground = !isSolidBg && !isPolaroid && !isTransparent; // Only for map-* layouts
  const showPathBackground = layout.startsWith('path-'); // For path-* layouts

  const hideMapTiles = isTransparent;
  const showOverlayStats = layout === 'map-stats' || layout === 'path-stats';
  const showDistanceOnly = layout === 'map-distance' || layout === 'path-distance';

  const getCanvas = async () => {
    if (!cardRef.current) return null;
    const canvas = await html2canvas(cardRef.current, {
      useCORS: true,
      allowTaint: true,
      scale: 2,
      backgroundColor: isTransparent ? null : undefined,
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
        clipCtx.roundRect(0, 0, canvas.width, canvas.height, radius);
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

  const handleDragEnd = (e: any, { offset }: any) => {
    const swipe = offset.x;
    if (swipe < -50) {
      // swipe left (next)
      setLayoutIndex((prev) => (prev + 1) % LAYOUTS.length);
    } else if (swipe > 50) {
      // swipe right (prev)
      setLayoutIndex((prev) => (prev - 1 + LAYOUTS.length) % LAYOUTS.length);
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[999] flex flex-col items-center bg-black/90 backdrop-blur-md touch-none overflow-y-auto px-4"
      >
        <div className="relative w-full max-w-[400px] shrink-0 mx-auto mt-16 mb-4 sm:mt-24">
          
          <button
            onClick={onClose}
            className="absolute -top-4 -right-4 w-10 h-10 flex items-center justify-center text-white/50 hover:text-white rounded-full bg-black/50 backdrop-blur-md z-[200]"
          >
            <X size={20} />
          </button>

          {/* The Card to capture */}
          <motion.div 
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={handleDragEnd}
            className={`w-full relative overflow-hidden rounded-[2rem] shadow-xl cursor-grab active:cursor-grabbing border-4 border-white/10`}
            style={{ 
              aspectRatio: isSolidBg ? '1 / 1' : '9 / 16',
              backgroundImage: isTransparent ? `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h12v12H0V0zm12 12h12v12H12V12zM0 12h12v12H0V12zm12-12h12v12H12V0z' fill='%23222' fill-opacity='0.4' fill-rule='evenodd'/%3E%3C/svg%3E")` : 'none'
            }}
          >
            <div
              ref={cardRef}
              className={`w-full h-full relative overflow-hidden flex flex-col pointer-events-none rounded-[1.8rem] ${isTransparent ? 'bg-transparent' : 'bg-[#121212]'}`}
            >
              {/* Background Map Layer */}
              {(showMapBackground || showPathBackground) && (
                <div className="absolute inset-0 z-0">
                  {data.route && data.route.length > 0 ? (
                    <RouteMap 
                      route={data.route} 
                      theme={selectedTheme} 
                      height="100%" 
                      highlightColor={lineColor}
                      hideMap={hideMapTiles}
                      noGlow={true}
                    />
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
                  {(showOverlayStats || showDistanceOnly || layout === 'map-only' || layout === 'path-only') && (
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
              <div className="relative z-10 w-full h-full flex flex-col justify-between p-6">
                
                {/* Header Logo (Hidden for polaroid) */}
                {!isPolaroid && (
                  <div className={`flex flex-col items-center justify-center gap-1 ${isSolidBg ? 'mt-4' : 'mt-2'}`}>
                    <span className="font-sans tracking-[0.3em] text-[18px] font-black text-white">
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
                      <div className="flex items-baseline gap-1">
                        <span className="font-display text-6xl font-black text-white tracking-tighter">
                          {data.distanceKm.toFixed(2)}
                        </span>
                        <span className="text-xl font-bold text-white/90 uppercase tracking-widest">
                          km
                        </span>
                      </div>
                      <span className="text-xl font-black text-[#f97316] uppercase tracking-widest ml-auto mb-1">
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
                        <div>
                          <div className="text-[9px] font-bold text-[#f97316] uppercase tracking-widest mb-0.5">Calories</div>
                          <div className="font-display font-bold text-xl text-[#f97316]">
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
                        <div className="font-display font-bold text-2xl text-[#f97316] mb-1">{data.calories}</div>
                        <div className="text-[9px] font-bold text-[#f97316]/70 uppercase tracking-widest">Cals</div>
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
                        <RouteMap route={data.route || []} theme="satellite" height="100%" hideMap={false} highlightColor="#f43f5e" />
                      </div>
                      <div className="mt-6 flex flex-col items-center gap-1 font-sans text-gray-800">
                        <div className="text-2xl font-black italic">{data.distanceKm.toFixed(2)} km {typeLabel}</div>
                        <div className="text-sm opacity-60 font-bold">{formatDuration(data.durationSec)} • {displayDate}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Just Date for map-only and path-only */}
                {(layout === 'map-only' || layout === 'path-only') && (
                  <div className="text-right">
                    <span className="text-xs font-bold text-white/80 drop-shadow-md uppercase tracking-wider bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-sm">
                      {displayDate}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Dots Indicator */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {LAYOUTS.map((_, idx) => (
              <div 
                key={idx} 
                className={`h-1.5 rounded-full transition-all duration-300 ${idx === layoutIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/30'}`}
              />
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="w-full max-w-[400px] mx-auto px-4 pb-12 flex flex-col gap-3">
          
          {/* Map theme selector (only when map tiles are visible) */}
          {!hideMapTiles && layout !== 'stats-only' && (
            <div className="flex gap-2 overflow-x-auto px-2 -mx-2 py-2 -my-2 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {AVAILABLE_THEMES.map(t => (
                <button
                  key={t}
                  onClick={() => setSelectedTheme(t)}
                  className={`shrink-0 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all border ${
                    selectedTheme === t 
                      ? 'bg-gradient-to-r from-[#5d2a1a] to-[#c9743e] text-white border-transparent scale-105' 
                      : 'bg-white/10 text-white/50 border-white/10 hover:text-white hover:bg-white/20 backdrop-blur-md'
                  }`}
                >
                  {MAP_THEMES[t].label}
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 w-full mt-2">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex-1 flex items-center justify-center gap-2 bg-white/10 text-white backdrop-blur-xl border border-white/20 px-4 py-4 rounded-[1.5rem] font-bold text-sm hover:bg-white/20 transition-all active:scale-95 disabled:opacity-50"
            >
              {didCopy ? <Check size={18} className="text-green-400" /> : <Download size={18} />}
              {downloading ? 'Preparing...' : 'Save'}
            </button>
            <button
              onClick={handleShare}
              disabled={downloading}
              className="flex-[2] flex items-center justify-center gap-2 bg-gradient-to-r from-[#5d2a1a] to-[#c9743e] text-white border border-transparent px-6 py-4 rounded-[1.5rem] font-bold text-sm hover:brightness-110 transition-all active:scale-95 disabled:opacity-50"
            >
              Share Image
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
