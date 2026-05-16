---
name: using-superpowers
description: Use when working with the superpowers skills library - understand how skills compose
---

# Using Superpowers

## Overview

Superpowers is a skills library that provides composable workflows for software development. Skills auto-trigger based on context.

**Core principle:** Skills are tools; the developer (or agent) is the craftsperson.

## Skill Categories

### Methodology
- `test-driven-development` - Write tests first
- `systematic-debugging` - Scientific method for bugs
- `verification-before-completion` - Verify with evidence

### Collaboration
- `brainstorming` - Generate options before deciding
- `writing-plans` - Plan before implementing
- `executing-plans` - Follow plans, verify steps
- `requesting-code-review` - Set up reviewers for success
- `receiving-code-review` - Respond to feedback constructively

### Workflow
- `using-git-worktrees` - Parallel branch work
- `finishing-a-development-branch` - Clean completion
- `dispatching-parallel-agents` - Parallelize independent work
- `subagent-driven-development` - Delegate focused tasks

### Meta
- `writing-skills` - Create new skills
- `using-superpowers` - This skill

## How Skills Compose

Skills often chain together:

```
brainstorming
  ↓ (decide approach)
writing-plans
  ↓ (have a plan)
test-driven-development
  ↓ (per feature)
executing-plans
  ↓ (work complete)
verification-before-completion
  ↓ (verified working)
requesting-code-review
  ↓ (review feedback)
receiving-code-review
  ↓ (changes addressed)
finishing-a-development-branch
```

## When Skills Activate

Skills trigger when:
- Task description matches skill description
- Code context suggests the skill applies
- Explicit invocation by name

Skills don't trigger when:
- Out of context
- Already in the middle of a different flow
- Trivial work that doesn't warrant the structure

## Skill Discipline

Skills are guardrails, not jail. Use judgment:
- Skip TDD for throwaway exploration? Maybe.
- Skip verification on a one-line typo fix? Probably.
- Skip planning on a feature implementation? No.

The skill's purpose is usually more important than its letter.

## Customizing Skills

Skills are starting points:
- Adapt to your codebase conventions
- Combine multiple skills for your workflow
- Write project-specific skills that supplement these

---
*Adapted from [obra/superpowers](https://github.com/obra/superpowers) by Jesse Vincent.*
