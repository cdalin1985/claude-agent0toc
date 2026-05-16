---
name: writing-plans
description: Use when planning non-trivial work - write the plan before implementing
---

# Writing Plans

## Overview

Plans force clarity. Writing reveals gaps in understanding before code does.

**Core principle:** A plan you can't write down isn't a plan - it's wishful thinking.

## What Makes a Good Plan

### Context Section
- Why this work is needed
- What problem it solves
- What prompted it
- Intended outcome

### Concrete Steps
- Specific files to change
- Specific functions to add/modify
- Order of operations
- Dependencies between steps

### Verification
- How to test it works
- What success looks like
- How to roll back if needed

## Plan Structure

```markdown
# Plan: [Brief Title]

## Context
[Why this work matters]

## Requirements
[What must be true when done]

## Implementation Steps
1. [Concrete step with file paths]
2. [Concrete step with file paths]
3. ...

## Files to Modify
- path/to/file.ts - [what changes]
- path/to/other.ts - [what changes]

## Verification
[How to confirm it works end-to-end]
```

## When to Write a Plan

**Always:**
- Multi-file changes
- Architectural decisions
- New features
- Migrations or refactors

**Sometimes (use judgment):**
- Single-file bug fixes
- Small improvements

**Skip:**
- Typo fixes
- Single-line changes
- Trivial renames

## Plan Quality Indicators

✓ Could a colleague execute it without asking questions?
✓ Are file paths specific?
✓ Are steps in correct order?
✓ Is verification testable?
✓ Are trade-offs documented?

## Anti-Patterns

- Plans full of "etc." and "and so on"
- "First, make it work" with no specifics
- No verification criteria
- No mention of risks or unknowns
- Plans that ignore existing patterns

---
*Adapted from [obra/superpowers](https://github.com/obra/superpowers) by Jesse Vincent.*
