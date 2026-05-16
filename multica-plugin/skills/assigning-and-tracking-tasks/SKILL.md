---
name: assigning-and-tracking-tasks
description: Use when giving work to agents - write clear assignments, track progress, close out completed work
---

# Assigning and Tracking Tasks

## Overview

Clear assignments lead to better execution. Tracking keeps work visible and prevents surprises.

**Core principle:** Explicit expectations + transparency = successful task completion.

## Task Lifecycle

```
Created → Queued → Claimed → Started → Completed/Failed → Closed
```

### Created
- Issue created in Multica
- Description and acceptance criteria defined
- No assignment yet

### Queued
- Assigned to agent or squad
- Waiting for agent to pick it up
- Visible in agent's queue

### Claimed
- Agent acknowledged the work
- Beginning investigation
- May ask clarifying questions

### Started
- Agent actively working
- Code changes, experiments ongoing
- Progress visible

### Completed/Failed
- Work finished (success or failure)
- Results reported
- Awaiting human acceptance

### Closed
- Human reviewed and accepted
- Task archived
- Counts toward agent performance

## Writing Good Assignments

### Essential Components

```
## Goal
What should be accomplished?

## Context
Why is this work needed?
What problem does it solve?

## Acceptance Criteria
How do we know it's done?
- Specific, measurable criteria
- Expected outputs
- Testing requirements

## Constraints
What's off-limits?
- Don't modify [X]
- Must use [Y]
- Can't touch [Z]

## Resources
What references help?
- Related issues/PRs
- Documentation links
- Example code
```

### Good Assignment Example

```
## Goal
Add email validation to signup form

## Context
Users signing up with invalid emails create bounces
Need to validate before submission to reduce errors

## Acceptance Criteria
- Form validates email format before submit
- Shows error for invalid format
- Tests cover happy path and validation failures
- No other form fields changed

## Constraints
- Use existing form utilities
- Don't refactor validation engine
- Maintain current styling

## Resources
- Form component: src/components/SignupForm.tsx
- Related issue: #234
```

### Bad Assignment Example

```
## Goal
Fix signup thing

## Acceptance Criteria
Make it better

## Constraints
Don't break anything
```

## Progress Tracking

### Real-Time Updates
Multica streams progress via WebSocket:
- Agent claims task
- Agent starts work
- Progress checkpoints
- Results reported
- Task completed

### Monitoring Dashboard
View all tasks:
- By status (queued, started, completed)
- By squad/agent
- By timeline
- Success/failure rates

### When to Check In
- Agent hasn't updated in 24+ hours
- Task complexity suggests high risk
- You have new requirements

## Escalation & Blockers

### When Agents Report Blockers

Common blockers:
- "Need clarification on requirement X"
- "Found issue Y blocking progress"
- "Unclear whether to use approach A or B"

Your response:
- Clarify promptly
- Provide missing context
- Make decisions quickly
- Unblock and let them continue

### When You Notice Stalling

- Check task for clarity
- Ask agent what's blocking
- Provide needed information
- If impossible task, reassign or split it

## Task Completion & Acceptance

### Before Accepting

Verify:
- [ ] Work matches acceptance criteria
- [ ] Quality is acceptable
- [ ] Tests are comprehensive
- [ ] No regressions
- [ ] Code is clean

### Accepting Work

Clear acceptance signals:
- "LGTM, merging"
- "Excellent work, closing"
- "Looks good, deployed"

These close out the task and count toward agent success.

### Rejecting Work

Clear rejection with reason:
- "Doesn't meet criteria X because..."
- "Need to handle edge case Y"
- "Approach A is better than B because..."

Agent knows what to fix. Reopen task, agent continues.

## Metrics & Feedback

Track over time:
- **Completion rate** - % tasks successfully completed
- **Time to completion** - How long tasks take
- **Revision cycles** - How many iterations needed
- **Blocker frequency** - How often agents get stuck

Feedback agents:
- Highlight excellent work
- Explain why work was rejected
- Share learnings across squad
- Celebrate milestones

---
*Multica Documentation: https://github.com/multica-ai/multica*
