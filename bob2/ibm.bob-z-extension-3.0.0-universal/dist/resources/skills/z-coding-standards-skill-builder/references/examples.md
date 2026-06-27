# Examples

> **Note:** This file contains comprehensive examples of coding standards patterns across different languages. Use these examples when building new standards enforcement skills or when users need clarification on what good standards look like.

## Coding Standards Examples

This file provides examples of common coding standards patterns across different languages.

## COBOL Examples

### Naming Conventions

**Good Example:**

```cobol
       01  WS-CUSTOMER-RECORD.
           05  WS-CUST-ID              PIC 9(8).
           05  WS-CUST-NAME            PIC X(50).
           05  WS-CUST-BALANCE         PIC S9(9)V99 COMP-3.
           05  WS-CUST-STATUS          PIC X.
               88  CUST-ACTIVE         VALUE 'A'.
               88  CUST-INACTIVE       VALUE 'I'.
               88  CUST-SUSPENDED      VALUE 'S'.
```

**Bad Example:**

```cobol
       01  CR.
           05  ID              PIC 9(8).
           05  NM              PIC X(50).
           05  BAL             PIC S9(9)V99 COMP-3.
           05  ST              PIC X.
```

**Why the bad example is wrong:**

- Cryptic abbreviations make code hard to understand
- No meaningful prefixes to indicate scope
- Missing level-88 condition names for status values

### Documentation

**Good Example:**

```cobol
      *****************************************************************
      * PROGRAM: CUSTPROC
      * PURPOSE: Process customer account updates and generate reports
      * AUTHOR:  Development Team
      * DATE:    2026-01-15
      * INPUTS:  CUSTOMER.DAT - Customer master file
      *          TRANS.DAT    - Transaction file
      * OUTPUTS: REPORT.TXT   - Processing report
      *          ERRORS.LOG   - Error log
      * NOTES:   Processes up to 10,000 records per run
      *****************************************************************
       PROCESS-CUSTOMER-UPDATES.
      *    Process all pending customer transactions
      *    and update the master file accordingly
           PERFORM READ-TRANSACTION
           PERFORM UNTIL END-OF-FILE
               PERFORM VALIDATE-TRANSACTION
               IF VALID-TRANSACTION
                   PERFORM UPDATE-CUSTOMER-RECORD
                   PERFORM WRITE-AUDIT-LOG
               ELSE
                   PERFORM WRITE-ERROR-LOG
               END-IF
               PERFORM READ-TRANSACTION
           END-PERFORM.
```

**Bad Example:**

```cobol
       PROC-CUST.
           PERFORM RD-TRN
           PERFORM UNTIL EOF
               PERFORM VAL-TRN
               IF VLD
                   PERFORM UPD-CR
               END-IF
               PERFORM RD-TRN
           END-PERFORM.
```

### Error Handling

**Good Example:**

```cobol
       READ-CUSTOMER-FILE.
           READ CUSTOMER-FILE INTO WS-CUSTOMER-RECORD
               AT END
                   SET END-OF-FILE TO TRUE
               NOT AT END
                   IF FILE-STATUS NOT = '00'
                       MOVE 'READ-CUSTOMER-FILE' TO WS-ERROR-PARA
                       MOVE FILE-STATUS TO WS-ERROR-CODE
                       PERFORM WRITE-ERROR-LOG
                       PERFORM ABEND-PROGRAM
                   END-IF
           END-READ.
```

**Bad Example:**

```cobol
       READ-CUSTOMER-FILE.
           READ CUSTOMER-FILE INTO WS-CUSTOMER-RECORD
               AT END
                   SET END-OF-FILE TO TRUE
           END-READ.
```

## PL/I Examples

### Naming Conventions

**Good Example:**

```pli
DCL customer_record CHAR(100);
DCL customer_id FIXED BIN(31);
DCL customer_balance FIXED DEC(11,2);
DCL is_active_customer BIT(1);
/* Constants use uppercase with underscores */
DCL MAX_CUSTOMERS FIXED BIN(31) INIT(10000);
DCL DEFAULT_STATUS CHAR(1) INIT('A');
```

**Bad Example:**

```pli
DCL cr CHAR(100);
DCL id FIXED BIN(31);
DCL bal FIXED DEC(11,2);
DCL act BIT(1);
```

### Error Handling

**Good Example:**

```pli
read_customer_file: PROC;
    DCL file_status FIXED BIN(31);
    ON ENDFILE(customer_file)
        eof_flag = '1'B;
    ON ERROR
        BEGIN;
            PUT SKIP LIST('Error reading customer file');
            PUT SKIP LIST('Error code:', ONCODE());
            CALL log_error('READ_CUSTOMER_FILE', ONCODE());
            SIGNAL ERROR;
        END;
    READ FILE(customer_file) INTO(customer_record);
END read_customer_file;
```

## JCL Examples

### Job Documentation

**Good Example:**

```jcl
//CUSTPROC JOB (ACCT123),'CUSTOMER PROCESSING',
//         CLASS=A,
//         MSGCLASS=X,
//         MSGLEVEL=(1,1),
//         NOTIFY=&SYSUID
//*
//* PURPOSE: Daily customer account processing
//* AUTHOR:  Development Team
//* DATE:    2026-01-15
//* INPUTS:  PROD.CUSTOMER.MASTER
//*          PROD.TRANS.DAILY
//* OUTPUTS: PROD.CUSTOMER.MASTER (updated)
//*          PROD.REPORTS.DAILY
//* NOTES:   Runs daily at 02:00 AM
//*
//STEP010  EXEC PGM=CUSTPROC,
//         REGION=4M,
//         PARM='DATE=&LDATE'
//CUSTMAST DD DSN=PROD.CUSTOMER.MASTER,
//            DISP=SHR
//TRANFILE DD DSN=PROD.TRANS.DAILY,
//            DISP=SHR
//REPORT   DD DSN=PROD.REPORTS.DAILY(&LDATE),
//            DISP=(NEW,CATLG,DELETE),
//            UNIT=SYSDA,
//            SPACE=(CYL,(5,1)),
//            DCB=(RECFM=FBA,LRECL=133,BLKSIZE=13300)
```

**Bad Example:**

```jcl
//CUSTPROC JOB (ACCT123),'CUST',CLASS=A
//STEP010  EXEC PGM=CUSTPROC
//CUSTMAST DD DSN=PROD.CUSTOMER.MASTER,DISP=SHR
//TRANFILE DD DSN=PROD.TRANS.DAILY,DISP=SHR
//REPORT   DD DSN=PROD.REPORTS.DAILY,DISP=(NEW,CATLG,DELETE)
```

## Common Anti-Patterns

### Magic Numbers

**Bad:**

```cobol
       IF WS-RECORD-COUNT > 1000
           PERFORM PROCESS-BATCH
       END-IF.
```

**Good:**

```cobol
       78  MAX-BATCH-SIZE          VALUE 1000.
       IF WS-RECORD-COUNT > MAX-BATCH-SIZE
           PERFORM PROCESS-BATCH
       END-IF.
```

### Deep Nesting

**Bad:**

```cobol
       IF CONDITION-1
           IF CONDITION-2
               IF CONDITION-3
                   IF CONDITION-4
                       PERFORM SOME-ACTION
                   END-IF
               END-IF
           END-IF
       END-IF.
```

**Good:**

```cobol
       IF NOT CONDITION-1
           GO TO END-OF-VALIDATION
       END-IF.
       IF NOT CONDITION-2
           GO TO END-OF-VALIDATION
       END-IF.
       IF NOT CONDITION-3
           GO TO END-OF-VALIDATION
       END-IF.
       IF CONDITION-4
           PERFORM SOME-ACTION
       END-IF.
       END-OF-VALIDATION.
```

### Hardcoded Values

**Bad:**

```cobol
       MOVE 'PROD.CUSTOMER.MASTER' TO FILE-NAME.
       MOVE '/opt/app/config.txt' TO CONFIG-PATH.
```

**Good:**

```cobol
       01  ENVIRONMENT-VARIABLES.
           05  FILE-NAME           PIC X(50).
           05  CONFIG-PATH         PIC X(100).
       ACCEPT FILE-NAME FROM ENVIRONMENT 'CUST_FILE'.
       ACCEPT CONFIG-PATH FROM ENVIRONMENT 'CONFIG_PATH'.
```

## Language-Specific Best Practices

### COBOL Performance

**Optimize Table Searches:**

```cobol
       01  CUSTOMER-TABLE.
           05  CUSTOMER-ENTRY OCCURS 1000 TIMES
               ASCENDING KEY IS CUST-ID
               INDEXED BY CUST-IDX.
               10  CUST-ID         PIC 9(8).
               10  CUST-NAME       PIC X(50).
       SEARCH ALL CUSTOMER-ENTRY
           AT END
               PERFORM CUSTOMER-NOT-FOUND
           WHEN CUST-ID(CUST-IDX) = WS-SEARCH-ID
               PERFORM PROCESS-CUSTOMER
       END-SEARCH.
```

### PL/I Memory Management

**Proper Storage Allocation:**

```pli
allocate_customer_buffer: PROC;
    DCL customer_ptr PTR;
    DCL customer_buffer CHAR(1000) BASED(customer_ptr);
    ALLOCATE customer_buffer;
    /* Use the buffer */
    customer_buffer = read_customer_data();
    /* Always free allocated storage */
    FREE customer_buffer;
END allocate_customer_buffer;
```

### JCL Resource Management

**Efficient Space Allocation:**

```jcl
//OUTPUT   DD DSN=PROD.OUTPUT.FILE,
//            DISP=(NEW,CATLG,DELETE),
//            UNIT=SYSDA,
//            SPACE=(CYL,(10,5),RLSE),  /* Release unused space */
//            DCB=(RECFM=FB,LRECL=80,BLKSIZE=27920)
```

## Testing Standards

### Unit Test Structure

**Good Example:**

```cobol
      *****************************************************************
      * TEST: VALIDATE-CUSTOMER-ID
      * PURPOSE: Verify customer ID validation logic
      *****************************************************************
       TEST-VALIDATE-CUSTOMER-ID.
           MOVE 'TEST-VALIDATE-CUSTOMER-ID' TO TEST-NAME.
      *    Test Case 1: Valid customer ID
           MOVE 12345678 TO WS-CUST-ID
           PERFORM VALIDATE-CUSTOMER-ID
           IF NOT VALID-CUSTOMER-ID
               PERFORM TEST-FAILED
           END-IF.
      *    Test Case 2: Invalid customer ID (zero)
           MOVE 0 TO WS-CUST-ID
           PERFORM VALIDATE-CUSTOMER-ID
           IF VALID-CUSTOMER-ID
               PERFORM TEST-FAILED
           END-IF.
      *    Test Case 3: Invalid customer ID (negative)
           MOVE -1 TO WS-CUST-ID
           PERFORM VALIDATE-CUSTOMER-ID
           IF VALID-CUSTOMER-ID
               PERFORM TEST-FAILED
           END-IF.
           PERFORM TEST-PASSED.
```

## Security Best Practices

### Input Validation

**Good Example:**

```cobol
       VALIDATE-USER-INPUT.
           IF WS-USER-INPUT = SPACES OR LOW-VALUES
               MOVE 'Invalid input: empty value' TO WS-ERROR-MSG
               PERFORM REJECT-INPUT
               GO TO END-VALIDATION
           END-IF.
           IF WS-INPUT-LENGTH > MAX-INPUT-LENGTH
               MOVE 'Invalid input: exceeds maximum length'
                   TO WS-ERROR-MSG
               PERFORM REJECT-INPUT
               GO TO END-VALIDATION
           END-IF.
           PERFORM CHECK-SPECIAL-CHARACTERS
           IF INVALID-CHARACTERS-FOUND
               MOVE 'Invalid input: contains illegal characters'
                   TO WS-ERROR-MSG
               PERFORM REJECT-INPUT
               GO TO END-VALIDATION
           END-IF.
           SET VALID-INPUT TO TRUE.
       END-VALIDATION.
```

### Credential Management

**Bad:**

```cobol
       01  DATABASE-CONFIG.
           05  DB-USER         PIC X(20) VALUE 'admin'.
           05  DB-PASSWORD     PIC X(20) VALUE 'password123'.
```

**Good:**

```cobol
       01  DATABASE-CONFIG.
           05  DB-USER         PIC X(20).
           05  DB-PASSWORD     PIC X(20).
       INITIALIZE-DATABASE-CONFIG.
           ACCEPT DB-USER FROM ENVIRONMENT 'DB_USER'.
           ACCEPT DB-PASSWORD FROM ENVIRONMENT 'DB_PASSWORD'.
```

## Maintainability Patterns

### Modular Design

**Good Example:**

```cobol
       PROCESS-CUSTOMER-TRANSACTION.
           PERFORM VALIDATE-TRANSACTION
           IF VALID-TRANSACTION
               PERFORM UPDATE-CUSTOMER-BALANCE
               PERFORM RECORD-TRANSACTION-HISTORY
               PERFORM GENERATE-CONFIRMATION
           ELSE
               PERFORM LOG-VALIDATION-ERROR
               PERFORM NOTIFY-CUSTOMER-SERVICE
           END-IF.
```

Each paragraph has a single, clear responsibility and can be tested independently.

## Java Examples

### Naming Conventions

**Good Example:**

```java
public class CustomerAccountProcessor {
    private static final int MAX_RETRY_ATTEMPTS = 3;
    private CustomerRepository customerRepository;

    public void processCustomerAccount(Long customerId) {
        Customer customer = findCustomerById(customerId);
        validateCustomerStatus(customer);
    }
}
```

**Bad Example:**

```java
public class CAP {
    private static final int max = 3;
    private CustomerRepository cr;

    public void proc(Long id) {
        Customer c = fnd(id);
        val(c);
    }
}
```

### Documentation

**Good Example:**

```java
/**
 * Processes customer account transactions.
 *
 * @param customerId the unique identifier of the customer
 * @param transaction the transaction to process
 * @return the updated account balance
 * @throws CustomerNotFoundException if customer does not exist
 */
public BigDecimal processTransaction(Long customerId, Transaction transaction) {
    // Implementation
}
```

### Error Handling

**Good Example:**

```java
public Customer processCustomer(Long customerId) {
    try {
        Customer customer = customerRepository.findById(customerId)
            .orElseThrow(() -> new CustomerNotFoundException(customerId));
        validateCustomer(customer);
        return customer;
    } catch (CustomerNotFoundException e) {
        logger.error("Customer not found: {}", customerId, e);
        throw e;
    } catch (ValidationException e) {
        logger.error("Validation failed: {}", customerId, e);
        throw new ProcessingException("Validation failed", e);
    }
}
```

**Bad Example:**

```java
public Customer processCustomer(Long customerId) {
    try {
        Customer customer = customerRepository.findById(customerId).get();
        return customer;
    } catch (Exception e) {
        e.printStackTrace();
        return null;
    }
}
```

### Resource Management

**Good Example (Try-with-Resources):**

```java
public List<String> readCustomerData(String filename) throws IOException {
    try (BufferedReader reader = new BufferedReader(new FileReader(filename))) {
        return reader.lines().collect(Collectors.toList());
    }
}
```

**Bad Example:**

```java
public List<String> readCustomerData(String filename) {
    BufferedReader reader = new BufferedReader(new FileReader(filename));
    // Resource leak - reader never closed!
    return lines;
}
```
