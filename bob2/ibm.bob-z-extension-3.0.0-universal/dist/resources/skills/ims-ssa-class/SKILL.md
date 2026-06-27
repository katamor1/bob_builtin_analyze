---
name: ims-ssa-class
description: Handles IMS SSA (Segment Search Argument) class generation and usage during IMS COBOL/PL/I to Java transformation. Use when generating SSA classes for hierarchical database access in IMSTMDB or IMSDB programs. Ensures correct class structure, proper use of imsClassSourceCode from ClassMetadata, WcazSSAMetadata extension, and correct instantiation patterns (new keyword, not application methods).
---

# IMS SSA Class Guardrails

This skill provides the single source of truth for IMS SSA (Segment Search Argument) class generation and usage during COBOL/PL/I to Java transformation.

## Prerequisites

Before using this skill, ensure:

- IMS transformation workflow is active
- Program type is "IMSTMDB" or "IMSDB" (NOT "IMSTM")
- Metadata is available with SSA class metadata
- Source code contains IMS database call statements with SSA parameters
- `imsClassSourceCode` property is present in `ClassMetadata` for each IMS SSA class

## Overview

IMS SSA classes are Java classes that:

1. **Extend WcazSSAMetadata** - Provide segment search criteria for hierarchical database navigation
2. **Define Qualifications** - Specify search criteria using WcazSSAQualification objects
3. **Use Regular Instantiation** - Created with `new` keyword (NOT IOMessage pattern)
4. **Support DB Operations** - Used with PCB.getSSAList() for database access

**CRITICAL**: SSA classes are REGULAR Java classes, NOT IOMessage classes. They are instantiated using the `new` keyword with concrete class names, never with application.getSSA() or similar methods.

---

## Complete Workflow

### Phase 1: Program Type Verification (MANDATORY FIRST STEP)

**Purpose**: Verify program type before generating any SSA classes.

#### Step 1.1: Check Program Type

**⚠️ CRITICAL RULE**: SSA classes ONLY for "IMSTMDB" or "IMSDB" program types

**Verification Steps**:

1. Check `ims_program_type` in metadata
2. If type is "IMSTM": SKIP SSA class generation entirely
3. If type is "IMSTMDB" or "IMSDB": Proceed with SSA class generation

**Example Metadata Check**:

```markdown
**IMS Program Type**: IMSTMDB
```

**⛔ FORBIDDEN**: Never generate SSA classes for "IMSTM" programs (message processing only, no database access).

---

## Phase 2: SSA Counting Rules (MANDATORY)

**Purpose**: Count SSA parameters to select correct translation pattern.

### Step 2.1: Count SSA Parameters

**Counting Rule**: Count SSA parameters following the segment data parameter in each IMS CALL statement.

**Source Patterns**:

**PL/I Examples**:

```pli
CALL PLITDLI (THREE, GU, IMS_DB_PCB, SEGMENT_DATA);              /* 0 SSAs */
CALL PLITDLI (FOUR, GU, IMS_DB_PCB, SEGMENT_DATA, SSA1);         /* 1 SSA */
CALL PLITDLI (SIX, GU, IMS_DB_PCB, SEGMENT_DATA, SSA1, SSA2, SSA3); /* 3 SSAs */
```

**COBOL Examples**:

```cobol
CALL 'CBLTDLI' USING GU IMS-DB-PCB SEGMENT-DATA.                 *> 0 SSAs
CALL 'CBLTDLI' USING GU IMS-DB-PCB SEGMENT-DATA SSA1.            *> 1 SSA
CALL 'CBLTDLI' USING GU IMS-DB-PCB SEGMENT-DATA SSA1 SSA2 SSA3.  *> 3 SSAs
```

### Step 2.2: Select Translation Pattern

**Pattern Selection**:

- **0 SSAs**: No SSA classes needed, direct PCB call
- **1 SSA**: Single SSA class, use PCB.getSSAList(ssa1)
- **2+ SSAs**: Multiple SSA classes, use PCB.getSSAList(List.of(ssa1, ssa2, ...))

---

## Phase 3: Class Generation (MANDATORY)

**Purpose**: Generate IMS SSA class Java files from metadata.

### Step 3.1: Identify IMS SSA Classes

**Locate IMS SSA class definitions** in metadata:

```markdown
#### Class: HospSsa1

**IMS Class Type**: IMS SSA
**Segment Name**: HOSPITAL
**Qualifications**:

- HOSP_CODE: =
```

**Key Properties**:

- `imsClassType: "IMS SSA"` - Identifies this as an SSA class
- `segmentName` - Target segment in database hierarchy
- `qualifications` - Search criteria fields and operators

### Step 3.2: Read imsClassSourceCode from ClassMetadata

**CRITICAL**: ALL IMS SSA class source code MUST be read from the `imsClassSourceCode` property of `ClassMetadata`. Do not manually generate or modify this source.

**How to access**:

For each IMS SSA class identified in the metadata, locate the corresponding `ClassMetadata` entry and read its `imsClassSourceCode` property:

```typescript
// ClassMetadata.imsClassSourceCode contains the complete, ready-to-write Java source
const sourceCode = classMetadata.imsClassSourceCode;
```

**`imsClassSourceCode` structure**:

The property contains the complete Java source code as a string, for example:

```text
"package com.ibm.wcaz.implementation;\n\nimport com.ibm.ims.dli.wcaz.WcazSSAMetadata;\n..."
```

### Step 3.3: Write Source Code to File

**Extract `imsClassSourceCode`** from `ClassMetadata` and write to file:

```java
// Content from metadata.src - NO MODIFICATIONS ALLOWED
package com.ibm.wcaz.implementation;

import com.ibm.ims.dli.wcaz.WcazSSAMetadata;
import com.ibm.ims.dli.wcaz.WcazSSAQualification;
import java.util.ArrayList;
import java.util.List;

/**
 * IMS SSA (Segment Search Argument) class for hospital segment access.
 * Extends WcazSSAMetadata to provide search criteria for hierarchical database navigation.
 *
 * This SSA defines qualification criteria for retrieving hospital segments
 * from the IMS database hierarchy.
 *
 * @see com.ibm.ims.dli.wcaz.WcazSSAMetadata
 * @see com.ibm.ims.dli.wcaz.WcazSSAQualification
 */
public class HospSsa1 extends WcazSSAMetadata {

    /**
     * Constructs a new HospSsa1 with predefined segment name and qualifications.
     * Initializes the SSA for hospital segment access with qualification fields.
     */
    public HospSsa1() {
        super(
            "HOSPITAL",  // Segment name
            new ArrayList<>(List.of(
                new WcazSSAQualification("HOSP_CODE", "=")
            ))
        );
    }

    /**
     * Sets the hospital code qualification value.
     *
     * @param hospCode the hospital code to search for
     */
    public void setHospCode(String hospCode) {
        setSsaKey(hospCode);
    }
}
```

**⛔ CRITICAL RULES**:

- ✅ Use ONLY the `imsClassSourceCode` property from `ClassMetadata`
- ✅ Write content exactly as provided
- ✅ Preserve ALL formatting, comments, and structure
- ❌ FORBIDDEN: Modifying source code
- ❌ FORBIDDEN: Adding/removing fields or methods
- ❌ FORBIDDEN: Changing formatting or comments

---

## Phase 4: Class Structure Understanding

**Purpose**: Understand the generated IMS SSA class structure.

### Step 4.1: Base Class and Imports

**Required Base Class**:

```java
public class HospSsa1 extends WcazSSAMetadata
```

**Required Imports**:

```java
import com.ibm.ims.dli.wcaz.WcazSSAMetadata;
import com.ibm.ims.dli.wcaz.WcazSSAQualification;
import java.util.List;
import java.util.LinkedList;
import java.util.ArrayList;
```

**Conditional Import** (if WcazSSAPartMetadata is used):

```java
import com.ibm.ims.dli.wcaz.WcazSSAPartMetadata;
```

**Detection Rule**: Scan generated class code for "WcazSSAPartMetadata" string. If found, add the import.

### Step 4.2: Constructor Pattern

**Constructor Signature**:

```java
public HospSsa1() {
    super(segmentName, qualifications);
}
```

**Parameters**:

- `segmentName` - String literal for target segment (e.g., "HOSPITAL")
- `qualifications` - ArrayList of WcazSSAQualification objects

**Qualification Structure**:

```java
new ArrayList<>(List.of(
    new WcazSSAQualification("FIELD_NAME", "OPERATOR")
))
```

**Common Operators**: `"="`, `">"`, `"<"`, `">="`, `"<="`, `"¬="` (not equal)

### Step 4.3: Setter Methods

**Purpose**: Set qualification values at runtime.

**Pattern**:

```java
public void setFieldName(String value) {
    setSsaKey(value);
}
```

**Usage**: Call before using SSA in database operation to set search criteria.

---

## Phase 5: SSA Instantiation Rules (CRITICAL)

**Purpose**: Ensure correct SSA class instantiation patterns.

### Step 5.1: SSA Classes vs IOMessage Classes

**⛔ CRITICAL DISTINCTION**:

**SSA Classes**:

- Property: `imsClassType="IMS SSA"`
- Extends: `WcazSSAMetadata`
- Instantiation: `new ClassName()`
- Declaration: Use concrete class name
- Examples: `HospSsa1`, `WardSsa2`, `PatSsa3`

**IOMessage Classes** (for comparison):

- Property: `imsClassType="IMS Message"`
- Extends: `IMSFieldMessage`
- Instantiation: `application.getIOMessage("class://...")`
- Declaration: Use `IOMessage` interface
- Examples: `ImsMessageClass1`, `ImsMessageClass2`

### Step 5.2: Correct SSA Instantiation Pattern

**✅ CORRECT - Declare with concrete type, instantiate with new**:

```java
// Field declarations
private HospSsa1 hospSsa1;
private WardSsa2 wardSsa2;

// In constructor or initialization method:
this.hospSsa1 = new HospSsa1();
this.wardSsa2 = new WardSsa2();
```

### Step 5.3: Forbidden SSA Instantiation Patterns

**⛔ WRONG - Do NOT declare with superclass type**:

```java
// ❌ FORBIDDEN
private WcazSSAMetadata hospSsa1;  // WRONG!
```

**⛔ WRONG - Do NOT use application methods**:

```java
// ❌ FORBIDDEN
this.hospSsa1 = application.getSSA("class://...");  // WRONG!
this.hospSsa1 = application.getSSAMetadata("class://...");  // WRONG!
this.hospSsa1 = application.getIOMessage("class://...");  // WRONG!
```

**✅ CORRECT**:

```java
// ✅ ALWAYS USE THIS PATTERN
private HospSsa1 hospSsa1;
this.hospSsa1 = new HospSsa1();
```

---

## Phase 6: Translation Patterns

**Purpose**: Generate correct Java code based on SSA count.

### Step 6.1: Pattern - NO SSA (0 SSAs)

**Source**:

```pli
CALL PLITDLI (THREE, GU, IMS_DB_PCB, SEGMENT_DATA);
```

```cobol
CALL 'CBLTDLI' USING GU IMS-DB-PCB SEGMENT-DATA.
```

**Java Translation**:

```java
// Declarations
boolean imsDbRetrieved;
Path segmentData = null;
PCB imsDbPcb = null;

// Call
segmentData = imsDbPcb.getUnique(false);
imsDbRetrieved = (segmentData != null);
```

**No SSA classes needed** - Direct PCB call without search criteria.

### Step 6.2: Pattern - ONE SSA (1 SSA)

**Source**:

```pli
CALL PLITDLI (FOUR, GU, IMS_DB_PCB, SEGMENT_DATA, SSA1);
```

```cobol
CALL 'CBLTDLI' USING GU IMS-DB-PCB SEGMENT-DATA SSA1.
```

**Java Translation**:

```java
// SSA Class (from tool)
class Ssa1 extends WcazSSAMetadata {
    public Ssa1() { }
}

// Declarations
boolean imsDbRetrieved;
Path segmentData = null;
PCB imsDbPcb = null;
SSAList imsDbPcbSsaList = null;
Ssa1 ssa1 = new Ssa1();

// Call
imsDbPcbSsaList = imsDbPcb.getSSAList(ssa1);
segmentData = imsDbPcbSsaList.getPathForRetrieveReplace();
imsDbRetrieved = imsDbPcb.getUnique(segmentData, imsDbPcbSsaList, false);
```

### Step 6.3: Pattern - MULTIPLE SSAs (2+ SSAs)

**Source**:

```pli
CALL PLITDLI (SIX, GU, IMS_DB_PCB, SEGMENT_DATA, SSA1, SSA2, SSA3);
```

```cobol
CALL 'CBLTDLI' USING GU IMS-DB-PCB SEGMENT-DATA SSA1 SSA2 SSA3.
```

**Java Translation**:

```java
// SSA Classes (from tool)
class Ssa1 extends WcazSSAMetadata {
    public Ssa1() { }
}
class Ssa2 extends WcazSSAMetadata {
    public Ssa2() { }
}
class Ssa3 extends WcazSSAMetadata {
    public Ssa3() { }
}

// Declarations
boolean imsDbRetrieved;
Path segmentData = null;
PCB imsDbPcb = null;
SSAList imsDbPcbSsaList = null;
Ssa1 ssa1 = new Ssa1();
Ssa2 ssa2 = new Ssa2();
Ssa3 ssa3 = new Ssa3();

// Call
List<WcazSSAMetadata> wcazSSAMetadata = List.of(ssa1, ssa2, ssa3);
imsDbPcbSsaList = imsDbPcb.getSSAList(wcazSSAMetadata);
segmentData = imsDbPcbSsaList.getPathForRetrieveReplace();
imsDbRetrieved = imsDbPcb.getUnique(segmentData, imsDbPcbSsaList, false);
```

---

## Phase 7: Field Access in SSA Classes

**Purpose**: Access SSA class fields using generated methods.

### Step 7.1: Using Setter Methods

**Pattern**: Use setter methods from metadata 'src' results to set qualification values.

**Example**:

```java
// Set qualification value before database call
hospSsa1.setHospCode("H001");
wardSsa2.setWardName("ICU");

// Use in database operation
List<WcazSSAMetadata> wcazSSAMetadata = List.of(hospSsa1, wardSsa2);
imsDbPcbSsaList = imsDbPcb.getSSAList(wcazSSAMetadata);
```

**⛔ CRITICAL**: Use methods from metadata 'src' results. DO NOT modify existing methods or comments.

### Step 7.2: Validation in Setters

**Rule**: Add input validation in setter methods when appropriate.

**Example**:

```java
public void setHospCode(String hospCode) {
    if (hospCode == null || hospCode.trim().isEmpty()) {
        throw new IllegalArgumentException("Hospital code cannot be null or empty");
    }
    setSsaKey(hospCode);
}
```

---

## Phase 8: Coding Standards Compliance

**Purpose**: Apply AGENTS.md coding standards to generated SSA classes.

### Step 8.1: Documentation Standards

**Class-Level JavaDoc**:

```java
/**
 * IMS SSA (Segment Search Argument) class for hospital segment access.
 * Extends WcazSSAMetadata to provide search criteria for hierarchical database navigation.
 *
 * This SSA defines qualification criteria for retrieving hospital segments
 * from the IMS database hierarchy.
 *
 * @see com.ibm.ims.dli.wcaz.WcazSSAMetadata
 * @see com.ibm.ims.dli.wcaz.WcazSSAQualification
 */
public class HospSsa1 extends WcazSSAMetadata {
```

**Constructor JavaDoc**:

```java
/**
 * Constructs a new HospSsa1 with predefined segment name and qualifications.
 * Initializes the SSA for hospital segment access with qualification fields.
 */
public HospSsa1() {
```

**Method JavaDoc**:

```java
/**
 * Sets the hospital code qualification value.
 *
 * @param hospCode the hospital code to search for
 */
public void setHospCode(String hospCode) {
```

### Step 8.2: Formatting Standards

**Apply from AGENTS.md**:

- 4-space indentation
- 120-character line width
- Double quotes for strings
- Trailing commas in arrays
- Proper spacing around operators

### Step 8.3: Scope of Standards

**⛔ CRITICAL**: Apply ONLY documentation and formatting standards, NOT naming conventions.

**Apply**:

- ✅ JavaDoc for classes, constructors, methods
- ✅ Formatting (indentation, spacing, collection initialization)

**Do NOT Apply**:

- ❌ Naming conventions (class names follow IMS metadata, not AGENTS.md)

---

## Phase 9: Naming Conventions

**Purpose**: Convert source data structure names to Java class names.

### Step 9.1: Naming Rule

**Conversion**: Convert Level 1 data structure names to CamelCase.

**Examples**:

- `IMS_DB_SSA1` → `ImsDbSsa1`
- `HOSP_SSA` → `HospSsa`
- `PATIENT_SSA_3` → `PatientSsa3`

**⛔ CRITICAL**: Class names are determined by metadata, not by AGENTS.md naming conventions.

---

## Quick Reference Table

### Class Generation Workflow

| Step | Action                                 | Tool/Method                        |
| ---- | -------------------------------------- | ---------------------------------- |
| 1    | Verify program type (IMSTMDB/IMSDB)    | Check metadata                     |
| 2    | Count SSA parameters in call statement | Analyze source code                |
| 3    | Identify IMS SSA class in metadata     | Check metadata                     |
| 4    | Read source from ClassMetadata         | `classMetadata.imsClassSourceCode` |
| 5    | Write to file (NO modifications)       | write_to_file                      |
| 6    | Verify coding standards applied        | Check JavaDoc and formatting       |

### SSA Count Translation Patterns

| SSA Count | Pattern                                   | SSAList Usage                               |
| --------- | ----------------------------------------- | ------------------------------------------- |
| 0         | Direct PCB call                           | None                                        |
| 1         | Single SSA instantiation                  | `pcb.getSSAList(ssa1)`                      |
| 2+        | Multiple SSA instantiation with List.of() | `pcb.getSSAList(List.of(ssa1, ssa2, ssa3))` |

### Class Type Distinction

| Property         | SSA Classes         | IOMessage Classes                         |
| ---------------- | ------------------- | ----------------------------------------- |
| imsClassType     | "IMS SSA"           | "IMS Message"                             |
| Extends          | WcazSSAMetadata     | IMSFieldMessage                           |
| Declaration Type | Concrete class name | IOMessage interface                       |
| Instantiation    | `new ClassName()`   | `application.getIOMessage("class://...")` |
| Examples         | HospSsa1, WardSsa2  | ImsMessageClass1, ImsMessageClass2        |

---

## Common Scenarios

### Scenario 1: Generating Single SSA Class

**Source COBOL**:

```cobol
01 IMS-DB-SSA1.
   05 SEGMENT-NAME    PIC X(8) VALUE 'HOSPITAL'.
   05 HOSP-CODE       PIC X(4).
```

**Workflow**:

1. Verify program type: IMSTMDB ✓
2. Identify in metadata: `ImsDbSsa1` (IMS SSA class)
3. Read source: `classMetadata.imsClassSourceCode` for `ImsDbSsa1`
4. Write to file: `src/main/java/com/ibm/wcaz/implementation/ImsDbSsa1.java`
5. Verify: Class extends WcazSSAMetadata, has constructor with qualifications

**Generated Class** (from tool):

```java
package com.ibm.wcaz.implementation;

import com.ibm.ims.dli.wcaz.WcazSSAMetadata;
import com.ibm.ims.dli.wcaz.WcazSSAQualification;
import java.util.ArrayList;
import java.util.List;

public class ImsDbSsa1 extends WcazSSAMetadata {

    public ImsDbSsa1() {
        super(
            "HOSPITAL",
            new ArrayList<>(List.of(
                new WcazSSAQualification("HOSP_CODE", "=")
            ))
        );
    }

    public void setHospCode(String hospCode) {
        setSsaKey(hospCode);
    }
}
```

### Scenario 2: Using SSA in Database Call

**Source COBOL**:

```cobol
MOVE "H001" TO HOSP-CODE OF IMS-DB-SSA1.
CALL 'CBLTDLI' USING GU IMS-DB-PCB SEGMENT-DATA IMS-DB-SSA1.
```

**Workflow**:

1. Count SSAs: 1 SSA
2. Instantiate SSA: `new ImsDbSsa1()`
3. Set qualification value: `setHospCode("H001")`
4. Use in database call with getSSAList()

**Generated Java**:

```java
private ImsDbSsa1 imsDbSsa1;
private Path segmentData = null;
private PCB imsDbPcb = null;
private SSAList imsDbPcbSsaList = null;

// In constructor:
this.imsDbSsa1 = new ImsDbSsa1();

// In method:
imsDbSsa1.setHospCode("H001");
imsDbPcbSsaList = imsDbPcb.getSSAList(imsDbSsa1);
segmentData = imsDbPcbSsaList.getPathForRetrieveReplace();
boolean retrieved = imsDbPcb.getUnique(segmentData, imsDbPcbSsaList, false);
```

### Scenario 3: Multiple SSAs in Hierarchical Access

**Source COBOL**:

```cobol
CALL 'CBLTDLI' USING GU IMS-DB-PCB SEGMENT-DATA
     HOSP-SSA WARD-SSA PAT-SSA.
```

**Workflow**:

1. Count SSAs: 3 SSAs
2. Generate 3 SSA classes using tool
3. Instantiate all SSAs with `new`
4. Create List.of() for multiple SSAs
5. Use in database call

**Generated Java**:

```java
private HospSsa hospSsa;
private WardSsa wardSsa;
private PatSsa patSsa;

// In constructor:
this.hospSsa = new HospSsa();
this.wardSsa = new WardSsa();
this.patSsa = new PatSsa();

// In method:
List<WcazSSAMetadata> wcazSSAMetadata = List.of(hospSsa, wardSsa, patSsa);
imsDbPcbSsaList = imsDbPcb.getSSAList(wcazSSAMetadata);
segmentData = imsDbPcbSsaList.getPathForRetrieveReplace();
boolean retrieved = imsDbPcb.getUnique(segmentData, imsDbPcbSsaList, false);
```

---

## Troubleshooting

### Issue 1: Generated SSA Class for IMSTM Program

**Symptom**: SSA classes generated for message-only program

**Cause**: Didn't verify program type before generation

**Solution**:

1. Check `ims_program_type` in metadata FIRST
2. If "IMSTM": SKIP all SSA class generation
3. Only generate SSA classes for "IMSTMDB" or "IMSDB"

### Issue 2: Using application.getSSA() for Instantiation

**Symptom**: Code like `application.getSSA("class://...")`

**Cause**: Confused SSA classes with IOMessage classes

**Solution**:

1. SSA classes are REGULAR Java classes
2. Always use `new ClassName()` for instantiation
3. Never use application.getSSA(), getSSAMetadata(), or getIOMessage()
4. Declare with concrete class name, not WcazSSAMetadata

### Issue 3: Modified Source Code

**Symptom**: Generated class doesn't match `imsClassSourceCode` content

**Cause**: Modified `imsClassSourceCode` content before writing to file

**Solution**:

1. Extract `imsClassSourceCode` from `ClassMetadata`
2. Write content EXACTLY as provided
3. NO modifications to source code, comments, or formatting
4. Preserve ALL structure from metadata

### Issue 4: Wrong SSA Count Pattern

**Symptom**: Using wrong translation pattern for SSA count

**Cause**: Didn't count SSA parameters correctly

**Solution**:

1. Count SSA parameters after segment data parameter
2. 0 SSAs: Direct PCB call
3. 1 SSA: Use `pcb.getSSAList(ssa1)`
4. 2+ SSAs: Use `pcb.getSSAList(List.of(ssa1, ssa2, ...))`

### Issue 5: Missing WcazSSAPartMetadata Import

**Symptom**: Compilation error for WcazSSAPartMetadata

**Cause**: Didn't add conditional import when class uses WcazSSAPartMetadata

**Solution**:

1. Scan generated class code for "WcazSSAPartMetadata"
2. If found, add import: `com.ibm.ims.dli.wcaz.WcazSSAPartMetadata`
3. This is a conditional import, not always required

---

## Best Practices

### For Class Generation

1. **Always verify program type** - Check IMSTMDB/IMSDB before generating
2. **Always use imsClassSourceCode** - Never manually generate IMS SSA classes
3. **Use `imsClassSourceCode` exactly** - No modifications to metadata-provided source
4. **Apply standards** - Ensure JavaDoc and formatting from AGENTS.md

### For SSA Usage

1. **Use concrete types** - Declare with class name, not WcazSSAMetadata
2. **Instantiate with new** - Never use application methods
3. **Count SSAs correctly** - Select appropriate translation pattern
4. **Set qualifications** - Use setter methods before database calls

### For Quality Assurance

1. **Validate source origin** - Verify `imsClassSourceCode` from `ClassMetadata` was used
2. **Check instantiation** - Ensure `new` keyword used, not application methods
3. **Review SSA count** - Verify correct pattern for number of SSAs
4. **Count forbidden patterns** - Search for application.getSSA(), wrong declarations

---

## Integration with Other Skills

This skill works with:

- **ims_program_class** - Main program structure and SSA field declarations
- **ims_field_access** - Path field access patterns for database segments
- **ims_imports** - Required imports for IMS programs (WcazSSAMetadata, etc.)
- **coding_standards_builder** - AGENTS.md standards for documentation and formatting

---

## Critical Warnings

**⚠️ ALWAYS VERIFY PROGRAM TYPE - ONLY IMSTMDB/IMSDB ⚠️**
**⚠️ ALWAYS USE imsClassSourceCode FROM ClassMetadata ⚠️**
**⚠️ NEVER MODIFY METADATA-PROVIDED SOURCE CODE ⚠️**
**⚠️ SSA CLASSES ARE REGULAR CLASSES - USE new KEYWORD ⚠️**
**⚠️ NEVER USE application.getSSA() OR SIMILAR METHODS ⚠️**
**⚠️ DECLARE WITH CONCRETE CLASS NAME, NOT WcazSSAMetadata ⚠️**

---

## Summary

This skill ensures correct IMS SSA class generation and usage:

1. **Program Type Verification** - Only generate for IMSTMDB/IMSDB programs
2. **Metadata-Based Generation** - Read `imsClassSourceCode` from `ClassMetadata`, write exactly as provided
3. **Regular Class Pattern** - Instantiate with `new`, declare with concrete type
4. **SSA Count Patterns** - Select correct translation based on SSA parameter count
5. **Coding Standards** - Apply AGENTS.md documentation and formatting standards

By following these guardrails, you ensure IMS SSA classes are correctly generated and used in transformed Java code for hierarchical database access.
