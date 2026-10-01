import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, GoogleAuthProvider } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, setLogLevel, type Firestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// ─── Environment Variable Validation ──────────────────────────
// Fail loudly at startup if any required config is missing, rather
// than letting the app crash mysteriously on the first Firestore call.
const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

const missing = requiredEnvVars.filter((key) => !import.meta.env[key]);
if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables:\n  ${missing.join('\n  ')}\n\n` +
    'Create a .env file in the project root. See .env.example for the template.'
  );
}

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

// Native apps sign in through the OS SDKs (credential flow), so skip getAuth()'s
// popup/redirect resolver: it loads an authDomain iframe that never settles inside
// the iOS WKWebView (capacitor:// origin) and stalls onAuthStateChanged.
export const auth = Capacitor.isNativePlatform()
  ? initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })
  : getAuth(app);

/** The signed-in user once Firebase has restored the session (currentUser is null for a moment at startup). */
export async function getSignedInUser() {
  if (!auth.currentUser) await auth.authStateReady();
  return auth.currentUser;
}
// IndexedDB cache: listeners answer from disk instantly on resume/cold start, then sync.
function createFirestore(): Firestore {
  try {
    return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch (err) {
    console.warn('Firestore persistent cache unavailable, using memory cache:', err);
    return getFirestore(app);
  }
}
export const db = createFirestore();
// The SDK warns on every dropped listen stream (backgrounding, network switch) even though
// it reconnects on its own; real failures still reach callers as rejected promises/errors.
setLogLevel('error');
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Must stay in sync with isAdmin() in firestore.rules.
export const ADMIN_EMAILS: string[] = ['tanmay.sharma4334@gmail.com', 'sharmamoni913@gmail.com'];

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

/** Client-side mirror of the rules check: admin email and a verified address. */
export function isAdminUser(user: { email: string | null; emailVerified: boolean } | null | undefined): boolean {
  return !!user && user.emailVerified && isAdminEmail(user.email);
}
