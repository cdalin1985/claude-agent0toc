// Behavioural tests for the bidirectional migration drift check.
//
// These RUN the script against fixtures rather than grepping it. That matters
// more here than almost anywhere else in this repo: the previous drift check
// was inline in a workflow, untestable, and spent two months reporting "no
// drift" while it could not reach the database at all. The failure mode of a
// check is that it passes for the wrong reason, and only execution catches it.
//
// The reverse direction -- production having migrations the repo does not --
// went unimplemented until 2026-08-13, by which point production had 28 such
// versions and the database could not be rebuilt from this repo.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const SCRIPT = '.github/scripts/compare-migrations.sh';
const ALLOWLIST = '.github/known-production-only-migrations.txt';

const hasBash = spawnSync('bash', ['-c', 'exit 0'], { encoding: 'utf8' }).status === 0;

// A cutoff far in the future would make every repo migration "too recent to
// flag"; one far in the past makes the forward check evaluate all of them.
// Pinned so these tests never depend on the wall clock.
const CUTOFF = '29999999999999';

function sandbox({ files = [], remote = [], allowlist = [] }) {
  const dir = mkdtempSync(join(tmpdir(), 'drift-'));
  const migrations = join(dir, 'migrations');
  mkdirSync(migrations);
  for (const v of files) writeFileSync(join(migrations, `${v}_thing.sql`), '-- x\n');
  writeFileSync(join(dir, 'remote.txt'), remote.join('\n') + '\n');
  writeFileSync(join(dir, 'allow.txt'), allowlist.join('\n') + '\n');
  return { dir, migrations };
}

function run({ files = [], remote = [], allowlist = [], cutoff = CUTOFF }) {
  const { dir, migrations } = sandbox({ files, remote, allowlist });
  try {
    const r = spawnSync(
      'bash',
      [SCRIPT, migrations, join(dir, 'remote.txt'), join(dir, 'allow.txt'), cutoff],
      { cwd: root, encoding: 'utf8' },
    );
    return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('passes when the repo and production agree exactly', { skip: !hasBash }, () => {
  const r = run({ files: ['20260101000000', '20260102000000'], remote: ['20260101000000', '20260102000000'] });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /No deploy drift/);
  assert.match(r.out, /No reverse drift/);
});

test('fails when a merged migration was never applied to production', { skip: !hasBash }, () => {
  const r = run({ files: ['20260101000000', '20260102000000'], remote: ['20260101000000'] });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /merged to main but NOT applied to production.*20260102000000/s);
});

test('does not flag a migration merged inside the cutoff window', { skip: !hasBash }, () => {
  const r = run({
    files: ['20260101000000', '20260102000000'],
    remote: ['20260101000000'],
    cutoff: '20260101120000', // 20260102000000 is newer, so it is still deploying
  });
  assert.equal(r.status, 0, r.out);
});

// The check this whole exercise was about.
test('fails when production has a migration with no file in the repo', { skip: !hasBash }, () => {
  const r = run({ files: ['20260101000000'], remote: ['20260101000000', '20260521070416'] });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /Production has migrations with NO file in this repo.*20260521070416/s);
  assert.match(r.out, /can no longer be rebuilt from this repo alone/);
});

test('an allowlisted production-only version is accepted', { skip: !hasBash }, () => {
  const r = run({
    files: ['20260101000000'],
    remote: ['20260101000000', '20260521070416'],
    allowlist: ['20260521070416 add_activated_at_to_players'],
  });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /No reverse drift/);
});

test('allowlisting one orphan does not excuse a different one', { skip: !hasBash }, () => {
  const r = run({
    files: ['20260101000000'],
    remote: ['20260101000000', '20260521070416', '20260901000000'],
    allowlist: ['20260521070416 add_activated_at_to_players'],
  });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /20260901000000/);
  assert.doesNotMatch(r.out, /NO file in this repo.*20260521070416/s);
});

test('comments and blank lines in the allowlist are ignored', { skip: !hasBash }, () => {
  const r = run({
    files: ['20260101000000'],
    remote: ['20260101000000', '20260521070416'],
    allowlist: ['# a heading', '', '  # indented note', '20260521070416 add_activated_at_to_players'],
  });
  assert.equal(r.status, 0, r.out);
});

test('an allowlist entry that now has a file is reported as stale', { skip: !hasBash }, () => {
  const r = run({
    files: ['20260101000000', '20260521070416'],
    remote: ['20260101000000', '20260521070416'],
    allowlist: ['20260521070416 add_activated_at_to_players'],
  });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /Stale entries.*20260521070416\(now-has-a-file\)/s);
});

test('an allowlist entry absent from production is reported as stale', { skip: !hasBash }, () => {
  const r = run({
    files: ['20260101000000'],
    remote: ['20260101000000'],
    allowlist: ['20260521070416 add_activated_at_to_players'],
  });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /Stale entries.*20260521070416\(not-in-production\)/s);
});

// The specific way the old check lied: it could not connect, got nothing back,
// and read that as an empty database.
test('an empty production result is a failure, not an empty database', { skip: !hasBash }, () => {
  const r = run({ files: ['20260101000000'], remote: [] });
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /Treating an empty result as failure/);
});

test('a missing allowlist file fails instead of skipping the reverse check', { skip: !hasBash }, () => {
  const { dir, migrations } = sandbox({ files: ['20260101000000'], remote: ['20260101000000'] });
  try {
    const r = spawnSync(
      'bash',
      [SCRIPT, migrations, join(dir, 'remote.txt'), join(dir, 'does-not-exist.txt'), CUTOFF],
      { cwd: root, encoding: 'utf8' },
    );
    assert.equal(r.status, 2, `${r.stdout}${r.stderr}`);
    assert.match(`${r.stdout}${r.stderr}`, /cannot read/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('both directions are reported together, not one at a time', { skip: !hasBash }, () => {
  const r = run({ files: ['20260101000000', '20260102000000'], remote: ['20260101000000', '20260901000000'] });
  assert.equal(r.status, 1, r.out);
  // A `exit 1` on the first failure would hide the second, so a fix for one
  // would be followed by a surprise failure for the other.
  assert.match(r.out, /NOT applied to production.*20260102000000/s);
  assert.match(r.out, /NO file in this repo.*20260901000000/s);
});

// ---------------------------------------------------------------------------
// The committed allowlist, checked against the real repo.
// ---------------------------------------------------------------------------
test('every committed allowlist entry is a bare version and a name', () => {
  const lines = readFileSync(join(root, ALLOWLIST), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  assert.ok(lines.length > 0, 'the allowlist has no entries');
  for (const line of lines) {
    assert.match(line, /^\d{14} \S/, `malformed allowlist line: ${line}`);
  }
});

test('no allowlisted version also exists as a migration file', () => {
  const allowed = readFileSync(join(root, ALLOWLIST), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)[0]);

  const files = spawnSync('ls', ['supabase/migrations'], { cwd: root, encoding: 'utf8' })
    .stdout.split('\n')
    .map((f) => f.trim().match(/^(\d{14})_/)?.[1])
    .filter(Boolean);

  for (const v of allowed) {
    assert.ok(!files.includes(v), `${v} is allowlisted as production-only but has a migration file`);
  }
});
