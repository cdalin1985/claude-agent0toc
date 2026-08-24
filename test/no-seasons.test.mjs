// TOC has no seasons and no league nights. It is one continuous ladder -- you
// hold a rank until somebody takes it off you, nothing resets on a calendar,
// and nothing happens on a fixed evening. Members challenge when they want and
// agree a time between themselves.
//
// That is league canon, and the app has contradicted it in player-visible text
// more than once. The most recent was the ladder header, which read
// "N players · Season Rankings" on the live site: the one screen every member
// opens, telling all of them the league runs in seasons.
//
// It keeps coming back because `player_season_stats` is a real table, so the
// word is legitimately all over the codebase and a stray user-facing "Season"
// reads as consistent with its surroundings. Review has not caught it. This
// does.
//
// The same mistake has a second shape: writing as though the league meets on a
// given evening -- "league night", "match night", "this week's round". It is
// the natural way to write about a pool league and it is wrong about this one,
// so it gets the same treatment.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const srcDir = join(root, 'src');

function sourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (['.ts', '.tsx'].includes(extname(entry))) {
      found.push(full);
    }
  }
  return found;
}

// The identifiers that legitimately carry the word: the stats table, its
// generated types, and the variables named after them. Stripping these leaves
// only prose -- which is where a claim about seasons would actually reach a
// member.
const ALLOWED = [
  /player_season_stats/g,
  /PlayerSeasonStats/g,
  /seasonStats/g,
  /season_stats/g,
  // The tour and any copy that correctly denies seasons ("boxing-style, no
  // seasons"). Denying it is the canon, so it must stay legal to say.
  /no seasons/gi,
];

test('no player-facing text claims the league has seasons', () => {
  const offenders = [];

  for (const file of sourceFiles(srcDir)) {
    let text = readFileSync(file, 'utf8');
    for (const pattern of ALLOWED) text = text.replace(pattern, '');

    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (/season/i.test(line)) {
        offenders.push(`${relative(root, file)}:${i + 1}  ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    'TOC has no seasons -- this is one continuous ladder. Remove the word from ' +
    'player-facing copy, or add the identifier to ALLOWED if it is a stats ' +
    `table reference rather than prose.\n\n${offenders.join('\n')}`,
  );
});

// Words that only make sense if everyone turns up somewhere at the same time.
// "tonight" is included because it is how this phrasing usually arrives -- "get
// your challenge in tonight" assumes an occasion that does not exist.
const SCHEDULED_PLAY = /\b(league night|match night|game night|pool night|this week's round|next round|fixture|matchday|match day|tonight)\b/i;

test('no player-facing text assumes a league night or a fixed round', () => {
  const offenders = [];

  for (const file of sourceFiles(srcDir)) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (SCHEDULED_PLAY.test(line)) {
        offenders.push(`${relative(root, file)}:${i + 1}  ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    'TOC has no league nights -- members play at their own pace and arrange each ' +
    'match between themselves. Rewrite without assuming everyone is in a room ' +
    `together on a given evening.\n\n${offenders.join('\n')}`,
  );
});

test('the ladder header does not reintroduce it', () => {
  // Pinned separately because this is the screen it reached last time, and the
  // sweep above would let it pass if someone ever widened ALLOWED.
  const rankings = readFileSync(join(srcDir, 'pages', 'RankingsPage.tsx'), 'utf8');
  assert.doesNotMatch(rankings, /Season Rankings/i);
});
