# Code Review Checklist

## Pre-Review
- [ ] Understanding what problem is being solved
- [ ] Identifying test coverage expectations
- [ ] Noting any architectural changes

## Correctness
- [ ] Does the code solve the stated problem?
- [ ] Are all requirements addressed?
- [ ] Are there obvious logic errors?
- [ ] Edge cases properly handled?
- [ ] Off-by-one errors in loops/arrays?
- [ ] Null/undefined checks where needed?

## Design & Maintainability
- [ ] Code follows established patterns
- [ ] Functions have single responsibility
- [ ] Variable names are clear and descriptive
- [ ] Complexity is justified
- [ ] Comments explain WHY not WHAT
- [ ] No obvious refactoring opportunities

## Performance & Efficiency
- [ ] Obvious performance issues?
- [ ] Appropriate data structures chosen?
- [ ] N+1 queries or inefficient loops?
- [ ] Caching used appropriately?
- [ ] Resource cleanup/disposal?

## Security
- [ ] Input validation present
- [ ] No SQL/command injection risks
- [ ] Sensitive data handled securely
- [ ] Access controls appropriate
- [ ] No hardcoded credentials

## Testing
- [ ] Tests verify behavior not implementation
- [ ] Edge cases covered
- [ ] Error paths tested
- [ ] Test names clearly describe what they test
- [ ] Sufficient coverage for changes

## Documentation
- [ ] Code comments explain non-obvious decisions
- [ ] API documentation updated
- [ ] Breaking changes documented
- [ ] Examples provided if helpful
- [ ] README/docs updated if needed
