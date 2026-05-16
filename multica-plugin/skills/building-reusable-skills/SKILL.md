---
name: building-reusable-skills
description: Use when a problem is solved - document the solution as a reusable skill, compound team expertise
---

# Building Reusable Skills

## Overview

Every solved problem becomes institutional knowledge. Documenting solutions as reusable skills multiplies team capability over time.

**Core principle:** Each solution should make the next similar problem easier.

## What Are Skills?

In Multica, **Skills** are:
- Documented solutions to recurring problems
- Shareable across agents and squads
- Compound team expertise over time
- Examples: database migrations, deployment patterns, code review guidelines

## Types of Reusable Skills

### Code Patterns
```
Skill: "Database Migration Pattern"
- When to use: Adding schema changes
- How: Use migration tool X, follow naming Y
- Template: [migration example]
- Agents can reuse: Yes
```

### Deployment Procedures
```
Skill: "Hotfix Deployment"
- When to use: Urgent production fix
- Steps: [exact procedure]
- Rollback: [how to revert]
- Who approves: [decision maker]
```

### Code Review Guidelines
```
Skill: "Backend Review Checklist"
- Performance: Check queries are indexed
- Security: Validate input handling
- Testing: Require X% coverage
- Concurrency: Thread-safe?
```

### Architecture Decisions
```
Skill: "Caching Strategy"
- When cache: Expensive queries > 100ms
- What: Redis, 5-minute TTL
- Invalidation: Event-based
- Monitoring: Cache hit ratio
```

## Creating a Skill

### 1. Recognize the Pattern
- This problem keeps recurring
- Multiple agents solved it differently
- Could be standardized

### 2. Extract the Solution
- Get best version from team
- Document the approach
- Explain WHY (not just HOW)

### 3. Generalize It
- Make it work across similar contexts
- Add example code
- Include edge cases

### 4. Document Template
```
## Skill: [Name]

### When to Use
Circumstances requiring this skill

### Procedure
Step-by-step instructions

### Example
Real example from codebase

### Variations
Different contexts, how to adapt

### Anti-Patterns
What NOT to do

### References
Related skills, documentation
```

### 5. Share with Squad
- Teach the skill
- Agents learn to use it
- Refine based on feedback

## Examples of Reusable Skills

### Frontend Patterns
- "Form Validation Pattern"
- "Component Testing Pattern"
- "Responsive Design Approach"

### Backend Infrastructure
- "Service Authentication"
- "Database Connection Pooling"
- "Rate Limiting Implementation"

### DevOps
- "Container Build Process"
- "Log Aggregation Setup"
- "Monitoring Alert Configuration"

### Process
- "PR Review Checklist"
- "Bug Triage Process"
- "Release Checklist"

## Skill Compounding

### Day 1
- Agent solves problem X
- Time spent: 4 hours
- Nobody else knows how

### Day 2
- Another agent faces problem X
- Finds documented skill
- Time spent: 30 minutes
- Team learning multiplied

### Day 7
- Third agent uses skill twice
- Team is more expert
- Faster, more consistent

### After a Month
- 10+ agents using the skill
- Variations documented
- Process refined continuously
- Team operates at higher level

## Maintaining Skills

### Update When
- Better approach discovered
- Tool/library changes
- Edge case found
- Something breaks using old skill

### Deprecate When
- No longer best approach
- Tool no longer recommended
- Better skill supersedes it

### Measure Effectiveness
- How often is it used?
- Does it reduce problem-solving time?
- Do agents apply it correctly?
- What feedback do we get?

## Building Team Expertise

Skills drive team growth:

**Knowledge flows upward:**
- Agents solve problems
- Solutions become skills
- Entire team learns
- New agents inherit expertise

**New problems get easier:**
- Have skill? Use it.
- No skill? Create one
- Next agent to hit it solves faster
- Compound advantage

**Consistency improves:**
- Shared approach
- Same patterns everywhere
- Easier to maintain
- Fewer surprises

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|-------------|---------|-----|
| Ad-hoc solutions | Each agent does it differently | Document as skill |
| Hoarded knowledge | One agent knows, others reinvent | Share skills |
| Outdated skills | Following old approach | Keep skills current |
| Unused skills | Documented but not referenced | Promote reuse |

---
*Multica Documentation: https://github.com/multica-ai/multica*
