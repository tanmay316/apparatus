import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import {
  Dumbbell, Flame, Trophy, Target, Sparkles, Shield,
  TrendingUp, Activity, CheckCircle2, ChevronRight, Users, Loader2
} from 'lucide-react';

const FEATURES = [
  {
    icon: Dumbbell,
    title: 'Calisthenics & Strength Engine',
    desc: 'Intelligent logging, 1RM tracking, auto rest timers & custom routine designer.',
    tag: 'STRENGTH',
    accent: 'from-amber-500/20 via-orange-500/10 to-transparent border-amber-500/30 text-amber-400',
    badgeBg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  {
    icon: Activity,
    title: 'Live GPS Cardio & Route Maps',
    desc: 'Real-time pace cadence, elevation splits, map routes & GPX workout history.',
    tag: 'ENDURANCE',
    accent: 'from-emerald-500/20 via-teal-500/10 to-transparent border-emerald-500/30 text-emerald-400',
    badgeBg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  {
    icon: Trophy,
    title: 'Clan Wars & Podium Medals',
    desc: 'Compete in community events, claim 3D metallic medals & leaderboard glory.',
    tag: 'COMMUNITY',
    accent: 'from-yellow-500/20 via-amber-500/10 to-transparent border-yellow-500/30 text-yellow-400',
    badgeBg: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  },
  {
    icon: Target,
    title: 'Skills Mastery & Body Analytics',
    desc: 'Master Planche, Handstand & Muscle-Up with muscle fatigue heatmaps & PR stats.',
    tag: 'ANALYTICS',
    accent: 'from-blue-500/20 via-indigo-500/10 to-transparent border-blue-500/30 text-blue-400',
    badgeBg: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  },
];

export function AuthPage() {
  const { signInWithGoogle, loading } = useAuthStore();
  const { showToast } = useUIStore();
  const [signingIn, setSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
    if (signingIn || loading) return;
    setSigningIn(true);
    try {
      await signInWithGoogle();
      // Navigation is handled automatically by the PublicOnly wrapper in App.tsx
    } catch (error: any) {
      showToast(error.message || 'Sign-in failed. Please try again.', 'error');
    } finally {
      setSigningIn(false);
    }
  };

  const isSubmitting = signingIn || loading;

  return (
    <div className="min-h-screen bg-[#07080a] text-white flex flex-col justify-between relative overflow-hidden selection:bg-amber-500 selection:text-black">
      {/* Dynamic Ambient Background Aura */}
      <div
        className="absolute -top-32 -left-32 w-96 h-96 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(224,90,43,0.18) 0%, rgba(245,158,11,0.08) 45%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      <div
        className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(245,158,11,0.15) 0%, rgba(224,90,43,0.06) 45%, transparent 70%)',
          filter: 'blur(70px)',
        }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none opacity-40"
        style={{
          background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 60%)',
          filter: 'blur(80px)',
        }}
      />

      {/* Background Subtle Grid Texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.2) 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }}
      />

      {/* Main Container */}
      <div className="relative z-10 max-w-lg w-full mx-auto px-5 py-8 sm:py-12 flex-1 flex flex-col justify-center">
        
        {/* Brand Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="text-center mb-8 sm:mb-10 flex flex-col items-center"
        >
          {/* Logo Badge */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
            className="relative mb-5"
          >
            {/* Pulsing ring aura */}
            <div className="absolute -inset-2 rounded-3xl bg-gradient-to-tr from-amber-500/30 to-orange-600/30 blur-md pointer-events-none animate-pulse" />
            
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl bg-gradient-to-b from-[#1c140c] to-[#0d0905] border border-amber-500/40 p-3 sm:p-3.5 shadow-2xl flex items-center justify-center backdrop-blur-xl">
              <img
                src="/logo.png"
                alt="Apparatus"
                className="w-full h-full object-contain drop-shadow-[0_4px_12px_rgba(224,90,43,0.4)]"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/logo.png';
                }}
              />
            </div>
          </motion.div>

          {/* Signature Brand Wordmark */}
          <div className="flex flex-col items-center">
            <h1
              className="font-sans tracking-[0.38em] text-2xl sm:text-3xl font-light text-bone uppercase select-none leading-none pl-1.5"
              style={{ textShadow: '0 0 16px rgba(224,90,43,0.4)' }}
            >
              ΛPPΛRΛTUS
            </h1>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-[10px] sm:text-[11px] font-mono font-bold tracking-widest uppercase text-amber-300 mt-3 shadow-inner">
              <Sparkles size={11} className="text-amber-400 animate-spin-slow" />
              <span>Next-Gen Athletic OS</span>
            </div>
          </div>
        </motion.div>

        {/* Feature Bento Matrix */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 mb-8"
        >
          {FEATURES.map((item, idx) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.2 + idx * 0.06 }}
                className={`relative overflow-hidden rounded-2xl border ${item.accent} bg-gradient-to-b bg-[#0e1014]/90 p-3.5 sm:p-4 shadow-lg backdrop-blur-md flex flex-col justify-between group hover:border-amber-400/50 transition-all`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white shrink-0 group-hover:scale-110 transition-transform">
                      <Icon size={16} />
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-mono font-black tracking-wider uppercase border ${item.badgeBg}`}>
                      {item.tag}
                    </span>
                  </div>

                  <h3 className="font-display font-bold text-xs sm:text-sm text-bone leading-snug mb-1">
                    {item.title}
                  </h3>
                </div>

                <p className="text-[11px] font-sans text-bone-dim/80 leading-relaxed">
                  {item.desc}
                </p>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Primary Call to Action: Google Auth */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="space-y-4"
        >
          <motion.button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
            whileHover={{ scale: 1.015, boxShadow: '0 0 28px rgba(255,255,255,0.18)' }}
            whileTap={{ scale: 0.985 }}
            className="w-full relative flex items-center justify-center gap-3.5 bg-white hover:bg-slate-50 text-slate-900 font-bold py-4 px-6 rounded-2xl shadow-[0_8px_30px_rgba(255,255,255,0.15)] transition-all disabled:opacity-60 disabled:cursor-not-allowed text-sm sm:text-base group"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2.5 font-mono text-xs sm:text-sm">
                <Loader2 size={18} className="animate-spin text-sienna" />
                <span>Authorizing with Google...</span>
              </div>
            ) : (
              <>
                {/* Official Google G Logo */}
                <svg width="20" height="20" viewBox="0 0 18 18" fill="none" className="shrink-0">
                  <path d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84a4.14 4.14 0 01-1.8 2.71v2.26h2.91c1.7-1.56 2.69-3.86 2.69-6.6z" fill="#4285F4" />
                  <path d="M9 18c2.43 0 4.47-.8 5.96-2.2l-2.91-2.26a5.6 5.6 0 01-8.51-3.05H.5v2.33A9 9 0 009 18z" fill="#34A853" />
                  <path d="M3.54 10.49a5.39 5.39 0 010-3.43V4.73H.5a9 9 0 000 8.54l3.04-2.78z" fill="#FBBC05" />
                  <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 00.5 4.73l3.04 2.33a5.6 5.6 0 018.51-3.05z" fill="#EA4335" />
                </svg>
                <span className="tracking-tight font-display font-black text-slate-900">
                  Continue with Google
                </span>
                <ChevronRight size={18} className="text-slate-400 group-hover:translate-x-1 transition-transform ml-auto" />
              </>
            )}
          </motion.button>

          {/* Social Proof & Trust Chips */}
          <div className="flex items-center justify-center gap-4 text-[11px] font-mono text-bone-dim/70 pt-1">
            <span className="flex items-center gap-1">
              <CheckCircle2 size={12} className="text-emerald-400 shrink-0" /> Free Forever
            </span>
            <span className="w-1 h-1 rounded-full bg-bone-dim/40" />
            <span className="flex items-center gap-1">
              <Shield size={12} className="text-blue-400 shrink-0" /> Cloud Encrypted
            </span>
            <span className="w-1 h-1 rounded-full bg-bone-dim/40" />
            <span className="flex items-center gap-1">
              <Flame size={12} className="text-amber-400 shrink-0" /> Multi-Platform
            </span>
          </div>
        </motion.div>
      </div>

      {/* Footer Legal & Security */}
      <footer className="relative z-10 py-4 px-5 text-center border-t border-line/10 bg-[#050608]/80 backdrop-blur-md">
        <p className="text-[10px] sm:text-[11px] text-bone-dim/50 font-mono tracking-wide">
          Apparatus OS • Built for Calisthenics & Strength Athletes Worldwide
        </p>
      </footer>
    </div>
  );
}
