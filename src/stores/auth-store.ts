import { create } from 'zustand';
import { User, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider, ADMIN_EMAIL } from '@/lib/firebase';
import { useUIStore } from '@/stores/ui-store';
import type { UserProfile, UserStats } from '@/types';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  stats: UserStats | null;
  loading: boolean;
  initialized: boolean;

  init: () => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

const DEFAULT_STATS: UserStats = {
  totalWorkouts: 0,
  totalCalories: 0,
  totalDurationMin: 0,
  totalVolume: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastWorkoutDate: null,
  xp: 0,
  prCount: 0,
  bestHold: 0,
  badges: [],
};

function withTimeout<T>(promise: Promise<T>, timeoutMs = 8000, errorMsg = 'Operation timed out'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), timeoutMs))
  ]);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  stats: null,
  loading: true,
  initialized: false,

  init: () => {
    onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // Fetch or create profile
          const profileRef = doc(db, 'users', firebaseUser.uid);
          const profileSnap = await withTimeout(
            getDoc(profileRef),
            8000,
            'Firestore connection timed out. Please check if Cloud Firestore is enabled in your Firebase Console.'
          );

          let profile: UserProfile;

          if (profileSnap.exists()) {
            profile = { uid: firebaseUser.uid, ...profileSnap.data() } as UserProfile;
          } else {
            // First sign-in: create profile
            const usernameBase = firebaseUser.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'athlete';
            // The UID suffix makes first-login username creation deterministic and
            // avoids one new user silently claiming another user's handle.
            const username = `${usernameBase.slice(0, 20)}${firebaseUser.uid.slice(0, 5).toLowerCase()}`;
            profile = {
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || 'Athlete',
              username,
              usernameLower: username,
              displayNameLower: (firebaseUser.displayName || 'Athlete').toLowerCase(),
              email: firebaseUser.email || '',
              photoURL: firebaseUser.photoURL || '',
              bio: '',
              height: null,
              weight: null,
              age: null,
              gender: '',
              fitnessGoal: '',
              experienceLevel: 'beginner',
              preferredWorkoutType: '',
              isPublic: true,
              isAdmin: firebaseUser.email === ADMIN_EMAIL,
              createdAt: serverTimestamp() as any,
              updatedAt: serverTimestamp() as any,
            };
            
            await withTimeout(
              setDoc(profileRef, profile),
              8000,
              'Failed to create user profile in Firestore. Check your Firestore Security Rules.'
            );

            // Create stats document
            const statsRef = doc(db, 'users', firebaseUser.uid, 'stats', 'current');
            await withTimeout(
              setDoc(statsRef, DEFAULT_STATS),
              8000,
              'Failed to initialize user stats in Firestore.'
            );

            // Reserve username
            const usernameRef = doc(db, 'usernames', username);
            await withTimeout(
              setDoc(usernameRef, { uid: firebaseUser.uid }),
              8000,
              'Failed to reserve username in Firestore.'
            );
          }

          const banSnap = await withTimeout(
            getDoc(doc(db, 'bans', firebaseUser.uid)),
            8000,
            'Failed to verify account status.'
          );
          if (banSnap.exists() && banSnap.data().active === true) {
            useUIStore.getState().showToast('This account has been suspended. Contact support if you believe this is a mistake.', 'error');
            await firebaseSignOut(auth);
            set({ user: null, profile: null, stats: null, loading: false, initialized: true });
            return;
          }

          // Fetch stats
          const statsRef = doc(db, 'users', firebaseUser.uid, 'stats', 'current');
          const statsSnap = await withTimeout(
            getDoc(statsRef),
            8000,
            'Failed to retrieve user stats.'
          );
          const stats = statsSnap.exists() ? (statsSnap.data() as UserStats) : DEFAULT_STATS;
          if (!statsSnap.exists()) {
            await withTimeout(
              setDoc(statsRef, DEFAULT_STATS),
              8000,
              'Failed to initialize user stats in Firestore.'
            );
          }

          set({ user: firebaseUser, profile, stats, loading: false, initialized: true });
        } else {
          set({ user: null, profile: null, stats: null, loading: false, initialized: true });
        }
      } catch (error: any) {
        console.error('Failed to initialize user session:', error);
        useUIStore.getState().showToast(error?.message || 'Failed to initialize session. Check your database setup.', 'error');
        // Crucial: Sign out of Firebase so internal auth state matches our store's null state.
        firebaseSignOut(auth).catch(console.error);
        set({ user: null, profile: null, stats: null, loading: false, initialized: true });
      }
    });
  },

  signInWithGoogle: async () => {
    set({ loading: true });
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Google sign-in failed:', error);
      set({ loading: false });
      throw error;
    }
  },

  signOut: async () => {
    try {
      await firebaseSignOut(auth);
      set({ user: null, profile: null, stats: null });
    } catch (error) {
      console.error('Sign-out failed:', error);
      throw error;
    }
  },

  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;

    const profileRef = doc(db, 'users', user.uid);
    const profileSnap = await getDoc(profileRef);
    if (profileSnap.exists()) {
      set({ profile: { uid: user.uid, ...profileSnap.data() } as UserProfile });
    }

    const statsRef = doc(db, 'users', user.uid, 'stats', 'current');
    const statsSnap = await getDoc(statsRef);
    if (statsSnap.exists()) {
      set({ stats: statsSnap.data() as UserStats });
    }
  },

  updateProfile: async (data: Partial<UserProfile>) => {
    const { user, profile } = get();
    if (!user || !profile) return;

    const profileRef = doc(db, 'users', user.uid);
    const updates = {
      ...data,
      ...(data.displayName !== undefined ? { displayNameLower: data.displayName.toLowerCase().trim() } : {}),
      updatedAt: serverTimestamp(),
    };
    await setDoc(profileRef, updates, { merge: true });
    set({ profile: { ...profile, ...data } });
  },
}));
