import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

const sw = read('public', 'sw.js');
const matchPage = read('src', 'pages', 'MatchPage.tsx');
const challengesPage = read('src', 'pages', 'ChallengesPage.tsx');
const notificationsPage = read('src', 'pages', 'NotificationsPage.tsx');

const fnDir = join(root, 'supabase', 'functions');
const edgeFunctions = readdirSync(fnDir)
  .filter((name) => {
    try { readFileSync(join(fnDir, name, 'index.ts')); return true; } catch { return false; }
  })
  .map((name) => [name, readFileSync(join(fnDir, name, 'index.ts'), 'utf8')]);

// --- Service worker ---------------------------------------------------------

test('a push notification can never navigate a player off-site', () => {
  // The payload arrives over the network; the URL in it is untrusted data.
  assert.match(sw, /function safePath\(raw\)/);
  assert.match(sw, /if \(resolved\.origin !== self\.location\.origin\) return '\/';/);
  // Both the handler that stores the URL and the handler that navigates use it.
  assert.equal((sw.match(/safePath\(/g) ?? []).length, 3);
  assert.doesNotMatch(sw, /clients\.openWindow\(data\.url/);
  assert.doesNotMatch(sw, /client\.navigate\(data\.url/);
});

test('the client-origin check cannot be satisfied by a URL that merely contains our origin', () => {
  // 'evil.test/?next=https://toc.app' passes includes() and fails startsWith().
  assert.match(sw, /client\.url\.startsWith\(self\.location\.origin\)/);
  assert.doesNotMatch(sw, /client\.url\.includes\(self\.location\.origin\)/);
});

test('notifications no longer overwrite each other', () => {
  // A fixed tag meant a player with three pending challenges saw only the last.
  assert.doesNotMatch(sw, /tag: 'toc'/);
  assert.match(sw, /typeof data\.tag === 'string' && data\.tag/);
  assert.match(sw, /`toc-\$\{Date\.now\(\)\}-\$\{Math\.random\(\)/);
});

test('a malformed push payload still produces a notification', () => {
  // event.data.json() throws on a non-JSON body; an unhandled throw in the push
  // handler drops the notification silently.
  assert.match(sw, /try \{\s*\n\s*data = event\.data\?\.json\(\) \?\? \{\};\s*\n\s*\} catch \{/);
});

// --- Edge function hygiene, across every function ---------------------------

test('no edge function returns an error with a bare 200', () => {
  for (const [name, source] of edgeFunctions) {
    assert.doesNotMatch(
      source,
      /new Response\(JSON\.stringify\(\{ error[^\n]*\}\), \{ headers:/,
      `${name} returns an error without a status code`,
    );
  }
});

test('no edge function leaks internal error text to the client', () => {
  // Postgres errors carry constraint, column and table names.
  for (const [name, source] of edgeFunctions) {
    assert.doesNotMatch(source, /error: String\(e\)/, `${name} returns a raw exception`);
    assert.doesNotMatch(source, /error: \w*[eE]rror\.message \?\?/, `${name} returns a raw database message`);
  }
});

test('every unhandled failure is logged server-side before the generic reply', () => {
  for (const [name, source] of edgeFunctions) {
    if (!/catch \(e\)/.test(source)) continue;
    assert.match(source, new RegExp(`\\[${name}\\] unhandled:`), `${name} swallows its exception without logging`);
    assert.match(source, /Something went wrong on our end\. Please try again\./, `${name} has no generic reply`);
  }
});

test('permission failures are 403, missing things are 404, conflicts are 409', () => {
  const respond = edgeFunctions.find(([n]) => n === 'respond-to-challenge')[1];
  assert.match(respond, /'Not authorized\.' \}\), \{ status: 403/);
  assert.match(respond, /'Challenge not found\.' \}\), \{ status: 404/);
  const create = edgeFunctions.find(([n]) => n === 'create-challenge')[1];
  assert.match(create, /'That player does not exist\.' \}\), \{ status: 404/);
  assert.match(create, /active outgoing challenge\.' \}\), \{ status: 409/);
  // A failed ranking read is our problem, not the caller's.
  assert.match(create, /'Could not retrieve rankings\.' \}\), \{ status: 500/);
  const submit = edgeFunctions.find(([n]) => n === 'submit-result')[1];
  assert.match(submit, /'Not a participant\.' \}\), \{ status: 403/);
});

// --- Client network calls ---------------------------------------------------

test('the match scoreboard surfaces a failed update instead of showing a phantom point', () => {
  // callFn throws, and every caller already wraps it — so one check makes them
  // all correct.
  assert.match(matchPage, /if \(!res\.ok \|\| json\.error\) \{/);
  assert.match(matchPage, /throw new Error\(typeof json\.error === 'string' \? json\.error : `Request failed \(\$\{res\.status\}\)`\)/);
});

test('every respond-to-challenge handler clears its loading state and reports failure', () => {
  for (const [name, source] of Object.entries({ challengesPage, notificationsPage })) {
    for (const fn of source.match(/const handle\w+ = async \(\) => \{[\s\S]*?\n {2}\};/g) ?? []) {
      const label = `${name}:${fn.slice(0, 40).replace(/\n/g, ' ')}`;
      assert.match(fn, /finally \{/, `${label} does not clear loading in a finally`);
      assert.match(fn, /setError\(/, `${label} does not report failure`);
    }
  }
});

test('a refused wash is reported rather than silently closing the modal', () => {
  assert.match(challengesPage, /const json = await callFn\(\{ challenge_id: challenge\.id, action: 'wash' \}\);\s*\n\s*if \(json\.error\)/);
});

test('the challenge list surfaces a refused action', () => {
  // runChallengeAction cleared its spinner and discarded the outcome, so a
  // blocked wash looked like a dead button.
  assert.match(challengesPage, /setListError\(e instanceof Error \? e\.message/);
  assert.match(challengesPage, /\{listError && \(/);
  assert.match(challengesPage, /if \(!res\.ok \|\| json\.error\) throw new Error/);
});

test('no page hardcodes the venue list', () => {
  // Venues are admin-editable; a third venue must appear where players pick one,
  // not only in Admin and in the stats tabs.
  const pages = join(root, 'src', 'pages');
  for (const file of readdirSync(pages).filter((f) => f.endsWith('.tsx'))) {
    const source = readFileSync(join(pages, file), 'utf8');
    assert.doesNotMatch(source, /'Eagles 4040'/, `${file} hardcodes a venue`);
    assert.doesNotMatch(source, /'Valley Hub'/, `${file} hardcodes a venue`);
  }
});

test('nothing in this package reintroduces mojibake or a BOM', () => {
  for (const [name, source] of [...edgeFunctions, ['sw.js', sw], ['MatchPage', matchPage], ['ChallengesPage', challengesPage], ['NotificationsPage', notificationsPage]]) {
    assert.doesNotMatch(source, /Ã.|â€|ðŸ/, `${name} contains mojibake`);
    assert.ok(!source.startsWith('﻿'), `${name} starts with a BOM`);
  }
});
