---
name: data-dictionary-management
description: Automate creation and maintenance of data dictionaries for COBOL or PL/I programs. Use when user asks to create data dictionary, analyze COBOL or PL/I variables, document variable meanings, or explain COBOL or PL/I programs. Handles program scanning, variable extraction, description generation, and user review workflows.
---

# Data Dictionary Management Skill

This skill guides you through the complete workflow for creating and maintaining data dictionaries for COBOL or PL/I programs. Data dictionaries translate cryptic mainframe variable names into business-meaningful descriptions, enabling better code comprehension and modernization.

## Prerequisites

Before starting, ensure:

- IBM Bob Premium Package for Z extension is installed
- IBM Z Open Editor 6.4.0+ is installed
- User has a COBOL or PL/I program to analyze
- Workspace folder is open in VSCode

## Complete Workflow Overview

The data dictionary workflow has four phases:

1. **Phase 1: Prerequisites Check** - Check skip lists and existing artifacts
2. **Phase 2: Program Scanning** - Create analysis database if needed
3. **Phase 3: Data Dictionary Creation** - Generate and validate data dictionary
4. **Phase 4: Maintenance** - Keep data dictionary synchronized

---

## Phase 1: Prerequisites Check

**Purpose**: Optimize workflow by checking user preferences.

### Step 1.1: Check Skip Lists (Internal - Don't Mention to User)

Read `.bobz/local-settings.json` and check:

- `scan_skip_files` array - Files that should skip program scanning
- `data_dictionary_skip_files` array - Files that should skip validation

If current file is in either skip list, adjust workflow accordingly.

**Example local-settings.json**:

```json
{
  "databaseLocation": "/workspace/Cobol Programs/Cobol_Programs.db",
  "scan_skip_files": ["/workspace/Cobol Programs/LEGACY01.cbl"],
  "data_dictionary_skip_files": ["/workspace/Cobol Programs/STABLE02.cbl"]
}
```

---

## Phase 2: Program Scanning

**Purpose**: Create SQLite database containing program analysis data.

### Step 2.1: Check for Database

Check `.bobz/local-settings.json` for `databaseLocation` field.

**If NO database found:**

Prompt user using tool `BOB_TOOL_ASK_FOLLOWUP_QUESTION`:

```text
"No database file was found for this COBOL program. The scan_program tool can
analyze the file to extract additional variable information. Would you like to
run the scan_program tool on this file?"
```

**User responds "Yes":**

- Proceed to Step 2.2

**User responds "No":**

- Ask: "Would you like me to remember this choice and not ask about scanning this file in the future?"
- If "Yes": Add file path to `scan_skip_files` in `.bobz/local-settings.json`
- Continue with limited functionality

### Step 2.2: Run scan_program Tool

**Tool**: `scan_program`

**Parameters**:

- `uri`: Absolute folder URI (e.g., `file:///workspace/Cobol Programs`) or file URI

**Important Notes**:

- ALWAYS use parent folder URI unless user explicitly requests single file scan
- For folders, tool will detect COBOL and PL/I files automatically
- If multiple languages found, tool will prompt user to select
- Tool creates SQLite database with program analysis data
- Database path is automatically stored in `.bobz/local-settings.json`

**Example**:

```xml
<scan_program>
<uri>file:///workspace/Cobol Programs</uri>
</scan_program>
```

**After Scan Completes**:

- Database location is stored in `.bobz/local-settings.json`
- `.bobz/` directory is added to `.gitignore` if not present
- Proceed to Phase 3

---

## Phase 3: Data Dictionary Creation

**Purpose**: Generate comprehensive data dictionary with business-meaningful descriptions using the `get_variables` tool.

### Step 3.1: Call get_variables Tool

**Tool**: `get_variables`

**Parameters**:

- `programId` (required): Program identifier (e.g., "LGACDB01") — must use exact casing of the program ID, not always uppercase
- `programPath` (required): Absolute path of the program file
- `topVariablesCount` (optional): Number of top variables to select (default: 15)

**Example**:

```xml
<get_variables>
<programId>LGACDB01</programId>
</get_variables>
```

**What Happens Next**:

The tool returns a structured 3-step workflow as part of its response, providing complete instructions for variable selection, expansion, and saving.

**Your Task**: Follow the 3-step workflow exactly as provided in the tool's response.

**After Workflow Completes**:

Expect that the `edit_data_dictionary` tool will have been called and the result will be saved as DD.json.
Report to user:

- Number of existing entries
- Number of suggested entries
- Number of entries after user review
- File path to DD.json

---

## Phase 4: Maintenance & Validation

**Purpose**: Keep data dictionary synchronized with code changes.

### Step 4.1: Always Read DD.json with COBOL Files

**CRITICAL RULE**: When using `BOB_TOOL_READ_FILE` to read ANY COBOL OR PL/I file, ALWAYS include DD.json in the same call.

**Example**:

```xml
<BOB_TOOL_READ_FILE>
<args>
  <file>
    <path>Cobol Programs/LGACDB01.cbl</path>
  </file>
  <file>
    <path>bobz/DD.json</path>
  </file>
</args>
</BOB_TOOL_READ_FILE>
```

**Multi-Root Workspace Note**: Each workspace folder has its own `bobz/DD.json`. Path is relative to workspace folder containing the COBOL or PL/I file.

### Step 4.2: Detect Code Changes Requiring DD.json Update

**When to validate**: Only when the COBOL or PL/I source code has been modified since the last DD.json update.

**How to detect changes**:

1. Compare file modification timestamps (source file vs DD.json)
2. Look for new variable declarations in the source code
3. Check if `scan_program` has been run since last DD.json update

**If changes detected**:

Inform user using tool `BOB_TOOL_ASK_FOLLOWUP_QUESTION`:

```text
"The COBOL program has been modified since the data dictionary was last updated.
Would you like to validate and update the data dictionary to include any new variables?"
```

**User responds "Yes":**

- Call `get_variables` tool (it will detect new variables by comparing database with DD.json)
- Follow the 3-step workflow returned by the tool
- User reviews merged entries in diff view
- DD.json is updated with new variables

**User responds "No":**

- Ask: "Would you like me to remember this choice and not ask about validating the data dictionary for this file in the future?"
- If "Yes": Add file to `data_dictionary_skip_files` in `.bobz/local-settings.json`
- Continue with current DD.json (may be out of sync with code)

**Note**: The `get_variables` tool automatically compares available variable information with existing DD.json entries and only prompts for new variables that aren't already documented.

---

## AGENTS.md Enforcement

**After successful DD.json creation or update**, you MUST update AGENTS.md if it exists.

**Check**: Does `AGENTS.md` exist in workspace root?

**If YES**:
Use `BOB_TOOL_APPLY_DIFF` or `BOB_TOOL_WRITE_FILE` to add or update a "Data Dictionary Location" section:

```markdown
## Data Dictionary Location

The data dictionary for this project is located at:

- `/workspace/bobz/DD.json`

This file contains variable descriptions and business context for COBOL or PL/I programs.
Always reference this file when analyzing or modifying COBOL or PL/I code.
```

**If NO**: No action needed.

---

## Common Scenarios

### Scenario 1: First-Time Setup (No Database, No DD.json)

1. User asks to explain COBOL program
2. Check `.bobz/local-settings.json` - no database found
3. Prompt user to run scan_program
4. User agrees, run scan_program on folder
5. Database created and stored in local-settings.json
6. Call get_variables for the program
7. Follow 3-step workflow (select, expand, save)
8. User reviews and edits in diff view
9. DD.json created
10. Update AGENTS.md
11. Proceed with explanation using DD.json context

### Scenario 2: Database Exists, No DD.json

1. User asks to analyze COBOL program
2. Database found in `.bobz/local-settings.json`
3. No DD.json found
4. Call get_variables for the program
5. Follow 3-step workflow (select, expand, save)
6. User reviews and edits in diff view
7. DD.json created
8. Update AGENTS.md
9. Proceed with analysis using DD.json context

### Scenario 3: Both Database and DD.json Exist (Code Modified)

1. User asks to explain PL/I program
2. Read PL/I file and DD.json together
3. Detect that source file was modified after DD.json (check timestamps)
4. Prompt user: "Program has been modified. Would you like to validate the data dictionary?"
5. User agrees
6. Call get_variables (tool detects new variables by comparing database with DD.json)
7. Follow 3-step workflow returned by tool
8. User reviews merged entries in diff view
9. DD.json updated
10. Proceed with explanation using updated DD.json

### Scenario 4: Both Database and DD.json Exist (No Code Changes)

1. User asks to explain COBOL program
2. Read COBOL file and DD.json together
3. Check timestamps - source file not modified since DD.json update
4. No validation needed - DD.json is current
5. Proceed with explanation using existing DD.json

### Scenario 5: User Wants to Skip Validation

1. User asks to explain COBOL program
2. Read COBOL file and DD.json together
3. Detect source file was modified after DD.json
4. Prompt user to validate
5. User rejects validation
6. Ask: "Would you like me to remember this choice?"
7. User says "Yes"
8. Add file to `data_dictionary_skip_files` in `.bobz/local-settings.json`
9. Proceed with explanation using existing DD.json (may be out of sync)

---

## Troubleshooting

### Issue: scan_program fails with "No supported files found"

**Cause**: Folder contains no COBOL or PL/I files

**Solution**:

- Verify folder path is correct
- Check file extensions (.cbl, .cob, .cobol for COBOL; .pli, .pl1 for PL/I)
- Try scanning specific file instead of folder

### Issue: get_variables returns "Database file not found"

**Cause**: Program database doesn't exist or path is incorrect

**Solution**:

- Run scan_program first
- Check `.bobz/local-settings.json` for correct database path
- Verify database file exists at specified path

### Issue: get_variables returns an error

**Cause**: The variable extraction request could not be completed

**Solution**:

- Report that `get_variables` failed and stop the task
- Do not attempt manual variable analysis or any fallback extraction approach
- If relevant, include the error details in the report

### Issue: edit_data_dictionary fails with "Invalid JSON"

**Cause**: variablesData parameter has malformed JSON

**Solution**:

- Verify JSON structure matches schema
- Check for missing quotes, commas, or brackets
- Ensure scope field uses correct format: `[{"programName": "PROG1"}]`

### Issue: Diff view shows no changes

**Cause**: All variables already exist in DD.json with current program in scope

**Solution**: This is expected behavior - no updates needed

### Issue: User wants to edit DD.json manually

**Solution**:

- User can open `bobz/DD.json` directly in editor
- Edit JSON following schema
- Save file
- Next validation will merge user changes with new variables

---

## Best Practices

### For Optimal Results

1. **Always scan at folder level** unless user specifically requests single file
2. **Use appropriate topVariablesCount** (10-20 typical, 15 default)
3. **Provide naming convention files** for better abbreviation expansion
4. **Provide business glossary files** for domain-specific terminology
5. **Review and edit descriptions** in diff view for accuracy
6. **Keep DD.json in version control** to share knowledge across team
7. **Update AGENTS.md** to document data dictionary location

### For Efficiency

1. **Respect skip lists** - don't prompt for files in skip lists
2. **Use multi-file BOB_TOOL_READ_FILE** - read COBOL or PL/I files and DD.json together
3. **Don't mention internal checks** - skip list checks are silent optimizations
4. **Handle rejections gracefully** - always offer to remember user's choice

### For Quality

1. **Focus on business relevance** when selecting variables
2. **Avoid duplicate concepts** - one variable per business concept
3. **Enrich existing descriptions** rather than replacing
4. **Include scope information** for cross-program understanding
5. **Use clear, business-focused language** in descriptions

---

## Data Dictionary Schema Example

**File**: `bobz/DD.json`

**Version**: 2.0.0

```json
{
  "version": "2.0.0",
  "entries": [
    {
      "name": "VARIABLE-NAME",
      "type": "variable",
      "shortDescription": "Brief expansion of abbreviations",
      "longDescription": "Detailed explanation with business context",
      "scope": [{ "programName": "PROGRAM1" }, { "programName": "PROGRAM2" }]
    }
  ]
}
```

## Summary

This skill automates the complete data dictionary management workflow:

1. **Scans** COBOL or PL/I programs to extract structural information
2. **Analyzes** variables using sophisticated relevance scoring
3. **Selects** the most business-critical variables through AI-guided criteria
4. **Expands** cryptic abbreviations into meaningful descriptions
5. **Validates** through user review in an interactive diff view
6. **Maintains** synchronization with code changes over time
7. **Documents** locations in AGENTS.md for future reference

By following this workflow, you transform cryptic mainframe code into understandable, well-documented systems that support modernization, maintenance, and knowledge transfer.
