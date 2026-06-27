---
name: transform-snippet
description: Transform COBOL or PL/I code snippets to Java. Handles file paths with line ranges, direct code snippets, and selected code. Applies transformation rules for data structures, REDEFINES, CICS programs, and coding standards.
---

# Transform Snippet Skill

This skill provides instructions for transforming COBOL or PL/I code snippets to Java, applying comprehensive transformation rules and coding standards.

## When to Use This Skill

Activate this skill when:

- User requests transformation of a COBOL or PL/I code snippet to Java
- User provides a file path with a line range to transform (e.g., `path/to/file.cbl:129-150`)
- User pastes a COBOL or PL/I code snippet directly in the chat for transformation
- User has selected code in the editor and wants to transform it
- User asks to convert or translate specific COBOL/PL/I code sections to Java

## Input Handling

The skill accepts three types of input:

1. **File path with line range**: `path/to/file.cbl:start-end` (e.g., `src/program.cbl:129-150`)
2. **Direct code snippet**: User pastes COBOL or PL/I code directly in the chat
3. **Selected code**: User selects code in the editor before invoking the skill

## Instructions

### Input Validation

- **Valid file path check**: If the user provided a file path, verify it points to valid COBOL or PL/I code
  - If invalid, return an error message indicating the file is not valid COBOL or PL/I code
- **Code snippet validation**: If the user provided a code snippet directly, verify it is valid COBOL or PL/I code
  - If invalid, return an error message
- **PROCEDURE DIVISION requirement**: NEVER accept a snippet that is above the PROCEDURE DIVISION in a COBOL file
  - If the snippet is from the DATA DIVISION, WORKING-STORAGE, or other sections before PROCEDURE DIVISION, return an error message
  - Only transform code from the PROCEDURE DIVISION or equivalent executable sections

- **Missing input handling**: If no file path, code snippet, or selection was provided, ask the user to either:
  1. Select code in the editor and run the command again, OR
  2. Provide a file path with line range (format: `path/to/file.cbl:start-end`), OR
  3. Paste the code snippet directly in the chat

### Transformation Process

Follow these steps to transform the code:

1. **Extract the target code**:
   - If a file path with line range was provided, extract those specific lines from the file
   - If a code snippet was provided, use that snippet directly
   - If code was selected in the editor, use the selected code

2. **Detect language and activate appropriate skill**:
   - **For COBOL code** (file extensions: `.cbl`, `.cob`, or COBOL syntax detected):
     - Activate the `cobol-transformation` skill to get COBOL-specific transformation rules
     - The skill provides rules for FILLER fields, REDEFINES clauses, data type conversions, and COBOL-to-Java patterns
   - **For PL/I code** (file extensions: `.pli`, `.pl1`, or PL/I syntax detected):
     - Activate the `pli-transformation` skill to get PL/I-specific transformation rules
     - The skill provides rules for PL/I procedures, data structures, and PL/I-to-Java patterns

3. **CICS program detection**:
   - Check if the code snippet is a CICS program (contains CICS commands like `EXEC CICS`)
   - If it is a CICS program, you MUST activate the `cics-transformation` skill before proceeding
   - The CICS transformation skill provides necessary transformation patterns for CICS-specific commands

4. **Apply transformation rules**:
   - Use the language-specific skill activated in step 2 to transform the code to Java
   - Apply all relevant transformation patterns from the activated skill
   - For CICS programs, use the JCICS APIs (`com.ibm.cics.server.*`) as specified in the CICS rules

5. **Output the result**:
   - **NEVER create a new file** - ALWAYS output the transformed Java code in the chat
   - **NEVER translate the entire file** - ALWAYS translate only the snippet provided
   - Present the transformed code in a clear, readable format with appropriate syntax highlighting
   - Mark the work complete

### Error Handling

- If the file path is invalid or the file does not exist, return an error message
- If the code is not valid COBOL or PL/I syntax, return an error message
- If the snippet is above the PROCEDURE DIVISION in COBOL, return an error explaining this restriction
- If transformation fails for any reason, provide a clear error message with details

## Example Workflows

### Example 1: COBOL File Path with Line Range

**User**: `Transform src/payroll.cbl:129-150 to Java`

**Process**:

1. Extract lines 129-150 from `src/payroll.cbl`
2. Detect COBOL language and activate `cobol-transformation` skill
3. Validate the code is from PROCEDURE DIVISION
4. Check for CICS commands
5. Apply COBOL transformation rules from the skill
6. Output transformed Java code in chat

### Example 2: COBOL Direct Code Snippet

**User**: Pastes COBOL code:

```cobol
PERFORM VARYING I FROM 1 BY 1 UNTIL I > 10
    COMPUTE TOTAL = TOTAL + ITEM(I)
END-PERFORM.
```

**Process**:

1. Detect COBOL syntax and activate `cobol-transformation` skill
2. Validate the code is valid COBOL
3. Apply COBOL transformation rules from the skill
4. Output transformed Java code:

```java
for (int i = 1; i <= 10; i++) {
    total = total + item[i - 1];
}
```

### Example 3: PL/I File Path with Line Range

**User**: `Transform src/inventory.pli:45-65 to Java`

**Process**:

1. Extract lines 45-65 from `src/inventory.pli`
2. Detect PL/I language and activate `pli-transformation` skill
3. Validate the code is valid PL/I
4. Apply PL/I transformation rules from the skill
5. Output transformed Java code in chat

### Example 4: PL/I Direct Code Snippet

**User**: Pastes PL/I code:

```pli
DO I = 1 TO 10;
    TOTAL = TOTAL + ITEM(I);
END;
```

**Process**:

1. Detect PL/I syntax and activate `pli-transformation` skill
2. Validate the code is valid PL/I
3. Apply PL/I transformation rules from the skill
4. Output transformed Java code:

```java
for (int i = 1; i <= 10; i++) {
    total = total + item[i - 1];
}
```

### Example 5: PL/I Procedure Snippet

**User**: Pastes PL/I procedure code:

```pli
CALCULATE_TAX: PROCEDURE (SALARY) RETURNS (FIXED DECIMAL(9,2));
    DECLARE SALARY FIXED DECIMAL(9,2);
    DECLARE TAX_RATE FIXED DECIMAL(3,2) INIT(0.25);
    RETURN SALARY * TAX_RATE;
END CALCULATE_TAX;
```

**Process**:

1. Detect PL/I syntax and activate `pli-transformation` skill
2. Validate the code is valid PL/I procedure
3. Apply PL/I transformation rules from the skill
4. Output transformed Java code:

```java
public BigDecimal calculateTax(BigDecimal salary) {
    BigDecimal taxRate = new BigDecimal("0.25");
    return salary.multiply(taxRate);
}
```

### Example 6: COBOL CICS Program

**User**: Provides a COBOL snippet with CICS commands:

```cobol
EXEC CICS READ
    FILE('CUSTFILE')
    INTO(CUSTOMER-RECORD)
    RIDFLD(CUSTOMER-ID)
END-EXEC.
```

**Process**:

1. Detect COBOL syntax and activate `cobol-transformation` skill
2. Detect CICS commands (e.g., `EXEC CICS READ`)
3. Activate `cics-transformation` skill
4. Apply CICS-specific transformation rules from the skill
5. Apply COBOL transformation rules from the skill
6. Output transformed Java code with appropriate JCICS API calls:

```java
import com.ibm.cics.server.*;

// In method body:
File custFile = Task.getTask().getFile("CUSTFILE");
custFile.read(customerId.getBytes(), customerRecord);
```

### Example 7: PL/I File I/O Snippet

**User**: Pastes PL/I file handling code:

```pli
DECLARE INFILE FILE RECORD INPUT;
DECLARE EMPLOYEE_REC CHAR(100);
OPEN FILE(INFILE);
READ FILE(INFILE) INTO(EMPLOYEE_REC);
CLOSE FILE(INFILE);
```

**Process**:

1. Detect PL/I syntax and activate `pli-transformation` skill
2. Validate the code is valid PL/I file I/O
3. Apply PL/I transformation rules for file operations from the skill
4. Output transformed Java code:

```java
try (BufferedReader reader = new BufferedReader(new FileReader("INFILE"))) {
    String employeeRec = reader.readLine();
    if (employeeRec != null) {
        // Process employee record
    }
} catch (IOException e) {
    // Handle exception
}
```

## Important Constraints

- **No file creation**: Never create new files - always output in chat
- **Snippet-only transformation**: Never attempt to transform an entire file
- **PROCEDURE DIVISION only**: For COBOL, only accept code from PROCEDURE DIVISION or later
- **Validate before transforming**: Always validate input before attempting transformation
- **CICS detection required**: Always check for CICS commands and activate cics-transformation skill if needed
