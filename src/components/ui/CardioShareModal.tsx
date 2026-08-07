import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Check } from 'lucide-react';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';
import { RouteMap } from '@/components/cardio/RouteMap';
import type { RoutePoint } from '@/types';

export interface CardioShareData {
  type: 'walk' | 'run' | 'cycle';
  date: string;
  distanceKm: number;
  durationSec: number;
  calories: number;
  avgPace: string;
  route?: RoutePoint[];
}

interface Props {
  data: CardioShareData;
  mapTheme?: 'default' | 'light' | 'dark' | 'satellite' | 'street';
  onClose: () => void;
}

function formatDuration(sec: number): string {
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

export function CardioShareModal({ data, mapTheme = 'default', onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [didCopy, setDidCopy] = useState(false);
  const [isTransparent, setIsTransparent] = useState(false);

  const typeLabel = data.type === 'walk' ? 'WALK' : data.type === 'run' ? 'RUN' : 'RIDE';
  const typeColor = data.type === 'walk' ? '#10b981' : data.type === 'run' ? '#3b82f6' : '#a855f7';
  const displayDate = format(new Date(data.date), 'EEEE, MMM d, yyyy');

  const handleDownload = async () => {
    if (!cardRef.current) return;
    try {
      setDownloading(true);
      // html2canvas rendering
      const canvas = await html2canvas(cardRef.current, {
        useCORS: true,
        allowTaint: true,
        scale: 2, // High res
        backgroundColor: isTransparent ? null : '#1a1a2e',
      });
      
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

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-4 touch-none"
      >
        <button
          onClick={onClose}
          className="absolute top-safe right-4 w-12 h-12 flex items-center justify-center text-white/50 hover:text-white rounded-full bg-white/10"
        >
          <X size={24} />
        </button>

        {/* The Card to capture */}
        <div className="relative w-full max-w-[400px] aspect-[9/16] shrink-0 overflow-hidden rounded-3xl mx-auto shadow-2xl scale-[0.8] origin-center">
          <div
            ref={cardRef}
            className={`w-full h-full flex flex-col pt-8 pb-12 ${
              isTransparent ? 'bg-transparent' : 'bg-gradient-to-b from-[#1a1a2e] to-[#16213e]'
            }`}
          >
            {/* Header */}
            <div className="text-center font-display text-3xl font-black text-white tracking-[6px] mb-8">
              APPARATUS
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-2 px-6 mb-8">
              <div className="text-center">
                <div className="text-[11px] font-medium text-white/50 uppercase tracking-wider mb-1">Distance</div>
                <div className="font-display font-bold text-3xl text-white">
                  {data.distanceKm.toFixed(2)}
                  <span className="text-sm ml-1 text-white/70">km</span>
                </div>
              </div>
              <div className="text-center">
                <div className="text-[11px] font-medium text-white/50 uppercase tracking-wider mb-1">Avg Pace</div>
                <div className="font-display font-bold text-3xl text-white">
                  {data.avgPace.replace(' /km', '')}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[11px] font-medium text-white/50 uppercase tracking-wider mb-1">Time</div>
                <div className="font-display font-bold text-3xl text-white">
                  {formatDuration(data.durationSec)}
                </div>
              </div>
            </div>

            {/* Map Area */}
            <div className="flex-1 px-4 relative mb-8">
              <div className="absolute inset-4 rounded-[32px] overflow-hidden border-[4px] border-white/5 bg-black/20">
                {data.route && data.route.length > 1 ? (
                  <RouteMap 
                    route={data.route} 
                    theme={mapTheme === 'default' ? 'light' : mapTheme} 
                    height="100%" 
                    highlightColor={typeColor}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/30 font-medium">
                    No GPS recorded
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="text-center px-6">
              <div className="font-display text-5xl font-bold text-white tracking-wider mb-2">
                {typeLabel}
              </div>
              <div className="text-sm font-medium text-white/60 mb-4">
                {displayDate}
              </div>
              <div className="text-lg font-bold text-[#f97316]">
                {data.calories} KCAL BURNED
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-4 mt-8">
          <div className="flex items-center gap-2 bg-white/10 rounded-full p-1">
            <button
              onClick={() => setIsTransparent(false)}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                !isTransparent ? 'bg-white text-black' : 'text-white/60 hover:text-white'
              }`}
            >
              Solid
            </button>
            <button
              onClick={() => setIsTransparent(true)}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                isTransparent ? 'bg-white text-black' : 'text-white/60 hover:text-white'
              }`}
            >
              Transparent
            </button>
          </div>

          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-3 bg-white text-black px-8 py-4 rounded-full font-bold text-lg hover:bg-gray-100 transition-colors active:scale-95 disabled:opacity-50"
          >
            {didCopy ? <Check size={24} className="text-green-500" /> : <Download size={24} />}
            {downloading ? 'Preparing Image...' : 'Save to Camera Roll'}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
