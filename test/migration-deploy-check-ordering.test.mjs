// migration-deploy-check.yml must not race migration-apply.yml.
//
// Both used to trigger on the same `push: branches: [main]` event and run in
// parallel. Apply takes ~22s to actually commit the new row to
// schema_migrations; the drift check's query ran at ~8-11s and read the table
// before the write landed. Two real merges (2026-08-26 03:39 and 23:53) both
// failed this way -- the migration in question was live in production both
// times, seconds after the check reported it missing.
//
// compare-migrations.sh already has a 30-minute recency grace window meant to
// cover exactly this, but it compares wall-clock now against the migration's
// OWN filename timestamp -- when the file was authored, not when it was
// pushed -- so it never engages for a migration that sat in review for hours
// before merging, which is the ordinary case here. The fix is not a longer
// grace window or a sleep; it is to stop racing the two workflows at all, by
// triggering the check off the apply workflow's completion instead of off
// the same push.
//
// This pins the ordering, not just its intent: a well-meaning edit back to
// `push: branches: [main]` would restore the exact race this file exists to
// catch, and nothing else in CI would notice. Regex-over-source rather than a
// YAML parse, matching every other workflow test in this repo -- js-yaml is
// only a transitive dependency here (present in package-lock.json but not in
// package.json), so importing it directly would make this test's continued
// existence depend on some other package continuing to require it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const check = readFileSync(join(root, '.github/workflows/migration-deploy-check.yml'), 'utf8');
const apply = readFileSync(join(root, '.github/workflows/migration-apply.yml'), 'utf8');

const applyWorkflowName = apply.match(/^name:\s*(.+)$/m)?.[1]?.trim();

test('the apply workflow name is readable, or every test below proves nothing', () => {
  assert.ok(applyWorkflowName, 'could not read name: from migration-apply.yml');
});

test('the drift check triggers off the apply workflow finishing, not off push', () => {
  assert.match(check, /workflow_run:/);
  assert.match(check, /types:\s*\[completed\]/);
  // Named by the apply workflow's actual `name:`, not a guessed string -- a
  // rename of one file with no corresponding update to the other would
  // otherwise fail silently: workflow_run simply never fires again.
  const workflowsLine = check.match(/workflows:\s*\[(.+?)\]/)?.[1] ?? '';
  assert.match(workflowsLine, new RegExp(`['"]${applyWorkflowName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`));
});

test('a same-push race cannot be reintroduced without this test failing', () => {
  // The literal bug: `on:` here must not contain a bare `push:` trigger. If
  // it comes back, the two workflows are racing again regardless of what
  // workflow_run also says. Scoped to the `on:` block so this does not
  // false-positive on the word "push" appearing in a comment.
  const onBlock = check.slice(check.indexOf('\non:'), check.indexOf('\njobs:'));
  assert.doesNotMatch(onBlock, /^\s*push:/m,
    'a `push` trigger here would race migration-apply.yml on every merge to main, exactly as it did on 2026-08-26');
});

test('the schedule and manual triggers survive the ordering fix', () => {
  // The daily catch-all and the manual escape hatch are independent of the
  // push race and must not be lost while fixing it.
  assert.match(check, /schedule:\s*\n\s*-\s*cron:\s*'0 13 \* \* \*'/);
  assert.match(check, /workflow_dispatch:/);
});

test('only a run against main is checked', () => {
  // workflow_run fires for every branch the source workflow ran on, including
  // a manual dispatch of migration-apply against a release branch (which its
  // own header explicitly recommends doing before merging). Checking drift
  // against a non-production run would be meaningless at best.
  assert.match(check, /head_branch == 'main'/);
});

test('checkout pins the exact commit the apply run acted on', () => {
  // A workflow_run event's default checkout ref is the branch tip at the
  // moment this check runs, not necessarily the commit the source workflow
  // ran against. Pinning it explicitly removes that gap rather than relying
  // on the two usually being the same commit.
  assert.match(check, /ref:\s*\$\{\{\s*github\.event\.workflow_run\.head_sha/);
});
