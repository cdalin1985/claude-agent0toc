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

**There are no seasons and no league nights.** TOC runs continuously and every member
plays at their own pace: they challenge when they want, agree a time between themselves,
and the list moves when a result comes in. Nothing resets on a calendar and nothing
happens on a fixed evening. Never write copy, comments or commit messages that assume a
shared match night, a round, a fixture, a season or a reset — `no-seasons.test.mjs` fails
the build on the player-facing ones.

Minimum race = 6, no maximum.
New member first challenge = up to 10 spots above.
Regular non-top-10 = up to 5 spots above only.
Top 10 = up/down 5 spots.
Rank #1 can challenge anyone, and must play a top-5 player twice per 30 days or drop to #10.
Must play your first challenger before any other challenge.
Respond to a challenge within 48 hours; play within 10 days of acceptance.
Two challenges per week.
Post-loss cooldown = 24 hours; same after climbing. Defending costs nothing.
Inactive 30+ days = drop 2 spots per 30 days; returning waits 7 days (24 hours if last).
One unified ranking list across 8 Ball, 9 Ball, 10 Ball.
Venues are Eagles 4040 and Valley Hub.
Treasury is visible to all players.
Only super_admin manages treasury.

Also enforced in code: 24-hour cooldown after a wash (challenger only), the 7-day return
wait (24 hours if last), the no-show spot swap (admin-applied, and only ever downward),
locking in a challenge after defending (shields you from below until it settles), and the
30/60/90-day inactive review.

Left to people on purpose, and listed in README under "Rules people enforce, not the app":
filing a no-show (admin applies it), removing a player at 90 days (a judgement call), and
the table rules — rack your own, the lag or flip, who breaks, who picks the table.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **claude-agent0toc** (1094 symbols, 1711 relationships, 24 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/claude-agent0toc/context` | Codebase overview, check index freshness |
| `gitnexus://repo/claude-agent0toc/clusters` | All functional areas |
| `gitnexus://repo/claude-agent0toc/processes` | All execution flows |
| `gitnexus://repo/claude-agent0toc/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
