import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';
import { ReminderManager } from './ReminderManager';
import FloatingAIBot from '../nutrition/FloatingAIBot';
import { FeatureAnnouncementModal } from '../ui/FeatureAnnouncementModal';
import { Video, Bot } from 'lucide-react';

export function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-ink-3 text-bone relative selection:bg-bone selection:text-ink transition-colors duration-300 overflow-x-hidden">
      {/* Soft Ambient Mesh Gradient Mixture (Matching Reference Image 1) */}
      <div className="ambient-glow-1 fixed top-[-100px] left-[-100px] w-[650px] h-[650px] rounded-full bg-gradient-to-br from-[#dbeafe] via-[#e0e7ff] to-transparent blur-[120px] pointer-events-none -z-10 opacity-70" />
      <div className="ambient-glow-2 fixed top-[-50px] right-[-100px] w-[700px] h-[700px] rounded-full bg-gradient-to-br from-[#fde8dc] via-[#fbe1d1] to-transparent blur-[140px] pointer-events-none -z-10 opacity-75" />
      <div className="ambient-glow-3 fixed bottom-[-100px] left-[20%] w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-[#f3e8ff] via-[#e0e7ff] to-transparent blur-[130px] pointer-events-none -z-10 opacity-60" />

      <Sidebar />
      <Topbar />
      <ReminderManager />
      <FloatingAIBot />
      <BottomNav />
      <FeatureAnnouncementModal 
        featureId="v2-live-ai-features"
        title="What's New in Apparatus"
        subtitle="Two massive features just dropped."
        items={[
          {
            icon: <Video size={18} className="text-sienna" />,
            title: "Live Workout & Chat",
            description: "Train live with your friends, chat in real-time, and motivate each other right from the dashboard."
          },
          {
            icon: <Bot size={18} className="text-blue-400" />,
            title: "Meet Your New AI Workout Planner",
            description: "Generate highly customized, hyper-optimized training programs instantly based on your exact goals and equipment."
          }
        ]}
      />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-4 pb-[72px] relative">
        <Outlet />
      </main>
    </div>
  );
}

