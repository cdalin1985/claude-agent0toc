---
name: using-git-worktrees
description: Use when working on multiple branches simultaneously - isolate work without context switching
---

# Using Git Worktrees

## Overview

Worktrees let you check out multiple branches at once, each in its own directory. No more stashing or losing context.

**Core principle:** Each working state deserves its own directory.

## When to Use Worktrees

- Working on multiple features in parallel
- Reviewing PRs while developing
- Hotfixes during feature work
- Comparing branches side by side
- Long-running experiments

## Core Commands

### Create a Worktree
```bash
# New branch from current HEAD
git worktree add ../project-feature feature-branch

# Existing branch
git worktree add ../project-review existing-branch

# New branch from specific commit
git worktree add -b new-branch ../project-new origin/main
```

### List Worktrees
```bash
git worktree list
```

### Remove a Worktree
```bash
git worktree remove ../project-feature
# Or delete the directory then prune
git worktree prune
```

## Best Practices

### Naming Convention
- Sibling directories: `project/`, `project-feature/`, `project-hotfix/`
- Or under `.worktrees/`: `project/.worktrees/feature/`

### One Worktree Per Concern
- Don't mix concerns in one worktree
- Match worktree to mental context
- Easier to track what's where

### Cleanup
- Remove worktrees when done
- Prune stale references regularly
- Don't accumulate forgotten worktrees

## Common Workflows

### Hotfix While Developing
```bash
# Currently in feature branch, urgent fix needed
git worktree add ../project-hotfix -b hotfix main
cd ../project-hotfix
# Fix, commit, push, deploy
cd ../project  # Back to feature work
git worktree remove ../project-hotfix
```

### Code Review
```bash
git worktree add ../project-review pr-branch
cd ../project-review
# Test the PR locally
# Original work undisturbed in ../project
```

## Gotchas

- Each worktree has its own working files
- Submodules can be tricky across worktrees
- Some tools (IDE plugins) might not know about worktrees
- Don't try to checkout same branch in two worktrees

---
*Adapted from [obra/superpowers](https://github.com/obra/superpowers) by Jesse Vincent.*
