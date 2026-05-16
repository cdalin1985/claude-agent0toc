---
name: Prompt Engineering Guidelines
description: Techniques for crafting effective prompts that get better outputs from language models
version: 1.0.0
---

# Prompt Engineering Guidelines

Use this skill when you need to design or improve prompts for language models, or when you're getting suboptimal results from an LLM.

## Prompt Structure

### System vs. User Messages
- **System message**: Define role, instructions, constraints, and style
- **User message**: Provide specific task, context, and data
- **Assistant message**: (Optional) Provide examples of expected outputs

### Key Components

**Role Definition**
- Explicitly state what role the model should take
- Example: "You are an expert code reviewer"

**Task Description**
- Clearly state what you want the model to do
- Break complex tasks into steps
- Specify exact output format

**Context & Constraints**
- Provide relevant background information
- Specify limitations and requirements
- Define success criteria

**Examples**
- Provide input-output examples for complex tasks
- Show expected format and quality
- Illustrate edge cases if relevant

## Effective Techniques

### 1. Specificity
- Use concrete examples rather than abstract descriptions
- Specify exact output format (JSON, markdown, etc.)
- Name specific behaviors you want to avoid
- Define constraints numerically when possible

### 2. Clarity
- Use simple, direct language
- Avoid ambiguous pronouns
- Define technical terms if specialized
- Organize information logically

### 3. Output Format
- Specify exact format: JSON, XML, markdown, plain text
- Provide examples of the expected format
- Include schema or structure if complex
- State any required fields explicitly

### 4. Tone & Style
- Describe desired tone (professional, casual, technical, etc.)
- Provide style examples for complex outputs
- Be consistent in terminology
- Match tone to your use case

## Common Patterns

### Chain-of-Thought
- Ask the model to explain reasoning before answering
- Include phrases like "Let's think through this step by step"
- Request intermediate reasoning for complex problems
- Improves accuracy on reasoning tasks

### Few-Shot Learning
- Provide 2-3 examples of the task
- Use realistic examples from your domain
- Include edge cases in examples
- More effective than zero-shot for complex tasks

### Role-Based Prompting
- Assign a specific role or persona
- Example: "As a security expert, identify vulnerabilities..."
- Can improve quality and consistency
- Works well for domain-specific tasks

### Constraint-Based Prompting
- Specify what NOT to do
- Provide hard constraints in system message
- Use phrases like "Do not..." for important restrictions
- Can prevent common failure modes

## Debugging Poor Outputs

**Problem: Wrong format**
- Explicitly specify output structure
- Provide format examples
- Mention any required fields

**Problem: Incomplete answers**
- Ask for detailed explanations
- Specify minimum length or detail level
- Request step-by-step reasoning

**Problem: Off-topic responses**
- Clarify the task more specifically
- Narrow scope of acceptable responses
- Provide more examples

**Problem: Lower quality over time**
- Add constraints for consistency
- Refresh examples periodically
- Monitor output quality regularly

## Best Practices

- Keep prompts focused and concise
- Avoid contradictory instructions
- Test with multiple inputs
- Version control your prompts
- Monitor quality metrics over time
- Update prompts when quality degrades
- Document the reasoning behind prompt choices
- Use the same prompt structure across related tasks

See references/ for prompt templates and examples/.
