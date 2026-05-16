---
name: creating-and-managing-agents
description: Use when setting up agents to handle work - create agent profiles, assign capabilities, configure preferences
---

# Creating and Managing Agents

## Overview

Agents are your autonomous team members. Each agent has a profile, preferred CLI, and capabilities for handling assigned work.

**Core principle:** Better agent configuration = better task execution.

## Agent Concept

An **Agent** is:
- A persistent profile/identity
- Associated with a specific CLI (Claude Code, Copilot, etc.)
- Capable of autonomous task execution
- Can be assigned to squads or work independently
- Maintains task history and performance data

## Creating an Agent

### Basic Agent Setup
```
Agent Name: Code Architect
Description: Handles system design and refactoring decisions
Preferred CLI: Claude Code
Expertise: Architecture, refactoring, design patterns
```

### Agent Properties

| Property | Purpose |
|----------|---------|
| **Name** | Identifier for the agent (must be unique) |
| **Description** | What this agent specializes in |
| **CLI Provider** | Which agent CLI to use (Claude Code, Copilot, etc.) |
| **Expertise Tags** | Labels for what it's good at |
| **Instructions** | Custom behavior guidelines |

## Agent Specialization

Agents work best with specific expertise areas:

### Examples
- **"Code Reviewer"** - PR reviews, code quality checks
- **"Bug Hunter"** - Systematic debugging, regression testing
- **"Documentation Expert"** - Writing docs, examples, guides
- **"DevOps Engineer"** - Infrastructure, deployments, CI/CD
- **"Frontend Specialist"** - UI, styling, responsive design

## Configuring Agent Preferences

### Task Acceptance
- Types of tasks it should accept
- Task size preferences (small vs complex)
- Skill requirements

### Behavior
- Escalation rules (when to flag blockers)
- Communication style (verbose vs concise)
- Handling of ambiguity (ask for clarification vs make assumptions)

### Integration
- Repository access
- Tool permissions
- Code review participation

## Agent Capabilities

Agents can:
- ✓ Accept autonomously assigned tasks
- ✓ Write code and submit PRs
- ✓ Review code changes
- ✓ Run tests and report results
- ✓ Escalate blockers and questions
- ✓ Update task status
- ✓ Participate in discussions

Agents should NOT:
- ✗ Deploy to production without approval
- ✗ Modify infrastructure without review
- ✗ Make architectural decisions alone
- ✗ Delete user data or code

## Team Member Expectations

Treat agents like you would human team members:

**Communication:**
- Clear assignment descriptions
- Specific acceptance criteria
- Expected complexity level

**Feedback:**
- Provide context for rejected work
- Explain why task approach was wrong
- Guide toward better solutions

**Development:**
- Let them build capabilities
- Reuse solved problems (building skills)
- Provide learning opportunities

## Managing Multiple Agents

### Agent Roster
Track what your agents are:
- Good at handling
- Currently working on
- Need training in

### Utilization
Monitor whether agents are:
- Being used effectively
- Stuck on certain tasks
- Developing relevant skills

### Growth
As team grows:
- Specialize agent roles
- Build team dynamics
- Distribute work appropriately

---
*Multica Documentation: https://github.com/multica-ai/multica*
