# Bob Workflow Security and Privacy Operations

- 対象: `workflow-register`, `bob-bazaar-review`, `bob-code-consistency-review`
- 読者: operator、reviewer、extension maintainer
- 原則: trusted workspaceでもcommand、path、cwd、revision、AI / Webview inputを防御的に検証する。

## 1. 公開入口

通常operatorがCommand Paletteから使用する入口は次の5件だけです。

```text
workflowRegister.openOperationHub
workflowRegister.openWorkflowBuilder
bobBazaar.openReviewGui
bobBazaar.authorProjectRulesFromDocuments
bobCodeConsistency.openReviewWizard
```

workflow / record / validation / run operation用commandは登録を維持しますが、通常のoperator手順では`Bob 操作ハブ`または各主GUIから実行します。

## 2. trust boundary

| boundary | 許可 | 禁止 / 拒否 |
|---|---|---|
| Workflow file | resolved Bob root内の`.bob/workflows/<name>/WORKFLOW.md` | workspace外、symlink / junction escape、Windows予約名、trailing dot / space |
| Workflow run state | `.bob/workflows/runs/` | 任意pathへのrun state保存 |
| Workflow authoring | Preview / Diagnostics / Diff / 明示確認 / backup / transactional save | 未確認の上書き、stale sessionからの保存 |
| Bazaar MCP | `BOB_BAZAAR_ALLOWED_ROOTS`内のcwd | allowed root外、write toolの既定有効化 |
| Bazaar MCP write | `BOB_BAZAAR_ENABLE_WRITE_TOOLS=1`時の`project_rules_init` | その他のwrite operation、暗黙opt-in |
| Bazaar CLI | `bzr --no-aliases <command>` | alias影響を受ける直呼び、shell文字列連結 |
| Code Consistency package | `.bob-review/review-package` | absolute path、`..`、Bob output / decision領域との混同 |
| Bob output | `.bob-review/bob-output/*.yaml` | package直下やworkspace外への保存 |
| 指摘確認・振り分けartifact | `.bob-review/human-triage/` | review packageや任意docs配下への保存 |
| Traceability catalog | `.bob-trace/traceability-catalog.json` | `.bob-review/`やAI draft作業領域への保存 |
| Traceability gate report | `.bob-trace/gate-report.md` | `.bob-review/`や任意absolute path |
| Traceability AI draft | `.bob-trace/ai-traceability-draft/` | workspace外、catalog / report正本の直接上書き |
| Rule authoring local data | `.bob/review/rule-authoring/**` | remote artifact、notification、telemetryへの本文転記 |

## 3. operator前チェック

| 項目 | command /確認 | 期待結果 |
|---|---|---|
| repository contract | `node --test scripts/three-extension-command-surface.test.js scripts/three-extension-documentation-contract.test.js scripts/extension-host-smoke-contract.test.js` | all pass |
| extension test | 各extensionで`npm test` | all pass |
| dependency / architecture / source | 各extensionのpolicy script | all pass |
| package | 各extensionで`npm run package` | VSIX generated |
| VSIX policy | 各extensionで`npm run package:policy` | budget / content policy pass |
| diff | `git diff --check` | whitespace errorなし |
| hosted smoke | Linux / Windowsの同一head | activation、5 public commands、4 panelsがpass |

## 4. workflow authoring

保存対象はresolved workspace root内の`.bob/workflows/<name>/WORKFLOW.md`に限定します。

| 確認 | 期待 |
|---|---|
| workflow folder name | `name`と同じstable ID。英数字、`.`、`_`、`-`のみ。 |
| preview | parser / validatorのerrorがない。 |
| diff | existing fileとの差分を保存前に確認できる。 |
| confirmation | replacementを明示承認する。cancel時は変更しない。 |
| backup | replacement前に同一workflow folder内へ作成する。 |
| transaction | expectation、lock、physical identityを再検証してatomic saveする。 |
| command guardrail | unregistered / denied commandを実行しない。 |
| task snapshot | `includeMessages`は既定`false`。必要時だけ有効化する。 |

## 5. AI / human boundary

- AIはtraceability、review result、rule proposalの候補を作成できる。
- AIはtraceabilityのaccepted / rejected / deprecatedを確定しない。
- AIはfindingの採否、owner、正式actionを確定しない。
- AIはproject-owned rule assetを直接変更しない。
- hostがschema、ID、path、base hash、citation、evidence referenceを再検証する。
- 人間decisionはAI raw outputと別artifactへ保存する。

## 6. privacy handling

| 領域 | 内容 | 既定の扱い |
|---|---|---|
| `.bob/workflows/runs/` | run state、step status、artifact path | ignore推奨 |
| `.bob/workflows/runs/**/task-snapshots/` | Bob task metadata、optional messages | ignore必須。messagesは既定保存しない。 |
| `.bob/review/results/` | Bazaar review-result JSON / Markdown | project policyに従う。 |
| `.bob/review/rule-authoring/**` | raw document text、raw AI response、backup、transaction | ignore必須、remote共有禁止。 |
| `.bob-review/` | review package、Bob output、decision artifact | ignore必須。 |
| `.bob-trace/ai-traceability-draft/` | AI draft prompt / output | ignore必須。 |
| `.bob-trace/traceability-catalog.json` | sidecar traceability | project policyに従いversioning可。 |
| `.bob-trace/gate-report.md` | gate report | project policyに従いversioning可。 |

推奨`.gitignore`:

```gitignore
.bob/workflows/runs/
.bob/review/results/
.bob/review/rule-authoring/
.bob-review/
.bob-trace/ai-traceability-draft/
```

## 7. incident response

| 事象 | 初動 | 記録 |
|---|---|---|
| workspace外へ保存されそうになった | 操作を中止し、input optionとerrorを保存する。 | command、path、error、root |
| Bob outputに機密情報が含まれた | `.bob-review/bob-output/`を共有せず、redaction後に再生成する。 | affected path、owner |
| task snapshotにmessageを含めた | `includeMessages`を無効化し、snapshotを削除または隔離する。 | run ID、setting |
| MCP allowed rootが誤っている | `.bob/mcp.json`とenvを修正し、MCP serverを再起動する。 | allowed roots、cwd |
| write toolが意図せず有効 | `BOB_BAZAAR_ENABLE_WRITE_TOOLS`を削除し、変更artifactを監査する。 | process env、artifact hashes |
| Bazaar aliasで結果が壊れた | `bzr --no-aliases`の実行logを確認する。 | command log |
| stale panelが保存を試みた | revision / generation conflictを記録し、最新状態を再読込する。 | panel、run ID、revision |

## 8. release gate

- command ID / provider ownership / hidden Palette entryのcontract testがある。
- path traversal、absolute path、symlink / junction escape、kind mismatchのtestがある。
- MCP / VCS cwdがallowed root内に収まる。
- revision / option injectionを拒否する。
- preview、confirmation、backup、transactionの順序をtestする。
- generated artifactのignoreと共有注意書きがある。
- VSIXに不要なdocs、source map、secret、fixture raw dataが入らない。
- 200% zoom、High Contrast、keyboard、Consoleを実機UATで確認する。
