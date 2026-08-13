import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { Profile, Player } from '../types/database';

// Whether we actually know who this signed-in person is.
//
// `player === null` is not enough on its own, because it means two opposite
// things: "this member has not claimed a profile yet" and "we asked and did not
// get an answer". Collapsing them is what sent fully-claimed members to the
// Claim screen on any dropped request — a screen their own name is not on, with
// no way forward. Every consumer that routes on identity must read this too.
export type IdentityStatus =
  | 'unknown'   // not asked yet
  | 'resolved'  // asked and answered; `player` is now trustworthy either way
  | 'failed';   // asked and got an error; `player` means nothing, do not act on it

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  player: Player | null;
  identityStatus: IdentityStatus;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setPlayer: (player: Player | null) => void;
  setIdentityStatus: (status: IdentityStatus) => void;
  setIsLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  player: null,
  identityStatus: 'unknown',
  isLoading: true,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setPlayer: (player) => set({ player }),
  setIdentityStatus: (identityStatus) => set({ identityStatus }),
  setIsLoading: (isLoading) => set({ isLoading }),
  reset: () => set({ session: null, profile: null, player: null, identityStatus: 'unknown', isLoading: false }),
}));
