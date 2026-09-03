# CLAUDE.md — TOC Project Memory

## Workspace policy

This repository is the clean local checkout for **TOC.Monster / Top of the Capital**.

- Local checkout: `D:/documents/claude-agent0toc`
- GitHub repo: `cdalin1985/claude-agent0toc`
- Vercel team/project: `cdalin-projects/toc-app`
- Vercel project ID: `prj_cpSNmnjRXFK14Jadp2yU4tEghDFQ`
- Vercel organization ID: `team_JIGWMVABx7X7cCpDMuWcujgZ`
- Production URL: `https://toc.monster`
- Supabase project: `toc1` (`ankvjywsnydpkepdvuvm`)
- Production branch: `main`

## Cloud environment

- Claude Code cloud sessions load the repository-scoped integrations from `.mcp.json`.
- Supabase MCP is restricted to project `ankvjywsnydpkepdvuvm`, read-only mode, and the database/debugging/development/docs tool groups.
- Vercel MCP is restricted to `cdalin-projects/toc-app`.
- Authenticate MCP servers through `/mcp`; never commit OAuth tokens, access tokens, database passwords, service-role keys, or `.env.local`.
- Use `bash scripts/cloud-setup.sh` in the Claude Code web environment's **Setup script** field.
- Start the remote preview with `npm run dev -- --host 0.0.0.0` and use its forwarded port.
- Never deploy to production or mutate production Supabase data unless Chase explicitly asks for that action.
- When giving Chase a command, state **Where** to run it and **Why** in one concise sentence.

## TOC vs TOF — hard boundary

TOC (`cdalin1985/claude-agent0toc`) and TOF (`cdalin1985/TOF`, Top of the Falls) are separate repos, separate Vercel projects (toc-app vs tof-app), and separate Supabase backends. TOF was forked from TOC long ago and has diverged (different ruleset — no Rank #1 obligation, different branding/logo).

Never merge, branch, cherry-pick, or sync code/migrations/PRs between TOC and TOF. Never assume a fix or merge in one applies to the other — always check the other repo independently if asked. Treat them as fully unrelated codebases that happen to share lineage.

## Canonical paths

- Never put TOF roster files, Carl notes, TOF migrations, or TOF Supabase config in this TOC.Monster checkout.

Never dump random work files into the app repo. Keep scratch files, patch archives, copied prompts, and temporary exports outside the app repo unless they are intentional project documentation under `docs/`.

## Work style

Chase does not want to babysit multi-step commands.
Prefer direct tool work.
When local work is unavoidable, provide one copy/paste command.
Chase's local shell is **PowerShell on Windows**. Write every terminal snippet as
exact, runnable PowerShell — never cmd syntax (no `cd /d`), never bash syntax, never
placeholders like `<branch>` or `path/to/x` that Chase has to fill in himself.
For terminal snippets, always put the correct cd path as the first line:
`cd D:\documents\claude-agent0toc`.
Anything that is not literally pasteable (clicking through a UI, an OAuth prompt) goes
outside the code block, listed as steps — never mixed into the snippet.
Protect the repo from clutter.
Use branch/PR workflow.
Run lint/build before claiming success.

## TOC canon

**`README.md` is the single source of truth for league rules.** Read its "Official Rules"
section before changing any rule behaviour, and update it in the same change if a rule
moves. Where code and README disagree, the README is right and the code is the bug.
README also carries "What the app enforces for you" and "Rules people enforce, not the
app" — check both before assuming the app owns a rule.

**There are no seasons and no league nights.** TOC runs continuously and every member
plays at their own pace: they challenge when they want, agree a time between themselves,
and the list moves when a result comes in. Nothing resets on a calendar and nothing
happens on a fixed evening. Never write copy, comments or commit messages that assume a
shared match night, a round, a fixture, a season or a reset — `test/no-seasons.test.mjs`
fails the build on the player-facing ones.
