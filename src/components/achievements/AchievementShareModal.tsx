import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Download, Loader2, Share2, X } from 'lucide-react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { computeAthleteRank } from '@/lib/rank';
import { effectiveStreak } from '@/lib/stats';
import {
  CARD_FORMATS, CARD_THEMES, badgeCategory, renderAchievementCard,
  type AchievementCardData, type CardFormat, type CardTheme,
} from '@/lib/achievement-card';
import type { Badge, UserStats } from '@/types';
import { lockBodyScroll } from '@/lib/scroll-lock';

interface Props {
  badge: Badge;
  earned: boolean;
  progress?: { value: number; target: number };
  earnedCount: number;
  totalCount: number;
  onClose: () => void;
}

const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : Math.round(n).toLocaleString());

function statsFor(category: string, s: Partial<UserStats>) {
  const sessions = (s.totalWorkouts || 0) + (s.totalCardioSessions || 0);
  const hours = Math.round((s.totalDurationMin || 0) / 60);
  switch (category) {
    case 'Strength':
      return [
        { label: 'Volume kg', value: compact(s.totalVolume || 0) },
        { label: 'Top lift kg', value: compact(s.maxLiftKg || 0) },
        { label: 'PRs', value: compact(s.prCount || 0) },
      ];
    case 'Endurance':
      return [
        { label: 'Total km', value: compact(s.totalDistanceKm || 0) },
        { label: 'Longest km', value: (s.longestCardioKm || 0).toFixed(1) },
        { label: 'Cardio', value: compact(s.totalCardioSessions || 0) },
      ];
    case 'Consistency':
      return [
        { label: 'Best streak', value: `${s.longestStreak || 0}d` },
        { label: 'Current', value: `${effectiveStreak(s)}d` },
        { label: 'Sessions', value: compact(sessions) },
      ];
    case 'Skill':
      return [
        { label: 'Best hold', value: `${Math.round(s.bestHold || 0)}s` },
        { label: 'PRs', value: compact(s.prCount || 0) },
        { label: 'Workouts', value: compact(s.totalWorkouts || 0) },
      ];
    case 'Records':
      return [
        { label: 'PRs', value: compact(s.prCount || 0) },
        { label: 'Top lift kg', value: compact(s.maxLiftKg || 0) },
        { label: 'Workouts', value: compact(s.totalWorkouts || 0) },
      ];
    case 'Dedication':
      return [
        { label: 'Hours', value: compact(hours) },
        { label: 'Calories', value: compact(s.totalCalories || 0) },
        { label: 'Sessions', value: compact(sessions) },
      ];
    default:
      return [
        { label: 'Sessions', value: compact(sessions) },
        { label: 'Hours', value: compact(hours) },
        { label: 'Best streak', value: `${s.longestStreak || 0}d` },
      ];
  }
}

const isCancel = (err: any) => err?.name === 'AbortError' || /cancel/i.test(err?.message || '');

export function AchievementShareModal({ badge, earned, progress, earnedCount, totalCount, onClose }: Props) {
  const { profile, stats } = useAuthStore();
  const { showToast } = useUIStore();
  const [format, setFormat] = useState<CardFormat>('post');
  const [theme, setTheme] = useState<CardTheme>('gold');
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const data = useMemo<AchievementCardData>(() => {
    const category = badgeCategory(badge.id);
    return {
      id: badge.id,
      icon: badge.icon,
      name: badge.name,
      desc: badge.desc,
      category,
      earned,
      progress,
      athleteName: profile?.displayName || 'Athlete',
      username: profile?.username || 'athlete',
      rankLabel: stats ? computeAthleteRank(stats, profile?.weight, { gender: profile?.gender }).label : undefined,
      earnedCount,
      totalCount,
      dateLabel: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(),
      stats: statsFor(category, stats || {}),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badge, earned, progress?.value, progress?.target, profile, stats, earnedCount, totalCount]);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    renderAchievementCard(data, format, theme).then(canvas => {
      if (cancelled) return;
      canvasRef.current = canvas;
      setPreview(canvas.toDataURL('image/png'));
    }).catch(err => {
      console.error('Achievement card render failed', err);
      if (!cancelled) showToast('Could not create the image', 'error');
    });
    return () => { cancelled = true; };
  }, [data, format, theme, showToast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const unlock = lockBodyScroll();
    window.addEventListener('keydown', onKey);
    return () => {
      unlock();
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const fileName = `apparatus-${badge.id}-${format}.png`;
  const pct = progress ? Math.round(Math.min(1, progress.value / progress.target) * 100) : 0;
  const shareText = earned
    ? `Unlocked "${badge.name}" on Apparatus 🏆`
    : `Chasing "${badge.name}" on Apparatus. ${pct}% there 💪`;

  const toBlob = () => new Promise<Blob | null>(resolve => {
    if (!canvasRef.current) resolve(null);
    else canvasRef.current.toBlob(resolve, 'image/png');
  });
  const base64 = () => canvasRef.current!.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');

  const save = async () => {
    if (!canvasRef.current) return;
    setBusy('save');
    try {
      if (Capacitor.isNativePlatform()) {
        await Filesystem.writeFile({ path: `Apparatus/${fileName}`, data: base64(), directory: Directory.Documents, recursive: true });
        showToast('Saved to Documents/Apparatus');
        return;
      }
      const blob = await toBlob();
      const url = blob ? URL.createObjectURL(blob) : canvasRef.current.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (blob) setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Image saved');
    } catch (err) {
      if (!isCancel(err)) showToast('Could not save the image', 'error');
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    if (!canvasRef.current) return;
    setBusy('share');
    try {
      if (Capacitor.isNativePlatform()) {
        const file = await Filesystem.writeFile({ path: fileName, data: base64(), directory: Directory.Cache });
        await Share.share({ title: badge.name, text: shareText, files: [file.uri], dialogTitle: 'Share achievement' });
        return;
      }
      const blob = await toBlob();
      const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: badge.name, text: shareText, files: [file] });
      } else {
        setBusy(null);
        await save();
      }
    } catch (err) {
      if (!isCancel(err)) showToast('Could not share. Try saving the image instead.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const { width, height } = CARD_FORMATS[format];

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 26, stiffness: 260 }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label={`Share ${badge.name}`}
        className="dx pro-scope w-full sm:max-w-[440px] max-h-[94vh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] p-4 sm:p-5"
        style={{ background: 'var(--dx-card)', borderTop: '1px solid var(--dx-border)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[16px] font-semibold">Share achievement</div>
            <div className="text-[12px] dx-muted">{badge.name}</div>
          </div>
          <button onClick={onClose} className="dx-icon-btn dx-icon-btn--sm" aria-label="Close"><X size={17} /></button>
        </div>

        <div
          className="mx-auto rounded-2xl overflow-hidden flex items-center justify-center"
          style={{
            aspectRatio: `${width} / ${height}`,
            maxHeight: '54vh',
            background: 'var(--dx-card-2)',
            boxShadow: '0 24px 48px -24px rgba(0,0,0,0.55)',
          }}
        >
          {preview ? (
            <img src={preview} alt={`${badge.name} share card`} className="w-full h-full object-contain" />
          ) : (
            <Loader2 size={22} className="animate-spin dx-muted" />
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2" role="radiogroup" aria-label="Card style">
            {(Object.keys(CARD_THEMES) as CardTheme[]).map(id => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={theme === id}
                aria-label={CARD_THEMES[id].label}
                title={CARD_THEMES[id].label}
                onClick={() => setTheme(id)}
                className="w-8 h-8 rounded-full transition-transform active:scale-90"
                style={{
                  background: CARD_THEMES[id].swatch,
                  boxShadow: theme === id ? '0 0 0 2px var(--dx-card), 0 0 0 4px var(--dx-accent)' : 'inset 0 0 0 1px var(--dx-border-strong)',
                }}
              />
            ))}
          </div>
          <div className="dx-segment" role="tablist" aria-label="Format">
            {(Object.keys(CARD_FORMATS) as CardFormat[]).map(id => (
              <button key={id} type="button" role="tab" aria-selected={format === id} onClick={() => setFormat(id)} className="!h-8 !px-3 !text-[12px]">
                {CARD_FORMATS[id].label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button type="button" onClick={save} disabled={!preview || !!busy} className="dx-btn-secondary">
            {busy === 'save' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Save
          </button>
          <button type="button" onClick={share} disabled={!preview || !!busy} className="dx-btn">
            {busy === 'share' ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />} Share
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
