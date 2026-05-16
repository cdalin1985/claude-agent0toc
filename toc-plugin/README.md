# TOC Plugin

Project-specific Claude Code skills for the **TOC** (Helena, MT pool league) ranking application.

This plugin captures the rules, patterns, and workflow conventions for the TOC project. It's designed to live in `TOC_WORKSPACE`, not in the app repo itself (per the workspace policy in `CLAUDE.md`).

## Skills

| Skill | Use When |
|-------|----------|
| **toc-canon** | Touching any business rule (race, challenge, cooldown, treasury) |
| **toc-challenge-flow** | Working on challenges — eligibility, lifecycle, response flow |
| **toc-ranking-system** | Working on the unified ranking, position updates, rank #1 logic |
| **toc-supabase-patterns** | Writing RLS policies, edge functions, migrations, real-time |
| **toc-admin-and-treasury** | Admin panel features, role gates, treasury ledger, audit events |
| **toc-workflow** | Branch/PR discipline, lint/build verification, workspace hygiene |

## Why a Dedicated Plugin?

Generic skills (TDD, debugging, code review) are useful, but TOC has specifics that generic plugins can't know:

- **Canon rules**: min race=6, top-10 ±5 spots, rank #1 unlimited, 24h post-loss cooldown
- **Tech stack**: React + Vite + Tailwind + Supabase with specific patterns
- **File structure**: real paths like `src/hooks/useRankings.ts` and `supabase/functions/create-challenge/`
- **Role model**: `player | admin | super_admin` with treasury restrictions
- **Workspace policy**: app repo is code-only; tooling lives in TOC_WORKSPACE

## Where This Plugin Lives

```
C:\Users\chase\Desktop\TOC_WORKSPACE\toc-plugin\
├── .claude-plugin\plugin.json
├── README.md
└── skills\
    ├── toc-canon\SKILL.md
    ├── toc-challenge-flow\SKILL.md
    ├── toc-ranking-system\SKILL.md
    ├── toc-supabase-patterns\SKILL.md
    ├── toc-admin-and-treasury\SKILL.md
    └── toc-workflow\SKILL.md
```

## Related Plugins (also in TOC_WORKSPACE)

- `karpathy-skills-plugin/` — general coding principles
- `superpowers-plugin/` — TDD, debugging, planning methodology
- `multica-plugin/` — multi-agent team management (optional, if scaling)

## Maintenance

When canon changes (race format adjusted, new venue added, role permissions shifted), update **toc-canon/SKILL.md** first — it's the authoritative reference. The other skills derive from it.

When file paths change, update the file-reference tables in the affected skills.
