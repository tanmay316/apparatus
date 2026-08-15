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
  const [theme, setTheme] = useState<'dark-gold' | 'cyber-noir' | 'deep-emerald'>('dark-gold');

  const isGold = badge.rank === 1;
  const isSilver = badge.rank === 2;

  const medalConfig = isGold
    ? {
        title: 'GOLD CHAMPION',
        rankLabel: '1ST PLACE',
        icon: Crown,
        medalGradient: 'from-yellow-300 via-amber-400 to-amber-600',
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
        medalGradient: 'from-white via-slate-200 to-slate-400',
        glowColor: 'rgba(203, 213, 225, 0.4)',
        borderColor: 'border-slate-300/50',
        textColor: 'text-slate-200',
        accentBg: 'bg-slate-300/20 text-slate-200 border-slate-400/40',
      }
    : {
        title: 'BRONZE PODIUM',
        rankLabel: '3RD PLACE',
        icon: Award,
        medalGradient: 'from-amber-500 via-orange-600 to-stone-700',
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
          className="bg-ink border border-line rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4 text-bone relative my-auto"
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
              {(['dark-gold', 'cyber-noir', 'deep-emerald'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
                    t === 'dark-gold'
                      ? 'bg-amber-950 border-amber-400'
                      : t === 'cyber-noir'
                      ? 'bg-zinc-900 border-zinc-400'
                      : 'bg-emerald-950 border-emerald-400'
                  } ${theme === t ? 'scale-110 ring-2 ring-white/50' : 'opacity-60'}`}
                />
              ))}
            </div>
          </div>

          {/* Share Card Canvas Container */}
          <div className="flex justify-center bg-black/40 p-2 rounded-2xl border border-line/20 overflow-hidden">
            <div
              ref={cardRef}
              style={{
                width: '320px',
                height: aspectRatio === '9/16' ? '540px' : '320px',
              }}
              className={`relative rounded-2xl overflow-hidden p-6 flex flex-col justify-between select-none shadow-2xl border ${
                theme === 'dark-gold'
                  ? 'bg-gradient-to-b from-[#1c1408] via-[#0d0a04] to-[#050402] border-amber-500/40'
                  : theme === 'cyber-noir'
                  ? 'bg-gradient-to-b from-[#18181b] via-[#09090b] to-[#000000] border-zinc-700'
                  : 'bg-gradient-to-b from-[#062419] via-[#03140e] to-[#010a07] border-emerald-500/40'
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
                  <div className="w-8 h-8 rounded-full bg-white/10 p-1 flex items-center justify-center border border-white/20">
                    <img src="/logo.png" alt="Apparatus" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono tracking-widest uppercase text-white/60">APPARATUS ARENA</div>
                    <div className="text-xs font-bold text-white/90">Official Podium</div>
                  </div>
                </div>

                <span className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-full border ${medalConfig.accentBg}`}>
                  {medalConfig.rankLabel}
                </span>
              </div>

              {/* Center Medallion Hero */}
              <div className="relative z-10 flex flex-col items-center text-center my-auto">
                <div className="relative mb-6">
                  {/* Glowing halo */}
                  <div className="absolute inset-0 rounded-full blur-xl scale-125 opacity-60 bg-gradient-to-tr from-amber-500 to-yellow-300" />
                  <div className={`w-32 h-32 rounded-full p-2.5 bg-gradient-to-b ${medalConfig.medalGradient} relative flex items-center justify-center border-4 ${medalConfig.borderColor}`}>
                    {/* Outer Engraved Ridges */}
                    <div className="absolute inset-1 rounded-full border border-white/40 pointer-events-none opacity-80" />
                    <div className="absolute inset-2.5 rounded-full border border-black/25 pointer-events-none" />

                    {/* Inner Metallic Bevel Face */}
                    <div className="w-full h-full rounded-full bg-gradient-to-br from-black/85 via-zinc-900 to-black/95 flex flex-col items-center justify-center relative overflow-hidden border border-white/20 shadow-2xl">
                      <div className="absolute -top-6 -left-6 w-20 h-20 bg-white/15 rounded-full blur-md pointer-events-none" />
                      
                      <Icon size={44} className={medalConfig.textColor} />
                      
                      <div className={`mt-1 px-2.5 py-0.5 rounded-full border text-[11px] font-mono font-black tracking-widest ${medalConfig.accentBg}`}>
                        RANK #{badge.rank}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`text-xs font-mono uppercase tracking-widest font-black mb-1 ${medalConfig.textColor}`}>
                  {medalConfig.title}
                </div>
                <h2 className="font-display text-xl text-white font-bold leading-tight max-w-[260px] line-clamp-2 drop-shadow-md">
                  {badge.title}
                </h2>
                {badge.description && (
                  <p className="text-[11px] font-mono text-white/70 mt-2 line-clamp-2 max-w-[260px]">
                    {badge.description}
                  </p>
                )}
              </div>

              {/* Bottom Footer */}
              <div className="relative z-10 pt-3 border-t border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full object-cover border border-white/30" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs text-white">
                      {(user?.displayName || 'A')[0]}
                    </div>
                  )}
                  <div className="text-left">
                    <div className="text-xs font-bold text-white/90 truncate max-w-[130px]">{user?.displayName || 'Apparatus Athlete'}</div>
                    <div className="text-[9px] font-mono text-white/60 flex items-center gap-1">
                      {badge.clanName ? (
                        <>
                          <Shield size={9} className="text-amber-500" /> {badge.clanName}
                        </>
                      ) : (
                        <>Global Challenge</>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[9px] font-mono text-white/40">apparatus.fit</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="btn-secondary flex-1 py-3 text-xs font-mono font-bold flex items-center justify-center gap-1.5"
            >
              {didCopy ? <Check size={16} className="text-emerald-400" /> : <Download size={16} />}
              {downloading ? 'Exporting...' : didCopy ? 'Saved!' : 'Download Image'}
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
