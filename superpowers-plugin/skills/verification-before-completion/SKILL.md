---
name: verification-before-completion
description: Use before declaring any task complete - verify with evidence, not assumptions
---

# Verification Before Completion

## Overview

"Done" requires evidence. Not "should work," not "looks right," not "compiles."

**Core principle:** Trust nothing. Verify everything.

## The Verification Mandate

Before saying "done":
1. Did you run it?
2. Did you see the expected behavior?
3. Did you check the edge cases?
4. Did you verify no regressions?

If any answer is "no" or "I think so" - you're not done.

## Verification Techniques

### Build Verification
- Code compiles? Doesn't mean it works.
- Run the actual scenario.
- Check the actual output.

### Test Verification
- All tests pass? Run them yourself.
- Don't trust cached results.
- Run with verbose output.

### Behavior Verification
- Use the feature end-to-end
- Test the golden path
- Test the error paths
- Test the edge cases

### Regression Verification
- Existing tests still pass
- Related features still work
- Performance hasn't degraded

## Common Failure Modes

| Failure | Reality Check |
|---------|---------------|
| "Should work" | Did you run it? |
| "Tests probably pass" | Run them. Now. |
| "Built successfully" | Compiling ≠ working |
| "Same as before" | Verify with actual test |
| "Quick fix" | Quick to break, hard to debug |

## Verification Checklist

Before marking complete:
- [ ] Code runs without errors
- [ ] Expected behavior verified empirically
- [ ] Edge cases tested
- [ ] Error paths tested
- [ ] Related features still work
- [ ] Tests added/updated for changes
- [ ] No console errors or warnings
- [ ] Performance acceptable

## UI/Frontend Specific

- Start dev server
- Open in browser
- Click through the feature
- Check console for errors
- Test responsive layout
- Test keyboard navigation

**Type checking ≠ feature checking. Tests ≠ user-facing checking.**

---
*Adapted from [obra/superpowers](https://github.com/obra/superpowers) by Jesse Vincent.*
