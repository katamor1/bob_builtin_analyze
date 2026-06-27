# Z Language Pattern Library

> **Note:** This file contains pattern detection rules and common idioms for IBM Z languages (COBOL, PL/I, JCL, REXX, Assembler, Java). Use this as a reference when analyzing codebases to extract coding standards.

## Pattern Detection Overview

This library helps identify common patterns in IBM Z codebases to extract implicit coding standards. Patterns are organized by:

- **Language**: COBOL, PL/I, JCL, REXX, Assembler, Java
- **Category**: Naming, Structure, Documentation, Error Handling, Subsystem-specific
- **Confidence**: How reliably the pattern indicates a standard

## COBOL Patterns

### Naming Conventions

#### Variable Prefixes

Common prefixes and their meanings:

| Prefix | Meaning                 | Confidence | Example            |
| ------ | ----------------------- | ---------- | ------------------ |
| `WS-`  | Working Storage         | High       | `WS-CUSTOMER-ID`   |
| `W-`   | Working Storage (short) | High       | `W-CUST-ID`        |
| `LV-`  | Local Variable          | Medium     | `LV-COUNTER`       |
| `LS-`  | Linkage Section         | High       | `LS-PARM-DATA`     |
| `FD-`  | File Description        | Medium     | `FD-CUSTOMER-FILE` |
| `SQL-` | SQL-related             | High       | `SQL-CUSTOMER-REC` |

**Detection Pattern:**

```regex
^\s+\d{2}\s+(WS-|W-|LV-|LS-|FD-|SQL-)[A-Z0-9-]+
```

#### Paragraph Naming Styles

**VERB-NOUN Format:**

```cobol
PROCESS-CUSTOMER-RECORD.
READ-INPUT-FILE.
WRITE-ERROR-LOG.
VALIDATE-TRANSACTION.
```

**Detection Pattern:** `^[A-Z]+-[A-Z]+-[A-Z-]+\.$`

**Descriptive Format:**

```cobol
CUSTOMER-PROCESSING.
INPUT-FILE-HANDLER.
ERROR-LOGGING.
```

**Detection Pattern:** `^[A-Z]+-[A-Z-]+\.$`

**Numbered Format:**

```cobol
1000-INITIALIZATION.
2000-MAIN-PROCESSING.
9000-TERMINATION.
```

**Detection Pattern:** `^\d{4}-[A-Z-]+\.$`

#### Constant Naming

**All Caps with Hyphens:**

```cobol
78  MAX-RECORDS          VALUE 10000.
78  DEFAULT-STATUS       VALUE 'A'.
78  ERROR-CODE-INVALID   VALUE 'E001'.
```

**Detection Pattern:** `^\s+78\s+[A-Z][A-Z0-9-]+\s+VALUE`

### Code Structure Patterns

#### Program Header Format

**Standard 10-Line Header:**

```cobol
      *****************************************************************
      * PROGRAM: CUSTPROC
      * PURPOSE: Customer account processing
      * AUTHOR:  Development Team
      * DATE:    2026-01-15
      * INPUTS:  CUSTOMER.DAT
      * OUTPUTS: REPORT.TXT
      * NOTES:   Processes up to 10,000 records
      *****************************************************************
```

**Detection Pattern:** Look for 5+ consecutive comment lines starting with `*` after PROGRAM-ID

**Minimal Header:**

```cobol
      * CUSTPROC - Customer Processing
```

**Detection Pattern:** Single comment line after PROGRAM-ID

#### COPY Statement Placement

**After 01 Levels:**

```cobol
       01  WS-CUSTOMER-RECORD.
           COPY CUSTCOPY.
```

**Detection Pattern:** `COPY` statement following `01` level

**In Separate Section:**

```cobol
       COPY CUSTCOPY.
       01  WS-CUSTOMER-RECORD.
```

**Detection Pattern:** `COPY` statement before first `01` level

### Error Handling Patterns

#### File Status Checking

**Comprehensive Check:**

```cobol
       READ CUSTOMER-FILE INTO WS-CUSTOMER-RECORD
           AT END
               SET END-OF-FILE TO TRUE
           NOT AT END
               IF FILE-STATUS NOT = '00'
                   PERFORM HANDLE-FILE-ERROR
               END-IF
       END-READ.
```

**Detection Pattern:** `FILE-STATUS` check in `NOT AT END` clause

**Basic Check:**

```cobol
       READ CUSTOMER-FILE INTO WS-CUSTOMER-RECORD
           AT END
               SET END-OF-FILE TO TRUE
       END-READ.
```

**Detection Pattern:** Only `AT END` clause, no status check

#### ABEND Handling

**Dedicated ABEND Paragraph:**

```cobol
       ABEND-PROGRAM.
           DISPLAY 'ABEND IN PROGRAM: ' PROGRAM-NAME.
           DISPLAY 'ERROR CODE: ' WS-ERROR-CODE.
           CALL 'CEE3ABD' USING WS-ABEND-CODE WS-CLEANUP-FLAG.
           STOP RUN.
```

**Detection Pattern:** Paragraph named `ABEND` or `ABNORMAL-TERMINATION` with `STOP RUN` or `CEE3ABD`

### Subsystem-Specific Patterns

#### CICS Programs

**Command Formatting:**

```cobol
           EXEC CICS READ
                DATASET('CUSTFILE')
                INTO(WS-CUSTOMER-RECORD)
                RIDFLD(WS-CUSTOMER-ID)
                RESP(WS-RESP-CODE)
           END-EXEC.
```

**Detection Indicators:**

- `EXEC CICS` commands
- `DFHCOMMAREA` in LINKAGE SECTION
- `EIBCALEN`, `EIBDATE`, `EIBTIME` references

**Indentation Patterns:**

- 8 spaces for EXEC CICS
- 12 spaces for parameters
- 8 spaces for END-EXEC

#### IMS Programs

**DL/I Call Patterns:**

```cobol
           CALL 'CBLTDLI' USING WS-FUNCTION
                                WS-PCB
                                WS-SEGMENT-IO
                                WS-SSA.
```

**Detection Indicators:**

- `CALL 'CBLTDLI'` or `CALL 'PLITDLI'`
- `GU`, `GN`, `ISRT`, `DLET`, `REPL` function codes
- PCB (Program Communication Block) references
- SSA (Segment Search Argument) usage

#### DB2 Programs

**SQL Statement Formatting:**

```cobol
           EXEC SQL
                SELECT CUST_ID, CUST_NAME, CUST_BALANCE
                INTO :WS-CUST-ID, :WS-CUST-NAME, :WS-CUST-BALANCE
                FROM CUSTOMER
                WHERE CUST_ID = :WS-SEARCH-ID
           END-EXEC.
```

**Detection Indicators:**

- `EXEC SQL` commands
- `SQLCA` (SQL Communication Area)
- `SQLCODE` checking
- Host variables with `:` prefix

### Code Era Detection

#### COBOL-74 Indicators

```cobol
       IF CONDITION-1
           PERFORM PROCESS-RECORD.
       MOVE VALUE-1 TO FIELD-1.
```

**Characteristics:**

- No `END-IF`, `END-PERFORM` scope terminators
- Period-terminated statements
- Fixed format (columns 7-72)
- No inline PERFORM

#### COBOL-85 Indicators

```cobol
       IF CONDITION-1
           PERFORM PROCESS-RECORD
       END-IF.

       PERFORM VARYING WS-IDX FROM 1 BY 1
           UNTIL WS-IDX > 10
           DISPLAY WS-TABLE(WS-IDX)
       END-PERFORM.
```

**Characteristics:**

- Scope terminators (`END-IF`, `END-PERFORM`, etc.)
- Inline PERFORM
- Still mostly fixed format

#### Enterprise COBOL Indicators

```cobol
       INVOKE customer-object "getName" RETURNING customer-name.

       JSON GENERATE json-output FROM customer-record.

       01  WS-LONG-VARIABLE-NAME-ALLOWED PIC X(100).
```

**Characteristics:**

- Object-oriented features (INVOKE, CLASS)
- JSON/XML support
- Longer names (up to 30 characters)
- Free format option

## PL/I Patterns

### Naming Conventions

#### Variable Naming Styles

**Underscore Separated (Modern):**

```pli
DCL customer_id FIXED BIN(31);
DCL customer_name CHAR(50);
DCL is_active BIT(1);
```

**Detection Pattern:** `DCL\s+[a-z][a-z0-9_]+\s+`

**Hungarian Notation (Legacy):**

```pli
DCL iCustomerId FIXED BIN(31);
DCL szCustomerName CHAR(50);
DCL bIsActive BIT(1);
```

**Detection Pattern:** `DCL\s+[a-z]{1,2}[A-Z][a-zA-Z]+\s+`

**All Caps (Very Legacy):**

```pli
DCL CUSTOMERID FIXED BIN(31);
DCL CUSTOMERNAME CHAR(50);
```

**Detection Pattern:** `DCL\s+[A-Z][A-Z0-9]+\s+`

#### Constant Naming

**Uppercase with Underscores:**

```pli
DCL MAX_CUSTOMERS FIXED BIN(31) INIT(10000);
DCL DEFAULT_STATUS CHAR(1) INIT('A');
```

**Detection Pattern:** `DCL\s+[A-Z][A-Z0-9_]+\s+.*INIT\(`

### Error Handling Patterns

#### ON Condition Handlers

**Comprehensive Error Handling:**

```pli
read_file: PROC;
    ON ENDFILE(input_file)
        eof_flag = '1'B;
    ON ERROR
        BEGIN;
            PUT SKIP LIST('Error in read_file');
            PUT SKIP LIST('Error code:', ONCODE());
            CALL log_error('READ_FILE', ONCODE());
            SIGNAL ERROR;
        END;
    READ FILE(input_file) INTO(record_buffer);
END read_file;
```

**Detection Indicators:**

- `ON ENDFILE`, `ON ERROR`, `ON OVERFLOW`
- `ONCODE()` function usage
- `SIGNAL` statement

### Code Era Detection

#### Classic PL/I

```pli
 CUSTPROC: PROC OPTIONS(MAIN);
     DCL CUSTOMERID FIXED BIN(31);
     /* Fixed format, column-sensitive */
 END CUSTPROC;
```

**Characteristics:**

- Fixed format
- Limited built-in functions
- Older syntax

#### Modern PL/I

```pli
custproc: proc options(main);
    dcl customer_id fixed bin(31);
    dcl customer_name char(50) varying;
    /* Free format, modern built-ins */
end custproc;
```

**Characteristics:**

- Free format (case-insensitive)
- VARYING strings
- Enhanced built-in functions

## JCL Patterns

### Job Card Formats

#### Standard 3-Line Format

```jcl
//CUSTPROC JOB (ACCT123),'CUSTOMER PROCESSING',
//         CLASS=A,
//         MSGCLASS=X,
//         MSGLEVEL=(1,1),
//         NOTIFY=&SYSUID
```

**Detection Pattern:** Job card with continuation lines

#### Compact Format

```jcl
//CUSTPROC JOB (ACCT123),'CUST',CLASS=A,MSGCLASS=X
```

**Detection Pattern:** Single-line job card

### Comment Styles

#### Simple Comments

```jcl
//* This is a comment
//* Process customer records
```

**Detection Pattern:** `^//\*\s+`

#### Box-Style Comments

```jcl
//*********************************************************************
//* PROGRAM: CUSTPROC                                                 *
//* PURPOSE: Customer account processing                              *
//*********************************************************************
```

**Detection Pattern:** `^//\*{5,}` (5+ asterisks)

### DD Statement Patterns

#### Continuation Style

```jcl
//CUSTFILE DD DSN=PROD.CUSTOMER.MASTER,
//            DISP=SHR,
//            DCB=(RECFM=FB,LRECL=80)
```

**Detection Pattern:** DD parameters on separate lines

#### Inline Style

```jcl
//CUSTFILE DD DSN=PROD.CUSTOMER.MASTER,DISP=SHR,DCB=(RECFM=FB,LRECL=80)
```

**Detection Pattern:** DD parameters on single line

### Dataset Naming Conventions

**Hierarchical Naming:**

```jcl
PROD.CUSTOMER.MASTER
TEST.CUSTOMER.MASTER
DEV.CUSTOMER.MASTER
```

**Pattern:** `[ENV].[APPLICATION].[TYPE]`

**Date-Qualified:**

```jcl
PROD.REPORTS.DAILY.D20260115
PROD.BACKUP.WEEKLY.W202603
```

**Pattern:** `[PREFIX].[DATE]`

## REXX Patterns

### Variable Naming

**Lowercase with Underscores:**

```rexx
customer_id = 12345
customer_name = "John Doe"
is_active = 1
```

**Mixed Case:**

```rexx
customerId = 12345
customerName = "John Doe"
isActive = 1
```

**Uppercase (Legacy):**

```rexx
CUSTOMERID = 12345
CUSTOMERNAME = "JOHN DOE"
```

### Subroutine Patterns

**CALL Statement:**

```rexx
CALL ProcessCustomer customer_id
RETURN
```

**SIGNAL Statement:**

```rexx
SIGNAL ProcessCustomer
RETURN

ProcessCustomer:
  /* Processing logic */
RETURN
```

### Error Handling

**SIGNAL ON ERROR:**

```rexx
SIGNAL ON ERROR
/* Main logic */
EXIT 0

ERROR:
  SAY "Error occurred:" RC
  EXIT 8
```

## Java Patterns

### Naming Conventions

#### Class Naming

**PascalCase (Standard):**

```java
public class CustomerProcessor {
    // Class implementation
}

public class AccountManager {
    // Class implementation
}
```

**Detection Pattern:** `(public|private|protected)?\s*(abstract|final)?\s*class\s+[A-Z][a-zA-Z0-9]+`

#### Method Naming

**camelCase (Standard):**

```java
public void processCustomer() {
    // Method implementation
}

private String getCustomerName() {
    return customerName;
}
```

**Detection Pattern:** `(public|private|protected)\s+\w+\s+[a-z][a-zA-Z0-9]+\s*\(`

#### Variable Naming

**camelCase for local variables:**

```java
String customerName = "John Doe";
int accountBalance = 1000;
boolean isActive = true;
```

**Detection Pattern:** `\s+[a-z][a-zA-Z0-9]+\s*=`

**UPPER_CASE for constants:**

```java
public static final int MAX_CUSTOMERS = 10000;
public static final String DEFAULT_STATUS = "ACTIVE";
private static final double TAX_RATE = 0.15;
```

**Detection Pattern:** `(public|private|protected)\s+static\s+final\s+\w+\s+[A-Z][A-Z0-9_]+\s*=`

#### Package Naming

**Lowercase with dots:**

```java
package com.ibm.mainframe.customer;
package com.company.application.service;
```

**Detection Pattern:** `^package\s+[a-z][a-z0-9.]+;`

### Code Structure Patterns

#### Class Documentation (Javadoc)

**Standard Javadoc Format:**

```java
/**
 * Processes customer account transactions and generates reports.
 *
 * @author Development Team
 * @version 1.0
 * @since 2026-01-15
 */
public class CustomerProcessor {
    // Implementation
}
```

**Detection Pattern:** `/\*\*[\s\S]*?\*/\s*(public|private|protected)\s+class`

#### Method Documentation

**Comprehensive Javadoc:**

```java
/**
 * Validates customer transaction data.
 *
 * @param transaction the transaction to validate
 * @return true if valid, false otherwise
 * @throws ValidationException if transaction data is malformed
 */
public boolean validateTransaction(Transaction transaction)
        throws ValidationException {
    // Implementation
}
```

**Detection Pattern:** `/\*\*[\s\S]*?@param[\s\S]*?\*/\s*(public|private|protected)`

### Error Handling Patterns

#### Try-Catch Blocks

**Comprehensive Error Handling:**

```java
public void processCustomer(Customer customer) {
    try {
        validateCustomer(customer);
        updateDatabase(customer);
        logTransaction(customer);
    } catch (ValidationException e) {
        logger.error("Validation failed for customer: " + customer.getId(), e);
        throw new ProcessingException("Customer validation failed", e);
    } catch (DatabaseException e) {
        logger.error("Database error processing customer: " + customer.getId(), e);
        rollbackTransaction();
        throw new ProcessingException("Database operation failed", e);
    } catch (Exception e) {
        logger.error("Unexpected error processing customer: " + customer.getId(), e);
        throw new ProcessingException("Unexpected error", e);
    }
}
```

**Detection Indicators:**

- Multiple catch blocks for specific exceptions
- Logging in catch blocks
- Exception chaining (throw with cause)
- Finally blocks for cleanup

#### Try-with-Resources

**Modern Resource Management:**

```java
public String readCustomerData(String filename) throws IOException {
    try (BufferedReader reader = new BufferedReader(new FileReader(filename))) {
        return reader.lines().collect(Collectors.joining("\n"));
    }
}
```

**Detection Pattern:** `try\s*\([^)]+\)\s*\{`

### Annotation Patterns

#### Spring Framework

```java
@Service
@Transactional
public class CustomerService {

    @Autowired
    private CustomerRepository repository;

    @Override
    public Customer findById(Long id) {
        return repository.findById(id).orElse(null);
    }
}
```

**Detection Indicators:**

- `@Service`, `@Component`, `@Repository`, `@Controller`
- `@Autowired`, `@Inject`
- `@Transactional`
- `@Override`

#### JPA/Hibernate

```java
@Entity
@Table(name = "CUSTOMER")
public class Customer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "CUSTOMER_NAME", nullable = false)
    private String name;
}
```

**Detection Indicators:**

- `@Entity`, `@Table`
- `@Id`, `@GeneratedValue`
- `@Column`, `@JoinColumn`

### Code Style Patterns

#### Brace Placement

**K&R Style (opening brace on same line):**

```java
public void processCustomer() {
    if (customer != null) {
        // Process
    }
}
```

**Detection Pattern:** `\)\s*\{` (closing paren followed by opening brace)

**Allman Style (opening brace on new line):**

```java
public void processCustomer()
{
    if (customer != null)
    {
        // Process
    }
}
```

**Detection Pattern:** `\)\s*\n\s*\{`

#### Import Organization

**Grouped Imports:**

```java
import java.io.*;
import java.util.*;

import javax.persistence.*;

import org.springframework.stereotype.*;

import com.company.application.*;
```

**Detection Pattern:** Groups separated by blank lines

### Testing Patterns

#### JUnit Test Structure

**Standard Test Class:**

```java
@RunWith(SpringRunner.class)
@SpringBootTest
public class CustomerServiceTest {

    @Autowired
    private CustomerService service;

    @Test
    public void testFindCustomerById() {
        Customer customer = service.findById(1L);
        assertNotNull(customer);
        assertEquals("John Doe", customer.getName());
    }

    @Test(expected = CustomerNotFoundException.class)
    public void testFindNonExistentCustomer() {
        service.findById(999L);
    }
}
```

**Detection Indicators:**

- `@Test` annotations
- `@Before`, `@After`, `@BeforeClass`, `@AfterClass`
- Assert methods (`assertEquals`, `assertNotNull`, etc.)
- Test class naming: `*Test` or `Test*`

### Logging Patterns

#### SLF4J/Log4j

**Standard Logging:**

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CustomerService {
    private static final Logger logger = LoggerFactory.getLogger(CustomerService.class);

    public void processCustomer(Customer customer) {
        logger.info("Processing customer: {}", customer.getId());
        try {
            // Process
            logger.debug("Customer processed successfully: {}", customer.getId());
        } catch (Exception e) {
            logger.error("Error processing customer: " + customer.getId(), e);
        }
    }
}
```

**Detection Indicators:**

- `Logger` field declaration
- `LoggerFactory.getLogger()`
- Log level methods: `debug()`, `info()`, `warn()`, `error()`
- Parameterized logging with `{}`

### Framework Detection

#### Spring Boot

**Strong Indicators:**

- `@SpringBootApplication`
- `@RestController`, `@RequestMapping`
- `application.properties` or `application.yml`
- `@ConfigurationProperties`

#### Jakarta EE (Java EE)

**Strong Indicators:**

- `@WebServlet`, `@EJB`
- `@PersistenceContext`
- `web.xml` configuration
- `ejb-jar.xml` configuration

#### Microservices Patterns

**Strong Indicators:**

- `@FeignClient` (Spring Cloud)
- `@CircuitBreaker`, `@Retry`
- Service discovery annotations
- API Gateway patterns

## Subsystem Detection Patterns

### CICS Detection

**Strong Indicators (100% confidence):**

- `EXEC CICS` anywhere in code
- `DFHCOMMAREA` in LINKAGE SECTION
- `EIBCALEN`, `EIBDATE`, `EIBTIME`, `EIBTRNID`

**Medium Indicators (70% confidence):**

- `DFHAID` copybook
- `COMMAREA` in comments
- Transaction ID references

### IMS Detection

**Strong Indicators (100% confidence):**

- `CALL 'CBLTDLI'` or `CALL 'PLITDLI'`
- `GU`, `GN`, `ISRT`, `DLET`, `REPL` function codes
- `PCB` (Program Communication Block)

**Medium Indicators (70% confidence):**

- `SSA` (Segment Search Argument)
- `DL/I` in comments
- IMS-specific copybooks

### DB2 Detection

**Strong Indicators (100% confidence):**

- `EXEC SQL`
- `SQLCA` declaration
- `SQLCODE` or `SQLSTATE` checking

**Medium Indicators (70% confidence):**

- Host variables with `:` prefix
- `DCLGEN` copybooks
- DB2 plan/package references

### MQ Detection

**Strong Indicators (100% confidence):**

- `MQOPEN`, `MQGET`, `MQPUT`, `MQCLOSE`
- `MQMD` (Message Descriptor)
- `MQGMO`, `MQPMO` (Get/Put Message Options)

## Pattern Confidence Scoring

### High Confidence (80-100%)

Pattern appears consistently across codebase:

- 12+ occurrences in 15 files
- No conflicting patterns
- Matches known industry standards

### Medium Confidence (60-79%)

Pattern appears frequently but with some variation:

- 9-11 occurrences in 15 files
- Minor variations exist
- Generally consistent approach

### Low Confidence (40-59%)

Pattern appears but with significant variation:

- 6-8 occurrences in 15 files
- Multiple competing approaches
- Context-dependent usage

### Uncertain (<40%)

Pattern is inconsistent or rare:

- <6 occurrences in 15 files
- Highly variable
- May be accidental, not intentional

## Usage Guidelines

### When Analyzing a Codebase

1. **Scan for file types** using extensions
2. **Read representative samples** (15-20 files)
3. **Apply detection patterns** from this library
4. **Count occurrences** of each pattern
5. **Calculate confidence scores**
6. **Present findings** to user for validation

### When Creating Standards

1. **Use high-confidence patterns** as mandatory rules
2. **Use medium-confidence patterns** as recommendations
3. **Document low-confidence patterns** as options
4. **Flag uncertain patterns** for user decision

### When Updating Standards

1. **Re-analyze codebase** periodically
2. **Track pattern evolution** over time
3. **Update confidence scores** based on new code
4. **Adjust standards** to reflect current practice

---

**Note:** This pattern library is continuously evolving. Add new patterns as you discover them in customer codebases.
