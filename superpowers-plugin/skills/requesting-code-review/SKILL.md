---
name: requesting-code-review
description: Use when asking for code review - set up reviewers for success with context and focus
---

# Requesting Code Review

## Overview

Help your reviewer help you. Provide context, focus areas, and clear expectations.

**Core principle:** A reviewer's time is valuable; respect it with preparation.

## What to Include

### Context
- What problem this solves
- Why this approach was chosen
- Key trade-offs made
- Related issues or discussions

### Focus Areas
- What you want them to look at carefully
- What you've already verified
- Specific concerns or uncertainties
- Risk areas needing extra scrutiny

### What's NOT in Scope
- Out-of-scope improvements
- Known issues being deferred
- Stylistic preferences (use existing patterns)

## Good Review Request Format

```markdown
## Summary
Brief description of what changed and why.

## Changes
- Concrete change 1
- Concrete change 2
- Concrete change 3

## Focus Areas
- Please pay extra attention to [X]
- I'm unsure about [Y]
- Performance impact on [Z]

## Already Verified
- [ ] Tests added/updated
- [ ] Manual testing of happy path
- [ ] Manual testing of edge cases
- [ ] No regressions in existing features

## Test Plan
How to verify locally:
1. Step
2. Step
3. Expected outcome
```

## Pre-Review Checklist

Before asking for review:
- [ ] All tests pass
- [ ] No lint/format errors
- [ ] Self-review completed
- [ ] Description explains WHY
- [ ] PR scope is focused (not "and also X")
- [ ] Sensitive info not committed
- [ ] Branch is up to date

## Anti-Patterns

- Massive PRs ("just look at it")
- "Should be straightforward"
- No context, no description
- Mixed concerns (refactor + feature + fix)
- No tests with the change

---
*Adapted from [obra/superpowers](https://github.com/obra/superpowers) by Jesse Vincent.*
