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
(
  (function_declaration
    (parameter_list
      (parameter_declaration
        type: (_) @param_type
      )*
    )
    ; Optional return type node before the block
    ([_] @return_type)?
    (block)
  )
)