---
name: target-serializer-generation
description: Comprehensive reference for generating Java serializer classes that convert objects to/from COBOL-format byte arrays using JZOS infrastructure. Covers composite and leaf serializer patterns, offset management, field definitions, and critical implementation rules.
---

# Java Serializer Class Generation

This skill provides comprehensive guidance for generating Java serializer classes that convert objects to/from COBOL-format byte arrays. These serializers use JZOS infrastructure classes for correct byte-level operations and EBCDIC encoding.

## When to Use

Activate this skill when:

- Creating a Java class with a name ending in `Serializer.java`
- Generating serializers for COBOL data transformation
- Working with ByteArraySerializer implementations

## Serializer Types

There are two types of serializers, distinguished by their field composition:

### TYPE 1: Composite Serializers

**Characteristics:**

- Compose other serializers to handle complex nested structures
- Fields list OTHER CLASS TYPES (e.g., `CnetuserKey`, `CnetuserData`)
- These are SERIALIZER INSTANCES that should be private fields

**Pattern:**

```java
public class PersonSerializer implements ByteArraySerializer<Person> {
    // Nested serializer instances
    private static final HomeAddressSerializer HOME_ADDRESS = new HomeAddressSerializer();
    private static final int HOME_ADDRESS_OFFSET = factory.getOffset();
    static { factory.incrementOffset(HomeAddressSerializer.SIZE); }

    // Use nested serializers in toBytes/fromBytes
    @Override
    public byte[] toBytes(byte[] bytes, int offset, final Person person) {
        // ...
        HOME_ADDRESS.toBytes(bytes, HOME_ADDRESS_OFFSET + offset, person.getHomeAddress());
        // ...
    }

    @Override
    public Person fromBytes(byte[] bytes, int offset) {
        // ...
        person.setHomeAddress(HOME_ADDRESS.fromBytes(bytes, HOME_ADDRESS_OFFSET + offset));
        // ...
    }
}
```

### TYPE 2: Leaf Serializers

**Characteristics:**

- Serialize primitive data directly using JZOS field classes
- Fields list PRIMITIVE TYPES (char, String, int, etc.)
- These are DATA FIELDS in the target class being serialized
- DO NOT create these as fields in the serializer
- Access them via getters on the target object

**Pattern:**

```java
public class HomeAddressSerializer implements ByteArraySerializer<HomeAddress> {
    // JZOS field definitions for primitives
    private static final StringField STREET = factory.getStringField(30);
    private static final StringField CITY = factory.getStringField(20);

    @Override
    public byte[] toBytes(byte[] bytes, int offset, final HomeAddress address) {
        STREET.putString(address.getStreet(), bytes, offset);
        CITY.putString(address.getCity(), bytes, offset);
        return bytes;
    }

    @Override
    public HomeAddress fromBytes(byte[] bytes, int offset) {
        bytes = padToSize(bytes, offset, numBytes());
        HomeAddress address = new HomeAddress();
        address.setStreet(STREET.getString(bytes, offset).trim());
        address.setCity(CITY.getString(bytes, offset).trim());
        return address;
    }
}
```

## Required Structure

Every serializer MUST follow this exact pattern:

### 1. Class Declaration

```java
public class TargetSerializer implements ByteArraySerializer<Target> {
```

**Critical Rules:**

- Use `implements ByteArraySerializer`, NOT `extends` (it's an interface)
- Generic type parameter must match the target class

### 2. Required Imports

```java
import java.nio.charset.Charset;
import com.ibm.jzos.fields.*;
import com.ibm.bobz.infrastructure.serialization.ByteArraySerializer;
import com.example.package.TargetClass;  // Target class package from prompt
```

### 3. Encoding Setup

```java
private static final Charset encoding = Charset.forName("IBM-1047");
private static CobolDatatypeFactory factory = new CobolDatatypeFactory();
static {
    factory.setStringTrimDefault(true);
    factory.setStringEncoding(encoding.name());
}
```

**Critical:**

- MUST use IBM-1047 (EBCDIC) encoding, NOT UTF-8
- Factory MUST be configured in static block

### 4. Field Definitions

All fields created via `CobolDatatypeFactory`:

```java
// String fields
private static final StringField FIELD_NAME = factory.getStringField(length);

// Integer fields (NO IntField class exists!)
private static final ExternalDecimalAsIntField FIELD_NAME =
    factory.getExternalDecimalAsIntField(length, signed);

// Long fields (NO LongField class exists!)
private static final ExternalDecimalAsLongField FIELD_NAME =
    factory.getExternalDecimalAsLongField(length, signed);

// Decimal fields
private static final PackedDecimalAsBigDecimalField FIELD_NAME =
    factory.getPackedDecimalAsBigDecimalField(precision, scale, signed);

// Char fields (use StringField with length 1)
private static final StringField CHAR_FIELD = factory.getStringField(1);

// Date fields
private static final StringField DATE_FIELD = factory.getStringField(10);
private static final DateTimeFormatter DATE_FORMAT =
    DateTimeFormatter.ofPattern("yyyy-MM-dd");
```

### 5. SIZE Constant

```java
protected static final int SIZE = factory.getOffset();
```

**Purpose:** Provides the total byte size of the serialized record. Use `protected` so subclasses and other serializers in the same package can access it.

### 6. Required Methods

#### numBytes()

```java
@Override
public int numBytes() {
    return SIZE;
}
```

Returns the minimum number of bytes required for a fixed-size record.

#### numBytesFor() - For Variable-Length Records Only

```java
@Override
public int numBytesFor(final Target obj) {
    return numBytes() + obj.getNumItems() * ITEM_FIELD.getByteLength();
}
```

**When to implement:**

- Only for records with variable-length arrays
- Fixed-size records inherit default implementation from interface

#### toBytes()

```java
@Override
public byte[] toBytes(byte[] bytes, int offset, final Target obj) {
    bytes = padToSize(bytes, offset, numBytesFor(obj));

    // Serialize primitive fields
    FIELD_NAME.putString(obj.getFieldName(), bytes, offset);
    INT_FIELD.putInt(obj.getIntValue(), bytes, offset);

    // Serialize nested objects (composite pattern)
    NESTED_SERIALIZER.toBytes(bytes, NESTED_OFFSET + offset, obj.getNested());

    // Serialize variable-length arrays
    for (int i = 0; i < obj.getNumItems(); i++) {
        ITEM_FIELD.putLong(obj.getItems().get(i), bytes, offset);
        offset += ITEM_FIELD.getByteLength();
    }

    return bytes;
}
```

#### fromBytes()

```java
@Override
public Target fromBytes(byte[] bytes, int offset) {
    bytes = padToSize(bytes, offset, numBytes());
    Target obj = new Target();

    // Deserialize primitive fields
    obj.setFieldName(FIELD_NAME.getString(bytes, offset).trim());
    obj.setIntValue(INT_FIELD.getInt(bytes, offset));

    // Deserialize nested objects
    obj.setNested(NESTED_SERIALIZER.fromBytes(bytes, NESTED_OFFSET + offset));

    // Deserialize variable-length arrays
    int numItems = NUM_ITEMS.getInt(bytes, offset);
    obj.getItems().clear();
    for (int i = 0; i < numItems; i++) {
        obj.getItems().add(ITEM_FIELD.getLong(bytes, offset));
        offset += ITEM_FIELD.getByteLength();
    }

    return obj;
}
```

## Offset Management

**Critical Principle:** The `CobolDatatypeFactory` tracks field positions automatically.

### For Fixed-Length Fields

Pass the **SAME** offset to all field methods:

```java
FIRST_NAME.putString(person.getFirstName(), bytes, offset);
LAST_NAME.putString(person.getLastName(), bytes, offset);
AGE.putInt(person.getAge(), bytes, offset);
```

The factory internally adds each field's position to the offset.

### For Nested Serializers

Manually adjust offset using the stored offset constant:

```java
// During field definition
private static final HomeAddressSerializer HOME_ADDRESS = new HomeAddressSerializer();
private static final int HOME_ADDRESS_OFFSET = factory.getOffset();
static { factory.incrementOffset(HomeAddressSerializer.SIZE); }

// During serialization
HOME_ADDRESS.toBytes(bytes, HOME_ADDRESS_OFFSET + offset, person.getHomeAddress());
```

### For Variable-Length Arrays

Use `factory.pushOffset()` and `factory.popOffset()` to mark the array position, then manually increment offset in loops:

```java
// During field definition
private static final ExternalDecimalAsIntField NUM_PHONE_NUMBERS =
    factory.getExternalDecimalAsIntField(1, false);
static { factory.pushOffset(); }
private static final ExternalDecimalAsLongField PHONE_NUMBERS =
    factory.getExternalDecimalAsLongField(10, false);
static { factory.popOffset(); }

// During serialization
NUM_PHONE_NUMBERS.putInt(person.getNumPhoneNumbers(), bytes, offset);
for (int i = 0; i < person.getNumPhoneNumbers(); i++) {
    PHONE_NUMBERS.putLong(person.getPhoneNumbers().get(i), bytes, offset);
    offset += PHONE_NUMBERS.getByteLength();
}
```

## Field Method Signatures

**Critical:** Field methods are INSTANCE methods with specific parameter order.

### Serialization (put methods)

```java
field.putString(value, bytes, offset)    // value FIRST, bytes SECOND, offset THIRD
field.putInt(value, bytes, offset)
field.putLong(value, bytes, offset)
field.putBigDecimal(value, bytes, offset)
```

### Deserialization (get methods)

```java
String value = field.getString(bytes, offset).trim()  // Always trim() strings
int value = field.getInt(bytes, offset)
long value = field.getLong(bytes, offset)
BigDecimal value = field.getBigDecimal(bytes, offset)
```

## Complete Example: PersonSerializer

```java
package com.example.beautifuljava.infrastructure.serialization.implementation;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;

import com.ibm.jzos.fields.CobolDatatypeFactory;
import com.ibm.jzos.fields.ExternalDecimalAsIntField;
import com.ibm.jzos.fields.ExternalDecimalAsLongField;
import com.ibm.jzos.fields.StringField;

import com.example.beautifuljava.implementation.HomeAddress;
import com.example.beautifuljava.implementation.Person;
import com.example.beautifuljava.infrastructure.serialization.ByteArraySerializer;

/**
 * Serializes a {@link com.example.beautifuljava.implementation.Person} object
 * to and from COBOL-format byte arrays.
 *
 * @see "PERSON record at DEMOAPP.cbl:24"
 */
public class PersonSerializer implements ByteArraySerializer<Person> {
    private static CobolDatatypeFactory factory = new CobolDatatypeFactory();
    static {
        factory.setStringTrimDefault(true);
        factory.setStringEncoding(encoding.name());
    }

    private static final StringField FIRST_NAME = factory.getStringField(5);
    private static final StringField LAST_NAME = factory.getStringField(10);
    private static final StringField DATE_OF_BIRTH = factory.getStringField(10);
    private static final DateTimeFormatter DATE_OF_BIRTH_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final HomeAddressSerializer HOME_ADDRESS = new HomeAddressSerializer();
    private static final int HOME_ADDRESS_OFFSET = factory.getOffset();
    static { factory.incrementOffset(HomeAddressSerializer.SIZE); }
    private static final ExternalDecimalAsIntField NUM_PHONE_NUMBERS = factory.getExternalDecimalAsIntField(1, false);
    static { factory.pushOffset(); }
    private static final ExternalDecimalAsLongField PHONE_NUMBERS = factory.getExternalDecimalAsLongField(10, false);
    static { factory.popOffset(); }
    protected static final int SIZE = factory.getOffset();

    @Override
    public int numBytes() {
        return SIZE;
    }

    @Override
    public int numBytesFor(final Person person) {
        return numBytes() + person.getNumPhoneNumbers() * PHONE_NUMBERS.getByteLength();
    }

    @Override
    public byte[] toBytes(byte[] bytes, int offset, final Person person) {
        bytes = padToSize(bytes, offset, numBytesFor(person));
        FIRST_NAME.putString(person.getFirstName(), bytes, offset);
        LAST_NAME.putString(person.getLastName(), bytes, offset);
        DATE_OF_BIRTH.putString(DATE_OF_BIRTH_FORMAT.format(person.getDateOfBirth()), bytes, offset);
        HOME_ADDRESS.toBytes(bytes, HOME_ADDRESS_OFFSET + offset, person.getHomeAddress());
        NUM_PHONE_NUMBERS.putInt(person.getNumPhoneNumbers(), bytes, offset);
        for (int i = 0; i < person.getNumPhoneNumbers(); i++) {
            PHONE_NUMBERS.putLong(person.getPhoneNumbers().get(i), bytes, offset);
            offset += PHONE_NUMBERS.getByteLength();
        }
        return bytes;
    }

    @Override
    public Person fromBytes(byte[] bytes, int offset) {
        bytes = padToSize(bytes, offset, numBytes());
        Person person = new Person();
        person.setFirstName(FIRST_NAME.getString(bytes, offset));
        person.setLastName(LAST_NAME.getString(bytes, offset));
        person.setDateOfBirth(LocalDate.parse(DATE_OF_BIRTH.getString(bytes, offset), DATE_OF_BIRTH_FORMAT));
        person.setHomeAddress(HOME_ADDRESS.fromBytes(bytes, HOME_ADDRESS_OFFSET + offset));
        int numPhoneNumbers = NUM_PHONE_NUMBERS.getInt(bytes, offset);
        person.getPhoneNumbers().clear();
        for (int i = 0; i < numPhoneNumbers; i++) {
            person.getPhoneNumbers().add(PHONE_NUMBERS.getLong(bytes, offset));
            offset += PHONE_NUMBERS.getByteLength();
        }
        return person;
    }
}
```

## Critical Rules Summary

### ✅ ALWAYS

- Implement `ByteArraySerializer` interface (use `implements`, NOT `extends`)
- Use IBM-1047 (EBCDIC) encoding
- Create all fields via `CobolDatatypeFactory`
- Configure factory in static block with encoding
- Use `ExternalDecimalAsIntField` for int (NOT `IntField`)
- Use `ExternalDecimalAsLongField` for long (NOT `LongField`)
- Use `PackedDecimalAsBigDecimalField` for decimal
- Use `StringField` with length 1 for char types
- Pass same offset to all field methods for fixed-length fields
- Manually adjust offset for nested serializers and variable-length arrays
- Call `trim()` on deserialized strings
- Add null checks in `toBytes()` method
- Use `@Override` annotations on interface methods
- Define `SIZE` constant as `protected static final`

### ❌ NEVER

- Use `extends ByteArraySerializer` (it's an interface)
- Use UTF-8 encoding (must be IBM-1047)
- Use `String.getBytes()` or `new String(bytes)` (use field methods)
- Use `System.arraycopy()` for string data (use field methods)
- Create fields without `CobolDatatypeFactory`
- Use static methods on Field classes (they're instance methods)
- Use wrong parameter order: `field.putString(value, bytes, offset)` NOT `field.putString(bytes, offset, value)`
- Use `IntField` or `LongField` (they don't exist)
- Use `PackedDecimalField` directly (use `PackedDecimalAsBigDecimalField`)
- Use `CharField` (use `StringField` with length 1)
- Generate serializers as inner classes (must be separate files)
- Skip `padToSize()` calls in `toBytes()` and `fromBytes()`
- Forget to increment offset in variable-length array loops

## Field Type Reference

| Java Type  | Factory Method                                                        | Put Method                                          | Get Method                                             |
| ---------- | --------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| String     | `factory.getStringField(length)`                                      | `putString(value, bytes, offset)`                   | `getString(bytes, offset).trim()`                      |
| char       | `factory.getStringField(1)`                                           | `putString(String.valueOf(value), bytes, offset)`   | `getString(bytes, offset).trim().charAt(0)`            |
| int        | `factory.getExternalDecimalAsIntField(length, signed)`                | `putInt(value, bytes, offset)`                      | `getInt(bytes, offset)`                                |
| long       | `factory.getExternalDecimalAsLongField(length, signed)`               | `putLong(value, bytes, offset)`                     | `getLong(bytes, offset)`                               |
| BigDecimal | `factory.getPackedDecimalAsBigDecimalField(precision, scale, signed)` | `putBigDecimal(value, bytes, offset)`               | `getBigDecimal(bytes, offset)`                         |
| LocalDate  | `factory.getStringField(10)` + `DateTimeFormatter`                    | `putString(formatter.format(value), bytes, offset)` | `LocalDate.parse(getString(bytes, offset), formatter)` |

## Package Structure

Serializers should be generated in:

```java
com.ibm.bobz.infrastructure.serialization.implementation
```

Or as specified in the generation prompt.
