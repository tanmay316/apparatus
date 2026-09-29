import { create } from 'zustand';
import { User, onAuthStateChanged, signInWithPopup, signInWithRedirect, signInWithCredential, GoogleAuthProvider, OAuthProvider, getRedirectResult, signOut as firebaseSignOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile as updateAuthProfile } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { createAppleNonce } from '@/lib/nonce';
import { deleteField, doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider, isAdminUser } from '@/lib/firebase';
import { isBanActive } from '@/lib/ban';
import { sanitizeUsername, validateDisplayName } from '@/lib/validation';
import { STATS_VERSION, emptyStats } from '@/lib/stats';
import { getProfileVisibility } from '@/lib/privacy';
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
  /** iOS only: Sign in with Apple (App Store guideline 4.8). */
  signInWithApple: () => Promise<void>;
  /** Revokes the Apple token before account deletion (App Store guideline 5.1.1(v)). */
  revokeAppleAccess: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  reauthenticate: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

const DEFAULT_STATS: UserStats = { ...emptyStats(), statsVersion: STATS_VERSION };

const SUSPENDED_MESSAGE = 'This account has been suspended. Contact support if you believe this is a mistake.';
let stopBanWatch: (() => void) | null = null;
// Apple shares the user's name only on the very first authorization, and only with the
// app (not in the ID token), so hand it to first-login profile creation.
let pendingAppleName: string | null = null;

export const isAppleSignInAvailable = () => Capacitor.getPlatform() === 'ios';

function hasProvider(user: User, providerId: string) {
  return user.providerData.some(p => p.providerId === providerId);
}

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
    // Web-only: native builds sign in with credentials and have no redirect resolver.
    if (!Capacitor.isNativePlatform()) {
      getRedirectResult(auth).catch(err => {
        console.error('Redirect sign-in error:', err);
      });
    }

    onAuthStateChanged(auth, async (firebaseUser) => {
      stopBanWatch?.();
      stopBanWatch = null;
      const appleName = pendingAppleName;
      pendingAppleName = null;
      try {
        if (firebaseUser) {
          // Fetch or create profile asynchronously
          const profileRef = doc(db, 'users', firebaseUser.uid);
          const profileSnap = await withTimeout(
            getDoc(profileRef),
            8000,
            'Firestore connection timed out. Please check if Cloud Firestore is enabled in your Firebase Console.'
          );

          let profile: UserProfile;

          if (profileSnap.exists()) {
            profile = { uid: firebaseUser.uid, ...profileSnap.data() } as UserProfile;
            // If the user has a photoURL from Google/Auth, but not yet in Firestore profile, sync it
            if (firebaseUser.photoURL && (!profile.photoURL || profile.photoURL === '')) {
              profile.photoURL = firebaseUser.photoURL;
              setDoc(profileRef, { photoURL: firebaseUser.photoURL }, { merge: true }).catch(() => {});
            }
            // Profiles are readable by every signed-in user, so never keep the email
            // or device push tokens there (tokens now live in users/{uid}/private/push).
            const privateKeys = ['email', 'fcmToken', 'fcmTokens', 'lastFcmRegisteredAt'].filter(k => k in profile);
            if (privateKeys.length) {
              const cleanup: Record<string, unknown> = {};
              for (const k of privateKeys) { delete (profile as any)[k]; cleanup[k] = deleteField(); }
              setDoc(profileRef, cleanup, { merge: true }).catch(() => {});
            }
          } else {
            // First sign-in: create profile
            const usernameBase = sanitizeUsername(
              firebaseUser.email?.split('@')[0] || 'athlete'
            );
            // The UID suffix makes first-login username creation deterministic and
            // avoids one new user silently claiming another user's handle.
            const username = `${usernameBase.slice(0, 20)}${firebaseUser.uid.slice(0, 5).toLowerCase()}`;
            const safeDisplayName = validateDisplayName(firebaseUser.displayName || appleName || '');
            profile = {
              uid: firebaseUser.uid,
              displayName: safeDisplayName,
              username,
              usernameLower: username,
              displayNameLower: safeDisplayName.toLowerCase(),
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
              isAdmin: isAdminUser(firebaseUser),
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

          // The rules decide admin rights from the verified email; keep the profile flag in step with them.
          const adminNow = isAdminUser(firebaseUser);
          if (adminNow && !profile.isAdmin) setDoc(profileRef, { isAdmin: true }, { merge: true }).catch(() => {});
          profile.isAdmin = adminNow;
          if (adminNow) {
            import('@/services/admin-alerts').then(m => m.registerAdmin(firebaseUser.uid)).catch(() => {});
          }

          const banSnap = await withTimeout(
            getDoc(doc(db, 'bans', firebaseUser.uid)),
            8000,
            'Failed to verify account status.'
          );
          if (banSnap.exists() && isBanActive(banSnap.data())) {
            useUIStore.getState().showToast(SUSPENDED_MESSAGE, 'error');
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
          // A ban issued while the user is signed in takes effect immediately.
          stopBanWatch = onSnapshot(doc(db, 'bans', firebaseUser.uid), snap => {
            if (snap.exists() && isBanActive(snap.data()) && auth.currentUser?.uid === firebaseUser.uid) {
              useUIStore.getState().showToast(SUSPENDED_MESSAGE, 'error');
              get().signOut().catch(() => {});
            }
          }, () => {});
          // Heal accounts that renamed before Settings synced the Auth profile.
          syncAuthIdentity(profile.displayName || undefined, profile.photoURL || undefined);
          runAccountMaintenance(firebaseUser.uid, profile, stats);
        } else {
          set({ user: null, profile: null, stats: null, loading: false, initialized: true });
        }
      } catch (error: any) {
        console.error('Failed to initialize user session:', error);
        useUIStore.getState().showToast('Network timeout. Please check your connection and refresh.', 'error');
        // Do NOT forcefully sign out of Firebase here. The user is still authenticated, 
        // they just had a bad connection. Forcing signOut deletes their session!
        set({ user: null, profile: null, stats: null, loading: false, initialized: true });
      }
    });
  },

  signInWithGoogle: async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        set({ loading: true });
        try {
          const result = await SocialLogin.login({
            provider: 'google',
            options: {},
          });
          const idToken = (result.result as any).idToken;
          if (!idToken) throw new Error('Google Sign-In did not return an ID token');
          
          const credential = GoogleAuthProvider.credential(idToken);
          await signInWithCredential(auth, credential);
          set({ loading: false });
          return;
        } catch (nativeErr: any) {
          console.error('Native GoogleAuth error:', nativeErr);
          set({ loading: false });
          const msg = nativeErr?.message || String(nativeErr);
          const platform = Capacitor.getPlatform();

          // User dismissed the account picker (GIDSignInError.canceled = -5 / Android 12501).
          if (/cancel|12501|-5\b/i.test(msg)) return;

          if (platform === 'ios') {
            useUIStore.getState().showToast(
              `Google Sign-In failed: ${msg}`,
              'error'
            );
          } else if (msg.includes('12500') || msg.includes('APIException')) {
            useUIStore.getState().showToast('Firebase Error: SHA-1 fingerprint missing in Firebase Console for this Android app.', 'error');
          } else {
            useUIStore.getState().showToast(`Native Login Failed: ${msg}`, 'error');
          }
          return;
        }
      }

      // Web/PWA path: DO NOT set loading true here, it breaks popup on iOS Safari PWA
      await signInWithPopup(auth, googleProvider);
      set({ loading: true }); // set loading after popup opens successfully
    } catch (error: any) {
      console.error('Google sign-in failed:', error);
      set({ loading: false });
      if (error.code === 'auth/popup-blocked') {
        useUIStore.getState().showToast('Popup blocked by browser. Please allow popups or use Safari normally.', 'error');
      } else {
        throw error;
      }
    }
  },

  signInWithApple: async () => {
    if (!isAppleSignInAvailable()) throw new Error('Sign in with Apple is only available in the iOS app.');
    set({ loading: true });
    try {
      const nonce = await createAppleNonce();
      const result = await SocialLogin.login({ provider: 'apple', options: { nonce: nonce.hashed } });
      const apple = result.result as { idToken?: string | null; profile?: { givenName?: string | null; familyName?: string | null } };
      if (!apple.idToken) throw new Error('Sign in with Apple did not return an identity token');

      const name = [apple.profile?.givenName, apple.profile?.familyName].filter(Boolean).join(' ').trim();
      pendingAppleName = name || null;
      const credential = new OAuthProvider('apple.com').credential({ idToken: apple.idToken, rawNonce: nonce.raw });
      const { user } = await signInWithCredential(auth, credential);
      if (name && !user.displayName) updateAuthProfile(user, { displayName: name }).catch(() => {});
      set({ loading: false });
    } catch (error: any) {
      pendingAppleName = null;
      set({ loading: false });
      const msg = String(error?.message || error);
      // ASAuthorizationError.canceled (1001): the user closed the sheet.
      if (/1001|cancel/i.test(msg)) return;
      console.error('Apple sign-in failed:', error);
      if (/1000|unknown/i.test(msg)) {
        throw new Error('Sign in with Apple is not set up for this build. Enable the "Sign in with Apple" capability in Xcode.');
      }
      throw error;
    }
  },

  revokeAppleAccess: async () => {
    const user = auth.currentUser;
    if (!user || !hasProvider(user, 'apple.com') || !isAppleSignInAvailable()) return;
    const nonce = await createAppleNonce();
    const result = await SocialLogin.login({ provider: 'apple', options: { nonce: nonce.hashed } });
    const apple = result.result as { idToken?: string | null; accessToken?: { token?: string } | null; authorizationCode?: string };
    const code = apple.authorizationCode || apple.accessToken?.token;
    if (apple.idToken) {
      const { reauthenticateWithCredential } = await import('firebase/auth');
      await reauthenticateWithCredential(user, new OAuthProvider('apple.com').credential({ idToken: apple.idToken, rawNonce: nonce.raw }));
    }
    if (code) {
      const { revokeAccessToken } = await import('firebase/auth');
      await revokeAccessToken(auth, code);
    }
  },

  signInWithEmail: async (email: string, pass: string) => {
    set({ loading: true });
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error: any) {
      set({ loading: false });
      throw error;
    }
  },

  signUpWithEmail: async (email: string, pass: string) => {
    set({ loading: true });
    try {
      await createUserWithEmailAndPassword(auth, email, pass);
    } catch (error: any) {
      set({ loading: false });
      throw error;
    }
  },

  resetPassword: async (email: string) => {
    set({ loading: true });
    try {
      await sendPasswordResetEmail(auth, email);
      set({ loading: false });
    } catch (error: any) {
      set({ loading: false });
      throw error;
    }
  },

  reauthenticate: async () => {
    const { user } = get();
    if (!user) throw new Error("No authenticated user");
    
    try {
      if (Capacitor.isNativePlatform()) {
        const result = await SocialLogin.login({
          provider: 'google',
          options: {},
        });
        const idToken = (result.result as any).idToken;
        if (!idToken) throw new Error('Google Sign-In did not return an ID token');
        const credential = GoogleAuthProvider.credential(idToken);
        const { reauthenticateWithCredential } = await import('firebase/auth');
        await reauthenticateWithCredential(user, credential);
        return;
      }
      const { reauthenticateWithPopup, GoogleAuthProvider: GAP } = await import('firebase/auth');
      await reauthenticateWithPopup(user, new GAP());
    } catch (error: any) {
      console.error('Reauthentication failed:', error);
      throw error;
    }
  },

  signOut: async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const current = auth.currentUser;
        const provider = current && hasProvider(current, 'apple.com') ? 'apple' : 'google';
        try {
          await SocialLogin.logout({ provider });
        } catch (e) {
          console.error('Failed to sign out of native provider:', e);
        }
      }
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
      const pData = { uid: user.uid, ...profileSnap.data() } as UserProfile;
      pData.isAdmin = isAdminUser(user);
      if (user.photoURL && (!pData.photoURL || pData.photoURL === '')) {
        pData.photoURL = user.photoURL;
        setDoc(profileRef, { photoURL: user.photoURL }, { merge: true }).catch(() => {});
      }
      set({ profile: pData });
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

    // isAdmin is derived from the account email and must never be written from here.
    const { isAdmin: _isAdmin, ...rest } = data;
    const profileRef = doc(db, 'users', user.uid);
    const updates = {
      ...rest,
      ...(data.displayName !== undefined ? { displayNameLower: data.displayName.toLowerCase().trim() } : {}),
      updatedAt: serverTimestamp(),
    };
    await setDoc(profileRef, updates, { merge: true });
    set({ profile: { ...profile, ...rest } });
    await syncAuthIdentity(data.displayName, data.photoURL);
    // Rank standards depend on bodyweight and sex.
    const { stats } = get();
    if ((data.weight !== undefined || data.gender !== undefined) && stats) {
      import('@/services/stats').then(({ syncAthleteRank }) => syncAthleteRank(user.uid, stats, { notify: false })).catch(() => {});
    }
  },
}));

/** One-off background repairs: rebuild stale stats and hide public content of private profiles. */
function runAccountMaintenance(uid: string, profile: UserProfile, stats: UserStats) {
  if ((stats.statsVersion || 0) < STATS_VERSION) {
    import('@/services/stats').then(({ scheduleStatsReconcile }) => scheduleStatsReconcile(uid)).catch(() => {});
  } else {
    // Consistency and old bests fade with time, so the stored rank can go stale between sessions.
    import('@/services/stats').then(({ syncAthleteRank }) => syncAthleteRank(uid, stats, { notify: false })).catch(() => {});
  }
  if (!stats.tutorSkills) {
    Promise.all([import('@/services/skills'), import('@/services/stats')])
      .then(([{ loadSkillTutor }, { syncTutorSkills }]) => loadSkillTutor(uid).then(tutor => syncTutorSkills(uid, tutor.progress)))
      .catch(() => {});
  }
  const flag = `apparatus_privacy_synced_${uid}`;
  if (getProfileVisibility(profile) !== 'public' && !localStorage.getItem(flag)) {
    import('@/services/social')
      .then(({ restrictPublicContent }) => restrictPublicContent(uid))
      .then(() => localStorage.setItem(flag, '1'))
      .catch(err => console.warn('[privacy] could not restrict public content', err));
  }
}

/** New posts/comments read `user.displayName`, so the Auth profile must follow Settings edits. */
async function syncAuthIdentity(displayName?: string, photoURL?: string) {
  const current = auth.currentUser;
  if (!current) return;
  const patch: { displayName?: string; photoURL?: string | null } = {};
  if (displayName !== undefined && displayName !== current.displayName) patch.displayName = displayName;
  if (photoURL !== undefined) {
    // Compressed data-URL avatars live only in Firestore (Auth rejects long URLs);
    // clear the Auth photo so stale provider photos aren't copied into new posts.
    const authPhoto = /^https?:\/\//.test(photoURL) && photoURL.length < 1500 ? photoURL : null;
    if (authPhoto !== current.photoURL) patch.photoURL = authPhoto;
  }
  if (Object.keys(patch).length === 0) return;
  try {
    await updateAuthProfile(current, patch);
    useAuthStore.setState({ user: auth.currentUser });
  } catch (err) {
    console.warn('[auth] could not sync Auth profile', err);
  }
}
