import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'dark' | 'light';
export type UnitPreference = 'metric' | 'imperial';
export type LanguagePreference = 'en' | 'hi';

export interface ConfirmModalOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info' | 'primary';
  icon?: 'trash' | 'alert' | 'info' | 'logout' | 'check';
}

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;

  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  clearToast: () => void;

  confirmModal: {
    isOpen: boolean;
    options: ConfirmModalOptions;
    resolve: (value: boolean) => void;
  } | null;
  confirm: (options: string | ConfirmModalOptions) => Promise<boolean>;
  closeConfirm: (result: boolean) => void;

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

export const useUIStore = create<UIState>()(persist((set, get) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  closeSidebar: () => set({ sidebarOpen: false }),

  toast: null,
  showToast: (message, type = 'success') => {
    set({ toast: { message, type } });
    setTimeout(() => set({ toast: null }), 3500);
  },
  clearToast: () => set({ toast: null }),

  confirmModal: null,
  confirm: (options: string | ConfirmModalOptions) => {
    return new Promise<boolean>((resolve) => {
      const opts: ConfirmModalOptions = typeof options === 'string'
        ? { message: options }
        : options;
      set({
        confirmModal: {
          isOpen: true,
          options: opts,
          resolve,
        },
      });
    });
  },
  closeConfirm: (result: boolean) => {
    const modal = get().confirmModal;
    if (modal?.resolve) {
      modal.resolve(result);
    }
    set({ confirmModal: null });
  },

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
