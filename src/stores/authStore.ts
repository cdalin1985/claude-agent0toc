import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { Profile, Player } from '../types/database';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  player: Player | null;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setPlayer: (player: Player | null) => void;
  setIsLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  player: null,
  isLoading: true,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setPlayer: (player) => set({ player }),
  setIsLoading: (isLoading) => set({ isLoading }),
  reset: () => set({ session: null, profile: null, player: null, isLoading: false }),
}));
