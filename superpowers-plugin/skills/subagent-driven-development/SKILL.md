---
name: subagent-driven-development
description: Use when a complex task benefits from delegation - decompose into subagent assignments
---

# Subagent-Driven Development

## Overview

Decompose complex tasks into subagent assignments. Each subagent handles a focused piece with full autonomy in its scope.

**Core principle:** Parent agents orchestrate; subagents execute focused work.

## When to Use Subagents

### Good Fits
- Research that would clutter main context
- Independent implementation pieces
- Code review of specific changes
- Testing different scenarios
- Exploring alternative approaches

### Poor Fits
- Work that requires constant back-and-forth
- Tasks needing shared mutable state
- Trivial single-step actions
- Work that's already in main context

## Subagent Briefing Pattern

A good subagent prompt is self-contained:

```
[Goal Statement]
What you're trying to accomplish overall.

[Specific Task]
What this subagent specifically does.

[Context]
- Relevant files: path/to/x.ts, path/to/y.ts
- Known constraints: [list]
- What's been ruled out: [list]

[Expected Output]
Format and content of what to return.

[Length Hint]
"Report in under 200 words" or similar.
```

## Coordination Patterns

### Two-Stage Review
1. Subagent A implements
2. Subagent B reviews independently
3. Parent reconciles feedback

### Specialized Agents
- Research agent → information gathering
- Implementation agent → code writing
- Review agent → quality check
- Testing agent → verification

### Hierarchical
- Top agent: orchestration
- Mid agents: subsystem work
- Leaf agents: specific tasks

## Verifying Subagent Work

**Trust but verify:** Subagent summaries describe intent, not necessarily actuality.

- Read the actual code changes
- Run the actual tests
- Verify claimed behavior
- Don't trust "all tests pass" blindly

## Anti-Patterns

- Vague briefings ("just figure it out")
- Subagents for tasks needing context the parent has
- Not verifying subagent work
- Subagent dispatch as procrastination
- Over-decomposing trivial tasks

## When Subagents Add Value

✓ Reduces parent context bloat
✓ Parallelizes truly independent work  
✓ Brings specialized focus to a piece
✓ Independent perspective on a problem

✗ Just to "delegate" responsibility
✗ When you don't know what you want

---
*Adapted from [obra/superpowers](https://github.com/obra/superpowers) by Jesse Vincent.*
