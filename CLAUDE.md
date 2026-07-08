# CLAUDE.md — TOC Project Memory

## Workspace policy

TOC_WORKSPACE is the command center.
claude-agent0toc is the app code repo only.
TOC-Agent-Swarm is the automation/swarm folder only.

Never dump random work files into the app repo. Keep scratch files, patch archives, copied prompts, and temporary exports in TOC_WORKSPACE.

## Canonical paths

- TOC workspace: C:\Users\chase\Desktop\TOC_WORKSPACE
- TOC app repo: C:\Users\chase\Desktop\claude-agent0toc
- TOC swarm: C:\Users\chase\Desktop\TOC-Agent-Swarm
- Old incoming folder: D:\documents\Claude\Projects\toc

## Work style

Chase does not want to babysit multi-step commands.
Prefer direct tool work.
When local work is unavoidable, provide one copy/paste command.
For terminal snippets, always put the correct cd path as the first line.
Protect the repo from clutter.
Use branch/PR workflow.
Run lint/build before claiming success.

## TOC canon

Minimum race = 6.
New member first challenge = up to 10 spots above.
Regular non-top-10 = up to 5 spots above only.
Top 10 = up/down 5 spots.
Rank #1 can challenge anyone.
Post-loss cooldown = 24 hours.
One unified ranking list across 8 Ball, 9 Ball, 10 Ball.
Venues are Eagles 4040 and Valley Hub.
Treasury is visible to all players.
Only super_admin manages treasury.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **claude-agent0toc** (1268 symbols, 1940 relationships, 26 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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

<!-- model-delegation-policy -->
# Model Delegation Policy

Use the cheapest model that can safely complete the task. Escalate only when justified.

## Routing table

| Task | Agent | Model |
|---|---|---|
| File discovery, symbol search, reading docs or config | cheap-scout | Haiku |
| Lint, typecheck, test runs, error log inspection | cheap-tester | Haiku |
| CSS tweaks, copy edits, label renames, single-file boilerplate | cheap-writer | Haiku |
| Bug fixes, UI, API wiring, features, refactors up to 6 files | standard-coder | Sonnet |
| Hard bugs after a Sonnet fix failed; async/auth/DB failures | power-debugger | Opus |
| Architecture, schema, auth/RLS, payments, large refactors | power-architect | Opus |

## Mandatory sequencing rules

1. If the relevant files are not already known → start with cheap-scout.
2. If the task is validation or error inspection → start with cheap-tester.
3. If the task is a trivial write (CSS, copy, config, no logic, max 2 files) → use cheap-writer.
4. For all other implementation → use standard-coder.
5. Escalate to power-debugger only after a Sonnet-level fix attempt failed.
6. Escalate to power-architect only for high-impact decisions, not routine coding.

## Escalation to Opus — only when one of these is true

- The change affects schema, RLS, auth, payment, ranking, or other core business rules.
- A Sonnet-level fix failed once.
- The change spans more than 6 meaningful files.
- A wrong answer could corrupt data, weaken security, or break production behavior.
- The correct answer depends on hidden coupling or product logic.

## Never use Opus for

Formatting, copy edits, CSS, file discovery, test runs, basic summaries, single-file boilerplate.

## Cost discipline

- Summarize findings; do not paste large file contents between agents.
- Use exact file paths and line ranges in handoffs.
- Prefer a targeted lint or single-test command over a full suite.
- Before escalating to Opus, write one sentence explaining why Haiku or Sonnet cannot safely complete the task.

<!-- OPENROUTER_COST_ROUTING_START -->

# Claude Code OpenRouter Cost Routing

Use OpenRouter through Claude Code.

## Model routing

| Task type | Agent | Claude Code role | OpenRouter model |
|---|---|---|---|
| File discovery, repo scouting, config/docs inspection | flash-scout | haiku | deepseek/deepseek-v4-flash |
| Test/lint/typecheck/build validation | flash-tester | haiku | deepseek/deepseek-v4-flash |
| Very small obvious edits | flash-simple-editor | haiku | deepseek/deepseek-v4-flash |
| Normal coding and feature work | v4-pro-coder | sonnet | deepseek/deepseek-v4-pro |
| Hard architecture/debugging/security/business logic | opus-hard | opus | anthropic/claude-opus-4.8 |

## Escalation rules

1. Start with lash-scout when files or root cause are unknown.
2. Use lash-tester for validation and error summaries.
3. Use lash-simple-editor only for tiny safe edits.
4. Use 4-pro-coder for normal implementation.
5. Use opus-hard only for:
   - auth
   - RLS/security
   - database migrations
   - payment logic
   - ranking/business rules
   - repeated bugs
   - architecture decisions
   - refactors touching more than 5 meaningful files
6. Before using Opus, state why DeepSeek V4 Flash or DeepSeek V4 Pro is not enough.
7. Keep context small. Prefer targeted file reads and targeted validation commands.
8. Do not use Opus for file search, log reading, simple UI edits, CSS tweaks, small copy changes, or routine test runs.

<!-- OPENROUTER_COST_ROUTING_END -->
