import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { Dumbbell } from 'lucide-react';

export function AuthPage() {
  const { signInWithGoogle, loading } = useAuthStore();
  const { showToast } = useUIStore();
  const navigate = useNavigate();

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      // Navigation is handled automatically by the PublicOnly wrapper in App.tsx 
      // once the user object is fully populated by onAuthStateChanged.
    } catch (error: any) {
      showToast(error.message || 'Sign-in failed', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-5">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        {/* Logo + branding */}
        <div className="text-center mb-10">
          <motion.div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal/10 border border-teal/20 mb-6"
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
          >
            <Dumbbell size={32} className="text-teal" />
          </motion.div>

          <h1 className="font-display text-4xl tracking-wider mb-2">APPARATUS</h1>
          <p className="text-bone-dim font-mono text-sm tracking-wider">FITNESS PLATFORM</p>
        </div>

        {/* Feature highlights */}
        <div className="card p-6 mb-6">
          <div className="space-y-4 mb-8">
            {[
              { emoji: '🏋️', text: 'Create custom workout plans for gym, calisthenics, or bodyweight' },
              { emoji: '📊', text: 'Track progress with charts, PRs, and body measurements' },
              { emoji: '🏆', text: 'Earn badges and XP as you train consistently' },
              { emoji: '👥', text: 'Follow friends, share workouts, and stay motivated' },
            ].map((item, i) => (
              <motion.div
                key={i}
                className="flex items-start gap-3"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
              >
                <span className="text-lg flex-none mt-0.5">{item.emoji}</span>
                <span className="text-sm text-bone-dim leading-relaxed">{item.text}</span>
              </motion.div>
            ))}
          </div>

          {/* Google Sign-In */}
          <motion.button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-semibold py-3.5 px-5 rounded-lg hover:bg-gray-100 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84a4.14 4.14 0 01-1.8 2.71v2.26h2.91c1.7-1.56 2.69-3.86 2.69-6.6z" fill="#4285F4" />
              <path d="M9 18c2.43 0 4.47-.8 5.96-2.2l-2.91-2.26a5.6 5.6 0 01-8.51-3.05H.5v2.33A9 9 0 009 18z" fill="#34A853" />
              <path d="M3.54 10.49a5.39 5.39 0 010-3.43V4.73H.5a9 9 0 000 8.54l3.04-2.78z" fill="#FBBC05" />
              <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 00.5 4.73l3.04 2.33a5.6 5.6 0 018.51-3.05z" fill="#EA4335" />
            </svg>
            {loading ? 'Signing in…' : 'Continue with Google'}
          </motion.button>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-bone-dim/60 font-mono">
          By continuing, you agree to track your gains and show up consistently.
        </p>
      </motion.div>
    </div>
  );
}
