// Formatting match times for players.
//
// Edge functions run in UTC. A bare toLocaleDateString()/toLocaleString() on the
// server therefore renders UTC, and because pool is an evening sport EVERY match
// at or after 6:00 PM Mountain fell on the *next* UTC day. A 7:00 PM Tuesday
// match was announced as Wednesday, and toLocaleDateString() dropped the time
// entirely -- in the one feature whose whole purpose is agreeing on a time.
//
// The database already got this right:
//   20260807000000_match_reminders.sql:78,97
//     to_char(rec.scheduled_at AT TIME ZONE 'America/Denver', 'Dy Mon DD, HH:MI AM')
// so the 24h reminder said "Tue Aug 11, 07:00 PM" while the lock-in notification
// for the same match said "8/12/2026". These helpers make the TypeScript side
// agree with both the SQL and the client.
//
// Output matches src/utils/time.ts formatDateTime, which is what the player sees
// in-app, so a notification and the card it refers to now read identically.

// Helena, MT. Hardcoded deliberately: this mirrors the timezone already baked
// into the reminder migration, and having two sources of truth would be worse
// than having one hardcoded one. If the league ever moves or a second league
// shares this codebase, promote it to a league_settings column and thread it
// through both here and the SQL together -- not one without the other.
export const LEAGUE_TIME_ZONE = 'America/Denver';

/** "Thu, Aug 13, 7:30 PM" -- date AND time, in league-local time. */
export function formatLeagueDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'an unknown time';
  return date.toLocaleString('en-US', {
    timeZone: LEAGUE_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "Thu, Aug 13" -- league-local date only, for when a time would be noise. */
export function formatLeagueDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'an unknown date';
  return date.toLocaleString('en-US', {
    timeZone: LEAGUE_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
