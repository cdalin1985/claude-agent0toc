---
name: agent-routing-and-runtimes
description: Use when scaling agent execution - understand runtimes, configure routing, manage distributed execution
---

# Agent Routing and Runtimes

## Overview

Multica routes work to agents across multiple machines (Runtimes). Smart routing ensures tasks reach the right agent in the right place.

**Core principle:** Work should find capable agents, regardless of where they run.

## Runtime Concept

A **Runtime** is:
- Your machine running the Multica daemon
- Registers with Multica cloud platform
- Reports available agent CLIs
- Executes assigned tasks locally
- Streams results back to platform

### Runtime Properties

```
Runtime: "desktop-macbook"
├─ Status: Active
├─ Hostname: Alex's MacBook Pro
├─ Last Seen: 2 minutes ago
├─ Available Agents:
│  ├─ Claude Code
│  ├─ GitHub Copilot CLI
│  └─ Cursor Agent
└─ Recent Tasks: 23
```

## Multi-Runtime Scenarios

### Single Developer
```
Your Machine (Runtime)
└─ Daemon running
└─ Agent executes work
└─ Results come back
```

### Team with Shared Resources
```
Backend Runtime (Linux Server)
├─ Claude Code
└─ Codex

Frontend Runtime (Developer Machine)
├─ Claude Code
└─ GitHub Copilot CLI

Backup Runtime (CI/CD Machine)
├─ OpenCode
└─ Hermes
```

## Agent Routing Rules

### Automatic Routing
Multica considers:
1. **Agent Availability** - Is agent installed on any Runtime?
2. **Runtime Status** - Is the Runtime active?
3. **Load** - How many tasks is Runtime handling?
4. **Specialty** - Does agent CLI specialize in the task type?

### Assignment Strategy

When you assign to an agent:
```
1. Find all Runtimes with this agent installed
2. Check which are active
3. Route to least-loaded Runtime
4. Task executes there, streams back
```

When you assign to a squad:
```
1. Squad leader decides which agent
2. Find Runtimes with that agent
3. Route accordingly
4. Leader monitors progress
```

## Configuring Runtimes

### Runtime Environment

Each Runtime can have:
- **Repository access** - Which repos it can clone
- **Tool permissions** - What CLIs can be run
- **Resource limits** - CPU/memory constraints
- **Isolation level** - Sandbox or full access

### Specialization

You might have:
- **General Runtime** - Can handle any task
- **GPU Runtime** - For ML/training tasks
- **Secure Runtime** - For sensitive data work
- **High-performance Runtime** - For big tasks

## Workflow: Task Routing

### Example: Assign to Claude Code Agent

```
Issue: "Add login endpoint"
Assign to: Claude Code Agent

Multica checks:
✓ Claude Code installed on 2 Runtimes
✓ Both are active
✓ Desktop Runtime has 2 tasks queued
✓ Server Runtime has 0 tasks queued

Decision: Route to Server Runtime
└─ Task executes there
└─ Results stream back to dashboard
```

### Example: Assign to Backend Squad

```
Issue: "Design caching layer"
Assign to: @BackendTeam

Squad leader (Claude) decides:
"This is API architecture. Route to API Agent"

Multica checks:
✓ API Agent runs on Backend Runtime
✓ Runtime is active

Decision: Backend Runtime gets the task
└─ API Agent executes
└─ Reports progress to leader
└─ Leader reports to dashboard
```

## Monitoring Runtime Health

### Dashboard View

Monitor per Runtime:
- **Status** - Active/Offline/Degraded
- **Tasks** - Current workload
- **Agents** - Available CLIs
- **Performance** - Recent execution times
- **Uptime** - How long active

### Maintaining Runtimes

Routine tasks:
- [ ] Keep daemon running
- [ ] Update agent CLIs
- [ ] Monitor disk space
- [ ] Check for connection issues
- [ ] Review recent tasks

## Scaling Patterns

### Start Small
```
Single machine, single daemon
Local task execution
```

### Add Capacity
```
Second machine (second Runtime)
Same daemon setup
Work distributes automatically
```

### Specialize
```
General Runtime (any tasks)
Backend Runtime (database, API tasks)
Frontend Runtime (UI tasks)

Routing automatically chooses best fit
```

## Troubleshooting Routing

| Issue | Causes | Fix |
|-------|--------|-----|
| Task sits unassigned | No Runtime has agent | Install agent CLI |
| Task slow to start | Runtime overloaded | Check Runtime load |
| Always routes to same Runtime | Only one active | Activate more Runtimes |
| Agent not detected | Not on PATH | Reinstall, restart daemon |

## Best Practices

✓ Keep multiple Runtimes active for redundancy
✓ Specialize Runtimes by purpose (frontend/backend)
✓ Monitor Runtime health regularly
✓ Distribute load across Runtimes
✓ Update agent CLIs as new versions release

---
*Multica Documentation: https://github.com/multica-ai/multica*
