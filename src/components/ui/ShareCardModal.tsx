import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share2, Check, Image as ImageIcon, List } from 'lucide-react';
import { getActiveMuscles, calculateShareVolume, calculateTotalSets } from '@/lib/muscle-map';
import { drawAnatomyOnCanvas, ACTIVE_ORANGE } from '@/components/ui/AnatomySvg';
import type { MuscleRegion } from '@/lib/muscle-map';

export interface ShareCardData {
  dayTitle: string;
  planTitle: string;
  date: string;
  durationMin: number;
  calories: number;
  volume?: number;
  sets?: number;
  exerciseNames: string[];
  exerciseLogs?: Array<{ name: string; sets: Array<{ completed?: boolean; reps?: number; weight?: number; seconds?: number }> }>;
  bodyweight?: number;
}

interface Props {
  data: ShareCardData;
  onClose: () => void;
}

type CardVariant = 'anatomy' | 'exercises';

// ─── Format Helpers ──────────────────────────────────────────
function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatVolume(vol: number): string {
  if (vol >= 10000) return `${(vol / 1000).toFixed(1)}k`;
  if (vol >= 1000) return vol.toLocaleString();
  return `${vol}`;
}

// ─── Canvas Drawing — Anatomy Card ──────────────────────────
function drawAnatomyCard(
  canvas: HTMLCanvasElement,
  data: ShareCardData,
  activeMuscles: Set<MuscleRegion>,
  transparent: boolean,
  volume: number,
  totalSets: number
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
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  }

  let cursorY = 90;

  // ─── Brand Header ───
  // "APPARATUS" logo top left
  ctx.font = '800 56px Oswald, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText('APPARATUS', 80, cursorY);

  // Dumbbell icon top right
  ctx.fillStyle = '#FFFFFF';
  const iconX = W - 140;
  const iconY = cursorY - 36;
  roundRect(ctx, iconX - 10, iconY, 14, 38, 3);
  ctx.fill();
  ctx.fillRect(iconX + 4, iconY + 14, 52, 10);
  roundRect(ctx, iconX + 56, iconY, 14, 38, 3);
  ctx.fill();

  cursorY += 90;

  // ─── Metrics Row ─── (Time | Volume | Sets)
  const stats = [
    { label: 'Time', value: formatDuration(data.durationMin) },
    { label: 'Volume', value: `${formatVolume(volume)} kg` },
    { label: 'Sets', value: `${totalSets}` },
  ];

  const colW = (W - 160) / 3;
  ctx.textAlign = 'left';

  stats.forEach((stat, i) => {
    const sx = 80 + i * colW;

    // Label
    ctx.font = '500 30px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(stat.label, sx, cursorY);

    // Value
    ctx.font = '700 68px Oswald, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(stat.value, sx, cursorY + 66);
  });

  cursorY += 140;

  // ─── Dual Muscle Visualizer (Front Left, Back Right) ───
  const figureScale = 4.2;
  const figureW = 100 * figureScale; // ANATOMY_WIDTH is 100
  const figureH = 220 * figureScale; // ANATOMY_HEIGHT is 220
  const gap = 80;
  const totalW = figureW * 2 + gap;
  const startX = (W - totalW) / 2;
  const figureY = cursorY + 30;

  // Front View on Left, Back View on Right (Standard Anatomy Presentation)
  drawAnatomyOnCanvas(ctx, 'front', activeMuscles, startX, figureY, figureScale);
  drawAnatomyOnCanvas(ctx, 'back', activeMuscles, startX + figureW + gap, figureY, figureScale);

  cursorY = figureY + figureH + 60;

  // ─── Workout Title ───
  ctx.font = '700 52px Oswald, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  const titleDisplay = data.dayTitle.length > 40 ? data.dayTitle.substring(0, 37) + '...' : data.dayTitle;
  ctx.fillText(titleDisplay.toUpperCase(), W / 2, cursorY);

  cursorY += 56;

  // ─── Calories Burned Accent ───
  ctx.font = '400 30px "JetBrains Mono", monospace';
  ctx.fillStyle = ACTIVE_ORANGE;
  ctx.fillText(`${data.calories} kcal burned`, W / 2, cursorY);

  // ─── Bottom Watermark ───
  ctx.font = '400 24px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.textAlign = 'center';
  ctx.fillText('Tracked with APPARATUS', W / 2, H - 55);
}

// ─── Canvas Drawing — Exercises List Card ─────────────────────
function drawExercisesCard(
  canvas: HTMLCanvasElement,
  data: ShareCardData,
  transparent: boolean,
  volume: number,
  totalSets: number
) {
  const W = 1080;
  const H = 1920;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  if (transparent) {
    ctx.clearRect(0, 0, W, H);
  } else {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  }

  let cursorY = 90;

  // Header
  ctx.font = '800 56px Oswald, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText('APPARATUS', 80, cursorY);

  ctx.fillStyle = '#FFFFFF';
  const iconX = W - 140;
  const iconY = cursorY - 36;
  roundRect(ctx, iconX - 10, iconY, 14, 38, 3);
  ctx.fill();
  ctx.fillRect(iconX + 4, iconY + 14, 52, 10);
  roundRect(ctx, iconX + 56, iconY, 14, 38, 3);
  ctx.fill();

  cursorY += 90;

  // Workout Title
  ctx.font = '700 72px Oswald, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  const titleLines = wrapText(ctx, data.dayTitle.toUpperCase(), 80, W - 160, 84, 3);
  titleLines.forEach((line, i) => {
    ctx.fillText(line, 80, cursorY + i * 84);
  });
  cursorY += titleLines.length * 84 + 20;

  // Subtitle
  ctx.font = '400 28px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText(data.planTitle, 80, cursorY);
  cursorY += 36;
  ctx.fillText(data.date, 80, cursorY);
  cursorY += 60;

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(80, cursorY, W - 160, 2);
  cursorY += 40;

  // Metrics
  const stats = [
    { label: 'TIME', value: formatDuration(data.durationMin) },
    { label: 'VOLUME', value: `${formatVolume(volume)} kg` },
    { label: 'SETS', value: `${totalSets}` },
    { label: 'KCAL', value: `${data.calories}` },
  ];

  const colW = (W - 160) / 4;
  stats.forEach((stat, i) => {
    const sx = 80 + i * colW;

    ctx.font = '400 22px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign = 'left';
    ctx.fillText(stat.label, sx, cursorY);

    ctx.font = '700 52px Oswald, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(stat.value, sx, cursorY + 52);
  });
  cursorY += 100;

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(80, cursorY, W - 160, 2);
  cursorY += 40;

  // Exercises
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.textAlign = 'left';
  ctx.fillText('EXERCISES', 80, cursorY);
  cursorY += 40;

  const maxExercises = Math.min(data.exerciseNames.length, 12);
  for (let i = 0; i < maxExercises; i++) {
    ctx.beginPath();
    ctx.arc(98, cursorY + 4, 8, 0, Math.PI * 2);
    ctx.fillStyle = ACTIVE_ORANGE;
    ctx.fill();

    ctx.font = '500 32px Inter, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    const exName = data.exerciseNames[i].length > 38
      ? data.exerciseNames[i].substring(0, 35) + '...'
      : data.exerciseNames[i];
    ctx.fillText(exName, 122, cursorY + 12);

    cursorY += 56;
  }

  if (data.exerciseNames.length > maxExercises) {
    ctx.font = '400 28px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(`+ ${data.exerciseNames.length - maxExercises} more`, 122, cursorY + 12);
  }

  // Watermark
  ctx.font = '400 22px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.textAlign = 'center';
  ctx.fillText('Tracked with APPARATUS', W / 2, H - 50);
}

// ─── Helpers ─────────────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, maxWidth: number, lineHeight: number, maxLines: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const test = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines) break;
    } else {
      currentLine = test;
    }
  }
  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }
  return lines;
}

// ─── Component ───────────────────────────────────────────────
export function ShareCardModal({ data, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [variant, setVariant] = useState<CardVariant>('anatomy');
  const [transparent, setTransparent] = useState(false);

  // Compute active muscles
  const activeMuscles = getActiveMuscles(data.exerciseNames);

  // Robust Volume calculation with fallback
  let volume = 0;
  if (data.exerciseLogs && data.exerciseLogs.length > 0) {
    volume = calculateShareVolume(data.exerciseLogs, data.bodyweight || 70);
  }
  if (volume === 0 && data.volume && data.volume > 0) {
    volume = data.volume;
  }
  if (volume === 0 && data.exerciseNames && data.exerciseNames.length > 0) {
    volume = data.exerciseNames.length * 3 * (data.bodyweight || 70);
  }

  // Robust Sets calculation with fallback
  let totalSets = 0;
  if (data.exerciseLogs && data.exerciseLogs.length > 0) {
    totalSets = calculateTotalSets(data.exerciseLogs);
  }
  if (totalSets === 0 && data.sets && data.sets > 0) {
    totalSets = data.sets;
  }
  if (totalSets === 0 && data.exerciseNames && data.exerciseNames.length > 0) {
    totalSets = data.exerciseNames.length * 3;
  }
  if (totalSets === 0) {
    totalSets = 3;
  }

  useEffect(() => {
    if (!canvasRef.current) return;

    if (variant === 'anatomy') {
      drawAnatomyCard(canvasRef.current, data, activeMuscles, transparent, volume, totalSets);
    } else {
      drawExercisesCard(canvasRef.current, data, transparent, volume, totalSets);
    }
    setPreviewUrl(canvasRef.current.toDataURL('image/png'));
  }, [data, variant, transparent, volume, totalSets]);

  const getBlob = (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      canvasRef.current?.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      }, 'image/png');
    });
  };

  const handleShare = async () => {
    setSharing(true);
    try {
      const blob = await getBlob();
      const file = new File([blob], 'apparatus-workout.png', { type: 'image/png' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `${data.dayTitle} — Apparatus`,
          text: `Crushed it 💪 Tracked with Apparatus`,
          files: [file],
        });
      } else {
        handleDownload();
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = async () => {
    try {
      const blob = await getBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `apparatus-${data.dayTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/95 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative z-10 w-full max-w-lg flex flex-col max-h-[95vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-xl text-bone">Share Workout</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-ink-2 border border-line flex items-center justify-center text-bone-dim hover:text-bone transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Controls Bar */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setVariant('anatomy')}
              className={`flex items-center gap-1.5 text-xs font-mono py-1.5 px-3 rounded transition-all ${
                variant === 'anatomy'
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'text-bone-dim border border-line hover:text-bone'
              }`}
            >
              <ImageIcon size={13} />
              Muscles
            </button>
            <button
              onClick={() => setVariant('exercises')}
              className={`flex items-center gap-1.5 text-xs font-mono py-1.5 px-3 rounded transition-all ${
                variant === 'exercises'
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'text-bone-dim border border-line hover:text-bone'
              }`}
            >
              <List size={13} />
              Exercises
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setTransparent(!transparent)}
              className={`text-xs font-mono py-1.5 px-3 rounded transition-all ${
                transparent
                  ? 'bg-amber/10 text-amber border border-amber/30'
                  : 'text-bone-dim border border-line hover:text-bone'
              }`}
            >
              {transparent ? 'Transparent' : 'Dark BG'}
            </button>
          </div>

          {/* Preview Window */}
          <div className={`flex-1 overflow-y-auto rounded-xl border border-line/30 mb-3 ${transparent ? 'bg-[repeating-conic-gradient(#222_0%_25%,#1a1a1a_0%_50%)_0_0/20px_20px]' : 'bg-black'}`}>
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Share card preview"
                className="w-full rounded-xl"
              />
            ) : (
              <div className="flex items-center justify-center h-48 text-bone-dim text-sm font-mono">
                Generating card...
              </div>
            )}
          </div>

          {/* Hidden Canvas */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleShare}
              disabled={sharing || !previewUrl}
              className="flex flex-col items-center gap-1.5 bg-white text-black font-display font-bold uppercase tracking-wider px-3 py-3 rounded-lg text-xs hover:bg-white/90 active:scale-[0.97] transition-all disabled:opacity-50"
            >
              <Share2 size={18} />
              <span className="text-[10px]">{sharing ? '...' : 'Share'}</span>
            </button>

            <button
              onClick={handleDownload}
              disabled={!previewUrl}
              className="flex flex-col items-center gap-1.5 bg-ink-3 border border-line text-bone font-display font-bold uppercase tracking-wider px-3 py-3 rounded-lg text-xs hover:border-white/30 active:scale-[0.97] transition-all disabled:opacity-50"
            >
              <Download size={18} />
              <span className="text-[10px]">Save</span>
            </button>

            <button
              onClick={handleCopyLink}
              disabled={!previewUrl}
              className="flex flex-col items-center gap-1.5 bg-ink-3 border border-line text-bone font-display font-bold uppercase tracking-wider px-3 py-3 rounded-lg text-xs hover:border-white/30 active:scale-[0.97] transition-all disabled:opacity-50"
            >
              {copied ? <Check size={18} className="text-teal" /> : <Share2 size={18} />}
              <span className="text-[10px]">{copied ? 'Copied' : 'Link'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
