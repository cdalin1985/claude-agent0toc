// Read-only TOC boundary check. Never contacts a hosted service or prints keys.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = { cwd: root, encoding: 'utf8' };
const expectedRef = 'ankvjywsnydpkepdvuvm';
const failures = [];
const remotes = execFileSync('git', ['remote', '-v'], git).trim().split('\n');
if (!remotes.some(line => line.startsWith('origin\t'))) failures.push('Missing origin remote.');
for (const line of remotes) {
  const url = line.split(/\s+/)[1];
  if (!/^(https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)cdalin1985\/claude-agent0toc(?:\.git)?$/.test(url ?? '')) {
    failures.push('A Git fetch/push remote is outside the approved TOC repository.');
  }
}
const tracked = execFileSync('git', ['ls-files', '-z'], git).split('\0').filter(Boolean);
for (const file of tracked) {
  if (/(^|\/)\.env[^/]*$/.test(file) && file !== '.env.example') {
    failures.push('A local environment file is tracked or staged. Remove it from the index without deleting the local file.');
  }
  if (file.startsWith('.vercel/') || file.startsWith('supabase/.temp/')) {
    failures.push('Local provider link state must not be tracked.');
  }
}
const ignored = execFileSync('git', ['check-ignore', '--no-index', '.env', '.env.local', '.env.production', '.vercel/project.json', 'supabase/.temp/project-ref'], git).trim().split('\n');
if (ignored.length !== 5) failures.push('Local environment/provider files are not all ignored.');
const supabaseLink = resolve(root, 'supabase/.temp/project-ref');
if (!existsSync(supabaseLink) || readFileSync(supabaseLink, 'utf8').trim() !== expectedRef) {
  failures.push('Missing or mismatched Supabase link; ask for the TOC project reference before linking.');
}
const vercelLink = resolve(root, '.vercel/project.json');
if (!existsSync(vercelLink)) {
  failures.push('Missing Vercel link; ask for the TOC project and team IDs before linking.');
} else {
  const link = JSON.parse(readFileSync(vercelLink, 'utf8'));
  if (link.projectId !== 'prj_cpSNmnjRXFK14Jadp2yU4tEghDFQ' || link.orgId !== 'team_JIGWMVABx7X7cCpDMuWcujgZ') {
    failures.push('Vercel project/team does not match the approved TOC boundary.');
  }
}
const modes = new Set(['development', 'production', process.env.npm_config_mode].filter(Boolean));
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index++) {
  const argument = args[index];
  if (argument === '--mode' || argument === '-m') {
    const mode = args[++index];
    if (!mode || mode.startsWith('-')) failures.push('A mode option requires a value.');
    else modes.add(mode);
  } else if (argument.startsWith('--mode=')) {
    const mode = argument.slice('--mode='.length);
    if (!mode) failures.push('A mode option requires a value.');
    else modes.add(mode);
  }
}
for (const mode of modes) {
  const env = loadEnv(mode, root, 'VITE_');
  if (env.VITE_SUPABASE_URL !== `https://${expectedRef}.supabase.co`) failures.push(`Supabase URL mismatch or missing for ${mode}.`);
  if (!env.VITE_SUPABASE_ANON_KEY) failures.push(`Missing browser Supabase key for ${mode}.`);
  for (const [name, value] of Object.entries(env)) {
    if (/SECRET|SERVICE_ROLE|PASSWORD|PRIVATE_KEY/.test(name) || value.startsWith('sb_secret_')) {
      failures.push(`Privileged material cannot be exposed through ${name}.`);
    }
  }
  const key = env.VITE_SUPABASE_ANON_KEY ?? '';
  if (key.split('.').length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
      if (payload.role !== 'anon' || payload.ref !== expectedRef) failures.push(`Browser key role/project mismatch for ${mode}.`);
    } catch { failures.push(`Invalid browser key for ${mode}.`); }
  }
}
if (failures.length) {
  console.error([...new Set(failures)].map(message => `BLOCKED: ${message}`).join('\n'));
  process.exit(1);
}
console.log('TOC local boundaries OK. This checks local configuration, not live provider access.');
