---
name: static-utility-class-or-interface-generation
description: Reference guide for generating specific static utility classes and interfaces (Settable, Lists, ByteArraySerializer, ByteArraySerializable, ZFileSerializer, ZFileSerializable) as requested in user prompts. Provides exact specifications for each class including interface definitions, default methods, and proper Java generics usage. Only generate the classes explicitly requested by the user.
---

# Static Utility Class Generation Skill

This skill provides reference specifications for generating static utility classes and interfaces that support COBOL-to-Java transformations. **Generate only the specific classes and interfaces requested in the user prompt** - this is a reference guide, not a directive to generate all classes.

## When to Use This Skill

Use this skill when the user explicitly requests generation of one or more infrastructure classes or interfaces:

- User asks to generate a specific utility class or interface
- User requests infrastructure classes or interfaces by name for their transformation project
- User needs reference specifications for implementing a particular class or interface
- Reviewing or validating a specific infrastructure class or interface implementation

**Important**: Only generate the classes and interfaces explicitly mentioned in the user's request. Do not generate all classes and interfaces automatically.

## Available Class and Interface Specifications

This skill provides specifications for six infrastructure classes/interfaces. Refer to the relevant section based on what the user requested:

1. **Settable** - Enables object overwriting while maintaining identity
2. **Lists** - Provides list resizing utilities for ODO (Occurs Depending On) tables
3. **ByteArraySerializer** - Interface for COBOL-format binary serialization
4. **ByteArraySerializable** - Interface for objects that can be serialized
5. **ZFileSerializer** - Extends ByteArraySerializer for z/OS file I/O
6. **ZFileSerializable** - Interface for objects that can read/write z/OS files

## Specifications

### Important Notes Before Generation

- **Package Location**: Use the package specified in the user prompt. If not provided, look for existing infrastructure classes in the codebase to determine the appropriate package.
- **Imports**: Import dependencies from their actual locations in the codebase, not hardcoded paths.
- **Generate Only What's Requested**: Only create the specific class(es) and interface(s) the user asks for.

## 1. Settable Interface

### Purpose

Allows overwriting an object while maintaining its existing references and object identity, matching COBOL's value semantics.

```java
package <PACKAGE_LOCATION_FROM_THE_PROMPT>;

/**
 * Allows overwriting an object while maintaining its existing references and object identity.
 *
 * @param <T> class implementing {@code Settable}.
 */
public interface Settable<T> {
    /**
     * Overwrite {@code this} with a shallow copy of {@code that}.
     * Prefer {@code that.clone()} if a deep copy is required.
     * If {@code that} is a subclass of {@code this}, will not write the subclass fields.
     *
     * @param that the object to copy from
     */
    void set(T that);
}
```

### Key Rules

- **Package Name and Imports** - Should be given in the User Prompt. Otherwise, find the relevant class or interface in infrastructure directory

## 2. Lists Utility Class

### Purpose

Provides utility methods for resizing lists, essential for COBOL ODO (Occurs Depending On) table translations.

### Class Definition

```java
package <PACKAGE_LOCATION_FROM_THE_PROMPT>;

import java.util.List;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Utility methods for list operations, particularly resizing for COBOL ODO tables.
 */
public class Lists {
    /**
     * Resizes {@code list} to contain {@code n} elements, by truncating or
     * filling in from {@code elements}.
     * {@code list} must be non-null and support {@link java.util.List#remove(int)}.
     *
     * @param <T> the type of elements in the list
     * @param list the list to resize
     * @param n the target size
     * @param elements supplier of elements to add when growing the list
     */
    public static <T> void resize(List<T> list, int n, Supplier<? extends T> elements) {
        for (int i = list.size() - 1; i >= n; i--) {
            list.remove(i);
        }
        for (int j = list.size(); j < n; j++) {
            list.add(elements.get());
        }
    }

    /**
     * Creates and populates a new list.
     *
     * @param <T> the type of elements in the list
     * @param builder creates the new list
     * @param n number of elements to fill
     * @param elements elements to fill list with, in order
     *
     * @return a new list from {@code builder} containing {@code n} elements
     *         drawn from {@code elements}
     */
    public static <T> List<T> create(Supplier<? extends List<T>> builder, int n, Supplier<? extends T> elements) {
        return Stream.generate(elements)
            .limit(n)
            .collect(Collectors.toCollection(builder));
    }
}
```

### Key Rules

- **Package Name and Imports** - Should be given in the User Prompt. Otherwise, find the relevant class or interface in infrastructure directory
- **Static Methods Only** - No instance methods or state
- **Generic Type Parameters** - Use `<T>` for type safety
- **Supplier Pattern** - Use `Supplier<? extends T>` for element creation

## 3. ByteArraySerializer Interface

### Purpose

Defines serialization contract for converting objects to/from COBOL-format binary representation.

### Interface Definition

```java
package <PACKAGE_LOCATION_FROM_THE_PROMPT>;

import java.nio.charset.Charset;
import java.util.Arrays;

/**
 * Serializes an object to and from COBOL-format binary representation
 *
 * @param <T> type of object to serialize
 */
public interface ByteArraySerializer<T extends ByteArraySerializable<T>> {
    /** String encoding used by the COBOL program */
    Charset encoding = Charset.forName("IBM-1047");

    /**
     * The minimum number of bytes required for a COBOL-format byte array
     * representing an object of type {@code T}
     *
     * @return the minimum byte array size
     */
    int numBytes();

    /**
     * The number of bytes required for a COBOL-format byte array representing
     * {@code obj}.
     * For fixed-size COBOL records, equivalent to {@link #numBytes()}, may be
     * larger for variable-size records.
     *
     * @param obj the object to measure
     * @return the byte array size needed for this specific object
     */
    default int numBytesFor(final T obj) {
        return numBytes();
    }

    /**
     * Retrieves a COBOL-format byte array representation of {@code obj}
     *
     * @param bytes preallocated byte array to store the object serialization
     * @param offset offset in the byte array where serialization should begin
     * @param obj object to serialize
     *
     * @return the byte array, updated with the newly-added data
     */
    byte[] toBytes(byte[] bytes, int offset, final T obj);

    /**
     * Retrieves a COBOL-format byte array representation of {@code obj},
     * starting at the beginning of the array
     *
     * @param bytes preallocated byte array to store the object serialization
     * @param obj object to serialize
     * @return the byte array, updated with the newly-added data
     *
     * @see #toBytes(byte[], int, Object)
     */
    default byte[] toBytes(byte[] bytes, final T obj) {
        return toBytes(bytes, 0, obj);
    }

    /**
     * Retrieves a COBOL-format byte array representation of {@code obj},
     * allocating a new array
     *
     * @param obj object to serialize
     * @return a new byte array containing the serialized object
     *
     * @see #toBytes(byte[], int, Object)
     */
    default byte[] toBytes(final T obj) {
        return toBytes(new byte[numBytesFor(obj)], obj);
    }

    /**
     * Retrieves a COBOL-format string representation of {@code obj}
     *
     * @param obj object to serialize
     * @return the result of {@link #toBytes(Object)} interpreted using {@link #encoding}
     */
    default String toByteString(final T obj) {
        return new String(toBytes(obj), encoding).stripTrailing();
    }

    /**
     * Creates a new object from a COBOL-format byte array
     *
     * @param bytes byte array to deserialize from; will be space-padded to
     *              length if necessary
     * @param offset offset in the byte array where deserialization should begin
     *
     * @return a new {@code T} object equivalent to the specified array slice
     */
    T fromBytes(byte[] bytes, int offset);

    /**
     * Creates a new object from a COBOL-format byte array, starting at the
     * beginning of the array
     *
     * @param bytes byte array to deserialize from
     * @return a new {@code T} object equivalent to the byte array
     *
     * @see #fromBytes(byte[], int)
     */
    default T fromBytes(byte[] bytes) {
        return fromBytes(bytes, 0);
    }

    /**
     * Creates a new object from a COBOL-format string.
     * The string is first converted to a byte array using {@link #encoding}.
     *
     * @param bytes string to deserialize from
     * @return a new {@code T} object equivalent to the string
     *
     * @see #fromBytes(byte[], int)
     */
    default T fromByteString(final String bytes) {
        return fromBytes(bytes.getBytes(encoding));
    }

    /**
     * Ensures a byte array has a provided minimum length
     *
     * @param bytes the byte array to pad
     * @param offset the offset of the start of the slice
     * @param size the minimum size of the slice of {@code bytes} at {@code offset}
     *
     * @return {@code bytes} if at least {@code offset + size} elements,
     *         otherwise a copied array with the remaining slots filled in with
     *         EBCDIC spaces
     */
    default byte[] padToSize(byte[] bytes, int offset, int size) {
        if (bytes.length < offset + size) {
            byte[] newBytes = Arrays.copyOf(bytes, offset + size);
            Arrays.fill(newBytes, bytes.length, offset + size, (byte)0x40 /*default EBCDIC space character*/);
            return newBytes;
        }
        return bytes;
    }
}
```

### Key Rules

- **Package Name and Imports** - Should be given in the User Prompt. Otherwise, find the relevant class or interface in infrastructure directory
- **Static Charset** - Single `encoding` field prevents duplication
- **Default Methods** - Provide convenience overloads with defaults
- **EBCDIC Padding** - Use `0x40` for space character in EBCDIC
- **Generic Constraint** - `T extends ByteArraySerializable<T>` ensures compatibility
- **No Final Methods** - Java interfaces cannot have `final` methods

## 4. ByteArraySerializable Interface

### Purpose

Marks objects that can be serialized to/from COBOL binary format, providing cleaner `copyFrom()` API.

### Interface Definition

```java
package <PACKAGE_LOCATION_FROM_THE_PROMPT>;

import <PACKAGE_LOCATION_OF_SETTABLE>.Settable;

/**
 * Type that can be serialized to and from a COBOL-format binary representation
 *
 * @param <T> class implementing {@code ByteArraySerializable}
 */
public interface ByteArraySerializable<T extends ByteArraySerializable<T>> extends Settable<T> {
    /**
     * Gets the serialization object for this type
     *
     * @return the serializer for this type
     */
    ByteArraySerializer<T> serializer();

    /**
     * Updates the fields of this object from a COBOL-format byte array
     *
     * @param bytes byte array to deserialize from
     *
     * @see ByteArraySerializer#fromBytes(byte[])
     */
    default void copyFrom(byte[] bytes) {
        set(serializer().fromBytes(bytes));
    }

    /**
     * Updates the fields of this object from a COBOL-format string
     *
     * @param bytes string to deserialize from
     *
     * @see ByteArraySerializer#fromByteString(String)
     */
    default void copyFrom(final String bytes) {
        set(serializer().fromByteString(bytes));
    }

    /**
     * Updates the fields of this object from a {@code ByteArraySerializable}
     * object by serializing and deserializing to the COBOL representation
     *
     * @param <S> the base serializable type
     * @param <U> the actual type (subclass of S)
     * @param that the object to copy from
     *
     * @see ByteArraySerializer#toBytes(Object)
     * @see #copyFrom(byte[])
     */
    default <S extends ByteArraySerializable<S>, U extends S> void copyFrom(final U that) {
        copyFrom(that.serializer().toBytes(that));
    }
}
```

### Key Rules

- **Package Name and Imports** - Should be given in the User Prompt. Otherwise, find the relevant class or interface in infrastructure directory
- **Extends Settable** - Inherits `set()` method for value semantics
- **Serializer Access** - Requires `serializer()` method implementation
- **Generic Overload** - `<S, U extends S>` allows subclass serialization
- **Type Erasure Limitation** - Cannot add more templated `copyFrom()` overloads

## 5. ZFileSerializer Interface

### Purpose

Extends ByteArraySerializer with z/OS file I/O operations using JZOS.

### Interface Definition

```java
package <PACKAGE_LOCATION_FROM_THE_PROMPT>;

import java.io.EOFException;

import com.ibm.jzos.ZFile;
import com.ibm.jzos.ZFileException;

/**
 * Serializes an object to and from z/OS file
 *
 * @param <T> type of object to serialize
 */
public interface ZFileSerializer<T extends ZFileSerializable<T>> extends ByteArraySerializer<T> {
    /**
     * Writes {@code obj} to {@code file}
     *
     * @param file the z/OS file to write to
     * @param obj the object to write
     *
     * @throws ZFileException on I/O error
     *
     * @see com.ibm.jzos.ZFile#write(byte[])
     */
    default void toFile(ZFile file, final T obj) throws ZFileException {
        file.write(toBytes(obj));
    }

    /**
     * Reads a new object from {@code file}
     *
     * @param file the z/OS file to read from
     * @return a new object read from the file
     *
     * @throws ZFileException on I/O error
     * @throws EOFException on unexpected end-of-file
     *
     * @see com.ibm.jzos.ZFile#read(byte[])
     */
    default T fromFile(ZFile file) throws ZFileException, EOFException {
        byte[] bytes = new byte[numBytes()];
        if (file.read(bytes) == -1) {
            throw new EOFException();
        }
        return fromBytes(bytes);
    }
}
```

### Key Rules

- **Package Name and Imports** - Should be given in the User Prompt. Otherwise, find the relevant class or interface in infrastructure directory
- **Extends ByteArraySerializer** - Inherits all byte array methods
- **JZOS Integration** - Uses `com.ibm.jzos.ZFile` for z/OS I/O
- **Exception Handling** - Throws `ZFileException` and `EOFException`
- **Generic Constraint** - `T extends ZFileSerializable<T>` for type safety

## 6. ZFileSerializable Interface

### Purpose

Marks objects that can be read from and written to z/OS files.

### Interface Definition

```java
package <PACKAGE_LOCATION_FROM_THE_PROMPT>;

import java.io.EOFException;
import com.ibm.jzos.ZFile;
import com.ibm.jzos.ZFileException;

/**
 * Type that can be serialized to and from a z/OS file
 *
 * @param <T> class implementing {@code ZFileSerializable}
 */
public interface ZFileSerializable<T extends ZFileSerializable<T>> extends ByteArraySerializable<T> {

    /**
     * Gets the z/OS file serialization object for this type
     *
     * @return the z/OS file serializer for this type
     */
    @Override
    ZFileSerializer<T> serializer();

    /**
     * Writes this object to a z/OS file
     *
     * @param file the z/OS file to write to
     *
     * @throws ZFileException on I/O error
     *
     * @see ZFileSerializer#toFile(ZFile, Object)
     */
    default void writeTo(ZFile file) throws ZFileException {
        serializer().toFile(file, (T)this);
    }

    /**
     * Reads this object from a z/OS file
     *
     * @param file the z/OS file to read from
     * @return the number of bytes read, or {@code -1} if end of file reached
     *
     * @throws ZFileException on I/O error
     *
     * @see ZFileSerializer#fromFile(ZFile)
     */
    default int readFrom(ZFile file) throws ZFileException {
        byte[] bytes = new byte[serializer().numBytes()];
        int ret = file.read(bytes);
        if ( ret == -1 ) {
            return -1;
        }
        set(serializer().fromBytes(bytes));
        return ret;
    }
}
```

### Key Rules

- **Package Name and Imports** - Should be given in the User Prompt. Otherwise, find the relevant class or interface in infrastructure directory
- **Extends ByteArraySerializable** - Inherits byte array and `copyFrom()` methods
- **Override serializer()** - Returns `ZFileSerializer<T>` instead of `ByteArraySerializer<T>`
- **Cast Required** - `(T)this` cast needed in `writeTo()` for type safety
- **Exception Handling** - Propagates JZOS exceptions

## Validation Checklist

### Settable Interface

- [ ] Generic type parameter: `<T>`
- [ ] Single method: `void set(T that)`
- [ ] Proper Javadoc with identity preservation note

### Lists Utility Class

- [ ] Two static methods: `resize()` and `create()`
- [ ] Generic type parameters on methods
- [ ] Proper use of `Supplier<? extends T>`
- [ ] Stream API usage in `create()`

### ByteArraySerializer Interface

- [ ] Generic constraint: `<T extends ByteArraySerializable<T>>`
- [ ] Static `encoding` field: `Charset.forName("IBM-1047")`
- [ ] Required methods: `numBytes()`, `toBytes()`, `fromBytes()`
- [ ] Default methods with proper delegation
- [ ] EBCDIC space padding: `0x40`

### ByteArraySerializable Interface

- [ ] Extends: `Settable<T>`
- [ ] Generic constraint: `<T extends ByteArraySerializable<T>>`
- [ ] Required method: `ByteArraySerializer<T> serializer()`
- [ ] Three `copyFrom()` overloads with default implementations
- [ ] Proper generic type parameters on templated `copyFrom()`

### ZFileSerializer Interface

- [ ] Extends: `ByteArraySerializer<T>`
- [ ] Generic constraint: `<T extends ZFileSerializable<T>>`
- [ ] JZOS imports: `com.ibm.jzos.ZFile`, `com.ibm.jzos.ZFileException`
- [ ] Methods: `toFile()` and `fromFile()` with proper exceptions

### ZFileSerializable Interface

- [ ] Extends: `ByteArraySerializable<T>`
- [ ] Generic constraint: `<T extends ZFileSerializable<T>>`
- [ ] Override: `ZFileSerializer<T> serializer()`
- [ ] Methods: `writeTo()` and `readFrom()` with proper exceptions
- [ ] Cast in `writeTo()`: `(T)this`
