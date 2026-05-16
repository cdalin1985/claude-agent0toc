---
name: Karpathy Coding Principles
description: Fundamental coding standards and best practices inspired by Andrej Karpathy's approach to software engineering
version: 1.0.0
---

# Karpathy Coding Principles

Use this skill when you need guidance on fundamental coding standards, software design patterns, and best practices for writing maintainable, efficient code.

## Core Principles

### 1. Simplicity First
- Write the simplest code that solves the problem
- Avoid premature optimization
- Prefer explicit over implicit
- Clear is better than clever

### 2. Type Safety & Correctness
- Use strong typing (TypeScript, Python type hints)
- Validate at system boundaries
- Trust internal code guarantees
- Test edge cases, not happy paths

### 3. Code Organization
- Group related functionality together
- Keep files focused and modular
- Use clear naming conventions
- Avoid deep nesting

### 4. Error Handling
- Handle errors at system boundaries (user input, external APIs)
- Don't add error handling for impossible scenarios
- Fail fast and clearly
- Provide actionable error messages

### 5. Comments & Documentation
- Code should be self-documenting through clear naming
- Write comments only for the WHY, not the WHAT
- Document non-obvious constraints and invariants
- Keep comments close to the code they describe

### 6. Testing Strategy
- Write tests that verify behavior, not implementation details
- Test the public API, not private methods
- Use fixtures for complex test setup
- Aim for behavior-driven test coverage

## Anti-Patterns to Avoid

- Over-engineering solutions for hypothetical future needs
- Adding features that aren't currently required
- Incomplete implementations or half-finished abstractions
- Backwards-compatibility shims when you can change the code
- Excessive abstraction for 2-3 similar lines
- Feature flags for temporary workarounds

## When to Apply

Use these principles when:
- Writing new code or refactoring
- Reviewing code from others
- Setting team coding standards
- Mentoring junior developers
- Making architectural decisions

See references/ for detailed patterns and examples/.
