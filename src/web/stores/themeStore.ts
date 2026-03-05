import { create } from 'zustand';

interface ThemeState {
    theme: 'dark' | 'light';
    toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
    theme: (localStorage.getItem('theme') as 'dark' | 'light') || 'dark',
    toggle: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', next);
        set({ theme: next });
    },
}));
