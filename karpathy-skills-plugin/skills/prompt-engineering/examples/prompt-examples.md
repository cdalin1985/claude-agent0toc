# Prompt Engineering Examples

## Example 1: Code Documentation

**Poor prompt:**
```
Write code documentation.
```

**Good prompt:**
```
Write TypeScript JSDoc comments for this function following these rules:
- Explain what the function does in 1-2 sentences
- Document each parameter with @param including the type and description
- Document return value with @return
- Include @throws if exceptions are possible
- Use examples with @example if the usage is non-obvious

Here's the function:
[code]

Expected output format:
/**
 * [description]
 * @param [paramName] - [description]
 * @returns [description]
 */
```

## Example 2: Chain-of-Thought Reasoning

**Problem:** Model gives wrong answer to complex logic problem

**Solution:**
```
I need to solve this step by step.

Problem: [problem statement]

Please think through this step by step:
1. First, identify what we're solving for
2. Next, note any constraints or edge cases
3. Then, work through the logic
4. Finally, verify the answer makes sense

Provide your reasoning at each step before giving the final answer.
```

## Example 3: Few-Shot Learning

**Task:** Classify customer support requests

**Approach:**
```
Classify each support request as one of: BUG, FEATURE_REQUEST, ACCOUNT_ISSUE, or OTHER.

Examples:
1. "The login button doesn't work on mobile" → BUG
2. "Can you add dark mode?" → FEATURE_REQUEST
3. "I was charged twice last month" → ACCOUNT_ISSUE
4. "What's your company history?" → OTHER

Now classify these:
[new requests]
```

## Example 4: Output Format Specification

**Poor:**
```
Generate a JSON response with user data.
```

**Good:**
```
Generate a JSON response with user data.

Required fields:
- id: string (UUID format)
- name: string (first and last name)
- email: string (valid email format)
- status: "active" | "inactive" | "pending"
- createdAt: ISO 8601 datetime

Example output:
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "John Doe",
  "email": "john@example.com",
  "status": "active",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

## Example 5: Debugging a Prompt

**Original prompt:**
```
Summarize this article in a few sentences.
```

**Problem:** Summaries are too long, miss key points

**Improved prompt:**
```
Summarize this article in exactly 2-3 sentences.

Focus on the main finding or conclusion.
Exclude examples and supporting details.
Start with the most important point.

Article:
[article]

Summary (2-3 sentences):
```
