---
name: z-skill-builder
description: Guides users through creating custom skills for any knowledge domain where gaps exist (technical processes, domain expertise, best practices, workflows, troubleshooting guides, etc.). Use when user asks to "create a skill", "build a knowledge skill", "document expertise", "create a custom skill", "build a skill for", "capture knowledge", "generate a skill", "make a skill", "create a [topic] skill", or mentions "skill builder".
---

# Skill Builder

This meta-skill helps you create custom skills for any knowledge domain, capturing expertise and workflows that can be reused across projects.

## Instructions

### Step 1: Understand the Knowledge Domain

Start by asking the user about reference materials:

**Question 1**: Reference Materials (ALWAYS ASK FIRST)

"Do you have existing documentation, diagrams, or reference materials for this knowledge area? If yes, please provide:

- File paths to documentation
- Diagram files or images
- Example files or code samples"

**If user provides references:**

- Use `BOB_TOOL_READ_FILE` to load and analyze file content
- Extract key concepts, workflows, and patterns
- Identify gaps that need clarification

**If no references provided:**

- Proceed to Step 2 to gather information through interview questions

### Step 2: Conduct Knowledge Interview

Based on the domain and any reference materials analyzed, ask targeted questions to fill knowledge gaps. Minimum 2 additional questions required.

**Core Questions Framework:**

1. **Domain Scope**
   - "What specific area does this skill cover? (e.g., deployment process, troubleshooting methodology, API integration, security protocols)"
   - "What are the boundaries of this knowledge domain?"

2. **Target Audience**
   - "Who will use this skill? (developers, operators, architects, new team members)"
   - "What level of expertise should we assume?"

3. **Usage Context**
   - "When should this skill be activated? What trigger phrases would users naturally say?"
   - "What scenarios or tasks does this skill address?"

4. **Key Workflows**
   - "What are the main processes or workflows in this domain?"
   - "Are there step-by-step procedures that should be documented?"

5. **Common Issues**
   - "What problems or challenges commonly arise in this area?"
   - "What troubleshooting steps are typically needed?"

6. **Best Practices**
   - "What are the critical do's and don'ts?"
   - "What patterns should be followed or avoided?"

7. **Prerequisites**
   - "What knowledge, tools, or access is required?"
   - "Are there dependencies or setup steps?"

8. **Examples**
   - "Can you provide examples of good vs bad approaches?"
   - "Are there real-world scenarios we should include?"

**Adaptive Questioning:**

Tailor questions based on the domain type:

- **Process/Workflow Skills**: Focus on steps, decision points, error handling
- **Technical Skills**: Focus on tools, commands, configurations, troubleshooting
- **Best Practices Skills**: Focus on patterns, anti-patterns, rationale
- **Troubleshooting Skills**: Focus on symptoms, causes, solutions, prevention
- **Integration Skills**: Focus on interfaces, data flow, error scenarios

### Step 3: Analyze and Organize Information

After gathering information:

1. **Identify Core Concepts**
   - Extract key terminology and definitions
   - Map relationships between concepts
   - Identify critical workflows

2. **Structure the Knowledge**
   - Organize by logical phases or categories
   - Identify prerequisites and dependencies
   - Determine what belongs in main content vs references

3. **Plan Progressive Disclosure**
   - Core workflow: SKILL.md (500-2000 words)
   - Detailed docs: references/ directory
   - Examples and templates: references/ or assets/

### Step 4: Extract and Validate Keywords

**CRITICAL**: Before generating the skill, intelligently gather keywords that will trigger skill activation.

**Keyword Extraction Strategy:**

1. **From Reference Documents** (if provided):
   - Extract technical terms, acronyms, and domain-specific vocabulary
   - Identify repeated concepts and key phrases
   - Look for section headings and emphasized terms
   - Extract command names, tool names, or technology names

2. **From User Responses**:
   - Identify domain-specific terminology used by the user
   - Extract process names, workflow stages, or phase names
   - Note any specialized vocabulary or jargon

3. **From Existing Codebase** (if applicable):
   - Use `search_files` to find related terms in existing programs
   - Look for comments, variable names, or function names related to the domain
   - Search for configuration files or documentation mentioning the domain

**Keyword Selection Criteria:**

- **Specificity**: Choose terms specific to this domain (avoid generic terms like "process", "system", "data")
- **Uniqueness**: Select terms that uniquely identify this skill's domain
- **Natural Language**: Include phrases users would naturally say
- **Technical Terms**: Include domain-specific technical vocabulary
- **Variations**: Include common variations or synonyms

**Present Keywords to User:**

After extracting keywords, present them to the user for confirmation:

"I've identified the following keywords that will trigger this skill:

**Extracted Keywords:**

- [keyword1] (from [source])
- [keyword2] (from [source])
- [keyword3] (from [source])
- [keyword4] (from [source])
- [keyword5] (from [source])

These keywords will be added to the skill description to help activate it automatically when you mention them in conversation, or when they are detected within a program.

**Confirmation Options:**

1. "Approve these keywords" - Use keywords as-is
2. "Add: [keyword1], [keyword2]" - Add additional keywords
3. "Remove: [keyword1], [keyword2]" - Remove specific keywords
4. "Replace with: [keyword1], [keyword2], [keyword3]" - Use different keywords entirely"

**Wait for user confirmation before proceeding to Step 5.**

**Example Keyword Extraction:**

For a deployment process skill with reference document `docs/deployment-guide.md`:

```txt
Extracted Keywords:
- "deployment" (from document title, repeated 15 times)
- "release process" (from section heading)
- "production push" (from user interview)
- "rollback" (from troubleshooting section)
- "blue-green deployment" (from technical section)
- "canary release" (from examples)
```

For a database troubleshooting skill without reference documents:

```txt
Extracted Keywords:
- "connection timeout" (from user interview)
- "DB2 errors" (from user interview)
- "database connectivity" (from user interview)
- "connection pool" (from search in existing code)
- "SQLCODE" (from search in existing code)
```

### Step 5: Generate the Skill

Create a new skill folder with this structure:

```txt
/.bob/skills/[domain-name]-[skill-type]/
├── SKILL.md
└── references/
    ├── detailed-guide.md (if needed)
    ├── examples.md (if examples provided)
    ├── troubleshooting.md (if complex troubleshooting)
    └── original-docs.md (if user had existing docs)
```

Use the skill template structure provided in `references/skill-template.md` to create the SKILL.md file.

**Critical Requirements:**

- Skill folder name must be kebab-case
- SKILL.md must be exactly that (case-sensitive)
- Include specific trigger phrases AND confirmed keywords in description
- Keep frontmatter description under 1024 characters
- No XML angle brackets in frontmatter
- Keep SKILL.md content under 5000 words

### Step 6: Populate the Skill Content

Fill in the template with:

1. **YAML Frontmatter**
   - name: `[domain-name]-[skill-type]`
   - description: Include WHAT it does, WHEN to use it, KEY capabilities, trigger phrases, AND confirmed keywords
   - Format: `[What it does] for [domain/context]. Use when user asks to "[trigger phrase 1]", "[trigger phrase 2]", or mentions "[keyword1]", "[keyword2]", "[keyword3]".`
   - Include all confirmed keywords from Step 4

2. **Main Instructions**
   - Organize by phases or categories
   - Include specific, actionable steps
   - Provide examples (good and bad if applicable)
   - Add troubleshooting section
   - Include best practices

3. **Reference Files**
   - Move detailed documentation to `references/`
   - Keep SKILL.md focused on core workflow
   - Link to references from main content

### Step 7: Save and Validate

1. **Create the Skill Directory**

   **CRITICAL**: The skill directory MUST be created at `.bob/skills/[skill-name]/`

   Example command structure:

   ```bash
   mkdir -p .bob/skills/[domain-name]-[skill-type]/references
   ```

   Then use `BOB_TOOL_WRITE_FILE` to create files:
   - `.bob/skills/[skill-name]/SKILL.md` (main skill file)
   - `.bob/skills/[skill-name]/references/[reference-file].md` (if needed)

2. **Validate Structure**
   - Verify frontmatter is valid YAML
   - Check description length (< 1024 chars)
   - Ensure trigger phrases are included
   - Confirm content is under 5000 words

3. **Ask About Original Documentation**

   If the user provided original documentation files that were used to create the skill:

   Ask: "Would you like me to remove the original documentation files now that the skill has been created? The content has been preserved in the skill's references directory."

   **If user says "Yes":**
   - List the files that will be removed
   - Confirm the action one more time
   - Remove the original documentation files

   **If user says "No":**
   - Keep the original files
   - Remind user they can manually remove them later if needed

4. **Provide Usage Instructions**
   - Explain how to reference the skill
   - Show example invocations
   - Offer to test the skill

## Examples

### Example 1: User with Existing Documentation

User says: "I want to create a skill for our deployment process. I have docs at `docs/deployment-guide.md`"

**Actions:**

1. Read `docs/deployment-guide.md`
2. Analyze the deployment workflow
3. Ask 2+ clarifying questions:
   - "What are the most common deployment issues?"
   - "Are there different procedures for different environments?"
4. Extract keywords from document and user responses:
   - "deployment" (appears 15 times in document)
   - "release process" (section heading)
   - "production push" (user mentioned)
   - "rollback" (troubleshooting section)
   - "blue-green deployment" (technical section)
5. Present keywords to user for confirmation
6. User approves keywords
7. Extract key steps and organize by phase
8. Generate skill with references to original document and confirmed keywords
9. Save to `.bob/skills/deployment-process/`
10. Ask: "Would you like me to remove `docs/deployment-guide.md` now that the skill has been created?"
    - If yes: Remove the original file after confirmation
    - If no: Keep the original file

**Result:** Skill created with deployment workflow, troubleshooting guide, and keywords: "deployment", "release process", "production push", "rollback", "blue-green deployment"

**Generated Description:**

```yaml
description: Guides deployment process for production releases. Use when user asks to "deploy to production", "release new version", "push to prod", or mentions "deployment", "release process", "production push", "rollback", "blue-green deployment".
```

### Example 2: User Starting from Scratch

User says: "Help me create a skill for troubleshooting database connection issues"

**Actions:**

1. Ask about reference materials (none provided)
2. Conduct knowledge interview:
   - "What database systems are involved?" → "DB2 and PostgreSQL"
   - "What are the typical symptoms of connection issues?" → "Connection timeout, SQLCODE errors"
   - "What diagnostic steps do you usually take?" → "Check connection pool, verify credentials"
   - "What are common root causes?" → "Network issues, pool exhaustion"
   - "What tools or logs do you check?" → "DB2 logs, application logs"
3. Extract keywords from user responses:
   - "connection timeout" (user mentioned)
   - "DB2 errors" (user mentioned)
   - "database connectivity" (user mentioned)
   - "connection pool" (user mentioned)
   - "SQLCODE" (user mentioned)
4. Search existing codebase for related terms:
   - Found "SQLCODE" in 12 files
   - Found "connection pool" in configuration files
5. Present keywords to user: User approves all
6. Organize information into troubleshooting workflow
7. Generate skill with symptom-cause-solution structure and confirmed keywords
8. Include diagnostic commands and log analysis steps

**Result:** Skill created with systematic troubleshooting approach and keywords: "connection timeout", "DB2 errors", "database connectivity", "connection pool", "SQLCODE"

**Generated Description:**

```yaml
description: Troubleshoots database connection issues across DB2 and PostgreSQL. Use when user asks to "fix database connection", "debug DB errors", "resolve connection timeout", or mentions "connection timeout", "DB2 errors", "database connectivity", "connection pool", "SQLCODE".
```

### Example 3: User with Diagrams and Documentation

User says: "Create a skill for our API integration. Here's the architecture diagram and API documentation"

**Actions:**

1. Request diagram file path and documentation files
2. Read provided files to understand API structure
3. Ask targeted questions:
   - "What are the most common integration patterns?"
   - "What authentication methods are used?"
   - "What error scenarios should we handle?"
   - "Are there rate limits or retry strategies?"
4. Extract keywords from documentation:
   - "REST API" (document title)
   - "OAuth2" (authentication section)
   - "rate limiting" (technical section)
   - "webhook" (integration patterns)
   - "API gateway" (architecture diagram)
5. Present keywords to user, user adds "API integration"
6. Generate skill with integration workflow and confirmed keywords
7. Include diagram and documentation references in references/

**Result:** Skill created with API integration patterns, error handling, and keywords: "REST API", "OAuth2", "rate limiting", "webhook", "API gateway", "API integration"

### Example 4: Process Documentation Skill

User says: "I need to document our incident response process"

**Actions:**

1. Ask about existing runbooks or procedures
2. Interview questions:
   - "What triggers an incident response?" → "P1/P2 alerts, customer reports"
   - "Who are the key stakeholders?" → "On-call engineer, incident commander"
   - "What are the escalation paths?" → "L1 → L2 → Manager"
   - "What communication channels are used?" → "Slack, PagerDuty"
   - "What are the post-incident steps?" → "Post-mortem, RCA"
3. Extract keywords from responses:
   - "incident response" (user mentioned)
   - "P1 alert" (user mentioned)
   - "on-call" (user mentioned)
   - "post-mortem" (user mentioned)
   - "RCA" (user mentioned)
4. Search codebase for related terms (found "incident" in monitoring configs)
5. Present keywords to user: User approves all
6. Structure as phase-based workflow with confirmed keywords
7. Include decision trees and escalation matrix
8. Add common incident scenarios

**Result:** Skill created with incident response playbook and keywords: "incident response", "P1 alert", "on-call", "post-mortem", "RCA"

## Troubleshooting

### Issue: User's Documentation is Too Large

**Cause:** Document exceeds reasonable token limits

**Solution:**

1. Summarize key concepts in SKILL.md
2. Move full document to `references/original-docs.md`
3. Link to specific sections as needed
4. Focus on actionable workflows in main content

### Issue: User Doesn't Know What They Need

**Cause:** Unclear requirements or unfamiliar with skill structure

**Solution:**

1. Show examples from `references/examples.md`
2. Ask about specific pain points or repeated questions
3. Start with a basic skill covering one scenario
4. Iterate and expand based on usage

### Issue: Too Broad or Unfocused

**Cause:** Trying to cover too much in one skill

**Solution:**

1. Identify the core use case
2. Suggest breaking into multiple focused skills
3. Create a primary skill with links to related skills
4. Use clear scope boundaries

### Issue: Missing Critical Information

**Cause:** Interview questions didn't uncover key details

**Solution:**

1. Review the skill with user
2. Ask follow-up questions about gaps
3. Update skill with missing information
4. Add to references/ if detailed

### Issue: Keywords Too Generic or Too Specific

**Cause:** Extracted keywords don't effectively trigger the skill

**Solution:**

**If keywords are too generic** (e.g., "process", "system", "data"):

1. Ask user for more domain-specific terms
2. Search documentation for technical terminology
3. Look for acronyms or specialized vocabulary
4. Combine generic terms with domain context (e.g., "deployment process" instead of "process")

**If keywords are too specific** (e.g., very long phrases, rare terms):

1. Identify the core concept within the phrase
2. Extract the most commonly used portion
3. Include both the specific and general versions
4. Test if the keyword would naturally appear in conversation

**Example:**

- Too generic: "error", "fix", "problem"
- Too specific: "database connection timeout error code 08001 with SSL handshake failure"
- Just right: "connection timeout", "database error", "SSL handshake"

### Issue: No Keywords Found in Documentation

**Cause:** Documentation is too high-level or lacks technical detail

**Solution:**

1. Ask user directly: "What terms would you use to describe this domain?"
2. Search existing codebase for related files and extract terms
3. Use domain knowledge to suggest relevant keywords
4. Start with basic keywords and refine after skill usage

## Best Practices

When building generic skills:

1. **Start with References**: Always ask for existing documentation first
2. **Extract Keywords Intelligently**: Use multiple sources (docs, user responses, codebase) to gather relevant keywords
3. **Validate Keywords with User**: Always present extracted keywords for user confirmation before finalizing
4. **Be Specific**: Include concrete examples and real scenarios
5. **Show Context**: Explain when and why to use certain approaches
6. **Make Actionable**: Provide clear, measurable steps
7. **Consider Audience**: Tailor complexity to user expertise level
8. **Include Rationale**: Explain the "why" behind recommendations
9. **Keep Focused**: Use progressive disclosure - details in references/
10. **Test Thoroughly**: Validate skill with real scenarios before delivery
11. **Plan for Updates**: Skills should be easy to maintain and evolve
12. **Use Clear Triggers**: Include both trigger phrases AND domain-specific keywords
13. **Balance Keyword Specificity**: Avoid overly generic or overly specific keywords
14. **Search Codebase**: When applicable, search existing programs for domain-related terms to enhance keyword list

## Skill Maintenance Guidance

Remind users that:

- Skills can be edited directly in the folder
- Version control the skill directory
- Review and update periodically as knowledge evolves
- Keywords can be refined based on actual usage patterns
- Can create multiple skills for different aspects of a domain
- Skills work across Claude.ai, Claude Code, and API
- Skills can reference each other for complex workflows
- Keywords help skills activate automatically when mentioned in code or conversation

## Integration with Bob Z Extension

This meta-skill is available in Bob Z Extension modes that support skill creation (Code, Advanced, Z Code). The skills you create with this builder:

**Activation:**

- Are stored in `/.bob/skills/[domain-name]-[skill-type]/`
- Load automatically when users mention trigger phrases
- Can be explicitly referenced: "Use [skill-name] to help with this"

**Usage Contexts:**

- **Knowledge Transfer**: Capture expert knowledge for team sharing
- **Process Documentation**: Standardize workflows and procedures
- **Troubleshooting**: Systematic problem-solving approaches
- **Best Practices**: Enforce patterns and conventions
- **Onboarding**: Help new team members learn domain-specific knowledge

**Integration Points:**

- Works with Bob Z's analysis and planning tools
- Complements other skills for comprehensive assistance
- Supports both local workspace and Z Understand service workflows
- Can be combined with data dictionary and impact analysis skills

**Best Practices:**

- Create domain-specific skills for consistent knowledge application
- Version control skills alongside your codebase
- Update skills as processes and knowledge evolve
- Use descriptive trigger phrases that match natural language
- Organize related skills into logical groups

---
