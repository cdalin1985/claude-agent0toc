export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          role: 'player' | 'admin' | 'super_admin';
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      players: {
        Row: {
          id: string;
          profile_id: string | null;
          full_name: string;
          bio: string | null;
          preferred_discipline: '8 Ball' | '9 Ball' | '10 Ball' | null;
          avatar_url: string | null;
          // Public to logged-in members, and the only columns beyond bio,
          // preferred_discipline and avatar_url that a player may edit on their
          // own row — players carries a column-level UPDATE allowlist for
          // `authenticated`, so anything not granted stays closed.
          banner_url: string | null;
          nickname: string | null;
          tagline: string | null;
          // Restricted to the TOC preset palette by a CHECK constraint added in
          // 20260807010000_profile_banner_accent.sql.
          accent_color: string | null;
          home_venue: string | null;
          years_playing: number | null;
          cue_brand: string | null;
          is_active: boolean;
          // Maintained by track_player_inactivation_trigger: stamped when
          // is_active goes true -> false, cleared on the way back. Drives the
          // 30-day demotion and the 30/60/90-day review in Admin. Declared here
          // because production has carried both columns since before the repo
          // knew about them (see 20260813200000) and the review panel reads one.
          activated_at: string | null;
          inactivated_at: string | null;
          // Spots already taken during the CURRENT spell of inactivity, so the
          // daily demotion settles a debt rather than re-applying it. Reset to 0
          // on reactivation. Added 20260822130000.
          inactive_drops_applied: number;
          // Earned by defending your spot; spent by issuing a challenge (which
          // is then locked_in and shields you from below), or lapsed when
          // somebody behind you challenges first. Added 20260822160000.
          lock_in_right: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['players']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['players']['Insert']>;
      };
      rankings: {
        Row: {
          id: string;
          player_id: string;
          position: number;
          previous_position: number | null;
          rank1_since: string | null;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['rankings']['Row'], 'id' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['rankings']['Insert']>;
      };
      player_reference_metrics: {
        Row: {
          id: string;
          player_id: string;
          fargo_rating: number | null;
          fargo_robustness: number | null;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['player_reference_metrics']['Row'], 'id' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['player_reference_metrics']['Insert']>;
      };
      challenges: {
        Row: {
          id: string;
          challenger_id: string;
          challenged_id: string;
          discipline: '8 Ball' | '9 Ball' | '10 Ball';
          race_length: number;
          status: 'pending' | 'accepted' | 'scheduled' | 'in_progress' | 'submitted' | 'confirmed' | 'disputed' | 'resolved' | 'declined' | 'expired' | 'forfeited' | 'cancelled';
          venue: 'Eagles 4040' | 'Valley Hub' | null;
          scheduled_at: string | null;
          match_deadline: string | null;
          // Set when status is 'cancelled'. Only 'wash' and 'overdue' are
          // refunded against the weekly challenge limit — see
          // countsAgainstWeeklyLimit in the create-challenge function.
          cancel_reason: 'wash' | 'withdrawn' | 'overdue' | 'no_show' | null;
          // Issued by a player spending the right they earned by defending.
          // While it is live its challenger cannot be challenged from behind.
          // Added 20260822160000.
          locked_in: boolean;
          expires_at: string;
          response_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['challenges']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['challenges']['Insert']>;
      };
      matches: {
        Row: {
          id: string;
          challenge_id: string;
          player1_id: string;
          player2_id: string;
          discipline: string;
          race_length: number;
          venue: string;
          player1_score: number;
          player2_score: number;
          winner_id: string | null;
          loser_id: string | null;
          status: 'scheduled' | 'in_progress' | 'submitted' | 'confirming' | 'confirmed' | 'disputed' | 'resolved';
          player1_submitted: boolean;
          player2_submitted: boolean;
          player1_submitted_winner_id: string | null;
          player2_submitted_winner_id: string | null;
          player1_submitted_player1_score: number | null;
          player1_submitted_player2_score: number | null;
          player2_submitted_player1_score: number | null;
          player2_submitted_player2_score: number | null;
          player1_submitted_at: string | null;
          player2_submitted_at: string | null;
          player1_confirmed: boolean;
          player2_confirmed: boolean;
          player1_payment_method: 'cash_envelope' | 'paypal' | 'cash_app' | 'venmo' | null;
          player2_payment_method: 'cash_envelope' | 'paypal' | 'cash_app' | 'venmo' | null;
          scheduled_at: string;
          started_at: string | null;
          completed_at: string | null;
          initiated_by_player_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['matches']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['matches']['Insert']>;
      };
      notifications: {
        Row: {
          id: string;
          player_id: string;
          type: string;
          title: string;
          body: string;
          reference_id: string | null;
          reference_type: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['notifications']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
      };
      activity_feed: {
        Row: {
          id: string;
          event_type: string;
          headline: string;
          detail: string | null;
          actor_player_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['activity_feed']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['activity_feed']['Insert']>;
      };
      cooldowns: {
        Row: {
          id: string;
          player_id: string;
          // post_wash and post_return added 20260822140000. Every type except
          // post_decline (legacy, never written) blocks challenging up until it
          // expires; none of them blocks defending or challenging down.
          type: 'post_match' | 'post_decline' | 'post_wash' | 'post_return';
          expires_at: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['cooldowns']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['cooldowns']['Insert']>;
      };
      player_season_stats: {
        Row: {
          id: string;
          player_id: string;
          wins: number;
          losses: number;
          current_streak: number;
          best_streak: number;
          matches_played: number;
          challenges_issued: number;
          challenges_received: number;
          defender_wins: number;
          challenger_wins: number;
          forfeit_wins: number;
          forfeits: number;
          best_rank_achieved: number | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          wins?: number;
          losses?: number;
          current_streak?: number;
          best_streak?: number;
          matches_played?: number;
          challenges_issued?: number;
          challenges_received?: number;
          defender_wins?: number;
          challenger_wins?: number;
          forfeit_wins?: number;
          forfeits?: number;
          best_rank_achieved?: number | null;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['player_season_stats']['Insert']>;
      };
      player_discipline_stats: {
        Row: {
          id: string;
          player_id: string;
          discipline: '8 Ball' | '9 Ball' | '10 Ball';
          matches_played: number;
          wins: number;
          losses: number;
          current_streak: number;
          best_streak: number;
          challenger_wins: number;
          defender_wins: number;
          challenges_issued: number;
          challenges_received: number;
          forfeit_wins: number;
          forfeits: number;
          total_race_length: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          discipline: '8 Ball' | '9 Ball' | '10 Ball';
          matches_played?: number;
          wins?: number;
          losses?: number;
          current_streak?: number;
          best_streak?: number;
          challenger_wins?: number;
          defender_wins?: number;
          challenges_issued?: number;
          challenges_received?: number;
          forfeit_wins?: number;
          forfeits?: number;
          total_race_length?: number;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['player_discipline_stats']['Insert']>;
      };
      treasury_ledger: {
        Row: {
          id: string;
          entry_type: 'credit' | 'debit' | 'correction' | 'reversal';
          amount_cents: number;
          description: string;
          created_by: string;
          reversed_entry_id: string | null;
          source_type: string | null;
          source_id: string | null;
          player_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          entry_type: 'credit' | 'debit' | 'correction' | 'reversal';
          amount_cents: number;
          description: string;
          created_by: string;
          reversed_entry_id?: string | null;
          source_type?: string | null;
          source_id?: string | null;
          player_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['treasury_ledger']['Insert']>;
      };
      challenge_forfeiture_events: {
        Row: {
          id: string;
          challenge_id: string;
          challenger_id: string;
          forfeiting_player_id: string;
          winner_id: string;
          loser_id: string;
          previous_challenge_status: string;
          challenger_previous_position: number | null;
          forfeiting_previous_position: number | null;
          challenger_new_position: number | null;
          forfeiting_new_position: number | null;
          cooldown_id: string | null;
          activity_event_id: string | null;
          notification_ids: string[];
          reversed_at: string | null;
          reversed_by_profile_id: string | null;
          created_at: string;
          metadata: Json;
        };
        Insert: {
          id?: string;
          challenge_id: string;
          challenger_id: string;
          forfeiting_player_id: string;
          winner_id: string;
          loser_id: string;
          previous_challenge_status: string;
          challenger_previous_position?: number | null;
          forfeiting_previous_position?: number | null;
          challenger_new_position?: number | null;
          forfeiting_new_position?: number | null;
          cooldown_id?: string | null;
          activity_event_id?: string | null;
          notification_ids?: string[];
          reversed_at?: string | null;
          reversed_by_profile_id?: string | null;
          created_at?: string;
          metadata?: Json;
        };
        Update: Partial<Database['public']['Tables']['challenge_forfeiture_events']['Insert']>;
      };
      player_venue_stats: {
        Row: {
          id: string;
          player_id: string;
          // Unconstrained on purpose: venues live in league_settings.venues and
          // an admin may change them without a migration.
          venue: string;
          matches_played: number;
          wins: number;
          losses: number;
          current_streak: number;
          best_streak: number;
          challenger_wins: number;
          defender_wins: number;
          total_race_length: number;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['player_venue_stats']['Row'], 'id' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['player_venue_stats']['Insert']>;
      };
      player_preferences: {
        Row: {
          player_id: string;
          notify_challenges: boolean;
          notify_reminders: boolean;
          notify_results: boolean;
          notify_activity: boolean;
          push_enabled: boolean;
          show_stats_publicly: boolean;
          show_profile_details: boolean;
          updated_at: string;
        };
        // Rows are created by a trigger, one per player, so the client never
        // inserts — it only ever updates its own.
        Insert: never;
        Update: Partial<Omit<Database['public']['Tables']['player_preferences']['Row'], 'player_id'>>;
      };
      challenge_proposals: {
        Row: {
          id: string;
          challenge_id: string;
          proposed_by_player_id: string;
          venue: string;
          scheduled_at: string;
          message: string | null;
          // At most one 'pending' row per challenge; its author is the player
          // waiting, and the other player owes an accept or a counter.
          status: 'pending' | 'accepted' | 'superseded';
          created_at: string;
          responded_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['challenge_proposals']['Row'], 'id' | 'created_at' | 'status' | 'responded_at'> & {
          status?: 'pending' | 'accepted' | 'superseded';
          responded_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['challenge_proposals']['Insert']>;
      };
      league_settings: {
        Row: {
          id: string;
          venues: string[];
          disciplines: string[];
          min_race: number;
          max_race: number | null;
          challenge_range: number;
          cooldown_hours: number;
          challenge_expiry_days: number;
          challenge_response_hours: number;
          match_play_days: number;
          challenge_weekly_limit: number;
          first_challenge_range: number;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['league_settings']['Row'], 'id' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['league_settings']['Insert']>;
      };
      audit_events: {
        Row: {
          id: string;
          actor_profile_id: string | null;
          action: string;
          target_type: string | null;
          target_id: string | null;
          detail: Json | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['audit_events']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['audit_events']['Insert']>;
      };
    };
    Views: {
      // players with the profile-detail columns nulled for members who turned
      // "Profile Details" off, and never for the owner. Identical shape to the
      // table — every redactable column is already nullable — so read paths can
      // switch to it without changing a single type.
      players_public: {
        Row: Database['public']['Tables']['players']['Row'];
      };
      treasury_ledger_effects: {
        Row: Database['public']['Tables']['treasury_ledger']['Row'] & {
          effect_cents: number;
        };
      };
      treasury_summary: {
        Row: {
          total_credit_cents: number;
          total_debit_cents: number;
          balance_cents: number;
          entry_count: number;
          last_entry_at: string | null;
        };
      };
    };
    Functions: {
      apply_challenge_decline_forfeit: {
        Args: {
          p_challenge_id: string;
          p_actor_profile_id?: string | null;
        };
        Returns: string;
      };
      reverse_challenge_decline_forfeit: {
        Args: {
          p_challenge_id: string;
          p_actor_profile_id: string;
        };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
  };
}

// Convenience type aliases
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Player = Database['public']['Tables']['players']['Row'];
export type Ranking = Database['public']['Tables']['rankings']['Row'];
export type PlayerMetrics = Database['public']['Tables']['player_reference_metrics']['Row'];
export type Challenge = Database['public']['Tables']['challenges']['Row'];
export type Match = Database['public']['Tables']['matches']['Row'];
export type Notification = Database['public']['Tables']['notifications']['Row'];
export type ActivityFeedItem = Database['public']['Tables']['activity_feed']['Row'];
export type Cooldown = Database['public']['Tables']['cooldowns']['Row'];
export type PlayerSeasonStats = Database['public']['Tables']['player_season_stats']['Row'];
export type PlayerDisciplineStats = Database['public']['Tables']['player_discipline_stats']['Row'];
export type TreasuryEntry = Database['public']['Tables']['treasury_ledger']['Row'];
export type ChallengeForfeitureEvent = Database['public']['Tables']['challenge_forfeiture_events']['Row'];
export type ChallengeProposal = Database['public']['Tables']['challenge_proposals']['Row'];
export type PlayerVenueStats = Database['public']['Tables']['player_venue_stats']['Row'];
export type PlayerPreferences = Database['public']['Tables']['player_preferences']['Row'];
export type TreasuryLedgerEffect = Database['public']['Views']['treasury_ledger_effects']['Row'];
export type TreasurySummary = Database['public']['Views']['treasury_summary']['Row'];
export type LeagueSettings = Database['public']['Tables']['league_settings']['Row'];
export type AuditEvent = Database['public']['Tables']['audit_events']['Row'];

// Composite types used across the app
export interface RankedPlayer {
  player: Player;
  ranking: Ranking;
  metrics: PlayerMetrics | null;
  stats: PlayerSeasonStats | null;
}
