# Workflow Runtime Debugging

This guide explains how to debug workflow execution after a `WORKFLOW.md` file validates successfully.

## Runtime checks covered by the engine

The standalone workflow engine performs runtime checks that are different from authoring validation.

Current runtime behavior includes:

- Required workflow inputs are validated before execution.
- `requires.workspace` can fail when no workspace is available.
- `requires.files` and `preflight[].files` are checked before steps run.
- `failurePolicy: stop` fails the run when a required preflight check fails.
- Agent prompts render placeholders such as `{{inputs.target}}` and `{{state.context}}`.
- Command step arguments render the same placeholder style.
- Result steps can write state or agent output to result sinks.
- File result sinks refuse paths that escape the workspace.
- Guardrails can deny or allow command providers at runtime.
- `stepExecution.allowOutOfOrder: false` rejects later `singleStep` execution until previous steps are `completed`.
- `stepReview.enabled: true` moves successful steps to `reviewing` until accepted or retried.

## Inspecting run failures

Open `Bob: 操作ハブを開く` and use the selected run card's Diagnostics action. The report shows:

- Run id
- Workflow id and name
- Run status
- Current step
- Run error
- Failed or held step
- State keys captured so far
- Per-step status
- Suggested fix for common failure patterns

The internal diagnostics command remains registered for host routing, but it is hidden from the normal Command Palette.

## Common failures

### Unsupported action provider

```text
Unsupported action provider: example.collectReviewContext
```

Fix: register an `ActionProvider` for that id, or use `vscode.executeCommand` with a real VS Code command id in `action.args`.

### Missing required file

```text
Workflow preflight failed: Required workflow file is missing: package.json
```

Fix: create the file or remove it from `requires.files` / `preflight.files`.

### Missing state key

```text
Workflow state is missing: analysisReport
```

Fix: check that an earlier step uses `resultKey: analysisReport`, and that the producing step runs before the consuming step.

### Out-of-order single step

```text
Step 'output-result' cannot run before previous step 'collect-context' is completed.
```

Fix: run and accept previous steps first, or explicitly set `stepExecution.allowOutOfOrder: true` for workflows that are safe to jump.

### Review gate is waiting

If `run.json` has `status: "reviewing"`, the run does not advance automatically. Use the `Bob 操作ハブ` run card to accept the current step or archive and retry the current attempt. The underlying `workflowRegister.acceptCurrentStep`, `workflowRegister.retryCurrentStep`, and `workflowRegister.runNextStep` IDs remain internal routing contracts.

### Agent provider missing

```text
Agent provider is required for agent workflow steps.
```

Fix: configure `workflowRegister.agentCommand` or register an `AgentProvider` through the extension API.

### Guardrail rejected command

```text
Command is not allowed by workflow guardrails: vscode.executeCommand
```

Fix: add the provider to `guardrails.allowedCommands`, remove the allowlist, or choose a different provider.

## Placeholder rendering

Supported placeholders include:

```text
{{inputs.target}}
{{state.collectedContext}}
{{run.id}}
{{workflow.id}}
{{step.id}}
```

Short names are also resolved from inputs or state when unambiguous:

```text
{{target}}
{{collectedContext}}
```

Unknown placeholders are left unchanged so the report can reveal the unresolved value.

## Debugging checklist

1. Validate and preview the workflow in `ワークフロー作成・編集`.
2. Start it from IBM Bob or `Bob 操作ハブ`.
3. If it fails, open the run card's Diagnostics action.
4. Fix the first failed step.
5. If the run is `reviewing`, accept or retry from the run card. If it is `failed`, retry the step or start a new run.
6. Confirm that expected state keys and artifacts are created.
