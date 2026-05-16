# Multica Integration Guide

This guide explains how to integrate Multica with Claude Code and your development workflow.

## What Happens When You Use Multica

### Traditional Workflow
```
You → Claude Code Agent → Task → You review result
       (one interaction)
```

### Multica Workflow
```
You → Create Issue → Assign to Agent → 
Agent (autonomous) → Claims work → Executes → Reports result →
You review → Accept/Reject → Close task
       (persistent collaboration)
```

## Key Differences

| Aspect | Without Multica | With Multica |
|--------|-----------------|-------------|
| **Persistence** | One-off interactions | Persistent agent identity |
| **Autonomy** | Requires ongoing prompting | Agent picks up and executes |
| **Tracking** | Manual status updates | Real-time visibility |
| **Team** | Single agent | Multiple agents in squads |
| **Scaling** | "Prompt more agents manually" | Organize into squads |

## Installation & Setup

### Prerequisites
- Claude Code CLI installed
- Git repository
- Multica account

### Step 1: Install Multica
```bash
# Follow official installation
# https://github.com/multica-ai/multica
```

### Step 2: Start Daemon
```bash
multica daemon
# Runs continuously in background
```

### Step 3: Create Agent in Dashboard
- Open Multica dashboard
- Create new agent
- Select "Claude Code" as CLI
- Configure expertise/preferences

### Step 4: Verify Runtime
- Check Settings → Runtimes
- Confirm your machine shows as Active
- Verify Claude Code is detected

## Usage Patterns

### Pattern 1: Individual Agent Task

```
1. Create issue: "Fix login timeout bug"
2. Assign to: Claude Code Agent
3. Agent:
   - Claims task
   - Investigates bug
   - Writes fix
   - Adds tests
   - Reports: "PR #123 ready for review"
4. You:
   - Review PR
   - Accept/request changes
   - Merge
   - Close task
```

### Pattern 2: Squad-Based Work

```
1. Create issue: "Redesign API authentication"
2. Assign to: @BackendTeam
3. Squad leader (Claude):
   - Routes to API Specialist agent
   - API Agent implements
   - Reports back
4. Leader synthesizes:
   - "API done, database changes needed"
   - Assigns to Database Agent
   - Database Agent executes
5. All work coordinated by leader
6. You: Review final result
```

### Pattern 3: Parallel Execution

```
1. Create issues: [frontend task], [backend task], [infra task]
2. Assign each to different squad
3. All execute simultaneously
4. Real-time dashboard shows progress
5. Close out as each completes
```

## Integration Points

### GitHub Issues Integration
- Create issues in GitHub
- Link to Multica in issue description
- Multica can track and reference

### Code Review Integration
- Agent creates PR
- You review in GitHub
- Feedback updates Multica task
- Agent revises or closes

### Workspace Tools
- Slack integration (optional): Get task updates
- Email: Task assigned, task complete notifications

## Typical Day with Multica

### Morning: Plan Work
```
Create issues for day's work:
- Bug fixes
- Features
- Refactoring

Assign to agents/squads
```

### During Day: Monitor Progress
```
Dashboard shows:
- Which tasks are running
- Which agents are working
- What's completed
- What's blocked
```

### When Blocker Occurs
```
Agent reports: "Need clarification on requirement X"
You: Provide answer in task comments
Agent: Unblocks, continues
```

### End of Day: Review & Accept
```
Check completed tasks
Review code/results
Accept or request changes
Close out finished work
```

## Configuration Options

### Agent Preferences
Configure per agent:
- Task complexity level (small, medium, large)
- Required expertise level
- Allowed tool access
- Communication style

### Squad Configuration
- Leadership structure
- Member assignments
- Specialization areas
- Decision-making rules

### Runtime Configuration
- Available tooling
- Resource limits
- Repository access
- Isolation/sandboxing

## Best Practices

### Writing Assignments
✓ Specific requirements
✓ Clear acceptance criteria
✓ Examples/references
✓ Related context

✗ "Make it work"
✗ Vague success criteria
✗ Too much context

### Managing Agents
✓ Use their expertise
✓ Escalate decisions, not problems
✓ Provide feedback
✓ Build their skills

✗ Micromanage
✗ Ignore performance
✗ Waste capability
✗ Leave them confused

### Scaling Teams
✓ Start with 1-2 agents
✓ Add specialists as needed
✓ Form squads around function
✓ Establish clear delegation

✗ Create too many roles
✗ Overload single agent
✗ Unclear leadership
✗ Chaos organization

## Troubleshooting

### Task Sits Unassigned
- [ ] Check agent is available on a Runtime
- [ ] Confirm Runtime is active
- [ ] Review assignment for clarity
- [ ] Re-assign if needed

### Agent Takes Too Long
- [ ] Check for reported blockers
- [ ] Provide missing context
- [ ] Consider task complexity vs. agent skill
- [ ] Break into smaller pieces if needed

### Connection Issues
- [ ] Verify daemon is running
- [ ] Check network connectivity
- [ ] Review daemon logs
- [ ] Restart daemon if needed

## Monitoring Agent Performance

Track metrics:
- **Completion rate** - % successful tasks
- **Time to completion** - How long tasks take
- **Code quality** - Review feedback
- **Collaboration** - Teamwork effectiveness

Use insights to:
- Improve assignments
- Develop agent capabilities
- Adjust squad composition
- Refine processes

## Next Steps

1. Read **setting-up-multica** skill
2. Create your first agent
3. Assign a simple task
4. Monitor execution
5. Expand team as confidence grows

---

For complete Multica documentation, visit: https://github.com/multica-ai/multica
