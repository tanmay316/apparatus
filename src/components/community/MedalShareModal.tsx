import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share2, Crown, Trophy, Award, Sparkles, Check, Shield } from 'lucide-react';
import { toCanvas } from 'html-to-image';
import type { EarnedCommunityBadge } from '@/types';
import { useAuthStore } from '@/stores/auth-store';

interface MedalShareModalProps {
  badge: EarnedCommunityBadge;
  onClose: () => void;
}

export function MedalShareModal({ badge, onClose }: MedalShareModalProps) {
  const { user } = useAuthStore();
  const cardRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [didCopy, setDidCopy] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'9/16' | '1/1'>('9/16');
  const [theme, setTheme] = useState<'dark-gold' | 'cyber-noir' | 'deep-emerald' | 'light-gold' | 'crimson'>('dark-gold');

  const isLight = theme === 'light-gold';
  const tPrimary = isLight ? 'text-black' : 'text-white';
  const tSecondary = isLight ? 'text-black/60' : 'text-white/60';
  const tTertiary = isLight ? 'text-black/40' : 'text-white/40';
  const borderLight = isLight ? 'border-black/10' : 'border-white/10';

  const isGold = badge.rank === 1;
  const isSilver = badge.rank === 2;

  const medalConfig = isGold
    ? {
        title: 'GOLD CHAMPION',
        rankLabel: '1ST PLACE',
        icon: Crown,
        radialBg: 'radial-gradient(circle at 50% 42%, #fef08a 0%, #facc15 35%, #eab308 60%, #ca8a04 85%, #854d0e 100%)',
        glowColor: 'rgba(245, 158, 11, 0.4)',
        borderColor: 'border-amber-400/50',
        textColor: 'text-amber-300',
        accentBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      }
    : isSilver
    ? {
        title: 'SILVER RUNNER-UP',
        rankLabel: '2ND PLACE',
        icon: Trophy,
        radialBg: 'radial-gradient(circle at 50% 42%, #ffffff 0%, #f1f5f9 35%, #cbd5e1 60%, #94a3b8 85%, #475569 100%)',
        glowColor: 'rgba(203, 213, 225, 0.4)',
        borderColor: 'border-slate-300/50',
        textColor: 'text-slate-200',
        accentBg: 'bg-slate-300/20 text-slate-200 border-slate-400/40',
      }
    : {
        title: 'BRONZE PODIUM',
        rankLabel: '3RD PLACE',
        icon: Award,
        radialBg: 'radial-gradient(circle at 50% 42%, #ffb52e 0%, #f97316 42%, #d95b12 68%, #a84412 84%, #7c3412 100%)',
        glowColor: 'rgba(217, 119, 6, 0.4)',
        borderColor: 'border-orange-400/40',
        textColor: 'text-orange-300',
        accentBg: 'bg-orange-600/20 text-orange-300 border-orange-500/40',
      };

  const Icon = medalConfig.icon;

  const handleShare = async () => {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    try {
      const canvas = await toCanvas(cardRef.current, {
        pixelRatio: 3,
        cacheBust: true,
      });

      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('Failed to generate image');

      const file = new File([blob], `apparatus_medal_${badge.rank}_${Date.now()}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${medalConfig.title} - ${badge.title}`,
          text: `I just won ${medalConfig.title} in "${badge.title}" on Apparatus Arena! 🏆`,
        });
      } else {
        // Fallback to download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `apparatus_medal_${badge.rank}.png`;
        a.click();
        URL.revokeObjectURL(url);
        setDidCopy(true);
        setTimeout(() => setDidCopy(false), 2500);
      }
    } catch (err) {
      console.error('Share failed:', err);
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = async () => {
    if (!cardRef.current || downloading) return;
    setDownloading(true);
    try {
      const canvas = await toCanvas(cardRef.current, {
        pixelRatio: 3,
        cacheBust: true,
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `apparatus_medal_${badge.rank}_${Date.now()}.png`;
      a.click();
      setDidCopy(true);
      setTimeout(() => setDidCopy(false), 2500);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[900] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-[#141416] border border-white/10 rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4 text-white relative my-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-amber-400" />
              <h3 className="font-display text-xl text-white">Share Podium Medal</h3>
            </div>
            <button onClick={onClose} className="p-1 text-white/60 hover:text-white rounded-lg">
              <X size={18} />
            </button>
          </div>

          {/* Aspect Ratio & Theme Selector */}
          <div className="flex items-center justify-between gap-2 text-xs font-mono">
            <div className="flex bg-black/40 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setAspectRatio('9/16')}
                className={`px-3 py-1 rounded-lg transition-all ${aspectRatio === '9/16' ? 'bg-amber-400 text-black font-bold' : 'text-white/60 hover:text-white'}`}
              >
                Story 9:16
              </button>
              <button
                onClick={() => setAspectRatio('1/1')}
                className={`px-3 py-1 rounded-lg transition-all ${aspectRatio === '1/1' ? 'bg-amber-400 text-black font-bold' : 'text-white/60 hover:text-white'}`}
              >
                Square 1:1
              </button>
            </div>

            <div className="flex gap-1.5">
              {(['dark-gold', 'cyber-noir', 'deep-emerald', 'light-gold', 'crimson'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`w-5 h-5 rounded-full border transition-transform shadow-sm ${
                    t === 'dark-gold'
                      ? 'bg-amber-950 border-amber-400'
                      : t === 'cyber-noir'
                      ? 'bg-zinc-900 border-zinc-400'
                      : t === 'deep-emerald'
                      ? 'bg-emerald-950 border-emerald-400'
                      : t === 'light-gold'
                      ? 'bg-amber-100 border-amber-500'
                      : 'bg-red-950 border-red-500'
                  } ${theme === t ? 'scale-125 ring-1 ring-white' : 'opacity-70 hover:opacity-100 border-white/20'}`}
                />
              ))}
            </div>
          </div>

          {/* Share Card Canvas Container */}
          <div className="flex justify-center bg-black/40 p-2 rounded-2xl border border-line/20 overflow-hidden">
            <div
              ref={cardRef}
              style={{
                width: aspectRatio === '9/16' ? '320px' : '380px',
                height: aspectRatio === '9/16' ? '540px' : '380px',
              }}
              className={`relative rounded-2xl overflow-hidden ${aspectRatio === '9/16' ? 'p-6' : 'p-5'} flex flex-col justify-between select-none shadow-2xl border ${
                theme === 'dark-gold'
                  ? 'bg-gradient-to-b from-[#1c1408] via-[#0d0a04] to-[#050402] border-amber-500/40'
                  : theme === 'cyber-noir'
                  ? 'bg-gradient-to-b from-[#18181b] via-[#09090b] to-[#000000] border-zinc-700'
                  : theme === 'deep-emerald'
                  ? 'bg-gradient-to-b from-[#062419] via-[#03140e] to-[#010a07] border-emerald-500/40'
                  : theme === 'light-gold'
                  ? 'bg-gradient-to-b from-[#fdfbf7] via-[#f7f2e9] to-[#efdfc2] border-amber-300'
                  : 'bg-gradient-to-b from-[#2a0808] via-[#140202] to-[#050000] border-rose-500/40'
              }`}
            >
              {/* Background ambient lighting */}
              <div 
                className="absolute top-1/4 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-40"
                style={{ backgroundColor: medalConfig.glowColor }}
              />

              {/* Top Header */}
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-white p-1 flex items-center justify-center border border-black/10 shadow-sm shrink-0">
                    <img src="/logo.png" alt="Apparatus" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <div className={`text-[10px] font-mono tracking-widest uppercase ${tSecondary}`}>APPARATUS ARENA</div>
                    <div className={`text-xs font-bold ${tPrimary}`}>Official Podium</div>
                  </div>
                </div>

                <span className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-full border ${medalConfig.accentBg}`}>
                  {medalConfig.rankLabel}
                </span>
              </div>

              {/* Center Medallion Hero */}
              <div className="relative z-10 flex flex-col items-center text-center my-auto">
                <div className={`relative ${aspectRatio === '1/1' ? 'mb-4' : 'mb-6'}`}>
                  <div 
                    className={`${aspectRatio === '9/16' ? 'w-32 h-32' : 'w-28 h-28'} shrink-0 rounded-full relative flex items-center justify-center`}
                    style={{
                      background: medalConfig.radialBg,
                      boxShadow: `0 0 12px ${medalConfig.glowColor}, 0 0 24px ${medalConfig.glowColor}`
                    }}
                  >
                    {/* Clean inner dark face */}
                    <div className={`absolute ${aspectRatio === '9/16' ? 'inset-[9px]' : 'inset-[8px]'} rounded-full bg-gradient-to-br from-black/95 via-zinc-900 to-black flex flex-col items-center justify-center overflow-hidden z-10`}>
                      <div className="absolute -top-6 -left-6 w-20 h-20 bg-white/10 rounded-full blur-md pointer-events-none" />
                      
                      <Icon size={44} className={medalConfig.textColor} />
                      
                      <div className={`mt-1 px-2.5 py-0.5 rounded-full border text-[11px] font-mono font-black tracking-widest ${medalConfig.accentBg}`}>
                        RANK #{badge.rank}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`text-[11px] font-mono uppercase tracking-widest font-black mb-1 ${medalConfig.textColor}`}>
                  {medalConfig.title}
                </div>
                <h2 className={`font-display text-xl ${tPrimary} font-bold leading-tight max-w-[260px] line-clamp-2 drop-shadow-md`}>
                  {badge.title}
                </h2>
                {badge.description && (
                  <p className={`text-[11px] font-mono ${tSecondary} mt-2 line-clamp-2 max-w-[260px]`}>
                    {badge.description}
                  </p>
                )}
              </div>

              {/* Bottom Footer */}
              <div className={`relative z-10 pt-3 border-t ${borderLight} flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="" crossOrigin="anonymous" className={`w-7 h-7 rounded-full object-cover border ${borderLight}`} />
                  ) : (
                    <div className={`w-7 h-7 rounded-full bg-black/10 border ${borderLight} flex items-center justify-center font-bold text-xs ${tPrimary}`}>
                      {(user?.displayName || 'A')[0]}
                    </div>
                  )}
                  <div className="text-left">
                    <div className={`text-xs font-bold ${tPrimary} truncate max-w-[130px]`}>{user?.displayName || 'Apparatus Athlete'}</div>
                    <div className={`text-[9px] font-mono ${tSecondary} flex items-center gap-1`}>
                      {badge.clanName ? (
                        <>
                          <Shield size={9} className="text-amber-500" /> {badge.clanName}
                        </>
                      ) : badge.clanId ? (
                        <>
                          <Shield size={9} className="text-amber-500" /> Clan Challenge
                        </>
                      ) : (
                        <>Global Challenge</>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className={`text-[9px] font-mono ${tTertiary}`}>apparatus.fit</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex-1 py-3 text-xs font-mono font-bold flex items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors whitespace-nowrap"
            >
              {didCopy ? <Check size={16} className="text-emerald-400 shrink-0" /> : <Download size={16} className="shrink-0" />}
              <span>{downloading ? 'Exporting...' : didCopy ? 'Saved!' : 'Download Image'}</span>
            </button>
            <button
              onClick={handleShare}
              disabled={sharing}
              className="btn-primary flex-1 py-3 text-xs font-mono font-bold flex items-center justify-center gap-1.5"
            >
              <Share2 size={16} />
              {sharing ? 'Sharing...' : 'Share Medal'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
