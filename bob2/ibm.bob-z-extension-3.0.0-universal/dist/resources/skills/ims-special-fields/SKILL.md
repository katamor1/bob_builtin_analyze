---
name: ims-special-fields
description: Handles LL, ZZ, and TRANCODE special field detection and translation during IMS COBOL/PL/I to Java transformation. Use when translating IMS message field access, generating IMS Message classes, or processing field assignments in IMS programs. Ensures system-managed fields (LL/ZZ) are properly handled and TRANCODE fields use specialized methods instead of generic getters/setters.
---

# IMS Special Fields Guardrails

This skill provides critical rules for detecting and translating LL (Length), ZZ (Reserved), and TRANCODE (Transaction Code) fields in IMS Message classes during COBOL/PL/I to Java transformation.

## Prerequisites

Before using this skill, ensure:

- IMS transformation workflow is active
- IMS Message class metadata is available with special field markers
- Source code contains IMS message field access (MOVE, SET statements)
- Metadata includes LL, ZZ, and TranCode field definitions

## Overview

IMS Message classes contain three types of special fields that require unique handling:

1. **LL Fields** - System-managed length fields (read-only via `getActualLength()`)
2. **ZZ Fields** - System-managed reserved fields (no access allowed)
3. **TRANCODE Fields** - Transaction code fields (use `getTransactionName()`/`setTransactionName()`)

**CRITICAL**: Field detection is **metadata-driven**, not name-based. A field named "CUSTOMER_LL" is NOT special unless metadata explicitly marks it as an LL field.

---

## Complete Workflow

### Phase 1: Field Detection (MANDATORY PRE-CHECK)

**Purpose**: Identify special fields before generating any field access code.

#### Step 1.1: Extract Field Name from Source

**For each field access in source code**, extract the field name:

**COBOL Examples**:

```cobol
MOVE VALUE TO FIELD-NAME        → Extract "FIELD-NAME"
MOVE VALUE TO AREA.FIELD-NAME   → Extract "FIELD-NAME" (qualified)
```

**PL/I Examples**:

```pli
FIELD_NAME = VALUE              → Extract "FIELD_NAME"
AREA.FIELD_NAME = VALUE         → Extract "FIELD_NAME" (qualified)
```

**Important**:

- For qualified references, extract only the field name (not the structure name)
- Convert dashes to underscores: "FIELD-NAME" → "FIELD_NAME"

#### Step 1.2: Locate IMS Message Class in Metadata

**Identify which IOMessage variable** is being accessed:

- Source: `MOVE X TO OUTPUT-AREA.LL-OUT`
- IOMessage variable: `OUTPUT-AREA`
- Find corresponding class in metadata: `OutputArea`

#### Step 1.3: Check Metadata Properties

**Search for the field name** in the IMS Message class metadata:

```markdown
#### Class: OutputArea

**LL Field**: LL_OUT
**ZZ Field**: ZZ_OUT
**TranCode Field**: TRAN_CODE
```

**Match the extracted field name** against these properties:

- If matches `**LL Field**: FIELD_NAME` → LL FIELD
- If matches `**ZZ Field**: FIELD_NAME` → ZZ FIELD
- If matches `**TranCode Field**: FIELD_NAME` → TRANCODE FIELD
- If no match → NORMAL FIELD

**⛔ CRITICAL**:

- DO NOT use JSON metadata properties (field.state, field.position, etc.)
- ONLY use special field markers from metadata (LL Field, ZZ Field, TranCode Field)
- Field name patterns (e.g., ending in "\_LL") are NOT sufficient

---

## Phase 2: Translation Rules

**Purpose**: Generate correct Java code based on field type.

### Step 2.1: LL Field Translation

**Description**: LL fields are system-managed length fields that cannot be set by application code.

**Read Access**:

```java
// Source: DISPLAY LL-OUT
int length = outputArea.getActualLength();
```

**Write Access**:

```java
// Source: MOVE 100 TO LL-OUT
// Unsupported translation of LL field
```

**CRITICAL RULES**:

- ✅ Read access: Use `ioMessage.getActualLength()`
- ❌ Write access: Generate comment ONLY, then skip to next statement
- ❌ FORBIDDEN: NO setter methods (setInt, setShort, etc.) on LL fields

### Step 2.2: ZZ Field Translation

**Description**: ZZ fields are system-managed reserved fields that cannot be accessed by application code.

**All Access**:

```java
// Source: MOVE 0 TO ZZ-OUT
// Unsupported translation of ZZ field

// Source: IF ZZ-OUT = 0
// Unsupported translation of ZZ field
```

**CRITICAL RULES**:

- ❌ Read access: Generate comment ONLY, then skip to next statement
- ❌ Write access: Generate comment ONLY, then skip to next statement
- ❌ FORBIDDEN: NO getters or setters for ZZ fields

### Step 2.3: TRANCODE Field Translation

**Description**: TRANCODE fields use specialized methods, not generic getString/setString.

**Read Access**:

```java
// Source: MOVE TRAN-CODE TO WS-TRAN
String tranCode = inputArea.getTransactionName();
```

**Write Access**:

```java
// Source: MOVE "TRAN" TO TRAN-CODE
outputArea.setTransactionName("TRAN");
```

**CRITICAL RULES**:

- ✅ Read access: Use `ioMessage.getTransactionName()`
- ✅ Write access: Use `ioMessage.setTransactionName(value)`
- ❌ FORBIDDEN: NO generic getString/setString for TRANCODE fields

### Step 2.4: Normal Field Translation

**Description**: All other fields use externalName with generic get/set methods.

**Read Access**:

```java
// Source: MOVE MSG-DATA TO WS-DATA
String value = outputArea.getString("MSG_DATA");
```

**Write Access**:

```java
// Source: MOVE "SUCCESS" TO MSG-DATA
outputArea.setString("MSG_DATA", "SUCCESS");
```

**CRITICAL RULES**:

- ✅ Use externalName from metadata (NOT javaName)
- ✅ Use imsType from metadata to determine method (getString, getInt, etc.)
- ✅ Convert dashes to underscores: "MSG-OUT" → "MSG_OUT"

---

## Phase 3: Validation

**Purpose**: Ensure correct field handling before completing translation.

### Step 3.1: Pre-Generation Checklist

**BEFORE generating ANY field access code**, verify:

- [ ] Extracted field name from source statement
- [ ] Identified IOMessage variable being accessed
- [ ] Located corresponding IMS Message class in metadata
- [ ] Checked metadata for special field markers (LL Field, ZZ Field, TranCode Field)
- [ ] Applied correct translation rule based on field type

### Step 3.2: Source Fidelity Check

**CRITICAL**: Only translate code that exists in source.

**Forbidden Patterns**:

- ❌ Adding `getTransactionName()` when source doesn't access TRAN-CODE field
- ❌ Adding field access for fields not referenced in source
- ❌ Creating "helpful" code that wasn't in original program

**Enforcement**:

1. Verify field is accessed in source code
2. Find exact source statement being translated
3. Only then generate corresponding Java code

---

## Quick Reference Table

| Field Type | Detection (metadata)           | Read Method              | Write Method             | Notes            |
| ---------- | ------------------------------ | ------------------------ | ------------------------ | ---------------- |
| LL         | **LL Field**: FIELD_NAME       | getActualLength()        | FORBIDDEN (comment only) | System-managed   |
| ZZ         | **ZZ Field**: FIELD_NAME       | FORBIDDEN (comment only) | FORBIDDEN (comment only) | System-managed   |
| TRANCODE   | **TranCode Field**: FIELD_NAME | getTransactionName()     | setTransactionName(val)  | Special methods  |
| Normal     | Not listed as special field    | get{imsType}("extName")  | set{imsType}("extName")  | Use externalName |

---

## Common Scenarios

### Scenario 1: Translating ZZ Field Assignment

**Source COBOL**:

```cobol
MOVE 0 TO ZZ-OUT.
```

**Workflow**:

1. Extract field name: "ZZ-OUT" → "ZZ_OUT"
2. Identify IOMessage: OUTPUT-AREA
3. Check metadata for OutputArea class
4. Find: `**ZZ Field**: ZZ_OUT`
5. Match found! → Generate comment only

**Generated Java**:

```java
// Unsupported translation of ZZ field
```

**Next Action**: Skip to next source statement (NO setShort call)

### Scenario 2: Translating TRANCODE Field Access

**Source COBOL**:

```cobol
MOVE "TRAN" TO TRAN-CODE.
IF TRAN-CODE = "TRAN"
    DISPLAY "Transaction code set".
```

**Workflow**:

1. Extract field name: "TRAN-CODE" → "TRAN_CODE"
2. Check metadata: `**TranCode Field**: TRAN_CODE`
3. Match found! → Use specialized methods

**Generated Java**:

```java
outputArea.setTransactionName("TRAN");
if (outputArea.getTransactionName().equals("TRAN")) {
    System.out.println("Transaction code set");
}
```

### Scenario 3: Translating Normal Field with Name Pattern

**Source COBOL**:

```cobol
MOVE 100 TO CUSTOMER-LL.
```

**Workflow**:

1. Extract field name: "CUSTOMER-LL" → "CUSTOMER_LL"
2. Check metadata: NO special field markers for CUSTOMER_LL
3. No match → This is a NORMAL field (despite "\_LL" suffix)

**Generated Java**:

```java
outputArea.setInt("CUSTOMER_LL", 100);
```

**Key Point**: Field name patterns don't determine special field status - only metadata properties do.

---

## Troubleshooting

### Issue 1: Generated Setter for LL Field

**Symptom**: Code like `outputArea.setShort("LL_OUT", 100)` is generated

**Cause**: Skipped mandatory pre-check or didn't consult metadata

**Solution**:

1. Always check metadata BEFORE generating field access
2. If `**LL Field**: LL_OUT` exists, generate comment only
3. Never generate setter calls for LL fields

### Issue 2: Using getString for TRANCODE Field

**Symptom**: Code like `outputArea.getString("TRAN_CODE")` is generated

**Cause**: Treated TRANCODE field as normal field

**Solution**:

1. Check metadata for `**TranCode Field**: TRAN_CODE`
2. Use `getTransactionName()` instead of `getString()`
3. Use `setTransactionName()` instead of `setString()`

### Issue 3: Field Not Detected as Special

**Symptom**: Field with "\_LL" suffix treated as normal field

**Cause**: Relying on field name patterns instead of metadata

**Solution**:

1. Ignore field name patterns
2. Only check metadata for special field markers
3. If not listed as special field, treat as normal field

---

## Best Practices

### For Accurate Detection

1. **Always consult metadata** - Never rely on field name patterns or JSON properties
2. **Extract field names correctly** - Handle both qualified and unqualified references
3. **Match exact field names** - Case-sensitive comparison with metadata special field markers

### For Correct Translation

1. **Generate comments for forbidden access** - Don't skip silently, document the unsupported operation
2. **Use specialized methods** - TRANCODE fields require getTransactionName/setTransactionName
3. **Preserve source fidelity** - Only translate field access that exists in source code

### For Quality Assurance

1. **Verify every field access** - Run pre-check for each MOVE/SET statement
2. **Count special fields** - Ensure all LL/ZZ/TRANCODE fields are handled correctly
3. **Review generated code** - Check for forbidden patterns (setters on LL, any access to ZZ)

---

## Integration with Other Rules

This skill is referenced by:

- **ims_message_class** - Message class generation and field access
- **ims_tm_call_statements** - TM call statement translation

---

## Summary

This skill ensures correct handling of IMS special fields during transformation:

1. **Metadata-Driven Detection** - Use metadata special field markers, not field name patterns
2. **Mandatory Pre-Check** - Verify field type before generating any access code
3. **Specialized Translation** - Apply correct rules for LL, ZZ, TRANCODE, and normal fields
4. **Source Fidelity** - Only translate field access that exists in source code

By following these guardrails, you ensure system-managed fields are properly handled and TRANCODE fields use the correct specialized methods.
