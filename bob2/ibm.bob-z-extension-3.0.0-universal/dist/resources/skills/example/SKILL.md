---
name: example
description: Example skill demonstrating the complete structure and sections used in Bob Z skills. Use this as a template when creating new skills. description should contain [what it does] + [when to use it] + [key capabilities].
---

# Example Skill

This skill serves as a template demonstrating the complete structure for creating comprehensive Bob Z skills. It includes all standard sections and follows best practices for skill documentation.

## Prerequisites

Before starting, ensure:

- PREREQUISITE_1
- PREREQUISITE_2
- PREREQUISITE_3

## Complete Workflow Overview

The example workflow has four phases:

1. **Phase 1: Prerequisites Check** - Determine if the skill should really be used (if needed)
2. **Phase 2: Initial Setup** - Prepare necessary resources
3. **Phase 3: Main Processing** - Execute core functionality
4. **Phase 4: Maintenance** - Keep artifacts synchronized

---

## Phase 1: Prerequisites Check

**Purpose**: Optimize workflow by checking if the skill workflow should be executed.

> some skills might exclude this phase if the skill's workflow should always be executed

### Step 1.1: Check Skip Lists (Internal - Don't Mention to User)

DESCRIBE_WHAT_TO_CHECK to determine if the skill's workflow should be skipped.

**Example values**:

PROVIDE_EXAMPLE_OF_WHAT_TO_CHECK_OR_WHAT_VALUES_SHOULD_LOOK_LIKE

---

## Phase 2: Initial Setup

**Purpose**: Prepare necessary resources and configuration.

### Step 2.1: Check for Required Resources

**If NO resource found:**

> if user response is required

Prompt user:

```text
"ASK THE USER FOR INFORMATION HERE"
```

**User responds "Yes":**

- ACTIONS_OR_STEPS_TO_TAKE

**User responds "No":**

- ACTIONS_OR_STEPS_TO_TAKE

### Step 2.2: Run a Tool

**Tool**: `TOOL_NAME`

**Parameters**:

- PARAMETER_NAME: PARAMETER_DESCRIPTION

**Important Notes**:

- IMPORTANT_NOTE_1
- IMPORTANT_NOTE_2
- IMPORTANT_NOTE_3

**Example**:

```xml
<TOOL_NAME>
<PARAMETER_NAME>PARAMETER_VALUE</PARAMETER_NAME>
</TOOL_NAME>
```

**After Tool Completes**:

- NEXT_ACTION_1
- NEXT_ACTION_2
- NEXT_ACTION_3

---

## Phase 3: Main Processing

**Purpose**: Execute core functionality with comprehensive processing.

### Step 3.1: Check for Existing Artifacts

**If artifacts exists:**

- ACTION_1
- ACTION_2
- ACTION_3

**When things happen:**

- ACTION_1
- ACTION_2
- ACTION_3

**If processing should continue:**

- Proceed to Step 3.2

**If steps should be skipped:**

- Proceed to Step 3.4

### Step 3.2: Execute tools if needed

**Tool**: `TOOL_NAME`

**Parameters**:

- PARAMETER_NAME: PARAMETER_DESCRIPTION

**Important Notes**:

- IMPORTANT_NOTE_1
- IMPORTANT_NOTE_2
- IMPORTANT_NOTE_3

**Example**:

```xml
<TOOL_NAME>
<PARAMETER_NAME>PARAMETER_VALUE</PARAMETER_NAME>
</TOOL_NAME>
```

**Tool Output**:

```json
{
  "FIELD_NAME": "FIELD_VALUE"
}
```

After this tool completes, DESCRIBE_ADDITIONAL_STEPS.

## Phase 4: Maintenance & Validation

**Purpose**: Follow up with any remaining tasks after the workflow finishes.

### Step 4.1: Follow up task 1

**CRITICAL RULE**: DESCRIBE_CRITICAL_RULE_TO_FOLLOW.

### Step 4.2: Follow up task 2

**After doing the prior**, continue with a different tool call if needed.

**Tool**: `TOOL_NAME`

**What Happens**:

1. REASON_1
2. REASON_2
3. REASON_3
4. REASON_4
5. REASON_5

---

## AGENTS.md Enforcement

**After successful COMPLETION_CONDITION**, you MUST update AGENTS.md if it exists and requires any updating.

**Check**: Does `AGENTS.md` exist in workspace root?

**If YES**:
Use `BOB_TOOL_APPLY_DIFF` or `BOB_TOOL_WRITE_FILE` to add or update the relevant data:

```markdown
## SECTION_TITLE

CONTENT_TO_ADD_OR_UPDATE
```

**If NO**: No action needed.

---

## Common Scenarios

### Scenario 1: SCENARIO_DESCRIPTION

1. STEP_1
2. STEP_2
3. STEP_3
4. STEP_4

### Scenario 2: SCENARIO_DESCRIPTION

1. STEP_1
2. STEP_2
3. STEP_3
4. STEP_4

---

## Troubleshooting

### Issue 1: ISSUE_DESCRIPTION

**Cause**: CAUSE_DESCRIPTION

**Solution**:

- SOLUTION_1
- SOLUTION_2

### Issue 2: ISSUE_DESCRIPTION

**Cause**: CAUSE_DESCRIPTION

**Solution**:

- SOLUTION_1
- SOLUTION_2

---

## Best Practices

### For Optimal Results

1. **BEST_PRACTICE_1** - DESCRIPTION
2. **BEST_PRACTICE_2** - DESCRIPTION
3. **BEST_PRACTICE_3** - DESCRIPTION

### For Efficiency

1. **EFFICIENCY_TIP_1** - DESCRIPTION
2. **EFFICIENCY_TIP_2** - DESCRIPTION
3. **EFFICIENCY_TIP_3** - DESCRIPTION
4. **EFFICIENCY_TIP_4** - DESCRIPTION

### For Quality

1. **QUALITY_TIP_1** - DESCRIPTION
2. **QUALITY_TIP_2** - DESCRIPTION
3. **QUALITY_TIP_3** - DESCRIPTION

---

## Artifact Schema

> if artifacts are involved

**File**: `FILENAME`

**Version**: VERSION_NUMBER

**Structure**:

```text
ARTIFACT_STRUCTURE_EXAMPLE
```

**Field Descriptions**:

> ex for a json file

- `FIELD_NAME`: FIELD_DESCRIPTION
- `FIELD_NAME`: FIELD_DESCRIPTION
  - `NESTED_FIELD`: FIELD_DESCRIPTION

---

## Summary

This skill demonstrates the complete structure for Bob Z skills:

1. **SUMMARY_POINT_1** - HIGH_LEVEL_DESCRIPTION
2. **SUMMARY_POINT_2** - HIGH_LEVEL_DESCRIPTION
3. **SUMMARY_POINT_3** - HIGH_LEVEL_DESCRIPTION

By following this structure, you create comprehensive, maintainable skills that support effective automation and knowledge transfer.
