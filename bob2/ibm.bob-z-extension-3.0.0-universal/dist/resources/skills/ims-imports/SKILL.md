---
name: ims-imports
description: Enforces complete IMS Universal Driver import requirements by program type during IMS COBOL/PL/I to Java transformation. Use when generating Java class imports for IMS programs. Ensures ALL required imports are included based on program type (IMSTM, IMSDB, or IMSTMDB) and prevents selective/on-demand import detection. Critical for proper IMS API usage and StatusCodeHelper package correctness.
---

# IMS Imports Guardrails

This skill provides the single source of truth for IMS Universal Driver import requirements by program type. It ensures code generators include ALL necessary imports for detected program types.

## Prerequisites

Before using this skill, ensure:

- IMS transformation workflow is active
- Program type has been identified (IMSTM, IMSDB, or IMSTMDB)
- Java class generation is in progress
- Maven dependency configured: `com.ibm.ims:udb:15.166`

## Overview

IMS programs require different sets of imports based on their functionality:

1. **IMSTM** - Transaction Manager programs (message processing only)
2. **IMSDB** - Database programs (database access only)
3. **IMSTMDB** - Combined programs (both TM and DB operations)

**CRITICAL**: Code generators MUST include ALL imports for the detected program type. DO NOT use selective or on-demand import detection.

---

## Enforcement Rules (ABSOLUTE PRIORITY)

### Rule 1: Complete Import Sets

⛔ **Code generator MUST include ALL imports for detected program type**

- Never generate partial import lists
- Never use "import on first use" logic
- Always include complete set upfront

### Rule 2: No Selective Detection

⛔ **DO NOT use selective/on-demand import detection**

- Don't scan code to determine which imports are needed
- Don't add imports incrementally as code is generated
- Include all imports immediately based on program type

### Rule 3: StatusCodeHelper Package

⛔ **StatusCodeHelper MUST use com.ibm.ims.drda.base package (NOT com.ibm.ims.dli)**

- Correct: `import com.ibm.ims.drda.base.StatusCodeHelper;`
- Wrong: `import com.ibm.ims.dli.StatusCodeHelper;`

---

## Complete Workflow

### Phase 1: Program Type Detection

**Purpose**: Identify which type of IMS program is being transformed.

#### Step 1.1: Analyze Program Characteristics

**IMSTM Detection**:

- Uses Application, Transaction, MessageQueue classes
- NO PSB/PCB usage
- Message processing only

**IMSDB Detection**:

- Uses PSB, PCB classes
- NO Application/MessageQueue usage
- Database access only

**IMSTMDB Detection**:

- Uses Application AND PSB/PCB
- Both message processing and database access

#### Step 1.2: Verify Detection

**Before proceeding**, confirm:

- [ ] Checked for Application/MessageQueue usage
- [ ] Checked for PSB/PCB usage
- [ ] Determined program type (IMSTM, IMSDB, or IMSTMDB)

---

## Phase 2: Import Generation

**Purpose**: Generate complete import list based on program type.

### Step 2.1: IMSTM Program Imports

**Description**: Transaction Manager programs - message processing only

**Complete Import List**:

```java
import com.ibm.ims.dli.tm.Application;
import com.ibm.ims.dli.tm.ApplicationFactory;
import com.ibm.ims.dli.tm.IOMessage;
import com.ibm.ims.dli.tm.MessageQueue;
import com.ibm.ims.dli.tm.Transaction;
import com.ibm.ims.dli.DLIException;
import com.ibm.ims.drda.base.StatusCodeHelper;
```

**CRITICAL RULES**:

- ✅ Include ALL 7 imports
- ✅ StatusCodeHelper from `com.ibm.ims.drda.base`
- ❌ FORBIDDEN: Omitting any import
- ❌ FORBIDDEN: Adding database-related imports

### Step 2.2: IMSDB Program Imports

**Description**: Database programs - database access only

**Complete Import List**:

```java
import com.ibm.ims.db.PSB;
import com.ibm.ims.db.PSBFactory;
import com.ibm.ims.db.PCB;
import com.ibm.ims.dli.Path;
import com.ibm.ims.dli.SSAList;
import com.ibm.ims.dli.wcaz.WcazSSAMetadata;
import com.ibm.ims.dli.DLIException;
import com.ibm.ims.drda.base.StatusCodeHelper;
import java.util.List;
```

**CRITICAL RULES**:

- ✅ Include ALL 9 imports
- ✅ StatusCodeHelper from `com.ibm.ims.drda.base`
- ✅ Include `java.util.List` for SSA operations
- ❌ FORBIDDEN: Omitting any import
- ❌ FORBIDDEN: Adding TM-related imports

### Step 2.3: IMSTMDB Program Imports

**Description**: Combined programs - both TM and DB operations

**Complete Import List**:

```java
import com.ibm.ims.dli.tm.Application;
import com.ibm.ims.dli.tm.ApplicationFactory;
import com.ibm.ims.dli.tm.IOMessage;
import com.ibm.ims.dli.tm.MessageQueue;
import com.ibm.ims.dli.tm.Transaction;
import com.ibm.ims.dli.PSB;
import com.ibm.ims.dli.PSBFactory;
import com.ibm.ims.dli.PCB;
import com.ibm.ims.dli.Path;
import com.ibm.ims.dli.SSAList;
import com.ibm.ims.dli.wcaz.WcazSSAMetadata;
import com.ibm.ims.dli.DLIException;
import com.ibm.ims.drda.base.StatusCodeHelper;
import java.util.List;
```

**CRITICAL RULES**:

- ✅ Include ALL 14 imports (TM + DB combined)
- ✅ StatusCodeHelper from `com.ibm.ims.drda.base`
- ✅ Include both TM and DB imports
- ❌ FORBIDDEN: Omitting any import

---

## Phase 3: Validation

**Purpose**: Verify all imports are present and correct.

### Step 3.1: Import Count Verification

**For each program type**, verify import count:

| Program Type | Expected Import Count |
| ------------ | --------------------- |
| IMSTM        | 7 imports             |
| IMSDB        | 9 imports             |
| IMSTMDB      | 14 imports            |

### Step 3.2: StatusCodeHelper Package Check

**Verify StatusCodeHelper import**:

```java
// ✅ CORRECT
import com.ibm.ims.drda.base.StatusCodeHelper;

// ❌ WRONG - Will cause compilation errors
import com.ibm.ims.dli.StatusCodeHelper;
```

### Step 3.3: Completeness Check

**BEFORE completing code generation**, verify:

- [ ] All imports for program type are present
- [ ] Import count matches expected count
- [ ] StatusCodeHelper uses correct package
- [ ] No extra imports from other program types
- [ ] No duplicate imports

### Step 3.4: Validation Steps

**Execute these validation steps**:

1. **Identify program type from metadata**
2. **Get complete import list for that type**
3. **Verify EVERY import is present in generated code**
4. **Verify StatusCodeHelper uses correct package**
5. **FAIL if ANY import missing** - regenerate with all imports

---

## Quick Reference Table

### Import Requirements by Program Type

| Program Type | TM Imports | DB Imports | Common Imports | Total |
| ------------ | ---------- | ---------- | -------------- | ----- |
| IMSTM        | 5          | 0          | 2              | 7     |
| IMSDB        | 0          | 6          | 3              | 9     |
| IMSTMDB      | 5          | 6          | 3              | 14    |

### Common Imports (All Program Types)

```java
import com.ibm.ims.dli.DLIException;
import com.ibm.ims.drda.base.StatusCodeHelper;
```

### TM-Specific Imports (IMSTM, IMSTMDB)

```java
import com.ibm.ims.dli.tm.Application;
import com.ibm.ims.dli.tm.ApplicationFactory;
import com.ibm.ims.dli.tm.IOMessage;
import com.ibm.ims.dli.tm.MessageQueue;
import com.ibm.ims.dli.tm.Transaction;
```

### DB-Specific Imports (IMSDB, IMSTMDB)

```java
import com.ibm.ims.db.PSB;
import com.ibm.ims.db.PSBFactory;
import com.ibm.ims.db.PCB;
import com.ibm.ims.dli.Path;
import com.ibm.ims.dli.SSAList;
import com.ibm.ims.dli.wcaz.WcazSSAMetadata;
import java.util.List;
```

---

## Common Scenarios

### Scenario 1: Generating IMSTM Program

**Program Characteristics**:

- Uses MessageQueue for message processing
- No database operations
- No PSB/PCB usage

**Workflow**:

1. Detect program type: IMSTM
2. Generate all 7 IMSTM imports
3. Verify StatusCodeHelper package
4. Verify import count = 7

**Generated Imports**:

```java
import com.ibm.ims.dli.tm.Application;
import com.ibm.ims.dli.tm.ApplicationFactory;
import com.ibm.ims.dli.tm.IOMessage;
import com.ibm.ims.dli.tm.MessageQueue;
import com.ibm.ims.dli.tm.Transaction;
import com.ibm.ims.dli.DLIException;
import com.ibm.ims.drda.base.StatusCodeHelper;
```

### Scenario 2: Generating IMSDB Program

**Program Characteristics**:

- Uses PSB/PCB for database access
- No message processing
- No Application/MessageQueue usage

**Workflow**:

1. Detect program type: IMSDB
2. Generate all 9 IMSDB imports
3. Verify StatusCodeHelper package
4. Verify import count = 9

**Generated Imports**:

```java
import com.ibm.ims.db.PSB;
import com.ibm.ims.db.PSBFactory;
import com.ibm.ims.db.PCB;
import com.ibm.ims.dli.Path;
import com.ibm.ims.dli.SSAList;
import com.ibm.ims.dli.wcaz.WcazSSAMetadata;
import com.ibm.ims.dli.DLIException;
import com.ibm.ims.drda.base.StatusCodeHelper;
import java.util.List;
```

### Scenario 3: Generating IMSTMDB Program

**Program Characteristics**:

- Uses MessageQueue for message processing
- Uses PSB/PCB for database access
- Combined TM and DB operations

**Workflow**:

1. Detect program type: IMSTMDB
2. Generate all 14 IMSTMDB imports
3. Verify StatusCodeHelper package
4. Verify import count = 14

**Generated Imports**:

```java
import com.ibm.ims.dli.tm.Application;
import com.ibm.ims.dli.tm.ApplicationFactory;
import com.ibm.ims.dli.tm.IOMessage;
import com.ibm.ims.dli.tm.MessageQueue;
import com.ibm.ims.dli.tm.Transaction;
import com.ibm.ims.db.PSB;
import com.ibm.ims.db.PSBFactory;
import com.ibm.ims.db.PCB;
import com.ibm.ims.dli.Path;
import com.ibm.ims.dli.SSAList;
import com.ibm.ims.dli.wcaz.WcazSSAMetadata;
import com.ibm.ims.dli.DLIException;
import com.ibm.ims.drda.base.StatusCodeHelper;
import java.util.List;
```

---

## Troubleshooting

### Issue 1: Missing Imports

**Symptom**: Compilation errors due to missing classes

**Cause**: Used selective import detection instead of complete import list

**Solution**:

1. Identify program type
2. Include ALL imports for that type
3. Don't scan code to determine which imports are needed
4. Generate complete import list upfront

### Issue 2: Wrong StatusCodeHelper Package

**Symptom**: Compilation error: `StatusCodeHelper` not found in `com.ibm.ims.dli`

**Cause**: Used wrong package for StatusCodeHelper

**Solution**:

1. Always use `com.ibm.ims.drda.base.StatusCodeHelper`
2. Never use `com.ibm.ims.dli.StatusCodeHelper`
3. Verify package in generated code

### Issue 3: Mixed Program Type Imports

**Symptom**: IMSTM program has database imports or vice versa

**Cause**: Incorrect program type detection or import list selection

**Solution**:

1. Re-verify program type detection
2. Use correct import list for detected type
3. Don't mix imports from different program types (except IMSTMDB)

### Issue 4: Incremental Import Addition

**Symptom**: Imports added as code is generated, not upfront

**Cause**: Using on-demand import detection

**Solution**:

1. Generate ALL imports immediately after program type detection
2. Don't add imports incrementally
3. Include complete set before generating any class code

---

## Best Practices

### For Accurate Detection

1. **Analyze program characteristics** - Check for TM and DB API usage
2. **Verify detection logic** - Ensure program type is correctly identified
3. **Document detection** - Log which characteristics led to program type determination

### For Correct Import Generation

1. **Use complete lists** - Always include all imports for program type
2. **Verify package names** - Especially StatusCodeHelper package
3. **Check import count** - Verify against expected count for program type
4. **Generate upfront** - Include all imports before generating class code

### For Quality Assurance

1. **Validate every import** - Ensure each import is present and correct
2. **Check StatusCodeHelper** - Verify correct package usage
3. **Count verification** - Confirm import count matches expected
4. **No selective detection** - Never use on-demand import logic

---

## Integration with Other Rules

This skill is referenced by:

- **ims_class_generation** - Java class generation for IMS programs
- **ims_message_class** - Message class generation
- **ims_tm_call_statements** - TM call statement translation
- **ims_db_call_statements** - DB call statement translation

---

## Critical Warning

**⚠️ MISSING IMPORTS WILL CAUSE COMPILATION FAILURES ⚠️**
**⚠️ ALWAYS INCLUDE COMPLETE IMPORT LIST FOR PROGRAM TYPE ⚠️**
**⚠️ NEVER USE SELECTIVE/ON-DEMAND IMPORT DETECTION ⚠️**
**⚠️ VERIFY STATUSCODE HELPER PACKAGE BEFORE COMPLETING ⚠️**

---

## Summary

This skill ensures correct IMS Universal Driver imports during transformation:

1. **Complete Import Sets** - Include ALL imports for detected program type
2. **No Selective Detection** - Generate complete list upfront, not incrementally
3. **Correct Packages** - StatusCodeHelper from `com.ibm.ims.drda.base`
4. **Mandatory Validation** - Verify all imports before completing code generation

By following these guardrails, you ensure generated Java code has all necessary imports for proper IMS API usage and compilation success.
