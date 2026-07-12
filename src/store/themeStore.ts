import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Theme = 'dark' | 'light';

const prefersLight = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: light)').matches;

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: prefersLight() ? 'light' : 'dark',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
    }),
    {
      name: 'retire-on-model/theme',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

const applyTheme = (theme: Theme) => {
  document.documentElement.setAttribute('data-theme', theme);
};

// Apply immediately (before React renders) so there's no flash of the wrong
// theme, then keep <html data-theme> in sync with every future change.
applyTheme(useThemeStore.getState().theme);
useThemeStore.subscribe((state) => applyTheme(state.theme));
