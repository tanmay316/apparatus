import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Bot, Plus } from 'lucide-react';
import NutritionChat from './NutritionChat';
import { useScrollDirection } from '@/hooks/useScrollDirection';

// The routes where the floating bot should be visible
const ALLOWED_ROUTES = ['/', '/nutrition', '/progress', '/plans'];

export default function FloatingAIBot() {
  const [isOpen, setIsOpen] = useState(false);
  // Opened from "Ask AI" on a screen where the floating button isn't shown.
  const [forced, setForced] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const location = useLocation();
  const scrollDirection = useScrollDirection();
  
  // Close chat if navigating away from allowed routes (optional, but good UX)
  const isAllowedRoute = ALLOWED_ROUTES.includes(location.pathname) || forced;

  // Auto-close if navigating away from an allowed route
  useEffect(() => {
    if (!isAllowedRoute) {
      setIsOpen(false);
    }
  }, [isAllowedRoute]);

  useEffect(() => {
    if (!isOpen) setForced(false);
  }, [isOpen]);

  // Sync modal state with URL hash for Android back button support
  useEffect(() => {
    if (isOpen) {
      window.location.hash = 'ai-chat';
    } else if (window.location.hash === '#ai-chat') {
      window.history.back();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash !== '#ai-chat' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [isOpen]);

  // Listen for custom event to open the bot from anywhere
  useEffect(() => {
    const handleOpenBot = (e: Event) => {
      const text = (e as CustomEvent<{ prompt?: string }>).detail?.prompt;
      if (text) {
        setForced(true);
        setPrompt(text);
        setIsOpen(true);
      } else if (isAllowedRoute) setIsOpen(true);
    };
    window.addEventListener('open-ai-bot', handleOpenBot);
    return () => window.removeEventListener('open-ai-bot', handleOpenBot);
  }, [isAllowedRoute]);

  if (!isAllowedRoute) return null;

  // Show floating button only when chat is closed AND (scrolling up OR at top).
  // The nutrition page has its own + menu with an "Ask Astra" entry.
  const isVisible = !isOpen && !forced && scrollDirection === 'up' && location.pathname !== '/nutrition';

  return (
    <>
      <AnimatePresence>
        {isVisible && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-[110px] right-4 sm:right-6 z-[210] w-12 h-12 rounded-full bg-gradient-to-tr from-sienna to-orange-500 shadow-xl shadow-sienna/30 flex items-center justify-center text-white"
          >
            {/* Pulsing rings effect */}
            {!isOpen && (
              <>
                <motion.div
                  className="absolute inset-0 rounded-full bg-sienna/40"
                  animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full bg-sienna/20"
                  animate={{ scale: [1, 1.8, 1], opacity: [0.3, 0, 0.3] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
                />
              </>
            )}
            <Sparkles size={20} className="relative z-10" />
          </motion.button>
        )}
      </AnimatePresence>

      <NutritionChat isOpen={isOpen} onClose={() => setIsOpen(false)} initialPrompt={prompt} onPromptSent={() => setPrompt(null)} />
    </>
  );
}
