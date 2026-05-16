---
name: executing-plans
description: Use when implementing a written plan - follow the plan, verify each step
---

# Executing Plans

## Overview

A plan is only as good as its execution. Follow the steps. Verify as you go. Adjust when reality contradicts the plan.

**Core principle:** Plans guide work; reality decides outcomes.

## Execution Process

### 1. Read the Plan Fully First
- Understand the entire scope
- Note dependencies between steps
- Identify risky steps
- Estimate complexity

### 2. Execute One Step at a Time
- Don't combine steps
- Verify each step before moving on
- Commit small, working increments
- Document deviations

### 3. Verify as You Go
- Run tests after each change
- Check that intent is preserved
- Watch for unexpected behavior
- Update plan if assumptions broken

### 4. Handle Deviations
When reality differs from plan:
- Stop and assess
- Is the plan wrong, or is reality?
- Update plan or fix the issue
- Document what changed and why

## Verification Cadence

- After each file change: does it compile/parse?
- After each logical step: do tests pass?
- After each phase: does the feature work?
- Before declaring done: full verification

## Plan Drift Warning Signs

🚨 You're making changes not in the plan
🚨 Steps are taking much longer than expected
🚨 New unknown surfaces (security, performance)
🚨 Plan assumption proves false

When you see these: pause, reassess, update plan.

## Common Pitfalls

- Skipping steps because "obvious"
- Combining steps for "efficiency"
- Not verifying because "looks right"
- Pushing through when plan is wrong
- Not committing incrementally

## Final Verification

Before declaring complete:
- [ ] All plan steps executed
- [ ] All tests pass
- [ ] Feature works end-to-end
- [ ] Documentation updated
- [ ] Plan deviations documented

---
*Adapted from [obra/superpowers](https://github.com/obra/superpowers) by Jesse Vincent.*
