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
  .filter((f) => f.endsWith('_expose_push_delivery_status.sql')
    || f.endsWith('_push_status_readable_by_members.sql')
    || f.endsWith('_read_push_config_from_vault.sql'))
  .sort()
  .pop();
const migration = read(`supabase/migrations/${migrationName}`);
const admin = read('src/pages/AdminPage.tsx');
const settings = read('src/pages/SettingsPage.tsx');
const definerAssert = read('supabase/tests/migrations/04_definer_privileges_assert.sql');

const sql = migration.replace(/^\s*--.*$/gm, '');

test('the migration exists and is named for what it does', () => {
  assert.ok(migrationName, 'no _expose_push_delivery_status.sql migration found');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.push_delivery_status\(\)/);
});

test('it reports the three prerequisites the push path actually needs', () => {
  // Exactly what send_reminder_push() checks before it will POST.
  assert.match(sql, /extname = 'pg_net'/);
  assert.match(sql, /vault\.secrets WHERE name = 'project_url'/);
  assert.match(sql, /vault\.secrets WHERE name = 'service_role_key'/);
  assert.match(sql, /v_ready := \(v_pg_net AND v_url AND v_key\);/);
  assert.match(sql, /'reminders_can_push', v_ready/);
});

test('the service role key is never returned, only its presence', () => {
  // The whole point of the function is to report configuration without
  // becoming a way to read a service-role credential out of the database.
  const returned = sql.slice(sql.indexOf('jsonb_build_object'));
  assert.doesNotMatch(returned, /decrypted_secret/);

  // Presence is derived into a boolean before it reaches the payload.
  assert.match(sql, /'service_key_set',\s*v_key/);
});

test('elevation is required, minimal, and allowlisted', () => {
  // This function was security invoker until the config moved into Vault.
  // authenticated has no USAGE on the vault schema at all -- correct, and it
  // must stay that way -- so presence cannot be established as the caller.
  // 04_definer_privileges_assert.sql flags every SECURITY DEFINER function a
  // member can execute; this one is allowlisted there with that reasoning
  // rather than quietly exempted.
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(definerAssert, /'push_delivery_status'/);

  // What it may do with that elevation: check a secret NAME exists. It must
  // never decrypt one.
  assert.match(sql, /FROM vault\.secrets WHERE name = 'project_url'/);
  assert.match(sql, /FROM vault\.secrets WHERE name = 'service_role_key'/);
  // Scoped to this function's body: send_reminder_push in the same migration
  // legitimately decrypts, because it has to send the key as a bearer token.
  // The status readout must never do that.
  const statusBody = sql.slice(sql.indexOf('FUNCTION public.push_delivery_status()'));
  assert.doesNotMatch(statusBody, /decrypted_secret/);
});

test('a member gets the capability flag, an admin gets the breakdown', () => {
  // Members need to know what a reminder will DO; they do not need to know the
  // shape of the project's configuration. Making this admin-only left the
  // member-facing half of the problem open: once VAPID is set the toggle
  // appears for everyone, and a member who switches it on and gets no match
  // reminders has nothing telling them why.
  assert.match(sql, /role = ANY \(ARRAY\['admin'::text, 'super_admin'::text\]\)/);
  assert.match(sql, /IF NOT COALESCE\(v_is_admin, false\) THEN/);
  assert.match(sql, /RETURN jsonb_build_object\('reminders_can_push', v_ready\);/);

  // A non-admin must not learn which prerequisite is missing. The member branch
  // is everything between the admin test and the full payload below it.
  const start = sql.indexOf('IF NOT COALESCE(v_is_admin, false) THEN');
  const memberBranch = sql.slice(start, sql.indexOf('END IF;', start));
  assert.doesNotMatch(memberBranch, /service_key_set/);
  assert.doesNotMatch(memberBranch, /pg_net_installed/);
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

// --- what a member is told ---------------------------------------------------

test('the toggle stops promising reminders it cannot deliver', () => {
  // It used to read "Challenges, results & more" whenever push was on. The
  // "& more" was match reminders, which do not push unless pg_net and both app
  // settings are configured.
  assert.doesNotMatch(settings, /Challenges, results & more/);
  assert.match(settings, /remindersCanPush \? 'Challenges, results & match reminders' : 'Challenges and results'/);
});

test('a member is told when reminders will not reach their phone', () => {
  assert.match(settings, /Match reminders show in the app but won&rsquo;t buzz your phone yet\./);
  assert.match(settings, /pushSubscribed && !remindersCanPush/);
});

test('a failed status read does not invent a warning', () => {
  // Absent or still loading must read as fine. Defaulting the other way would
  // put a scary note under a feature that is probably working.
  assert.match(settings, /pushStatus\?\.reminders_can_push !== false/);
});
