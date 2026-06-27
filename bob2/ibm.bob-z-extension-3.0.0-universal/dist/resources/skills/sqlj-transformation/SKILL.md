---
name: sqlj-transformation
description: SQLJ-SPECIFIC transformation instructions for transforming EXEC SQL statements from source programs to Java when the target database framework is SQLJ. Only use when SQLJ is the desired framework and the source contains EXEC SQL declarations, OPEN/FETCH/CLOSE cursor operations, INSERT/UPDATE/DELETE statements, or SET CURRENT PACKAGESET. Tells you exactly where to place SQLJ context and iterator declarations, how to map each EXEC SQL statement to its SQLJ equivalent, and how to handle host variables.
---

# SQLJ Transformation Instructions

When you encounter `EXEC SQL` statements in source code while generating Java, you must produce SQLJ — not JDBC `PreparedStatement` code. SQLJ is static SQL embedded directly in Java using the `#sql` syntax. Follow the rules below precisely.

## Source Language Note

Source programs use `EXEC SQL ... END-EXEC` for embedded SQL. Host variable names may use hyphens (`:VAR-1`) or underscores (`:VAR_1`) depending on the source language. Both are handled the same way: strip the leading `:` and convert to camelCase. `:VAR-1` and `:VAR_1` both become `var1`.

## EXEC SQL → SQLJ Correspondence Table

For every `EXEC SQL` block in the source, apply the corresponding SQLJ transformation:

| EXEC SQL                         | SQLJ Equivalent                                        | Placement                        | Notes                                             |
| -------------------------------- | ------------------------------------------------------ | -------------------------------- | ------------------------------------------------- |
| _(none)_                         | `#sql context SqljCntxt;`                              | Top of Java file (after imports) | One per class that uses SQL                       |
| _(none)_                         | Context instantiation                                  | Before first SQL use             | Use URL+user+password or existing JDBC connection |
| `DECLARE cursor ... SELECT ...`  | `#sql iterator IteratorName(...)`                      | Top of Java file (after context) | Variable names from SELECT columns, not host vars |
| `OPEN cursor`                    | `#sql [ctx] iteratorVar = { SELECT ... }`              | In method body                   | Uses SQL text from CURSOR DECLARE                 |
| `FETCH cursor INTO :var1, :var2` | `iteratorVar.next()` + field accessor calls            | In method body                   | Assign column values to Java variables            |
| `CLOSE cursor`                   | `iteratorVar.close()`                                  | In method body                   | Always close even if ResultSet was used           |
| `EXEC SQL INSERT/UPDATE/DELETE`  | `#sql [ctx] { INSERT/UPDATE/DELETE ... }`              | In method body                   | Direct wrapping                                   |
| `SET CURRENT PACKAGESET`         | `stmt.executeUpdate("SET CURRENT PACKAGE PATH = ...")` | Before context creation          | Via plain JDBC Statement                          |

## Class-Level Declarations

Every Java class that contains SQL operations requires three things:

### 1. Required Imports

Add these imports at the top of the `.sqlj` file if not already present:

```java
import java.sql.*;
import sqlj.runtime.ExecutionContext;
```

### 2. SQLJ Context

Add exactly once per class:

```java
#sql context SqljCntxt;
```

### 3. SQLJ Iterators

For every `DECLARE cursor FOR SELECT ...` found in the source, add one iterator declaration. The iterator's field names come from the **SELECT column names**, not the host variable names in the `INTO` clause.

**Source:**

```text
EXEC SQL
  DECLARE Emp_Cursor CURSOR FOR
    SELECT EMP_ID, EMP_NAME
    FROM EMP_TABLE
    WHERE EMP_ID > :VAR1
END-EXEC
```

**You generate (after imports, before class body):**

```java
#sql context SqljCntxt;
#sql iterator EmpCursor(int emp_id, String emp_name);
```

### ⛔ CRITICAL RULES ⛔

- Iterator field names MUST be the SELECT column names, converted to camelCase — never the host variable names from `INTO :VAR1`.
- If the cursor has no name, generate one: `iterator1`, `iterator2`, etc.
- `#sql context` and `#sql iterator` are **top-level Java constructs** — they MUST appear **before `public class`**, never inside the class body or inside a method.
- ❌ NEVER place `#sql context SqljCntxt;` or any `#sql iterator` inside `public class { ... }`.
- `import java.sql.*` and `import sqlj.runtime.ExecutionContext` are **mandatory** — never omit them from any `.sqlj` file that uses SQL.

## Example File Structure

Every `.sqlj` file that uses SQL must follow this exact top-to-bottom order:

```java
package com.example;

import java.sql.*;                              // ← mandatory
import sqlj.runtime.ExecutionContext;           // ← mandatory

#sql context SqljCntxt;                         // ← outside the class
#sql iterator EmpCursor(int emp_id, String emp_name); // ← outside the class

public class MyProgram {

    private EmpCursor empCursor; // ← field for each iterator, inside the class
    // other fields ...
}
```

## OPEN Cursor

When you see `EXEC SQL OPEN CursorName END-EXEC`, generate code that:

1. Obtains an SQLJ context from a connection.
2. Optionally creates an `ExecutionContext` to control execution (e.g., `setMaxRows`).
3. Maps each host variable used in the WHERE clause to a **local Java variable** (SQLJ cannot use getter/setter calls directly as host variables).
4. Executes the `#sql` statement to populate the iterator.

**Source:**

```text
EXEC SQL
  OPEN Emp_Cursor
END-EXEC
```

**You generate:**

```java
SqljCntxt sqljCntx = null;
JdbcConnection connection = JdbcConnection.getConnection();
sqljCntx = new SqljCntxt(connection.getUrl(), connection.getUser(), connection.getPassword(), false);

ExecutionContext ec = new ExecutionContext();
ec.setMaxRows(maxRows);

// Map host variables to local variables before the #sql block
int var1 = this.getEmpTable().getEmpId();

#sql [sqljCntx, ec] empCurIterator = {
    SELECT EMP_ID, EMP_NAME
    FROM EMP_TABLE
    WHERE EMP_ID > :var1
};
```

### Host Variable Mapping Rule

SQLJ host variables inside `#sql { ... }` must be simple local variables. For each host variable referenced in the SQL statement:

1. Declare a local Java variable with the appropriate type.
2. Assign it from the corresponding Java bean getter before the `#sql` block.
3. Use the local variable name inside `#sql { ... }`.

```java
// :VAR1  →  Java: var1
int var1 = this.getEmpTable().getEmpId();
#sql [sqljCntx] empCurIterator = { SELECT ... WHERE EMP_ID > :var1 };
```

## FETCH Cursor

When you see `EXEC SQL FETCH CursorName INTO :VAR1, :VAR2, ... END-EXEC`, generate code that advances the iterator and reads column values into the appropriate Java variables or bean setters.

**Source:**

```text
EXEC SQL
  FETCH Emp_Cursor
  INTO :VAR1, :VAR2
END-EXEC
```

**You generate:**

```java
if (!empCurIterator.next()) {
    sqlCode = 100; // no row found
    return;
}
try {
    this.setEmpId(empCurIterator.emp_id());
    this.setEmpName(empCurIterator.emp_name());
} catch (SQLException e) {
    sqlCode = e.getErrorCode();
}
```

### ⛔ CRITICAL RULES ⛔

- `iterator.next()` returns `false` when there are no more rows — set `sqlCode = 100` and return.
- Column accessors are method calls: `empCurIterator.emp_id()`, not field access.
- Column accessor names are the SELECT column names (camelCase), **not** the `INTO` host variable names.
- You may use either bean setters (`this.setEmpId(...)`) or local variable assignments — match the pattern used in the rest of the generated method.
- Wrap the accessor assignments in a `try/catch (SQLException e)`.

### Alternative: ResultSet

If the surrounding Java code uses `ResultSet` patterns, you may obtain a ResultSet from the iterator instead:

```java
ResultSet rs = empCurIterator.getResultSet();
while (rs.next()) {
    this.setEmpId(rs.getInt("EMP_ID"));
    this.setEmpName(rs.getString("EMP_NAME"));
}
```

You must still call `empCurIterator.close()` when done — even when using ResultSet.

## CLOSE Cursor

When you see `EXEC SQL CLOSE CursorName END-EXEC`, always generate:

```java
empCurIterator.close();
```

Always close the iterator to release resources, even if you used `getResultSet()` instead of calling `next()` directly.

## INSERT / UPDATE / DELETE

Wrap the SQL text directly in a `#sql` block using the context variable. Map each host variable to a local Java variable first.

**Source:**

```text
EXEC SQL
  INSERT INTO SALES VALUES(:VAR1, :VAR2, :VAR3, :VAR4)
END-EXEC
```

**You generate:**

```java
// Map host variables to local variables
int var1 = this.getSales().getItemId();
String var2 = this.getSales().getItemName();
java.sql.Date var3 = this.getSales().getDateSold();
double var4 = this.getSales().getTotalCost();

#sql [sqljCntx] { INSERT INTO SALES VALUES(:var1, :var2, :var3, :var4) };
```

The same pattern applies to `UPDATE` and `DELETE` — no iterator needed.

## SET CURRENT PACKAGESET

When you see `EXEC SQL SET CURRENT PACKAGESET = 'COLLID' END-EXEC`, generate a plain JDBC statement executed **before** creating the SQLJ context.

**Source:**

```text
EXEC SQL
  SET CURRENT PACKAGESET = 'TTSYSBCOM1COL'
END-EXEC
```

**You generate:**

```java
Statement stmt = con.createStatement();
stmt.executeUpdate("SET CURRENT PACKAGE PATH = 'NULLID', 'TTSYSBCOM1COL'");
stmt.close();
sqljCntx = new SqljCntxt(con);
```

### ⛔ CRITICAL RULES ⛔

- Do NOT use `setSpecialRegisters()` or the `currentPackageSet` connection property — these only apply at connection creation time and cannot switch packages mid-transaction.
- Always execute the `SET CURRENT PACKAGE PATH` statement before instantiating `SqljCntxt`.

## Type Mapping for Iterator Fields

Use the following type mapping when declaring iterator fields from SELECT column types:

| Source type                     | Java type in iterator  |
| ------------------------------- | ---------------------- |
| Numeric up to 9 digits          | `int`                  |
| Numeric more than 9 digits      | `long`                 |
| Binary / packed numeric         | `int` or `long`        |
| Packed decimal / `DECIMAL(p,s)` | `java.math.BigDecimal` |
| Character / string              | `String`               |
| `DATE`                          | `java.sql.Date`        |
| `TIMESTAMP`                     | `java.sql.Timestamp`   |
| `FLOAT` / `DOUBLE`              | `double`               |

## Where to Place Everything

| What                                                           | Where                                                                   |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `import java.sql.*` and `import sqlj.runtime.ExecutionContext` | Top of file, with other imports                                         |
| `#sql context SqljCntxt;`                                      | After imports, before `public class`                                    |
| `#sql iterator IteratorName(...)`                              | After `#sql context`, before `public class`                             |
| Context + iterator instantiation (`OPEN`)                      | Inside the method that handles the OPEN operation                       |
| Iterator `.next()` calls (`FETCH`)                             | Inside the method that handles the FETCH operation                      |
| `iteratorVar.close()` (`CLOSE`)                                | Inside the method that handles the CLOSE operation                      |
| `#sql [ctx] { INSERT/UPDATE/DELETE }`                          | Inside the method that handles the DML operation                        |
| `SET CURRENT PACKAGE PATH`                                     | Before context instantiation, in the method that sets up the connection |

## Keep All Cursor Methods in the Same Class

All methods handling the lifecycle of a single cursor (open, fetch, close) must be generated in the **same Java class**. That class is also where the corresponding `#sql iterator` declaration lives. Place these methods in the TableClass that owns the data being queried.

## Validation Checklist

Before completing any class that contains SQL, verify:

- ✅ `import java.sql.*` and `import sqlj.runtime.ExecutionContext` are present
- ✅ `#sql context SqljCntxt;` appears once, after imports, before `public class`
- ✅ One `#sql iterator` declared per SELECT cursor, with column names (not host var names)
- ✅ All iterator and context declarations are before the `public class` line
- ✅ Each `OPEN` produces an `#sql [ctx] iterator = { SELECT ... }` with local host variable mappings
- ✅ Each `FETCH` produces `iterator.next()` with column accessors in a try/catch
- ✅ Each `CLOSE` produces `iterator.close()`
- ✅ `SET CURRENT PACKAGESET` uses `stmt.executeUpdate(...)` before context creation
- ✅ All cursor lifecycle methods (open, fetch, close) are in the same class
- ✅ No JDBC `PreparedStatement` used for SELECT — that is replaced by the SQLJ iterator
- ✅ Host variable names (hyphenated or underscored) converted to camelCase Java locals
