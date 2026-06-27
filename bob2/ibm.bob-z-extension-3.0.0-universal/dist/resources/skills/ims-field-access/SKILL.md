---
name: ims-field-access
description: Handles IMS field access patterns for IOMessage (TM) and Path (DB) interfaces during IMS COBOL/PL/I to Java transformation. Use when translating field access in IMS Message classes or DB IOArea classes. Ensures correct method selection based on imsType, proper field name conversion (dash-to-underscore), and correct parameter usage (single parameter for IOMessage, two parameters for Path).
---

# IMS Field Access Guardrails

This skill provides the single source of truth for field access patterns in IMS Message and DB IOArea classes during COBOL/PL/I to Java transformation.

## Prerequisites

Before using this skill, ensure:

- IMS transformation workflow is active
- metadata is available with field definitions including imsType properties
- Source code contains field access (MOVE, SET statements)
- For DB programs: segmentName information is available in metadata

## Overview

IMS programs access fields in two distinct contexts:

1. **IOMessage Field Access** - Transaction Manager (TM) message classes using IOMessage interface
2. **Path Field Access** - Database (DB) IOArea classes using Path interface

**CRITICAL**: Field access methods are determined by the field's `imsType` property from metadata, and field names must be converted from dashes to underscores.

---

## Complete Workflow

### Phase 1: Field Name Conversion (MANDATORY FIRST STEP)

**Purpose**: Convert source field names to Java-compatible format.

#### Step 1.1: Identify Source Field Name

**Extract the field name from source code**:

**COBOL Examples**:

```cobol
MOVE VALUE TO MSG-OUT        → Extract "MSG-OUT"
MOVE VALUE TO HOSP-CODE      → Extract "HOSP-CODE"
```

**PL/I Examples**:

```pli
MSG_OUT = VALUE              → Extract "MSG_OUT"
HOSP_CODE = VALUE            → Extract "HOSP_CODE"
```

#### Step 1.2: Apply Dash-to-Underscore Conversion

**Conversion Rule**: Replace all dashes with underscores

**Examples**:

- `MSG-OUT` → `MSG_OUT`
- `HOSP-CODE` → `HOSP_CODE`
- `WARD-NAME` → `WARD_NAME`
- `SEGMENT-NUM-IN` → `SEGMENT_NUM_IN`

**⛔ CRITICAL**: Always use the converted name in Java get/set methods, NOT the original source name.

---

## Phase 2: Context Detection

**Purpose**: Determine whether this is IOMessage or Path field access.

### Step 2.1: Identify Access Context

**IOMessage Context (TM Programs)**:

- Field is in an IMS Message class
- Uses IOMessage interface
- Single-parameter methods

**Path Context (DB Programs)**:

- Field is in a DB IOArea class
- Uses Path interface
- Two-parameter methods (segment name + field name)

### Step 2.2: Locate Field in metadata

**Find the field definition in metadata**:

```markdown
#### Class: OutputArea

**Fields**:

- MSG_OUT: String
- SEGMENT_NUM_IN: Int
- HOSP_CODE: String
```

**Extract Required Information**:

1. Field name (after dash-to-underscore conversion)
2. imsType property (String, Int, Short, Long, BigDecimal, Byte)
3. For Path: segmentName property

---

## Phase 3: IOMessage Field Access Translation

**Purpose**: Generate correct field access for TM Message classes.

### Step 3.1: Method Selection Based on imsType

**Read Method Pattern**: `get{imsType}("FIELD_NAME")`  
**Write Method Pattern**: `set{imsType}("FIELD_NAME", value)`

**imsType Mapping Table**:

| imsType    | Read Method            | Write Method                | Java Type  |
| ---------- | ---------------------- | --------------------------- | ---------- |
| String     | getString("FIELD")     | setString("FIELD", val)     | String     |
| Int        | getInt("FIELD")        | setInt("FIELD", val)        | int        |
| Short      | getShort("FIELD")      | setShort("FIELD", val)      | short      |
| Long       | getLong("FIELD")       | setLong("FIELD", val)       | long       |
| BigDecimal | getBigDecimal("FIELD") | setBigDecimal("FIELD", val) | BigDecimal |
| Byte       | getByte("FIELD")       | setByte("FIELD", val)       | byte       |

### Step 3.2: IOMessage Field Access Examples

#### Example 1: String Field Access

Source COBOL:

```cobol
MOVE "Success" TO MSG-OUT.
DISPLAY MSG-OUT.
```

metadata:

```markdown
- MSG_OUT: String
```

Generated Java:

```java
outputArea.setString("MSG_OUT", "Success");
String msg = outputArea.getString("MSG_OUT");
System.out.println(msg);
```

#### Example 2: Integer Field Access

Source COBOL:

```cobol
MOVE 5 TO SEGMENT-NUM-IN.
```

metadata:

```markdown
- SEGMENT_NUM_IN: Int
```

Generated Java:

```java
inputArea.setInt("SEGMENT_NUM_IN", 5);
```

#### Example 3: Field with Dash Conversion

Source COBOL:

```cobol
MOVE "H001" TO HOSP-CODE.
```

metadata:

```markdown
- HOSP_CODE: String
```

Generated Java:

```java
ioArea.setString("HOSP_CODE", "H001");
```

### Step 3.3: IOMessage Forbidden Patterns

**⛔ CRITICAL - DO NOT USE**:

```java
// ❌ WRONG - Direct field access
ioMessage.fieldName

// ❌ WRONG - Getter/setter methods
ioMessage.getFieldName()
ioMessage.setFieldName(value)

// ❌ WRONG - Using original source name with dashes
ioMessage.getString("MSG-OUT")  // Should be "MSG_OUT"
```

**✅ CORRECT - Generic methods with field name string**:

```java
// ✅ CORRECT
ioMessage.getString("MSG_OUT")
ioMessage.setString("MSG_OUT", value)
```

---

## Phase 4: Path Field Access Translation

**Purpose**: Generate correct field access for DB IOArea classes.

### Step 4.1: Method Selection Based on imsType

**Read Method Pattern**: `get{imsType}("SEGMENT_NAME", "FIELD_NAME")`  
**Write Method Pattern**: `set{imsType}("SEGMENT_NAME", "FIELD_NAME", value)`

**imsType Mapping Table**:

| imsType    | Read Method                   | Write Method                       |
| ---------- | ----------------------------- | ---------------------------------- |
| String     | getString("SEG", "FIELD")     | setString("SEG", "FIELD", val)     |
| Int        | getInt("SEG", "FIELD")        | setInt("SEG", "FIELD", val)        |
| Short      | getShort("SEG", "FIELD")      | setShort("SEG", "FIELD", val)      |
| Long       | getLong("SEG", "FIELD")       | setLong("SEG", "FIELD", val)       |
| BigDecimal | getBigDecimal("SEG", "FIELD") | setBigDecimal("SEG", "FIELD", val) |
| Byte       | getByte("SEG", "FIELD")       | setByte("SEG", "FIELD", val)       |

### Step 4.2: Parameter Requirements

**CRITICAL**: Path methods require TWO string parameters:

1. **First parameter**: segmentName from metadata
2. **Second parameter**: field name from metadata (with dash-to-underscore conversion)

### Step 4.3: Path Field Access Examples

#### Example 1: String Field Access in DB Segment

Source COBOL:

```cobol
MOVE "H001" TO HOSP-CODE OF HOSPITAL-SEG.
DISPLAY HOSP-CODE OF HOSPITAL-SEG.
```

metadata:

```markdown
**Segment**: HOSPITAL_SEG
**Fields**:

- HOSP_CODE: String
```

Generated Java:

```java
path.setString("HOSPITAL_SEG", "HOSP_CODE", "H001");
String code = path.getString("HOSPITAL_SEG", "HOSP_CODE");
System.out.println(code);
```

#### Example 2: Integer Field Access

Source COBOL:

```cobol
MOVE 12345 TO PATIENT-ID OF PATIENT-SEG.
```

metadata:

```markdown
**Segment**: PATIENT_SEG
**Fields**:

- PATIENT_ID: Int
```

Generated Java:

```java
path.setInt("PATIENT_SEG", "PATIENT_ID", 12345);
```

#### Example 3: Field with Dash Conversion

Source COBOL:

```cobol
MOVE "ICU" TO WARD-NAME OF WARD-SEG.
```

metadata:

```markdown
**Segment**: WARD_SEG
**Fields**:

- WARD_NAME: String
```

Generated Java:

```java
path.setString("WARD_SEG", "WARD_NAME", "ICU");
```

### Step 4.4: Path Forbidden Patterns

**⛔ CRITICAL - DO NOT USE**:

```java
// ❌ WRONG - Single-parameter method
path.getString("FIELD")

// ❌ WRONG - Missing segment name
path.setString("HOSP_CODE", "H001")

// ❌ WRONG - Direct field access
path.fieldName

// ❌ WRONG - Getter/setter methods
path.getFieldName()
```

**✅ CORRECT - Two-parameter methods with segment name**:

```java
// ✅ CORRECT
path.getString("HOSPITAL_SEG", "HOSP_CODE")
path.setString("HOSPITAL_SEG", "HOSP_CODE", "H001")
```

---

## Phase 5: Field Access Generation Algorithm

**Purpose**: Step-by-step process for generating field access code.

### Step 5.1: Algorithm Steps

1. **Identify field being accessed** in source code
2. **Determine context**: IOMessage (TM) or Path (DB) access
3. **Find field in metadata** **Fields**: section
4. **Extract imsType property** from metadata
5. **For Path**: Extract segmentName property from metadata
6. **Apply dash-to-underscore conversion** to field name
7. **Generate method call**:
   - IOMessage: `ioMessage.get/set{imsType}("FIELD_NAME", [value])`
   - Path: `path.get/set{imsType}("SEGMENT_NAME", "FIELD_NAME", [value])`

### Step 5.2: Validation Checklist

**BEFORE generating field access code**, verify:

- [ ] imsType exists in metadata
- [ ] Field name matches metadata (after dash-to-underscore conversion)
- [ ] For Path: segmentName exists in metadata
- [ ] Method signature matches imsType
- [ ] Correct number of parameters (1 for IOMessage, 2 for Path)

---

## Quick Reference Table

### Context-Based Method Patterns

| Context   | Method Pattern                       | Parameters               | Example                            |
| --------- | ------------------------------------ | ------------------------ | ---------------------------------- |
| IOMessage | get/set{imsType}("FIELD")            | field name               | getString("MSG_OUT")               |
| Path      | get/set{imsType}("SEGMENT", "FIELD") | segment name, field name | getString("HOSP_SEG", "HOSP_CODE") |

### Common Mistakes and Corrections

| Mistake                                      | Correction                                                  |
| -------------------------------------------- | ----------------------------------------------------------- |
| Using original source field name with dashes | Convert dashes to underscores: "MSG-OUT" → "MSG_OUT"        |
| Using single parameter for Path access       | Always provide segment name: path.getString("SEG", "FIELD") |
| Using wrong imsType method                   | Check metadata for correct imsType                          |
| Missing segment name in Path access          | First parameter must be segment name                        |

---

## Common Scenarios

### Scenario 1: IOMessage String Field Write

**Source COBOL**:

```cobol
MOVE "Transaction complete" TO MSG-OUT.
```

**Workflow**:

1. Extract field name: "MSG-OUT" → "MSG_OUT"
2. Context: IOMessage (TM message class)
3. Find in metadata: `MSG_OUT: String`
4. imsType: String
5. Generate: `setString("MSG_OUT", value)`

**Generated Java**:

```java
outputArea.setString("MSG_OUT", "Transaction complete");
```

### Scenario 2: Path Integer Field Read

**Source COBOL**:

```cobol
DISPLAY PATIENT-ID OF PATIENT-SEG.
```

**Workflow**:

1. Extract field name: "PATIENT-ID" → "PATIENT_ID"
2. Context: Path (DB IOArea)
3. Find in metadata: `PATIENT_ID: Int` in `PATIENT_SEG`
4. imsType: Int, segmentName: PATIENT_SEG
5. Generate: `getInt("PATIENT_SEG", "PATIENT_ID")`

**Generated Java**:

```java
int patientId = path.getInt("PATIENT_SEG", "PATIENT_ID");
System.out.println(patientId);
```

### Scenario 3: Multiple Dash Conversion

**Source COBOL**:

```cobol
MOVE 100 TO SEGMENT-NUM-IN.
```

**Workflow**:

1. Extract field name: "SEGMENT-NUM-IN" → "SEGMENT_NUM_IN"
2. Context: IOMessage
3. Find in metadata: `SEGMENT_NUM_IN: Int`
4. imsType: Int
5. Generate: `setInt("SEGMENT_NUM_IN", 100)`

**Generated Java**:

```java
inputArea.setInt("SEGMENT_NUM_IN", 100);
```

---

## Troubleshooting

### Issue 1: Field Name Not Found in metadata

**Symptom**: Cannot find field definition in metadata

**Cause**: Field name not converted or incorrect conversion

**Solution**:

1. Verify dash-to-underscore conversion is applied
2. Check for case sensitivity (field names are case-sensitive)
3. Ensure looking in correct class/segment section

### Issue 2: Wrong Number of Parameters

**Symptom**: Generated code has wrong parameter count

**Cause**: Confused IOMessage and Path contexts

**Solution**:

1. IOMessage: Single parameter (field name only)
2. Path: Two parameters (segment name, then field name)
3. Verify context before generating method call

### Issue 3: Wrong Method Name

**Symptom**: Generated `getString()` but field is Int type

**Cause**: Didn't check imsType in metadata

**Solution**:

1. Always check imsType property in metadata
2. Use method name that matches imsType exactly
3. Verify method signature matches imsType mapping table

### Issue 4: Using Original Field Name with Dashes

**Symptom**: Generated code like `getString("MSG-OUT")`

**Cause**: Skipped dash-to-underscore conversion

**Solution**:

1. Always apply conversion as first step
2. Use converted name in all Java code
3. Never use original source name with dashes

---

## Best Practices

### For Accurate Field Access

1. **Always convert field names** - Apply dash-to-underscore conversion before any other step
2. **Check metadata** - Verify field exists and get correct imsType
3. **Use correct context** - IOMessage (1 param) vs Path (2 params)

### For Correct Method Selection

1. **Match imsType exactly** - getString for String, getInt for Int, etc.
2. **Preserve parameter order** - For Path: segment name first, field name second
3. **Use field name from metadata** - After conversion, not original source name

### For Quality Assurance

1. **Verify every field access** - Check metadata for each field
2. **Count parameters** - IOMessage = 1, Path = 2
3. **Review method names** - Must match imsType from metadata

---

## Integration with Other Skills

This skill works with:

- **ims-program-class** - Main program field access
- **ims-message-class** - IOMessage field access
- **ims-tm-call-statements** - TM call field access
- **ims-db-ioarea** - Path field access
- **ims-db-call-statements** - DB call field access

---

## Summary

This skill ensures correct field access patterns during IMS transformation:

1. **Field Name Conversion** - Always convert dashes to underscores before generating code
2. **Context-Aware Methods** - IOMessage uses single parameter, Path uses two parameters
3. **imsType-Driven Selection** - Method name determined by field's imsType property
4. **metadata as Source of Truth** - All field information comes from metadata

By following these guardrails, you ensure field access uses correct methods, proper parameter counts, and accurate field names in the transformed Java code.
