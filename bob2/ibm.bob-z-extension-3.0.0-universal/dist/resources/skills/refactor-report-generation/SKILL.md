---
name: refactor-report-generation
description: Generate comprehensive refactor reports for mainframe service refactoring (COBOL and PL/I). Use when creating documentation for extracted services from either "simple refactoring" or "extract relevant sections of code". Standardizes report structure with common sections (copybooks/includes analysis, dependencies, return codes, testing, deployment) and method-specific sections (extraction rationale for "simple refactoring", code block mappings for "extract relevant sections of code").
---

# Refactor Report Generation Skill

This skill provides a standardized approach to generating extraction reports for mainframe service refactoring workflows.

It supports both **COBOL** and **PL/I** programs and ensures consistent documentation structure whether the service was created through "simple refactoring" or "extract relevant sections of code".

## When to Use This Skill

Activate this skill when:

- Generating documentation after service extraction ("simple refactoring" workflow)
  - COBOL service extraction (`.cbl` files)
  - PL/I service extraction (`.pli` files)
- Creating reports for services generated from slice markdown files ("extract relevant sections of code" workflow)
- The user requests an extraction report or generation report
- You need to document a refactored service with comprehensive metadata

Examples:

- After completing "simple refactoring" workflow
- After completing "extract relevant sections of code" workflow
- `Generate an extraction report for ACCTPROC.cbl`
- `Generate an extraction report for POLINSRT.pli`
- `Create documentation for the extracted service`
- `Document the service generation from the slice file`

## When NOT to Use This Skill

Do **not** activate this skill when:

- The user is still in the analysis or candidate selection phase
- No service file has been generated yet

## Prerequisites

Before starting, ensure:

- A service file has been generated (`.cbl` for COBOL or `.pli` for PL/I)
- You have the service name and file location
- You know the extraction context ("simple refactoring" or "extract relevant sections of code")
- You have access to the source program and slice markdown file if "extract relevant sections of code" was used

## Report Naming

All extraction reports use the same naming convention regardless of method:

**Naming Convention**: `[ServiceName]-EXTRACTION-REPORT.md`

## Complete Workflow - Incremental Report Building

**CRITICAL APPROACH**: Build the report incrementally using targeted edits to prevent performance degradation:

1. **First**: Write the report outline with all section headers
2. **Then**: Fill in each section one at a time using `BOB_TOOL_APPLY_DIFF` to update only that section
3. **Finally**: Read the complete report once and fix any inconsistencies

This incremental approach prevents incomplete reports while avoiding exponential context growth from repeated full-file reads/writes.

### Step 1: Create Report Outline

**Action Required**: Use `BOB_TOOL_WRITE_FILE` to create the initial report file with ALL section headers but minimal content.

**What to Include in the Outline**:

- Report title with service name
- All section headers numbered sequentially (## 1. Section Name, ## 2. Section Name, etc.)
- Brief placeholders like "_(To be filled)_" under each section
- This creates the skeleton that you'll fill in incrementally

**Context-Based Report Type:**

You'll know which report type to generate based on context:

- **Simple refactoring**: User selected from extraction candidates, entry point chosen from ranked list, copybooks/includes analyzed interactively
- **Extract relevant sections of code**: Service generated from a `.md` slice file, code blocks assembled from markdown, multiple programs may be involved

**File Naming and Location Rules**:

- Report name: `[ServiceName]-EXTRACTION-REPORT.md` (same for both methods)
- **Use `BOB_TOOL_WRITE_FILE` tool** to create the file in the SAME folder as the service file (`.cbl` or `.pli`)
- Examples:
  - COBOL "simple refactoring": `ACCTPROC/ACCTPROC-EXTRACTION-REPORT.md` alongside `ACCTPROC/ACCTPROC.cbl`
  - COBOL "extract relevant sections of code": `CUSTSERV/CUSTSERV-EXTRACTION-REPORT.md` alongside `CUSTSERV/CUSTSERV.cbl`
  - PL/I "simple refactoring": `POLINSRT/POLINSRT-EXTRACTION-REPORT.md` alongside `POLINSRT/POLINSRT.pli`
  - PL/I "extract relevant sections of code": `PLISRV/PLISRV-EXTRACTION-REPORT.md` alongside `PLISRV/PLISRV.pli`

### Step 2: Fill In Each Section Incrementally

**Action Required**: For each section (in order), use `BOB_TOOL_APPLY_DIFF` to replace the placeholder with complete content.

**Process**:

1. Use `BOB_TOOL_APPLY_DIFF` to replace the placeholder text for ONE section with complete, detailed content
2. Target only the lines containing that section's placeholder (e.g., "_(To be filled)_")
3. Include the complete section content in the replacement
4. Repeat for the next section until all sections are complete

**Why This Works**:

- Each edit is surgical and targeted - only modifies one section
- No need to read entire file repeatedly (avoids exponential context growth)
- File operations are fast since only small portions are modified
- Ensures all sections get proper attention without performance degradation
- AI processes only the new section content, not the entire accumulated report

**Example Pattern**:

```markdown
\`BOB_TOOL_APPLY_DIFF\` to replace:

## 2. Copybooks/Includes Analysis Summary

_(To be filled)_

with:

## 2. Copybooks/Includes Analysis Summary

### COBOL Copybooks Referenced

- CUSTMAST: Customer master record structure
- SQLCA: SQL communication area
  ...
```

### Step 3: Review for Consistency (ONLY AFTER ALL SECTIONS COMPLETE)

**Action Required**: After all sections are filled in using `BOB_TOOL_APPLY_DIFF`, use `BOB_TOOL_READ_FILE` ONCE to review the complete report.

**Check for**:

- Consistent terminology throughout
- Sequential numbering with no gaps
- Cross-references between sections are accurate
- Return codes table is complete
- All dependencies are documented
- No placeholder text remains

**If Issues Found**: Use `BOB_TOOL_APPLY_DIFF` to make targeted corrections, or if extensive fixes are needed, use `BOB_TOOL_WRITE_FILE` one final time.

**CRITICAL**: Do NOT read the file after every section. Only read once at the very end for the final consistency check.

### Step 4: Section Requirements

All extraction reports follow a three-part structure:

## Report Section Structure

### Initial Common Sections (Required for All Reports)

All extraction reports must start with these sections regardless of method:

```markdown
## 1. Overview

- Service name, generation date (use ONLY the {{GENERATION_DATE_PLACEHOLDER}} value provided), source program/slice
- Refactoring goal and entry point rationale (for "simple refactoring") or programs involved (for "extract relevant sections of code")

## 2. Copybooks/Includes Analysis Summary

- For COBOL: Document COPY statements and copybook usage
- For PL/I: Document %INCLUDE statements and include file usage

## 3. Dependencies

- List all external dependencies (copybooks/includes, programs, tables, files)
```

### Method-Specific Sections

#### "Simple refactoring" Additional Sections

```markdown
## 4. Extraction Summary

- High-level overview of what was extracted and why

## 5. What Was Extracted

- Detailed listing of extracted code elements (paragraphs, sections, procedures, etc.)

## 6. Data Flow Analysis

- Input parameters and how they are used
- Output parameters and how they are populated
- Internal data structures

## 7. What Was NOT Extracted

- Code that remains in the original program
- Rationale for exclusion
```

#### "Extract relevant sections of code" Additional Sections

```markdown
## 4. Generation Summary

- High-level overview of service generation from slice file

## 5. Code Blocks Assembled

- List of code blocks extracted from slice markdown
- Source program mapping for each block

## 6. Data Structures Consolidated

- Data structures assembled from multiple programs
- Working-storage and linkage sections

## 7. Control Flow Explanation

- How the assembled code blocks work together
- Logic flow through the service
```

### Final Common Sections (Required for All Reports)

All extraction reports must end with these sections regardless of method:

```markdown
## 8. Return Codes (or appropriate number based on method)

- Table of all return codes with descriptions and conditions

## 9. Testing Considerations

- Unit testing recommendations
- Test scenarios and edge cases
- Mock data requirements

## 10. Integration Guidance

- How to call the service from existing programs
- Parameter mapping examples
- Code snippets showing integration

## 11. Deployment Checklist

- Compilation requirements
- Copybook/include file placement
- Environment-specific considerations
- Post-deployment validation steps
```

## Section Numbering

When generating the actual extraction report, number all sections sequentially:

1. Start with Initial Common Sections (typically sections 1-3)
2. Continue with Method-Specific Sections (continue numbering from where initial sections ended)
3. Finish with Final Common Sections (continue numbering sequentially)

**Example for "Simple refactoring":**

- Sections 1-3: Initial Common
- Sections 4-7: Method-Specific ("simple refactoring")
- Sections 8-11: Final Common

**Example for "Extract relevant sections of code":**

- Sections 1-3: Initial Common
- Sections 4-7: Method-Specific ("extract relevant sections of code")
- Sections 8-11: Final Common

This ensures consistent numbering regardless of which method was used.

## Best Practices

### For Optimal Results

1. **Use incremental building with targeted edits** - Start with an outline, then use `BOB_TOOL_APPLY_DIFF` to fill in each section one at a time
2. **Use `BOB_TOOL_APPLY_DIFF` for each section** - Replace only the placeholder for that section, not the entire file
3. **Do NOT read between sections** - Only read the file ONCE at the very end for consistency review
4. **Include all sections** - Every report must have all initial common sections, all method-specific sections, and all final common sections
5. **Follow the three-part structure** - Initial common → Method-specific → Final common
6. **Number sequentially** - Number all sections in order (1, 2, 3...) from start to finish
7. **Be comprehensive** - Include all required sections even if some are marked as "None"
8. **Provide context** - Explain why decisions were made, not just what was done
9. **Use concrete examples** - Show actual code snippets for integration guidance
10. **Review at the end** - Read the complete report ONCE and fix any inconsistencies with targeted edits

### For Conciseness (CRITICAL)

**Nobody wants to scroll through pages of text. Keep reports concise and scannable.**

1. **Be brief and direct** - Use bullet points, tables, and short paragraphs. Avoid verbose explanations.
2. **Focus on essential information** - Include only what developers need to integrate and deploy the service
3. **Use tables for structured data** - Return codes, dependencies, copybooks should be in tables, not prose
4. **Limit code snippets** - Show only the most relevant examples, not entire program sections
5. **Avoid redundancy** - Don't repeat information across sections
6. **Use clear headings** - Let section titles do the work; content should be scannable
7. **Target 1-2 pages per section** - If a section exceeds 2 pages, it's too long
8. **Prioritize actionable content** - Deployment steps, integration code, and return codes matter most

### For Consistency

1. **Follow naming convention** - Always use `-EXTRACTION-REPORT.md` suffix for all reports
2. **Incremental edits** - Use `BOB_TOOL_WRITE_FILE` for outline, then `BOB_TOOL_APPLY_DIFF` for each section, then optional `BOB_TOOL_APPLY_DIFF` for final fixes
3. **Report location** - Create the report in the same folder as the service file
4. **Use standard section order** - Initial common sections → Method-specific sections → Final common sections
5. **Sequential numbering** - Number sections continuously without gaps or restarts
6. **Avoid repeated reads** - Only read the complete file once at the very end for consistency checking

### For Quality

1. **Verify copybooks/includes analysis** - Ensure all copybooks/includes are documented with their purpose and key fields
   - For COBOL: Document COPY statements and copybook structures
   - For PL/I: Document %INCLUDE statements and include file structures
2. **Document all dependencies** - List every external dependency (copybooks/includes, programs, tables, files)
3. **Provide actionable guidance** - Make integration and deployment sections practical and specific
4. **Include complete return codes** - Always provide a full return codes table with all possible codes
5. **Use language-appropriate terminology** - Copybooks for COBOL, include files for PL/I

## Summary

This skill ensures consistent extraction report generation for both COBOL and PL/I using an **optimized incremental building approach**:

**CRITICAL WORKFLOW**:

1. **Create outline** - Write the report skeleton with all section headers using `BOB_TOOL_WRITE_FILE`
2. **Fill incrementally** - Use `BOB_TOOL_APPLY_DIFF` to complete each section one at a time (replace placeholders with content)
3. **Review and fix** - Read the complete report ONCE at the end and correct any inconsistencies with targeted edits

This three-phase approach ensures complete report generation without performance degradation from repeated full-file reads/writes.

**Key Features**:

1. **Language support** - Handles both COBOL (`.cbl`) and PL/I (`.pli`) service files
2. **Three-part structure** - Initial common sections → Method-specific sections → Final common sections
3. **Initial sections** - Set context with overview, copybooks/includes, and dependencies
4. **Method-specific sections** - Document what was extracted/generated based on "simple refactoring" or "extract relevant sections of code"
5. **Final sections** - Provide usage guidance with return codes, testing, integration, and deployment
6. **Sequential numbering** - Number all sections continuously from start to finish
7. **Comprehensive documentation** - Include all required sections with complete details
8. **Quality assurance** - Verify all dependencies, return codes, and copybooks/includes references
9. **Language-appropriate terminology** - Use copybooks for COBOL, include files for PL/I
10. **Targeted incremental edits** - Use `BOB_TOOL_APPLY_DIFF` to build the report section by section without performance issues

By following this skill's optimized incremental approach, you can produce consistent, high-quality extraction reports that support successful service deployment and integration for both COBOL and PL/I refactoring workflows without slowdowns.
