# Mechanical Check Runner MVP

Mechanical Check Runner executes project-owned deterministic checks from `.bob/checks/mechanical-checks.yaml` through workflow command steps.

## Workflow Step

```yaml
steps:
  - id: run-mechanical-checks
    title: コードレビュー前の機械チェックを実行
    type: command
    action:
      provider: workflowRegister.runMechanicalChecks
      args:
        profile: pre-code-review
        baseRevision: "{{inputs.baseRevision}}"
        targetRevision: "{{inputs.targetRevision}}"
    resultKey: mechanicalCheckResult
    required: true
    completeOnSuccess: true
```

Use workflow transitions to stop the run when `mechanicalCheckResult.status` is `failed` or `blocked`.

## Configuration

Default path: `.bob/checks/mechanical-checks.yaml`.

Supported runner values:

- `bat`
- `powershell`
- `python`
- `node`
- `executable`

Supported parser values:

- `exit_code`
- `regex`

Paths must be workspace-relative. Absolute paths and `..` traversal are rejected for `command`, `cwd`, evidence collection, and known-warning files.

## Results

Each run writes:

- `.bob/mechanical-checks/runs/<runId>/profile-result.json`
- `.bob/mechanical-checks/runs/<runId>/profile-summary.md`
- `.bob/mechanical-checks/runs/<runId>/checks/<checkId>/stdout.log`
- `.bob/mechanical-checks/runs/<runId>/checks/<checkId>/stderr.log`
- `.bob/mechanical-checks/runs/<runId>/checks/<checkId>/result.json`
- `.bob/mechanical-checks/runs/<runId>/checks/<checkId>/evidence/...`

`passed`, `warning`, `failed`, and `blocked` are runner-owned statuses. Bob may summarize them, but the JSON result is the source of truth.

## CODEX Verification

Run from `extensions/workflow-register`:

```powershell
npm.cmd run compile
node --test test/mechanicalChecksConfig.test.js test/mechanicalChecksRunner.test.js test/mechanicalChecksActionProvider.test.js test/workflowSamples.test.js
```
