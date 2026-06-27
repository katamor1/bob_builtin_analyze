---
name: cics-transformation
description: Mandatory rules for transforming COBOL or PL/I programs containing EXEC CICS statements into Java using official JCICS APIs. Use when transforming CICS programs, or mentions " "JCICS", "CICS transformation", "CICS to Java", "com.ibm.cics.server", "Program.link", "Task.getTask", "commarea".
---

# CICS Transformation Rules

Mandatory rules for transforming any COBOL or PL/I program containing EXEC CICS statements into Java using only the official JCICS APIs. These rules apply exclusively to the Transform phase.

## Overview

All CICS semantics in COBOL or PL/I must be implemented using the real JCICS APIs (those under `import com.ibm.cics.server.*;`), without substitutes, simulations, or custom emulations. No evaluation, fix-up, or secondary refinement passes are allowed.

## Prerequisites

Before transforming CICS programs, ensure:

- JCICS library dependencies are available in the project
- Source COBOL or PL/I program with EXEC CICS statements is accessible
- Understanding of JCICS API classes (Task, Program, File, Channel, Container, etc.)
- Java development environment is configured

## Core Principles

### Principle 1: Mandatory Use of JCICS APIs (CRITICAL)

**Rule:** All CICS-related behavior must use ONLY the classes provided under:

```java
import com.ibm.cics.server.*;
```

**CRITICAL Enforcement:**

- ❌ **NEVER** create custom classes that mimic JCICS types (e.g., fake Task, Program, CommAreaHolder, or File)
- ❌ **NEVER** use similarly named classes from any other package
- ❌ **NEVER** implement wrappers or helper classes that alter JCICS semantics
- ✅ **ALWAYS** use JCICS APIs directly if they provide the functionality

### Principle 2: Special Handling for EXEC CICS RETURN (CRITICAL)

**Rule:** JCICS does not provide a RETURN API. Therefore, EXEC CICS RETURN must be implemented as a normal Java `return` statement.

**CRITICAL Enforcement:**

- ✅ EXEC CICS RETURN → Java `return` statement
- ❌ **NEVER** generate substitute APIs such as `returnToCaller()`, `returnToCallerWithCommarea()`, or any custom return-like helper

**Example:**

```cobol
EXEC CICS RETURN END-EXEC.
```

Transforms to:

```java
return;
```

### Principle 3: Special Handling for EXEC CICS FORMATTIME (CRITICAL)

**Rule:** JCICS does not provide a FORMATTIME API. Therefore, all date/time formatting must be implemented using standard Java libraries only.

**CRITICAL Enforcement:**

- ✅ EXEC CICS FORMATTIME → Standard Java date/time formatting libraries
- ❌ **NEVER** generate substitute APIs such as `Task.formatTime(...)` or any other formatting-like JCICS-style helper

**Example:**

```cobol
EXEC CICS FORMATTIME
    ABSTIME(WS-ABS-TIME)
    TIME(WS-TIME)
    YYYYMMDD(WS-DATE)
END-EXEC.
```

Transforms to:

```java
// Use standard Java date/time formatting
SimpleDateFormat timeFormat = new SimpleDateFormat("HHmmss");
SimpleDateFormat dateFormat = new SimpleDateFormat("yyyyMMdd");
Date date = new Date(wsAbsTime);
wsTime = timeFormat.format(date);
wsDate = dateFormat.format(date);
```

## Instructions

### Step 1: Analyze EXEC CICS Statements

Identify all EXEC CICS statements in the source COBOL or PL/I program.

**Common EXEC CICS statement types:**

- Program invocation (LINK, XCTL)
- ABEND handling
- Task context inspection (EIB fields)
- File operations (READ, WRITE, DELETE, REWRITE)
- Channel/Container operations
- Time/date services (ASKTIME, FORMATTIME)
- RETURN statements

**For each statement:**

1. Determine if it's RETURN or FORMATTIME (special cases)
2. Otherwise, identify the corresponding JCICS API
3. Preserve the exact control flow and error handling

### Step 2: Map to JCICS APIs

Transform each EXEC CICS statement to its JCICS equivalent.

**Mapping Rules:**

| EXEC CICS Statement     | Java Implementation                  | JCICS Class                                                                                                      |
| ----------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| EXEC CICS LINK          | `program.link(...)`                  | [`com.ibm.cics.server.Program`](com.ibm.cics.server.Program)                                                     |
| EXEC CICS RETURN        | `return;`                            | **None (Java return)**                                                                                           |
| EXEC CICS READ          | `file.read(...)`                     | [`com.ibm.cics.server.KSDS`](com.ibm.cics.server.KSDS) OR [`com.ibm.cics.server.KSDS`](com.ibm.cics.server.ESDS) |
| EXEC CICS WRITE         | `file.write(...)`                    | [`com.ibm.cics.server.KSDS`](com.ibm.cics.server.KDSD)                                                           |
| EXEC CICS ABEND         | `Task.getTask().abend(...)`          | [`com.ibm.cics.server.Task`](com.ibm.cics.server.Task)                                                           |
| EXEC CICS ASKTIME       | Standard Java date/time              | **None (Java libraries)**                                                                                        |
| EXEC CICS FORMATTIME    | Standard Java date/time              | **None (Java libraries)**                                                                                        |
| EXEC CICS GET CONTAINER | `channel.getContainer(...).get()`    | [`com.ibm.cics.server.Channel`](com.ibm.cics.server.Channel), [`Container`](com.ibm.cics.server.Container)       |
| EXEC CICS PUT CONTAINER | `channel.getContainer(...).put(...)` | [`com.ibm.cics.server.Channel`](com.ibm.cics.server.Channel), [`Container`](com.ibm.cics.server.Container)       |

**Example Transformation - EXEC CICS LINK:**

```cobol
EXEC CICS LINK
    PROGRAM('CHILD01')
    COMMAREA(WS-COMMAREA)
    LENGTH(LENGTH OF WS-COMMAREA)
END-EXEC.
```

Transforms to:

```java
import com.ibm.cics.server.Program;
import com.ibm.cics.server.Task;

byte[] commarea = wsCommarea.toBytes();
Program program = new Program("CHILD01");
program.link(commarea);
```

### Step 3: Implement Exception Handling

Preserve all error handling from the COBOL or PL/I source.

**JCICS Exception Handling:**

```java
import com.ibm.cics.server.CicsConditionException;

try {
    // JCICS API call
    Program program = new Program("CHILD01");
    program.link(commarea);
} catch (CicsConditionException e) {
    // Handle invalid request (e.g., COBOL RESP handling)
    // Map to original COBOL error handling logic
}
```

**CRITICAL Rules:**

- ❌ **NEVER** swallow exceptions with empty catch blocks
- ✅ **ALWAYS** propagate or handle exceptions according to original logic
- ✅ **ALWAYS** preserve RESP and RESP2 condition checking if present in source

### Step 4: Preserve Control Flow

Ensure the Java output maintains the exact control flow of the source program.

**Required Preservation:**

- Order of CICS calls
- Branching and error paths
- ABEND conditions
- Task lifecycle behavior
- EIB-driven decisions
- Resource interaction semantics supported by JCICS

**CRITICAL Rules:**

- ❌ **NEVER** reorder CICS operations
- ❌ **NEVER** combine multiple CICS calls into one
- ❌ **NEVER** optimize or refactor control flow
- ✅ **ALWAYS** produce deterministic output aligned with source

### Step 5: Validate Transformation

Use the delivery acceptance checklist to verify the transformation meets all requirements.

**Validation Checklist:**

- [ ] All EXEC CICS statements use actual JCICS APIs (except RETURN, FORMATTIME, ASKTIME and COUNTER)
- [ ] EXEC CICS RETURN uses Java return statements
- [ ] EXEC CICS FORMATTIME uses standard Java date/time formatting
- [ ] No custom CICS-like helper methods exist (e.g., `Task.formatTime()`)
- [ ] Only [`com.ibm.cics.server.*`](com.ibm.cics.server.*) classes are used for CICS behavior
- [ ] No simulated or custom CICS behavior exists
- [ ] Control flow matches the COBOL or PL/I program
- [ ] Output is clean, direct, and Transform-only (no optimization)

## Common JCICS API Patterns

### Task Context

```java
import com.ibm.cics.server.Task;

// Get current task
Task task = Task.getTask();

// Access EIB fields
String tranId = task.getTransactionName();

// Get error response fields
int respCode = e.getRESP();
int resp2Code = e.getRESP2();
```

### Program Invocation

```java
import com.ibm.cics.server.Program;

// LINK to another program
import com.ibm.cics.server.Program;
import com.ibm.cics.server.Task;

byte[] commarea = wsCommarea.toBytes();
Program program = new Program("CHILD01");
program.link(commarea);
```

### File Operations

```java
import com.ibm.cics.server.KSDS;
import com.ibm.cics.server.RecordHolder;

// Open file reference
KSDS file = new KSDS("FILENAME");
RecordHolder recordHolder = new RecordHolder();

// Read record
byte[] key = "KEY001".getBytes();
file.read(key, recordHolder);

// Write record
file.write(key, recordHolder.getValue());
```

### Channel and Container Operations

```java
import com.ibm.cics.server.Channel;
import com.ibm.cics.server.Container;
import com.ibm.cics.server.Task;

// Get current channel
Channel channel = Task.getTask().getCurrentChannel();

// Get container data
Container container = channel.getContainer("CONTAINERNAME");
byte[] data = container.get();

// Put container data
container.put(data);
```

## Prohibited Patterns

### ❌ Pattern 1: Custom CICS Helper Classes

**NEVER create custom classes that wrap or emulate JCICS functionality:**

```java
// ❌ PROHIBITED
public class CICSHelper {
    public static void returnToCaller() { ... }
    public static String formatTime(long abstime) { ... }
}

// ❌ PROHIBITED
public class TaskManager {
    public static void link(String program, byte[] data) {
        // Custom wrapper around JCICS
    }
}
```

### ❌ Pattern 2: Non-JCICS CICS Implementations

**NEVER use CICS-like classes not from [`com.ibm.cics.server.*`](com.ibm.cics.server.*):**

```java
// ❌ PROHIBITED
import com.thirdparty.cics.emulation.Task;
import custom.cics.simulation.Program;
```

### ❌ Pattern 3: Exception Swallowing

**NEVER catch JCICS exceptions without proper handling:**

```java
// ❌ PROHIBITED
try {
    program.link(commarea);
} catch (Exception e) {
    // Empty catch block - exception swallowed
}

// ✅ CORRECT
try {
    program.link(commarea);
} catch (CicsConditionException e) {
    // Handle according to original COBOL logic
    if (handleInvalidRequest) {
        // Original error handling code
    } else {
        throw e; // Propagate if not handled in source
    }
}
```

### ❌ Pattern 4: Control Flow Modification

**NEVER alter control flow from the original program:**

```java
// ❌ PROHIBITED - Reordering operations
program.link(data);  // Was second in COBOL
program.link(data);  // Was first in COBOL

// ✅ CORRECT - Preserve order
program.link(data);  // First in COBOL
program.link(data);  // Second in COBOL
```

## Troubleshooting

### Issue: Custom Helper Methods Generated

**Symptoms:**

- Methods like `returnToCaller()`, `formatTime()`, `linkToProgram()` appear in output
- Custom wrapper classes around JCICS

**Cause:** Transformation incorrectly created custom abstractions instead of using JCICS directly

**Solution:**

1. Remove all custom helper methods
2. Replace with direct JCICS API calls
3. For RETURN: use Java `return` statement
4. For FORMATTIME: use standard Java date/time libraries

### Issue: Wrong CICS Package Imported

**Symptoms:**

- Imports from packages other than [`com.ibm.cics.server.*`](com.ibm.cics.server.*)
- Third-party CICS emulation libraries used

**Cause:** Incorrect package selection during transformation

**Solution:**

1. Remove all non-JCICS imports
2. Add correct imports: `import com.ibm.cics.server.*;`
3. Replace third-party API calls with official JCICS APIs

### Issue: Control Flow Differs from Source

**Symptoms:**

- Operations appear in different order than source
- Error handling logic modified
- Optimizations or refactoring present

**Cause:** Transformation altered control flow during conversion

**Solution:**

1. Review source COBOL or PL/I program line by line
2. Ensure Java output preserves exact operation order
3. Remove any optimization or refactoring
4. Restore original branching and error handling logic

### Issue: Exceptions Not Properly Handled

**Symptoms:**

- Empty catch blocks
- Generic exception handling without mapping to source logic
- Missing exception propagation

**Cause:** Exception handling not mapped from COBOL RESP/RESP2 conditions

**Solution:**

1. Identify RESP condition checking in source COBOL
2. Map to appropriate JCICS exception handling
3. Ensure exceptions are caught, handled, or propagated correctly
4. Never swallow exceptions without corresponding source logic

## Best Practices

### Do's

1. **Use Official JCICS APIs Only** - Always import from [`com.ibm.cics.server.*`](com.ibm.cics.server.*) for all CICS functionality
2. **Preserve Exact Control Flow** - Maintain the same operation order, branching, and error handling as the source
3. **Handle Exceptions Properly** - Map COBOL RESP/RESP2 conditions to appropriate Java exception handling
4. **Use Java return for EXEC CICS RETURN** - Never create custom return helper methods
5. **Use Standard Java for FORMATTIME** - Use SimpleDateFormat, DateTimeFormatter, or similar standard libraries

### Don'ts

1. **Never Create Custom CICS Wrappers** - Don't create helper classes or methods that mimic JCICS behavior
2. **Never Use Non-JCICS Packages** - Don't import CICS-like classes from third-party or custom packages
3. **Never Optimize During Transform** - Don't refactor, optimize, or restructure the code during transformation
4. **Never Swallow Exceptions** - Don't use empty catch blocks or hide JCICS exceptions
5. **Never Alter Operation Order** - Don't reorder CICS calls or modify the control flow logic

## Required JCICS Imports

All CICS functionality must use official JCICS classes:

```java
// Core JCICS classes
import com.ibm.cics.server.Task;
import com.ibm.cics.server.Program;
import com.ibm.cics.server.KSDS;
import com.ibm.cics.server.Channel;
import com.ibm.cics.server.Container;

// Exception classes
import com.ibm.cics.server.AbendException;
import com.ibm.cics.server.InvalidRequestException;
import com.ibm.cics.server.CicsConditionException;
```

## Delivery Acceptance Criteria

A Java transformation is acceptable ONLY if ALL of the following criteria are met:

| #   | Criterion                                                                            | Priority | Validation                                                                              |
| --- | ------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------- |
| 1   | All EXEC CICS statements use actual JCICS APIs (except RETURN and FORMATTIME)        | CRITICAL | Verify all CICS operations use [`com.ibm.cics.server.*`](com.ibm.cics.server.*) classes |
| 2   | EXEC CICS RETURN uses Java return                                                    | CRITICAL | Verify RETURN statements are Java `return`                                              |
| 3   | EXEC CICS FORMATTIME uses standard Java date/time formatting                         | CRITICAL | Verify time formatting uses standard libraries                                          |
| 4   | No custom CICS-like helper methods exist                                             | CRITICAL | Verify no custom methods like `Task.formatTime()`                                       |
| 5   | Only [`com.ibm.cics.server.*`](com.ibm.cics.server.*) classes used for CICS behavior | CRITICAL | Verify all CICS imports from official package                                           |
| 6   | No simulated or custom CICS behavior exists                                          | CRITICAL | Verify no custom classes emulating JCICS                                                |
| 7   | Control flow matches the COBOL or PL/I program                                       | CRITICAL | Verify branching, error handling, order preserved                                       |
| 8   | Output is clean, direct, and Transform-only                                          | HIGH     | Verify no optimization or refactoring occurred                                          |

## References

For detailed examples and extended guidance, see:

- `references/jcics-api-examples.md` - Comprehensive JCICS API usage examples
- `references/transformation-examples.md` - Complete COBOL to Java transformation examples
- `references/prohibited-patterns-extended.md` - Detailed prohibited patterns with explanations

---

**Usage:** This skill activates automatically when transforming CICS programs or when you mention "JCICS", "CICS transformation", or related CICS keywords. Reference explicitly: "Use cics-transformation to transform this CICS program."

**Maintenance:** Update this skill as JCICS APIs evolve or new transformation patterns are discovered. Version control changes and communicate updates to the team.
