---
name: transform-coding-standards
description: Validates a user-supplied coding standards document for use in COBOL-to-Java or PL/I-to-Java transformations. Checks for incomplete specifications, contradictory rules, and non-standard conventions.
---

# Transform Coding Standards Validation Skill

This skill validates user-supplied coding standards. It checks for incomplete specifications, contradictory rules, and non-standard conventions that could lead to code quality issues. The skill provides detailed feedback on any detected issues and recommendations for improvement.

## Instructions

### Step 1: Read the Coding Standards Document

Use [`read_file`](command:read_file) to read the content of the provided document path.

- If the file cannot be read, report the error clearly and stop.
- Validate that the document contains actual content (not empty).

### Step 2: Validate the Document

Analyze the content for potential issues that could lower code quality or introduce problems. Check for:

**Severely Incomplete or Missing Specifications:**

- Documentation requirements that provide no guidance at all (e.g., "use documentation" with no format specified)
- Naming conventions that provide no concrete guidance (e.g., "use good names" with no style or format)
- Note: If examples or specific tags are shown, consider the requirement sufficiently detailed

**Contradictory Rules:**

- Conflicting naming conventions (e.g., "use camelCase" and "use snake_case" for the same construct)
- Contradictory documentation requirements that cannot both be satisfied
- Inconsistent code organization principles that directly conflict

**Non-Standard or Problematic Conventions:**

- Unconventional naming requirements that significantly deviate from industry standards and would create confusion
  - Example: "camelCase for methods, names should be verbs or verb-phrases which include colors"
  - The requirement to "include colors" is non-standard and would create confusing method names
- Invalid syntax patterns that would cause compilation errors
- Conventions that would significantly reduce code maintainability or readability
- Rules that directly conflict with language best practices and would break standard tooling

**If Issues Are Found:**

Report all issues using this format:

```text
⚠️ CODING STANDARDS VALIDATION WARNING

The following issues were detected in your coding standards document:

[Issue Category]: [Specific Issue]
- Example from document: "[quoted problematic text]"
- Why this is problematic: [explanation]
- Recommendation: [suggested fix or industry standard alternative]

[Additional issues if multiple...]

These standards could result in:
• [Potential negative impact 1]
• [Potential negative impact 2]
```

**If No Issues Are Found:**

Report a clean validation result:

```text
✅ CODING STANDARDS VALIDATION PASSED

No issues detected. The coding standards document is valid and will be applied during transformation.
```

**Validation Examples:**

Example 1 - Problematic Naming Convention:

```text
⚠️ CODING STANDARDS VALIDATION WARNING

The following issues were detected in your coding standards document:

Non-Standard Naming Convention: Method naming includes unconventional requirement
- Example from document: "camelCase for methods, names should be verbs or verb-phrases which include colors"
- Why this is problematic: Requiring color names in method names is not a conventional Java practice and would create confusing, non-semantic method names like "calculateRedBalance()" or "processBlueTransaction()"
- Recommendation: Use standard Java method naming - camelCase with verb or verb-phrases that clearly describe the method's action (e.g., "calculateBalance()", "processTransaction()")

These standards could result in:
• Confusing method names that don't clearly convey purpose
• Difficulty for other developers to understand code intent
• Deviation from industry-standard Java conventions
```

Example 2 - Severely Incomplete Documentation (flag this):

```text
⚠️ CODING STANDARDS VALIDATION WARNING

The following issues were detected in your coding standards document:

Incomplete Documentation Requirement: JavaDoc specification provides no concrete guidance
- Example from document: "All methods should be documented"
- Why this is problematic: No format specified (JavaDoc, plain comments, etc.), no examples provided, no indication of required elements
- Recommendation: Specify documentation format (e.g., JavaDoc), provide examples, or indicate key elements (e.g., purpose description, parameter descriptions)

These standards could result in:
• Inconsistent documentation formats across the codebase
• Unclear expectations for developers
```

## Enforcement

Certain generated, framework-bound, or layout-sensitive code areas are protected from general coding standards. In these protected areas, do not apply naming, refactoring, restructuring, encapsulation, or API-cleanup standards. Only non-semantic documentation updates and safe formatting are allowed.

If a coding standard conflicts with a technical, runtime, framework, generated-code, or interoperability requirement, the technical requirement always takes precedence.

Protected areas include code that is:

- Generated by transformation tooling or framework integration
- Bound to external serialization or deserialization contracts
- Required by runtime frameworks such as IMS or CICS
- Layout-sensitive for interoperability or field offset preservation
- Implementing or overriding framework/interface methods with required names or signatures

### Allowed changes in protected areas

- Add or improve JavaDoc and explanatory comments
- Apply non-semantic whitespace, indentation, and formatting changes only when required syntax, layout, signatures, literals, annotations, field order, and access patterns remain unchanged

### Forbidden changes in protected areas

- Do not rename classes, methods, fields, parameters, constants, resource identifiers, or contract-bound accessors
- Do not change method signatures, visibility, inheritance relationships, or override contracts
- Do not reorder fields, methods, annotations, layout-sensitive members, or generated constructs
- Do not extract, inline, simplify, or otherwise refactor framework-sensitive logic for style reasons
- Do not replace required framework-specific patterns with cleaner or more general abstractions
- Do not modify generated technical code except for non-semantic documentation updates and safe formatting

### 1. Serializer and Serializable classes

- Methods such as `set()`, `fromBytes()`, and other contract-bound methods must never be renamed or behaviorally altered
- Preserve required method signatures, visibility, overloads, and field names when they are part of a serialization or deserialization contract
- Any method marked with `@Override` must preserve the required name, signature, and contract of the method it overrides
- Documentation may be added or improved, but behavior and externally visible contracts must remain unchanged

### 2. IMS statements and IMS-bound code

Preserve all IMS API names, signatures, technical field names, generated access patterns, and framework-mandated classes exactly. Do not rename or normalize framework-bound members even if they conflict with general coding standards.

IMS resource class access examples:

- IMS Message class field access using `externalName`
- `LL` fields: no setters, getter uses `getActualLength()`
- `ZZ` fields: no getters or setters
- `tranCode` fields: use `getTransactionName()` and `setTransactionName()`
- IMS SSA class instantiation and usage
- IMS DB IOArea (`Path` interface) usage
- IMS Universal Driver API calls such as `ApplicationFactory`, `MessageQueue`, and related types
- These are technical requirements that ensure correct IMS operation

When in doubt:

- If it touches the IMS Universal Driver API, IMS rules win
- If it is user business code such as the main program or POJOs, coding standards win
- If it is comment or documentation text, documentation standards always win

### 3. CICS statements and CICS-bound code

Exception: where exact statement structure or layout is technically required, even formatting must be preserved.

- CICS-001: `EXEC CICS` statements must not be reformatted or modified
- CICS-002: CICS API method calls must preserve exact signatures
- CICS-003: CICS resource names and identifiers must not be renamed
- CICS-004: CICS-generated comments and annotations must be preserved when they carry technical meaning
- CICS-005: CICS exception handling patterns must not be altered

### 4. Other protected elements

Protected elements include:

- `Dfhcommarea` classes, which must retain names, layout, field order, and access patterns required for interoperability
- Filler variables, which must not be renamed, removed, repurposed, or normalized because they preserve layout and offset compatibility
