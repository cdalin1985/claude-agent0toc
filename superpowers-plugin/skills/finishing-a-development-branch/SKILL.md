---
name: finishing-a-development-branch
description: Use when wrapping up a feature branch - verify, clean up, merge cleanly
---

# Finishing a Development Branch

## Overview

A branch isn't done when the code works. It's done when it's verified, clean, and ready to merge.

**Core principle:** Leave the branch better than you found it.

## Pre-Completion Checklist

### Functional Verification
- [ ] Feature works end-to-end
- [ ] All tests pass
- [ ] Manual testing complete
- [ ] Edge cases handled
- [ ] Error paths tested

### Code Quality
- [ ] No commented-out code
- [ ] No debug logging left in
- [ ] No TODOs that should be done
- [ ] Variable/function names clear
- [ ] Comments explain WHY, not WHAT

### Repository Hygiene
- [ ] Commits are logical units
- [ ] Commit messages are clear
- [ ] No "WIP" or "fixup" commits
- [ ] Branch is up to date with base
- [ ] No merge commits (rebase preferred)

### Documentation
- [ ] README updated if needed
- [ ] API docs updated
- [ ] Breaking changes documented
- [ ] Migration notes if applicable

## Cleanup Process

### 1. Rebase on Base Branch
```bash
git fetch origin main
git rebase origin/main
# Resolve any conflicts
```

### 2. Squash/Clean History
```bash
git rebase -i origin/main
# Mark commits as squash/fixup as needed
```

### 3. Verify Tests Still Pass
After cleanup, run full test suite again.

### 4. Self-Review the Diff
```bash
git diff origin/main..HEAD
```
Read it like a reviewer would. Catch issues now.

## Merge Strategy

### Squash Merge
- Single commit on main
- Good for feature branches
- Clean history

### Rebase Merge  
- Preserves individual commits
- Good when commits tell a story
- More history detail

### Merge Commit
- Preserves branch structure
- Good for long-lived branches
- More complex history

## Post-Merge

- [ ] Delete the merged branch
- [ ] Update any tracking issues
- [ ] Verify deployment if auto-deployed
- [ ] Move on to next work

## Common Failure Modes

- "I'll clean it up later" - now is later
- Massive PR that's hard to review
- Untested edge cases left
- Stale branch with conflicts
- Commits like "fix" or "wip"

---
*Adapted from [obra/superpowers](https://github.com/obra/superpowers) by Jesse Vincent.*
