// Every edge function has a path to production.
//
// deploy-edge-functions.yml deploys from an explicit list rather than from
// whatever is on disk, on purpose: the CLI defaults verify_jwt to true, and
// create-challenge runs with it false, so a directory-driven deploy would
// silently change the gateway behaviour of a live function.
//
// The cost of an explicit list is that adding a function and forgetting the
// list is easy -- and the workflow only says so at deploy time, after the PR
// has merged, in a run somebody has to go and look at. Worse, it exits 1 on
// the first missing name, so one forgotten function blocks the deploy of every
// other function in the same run, including urgent ones unrelated to it.
//
// This is that same check, run in CI on the PR that adds the directory. It is
// deliberately a mirror of the shell above rather than a different idea of
// correctness: same _-prefix skip, same both-directions comparison.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const workflow = readFileSync(join(root, '.github/workflows/deploy-edge-functions.yml'), 'utf8');

// The FUNCTIONS="..." heredoc-ish block, as name:verify_jwt lines.
// \r?\n throughout: this repo is checked out with CRLF on Windows, and a bare
// \n anchor silently matches nothing, which would leave every assertion below
// passing against an empty list.
const block = workflow.match(/FUNCTIONS="\r?\n([\s\S]*?)\r?\n\s*"/);

const listed = new Map(
  (block?.[1] ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, verify] = line.split(':');
      return [name, verify];
    }),
);

// Same rule the workflow uses: _shared and friends are libraries, not functions.
const onDisk = readdirSync(join(root, 'supabase/functions'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => d.name);

test('the deploy list is actually parseable', () => {
  // If the block is ever reformatted past this regex, every assertion below
  // would pass against an empty list and prove nothing.
  assert.ok(block, 'could not find the FUNCTIONS block in deploy-edge-functions.yml');
  assert.ok(listed.size > 5, `parsed only ${listed.size} functions from the deploy list`);
});

test('every edge function on disk is in the deploy list', () => {
  const missing = onDisk.filter((name) => !listed.has(name));
  assert.deepEqual(missing, [],
    `these functions would never reach production: ${missing.join(', ')}`);
});

test('every name in the deploy list exists on disk', () => {
  // The workflow fails the whole run on a listed name with no directory, so a
  // rename or a retirement that misses this list takes every other function's
  // deploy down with it.
  const orphaned = [...listed.keys()].filter((name) => !onDisk.includes(name));
  assert.deepEqual(orphaned, [],
    `listed for deploy but not present: ${orphaned.join(', ')}`);
});

test('every function declares verify_jwt explicitly', () => {
  // A bare name would deploy with the CLI default rather than the setting the
  // function currently runs with, which is the surprise this list exists to
  // prevent.
  const bad = [...listed.entries()].filter(([, v]) => v !== 'true' && v !== 'false');
  assert.deepEqual(bad.map(([n]) => n), [],
    'these entries are missing a true/false verify_jwt');
});
