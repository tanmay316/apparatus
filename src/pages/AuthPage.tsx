import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { Loader2 } from 'lucide-react';

export function AuthPage() {
  const { signInWithGoogle, loading } = useAuthStore();
  const { showToast } = useUIStore();
  const [signingIn, setSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
    if (signingIn || loading) return;
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      showToast(error.message || 'Sign-in failed. Please try again.', 'error');
    } finally {
      setSigningIn(false);
    }
  };

  const isSubmitting = signingIn || loading;

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full bg-[#08080a] text-white flex flex-col justify-between relative overflow-hidden select-none px-6 py-8 sm:py-12">
      {/* Background Ambient Glow Accents */}
      <div
        className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(224,90,43,0.22) 0%, rgba(245,158,11,0.08) 50%, transparent 70%)',
          filter: 'blur(50px)',
        }}
      />
      <div
        className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(224,90,43,0.12) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />

      {/* Subtle Background Pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)`,
          backgroundSize: '24px 24px',
        }}
      />

      {/* Top Spacer */}
      <div className="w-full" />

      {/* Center Branding & Identity Section */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-sm mx-auto w-full my-auto">
        {/* Brand Icon Emblem */}
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative mb-6"
        >
          {/* Subtle Ambient Back-Glow */}
          <div className="absolute -inset-2 rounded-3xl bg-gradient-to-tr from-amber-500/25 to-orange-600/25 blur-xl pointer-events-none" />

          {/* Icon Badge */}
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-white/[0.04] border border-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.6)] flex items-center justify-center backdrop-blur-xl">
            <img
              src="/logo.png"
              alt="Apparatus"
              className="w-12 h-12 sm:w-14 sm:h-14 object-contain filter invert brightness-125 drop-shadow-[0_0_16px_rgba(224,90,43,0.6)]"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/logo.png';
              }}
            />
          </div>
        </motion.div>

        {/* Wordmark */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
          className="space-y-2"
        >
          <h1
            className="font-sans tracking-[0.4em] text-3xl sm:text-4xl font-light text-white uppercase select-none leading-none pl-1.5"
            style={{ textShadow: '0 0 20px rgba(224,90,43,0.35)' }}
          >
            ΛPPΛRΛTUS
          </h1>
          <p className="text-xs sm:text-sm font-sans text-white/60 tracking-wider">
            Gym, Calisthenics & Social Fitness
          </p>
        </motion.div>

        {/* Minimal Feature Pillars (No boxes, clean and refined) */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex items-center justify-center gap-2 sm:gap-3 text-[11px] sm:text-xs font-mono text-white/40 mt-8 tracking-widest uppercase"
        >
          <span>Gym & Calisthenics</span>
          <span className="text-amber-500/60">•</span>
          <span>Fitness Tracking</span>
          <span className="text-amber-500/60">•</span>
          <span>Social Network</span>
        </motion.div>
      </div>

      {/* Bottom Actions Section */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.25, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-sm mx-auto space-y-4"
      >
        {/* Continue with Google Button */}
        <motion.button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting}
          whileTap={{ scale: 0.98 }}
          className="w-full h-14 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-900 font-bold text-base rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] flex items-center justify-center gap-3 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
        >
          {isSubmitting ? (
            <div className="flex items-center gap-2.5 font-sans font-semibold text-sm text-slate-900">
              <Loader2 size={18} className="animate-spin text-orange-600" />
              <span>Signing in...</span>
            </div>
          ) : (
            <>
              {/* Google 4-Color Icon */}
              <svg width="20" height="20" viewBox="0 0 18 18" fill="none" className="shrink-0">
                <path
                  d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84a4.14 4.14 0 01-1.8 2.71v2.26h2.91c1.7-1.56 2.69-3.86 2.69-6.6z"
                  fill="#4285F4"
                />
                <path
                  d="M9 18c2.43 0 4.47-.8 5.96-2.2l-2.91-2.26a5.6 5.6 0 01-8.51-3.05H.5v2.33A9 9 0 009 18z"
                  fill="#34A853"
                />
                <path
                  d="M3.54 10.49a5.39 5.39 0 010-3.43V4.73H.5a9 9 0 000 8.54l3.04-2.78z"
                  fill="#FBBC05"
                />
                <path
                  d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 00.5 4.73l3.04 2.33a5.6 5.6 0 018.51-3.05z"
                  fill="#EA4335"
                />
              </svg>
              <span className="font-sans font-semibold text-[15px] sm:text-base text-[#17191c] tracking-tight">
                Continue with Google
              </span>
            </>
          )}
        </motion.button>

        {/* Minimal Legal Footer */}
        <p className="text-[11px] text-white/35 font-sans text-center leading-relaxed">
          By continuing, you agree to our Terms & Privacy Policy
        </p>
      </motion.div>
    </div>
  );
}
