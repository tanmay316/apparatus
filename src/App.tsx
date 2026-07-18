import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { Layout } from '@/components/layout/Layout';
import { AuthPage } from '@/pages/AuthPage';
import { Dashboard } from '@/pages/Dashboard';
import { ProfilePage } from '@/pages/ProfilePage';
import { PlanList } from '@/pages/PlanList';
import { PlanDetail } from '@/pages/PlanDetail';
import { DayView } from '@/pages/DayView';
import { ExplorePage } from '@/pages/ExplorePage';
import { AdminPage } from '@/pages/AdminPage';
import { WorkoutSession } from '@/pages/WorkoutSession';
import { ProgressPage } from '@/pages/ProgressPage';
import { CalendarPage } from '@/pages/CalendarPage';
import { FeedPage } from '@/pages/FeedPage';
import { AchievementsPage } from '@/pages/AchievementsPage';
import { SkillsPage } from '@/pages/SkillsPage';
import { MeasurementsPage } from '@/pages/MeasurementsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { GuidePage } from '@/pages/GuidePage';
import { Toast } from '@/components/ui/Toast';
import { useUIStore } from '@/stores/ui-store';

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
  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesSync />
      <BrowserRouter>
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
            <Route path="feed" element={<FeedPage />} />
            <Route path="profile/:username" element={<ProfilePage />} />
            <Route path="guide/:section" element={<GuidePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toast />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
