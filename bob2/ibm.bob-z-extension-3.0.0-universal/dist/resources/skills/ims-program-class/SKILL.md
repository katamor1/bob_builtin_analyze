---
name: ims-program-class
description: Handles IMS Program class generation using IMS Universal Driver during IMS COBOL/PL/I to Java transformation. Use when generating main program classes for IMSTM (message processing), IMSDB (database access), or IMSTMDB (both) programs. Ensures correct singleton pattern, proper initialization, IOMessage interface usage, method-local SSAList variables, and complete import requirements by program type.
---

# IMS Program Class Generation Guardrails

This skill provides the single source of truth for generating IMS Program classes during COBOL/PL/I to Java transformation.

## Prerequisites

Before using this skill, ensure:

- IMS transformation workflow is active
- Program type is identified (IMSTM, IMSDB, or IMSTMDB)
- data-model.md is available with program metadata
- Source code contains IMS call statements
- IMS Universal Driver API is available (Maven: com.ibm.ims:udb:15.166)

## Overview

IMS Program classes are the main entry point for transformed Java programs. This skill ensures:

1. **Absolute Translation Rule** - Every Java statement derives from source code
2. **Coding Standards** - Apply AGENTS.md documentation and formatting standards
3. **Singleton Pattern** - Correct singleton implementation for IMS programs
4. **Import Requirements** - Complete imports based on program type
5. **IOMessage Interface** - Proper IOMessage usage (never concrete classes)
6. **Method-Local SSAList** - SSAList variables must be method-local (critical)
7. **PCB Extraction** - Extract PCB names from IMS Statements Map

**CRITICAL**: This is a TRANSLATION task, not a DESIGN task. Generate only what exists in source code.

---

## Complete Workflow

### Phase 1: Absolute Translation Rule (HIGHEST PRIORITY)

**Purpose**: Ensure faithful translation of source code without additions or omissions.

#### Step 1.1: Core Principle

**⛔ EVERY Java statement MUST derive from corresponding source code ⛔**  
**⛔ You are a TRANSLATOR, not a DESIGNER ⛔**

#### Step 1.2: Core Enforcement Rules

1. **DO NOT add business logic not in source**
   - Every operation, field access, and calculation must exist in the original COBOL/PL/I code
   - Do not invent functionality based on assumptions about what the code "should" do

2. **DO NOT omit ANY statements from source**
   - All operations in source code must have corresponding Java operations
   - Count critical operations (IMS calls, status checks, data movements) and verify they match

3. **DO NOT simplify ANY error handling from source**
   - If source has status code checks, Java must have status code checks
   - Preserve all conditional logic and error handling patterns

4. **BEFORE generating code: verify it exists in source**
   - For every line of Java you generate, identify the corresponding source line
   - If no source line exists → DO NOT generate that Java code

5. **Metadata shows fields that EXIST, not fields that are USED**
   - Data model metadata documents field definitions
   - Just because a field exists doesn't mean it's accessed in this program
   - Only translate field access that appears in source code

#### Step 1.3: IMS Call Completeness (ABSOLUTE PRIORITY)

**Validation Rule:** Count IMS calls in source vs Java - must match exactly

- If source has `GHU` → Java MUST have equivalent `pcb.getUnique(..., true)`
- If source has `REPL` → Java MUST have equivalent `pcb.replace(path)`
- If source has `ISRT` → Java MUST have equivalent `pcb.insert(path, ssaList)`
- If source has `DLET` → Java MUST have equivalent `pcb.delete()`
- If source has status check → Java MUST have status check using `StatusCodeHelper`

#### Step 1.4: Pre-Generation Checkpoint

**MANDATORY:** Follow these steps before generating EVERY line of Java code:

1. **Locate corresponding source line**
   - Find the COBOL/PL/I statement that this Java code translates
   - Document the source line reference (paragraph/section name, line number)

2. **If no source line exists → DO NOT generate**
   - No assumptions allowed
   - No "helpful" additions
   - No "best practice" enhancements

3. **Verify specific operation/field is in source**
   - Check that the exact operation (not just similar logic) exists
   - Check that the exact field name (not just similar field) is accessed
   - Check that the exact sequence of operations is preserved

4. **Generate Java code that directly translates source**
   - Use IMS Universal Driver API equivalents
   - Preserve operation order
   - Maintain conditional logic structure

5. **When in doubt → DO NOT add code**
   - If unsure whether source has this operation → skip it
   - If ambiguous whether field is accessed → don't access it
   - Better to under-translate than over-translate

---

## Phase 2: Coding Standards Enforcement (ABSOLUTE)

**Purpose**: Apply AGENTS.md standards while preserving IMS patterns.

### Step 2.1: Scope of Standards

**Apply:**

- Documentation standards (JavaDoc, comments, file headers)
- Formatting standards (indentation, spacing, brace placement)

**Do NOT Apply:**

- Naming conventions (class/method/variable names remain as specified by IMS rules)

### Step 2.2: Implementation Steps

1. Read AGENTS.md at start of IMS workflow subsession
2. Extract documentation and formatting standards only
3. Apply to all generated IMS Program class code
4. Preserve IMS-specific patterns (singleton, IOMessage usage, etc.)

### Step 2.3: Example with Standards Applied

```java
/**
 * IMS Program class for MYPROG.
 * Implements singleton pattern for IMS Universal Driver integration.
 *
 * @see com.ibm.ims.dli.tm.Application
 * @see com.ibm.ims.dli.tm.MessageQueue
 */
public class Myprog {
    private static Myprog myprog = new Myprog();
    private static Application application;
    private static Transaction transaction;
    private static MessageQueue messageQueue;

    /**
     * Private constructor for singleton pattern.
     */
    private Myprog() {}

    /**
     * Returns the singleton instance.
     *
     * @return the singleton instance of Myprog
     */
    public static Myprog getInstance() {
        return myprog;
    }

    /**
     * Main entry point for IMS program execution.
     *
     * @param args command line arguments
     * @throws Exception if IMS initialization or execution fails
     */
    public static void main(String[] args) throws Exception {
        // Initialize IMS environment
        application = ApplicationFactory.createApplication();
        transaction = application.getTransaction();
        messageQueue = application.getMessageQueue();

        getInstance().begin();
    }
}
```

---

## Phase 3: Import Requirements by Program Type (CRITICAL)

**Purpose**: Ensure complete imports based on detected program type.

### Step 3.1: Program Type Detection

**Reference**: See **ims-program-type** skill for program type detection rules

**Program Types:**

- **IMSTM**: Message processing only (no database access)
- **IMSDB**: Database access only (no message processing)
- **IMSTMDB**: Both message processing and database access

### Step 3.2: Import Requirements

**⛔ CRITICAL RULES**:

- Code generator MUST include ALL imports for detected program type
- DO NOT use selective/on-demand import detection
- StatusCodeHelper MUST use `com.ibm.ims.drda.base` package (NOT `com.ibm.ims.dli`)

**IMSTM Program Imports:**

```java
import com.ibm.ims.dli.tm.Application;
import com.ibm.ims.dli.tm.ApplicationFactory;
import com.ibm.ims.dli.tm.IOMessage;
import com.ibm.ims.dli.tm.MessageQueue;
import com.ibm.ims.dli.tm.Transaction;
import com.ibm.ims.dli.DLIException;
import com.ibm.ims.drda.base.StatusCodeHelper;  // ⚠️ CRITICAL: Use drda.base package!
```

**IMSDB Program Imports:**

```java
import com.ibm.ims.dli.IMSConnectionSpec;
import com.ibm.ims.dli.IMSConnectionSpecFactory;
import com.ibm.ims.dli.Path;
import com.ibm.ims.dli.PCB;
import com.ibm.ims.dli.PSB;
import com.ibm.ims.dli.PSBFactory;
import com.ibm.ims.dli.SSAList;
import com.ibm.ims.dli.DLIException;
import com.ibm.ims.dli.wcaz.WcazSSAMetadata;  // ⚠️ CRITICAL: Required for List<WcazSSAMetadata>!
import com.ibm.ims.drda.base.StatusCodeHelper;  // ⚠️ CRITICAL: Use drda.base package!

import java.util.List;
```

**IMSTMDB Program Imports (combination of IMSTM + IMSDB):**

```java
import com.ibm.ims.dli.tm.Application;
import com.ibm.ims.dli.tm.ApplicationFactory;
import com.ibm.ims.dli.tm.IOMessage;
import com.ibm.ims.dli.tm.MessageQueue;
import com.ibm.ims.dli.tm.Transaction;
import com.ibm.ims.dli.IMSConnectionSpec;
import com.ibm.ims.dli.IMSConnectionSpecFactory;
import com.ibm.ims.dli.Path;
import com.ibm.ims.dli.PCB;
import com.ibm.ims.dli.PSB;
import com.ibm.ims.dli.PSBFactory;
import com.ibm.ims.dli.SSAList;
import com.ibm.ims.dli.DLIException;
import com.ibm.ims.dli.wcaz.WcazSSAMetadata;  // ⚠️ CRITICAL: Required for List<WcazSSAMetadata>!
import com.ibm.ims.drda.base.StatusCodeHelper;  // ⚠️ CRITICAL: Use drda.base package!

import java.util.List;
```

### Step 3.3: Validation Steps

1. Identify program type (IMSTM, IMSDB, IMSTMDB)
2. Get complete import list from above
3. Verify EVERY import is present in generated code
4. FAIL if ANY import missing

**Reference**: See **ims-imports** skill for complete import requirements

---

## Phase 4: Class Structure

**Purpose**: Generate correct singleton pattern and field declarations.

### Step 4.1: Singleton Pattern

**Required Components:**

```java
// Singleton instance field
private static ProgramName programName = new ProgramName();

// Private constructor
private ProgramName() {}

// Getter method
public static ProgramName getInstance() {
    return programName;
}
```

### Step 4.2: IMS TM Fields (for IMSTM and IMSTMDB)

**Field Declarations:**

```java
private static Application application;
private static Transaction transaction;
private static MessageQueue messageQueue;
```

**Initialization in main():**

```java
application = ApplicationFactory.createApplication();
transaction = application.getTransaction();
messageQueue = application.getMessageQueue();
```

**⛔ CRITICAL**: `ApplicationFactory.createApplication()` takes NO parameters and returns `Application` object

### Step 4.3: IMS DB Fields (for IMSDB and IMSTMDB)

**Field Declarations:**

```java
private static PSB psb;
private static PCB pcb;
```

**Initialization in main():**

```java
IMSConnectionSpec spec = IMSConnectionSpecFactory.createIMSConnectionSpec();
spec.setDatastoreName("IMS_DATASTORE");
spec.setPortNumber(9999);
spec.setDriverType(2);
psb = PSBFactory.createPSB(spec);
```

---

## Phase 5: IOMessage Field Handling (CRITICAL)

**Purpose**: Ensure correct IOMessage interface usage.

### Step 5.1: IOMessage Declaration and Initialization

**⛔ CRITICAL RULES**:

- ALL message variables MUST use `IOMessage` interface type
- Initialize using `application.getIOMessage("class://package.ClassName")`
- NEVER declare as concrete class (ImsMessageClass1, ImsMessageClass2)

**✅ CORRECT Pattern:**

```java
// Field declaration
private static IOMessage imsMessageClass1;
private static IOMessage imsMessageClass2;

// Initialization in main()
imsMessageClass1 = application.getIOMessage("class://com.ibm.wcaz.implementation.ImsMessageClass1");
imsMessageClass2 = application.getIOMessage("class://com.ibm.wcaz.implementation.ImsMessageClass2");
```

**❌ FORBIDDEN Patterns:**

```java
// ❌ WRONG - Using concrete class type
private ImsMessageClass1 imsMessageClass1;

// ❌ WRONG - Using new keyword
imsMessageClass1 = new ImsMessageClass1();
```

**Reference**: See **ims-message-class** skill for complete IOMessage field access patterns

---

## Phase 6: SSA Scope Determination (ABSOLUTE PRIORITY)

**Purpose**: Ensure SSAList variables are method-local to prevent shared state bugs.

### Step 6.1: Critical Rules

**⛔ MANDATORY RULES**:

- ALL SSAList variables MUST be method-local (created within each method)
- NO class-level SSAList fields - causes shared state bugs
- Each method creates and initializes its own SSAList
- Each method extracts its own PCB reference from PSB

### Step 6.2: Method-Local SSAList Pattern

**✅ CORRECT - Method-local variables:**

```java
public static void methodName(...) throws DLIException {
    // 1. Set SSA keys (if needed)
    ssa1.setSsaKey(inputArea.getString("KEY_FIELD"));

    // 2. Create method-local SSAList
    List<WcazSSAMetadata> ssaList = List.of(ssa1, ssa2, ssa3);

    // 3. Extract PCB name from data-model.md IMS Statements Map
    // Example: "GHU on DBPCB named CUSTOMER" → use "CUSTOMER"
    // Example: "GHU on DBPCB with" → use "DBPCB"
    // See extraction_algorithm in ims_db_ioarea skill

    // 4. Get PCB reference using extracted name
    PCB pcbName = psb.getPCB("EXTRACTED_PCB_NAME");

    // 5. Initialize method-local SSAList from PCB
    SSAList dbSsaList = pcbName.getSSAList(ssaList);

    // 6. Get Path and perform DL/I call
    Path segPath = dbSsaList.getPathForRetrieveReplace();
    boolean retrieved = pcbName.getUnique(segPath, dbSsaList, false);

    // 7. Check status
    Short statusCode = pcbName.getAIB().getDBPCB().getStatusCode();
    if (statusCode == StatusCodeHelper.BLANKS) {
        // Process data
    }
}
```

### Step 6.3: Code Generation Mandate

**What Code Generator MUST Generate for Each DL/I Method:**

**MANDATORY Steps:**

1. Set SSA keys if needed (only if keys come from input)
2. Create method-local `List<WcazSSAMetadata> ssaList = List.of(...)`
3. Extract PCB name from data-model.md IMS Statements Map
4. Get PCB reference: `PCB pcbName = psb.getPCB("EXTRACTED_PCB_NAME")`
5. Initialize SSAList: `SSAList ssaListName = pcbName.getSSAList(ssaList)`
6. Get Path: `Path segmentPath = ssaListName.getPathForRetrieveReplace()`
7. Perform DL/I operation using the method-local variables
8. Check status code

**⛔ CRITICAL NOTE**: The code generator MUST NOT assume that SSAList, PCB, or Path variables from other methods are available. Each method is independent and must initialize its own variables.

### Step 6.4: Common Error Pattern

**❌ WRONG - Using Variables from Other Methods:**

```java
// Method 1 - creates pcb01SsaList
public void getTreatDataFirst(...) {
    List<WcazSSAMetadata> ssaList = List.of(...);
    PCB pcb01 = psb.getPCB("PCB01");
    SSAList pcb01SsaList = pcb01.getSSAList(ssaList);
    // ... use pcb01SsaList
}

// Method 2 - WRONG: tries to use pcb01SsaList from Method 1
public void getTreatDataNext(...) {
    // ❌ ERROR: pcb01SsaList is not defined in this method!
    boolean retrieved = pcb.getNext(trmtSeg, pcb01SsaList, false);
}
```

**✅ CORRECT - Each Method Creates Its Own Variables:**

```java
// Method 1 - creates its own SSAList
public void getTreatDataFirst(...) {
    List<WcazSSAMetadata> ssaList = List.of(...);
    PCB pcb01 = psb.getPCB("PCB01");
    SSAList pcb01SsaList = pcb01.getSSAList(ssaList);
    Path trmtSeg = pcb01SsaList.getPathForRetrieveReplace();
    // ... use pcb01SsaList
}

// Method 2 - ✅ CORRECT: creates its own SSAList
public void getTreatDataNext(...) {
    // ✅ Create method-local variables
    List<WcazSSAMetadata> ssaList = List.of(...);
    PCB pcb01 = psb.getPCB("PCB01");
    SSAList pcb01SsaList = pcb01.getSSAList(ssaList);
    Path trmtSeg = pcb01SsaList.getPathForRetrieveReplace();

    // ✅ Now use the method-local variables
    boolean retrieved = pcb01.getNext(trmtSeg, pcb01SsaList, false);
    Short statusCode = pcb01.getAIB().getDBPCB().getStatusCode();
}
```

### Step 6.5: Implementation Checklist

**Code Generator Implementation Steps:**

- [ ] For each COBOL paragraph with DL/I call:
  - [ ] Generate Java method
  - [ ] Translate MOVE statements to setSsaKey() calls (if needed)
  - [ ] Create `List<WcazSSAMetadata>` with SSA objects
  - [ ] Extract PCB name from data-model.md IMS Statements Map
  - [ ] Get PCB reference: `PCB pcbName = psb.getPCB("EXTRACTED_PCB_NAME")`
  - [ ] Initialize method-local SSAList: `SSAList ssaListName = pcbName.getSSAList(ssaList)`
  - [ ] Get Path: `Path seg = ssaListName.getPathForRetrieveReplace()`
  - [ ] Translate DL/I call to appropriate pcb method
  - [ ] Translate status code checks
- [ ] Validate: NO class-level SSAList fields
- [ ] Validate: ALL SSAList variables are method-local
- [ ] Validate: ALL SSAList variables are initialized before use
- [ ] Validate: ALL PCB variables are obtained within the method

---

## Phase 7: Main Method and Entry Method

**Purpose**: Generate correct main() and entry method structure.

### Step 7.1: Main Method Structure

**Signature:**

```java
public static void main(String[] args) throws Exception
```

**Structure:**

1. Initialize IMS environment (Application, Transaction, MessageQueue or PSB/PCB)
2. Initialize IOMessage objects using `application.getIOMessage()`
3. Call entry method (e.g., `begin()`)
4. Handle exceptions

### Step 7.2: Entry Method Structure

**Signature:**

```java
public static void begin() throws DLIException
```

**Purpose**: Main business logic entry point

**Structure:**

1. Retrieve input messages
2. Process business logic
3. Send output messages
4. Check status codes

### Step 7.3: Method Structure Guidelines

**Guideline**: Prefer using original COBOL paragraph and PL/I procedure names (converted to camelCase). This maintains traceability to source code while allowing flexibility in organization.

**Common Patterns:**

- Methods for retrieving segments using `messageQueue.getNext()` or `pcb.getUnique()`
- Methods for sending output using `messageQueue.insert()`
- Methods for business logic processing
- All methods that access IMS must declare `throws DLIException`

---

## Phase 8: Status Code Handling

**Purpose**: Check IMS operation status codes correctly.

### Step 8.1: Status Code Access Pattern

**Type**: `Short` (NOT String)

**TM Programs:**

```java
Short statusCode = messageQueue.getAIB().getIOPCB().getStatusCode();
```

**DB Programs:**

```java
Short statusCode = pcb.getAIB().getDBPCB().getStatusCode();
```

### Step 8.2: Status Code Constants

**Use StatusCodeHelper class:**

```java
StatusCodeHelper.BLANKS  // Successful operation
StatusCodeHelper.QC      // No more messages
StatusCodeHelper.QD      // Message not found
StatusCodeHelper.GB      // End of segment
StatusCodeHelper.GE      // End of database
StatusCodeHelper.GK      // Key not found
StatusCodeHelper.II      // Insert error
```

### Step 8.3: Status Check Pattern

```java
Short statusCode = messageQueue.getAIB().getIOPCB().getStatusCode();
if (statusCode != StatusCodeHelper.BLANKS) {
    // Handle error
    if (statusCode == StatusCodeHelper.QC) {
        // No more messages
    } else {
        throw new DLIException("Operation failed: " + statusCode);
    }
}
```

---

## Complete Program Examples

### Example 1: IMSTM Program (Message Processing Only)

```java
package com.ibm.wcaz.implementation;

import com.ibm.ims.dli.tm.Application;
import com.ibm.ims.dli.tm.ApplicationFactory;
import com.ibm.ims.dli.tm.IOMessage;
import com.ibm.ims.dli.tm.MessageQueue;
import com.ibm.ims.dli.tm.Transaction;
import com.ibm.ims.dli.DLIException;
import com.ibm.ims.drda.base.StatusCodeHelper;

/**
 * IMS Transaction Manager program for message processing.
 * Implements singleton pattern for IMS Universal Driver integration.
 */
public class Myprog {
    private static Myprog myprog = new Myprog();
    private static Application application;
    private static Transaction transaction;
    private static MessageQueue messageQueue;
    private static IOMessage inputArea;
    private static IOMessage outputArea;

    /**
     * Private constructor for singleton pattern.
     */
    private Myprog() {}

    /**
     * Returns the singleton instance.
     *
     * @return the singleton instance of Myprog
     */
    public static Myprog getInstance() {
        return myprog;
    }

    /**
     * Main entry point for IMS program execution.
     *
     * @param args command line arguments
     * @throws Exception if IMS initialization or execution fails
     */
    public static void main(String[] args) throws Exception {
        application = ApplicationFactory.createApplication();
        transaction = application.getTransaction();
        messageQueue = application.getMessageQueue();
        inputArea = application.getIOMessage("class://com.ibm.wcaz.implementation.InputArea");
        outputArea = application.getIOMessage("class://com.ibm.wcaz.implementation.OutputArea");

        getInstance().begin();
    }

    /**
     * Main business logic entry point.
     *
     * @throws DLIException if IMS operations fail
     */
    public static void begin() throws DLIException {
        boolean retrieved = messageQueue.getUnique(inputArea);
        if (retrieved) {
            Short statusCode = messageQueue.getAIB().getIOPCB().getStatusCode();
            if (statusCode != StatusCodeHelper.BLANKS) {
                System.out.println("STATUS CODE: " + statusCode);
            }
            // Process input and prepare output
            messageQueue.insert(outputArea, MessageQueue.DEFAULT_DESTINATION);
        }
    }
}
```

### Example 2: IMSDB Program (Database Access Only)

```java
package com.ibm.wcaz.implementation;

import com.ibm.ims.dli.IMSConnectionSpec;
import com.ibm.ims.dli.IMSConnectionSpecFactory;
import com.ibm.ims.dli.Path;
import com.ibm.ims.dli.PCB;
import com.ibm.ims.dli.PSB;
import com.ibm.ims.dli.PSBFactory;
import com.ibm.ims.dli.SSAList;
import com.ibm.ims.dli.DLIException;
import com.ibm.ims.dli.wcaz.WcazSSAMetadata;
import com.ibm.ims.drda.base.StatusCodeHelper;

import java.util.List;

/**
 * IMS Database program for hierarchical database access.
 * Implements singleton pattern for IMS Universal Driver integration.
 */
public class DbProgram {
    private static PSB psb;

    private static IMSConnectionSpec connSpec;

    /**
     * Main entry point for IMS database program.
     *
     * @param args command line arguments
     * @throws Exception if IMS initialization or execution fails
     */
    public static void main(String[] args) throws Exception {
        connSpec = IMSConnectionSpecFactory.createIMSConnectionSpec();
        connSpec.setDatabaseName("REPLACE_WITH_PSB_NAME");
        connSpec.setDriverType(IMSConnectionSpec.DRIVER_TYPE_2);
        connSpec.setEnableWcazFunctions(true);
        psb = PSBFactory.createPSB(connSpec);

        retrieveData();
    }

    /**
     * Retrieves data from IMS database.
     *
     * @throws DLIException if database operations fail
     */
    public static void retrieveData() throws DLIException {
        // Create method-local SSAList
        List<WcazSSAMetadata> ssaList = List.of(new Ssa1(), new Ssa2());

        // Extract PCB name from IMS Statements Map
        PCB pcb = psb.getPCB("EXTRACTED_PCB_NAME");

        // Initialize SSAList from PCB
        SSAList pcbSsaList = pcb.getSSAList(ssaList);
        Path path = pcbSsaList.getPathForRetrieveReplace();

        // Perform database operation
        boolean result = pcb.getUnique(path, pcbSsaList, false);

        // Check status
        Short statusCode = pcb.getAIB().getDBPCB().getStatusCode();
        if (statusCode != StatusCodeHelper.BLANKS) {
            System.out.println("STATUS CODE: " + statusCode);
        }
    }
}
```

### Example 3: IMSTMDB Program (Message + Database)

```java
package com.ibm.wcaz.implementation;

import com.ibm.ims.dli.tm.Application;
import com.ibm.ims.dli.tm.ApplicationFactory;
import com.ibm.ims.dli.tm.IOMessage;
import com.ibm.ims.dli.tm.MessageQueue;
import com.ibm.ims.dli.tm.Transaction;
import com.ibm.ims.dli.IMSConnectionSpec;
import com.ibm.ims.dli.IMSConnectionSpecFactory;
import com.ibm.ims.dli.Path;
import com.ibm.ims.dli.PCB;
import com.ibm.ims.dli.PSB;
import com.ibm.ims.dli.PSBFactory;
import com.ibm.ims.dli.SSAList;
import com.ibm.ims.dli.DLIException;
import com.ibm.ims.dli.wcaz.WcazSSAMetadata;
import com.ibm.ims.drda.base.StatusCodeHelper;

import java.util.List;

/**
 * IMS Transaction Manager and Database program.
 * Combines message processing with hierarchical database access.
 */
public class ImsTmDbProg {
    private static ImsTmDbProg imsTmDbProg = new ImsTmDbProg();
    private static Application application;
    private static Transaction transaction;
    private static MessageQueue messageQueue;
    private static IMSConnectionSpec connSpec = null;
    private static PSB psb;
    private static IOMessage inputArea;
    private static IOMessage outputArea;

    /**
     * Private constructor for singleton pattern.
     */
    private ImsTmDbProg() {}

    /**
     * Returns the singleton instance.
     *
     * @return the singleton instance of ImsTmDbProg
     */
    public static ImsTmDbProg getInstance() {
        return imsTmDbProg;
    }

    /**
     * Main entry point for IMS program execution.
     *
     * @param args command line arguments
     * @throws Exception if IMS initialization or execution fails
     */
    public static void main(String[] args) throws Exception {
        application = ApplicationFactory.createApplication();
        transaction = application.getTransaction();
        messageQueue = application.getMessageQueue();

        connSpec = IMSConnectionSpecFactory.createIMSConnectionSpec();
        connSpec.setDatabaseName("REPLACE_WITH_PSB_NAME");
        connSpec.setDriverType(IMSConnectionSpec.DRIVER_TYPE_2);
        connSpec.setEnableWcazFunctions(true);
        psb = PSBFactory.createPSB(connSpec);

        inputArea = application.getIOMessage("class://com.ibm.wcaz.implementation.InputArea");
        outputArea = application.getIOMessage("class://com.ibm.wcaz.implementation.OutputArea");

        getInstance().begin();
    }

    /**
     * Main business logic entry point.
     *
     * @throws DLIException if IMS operations fail
     */
    public static void begin() throws DLIException {
        // Get message from queue
        boolean retrieved = messageQueue.getUnique(inputArea);

        if (retrieved) {
            // Access database using SSAs
            List<WcazSSAMetadata> ssaList = List.of(
                new HospSsa1(),
                new WardSsa2(),
                new PatSsa3()
            );

            // Extract PCB name from IMS Statements Map
            PCB pcb = psb.getPCB("EXTRACTED_PCB_NAME");

            // Initialize method-local SSAList
            SSAList pcbSsaList = pcb.getSSAList(ssaList);
            Path path = pcbSsaList.getPathForRetrieveReplace();

            // Perform database operation
            boolean dbResult = pcb.getUnique(path, pcbSsaList, true);

            if (dbResult) {
                // Process data and send response
                messageQueue.insert(outputArea, MessageQueue.DEFAULT_DESTINATION);
            }

            Short statusCode = messageQueue.getAIB().getIOPCB().getStatusCode();
            if (statusCode != StatusCodeHelper.BLANKS) {
                System.out.println("STATUS CODE: " + statusCode);
            }
        }
    }
}
```

---

## Common Mistakes

### Mistake 1: Missing WcazSSAMetadata Import

**❌ WRONG:**

```java
import com.ibm.ims.dli.PSB;
import com.ibm.ims.dli.Path;
// ❌ MISSING: import com.ibm.ims.dli.wcaz.WcazSSAMetadata;

public class BadExample {
    public void getData() {
        // ❌ COMPILATION ERROR: Cannot find symbol WcazSSAMetadata
        List<WcazSSAMetadata> ssaList = List.of(new Ssa1());
    }
}
```

**✅ CORRECT:**

```java
import com.ibm.ims.dli.wcaz.WcazSSAMetadata;
```

### Mistake 2: Wrong StatusCodeHelper Package

**❌ WRONG:**

```java
import com.ibm.ims.dli.StatusCodeHelper;  // ❌ WRONG PACKAGE!
```

**✅ CORRECT:**

```java
import com.ibm.ims.drda.base.StatusCodeHelper;
```

### Mistake 3: Class-Level SSAList Fields

**❌ WRONG:**

```java
public class BadExample {
    private static SSAList pcb01SsaList;  // ❌ WRONG - Class-level!

    public void method1() {
        pcb01SsaList = pcb.getSSAList(...);
    }

    public void method2() {
        // ❌ Shared state bug!
        pcb.getNext(path, pcb01SsaList, false);
    }
}
```

**✅ CORRECT:**

```java
public class GoodExample {
    public void method1() {
        // ✅ Method-local
        List<WcazSSAMetadata> ssaList = List.of(...);
        PCB pcb = psb.getPCB("PCB_NAME");
        SSAList pcb01SsaList = pcb.getSSAList(ssaList);
    }

    public void method2() {
        // ✅ Each method creates its own
        List<WcazSSAMetadata> ssaList = List.of(...);
        PCB pcb = psb.getPCB("PCB_NAME");
        SSAList pcb01SsaList = pcb.getSSAList(ssaList);
    }
}
```

### Mistake 4: Using Concrete IOMessage Class

**❌ WRONG:**

```java
private ImsMessageClass1 inputArea;  // ❌ WRONG - Concrete class!
inputArea = new ImsMessageClass1();  // ❌ WRONG - new keyword!
```

**✅ CORRECT:**

```java
private static IOMessage inputArea;
inputArea = application.getIOMessage("class://com.ibm.wcaz.implementation.ImsMessageClass1");
```

### Mistake 5: ApplicationFactory with Parameters

**❌ WRONG:**

```java
ApplicationFactory.createApplication(pcbList);  // ❌ NO parameters!
```

**✅ CORRECT:**

```java
Application application = ApplicationFactory.createApplication();
```

---

## Validation Checklist

Before submitting generated code, verify:

- [ ] **IMS call count matches:** Count DL/I calls in source vs Java
- [ ] **Status checks preserved:** Every source status check has Java equivalent
- [ ] **No invented field access:** Every field access has source MOVE/SET
- [ ] **No simplified logic:** All conditional branches from source are in Java
- [ ] **No omitted operations:** All MOVE, CALL, PERFORM statements have Java equivalents
- [ ] **Operation sequence preserved:** Java operations occur in same order as source
- [ ] **All imports present:** Verify complete import list for program type
- [ ] **IOMessage interface used:** No concrete class declarations
- [ ] **SSAList is method-local:** No class-level SSAList fields
- [ ] **PCB extracted correctly:** PCB name from IMS Statements Map
- [ ] **Coding standards applied:** JavaDoc and formatting from AGENTS.md

---

## Integration with Other Skills

This skill works with:

- **ims-db-call-statements** - Database call translation (GU, GHU, GN, etc.)
- **ims-tm-call-statements** - Message queue call translation
- **ims-db-ioarea** - Path field access patterns
- **ims-message-class** - IOMessage class generation
- **ims-ssa-class** - SSA class generation
- **ims-imports** - Import requirements by program type
- **ims-status-codes** - Status code handling patterns
- **coding-standards-builder** - AGENTS.md standards application

---

## Critical Warnings

**⚠️ EVERY JAVA STATEMENT MUST DERIVE FROM SOURCE CODE ⚠️**
**⚠️ YOU ARE A TRANSLATOR, NOT A DESIGNER ⚠️**
**⚠️ ALL SSAList VARIABLES MUST BE METHOD-LOCAL ⚠️**
**⚠️ USE IOMessage INTERFACE, NEVER CONCRETE CLASSES ⚠️**
**⚠️ INCLUDE ALL IMPORTS FOR PROGRAM TYPE ⚠️**
**⚠️ StatusCodeHelper MUST USE drda.base PACKAGE ⚠️**
**⚠️ EXTRACT PCB NAME FROM IMS STATEMENTS MAP ⚠️**

---

## Summary

This skill ensures correct IMS Program class generation:

1. **Absolute Translation** - Every Java statement derives from source code
2. **Coding Standards** - Apply AGENTS.md documentation and formatting
3. **Complete Imports** - All imports based on program type (IMSTM/IMSDB/IMSTMDB)
4. **Singleton Pattern** - Correct singleton implementation
5. **IOMessage Interface** - Use IOMessage type, never concrete classes
6. **Method-Local SSAList** - SSAList variables must be method-local
7. **PCB Extraction** - Extract PCB names from IMS Statements Map
8. **Status Code Handling** - Use Short type with StatusCodeHelper constants

By following these guardrails, you ensure IMS Program classes are correctly generated with proper structure, complete imports, and faithful translation of source code logic.
