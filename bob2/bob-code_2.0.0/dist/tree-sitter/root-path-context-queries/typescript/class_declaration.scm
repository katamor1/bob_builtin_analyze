;---------------------------------------------------------------------------------------------
;
; IBM Confidential
; PID 5900-BVU 
; Copyright IBM Corp. 2025
;
;---------------------------------------------------------------------------------------------
;
; From: github.com/continuedev/continue
; Licensed under the Apache 2 license: http://www.apache.org/licenses/LICENSE-2.0
;
; Match a class declaration that extends a base class
; Returns:
;   @base-class: The identifier of the base class being extended
;   @generic_argument: The type identifier of the generic argument, if present
(class_declaration
    (class_heritage
        (extends_clause
            (identifier) @base-class
            (type_arguments
                (type_identifier) @generic_argument
            )?
        )
    )
)

; Match a class declaration that implements an interface
; Returns:
;   @interface: The type identifier of the interface being implemented
(
    (class_declaration
        (class_heritage
            (implements_clause
                (type_identifier) @interface
            )
        )
    )
)

; Match a class declaration that implements a generic interface
; Returns:
;   @interface: The type identifier of the generic interface being implemented
;   @generic_argument: The type identifier of the generic argument
(
  class_declaration
  (class_heritage
    (implements_clause
      (generic_type
        (type_identifier) @interface
        (type_arguments
          (type_identifier) @generic_argument
        )
      )
    )
  )
)