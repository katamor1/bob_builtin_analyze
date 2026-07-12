---
schemaVersion: workflow-register/v1
name: ci-verification
description: Validate workflow contracts for the automatic-pause final source tree.
steps:
  - id: confirm
    title: Confirm contract
    type: manual
    userAction:
      message: Confirm the workflow contract test fixture.
      completeLabel: Confirm
---
# CI verification

This workflow exists only on the temporary verification branch.
