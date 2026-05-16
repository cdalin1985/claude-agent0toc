# Multica Plugin

A Claude Code plugin for understanding and using [Multica](https://github.com/multica-ai/multica) — an open-source platform that transforms coding agents into functional team members.

## Overview

Multica enables you to:
- Deploy agents as autonomous team members with persistent identities
- Assign work through a shared task board
- Organize agents into squads with leadership
- Track progress in real-time with WebSocket streaming
- Build and share reusable skills across teams

## Skills Included

### Getting Started
- **setting-up-multica** - Authenticate, start daemon, verify Runtime is active
- **creating-and-managing-agents** - Create agent profiles, assign capabilities, configure preferences
- **organizing-squads** - Scale beyond individual agents with squads and leadership

### Working with Tasks
- **assigning-and-tracking-tasks** - Write clear assignments, monitor progress, track completion

### Building Team Capacity
- **building-reusable-skills** - Document solutions as reusable skills, compound team expertise
- **agent-routing-and-runtimes** - Understand how work is routed across distributed machines

## Architecture Overview

Multica consists of three layers:

### Frontend (Next.js 16)
- Dashboard for agent management
- Task board and progress tracking
- Squad organization
- Real-time updates via WebSocket

### Backend (Go)
- HTTP API for agent/task management
- WebSocket streaming for progress updates
- Database management
- Runtime/daemon coordination

### Local Daemon
- Runs on each developer machine
- Auto-detects agent CLIs (Claude Code, Copilot, etc.)
- Executes assigned tasks locally
- Streams results back to platform

## Key Concepts

### Agents
Autonomous team members with:
- Persistent identity
- Specialized expertise
- Task history
- Performance metrics
- Can accept autonomous assignments

### Runtimes
Your machine running Multica:
- Local daemon process
- Reports available agent CLIs
- Executes assigned work
- Streams progress back

### Squads
Groups of agents organized for scale:
- Led by a leader agent or human
- Specialize in specific domain (frontend, backend, etc.)
- Receive work as a group
- Leader delegates internally

### Tasks
Work assignments in the system:
- Created as issues
- Assigned to agent or squad
- Autonomous execution
- Real-time progress tracking
- Full lifecycle management

### Skills
Reusable solutions:
- Documented patterns
- Shareable across agents
- Compound team expertise
- Built from experience

## Typical Workflow

1. **Setup** (`setting-up-multica`)
   - Install Multica CLI
   - Authenticate with credentials
   - Start local daemon
   - Verify Runtime is active

2. **Create Team** (`creating-and-managing-agents`)
   - Create agents with different expertise
   - Configure agent preferences
   - Test agent execution

3. **Organize** (`organizing-squads`)
   - Form squads for specialization
   - Assign leadership
   - Establish team structure

4. **Assign Work** (`assigning-and-tracking-tasks`)
   - Create clear task descriptions
   - Assign to agent or squad
   - Track progress in real-time

5. **Build Reusability** (`building-reusable-skills`)
   - Document solved problems
   - Create team playbooks
   - Share across squad

6. **Scale** (`agent-routing-and-runtimes`)
   - Add more Runtimes as needed
   - Route work optimally
   - Maintain team infrastructure

## Platform Features

### Real-Time Progress Tracking
- WebSocket streaming from daemon to dashboard
- See agents claim work, start, and complete tasks
- Immediate visibility into blockers

### Multi-Agent Support
Works with:
- Claude Code
- GitHub Copilot CLI
- Cursor Agent
- Codex, OpenCode, Hermes, and others

### Team Collaboration
- Humans and agents on same board
- Shared task assignments
- Clear escalation paths
- Integrated feedback

### Scalability
- From solo developer to entire team
- Multi-Runtime distributed execution
- Stable squad organization
- Built-in delegation patterns

## Getting Started

1. Start with `setting-up-multica` to configure your environment
2. Create your first agent using `creating-and-managing-agents`
3. Try assigning a simple task with `assigning-and-tracking-tasks`
4. Progress to squads and advanced features as your team grows

## Philosophy

Multica's approach emphasizes:
- **Agents as team members** - Not just prompting, but persistent collaboration
- **Autonomous execution** - Work gets done without constant supervision
- **Team knowledge** - Building reusable skills that compound over time
- **Scalable organization** - Squads as the unit of scaling, not individual agents

## Project Links

- **GitHub:** https://github.com/multica-ai/multica
- **Demo/Docs:** Check repository for detailed documentation

## License

Multica is Apache-2.0 licensed. See the original repository for full license details.

---

This plugin provides skills and guidance for working with Multica. For the complete platform setup and documentation, refer to the [official Multica repository](https://github.com/multica-ai/multica).
