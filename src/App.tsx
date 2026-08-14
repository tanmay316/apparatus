import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { Layout } from '@/components/layout/Layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Toast } from '@/components/ui/Toast';
import { requestNotificationPermission, scheduleDailyReminders } from '@/utils/notifications';
import { UpdatePopup } from '@/components/ui/UpdatePopup';
import { useUIStore } from '@/stores/ui-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { useCardioStore } from '@/stores/cardio-store';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { LocalNotifications } from '@capacitor/local-notifications';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { OTAUpdater } from '@/components/ui/OTAUpdater';

const AuthPage = lazy(() => import('@/pages/AuthPage').then(m => ({ default: m.AuthPage })));
const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const PlanList = lazy(() => import('@/pages/PlanList').then(m => ({ default: m.PlanList })));
const PlanDetail = lazy(() => import('@/pages/PlanDetail').then(m => ({ default: m.PlanDetail })));
const DayView = lazy(() => import('@/pages/DayView').then(m => ({ default: m.DayView })));
const ExplorePage = lazy(() => import('@/pages/ExplorePage').then(m => ({ default: m.ExplorePage })));
const NutritionDashboard = lazy(() => import('./pages/NutritionDashboard'));
const AdminPage = lazy(() => import('@/pages/AdminPage').then(m => ({ default: m.AdminPage })));
const WorkoutSession = lazy(() => import('@/pages/WorkoutSession').then(m => ({ default: m.WorkoutSession })));
const ProgressPage = lazy(() => import('@/pages/ProgressPage').then(m => ({ default: m.ProgressPage })));
const CalendarPage = lazy(() => import('@/pages/CalendarPage').then(m => ({ default: m.CalendarPage })));
const FeedPage = lazy(() => import('@/pages/FeedPage').then(m => ({ default: m.FeedPage })));
const CommunityPage = lazy(() => import('@/pages/CommunityPage').then(m => ({ default: m.CommunityPage })));
const ClanPage = lazy(() => import('@/pages/ClanPage').then(m => ({ default: m.ClanPage })));
const AchievementsPage = lazy(() => import('@/pages/AchievementsPage').then(m => ({ default: m.AchievementsPage })));
const SkillsPage = lazy(() => import('@/pages/SkillsPage').then(m => ({ default: m.SkillsPage })));
const MeasurementsPage = lazy(() => import('@/pages/MeasurementsPage').then(m => ({ default: m.MeasurementsPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const GuidePage = lazy(() => import('@/pages/GuidePage').then(m => ({ default: m.GuidePage })));
const CardioTracker = lazy(() => import('@/pages/CardioTracker').then(m => ({ default: m.CardioTracker })));
const SinglePostPage = lazy(() => import('@/pages/SinglePostPage').then(m => ({ default: m.SinglePostPage })));
const SearchPage = lazy(() => import('@/pages/SearchPage').then(m => ({ default: m.SearchPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-[#f4a080] flex flex-col items-center justify-center z-[9999]">
      <div className="relative flex flex-col items-center">
        <img 
          src="/logo.png" 
          alt="Apparatus" 
          className="w-32 h-auto mb-8 animate-[pulse_3s_ease-in-out_infinite] mix-blend-multiply opacity-90"
          style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}
        />
      </div>
    </div>
  );
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

  useEffect(() => {
    const key = 'forced-light-theme-reset-v2';
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, 'true');
      setTheme('light');
    }
  }, [setTheme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = language;

    // Status Bar config to prevent overlap and adjust colors dynamically
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
        StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
        StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light }).catch(() => {});
        StatusBar.setBackgroundColor({ color: theme === 'dark' ? '#090605' : '#FFFFFF' }).catch(() => {});
      }).catch(() => {});
    }
  }, [theme, language]);

  // Wake up backend and handle Capacitor global events
  useEffect(() => {
    const apiBase = import.meta.env.VITE_NUTRITION_API_URL || 'http://localhost:8000/api/v1';
    fetch(`${apiBase}/health`)
      .catch(e => console.debug('Backend wakeup ping failed', e));

    // Hide Splash Screen immediately once React mounts to prevent double-loading screens
    SplashScreen.hide().catch(() => {});

    requestNotificationPermission().then(granted => {
      if (granted && user) {
        scheduleDailyReminders();
      }
    });
    
    // Notify Capgo that the app is ready so it doesn't rollback updates
    if (CapacitorApp) {
      CapacitorUpdater.notifyAppReady().catch(() => {});
    }

    if (Capacitor.isNativePlatform()) {
      try {
        LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
          const data = action.notification?.extra;
          const id = action.notification?.id;
          if (data?.type === 'cardio' || id === 101 || data?.session === 'cardio') {
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

  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesSync />
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/auth" element={<PublicOnly><AuthPage /></PublicOnly>} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<Dashboard />} />
              <Route path="plans" element={<PlanList />} />
              <Route path="plans/:planId" element={<PlanDetail />} />
              <Route path="plans/:planId/day/:dayId" element={<DayView />} />
              <Route path="workout/:planId/day/:dayId" element={<WorkoutSession />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="progress" element={<ProgressPage />} />
              <Route path="skills" element={<SkillsPage />} />
              <Route path="measurements" element={<MeasurementsPage />} />
              <Route path="achievements" element={<AchievementsPage />} />
              <Route path="explore" element={<ExplorePage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="cardio" element={<CardioTracker />} />
              <Route path="feed" element={<FeedPage />} />
              <Route path="post/:id" element={<SinglePostPage />} />
              <Route path="community" element={<CommunityPage />} />
              <Route path="clan/:id" element={<ErrorBoundary><ClanPage /></ErrorBoundary>} />
              <Route path="nutrition" element={<NutritionDashboard />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="profile/:username" element={<ProfilePage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="admin" element={<AdminPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Toast />
        <UpdatePopup />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
