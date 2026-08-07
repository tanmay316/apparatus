import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share2, Check } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { format } from 'date-fns';
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
  onClose: () => void;
}

function formatDuration(sec: number): string {
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function drawCardioCard(
  canvas: HTMLCanvasElement,
  data: CardioShareData,
  transparent: boolean
) {
  const W = 1080;
  const H = 1920;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background
  if (transparent) {
    ctx.clearRect(0, 0, W, H);
  } else {
    // Premium dark gradient
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#1a1a2e');
    grad.addColorStop(1, '#16213e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  let cursorY = 90;

  // ─── Brand Header ───
  ctx.textAlign = 'center';
  ctx.font = '800 48px Oswald, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.letterSpacing = '6px';
  ctx.fillText('APPARATUS', W / 2, cursorY);
  
  cursorY += 120;

  // ─── Metrics Row ─── (Distance | Pace | Time)
  const stats = [
    { label: 'Distance', value: `${data.distanceKm.toFixed(2)} km` },
    { label: 'Avg Pace', value: data.avgPace.replace(' /km', '') },
    { label: 'Time', value: formatDuration(data.durationSec) },
  ];

  const colW = (W - 160) / 3;

  stats.forEach((stat, i) => {
    const sx = 80 + i * colW + colW / 2;
    ctx.textAlign = 'center';

    // Label
    ctx.font = '500 30px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(stat.label, sx, cursorY);

    // Value
    const maxValWidth = colW - 20;
    let fontSize = 68;
    ctx.font = `700 ${fontSize}px Oswald, sans-serif`;
    let textWidth = ctx.measureText(stat.value).width;
    while (textWidth > maxValWidth && fontSize > 24) {
      fontSize -= 2;
      ctx.font = `700 ${fontSize}px Oswald, sans-serif`;
      textWidth = ctx.measureText(stat.value).width;
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(stat.value, sx, cursorY + 66);
  });

  cursorY += 160;

  // ─── Route Polyline ───
  if (data.route && data.route.length > 1) {
    // Calculate bounds
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    data.route.forEach(p => {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    });

    const padding = 100;
    const drawW = W - padding * 2;
    const drawH = 800; // Height for the map area
    const startY = cursorY;

    // Scale factors
    const latDiff = maxLat - minLat;
    const lngDiff = maxLng - minLng;
    const scale = Math.min(drawW / (lngDiff || 1), drawH / (latDiff || 1)) * 0.9; // 0.9 to add some margin inside

    const centerX = W / 2;
    const centerY = startY + drawH / 2;
    
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    // Draw grid/background for the route area (optional)
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.beginPath();
    ctx.roundRect(padding, startY, drawW, drawH, 40);
    ctx.fill();

    // Draw route
    ctx.beginPath();
    data.route.forEach((p, i) => {
      // Invert Y because canvas Y goes down, but lat goes up
      const px = centerX + (p.lng - centerLng) * scale;
      const py = centerY - (p.lat - centerLat) * scale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });

    // Style the polyline
    const typeColor = data.type === 'walk' ? '#10b981' : data.type === 'run' ? '#3b82f6' : '#a855f7';
    ctx.strokeStyle = typeColor;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Glow effect
    ctx.shadowColor = typeColor;
    ctx.shadowBlur = 30;
    ctx.stroke();
    ctx.shadowBlur = 0; // reset

    cursorY += drawH + 100;
  } else {
    // Fallback if no route
    ctx.textAlign = 'center';
    ctx.font = '500 36px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText('No GPS route recorded', W / 2, cursorY + 200);
    cursorY += 400;
  }

  // ─── Footer ───
  const typeLabel = data.type === 'walk' ? 'WALK' : data.type === 'run' ? 'RUN' : 'RIDE';
  const displayDate = format(new Date(data.date), 'EEEE, MMM d, yyyy');

  ctx.textAlign = 'center';
  
  ctx.font = '700 80px Oswald, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(typeLabel, W / 2, cursorY);
  
  ctx.font = '500 32px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(displayDate, W / 2, cursorY + 60);
  
  ctx.font = '500 24px Inter, sans-serif';
  ctx.fillStyle = '#f97316';
  ctx.fillText(`${data.calories} KCAL BURNED`, W / 2, cursorY + 120);
}

export function CardioShareModal({ data, onClose }: Props) {
  const { showToast } = useUIStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState<string>('');
  const [transparent, setTransparent] = useState(false);
  const [didCopy, setDidCopy] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      drawCardioCard(canvasRef.current, data, transparent);
      setDataUrl(canvasRef.current.toDataURL('image/png'));
    }
  }, [data, transparent]);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.download = `apparatus-${data.type}-${format(new Date(data.date), 'yyyy-MM-dd')}.png`;
    link.href = dataUrl;
    link.click();
    showToast('Saved to camera roll', 'success');
  };

  const handleShare = async () => {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'workout.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'My Workout',
          text: `Check out my ${data.type} on Apparatus!`,
        });
      } else {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setDidCopy(true);
        setTimeout(() => setDidCopy(false), 2000);
        showToast('Image copied to clipboard!', 'success');
      }
    } catch (err) {
      console.error(err);
      showToast('Could not share image', 'error');
    }
  };

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[999] flex flex-col bg-black/90 backdrop-blur-sm touch-none">
        {/* Header */}
        <div className="flex items-center justify-between p-4 safe-top shrink-0">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          >
            <X size={20} />
          </button>
          <div className="font-display text-white text-lg tracking-wider uppercase">Share {data.type}</div>
          <div className="w-10" />
        </div>

        {/* Canvas Preview Area */}
        <div className="flex-1 min-h-0 relative p-4 flex items-center justify-center">
          <canvas ref={canvasRef} className="hidden" />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={`relative max-h-full aspect-[9/16] rounded-3xl overflow-hidden shadow-2xl ${transparent ? 'bg-black/20' : ''}`}
            style={{ 
              backgroundImage: transparent ? 'repeating-conic-gradient(#333 0% 25%, transparent 0% 50%)' : 'none',
              backgroundSize: '20px 20px'
            }}
          >
            {dataUrl && (
              <img src={dataUrl} alt="Share preview" className="w-full h-full object-contain" />
            )}
          </motion.div>
        </div>

        {/* Controls Area */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 safe-bottom bg-black/40 backdrop-blur-md rounded-t-[32px] border-t border-white/10 shrink-0"
        >
          {/* Options */}
          <div className="flex items-center justify-center mb-6">
            <button
              onClick={() => setTransparent(!transparent)}
              className={`px-4 py-2 rounded-full font-mono text-xs uppercase tracking-wider transition-colors border ${
                transparent 
                  ? 'border-sienna text-sienna bg-sienna/10' 
                  : 'border-white/20 text-white hover:bg-white/10'
              }`}
            >
              Transparent Background
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
            <button
              onClick={handleDownload}
              className="flex items-center justify-center gap-2 bg-white/10 text-white rounded-xl py-3.5 hover:bg-white/20 transition-colors"
            >
              <Download size={18} />
              <span className="font-bold text-sm tracking-wide">Save Image</span>
            </button>

            <button
              onClick={handleShare}
              className="flex items-center justify-center gap-2 bg-sienna text-white rounded-xl py-3.5 hover:bg-sienna/90 transition-colors shadow-lg"
            >
              {didCopy ? <Check size={18} /> : <Share2 size={18} />}
              <span className="font-bold text-sm tracking-wide">{didCopy ? 'Copied!' : 'Share'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
