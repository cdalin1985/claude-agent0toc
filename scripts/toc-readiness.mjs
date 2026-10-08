// Local, read-only readiness. No network, package install, build, or file writes.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
const git = { cwd: root, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] };
const failures = [];
if (realpathSync(process.cwd()) !== root) {
  console.error('BLOCKED: run from the TOC repository root.');
  process.exit(1);
}
const remoteLines = execFileSync('git', ['remote', '-v'], git).trim().split('\n');
if (!remoteLines.some(line => line.startsWith('origin\t')) || remoteLines.some(line =>
  !/^(https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)cdalin1985\/claude-agent0toc(?:\.git)?$/.test(line.split(/\s+/)[1] ?? '')
)) {
  console.error('BLOCKED: repository remote is outside the TOC allowlist.');
  process.exit(1);
}
console.log(`TOC checkout: ${root}`);
console.log(`Branch: ${execFileSync('git', ['branch', '--show-current'], git).trim() || '(detached HEAD)'}`);
const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], git).trim();
console.log(`Working tree: ${status ? 'existing changes; preserve them' : 'clean'}`);
const [major, minor] = process.versions.node.split('.').map(Number);
if (!((major === 22 && minor >= 18) || major === 24)) failures.push('Use Node 24.x (Vercel) or Node 22.18+ (CI and native TypeScript tests).');
console.log(`Node: ${process.versions.node}`);
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
let checked = 0;
for (const group of ['dependencies', 'devDependencies']) {
  for (const [name, range] of Object.entries(pkg[group] ?? {})) {
    const installedPath = resolve(root, 'node_modules', name, 'package.json');
    const locked = lock.packages?.[`node_modules/${name}`]?.version;
    if (lock.packages?.['']?.[group]?.[name] !== range) failures.push(`Lockfile declaration mismatch: ${name}.`);
    if (!existsSync(installedPath)) failures.push(`Missing installed dependency: ${name}; do not auto-install.`);
    else if (!locked || JSON.parse(readFileSync(installedPath, 'utf8')).version !== locked) failures.push(`Installed dependency differs from lockfile: ${name}.`);
    checked++;
  }
}
console.log(`Direct dependencies checked against lockfile: ${checked}`);
for (const path of ['AGENTS.md', 'docs/toc-onboarding.md', 'scripts/check-workspace.mjs', 'scripts/local-vite.mjs', 'scripts/verify-db.sh']) {
  if (!existsSync(resolve(root, path))) failures.push(`Missing required TOC file: ${path}.`);
}
const hooks = spawnSync('git', ['config', '--local', '--get', 'core.hooksPath'], git);
if (hooks.stdout?.trim() !== '.githooks') failures.push('Local pre-commit hook is not configured as .githooks; review existing hooks before changing it.');
if (failures.length) {
  console.error(failures.map(message => `BLOCKED: ${message}`).join('\n'));
  process.exit(1);
}
const check = spawnSync(process.execPath, [resolve(root, 'scripts/check-workspace.mjs'), ...process.argv.slice(2)], {
  cwd: root, env, stdio: 'inherit',
});
if (check.status !== 0) process.exit(check.status ?? 1);
console.log('LOCAL READINESS PASS. Local development uses PRODUCTION TOC data (toc1).');
console.log('Cloud access, migration state, push delivery, and live user workflows are NOT verified by this command.');
console.log('Use the exact-project checks in docs/toc-onboarding.md; stop on mismatches or access denials.');
