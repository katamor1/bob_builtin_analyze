---
name: bazaar-project-rule-review
description: Review a Bazaar revision or range against project-specific rules.
title: Bazaar Project Rule Review
mode: agent
todo: true
todoSource: markdown
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
command: bobBazaar.openReviewGui
---
# Bazaar Project Rule Review

## Goal

Review the selected Bazaar revision or range using project-specific review rules.

## Todo

- [ ] review-input: Confirm the target Bazaar revision or revision range.
- [ ] collect-context: Collect Bazaar diff and changed-file context.
- [ ] load-rules: Load `.bob/review/checklist.json` and the review result schema.
- [ ] analyze-changes: Analyze the changes against project-specific rules.
- [ ] output-result: Produce review-result JSON and a Markdown checklist.

## Instructions

Create a Todo list from the `Todo` section first, then work through each item in order. Do not mark a Todo item complete until the corresponding work is actually done.

## Step: review-input

```workflow-step
command: bobBazaar.openReviewGui
sendResult: false
required: true
completeOnSuccess: false
```

Confirm the target Bazaar revision or revision range.

## Step: collect-context

```workflow-step
command: bobBazaar.collectReviewContext
sendResult: true
required: true
completeOnSuccess: false
```

Use the Bazaar review context returned by the command. Summarize revision metadata, changed files, and important diff areas.

## Step: load-rules

```workflow-step
command: bobBazaar.loadReviewRules
sendResult: true
required: true
completeOnSuccess: false
```

Load and apply the project review checklist and review result schema.
