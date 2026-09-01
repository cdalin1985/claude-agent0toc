// A courtesy push must never delete the reminder it was announcing.
//
// send_reminder_push() is called from check_match_reminders() AFTER the in-app
// notification and the match_reminders_log row are inserted, in the same
// transaction. Any exception in the push aborts the whole function and rolls
// both back -- so a scheduled match would have produced no reminder at all,
// not even the in-app one members actually rely on.
//
// That was not hypothetical. The call used the wrong net.http_post signature
// (body as ::text; this pg_net takes jsonb), so it raised 42883 every time.
// It sat unreachable while pg_net was uninstalled, because the p_pg_net guard
// returned first. Installing the extension to turn push ON is what armed it.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const dir = 'supabase/migrations';
const file = readdirSync(join(root, dir))
  .filter((f) => f.endsWith('_send_push_cannot_break_the_reminder.sql'))
  .sort()
  .pop();
assert.ok(file, 'migration not found');
const sql = readFileSync(join(root, dir, file), 'utf8');
const code = sql.replace(/^\s*--.*$/gm, '');

test('the body is jsonb, which is what this pg_net accepts', () => {
  // net.http_post(url text, body jsonb, params jsonb, headers jsonb,
  //               timeout_milliseconds integer)
  assert.match(code, /body\s*:=\s*jsonb_build_object\('notification_id', p_notification_id\)/);
  // The ::text cast is what made the call resolve to no function at all.
  assert.doesNotMatch(code, /jsonb_build_object\('notification_id', p_notification_id\)::text/);
});

test('the HTTP call cannot roll back the reminder', () => {
  // The push is wrapped in its own block with a catch-all. Without it, a
  // pg_net timeout, an edge-function 500, or the extension being dropped each
  // destroy the in-app notification that was already written.
  const httpStart = code.indexOf('net.http_post');
  const tail = code.slice(httpStart);
  assert.match(tail, /EXCEPTION WHEN OTHERS THEN/);
  assert.match(tail, /RETURN 0;/);
});

test('a failed push is reported without leaking the bearer token', () => {
  // v_key is in scope at the point this fires. Logging anything but SQLERRM
  // risks writing the service role key into the Postgres log.
  const handler = code.slice(code.indexOf('EXCEPTION WHEN OTHERS THEN', code.indexOf('net.http_post')));
  assert.match(handler, /RAISE WARNING/);
  assert.doesNotMatch(handler, /v_key/);
  assert.doesNotMatch(handler, /Authorization/);
});

test('it still refuses to send when unconfigured', () => {
  // Degrading to "no push" is correct; raising is not.
  assert.match(code, /IF NOT p_pg_net THEN\s*RETURN 0;/);
  assert.match(code, /IF v_url IS NULL OR v_key IS NULL THEN\s*RETURN 0;/);
});

test('it stays out of reach of members', () => {
  assert.match(code, /SECURITY DEFINER/);
  assert.match(code, /REVOKE EXECUTE ON FUNCTION public\.send_reminder_push\(boolean, text, text, uuid\) FROM authenticated;/);
});
