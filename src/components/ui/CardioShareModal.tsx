import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Check, Share2, LocateFixed, ChevronLeft, ChevronRight, Sparkles, Layers, Palette, Layout as LayoutIcon, Smartphone, Square as SquareIcon } from 'lucide-react';
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
  | 'pro-glass' 
  | 'sunset-glow'
  | 'cyber-neon'
  | 'map-hero'
  | 'path-minimal'
  | 'stats-pro'
  | 'polaroid-vintage'
  | 'a-shape-stencil'
  | 'transparent-sticker';

const LAYOUT_OPTIONS: { id: ShareLayout; label: string; icon: string }[] = [
  { id: 'pro-glass', label: 'Pro Glass', icon: '⚡' },
  { id: 'sunset-glow', label: 'Sunset Dusk', icon: '🌅' },
  { id: 'cyber-neon', label: 'Cyber Neon', icon: '👾' },
  { id: 'map-hero', label: 'Map Hero', icon: '🗺️' },
  { id: 'path-minimal', label: 'Pure Path', icon: '✨' },
  { id: 'stats-pro', label: 'Telemetry', icon: '📊' },
  { id: 'polaroid-vintage', label: 'Polaroid', icon: '📸' },
  { id: 'a-shape-stencil', label: 'A-Stencil', icon: '🅰️' },
  { id: 'transparent-sticker', label: 'Sticker', icon: '🪄' },
];

const AVAILABLE_THEMES = Object.keys(MAP_THEMES) as MapThemeKey[];

export function CardioShareModal({ data, mapTheme = 'street', onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [didCopy, setDidCopy] = useState(false);
  const [layout, setLayout] = useState<ShareLayout>('pro-glass');
  const [aspectRatio, setAspectRatio] = useState<'9/16' | '1/1'>('9/16');
  const [selectedTheme, setSelectedTheme] = useState<MapThemeKey>(mapTheme === 'dark' ? 'dark' : (mapTheme as MapThemeKey));
  const [activeTab, setActiveTab] = useState<'layout' | 'theme' | 'colors'>('layout');
  
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [pathColor, setPathColor] = useState('gradient');
  const [textColor, setTextColor] = useState('orange');

  const typeLabel = data.type === 'walk' ? 'WALK' : data.type === 'run' ? 'RUN' : 'RIDE';
  const displayDate = format(new Date(data.date), 'EEEE, MMM d, yyyy');
  
  const PATH_COLORS = [
    { id: 'gradient', bg: 'bg-gradient-to-r from-[#fbbf24] via-[#f43f5e] to-[#a855f7]', label: 'Aurora' },
    { id: '#f97316', bg: 'bg-orange-500', label: 'Orange' },
    { id: '#06b6d4', bg: 'bg-cyan-500', label: 'Cyan' },
    { id: '#10b981', bg: 'bg-emerald-500', label: 'Emerald' },
    { id: '#a855f7', bg: 'bg-purple-500', label: 'Purple' },
    { id: '#f43f5e', bg: 'bg-rose-500', label: 'Rose' },
    { id: '#ffffff', bg: 'bg-white', label: 'White' },
  ];

  const TEXT_COLORS = [
    { id: 'orange', cls: 'text-amber-500', bg: 'bg-amber-500' },
    { id: 'gradient', cls: 'bg-gradient-to-r from-[#fbbf24] via-[#f43f5e] to-[#a855f7] text-transparent bg-clip-text', bg: 'bg-gradient-to-r from-[#fbbf24] via-[#f43f5e] to-[#a855f7]' },
    { id: 'cyan', cls: 'text-cyan-400', bg: 'bg-cyan-400' },
    { id: 'emerald', cls: 'text-emerald-400', bg: 'bg-emerald-400' },
    { id: 'purple', cls: 'text-purple-400', bg: 'bg-purple-400' },
    { id: 'rose', cls: 'text-rose-400', bg: 'bg-rose-400' },
    { id: 'white', cls: 'text-white', bg: 'bg-white' },
  ];

  const lineColor = pathColor === 'gradient' ? 'url(#route-gradient)' : pathColor;
  const currentTextColorCls = TEXT_COLORS.find(t => t.id === textColor)?.cls || TEXT_COLORS[0].cls;

  const isPolaroid = layout === 'polaroid-vintage';
  const isTransparent = layout === 'transparent-sticker' || layout === 'path-minimal';
  const isSolidBg = layout === 'stats-pro';
  const isAShape = layout === 'a-shape-stencil';
  const isCyber = layout === 'cyber-neon';
  const isSunset = layout === 'sunset-glow';

  const showMapBackground = !isSolidBg && !isPolaroid && !isTransparent;
  const showPathBackground = isTransparent || isAShape;
  const hideMapTiles = isTransparent;

  const getCanvas = async () => {
    if (!cardRef.current) return null;
    const canvas = await toCanvas(cardRef.current, {
      pixelRatio: 2,
      backgroundColor: isTransparent ? undefined : '#090605',
    });
    
    // Apply clipping to match the border-radius of the card
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.globalCompositeOperation = 'destination-in';
      const clipCanvas = document.createElement('canvas');
      clipCanvas.width = canvas.width;
      clipCanvas.height = canvas.height;
      const clipCtx = clipCanvas.getContext('2d');
      if (clipCtx) {
        const radius = 64; 
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
      await new Promise(r => setTimeout(r, 60));
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
      setTimeout(() => setDidCopy(false), 2200);
    } catch (err) {
      console.error('Failed to generate image:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    try {
      setDownloading(true);
      await new Promise(r => setTimeout(r, 60));
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
          handleDownload();
        }
      });
    } catch (err) {
      console.error('Failed to share:', err);
    } finally {
      setDownloading(false);
    }
  };

  const goPrevious = () => {
    const idx = LAYOUT_OPTIONS.findIndex(l => l.id === layout);
    const prev = (idx - 1 + LAYOUT_OPTIONS.length) % LAYOUT_OPTIONS.length;
    setLayout(LAYOUT_OPTIONS[prev].id);
  };

  const goNext = () => {
    const idx = LAYOUT_OPTIONS.findIndex(l => l.id === layout);
    const next = (idx + 1) % LAYOUT_OPTIONS.length;
    setLayout(LAYOUT_OPTIONS[next].id);
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex flex-col items-center bg-[#090605]/95 backdrop-blur-2xl touch-none overflow-y-auto px-4 py-3 select-none"
      >
        {/* Top Navbar */}
        <div className="w-full max-w-[420px] flex items-center justify-between px-2 pt-2 pb-1 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_10px_#f59e0b] animate-pulse" />
            <span className="font-mono text-sm font-extrabold text-white tracking-widest uppercase drop-shadow-sm">
              Share Workout
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Aspect Ratio Switcher */}
            <button
              onClick={() => setAspectRatio(prev => prev === '9/16' ? '1/1' : '9/16')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-white font-mono text-[11px] transition-all"
              title="Toggle Aspect Ratio"
            >
              {aspectRatio === '9/16' ? <Smartphone size={13} /> : <SquareIcon size={13} />}
              <span>{aspectRatio}</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Card Preview Area */}
        <div className="relative w-full max-w-[390px] shrink-0 mx-auto mt-1 flex flex-col items-center">
          <motion.div 
            className="w-full relative overflow-hidden rounded-[2.2rem] shadow-[0_20px_60px_rgba(0,0,0,0.8)] border border-white/15"
            style={{ 
              aspectRatio: aspectRatio === '1/1' ? '1 / 1' : '9 / 16',
              backgroundImage: isTransparent ? `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h12v12H0V0zm12 12h12v12H12V12zM0 12h12v12H0V12zm12-12h12v12H12V0z' fill='%23333' fill-opacity='0.4' fill-rule='evenodd'/%3E%3C/svg%3E")` : 'none'
            }}
          >
            {/* The Actual Capture Target */}
            <div
              ref={cardRef}
              className={`w-full h-full relative overflow-hidden flex flex-col rounded-[2.2rem] ${
                isTransparent 
                  ? 'bg-transparent' 
                  : isSunset
                  ? 'bg-gradient-to-b from-[#1c0b29] via-[#35102a] to-[#0d0402]'
                  : isCyber
                  ? 'bg-[#03060f]'
                  : 'bg-[#090605]'
              }`}
            >
              {/* Background Map Layer */}
              {(showMapBackground || showPathBackground) && (
                <div className="absolute inset-0 z-0">
                  {(data.route && data.route.length > 0) || data.currentLocation ? (
                    <div 
                      className="w-full h-full pointer-events-auto"
                      style={isAShape ? {
                        WebkitMaskImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M50 5 L15 95 L35 95 L50 50 L65 95 L85 95 Z' fill='black'/></svg>")`,
                        WebkitMaskSize: 'contain',
                        WebkitMaskRepeat: 'no-repeat',
                        WebkitMaskPosition: 'center',
                        transform: 'scale(1.08)'
                      } : {}}
                    >
                      <RouteMap 
                        route={data.route || []}
                        currentLocation={data.currentLocation}
                        theme={selectedTheme}
                        height="100%"
                        highlightColor={
                          isCyber ? '#00f5d4' :
                          isSunset ? '#fb923c' :
                          isTransparent && pathColor === 'gradient' ? '#f43f5e' : lineColor
                        }
                        hideMap={hideMapTiles}
                        noGlow={false}
                        isCapturing={downloading}
                        recenterTrigger={recenterTrigger}
                        fitToContainer
                        showZoomControls={false}
                        cardioType={data.type}
                        hideMarkers={isTransparent || isAShape}
                        hideStartMarker
                        mapPaddingBottomRight={layout === 'map-hero' ? [20, 40] : [40, 180]}
                        mapPaddingTopLeft={isAShape ? [60, 40] : [40, 40]}
                      />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/30 font-mono text-sm">
                      No GPS Track Recorded
                    </div>
                  )}

                  {/* Gradient Vignettes / Atmospheric Overlays */}
                  {!isTransparent && !isPolaroid && (
                    <>
                      {isSunset ? (
                        <>
                          <div className="absolute inset-0 bg-gradient-to-t from-[#150502]/90 via-[#3d0f28]/40 to-[#190729]/50 mix-blend-color z-[1000] pointer-events-none" />
                          <div className="absolute inset-x-0 bottom-0 h-[65%] bg-gradient-to-t from-[#120401]/95 via-[#230919]/60 to-transparent z-[1000] pointer-events-none" />
                        </>
                      ) : isCyber ? (
                        <>
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#00f5d415,_transparent_70%)] z-[1000] pointer-events-none" />
                          <div className="absolute inset-x-0 bottom-0 h-[65%] bg-gradient-to-t from-[#02050c]/95 via-[#02050c]/60 to-transparent z-[1000] pointer-events-none" />
                        </>
                      ) : (
                        <>
                          <div className="absolute inset-x-0 bottom-0 h-[65%] bg-gradient-to-t from-[#090605]/90 via-[#090605]/50 to-transparent z-[1000] pointer-events-none" />
                          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#090605]/70 to-transparent z-[1000] pointer-events-none" />
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Solid Telemetry Background with Signature Watermark */}
              {isSolidBg && (
                <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden opacity-5 pointer-events-none">
                  <div className="font-sans text-[22vw] font-black text-white tracking-widest rotate-12">
                    APPARATUS
                  </div>
                </div>
              )}

              {/* Foreground UI Layer */}
              <div className="relative z-10 w-full h-full flex flex-col justify-between p-6 pointer-events-none">
                
                {/* Header Brand Bar */}
                {!isPolaroid && (
                  <div className="flex items-center justify-between w-full">
                    {isCyber ? (
                      <span className="font-mono tracking-[0.25em] text-[13px] font-black text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]">
                        // APPARATUS_SYS
                      </span>
                    ) : (
                      <span className={`font-sans tracking-[0.3em] text-[15px] font-black drop-shadow-md ${isSunset ? 'text-amber-200' : 'text-white'}`}>
                        APPARATUS
                      </span>
                    )}

                    <span className={`text-[11px] font-mono font-bold tracking-wider px-2.5 py-1 rounded-full backdrop-blur-md uppercase ${
                      isCyber
                        ? 'bg-cyan-950/60 border border-cyan-400/40 text-cyan-300 drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                        : isSunset
                        ? 'bg-amber-950/60 border border-amber-500/30 text-amber-300'
                        : `bg-black/40 border border-white/10 ${currentTextColorCls}`
                    }`}>
                      {typeLabel}
                    </span>
                  </div>
                )}

                {/* Polaroid Frame */}
                {isPolaroid && (
                  <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none p-5 pb-8">
                    <div className="bg-[#fcfbf9] rounded-2xl p-4 pb-8 shadow-[0_25px_50px_rgba(0,0,0,0.7)] w-full border border-black/10">
                      <div className="w-full aspect-square bg-gray-900 rounded-xl overflow-hidden relative shadow-inner">
                        <RouteMap route={data.route || []} theme="satellite" height="100%" fitToContainer showZoomControls={false} hideStartMarker hideMap={false} highlightColor="#f43f5e" cardioType={data.type as any} />
                      </div>
                      <div className="mt-5 flex flex-col items-center gap-1 font-sans text-gray-900">
                        <div className="text-2xl font-black italic tracking-tight">{data.distanceKm.toFixed(2)} km {typeLabel}</div>
                        <div className="text-xs font-mono font-bold text-gray-500">{formatDuration(data.durationSec)} · {data.avgPace} · {displayDate}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Map Hero Layout (Floating Capsule Bottom Bar) */}
                {layout === 'map-hero' && (
                  <div className="mt-auto w-full">
                    <div className="bg-black/80 backdrop-blur-2xl border border-white/20 rounded-3xl p-4 shadow-[0_20px_40px_rgba(0,0,0,0.7)] flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-mono font-bold text-white/60 uppercase">Distance</span>
                        <span className="font-mono text-3xl font-black text-white">{data.distanceKm.toFixed(2)} <span className="text-xs font-bold text-amber-400">km</span></span>
                      </div>
                      <div className="h-8 w-px bg-white/15" />
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-mono font-bold text-white/60 uppercase">Time</span>
                        <span className="font-mono text-xl font-bold text-white">{formatDuration(data.durationSec)}</span>
                      </div>
                      <div className="h-8 w-px bg-white/15" />
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-mono font-bold text-white/60 uppercase">Pace</span>
                        <span className="font-mono text-xl font-bold text-white">{data.avgPace.replace(' /km', '')}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pro Glass / Sunset / Cyber Overlay (Non-Polaroid, Non-MapHero) */}
                {!isPolaroid && layout !== 'path-minimal' && layout !== 'map-hero' && (
                  <div className={`flex flex-col gap-3 mb-1 w-full ${layout === 'pro-glass' ? 'bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-3xl p-4 shadow-xl' : ''}`}>
                    {/* Distance Hero */}
                    <div className="flex items-end justify-between">
                      <div>
                        <div className={`text-[10px] font-mono font-bold uppercase tracking-widest mb-0.5 ${isCyber ? 'text-cyan-400' : isSunset ? 'text-amber-300' : 'text-white/70'}`}>
                          Total Distance
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className={`font-mono text-5xl sm:text-6xl font-black tracking-tight drop-shadow-md ${isCyber ? 'text-cyan-300 drop-shadow-[0_0_12px_rgba(6,182,212,0.8)]' : isSunset ? 'text-amber-200' : 'text-white'}`}>
                            {data.distanceKm.toFixed(2)}
                          </span>
                          <span className={`font-mono text-lg font-bold uppercase ${isCyber ? 'text-cyan-400' : isSunset ? 'text-amber-300' : 'text-white/80'}`}>
                            km
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/70 mb-0.5">
                          Date
                        </div>
                        <div className="text-xs font-mono font-medium text-white/90">
                          {format(new Date(data.date), 'MMM d, yyyy')}
                        </div>
                      </div>
                    </div>

                    {/* Pro Metric Typography Grid */}
                    <div className="grid grid-cols-3 gap-y-3 gap-x-2 pt-1">
                      <div className="flex flex-col">
                        <div className="text-[10px] font-mono font-bold text-white/60 uppercase tracking-wider mb-0.5">Time</div>
                        <div className="font-mono text-xl sm:text-2xl font-black text-white tracking-tight drop-shadow-sm">{formatDuration(data.durationSec)}</div>
                      </div>

                      <div className="flex flex-col">
                        <div className="text-[10px] font-mono font-bold text-white/60 uppercase tracking-wider mb-0.5">Pace</div>
                        <div className="font-mono text-xl sm:text-2xl font-black text-white tracking-tight drop-shadow-sm">{data.avgPace.replace(' /km', '')}</div>
                      </div>

                      <div className="flex flex-col">
                        <div className={`text-[10px] font-mono font-bold uppercase tracking-wider mb-0.5 ${isCyber ? 'text-cyan-400' : isSunset ? 'text-amber-400' : currentTextColorCls}`}>Calories</div>
                        <div className={`font-mono text-xl sm:text-2xl font-black tracking-tight drop-shadow-sm ${isCyber ? 'text-cyan-300' : isSunset ? 'text-amber-300' : currentTextColorCls}`}>{data.calories}</div>
                      </div>

                      {data.avgSpeedKmh !== undefined && (
                        <div className="flex flex-col">
                          <div className="text-[10px] font-mono font-bold text-white/60 uppercase tracking-wider mb-0.5">Avg Spd</div>
                          <div className="font-mono text-xl sm:text-2xl font-black text-white tracking-tight drop-shadow-sm">{data.avgSpeedKmh.toFixed(1)} <span className="text-xs font-normal text-white/60">km/h</span></div>
                        </div>
                      )}

                      {data.elevationGainM !== undefined && (
                        <div className="flex flex-col">
                          <div className="text-[10px] font-mono font-bold text-white/60 uppercase tracking-wider mb-0.5">Elevation</div>
                          <div className="font-mono text-xl sm:text-2xl font-black text-white tracking-tight drop-shadow-sm">{data.elevationGainM}m</div>
                        </div>
                      )}

                      {(data.steps !== undefined && data.steps > 0) && (
                        <div className="flex flex-col">
                          <div className="text-[10px] font-mono font-bold text-white/60 uppercase tracking-wider mb-0.5">Steps</div>
                          <div className="font-mono text-xl sm:text-2xl font-black text-white tracking-tight drop-shadow-sm">{data.steps.toLocaleString()}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Minimalist Path Corner Stamp */}
                {layout === 'path-minimal' && (
                  <div className="mt-auto flex items-end justify-between">
                    <div>
                      <div className="font-mono text-4xl font-black text-white">{data.distanceKm.toFixed(2)} km</div>
                      <div className="text-xs font-mono text-white/70">{formatDuration(data.durationSec)} · {data.avgPace}</div>
                    </div>
                    <div className="text-xs font-mono font-bold text-white/60 uppercase">{displayDate}</div>
                  </div>
                )}

              </div>
            </div>

            {/* Previous / Next Arrows */}
            <button
              type="button"
              aria-label="Previous template"
              onClick={goPrevious}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 border border-white/10 text-white flex items-center justify-center shadow-lg backdrop-blur-md transition-all active:scale-90"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              aria-label="Next template"
              onClick={goNext}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 border border-white/10 text-white flex items-center justify-center shadow-lg backdrop-blur-md transition-all active:scale-90"
            >
              <ChevronRight size={20} />
            </button>
          </motion.div>
        </div>

        {/* Customization Controls Deck */}
        <div className="w-full max-w-[390px] shrink-0 mx-auto mt-2 flex flex-col gap-2">
          {/* Tabs */}
          <div className="flex bg-[#1a100d] p-1 rounded-2xl border border-[#42241b]">
            <button
              onClick={() => setActiveTab('layout')}
              className={`flex-1 py-1.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${activeTab === 'layout' ? 'bg-sienna text-white shadow-sm' : 'text-white/60 hover:text-white'}`}
            >
              <LayoutIcon size={13} /> Style
            </button>
            <button
              onClick={() => setActiveTab('theme')}
              className={`flex-1 py-1.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${activeTab === 'theme' ? 'bg-sienna text-white shadow-sm' : 'text-white/60 hover:text-white'}`}
            >
              <Layers size={13} /> Map
            </button>
            <button
              onClick={() => setActiveTab('colors')}
              className={`flex-1 py-1.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${activeTab === 'colors' ? 'bg-sienna text-white shadow-sm' : 'text-white/60 hover:text-white'}`}
            >
              <Palette size={13} /> Color
            </button>
          </div>

          {/* Tab Content: Styles */}
          {activeTab === 'layout' && (
            <div className="flex overflow-x-auto gap-2 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {LAYOUT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setLayout(opt.id)}
                  className={`shrink-0 px-4 py-2 rounded-full font-mono text-xs font-bold transition-all flex items-center gap-1.5 border ${
                    layout === opt.id 
                      ? 'bg-sienna border-sienna text-white' 
                      : 'bg-[#1a100d] border-[#42241b] text-white/70 hover:text-white hover:border-[#5a2e22]'
                  }`}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Tab Content: Map Themes */}
          {activeTab === 'theme' && (
            <div className="flex overflow-x-auto gap-2 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {AVAILABLE_THEMES.map((t) => (
                <button
                  key={t}
                  onClick={() => setSelectedTheme(t)}
                  className={`shrink-0 px-4 py-2 rounded-full font-mono text-xs font-bold transition-all border ${
                    selectedTheme === t
                      ? 'bg-sienna border-sienna text-white'
                      : 'bg-[#1a100d] border-[#42241b] text-white/70 hover:text-white hover:border-[#5a2e22]'
                  }`}
                >
                  {MAP_THEMES[t].label}
                </button>
              ))}
            </div>
          )}

          {/* Tab Content: Color Pickers (With ample padding to prevent cutting off circle borders) */}
          {activeTab === 'colors' && (
            <div className="flex flex-col gap-2.5 bg-[#1a100d]/90 backdrop-blur-xl rounded-2xl p-3.5 border border-[#42241b]">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono font-bold text-white/60 uppercase w-12 shrink-0">Trail</span>
                <div className="flex-1 flex items-center overflow-x-auto gap-3 py-2 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {PATH_COLORS.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setPathColor(c.id)}
                      className={`shrink-0 w-8 h-8 rounded-full ${c.bg} transition-all border-2 ${
                        pathColor === c.id 
                          ? 'border-white ring-2 ring-sienna scale-105 shadow-md' 
                          : 'border-transparent opacity-60 hover:opacity-100 hover:scale-105'
                      }`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2.5 border-t border-[#42241b]">
                <span className="text-[11px] font-mono font-bold text-white/60 uppercase w-12 shrink-0">Text</span>
                <div className="flex-1 flex items-center overflow-x-auto gap-3 py-2 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {TEXT_COLORS.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setTextColor(c.id)}
                      className={`shrink-0 w-8 h-8 rounded-full ${c.bg} transition-all border-2 ${
                        textColor === c.id 
                          ? 'border-white ring-2 ring-sienna scale-105 shadow-md' 
                          : 'border-transparent opacity-60 hover:opacity-100 hover:scale-105'
                      }`}
                      title={c.id}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Primary Action Buttons (Apparatus Theme Matched Gradient) */}
          <div className="grid grid-cols-2 gap-3 mt-1">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="py-3.5 px-4 rounded-2xl bg-gradient-to-b from-[#251510] to-[#1a100d] hover:from-[#2e1913] hover:to-[#221410] border border-[#522b20] text-[#fff3eb] font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 shadow-sm"
            >
              {didCopy ? (
                <>
                  <Check size={18} className="text-emerald-400" /> Saved!
                </>
              ) : (
                <>
                  <Download size={18} className="text-amber-500" /> Save Image
                </>
              )}
            </button>

            <button
              onClick={handleShare}
              disabled={downloading}
              className="py-3.5 px-4 rounded-2xl bg-gradient-to-r from-sienna via-[#e66345] to-amber-500 hover:opacity-95 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-[0_8px_25px_rgba(235,89,60,0.38)] transition-all active:scale-95 disabled:opacity-50"
            >
              <Share2 size={18} /> Share Story
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
