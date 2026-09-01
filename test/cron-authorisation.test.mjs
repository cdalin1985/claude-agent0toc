// The cron push authorises by role claim, not by matching a key string.
//
// send-match-reminder compared the bearer against
// Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') and nothing else. That broke when
// this project was migrated to the new API key format: the caller holds the
// legacy service_role JWT -- verified current, same issue batch as the live
// anon key, valid to 2035 -- while the platform injects a different value into
// that variable. Same project, same permissions, two different strings, so ===
// was false and every cron push got 401 with nothing actually wrong.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const fn = readFileSync(join(root, 'supabase/functions/send-match-reminder/index.ts'), 'utf8');

test('a service_role JWT is accepted regardless of key format', () => {
  assert.match(fn, /function isServiceRoleJwt\(token: string\): boolean/);
  assert.match(fn, /json\?\.role === 'service_role' && json\?\.iss === 'supabase'/);
  assert.match(fn, /authHeader === serviceKey \|\| isServiceRoleJwt\(authHeader\)/);
});

test('the exact match is still tried first', () => {
  // A deployment where the injected variable does line up must keep working
  // without relying on the claim path at all.
  const idx = fn.indexOf('authHeader === serviceKey');
  const claim = fn.indexOf('isServiceRoleJwt(authHeader)');
  assert.ok(idx !== -1 && claim !== -1 && idx < claim);
});

test('it does not try to verify the signature itself', () => {
  // Supabase's gateway already did, and a hand-rolled verification here would
  // be worse than none. The helper decodes only.
  const helper = fn.slice(fn.indexOf('function isServiceRoleJwt'), fn.indexOf('serve(async'));
  assert.doesNotMatch(helper, /createHmac|crypto\.subtle|verify\(/);
  // The reasoning lives in the JSDoc above the helper, so assert on the file.
  assert.match(fn, /Signature is NOT checked here/);
});

test('a malformed token is rejected rather than throwing', () => {
  // atob and JSON.parse both throw on rubbish; an exception escaping here
  // would 500 instead of 401.
  const helper = fn.slice(fn.indexOf('function isServiceRoleJwt'), fn.indexOf('serve(async'));
  assert.match(helper, /try \{/);
  assert.match(helper, /catch \{\s*return false;/);
});

test('verify_jwt is never disabled for this function', () => {
  // The claim check is only sound because the gateway verified the signature
  // first. Turning verify_jwt off makes the role claim caller-controlled and
  // this endpoint forgeable.
  const cfg = join(root, 'supabase/config.toml');
  if (!existsSync(cfg)) return; // no config = platform default, which is true
  const toml = readFileSync(cfg, 'utf8');
  const block = toml.match(/\[functions\.send-match-reminder\][\s\S]*?(?=\n\[|$)/);
  if (!block) return;
  assert.doesNotMatch(
    block[0],
    /verify_jwt\s*=\s*false/,
    'send-match-reminder relies on gateway JWT verification; verify_jwt must stay true',
  );
});
