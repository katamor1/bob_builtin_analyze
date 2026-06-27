---
name: z-coding-standards-skill-builder
description: Discovers coding standards from existing Z codebase (COBOL, PL/I, JCL, REXX, Assembler, Java) and creates enforcement skills. Use when user asks to "create a coding standards skill", "discover our standards", "analyze our code conventions", "build standards from code", "extract coding patterns", or mentions "coding standards" or "style guide".
---

# Coding Standards Skill Builder

This meta-skill discovers coding standards from your existing IBM Z codebase and creates custom enforcement skills. It analyzes actual code to extract patterns, minimizing user input requirements.

## Philosophy: Discovery-First Approach

**Traditional approach**: Ask user to describe standards → Document what they say
**This approach**: Analyze codebase → Extract actual patterns → User confirms findings

This is critical for IBM Z languages (COBOL, PL/I, JCL, REXX, Assembler, Java) because:

- Standards documentation is often sparse or outdated
- Conventions evolved over decades and are highly idiosyncratic
- Institutional knowledge may be lost (retired developers)
- The codebase IS the standard for legacy maintenance

## Instructions

### Step 1: Automated Codebase Discovery

**Objective**: Analyze 15-20 representative files to extract actual coding patterns with minimal user input.

#### 1.1 Identify Target Languages and Files

Ask user: "Which directory should I analyze for coding standards? (e.g., `src/`, `cobol/`, or `.` for entire workspace)"

Then automatically:

1. **Scan for Z Language Files**

   ```text
   Use BOB_TOOL_LIST_FILES recursively to find:
   - COBOL: *.cbl, *.cob, *.cobol, *.cpy
   - PL/I: *.pli, *.pl1, *.inc
   - JCL: *.jcl, *.jcl, *.proc
   - REXX: *.rexx, *.rex, *.exec
   - Assembler: *.asm, *.hlasm, *.s
   - Java: *.java
   ```

2. **Categorize by Subsystem** (detect from content)
   - CICS programs (contains `EXEC CICS`)
   - IMS programs (contains `DL/I`, `GU`, `GN`, `ISRT`)
   - DB2 programs (contains `EXEC SQL`)
   - Batch programs (no subsystem indicators)
   - Utilities/copybooks

3. **Select Representative Sample** (15-20 files minimum)
   - 4-5 core business logic programs (largest, most complex)
   - 3-4 utility/helper programs
   - 2-3 copybooks/includes (if present)
   - 2-3 JCL files (if present)
   - 2-3 files from each subsystem (CICS, IMS, DB2)
   - Mix of file sizes (small, medium, large)
   - Include recently modified files (current practices)
   - Include older files (legacy patterns)

#### 1.2 Read and Analyze Files

For each selected file, use `BOB_TOOL_READ_FILE` with strategic line ranges:

**COBOL Programs:**

```text
Lines 1-150: IDENTIFICATION, ENVIRONMENT, DATA DIVISION headers
Lines with "01 " or "77 ": Working storage structure
Lines with "PROCEDURE DIVISION": Paragraph organization
Search for: Error handling patterns, COPY statements
```

**JCL:**

```text
Lines 1-50: Job card and header comments
All DD statements: Dataset naming, space allocation
All EXEC statements: Program invocation patterns
```

**PL/I:**

```text
Lines 1-100: DCL statements, procedure headers
Lines with "DCL": Variable naming patterns
Lines with "ON ERROR", "ON ENDFILE": Error handling
```

**REXX:**

```text
Lines 1-100: Header comments, initialization
Lines with "CALL", "SIGNAL": Subroutine patterns
Lines with variable assignments: Naming conventions
```

**Java:**

```text
Lines 1-100: Package, imports, class declaration
Lines with class/method declarations: Naming patterns
Lines with annotations: Framework usage patterns
Search for: Exception handling, logging patterns
```

#### 1.3 Extract Patterns with Confidence Scoring

For each language, analyze and score patterns (0-100% confidence):

**Naming Conventions:**

- Variable prefixes (WS-, W-, LV-, etc.)
- Paragraph naming (VERB-NOUN vs descriptive)
- File/dataset naming patterns
- Constant naming conventions

**Code Structure:**

- Header comment format and content
- Division/section organization (COBOL)
- Procedure organization (PL/I, REXX)
- Indentation and formatting

**Documentation:**

- Program header requirements
- Inline comment style
- Paragraph/procedure documentation
- Change history format

**Error Handling:**

- File status checking patterns
- ABEND handling
- Error logging conventions
- Return code management

**Subsystem Patterns:**

- CICS command formatting
- IMS call conventions
- DB2 SQL style
- Dataset allocation standards (JCL)

**Confidence Calculation:**

```text
High Confidence (80-100%): Pattern appears in 12+ of 15 files
Medium Confidence (60-79%): Pattern appears in 9-11 files
Low Confidence (40-59%): Pattern appears in 6-8 files
Uncertain (<40%): Pattern appears in <6 files or conflicts exist
```

#### 1.4 Detect Legacy vs Modern Code

Identify code era from syntax features:

**COBOL:**

- COBOL-74: No END-IF, uses periods
- COBOL-85: END-IF, inline PERFORM
- Enterprise COBOL: Object-oriented features, JSON

**PL/I:**

- Classic PL/I: Fixed format
- Modern PL/I: Free format, newer built-ins

**Strategy**: Separate "legacy to maintain" from "modern to emulate" patterns.

### Step 2: Present Findings for User Validation

**Objective**: Show discovered patterns and get user confirmation on ambiguities only.

#### 2.1 Generate Discovery Report

Present findings in this format:

```markdown
## Coding Standards Discovery Report

### Analysis Summary

- Files analyzed: 18 (12 COBOL, 4 JCL, 2 copybooks)
- Subsystems detected: CICS (5 files), Batch (7 files)
- Code eras: Enterprise COBOL (10 files), COBOL-85 (2 files)

### High Confidence Patterns (80-100%)

#### COBOL Naming Conventions

- ✅ Working storage variables: `WS-` prefix (15/15 files, 100%)
- ✅ Paragraph names: VERB-NOUN format (14/15 files, 93%)
- ✅ Constants: All caps with hyphens (13/15 files, 87%)
- ✅ File names: 8 characters max, uppercase (15/15 files, 100%)

#### Documentation

- ✅ Program header: 10-line format with PURPOSE, AUTHOR, DATE (14/15 files, 93%)
- ✅ Paragraph comments: Single line above paragraph (12/15 files, 80%)

#### Error Handling

- ✅ File status check after every READ/WRITE (15/15 files, 100%)
- ✅ ABEND paragraph for critical errors (13/15 files, 87%)

### Medium Confidence Patterns (60-79%)

#### COBOL Structure

- ⚠️ COPY statement location: After 01 levels (10/15 files, 67%)
- ⚠️ Paragraph size: Under 50 lines (11/15 files, 73%)

### Low Confidence / Conflicts Detected

#### COBOL Formatting

- ❓ Indentation: 4 spaces (8 files) vs 3 spaces (7 files)
- ❓ PERFORM style: Inline (6 files) vs separate paragraph (9 files)

### Subsystem-Specific Patterns

#### CICS Programs (5 files analyzed)

- ✅ EXEC CICS commands: Uppercase, indented 8 spaces (5/5 files, 100%)
- ✅ COMMAREA handling: Dedicated 01 level in LINKAGE (5/5 files, 100%)

#### JCL Standards (4 files analyzed)

- ✅ Job card: 3-line format with accounting, class, msgclass (4/4 files, 100%)
- ✅ DD statements: Continuation on separate lines (4/4 files, 100%)
- ⚠️ Comment style: //_ (3 files) vs //_ with box (1 file)

### Legacy vs Modern Code

**Legacy Patterns** (maintain for consistency):

- COBOL-85 style in 2 older programs
- GO TO usage in error handling (3 files)

**Modern Patterns** (use for new code):

- Enterprise COBOL with inline PERFORM
- Structured error handling without GO TO
```

#### 2.2 Ask Targeted Questions

Only ask about conflicts and low-confidence patterns:

```text
I found some inconsistencies that need your input:

1. **Indentation**: I see both 4 spaces (8 files) and 3 spaces (7 files).
   Which should be the standard?

2. **PERFORM style**: Some files use inline PERFORM, others use separate paragraphs.
   Which approach should new code follow?

3. **JCL comments**: Most use simple //* but one uses box-style comments.
   Which is preferred?

4. **Legacy code**: I found 2 older COBOL-85 programs. Should new code:
   a) Match legacy style for consistency
   b) Use modern Enterprise COBOL features
   c) Maintain legacy style in old programs, modern style in new programs
```

#### 2.3 Confirm Enforcement Level

Based on pattern strictness observed, suggest enforcement level:

```text
Based on the high consistency I observed (most patterns 80%+ adoption),
I recommend **Moderate** enforcement:
- High-confidence patterns (80%+): Must follow
- Medium-confidence patterns (60-79%): Should follow
- Low-confidence patterns: Advisory only

Does this match your expectations? (Strict/Moderate/Advisory)
```

#### 2.4 Ask About ZCodeScan Validation

Ask the user if they want to include automatic ZCodeScan validation instructions:

```xml
<ask_followup_question>
<question>Would you like the coding standards skill to automatically prompt for ZCodeScan validation after code generation or modifications?

ZCodeScan is an IBM tool that parses COBOL/PL/I programs and returns linter-style issues about code quality. If enabled, the skill will instruct users to run ZCodeScan after generating or modifying code to validate quality.

Recommended: Yes (helps ensure generated code meets IBM Z best practices)</question>
<follow_up>
<suggest>Yes - Include ZCodeScan validation instructions in the skill</suggest>
<suggest>No - Skip ZCodeScan validation instructions</suggest>
</follow_up>
</ask_followup_question>
```

**If user says "Yes":**

- Include the ZCodeScan validation instructions in Step 6 of the generated skill
- Add the validation prompt to all code generation responses

**If user says "No":**

- Skip the ZCodeScan validation section
- Do not include validation prompts in code generation responses

### Step 3: Generate the Skill

Create a new skill folder with this structure:

```text
/.bob/skills/[project-name]-coding-standards/
├── SKILL.md
└── references/
    ├── discovered-patterns.md (pattern analysis details)
    ├── code-samples.md (extracted good/bad examples)
    └── z-language-patterns.md (Z-specific pattern library)
```

Use the skill template structure provided in `references/skill-template.md` to create the SKILL.md file.

**Critical Requirements:**

- Skill folder name must be kebab-case
- SKILL.md must be exactly that (case-sensitive)
- Include specific trigger phrases in description
- Keep frontmatter under 1024 characters
- No XML angle brackets in frontmatter

### Step 4: Populate the Skill Content

Fill in the template with discovered patterns:

#### 4.1 YAML Frontmatter

```yaml
---
name: [project-name]-coding-standards
description: Enforces [project-name] coding standards for [languages]. Discovered from codebase analysis. Use when "review code", "check standards", "generate code", or "refactor code".
metadata:
  author: Discovered by Bob Z Coding Standards Builder
  version: 1.0.0
  enforcement-level: [strict|moderate|advisory]
  target-languages: [COBOL, JCL, PL/I, Java, etc.]
  discovery-date: [date]
  files-analyzed: [count]
  confidence-threshold: 80%
---
```

#### 4.2 Main Instructions - Organize by Confidence Level

**High-Confidence Standards (MUST follow):**

- List all 80%+ patterns as mandatory rules
- Include specific examples from analyzed code
- Provide rationale based on frequency

**Medium-Confidence Standards (SHOULD follow):**

- List 60-79% patterns as strong recommendations
- Note exceptions observed in codebase
- Explain when deviations are acceptable

**Advisory Standards (MAY follow):**

- List <60% patterns as suggestions
- Document conflicting approaches found
- Let developers choose based on context

#### 4.3 Language-Specific Sections

For each language found, create dedicated section:

```markdown
## COBOL Standards

### Naming Conventions (High Confidence)

- Working storage: `WS-` prefix (100% adoption)
- Paragraphs: VERB-NOUN format (93% adoption)
- Constants: ALL-CAPS-WITH-HYPHENS (87% adoption)

**Good Example** (from analyzed file CUSTPROC.cbl):
[Include actual code snippet from codebase]

**Bad Example** (anti-pattern to avoid):
[Show what NOT to do]

### Documentation (High Confidence)

[Pattern details with examples]

### CICS-Specific Standards (if applicable)

[Subsystem-specific patterns]
```

#### 4.4 Reference Files

**`references/discovered-patterns.md`:**

- Full pattern analysis with statistics
- All confidence scores and file counts
- Conflicting patterns documented
- Evolution notes (legacy vs modern)

**`references/code-samples.md`:**

- Actual code snippets from analyzed files (anonymized if needed)
- Good examples for each standard
- Bad examples (anti-patterns found)
- Before/after refactoring examples

**`references/z-language-patterns.md`:**

- Z-specific pattern detection rules
- Subsystem identification patterns
- Common idioms and their meanings
- Link to this skill's pattern library

### Step 5: Save, Test, and Iterate

#### 5.1 Create the Skill Directory

```bash
mkdir -p .bob/skills/[project-name]-coding-standards/references
```

#### 5.2 Write Files

Use `BOB_TOOL_WRITE_FILE` to create:

1. SKILL.md with discovered standards
2. references/discovered-patterns.md with full analysis
3. references/code-samples.md with examples
4. references/z-language-patterns.md with Z patterns

#### 5.3 Test on Sample Code

Offer to test the new skill:

```text
I've created your coding standards skill. Would you like me to:
1. Test it on one of the analyzed files to verify accuracy?
2. Test it on a different file to check coverage?
3. Generate a sample code review using the new standards?
```

#### 5.4 Validate with ZCodeScan (Conditional)

**Only include this section if the user chose "Yes" in Step 2.4.**

If ZCodeScan validation was enabled, add this instruction to the generated skill:

**MANDATORY**: After creating the skill and whenever code is generated using this skill, always instruct users to validate the code quality with ZCodeScan.

Before running the ZCodeScan tool, you should always verify there is a rules file to limit the scan's output
you can find the schema for the file at <https://github.com/IBM/zopeneditor-about/blob/main/zcodescan/zcodescan-rules-1.4.0.json>

Add this instruction at the end of every code generation response:

```text
IMPORTANT: Validate the generated code with ZCodeScan

Run the ZCodeScan tool to validate code quality. Use one of these commands:

For the current file open in the editor:
<use_mcp_tool>
<server_name>zopeneditor-sample</server_name>
<tool_name>zcodescan-check-current-program</tool_name>
<arguments>
{}
</arguments>
</use_mcp_tool>

For all COBOL/PL/I files in the workspace (specify search patterns):
<use_mcp_tool>
<server_name>zopeneditor-sample</server_name>
<tool_name>zcodescan-check-list-of-local-programs</tool_name>
<arguments>
{
  "searchPatterns": "**/*.cbl **/*.cob **/*.cobol **/*.pli **/*.pl1"
}
</arguments>
</use_mcp_tool>

The scan will parse the program(s) and return linter-style issues about code quality. Review the results and address any problems found before finalizing the code.
```

**MANDATORY**: Add the step to validate code quality with ZCodeScan to the end of the TODO list.

**If the user chose "No" in Step 2.4:**

- Skip this section entirely
- Do not include ZCodeScan validation instructions in the generated skill

#### 5.5 Provide Usage Instructions

```markdown
## Using Your New Coding Standards Skill

**Activation phrases:**

- "Review this code using [project-name] standards"
- "Check if this follows our coding standards"
- "Generate code following [project-name] conventions"
- "Refactor this to match our standards"

**Example usage:**
"Review NEWPROG.cbl using acme-banking-coding-standards and identify any violations."

**Updating the skill:**

- Edit `.bob/skills/[project-name]-coding-standards/SKILL.md` directly
- Re-run this builder to refresh from updated codebase
- Version control the skill directory with your code
```

#### 5.6 Iteration and Refinement

Suggest periodic updates:

```text
Recommended maintenance schedule:
- Quarterly: Review and update based on new code patterns
- After major refactoring: Re-analyze to capture improvements
- When onboarding: Use as training material for new developers
- Before releases: Validate all code against standards

To refresh this skill, say: "Update [project-name] coding standards by re-analyzing the codebase"
```

### Step 6: Ask About Original Documentation

If the user provided original documentation files that were used to create the skill:

Ask: "Would you like me to remove the original coding standards documentation files now that the skill has been created? The content has been preserved in the skill's references directory."

#### If user says "Yes"

- List the files that will be removed
- Confirm the action one more time
- Remove the original documentation files

#### If user says "No"

- Keep the original files
- Remind user they can manually remove them later if needed

## Examples

### Example 1: Discovery-Based Standards Creation

User says: "Create coding standards for our COBOL project"

Actions:

1. Read `docs/coding-standards.md`
2. Ask: "Which directory should I analyze?"
3. User responds: "src/cobol/"
4. Scan and find 45 COBOL files, 12 JCL files
5. Select 18 representative files (15 COBOL, 3 JCL)
6. Read files with strategic line ranges
7. Extract patterns with confidence scores
8. Present discovery report with high/medium/low confidence patterns
9. Ask only about conflicts (indentation: 4 vs 3 spaces)
10. User resolves: "Use 4 spaces"
11. Generate skill with discovered patterns
12. Save to `.bob/skills/acme-cobol-coding-standards/`
13. Ask: "Would you like me to remove `docs/coding-standards.md` now that the skill has been created?"

- If yes: Remove the original file after confirmation
- If no: Keep the original file

Result: Skill created from actual codebase patterns, minimal user input required

### Example 2: Multi-Subsystem Project

User says: "Discover standards for our mainframe applications"

Actions:

1. Analyze workspace, find CICS, IMS, and batch programs
2. Select 20 files across subsystems
3. Detect subsystem-specific patterns
4. Present findings organized by subsystem
5. User confirms CICS standards differ from batch
6. Generate skill with subsystem-specific sections
7. Include subsystem detection logic

Result: Comprehensive skill covering multiple subsystems with appropriate variations

### Example 3: Legacy Modernization

User says: "Create standards that help us modernize our COBOL"

Actions:

1. Analyze codebase, detect mix of COBOL-74, COBOL-85, Enterprise COBOL
2. Identify legacy patterns (GO TO, ALTER) vs modern (inline PERFORM, structured)
3. Present two sets of standards:
   - "Legacy maintenance" (match old code)
   - "New development" (modern practices)
4. User confirms: maintain legacy style in old programs, modern in new
5. Generate skill with dual standards and migration guidance

Result: Skill supports both maintenance and modernization efforts

## Troubleshooting

### Issue: Insufficient Files for Analysis

**Cause:** Codebase has fewer than 15 files

**Solution:**

1. Analyze all available files
2. Lower confidence threshold to 70%
3. Note in skill: "Based on limited sample, review periodically"
4. Suggest re-analysis as codebase grows

### Issue: Highly Inconsistent Codebase

**Cause:** No clear patterns, many conflicts

**Solution:**

1. Present all variations found
2. Ask user to choose preferred approach for each conflict
3. Document chosen standards as "target state"
4. Include migration plan in skill
5. Mark current code as "legacy to refactor"

### Issue: Subsystem Detection Fails

**Cause:** Non-standard subsystem usage or mixed programs

**Solution:**

1. Ask user to identify subsystem for ambiguous files
2. Document detection patterns for future use
3. Add manual categorization option
4. Update z-language-patterns.md with new patterns

### Issue: Pattern Confidence Too Low

**Cause:** High variability in coding styles

**Solution:**

1. Focus on most common patterns only
2. Set enforcement level to "Advisory"
3. Document all variations as acceptable
4. Plan incremental standardization
5. Re-analyze after cleanup efforts

### Issue: Legacy Code Dominates

**Cause:** Most code is old, doesn't reflect desired standards

**Solution:**

1. Separate analysis: legacy vs recent files
2. Ask user: "Should I base standards on old or new code?"
3. If new: analyze only files modified in last 2 years
4. Document legacy patterns as "to be refactored"
5. Create migration guide

## Best Practices

When building coding standards skills with discovery-first approach:

1. **Analyze Sufficient Volume**: 15-20 files minimum, more for large/diverse codebases
2. **Diverse Sampling**: Include different file types, sizes, ages, subsystems
3. **Strategic Reading**: Use line ranges to focus on relevant sections
4. **Confidence-Based**: Only enforce high-confidence patterns strictly
5. **Document Conflicts**: Show all variations found, let user decide
6. **Subsystem Awareness**: Recognize that CICS/IMS/DB2 have different conventions
7. **Era Recognition**: Distinguish legacy from modern code
8. **Preserve Context**: Include actual code examples from analyzed files
9. **Enable Evolution**: Make skill easy to update as standards improve
10. **Test Thoroughly**: Validate skill on both analyzed and new files

## Z Language Pattern Library

This skill includes detection patterns for IBM Z languages. See `references/z-language-patterns.md` for:

### COBOL Patterns

- Variable naming conventions (WS-, W-, LV-, LS- prefixes)
- Paragraph naming styles (VERB-NOUN, descriptive, numbered)
- COPY statement usage and location
- File handling patterns (SELECT, FD, file status)
- Error handling (ABEND paragraphs, file status checks)

### JCL Patterns

- Job card formats (accounting, class, msgclass)
- DD statement conventions (continuation, DCB parameters)
- PROC usage and symbolic parameters
- Comment styles (simple //\* vs box comments)
- Dataset naming conventions

### PL/I Patterns

- DCL statement formatting
- Procedure organization
- Error handling (ON conditions)
- Storage management (ALLOCATE/FREE)
- Naming conventions (Hungarian notation variants)

### Subsystem Detection

- **CICS**: `EXEC CICS`, `DFHCOMMAREA`, `EIBCALEN`
- **IMS**: `DL/I`, `GU`, `GN`, `ISRT`, `DLET`, `REPL`
- **DB2**: `EXEC SQL`, `SQLCA`, `SQLCODE`
- **MQ**: `MQOPEN`, `MQGET`, `MQPUT`

### Code Era Detection

- **COBOL-74**: No END-IF, period-terminated, fixed format
- **COBOL-85**: END-IF, inline PERFORM, scope terminators
- **Enterprise COBOL**: OO features, JSON, XML, longer names
- **PL/I Classic**: Fixed format, limited built-ins
- **Modern PL/I**: Free format, enhanced built-ins

## Skill Maintenance Guidance

Remind users that:

- Skills can be edited directly in the folder
- Version control the skill directory with your codebase
- Re-run this builder quarterly or after major refactoring
- Update as team standards evolve
- Use for onboarding new developers
- Can create multiple skills for different contexts (legacy vs new, subsystem-specific)
- Skills work across Claude.ai, Claude Code, and API

## Integration with Bob Z Extension

This meta-skill is available in Bob Z Extension modes that support skill creation (Code, Advanced, Z Code). The coding standards skills you create with this builder:

**Activation:**

- Are stored in `/.bob/skills/[project-name]-coding-standards/`
- Load automatically when users mention project-specific trigger phrases
- Can be explicitly referenced: "Apply [project-name] coding standards to this code"

**Usage Contexts:**

- **Code Generation**: Standards are applied when generating new code
- **Code Review**: Standards are checked when reviewing existing code
- **Refactoring**: Standards guide code improvements and modernization
- **Pull Requests**: Can be used to validate code before merging
- **Onboarding**: Training material for new team members

**Integration Points:**

- Works with Bob Z's code analysis tools
- Complements impact analysis and implementation planning skills
- Can be combined with data dictionary management for comprehensive code understanding
- Supports both local workspace and Z Understand service workflows
- Integrates with refactoring and validation tools

**Best Practices:**

- Create project-specific skills for consistent team standards
- Version control skills alongside your codebase
- Update skills as standards evolve
- Use descriptive trigger phrases that match how developers naturally ask for help
- Maintain separate skills for different subsystems if conventions differ significantly
- Document exceptions and special cases
- Include migration guidance for legacy code

---

---
