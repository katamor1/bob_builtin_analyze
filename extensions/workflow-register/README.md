# Bob Workflow Register

`workflow-register` is a companion VSCode extension for IBM Bob. It scans workspace folders for workflow definitions under `.bob/workflows` and registers valid workflows with Bob at startup.

## Directory layout

The layout intentionally follows Bob Skills style: each workflow owns a directory and the workflow definition is stored in a single Markdown file.

```text
.bob/
  workflows/
    workflow-name/
      WORKFLOW.md
```

Only files matching this exact pattern are loaded:

```text
.bob/workflows/*/WORKFLOW.md
```

## Required front matter fields

`WORKFLOW.md` must start with YAML front matter. The required fields are deliberately close to `SKILL.md`:

| Field | Required | Description |
| --- | --- | --- |
| `name` | yes | Stable workflow name. Use letters, numbers, `.`, `_`, or `-`. |
| `description` | yes | Short description shown to Bob. |

The folder name should normally match `name`. A mismatch is reported as a warning but does not prevent registration.

## Optional fields

| Field | Default | Description |
| --- | --- | --- |
| `id` | `<sourceId>.<name>` | Full workflow id passed to Bob. |
| `title` / `label` | `name` | Display label. `label` wins over `title`. |
| `menuLabel` | label | Menu label shown by Bob. |
| `mode` | `agent` | Intended Bob mode. The value is exposed through `getMode()`. |
| `prompt` | Markdown body | Prompt sent when the workflow runs. Step sections are removed from the shared workflow instructions. |
| `command` | unset | VSCode command to execute after the prompt is sent. |
| `commandArgs` | `[]` | Simple list of command arguments. |
| `permissions` | `[read, mcp, skill]` or `[read, mcp, skill, todo]` | Bob approval permissions. `todo` is appended when Todo support is enabled. |
| `todo` | auto | Enables Todo wrapper prompt. Defaults to true when Todo items are found. |
| `todoSource` | `markdown` | Source of Todo items. Use `yaml` to read Todo items from front matter. |
| `todoRequired` | `false` | Fails validation when no Todo items are found. |
| `todoAsSteps` | auto | Converts Todo items into Bob workflow steps. Defaults to true when Todo items are found. |
| `stepCompletion` | `manual` for Todo steps, otherwise `auto` | `auto` completes each step immediately. `manual` keeps the active step open until a completion command is run. |
| `stepMessage` | `current` | Controls messages sent for Todo steps after the first one: `full`, `current`, `step`, or `silent`. |
| `autoCompleteSteps` | compatibility | Legacy field. `true` maps to `stepCompletion: auto`; `false` maps to `stepCompletion: manual` when `stepCompletion` is omitted. |
| `autoApproval` | `true` | Whether Bob auto-approval is enabled for the workflow. |
| `workspaceRequired` | `true` | Whether the workflow is enabled only when Bob supplies a workspace. |
| `hidden` | `false` | Whether the workflow should be hidden from Bob UI. |

The initial parser supports a small YAML subset: top-level scalar fields and simple lists.

## Todo section

When `todo: true` or Todo items are detected, the extension wraps the workflow body with a Todo-specific instruction before sending it to Bob.

Markdown Todo items use this shape:

```md
## Todo

- [ ] todo-id: Todo item text
- [ ] another-id: Another Todo item text
```

YAML Todo items use this shape:

```yaml
todoSource: yaml
todos:
  - todo-id: Todo item text
  - another-id: Another Todo item text
```

The id prefix is optional. When omitted, ids are generated as `todo-1`, `todo-2`, and so on.

When `todoAsSteps` is true, each Todo item is also converted into a Bob workflow step, so Bob's workflow Todo list shows one row per Todo item instead of a single workflow row.

For `stepCompletion: manual`, run `Workflow Step: Complete Current Step` or `Workflow Register: Complete Current Bob Workflow Step` to complete the active step and advance to the next one. `Workflow Register: Inspect Active Bob Workflow Steps` shows the active manual steps.

`stepMessage` controls messages after the first Todo step:

- `full`: sends workflow metadata and the current Todo item.
- `current`: sends only the current Todo item.
- `step`: sends the matching `## Step: todo-id` instructions. Missing Step sections fall back to `current`.
- `silent`: sends no extra message and advances the Todo list only.

## Step sections

When `stepMessage: step` is used, each Todo item can have a matching Markdown section. The following heading shapes are supported:

```md
## Step: todo-id

Instructions for this Todo step.

## Step todo-id

Instructions for this Todo step.
```

Step section ids should match Todo ids. Missing Step sections are reported as warnings during registration, but the workflow still registers.

## Example

```md
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
command: bobBazaar.openReviewGui
---
# Bazaar Project Rule Review

## Goal

Review the selected Bazaar revision or range using project-specific review rules.

## Instructions

Create a Todo list from the workflow Todo definitions first, then work through each item in order.

## Step: review-input

Confirm the target Bazaar revision or revision range. If the target is not known, ask the user to provide it before continuing.

## Step: collect-context

Use the Bazaar review packet already added to Bob context. Summarize revision metadata, changed files, and important diff areas.
```

## Commands

- `Workflow Register: Reload Bob Workflow Files`
- `Workflow Register: Inspect Bob Workflow Registration`
- `Workflow Register: Complete Current Bob Workflow Step`
- `Workflow Step: Complete Current Step`
- `Workflow Register: Inspect Active Bob Workflow Steps`

## Build

```powershell
cd extensions\workflow-register
npm install
npm run compile
npm run package
```

The packaged VSIX will be named like `workflow-register-0.1.0.vsix`.
