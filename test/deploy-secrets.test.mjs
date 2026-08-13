// Behavioural tests for the PROD_DB_URL resolver.
//
// Most of this suite matches regexes against source, which is why five
// behaviour-destroying mutations once survived it. These run the script.
// Nothing here touches a real database: every case exits before the first
// connection attempt.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const SCRIPT = '.github/scripts/resolve-prod-db-url.sh';
const read = (path) => readFileSync(join(root, path), 'utf8');

const hasBash = spawnSync('bash', ['-c', 'exit 0'], { encoding: 'utf8' }).status === 0;

const run = (env) =>
  spawnSync('bash', [SCRIPT], {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, GITHUB_ENV: '/dev/null', ...env },
  });

test('an unset secret is distinguishable from a broken one', { skip: !hasBash && 'bash unavailable' }, () => {
  // Exit 2 means "not configured", which the drift check downgrades to a
  // warning and the apply workflow treats as fatal. Collapsing this into 1
  // would make a missing secret fail the daily check for everyone.
  assert.equal(run({ PROD_DB_URL: '' }).status, 2);
});

test('the direct host is repaired, not rejected', { skip: !hasBash && 'bash unavailable' }, () => {
  // The old workflow hard-failed here and told a human to fix the secret. That
  // instruction sat unactioned while a migration went unapplied. Reaching the
  // rewrite path is the whole point of this script.
  const r = run({
    PROD_DB_URL: 'postgresql://postgres:pw@db.ankvjywsnydpkepdvuvm.supabase.co:5432/postgres',
    SUPABASE_ACCESS_TOKEN: '',
  });
  assert.match(r.stdout, /Rewriting the direct host for project ankvjywsnydpkepdvuvm/);
});

test('a password containing @ and : survives parsing', { skip: !hasBash && 'bash unavailable' }, () => {
  // Splitting on the first '@' instead of the last silently truncates the
  // password, and the failure looks identical to a wrong pooler host.
  const r = run({
    PROD_DB_URL: 'postgresql://postgres:p@ss:w0rd@db.ankvjywsnydpkepdvuvm.supabase.co:5432/postgres',
    SUPABASE_ACCESS_TOKEN: '',
  });
  assert.match(r.stdout, /::add-mask::p@ss:w0rd/);
});

test('the parsed password is masked before anything else happens', { skip: !hasBash && 'bash unavailable' }, () => {
  // GitHub masks the secret's exact value, not substrings of it, so the
  // password extracted out of the URL is a fresh unmasked string until this
  // line runs. It must be the first thing emitted after parsing.
  const r = run({
    PROD_DB_URL: 'postgresql://postgres:hunter2@db.ankvjywsnydpkepdvuvm.supabase.co:5432/postgres',
    SUPABASE_ACCESS_TOKEN: '',
  });
  const lines = (r.stdout + r.stderr).split('\n').filter(Boolean);
  const maskIndex = lines.findIndex((l) => l === '::add-mask::hunter2');
  assert.ok(maskIndex >= 0, 'password was never masked');
  const leakedBefore = lines
    .slice(0, maskIndex)
    .some((l) => l.includes('hunter2'));
  assert.equal(leakedBefore, false, 'password appeared in output before it was masked');
});

test('a URL with no password is refused rather than half-parsed', { skip: !hasBash && 'bash unavailable' }, () => {
  const r = run({
    PROD_DB_URL: 'postgresql://postgres@db.ankvjywsnydpkepdvuvm.supabase.co:5432/postgres',
  });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Could not read a password/);
});

test('a candidate pooler host is proved with a connection, never assumed', () => {
  const script = read(SCRIPT);
  // Both aws-0- and aws-1- are in service depending on when a project was
  // created. Picking one and hoping fails exactly like a wrong password, so
  // every candidate goes through probe() before it is published.
  assert.match(script, /probe\(\)\s*\{[\s\S]*?psql "\$1"/);
  assert.match(script, /for host in "\$\{candidates\[@\]\}"/);
  assert.match(script, /if probe "\$candidate"; then\s*\n[\s\S]*?publish "\$candidate"/);
  // Session mode. Transaction mode (6543) cannot run DDL.
  assert.doesNotMatch(script, /:6543/);
});

test('both database workflows resolve the URL instead of reimplementing the guard', () => {
  for (const wf of ['migration-apply.yml', 'migration-deploy-check.yml']) {
    const source = read(`.github/workflows/${wf}`);
    assert.match(source, /bash \.github\/scripts\/resolve-prod-db-url\.sh/, `${wf} does not call the resolver`);
    assert.match(source, /secrets\.PROD_DB_URL/, `${wf} does not pass the secret`);
    assert.match(source, /PROJECT_REF: ankvjywsnydpkepdvuvm/, `${wf} does not pin the TOC project`);
  }
});

test('the drift check fails on a failed query instead of reporting everything missing', () => {
  const source = read('.github/workflows/migration-deploy-check.yml');
  // Without set -e a psql failure left remote_versions empty, so every repo
  // migration looked undeployed. That is how this check stayed red from June
  // to August while reporting nothing true.
  assert.match(source, /set -euo pipefail/);
  assert.match(source, /if: steps\.db\.outputs\.configured == 'true'/);
});

test('retiring an edge function refuses a slug this repo still deploys', () => {
  const source = read('.github/workflows/retire-edge-function.yml');
  // Deleting a repo-managed function only buys an outage until the next push.
  assert.match(source, /if \[ -d "supabase\/functions\/\$SLUG" \]/);
  assert.match(source, /if \[ "\$SLUG" != "\$CONFIRM" \]/);
  assert.match(source, /-X DELETE/);
  // An empty answer from the Management API must never read as success.
  assert.match(source, /Cannot confirm the delete from an empty answer/);
});
