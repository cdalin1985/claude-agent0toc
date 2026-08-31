// Make the silent half of match reminders visible to an admin.
//
// check_match_reminders() always writes the in-app notification and only
// ATTEMPTS the push; send_reminder_push() returns 0 unless pg_net is installed
// and both app settings are present. The cron job reports success either way,
// so a project with none of them has a green cron history and has never
// delivered a single push.
//
// It becomes actively misleading once VAPID keys are set: the Settings toggle
// appears, members turn push on, they get challenge notifications (edge
// functions use fetch and need none of this) and no match reminders, with
// nothing anywhere explaining the difference.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

const migrationName = readdirSync(join(root, 'supabase/migrations'))
  .find((f) => f.endsWith('_expose_push_delivery_status.sql'));
const migration = read(`supabase/migrations/${migrationName}`);
const admin = read('src/pages/AdminPage.tsx');

const sql = migration.replace(/^\s*--.*$/gm, '');

test('the migration exists and is named for what it does', () => {
  assert.ok(migrationName, 'no _expose_push_delivery_status.sql migration found');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.push_delivery_status\(\)/);
});

test('it reports the three prerequisites the push path actually needs', () => {
  // Exactly what send_reminder_push() checks before it will POST.
  assert.match(sql, /extname = 'pg_net'/);
  assert.match(sql, /current_setting\('app\.supabase_url', true\)/);
  assert.match(sql, /current_setting\('app\.supabase_service_role_key', true\)/);
  assert.match(sql, /'reminders_can_push',\s*\(v_pg_net AND v_url AND v_key\)/);
});

test('the service role key is never returned, only its presence', () => {
  // The whole point of the function is to report configuration without
  // becoming a way to read a service-role credential out of the database.
  const returned = sql.slice(sql.indexOf('jsonb_build_object'));
  assert.doesNotMatch(returned, /current_setting/);
  assert.doesNotMatch(returned, /service_role_key'\s*\)/);

  // Presence is derived into a boolean before it reaches the payload.
  assert.match(sql, /v_key := NULLIF\(current_setting\('app\.supabase_service_role_key', true\), ''\) IS NOT NULL;/);
  assert.match(sql, /'service_key_set',\s*v_key/);
});

test('it needs no elevated privileges', () => {
  // 04_definer_privileges_assert.sql flags every SECURITY DEFINER function a
  // member can execute, and it flagged this one on the first attempt. That
  // guard is right: an in-body role check should never be the only thing
  // between a member and elevated code. Nothing here needs elevation --
  // pg_extension is world-readable, current_setting() works for any role, and
  // the admin check reads only the caller's own profiles row, which the
  // "Users can view own profile" policy already permits.
  assert.doesNotMatch(sql, /SECURITY DEFINER/);
});

test('it is admin-only and fails closed', () => {
  assert.match(sql, /role = ANY \(ARRAY\['admin'::text, 'super_admin'::text\]\)/);
  // COALESCE(..., false): an unreadable profile is not an admin.
  assert.match(sql, /IF NOT COALESCE\(v_is_admin, false\) THEN/);
  assert.match(sql, /insufficient_privilege/);
});

test('anon cannot reach it at all', () => {
  // SECURITY DEFINER, and Postgres grants EXECUTE to PUBLIC on new functions by
  // default. The in-body admin check is the real gate; these keep a logged-out
  // caller from even invoking it.
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.push_delivery_status\(\) FROM PUBLIC;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.push_delivery_status\(\) FROM anon;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.push_delivery_status\(\) TO authenticated;/);
});

test('the admin Settings tab surfaces it', () => {
  assert.match(admin, /rpc\('push_delivery_status'\)/);
  assert.match(admin, /<PushDeliveryStatus \/>/);
});

test('the unconfigured state says what still works', () => {
  // "Push is off" would read as "notifications are broken". In-app reminders
  // and every edge-function notification are unaffected, and an admin deciding
  // whether this is urgent needs to know that.
  assert.match(admin, /Members still see match reminders when they open the app/);
  assert.match(admin, /Challenge and result notifications are unaffected/);
});

test('the panel does not reintroduce a banned text colour', () => {
  // #6B7280 fails 4.5:1 on both surfaces; text-contrast.test.mjs enforces it
  // globally and caught this exact mistake when the panel was written.
  const panel = admin.slice(admin.indexOf('function PushDeliveryStatus'), admin.indexOf('function SettingsTab'));
  assert.doesNotMatch(panel, /text-\[#6B7280\]/);
});
