import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share2, Check, Image as ImageIcon, List } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { getActiveMuscles, getActiveMusclesFromLogs, calculateShareVolume, calculateBodyweightReps, calculateTotalSets } from '@/lib/muscle-map';
import { calculateWorkoutCalories } from '@/lib/calories';
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

type CardVariant = 'anatomy' | 'exercises' | 'combined';

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

function formatVolumeStat(vol: number, bodyweightReps: number, bodyweight?: number, units?: 'metric' | 'imperial'): string {
  if (vol > 0) return `${formatVolume(vol)} kg`;
  if (bodyweightReps > 0) {
    return `${bodyweightReps} reps @ BW`;
  }
  return 'Bodyweight';
}

// ─── Canvas Drawing — Anatomy Card ──────────────────────────
function drawAnatomyCard(
  canvas: HTMLCanvasElement,
  data: ShareCardData,
  activeMuscles: Set<MuscleRegion>,
  transparent: boolean,
  volume: number,
  totalSets: number,
  highlightColor: HighlightColor,
  units?: 'metric' | 'imperial',
  gender: 'male' | 'female' = 'male'
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
  drawCardHeader(ctx, W, cursorY, highlightColor);
  cursorY += 100;

  // ─── Metrics Row ─── (Time | Volume | Sets)
  const stats = [
    { label: 'Time', value: formatDuration(data.durationMin) },
    { label: 'Volume', value: formatVolumeStat(volume, calculateBodyweightReps(data.exerciseLogs || []), data.bodyweight, units) },
    { label: 'Sets', value: `${totalSets}` },
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

  cursorY += 140;

  // ─── Dual Muscle Visualizer (Front Left, Back Right) ───
  const figureScale = 0.65;
  const figureW = 727 * figureScale;
  const figureH = 1280 * figureScale;
  const gap = 30;
  const totalW = figureW * 2 + gap;
  const startX = (W - totalW) / 2;
  const figureY = cursorY + 20;

  // Front View on Left, Back View on Right (Standard Anatomy Presentation)
  drawAnatomyOnCanvas(ctx, 'front', activeMuscles, startX, figureY, figureScale, highlightColor.fill, highlightColor.glow, gender);
  drawAnatomyOnCanvas(ctx, 'back', activeMuscles, startX + figureW + gap, figureY, figureScale, highlightColor.fill, highlightColor.glow, gender);

  cursorY = figureY + figureH + 50;

  // ─── Workout Title ───
  ctx.font = '700 52px Oswald, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  const titleDisplay = data.dayTitle.length > 40 ? data.dayTitle.substring(0, 37) + '...' : data.dayTitle;
  ctx.fillText(titleDisplay.toUpperCase(), W / 2, cursorY);

  cursorY += 56;

  // ─── Calories Burned Accent ───
  ctx.font = '400 30px "JetBrains Mono", monospace';
  ctx.fillStyle = highlightColor.fill;
  ctx.fillText(`${data.calories} kcal burned`, W / 2, cursorY);

  // ─── Bottom Watermark ───
  ctx.font = '400 24px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.textAlign = 'center';
  ctx.fillText('Tracked with APPARATUS', W / 2, H - 55);
}

// ─── Shared Icon & Branding Drawers ───────────────────────────
function drawDumbbellIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save();
  // Central bar
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x - 30, y - 3, 60, 6);

  // Inner collars
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(x - 18, y - 8, 4, 16);
  ctx.fillRect(x + 14, y - 8, 4, 16);

  // Outer plates (rounded plates in theme accent color)
  ctx.fillStyle = color;
  roundRect(ctx, x - 14, y - 20, 10, 40, 4);
  ctx.fill();
  roundRect(ctx, x + 4, y - 20, 10, 40, 4);
  ctx.fill();

  // Smaller outer plates (white)
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, x - 26, y - 14, 8, 28, 3);
  ctx.fill();
  roundRect(ctx, x + 18, y - 14, 8, 28, 3);
  ctx.fill();

  ctx.restore();
}

function drawCardHeader(ctx: CanvasRenderingContext2D, W: number, cursorY: number, highlightColor: HighlightColor) {
  ctx.save();
  ctx.textAlign = 'left';
  // Futuristic geometric monospace look with custom letter-spacing
  ctx.letterSpacing = '8px';
  ctx.font = '400 48px "Suez One", serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('APPARATUS', 80, cursorY);
  ctx.restore();

  // Draw modern dumbbell logo
  const iconX = W - 140;
  drawDumbbellIcon(ctx, iconX, cursorY - 14, highlightColor.fill);
}

function drawExercisePill(
  ctx: CanvasRenderingContext2D,
  cardX: number,
  cardY: number,
  cardW: number,
  cardH: number,
  exName: string,
  highlightColor: HighlightColor,
  exLog: any
) {
  // Draw card background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  roundRect(ctx, cardX, cardY, cardW, cardH, 8);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw left accent bar in highlight color
  ctx.fillStyle = highlightColor.fill;
  roundRect(ctx, cardX, cardY, 6, cardH, 2);
  ctx.fill();

  // Display name
  ctx.font = '700 32px Oswald, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  const displayName = exName.length > 22 ? exName.substring(0, 20) + '...' : exName;
  ctx.fillText(displayName.toUpperCase(), cardX + 28, cardY + 48);

  // Display sets info
  ctx.font = '400 20px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  const setsCount = exLog ? exLog.sets.length : 3;
  ctx.fillText(`${setsCount} SETS COMPLETED`, cardX + 28, cardY + cardH - 24);
}

function drawMoreExercisesPill(
  ctx: CanvasRenderingContext2D,
  cardX: number,
  cardY: number,
  cardW: number,
  cardH: number,
  moreCount: number,
  highlightColor: HighlightColor
) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  roundRect(ctx, cardX, cardY, cardW, cardH, 8);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = highlightColor.fill;
  roundRect(ctx, cardX, cardY, 6, cardH, 2);
  ctx.fill();

  ctx.font = '700 34px Oswald, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText(`+${moreCount} MORE EXERCISES`, cardX + 28, cardY + cardH / 2 + 12);
}

// ─── Canvas Drawing — Exercises List Card ─────────────────────
function drawExercisesCard(
  canvas: HTMLCanvasElement,
  data: ShareCardData,
  transparent: boolean,
  volume: number,
  totalSets: number,
  highlightColor: HighlightColor,
  units?: 'metric' | 'imperial',
  calories?: number
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
  drawCardHeader(ctx, W, cursorY, highlightColor);
  cursorY += 90;

  // Workout Title (Futuristic & larger since no anatomy visualizer)
  ctx.font = '700 76px Oswald, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  const titleLines = wrapText(ctx, data.dayTitle.toUpperCase(), 80, W - 160, 88, 3);
  titleLines.forEach((line, i) => {
    ctx.fillText(line, 80, cursorY + i * 88);
  });
  cursorY += titleLines.length * 88 + 20;

  // Subtitle
  ctx.font = '400 28px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText(`${data.planTitle} • ${data.date}`, 80, cursorY);
  cursorY += 50;

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(80, cursorY, W - 160, 2);
  cursorY += 40;

  // Metrics (4 Columns)
  const stats = [
    { label: 'TIME', value: formatDuration(data.durationMin) },
    { label: 'VOLUME', value: formatVolumeStat(volume, calculateBodyweightReps(data.exerciseLogs || []), data.bodyweight, units) },
    { label: 'SETS', value: `${totalSets}` },
    { label: 'KCAL', value: `${calories !== undefined ? calories : data.calories}` },
  ];

  const colPositions = [80, 250, 620, 820];
  stats.forEach((stat, i) => {
    const sx = colPositions[i];
    ctx.font = '400 22px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign = 'left';
    ctx.fillText(stat.label, sx, cursorY);

    const maxValWidth = (colPositions[i + 1] !== undefined ? colPositions[i + 1] : W - 80) - sx - 20;
    let fontSize = 52;
    ctx.font = `700 ${fontSize}px Oswald, sans-serif`;
    let textWidth = ctx.measureText(stat.value).width;
    while (textWidth > maxValWidth && fontSize > 20) {
      fontSize -= 2;
      ctx.font = `700 ${fontSize}px Oswald, sans-serif`;
      textWidth = ctx.measureText(stat.value).width;
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(stat.value, sx, cursorY + 52);
  });
  cursorY += 120;

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(80, cursorY, W - 160, 2);
  cursorY += 40;

  // Exercises Section Header
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillStyle = highlightColor.fill;
  ctx.textAlign = 'left';
  ctx.fillText('CRUSHED MOVES', 80, cursorY);
  cursorY += 40;

  // 2-Column Grid of Exercises (Fits up to 14 pills)
  const maxExercises = 14;
  const items = data.exerciseNames.slice(0, maxExercises);
  const cardH = 114;
  const cardW = 440;
  const rowGap = 20;
  const colGap = 40;

  items.forEach((exName, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const cardX = 80 + col * (cardW + colGap);
    const cardY = cursorY + row * (cardH + rowGap);

    const isLastSlot = index === maxExercises - 1;
    const hasMore = data.exerciseNames.length > maxExercises;

    if (isLastSlot && hasMore) {
      drawMoreExercisesPill(ctx, cardX, cardY, cardW, cardH, data.exerciseNames.length - maxExercises + 1, highlightColor);
    } else {
      const exLog = data.exerciseLogs?.find(l => l.name === exName);
      drawExercisePill(ctx, cardX, cardY, cardW, cardH, exName, highlightColor, exLog);
    }
  });

  // Watermark
  ctx.font = '400 22px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.textAlign = 'center';
  ctx.fillText('Tracked with APPARATUS', W / 2, H - 50);
}

// ─── Highlight Color Types & Presets ─────────────────────────
export interface HighlightColor {
  name: string;
  fill: string;
  glow: string;
  stroke: string;
}

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  // Neon Colors
  { name: 'Orange', fill: '#FF5500', glow: '#FF7700', stroke: '#FFAA66' },
  { name: 'Volt', fill: '#CCFF00', glow: '#AAFF00', stroke: '#E5FF80' },
  { name: 'Pink', fill: '#FF007F', glow: '#FF3399', stroke: '#FF80BF' },
  { name: 'Cyan', fill: '#00E5FF', glow: '#00B0FF', stroke: '#80F2FF' },
  { name: 'Gold', fill: '#FFD700', glow: '#FFAA00', stroke: '#FFEAA3' },
  // Soft Pastel & Light Colors
  { name: 'Mint', fill: '#98FF98', glow: '#76D876', stroke: '#C2FFC2' },
  { name: 'Ice', fill: '#A0E6FF', glow: '#82D1F5', stroke: '#D4F5FF' },
  { name: 'Lavender', fill: '#E0B0FF', glow: '#D6A2E8', stroke: '#F3E5FF' },
  { name: 'Coral', fill: '#FF7F50', glow: '#FF6347', stroke: '#FFB399' },
  { name: 'Cream', fill: '#FFFDD0', glow: '#E6D8A8', stroke: '#FFFFE0' },
  { name: 'Violet', fill: '#A066FF', glow: '#8E4DFF', stroke: '#D1B8FF' },
  { name: 'Teal', fill: '#20B2AA', glow: '#008B8B', stroke: '#7FFFD4' },
];

// ─── Canvas Drawing — Combined Muscles + Exercises Card ───────
function drawCombinedCard(
  canvas: HTMLCanvasElement,
  data: ShareCardData,
  activeMuscles: Set<MuscleRegion>,
  transparent: boolean,
  volume: number,
  totalSets: number,
  highlightColor: HighlightColor,
  units?: 'metric' | 'imperial',
  calories?: number,
  gender: 'male' | 'female' = 'male'
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

  // ─── Brand Header ───
  drawCardHeader(ctx, W, cursorY, highlightColor);
  cursorY += 100;

  // ─── Workout Title ───
  ctx.font = '700 68px Oswald, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  const titleLines = wrapText(ctx, data.dayTitle.toUpperCase(), W / 2, W - 160, 78, 2);
  titleLines.forEach((line, i) => {
    ctx.fillText(line, W / 2, cursorY + i * 78);
  });
  cursorY += titleLines.length * 78 + 10;

  // ─── Subtitle / Date ───
  ctx.font = '400 24px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.textAlign = 'center';
  ctx.fillText(`${data.planTitle} • ${data.date}`, W / 2, cursorY);
  cursorY += 50;

  // ─── Divider ───
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(80, cursorY, W - 160, 2);
  cursorY += 40;

  // ─── Metrics Grid (4 columns) ───
  const stats = [
    { label: 'TIME', value: formatDuration(data.durationMin) },
    { label: 'VOLUME', value: formatVolumeStat(volume, calculateBodyweightReps(data.exerciseLogs || []), data.bodyweight, units) },
    { label: 'SETS', value: `${totalSets}` },
    { label: 'KCAL', value: `${calories !== undefined ? calories : data.calories}` },
  ];

  const colPositions = [80, 250, 620, 820];
  stats.forEach((stat, i) => {
    const sx = colPositions[i];
    ctx.textAlign = 'left';

    ctx.font = '400 20px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(stat.label, sx, cursorY);

    const maxValWidth = (colPositions[i + 1] !== undefined ? colPositions[i + 1] : W - 80) - sx - 20;
    let fontSize = 48;
    ctx.font = `700 ${fontSize}px Oswald, sans-serif`;
    let textWidth = ctx.measureText(stat.value).width;
    while (textWidth > maxValWidth && fontSize > 20) {
      fontSize -= 2;
      ctx.font = `700 ${fontSize}px Oswald, sans-serif`;
      textWidth = ctx.measureText(stat.value).width;
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(stat.value, sx, cursorY + 48);
  });
  cursorY += 110;

  // ─── Divider ───
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(80, cursorY, W - 160, 2);
  cursorY += 30;

  // ─── Dual Muscle Visualizer ───
  const figureScale = 0.65;
  const figureW = 727 * figureScale;
  const figureH = 1280 * figureScale;
  const gap = 40;
  const totalW = figureW * 2 + gap;
  const startX = (W - totalW) / 2;
  const figureY = cursorY + 20;

  drawAnatomyOnCanvas(ctx, 'front', activeMuscles, startX, figureY, figureScale, highlightColor.fill, highlightColor.glow, gender);
  drawAnatomyOnCanvas(ctx, 'back', activeMuscles, startX + figureW + gap, figureY, figureScale, highlightColor.fill, highlightColor.glow, gender);

  cursorY = figureY + figureH + 60;

  // ─── Exercises Section Header ───
  ctx.font = '700 22px "JetBrains Mono", monospace';
  ctx.fillStyle = highlightColor.fill;
  ctx.textAlign = 'left';
  ctx.fillText('CRUSHED MOVES', 80, cursorY);

  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(80, cursorY + 12, W - 160, 2);
  cursorY += 50;

  // ─── Grid of Exercises (2 Columns, up to 6 cards) ───
  const maxExercises = 6;
  const items = data.exerciseNames.slice(0, maxExercises);
  const cardH = 114;
  const cardW = 440;
  const rowGap = 20;
  const colGap = 40;

  items.forEach((exName, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const cardX = 80 + col * (cardW + colGap);
    const cardY = cursorY + row * (cardH + rowGap);

    const isLastSlot = index === maxExercises - 1;
    const hasMore = data.exerciseNames.length > maxExercises;

    if (isLastSlot && hasMore) {
      drawMoreExercisesPill(ctx, cardX, cardY, cardW, cardH, data.exerciseNames.length - maxExercises + 1, highlightColor);
    } else {
      const exLog = data.exerciseLogs?.find(l => l.name === exName);
      drawExercisePill(ctx, cardX, cardY, cardW, cardH, exName, highlightColor, exLog);
    }
  });

  // ─── Bottom Watermark ───
  ctx.font = '400 22px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.textAlign = 'center';
  ctx.fillText('Tracked with APPARATUS', W / 2, H - 45);
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
  const { units } = useUIStore();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [variant, setVariant] = useState<CardVariant>('combined'); // Default to combined!
  const [transparent, setTransparent] = useState(false);
  const [anatomyGender, setAnatomyGender] = useState<'male' | 'female'>('male');
  const [selectedColor, setSelectedColor] = useState<HighlightColor>(HIGHLIGHT_COLORS[0]);
  const [colorDropdownOpen, setColorDropdownOpen] = useState(false);

  // Completed set logs are authoritative. Older activity records may only
  // contain exercise names, so retain the name-based fallback for those.
  const activeMuscles = data.exerciseLogs !== undefined
    ? getActiveMusclesFromLogs(data.exerciseLogs)
    : getActiveMuscles(data.exerciseNames);

  // Robust Volume calculation with fallback
  let volume = 0;
  if (data.exerciseLogs !== undefined) {
    volume = calculateShareVolume(data.exerciseLogs, data.bodyweight || 70);
  }
  if (data.exerciseLogs === undefined && data.volume && data.volume > 0) {
    volume = data.volume;
  }

  // Recalculate calories dynamically using MET formula
  const calculatedCalories = data.exerciseLogs !== undefined && data.exerciseLogs.length > 0
    ? calculateWorkoutCalories(null, data.exerciseLogs as any, data.bodyweight || 70, data.durationMin)
    : data.calories || 0;

  // Robust Sets calculation with fallback
  let totalSets = 0;
  if (data.exerciseLogs !== undefined) {
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
      drawAnatomyCard(canvasRef.current, data, activeMuscles, transparent, volume, totalSets, selectedColor, units, anatomyGender);
    } else if (variant === 'exercises') {
      drawExercisesCard(canvasRef.current, data, transparent, volume, totalSets, selectedColor, units, calculatedCalories);
    } else {
      drawCombinedCard(canvasRef.current, data, activeMuscles, transparent, volume, totalSets, selectedColor, units, calculatedCalories, anatomyGender);
    }
    setPreviewUrl(canvasRef.current.toDataURL('image/png'));
  }, [data, variant, transparent, volume, totalSets, selectedColor, units, calculatedCalories, anatomyGender]);
  const getBlob = (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      if (!canvasRef.current) {
        reject(new Error('Share card is still generating'));
        return;
      }
      canvasRef.current.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      }, 'image/png');
    });
  };

  const getBlobSynchronously = (): Blob => {
    if (!canvasRef.current) throw new Error('Share card is still generating');
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const encoded = dataUrl.split(',')[1];
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: 'image/png' });
  };

  const downloadBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apparatus-${data.dayTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleShare = async () => {
    setSharing(true);
    try {
      // Convert synchronously so navigator.share is called during the
      // original click gesture on mobile browsers.
      const blob = getBlobSynchronously();
      const file = new File([blob], 'apparatus-workout.png', { type: 'image/png' });

      const canShareFiles = typeof navigator.share === 'function'
        && (!navigator.canShare || navigator.canShare({ files: [file] }));
      if (canShareFiles) {
        await navigator.share({
          title: `${data.dayTitle} — Apparatus`,
          text: `Crushed it 💪 Tracked with Apparatus`,
          files: [file],
        });
      } else {
        downloadBlob(blob);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Share failed:', err);
        try {
          downloadBlob(getBlobSynchronously());
        } catch (fallbackError) {
          console.error('Share fallback failed:', fallbackError);
        }
      }
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = async () => {
    try {
      downloadBlob(await getBlob());
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

  return createPortal(
    (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/95 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 50 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 50 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="relative z-10 w-full max-w-lg flex flex-col h-[90vh] md:h-auto md:max-h-[95vh] bg-ink-1 rounded-t-2xl md:rounded-2xl border-t border-line/20 md:border border-line/30 p-4 pb-6 md:pb-4"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <h2 className="font-display text-xl text-bone">Share Workout</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-ink-2 border border-line flex items-center justify-center text-bone-dim hover:text-bone transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Controls Bar (Swipeable on Mobile) */}
          <div className="flex gap-1.5 mb-2 overflow-x-auto scrollbar-none flex-nowrap pb-1 -mx-2 px-2 flex-shrink-0">
            <button
              onClick={() => setVariant('combined')}
              className={`flex items-center gap-1.5 text-xs font-mono py-1.5 px-3 rounded-lg transition-all flex-shrink-0 ${
                variant === 'combined'
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'text-bone-dim border border-line/20 hover:text-bone bg-ink-3/30'
              }`}
            >
              <ImageIcon size={13} />
              <span>Combined Layout</span>
            </button>
            <button
              onClick={() => setVariant('anatomy')}
              className={`flex items-center gap-1.5 text-xs font-mono py-1.5 px-3 rounded-lg transition-all flex-shrink-0 ${
                variant === 'anatomy'
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'text-bone-dim border border-line/20 hover:text-bone bg-ink-3/30'
              }`}
            >
              <ImageIcon size={13} />
              <span>Muscles Only</span>
            </button>
            <button
              onClick={() => setVariant('exercises')}
              className={`flex items-center gap-1.5 text-xs font-mono py-1.5 px-3 rounded-lg transition-all flex-shrink-0 ${
                variant === 'exercises'
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'text-bone-dim border border-line/20 hover:text-bone bg-ink-3/30'
              }`}
            >
              <List size={13} />
              <span>Exercises Only</span>
            </button>
          </div>

          {/* Secondary Controls: BG Toggler + Gender Selector + Custom Color Dropdown */}
          <div className="flex gap-2 mb-3 items-center flex-shrink-0 flex-wrap sm:flex-nowrap">
            <button
              onClick={() => setTransparent(!transparent)}
              className={`text-xs font-mono py-2 px-3 rounded-lg transition-all flex-shrink-0 ${
                transparent
                  ? 'bg-amber/10 text-amber border border-amber/30'
                  : 'text-bone-dim border border-line/20 hover:text-bone bg-ink-3/45'
              }`}
            >
              {transparent ? 'Transparent BG' : 'Dark BG'}
            </button>

            {/* Model Gender Selector */}
            <div className="flex items-center rounded-lg border border-line/20 bg-ink-3/45 p-0.5 text-xs font-mono shrink-0">
              <button
                type="button"
                onClick={() => setAnatomyGender('male')}
                className={`px-2.5 py-1.5 rounded-md transition-all ${
                  anatomyGender === 'male'
                    ? 'bg-sienna/20 text-sienna font-bold border border-sienna/30'
                    : 'text-bone-dim hover:text-bone'
                }`}
              >
                Male ♂
              </button>
              <button
                type="button"
                onClick={() => setAnatomyGender('female')}
                className={`px-2.5 py-1.5 rounded-md transition-all ${
                  anatomyGender === 'female'
                    ? 'bg-danger/20 text-danger font-bold border border-danger/30'
                    : 'text-bone-dim hover:text-bone'
                }`}
              >
                Female ♀
              </button>
            </div>

            {/* Accent Color Custom Dropdown */}
            <div className="relative flex-1">
              <button
                onClick={() => setColorDropdownOpen(!colorDropdownOpen)}
                className="w-full flex items-center justify-between bg-ink-3/45 border border-line/20 rounded-lg px-3 py-2 text-xs font-mono text-bone-dim hover:text-bone transition-all"
              >
                <span className="flex items-center gap-2">
                  <span className="text-[10px] tracking-wider uppercase text-bone-dim">Color:</span>
                  <span className="w-3.5 h-3.5 rounded-full inline-block border border-white/10" style={{ backgroundColor: selectedColor.fill }} />
                  <span className="text-bone font-medium">{selectedColor.name}</span>
                </span>
                <span className="text-bone-dim text-[10px] transition-transform duration-200" style={colorDropdownOpen ? { transform: 'rotate(180deg)' } : undefined}>▼</span>
              </button>

              {colorDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setColorDropdownOpen(false)} />
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-ink-2 border border-line/30 rounded-xl shadow-2xl max-h-56 overflow-y-auto py-1 backdrop-blur-md">
                    {HIGHLIGHT_COLORS.map((color) => (
                      <button
                        key={color.name}
                        onClick={() => {
                          setSelectedColor(color);
                          setColorDropdownOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-mono text-bone hover:bg-white/5 transition-colors text-left border-b border-line/10 last:border-b-0"
                      >
                        <span className="w-3.5 h-3.5 rounded-full border border-white/10" style={{ backgroundColor: color.fill }} />
                        <span className="font-medium">{color.name}</span>
                        {selectedColor.name === color.name && (
                          <span className="ml-auto text-sienna text-sm">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Preview Window */}
          <div className={`flex-1 min-h-0 overflow-y-auto rounded-xl border border-line/30 mb-3 ${transparent ? 'bg-[repeating-conic-gradient(#222_0%_25%,#1a1a1a_0%_50%)_0_0/20px_20px]' : 'bg-black'}`}>
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
          <div className="grid grid-cols-3 gap-2 flex-shrink-0">
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
              {copied ? <Check size={18} className="text-sienna" /> : <Share2 size={18} />}
              <span className="text-[10px]">{copied ? 'Copied' : 'Link'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
    ),
    document.body,
  );
}
