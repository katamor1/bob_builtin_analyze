---
name: cobol-transformation
description: Provides comprehensive context for applying specific rules for COBOL variables during COBOL-to-Java transformations. Use when generating Java classes from COBOL. Covers FILLER and REDEFINES fields.
---

# COBOL Transformation Context

This skill provides comprehensive context for applying correct handling during COBOL-to-Java transformations when FILLER or REDEFINES fields are present.

## When to Use This Skill

Use this skill when:

- Generating Java classes from COBOL programs with FILLER fields
- Generating Java classes from COBOL with REDEFINES fields

## FILLER Field Handling

FILLER fields are byte arrays used for COBOL padding and binary compatibility. They require different methods of handling depending on how they are used. There are 3 scenarios for FILLER handling based on context as detailed below.

### Variable Scope Rules

Principle: Most restrictive scope: local (preferred) or instance (data structures only)

**Rules:**

- Default to local for working storage/temporary variables
- ONLY instance variables for data structure fields and FILLER
- Do NOT put working storage at class level
- Loop counters always local

### Scenario 1: FILLER as PIC (Simple Byte Array)

**Pattern:** FILLER directly followed by PIC

**Examples:**

- `10 FILLER PIC X(2)`
- `05 FILLER PIC 9(5)`
- `FILLER PIC X VALUE '/'`

**Java:**

```java
private byte[] fillerN = new byte[size];
```

### Scenario 2: FILLER with OCCURS (Calculated byte array)

**Pattern:** FILLER OCCURS in PIC

**Examples:**

- `FILLER OCCURS 10 PIC X`

- ```cobol
    05 A OCCURS 5.
    10 FILLER PIC X(2).
  ```

**Java:**

```java
private byte[] fillerN = new byte[OCCURS_count * PIC_size];
```

### Scenario 3: FILLER in OCCURS (Nested in array)

**Pattern:** FILLER PIC within OCCURS clause

**Examples:**

- ```cobol
    05 A OCCURS 5. 10 FILLER PIC X(2).
    10 B PIC X(3).
  ```

**Java:**

```java
private byte[] fillerN = new byte[size]; // OCCURS handled at parent
```

### Instructions

1. When checking FILLER OCCURS use Scenario 2
2. When checking parent OCCURS use Scenario 3
3. When checking FILLER PIC use Scenario 1

#### ⛔ CRITICAL ⛔

REDEFINES Scope: FILLER in REDEFINED area belongs ONLY to that structure. Do NOT propagate to parents.

**Example:**

```COBOL
01 RECORD-X.
    02 GROUP-Y.
        05 AREA-Z.
            10 FILLER PIC X(2).
        05 CODE-P REDEFINES AREA-Z PIC X(11).
```

**Result:** AreaZ has filler1 (byte[2]). GroupY and RECORD-X do NOT contain filler.

**Naming:** Sequential - filler1, filler2, filler3 per class

**Size:**

- PIC X(n)/9(n) → byte[n]
- PIC X → byte[1]
- OCCURS: count x PIC_size

#### ⛔ CRITICAL RULES ⛔

- Identify scenario correctly
- ALWAYS use byte[] regardless of VALUE (binary compatibility)
- Use sequential names per class
- Preserve order/position
- Document ALL FILLER in data-model.md with scenario type

## REDEFINES Transformation Rules

**Description:**
Shared rules for handling COBOL REDEFINES for overlapping data structures. Used only after applying base COBOL rules - REDEFINES are supplementary additions.

### ⛔ CRITICAL DISTINCTION ⛔

- Scenarios 1-3 (PIC-to-Group, PIC-to-PIC, PIC-to-OCCURS): Only original in metadata. REDEFINES NOT in metadata → accessor methods only (no instance vars).
- Scenario 4 (Group-to-Group): BOTH in metadata with superclass → Use metadata's superclass. NO accessor-only pattern.

### Scenario 1: PIC to Group

**Description:** PIC field REDEFINES group. Two approaches: simple (direct access) vs complex (byte serialization)

**Applicability:**

- Simple: All leaf fields PIC X/9 only, no OCCURS/COMP/COMP-3 → direct field access
- Complex: Contains OCCURS, COMP, COMP-3, BINARY, PACKED-DECIMAL → toByteString()/setBytes()

**COBOL Simple Example:**

```cobol
01 TOP.
  02 B1.
    05 C1.
        07 D1 PIC X(5).
        07 D2 PIC 9(1).
        07 D3 PIC X(3).
  02 B2 PIC X(9) REDEFINES B1.
  02 B3 PIC 9(9) REDEFINES B1.
```

**Java for PIC X:**

```java
public String getB2() {
    return String.format("%-5.5s", B1.getC1().getD1()) +
           String.format("%1d", B1.getC1().getD2()) +
           String.format("%-3.3s", B1.getC1().getD3());
}
public void setB2(String B2) {
    if (B2 != null && B2.length() >= 9) {
        B1.getC1().setD1(B2.substring(0, 5));
        B1.getC1().setD2(Integer.parseInt(B2.substring(5, 6)));
        B1.getC1().setD3(B2.substring(6, 9));
    }
}
```

**Java for PIC 9:**

```java
public long getB3() {
    return Long.parseLong(String.format("%-5.5s", B1.getC1().getD1()).trim()) * 10000 +
           (B1.getC1().getD2() % 10) * 1000 +
           Long.parseLong(String.format("%-3.3s", B1.getC1().getD3()).trim());
}
public void setB3(long B3) {
    B1.getC1().setD1(String.format("%5d", B3 / 10000));
    B1.getC1().setD2((int)((B3 / 1000) % 10));
    B1.getC1().setD3(String.format("%3d", B3 % 1000));
}
```

**Complex COBOL Example:**

COBOL:

```cobol
01 TOP.
    05 C1 PIC X(100).
    05 C2 REDEFINES C1 OCCURS 100 TIMES PIC X(1).
```

Java:

```java
public String getC2() { return C1.toByteString(); }
public void setC2(String C2) { C1.setBytes(C2); }
```

#### Parent Squashing

Parent squashing is a data structure optimization technique where intermediate parent levels that contain only a single child are removed from the hierarchy. When a parent group has exactly one item, the child can be "lifted" directly to the grandparent level, effectively removing the unnecessary intermediate layer.

#### ⛔ CRITICAL RULES ⛔

- Only getter/setter methods for REDEFINES (no instance vars)
- All data in original group
- Simple PIC X/9: direct field access with positional arithmetic
- Complex types: toByteString()/setBytes()
- Validate: sum of leaf sizes = REDEFINES size
- If parent squashed: promote getter/setter to where original declared

### Scenario 2: PIC to PIC

**Description:** PIC field REDEFINES another PIC. Use type-specific conversion patterns

#### ⛔ CRITICAL RULES ⛔

- Type-specific conversions based on base/derived types
- BigDecimal: handle precision/scale correctly
- char: use Character.digit()/forDigit()
- String to numeric: parseInt/parseLong/BigDecimal
- Numeric to String: String.format with width/zero-padding
- COMP/COMP-3/BINARY: toByteString()/fromByteString()
- Validate size compatibility

### Scenario 3: PIC to OCCURS

Description: PIC field REDEFINES OCCURS array. CRITICAL: OCCURS array is instance var (from metadata). PIC REDEFINES generates accessors only

**COBOL Example:**

```cobol
01 ARRAY-DATA.
  05 ITEM-ARRAY OCCURS 10 TIMES PIC X(5).
  05 FULL-STRING PIC X(50) REDEFINES ITEM-ARRAY.
  05 FULL-NUMBER PIC 9(50) REDEFINES ITEM-ARRAY.
```

**Metadata:**
Present: ITEM-ARRAY (original array → instance var). NOT present: FULL-STRING, FULL-NUMBER (REDEFINES → accessors only)

**Java for Array:**

```java
private String[] itemArray = new String[10];
public ClassName() {
    for (int i = 0; i < itemArray.length; i++) itemArray[i] = "";
}
```

**Java for PIC X:**

```java
public String getFullString() {
    StringBuilder sb = new StringBuilder();
    for (String item : itemArray) sb.append(String.format("%-5.5s", item));
    return sb.toString();
}
public void setFullString(String value) {
    if (value != null && value.length() >= 50) {
        for (int i = 0; i < 10; i++) itemArray[i] = value.substring(i * 5, (i + 1) * 5);
    }
}
```

**Java for PIC 9:**

```java
public long getFullNumber() {
    long result = 0;
    for (int i = 0; i < itemArray.length; i++) result = result * 100000 + Long.parseLong(itemArray[i].trim());
    return result;
}
public void setFullNumber(long value) {
    for (int i = itemArray.length - 1; i >= 0; i--) {
        itemArray[i] = String.format("%5d", value % 100000);
        value /= 100000;
    }
}
```

**Java for Complex Structures:**

```java
// For arrays with COMP/COMP-3/complex structures:
public byte[] getFullBytes() {
    ByteArrayOutputStream baos = new ByteArrayOutputStream();
    for (ItemType item : itemArray) {
        byte[] itemBytes = item.toByteString();
        baos.write(itemBytes, 0, itemBytes.length);
    }
    return baos.toByteArray();
}
public void setFullBytes(byte[] bytes) {
    int itemSize = bytes.length / itemArray.length;
    for (int i = 0; i < itemArray.length; i++) {
        byte[] itemBytes = Arrays.copyOfRange(bytes, i * itemSize, (i + 1) * itemSize);
        itemArray[i].fromByteString(itemBytes);
    }
}
```

#### ⛔ CRITICAL RULES ⛔

- Array is instance var (from metadata)
- PIC REDEFINES are accessor methods only
- Do NOT create instance var for PIC REDEFINES
- Getters derive from array elements
- Setters decompose into array elements
- Simple PIC X: string concatenation with formatting
- Simple PIC 9: positional arithmetic
- Complex types: byte serialization
- Calculate item size: REDEFINES size / OCCURS count

### Scenario 4: Group to Group

**Description:**

- ⚠️ COMPLETELY DIFFERENT FROM SCENARIO 1-3 ⚠️
- Metadata generates FULL CLASSES for BOTH groups with superclass field.
- Just read superclass from metadata and add "extends SuperclassName".
- NO accessor methods. NO getter/setter generation.

**COBOL Example:**

```cobol
01 MY-TOP.
  05 XYZ1.
    07 XYZ11 PIC X(2).
  05 XYZ2 REDEFINES XYZ1.
    07 XYZ21 PIC X(3).
```

**Transformation (CRITICAL PRIORITY):**

1. Read "superclass" field from metadata for each class
2. If superclass exists and not null, add "extends SuperclassName" to class declaration
3. Done. Metadata provides everything else.

**DO NOT:** Generate accessors, create getter/setter-only classes, follow Rules 1-3 pattern, infer inheritance

**Java Example:**

```java
public class XYZ1 extends MyTop {
    private String xyz11, xyz12;
    // Full class with constructors, getters, setters
}
public class XYZ2 extends MyTop {
    private String xyz21, xyz22;
    // Full class with constructors, getters, setters
}
```

#### ⛔ CRITICAL DIFFERENCE ⛔

- Rules 1-3: REDEFINES NOT in metadata → Accessor methods only
- Rule 4: BOTH in metadata with superclass → Use metadata's superclass

### Complex Scenarios

- Single source: Group/Array is instance var; REDEFINES are accessors
- Priority: Group > Array > PIC when choosing base
- Independence: Each accessor converts independently to/from base
- Validation: All representations same total size

### Integration with Transform Workflow

**Description:** REDEFINES rules are SUPPLEMENTARY. Apply base rules FIRST, then add REDEFINES accessors

1. Apply ALL base rules (FILLER, constructors, Lombok, etc.)
2. Identify REDEFINES from COBOL source (NOT in metadata)
3. Add REDEFINES accessor methods to existing classes (no new instance vars)

#### ⚠️ WARNING ⚠️

REDEFINES accessors are ADDITIONS to complete classes, not replacements.

**❌ Incorrect:** Class with only REDEFINES accessors

**✅ Correct:** Complete class with base rules + REDEFINES accessors

### Validation Checklist

**Scenarios 1 - 3:**

- ✅ REDEFINES from COBOL source (not metadata)
- ✅ Only getter/setter methods (no instance vars)
- ✅ Size validation: REDEFINES size = original size
- ✅ Accessors in class where original declared
- ✅ Correct strategy: simple vs complex types
- ✅ Null checks and bounds validation

**Scenario 4:**

- ✅ Both groups are FULL classes in metadata
- ✅ Superclass field read from metadata
- ✅ If superclass exists, "extends SuperclassName" added
- ✅ NO accessor-only pattern (different from Rules 1-3)
- ✅ Inheritance matches metadata's superclass
