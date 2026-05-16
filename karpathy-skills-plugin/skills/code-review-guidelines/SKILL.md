---
name: Code Review Guidelines
description: Best practices for conducting and receiving code reviews that improve code quality and team knowledge sharing
version: 1.0.0
---

# Code Review Guidelines

Use this skill when you need guidance on conducting thorough code reviews, providing constructive feedback, or understanding review comments from colleagues.

## Review Focus Areas

### 1. Correctness
- Does the code solve the stated problem?
- Are there logic errors or edge cases missed?
- Are error conditions properly handled?
- Will this break existing functionality?

### 2. Design & Architecture
- Is the solution appropriately complex for the problem?
- Does it follow established patterns in the codebase?
- Is the code maintainable and understandable?
- Are responsibilities clearly separated?

### 3. Performance
- Are there obvious performance issues?
- Does it scale appropriately for expected data sizes?
- Are expensive operations minimized?
- Could different data structures improve efficiency?

### 4. Security
- Are inputs properly validated?
- Are there injection vulnerabilities?
- Is sensitive data handled securely?
- Are access controls appropriate?

### 5. Testing
- Is test coverage adequate?
- Do tests verify behavior, not implementation?
- Are edge cases covered?
- Can tests help future maintainers understand the code?

## Feedback Principles

### Be Constructive
- Explain the WHY behind suggestions
- Offer specific improvements, not vague criticism
- Acknowledge good solutions and approaches
- Treat reviews as learning opportunities

### Be Specific
- Reference line numbers or code sections
- Provide examples of better alternatives
- Suggest specific improvements
- Avoid generalized complaints

### Be Respectful
- Distinguish between "wrong" and "different"
- Respect the author's expertise
- Consider context and constraints
- Ask questions to understand intent

## Review Checklist

- [ ] Code solves the stated problem correctly
- [ ] No obvious bugs or logic errors
- [ ] Error handling is appropriate
- [ ] Code follows codebase conventions
- [ ] No unnecessary complexity added
- [ ] Performance is acceptable
- [ ] Security concerns addressed
- [ ] Tests are adequate and clear
- [ ] Comments explain the WHY
- [ ] Documentation is updated

## Types of Comments

- **Must-fix**: Correctness issues, security problems, bugs
- **Should-consider**: Better approaches, performance improvements
- **Nice-to-have**: Style improvements, minor suggestions
- **Praise**: Acknowledge good solutions and approaches

See references/ for review templates and examples/.
