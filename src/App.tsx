import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { Layout } from '@/components/layout/Layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Toast } from '@/components/ui/Toast';
import { UpdateNotifier } from '@/components/ui/UpdateNotifier';
import { useUIStore } from '@/stores/ui-store';

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
    <div className="min-h-screen bg-ink flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-sienna border-t-transparent rounded-full animate-spin" />
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
  }, [theme, language]);

  // Wake up backend (Render free tier sleeps after 15m)
  useEffect(() => {
    const apiBase = import.meta.env.VITE_NUTRITION_API_URL || 'http://localhost:8000/api/v1';
    fetch(`${apiBase}/health`)
      .catch(e => console.debug('Backend wakeup ping failed', e));
  }, []);

  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesSync />
      <BrowserRouter>
        <Suspense fallback={<LoadingScreen />}>
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
              <Route path="cardio" element={<CardioTracker />} />
              <Route path="feed" element={<FeedPage />} />
              <Route path="post/:id" element={<SinglePostPage />} />
              <Route path="community" element={<CommunityPage />} />
              <Route path="clan/:id" element={<ErrorBoundary><ClanPage /></ErrorBoundary>} />
              <Route path="nutrition" element={<NutritionDashboard />} />
              <Route path="profile/:username" element={<ProfilePage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="admin" element={<AdminPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <UpdateNotifier />
        <Toast />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
