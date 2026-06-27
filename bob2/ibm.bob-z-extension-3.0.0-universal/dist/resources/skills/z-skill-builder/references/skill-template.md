# Appendix: Generic Skill Template

> **Note:** This appendix contains the template structure for creating any type of skill. Use this as a starting point when building new knowledge-based skills.

## Directory Structure

**CRITICAL:** Skills must be created in the `.bob/skills/` directory with the following structure:

```txt
.bob/skills/[skill-name]/
├── SKILL.md                    (Required - main skill file)
└── references/                 (Optional - detailed documentation)
    ├── detailed-guide.md
    ├── examples.md
    └── troubleshooting.md
```

**Requirements:**

- Skills MUST be in `.bob/skills/[skill-name]/` directory
- The main file MUST be named `SKILL.md` (case-sensitive)

## Template Structure

```markdown
---
name: [domain-name]-[skill-type]
description: [What it does] for [domain/context]. Use when user asks to "[trigger phrase 1]", "[trigger phrase 2]", "[trigger phrase 3]", or mentions "[keyword 1]" or "[keyword 2]".
---

# [Skill Name]

[Brief description of what this skill provides and its purpose]

## Prerequisites

Before using this skill, ensure:

- [PREREQUISITE_1]
- [PREREQUISITE_2]
- [PREREQUISITE_3]

## Instructions

### Step 1: [Initial Assessment/Setup]

[Describe what needs to be checked or set up first]

**If [CONDITION]:**

- [ACTION_1]
- [ACTION_2]

**If [ALTERNATIVE_CONDITION]:**

- [ALTERNATIVE_ACTION_1]
- [ALTERNATIVE_ACTION_2]

### Step 2: [Main Workflow Phase 1]

[Describe the first major phase of the workflow]

**Key Actions:**

1. [ACTION_1]
2. [ACTION_2]
3. [ACTION_3]

**Important Notes:**

- [CRITICAL_NOTE_1]
- [CRITICAL_NOTE_2]

**Example:**

\`\`\`[language]
[Example code, command, or configuration]
\`\`\`

### Step 3: [Main Workflow Phase 2]

[Describe the second major phase]

**Decision Point:**

- **If [CONDITION]**: [ACTION]
- **If [ALTERNATIVE]**: [ALTERNATIVE_ACTION]

### Step 4: [Validation/Completion]

[Describe how to verify success and complete the workflow]

**Validation Checklist:**

- [ ] [CHECK_1]
- [ ] [CHECK_2]
- [ ] [CHECK_3]

## Common Scenarios

### Scenario 1: [Common Use Case]

**Context:** [When this scenario occurs]

**Steps:**

1. [STEP_1]
2. [STEP_2]
3. [STEP_3]

**Expected Result:** [What should happen]

### Scenario 2: [Another Common Use Case]

**Context:** [When this scenario occurs]

**Steps:**

1. [STEP_1]
2. [STEP_2]
3. [STEP_3]

**Expected Result:** [What should happen]

## Troubleshooting

### Issue: [Common Problem 1]

**Symptoms:**

- [SYMPTOM_1]
- [SYMPTOM_2]

**Cause:** [Root cause explanation]

**Solution:**

1. [SOLUTION_STEP_1]
2. [SOLUTION_STEP_2]
3. [SOLUTION_STEP_3]

**Prevention:** [How to avoid this issue]

### Issue: [Common Problem 2]

**Symptoms:**

- [SYMPTOM_1]
- [SYMPTOM_2]

**Cause:** [Root cause explanation]

**Solution:**

1. [SOLUTION_STEP_1]
2. [SOLUTION_STEP_2]

## Best Practices

### Do's

1. **[PRACTICE_1]** - [Explanation of why this is important]
2. **[PRACTICE_2]** - [Explanation of why this is important]
3. **[PRACTICE_3]** - [Explanation of why this is important]

### Don'ts

1. **[ANTI_PATTERN_1]** - [Explanation of why to avoid]
2. **[ANTI_PATTERN_2]** - [Explanation of why to avoid]
3. **[ANTI_PATTERN_3]** - [Explanation of why to avoid]

## Examples

### Example 1: [Good Example]

**Context:** [When to use this approach]

\`\`\`[language]
[Good example code/configuration/process]
\`\`\`

**Why this works:** [Explanation]

### Example 2: [Bad Example]

**Context:** [What not to do]

\`\`\`[language]
[Bad example code/configuration/process]
\`\`\`

**Why this is wrong:** [Explanation of the problems]

**Corrected Version:**

\`\`\`[language]
[Corrected version]
\`\`\`

## References

For detailed information, see:

- `references/detailed-guide.md` - Comprehensive documentation
- `references/examples.md` - Additional examples
- `references/troubleshooting.md` - Extended troubleshooting guide

## Notes

[Any additional context, exceptions, or special considerations]

---

**Usage:** Reference this skill by saying "[natural trigger phrase]" or "Use [skill-name] to help with [task]."

**Maintenance:** Update this skill as knowledge evolves. Version control changes and communicate updates to the team.
```

## Template Customization Guide

### For Process/Workflow Skills

Focus on:

- Sequential steps with clear decision points
- Prerequisites and setup requirements
- Error handling and rollback procedures
- Validation checkpoints

Example domains:

- Deployment processes
- Release management
- Incident response
- Change management

### For Technical Skills

Focus on:

- Tool usage and commands
- Configuration examples
- Integration patterns
- Performance considerations

Example domains:

- API integration
- Database operations
- System configuration
- Monitoring setup

### For Troubleshooting Skills

Focus on:

- Symptom identification
- Diagnostic procedures
- Root cause analysis
- Solution steps

Example domains:

- Performance issues
- Connection problems
- Error resolution
- System diagnostics

### For Best Practices Skills

Focus on:

- Patterns and anti-patterns
- Design principles
- Code quality guidelines
- Security considerations

Example domains:

- Architecture patterns
- Security practices
- Code review guidelines
- Testing strategies

### For Knowledge Transfer Skills

Focus on:

- Concept explanations
- Terminology definitions
- Relationship mapping
- Learning paths

Example domains:

- Technology overviews
- Domain concepts
- System architecture
- Business processes

## Frontmatter Guidelines

### Name Field

Format: `[domain]-[type]`

Examples:

- `deployment-process`
- `api-integration`
- `database-troubleshooting`
- `security-best-practices`
- `incident-response`

### Description Field

Structure: `[What] for [Context]. Use when [Triggers].`

**What:** Clear statement of capability
**Context:** Domain or scope
**Triggers:** 3-5 natural phrases users would say

**Good Examples:**

```yaml
description: Guides deployment process for production releases. Use when user asks to "deploy to production", "release new version", "push to prod", or mentions "deployment checklist" or "release process".
```

```yaml
description: Troubleshoots database connection issues across DB2, Oracle, and PostgreSQL. Use when user asks to "fix database connection", "debug DB errors", "connection timeout", or mentions "database connectivity" or "connection pool".
```

**Bad Examples:**

```yaml
description: Helps with deployments.
# Too vague, no triggers, no context
```

```yaml
description: A comprehensive guide to all aspects of database management including installation, configuration, optimization, backup, recovery, security, and troubleshooting.
# Too broad, no specific triggers
```

## Content Organization

### Main SKILL.md (500-2000 words)

Include:

- Overview and purpose
- Prerequisites
- Core workflow (3-5 main steps)
- Common scenarios (2-3)
- Basic troubleshooting
- Essential best practices

### references/detailed-guide.md

Include:

- Comprehensive documentation
- Advanced scenarios
- Detailed explanations
- Background information
- Theory and concepts

### references/examples.md

Include:

- Multiple code examples
- Configuration samples
- Real-world scenarios
- Good vs bad comparisons
- Edge cases

### references/troubleshooting.md

Include:

- Extensive problem catalog
- Diagnostic procedures
- Solution database
- Prevention strategies
- Tool usage guides

## Quality Checklist

Before finalizing your skill:

- [ ] Name is kebab-case and descriptive
- [ ] Description under 1024 characters
- [ ] Description includes what, when, and triggers
- [ ] Trigger phrases match natural language
- [ ] Prerequisites are clear and complete
- [ ] Workflow steps are actionable
- [ ] Examples are relevant and correct
- [ ] Troubleshooting covers common issues
- [ ] Best practices include rationale
- [ ] Content is under 5000 words
- [ ] References are properly linked
- [ ] No XML angle brackets in frontmatter
- [ ] YAML frontmatter is valid

---

**Next Steps:** Use this template as a starting point, then customize based on the specific knowledge domain and user requirements.
