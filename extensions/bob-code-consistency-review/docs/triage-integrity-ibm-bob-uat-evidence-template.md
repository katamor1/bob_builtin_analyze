# Human Triage Integrity IBM Bob UAT Evidence

> このfileはtemplateである。実施時は`docs/release-evidence/triage-integrity-ibm-bob-uat-YYYY-MM-DD.md`へcopyし、原本を変更しない。

## 1. Run metadata

| 項目 | 値 |
| --- | --- |
| 実施日 |  |
| 開始時刻 / 終了時刻 |  |
| 実施者 |  |
| Reviewer |  |
| Repository | `katamor1/bob_builtin_analyze` |
| Pull Request | `#74` |
| Branch | `agent/bob-code-consistency-review-triage-integrity` |
| Tested commit SHA |  |
| VSIX build commit SHA |  |
| OS / version |  |
| VS Code / Bob IDE |  |
| IBM Bob extension |  |
| workflow-register |  |
| bob-code-consistency-review |  |
| Workspace / sample |  |
| Evidence directory |  |

SHA不一致の場合は実施を中止し、正しいVSIXで最初からやり直す。

## 2. Preconditions

- [ ] sandbox workspaceである
- [ ] Tested commitとVSIX build commitが一致する
- [ ] IBM Bobが有効
- [ ] workflow-registerが有効
- [ ] bob-code-consistency-reviewが有効
- [ ] Developer Tools Consoleをclearした
- [ ] screenshot / logの保存先を作成した
- [ ] 秘密情報・顧客dataを使用していない

## 3. Test results

| Testcase | 内容 | Result (`pass` / `fail` / `pending`) | Evidence | 備考 / issue |
| --- | --- | --- | --- | --- |
| CCR-RT-023 | Bob Workflow UI preprocess |  |  |  |
| CCR-RT-024 | Bob agentによるpre-review |  |  |  |
| CCR-RT-026 | workflow result handoff capture |  |  |  |
| CCR-RT-031 | Bob Workflow UI E2E |  |  |  |
| CCR-RT-036 | generate / edit / save / reload |  |  |  |
| CCR-RT-037 | source change conflict |  |  |  |
| CCR-RT-038 | two-window revision conflict |  |  |  |
| CCR-RT-039 | legacy migration |  |  |  |
| CCR-RT-040 | backup / projection |  |  |  |
| UAT-WEBVIEW-001 | 200% zoom / layout |  |  |  |
| UAT-WEBVIEW-002 | High Contrast |  |  |  |
| UAT-WEBVIEW-003 | Tab / Shift+Tab / focus |  |  |  |
| UAT-WEBVIEW-004 | validation / conflict wording |  |  |  |
| UAT-MCP-001 | representative MCP smoke |  |  |  |
| UAT-CONSOLE-001 | Console error review |  |  |  |

## 4. Workflow run evidence

| 項目 | 値 / evidence |
| --- | --- |
| workflow ID / source |  |
| run ID |  |
| preprocess result |  |
| Bob agent result |  |
| capture result |  |
| validation result |  |
| triage result |  |
| result handoff確認 |  |
| run state export |  |
| Bob output SHA-256 |  |
| triage source SHA-256 |  |
| triage decisions revision |  |

## 5. Human Triage artifact inventory

| File | 存在 | SHA-256 | 判定 / note |
| --- | --- | --- | --- |
| `triage-source.yaml` |  |  |  |
| `triage-decisions.yaml` |  |  |  |
| `triage-result.yaml` |  |  |  |
| `accepted-findings.md` |  |  |  |
| `rejected-findings.md` |  |  |  |
| `investigation-items.md` |  |  |  |
| `questions-to-author.md` |  |  |  |
| `follow-up-actions.md` |  |  |  |
| `migration-report.md` |  |  |  |
| `*.bak-*` |  |  |  |

## 6. Conflict evidence

### Source conflict

| 項目 | 値 |
| --- | --- |
| stale source SHA-256 |  |
| current source SHA-256 |  |
| displayed message |  |
| stale saveでcurrent fileを上書きしなかった |  |
| reopen後にcurrent sourceを表示した |  |
| evidence |  |

### Revision conflict

| 項目 | 値 |
| --- | --- |
| stale decision revision |  |
| current decision revision |  |
| displayed message |  |
| first writerのdecisionを保持した |  |
| reopen後にcurrent revisionを表示した |  |
| evidence |  |

## 7. Migration evidence

| 項目 | 値 |
| --- | --- |
| matching source ID | `PRE-001` |
| unmatched source ID | `OLD-999` |
| migrated decision |  |
| unmatched IDがdecision storeに入っていない |  |
| migration report |  |
| legacy backup |  |
| accepted projection |  |

## 8. Webview and accessibility

- [ ] source contextとhuman decision fieldを区別できる
- [ ] suggested ownerがownerへ自動入力されない
- [ ] 未判断optionが明確
- [ ] 200% zoomで操作できる
- [ ] High Contrastで境界とstatusを識別できる
- [ ] Tab順序が自然
- [ ] focus indicatorが見える
- [ ] select / checkbox / date inputをkeyboardで操作できる
- [ ] source conflictとrevision conflictを区別できる
- [ ] status更新後に結果を見失わない
- [ ] screenshotをredact済み

観察事項:

```text

```

## 9. MCP evidence

| 項目 | 値 |
| --- | --- |
| MCP server / connection |  |
| representative tool |  |
| request summary |  |
| result summary |  |
| workflow run stateとの対応 |  |
| Human Triage fileを無断更新しなかった |  |
| failure handling |  |
| credential redaction |  |

## 10. Developer Tools Console

| 種別 | 件数 | Evidence / disposition |
| --- | ---: | --- |
| uncaught exception |  |  |
| unhandled rejection |  |  |
| CSP violation |  |  |
| Webview error |  |  |
| provider error |  |  |
| MCP error |  |  |
| known warning |  |  |

許容warning:

| Message | 発生条件 | 影響 | Tracking issue | Reviewer approval |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 11. Defects and deviations

| ID | Severity | Description | Reproduction | Owner | Status |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

未実施項目:

| Testcase | 理由 | Owner | 再実施条件 |
| --- | --- | --- | --- |
|  |  |  |  |

## 12. Final decision

- [ ] `pass`
- [ ] `fail`
- [ ] `pending`

Decision rationale:

```text

```

Release recommendation:

```text

```

## 13. Sign-off

| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Operator |  |  |  |
| Reviewer |  |  |  |
| Release owner |  |  |  |
