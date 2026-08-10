import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { LeagueSettings } from '../types/database';

/**
 * League configuration, shared by every screen that needs it.
 *
 * Venues and disciplines are admin-editable, so nothing that displays them may
 * hardcode the list — a venue added in Admin has to appear everywhere without a
 * code change. One hook, one cache entry, rather than each page growing its own
 * copy of this query and drifting on which columns it selects.
 */
export function useLeagueSettings() {
  return useQuery<LeagueSettings | null>({
    queryKey: ['league-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('league_settings').select('*').single();
      if (error) throw error;
      return data;
    },
    // Rarely changes, and every screen reads it — don't refetch it per navigation.
    staleTime: 5 * 60_000,
  });
}

export const DEFAULT_VENUES = ['Eagles 4040', 'Valley Hub'];

/**
 * The venue list, falling back only when settings genuinely have not loaded.
 * Returning [] while loading would render "no venues" as if it were a fact.
 */
export function venuesFrom(settings: LeagueSettings | null | undefined): string[] {
  const venues = settings?.venues;
  return Array.isArray(venues) && venues.length > 0 ? venues : DEFAULT_VENUES;
}
