import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'dark' | 'light';
export type UnitPreference = 'metric' | 'imperial';
export type LanguagePreference = 'en' | 'hi';

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;

  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  clearToast: () => void;
  theme: ThemePreference;
  units: UnitPreference;
  language: LanguagePreference;
  setTheme: (theme: ThemePreference) => void;
  setUnits: (units: UnitPreference) => void;
  setLanguage: (language: LanguagePreference) => void;
  
  hiddenPosts: string[];
  hidePost: (id: string) => void;
  unhidePost: (id: string) => void;
}

export const useUIStore = create<UIState>()(persist((set) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  closeSidebar: () => set({ sidebarOpen: false }),

  toast: null,
  showToast: (message, type = 'success') => {
    set({ toast: { message, type } });
    setTimeout(() => set({ toast: null }), 3500);
  },
  clearToast: () => set({ toast: null }),
  theme: 'light',
  units: 'metric',
  language: 'en',
  setTheme: (theme) => set({ theme }),
  setUnits: (units) => set({ units }),
  setLanguage: (language) => set({ language }),

  hiddenPosts: [],
  hidePost: (id) => set((s) => ({ hiddenPosts: [...(s.hiddenPosts || []), id] })),
  unhidePost: (id) => set((s) => ({ hiddenPosts: (s.hiddenPosts || []).filter(p => p !== id) })),
}), {
  name: 'apparatus-preferences',
  partialize: (state) => ({ theme: state.theme, units: state.units, language: state.language, hiddenPosts: state.hiddenPosts }),
}));
