---
name: toc-workflow
description: Use for every TOC dev task - branch/PR discipline, workspace hygiene, lint/build verification, no clutter rules
---

# TOC Workflow

## Overview

The TOC project has strict workspace rules. The app repo is for app code only. AI tooling, scratch files, and exploratory work live in TOC_WORKSPACE.

**Core principle:** Protect the repo. The next contributor (or future you) should see only relevant app code.

## Canonical Paths

| What | Where |
|------|-------|
| App code | `C:\Users\chase\Desktop\claude-agent0toc` |
| Workspace / scratch / tooling | `C:\Users\chase\Desktop\TOC_WORKSPACE` |
| Swarm automation | `C:\Users\chase\Desktop\TOC-Agent-Swarm` |
| Legacy incoming | `D:\documents\Claude\Projects\toc` |

## What Goes Where

### App Repo (`claude-agent0toc`) — Yes
- `src/` — React + TS source
- `supabase/` — migrations + edge functions
- `public/`, `index.html`, `vite.config.ts`, `tsconfig.json`
- Config files Vite/Tailwind/ESLint need to build
- Tests for app code

### App Repo — NO
- AI agent skills / plugin directories
- Patch archives, copied prompts
- Scratch notes, exploratory docs
- Experimental forks
- Anything starting with "temp-" or "scratch-"

### TOC_WORKSPACE — Yes
- AI skill plugins (this plugin lives here!)
- Patch backups
- Prompts and AI session logs
- Cross-project notes
- Anything that supports development without being app code

## Branch & PR Workflow

### Branching
- Work on a feature branch, never directly on `main`
- Branch name pattern: `feature/<short-description>` or `fix/<short-description>`
- For AI-driven sessions, the harness may use `claude/<task>-<id>` — that's fine

### Commits
- Each commit logical and self-contained
- Message format: imperative present, e.g. "Add cooldown check to create-challenge"
- Reference issue/PR if applicable in body, not title

### Pre-PR Checklist
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] Manual smoke test of the affected feature
- [ ] No `console.log` left in code
- [ ] No commented-out blocks
- [ ] No new files in repo root that aren't config

### PR
- Open as **draft** first
- Title: short and descriptive (under 70 chars)
- Body: Summary + Test plan checklist
- Don't push to `main` directly, ever

## Lint / Build Discipline

> "Run lint/build before claiming success."

This is non-negotiable. Specifically:

```bash
npm run lint    # ESLint with project config
npm run build   # Vite production build
```

If either fails, the work is not done. Don't say "complete" when CI will fail.

For type-only verification:
```bash
npx tsc --noEmit
```

## Working Style Preferences

From CLAUDE.md, Chase prefers:

✓ **Direct tool work** over babysitting multi-step commands
✓ **One copy/paste command** when local work is unavoidable
✓ **`cd` path as first line** for any terminal snippet shown
✓ **Branch/PR workflow** (no direct-to-main)
✓ **Protected repo** (no clutter)
✓ **Lint/build verification** before declaring success

## Terminal Snippet Format

When showing commands the user must run locally, always lead with the directory:

```powershell
cd C:\Users\chase\Desktop\claude-agent0toc
npm run lint && npm run build
```

Not:
```bash
npm run lint && npm run build   # ❌ no cd path
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Committing a scratch file to app repo | Move to TOC_WORKSPACE, gitignore the path |
| Direct push to `main` | Create a branch + PR |
| Saying "done" without running build | Run `npm run build` first |
| Multi-step instructions to user | Collapse into one command |
| Terminal snippet without `cd` line | Always lead with the path |
| Creating a new top-level dir for "temp" work | Use TOC_WORKSPACE instead |

## Verification

Before declaring a TOC task complete:
- [ ] Branch is feature/fix/* not main
- [ ] `npm run lint` clean
- [ ] `npm run build` succeeds
- [ ] No scratch files added to app repo
- [ ] PR opened as draft
- [ ] Manual smoke test done in browser
- [ ] Tests added/updated where applicable
