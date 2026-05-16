---
name: Agent Development Practices
description: Best practices for developing AI agents and multi-agent systems that are reliable, maintainable, and effective
version: 1.0.0
---

# Agent Development Practices

Use this skill when developing AI agents, orchestrating multi-agent workflows, or building systems that use language models as decision-making components.

## Core Agent Development Principles

### 1. Determinism & Reproducibility
- Minimize randomness in agent behavior
- Log all inputs, outputs, and decision points
- Use fixed seeds for reproducible testing
- Track which model versions were used

### 2. Clear System Prompts
- Define agent purpose, constraints, and capabilities explicitly
- Specify exact output format requirements
- Provide concrete examples of expected behavior
- Update system prompts carefully and test thoroughly

### 3. Structured Tool Definitions
- Define tool interfaces clearly and specifically
- Provide accurate descriptions of tool parameters
- Include examples of proper tool usage
- Document failure modes and limitations

### 4. Error Handling & Graceful Degradation
- Plan for tool failures and API errors
- Implement retries with exponential backoff
- Have fallback behaviors for critical failures
- Log errors comprehensively for debugging

### 5. Monitoring & Observability
- Log all agent decisions with context
- Monitor token usage and costs
- Track success/failure rates by task type
- Implement alerting for anomalous behavior

### 6. Testing Agent Behavior
- Create test harnesses that verify expected outputs
- Test with edge cases and adversarial inputs
- Compare against baseline behavior
- Track performance metrics over time

## Multi-Agent Orchestration

### Agent Coordination Patterns
- **Sequential**: One agent's output feeds to the next
- **Parallel**: Multiple agents work independently, results aggregated
- **Hierarchical**: Coordinator agent delegates to specialists
- **Iterative**: Agents refine solutions through feedback loops

### Communication Patterns
- Use structured formats (JSON, XML) for agent-to-agent communication
- Validate outputs before passing to next agent
- Include context and decision rationale in messages
- Implement timeout mechanisms

### Fault Tolerance
- Implement circuit breakers for failing agents
- Use timeouts to prevent hanging
- Implement retry logic with backoff
- Maintain audit trails of all agent actions

## Common Pitfalls to Avoid

- Assuming agents will always interpret ambiguous instructions correctly
- Creating overly complex agent hierarchies without testing
- Relying on agents for deterministic results without safeguards
- Ignoring the cost of many agent-to-agent interactions
- Failing to log sufficient context for debugging
- Not testing agent behavior with real-world data

## Development Workflow

1. **Design**: Clarify agent purpose and constraints
2. **Prototype**: Build initial system with simple behaviors
3. **Test**: Create comprehensive test suite
4. **Monitor**: Log and analyze real behavior
5. **Iterate**: Refine based on monitoring data
6. **Document**: Keep system prompt and tools documented

See references/ for orchestration patterns and examples/.
