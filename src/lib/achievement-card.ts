
import { BRAND } from '@/lib/brand';/** Canvas renderer for shareable achievement cards (1080px wide PNG). */

export type CardFormat = 'post' | 'story' | 'square';
export type CardTheme = 'gold' | 'ember' | 'midnight' | 'light';

export interface AchievementCardData {
  id: string;
  icon: string;
  name: string;
  desc: string;
  category: string;
  earned: boolean;
  progress?: { value: number; target: number };
  athleteName: string;
  username: string;
  rankLabel?: string;
  earnedCount: number;
  totalCount: number;
  dateLabel: string;
  stats: { label: string; value: string }[];
}

interface Palette {
  bgFrom: string;
  bgTo: string;
  glow: string;
  accent: string;
  accentHi: string;
  text: string;
  muted: string;
  panel: string;
  medalIn: string;
  medalOut: string;
  onAccent: string;
  sparkle: string;
}

export const CARD_THEMES: Record<CardTheme, Palette & { label: string; swatch: string }> = {
  gold: {
    label: 'Gold', swatch: 'linear-gradient(135deg,#1c140a,#f5c451)',
    bgFrom: '#0b0906', bgTo: '#21170b', glow: 'rgba(245,196,81,0.34)', accent: '#f5c451', accentHi: '#fff1c2',
    text: '#fff8e8', muted: 'rgba(255,248,232,0.62)', panel: 'rgba(245,196,81,0.08)',
    medalIn: '#2b1f0c', medalOut: '#120d05', onAccent: '#1c1407', sparkle: 'rgba(255,230,160,0.55)',
  },
  ember: {
    label: 'Ember', swatch: 'linear-gradient(135deg,#1d0d08,#efad80)',
    bgFrom: '#160905', bgTo: '#5d2a1a', glow: 'rgba(239,173,128,0.32)', accent: '#efad80', accentHi: '#ffe2cc',
    text: '#fdf3ec', muted: 'rgba(253,243,236,0.64)', panel: 'rgba(255,226,204,0.08)',
    medalIn: '#4a2215', medalOut: '#1f0e08', onAccent: '#21130f', sparkle: 'rgba(255,214,190,0.5)',
  },
  midnight: {
    label: 'Midnight', swatch: 'linear-gradient(135deg,#070b16,#7dd3fc)',
    bgFrom: '#060912', bgTo: '#14223f', glow: 'rgba(125,211,252,0.28)', accent: '#7dd3fc', accentHi: '#e0f5ff',
    text: '#eef6ff', muted: 'rgba(238,246,255,0.62)', panel: 'rgba(125,211,252,0.08)',
    medalIn: '#15264a', medalOut: '#080e1d', onAccent: '#06111f', sparkle: 'rgba(190,230,255,0.5)',
  },
  light: {
    label: 'Light', swatch: 'linear-gradient(135deg,#ffffff,#e9dfd5)',
    bgFrom: '#ffffff', bgTo: '#efe7df', glow: 'rgba(93,42,26,0.14)', accent: '#5d2a1a', accentHi: '#a8573a',
    text: '#17191c', muted: 'rgba(23,25,28,0.58)', panel: 'rgba(93,42,26,0.06)',
    medalIn: '#fff8f2', medalOut: '#f1e3d8', onAccent: '#fbe1d1', sparkle: 'rgba(93,42,26,0.18)',
  },
};

export const CARD_FORMATS: Record<CardFormat, { label: string; width: number; height: number }> = {
  post: { label: 'Post', width: 1080, height: 1350 },
  story: { label: 'Story', width: 1080, height: 1920 },
  square: { label: 'Square', width: 1080, height: 1080 },
};

const LAYOUT: Record<CardFormat, { eyebrowY: number; medalY: number; medalR: number; title: number; desc: number; stats: boolean }> = {
  square: { eyebrowY: 160, medalY: 380, medalR: 140, title: 72, desc: 32, stats: false },
  post: { eyebrowY: 175, medalY: 410, medalR: 165, title: 84, desc: 36, stats: true },
  story: { eyebrowY: 330, medalY: 720, medalR: 245, title: 98, desc: 40, stats: true },
};

const SANS = '"Plus Jakarta Sans", "Inter", system-ui, sans-serif';
const BODY = '"Inter", system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const PAD = 90;

export function badgeCategory(id: string): string {
  if (id.startsWith('streak_') || id === 'full_week') return 'Consistency';
  if (id.startsWith('volume_') || id.startsWith('lift_')) return 'Strength';
  if (id.endsWith('_prs') || id === 'first_pr') return 'Records';
  if (id.startsWith('hold_')) return 'Skill';
  if (id.startsWith('cardio_') || id === 'first_cardio' || id.startsWith('distance_') || id.startsWith('total_')) return 'Endurance';
  if (id.startsWith('time_') || id.startsWith('calories_')) return 'Dedication';
  if (id.startsWith('hybrid')) return 'Hybrid';
  return 'Milestone';
}

/** Deterministic pseudo-random numbers so a badge always gets the same sparkle pattern. */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number) {
  if ('letterSpacing' in ctx) (ctx as any).letterSpacing = `${px}px`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, cy: number, seed: string) {
  const bg = ctx.createLinearGradient(0, 0, w * 0.4, h);
  bg.addColorStop(0, p.bgFrom);
  bg.addColorStop(1, p.bgTo);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w / 2, cy, 0, w / 2, cy, w * 0.75);
  glow.addColorStop(0, p.glow);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Fine diagonal lines for texture.
  ctx.save();
  ctx.strokeStyle = p.panel;
  ctx.lineWidth = 2;
  for (let x = -h; x < w; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + h, 0);
    ctx.stroke();
  }
  ctx.restore();

  const rand = seeded(seed);
  ctx.save();
  ctx.fillStyle = p.sparkle;
  for (let i = 0; i < 46; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 1.5 + rand() * 3.5;
    ctx.globalAlpha = 0.25 + rand() * 0.75;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawMedal(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, p: Palette, data: AchievementCardData) {
  // Rays behind the medal.
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 28; i++) {
    ctx.rotate((Math.PI * 2) / 28);
    const ray = ctx.createLinearGradient(0, r * 0.9, 0, r * 1.75);
    ray.addColorStop(0, p.glow);
    ray.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ray;
    ctx.beginPath();
    ctx.moveTo(-10, r * 0.9);
    ctx.lineTo(10, r * 0.9);
    ctx.lineTo(3, r * 1.75);
    ctx.lineTo(-3, r * 1.75);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Tick marks around the rim.
  ctx.save();
  ctx.fillStyle = p.accent;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const rr = r + 30;
    ctx.globalAlpha = i % 6 === 0 ? 0.9 : 0.35;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, i % 6 === 0 ? 4.5 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Disc.
  const disc = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  disc.addColorStop(0, p.medalIn);
  disc.addColorStop(1, p.medalOut);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Rim: full ring when earned, progress arc when still chasing.
  const rim = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  rim.addColorStop(0, p.accentHi);
  rim.addColorStop(0.5, p.accent);
  rim.addColorStop(1, p.accentHi);
  ctx.lineCap = 'round';
  ctx.lineWidth = 14;
  if (data.earned) {
    ctx.strokeStyle = rim;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeStyle = p.panel;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    const pct = data.progress ? Math.min(1, data.progress.value / data.progress.target) : 0;
    if (pct > 0) {
      ctx.strokeStyle = rim;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = p.accent;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Emoji.
  const size = Math.round(r * 0.95);
  ctx.font = `${size}px ${EMOJI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(data.icon);
  const ascent = m.actualBoundingBoxAscent || size * 0.8;
  const descent = m.actualBoundingBoxDescent || size * 0.1;
  ctx.globalAlpha = data.earned ? 1 : 0.55;
  ctx.fillText(data.icon, cx, cy + (ascent - descent) / 2);
  ctx.globalAlpha = 1;

  // Category ribbon over the bottom of the rim.
  const label = data.category.toUpperCase();
  ctx.font = `700 26px ${MONO}`;
  setSpacing(ctx, 5);
  const tw = ctx.measureText(label).width + 64;
  const th = 56;
  const ry = cy + r - th / 2;
  ctx.fillStyle = p.accent;
  roundRect(ctx, cx - tw / 2, ry, tw, th, th / 2);
  ctx.fill();
  ctx.fillStyle = p.onAccent;
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx + 2.5, ry + th / 2 + 1);
  setSpacing(ctx, 0);
}

async function ensureFonts() {
  if (!document.fonts) return;
  await Promise.allSettled([
    document.fonts.load(`800 80px "Plus Jakarta Sans"`),
    document.fonts.load(`700 40px "Plus Jakarta Sans"`),
    document.fonts.load(`500 36px "Inter"`),
    document.fonts.load(`700 26px "JetBrains Mono"`),
  ]);
}

export async function renderAchievementCard(data: AchievementCardData, format: CardFormat, theme: CardTheme): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const { width: w, height: h } = CARD_FORMATS[format];
  const layout = LAYOUT[format];
  const p = CARD_THEMES[theme];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const cx = w / 2;
  const medalY = layout.medalY;

  drawBackground(ctx, w, h, p, medalY, data.id);

  // Header: wordmark and date.
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = p.text;
  ctx.textAlign = 'left';
  ctx.font = `800 34px ${SANS}`;
  setSpacing(ctx, 9);
  ctx.fillText(BRAND.upper, PAD, PAD + 30);
  setSpacing(ctx, 0);
  ctx.textAlign = 'right';
  ctx.fillStyle = p.muted;
  ctx.font = `500 28px ${MONO}`;
  ctx.fillText(data.dateLabel, w - PAD, PAD + 28);

  // Eyebrow with rules either side.
  const eyebrow = data.earned ? 'ACHIEVEMENT UNLOCKED' : 'ACHIEVEMENT IN PROGRESS';
  const eyebrowY = layout.eyebrowY;
  ctx.font = `700 28px ${MONO}`;
  setSpacing(ctx, 7);
  ctx.textAlign = 'center';
  ctx.fillStyle = p.accent;
  ctx.fillText(eyebrow, cx + 3.5, eyebrowY);
  const ew = ctx.measureText(eyebrow).width;
  setSpacing(ctx, 0);
  ctx.strokeStyle = p.accent;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - ew / 2 - 110, eyebrowY - 10);
  ctx.lineTo(cx - ew / 2 - 30, eyebrowY - 10);
  ctx.moveTo(cx + ew / 2 + 30, eyebrowY - 10);
  ctx.lineTo(cx + ew / 2 + 110, eyebrowY - 10);
  ctx.stroke();
  ctx.globalAlpha = 1;

  drawMedal(ctx, cx, medalY, layout.medalR, p, data);

  // Title and description.
  let y = medalY + layout.medalR + (format === 'square' ? 105 : 125);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = p.text;
  ctx.font = `800 ${layout.title}px ${SANS}`;
  setSpacing(ctx, -1);
  for (const line of wrap(ctx, data.name, w - PAD * 2, 2)) {
    ctx.fillText(line, cx, y);
    y += layout.title * 1.08;
  }
  setSpacing(ctx, 0);
  y += 6;
  ctx.fillStyle = p.muted;
  ctx.font = `500 ${layout.desc}px ${BODY}`;
  for (const line of wrap(ctx, data.desc, w - PAD * 2.6, format === 'square' ? 2 : 3)) {
    ctx.fillText(line, cx, y);
    y += layout.desc * 1.4;
  }

  if (!data.earned && data.progress) {
    const pct = Math.min(1, data.progress.value / data.progress.target);
    const bw = 620;
    const bh = 18;
    y += 26;
    ctx.fillStyle = p.panel;
    roundRect(ctx, cx - bw / 2, y, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = p.accent;
    roundRect(ctx, cx - bw / 2, y, Math.max(bh, bw * pct), bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = p.text;
    ctx.font = `700 30px ${MONO}`;
    const value = Number.isInteger(data.progress.value) ? data.progress.value.toLocaleString() : data.progress.value.toFixed(1);
    ctx.fillText(`${Math.round(pct * 100)}%  ·  ${value} / ${data.progress.target.toLocaleString()}`, cx, y + bh + 50);
    y += bh + 50;
  }

  // Footer: athlete and collection count.
  const footerY = h - PAD;
  ctx.textAlign = 'left';
  ctx.fillStyle = p.text;
  ctx.font = `700 36px ${SANS}`;
  ctx.fillText(data.athleteName, PAD, footerY - 34);
  ctx.fillStyle = p.muted;
  ctx.font = `500 28px ${BODY}`;
  ctx.fillText([`@${data.username}`, data.rankLabel].filter(Boolean).join('  ·  '), PAD, footerY + 4);
  ctx.textAlign = 'right';
  ctx.fillStyle = p.accent;
  ctx.font = `800 52px ${SANS}`;
  ctx.fillText(`${data.earnedCount}/${data.totalCount}`, w - PAD, footerY - 24);
  ctx.fillStyle = p.muted;
  ctx.font = `600 22px ${MONO}`;
  setSpacing(ctx, 4);
  ctx.fillText('BADGES', w - PAD, footerY + 6);
  setSpacing(ctx, 0);

  ctx.strokeStyle = p.muted;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, footerY - 100);
  ctx.lineTo(w - PAD, footerY - 100);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Stats strip above the footer, only when the text above leaves room.
  const sh = 168;
  const sy = footerY - 100 - 50 - sh;
  if (layout.stats && data.stats.length && y + 20 <= sy) {
    const sw = w - PAD * 2;
    ctx.fillStyle = p.panel;
    roundRect(ctx, PAD, sy, sw, sh, 32);
    ctx.fill();
    const col = sw / data.stats.length;
    data.stats.forEach((stat, i) => {
      const x = PAD + col * i + col / 2;
      if (i > 0) {
        ctx.strokeStyle = p.muted;
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.moveTo(PAD + col * i, sy + 34);
        ctx.lineTo(PAD + col * i, sy + sh - 34);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = p.text;
      ctx.font = `800 52px ${SANS}`;
      ctx.fillText(stat.value, x, sy + 88);
      ctx.fillStyle = p.muted;
      ctx.font = `600 22px ${MONO}`;
      setSpacing(ctx, 3);
      ctx.fillText(stat.label.toUpperCase(), x, sy + 128);
      setSpacing(ctx, 0);
    });
  }

  return canvas;
}
