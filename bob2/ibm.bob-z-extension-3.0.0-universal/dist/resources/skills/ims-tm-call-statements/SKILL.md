---
name: ims-tm-call-statements
description: Handles IMS Transaction Manager (TM) call statement translation during IMS COBOL/PL/I to Java transformation. Use when translating IMS TM calls (GU, GN, ISRT, PURGE, CHANGE) to Java MessageQueue API. Ensures correct method names (getUnique, getNext, insert), proper return type handling (boolean vs void), source-driven status code checks, and correct IOMessage interface usage.
---

# IMS TM Call Statements Guardrails

This skill provides the single source of truth for translating IMS Transaction Manager call statements during COBOL/PL/I to Java transformation.

## Prerequisites

Before using this skill, ensure:

- IMS transformation workflow is active
- Source code contains IMS TM call statements (CBLTDLI/PLITDLI calls)
- IOMessage classes are generated and available
- MessageQueue API is available in the target environment
- Status code handling skill is available (ims_status_codes)

## Overview

IMS Transaction Manager programs use call statements to interact with message queues. This skill ensures:

1. **Correct Method Names** - Use exact MessageQueue API methods (getUnique, getNext, insert, etc.)
2. **Return Type Handling** - Boolean for get methods, void for insert/purge/change
3. **Source-Driven Status Checks** - Only generate status checks that exist in source code
4. **IOMessage Interface** - Use IOMessage type, never concrete classes
5. **Coding Standards** - Apply AGENTS.md documentation and formatting standards

**CRITICAL**: Method names are exact and non-negotiable. Never use generic "get()" method - use getUnique() or getNext() specifically.

---

## Complete Workflow

### Phase 1: Pre-Translation Analysis (MANDATORY)

**Purpose**: Identify status code checks before generating any Java code.

#### Step 1.1: Scan for Status Check Patterns

**After each TM call statement**, scan the following source lines for status check patterns:

**PL/I Patterns**:

```pli
IF LTERMPCB.TPSTAT ^= ' ' THEN ...
IF LTERMPCB.TPSTAT = SPACES THEN ...
IF TPSTAT ^= ' ' THEN ...
```

**COBOL Patterns**:

```cobol
IF TPSTAT NOT = SPACES ...
IF TPSTAT = SPACES ...
```

#### Step 1.2: Document Status Checks

**For each TM call**, document:

1. Call type (GU, GN, ISRT, etc.)
2. Whether status check exists in source
3. Status check conditions (if present)

**⛔ CRITICAL**: This pre-check is NON-NEGOTIABLE. Failure to scan for status checks will cause silent failures.

---

## Phase 2: Method Translation Rules

**Purpose**: Generate correct Java method calls based on TM call type.

### Step 2.1: GetUnique (GU) - Returns Boolean

**Description**: Retrieves a unique message from the queue.

**Source Patterns**:

```cobol
CALL 'CBLTDLI' USING DLI-GU IOPCB INPUT-AREA.
```

```pli
CALL PLITDLI (THREE, GU, LTERMPCB, INPUT_AREA);
```

**Java Translation**:

```java
boolean retrieved = messageQueue.getUnique(inputArea);
```

**Return Type**: `boolean` - MUST assign to variable or use in conditional

**⛔ FORBIDDEN**:

```java
// ❌ WRONG - No such method exists
messageQueue.get(inputArea, MessageQueue.DEFAULT_DESTINATION);

// ❌ WRONG - Generic "get()" doesn't exist
messageQueue.get(inputArea);
```

### Step 2.2: GetNext (GN) - Returns Boolean

**Description**: Retrieves the next message from the queue.

**Source Patterns**:

```cobol
CALL 'CBLTDLI' USING DLI-GN IOPCB INPUT-AREA.
```

```pli
CALL PLITDLI (THREE, GN, LTERMPCB, INPUT_AREA);
```

**Java Translation**:

```java
boolean hasNext = messageQueue.getNext(inputArea);
```

**Return Type**: `boolean` - MUST assign to variable or use in conditional

**⛔ FORBIDDEN**:

```java
// ❌ WRONG - No such method exists
messageQueue.get(inputArea, MessageQueue.DEFAULT_DESTINATION);
```

### Step 2.3: Insert (ISRT) - Returns Void

**Description**: Inserts a message into the queue.

**Source Patterns**:

```cobol
CALL 'CBLTDLI' USING DLI-ISRT IOPCB OUTPUT-AREA.
```

```pli
CALL PLITDLI (THREE, ISRT, LTERMPCB, OUTPUT_AREA);
```

**Java Translation**:

```java
messageQueue.insert(outputArea, MessageQueue.DEFAULT_DESTINATION);
```

**Return Type**: `void` - NEVER assign to variable

**Second Parameter Required**: Must include destination parameter:

- `MessageQueue.DEFAULT_DESTINATION` (most common)
- `MessageDestinationSpec` object (for alternate destinations)

**⛔ FORBIDDEN**:

```java
// ❌ WRONG - insert returns void, cannot assign
boolean result = messageQueue.insert(outputArea, MessageQueue.DEFAULT_DESTINATION);

// ❌ WRONG - Cannot use in conditional
if (messageQueue.insert(outputArea, MessageQueue.DEFAULT_DESTINATION)) { ... }

// ❌ WRONG - Missing second parameter
messageQueue.insert(outputArea);
```

### Step 2.4: Purge (PURGE) - Returns Void

**Description**: Purges messages from the queue.

**Source Patterns**:

```cobol
CALL 'CBLTDLI' USING DLI-PURGE IOPCB.
```

```pli
CALL PLITDLI (TWO, PURGE, LTERMPCB);
```

**Java Translation**:

```java
messageQueue.purge();
```

**Return Type**: `void` - NEVER assign to variable

### Step 2.5: Change (CHNG) - Returns Void

**Description**: Changes message destination.

**Source Patterns**:

```cobol
CALL 'CBLTDLI' USING DLI-CHNG IOPCB DEST-AREA.
```

```pli
CALL PLITDLI (THREE, CHNG, LTERMPCB, DEST_AREA);
```

**Java Translation**:

```java
messageQueue.change(destArea);
```

**Return Type**: `void` - NEVER assign to variable

---

## Phase 3: Status Code Handling (Source-Driven)

**Purpose**: Generate status code checks only when present in source code.

### Step 3.1: Status Code Access Pattern

**Access Pattern for TM Programs**:

```java
Short statusCode = messageQueue.getAIB().getIOPCB().getStatusCode();
```

**Type**: `Short` (NOT String)

**Constants**: Use `StatusCodeHelper` class

```java
StatusCodeHelper.BLANKS  // Successful operation
StatusCodeHelper.QC      // No more messages
StatusCodeHelper.CF      // Conversational mode
```

### Step 3.2: Source-Driven Translation Rule

**⚠️ CRITICAL RULE**: Status code checks are SOURCE-DRIVEN

**Rule**:

- IF source checks PCB.TPSTAT or TPSTAT after TM call
- THEN generate status code check after messageQueue method
- IF source does NOT check status after TM call
- THEN do NOT generate status code check

**Example with Status Check**:

Source:

```cobol
CALL 'CBLTDLI' USING DLI-ISRT IOPCB OUTPUT-AREA.
IF TPSTAT NOT = SPACES
    DISPLAY 'INSERT FAILED: ' TPSTAT.
```

Java:

```java
messageQueue.insert(outputArea, MessageQueue.DEFAULT_DESTINATION);

// Only because source checks status:
Short statusCode = messageQueue.getAIB().getIOPCB().getStatusCode();
if (statusCode != StatusCodeHelper.BLANKS) {
    System.out.println("INSERT FAILED: " + statusCode);
}
```

**Example without Status Check**:

Source:

```cobol
CALL 'CBLTDLI' USING DLI-ISRT IOPCB OUTPUT-AREA.
PERFORM NEXT-OPERATION.
```

Java:

```java
messageQueue.insert(outputArea, MessageQueue.DEFAULT_DESTINATION);
// No status check - source doesn't have one
```

### Step 3.3: Complete Status Check Pattern

**Example with Multiple Conditions**:

Source PL/I:

```pli
CALL PLITDLI (THREE, GU, LTERMPCB, INPUT_AREA);
IF LTERMPCB.TPSTAT = SPACES OR LTERMPCB.TPSTAT = 'CF' THEN
    /* Process message */
ELSE
    IF LTERMPCB.TPSTAT ^= 'QC' THEN
        Display('ERROR: ' || LTERMPCB.TPSTAT);
    END IF;
END IF;
```

Generated Java:

```java
boolean retrieved = messageQueue.getUnique(inputArea);
Short statusCode = messageQueue.getAIB().getIOPCB().getStatusCode();

if (statusCode == StatusCodeHelper.BLANKS || statusCode == StatusCodeHelper.CF) {
    // Process message
} else {
    if (statusCode != StatusCodeHelper.QC) {
        System.out.println("ERROR: " + statusCode);
    }
}
```

---

## Phase 4: IOMessage Interface Usage

**Purpose**: Ensure correct IOMessage interface usage in TM calls.

### Step 4.1: IOMessage Declaration and Initialization

**Declaration Pattern**:

```java
private static IOMessage inputArea;
private static IOMessage outputArea;
```

**Initialization Pattern**:

```java
inputArea = application.getIOMessage("class://com.ibm.wcaz.implementation.InputArea");
outputArea = application.getIOMessage("class://com.ibm.wcaz.implementation.OutputArea");
```

**⛔ CRITICAL RULES**:

- ✅ Declare as `IOMessage` type (NOT concrete class type)
- ✅ Initialize using `application.getIOMessage()`
- ✅ Use fully qualified class name with "class://" prefix
- ❌ FORBIDDEN: `new InputArea()` - Never instantiate directly
- ❌ FORBIDDEN: Declaring as concrete class type

### Step 4.2: Field Access in IOMessage

**Use generic methods with field names**:

```java
// Read access
String value = inputArea.getString("FIELD_NAME");
int count = inputArea.getInt("COUNT_FIELD");

// Write access
outputArea.setString("FIELD_NAME", "value");
outputArea.setInt("COUNT_FIELD", 100);
```

**⛔ FORBIDDEN**:

```java
// ❌ WRONG - Class-specific getters/setters
inputArea.getFieldName();
outputArea.setFieldName(value);
```

### Step 4.3: IOMessage Initialization (clear method)

**Source Patterns**:

```cobol
MOVE ZEROS TO OUTPUT-AREA.
MOVE SPACES TO OUTPUT-AREA.
INITIALIZE OUTPUT-AREA.
```

**Correct Translation**:

```java
outputArea.clear();
```

**⛔ FORBIDDEN**:

```java
// ❌ WRONG - Never use setBytes() to clear
outputArea.setBytes(new byte[outputArea.getActualLength()]);
```

---

## Phase 5: Coding Standards Compliance

**Purpose**: Apply AGENTS.md coding standards to translated TM call methods.

### Step 5.1: Documentation Standards

**Method-Level JavaDoc**:

```java
/**
 * Retrieves the next message from the IMS message queue.
 * Translates COBOL GN (Get Next) call to Java MessageQueue API.
 *
 * @throws DLIException if message retrieval fails
 */
public static void getNextMessage() throws DLIException {
    // Retrieve next message from queue
    boolean hasNext = messageQueue.getNext(inputArea);

    if (hasNext) {
        // Check status code for errors
        Short statusCode = messageQueue.getAIB().getIOPCB().getStatusCode();

        if (statusCode != StatusCodeHelper.BLANKS) {
            if (statusCode == StatusCodeHelper.QC) {
                // No more segments available
                System.out.println("No more messages in queue");
            } else {
                // Handle other error conditions
                throw new IMSException("TM call failed with status: " + statusCode);
            }
        }
    }
}
```

**Inline Comments for Complex Logic**:

```java
// Retrieve next message from queue
boolean hasNext = messageQueue.getNext(inputArea);

// Check status code for errors
Short statusCode = messageQueue.getAIB().getIOPCB().getStatusCode();
```

### Step 5.2: Formatting Standards

**Apply from AGENTS.md**:

- 4-space indentation
- 120-character line width
- Double quotes for strings
- Proper spacing around operators

**⛔ CRITICAL**: Apply ONLY documentation and formatting standards, NOT naming conventions (method/variable names follow translation rules).

---

## Phase 6: Complete Workflow Pattern

**Purpose**: Show complete translation including LL field handling and status checks.

### Step 6.1: Complete Example

**Source Pattern**:

```pli
MESSAGE_STRUCT.LL_FIELD = LENGTH_VALUE;
CALL PLITDLI (THREE, ISRT, LTERMPCB, MESSAGE_STRUCT);
IF LTERMPCB.TPSTAT ^= ' ' THEN Display('Failed: ' || LTERMPCB.TPSTAT);
```

**Translation Steps**:

1. LL field write → `// Unsupported translation of LL field`
2. TM call → `messageQueue.insert(messageObject, MessageQueue.DEFAULT_DESTINATION);`
3. Status check → `Short statusCode = ...; if (statusCode != StatusCodeHelper.BLANKS) {...}`

**Correct Output**:

```java
public void methodName() throws DLIException {
    // Unsupported translation of LL field
    messageQueue.insert(messageObject, MessageQueue.DEFAULT_DESTINATION);

    Short statusCode = messageQueue.getAIB().getIOPCB().getStatusCode();
    if (statusCode != StatusCodeHelper.BLANKS) {
        System.out.println("Failed: " + statusCode);
    }
}
```

### Step 6.2: Verification Checklist

**BEFORE completing translation**, verify:

- [ ] LL field write → comment only (no setter)
- [ ] TM call translated correctly with exact method name
- [ ] Status check present if in source
- [ ] No cross-procedure contamination
- [ ] Line count reasonable (~1.3x source lines)
- [ ] IOMessage interface used (not concrete classes)
- [ ] Return types handled correctly (boolean vs void)

---

## Quick Reference Table

### TM Call Method Mapping

| Source Call | Java Method                                   | Return Type | Parameters             |
| ----------- | --------------------------------------------- | ----------- | ---------------------- |
| GU          | `messageQueue.getUnique(ioMessage)`           | boolean     | IOMessage              |
| GN          | `messageQueue.getNext(ioMessage)`             | boolean     | IOMessage              |
| ISRT        | `messageQueue.insert(ioMessage, destination)` | void        | IOMessage, destination |
| PURGE       | `messageQueue.purge()`                        | void        | none                   |
| CHNG        | `messageQueue.change(destArea)`               | void        | IOMessage              |

### Return Type Rules

| Method Type | Return Type | Usage                                          | Forbidden                                  |
| ----------- | ----------- | ---------------------------------------------- | ------------------------------------------ |
| getUnique   | boolean     | `boolean result = messageQueue.getUnique(...)` | Cannot ignore return value                 |
| getNext     | boolean     | `boolean result = messageQueue.getNext(...)`   | Cannot ignore return value                 |
| insert      | void        | `messageQueue.insert(...)`                     | Cannot assign: `boolean result = insert()` |
| purge       | void        | `messageQueue.purge()`                         | Cannot assign: `boolean result = purge()`  |
| change      | void        | `messageQueue.change(...)`                     | Cannot assign: `boolean result = change()` |

### Status Code Access

| Program Type | Access Pattern                                     | Type  |
| ------------ | -------------------------------------------------- | ----- |
| TM           | `messageQueue.getAIB().getIOPCB().getStatusCode()` | Short |

---

## Common Scenarios

### Scenario 1: GetUnique with Status Check

**Source COBOL**:

```cobol
CALL 'CBLTDLI' USING DLI-GU IOPCB INPUT-AREA.
IF TPSTAT = SPACES
    PERFORM PROCESS-MESSAGE
ELSE
    IF TPSTAT NOT = 'QC'
        DISPLAY 'ERROR: ' TPSTAT.
```

**Workflow**:

1. Identify call type: GU → getUnique
2. Scan for status check: Found `IF TPSTAT = SPACES`
3. Generate getUnique call with boolean return
4. Generate status check code

**Generated Java**:

```java
boolean retrieved = messageQueue.getUnique(inputArea);
Short statusCode = messageQueue.getAIB().getIOPCB().getStatusCode();

if (statusCode == StatusCodeHelper.BLANKS) {
    // Process message
} else if (statusCode != StatusCodeHelper.QC) {
    System.out.println("ERROR: " + statusCode);
}
```

### Scenario 2: Insert without Status Check

**Source COBOL**:

```cobol
CALL 'CBLTDLI' USING DLI-ISRT IOPCB OUTPUT-AREA.
PERFORM NEXT-OPERATION.
```

**Workflow**:

1. Identify call type: ISRT → insert
2. Scan for status check: None found
3. Generate insert call (void return)
4. Do NOT generate status check

**Generated Java**:

```java
messageQueue.insert(outputArea, MessageQueue.DEFAULT_DESTINATION);
// No status check - source doesn't have one
```

### Scenario 3: Insert with Status Check

**Source COBOL**:

```cobol
CALL 'CBLTDLI' USING DLI-ISRT IOPCB OUTPUT-AREA.
IF TPSTAT NOT = SPACES
    DISPLAY 'INSERT FAILED WITH STATUS: ' TPSTAT.
```

**Workflow**:

1. Identify call type: ISRT → insert
2. Scan for status check: Found `IF TPSTAT NOT = SPACES`
3. Generate insert call (void return)
4. Generate status check code

**Generated Java**:

```java
messageQueue.insert(outputArea, MessageQueue.DEFAULT_DESTINATION);

// Only because source checks status:
Short statusCode = messageQueue.getAIB().getIOPCB().getStatusCode();
if (statusCode != StatusCodeHelper.BLANKS) {
    System.out.println("INSERT FAILED WITH STATUS: " + statusCode);
}
```

---

## Troubleshooting

### Issue 1: Using Generic "get()" Method

**Symptom**: Generated code like `messageQueue.get(inputArea)`

**Cause**: Used generic method name instead of specific method

**Solution**:

1. Use exact method names: `getUnique()` or `getNext()`
2. Never use generic `get()` method - it doesn't exist
3. Check source call type (GU vs GN) to determine correct method

### Issue 2: Assigning Void Return Value

**Symptom**: Code like `boolean result = messageQueue.insert(...)`

**Cause**: Treated insert/purge/change as returning boolean

**Solution**:

1. Check return type table
2. Get methods (getUnique, getNext) return boolean
3. Insert/purge/change methods return void
4. Never assign void methods to variables

### Issue 3: Missing Status Check from Source

**Symptom**: Java code missing status check that exists in source

**Cause**: Skipped pre-translation status check scan

**Solution**:

1. Always scan lines after TM call for status patterns
2. Generate corresponding Java code for each found pattern
3. Verify counts match before completing

### Issue 4: Adding Status Check Not in Source

**Symptom**: Java code has status check, but source doesn't

**Cause**: Added "helpful" status check that wasn't in original code

**Solution**:

1. Status checks are source-driven only
2. Never add status checks not present in source
3. Remove any status checks not found in source code

### Issue 5: Wrong IOMessage Usage

**Symptom**: Code like `new InputArea()` or `InputArea inputArea`

**Cause**: Instantiated concrete class instead of using IOMessage interface

**Solution**:

1. Always declare as `IOMessage` type
2. Initialize using `application.getIOMessage()`
3. Never instantiate concrete classes directly
4. Use generic field access methods

---

## Best Practices

### For Accurate Translation

1. **Pre-scan for status checks** - Always scan source after TM calls before generating code
2. **Use exact method names** - getUnique, getNext, insert (never generic "get")
3. **Handle return types correctly** - Boolean for get methods, void for others
4. **Source-driven status checks** - Only generate checks that exist in source

### For Correct API Usage

1. **IOMessage interface** - Always use IOMessage type, never concrete classes
2. **Full status code chain** - Use `messageQueue.getAIB().getIOPCB().getStatusCode()`
3. **StatusCodeHelper constants** - Use StatusCodeHelper.BLANKS, etc.
4. **Insert destination parameter** - Always include second parameter for insert()

### For Quality Assurance

1. **Verify method names** - Check against method mapping table
2. **Count status checks** - Source checks must equal Java checks
3. **Review return types** - Ensure boolean/void handled correctly
4. **Check IOMessage usage** - Verify interface type and initialization

---

## Integration with Other Skills

This skill works with:

- **ims_status_codes** - Status code access patterns and constants
- **ims_message_class** - IOMessage class generation and field access
- **ims_special_fields** - LL/ZZ/TRANCODE field handling
- **ims_field_access** - IOMessage field access methods
- **coding_standards_builder** - AGENTS.md documentation and formatting

---

## Critical Warnings

**⚠️ METHOD NAMES ARE EXACT - DO NOT USE GENERIC "get()" METHOD ⚠️**
**⚠️ ALWAYS SCAN FOR STATUS CHECKS BEFORE TRANSLATION ⚠️**
**⚠️ STATUS CHECKS ARE SOURCE-DRIVEN - NON-NEGOTIABLE ⚠️**
**⚠️ USE IOMessage INTERFACE, NEVER CONCRETE CLASSES ⚠️**
**⚠️ HANDLE RETURN TYPES CORRECTLY - BOOLEAN VS VOID ⚠️**

---

## Summary

This skill ensures correct IMS TM call statement translation:

1. **Exact Method Names** - Use getUnique, getNext, insert (never generic "get")
2. **Return Type Handling** - Boolean for get methods, void for insert/purge/change
3. **Source-Driven Status Checks** - Only generate checks that exist in source code
4. **IOMessage Interface** - Use IOMessage type with application.getIOMessage()
5. **Coding Standards** - Apply AGENTS.md documentation and formatting standards

By following these guardrails, you ensure IMS TM call statements are accurately translated to Java MessageQueue API calls with correct method names, return types, and status code handling.
