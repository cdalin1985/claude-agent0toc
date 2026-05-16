---
name: systematic-debugging
description: Use when investigating bugs, unexpected behavior, or failing tests - apply scientific method, not guesswork
---

# Systematic Debugging

## Overview

Debugging is hypothesis testing. Form a hypothesis, design an experiment to falsify it, run the experiment, learn from results.

**Core principle:** If you don't have evidence, you don't have a cause.

## The Scientific Method for Bugs

### 1. Reproduce
- Get a reliable reproduction first
- Smallest case that fails
- If intermittent, find the variable causing variation

### 2. Observe
- Read error messages carefully (all of them)
- Look at actual behavior vs. expected
- Gather facts before forming theories

### 3. Hypothesize
- What COULD cause this?
- Order hypotheses by probability and ease to test
- Stay open to "I don't know yet"

### 4. Experiment
- Design tests to FALSIFY hypothesis
- One variable at a time
- Predict outcome before running

### 5. Conclude
- Match prediction? Hypothesis supported (not "proven")
- Mismatch? Hypothesis wrong, try next
- Update mental model with what you learned

## Anti-Patterns to Avoid

| Anti-Pattern | Better |
|-------------|--------|
| Random changes hoping it works | Form hypothesis, test it |
| "It's probably X" without checking | Verify with evidence |
| Fix symptoms not causes | Find root cause |
| Skip reproduction step | Always reproduce first |
| Multiple changes at once | One variable at a time |

## When Stuck

- Take a break - fresh eyes help
- Explain the problem to someone (rubber duck)
- Question your assumptions
- Re-read the error message slowly
- Check if it's documented behavior

## Verification

Before declaring "fixed":
- [ ] Root cause identified (not symptom)
- [ ] Reproduction case now passes
- [ ] No new failures introduced
- [ ] Test added to prevent regression
- [ ] You can explain WHY the bug happened

---
*Adapted from [obra/superpowers](https://github.com/obra/superpowers) by Jesse Vincent.*
