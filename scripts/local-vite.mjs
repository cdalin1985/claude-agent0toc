// Keep machine-specific boundary checks out of the portable build command.
// Forward the same CLI arguments to the check and Vite, including custom modes.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [command, ...args] = process.argv.slice(2);
if (command !== 'dev' && command !== 'preview') {
  console.error('Expected dev or preview.');
  process.exit(1);
}
const check = spawnSync(process.execPath, [resolve(root, 'scripts/check-workspace.mjs'), ...args], {
  cwd: root,
  stdio: 'inherit',
});
if (check.status !== 0) process.exit(check.status ?? 1);
const vite = spawnSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), command, ...args], {
  cwd: root,
  stdio: 'inherit',
});
if (vite.error) console.error('Unable to start local Vite.');
process.exit(vite.status ?? 1);
