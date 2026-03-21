import { create } from 'zustand';

interface UIState {
  soundEnabled: boolean;
  isOffline: boolean;
  setSoundEnabled: (v: boolean) => void;
  setIsOffline: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  soundEnabled: true,
  isOffline: false,
  setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
  setIsOffline: (isOffline) => set({ isOffline }),
}));
