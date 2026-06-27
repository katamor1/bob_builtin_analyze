# Appendix: Skill Template

> **Note:** This appendix contains the template structure for creating coding standards skills. Use this as a starting point when building new standards enforcement skills.

## Template Structure

````markdown
---
name: [project-name]-coding-standards
description: Enforces coding standards for [project name]. Use when user asks to "review code", "check standards", "generate code", "refactor code", or mentions "[project name] conventions" or "style guide".
metadata:
  author: [Your Name/Team]
  version: 1.0.0
  enforcement-level: [strict|moderate|advisory]
  target-languages: [COBOL, PL/I, JCL, Java, etc.]
---

# [Project Name] Coding Standards

Enforces coding standards and best practices for [project name/team name].

## Instructions

### When to Apply This Skill

Use this skill when:

- Generating new code
- Reviewing existing code
- Refactoring code
- Conducting code reviews
- User explicitly requests standards enforcement

### Step 1: Identify Language and Context

Determine:

- Programming language of the code
- File type and purpose
- Whether it's new code or legacy code
- Specific standards section to apply

### Step 2: Apply Language-Specific Standards

For each language, follow the rules in the corresponding section below.

#### COBOL Standards

**Naming Conventions:**

- Program names: [RULE - e.g., 8 characters max, uppercase]
- Paragraph names: [RULE - e.g., descriptive, hyphenated]
- Variables: [RULE - e.g., prefix by type, meaningful names]
- Constants: [RULE - e.g., all caps with hyphens]

**Code Structure:**

- [RULE - e.g., IDENTIFICATION DIVISION format]
- [RULE - e.g., WORKING-STORAGE organization]
- [RULE - e.g., PROCEDURE DIVISION structure]

**Documentation:**

- [RULE - e.g., header comment format]
- [RULE - e.g., paragraph documentation]
- [RULE - e.g., complex logic comments]

**Example - Good:**

```cobol
       IDENTIFICATION DIVISION.
       PROGRAM-ID. CUSTPROC.
      *****************************************************************
      * PROGRAM: CUSTPROC - Customer Processing
      * PURPOSE: Process customer records and update database
      * AUTHOR:  [Name]
      * DATE:    [Date]
      *****************************************************************
       WORKING-STORAGE SECTION.
       01  WS-CUSTOMER-RECORD.
           05  WS-CUST-ID          PIC 9(8).
           05  WS-CUST-NAME        PIC X(50).
```

**Example - Bad:**

```cobol
       IDENTIFICATION DIVISION.
       PROGRAM-ID. CP.
       WORKING-STORAGE SECTION.
       01  CR.
           05  ID              PIC 9(8).
           05  NM              PIC X(50).
```

**Why the bad example is wrong:**

- Program ID too short and cryptic
- Variable names not descriptive
- Missing documentation header
- No meaningful structure

#### [Other Languages]

[Repeat structure for PL/I, JCL, REXX, HLASM, Assembler, Java, etc.]

### Step 3: Check Cross-Cutting Concerns

Apply these rules regardless of language:

**Error Handling:**

- [RULE - e.g., always check return codes]
- [RULE - e.g., log errors with context]
- [RULE - e.g., graceful degradation]

**Performance:**

- [RULE - e.g., avoid nested loops where possible]
- [RULE - e.g., use indexed access]
- [RULE - e.g., minimize I/O operations]

**Security:**

- [RULE - e.g., validate all inputs]
- [RULE - e.g., no hardcoded credentials]
- [RULE - e.g., sanitize user data]

**Maintainability:**

- [RULE - e.g., functions under 50 lines]
- [RULE - e.g., cyclomatic complexity under 10]
- [RULE - e.g., meaningful variable names]

### Step 4: Report Findings

When reviewing code, structure your response as:

1. **Summary**: Overall compliance level
2. **Critical Issues**: Must-fix violations
3. **Recommendations**: Should-fix improvements
4. **Compliments**: What's done well

Format:

```txt
## Standards Review Results

**Overall Compliance:** [Excellent|Good|Needs Improvement|Poor]

### Critical Issues (Must Fix)

- [Issue 1 with line number and explanation]
- [Issue 2 with line number and explanation]

### Recommendations (Should Fix)

- [Recommendation 1]
- [Recommendation 2]

### Positive Observations

- [What's done well]
- [Good practices observed]
```

### Step 5: Provide Corrected Code (if requested)

When user asks for corrections:

1. Show the problematic section
2. Explain what's wrong
3. Provide corrected version
4. Explain why the correction is better

### Step 6: Validate with ZCodeScan (Optional - Include if user requested)

**Note**: This step should only be included if the user chose to enable ZCodeScan validation during skill creation.

**MANDATORY** (when enabled): After generating or modifying COBOL or PL/I code, always instruct users to validate the code quality with ZCodeScan.

Add this instruction at the end of every code generation response:

```text
IMPORTANT: Validate the generated code with ZCodeScan

Run the ZCodeScan tool to validate code quality:

For the current file open in the editor:
<use_mcp_tool>
<server_name>zopeneditor-sample</server_name>
<tool_name>zcodescan-check-current-program</tool_name>
<arguments>
{}
</arguments>
</use_mcp_tool>

For all COBOL/PL/I files in the workspace:
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

**MANDATORY** (when enabled): Always add the step to validate the generated code with ZCodeScan to the end of the TODO list.

## Enforcement Levels

### Strict Mode

- All violations must be corrected
- No exceptions without architectural approval
- Automated checks must pass
- Code cannot be merged with violations

### Moderate Mode

- Critical violations must be corrected
- Minor violations should be addressed when practical
- Document intentional deviations
- Balance standards with pragmatic development

### Advisory Mode

- Standards serve as guidelines
- Focus on critical issues and best practices
- Allow flexibility for special cases
- Encourage improvement over time

## Review Checklist

Use this checklist when reviewing code:

- [ ] Naming conventions followed
- [ ] Code properly documented
- [ ] Consistent formatting applied
- [ ] Error handling implemented
- [ ] Performance considerations addressed
- [ ] Security best practices followed
- [ ] No anti-patterns present
- [ ] Maintainability standards met
- [ ] Tests included (if applicable)
- [ ] [Custom checklist items]

## Troubleshooting

### Issue: Legacy Code Doesn't Meet Standards

**Cause:** Code written before standards were established

**Solution:**

- Apply standards to new code only
- Refactor legacy code incrementally
- Document deviations in legacy code
- Prioritize critical issues

### Issue: Standards Conflict with Framework

**Cause:** Framework conventions differ from project standards

**Solution:**

- Follow framework conventions within framework code
- Apply project standards to business logic
- Document the boundary between the two
- Consider updating standards to align

### Issue: Performance vs Standards Trade-off

**Cause:** Following standards impacts performance

**Solution:**

- Measure actual performance impact
- Document the trade-off decision
- Get architectural approval for deviation
- Add comments explaining the exception

## References

For detailed information, see:

- `references/examples.md` - More code examples
- `references/original-standards.md` - Full standards document
- [Link to external style guide]
- [Link to team wiki]

## Notes

[Any additional context, exceptions, or special considerations specific to your project]

---

**Usage:** Reference this skill by saying "Apply [project name] coding standards" or "Review this code using our standards skill."

**Maintenance:** Update this skill as standards evolve. Version control changes and communicate updates to the team.
````
