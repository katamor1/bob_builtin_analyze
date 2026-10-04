# WF2-P6-ENTRYPOINT local implementation

State: LOCAL. Maximum activation: shadow. Hosted CI, merge, product UAT and preservation/cleanup remain pending.

Base: 90c678d3d33ae61a5523f2d9cf8057538028dd4b
Implementation head: f8ff1ccf42ce05505e1844107397ab181b01bb58
Implementation tree: b29daa768cceae147a82f6eb922911e534335e0c

26 selected source items are reconciled to 24 surfaces. P2 package loading, the P4 compiler and the process-wide P5 store provide a shared private handle. V2 current slots reserve their legacy slot even on failure. Read-only views are authenticated privately. Product execution is denied before inputs, leasing, Bob tasks and durable operations. V1 behavior is retained.

Final regression results: Workflow 2034 pass / 1 skip; Bazaar 753 pass / 1 skip; CCR 328 pass; UI 68 pass. Program policy: 854 pass / 0 fail.

One fresh-context gpt-6-astra review of the precursor head found four Important issues; each is fixed with behavioral RED→GREEN and the full affected suite. The fix commit is independently bound by source hashes; no second review or hosted acceptance is claimed.

The approved level-9 recompression preserves every ZIP entry and its raw bytes; no new dependency, runtime exclusion or budget increase.

| Extension | Bytes / limit | Entries | SHA256 |
| --- | ---: | ---: | --- |
| workflow-register | 1197704 / 1200000 | 897 | ed0991a9e5f35cc6ec9ea68391e82063caf48a2659c3b2d755f88fcda84d174b |
| bob-bazaar-review | 3767456 / 12000000 | 1822 | aa4977a6a864f8986074613379ba52b8744c43768b48b53d3bb81283c3e2ef9d |
| bob-code-consistency-review | 3721538 / 11000000 | 1914 | b33c5fea866af1272fbf343030599e2a4ebe5134a17aa353ded786b5796cab54 |

Full command output and earlier failed attempts remain in the owned technical workspace. Exact commands, exit codes, counts and log hashes are in the JSON observation. This record grants no mutation or activation authority.

Review: reviewed-with-one-verified-fix-pass.

## Pending

- candidate push and PR
- four exact-head hosted workflows
- separate exact merge authorization and four main workflows
- same-hash product UAT and VSIX installation authorization
- external preservation and separately authorized cleanup/native archive
- P6 VERIFIED completion observation
- P7 and later migration slices

## Rulings

- Ruling: Use Windows Node equivalents for the Bash workspace/task helpers — this host runs PowerShell and the approved technical root is explicit — cost if wrong: missing helper bookkeeping, checked through briefs/BASE/logs.
- Ruling: Retain this technical workspace through verified external preservation and separately approved native archive — repository append-only evidence protocol and approved local scope override generic skill deletion — cost if wrong: additional local disk use.
- Task 1: Ruling: Add one exact .gitattributes LF rule for P5 completion — current auto text checkout changes canonical bytes and invalidates the registry; same proven P4 recovery contract — cost if wrong: one additional scoped text rule.
- Task 6: Ruling: Update two existing structural tests for the moved F7 binding, guarded run store and approved compression script — their assertions name pre-P6 implementation shapes while behavioral contracts remain required — cost if wrong: two additional test-only files in the diff.
- Task 6: Ruling: Set core.longpaths only in child Git process environments — 71 program failures share Windows bundle path overflow under the owned technical TMP; no global Git config or product path change — cost if wrong: test Git path handling differs from the host default.
- Task 6: Ruling: Use task-marked .superpowers/t6 as the child-process temporary root — core.longpaths fixes bundle creation but Git bundle verify still rejects deep absolute paths; the shorter root stays inside this worktree and has an exclusive ownership marker — cost if wrong: one additional ignored temporary directory, retained through preservation/cleanup.
- Task 6: Ruling: Update sourceLayoutPolicy.test.js to recognize guarded async command delegation — the actual run orchestration remains in WorkflowRunCommandService; its old regex requires forwarding the unselected argument — cost if wrong: one additional test-only maintenance file.
- Final: Ruling: Include workflowRunCommands.ts in the fix scope and bind persisted reads through the existing guarded store — direct next/resume/retry/checkpoint branches bypass engine guards and can recover/write/accept gates first — cost if wrong: one additional product surface and additive internal workflow resolver plumbing.
- Final: Ruling: Reserve slots with current.json or versions structural entries independently of search matches — hidden/wrong-type/incomplete V2 markers must not restore same-slot legacy execution — cost if wrong: a V1 slot using these reserved structural names becomes validation-only until its layout is clarified.
- Final: Ruling: P7 manifests, runtime activation, provider invocation and contribution bridge remain deferred — the authorized slice is fixed shadow and reasonable users receive validation/display only — cost if wrong: later runtime functionality is delayed until separately scoped work.
- Final: Ruling: Hosted CI and installed VS Code/Bob UAT remain pending — local tests/source review cannot establish installed product outcomes — cost if wrong: platform integration issues remain undiscovered before those separate gates.
- Final: Ruling: Final evidence/publication/merge/preservation/cleanup are completion gates after the reviewed implementation — the reviewer assessed the immutable code head, not future external operations — cost if wrong: final evidence consistency requires executor checks and separately authorized exact-head hosted acceptance.
- Task 6: Ruling: Shorten child TMP further to task-marked .bob/t6 inside the same worktree — three nested program cases use longer staging labels whose bundle paths still exceed 260 characters at .superpowers/t6 (calculated 264); the new longest path is 257 — cost if wrong: one additional ignored task-only temporary root to preserve and clean separately. Prior TMP and all failure logs are retained.
- Task 6: Ruling: Use exclusive task-marked .t and add one exact /.t/ ignore rule — the final marker case label is longer than the prior probe; worst paths are 258/259 bytes for 5/6-digit PIDs here, while .bob/t6 still gives 263/264 — cost if wrong: one additional .gitignore rule and retained temporary root; no product or archive-tool changes. Prior roots and attempts remain intact.
