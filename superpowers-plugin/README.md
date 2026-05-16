# Superpowers Plugin

A Claude Code plugin packaging the [obra/superpowers](https://github.com/obra/superpowers) skills library — an agentic skills framework and software development methodology that emphasizes TDD, systematic debugging, and collaborative workflows.

## Overview

This plugin provides 14 composable skills covering the complete development lifecycle, from initial brainstorming through code review and merge.

## Skills

### Methodology
- **test-driven-development** - Write tests first, watch them fail, then implement
- **systematic-debugging** - Apply scientific method instead of guesswork
- **verification-before-completion** - Verify with evidence, not assumptions

### Collaboration
- **brainstorming** - Generate options before committing to an approach
- **writing-plans** - Write plans for non-trivial work
- **executing-plans** - Follow plans, verify each step
- **requesting-code-review** - Set up reviewers for success
- **receiving-code-review** - Respond to feedback constructively

### Workflow
- **using-git-worktrees** - Work on multiple branches in parallel
- **finishing-a-development-branch** - Verify, clean up, merge cleanly
- **dispatching-parallel-agents** - Run independent tasks simultaneously
- **subagent-driven-development** - Decompose complex tasks for delegation

### Meta
- **writing-skills** - Create new skills for the library
- **using-superpowers** - How to use this skills library

## Installation

This plugin follows the standard Claude Code plugin structure. Skills are auto-discovered from the `skills/` directory.

```
superpowers-plugin/
├── .claude-plugin/
│   └── plugin.json
└── skills/
    ├── brainstorming/SKILL.md
    ├── dispatching-parallel-agents/SKILL.md
    ├── ... (14 skills total)
```

## Philosophy

The skills in this plugin emphasize:
- **Test-driven development** - Tests first, always
- **Systematic processes** - Method over ad-hoc decisions
- **Complexity reduction** - Simple is better than clever
- **Evidence-based verification** - Trust nothing, verify everything

## Credits

This plugin is adapted from [obra/superpowers](https://github.com/obra/superpowers) by **Jesse Vincent** (jesse@fsck.com).

The original superpowers framework is MIT licensed and works across multiple AI coding platforms including Claude Code, Cursor, GitHub Copilot CLI, and Gemini CLI.

For the complete, authoritative versions of these skills (with detailed examples, diagrams, and cross-references), visit the original repository: https://github.com/obra/superpowers

## License

MIT License - matching the upstream obra/superpowers project.

## Related Plugins

This repository also contains:
- `karpathy-skills-plugin/` - Andrej Karpathy's coding guidelines
