# Design Patterns from Karpathy

## Pattern: Simple is Better Than Complex

**When to use:** Building new features, refactoring existing code

**Pattern:**
```
1. Write the simplest solution that solves the problem
2. Only add complexity if proven necessary
3. Prefer explicit over implicit
4. Clear code > clever code
```

**Trade-offs:**
- Pros: Easier to maintain, fewer bugs, faster to understand
- Cons: May not be optimal for extreme performance needs

**Example:**
```typescript
// ❌ Over-engineered
class ConfigManager {
  private cache = new Map();
  private subscribers = new Set();
  
  // ... complex caching and observer pattern
}

// ✅ Simple
const config = loadConfig();
const value = config.get('key');
```

## Pattern: Type Safety at Boundaries

**When to use:** Designing APIs, working with user input, external APIs

**Pattern:**
1. Strong typing at system boundaries
2. Validate inputs immediately
3. Trust internal code to be correct
4. No defensive copying of internal data

**Example:**
```typescript
// Boundary: accept raw input, validate immediately
function processUser(input: unknown): User {
  const parsed = userSchema.parse(input);
  return parsed; // Now we trust it's a valid User
}

// Internal: trust the type, no need to re-validate
function updateUser(user: User): void {
  // No need to check if user.id exists
  database.update(user.id, user);
}
```
