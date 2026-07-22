# Task 2 implementation report

## Result

Status: DONE

Commit: `2f3fbe1 refactor: unify workflow authoring panels`

Task range reviewed: `df42018..2f3fbe1`

## Changed files

- `extensions/workflow-register/package.json`
- `extensions/workflow-register/src/commands/openWorkflowBuilder.ts`
- deleted `extensions/workflow-register/src/commands/openTemplateCustomizationStudio.ts`
- `extensions/workflow-register/src/extensionWithAuthoring.ts`
- `extensions/workflow-register/src/template/templateStudioModel.ts`
- `extensions/workflow-register/src/webview/workflowBuilderPanel.ts`
- `extensions/workflow-register/src/webview/workflowBuilderHtml.ts`
- `extensions/workflow-register/src/webview/workflowBuilderClientStateScript.ts`
- `extensions/workflow-register/src/webview/workflowBuilderActionEventsScript.ts`
- renamed the standalone Template Studio client/HTML/styles to `workflowBuilderStandardTemplate*` modules and integrated them into Builder
- deleted `extensions/workflow-register/src/webview/templateCustomizationStudioPanel.ts`
- updated focused Builder/template/registration/Japanese-copy tests under `extensions/workflow-register/test`

`editWorkflowInBuilder.ts` was inspected and intentionally left unchanged: it already routes `mode: "edit"` through `WorkflowBuilderPanel.createOrShow`, which is now the retained single panel.

## Behavior delivered

- Retained one `workflowRegisterBuilder` Webview panel with exact title `ワークフロー作成・編集`.
- Added exactly three modes: `empty`, `standard-template`, and `edit`, with the required Japanese labels.
- Removed the `bobTemplate.openCustomizationStudio` activation, contribution, registration, command module, panel, and standalone asset names.
- Preserved the five non-GUI `bobTemplate.validate*` / `generateWorkflow` / `checkReadiness` registrations.
- Standard-template application now validates and converts generated Markdown through the canonical authoring loader, updates only the active in-memory Builder session, then uses Builder preview/diff/save.
- Standard-template saves use the same validation, explicit overwrite, exclusive backup, per-target queue, session guard, conflict recheck, write, reload, and notification transaction as the other Builder modes.
- Added no-change and cancellation exits with no target write or backup.
- Added physical containment and owned-preview identity checks for diff targets/previews, including symlink escapes, stale cleanup, and parent replacement while `vscode.diff` is pending.
- Split readiness calculation from report commit. Calculation is no-write; the two reports commit as one rollback-capable pair with freshness rechecks. Public `checkReadinessFromStudioModel` behavior remains calculate-and-write.
- Added render tokens to every Builder/standard-template client message and every host response. Host allowlists actions and validates token/payload before session mutation; caught errors do not escape the Webview message callback.
- Added session-bound request generations and commit-after-success handling for authoring models. Same-mode selection is a no-op; stale pages, out-of-order completions, panel replacement, template reapply, and dispose cannot commit an older model.

## RED evidence

1. Initial consolidation RED:
   - Command: compile plus `workflowBuilderWebviewModules.test.js` and `workflowRegister.test.js`
   - Result: 21 total, 18 pass, 3 fail.
   - Expected failures: no three-mode selector, no render-token wrapper, and standalone Template Studio still contributed.
2. Readiness transaction RED:
   - Command: compile plus `templateCustomizationStudio.test.js`
   - Result: 18 total, 16 pass, 2 fail.
   - Expected failures: missing no-write calculation API and missing paired transactional commit.
3. Diff parent-swap RED:
   - Command: targeted seven transactional/lifecycle tests.
   - Result: 7 total, 6 pass, 1 fail.
   - Product defect caught: owned preview remained after the preview parent was renamed and replaced with an external symlink.
4. Unknown-action validation RED:
   - Command: targeted unknown-action regression.
   - Result: 1 total, 0 pass, 1 fail.
   - Product defect caught: an unknown action advanced session generation before rejection.

## GREEN verification

- Compile: PASS.
- Focused base Task 2 set (`templateCustomizationStudio`, `workflowBuilderTransactionalSave`, `workflowBuilderWebviewModules`, `workflowRegister`): 63/63 PASS before the final lifecycle additions.
- Final template/Builder transactional subset: 52/52 PASS.
- Expanded template/Builder/authoring/registration/Japanese-copy suite: 128/128 PASS before the final unknown-action regression; that regression also passes in the final full suite.
- Final `npm test`: 1,279 total; 1,278 pass; 0 fail; 1 pre-existing environment-dependent skip.
- Architecture policy: PASS, 220 TypeScript files checked.
- Source export-star policy: PASS, 220 TypeScript files checked.
- Dependency policy: 3/3 PASS.
- Schema policy: 5/5 PASS.
- Package: PASS; VSIX created with 816 entries.
- VSIX policy: PASS at 1,070,501 bytes (budget 1,200,000 bytes).
- Packaged archive contains no `templateCustomizationStudio*` or `openTemplateCustomizationStudio` compiled assets.
- `git diff --check df42018..2f3fbe1`: PASS.

## Self-review

- Reviewed the full `df42018..2f3fbe1` diff and staged name-status list.
- Confirmed the change set is limited to Task 2 authoring/template production and test files.
- Confirmed run engine/provider/artifact/`run.json` contracts were not changed.
- Confirmed one `createWebviewPanel` call owns Builder and no `bobTemplateCustomizationStudio` source remains.
- Confirmed the retained non-GUI template commands remain contributed and registered.
- Fixed two self-review findings before commit: duplicate asynchronous standard-template initialization and unknown-action generation mutation.
- No unresolved correctness concerns.

## Environment notes

- npm prints the existing `http-proxy` deprecation warning and a newer npm version notice.
- `vsce` prints the existing bundle/file-count recommendation; package size remains within policy.
- One full-suite test is skipped by its environment guard. There are no environment-only blockers.

## Independent-review fix wave

Status: DONE

Follow-up commit: `57fb99e fix: harden workflow authoring transactions`

### Findings closed

- C1: replaced the custom readiness-report copy/rollback loop with `writeWorkspaceFilesAtomically`; both reports now share the primitive's physical-root lock, identity checks, staging, rollback, and post-state-commit directory recheck.
- C2: added a narrow authoring file transaction that captures parent/target identity and expected bytes, stages in the verified parent, publishes with an exclusive hard link, restores only owned identities, preserves unrelated regular/symlink winners, and cleans only the exact user backup owned by the aborted save.
- I1: readiness freshness is checked inside the serialized transaction callback, so a stale rollback completes before a newer report pair begins.
- I2: added an explicit standard-template `customize` / `authoring` phase; applying a template now renders the editable Builder page and the real client emits a tokenized save payload.
- I3: cancel, no-change, and successful saves use the captured request generation for host-model commits; an older save may finish its disk commit without overwriting a newer preview model.
- I4: diff captures target identity and bytes before preview creation and rechecks them immediately before dispatch; target or preview-parent replacement aborts, cleans the owned preview, and does not commit the model.
- Additional review boundaries: physical workspace aliases share one authoring save lock; a stale second editor still hits the external-change conflict and preserves the first winner. The generic workspace transaction now removes a failed-publish target only when it has the staged inode identity.

### RED evidence

- Initial six-finding focused run: compile plus `templateCustomizationStudio.test.js` and `workflowBuilderTransactionalSave.test.js`: 53 total, 45 pass, 8 fail.
- Strengthened C1 parent-swap exploit made the complete review boundary 53 total, 44 pass, 9 fail.
- Expected failures covered readiness parent escape and overlap tearing; template-to-authoring rendering; save generation on cancel/no-change/success; existing and missing final-write replacement; and diff target replacement before dispatch.

### GREEN verification

- Focused transaction/UI verification (`templateCustomizationStudio`, `workflowBuilderTransactionalSave`, `workspaceFileTransaction`): 68/68 PASS.
- Final `npm test`: 1,297 total; 1,296 pass; 0 fail; 1 environment-dependent skip.
- Architecture and source policies: PASS, 221 TypeScript files checked.
- Dependency policy: 3/3 PASS.
- Schema policy: 5/5 PASS.
- Package: PASS; VSIX created with 817 entries.
- VSIX policy: PASS at 1,073,909 bytes (budget 1,200,000 bytes).
- `git diff --check`: PASS.

### Review-fix scope

- Production changes remain within Builder/template authoring and the shared workspace-file transaction primitive used by readiness.
- Run engine, provider, artifact, and `run.json` contracts remain unchanged.
- The original external-change conflict remains fail-closed across separate Builder sessions, including lexical aliases of one physical target.

## Quality review wave

Status: DONE

Candidate reviewed: `cd60bf1 fix: close workflow builder review gaps`

Product commit: `087cd32 fix: close workflow builder delivery gaps`

### Findings closed

- The standard-template loading shell has no script, session token, message-capable control, or enabled mode selector.
- Readiness report commit failures are delivered with the request generation and rendered as an overall error, even when the calculated readiness itself passed.
- Standard-template initialization, background message handling, and preview cleanup contain both the original rejection and notification-provider rejection without duplicate or unhandled rejection.
- Same-file reopen refreshes clean state, preserves the exact live page for dirty or invalid DOM state, and delivers focus without rerendering the draft.
- Dirty ownership is source-scoped (`authoring`, `stepDraft`, `template`): valid preview/save clears only authoring state, step-draft discard clears only step-draft state, and returning template customization to its baseline clears its template state. Overlapping sources cannot clear one another.
- `draftChanged` and `templateDraftChanged` validate their payload before generation, model, or dirty-state mutation. The intermediate `draftDirty` message names were removed.
- No-change save advances the disk/model baseline; successful and stale saves preserve generation ownership and the render token captured by their request.
- Every host response now has an explicit request generation. Request-to-render-token ownership is consumed after delivery and bounded at 256 entries for no-response paths, so long-lived panels cannot leak the map.
- Ordinary and standard-template clients reject stale generations and render tokens while allowing all independent window listeners to consume one equal-generation response.
- Ordinary field/body/structural edits signal dirty state before the preview debounce. Step-draft field and result-sink edits do the same, and discard paths release only their own source.

### RED evidence

- Initial focused review run: 57 total, 47 pass, 10 fail. Three failures were incomplete client-harness dependencies; the remaining seven were expected product failures across immediate dirty delivery, readiness/error delivery, baseline advancement, and save response generation/token ownership.
- After correcting the harness, additional focused REDs captured step-draft loss before debounce, dirty-latch release, overlapping dirty-source isolation, bounded request-token ownership, and malformed draft payload mutation ordering.
- Each RED was reproduced against the candidate behavior before the corresponding production change and then retained as a regression.

### GREEN verification

- Fresh compile: PASS.
- New client-delivery plus transactional focused suite: 67/67 PASS.
- Original Task 2 focused suite (`templateCustomizationStudio`, `workflowBuilderTransactionalSave`, `workflowBuilderWebviewModules`, `workflowRegister`): 102/102 PASS.
- Final `npm test`: 1,325 total; 1,324 pass; 0 fail; 1 environment-dependent skip.
- Architecture and source policies: PASS, 221 TypeScript files checked.
- Dependency policy: 3/3 PASS.
- Schema policy: 5/5 PASS.
- Package: PASS; VSIX created with 817 entries.
- VSIX policy: PASS at 1,076,122 bytes (budget 1,200,000 bytes).
- `git diff --check`: PASS.

### Self-review

- Audited every `post` call for explicit generation ownership and checked that multi-listener client delivery intentionally accepts equal generations.
- Checked dirty baseline symmetry for save, no-change save, apply, reopen, template-baseline restoration, step-draft discard, and overlapping invalid authoring/step-draft state.
- Checked that malformed draft messages fail before generation or state mutation and that loading HTML contains no token or message path.
- Checked request-token map cleanup and bounded retention; delayed responses beyond the bound fail closed instead of being retagged to the current page.
- Run engine, provider, artifact, and `run.json` contracts remain unchanged.

### Test-output hygiene follow-up

Test-only commit: `2745c50 test: capture workflow builder notification logging`

- The notification-provider rejection test now captures and restores `console.error` locally.
- It asserts exactly one production log call, the stable log label, and the expected rejection detail without printing a stack trace into the test output.
- The targeted test passes 1/1 and the fresh quality-wave focused suite passes 117/117 with pristine output.
- Production code is unchanged by this follow-up.

## Final transaction and client-boundary review

Status: DONE

Candidate consolidated: `dfbdd69 fix: close workflow builder transaction review gaps`

Follow-up commit: `1357ac6 fix: reconcile workflow authoring cleanup`

### Findings closed

- C1: generic workspace rollback ownership no longer relies on inode identity alone. A hard-link ownership anchor prevents allocator reuse while the transaction is live, and a staged-content digest rejects in-place rewrites before rollback removes a published target. External replacement winners are preserved and the original rollback artifact remains available for recovery.
- I1: rendered clients block preview, diff, and save while client-only authoring JSON diagnostics are present, surface the preview diagnostics, and resume normal host actions after repair. Dirty-source acknowledgement is operation-specific: step validation and readiness validation cannot clear a separate authoring draft, while successful authoring preview/diff/save/reset can.
- I2: readiness preview/apply and step-draft validation parse all ancillary identifiers, request data, step payloads, and indexes before allocating a request generation or mutating session/token ownership.
- Diff preview now uses an in-memory untitled document. It performs no preview-file I/O and rechecks target freshness before dispatch.
- Save freshness is checked inside the per-target authoring transaction. Persistent user backups are exclusively created and owned by the transaction, with parent-swap and final-boundary failures cleaning only the transaction's own backup.
- Authoring publication reconciles rename, hard-link, and rollback-removal operations that mutate successfully and then reject. A committed replacement retains its user backup; a rejected external winner removes the just-created backup without touching the winner.

### RED evidence

- C1 ownership regressions: 2/2 failed before the anchor/digest change. The failures reproduced both normal-file inode reuse and an in-place rewrite of the published inode being mistaken for transaction-owned output.
- I2 mutation-order regressions: 3/3 failed before parse-before-request handling; malformed ancillary payloads advanced generation/token state.
- I1 closure set: 3 regressions cover invalid-DOM host blocking, step-draft dirty ownership, and operation-specific authoring acknowledgement. Invalid authoring JSON initially emitted stale preview/diff/save messages; direct validation initially acknowledged unrelated authoring dirty state.
- Additional authoring transaction RED: rollback `.bak` removal that deleted the file and then rejected caused restore to follow a now-missing rollback path. The retained regression now proves the commit completes and preserves the user backup.
- The first expanded GREEN run caught two cleanup regressions in the candidate: external regular-file and symlink winners were preserved, but their newly-created backups remained. Cleanup was narrowed before commit, and both existing final-boundary tests returned to GREEN.

### GREEN verification

- Compile: PASS.
- Mandatory C1/I1/I2 closure tests: 8/8 PASS.
- Authoring plus Builder transaction suite: 75/75 PASS.
- Task 2 Builder-focused suite: 129/129 PASS.
- Workspace transaction and snapshot-import suite: 28/28 PASS.
- Final `npm test`: 1,346 total; 1,345 pass; 0 fail; 1 environment-dependent skip.
- Architecture and source policies: PASS, 221 TypeScript files checked.
- Dependency policy: 3/3 PASS.
- Schema policy: 5/5 PASS.
- Package: PASS; VSIX created with 817 entries.
- VSIX policy: PASS at 1,076,354 bytes (budget 1,200,000 bytes).
- `git diff --check`: PASS.

### Self-review

- Reviewed the complete inherited candidate as one transaction boundary rather than accepting isolated edits. Retained the in-memory diff, transaction-owned backup, save-generation guard, readiness pre-commit freshness hook, and generic ownership anchor/digest because their focused failure modes are covered and the full suite remains green.
- Rechecked every `commitModel` call by operation: authoring-producing operations explicitly acknowledge the authoring draft; validation-only, readiness-only, and cancelled operations preserve source-scoped dirty evidence.
- Rechecked rollback outcomes for successful commit, mutation-after-effect rejection, external regular-file/symlink winners, parent replacement, and cleanup failure. The code removes only identities it owns and retains recovery artifacts when restoration cannot be proven.
- Run engine, provider, artifact, and `run.json` contracts remain unchanged.

## Final independent-review follow-up

Status: DONE

Product commit: `ed400ab fix: harden final authoring transaction boundaries`

### Findings closed

- C1: authoring publication now keeps a SHA-256 digest copied from the intended input bytes, independent of the staged inode. It verifies identity and digest immediately before commit linearization and again before rollback removes a published target. An in-place external rewrite can no longer be mistaken for owned staged output even though the target and staging link share an inode.
- C1 recovery behavior is explicit for existing and missing targets across both a normally-returning hard link and a hard link that mutates then rejects. The external winner is preserved; an existing original remains in the internal rollback artifact; and the aborted transaction's persistent user backup is removed.
- I1: `validateStepDraft` checks the index against `model.steps.length` and deep-traverses the candidate draft through the canonical authoring serializer before allocating a request. Deep-incomplete result and command steps, and out-of-range indexes, leave generation, render-token ownership, host model, dirty sources, and posted responses unchanged.
- I1 domain validation remains separate from transport-shape validation. A structurally complete result draft with a missing state key still advances a valid validation request and returns the canonical `result.stateKey.required` diagnostic.
- M1: successful generic workspace commits attempt every temporary, anchor, and backup cleanup. A removal that deleted its path before rejecting is reconciled as success; any artifact that really remains is reported to the caller in one aggregate cleanup error after all cleanup attempts.

### RED evidence

- C1: 4/4 regressions failed before the digest checks: existing/missing targets crossed with link-success/link-mutation-after-effect-rejection. The old code either reported success for external bytes or deleted the winner and restored the old target.
- I1: 2/2 regressions failed before pre-request validation: a deep-incomplete result step and an out-of-range index both advanced generation and request-token ownership.
- M1: the real-residual cleanup test failed because `.anchor` and `.bak` `EACCES` failures were swallowed. The delete-then-reject contract was already outwardly successful and was retained as a baseline regression.
- Initial combined run: 94 total; 87 pass; 7 expected fail. A command-step deep-shape regression and a structured-domain diagnostic regression were added while completing GREEN coverage.

### GREEN verification

- Compile: PASS.
- Authoring/workspace/Builder transaction set: 96/96 PASS.
- Authoring, workspace, Builder, and readiness focused set: 135/135 PASS.
- Task 2 Builder-focused set: 133/133 PASS (the previous 129-test set plus four new Builder contracts).
- Final `npm test`: 1,356 total; 1,355 pass; 0 fail; 1 environment-dependent skip.
- Architecture and source policies: PASS, 221 TypeScript files checked.
- Dependency policy: 3/3 PASS.
- Schema policy: 5/5 PASS.
- Package: PASS; VSIX created with 817 entries.
- VSIX policy: PASS at 1,076,691 bytes (budget 1,200,000 bytes).
- `git diff --check`: PASS.

### Verification note

- The first full-suite attempt exposed one existing durability-read timing test outside this change set. It passed in isolation, in 10 consecutive focused repetitions, and in both subsequent complete-suite runs. No unrelated durability production or test code was changed.

### Self-review

- Confirmed the authoring digest is derived from a copied input buffer before publication, so rewriting the hard-linked target cannot also rewrite the expected digest.
- Confirmed digest mismatch cleanup never removes the winner or restores over it, keeps an original rollback artifact when present, and cleans only the transaction-owned persistent backup.
- Confirmed serializer traversal occurs only after the canonical model and index are validated and before `beginRequest`; the existing domain validator remains responsible for user-facing field diagnostics.
- Confirmed successful generic cleanup reports actual residual artifacts only after attempting all paths and does not alter rollback cleanup's recovery-artifact retention rules.
- Run engine, provider, artifact, and `run.json` contracts remain unchanged.

## Mutation-after-effect reconciliation follow-up

Status: DONE

Product commit: `1ff2146 fix: reconcile final transaction mutation windows`

Linearization correction: `388e6e8 fix: preserve authoring commit linearization`

### Findings closed

- Authoring generation ownership is checked after original rollback verification and immediately before `fs.link(temporary, target)`. That link invocation is the disk-commit linearization boundary: a request already stale at the boundary returns `stale` without publication, while a request that becomes stale after the invocation completes the disk commit and suppresses stale host-model/UI delivery.
- Authoring staging now has a hard-link ownership anchor. Temporary and anchor cleanup verifies the staged identity and reconciles removals that delete before rejecting. Persistent backup and rollback cleanup also require expected content, so an in-place external replacement is retained instead of being removed by inode identity alone.
- Authoring rollback restoration verifies target identity, original digest, and rollback-path absence before treating a rename that rejected after mutation as successful.
- Generic rollback reconciles a target removal that deletes before rejecting and a backup restore rename that completes before rejecting. Restore success requires the original backup identity, exact digest, and a missing backup path.
- Both generic target-removal phases use the ownership anchor and staged digest. A same-inode winner recreated through the anchor after the first removal is preserved, and the original backup remains available for recovery.
- Builder saves superseded before link invocation perform no publication. Once link invocation begins, the committed payload and exclusive backup remain durable; generation/session checks prevent the older request from replacing the current hosted model or delivering stale document/UI responses. Reload still runs after a committed disk write so the extension registry observes the durable change.

### RED evidence

- Imported independent-review set on the clean prior HEAD: 26 total; 22 pass; 4 fail. The failures covered pre-publication stale generation after rollback verification, authoring temporary cleanup deletion-before-rejection, generic rollback target removal deletion-before-rejection, and generic backup-restore rename mutation-before-rejection.
- Additional audit exposed an in-place persistent-backup winner and an in-place rewrite after generic restore rename. Both are retained as fail-closed digest regressions; third-party bytes are not deleted or overwritten.
- A final secondary-removal regression failed 1/1 before both generic removal phases shared anchored identity/digest verification; the old path removed a same-inode external winner and restored over it.
- An intermediate candidate added post-publication generation checks and inverted two established Builder contracts. The final correction removes those checks: pre-link stale abort remains strict, and post-linearization disk commit plus stale UI/model suppression is covered for both same-session generation changes and panel replacement.

### GREEN verification

- Compile: PASS.
- Strict transaction/linearization selection: 16/16 PASS.
- Expanded authoring/workspace/Builder/readiness focused set: 128/128 PASS.
- Final `npm test`: 1,365 total; 1,364 pass; 0 fail; 1 environment-dependent skip.
- Architecture and source policies: PASS, 221 TypeScript files checked.
- Dependency policy: 3/3 PASS.
- Schema policy: 5/5 PASS.
- Package: PASS; VSIX created with 817 entries.
- VSIX policy: PASS at 1,077,211 bytes (budget 1,200,000 bytes).
- `git diff --check`: PASS.

### Self-review

- Confirmed the final authoring generation check occurs immediately before target-link invocation and no generation check can roll back a disk write after that linearization boundary.
- Confirmed every authoring cleanup deletion is gated by owned identity and, where bytes carry recovery meaning, the independent expected digest.
- Confirmed stale cleanup can remove only a published target that still matches both the ownership anchor and staged digest; regular-file, symlink, different-inode, and in-place winners fail closed.
- Confirmed generic removal mutation reconciliation accepts only an absent path, while restore reconciliation accepts only the exact prior backup bytes and identity with no backup path remaining.
- Confirmed rollback artifacts are excluded from staging cleanup while recovery remains incomplete.
- Run engine, provider, artifact, and `run.json` contracts remain unchanged.

### Arbitration verdict

- Verdict: `RECOMMEND_B`, with `C0 / I0 / M0` unresolved findings.
- Canonical boundary: the final `canCommit` check immediately before exclusive target-link invocation is the stale/no-write boundary; a successful `fs.link` linearizes persistence.
- After linearization, generation or session changes do not roll back the disk commit, its exclusive persistent backup, or the required reload. Existing generation, render-token, and session guards suppress stale host-model replacement, response delivery, document display, and information messages.
- Mutation-after-effect rejection remains a rollback path. Ownership anchors, independent digests, and exact rollback verification continue to preserve regular-file, symlink, different-inode, and in-place external winners.
- Adopted product: `388e6e8 fix: preserve authoring commit linearization`.

## Committed-save stale UI suppression follow-up

Status: DONE

Product commit: `18761da fix: suppress stale builder save UI`

Boundary-test commit: `bacd6cb test: cover committed save UI guard boundaries`

### Finding closed

- Contract B remains canonical after disk linearization: a committed older save retains its payload, exclusive persistent backup, and required `workflowRegister.reload`, while a newer same-session generation remains the hosted model.
- Every continuation after the committed save now checks both session and request generation. A generation change while reload is awaited suppresses the baseline-option update, document open/show, saved response, and information message. A change while open is awaited suppresses show/post/info; a change while show is awaited suppresses post/info; and a change while post is awaited suppresses the final info message.
- A saved response whose post has already started is still tagged with the older generation. The client-side host-message guard rejects it after the newer preview has advanced `latestHostGeneration`, so it cannot replace current client state.

### RED evidence

- The three stale-UI assertions were injected into an isolated archive of clean HEAD `1cae296` at `/tmp/workflow-register-head-probe-153959e9c301`; the shared worktree was not rewritten. Compile succeeded, then the named committed-older-save regression failed 0/1 because the old implementation opened one stale document where none was expected.
- With the product candidate restored, the same named regression passed 1/1.

### Await-boundary coverage

- Reload: disk payload, backup, and one reload remain; no option update, document display, saved response, or info message occurs after generation changes.
- Open: the baseline option is already updated and open has started; show, saved response, and info remain suppressed.
- Show: document display has already started; saved response and info remain suppressed.
- Post: document display and the old-generation saved post have already started; the client drops the stale response, and the host suppresses info.
- All four cases retain the newly committed disk state and backup while preserving the latest preview as the active host model.

### GREEN verification

- Named regression plus four await-boundary cases: 5/5 PASS.
- Complete Builder transactional-save file: 78/78 PASS.
- Task 2 Builder-focused set: 137/137 PASS.
- Final `npm test`: 1,369 total; 1,368 pass; 0 fail; 1 environment-dependent skip.
- Architecture and source policies: PASS, 221 TypeScript files checked.
- Dependency policy: 3/3 PASS.
- Schema policy: 5/5 PASS.
- Package: PASS; VSIX created with 817 entries.
- VSIX policy: PASS at 1,077,207 bytes (budget 1,200,000 bytes).
- `git diff --check`: PASS.

### Scope note

- The unrelated Task 3 Bazaar GUI-first RED in `extensions/bob-bazaar-review/test/guiFirstSurfaces.test.js` was not edited, staged, committed, or included in Task 2 verification. It remains the sole intentional worktree modification.
- Run engine, provider, artifact, and `run.json` contracts remain unchanged.

### Final independent closure

- Final committed range: `df42018..bacd6cb`.
- Clean detached verification: compile PASS; Builder transactional 78/78; expanded focused 132/132; full 1,368 pass / 0 fail / 1 platform skip; package and VSIX policy PASS at 1,073,651 bytes / 816 entries.
- Specification review: `SPEC_COMPLIANT`, Critical 0 / Important 0 / Minor 0.
- Quality review: `CODE_QUALITY_APPROVED`, Critical 0 / Important 0 / Minor 0.
