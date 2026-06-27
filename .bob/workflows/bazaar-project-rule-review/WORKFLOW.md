---
name: bazaar-project-rule-review
description: Review a Bazaar revision or range against project-specific rules.
title: Bazaar Project Rule Review
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
required: true
completeOnSuccess: false
```

Use the Bazaar review context returned by the command. Summarize revision metadata, changed files, and important diff areas. Use the Bazaar review packet already added to Bob context for full diff details.

## Step: load-rules

```workflow-step
command: bobBazaar.loadReviewRules
sendResult: true
required: true
completeOnSuccess: false
```

Load and apply the project review checklist and review result schema. Identify which review categories are relevant to the current change.

## Step: analyze-changes

Analyze the changes against the checklist. Focus on interface impact, error handling, regression risk, data compatibility, and missing tests.

## Step: output-result

Produce normalized review-result JSON, a Markdown checklist summary, and any unresolved questions that need human confirmation.
