// Unlike the rest of this suite, these tests IMPORT AND RUN the shipped module
// rather than regex-matching its source text. Node strips the TypeScript types
// on import, so this is the real `_shared/leagueTime.ts` the edge functions use.
//
// That matters here specifically: the bug being locked down was invisible to
// source-text assertions. `toLocaleDateString()` is a perfectly ordinary-looking
// call. Nothing about how it READS is wrong -- only what it RETURNS, and only
// when the process timezone is UTC, which is the one place it never ran during
// development and the only place it ever runs in production.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatLeagueDateTime,
  formatLeagueDate,
  LEAGUE_TIME_ZONE,
} from '../supabase/functions/_shared/leagueTime.ts';

// 7:30 PM Thursday 13 Aug 2026, Helena (MDT, UTC-6) -> 01:30Z the NEXT day.
const EVENING_MATCH_MDT = '2026-08-14T01:30:00Z';
// 8:00 PM Sunday 4 Jan 2026, Helena (MST, UTC-7) -> 03:00Z the NEXT day.
const EVENING_MATCH_MST = '2026-01-05T03:00:00Z';

test('an evening match keeps its real league date instead of rolling to the next UTC day', () => {
  assert.equal(formatLeagueDateTime(EVENING_MATCH_MDT), 'Thu, Aug 13, 7:30 PM');
});

test('the format survives the DST boundary in both directions', () => {
  // Same wall-clock evening, six months apart. An offset hardcoded as -6 or -7
  // would get exactly one of these wrong; the IANA zone gets both right.
  assert.equal(formatLeagueDateTime(EVENING_MATCH_MDT), 'Thu, Aug 13, 7:30 PM');
  assert.equal(formatLeagueDateTime(EVENING_MATCH_MST), 'Sun, Jan 4, 8:00 PM');
});

test('the time is present, not just the date', () => {
  // The original defect was two bugs in one call: the wrong day AND no time at
  // all, in the feature whose entire purpose is agreeing on a time. A revert to
  // any date-only formatter fails here.
  assert.match(formatLeagueDateTime(EVENING_MATCH_MDT), /\d:\d{2}\s?(AM|PM)/);
});

test('output does not depend on the server timezone', () => {
  // Proves the helper pins the zone rather than inheriting the process default.
  // If someone drops the `timeZone` option, this is what catches it: on a UTC
  // runner the evening match would render as Aug 14, not Aug 13.
  const utcCalendarDay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric',
  }).format(new Date(EVENING_MATCH_MDT));
  const leagueCalendarDay = new Intl.DateTimeFormat('en-US', {
    timeZone: LEAGUE_TIME_ZONE, month: 'short', day: 'numeric',
  }).format(new Date(EVENING_MATCH_MDT));

  assert.notEqual(utcCalendarDay, leagueCalendarDay, 'fixture must straddle the UTC day boundary to be meaningful');
  assert.ok(formatLeagueDateTime(EVENING_MATCH_MDT).includes(leagueCalendarDay));
  assert.ok(!formatLeagueDateTime(EVENING_MATCH_MDT).includes(utcCalendarDay));
});

test('a Date and its ISO string format identically', () => {
  assert.equal(
    formatLeagueDateTime(new Date(EVENING_MATCH_MDT)),
    formatLeagueDateTime(EVENING_MATCH_MDT),
  );
});

test('an unparseable value degrades to words instead of "Invalid Date"', () => {
  // These strings go straight into a push notification, so the failure mode has
  // to be a readable sentence rather than "Invalid Date" on someone's phone.
  assert.equal(formatLeagueDateTime('not-a-date'), 'an unknown time');
  assert.equal(formatLeagueDate('not-a-date'), 'an unknown date');
});

test('formatLeagueDate gives the league day with no time', () => {
  assert.equal(formatLeagueDate(EVENING_MATCH_MDT), 'Thu, Aug 13');
  assert.doesNotMatch(formatLeagueDate(EVENING_MATCH_MDT), /\d:\d{2}/);
});

test('the league timezone matches the one the reminder migration already uses', () => {
  // supabase/migrations/20260807000000_match_reminders.sql formats reminders with
  // `AT TIME ZONE 'America/Denver'`. If these two ever disagree, the 24h reminder
  // and the lock-in notification will describe the same match differently -- which
  // is exactly the bug this module was written to end.
  assert.equal(LEAGUE_TIME_ZONE, 'America/Denver');
});
