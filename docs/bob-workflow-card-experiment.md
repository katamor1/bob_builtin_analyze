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
  name: "Bazaar Project Rule Review",
  title: "Bazaar Project Rule Review",
  label: "Bazaar Project Rule Review",
  description: "Review a Bazaar revision or range against project-specific rules...",
  command: "bobBazaar.openReviewGui",
  vscodeCommand: "bobBazaar.openReviewGui",
  prompt: "Open the Bazaar Review GUI and run a project-rule review."
}
```

Then it tries these conservative registration shapes:

```ts
api.registerSource(source)
api.registerSource("bob-bazaar-review", source)
api.registerSource({ id: "bob-bazaar-review", workflows: [workflow] })
api.registerWorkflow?.("bob-bazaar-review", workflow)
api.registerWorkflow?.(workflow)
```

The command reports every attempt in a Markdown result document. If an attempt returns without throwing and does not return `false`, the extension sets `bob-code.hasWorkflows` to `true` and asks the user to check Bob's `Start Workflow` UI.

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

If Bob accepts one of the `registerSource` payloads as a workflow source, the command returns success and sets `bob-code.hasWorkflows` to true. The card may appear after opening or reloading the Start Workflow UI.

### Partial success

If `registerSource` returns success but the card does not appear, the payload shape is still wrong for Bob's workflow source model. In that case, capture the attempt report and inspect the Bob output/logs.

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
