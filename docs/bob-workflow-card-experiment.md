# Experimental Bob Start Workflow Card Procedure

This note documents the experimental implementation in `experiment-bob-workflow-card`.

## Goal

Try to show a third-party Bazaar review card in IBM Bob's `Start Workflow` UI.

## Current implementation

The companion extension now contributes two commands:

- `Bob Bazaar: Inspect Bob Workflow API`
- `Bob Bazaar: Register Experimental Bob Workflow Card`

`Inspect Bob Workflow API` activates `IBM.bob-code` through the VSCode extension API and prints the public `extension.exports` keys into a Markdown document.

`Register Experimental Bob Workflow Card` tries only one conservative shape:

```ts
api.registerWorkflow("bob-bazaar-review", workflowCard)
```

This is intentionally narrow. It avoids depending on minified closure internals. If Bob does not expose `registerWorkflow` on `extension.exports`, the command reports that the workflow registry is not publicly reachable.

## How to test

1. Build and install the extension from this branch.
2. Reload Bob IDE / VSCode.
3. Run `Bob Bazaar: Inspect Bob Workflow API`.
4. Check whether `registerWorkflow` appears in the export keys.
5. Run `Bob Bazaar: Register Experimental Bob Workflow Card`.
6. Open Bob's `Start Workflow` UI.
7. Check whether `Bazaar Project Rule Review` appears.

## Expected outcomes

### Success

If Bob exposes `registerWorkflow`, the command returns success and sets `bob-code.hasWorkflows` to true. The card may appear after opening or reloading the Start Workflow UI.

### Likely failure

If no `registerWorkflow` export exists, the command cannot register the card. In that case the remaining options are:

1. Keep using Skill + custom mode.
2. Keep using the companion extension's GUI / command flow.
3. Patch or fork Bob itself.
4. Find an IBM-supported workflow contribution API.

## Files changed

- `extensions/bob-bazaar-review/src/bobApiProbe.ts`
- `extensions/bob-bazaar-review/src/extension.ts`
- `extensions/bob-bazaar-review/package.json`
