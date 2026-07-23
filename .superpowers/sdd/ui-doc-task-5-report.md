# Task 5 implementation report

## Status

DONE

- Product/test commit: `60a974e` (`feat: define five public extension commands`)
- Scope: Task 5 only. Task 6 document classification and historical-document notices were not changed.
- Run engine, provider, artifact, and `run.json` implementations were not changed.

## TDD evidence

### Initial RED

Command:

```bash
node --test scripts/three-extension-command-surface.test.js
```

Result: 6 tests, 2 pass / 4 fail.

The four failures proved:

1. the three manifests exposed more than the approved five entries and four approved entries had stale metadata;
2. non-public contributed commands had no explicit `when: "false"` entry;
3. representative bundled-workflow commands remained visible;
4. 19 exact obsolete live references remained in current tests/scripts.

The two initial passes proved the structural manifest scan already contained no obsolete command/view fields and the complete-token matcher accepted every exact obsolete identifier without matching retained `workflowRegister.runs.retention.*` settings.

### GREEN

Final command:

```bash
node --test scripts/three-extension-command-surface.test.js
```

Result: 6 pass / 0 fail.

The final contract structurally parses manifest contributions, menus, views, and activation events. Its live text scan covers the three extensions' `src/` and current `test/`, `docs/workflows/`, `scripts/`, and `.github/workflows/`. Both `.` and `-` count as identifier characters. Failure diagnostics include path, line, identifier kind, and exact identifier.

The consistency Extension Host caller now opens the canonical wizard with `initialStage: "triage"`. A focused mutation that discarded the options produced 7 pass / 1 fail in `guiFirstSurfaces.test.js`; restoring the forwarding path produced 8 pass / 0 fail.

## Exact public command surface

The only visible command/category/title triples are:

```text
workflowRegister.openOperationHub | Bob | 操作ハブを開く
workflowRegister.openWorkflowBuilder | Bob Workflow | ワークフローを作成・編集
bobBazaar.openReviewGui | Bob Bazaar Review | レビューを開始
bobBazaar.authorProjectRulesFromDocuments | Bob Bazaar Review | 資料からプロジェクト規約を作成
bobCodeConsistency.openReviewWizard | Bob Code Consistency Review | 整合プレレビューを開始
```

Manifest partition:

| Extension | Contributed | Visible | Hidden with `when: "false"` |
| --- | ---: | ---: | ---: |
| workflow-register | 55 | 2 | 53 |
| bob-bazaar-review | 19 | 2 | 17 |
| bob-code-consistency-review | 17 | 1 | 16 |
| Total | 91 | 5 | 86 |

Every contributed command retains a matching `onCommand:` activation event. The cross-extension contract additionally proves activation, contribution, runtime registration, and exact hidden menu entries for:

- `workflowRegister.runWorkflow`
- `bobTemplate.generateWorkflow`
- `bobBazaar.records.createRecord`
- `bobCodeConsistency.initializeWorkspace`

## Obsolete live-reference result

- Initial exact live matches: 19
- Final manifest structural matches: 0
- Final live complete-token matches: 0
- Retained setting fixtures remain valid:
  - `workflowRegister.runs.retention.enabled`
  - `getConfiguration("workflowRegister.runs.retention")`

Existing absence tests now construct obsolete identifiers from fragments, so they continue checking removal without becoming live exact-token references themselves. The Extension Host triage smoke caller was migrated from the removed standalone command/view type to the canonical primary wizard and triage stage.

## Verification

### Plan-specified focused gate

```bash
node --test scripts/three-extension-command-surface.test.js
for extension in workflow-register bob-bazaar-review bob-code-consistency-review; do
  (cd "extensions/$extension" && npm run compile && node --test test/commandPalettePolicy.test.js)
done
git diff --check
```

Result:

- cross-extension contract: 6 pass / 0 fail
- workflow-register palette policy: 2 pass / 0 fail
- Bazaar palette policy: 1 pass / 0 fail
- Code Consistency palette policy: 1 pass / 0 fail
- all three TypeScript compiles: exit 0
- `git diff --check`: exit 0

Additional changed-surface focused suites:

- workflow-register: 33 pass / 0 fail
- bob-bazaar-review: 15 pass / 0 fail
- bob-code-consistency-review: 12 pass / 0 fail

### Full extension suites

| Extension | Pass | Fail | Skip |
| --- | ---: | ---: | ---: |
| workflow-register | 1368 | 0 | 1 |
| bob-bazaar-review | 706 | 0 | 0 |
| bob-code-consistency-review | 317 | 0 | 0 |

The workflow suite initially found one stale Japanese metadata expectation after the approved `Bob: 操作ハブを開く` change. After updating that contract, its focused check was 4/4 and the fresh full suite returned the result above.

### Policy gates

- workflow-register:
  - architecture: 221 TypeScript files
  - source/export-star: 221 TypeScript files
  - dependency: 3/3
  - schema: 5/5
  - unused report: all tools exit 0
- bob-bazaar-review:
  - architecture: 113 TypeScript files
  - source/export-star: 113 TypeScript files
  - dependency: 6/6
  - unused dependency policy: pass
  - artifact size: 20 files within 12,000 bytes
- bob-code-consistency-review:
  - architecture: 100 TypeScript files
  - source/export-star: 100 TypeScript files
  - dependency: 2/2
  - unused report: all tools exit 0

### Package and VSIX gates

| Extension | VSIX size | Entries | Policy |
| --- | ---: | ---: | --- |
| workflow-register | 1,077,247 bytes | 817 | PASS |
| bob-bazaar-review | 3,771,925 bytes | 1,841 | PASS |
| bob-code-consistency-review | 3,706,479 bytes | 1,915 | PASS |

Bazaar package smoke: 2 pass / 0 fail.

## Environment note

Running `scripts/triage-integrity-extension-host.test.js` directly with plain Node is not a supported execution mode and stopped before tests because the VS Code-provided `vscode` module is unavailable. Its canonical command/view migration is covered statically here; the actual VS Code Extension Host matrix belongs to Task 7.
