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
        } else {
          setUnseenMedal(null);
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
        radialBg: 'radial-gradient(circle at 50% 42%, #fef08a 0%, #facc15 35%, #eab308 60%, #ca8a04 85%, #854d0e 100%)',
        metalBorder: 'border-yellow-300/80',
        glow: 'shadow-[0_0_60px_rgba(245,158,11,0.7)]',
        glowColor: 'rgba(245,158,11,0.6)',
        textColor: 'text-amber-300',
        accentText: 'text-amber-900 dark:text-amber-300',
        pillBg: 'bg-amber-500/25 border-2 border-amber-500/70 text-amber-950 dark:text-amber-100',
        emoji: '🥇',
      }
    : isSilver
    ? {
        name: 'SILVER RUNNER-UP',
        placement: '2ND PLACE PODIUM',
        icon: Trophy,
        radialBg: 'radial-gradient(circle at 50% 42%, #ffffff 0%, #f1f5f9 35%, #cbd5e1 60%, #94a3b8 85%, #475569 100%)',
        metalBorder: 'border-slate-300/80',
        glow: 'shadow-[0_0_60px_rgba(203,213,225,0.6)]',
        glowColor: 'rgba(203,213,225,0.6)',
        textColor: 'text-slate-200',
        accentText: 'text-slate-900 dark:text-slate-200',
        pillBg: 'bg-slate-300/30 border-2 border-slate-400/70 text-slate-950 dark:text-slate-100',
        emoji: '🥈',
      }
    : {
        name: 'BRONZE MEDALIST',
        placement: '3RD PLACE PODIUM',
        icon: Award,
        radialBg: 'radial-gradient(circle at 50% 42%, #ffb52e 0%, #f97316 42%, #d95b12 68%, #a84412 84%, #7c3412 100%)',
        metalBorder: 'border-amber-500/80',
        glow: 'shadow-[0_0_60px_rgba(217,119,6,0.6)]',
        glowColor: 'rgba(217,119,6,0.6)',
        textColor: 'text-orange-300',
        accentText: 'text-orange-950 dark:text-orange-300',
        pillBg: 'bg-orange-600/25 border-2 border-orange-500/70 text-orange-950 dark:text-orange-100',
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

  return createPortal(
    <>
      <AnimatePresence>
      {unseenMedal && (
        <div className="fixed inset-0 z-[850] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
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
                    : 'bg-emerald-400'
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
            {/* Dismiss button */}
            <button 
              onClick={handleClaim}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
              title="Close"
            >
              <X size={18} />
            </button>

            {/* Header pill */}
            <div className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-mono font-black uppercase tracking-wider mb-5 shadow-sm ${medalConfig.pillBg}`}>
              <Sparkles size={14} className="shrink-0" />
              {medalConfig.placement}
            </div>

            {/* Modern 3D Metallic Medallion Hero */}
            <div className="relative mb-6 flex justify-center">
              <motion.div
                animate={{ rotate: [0, 4, -4, 0], scale: [1, 1.04, 1] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="w-32 h-32 rounded-full relative flex items-center justify-center shrink-0"
                style={{
                  background: medalConfig.radialBg,
                  boxShadow: `0 0 20px ${medalConfig.glowColor}, 0 0 45px ${medalConfig.glowColor}`
                }}
              >
                {/* Inner Metallic Bevel Face */}
                <div className="absolute inset-[9px] rounded-full bg-gradient-to-br from-black/95 via-zinc-900 to-black flex flex-col items-center justify-center overflow-hidden z-10 shadow-2xl">
                  {/* Subtle Light Reflection Flare */}
                  <div className="absolute -top-6 -left-6 w-20 h-20 bg-white/10 rounded-full blur-md pointer-events-none" />
                  
                  <Icon size={44} className={medalConfig.textColor} />
                  
                  <div className={`mt-1 px-2.5 py-0.5 rounded-full border text-[11px] font-mono font-black tracking-widest ${medalConfig.pillBg}`}>
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
        </div>
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
