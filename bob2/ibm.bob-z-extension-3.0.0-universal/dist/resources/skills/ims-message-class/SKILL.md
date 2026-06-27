---
name: ims-message-class
description: Handles IMS Message class generation and field access patterns during IMS COBOL/PL/I to Java transformation. Use when generating IMS Message classes that extend IMSFieldMessage, accessing IOMessage fields, or handling special fields (LL/ZZ/TRANCODE). Ensures correct class structure, proper use of imsClassSourceCode from ClassMetadata, and correct IOMessage initialization patterns.
---

# IMS Message Class Guardrails

This skill provides the single source of truth for IMS Message class generation and usage during COBOL/PL/I to Java transformation.

## Prerequisites

Before using this skill, ensure:

- IMS transformation workflow is active
- Metadata is available with IMS Message class information
- Source code contains IMS message data structures (COBOL 01-level or PL/I DCL 1)
- `imsClassSourceCode` property is present in `ClassMetadata` for each IMS Message class

## Overview

IMS Message classes are Java classes that:

1. **Extend IMSFieldMessage** - Provide field-based message structure
2. **Define DLITypeInfo arrays** - Specify field metadata (name, type, position, length)
3. **Use IOMessage interface** - Runtime field access in main program
4. **Handle special fields** - LL (length), ZZ (reserved), TRANCODE (transaction code)

**CRITICAL**: IMS Message class source code MUST be read from the `imsClassSourceCode` property of `ClassMetadata`. The source code MUST be used exactly as provided, with NO modifications.

---

## Complete Workflow

### Phase 1: Class Generation (MANDATORY)

**Purpose**: Generate IMS Message class Java files from metadata.

#### Step 1.1: Identify IMS Message Classes

**Locate IMS Message class definitions** in metadata:

```markdown
#### Class: OutputArea

**IMS Class Type**: IMS Message
**Header Type**: LL_ZZ_TRANCODE
**LL Field**: LL_OUT
**ZZ Field**: ZZ_OUT
**TranCode Field**: TRAN_CODE
```

**Key Properties**:

- `imsClassType: "IMS Message"` - Identifies this as an IMS Message class
- `headerType` - Defines special field structure (e.g., LL_ZZ_TRANCODE)
- Special field markers - LL Field, ZZ Field, TranCode Field

#### Step 1.2: Read imsClassSourceCode from ClassMetadata

**CRITICAL**: ALL IMS Message class source code MUST be read from the `imsClassSourceCode` property of `ClassMetadata`. Do not manually generate or modify this source.

**How to access**:

For each IMS Message class identified in the metadata, locate the corresponding `ClassMetadata` entry and read its `imsClassSourceCode` property:

```typescript
// ClassMetadata.imsClassSourceCode contains the complete, ready-to-write Java source
const sourceCode = classMetadata.imsClassSourceCode;
```

**`imsClassSourceCode` structure**:

The property contains the complete Java source code as a string, for example:

```text
"package com.ibm.wcaz.implementation;\n\nimport com.ibm.ims.application.IMSFieldMessage;\n..."
```

#### Step 1.3: Write Source Code to File

**Extract `imsClassSourceCode`** from `ClassMetadata` and write to file:

```java
// Content from metadata.src - NO MODIFICATIONS ALLOWED
package com.ibm.wcaz.implementation;

import com.ibm.ims.application.IMSFieldMessage;
import com.ibm.ims.base.DLITypeInfo;

/**
 * IMS Message class for message area handling.
 * Extends IMSFieldMessage to provide field-based message structure.
 */
public class OutputArea extends IMSFieldMessage {
    private static final long serialVersionUID = -1;

    private static DLITypeInfo[] fieldInfo = {
        new DLITypeInfo("MSG_FIELD", DLITypeInfo.CHAR, 1, 32),
        new DLITypeInfo("CODE_FIELD", DLITypeInfo.CHAR, 33, 12)
    };

    public OutputArea() {
        super(fieldInfo, 61, false, IMSFieldMessage.TRANSCODE_NONE);
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

## Phase 2: Class Structure Understanding

**Purpose**: Understand the generated IMS Message class structure.

### Step 2.1: Base Class and Imports

**Required Base Class**:

```java
public class ImsMessageArea extends IMSFieldMessage
```

**Required Imports**:

```java
import com.ibm.ims.application.IMSFieldMessage;
import com.ibm.ims.base.DLITypeInfo;
```

### Step 2.2: Field Metadata Array

**DLITypeInfo Array Structure**:

```java
private static DLITypeInfo[] fieldInfo = {
    new DLITypeInfo("FIELD_NAME", DLITypeInfo.TYPE, position, length),
    // ... more fields
};
```

**DLITypeInfo Parameters**:

1. **Field name** - External name (uppercase, underscores)
2. **Field type** - DLITypeInfo constant (CHAR, INT, SHORT, etc.)
3. **Position** - Starting byte position (1-based)
4. **Length** - Field length in bytes

**⛔ CRITICAL**: Special fields (LL, ZZ, TRANCODE) are excluded from fieldInfo array.

### Step 2.3: Constructor Pattern

**Constructor Signature**:

```java
public ImsMessageArea() {
    super(fieldInfo, totalLength, hasTranCode, tranCodeType);
}
```

**Parameters**:

- `fieldInfo` - Field metadata array
- `totalLength` - Total message length in bytes
- `hasTranCode` - Boolean indicating if TRANCODE field exists
- `tranCodeType` - TRANSCODE_NONE or other constant

---

## Phase 3: IOMessage Field Access in Main Program

**Purpose**: Access IMS Message class fields through IOMessage interface.

### Step 3.1: IOMessage Declaration and Initialization

**Declaration Pattern**:

```java
private static IOMessage outputArea;
```

**Initialization Pattern**:

```java
outputArea = application.getIOMessage("class://com.ibm.wcaz.implementation.OutputArea");
```

**⛔ CRITICAL RULES**:

- ✅ Declare as IOMessage type (NOT concrete class type)
- ✅ Initialize using application.getIOMessage()
- ✅ Use fully qualified class name with "class://" prefix
- ❌ FORBIDDEN: `new OutputArea()` - Never instantiate directly
- ❌ FORBIDDEN: Declaring as concrete class type

### Step 3.2: Field Access Methods

**Read Access Pattern**:

```java
String value = outputArea.getString("FIELD_NAME");
int count = outputArea.getInt("COUNT_FIELD");
```

**Write Access Pattern**:

```java
outputArea.setString("FIELD_NAME", "value");
outputArea.setInt("COUNT_FIELD", 100);
```

**Method Selection by imsType**:

| imsType    | Read Method            | Write Method                |
| ---------- | ---------------------- | --------------------------- |
| String     | getString("FIELD")     | setString("FIELD", val)     |
| Int        | getInt("FIELD")        | setInt("FIELD", val)        |
| Short      | getShort("FIELD")      | setShort("FIELD", val)      |
| Long       | getLong("FIELD")       | setLong("FIELD", val)       |
| BigDecimal | getBigDecimal("FIELD") | setBigDecimal("FIELD", val) |
| Byte       | getByte("FIELD")       | setByte("FIELD", val)       |

**⛔ CRITICAL**: Use field's externalName from metadata (with dash-to-underscore conversion).

### Step 3.3: IOMessage Initialization (clear method)

**CRITICAL RULE**: MOVE ZEROS/ZEROES/SPACES to IOMessage MUST use clear() method.

**Source Patterns**:

```cobol
MOVE ZEROS TO OUTPUT-AREA.
MOVE ZEROES TO INPUT-AREA.
MOVE SPACES TO OUTPUT-AREA.
INITIALIZE OUTPUT-AREA.
```

**Correct Translation**:

```java
outputArea.clear();
```

**⛔ FORBIDDEN PATTERNS**:

```java
// ❌ WRONG - Never use setBytes() to clear
outputArea.setBytes(new byte[outputArea.getActualLength()]);
outputArea.setBytes(new byte[size]);
```

**Validation Checkpoint**:

1. Search for MOVE ZEROS/ZEROES/SPACES patterns in source
2. Verify each translates to `ioMessage.clear()`
3. Search generated code for `setBytes()` patterns
4. If found, STOP and fix - use `clear()` instead

---

## Phase 4: Special Field Handling

**Purpose**: Handle LL, ZZ, and TRANCODE fields correctly.

### Step 4.1: Special Field Detection

**Metadata-Driven Detection** (from metadata):

```markdown
**LL Field**: LL_OUT
**ZZ Field**: ZZ_OUT
**TranCode Field**: TRAN_CODE
```

**Detection Algorithm**:

1. Extract field name from source code
2. Check against metadata special field properties
3. Apply appropriate translation rule

**⛔ CRITICAL**: Detection is metadata-driven, NOT name-based. A field named "CUSTOMER_LL" is NOT special unless metadata marks it.

### Step 4.2: LL Field Handling

**Description**: System-managed length fields (read-only).

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

**⛔ CRITICAL RULES**:

- ✅ Read: Use `getActualLength()` method
- ❌ Write: Generate comment ONLY, skip to next statement
- ❌ FORBIDDEN: NO setter methods on LL fields

### Step 4.3: ZZ Field Handling

**Description**: System-managed reserved fields (no access allowed).

**All Access**:

```java
// Source: MOVE 0 TO ZZ-OUT
// Unsupported translation of ZZ field

// Source: IF ZZ-OUT = 0
// Unsupported translation of ZZ field
```

**⛔ CRITICAL RULES**:

- ❌ Read: Generate comment ONLY, skip to next statement
- ❌ Write: Generate comment ONLY, skip to next statement
- ❌ FORBIDDEN: NO getters or setters for ZZ fields

### Step 4.4: TRANCODE Field Handling

**Description**: Transaction code fields use specialized methods.

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

**⛔ CRITICAL RULES**:

- ✅ Read: Use `getTransactionName()` method
- ✅ Write: Use `setTransactionName(value)` method
- ❌ FORBIDDEN: NO generic getString/setString for TRANCODE

### Step 4.5: Normal Field Handling

**Description**: All other fields use standard IOMessage methods.

**Access Pattern**:

```java
// Read
String value = outputArea.getString("MSG_DATA");

// Write
outputArea.setString("MSG_DATA", "SUCCESS");
```

**Rules**:

- ✅ Use externalName from metadata (dash-to-underscore conversion)
- ✅ Use imsType to determine method (getString, getInt, etc.)
- ✅ Single parameter for field name

---

## Phase 5: Coding Standards Compliance

**Purpose**: Apply AGENTS.md coding standards to generated classes.

### Step 5.1: Documentation Standards

**Class-Level JavaDoc**:

```java
/**
 * IMS Message class for message area handling.
 * Extends IMSFieldMessage to provide field-based message structure.
 *
 * This class defines the message layout with LL/ZZ header fields
 * and application data fields for IMS transaction processing.
 *
 * @see com.ibm.ims.application.IMSFieldMessage
 * @see com.ibm.ims.base.DLITypeInfo
 */
public class ImsMessageArea extends IMSFieldMessage {
```

**Field-Level JavaDoc**:

```java
/**
 * Field metadata definitions for the message structure.
 * Defines field names, types, positions, and lengths.
 */
private static DLITypeInfo[] fieldInfo = {
```

**Constructor JavaDoc**:

```java
/**
 * Constructs a new ImsMessageArea with predefined field structure.
 * Initializes the message with total length of 61 bytes and no transaction code.
 */
public ImsMessageArea() {
```

### Step 5.2: Formatting Standards

**Apply from AGENTS.md**:

- 4-space indentation
- 120-character line width
- Double quotes for strings
- Trailing commas in arrays

**⛔ CRITICAL**: Apply ONLY documentation and formatting standards, NOT naming conventions (class names follow IMS metadata).

---

## Phase 6: Forbidden Patterns

**Purpose**: Avoid common mistakes in IMS Message class usage.

### Step 6.1: Direct Instantiation (FORBIDDEN)

**❌ WRONG - Never instantiate IMS Message classes**:

```java
// ❌ FORBIDDEN
private ImsMessageClass1 messageObj = new ImsMessageClass1();
messageObj.setMsgField("value");
String value = messageObj.getMsgField();
```

**✅ CORRECT - Use IOMessage interface**:

```java
// ✅ CORRECT
private static IOMessage imsMessage;
imsMessage = application.getIOMessage("class://com.ibm.wcaz.implementation.ImsMessageClass1");
imsMessage.setString("MSG_FIELD", "value");
String value = imsMessage.getString("MSG_FIELD");
```

### Step 6.2: Class-Specific Methods (FORBIDDEN)

**❌ WRONG - Never use class-specific getters/setters**:

```java
// ❌ FORBIDDEN
outputArea.setMsgField("value");
String value = outputArea.getMsgField();
```

**✅ CORRECT - Use generic IOMessage methods**:

```java
// ✅ CORRECT
outputArea.setString("MSG_FIELD", "value");
String value = outputArea.getString("MSG_FIELD");
```

### Step 6.3: Wrong Initialization (FORBIDDEN)

**❌ WRONG - Using setBytes() to clear**:

```java
// ❌ FORBIDDEN
outputArea.setBytes(new byte[outputArea.getActualLength()]);
```

**✅ CORRECT - Use clear() method**:

```java
// ✅ CORRECT
outputArea.clear();
```

---

## Quick Reference Table

### Class Generation Workflow

| Step | Action                                 | Tool/Method                        |
| ---- | -------------------------------------- | ---------------------------------- |
| 1    | Identify IMS Message class in metadata | Check metadata                     |
| 2    | Read source from ClassMetadata         | `classMetadata.imsClassSourceCode` |
| 3    | Write to file (NO modifications)       | write_to_file                      |
| 4    | Verify coding standards applied        | Check JavaDoc and formatting       |

### Special Field Translation

| Field Type | Detection (metadata)           | Read Method              | Write Method             |
| ---------- | ------------------------------ | ------------------------ | ------------------------ |
| LL         | **LL Field**: FIELD_NAME       | getActualLength()        | FORBIDDEN (comment only) |
| ZZ         | **ZZ Field**: FIELD_NAME       | FORBIDDEN (comment only) | FORBIDDEN (comment only) |
| TRANCODE   | **TranCode Field**: FIELD_NAME | getTransactionName()     | setTransactionName(val)  |
| Normal     | Not listed as special field    | get{imsType}("extName")  | set{imsType}("extName")  |

### IOMessage Initialization Patterns

| Source Pattern             | Java Translation   |
| -------------------------- | ------------------ |
| MOVE ZEROS TO OUTPUT-AREA  | outputArea.clear() |
| MOVE ZEROES TO INPUT-AREA  | inputArea.clear()  |
| MOVE SPACES TO OUTPUT-AREA | outputArea.clear() |
| INITIALIZE OUTPUT-AREA     | outputArea.clear() |

---

## Common Scenarios

### Scenario 1: Generating IMS Message Class

**Source COBOL**:

```cobol
01 OUTPUT-AREA.
   05 LL-OUT          PIC S9(4) COMP.
   05 ZZ-OUT          PIC S9(4) COMP.
   05 MSG-OUT         PIC X(32).
   05 CODE-OUT        PIC X(12).
```

**Workflow**:

1. Identify in metadata: `OutputArea` (IMS Message class)
2. Read source: `classMetadata.imsClassSourceCode` for `OutputArea`
3. Write to file: `src/main/java/com/ibm/wcaz/implementation/OutputArea.java`
4. Verify: Class extends IMSFieldMessage, has fieldInfo array, constructor

**Generated Class** (from tool):

```java
package com.ibm.wcaz.implementation;

import com.ibm.ims.application.IMSFieldMessage;
import com.ibm.ims.base.DLITypeInfo;

public class OutputArea extends IMSFieldMessage {
    private static final long serialVersionUID = -1;

    private static DLITypeInfo[] fieldInfo = {
        new DLITypeInfo("MSG_OUT", DLITypeInfo.CHAR, 1, 32),
        new DLITypeInfo("CODE_OUT", DLITypeInfo.CHAR, 33, 12)
    };

    public OutputArea() {
        super(fieldInfo, 48, false, IMSFieldMessage.TRANSCODE_NONE);
    }
}
```

### Scenario 2: Accessing IMS Message Fields

**Source COBOL**:

```cobol
MOVE "Success" TO MSG-OUT.
MOVE "H001" TO CODE-OUT.
DISPLAY MSG-OUT.
```

**Workflow**:

1. Declare IOMessage: `private static IOMessage outputArea;`
2. Initialize: `outputArea = application.getIOMessage("class://com.ibm.wcaz.implementation.OutputArea");`
3. Translate field access using metadata imsType

**Generated Java**:

```java
private static IOMessage outputArea;

// In main method
outputArea = application.getIOMessage("class://com.ibm.wcaz.implementation.OutputArea");

// Field access
outputArea.setString("MSG_OUT", "Success");
outputArea.setString("CODE_OUT", "H001");
String msg = outputArea.getString("MSG_OUT");
System.out.println(msg);
```

### Scenario 3: Handling Special Fields

**Source COBOL**:

```cobol
MOVE 100 TO LL-OUT.
MOVE 0 TO ZZ-OUT.
MOVE "TRAN" TO TRAN-CODE.
DISPLAY LL-OUT.
```

**Workflow**:

1. Check metadata for special field markers
2. Apply appropriate translation for each field type

**Generated Java**:

```java
// Unsupported translation of LL field
// Unsupported translation of ZZ field
outputArea.setTransactionName("TRAN");
int length = outputArea.getActualLength();
System.out.println(length);
```

---

## Troubleshooting

### Issue 1: Modified Source Code

**Symptom**: Generated class doesn't match `imsClassSourceCode` content

**Cause**: Modified `imsClassSourceCode` content before writing to file

**Solution**:

1. Extract `imsClassSourceCode` from `ClassMetadata`
2. Write content EXACTLY as provided
3. NO modifications to source code, comments, or formatting
4. Preserve ALL structure from metadata

### Issue 2: Direct Class Instantiation

**Symptom**: Code like `new OutputArea()` in main program

**Cause**: Instantiated IMS Message class directly instead of using IOMessage

**Solution**:

1. Remove direct instantiation
2. Declare as IOMessage type
3. Initialize using `application.getIOMessage()`
4. Access fields through IOMessage methods

### Issue 3: Wrong Special Field Method

**Symptom**: Using `getString("TRAN_CODE")` instead of `getTransactionName()`

**Cause**: Didn't check metadata for special field markers

**Solution**:

1. Check metadata for special field properties
2. Use specialized methods for LL/TRANCODE fields
3. Generate comments only for ZZ fields
4. Use generic methods only for normal fields

### Issue 4: Using setBytes() for Initialization

**Symptom**: Code like `outputArea.setBytes(new byte[size])`

**Cause**: Incorrect translation of MOVE ZEROS/SPACES

**Solution**:

1. Always use `clear()` method for initialization
2. Never use `setBytes()` to clear IOMessage
3. Search for MOVE ZEROS/SPACES patterns
4. Verify each translates to `clear()`

---

## Best Practices

### For Class Generation

1. **Always use imsClassSourceCode** - Never manually generate IMS Message classes
2. **Use `imsClassSourceCode` exactly** - No modifications to metadata-provided source
3. **Verify structure** - Check extends IMSFieldMessage, has fieldInfo, constructor
4. **Apply standards** - Ensure JavaDoc and formatting from AGENTS.md

### For Field Access

1. **Use IOMessage interface** - Never instantiate concrete classes
2. **Check metadata first** - Identify special fields before generating access code
3. **Use correct methods** - Match imsType from metadata
4. **Convert field names** - Apply dash-to-underscore conversion

### For Quality Assurance

1. **Validate source origin** - Verify `imsClassSourceCode` from `ClassMetadata` was used
2. **Check special fields** - Ensure LL/ZZ/TRANCODE handled correctly
3. **Review initialization** - Verify clear() used for MOVE ZEROS/SPACES
4. **Count forbidden patterns** - Search for direct instantiation, setBytes()

---

## Integration with Other Skills

This skill works with:

- **ims-special-fields** - Special field detection and translation (LL/ZZ/TRANCODE)
- **ims-field-access** - IOMessage field access patterns and method selection
- **ims-imports** - Required imports for IMS programs (IOMessage, IMSFieldMessage, etc.)
- **coding-standards-builder** - AGENTS.md standards for documentation and formatting

---

## Critical Warnings

**⚠️ ALWAYS USE imsClassSourceCode FROM ClassMetadata ⚠️**
**⚠️ NEVER MODIFY METADATA-PROVIDED SOURCE CODE ⚠️**
**⚠️ NEVER INSTANTIATE IMS MESSAGE CLASSES DIRECTLY ⚠️**
**⚠️ ALWAYS USE IOMessage INTERFACE FOR FIELD ACCESS ⚠️**
**⚠️ USE clear() FOR INITIALIZATION, NOT setBytes() ⚠️**

---

## Summary

This skill ensures correct IMS Message class generation and usage:

1. **Metadata-Based Generation** - Read `imsClassSourceCode` from `ClassMetadata`, write exactly as provided
2. **IOMessage Interface** - Declare as IOMessage, initialize with getIOMessage(), never instantiate directly
3. **Special Field Handling** - Metadata-driven detection, specialized methods for LL/TRANCODE, comments for ZZ
4. **Correct Initialization** - Use clear() for MOVE ZEROS/SPACES, never setBytes()
5. **Coding Standards** - Apply AGENTS.md documentation and formatting standards

By following these guardrails, you ensure IMS Message classes are correctly generated and used in transformed Java code.
