---
name: ims-status-codes
description: Handles IMS status code checking and translation during IMS COBOL/PL/I to Java transformation. Use when translating IMS TM (Transaction Manager) or DB (Database) call statements that include status code checks. Ensures status codes use correct access patterns (Short type), proper constants (StatusCodeHelper), and source-driven translation (only generate checks that exist in source code).
---

# IMS Status Codes Guardrails

This skill provides critical rules for detecting and translating IMS status code checks during COBOL/PL/I to Java transformation. It defines the single source of truth for status code handling in both TM and DB programs.

## Prerequisites

Before using this skill, ensure:

- IMS transformation workflow is active
- Source code contains IMS call statements (GU, GN, ISRT, REPL, DLET, etc.)
- Source code may contain status code checks after IMS calls
- Metadata includes PCB (Program Communication Block) information

## Overview

IMS programs check status codes after database and transaction manager operations to detect errors. This skill ensures:

1. **Correct Access Patterns** - Different paths for TM vs DB programs
2. **Proper Type Usage** - Status codes are Short, NOT String
3. **Source-Driven Translation** - Only generate checks that exist in source
4. **Correct Constants** - Use StatusCodeHelper class for all status code constants

**CRITICAL**: Status code checks are **source-driven**. Never add status checks that don't exist in the original source code.

---

## Complete Workflow

### Phase 1: Source Code Analysis (MANDATORY PRE-CHECK)

**Purpose**: Identify status code checks in source code before generating any Java code.

#### Step 1.1: Scan for Status Check Patterns

**After each IMS call statement**, scan the following source lines for status check patterns:

**PL/I Patterns**:

```pli
IF LTERMPCB.TPSTAT ^= ' ' THEN ...
IF LTERMPCB.TPSTAT = SPACES THEN ...
IF TPSTAT ^= ' ' THEN ...
IF DBPCB.DBSTAT ^= ' ' THEN ...
```

**COBOL Patterns**:

```cobol
IF TPSTAT NOT = SPACES ...
IF TPSTAT = SPACES ...
IF DBSTAT NOT = SPACES ...
```

#### Step 1.2: Determine Program Type

**Identify whether this is a TM or DB program**:

- **TM Program**: Uses IOPCB (I/O PCB) for message queue operations
- **DB Program**: Uses database PCBs for database operations

**Detection Method**:

- Check the IMS call type (GU on message queue = TM, GU with SSA = DB)
- Check PCB type in metadata (IOPCB vs database PCB)

#### Step 1.3: Count Status Checks

**Before completing translation**:

1. Count status checks in source code
2. Count status checks in generated Java code
3. Verify counts match (source vs Java)

**⛔ CRITICAL**: If counts don't match, review and fix before completing translation.

---

## Phase 2: Translation Rules

**Purpose**: Generate correct Java code based on program type and source patterns.

### Step 2.1: TM Program Status Code Access

**Description**: Transaction Manager programs check status after message queue operations.

**Access Pattern**:

```java
Short statusCode = messageQueue.getAIB().getIOPCB().getStatusCode();
```

**Type**: `Short` (NOT String)

**Usage**: Check status after GU, GN, ISRT, PURGE, CHANGE operations

**Example - Insert with Status Check**:

Source COBOL:

```cobol
CALL 'CBLTDLI' USING DLI-ISRT
                     IOPCB
                     OUTPUT-AREA.
IF TPSTAT NOT = SPACES
    DISPLAY 'INSERT FAILED WITH STATUS: ' TPSTAT.
```

Generated Java:

```java
messageQueue.insert(outputArea, MessageQueue.DEFAULT_DESTINATION);

// Only because source checks status after ISRT:
Short statusCode = messageQueue.getAIB().getIOPCB().getStatusCode();
if (statusCode != StatusCodeHelper.BLANKS) {
    System.out.println("INSERT FAILED WITH STATUS: " + statusCode);
}
```

**Example - Get with Status Check**:

Source COBOL:

```cobol
CALL 'CBLTDLI' USING DLI-GU
                     IOPCB
                     INPUT-AREA.
IF TPSTAT = SPACES OR TPSTAT = 'CF'
    PERFORM PROCESS-MESSAGE
ELSE
    IF TPSTAT NOT = 'QC'
        DISPLAY 'ERROR: ' TPSTAT.
```

Generated Java:

```java
boolean retrieved = messageQueue.getUnique(inputArea);
Short statusCode = messageQueue.getAIB().getIOPCB().getStatusCode();

if (statusCode == StatusCodeHelper.BLANKS || statusCode == StatusCodeHelper.CF) {
    // Process message
} else if (statusCode != StatusCodeHelper.QC) {
    System.out.println("ERROR: " + statusCode);
}
```

**CRITICAL RULES**:

- ✅ Use full chain: `messageQueue.getAIB().getIOPCB().getStatusCode()`
- ✅ Type is `Short`, not `String`
- ✅ Use `StatusCodeHelper` constants
- ❌ FORBIDDEN: `messageQueue.getStatus()` (incomplete chain)
- ❌ FORBIDDEN: `messageQueue.getStatusCode()` (incomplete chain)

### Step 2.2: DB Program Status Code Access

**Description**: Database programs check status after database operations.

**Access Pattern**:

```java
Short statusCode = pcb.getDBPCB().getReturnCode();
```

**Type**: `Short` (NOT String)

**Usage**: Check status after GU, GHU, GN, GHN, GNP, GHNP, REPL, DLET, ISRT operations

**Example - Get with Status Check**:

Source COBOL:

```cobol
CALL 'CBLTDLI' USING DLI-GU
                     DBPCB
                     SEGMENT-AREA
                     SSA-1.
IF DBSTAT NOT = SPACES
    IF DBSTAT = 'GE'
        DISPLAY 'SEGMENT NOT FOUND'
    ELSE
        DISPLAY 'DB CALL FAILED: ' DBSTAT
        STOP RUN.
```

Generated Java:

```java
boolean retrieved = pcb.getUnique(path, ssaList, false);
Short statusCode = pcb.getDBPCB().getReturnCode();

if (statusCode != StatusCodeHelper.BLANKS) {
    if (statusCode == StatusCodeHelper.GE) {
        System.out.println("SEGMENT NOT FOUND");
    } else {
        System.out.println("DB CALL FAILED: " + statusCode);
        throw new DLIException("DB call failed: " + statusCode);
    }
}
```

**CRITICAL RULES**:

- ✅ Use full chain: `pcb.getDBPCB().getReturnCode()`
- ✅ Type is `Short`, not `String`
- ✅ Use `StatusCodeHelper` constants
- ❌ FORBIDDEN: `pcb.getStatus()` (incomplete chain)
- ❌ FORBIDDEN: `pcb.getReturnCode()` (missing AIB)

### Step 2.3: Status Code Constants

**Description**: All status code constants must use the StatusCodeHelper class.

**Correct Usage**:

```java
StatusCodeHelper.BLANKS  // Successful operation (spaces)
StatusCodeHelper.QC      // No more messages
StatusCodeHelper.CF      // Conversational mode
StatusCodeHelper.GB      // End of database
StatusCodeHelper.GE      // Segment not found
```

**Forbidden Patterns** (CRITICAL):

```java
// ❌ WRONG - Don't use these patterns:
STATUS_CODE_BLANKS           // Wrong constant name
STATUS_CODE_QC               // Wrong constant name
StatusCode.BLANKS            // Wrong class name
"BLANKS"                     // String literal instead of Short
" "                          // String literal for spaces
```

**Type Enforcement**:

- Status codes are `Short` type
- NOT `String` type
- NOT `int` type
- Use `StatusCodeHelper` constants which return `Short`

---

## Phase 3: Source-Driven Translation (CRITICAL)

**Purpose**: Ensure translation fidelity - only generate code that exists in source.

### Step 3.1: The Golden Rule

#### ⚠️ STATUS CHECKS ARE SOURCE-DRIVEN ⚠️

1. **Only generate status checks if present in source code**
2. **Do NOT add status checks that don't exist in source**
3. **Each source status check MUST have corresponding Java code**

### Step 3.2: Verification Checklist

**BEFORE completing translation**, verify:

- [ ] Scanned source code AFTER each IMS call for status check patterns
- [ ] For each status check found, generated corresponding Java code
- [ ] Counted status checks in source vs Java (counts must match)
- [ ] Used correct access pattern (TM vs DB)
- [ ] Used Short type (not String)
- [ ] Used StatusCodeHelper constants

### Step 3.3: Common Mistakes to Avoid

#### Mistake 1: Adding Helpful Status Checks

```java
// ❌ WRONG - Source doesn't check status
messageQueue.insert(outputArea, MessageQueue.DEFAULT_DESTINATION);
Short statusCode = messageQueue.getAIB().getIOPCB().getStatusCode();
if (statusCode != StatusCodeHelper.BLANKS) {
    // This check wasn't in source - DON'T ADD IT
}
```

#### Mistake 2: Skipping Existing Status Checks

```cobol
* Source has status check
CALL 'CBLTDLI' USING DLI-ISRT IOPCB OUTPUT-AREA.
IF TPSTAT NOT = SPACES
    DISPLAY 'ERROR'.
```

```java
// ❌ WRONG - Missing status check that exists in source
messageQueue.insert(outputArea, MessageQueue.DEFAULT_DESTINATION);
// Where's the status check?
```

#### Mistake 3: Wrong Access Pattern

```java
// ❌ WRONG - Incomplete chain
Short statusCode = messageQueue.getStatusCode();

// ✅ CORRECT - Full chain
Short statusCode = messageQueue.getAIB().getIOPCB().getStatusCode();
```

---

## Quick Reference Table

| Program Type | Access Pattern                                     | Type  | Use After Operations                          |
| ------------ | -------------------------------------------------- | ----- | --------------------------------------------- |
| TM           | `messageQueue.getAIB().getIOPCB().getStatusCode()` | Short | GU, GN, ISRT, PURGE, CHANGE                   |
| DB           | `pcb.getAIB().getDBPCB().getStatusCode()`          | Short | GU, GHU, GN, GHN, GNP, GHNP, REPL, DLET, ISRT |

| Constant                | Usage                | Type  |
| ----------------------- | -------------------- | ----- |
| StatusCodeHelper.BLANKS | Successful operation | Short |
| StatusCodeHelper.QC     | No more messages     | Short |
| StatusCodeHelper.CF     | Conversational mode  | Short |
| StatusCodeHelper.GB     | End of database      | Short |
| StatusCodeHelper.GE     | Segment not found    | Short |

---

## Common Scenarios

### Scenario 1: TM Insert Without Status Check

**Source COBOL**:

```cobol
CALL 'CBLTDLI' USING DLI-ISRT
                     IOPCB
                     OUTPUT-AREA.
PERFORM NEXT-OPERATION.
```

**Workflow**:

1. Scan lines after ISRT call
2. No status check pattern found
3. Do NOT generate status check code

**Generated Java**:

```java
messageQueue.insert(outputArea, MessageQueue.DEFAULT_DESTINATION);
// No status check - source doesn't have one
```

### Scenario 2: DB Get With Status Check

**Source COBOL**:

```cobol
CALL 'CBLTDLI' USING DLI-GU
                     DBPCB
                     SEGMENT-AREA
                     SSA-1.
IF DBSTAT = SPACES
    PERFORM PROCESS-SEGMENT
ELSE
    DISPLAY 'ERROR: ' DBSTAT.
```

**Workflow**:

1. Scan lines after GU call
2. Found status check: `IF DBSTAT = SPACES`
3. Identify as DB program (database PCB)
4. Generate status check with correct access pattern

**Generated Java**:

```java
boolean retrieved = pcb.getUnique(path, ssaList, false);
Short statusCode = pcb.getAIB().getDBPCB().getStatusCode();

if (statusCode == StatusCodeHelper.BLANKS) {
    // Process segment
} else {
    System.out.println("ERROR: " + statusCode);
}
```

### Scenario 3: Multiple Status Checks

**Source COBOL**:

```cobol
CALL 'CBLTDLI' USING DLI-GU IOPCB INPUT-AREA.
IF TPSTAT = SPACES
    PERFORM PROCESS-MSG.

CALL 'CBLTDLI' USING DLI-ISRT IOPCB OUTPUT-AREA.
IF TPSTAT NOT = SPACES
    DISPLAY 'INSERT FAILED'.
```

**Workflow**:

1. First call: Found status check → Generate Java status check
2. Second call: Found status check → Generate Java status check
3. Verify: 2 source checks = 2 Java checks ✓

**Generated Java**:

```java
boolean retrieved = messageQueue.getUnique(inputArea);
Short statusCode = messageQueue.getAIB().getIOPCB().getStatusCode();
if (statusCode == StatusCodeHelper.BLANKS) {
    // Process message
}

messageQueue.insert(outputArea, MessageQueue.DEFAULT_DESTINATION);
statusCode = messageQueue.getAIB().getIOPCB().getStatusCode();
if (statusCode != StatusCodeHelper.BLANKS) {
    System.out.println("INSERT FAILED");
}
```

---

## Troubleshooting

### Issue 1: Generated Status Check Not in Source

**Symptom**: Java code has status check, but source doesn't

**Cause**: Added "helpful" status check that wasn't in original code

**Solution**:

1. Review source code line-by-line after IMS call
2. Only generate status check if pattern exists in source
3. Remove any status checks not present in source

### Issue 2: Missing Status Check That Exists in Source

**Symptom**: Source has status check, but Java doesn't

**Cause**: Skipped status check detection step

**Solution**:

1. Always scan lines after IMS call for status patterns
2. Generate corresponding Java code for each found pattern
3. Verify counts match before completing

### Issue 3: Wrong Access Pattern

**Symptom**: Code like `messageQueue.getStatusCode()` generated

**Cause**: Used incomplete access chain

**Solution**:

1. TM programs: Use `messageQueue.getAIB().getIOPCB().getStatusCode()`
2. DB programs: Use `pcb.getAIB().getDBPCB().getStatusCode()`
3. Never use shortened versions

### Issue 4: String Type Instead of Short

**Symptom**: Code like `String statusCode = ...` generated

**Cause**: Used wrong type for status code

**Solution**:

1. Always use `Short` type for status codes
2. Use `StatusCodeHelper` constants (return Short)
3. Never use String literals like `" "` or `"BLANKS"`

---

## Best Practices

### For Accurate Detection

1. **Scan systematically** - Check every line after IMS call for status patterns
2. **Know the patterns** - Memorize PL/I and COBOL status check patterns
3. **Count and verify** - Always verify source vs Java status check counts

### For Correct Translation

1. **Use correct access pattern** - Different for TM vs DB programs
2. **Use Short type** - Never String or int
3. **Use StatusCodeHelper** - All constants from StatusCodeHelper class
4. **Preserve source logic** - Translate exact conditions from source

### For Quality Assurance

1. **Pre-check every IMS call** - Scan for status checks before generating code
2. **Verify access patterns** - Ensure full chain is used
3. **Review constants** - Check all StatusCodeHelper usage
4. **Final count verification** - Source checks = Java checks

---

## Integration with Other Skills

This skill works with:

- **ims-tm-call-statements** - TM call statement translation
- **ims-db-call-statements** - DB call statement translation
- **ims-program-class** - IMS Program class generation

---

## Critical Warning

**⚠️ FAILURE TO TRANSLATE STATUS CHECKS WILL CAUSE ⚠️**
**⚠️ SILENT FAILURES AND UNDETECTED ERRORS ⚠️**
**⚠️ ALWAYS SCAN SOURCE FOR STATUS PATTERNS BEFORE TRANSLATION ⚠️**
**⚠️ THIS IS NON-NEGOTIABLE - VERIFY BEFORE COMPLETING ⚠️**

---

## Summary

This skill ensures correct handling of IMS status codes during transformation:

1. **Source-Driven Translation** - Only generate status checks that exist in source code
2. **Correct Access Patterns** - Use full chain for TM (getIOPCB) and DB (getReturnCode)
3. **Proper Type Usage** - Status codes are Short, use StatusCodeHelper constants
4. **Mandatory Verification** - Count and verify status checks before completing

By following these guardrails, you ensure status code checks are accurately translated, preventing silent failures and undetected errors in the transformed Java code.
