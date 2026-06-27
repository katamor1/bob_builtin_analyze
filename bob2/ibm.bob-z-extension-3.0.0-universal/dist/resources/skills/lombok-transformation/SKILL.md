---
name: lombok-transformation
description: Provides comprehensive context for applying Lombok annotations during COBOL or PL/1-to-Java transformations. Use when generating Java classes from COBOL or PL/1 with Lombok enabled, reviewing Lombok-annotated code, or explaining Lombok transformation rules. Covers annotations, FILLER field handling, initialization requirements, and validation checklists.
---

# Lombok Transformation Context

This skill provides comprehensive context for applying Lombok annotations during COBOL or PL/1-to-Java transformations when the Class to be generated has Annotations in the prompt. It ensures proper boilerplate reduction while maintaining COBOL or PL/1 binary compatibility, especially for FILLER fields.

## When to Use This Skill

Use this skill when:

- Generating Java classes from COBOL or PL/1 programs with Lombok enabled
- Reviewing Java code that uses Lombok annotations
- Validating Lombok annotation usage in transformed code
- Explaining Lombok transformation rules to users
- Troubleshooting Lombok-related issues in generated code

## Core Lombok Annotations

When generating Java classes with Lombok annotations, apply these annotations to Java data classes:

### Class-Level Annotations

**`@Data`**

- Generates: getters, setters, toString, equals, hashCode
- Import: `lombok.Data`
- Usage: Required on all data classes

**`@NoArgsConstructor`**

- Generates: No-argument constructor
- Import: `lombok.NoArgsConstructor`
- Usage: Required on all data classes

**`@AllArgsConstructor`**

- Generates: All-fields constructor
- Import: `lombok.AllArgsConstructor`
- **⛔ CRITICAL**: Does NOT support `exclude` parameter!
- **CONDITIONAL**: Only added if class contains at least one non-FILLER, non-static field
- FILLER exclusion handled by marking fields as `final` AND `@Setter(AccessLevel.NONE)`

**`@EqualsAndHashCode(callSuper=true)`**

- Generates: equals and hashCode methods with superclass consideration
- Import: `lombok.EqualsAndHashCode`
- **CONDITIONAL**: Only added when class has inheritance (superClass != null)
- Usage: Required on all data classes that extend another class

### Optional Annotations

**`@Builder` / `@SuperBuilder`**

- `@Builder`: Generates builder pattern for classes without inheritance
- `@SuperBuilder`: Generates builder pattern for classes with inheritance
- Import: `lombok.Builder` or `lombok.experimental.SuperBuilder`
- Usage: Automatically added based on class hierarchy
- **For inheritance**: Parent class gets `@SuperBuilder`, child gets `@SuperBuilder(toBuilder=true)`
- **For standalone**: Class gets `@Builder(toBuilder=true)`
- **IMPORTANT**: Information about whether to add `@Builder` or `@SuperBuilder` annotation should be in the user prompt. Otherwise, rule of thumb is to find out if the current class has children. If yes, then add the `@SuperBuilder` annotation. Otherwise add the `@Builder` annotation.

**`@Builder.Default`**

- Marks fields with initializers to use default values in builder
- Import: `lombok.Builder`
- Usage: Automatically added to non-static fields with inline initialization
- Example: `@Builder.Default private String name = "";`

**`@Setter(AccessLevel.NONE)`**

- Prevents: Setter method generation
- Import: `lombok.Setter`, `lombok.AccessLevel`
- Usage: **ONLY** on FILLER fields (byte arrays used for COBOL padding)
- Purpose: Prevents `setFillerN()` methods from being generated
- **CRITICAL**: Must be combined with `final` modifier on FILLER fields
- Example: `@Setter(AccessLevel.NONE) private final byte[] filler1 = new byte[9];`

---

## FILLER Field Handling (CRITICAL)

FILLER fields are byte arrays used for COBOL or PL/1 padding and binary compatibility. They require special handling with Lombok.

### ⛔⛔⛔ CRITICAL IMPLEMENTATION DETAILS ⛔⛔⛔

**FILLER Field Exclusion Strategy:**

### FILLER Instance Block

When Lombok is enabled and FILLER fields have initialization values, an **instance initializer block** is generated to populate FILLER fields with their initial content.

**Purpose**: Initialize FILLER fields with specific byte patterns or values after object construction.

**Format**:

```java
{
    new StringField(0, length).putString(value, fillerName);
    // ... additional FILLER initializations
}
```

**Key Characteristics**:

- Only included if FILLER fields have initialization values (not just `new byte[size]`) **This information will be passed in the user prompt**
- Uses JZOS field types (`StringField`, `BinaryAsIntField`, etc.) to populate byte arrays
- Appears after field declarations, before methods
- Each FILLER with an init value gets a corresponding initialization statement

**Example**:

```java
@AllArgsConstructor
@Builder(toBuilder = true)
@Data
@NoArgsConstructor
public class EmVariable {
    @Setter(AccessLevel.NONE) private final byte[] filler1 = new byte[6];
    @Builder.Default private String emCusnum = "";
    @Setter(AccessLevel.NONE) private final byte[] filler2 = new byte[6];

    {
        new StringField(0, 6).putString(" CNUM=", filler1);
        new StringField(0, 6).putString(" PNUM=", filler2);
    }

    // ... rest of class
}
```

**When Instance Block is Generated**:

- At least one FILLER field has an initialization value
- The initialization value is a COBOL or PL/1 literal or constant that needs to be written into the byte array

## Clone Method Implementation

When `@Builder(toBuilder = true)` is present, implement `clone()` using the builder pattern:

### Clone Method Pattern

```java
@Override
public EmVariable clone() throws CloneNotSupportedException {
    return this.toBuilder().build();
}
```

**Benefits**:

- Leverages Lombok's generated `toBuilder()` method
- Automatically handles all field copying including FILLER fields
- No need for manual field-by-field copying
- Respects `@Builder.Default` values

**Note**: This pattern works because:

1. `toBuilder()` creates a builder pre-populated with current field values
2. `build()` constructs a new instance with those values
3. FILLER fields (being `final`) are properly initialized via inline initialization

---

## FILLER Copying in set() Methods

When implementing `set()` methods that copy from another instance, FILLER fields use direct assignment.

### set() Method Pattern

```java
@Override
public void set(EmVariable that) {
    if (that == this) return;

    // Copy ALL fields including FILLER using direct assignment
    this.filler1 = that.filler1;
    this.emCusnum = that.emCusnum;
    this.filler2 = that.filler2;
    this.emPolnum = that.emPolnum;
    this.emSqlreq = that.emSqlreq;
    this.filler3 = that.filler3;
    this.emSqlrc = that.emSqlrc;
}
```

**Important**:

- Direct assignment is used for FILLER fields in `set()` methods
- This is different from copy constructors where deep copying might be needed
- The `final` modifier on FILLER fields ensures they cannot be reassigned after construction

---

## Required Imports

When using Lombok annotations, include these imports:

```java
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Setter;
import lombok.AccessLevel;

// For inheritance
import lombok.experimental.SuperBuilder;
import lombok.EqualsAndHashCode;

// Optional - if used
import lombok.Getter;
import lombok.NonNull;

// For FILLER copying
import java.util.Arrays;
```

## Dependency Management

- **DO NOT** create or modify `pom.xml` or `build.gradle`
- **ASSUME** Lombok is already configured in the project
- **KEEP** annotations even if Lombok dependency is missing

## Common Issues and Solutions

### Issue: FILLER fields NOT marked as `final`

**Problem**: FILLER declared without `final` modifier

**Solution**: Add `final` modifier along with `@Setter(AccessLevel.NONE)`:

```java
// WRONG
@Setter(AccessLevel.NONE) private byte[] filler1 = new byte[5];

// CORRECT
@Setter(AccessLevel.NONE) private final byte[] filler1 = new byte[5];
```

### Issue: @Builder.Default on uninitialized fields

**Problem**: Adding `@Builder.Default` to fields without explicit initialization

**Solution**: Only add to fields with explicit inline initialization:

```java
// WRONG
@Builder.Default private int count;  // No initialization

// CORRECT
@Builder.Default private int count = 0;  // Has initialization

// ALSO CORRECT (no annotation needed)
private int count;  // Will default to 0 anyway
```
