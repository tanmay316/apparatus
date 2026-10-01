import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, lazy, Suspense } from 'react';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { useAuthStore } from '@/stores/auth-store';
import { Layout } from '@/components/layout/Layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Toast } from '@/components/ui/Toast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { safeInternalPath } from '@/lib/validation';
import { subscribeToNotifications } from '@/services/social';
import { 
  requestNotificationPermission, 
  scheduleWorkoutReminders,
  cancelInactivityReminders,
  notifyDevice,
  setupNotificationChannels,
  initPushNotifications
} from '@/utils/notifications';
import { categoryOf } from '@/lib/notification-center';
import { localDateKey } from '@/lib/stats';
import { useNotificationPrefs } from '@/stores/notification-prefs-store';
import { UpdatePopup } from '@/components/ui/UpdatePopup';
import { useUIStore } from '@/stores/ui-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { useCardioStore } from '@/stores/cardio-store';
import { CardioLivePublisher } from '@/components/social/CardioLivePublisher';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { OtaKit } from '@otakit/capacitor-updater';
import { SplashScreen } from '@capacitor/splash-screen';
import { LocalNotifications } from '@capacitor/local-notifications';
import { MedalCelebrationModal } from '@/components/community/MedalCelebrationModal';
import { SubscriptionSync } from '@/components/subscription/SubscriptionSync';
import { PaywallSheet } from '@/components/subscription/PaywallSheet';
import type { AppNotificationItem } from '@/types';

const loadDashboard = () => import('@/pages/Dashboard');
const loadProfile = () => import('@/pages/ProfilePage');
const loadPlanList = () => import('@/pages/PlanList');
const loadProgress = () => import('@/pages/ProgressPage');
const loadFeed = () => import('@/pages/FeedPage');
const loadCardio = () => import('@/pages/CardioTracker');
const loadWorkout = () => import('@/pages/WorkoutSession');

const AuthPage = lazy(() => import('@/pages/AuthPage').then(m => ({ default: m.AuthPage })));
const Dashboard = lazy(() => loadDashboard().then(m => ({ default: m.Dashboard })));
const ProfilePage = lazy(() => loadProfile().then(m => ({ default: m.ProfilePage })));
const PlanList = lazy(() => loadPlanList().then(m => ({ default: m.PlanList })));
const PlanDetail = lazy(() => import('@/pages/PlanDetail').then(m => ({ default: m.PlanDetail })));
const DayView = lazy(() => import('@/pages/DayView').then(m => ({ default: m.DayView })));
const ExplorePage = lazy(() => import('@/pages/ExplorePage').then(m => ({ default: m.ExplorePage })));
const NutritionDashboard = lazy(() => import('./pages/NutritionDashboard'));
const AdminPage = lazy(() => import('@/pages/AdminPage').then(m => ({ default: m.AdminPage })));
const WorkoutSession = lazy(() => loadWorkout().then(m => ({ default: m.WorkoutSession })));
const ProgressPage = lazy(() => loadProgress().then(m => ({ default: m.ProgressPage })));

const FeedPage = lazy(() => loadFeed().then(m => ({ default: m.FeedPage })));
const CommunityPage = lazy(() => import('@/pages/CommunityPage').then(m => ({ default: m.CommunityPage })));
const ClanPage = lazy(() => import('@/pages/ClanPage').then(m => ({ default: m.ClanPage })));
const ClanChatPage = lazy(() => import('@/pages/ClanChatPage').then(m => ({ default: m.ClanChatPage })));
const AchievementsPage = lazy(() => import('@/pages/AchievementsPage').then(m => ({ default: m.AchievementsPage })));
const SkillsPage = lazy(() => import('@/pages/SkillsPage').then(m => ({ default: m.SkillsPage })));
const MeasurementsPage = lazy(() => import('@/pages/MeasurementsPage').then(m => ({ default: m.MeasurementsPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const GuidePage = lazy(() => import('@/pages/GuidePage').then(m => ({ default: m.GuidePage })));
const CardioTracker = lazy(() => loadCardio().then(m => ({ default: m.CardioTracker })));
const SinglePostPage = lazy(() => import('@/pages/SinglePostPage').then(m => ({ default: m.SinglePostPage })));
const SearchPage = lazy(() => import('@/pages/SearchPage').then(m => ({ default: m.SearchPage })));
const AthleteRanksPage = lazy(() => import('@/pages/AthleteRanksPage').then(m => ({ default: m.AthleteRanksPage })));
const MarketplacePage = lazy(() => import('@/pages/MarketplacePage').then(m => ({ default: m.MarketplacePage })));
const PurchaseReturnPage = lazy(() => import('@/pages/PurchaseReturnPage').then(m => ({ default: m.PurchaseReturnPage })));

// A live session reopens straight into the tracker, so fetch it before anything else.
if (useCardioStore.getState().isTracking) void loadCardio();
if (useWorkoutStore.getState().planId) void loadWorkout();

/** Warms the main tab chunks once the first screen is up, so tab switches never show a spinner. */
function prefetchMainRoutes() {
  const run = () => {
    for (const load of [loadDashboard, loadFeed, loadProgress, loadProfile, loadPlanList, loadCardio]) {
      load().catch(() => {});
    }
  };
  const idle = (window as any).requestIdleCallback as ((cb: () => void, opts?: { timeout: number }) => void) | undefined;
  if (idle) idle(run, { timeout: 2500 });
  else setTimeout(run, 1200);
}

function LoadingScreen() {
  const dark = useUIStore(s => s.theme) === 'dark';
  return (
    <div className={`fixed inset-0 flex flex-col items-center justify-center z-[9999] ${dark ? 'bg-[#050505]' : 'bg-[#f4a080]'}`}>
      <div className="relative flex flex-col items-center">
        <img 
          src="/logo.png" 
          alt="Apparatus" 
          className={`w-32 h-auto mb-8 animate-[pulse_3s_ease-in-out_infinite] opacity-90 ${dark ? 'mix-blend-screen' : 'mix-blend-multiply'}`}
          style={{ filter: dark ? 'invert(1) brightness(1.1)' : 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}
        />
      </div>
    </div>
  );
}

// In-app banners are only for things arriving right now while the app is on screen.
// In the background FCM shows the push, and Firestore catching up after a resume or
// reconnect must not replay messages the user already got.
const BANNER_FRESH_MS = 2 * 60 * 1000;
const SHOWN_BANNERS_KEY = 'apparatus.shown-banners';

function claimBanner(id: string | undefined, createdAtMillis: number): boolean {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
  // A pending local write has no server time yet: it was created just now.
  const created = createdAtMillis || Date.now();
  if (Date.now() - created > BANNER_FRESH_MS) return false;
  if (!id) return true;
  try {
    const shown: string[] = JSON.parse(localStorage.getItem(SHOWN_BANNERS_KEY) || '[]');
    if (shown.includes(id)) return false;
    localStorage.setItem(SHOWN_BANNERS_KEY, JSON.stringify([...shown.slice(-199), id]));
  } catch { /* storage unavailable: freshness check still applies */ }
  return true;
}

function PageLoader() {
  return (
    <div className="flex h-full min-h-[50vh] w-full items-center justify-center">
      <div className="w-8 h-8 border-[3px] border-ink/20 border-t-ink/80 rounded-full animate-spin" />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuthStore();
  if (!initialized) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuthStore();
  if (!initialized) return <LoadingScreen />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function PreferencesSync() {
  const { theme, setTheme, language } = useUIStore();
  const { user } = useAuthStore();
  const initialized = useAuthStore(s => s.initialized);
  const queryClient = useQueryClient();

  // Keep the native splash up until the first real screen can paint (no loader flash in between).
  useEffect(() => {
    if (initialized) {
      SplashScreen.hide({ fadeOutDuration: 150 }).catch(() => {});
      prefetchMainRoutes();
      return;
    }
    const fallback = setTimeout(() => SplashScreen.hide().catch(() => {}), 4000);
    return () => clearTimeout(fallback);
  }, [initialized]);

  useEffect(() => {
    // One-time migration to ensure light theme is the default for new build/installs.
    const migrationKey = 'default-light-theme-v3';
    if (!localStorage.getItem(migrationKey)) {
      localStorage.setItem(migrationKey, 'true');
      setTheme('light');
    }
  }, [setTheme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = language;

    // Status Bar config to prevent overlap and adjust colors dynamically
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
        // setOverlaysWebView / setBackgroundColor are Android-only; on iOS the
        // status bar sits over the webview and is spaced via safe-area insets.
        if (Capacitor.getPlatform() === 'android') {
          StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
          StatusBar.setBackgroundColor({ color: theme === 'dark' ? '#050505' : '#FFFFFF' }).catch(() => {});
        }
        StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light }).catch(() => {});
      }).catch(() => {});
    }

    // Keep the browser/PWA chrome colour in sync with the active theme.
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute('content', theme === 'dark' ? '#050505' : '#FFFFFF');
    }
  }, [theme, language]);

  // Wake up backend and handle Capacitor global events
  useEffect(() => {
    const apiBase = import.meta.env.VITE_NUTRITION_API_URL || 'http://localhost:8000/api/v1';
    fetch(`${apiBase}/health`)
      .catch(e => console.debug('Backend wakeup ping failed', e));

    requestNotificationPermission();

    // Setup Android notification channels
    setupNotificationChannels();

    if (CapacitorApp) {
      OtaKit.notifyAppReady();
    }

    if (Capacitor.isNativePlatform()) {
      try {
        LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
          const data = action.notification?.extra;
          const id = action.notification?.id;
          const link = safeInternalPath(data?.link);
          if (link) {
            window.location.href = link;
          } else if (typeof data?.clanId === 'string' && data.clanId) {
            window.location.href = `/clan/${encodeURIComponent(data.clanId)}/chat`;
          } else if (data?.type === 'cardio' || id === 101 || data?.session === 'cardio') {
            window.location.href = '/cardio';
          } else if (data?.type === 'gym' || id === 1001 || id === 102 || data?.session === 'gym') {
            const { planId, dayId } = useWorkoutStore.getState();
            if (planId && dayId) {
              window.location.href = `/workout/${planId}/day/${dayId}`;
            } else {
              window.location.href = '/plans';
            }
          } else if (data?.type === 'follow_request') {
            window.location.href = `/?redirect_modal=followers`; 
          }
        });
      } catch (err) {
        // Safe fail
      }
    }

    // Hardware back button for Android
    const backListener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      // If there is an active hash (e.g. #ai-chat modal), pop it
      if (window.location.hash) {
        window.history.back();
      } 
      // If we are not at the root route and can go back, pop the history
      else if (window.location.pathname !== '/' && window.location.pathname !== '/auth') {
        window.history.back();
      } else {
        // Otherwise natively exit the app
        CapacitorApp.exitApp();
      }
    });

    return () => {
      backListener.then(l => l.remove());
    };
  }, []);

  // Keep scheduled reminders in line with the user's notification preferences.
  const lastWorkoutDate = useAuthStore(state => state.stats?.lastWorkoutDate);
  const reminderPrefs = useNotificationPrefs();
  useEffect(() => {
    if (!user?.uid || !Capacitor.isNativePlatform()) return;
    scheduleWorkoutReminders({ trainedToday: lastWorkoutDate === localDateKey(), prefs: reminderPrefs }).catch(() => {});
    if (!reminderPrefs.inactivityReminders || !reminderPrefs.bannersEnabled || !reminderPrefs.categories.reminders) {
      cancelInactivityReminders().catch(() => {});
    }
  }, [
    user?.uid, lastWorkoutDate, reminderPrefs.workoutReminders, reminderPrefs.reminderTime, reminderPrefs.reminderDays,
    reminderPrefs.inactivityReminders, reminderPrefs.bannersEnabled, reminderPrefs.categories.reminders,
  ]);

  // Global real-time notification listener (Always active for mobile local & in-app delivery)
  useEffect(() => {
    if (!user?.uid) return;

    // Register push notification token on mobile
    initPushNotifications(user.uid);

    // 1. Listen to main 'notifications' collection (Clan messages, announcements, challenges, achievements)
    const unsubMain = subscribeToNotifications(
      user.uid,
      (notes) => {
        queryClient.setQueryData(['notifications', user.uid], notes);
      },
      (newNote) => {
        if (!newNote.read) {
          // Suppress notification if user is actively looking at this clan's chat page
          if (newNote.type === 'clan_message' && newNote.extra?.clanId) {
            if (window.location.pathname === `/clan/${newNote.extra.clanId}/chat`) {
              return;
            }
          }
          // Workout reminders are already scheduled as native local notifications.
          if (newNote.type === 'reminder' && newNote.extra?.kind === 'workout_reminder' && Capacitor.isNativePlatform()) return;
          // The workout-complete banner already carries the volume change; cardio shows it on the summary.
          if (newNote.extra?.kind === 'progress' || newNote.extra?.kind === 'cardio_progress') return;
          const createdAtMillis = newNote.createdAt && typeof (newNote.createdAt as any).toMillis === 'function'
            ? (newNote.createdAt as any).toMillis()
            : ((newNote.createdAt as any)?.seconds ? (newNote.createdAt as any).seconds * 1000 : 0);

          if (claimBanner(newNote.id, createdAtMillis)) {
            notifyDevice(
              categoryOf(newNote.type),
              newNote.senderName || 'Apparatus',
              newNote.message,
              {
                ...newNote.extra,
                type: newNote.type,
                senderId: newNote.senderId,
                targetId: newNote.targetId,
                id: newNote.id,
                link: newNote.extra?.link || (newNote.extra?.clanId ? `/clan/${newNote.extra.clanId}/chat` : undefined)
              }
            );
          }
        }
      }
    );

    // 2. Also listen to 'app_notifications' collection (Join requests, direct notifications)
    const qAppNotifs = query(
      collection(db, 'app_notifications'),
      where('userId', '==', user.uid),
      where('read', '==', false)
    );

    const unsubAppNotifs = onSnapshot(qAppNotifs, (snap) => {
      // Cached replays are not new arrivals.
      if (snap.metadata.fromCache) return;
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const notif = change.doc.data() as AppNotificationItem;
          const createdAtMillis = notif.createdAt && typeof (notif.createdAt as any).toMillis === 'function'
            ? (notif.createdAt as any).toMillis()
            : ((notif.createdAt as any)?.seconds ? (notif.createdAt as any).seconds * 1000 : 0);

          if (claimBanner(change.doc.id, createdAtMillis)) {
            notifyDevice(categoryOf(notif.type), notif.title || 'Apparatus', notif.body || 'New notification', {
              ...notif,
              id: change.doc.id,
              link: notif.link,
            });
          }
        }
      });
    }, (err) => console.warn('App notification subscription error:', err));

    return () => {
      unsubMain();
      unsubAppNotifs();
    };
  }, [user?.uid, queryClient]);

  return null;
}

function ActiveSessionRestorer() {
  const navigate = useNavigate();
  const location = useLocation();
  const hasRestoredRef = useRef(false);

  // Only auto-redirect on initial cold-start / first mount, not on subsequent navigations.
  // This prevents the flash-back loop when the user intentionally leaves the tracking page.
  useEffect(() => {
    if (hasRestoredRef.current) return;
    const cardio = useCardioStore.getState();
    if (cardio.isTracking && location.pathname === '/') {
      hasRestoredRef.current = true;
      navigate('/cardio', { replace: true });
    }
  }, [navigate, location.pathname]);

  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesSync />
      <CardioLivePublisher />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ActiveSessionRestorer />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/auth" element={<PublicOnly><AuthPage /></PublicOnly>} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<Dashboard />} />
              <Route path="plans" element={<PlanList />} />
              <Route path="plans/:planId" element={<PlanDetail />} />
              <Route path="plans/:planId/day/:dayId" element={<DayView />} />
              <Route path="workout/:planId/day/:dayId" element={<WorkoutSession />} />
              <Route path="calendar" element={<ProgressPage />} />
              <Route path="progress" element={<ProgressPage />} />
              <Route path="skills" element={<SkillsPage />} />
              <Route path="measurements" element={<MeasurementsPage />} />
              <Route path="achievements" element={<AchievementsPage />} />
              <Route path="ranks" element={<AthleteRanksPage />} />
              <Route path="athlete-ranks" element={<AthleteRanksPage />} />
              <Route path="explore" element={<ExplorePage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="cardio" element={<CardioTracker />} />
              <Route path="feed" element={<FeedPage />} />
              <Route path="post/:id" element={<SinglePostPage />} />
              <Route path="community" element={<CommunityPage />} />
              <Route path="clan/:id" element={<ErrorBoundary><ClanPage /></ErrorBoundary>} />
              <Route path="clan/:id/chat" element={<ErrorBoundary><ClanChatPage /></ErrorBoundary>} />
              <Route path="nutrition" element={<NutritionDashboard />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="profile/:username" element={<ProfilePage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="admin" element={<AdminPage />} />
            <Route path="marketplace" element={<MarketplacePage />} />
            <Route path="purchase/:orderId" element={<PurchaseReturnPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Toast />
        <ConfirmModal />
        <UpdatePopup />
        <MedalCelebrationModal />
        <SubscriptionSync />
        <PaywallSheet />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
