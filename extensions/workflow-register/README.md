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
| `prompt` | Markdown body | Prompt sent when the workflow runs. |
| `command` | unset | VSCode command to execute after the prompt is sent. |
| `commandArgs` | `[]` | Simple list of command arguments. |
| `permissions` | `[read, mcp, skill]` | Bob approval permissions. |
| `autoApproval` | `true` | Whether Bob auto-approval is enabled for the workflow. |
| `workspaceRequired` | `true` | Whether the workflow is enabled only when Bob supplies a workspace. |
| `hidden` | `false` | Whether the workflow should be hidden from Bob UI. |

The initial parser supports a small YAML subset: top-level scalar fields and simple lists.

## Example

```md
---
name: bazaar-project-rule-review
description: Review a Bazaar revision or range against project-specific rules.
title: Bazaar Project Rule Review
permissions:
  - read
  - mcp
  - skill
autoApproval: true
workspaceRequired: true
command: bobBazaar.openReviewGui
---
Open the Bazaar Review GUI and run a project-rule review.
```

## Commands

- `Workflow Register: Reload Bob Workflow Files`
- `Workflow Register: Inspect Bob Workflow Registration`

## Build

```powershell
cd extensions\workflow-register
npm install
npm run compile
npm run package
```

The packaged VSIX will be named like `workflow-register-0.1.0.vsix`.
