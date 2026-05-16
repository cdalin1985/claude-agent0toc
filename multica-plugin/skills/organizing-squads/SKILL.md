---
name: organizing-squads
description: Use when scaling agent teams - group agents under leaders, distribute work efficiently, organize by function
---

# Organizing Squads

## Overview

Squads are stable groupings of agents (and humans) under a leader. As your agent team grows, squads prevent bottlenecks and enable intelligent work distribution.

**Core principle:** Teams work better with clear organization and delegation.

## Squad Concept

A **Squad** is:
- Group of agents + humans under a leader
- Receives work as a unit
- Leader delegates internally
- Stable over time (unlike temporary projects)
- Has shared accountability

## Why Squads?

### Without Squads
```
Assign to: Claude Code Agent
  └─ Handles ALL tasks
  └─ Bottleneck
  └─ Can't specialize
```

### With Squads
```
Assign to: @BackendTeam
  ├─ Backend Leader (Claude)
  │   ├─ Database Agent
  │   ├─ API Agent
  │   └─ DevOps Agent
  └─ Works intelligently together
```

## Squad Structure

### Components

| Role | Purpose |
|------|---------|
| **Leader** | Decides task distribution, escalates blockers |
| **Members** | Handle assigned work, report status |
| **Humans** | Provide guidance, make decisions, review |

### Leader Responsibilities
- Receive squad-level assignments
- Delegate work to appropriate members
- Handle inter-squad coordination
- Escalate blockers to humans
- Manage squad performance

## Organizing by Function

Typical squad structures:

### Frontend Squad
- **Leader:** Frontend Lead (Claude Code)
- **Members:** UI Specialist, Styling Expert, Performance Agent
- **Handles:** Layout, components, styling, performance

### Backend Squad
- **Leader:** Backend Lead (Claude Code)
- **Members:** API Agent, Database Agent, Service Agent
- **Handles:** APIs, database design, services

### DevOps Squad
- **Leader:** Infrastructure Agent
- **Members:** CI/CD Agent, Deployment Agent
- **Handles:** Infrastructure, pipelines, deployments

### QA Squad
- **Leader:** QA Lead
- **Members:** Testing Agent, Bug Hunter, Regression Tester
- **Handles:** Testing, QA automation, bug verification

## Squad Workflows

### Task Assignment

1. **Create issue** describing work needed
2. **Assign to squad** (e.g., `@BackendTeam`)
3. **Leader analyzes** - needs API work or database work?
4. **Delegates internally** - assigns to appropriate member
5. **Members execute** - handle their part independently
6. **Report back** - leader aggregates status

### Work Distribution

**Leader criteria for task routing:**
- Agent expertise match
- Current workload
- Task complexity vs agent capability
- Learning opportunities

## Growing Teams

### Stage 1: Individual Agents
- 1-3 agents total
- Direct task assignment
- No squads needed yet

### Stage 2: Specialized Agents
- 4-10 agents
- Group by expertise
- Form first squads
- Assign squads for complex work

### Stage 3: Multi-Squad Organization
- 10+ agents
- Multiple specialized squads
- Inter-squad coordination
- Squad performance tracking

## Squad Leadership

### Choosing Leaders

Good squad leaders:
- ✓ Understand squad's domain deeply
- ✓ Can assess task complexity
- ✓ Make reasonable delegation decisions
- ✓ Escalate appropriately
- ✓ Communicate clearly

Leaders can be:
- Agent (fully autonomous)
- Agent + Human pair (human makes final calls)
- Human with agent support

### Leader Tasks

- Review assignments
- Match task to right agent
- Monitor progress
- Report blockers
- Celebrate wins

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|-------------|---------|-----|
| Too many squads | Overhead, coordination hell | Keep squads focused |
| Ambiguous assignment | Agents unclear on work | Write detailed descriptions |
| No delegation | Leader does all work | Trust agents to specialize |
| Silent failures | Leader doesn't escalate | Clear escalation rules |

## Measurement & Iteration

Track over time:
- Squad throughput
- Task success rate
- Common blockers
- Agent satisfaction
- Team velocity

Adjust:
- Squad composition
- Leader effectiveness
- Workflow patterns
- Specialization

---
*Multica Documentation: https://github.com/multica-ai/multica*
