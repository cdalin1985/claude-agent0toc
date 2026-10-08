import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, symlinkSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.env.npm_execpath ?? resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');

test('local npm commands validate custom modes; portable build has no local hook', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'toc-boundary-test-'));
  try {
    mkdirSync(join(fixture, 'scripts'));
    mkdirSync(join(fixture, '.vercel'));
    mkdirSync(join(fixture, 'supabase/.temp'), { recursive: true });
    for (const file of ['package.json', '.gitignore', 'scripts/check-workspace.mjs', 'scripts/local-vite.mjs']) {
      copyFileSync(join(root, file), join(fixture, file));
    }
    symlinkSync(join(root, 'node_modules'), join(fixture, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    execFileSync('git', ['init', '--quiet', fixture]);
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/cdalin1985/claude-agent0toc.git'], { cwd: fixture });
    writeFileSync(join(fixture, '.vercel/project.json'), JSON.stringify({ projectId: 'prj_cpSNmnjRXFK14Jadp2yU4tEghDFQ', orgId: 'team_JIGWMVABx7X7cCpDMuWcujgZ' }));
    writeFileSync(join(fixture, 'supabase/.temp/project-ref'), 'ankvjywsnydpkepdvuvm');
    // Synthetic key and environment exist only in the throwaway fixture.
    const key = `e30.${Buffer.from(JSON.stringify({ role: 'anon', ref: 'ankvjywsnydpkepdvuvm' })).toString('base64url')}.test`;
    writeFileSync(join(fixture, '.env'), `VITE_SUPABASE_URL=https://ankvjywsnydpkepdvuvm.supabase.co\nVITE_SUPABASE_ANON_KEY=${key}\n`);
    writeFileSync(join(fixture, '.env.staging'), 'VITE_SUPABASE_URL=https://invalid.example\n');
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('VITE_') && !name.startsWith('GIT_') && name !== 'npm_config_mode'));
    for (const command of ['dev', 'preview']) {
      const valid = spawnSync(process.execPath, [npm, 'run', command, '--', '--help'], { cwd: fixture, env, encoding: 'utf8' });
      assert.equal(valid.status, 0, valid.stdout + valid.stderr);
      for (const args of [['--mode', 'staging'], ['--mode=staging'], ['-m', 'staging']]) {
        const result = spawnSync(process.execPath, [npm, 'run', command, '--', ...args, '--help'], { cwd: fixture, env, encoding: 'utf8' });
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stderr, /Supabase URL mismatch or missing for staging/);
        assert.doesNotMatch(result.stdout, /Usage:/);
      }
    }
    const pkg = JSON.parse(readFileSync(join(fixture, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.prebuild, undefined);
    assert.equal(pkg.scripts.build, 'tsc -b && vite build');
  } finally {
    // Unlink the junction first; recursive removal is restricted to this fixture.
    rmSync(join(fixture, 'node_modules'), { force: true, recursive: true });
    assert.equal(dirname(fixture), tmpdir());
    assert.ok(fixture.startsWith(join(tmpdir(), 'toc-boundary-test-')));
    rmSync(fixture, { recursive: true, force: true });
  }
});
