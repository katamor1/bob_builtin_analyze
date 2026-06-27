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
stepMessage: current
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
command: bobBazaar.openReviewGui
---
# Bazaar Project Rule Review

## Goal

Review the selected Bazaar revision or range using project-specific review rules.

## Instructions

Create a Todo list from the workflow Todo definitions first, then work through each item in order.
