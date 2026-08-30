import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { Loader2, Mail, Lock, ArrowRight, X } from 'lucide-react';

export function AuthPage() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, loading } = useAuthStore();
  const { showToast } = useUIStore();
  const [signingIn, setSigningIn] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleGoogleSignIn = async () => {
    if (signingIn || loading) return;
    try {
      await signInWithGoogle();
      // Only set signing in if we didn't throw (so spinner shows while auth state resolves)
      setSigningIn(true);
    } catch (error: any) {
      setSigningIn(false);
      showToast(error.message || 'Sign-in failed. Please try again.', 'error');
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    if (signingIn || loading) return;
    try {
      if (isSignUp) {
        await signUpWithEmail(email.trim(), password);
      } else {
        await signInWithEmail(email.trim(), password);
      }
      setSigningIn(true);
    } catch (error: any) {
      setSigningIn(false);
      let msg = error.message;
      if (error.code === 'auth/operation-not-allowed') {
        msg = 'Email/Password sign-in is disabled. Please enable it in your Firebase Console.';
      } else if (error.code === 'auth/invalid-credential') {
        msg = 'Invalid email or password.';
      } else if (error.code === 'auth/email-already-in-use') {
        msg = 'Email already in use. If you used Google before, try "Forgot password?".';
      }
      showToast(msg, 'error');
    }
  };

  const handleResetPassword = async () => {
    if (!email.trim()) {
      showToast('Please enter your email address above first.', 'error');
      return;
    }
    if (signingIn || loading) return;
    try {
      await resetPassword(email.trim());
      showToast('Password reset link sent! Check your email.', 'success');
    } catch (error: any) {
      showToast(error.message || 'Failed to send reset email.', 'error');
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
        <AnimatePresence mode="wait">
          {!showEmailForm ? (
            <motion.div
              key="buttons"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Continue with Google Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isSubmitting}
                className="w-full h-14 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-900 font-bold text-base rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] flex items-center justify-center gap-3 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-2.5 font-sans font-semibold text-sm text-slate-900">
                    <Loader2 size={18} className="animate-spin text-orange-600" />
                    <span>Signing in...</span>
                  </div>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 18 18" fill="none" className="shrink-0">
                      <path d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84a4.14 4.14 0 01-1.8 2.71v2.26h2.91c1.7-1.56 2.69-3.86 2.69-6.6z" fill="#4285F4"/>
                      <path d="M9 18c2.43 0 4.47-.8 5.96-2.2l-2.91-2.26a5.6 5.6 0 01-8.51-3.05H.5v2.33A9 9 0 009 18z" fill="#34A853"/>
                      <path d="M3.54 10.49a5.39 5.39 0 010-3.43V4.73H.5a9 9 0 000 8.54l3.04-2.78z" fill="#FBBC05"/>
                      <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 00.5 4.73l3.04 2.33a5.6 5.6 0 018.51-3.05z" fill="#EA4335"/>
                    </svg>
                    <span className="font-sans font-semibold text-[15px] sm:text-base text-[#17191c] tracking-tight">
                      Continue with Google
                    </span>
                  </>
                )}
              </button>
              
              <button
                type="button"
                onClick={() => setShowEmailForm(true)}
                disabled={isSubmitting}
                className="w-full h-12 bg-white/5 hover:bg-white/10 active:bg-white/20 text-white font-bold text-sm rounded-xl border border-white/10 flex items-center justify-center gap-2 transition-all disabled:opacity-60"
              >
                <Mail size={16} /> Continue with Email
              </button>
            </motion.div>
          ) : (
            <motion.form
              key="email-form"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onSubmit={handleEmailSubmit}
              className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-5 space-y-4 shadow-2xl relative"
            >
              <button 
                type="button" 
                onClick={() => setShowEmailForm(false)}
                className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
              
              <h3 className="text-lg font-bold text-white mb-2">{isSignUp ? 'Create Account' : 'Welcome Back'}</h3>
              
              <div className="space-y-3">
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Email address"
                    className="w-full h-12 bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 text-sm text-white placeholder-white/30 focus:outline-none focus:border-orange-500/50 focus:bg-black/60 transition-all"
                    required
                  />
                </div>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full h-12 bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 text-sm text-white placeholder-white/30 focus:outline-none focus:border-orange-500/50 focus:bg-black/60 transition-all"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !email || !password}
                className="w-full h-12 bg-gradient-to-r from-orange-600 to-amber-600 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 hover:from-orange-500 hover:to-amber-500 transition-all disabled:opacity-60"
              >
                {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : (
                  <>{isSignUp ? 'Sign Up' : 'Sign In'} <ArrowRight size={16} /></>
                )}
              </button>
              
              <div className="flex flex-col items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-xs text-white/60 hover:text-white transition-colors"
                >
                  {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                </button>

                {!isSignUp && (
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    className="text-[11px] text-amber-500/80 hover:text-amber-400 transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Minimal Legal Footer */}
        <p className="text-[11px] text-white/35 font-sans text-center leading-relaxed mt-4">
          By continuing, you agree to our Terms & Privacy Policy
        </p>
      </motion.div>
    </div>
  );
}
