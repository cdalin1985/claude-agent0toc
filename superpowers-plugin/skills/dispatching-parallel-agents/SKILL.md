---
name: dispatching-parallel-agents
description: Use when work can be parallelized across multiple agents - dispatch independent tasks simultaneously
---

# Dispatching Parallel Agents

## Overview

Independent work runs faster in parallel. Spawn multiple agents when tasks don't depend on each other.

**Core principle:** Sequential work is the default; parallel is the optimization.

## When to Parallelize

### Good Candidates
- Independent research queries
- Searching different parts of codebase
- Running tests for different modules
- Investigating multiple hypotheses
- Generating variations of content

### Bad Candidates
- Sequential dependencies (A then B then C)
- Shared state modifications
- Tasks that need coordination
- Trivial tasks (overhead exceeds benefit)

## Dispatching Patterns

### Fan-Out, Fan-In
1. Identify independent subtasks
2. Dispatch all in parallel
3. Wait for all to complete
4. Synthesize results

### Map-Reduce
1. Split data across agents
2. Each agent processes its chunk
3. Aggregate results

### Speculative Execution
1. Try multiple approaches in parallel
2. Use whichever finishes first or best
3. Cancel/ignore the rest

## Coordination Tips

### Clear Boundaries
- Each agent has distinct scope
- Outputs don't overlap
- No shared mutable state

### Self-Contained Prompts
- Each agent gets full context it needs
- Don't reference shared conversation state
- Specify exact output format

### Result Synthesis
- Plan how to combine outputs
- Define merge conflicts upfront
- Validate combined result

## Common Pitfalls

- Parallelizing trivial work (overhead loss)
- Hidden dependencies between "independent" tasks
- Inconsistent results from non-deterministic agents
- Context fragmentation across agents
- Combining inconsistent outputs

## Example: Codebase Exploration

Sequential (slow):
```
1. Find auth code
2. Find user model
3. Find API routes
```

Parallel (fast):
```
Dispatch 3 agents simultaneously:
  Agent A: Find and analyze auth code
  Agent B: Find and analyze user model
  Agent C: Find and analyze API routes
Wait for all, synthesize findings
```

---
*Adapted from [obra/superpowers](https://github.com/obra/superpowers) by Jesse Vincent.*
