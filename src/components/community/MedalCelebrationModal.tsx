import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Trophy, Award, Sparkles, Share2, CheckCircle2, X } from 'lucide-react';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useQueryClient } from '@tanstack/react-query';
import { MedalShareModal } from './MedalShareModal';
import type { EarnedCommunityBadge } from '@/types';

export function MedalCelebrationModal() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showShareModal, setShowShareModal] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [unseenMedal, setUnseenMedal] = useState<EarnedCommunityBadge | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setUnseenMedal(null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.unseenMedalAward) {
          setUnseenMedal(data.unseenMedalAward as EarnedCommunityBadge);
        }
      }
    });
    return () => unsub();
  }, [user?.uid]);

  if (!user) return null;

  const isGold = unseenMedal?.rank === 1;
  const isSilver = unseenMedal?.rank === 2;

  const medalConfig = isGold
    ? {
        name: 'GOLD CHAMPION',
        placement: '1ST PLACE VICTORY',
        icon: Crown,
        outerGradient:
          'radial-gradient(circle at 50% 24%, #ffffff 0%, #fffde0 8%, #fef08a 18%, #facc15 32%, #eab308 50%, #ca8a04 68%, #854d0e 86%, #3a1a02 100%)',
        innerRimGradient:
          'radial-gradient(circle at 50% 26%, #ffffff 0%, #fff9c4 16%, #fde047 38%, #ca8a04 68%, #713f12 100%)',
        faceGradient:
          'radial-gradient(circle at 45% 26%, #282115 0%, #17120a 38%, #0a0704 72%, #020101 100%)',
        rankTextGradient:
          'linear-gradient(180deg, #ffffff 0%, #fffbeb 20%, #fde047 45%, #ca8a04 75%, #fef08a 100%)',
        glowColor: 'rgba(250, 204, 21, 0.60)',
        strongGlow: 'rgba(250, 204, 21, 0.32)',
        textColor: 'text-amber-200',
        accentText: 'text-amber-300',
        pillBg: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
        emoji: '🥇',
      }
    : isSilver
    ? {
        name: 'SILVER RUNNER-UP',
        placement: '2ND PLACE PODIUM',
        icon: Trophy,
        outerGradient:
          'radial-gradient(circle at 50% 24%, #ffffff 0%, #f8fafc 12%, #f1f5f9 22%, #e2e8f0 36%, #cbd5e1 52%, #94a3b8 70%, #475569 88%, #0f172a 100%)',
        innerRimGradient:
          'radial-gradient(circle at 50% 26%, #ffffff 0%, #f8fafc 20%, #cbd5e1 45%, #64748b 72%, #1e293b 100%)',
        faceGradient:
          'radial-gradient(circle at 45% 26%, #1c2028 0%, #101319 38%, #07090d 72%, #020203 100%)',
        rankTextGradient:
          'linear-gradient(180deg, #ffffff 0%, #f8fafc 20%, #e2e8f0 45%, #94a3b8 75%, #ffffff 100%)',
        glowColor: 'rgba(226, 232, 240, 0.50)',
        strongGlow: 'rgba(226, 232, 240, 0.24)',
        textColor: 'text-slate-100',
        accentText: 'text-slate-200',
        pillBg: 'bg-slate-300/15 text-slate-200 border-slate-300/40',
        emoji: '🥈',
      }
    : {
        name: 'BRONZE MEDALIST',
        placement: '3RD PLACE PODIUM',
        icon: Award,
        outerGradient:
          'radial-gradient(circle at 50% 24%, #ffffff 0%, #ffeedd 8%, #fed7aa 18%, #fb923c 34%, #ea580c 52%, #c2410c 70%, #7c2d12 88%, #2e0b02 100%)',
        innerRimGradient:
          'radial-gradient(circle at 50% 26%, #ffffff 0%, #ffedd5 18%, #f97316 45%, #9a3412 72%, #431407 100%)',
        faceGradient:
          'radial-gradient(circle at 45% 26%, #281912 0%, #170d08 38%, #0a0503 72%, #020101 100%)',
        rankTextGradient:
          'linear-gradient(180deg, #ffffff 0%, #ffedd5 20%, #fb923c 45%, #c2410c 75%, #ffedd5 100%)',
        glowColor: 'rgba(249, 115, 22, 0.60)',
        strongGlow: 'rgba(249, 115, 22, 0.32)',
        textColor: 'text-orange-200',
        accentText: 'text-orange-300',
        pillBg: 'bg-orange-600/15 text-orange-300 border-orange-500/40',
        emoji: '🥉',
      };

  const Icon = medalConfig.icon;

  const handleClaim = async () => {
    if (dismissing) return;
    setDismissing(true);
    try {
      if (user?.uid) {
        await updateDoc(doc(db, 'users', user.uid), {
          unseenMedalAward: null,
        });
        setUnseenMedal(null);
        queryClient.invalidateQueries({ queryKey: ['userCelebrationProfile', user.uid] });
        queryClient.invalidateQueries({ queryKey: ['userProfile', user.uid] });
        queryClient.invalidateQueries({ queryKey: ['userCommunityBadges', user.uid] });
        queryClient.invalidateQueries({ queryKey: ['freshUserProfile', user.uid] });
      }
      useUIStore.getState().showToast(`${medalConfig.emoji} Trophy added to your Profile Podium!`, 'success');
    } catch (e) {
      console.error('Failed to acknowledge medal:', e);
    } finally {
      setDismissing(false);
    }
  };

  const handleDismiss = async () => {
    if (user?.uid) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          unseenMedalAward: null,
        });
        queryClient.invalidateQueries({ queryKey: ['userCelebrationProfile', user.uid] });
        queryClient.invalidateQueries({ queryKey: ['userProfile', user.uid] });
        queryClient.invalidateQueries({ queryKey: ['userCommunityBadges', user.uid] });
        queryClient.invalidateQueries({ queryKey: ['freshUserProfile', user.uid] });
        useAuthStore.getState().refreshProfile().catch(() => {});
      } catch (e) {
        console.error('Failed to dismiss modal:', e);
      }
    }
    setUnseenMedal(null);
  };

  return createPortal(
    <>
      <AnimatePresence>
      {unseenMedal && (
        <motion.div 
          key="celebration-backdrop-wrapper"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[950] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto"
        >
          {/* Confetti / Particle FX */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[...Array(28)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ 
                  y: -20, 
                  x: `${(i * 3.6) % 100}vw`, 
                  opacity: 1, 
                  scale: 0.5 + Math.random() * 0.8,
                  rotate: 0 
                }}
                animate={{ 
                  y: '105vh', 
                  x: `${((i * 3.6) + (i % 2 === 0 ? 10 : -10)) % 100}vw`,
                  opacity: [1, 1, 0],
                  rotate: 360 * (i % 2 === 0 ? 2 : -2)
                }}
                transition={{ 
                  duration: 2.8 + (i % 4), 
                  repeat: Infinity, 
                  ease: 'linear',
                  delay: (i * 0.12) % 2 
                }}
                className={`absolute w-3.5 h-3.5 rounded-sm ${
                  i % 4 === 0 
                    ? 'bg-amber-400' 
                    : i % 4 === 1 
                    ? 'bg-yellow-300' 
                    : i % 4 === 2
                    ? 'bg-orange-500'
                    : 'bg-[#ff9e80]'
                }`}
              />
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 25 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 25 }}
            transition={{ type: 'spring', stiffness: 350, damping: 26 }}
            className="bg-[#141416] border-2 border-amber-500/40 rounded-[32px] p-6 sm:p-7 max-w-sm w-full shadow-2xl text-white relative my-auto text-center flex flex-col items-center z-10"
          >
            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
            {/* Header pill */}
            <div className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-mono font-black uppercase tracking-wider mb-5 shadow-sm border ${medalConfig.pillBg}`}>
              <Sparkles size={14} className="shrink-0" />
              {medalConfig.placement}
            </div>

            {/* Modern 3D Metallic Medallion Hero */}
            <div className="relative mb-6 flex justify-center">
              <motion.div
                animate={{ rotate: [0, 4, -4, 0], scale: [1, 1.04, 1] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="w-40 h-40 relative rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: medalConfig.outerGradient,
                  boxShadow: `
                    0 0 16px ${medalConfig.glowColor},
                    0 0 40px ${medalConfig.glowColor},
                    0 14px 28px rgba(0,0,0,0.65),
                    inset 0 3px 6px rgba(255,255,255,0.75),
                    inset 0 -6px 12px rgba(0,0,0,0.65)
                  `,
                }}
              >
                {/* Anisotropic metallic light sweep */}
                <div
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{
                    background: `
                      conic-gradient(
                        from 215deg at 50% 50%,
                        rgba(255,255,255,0.45) 0deg,
                        rgba(255,255,255,0) 40deg,
                        rgba(0,0,0,0.35) 85deg,
                        rgba(255,255,255,0) 130deg,
                        rgba(255,255,255,0.40) 175deg,
                        rgba(255,255,255,0.20) 220deg,
                        rgba(0,0,0,0.35) 265deg,
                        rgba(255,255,255,0) 310deg,
                        rgba(255,255,255,0.45) 360deg
                      )
                    `,
                    mixBlendMode: 'overlay',
                    opacity: 0.85,
                  }}
                />

                {/* Broad metallic top highlight */}
                <div
                  className="absolute inset-[2px] rounded-full pointer-events-none"
                  style={{
                    background: `
                      radial-gradient(
                        circle at 50% 18%,
                        rgba(255,255,255,0.50) 0%,
                        rgba(255,255,255,0.18) 18%,
                        rgba(255,255,255,0) 44%
                      )
                    `,
                  }}
                />

                {/* Secondary metallic inner rim */}
                <div
                  className="absolute rounded-full"
                  style={{
                    inset: '7px',
                    background: medalConfig.innerRimGradient,
                    boxShadow: `
                      inset 0 3px 5px rgba(255,255,255,0.48),
                      inset 0 -4px 8px rgba(0,0,0,0.65)
                    `,
                  }}
                />

                {/* Dark recessed groove */}
                <div
                  className="absolute rounded-full"
                  style={{
                    inset: '15px',
                    background: `
                      radial-gradient(
                        circle at 50% 35%,
                        #1b1b1b 0%,
                        #0d0d0d 55%,
                        #020202 100%
                      )
                    `,
                    boxShadow: `
                      inset 0 3px 5px rgba(0,0,0,0.92),
                      inset 0 -1px 2px rgba(255,255,255,0.08)
                    `,
                  }}
                />

                {/* Inner Medal Face */}
                <div
                  className="absolute inset-[25px] rounded-full flex flex-col items-center justify-center overflow-hidden z-10"
                  style={{
                    background: medalConfig.faceGradient,
                    boxShadow: `
                      inset 0 4px 10px rgba(255,255,255,0.12),
                      inset 0 -8px 16px rgba(0,0,0,0.90),
                      0 2px 4px rgba(0,0,0,0.80)
                    `,
                  }}
                >
                  {/* Face highlight */}
                  <div
                    className="absolute pointer-events-none rounded-full"
                    style={{
                      width: '76px',
                      height: '76px',
                      top: '-30px',
                      left: '-20px',
                      background:
                        'radial-gradient(circle, rgba(255,255,255,0.18), transparent 68%)',
                      filter: 'blur(5px)',
                    }}
                  />

                  {/* Subtle lower shadow */}
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      width: '80%',
                      height: '30%',
                      bottom: '-5%',
                      left: '10%',
                      background:
                        'radial-gradient(ellipse, rgba(0,0,0,0.65), transparent 72%)',
                      filter: 'blur(7px)',
                    }}
                  />

                  {/* Medal Icon */}
                  <Icon
                    size={48}
                    strokeWidth={2.2}
                    className={`${medalConfig.textColor} relative z-10`}
                    style={{
                      filter: `
                        drop-shadow(0 2px 2px rgba(0,0,0,0.95))
                        drop-shadow(0 0 6px ${medalConfig.glowColor})
                      `,
                    }}
                  />

                  {/* Embossed Metallic Rank Text (NO outer tab/curved edges) */}
                  <div
                    className="mt-1 text-[11px] sm:text-xs font-mono font-black tracking-[0.24em] relative z-10 select-none uppercase"
                    style={{
                      background: medalConfig.rankTextGradient,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      filter: `
                        drop-shadow(0 1px 1px rgba(0,0,0,0.95))
                        drop-shadow(0 0 5px ${medalConfig.glowColor})
                      `,
                    }}
                  >
                    RANK #{unseenMedal.rank}
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Title & Celebration Text */}
            <div className={`text-xs font-mono uppercase tracking-widest font-black ${medalConfig.accentText} mb-1.5`}>
              VICTORY UNLOCKED
            </div>
            
            <h2 className="font-display text-2xl text-white leading-tight mb-2 font-bold px-1">
              {unseenMedal.title}
            </h2>
            
            <p className="text-xs font-mono text-white/70 font-semibold leading-relaxed mb-6 px-2">
              {unseenMedal.description || `Outstanding performance! You secured #${unseenMedal.rank} place in this competition.`}
            </p>

            {/* Action Buttons */}
            <div className="w-full space-y-2.5">
              <button
                onClick={() => setShowShareModal(true)}
                className="w-full py-3.5 px-4 rounded-2xl text-xs font-mono font-black flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-black shadow-lg shadow-amber-500/30 hover:brightness-105 active:scale-[0.98] transition-all"
              >
                <Share2 size={16} />
                Share & Show Off Medal
              </button>

              <button
                onClick={handleClaim}
                disabled={dismissing}
                className="w-full py-3 px-4 rounded-2xl text-xs font-mono font-bold flex items-center justify-center gap-2 border-2 border-white/20 hover:bg-white/10 text-white transition-all active:scale-[0.98]"
              >
                <CheckCircle2 size={16} className="text-emerald-500" />
                {dismissing ? 'Claiming...' : 'Claim & Add to Profile'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      
      {showShareModal && unseenMedal && (
        <MedalShareModal
          badge={unseenMedal}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </>,
    document.body
  );
}
