---
schemaVersion: workflow-register/v1
name: bazaar-project-rule-review
description: Review a Bazaar revision or range against project-specific rules.
title: Bazaar Project Rule Review
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
steps:
  - id: review-input
    title: Confirm the target Bazaar revision or revision range.
    type: command
    action:
      provider: bobBazaar.openReviewGui
    prompt: |
      Confirm the target Bazaar revision or revision range. If the target is not known, ask the user to provide it before continuing.
    sendResult: false
    required: true
    completeOnSuccess: false
  - id: collect-context
    title: Collect Bazaar diff and changed-file context.
    type: command
    action:
      provider: bobBazaar.collectReviewContext
    prompt: |
      Use the Bazaar review context returned by the command. Summarize revision metadata, changed files, and important diff areas. Use the Bazaar review packet already added to Bob context for full diff details.
    sendResult: true
    resultKey: reviewContext
    maxResultBytes: 20000
    required: true
    completeOnSuccess: true
  - id: load-rules
    title: Load project checklist and review result schema.
    type: command
    action:
      provider: bobBazaar.loadReviewRules
    prompt: |
      Load and apply the project review checklist and review result schema. Identify which review categories are relevant to the current change.
    sendResult: true
    resultKey: reviewRules
    maxResultBytes: 20000
    required: true
    completeOnSuccess: true
  - id: analyze-changes
    title: Analyze the changes against project-specific rules.
    type: agent
    prompt: |
      Analyze the changes against the checklist. Focus on interface impact, error handling, regression risk, data compatibility, and missing tests.
    includeState:
      - reviewContext
      - reviewRules
    stateRequired: true
    resultKey: reviewAnalysis
    maxResultBytes: 20000
  - id: output-result
    title: Produce review-result JSON and a Markdown checklist.
    type: agent
    prompt: |
      Produce the final review-result JSON using the saved review analysis. Return exactly one fenced `json` code block and no other JSON-like object.

      The JSON must match this shape:

      Replace `<revision>` with the actual Bazaar revision or range before returning the JSON. Do not copy the placeholder literally.

      `checklist_results[].severity` must always be exactly one of `error`, `warning`, or `info`.
      Never put `N/A`, `not_applicable`, `none`, or any status value in `severity`.
      For `pass`, `unknown`, `not_applicable`, or `blocked` checklist results, use `info` unless there is a concrete issue. For `fail`, use the rule's `severity_on_fail`.

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
    includeState:
      - reviewContext
      - reviewRules
      - reviewAnalysis
    stateRequired: true
    result:
      source: agent
      sinks:
        - type: command
          command: bobBazaar.captureReviewResult
---
# Bazaar Project Rule Review

## Goal

Review the selected Bazaar revision or range using project-specific review rules.

## Instructions

Create a Todo list from the workflow step definitions first, then work through each item in order.
