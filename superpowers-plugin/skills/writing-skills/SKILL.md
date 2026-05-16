---
name: writing-skills
description: Use when creating new skills for the skills library - write effective, reusable skill definitions
---

# Writing Skills

## Overview

A skill is a focused, reusable piece of guidance that triggers in the right context. Good skills feel like having an expert co-pilot.

**Core principle:** Skills should be specific enough to be actionable, general enough to be reusable.

## Skill Anatomy

```markdown
---
name: skill-name-in-kebab-case
description: Use when [trigger condition] - [what it provides]
---

# Skill Title

## Overview
Single sentence: what this is and core principle.

## When to Use
Specific triggers - both positive and negative.

## Process / Patterns
Concrete techniques, ordered by importance.

## Anti-Patterns
What to avoid, with reasoning.

## Verification
How to know the skill was applied correctly.
```

## Writing Good Descriptions

The description is critical - it determines when the skill activates:

**Good:** "Use when investigating bugs or unexpected behavior - apply scientific method, not guesswork"

**Bad:** "For debugging"

The good version:
- Has clear trigger ("investigating bugs")
- Communicates approach ("scientific method")
- Distinguishes from alternatives ("not guesswork")

## Skill Quality Indicators

### Specificity
- Concrete examples, not abstract principles
- Code samples where helpful
- Clear decision frameworks

### Actionability
- Reader knows what to do next
- Steps are followable
- Verification is testable

### Reusability
- Not tied to specific project
- Patterns generalize
- Examples illustrate, not constrain

## Skill Structure Patterns

### Process Skills
For workflows: brainstorming, code review, debugging
- Define stages clearly
- Describe inputs/outputs
- Provide examples

### Principle Skills
For mindsets: TDD, verification
- State the iron law
- Show consequences of violations
- Address rationalizations

### Reference Skills
For lookups: git commands, patterns
- Organize for scanning
- Use tables
- Include examples

## Anti-Patterns

- Too vague to be actionable
- Too specific (only applies to one situation)
- Repeating obvious things
- Missing "when NOT to use"
- No examples
- Stale references

## Iteration

Skills improve with use:
1. Write initial version
2. Apply it in real work
3. Notice gaps and frictions
4. Refine the skill
5. Repeat

---
*Adapted from [obra/superpowers](https://github.com/obra/superpowers) by Jesse Vincent.*
