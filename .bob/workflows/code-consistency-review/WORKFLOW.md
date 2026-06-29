---
schemaVersion: workflow-register/v1
name: code-consistency-review
description: Pre-review code changes against requirements, design, and test specifications.
title: Code Consistency Pre-Review
category: code-review
mode: agent
todo: true
todoRequired: true
todoAsSteps: true
stepCompletion: manual
stepMessage: step
permissions:
  - read
  - mcp
  - skill
  - todo
autoApproval: true
workspaceRequired: true
requires:
  workspace: true
  bob:
    minVersion: "2.0.0"
  files:
    - review-input.yaml
guardrails:
  allowedCommands:
    - bobCodeConsistency.preprocess
    - bobCodeConsistency.captureBobOutput
    - bobCodeConsistency.validateOutput
    - bobCodeConsistency.triage
  deniedCommands:
    - shell
    - file.writeOutsideBob
  requireApproval:
    - id: large-review-package
      when: ".bob-review/review-package/bob-input.md is too large for one review pass"
      message: Split the review package and run this workflow per slice.
inputs:
  reviewInputPath:
    type: string
    title: review-input.yaml
    default: review-input.yaml
  reviewPackagePath:
    type: string
    title: Review package path
    default: .bob-review/review-package
  bobOutputPath:
    type: string
    title: Bob output YAML path
    default: .bob-review/bob-output/bob-output.yaml
  triagePath:
    type: string
    title: Human triage path
    default: .bob-review/human-triage
tools:
  bobCodeConsistency.preprocess:
    purpose: Generate the review package and bob-input.md.
    required: true
    outputKey: reviewPackage
    failurePolicy: stop
  bobCodeConsistency.captureBobOutput:
    purpose: Capture the previous Bob YAML output to .bob-review/bob-output/bob-output.yaml.
    required: true
    outputKey: captureResult
    inputSource: state
    failurePolicy: stop
  bobCodeConsistency.validateOutput:
    purpose: Validate Bob YAML output against schema and package evidence.
    required: true
    outputKey: validationResult
    failurePolicy: stop
  bobCodeConsistency.triage:
    purpose: Generate human triage files.
    required: true
    outputKey: triageResult
    failurePolicy: stop
artifacts:
  - id: reviewPackage
    producedBy: preprocess-review-package
    path: .bob-review/review-package
  - id: bobInput
    producedBy: preprocess-review-package
    path: .bob-review/review-package/bob-input.md
  - id: bobOutput
    producedBy: capture-bob-output
    path: .bob-review/bob-output/bob-output.yaml
    schema: docs/workflows/code-consistency-review/schemas/bob-output.schema.json
  - id: triage
    producedBy: human-triage
    path: .bob-review/human-triage
completion:
  summary: markdown
  includeArtifacts: true
  validateResult: true
  visualization:
    type: mermaid
    enabled: false
steps:
  - id: preprocess-review-package
    title: Generate review-package and bob-input.md.
    type: command
    action:
      provider: bobCodeConsistency.preprocess
    prompt: |
      Generate the review package from review-input.yaml. Stop if the command reports validation errors or missing source documents.
    sendResult: true
    resultKey: reviewPackage
    maxResultBytes: 20000
    required: true
    completeOnSuccess: true
  - id: run-bob-pre-review
    title: Run the consistency pre-review from bob-input.md.
    type: agent
    required: true
    includeState:
      - reviewPackage
    stateRequired: true
    resultKey: bobReviewResult
    maxResultBytes: 40000
    prompt: |
      Read .bob-review/review-package/bob-input.md and perform only the pre-review defined there.

      Your role is to find evidence-backed inconsistency candidates and human follow-up questions across requirements, basic design, detailed design, test specifications, ledgers, tickets, and changed code.

      Hard constraints:
      - Do not give final approval.
      - Do not state that the change is fully covered.
      - Do not treat missing evidence as proof of correctness.
      - Every finding must include concrete evidence from the package.
      - If evidence is weak, output a question rather than a finding.

      Return YAML that matches docs/workflows/code-consistency-review/schemas/bob-output.schema.json. The final_approval value must be not_performed.
  - id: capture-bob-output
    title: Capture Bob YAML output.
    type: command
    action:
      provider: bobCodeConsistency.captureBobOutput
    includeState:
      - bobReviewResult
    stateRequired: true
    prompt: |
      Save the previous Bob YAML output to .bob-review/bob-output/bob-output.yaml.
    sendResult: true
    resultKey: captureResult
    maxResultBytes: 10000
    required: true
    completeOnSuccess: true
  - id: validate-bob-output
    title: Validate Bob YAML output.
    type: command
    action:
      provider: bobCodeConsistency.validateOutput
    prompt: |
      Validate the captured Bob YAML output against the schema and evidence-index.json. Do not continue while validation errors remain.
    sendResult: true
    resultKey: validationResult
    maxResultBytes: 20000
    required: true
    completeOnSuccess: true
  - id: human-triage
    title: Generate human triage files.
    type: command
    action:
      provider: bobCodeConsistency.triage
    prompt: |
      Generate triage-result.yaml, accepted-findings.md, rejected-findings.md, questions-to-author.md, and follow-up-actions.md.
    sendResult: true
    resultKey: triageResult
    maxResultBytes: 20000
    required: true
    completeOnSuccess: true
  - id: handoff-formal-review
    title: Prepare the formal review handoff.
    type: agent
    required: true
    includeState:
      - reviewPackage
      - validationResult
      - triageResult
    stateRequired: true
    prompt: |
      Prepare a concise Markdown handoff for the formal human review.

      Include:
      - review target and package path
      - accepted pre-review finding candidates
      - author questions
      - validation errors or warnings, if any
      - missing tests or document update gaps
      - explicit note that Bob did not approve the change

      Keep the output as a handoff summary, not a final review decision.
---
# Code Consistency Pre-Review

## Goal

Run a structured pre-review for code changes against requirements, design, and test specifications.

This workflow operationalizes `docs/workflows/code-consistency-review/` and keeps Bob in an assistive role. Bob may raise evidence-backed candidates and questions, but final interpretation, approval, and risk acceptance stay with the human reviewer.
