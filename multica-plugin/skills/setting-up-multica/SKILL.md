---
name: setting-up-multica
description: Use when beginning to work with multica - authenticate, start daemon, verify runtime
---

# Setting Up Multica

## Overview

Multica transforms individual agents into team members. Setup connects your machine as a Runtime that can receive and execute work assignments.

**Core principle:** Agents need a home environment to work from - that's the local daemon.

## What You're Setting Up

**Multica Platform:** Cloud dashboard for agent management, task tracking, and squad organization

**Local Daemon:** Process running on your machine that:
- Auto-detects available agent CLIs (Claude Code, Copilot, etc.)
- Receives task assignments
- Streams progress back to dashboard
- Acts as your "Runtime"

**Runtime:** Your machine configured as a compute environment in Multica

## Setup Process

### 1. Install Multica CLI
```bash
# Installation method depends on your system
# Check https://github.com/multica-ai/multica for latest
```

### 2. Authenticate
```bash
multica login
# Opens browser for authentication
# Saves credentials locally
```

### 3. Start the Daemon
```bash
multica daemon
# Runs continuously, listening for tasks
# Auto-detects agent CLIs on PATH
```

### 4. Verify Runtime Appears
- Open Multica dashboard
- Go to Settings → Runtimes
- Confirm your machine appears as "Active"
- Note which agent CLIs are auto-detected

### 5. You're Ready
- Daemon stays running
- Can now create agents and assign work

## Runtime Concept

A **Runtime** is:
- Your machine/environment
- Registered with Multica
- Reports available agent CLIs
- Executes assigned tasks

Each Runtime shows:
- Hostname/identifier
- Status (Active/Offline)
- Detected agents (Claude Code, Copilot, etc.)
- Recent task executions

## Supported Agent CLIs

Multica auto-detects:
- Claude Code
- Codex
- GitHub Copilot CLI
- OpenClaw
- OpenCode
- Hermes
- Gemini CLI
- Pi
- Cursor Agent
- Kimi
- Kiro CLI

**Note:** Agent must be installed and available on PATH for auto-detection.

## Troubleshooting

### Daemon Won't Start
- Verify agent CLIs are on PATH
- Check authentication credentials
- Review daemon logs

### Runtime Shows Offline
- Confirm daemon process is running
- Check network connectivity
- Restart daemon: `multica daemon`

### Agent CLI Not Detected
- Verify CLI is installed
- Test CLI is on PATH: `which <agent-cli>`
- Restart daemon

## What's Next

Once daemon is running and Runtime is verified:
1. Create your first agent (agent skills)
2. Assign it a task
3. Watch it execute autonomously

---
*Multica Documentation: https://github.com/multica-ai/multica*
