# AGENTS.md — TOC Agent Instructions

## Workspace policy

This repository is the clean local checkout for **TOC.Monster / Top of the Capital**.

- Local checkout: `C:/Users/chase/toc-monster-app`
- GitHub repo: `cdalin1985/claude-agent0toc`
- Vercel project: `toc-app`
- Production URL: `https://toc.monster`
- Supabase project: `toc1`
- Production branch: `main`

Do not mix TOC.Monster and TOF work:

- TOC.Monster work belongs in `C:/Users/chase/toc-monster-app`.
- TOF / Top of the Falls work belongs in `C:/Users/chase/tof-app`.
- `C:/Users/chase/toc-app` should remain absent/unused; the stale old TOF copy was renamed to `C:/Users/chase/toc-app_OLD_TOF_DO_NOT_USE_20260610`.
- Never put TOF roster files, Carl notes, TOF migrations, or TOF Supabase config in this TOC.Monster checkout.

Do not place scratch files, patch ZIPs, exported prompts, or temporary documents in this app repo unless they are intentional project documentation under `docs/`.

## Operating rule

When doing TOC work:

1. Protect TOC canon first.
2. Use small branch/PR slices.
3. Run lint/build before PR.
4. Do not modify .env, secrets, node_modules, dist, or lockfiles without explicit instruction.
5. Keep app code in this repo, automation in the swarm folder, and project support files in TOC_WORKSPACE.
6. For terminal snippets, always put the correct cd path as the first line.

## TOC canon

- Minimum race = 6.
- New league member first challenge = up to 10 spots above.
- Regular non-top-10 = up to 5 spots above only.
- Top 10 = up/down 5 spots.
- Rank #1 can challenge anyone.
- Post-loss cooldown = 24 hours.
- Single unified ranking list.
- Disciplines = 8 Ball, 9 Ball, 10 Ball.
- Venues = Eagles 4040 and Valley Hub.
- Treasury visible to all players.
- Only super_admin manages treasury.
