import { create } from 'zustand'

type ThemeMode = 'light' | 'dark'

interface ThemeStore {
  mode: ThemeMode
  toggle: () => void
  setMode: (mode: ThemeMode) => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  mode: 'dark',
  toggle: () =>
    set((state) => {
      const newMode = state.mode === 'dark' ? 'light' : 'dark'
      updateDOMTheme(newMode)
      return { mode: newMode }
    }),
  setMode: (mode) => {
    updateDOMTheme(mode)
    set({ mode })
  }
}))

function updateDOMTheme(mode: ThemeMode): void {
  if (mode === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}
