---
name: ims-db-call-statements
description: Handles IMS DL/I database call statement translation during IMS COBOL/PL/I to Java transformation. Use when translating IMS database calls (GU, GHU, GN, GHN, GNP, GHNP, ISRT, REPL, DLET) to Java IMS Universal Driver API. Ensures correct hold parameter usage (critical for data integrity), proper PCB storage, SSAList usage, correct method signatures, and accurate return type handling.
---

# IMS DB Call Statements Guardrails

This skill provides the single source of truth for translating IMS DL/I database call statements during COBOL/PL/I to Java transformation.

## Prerequisites

Before using this skill, ensure:

- IMS transformation workflow is active
- Program type is "IMSTMDB" or "IMSDB" (database access programs)
- IMS Statements Map is in the metadta
- Source code contains IMS database call statements (CBLTDLI/PLITDLI calls)
- IMS Universal Driver API is available in the target environment
- PCB and SSAList classes are available from IMS DLI library

## Overview

IMS DL/I database programs use call statements to interact with hierarchical databases. This skill ensures:

1. **Critical Hold Parameter** - Correct hold parameter usage (true/false) based on function code
2. **PCB Storage** - Always store PCB in variable, never call getPCB() inline
3. **SSAList Usage** - Always use SSAList for database operations with SSAs
4. **Method Signatures** - Boolean hold parameter is always last in retrieval methods
5. **Return Types** - Boolean for retrieval methods, void for modification methods

**CRITICAL**: The hold parameter is NON-NEGOTIABLE. Incorrect hold parameter values will cause data integrity issues, data corruption, or performance problems.

---

## Complete Workflow

### Phase 1: Pre-Translation Checklist (MANDATORY)

**Purpose**: Determine hold parameter value before translating any DL/I database call.

#### Step 1.1: Extract Hold Parameter from Metadata

**⚠️ CRITICAL RULE**: Use metadata to determine hold parameter value.

**Metadata Source**: `imsStatementsMap` in the main program class metadata

**Metadata Structure**:

```markdown
**IMS Statements Map**:

Line 224: GHU on DBPCB with TRMT-SEG, HOSP-SSA1, WARD-SSA2

- functionCode: GHU
- holdCall: true
- location: startRow=224, startCol=5, endRow=224, endCol=80
```

**Extraction Steps**:

1. Locate statement in `imsStatementsMap` (under REPLACE, MODIFIED, or other keys)
2. Find entry with matching location (startRow matches source line)
3. Extract `holdCall` field value (true or false)
4. Extract `functionCode` field for verification
5. Use `holdCall` value directly as hold parameter in Java

**Verification Rules**:

- If `holdCall == true` AND `functionCode` contains 'H' (GHU, GHN, GHNP) → Correct
- If `holdCall == false` AND `functionCode` does NOT contain 'H' (GU, GN, GNP) → Correct
- If `holdCall` and `functionCode` don't match → ERROR - report inconsistency

#### Step 1.2: Fallback if Metadata Unavailable

**If metadata is not available or incomplete**:

1. Read the original source code to identify the DL/I function name
2. Apply mapping: GHU/GHN/GHNP → hold=true, GU/GN/GNP → hold=false
3. Note: This is a fallback only - prefer using metadata when available

**⚠️ CRITICAL WARNING**:

```text
*** FAILURE TO CORRECTLY SET THE HOLD PARAMETER WILL CAUSE ***
*** DATA INTEGRITY ISSUES, DATA CORRUPTION, OR PERFORMANCE PROBLEMS ***
*** ALWAYS USE THE holdCall FIELD FROM METADATA - NON-NEGOTIABLE ***
```

---

## Phase 2: Critical Rules (MANDATORY)

**Purpose**: Apply non-negotiable rules for all database operations.

### Step 2.1: PCB Storage Rule

**⛔ CRITICAL RULE**: ALWAYS store PCB in variable - NEVER call getPCB() inline

**✅ CORRECT - Store PCB first**:

```java
PCB pcb = psb.getPCB("EXTRACTED_PCB_NAME");
SSAList ssaList = pcb.getSSAList(ssa1);
boolean result = pcb.getUnique(path, ssaList, false);
```

**❌ FORBIDDEN - Inline getPCB() call**:

```java
// ❌ WRONG!
psb.getPCB("NAME").getUnique(...);
```

**PCB Name Extraction**: Extract PCB name from IMS Statements Map using extraction algorithm in `ims_db_ioarea` skill.

### Step 2.2: SSAList Usage Rule

**⛔ CRITICAL RULE**: ALWAYS use SSAList for DB operations with SSAs

**Single SSA Pattern**:

```java
SSAList ssaList = pcb.getSSAList(ssa1);
Path path = ssaList.getPathForRetrieveReplace();
boolean result = pcb.getUnique(path, ssaList, false);
```

**Multiple SSAs Pattern**:

```java
SSAList ssaList = pcb.getSSAList(List.of(ssa1, ssa2, ssa3));
Path path = ssaList.getPathForRetrieveReplace();
boolean result = pcb.getUnique(path, ssaList, false);
```

**Reuse for Sequential Operations**:

```java
// Create SSAList and Path once for GU
SSAList ssaList = pcb.getSSAList(ssa1);
Path path = ssaList.getPathForRetrieveReplace();
boolean result = pcb.getUnique(path, ssaList, false);

// REUSE same SSAList and Path for getNext
while (pcb.getNext(path, ssaList, false)) {
    // Process segment
}
```

**❌ FORBIDDEN**:

```java
// ❌ WRONG - Never pass SSA objects directly
pcb.getUnique(path, ssa1, false);
```

### Step 2.3: Hold Parameter Usage (CRITICAL)

**⚠️ CRITICAL RULE**: GHU, GHN, GHNP MUST use hold=true parameter

**Mandatory Mapping**:

| Function | Method Call                                 | Hold Value |
| -------- | ------------------------------------------- | ---------- |
| GHU      | `pcb.getUnique(path, ssaList, true)`        | true       |
| GHN      | `pcb.getNext(path, ssaList, true)`          | true       |
| GHNP     | `pcb.getNextInParent(path, ssaList, true)`  | true       |
| GU       | `pcb.getUnique(path, ssaList, false)`       | false      |
| GN       | `pcb.getNext(path, ssaList, false)`         | false      |
| GNP      | `pcb.getNextInParent(path, ssaList, false)` | false      |

**Key Rules**:

- HOLD calls use the SAME methods as regular retrieval with hold=true parameter
- Boolean 'hold' parameter is ALWAYS LAST in retrieval methods
- There is NO separate getHold() method in IMS Universal Driver
- Hold calls (GHU/GHN/GHNP) establish a lock on the segment
- When source has GHU followed by REPL → Java MUST have getUnique(..., true) followed by replace(...)
- TRANSLATE WHAT'S IN THE SOURCE - do not add or remove operations

**Examples**:

```java
// Regular read (GU)
boolean found = pcb.getUnique(path, ssaList, false);

// Hold read (GHU)
boolean found = pcb.getUnique(path, ssaList, true);

// Update sequence (GHU + REPL)
boolean found = pcb.getUnique(path, ssaList, true); // GHU with hold=true
if (found) {
    // Modify segment fields
    pcb.replace(path); // REPL - REQUIRED because it's in source
}
```

**❌ FORBIDDEN**:

```java
// ❌ WRONG - Boolean in middle!
pcb.getUnique(path, true, ssaList);

// ❌ WRONG - Method does not exist!
pcb.getHold(...);

// ❌ WRONG - Must be true for GHU!
pcb.getUnique(path, ssaList, false); // when source is GHU

// ❌ WRONG - Must be false for GU!
pcb.getUnique(path, ssaList, true); // when source is GU
```

### Step 2.4: Method Signatures

**⛔ CRITICAL RULE**: Boolean 'hold' parameter is ALWAYS LAST in retrieval methods

**✅ CORRECT**:

```java
pcb.getUnique(path, ssaList, false);
pcb.getNext(path, ssaList, true);
pcb.getNextInParent(path, ssaList, false);
```

**❌ FORBIDDEN**:

```java
// ❌ WRONG - Boolean in middle!
pcb.getUnique(path, true, ssaList);
```

### Step 2.5: Return Types

**Retrieval Methods with SSA** (getUnique, getNext, getNextInParent):

- **Return Type**: `boolean` (indicates success)
- **Usage**: MUST assign to variable or use in conditional

```java
boolean result = pcb.getUnique(path, ssaList, false); // GU
boolean result = pcb.getUnique(path, ssaList, true);  // GHU
```

**Retrieval Methods without SSA**:

- **Return Type**: `Path` (or null if not found)
- **Usage**: Check for null to determine success

```java
Path path = pcb.getUnique(false);
boolean found = (path != null);

Path path = pcb.getUnique(true); // GHU without SSA
boolean found = (path != null);
```

**Modification Methods** (insert, replace, delete):

- **Return Type**: `void` (NOT boolean)
- **Usage**: NEVER assign to variable

```java
// ✅ CORRECT
pcb.insert(path, ssaList);
pcb.replace(path);
pcb.delete();

// Check status after modification
Short status = pcb.getAIB().getDBPCB().getStatusCode();
if (status != 0) {
    throw new DLIException("Operation failed: " + status);
}
```

**❌ FORBIDDEN**:

```java
// ❌ WRONG - insert/replace/delete return void!
boolean result = pcb.insert(path, ssaList);
boolean result = pcb.replace(path);
boolean result = pcb.delete();
```

---

## Phase 3: Call Mapping

**Purpose**: Map IMS DL/I calls to IMS Universal Driver methods.

### Step 3.1: Retrieval Calls

**GU (Get Unique)** - Retrieve segment without hold:

```java
// Method: getUnique(..., false)
boolean result = pcb.getUnique(path, ssaList, false);
```

**GHU (Get Hold Unique)** - Retrieve segment with hold for update:

```java
// Method: getUnique(..., true)
boolean result = pcb.getUnique(path, ssaList, true);
// Note: NO separate getHold() method - use getUnique with true
```

**GN (Get Next)** - Next segment without hold:

```java
// Method: getNext(..., false)
boolean hasNext = pcb.getNext(path, ssaList, false);
```

**GHN (Get Hold Next)** - Next segment with hold:

```java
// Method: getNext(..., true)
boolean hasNext = pcb.getNext(path, ssaList, true);
```

**GNP (Get Next in Parent)** - Next within parent without hold:

```java
// Method: getNextInParent(..., false)
boolean hasNext = pcb.getNextInParent(path, ssaList, false);
```

**GHNP (Get Hold Next in Parent)** - Next within parent with hold:

```java
// Method: getNextInParent(..., true)
boolean hasNext = pcb.getNextInParent(path, ssaList, true);
```

### Step 3.2: Modification Calls

**ISRT (Insert)** - Insert segment:

```java
// Method: insert(path, ssaList)
// Return: void
pcb.insert(path, ssaList);
Short status = pcb.getAIB().getDBPCB().getStatusCode();
if (status != 0) throw new DLIException("Insert failed: " + status);
```

**REPL (Replace)** - Replace segment:

```java
// Method: replace(path)
// Return: void
// Prerequisite: Must follow GHU/GHN/GHNP
pcb.replace(path);
Short status = pcb.getAIB().getDBPCB().getStatusCode();
if (status != 0) throw new DLIException("Replace failed: " + status);
```

**DLET (Delete)** - Delete segment:

```java
// Method: delete()
// Return: void
// Prerequisite: Must follow GHU/GHN/GHNP
pcb.delete();
Short status = pcb.getAIB().getDBPCB().getStatusCode();
if (status != 0) throw new DLIException("Delete failed: " + status);
```

---

## Quick Reference Table

### Call Method Mapping

| Source Call | Java Method                                 | Hold Parameter | Return Type |
| ----------- | ------------------------------------------- | -------------- | ----------- |
| GU          | `pcb.getUnique(path, ssaList, false)`       | false          | boolean     |
| GHU         | `pcb.getUnique(path, ssaList, true)`        | true           | boolean     |
| GN          | `pcb.getNext(path, ssaList, false)`         | false          | boolean     |
| GHN         | `pcb.getNext(path, ssaList, true)`          | true           | boolean     |
| GNP         | `pcb.getNextInParent(path, ssaList, false)` | false          | boolean     |
| GHNP        | `pcb.getNextInParent(path, ssaList, true)`  | true           | boolean     |
| ISRT        | `pcb.insert(path, ssaList)`                 | N/A            | void        |
| REPL        | `pcb.replace(path)`                         | N/A            | void        |
| DLET        | `pcb.delete()`                              | N/A            | void        |

### Hold Parameter Rules

| Function Code | Contains 'H'? | Hold Parameter | Method Example                              |
| ------------- | ------------- | -------------- | ------------------------------------------- |
| GU            | No            | false          | `pcb.getUnique(path, ssaList, false)`       |
| GHU           | Yes           | true           | `pcb.getUnique(path, ssaList, true)`        |
| GN            | No            | false          | `pcb.getNext(path, ssaList, false)`         |
| GHN           | Yes           | true           | `pcb.getNext(path, ssaList, true)`          |
| GNP           | No            | false          | `pcb.getNextInParent(path, ssaList, false)` |
| GHNP          | Yes           | true           | `pcb.getNextInParent(path, ssaList, true)`  |

---

## Critical Warnings

**⚠️ HOLD PARAMETER IS CRITICAL - INCORRECT VALUES CAUSE DATA INTEGRITY ISSUES ⚠️**
**⚠️ ALWAYS USE holdCall FIELD FROM METADATA - NON-NEGOTIABLE ⚠️**
**⚠️ ALWAYS STORE PCB IN VARIABLE - NEVER CALL getPCB() INLINE ⚠️**
**⚠️ ALWAYS USE SSAList FOR DB OPERATIONS WITH SSAs ⚠️**
**⚠️ BOOLEAN HOLD PARAMETER IS ALWAYS LAST IN METHOD SIGNATURE ⚠️**
**⚠️ HANDLE RETURN TYPES CORRECTLY - BOOLEAN VS VOID ⚠️**

---

## Summary

This skill ensures correct IMS DL/I database call statement translation:

1. **Hold Parameter** - Use metadata `holdCall` field, verify against function code (H = hold)
2. **PCB Storage** - Always store PCB in variable, never call getPCB() inline
3. **SSAList Usage** - Always use SSAList for database operations with SSAs
4. **Method Signatures** - Boolean hold parameter is always last in retrieval methods
5. **Return Types** - Boolean for retrieval methods, void for modification methods

By following these guardrails, you ensure IMS DL/I database calls are accurately translated to Java IMS Universal Driver API calls with correct hold parameters, proper PCB usage, and accurate return type handling.
