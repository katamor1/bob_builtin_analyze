---
name: ims-db-ioarea
description: Handles IMS DB IOArea class field access patterns during IMS COBOL/PL/I to Java transformation. Use when translating field access in IMS Database IOArea classes using the Path interface. Ensures correct PCB creation from PSB, proper Path instantiation with SSA classes, and correct field access methods based on imsType with two-parameter pattern (segmentName, fieldName).
---

# IMS DB IOArea Class Guardrails

This skill provides the single source of truth for IMS DB IOArea class field access patterns during COBOL/PL/I to Java transformation.

## Prerequisites

Before using this skill, ensure:

- IMS transformation workflow is active
- Program type is "IMSTMDB" or "IMSDB" (database access programs)
- metadata is available with DB IOArea field definitions and IMS Statements Map
- Source code contains IMS database call statements (GU, GN, REPL, DLET, etc.)
- Path interface and PCB classes are available from IMS DLI library

## Overview

IMS DB IOArea classes provide access to database segment fields through the Path interface:

1. **Path Interface** - Provides field-based access to database segments
2. **PCB Objects** - Program Communication Blocks for database operations
3. **SSAList Integration** - Works with SSA classes for hierarchical navigation
4. **Two-Parameter Access** - All field access requires segmentName and fieldName

**CRITICAL**: DB IOArea classes are NOT generated - they use the Path interface directly. Field access ALWAYS requires TWO parameters: segment name and field name.

---

## Complete Workflow

### Phase 1: PCB Creation from PSB (MANDATORY FIRST STEP)

**Purpose**: Create PCB object from PSB before any database operations.

#### Step 1.1: Extract PCB Name from IMS Statements Map

**CRITICAL**: Use the PCB name from metadata IMS Statements Map, NOT the PCB structure name.

#### Extraction Algorithm

1. Read the "**IMS Statements Map**:" section from metadata
2. Find the line for your IMS DB call (e.g., "Line 224: GHU on DBPCB with...")
3. Extract the PCB name using this logic:
   - Check if pattern contains "named" keyword: "on [PCB_STRUCTURE] named [PCB_NAME] with"
   - If "named" exists: Use PCB_NAME (after "named", before "with")
   - If "named" does NOT exist: Use PCB_STRUCTURE (after "on", before "with")
4. Use that PCB name to create the PCB: `PCB variableName = psb.getPCB("PCB_NAME")`

#### Example 1: Without named PCB

```markdown
Line 224: GHU on DBPCB with TRMT-SEG, HOSP-SSA1, WARD-SSA2, PAT-SSA3, ILL-SSA4, TREATMNT-SSA5
```

Extraction:

- Pattern: "GHU on [PCB_NAME] with"
- No "named" keyword found
- PCB Name: "DBPCB"

Generated Java:

```java
PCB dbPcb = psb.getPCB("DBPCB");
```

#### Example 2: With named PCB

```markdown
Line 208: GHU on DBPCB named CUSTOMER with CUST-SEG, CUSTOMER-SSA1
```

Extraction:

- Pattern: "GHU on [PCB_STRUCTURE] named [PCB_NAME] with"
- "named" keyword found
- PCB Name: "CUSTOMER" (NOT "DBPCB")

Generated Java:

```java
PCB customer = psb.getPCB("CUSTOMER");
```

#### Step 1.2: PCB Creation Rules

#### Critical Rules

- ✅ ALWAYS create PCB from PSB using `psb.getPCB("PCB_NAME")`
- ✅ Use PCB name from IMS Statements Map (follow extraction algorithm)
- ✅ Use PCB object (NOT PSB) for all database operations
- ❌ FORBIDDEN: Using PSB directly for database calls
- ❌ FORBIDDEN: Using PCB structure name when "named" keyword exists

#### Required Imports

```java
import com.ibm.ims.dli.Path;
import com.ibm.ims.dli.PCB;
```

---

## Phase 2: Path Instantiation

**Purpose**: Create Path object for database segment access.

### Step 2.1: Determine SSA Count

**Count SSA parameters** in the IMS call statement to select the correct instantiation pattern.

#### Source Patterns

```cobol
CALL 'CBLTDLI' USING GU IMS-DB-PCB SEGMENT-DATA.                 *> 0 SSAs
CALL 'CBLTDLI' USING GU IMS-DB-PCB SEGMENT-DATA SSA1.            *> 1 SSA
CALL 'CBLTDLI' USING GU IMS-DB-PCB SEGMENT-DATA SSA1 SSA2 SSA3.  *> 3 SSAs
```

### Step 2.2: Path Instantiation Patterns

#### Pattern Selection

- **0 SSAs**: Direct PCB call, no SSAList needed
- **1 SSA**: Single SSA, use `PCB.getSSAList(ssa1)`
- **2+ SSAs**: Multiple SSAs, use `PCB.getSSAList(List.of(ssa1, ssa2, ...))`

#### Pattern 1: No SSA (Direct Access)

#### Pattern 1 Source

```cobol
CALL 'CBLTDLI' USING GU IMS-DB-PCB SEGMENT-DATA.
```

#### Pattern 1 Java Translation

```java
// Create PCB from PSB using extracted PCB name
PCB imsDbPcb = psb.getPCB("EXTRACTED_PCB_NAME");

// Direct access without SSA
Path varNameSegmentData = imsDbPcb.getUnique(false);
boolean imsDbRetrieved = (varNameSegmentData != null);
```

#### Pattern 2: One SSA

#### Pattern 2 Source

```cobol
CALL 'CBLTDLI' USING GU IMS-DB-PCB SEGMENT-DATA SSA1.
```

#### Pattern 2 Java Translation

```java
// Create PCB from PSB using extracted PCB name
PCB imsDbPcb = psb.getPCB("EXTRACTED_PCB_NAME");

// Create SSAList with one SSA
SSAList imsDbPcbSsaList = imsDbPcb.getSSAList(varNameSsa1);
Path varNameSegmentData = imsDbPcbSsaList.getPathForRetrieveReplace();
```

#### Pattern 3: Multiple SSAs

#### Pattern 3 Source

```cobol
CALL 'CBLTDLI' USING GU IMS-DB-PCB SEGMENT-DATA SSA1 SSA2 SSA3.
```

#### Pattern 3 Java Translation

```java
// Create PCB from PSB using extracted PCB name
PCB imsDbPcb = psb.getPCB("EXTRACTED_PCB_NAME");

// Create SSAList with multiple SSAs
List<WcazSSAMetadata> wcazSSAMetadata = List.of(varNameSsa1,
                        varNameSsa2,
                        varNameSsa3);

SSAList imsDbPcbSsaList = imsDbPcb.getSSAList(wcazSSAMetadata);
Path varNameSegmentData = imsDbPcbSsaList.getPathForRetrieveReplace();
```

### Step 2.3: Path Variable Naming

**Naming Convention**: Convert Level 1 data structure names to CamelCase.

#### Examples

- `VAR_NAME_SEG` → `varNameSeg`
- `HOSPITAL_SEG` → `hospitalSeg`
- `PATIENT_DATA` → `patientData`

**⛔ CRITICAL**: Use this CamelCase name when referring to the Path instance, NOT the generic name "Path".

---

## Phase 3: Field Access Translation

**Purpose**: Generate correct field access for DB IOArea segment fields.

### Step 3.1: Field Information Sources

**CRITICAL**: Field access information comes from two sources in metadata:

1. **IMS Statements Map** - `imsStatementsMap.REPLACE[].ioArea.mappedFields`
   - Contains: `fieldName`, `segmentName`, `dataType` (imsType)
   - Use for field translation during main program generation

2. **IOArea Class Metadata** - Basic field information
   - Contains: Field name, type
   - For documentation purposes only

**⛔ CRITICAL RULE**: ALWAYS use `fieldName` from mappedFields - NOT the original source field name.

### Step 3.2: Field Name Usage

#### Correct Field Name Extraction

```markdown
**Field Mappings**:

- fieldName: PASSWORD
- originalSourceName: PASSWD-SEG
- segmentName: SEGMENT_NAME
- imsType: String
```

#### ✅ CORRECT - Use fieldName from mappedFields

```java
varNameSegmentData.getString("SEGMENT_NAME", "PASSWORD");
```

#### ❌ WRONG - Using original source name

```java
varNameSegmentData.getString("SEGMENT_NAME", "PASSWD-SEG");  // WRONG!
```

### Step 3.3: Method Selection Based on imsType

**Read Method Pattern**: `get{imsType}("SEGMENT_NAME", "FIELD_NAME")`  
**Write Method Pattern**: `set{imsType}("SEGMENT_NAME", "FIELD_NAME", value)`

#### imsType Mapping Table

| imsType    | Read Method                   | Write Method                       | Java Type  |
| ---------- | ----------------------------- | ---------------------------------- | ---------- |
| String     | getString("SEG", "FIELD")     | setString("SEG", "FIELD", val)     | String     |
| Int        | getInt("SEG", "FIELD")        | setInt("SEG", "FIELD", val)        | int        |
| Short      | getShort("SEG", "FIELD")      | setShort("SEG", "FIELD", val)      | short      |
| Long       | getLong("SEG", "FIELD")       | setLong("SEG", "FIELD", val)       | long       |
| BigDecimal | getBigDecimal("SEG", "FIELD") | setBigDecimal("SEG", "FIELD", val) | BigDecimal |
| Byte       | getByte("SEG", "FIELD")       | setByte("SEG", "FIELD", val)       | byte       |

### Step 3.4: Parameter Requirements

**CRITICAL**: Path methods ALWAYS require TWO string parameters:

1. **First parameter**: `segmentName` from metadata Field Mappings
2. **Second parameter**: `fieldName` from mappedFields (NOT originalSourceName)

### Step 3.5: Field Access Examples

#### Example 1: String Field Access

Source COBOL:

```cobol
MOVE "H001" TO HOSP-CODE OF HOSPITAL-SEG.
DISPLAY HOSP-CODE OF HOSPITAL-SEG.
```

metadata Field Mappings:

```markdown
- fieldName: HOSP_CODE
- segmentName: HOSPITAL
- imsType: String
```

Generated Java:

```java
path.setString("HOSPITAL", "HOSP_CODE", "H001");
String code = path.getString("HOSPITAL", "HOSP_CODE");
System.out.println(code);
```

#### Example 2: Integer Field Access

Source COBOL:

```cobol
MOVE 12345 TO PATIENT-ID OF PATIENT-SEG.
```

metadata Field Mappings:

```markdown
- fieldName: PATIENT_ID
- segmentName: PATIENT
- imsType: Int
```

Generated Java:

```java
path.setInt("PATIENT", "PATIENT_ID", 12345);
```

#### Example 3: Field Name Mapping

Source COBOL:

```cobol
MOVE "ICU" TO WARD-NAME OF WARD-SEG.
```

metadata Field Mappings:

```markdown
- fieldName: WARD_NAME
- originalSourceName: WRD-NM
- segmentName: WARD
- imsType: String
```

Generated Java:

```java
// Use fieldName (WARD_NAME), not originalSourceName (WRD-NM)
path.setString("WARD", "WARD_NAME", "ICU");
```

---

## Phase 4: Field Access Generation Algorithm

**Purpose**: Step-by-step process for generating Path field access code.

### Step 4.1: Algorithm Steps

1. **Identify field being accessed** in source code
2. **Find field in metadata** "**Field Mappings**:" section
3. **Extract required properties**:
   - `fieldName` (use this, NOT originalSourceName)
   - `segmentName` (hierarchical location from DBD)
   - `imsType` (determines method name)
4. **Generate method call**:
   - Pattern: `path.get/set{imsType}("SEGMENT_NAME", "FIELD_NAME", [value])`
5. **Validate**: Ensure two parameters and correct imsType method

### Step 4.2: Validation Checklist

**BEFORE generating field access code**, verify:

- [ ] Field exists in metadata Field Mappings
- [ ] Using `fieldName` from mappedFields (NOT originalSourceName)
- [ ] `segmentName` extracted from Field Mappings
- [ ] `imsType` extracted from Field Mappings
- [ ] Method signature matches imsType
- [ ] TWO parameters provided (segment name, field name)

---

## Phase 5: Forbidden Patterns

**Purpose**: Avoid common mistakes in Path field access.

### Step 5.1: Single-Parameter Access (FORBIDDEN)

#### ❌ WRONG - Single parameter

```java
// ❌ FORBIDDEN
path.getString("FIELD_NAME");
path.setString("FIELD_NAME", value);
```

#### ✅ CORRECT - Two parameters

```java
// ✅ CORRECT
path.getString("SEGMENT_NAME", "FIELD_NAME");
path.setString("SEGMENT_NAME", "FIELD_NAME", value);
```

### Step 5.2: Using Original Source Names (FORBIDDEN)

#### ❌ WRONG - Using originalSourceName

```java
// ❌ FORBIDDEN
path.getString("SEGMENT", "PASSWD-SEG");  // Original source name
```

#### ✅ CORRECT - Using fieldName from mappedFields

```java
// ✅ CORRECT
path.getString("SEGMENT", "PASSWORD");  // fieldName from mappedFields
```

### Step 5.3: Direct Field Access (FORBIDDEN)

#### ❌ WRONG - Direct field access

```java
// ❌ FORBIDDEN
path.fieldName;
path.getFieldName();
path.setFieldName(value);
```

#### ✅ CORRECT - Generic methods with parameters

```java
// ✅ CORRECT
path.getString("SEGMENT_NAME", "FIELD_NAME");
path.setString("SEGMENT_NAME", "FIELD_NAME", value);
```

### Step 5.4: Using PSB Directly (FORBIDDEN)

#### ❌ WRONG - Using PSB for database operations

```java
// ❌ FORBIDDEN
SSAList ssaList = psb.getSSAList(ssa1);  // WRONG!
Path path = psb.getUnique(false);  // WRONG!
```

#### ✅ CORRECT - Create PCB first, then use PCB

```java
// ✅ CORRECT
PCB dbPcb = psb.getPCB("DBPCB");
SSAList ssaList = dbPcb.getSSAList(ssa1);
Path path = dbPcb.getUnique(false);
```

---

## Quick Reference Table

### PCB Creation Patterns

| IMS Statements Map Pattern              | PCB Name to Use | Java Code                 |
| --------------------------------------- | --------------- | ------------------------- |
| "GHU on DBPCB with..."                  | DBPCB           | `psb.getPCB("DBPCB")`     |
| "GHU on DBPCB named CUSTOMER with..."   | CUSTOMER        | `psb.getPCB("CUSTOMER")`  |
| "GN on PCBNAME with..."                 | PCBNAME         | `psb.getPCB("PCBNAME")`   |
| "REPL on DBPCB named INVENTORY with..." | INVENTORY       | `psb.getPCB("INVENTORY")` |

### Path Instantiation by SSA Count

| SSA Count | Pattern                      | Java Code                                               |
| --------- | ---------------------------- | ------------------------------------------------------- |
| 0         | Direct PCB call              | `Path p = pcb.getUnique(false);`                        |
| 1         | Single SSA                   | `SSAList sl = pcb.getSSAList(ssa1);`                    |
| 2+        | Multiple SSAs with List.of() | `SSAList sl = pcb.getSSAList(List.of(ssa1, ssa2, ...))` |

### Field Access Method Selection

| imsType    | Read Method                   | Write Method                       |
| ---------- | ----------------------------- | ---------------------------------- |
| String     | getString("SEG", "FIELD")     | setString("SEG", "FIELD", val)     |
| Int        | getInt("SEG", "FIELD")        | setInt("SEG", "FIELD", val)        |
| Short      | getShort("SEG", "FIELD")      | setShort("SEG", "FIELD", val)      |
| Long       | getLong("SEG", "FIELD")       | setLong("SEG", "FIELD", val)       |
| BigDecimal | getBigDecimal("SEG", "FIELD") | setBigDecimal("SEG", "FIELD", val) |
| Byte       | getByte("SEG", "FIELD")       | setByte("SEG", "FIELD", val)       |

### Common Mistakes and Corrections

| Mistake                                       | Correction                                                  |
| --------------------------------------------- | ----------------------------------------------------------- |
| Using single parameter for Path access        | Always provide segment name: `path.getString("SEG", "FLD")` |
| Using originalSourceName instead of fieldName | Use fieldName from mappedFields in metadata                 |
| Using PSB directly for DB operations          | Create PCB first: `PCB pcb = psb.getPCB("PCB_NAME")`        |
| Using wrong imsType method                    | Check metadata Field Mappings for correct imsType           |
| Using PCB structure name when "named" exists  | Extract PCB name after "named" keyword                      |

---

## Common Scenarios

### Scenario 1: Database Read with Single SSA

#### Scenario 1 Source COBOL

```cobol
CALL 'CBLTDLI' USING GU IMS-DB-PCB HOSPITAL-SEG HOSP-SSA.
DISPLAY HOSP-CODE OF HOSPITAL-SEG.
```

#### Scenario 1 IMS Statements Map

```markdown
Line 100: GHU on DBPCB with HOSPITAL-SEG, HOSP-SSA
```

#### Scenario 1 Field Mappings

```markdown
- fieldName: HOSP_CODE
- segmentName: HOSPITAL
- imsType: String
```

#### Scenario 1 Workflow

1. Extract PCB name: "DBPCB" (no "named" keyword)
2. Count SSAs: 1 SSA
3. Create PCB from PSB
4. Create SSAList with one SSA
5. Get Path from SSAList
6. Access field using two parameters

#### Scenario 1 Generated Java

```java
// Create PCB from PSB
PCB imsDbPcb = psb.getPCB("DBPCB");

// Create SSAList with one SSA
SSAList imsDbPcbSsaList = imsDbPcb.getSSAList(hospSsa);
Path hospitalSeg = imsDbPcbSsaList.getPathForRetrieveReplace();

// Perform database operation
boolean retrieved = imsDbPcb.getUnique(hospitalSeg, imsDbPcbSsaList, false);

// Access field
String hospCode = hospitalSeg.getString("HOSPITAL", "HOSP_CODE");
System.out.println(hospCode);
```

### Scenario 2: Database Write with Multiple SSAs

#### Scenario 2 Source COBOL

```cobol
MOVE "H001" TO HOSP-CODE OF HOSPITAL-SEG.
MOVE "ICU" TO WARD-NAME OF WARD-SEG.
CALL 'CBLTDLI' USING REPL IMS-DB-PCB HOSPITAL-SEG HOSP-SSA WARD-SSA.
```

#### Scenario 2 IMS Statements Map

```markdown
Line 150: REPL on DBPCB named HOSPITAL with HOSPITAL-SEG, HOSP-SSA, WARD-SSA
```

#### Scenario 2 Field Mappings

```markdown
- fieldName: HOSP_CODE
  segmentName: HOSPITAL
  imsType: String
- fieldName: WARD_NAME
  segmentName: WARD
  imsType: String
```

#### Scenario 2 Workflow

1. Extract PCB name: "HOSPITAL" ("named" keyword found)
2. Count SSAs: 2 SSAs
3. Create PCB from PSB
4. Create SSAList with multiple SSAs
5. Set field values
6. Perform replace operation

#### Scenario 2 Generated Java

```java
// Create PCB from PSB (use "HOSPITAL", not "DBPCB")
PCB hospital = psb.getPCB("HOSPITAL");

// Create SSAList with multiple SSAs
List<WcazSSAMetadata> wcazSSAMetadata = List.of(hospSsa, wardSsa);
SSAList hospitalSsaList = hospital.getSSAList(wcazSSAMetadata);
Path hospitalSeg = hospitalSsaList.getPathForRetrieveReplace();

// Set field values
hospitalSeg.setString("HOSPITAL", "HOSP_CODE", "H001");
hospitalSeg.setString("WARD", "WARD_NAME", "ICU");

// Perform replace operation
boolean replaced = hospital.replace(hospitalSeg, hospitalSsaList, false);
```

### Scenario 3: Field Name Mapping

#### Scenario 3 Source COBOL

```cobol
MOVE "SECRET" TO PASSWD-SEG OF SECURITY-SEG.
```

#### Scenario 3 Field Mappings

```markdown
- fieldName: PASSWORD
- originalSourceName: PASSWD-SEG
- segmentName: SECURITY
- imsType: String
```

#### Scenario 3 Workflow

1. Find field in Field Mappings
2. Extract fieldName: "PASSWORD" (NOT "PASSWD-SEG")
3. Extract segmentName: "SECURITY"
4. Extract imsType: "String"
5. Generate setString with two parameters

#### Scenario 3 Generated Java

```java
// Use fieldName (PASSWORD), not originalSourceName (PASSWD-SEG)
securitySeg.setString("SECURITY", "PASSWORD", "SECRET");
```

---

## Troubleshooting

### Issue 1: Wrong PCB Name Used

**Symptom**: Using PCB structure name when "named" keyword exists

**Cause**: Didn't follow PCB name extraction algorithm

#### Solution

1. Check IMS Statements Map for "named" keyword
2. If "named" exists: Use PCB name after "named"
3. If "named" does NOT exist: Use PCB structure name after "on"
4. Example: "GHU on DBPCB named CUSTOMER" → Use "CUSTOMER"

### Issue 2: Single-Parameter Path Access

**Symptom**: Generated code like `path.getString("FIELD")`

**Cause**: Confused Path access with IOMessage access

#### Solution

1. Path access ALWAYS requires TWO parameters
2. First parameter: segment name from Field Mappings
3. Second parameter: field name from mappedFields
4. Correct: `path.getString("SEGMENT", "FIELD")`

### Issue 3: Using Original Source Field Name

**Symptom**: Generated code uses originalSourceName instead of fieldName

**Cause**: Didn't check mappedFields in metadata

#### Solution

1. Always use fieldName from mappedFields
2. Never use originalSourceName in Java code
3. Check Field Mappings section in metadata
4. During validation, preserve fieldName - do NOT revert to original

### Issue 4: Using PSB for Database Operations

**Symptom**: Code like `psb.getSSAList(ssa1)` or `psb.getUnique()`

**Cause**: Skipped PCB creation step

#### Solution

1. ALWAYS create PCB from PSB first
2. Use PCB object for all database operations
3. Pattern: `PCB pcb = psb.getPCB("PCB_NAME")`
4. Then: `pcb.getSSAList()`, `pcb.getUnique()`, etc.

### Issue 5: Wrong imsType Method

**Symptom**: Using `getString()` for Int field

**Cause**: Didn't check imsType in Field Mappings

#### Solution

1. Always check imsType in metadata Field Mappings
2. Use method name that matches imsType exactly
3. Verify method signature matches imsType mapping table

---

## Best Practices

### For PCB Creation

1. **Always extract PCB name** - Follow extraction algorithm from IMS Statements Map
2. **Check for "named" keyword** - Determines which name to use
3. **Create PCB before operations** - Never use PSB directly for DB calls

### For Path Instantiation

1. **Count SSAs correctly** - Determines instantiation pattern
2. **Use CamelCase naming** - Convert Level 1 structure names
3. **Select correct pattern** - 0 SSAs, 1 SSA, or multiple SSAs

### For Field Access

1. **Use fieldName from mappedFields** - NOT originalSourceName
2. **Always provide two parameters** - Segment name and field name
3. **Check imsType** - Determines method name (getString, getInt, etc.)
4. **Extract from Field Mappings** - All information comes from metadata

### For Quality Assurance

1. **Verify PCB creation** - Check PCB name extraction is correct
2. **Count parameters** - Path access must have exactly 2 parameters
3. **Review field names** - Ensure using fieldName, not originalSourceName
4. **Validate imsType methods** - Method must match field's imsType

---

## Integration with Other Skills

This skill works with:

- **ims_ssa_class** - SSA class generation and usage for hierarchical database navigation
- **ims_field_access** - General field access patterns (this skill is DB-specific)
- **ims_program_class** - Main program structure and Path field declarations
- **ims_imports** - Required imports for IMS programs (Path, PCB, SSAList, etc.)

---

## Critical Warnings

**⚠️ ALWAYS CREATE PCB FROM PSB BEFORE DATABASE OPERATIONS ⚠️**
**⚠️ USE PCB NAME FROM IMS STATEMENTS MAP (FOLLOW EXTRACTION ALGORITHM) ⚠️**
**⚠️ PATH ACCESS ALWAYS REQUIRES TWO PARAMETERS ⚠️**
**⚠️ USE fieldName FROM mappedFields, NOT originalSourceName ⚠️**
**⚠️ NEVER USE PSB DIRECTLY FOR DATABASE CALLS ⚠️**
**⚠️ GENERATE CORRECT CODE DURING TRANSLATION - DO NOT FIX LATER ⚠️**

---

## Summary

This skill ensures correct IMS DB IOArea field access patterns:

1. **PCB Creation** - Extract PCB name from IMS Statements Map, create from PSB
2. **Path Instantiation** - Select pattern based on SSA count (0, 1, or multiple)
3. **Two-Parameter Access** - All Path methods require segment name and field name
4. **Field Name Mapping** - Use fieldName from mappedFields, not originalSourceName
5. **imsType-Driven Methods** - Method selection based on field's imsType property

By following these guardrails, you ensure Path field access uses correct PCB objects, proper parameter counts, and accurate field names in the transformed Java code.
