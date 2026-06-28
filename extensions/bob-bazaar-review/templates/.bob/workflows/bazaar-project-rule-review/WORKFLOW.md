---
schemaVersion: workflow-register/v1
name: bazaar-project-rule-review
description: Review a Bazaar revision or range against project-specific rules.
title: Bazaar Project Rule Review
category: code-review
mode: agent
todo: true
todoSource: yaml
todoRequired: true
todoAsSteps: true
stepCompletion: manual
stepMessage: step
todos:
  - review-input: Confirm the target Bazaar revision or revision range.
  - collect-context: Collect Bazaar diff and changed-file context.
  - load-rules: Load project checklist and review result schema.
  - analyze-changes: Analyze the changes against project-specific rules.
  - output-result: Produce review-result JSON and a Markdown checklist.
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
    - .bob/review/checklist.json
    - .bob/review/review-result.schema.json
    - .bob/skills/project-review-checklist/SKILL.md
inputs:
  revisionMode:
    type: select
    title: Review target
    required: true
    options:
      - singleRevision
      - revisionRange
      - workingTreeSinceRevision
  revision:
    type: string
    title: Revision
    requiredWhen: "inputs.revisionMode == 'singleRevision'"
  baseRevision:
    type: string
    title: Base revision
    requiredWhen: "inputs.revisionMode != 'singleRevision'"
  targetRevision:
    type: string
    title: Target revision
    requiredWhen: "inputs.revisionMode == 'revisionRange'"
preflight:
  - id: check-workspace
    title: Check Bob workspace and Bazaar repository
    required: true
    checks:
      - workspaceOpen
      - bazaarRepository
      - bobWorkspaceInitialized
    failurePolicy: stop
  - id: check-review-assets
    title: Check review checklist, schema, and skill files
    required: true
    files:
      - .bob/review/checklist.json
      - .bob/review/review-result.schema.json
      - .bob/skills/project-review-checklist/SKILL.md
    failurePolicy: stop
tools:
  bobBazaar.openReviewGui:
    purpose: Confirm the target Bazaar revision or range with the user.
    required: true
    failurePolicy: stop
  bobBazaar.collectReviewContext:
    purpose: Collect Bazaar revision metadata, changed files, and diff context.
    required: true
    outputKey: reviewContext
    failurePolicy: stop
  bobBazaar.loadReviewRules:
    purpose: Load project review checklist and review result JSON schema.
    required: true
    outputKey: reviewRules
    failurePolicy: stop
  bobBazaar.captureReviewResult:
    purpose: Validate and save final review-result JSON and Markdown summary.
    required: true
    inputSource: lastAssistant
    failurePolicy: stop
guardrails:
  allowedCommands:
    - bobBazaar.openReviewGui
    - bobBazaar.collectReviewContext
    - bobBazaar.loadReviewRules
    - bobBazaar.captureReviewResult
  deniedCommands:
    - shell
    - file.writeOutsideBob
  requireApproval:
    - id: large-review
      when: "reviewContext.changedFiles.count > 100"
      message: Large revision detected. Confirm whether to continue or split the review.
artifacts:
  - id: reviewContext
    producedBy: collect-context
    path: .bob/workflows/runs/{{run.id}}/review-context.json
  - id: reviewRules
    producedBy: load-rules
    path: .bob/workflows/runs/{{run.id}}/review-rules.json
  - id: reviewAnalysis
    producedBy: analyze-changes
    path: .bob/workflows/runs/{{run.id}}/review-analysis.md
  - id: reviewResult
    producedBy: output-result
    path: .bob/review/results/{{review_id}}.json
    schema: .bob/review/review-result.schema.json
completion:
  summary: markdown
  includeArtifacts: true
  validateResult: true
  visualization:
    type: mermaid
    enabled: false
---
# Bazaar Project Rule Review

## Goal

Review the selected Bazaar revision or range using project-specific review rules.

## Instructions

Create a Todo list from the workflow Todo definitions first, then work through each item in order.

## Step: review-input

```workflow-step
command: bobBazaar.openReviewGui
sendResult: false
required: true
completeOnSuccess: false
```

Confirm the target Bazaar revision or revision range. If the target is not known, ask the user to provide it before continuing.

## Step: collect-context

```workflow-step
command: bobBazaar.collectReviewContext
sendResult: true
resultKey: reviewContext
maxResultBytes: 20000
required: true
completeOnSuccess: true
```

Use the Bazaar review context returned by the command. Summarize revision metadata, changed files, and important diff areas. Use the Bazaar review packet already added to Bob context for full diff details.

## Step: load-rules

```workflow-step
command: bobBazaar.loadReviewRules
sendResult: true
resultKey: reviewRules
maxResultBytes: 20000
required: true
completeOnSuccess: true
```

Load and apply the project review checklist and review result schema. Identify which review categories are relevant to the current change.

## Step: analyze-changes

```workflow-step
includeState:
  - reviewContext
  - reviewRules
stateRequired: true
runAgent: true
resultKey: reviewAnalysis
maxResultBytes: 20000
```

Analyze the changes against the checklist. Focus on interface impact, error handling, regression risk, data compatibility, and missing tests.

## Step: output-result

```workflow-step
includeState:
  - reviewContext
  - reviewRules
  - reviewAnalysis
stateRequired: true
runAgent: true
captureResult: true
resultCommand: bobBazaar.captureReviewResult
```

Produce the final review-result JSON using the saved review analysis. Return exactly one fenced `json` code block and no other JSON-like object.

The JSON must match this shape:

Replace `<revision>` with the actual Bazaar revision or range before returning the JSON. Do not copy the placeholder literally.

```json
{
  "review_id": "bazaar-r<revision>-project-rule-review",
  "vcs": {
    "type": "bazaar",
    "repository": "<repository root>",
    "revision_mode": "singleRevision",
    "revision": "<revision>"
  },
  "checklist_results": [
    {
      "rule_id": "<checklist rule id>",
      "title": "<checklist rule title>",
      "status": "pass",
      "severity": "info",
      "confidence": "medium",
      "evidence": [
        {
          "file": "<path>",
          "summary": "<evidence summary>"
        }
      ],
      "reason": "<reason>"
    }
  ],
  "findings": [],
  "summary": {
    "pass": 0,
    "fail": 0,
    "unknown": 0,
    "not_applicable": 0,
    "blocked": 0
  }
}
```

After producing the JSON, the workflow validates it and saves `.bob/review/results/<review_id>.json` and `.bob/review/results/<review_id>.md` automatically.
