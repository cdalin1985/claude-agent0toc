# Karpathy Skills Plugin

A Claude Code plugin that packages Andrej Karpathy's coding guidelines and best practices for AI/agent development into reusable skills.

## Overview

This plugin provides four core skills based on Andrej Karpathy's approach to software engineering and AI development:

1. **Karpathy Coding Principles** - Fundamental coding standards and best practices
2. **Code Review Guidelines** - How to conduct and receive effective code reviews
3. **Agent Development Practices** - Best practices for building AI agents and multi-agent systems
4. **Prompt Engineering Guidelines** - Techniques for crafting effective prompts for language models

## Installation

This plugin is installed by default in Claude Code environments. To manually enable it:

1. Add the plugin directory to your Claude Code configuration
2. Restart Claude Code
3. Skills will be automatically discovered and available

## Usage

In Claude Code, you can invoke these skills during development:

```
/karpathy-coding-principles
/code-review-guidelines  
/agent-development
/prompt-engineering
```

Or ask Claude Code directly for guidance on any of these topics, and the skills will be applied contextually.

## Skill Details

### Karpathy Coding Principles
Covers fundamental coding standards including:
- Simplicity first approach
- Type safety and correctness
- Code organization
- Error handling
- Clear commenting
- Effective testing

**Use when:** Writing new code, refactoring, setting team standards, or making architectural decisions

### Code Review Guidelines
Best practices for reviewing code including:
- Review focus areas (correctness, design, performance, security, testing)
- Constructive feedback principles
- Specific vs. general feedback
- Review checklist
- Comment classification (must-fix, should-consider, nice-to-have)

**Use when:** Reviewing code from others, providing feedback, or understanding review comments

### Agent Development Practices
Covers building AI agents including:
- Determinism and reproducibility
- Clear system prompts
- Structured tool definitions
- Error handling for agent failures
- Monitoring and observability
- Multi-agent orchestration patterns

**Use when:** Building AI agents, orchestrating workflows, or working with language models as decision-making components

### Prompt Engineering Guidelines
Techniques for effective prompts including:
- Prompt structure (system vs. user messages)
- Specificity, clarity, and output format
- Common patterns (chain-of-thought, few-shot, role-based)
- Debugging poor outputs
- Best practices for prompt design

**Use when:** Designing prompts, improving LLM outputs, or engineering prompt-based systems

## Credits

This plugin is based on [forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills), which collects Andrej Karpathy's coding principles and best practices.

### Original Sources

- Andrej Karpathy's GitHub: https://github.com/karpathy
- Blog and writings: https://andrej.karpathy.ai
- Tweets and discussions: https://twitter.com/karpathy

## License

This plugin is provided under the MIT License. See original repository for details.

## Contributing

To improve this plugin:
1. Submit issues or suggestions to the original [forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills) repository
2. Share improvements through pull requests
3. Credit Andrej Karpathy and Forrest Chang in any derivative works

## Support

For questions or issues:
- Check the skill documentation in each SKILL.md file
- Review the references/ directories for detailed patterns
- Check examples/ for practical code examples
- Refer to the original repository for more context

---

**Note:** This is a community-maintained plugin created to make Andrej Karpathy's wisdom more accessible in Claude Code development workflows.
