# Experimental Bob Start Workflow Card Procedure

This note documents the experimental implementation in `experiment-bob-workflow-card`.

## Goal

Try to show a third-party Bazaar review card in IBM Bob's `Start Workflow` UI.

## Probe result from Bob 2.0.0

The first probe showed these public extension export keys from `IBM.bob-code`:

```text
openNewTask
registerSource
setChatContent
setFindings
startTask
startWorkflow
```

This is useful because `registerSource` looks like the intended public entry point for companion extensions. `startWorkflow` is treated as an execution entry point, not a discovery/registration entry point.

A second experiment showed that this call succeeds:

```ts
api.registerSource(source)
```

and returns an object with these keys:

```text
register
id
_log
_configuration
_humanReadableName
_parts
_events
_enabled
```

That strongly suggests a two-step model:

1. `registerSource(sourceDescriptor)` creates a Bob source.
2. `returnedSource.register(part)` registers concrete parts such as workflows/tools/findings under that source.

## Current implementation

The companion extension contributes two commands:

- `Bob Bazaar: Inspect Bob Workflow API`
- `Bob Bazaar: Register Experimental Bob Workflow Card`

`Inspect Bob Workflow API` activates `IBM.bob-code` through the VSCode extension API and prints the public `extension.exports` keys into a Markdown document.

`Register Experimental Bob Workflow Card` builds this workflow card:

```ts
{
  id: "bob-bazaar-review.bazaar-project-rule-review",
  sourceId: "bob-bazaar-review",
  slug: "bazaar-project-rule-review",
  type: "workflow",
  kind: "workflow",
  name: "Bazaar Project Rule Review",
  title: "Bazaar Project Rule Review",
  label: "Bazaar Project Rule Review",
  description: "Review a Bazaar revision or range against project-specific rules...",
  command: "bobBazaar.openReviewGui",
  vscodeCommand: "bobBazaar.openReviewGui",
  prompt: "Open the Bazaar Review GUI and run a project-rule review."
}
```

The command now tries the two-step shape first:

```ts
const source = api.registerSource(sourceDescriptor)
source.register(workflow)
source.register({ type: "workflow", ...workflow })
source.register({ kind: "workflow", ...workflow })
source.register("workflow", workflow)
source.register({ workflows: [workflow] })
```

If direct `registerWorkflow` exists, it is used only as a fallback:

```ts
api.registerWorkflow?.("bob-bazaar-review", workflow)
api.registerWorkflow?.(workflow)
```

The command reports every attempt in a Markdown result document. The user should check Bob's `Start Workflow` UI after a successful part-registration attempt.

## How to test

1. Build and install the extension from this branch.
2. Reload Bob IDE / VSCode.
3. Run `Bob Bazaar: Inspect Bob Workflow API`.
4. Confirm that `registerSource` appears in the export keys.
5. Run `Bob Bazaar: Register Experimental Bob Workflow Card`.
6. Read the generated attempt report.
7. Open Bob's `Start Workflow` UI.
8. Check whether `Bazaar Project Rule Review` appears.
9. If it does not appear, run `Developer: Reload Window` and check again.

## Expected outcomes

### Success

If Bob accepts one of the returned source object's `register(...)` payloads as a workflow part, the command returns success and sets `bob-code.hasWorkflows` to true. The card may appear after opening or reloading the Start Workflow UI.

### Partial success

If `registerSource` returns success but all returned-source `register(...)` attempts fail or the card does not appear, the workflow part payload shape is still wrong for Bob's workflow source model. Capture the attempt report and inspect Bob output/logs.

### Failure

If all attempts fail, the remaining options are:

1. Keep using Skill + custom mode.
2. Keep using the companion extension's GUI / command flow.
3. Patch or fork Bob itself.
4. Find an IBM-supported workflow source schema.

## Files changed

- `extensions/bob-bazaar-review/src/bobApiProbe.ts`
- `extensions/bob-bazaar-review/src/extension.ts`
- `extensions/bob-bazaar-review/package.json`
