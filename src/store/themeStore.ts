import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** The user's appearance *choice*. 'system' follows the OS colour scheme. */
export type Theme = 'dark' | 'light' | 'system';
/** The concrete theme actually applied to <html data-theme>. */
export type ResolvedTheme = 'dark' | 'light';

const darkMql = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

const systemTheme = (): ResolvedTheme => (darkMql()?.matches ? 'dark' : 'light');

/** Resolve a choice to the concrete theme, consulting the OS for 'system'. */
export const resolveTheme = (theme: Theme): ResolvedTheme =>
  theme === 'system' ? systemTheme() : theme;

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      // Default to following the OS so first-run matches the user's environment.
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      // Cycle only between the explicit modes (used by the compact toggle).
      toggleTheme: () =>
        set((s) => ({ theme: resolveTheme(s.theme) === 'dark' ? 'light' : 'dark' })),
    }),
    {
      name: 'runaway/theme',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

const applyTheme = (theme: Theme) => {
  document.documentElement.setAttribute('data-theme', resolveTheme(theme));
};

// Apply immediately (before React renders) so there's no flash of the wrong
// theme, then keep <html data-theme> in sync with every future change.
applyTheme(useThemeStore.getState().theme);
useThemeStore.subscribe((state) => applyTheme(state.theme));

// When the choice is 'system', re-apply whenever the OS scheme flips live.
darkMql()?.addEventListener('change', () => {
  if (useThemeStore.getState().theme === 'system') applyTheme('system');
});
