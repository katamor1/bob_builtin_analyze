# Review findings tracking table

更新日: 2026-07-04

この表は、`docs/` にある 2026-07-04 のレビュー結果文書から、後続修正で追跡する対象をまとめたものです。

## 運用ルール

- `source` は元レビュー文書と該当行を示す。
- `canonical id` は修正・テスト・コミットの追跡単位に使う。
- 横断レビューの短縮 ID は深掘りレビューと番号が衝突するため、`extensions-review:<ID>` として扱い、`canonical id` に紐付ける。
- 状態は `open`、`in_progress`、`done`、`partial`、`duplicate`、`backlog` を使う。
- `done` にするときは、対応コミットと実行したテストまたは検証コマンドを追記する。

## Reviewed documents

| document | kind | tracking scope | current status | notes |
| --- | --- | --- | --- | --- |
| [workflow-register-deep-review-2026-07-04-14afe83c.md](workflow-register-deep-review-2026-07-04-14afe83c.md) | deep review | `WFR-01` to `WFR-15` | partial | `WFR-01`、`WFR-02`、`WFR-03`、`WFR-04`、`WFR-05`、`WFR-06`、`WFR-07`、`WFR-08`、`WFR-09`、`WFR-10`、`WFR-11`、`WFR-12`、`WFR-13` は対応済み。 |
| [workflow-register-maintainability-review-2026-07-04-14afe83c.md](workflow-register-maintainability-review-2026-07-04-14afe83c.md) | maintainability review | `WFR-MAINT-*` | backlog | ID 付き deep review と重なるものは canonical 側を優先する。 |
| [bob-bazaar-review-deep-review-2026-07-04-14afe83c.md](bob-bazaar-review-deep-review-2026-07-04-14afe83c.md) | deep review | `BBR-01` to `BBR-20` | done | `BBR-01` から `BBR-20` まで対応済み。 |
| [bob-bazaar-review-maintainability-review-2026-07-04-14afe83c.md](bob-bazaar-review-maintainability-review-2026-07-04-14afe83c.md) | maintainability review | `BBR-MAINT-*` | backlog | clamp や allowed root など deep review と重なる項目を含む。 |
| [bob-code-consistency-review-deep-review-2026-07-04-14afe83c.md](bob-code-consistency-review-deep-review-2026-07-04-14afe83c.md) | deep review | `CCR-01` to `CCR-16` | open | まだこの表上の対応済み項目はない。 |
| [bob-code-consistency-review-maintainability-review-2026-07-04-14afe83c.md](bob-code-consistency-review-maintainability-review-2026-07-04-14afe83c.md) | maintainability review | `CCR-MAINT-*` | backlog | path boundary、revision validation、size limits は deep review 側と重なる。 |
| [extensions-review-2026-07-04-14afe83c.md](extensions-review-2026-07-04-14afe83c.md) | cross-extension review | `extensions-review:<ID>` | duplicate / partial | canonical ID への対応表を下に置く。 |
| [extensions-maintainability-review-2026-07-04-14afe83c.md](extensions-maintainability-review-2026-07-04-14afe83c.md) | cross-extension maintainability review | `EXT-MAINT-*` | backlog | 3 拡張共通の CI、bundle、依存、README backlog。 |

## Canonical findings

### workflow-register

| canonical id | source | severity | summary | status | done commits / next action | verification |
| --- | --- | --- | --- | --- | --- | --- |
| `WFR-01` | `workflow-register-deep-review...:49` | High | `vscode.executeCommand` の実 command ID が guardrail 対象外 | done | `4b7ebb0f`, `e4daab04` | `extensions/workflow-register`: `npm.cmd test`; `git diff --check` |
| `WFR-02` | `workflow-register-deep-review...:50` | High | `guardrails.requireApproval` が engine で enforcement されない | done | `b2404b8c` | `extensions/workflow-register`: `npm.cmd run compile; node --test test\workflowEngineCommandAgent.test.js test\workflowAuthoringAdvancedSections.test.js`; `npm.cmd test`; `git diff --check` |
| `WFR-03` | `workflow-register-deep-review...:51` | High | singleStep 実行時に前段 `reviewing` step が暗黙 accepted される | done | `30e0264f` | `extensions/workflow-register`: `npm.cmd test`; `git diff --check` |
| `WFR-04` | `workflow-register-deep-review...:52` | High | retry/recovery が古い assistant 出力を再利用する可能性 | done | `83049480` | `extensions/workflow-register`: `npm.cmd run compile; node --test test\workflowRunRecovery.test.js test\runtimeWiring.test.js`; `npm.cmd test`; `git diff --check` |
| `WFR-05` | `workflow-register-deep-review...:53` | High | task snapshot の機密情報リスク | done | `8bef221a` | `extensions/workflow-register`: `npm.cmd run compile; node --test test\taskSnapshots.test.js test\workflowRegister.test.js`; `npm.cmd test`; `git diff --check` |
| `WFR-06` | `workflow-register-deep-review...:54` | Medium | `requires.files` / `preflight.files` が workspace 外の存在確認に使える | done | `ba88d772` | `extensions/workflow-register`: `npm.cmd test`; `git diff --check` |
| `WFR-07` | `workflow-register-deep-review...:55` | Medium | state / command result の prompt injection 境界が弱い | done | `0692e045` | `extensions/workflow-register`: `npm.cmd run compile; node --test test\agentStep.test.js test\bobWorkflowMessages.test.js test\runtimeWiring.test.js`; `npm.cmd test`; `git diff --check` |
| `WFR-08` | `workflow-register-deep-review...:56` | Medium | template renderer の暗黙 JSON key 解決が予測しづらい | done | `236d8a83` | `extensions/workflow-register`: `npm.cmd run compile; node --test test\workflowEngineCore.test.js test\workflowAuthoring.test.js`; `npm.cmd test`; `git diff --check` |
| `WFR-09` | `workflow-register-deep-review...:57` | Medium | GUI edit / AI repair の上書き対象 boundary | done | `ce7f6ae1` | `extensions/workflow-register`: `npm.cmd run compile; node --test test\workflowDocumentPath.test.js test\workflowRegister.test.js`; `npm.cmd test`; `git diff --check` |
| `WFR-10` | `workflow-register-deep-review...:58` | Medium | legacy workflow に definition hash がない | done | `3a6e76e4` | `extensions/workflow-register`: `npm.cmd run compile; node --test test\workflowParserV1.test.js`; `npm.cmd test`; `git diff --check` |
| `WFR-11` | `workflow-register-deep-review...:59` | Medium | schema の permissiveness と step-specific field 制約 | done | `9acda46b` | `extensions/workflow-register`: `npm.cmd run compile; node --test test\workflowParserV1.test.js test\workflowDefinitionLoader.test.js test\workflowRegister.test.js`; `npm.cmd test`; `git diff --check` |
| `WFR-12` | `workflow-register-deep-review...:60` | Medium | `maxResultBytes` が byte ではなく文字数 | done | `6c94c7e1` | `extensions/workflow-register`: `npm.cmd test`; `git diff --check` |
| `WFR-13` | `workflow-register-deep-review...:61` | Low | IBM Bob dependency の扱いが曖昧 | done | `2e6eb4c3` | `extensions/workflow-register`: `npm.cmd run compile; node --test test\workflowRegister.test.js`; `npm.cmd test`; `git diff --check` |
| `WFR-14` | `workflow-register-deep-review...:62` | Low | Workspace Trust gating がない | open | untrusted workspace で run / command / sink を抑止 |  |
| `WFR-15` | `workflow-register-deep-review...:63` | Low | run id 採番の競合余地 | open | UUID suffix または exclusive mkdir |  |

### bob-bazaar-review

| canonical id | source | severity | summary | status | done commits / next action | verification |
| --- | --- | --- | --- | --- | --- | --- |
| `BBR-01` | `bob-bazaar-review-deep-review...:48` | High | MCP tools が任意 `cwd` を信頼し allowed root を検証しない | done | `80f5ccf7` | `extensions/bob-bazaar-review`: `npm.cmd test`; `git diff --check` |
| `BBR-02` | `bob-bazaar-review-deep-review...:49` | High | `project_rules_init` write tool と read-only 認識のズレ | done | `15704007` | `extensions/bob-bazaar-review`: `npm.cmd test`; `git diff --check` |
| `BBR-03` | `bob-bazaar-review-deep-review...:50` | High | `bobBazaar.bzrPath` による任意 executable 実行面 | done | `768bf8dd` | `extensions/bob-bazaar-review`: `npm.cmd test`; `git diff --check` |
| `BBR-04` | `bob-bazaar-review-deep-review...:51` | High | diff size 設定と `truncateUtf8()` の異常値処理 | done | `d668a0fc` | `extensions/bob-bazaar-review`: `npm.cmd test`; `git diff --check` |
| `BBR-05` | `bob-bazaar-review-deep-review...:52` | High | review-result validation が project schema / rule ID set と十分連動しない | done | `68b8cb45` | `extensions/bob-bazaar-review`: `npm.cmd test`; `git diff --check` |
| `BBR-06` | `bob-bazaar-review-deep-review...:53` | High | raw diff/log/added file content の fence break / prompt injection | done | `aad8feb6` | `extensions/bob-bazaar-review`: `npm.cmd test`; `git diff --check` |
| `BBR-07` | `bob-bazaar-review-deep-review...:54` | Medium | `collectReviewContext` の packet 選択が曖昧 | done | `ec4f2234` | `extensions/workflow-register`: `npm.cmd test`; `extensions/bob-bazaar-review`: `npm.cmd test`; `git diff --check` |
| `BBR-08` | `bob-bazaar-review-deep-review...:55` | Medium | GUI 後の workflow step 自動完了が run/step を照合しない | done | `da66b8f7` | `extensions/workflow-register`: `npm.cmd test`; `extensions/bob-bazaar-review`: `npm.cmd test`; `git diff --check` |
| `BBR-09` | `bob-bazaar-review-deep-review...:56` | Medium | project rules 付き CLI command が default checklist へ fallback し得る | done | `6f1db85c` | `extensions/bob-bazaar-review`: `npm.cmd test`; `git diff --check` |
| `BBR-10` | `bob-bazaar-review-deep-review...:57` | Medium | review-result artifact の上書き | done | `25719710` | `extensions/bob-bazaar-review`: `npm.cmd test`; `git diff --check` |
| `BBR-11` | `bob-bazaar-review-deep-review...:58` | Medium | MCP stdio reader に最大 Content-Length がない | done | `b21ff2d2` | `extensions/bob-bazaar-review`: `npm.cmd test`; `git diff --check` |
| `BBR-12` | `bob-bazaar-review-deep-review...:59` | Medium | `.bob` 初期化時の workflow template 上書き | done | `828e22c1`, `a0fceb5a` | `extensions/bob-bazaar-review`: `npm.cmd run compile; node --test test\templateRefresh.test.js test\workflowBridge.test.js`; `npm.cmd test`; `git diff --check` |
| `BBR-13` | `bob-bazaar-review-deep-review...:60` | Medium | review packet の privacy leak | done | `934ecce3` | `extensions/bob-bazaar-review`: `npm.cmd test`; `git diff --check` |
| `BBR-14` | `bob-bazaar-review-deep-review...:61` | Medium | revision validation の強化 | done | `8c86eb05` | `extensions/bob-bazaar-review`: `npm.cmd test`; `git diff --check` |
| `BBR-15` | `bob-bazaar-review-deep-review...:62` | Medium | Bazaar diff parser の rename / binary coverage | done | `b668b76d` | `extensions/bob-bazaar-review`: `npm.cmd test`; `git diff --check` |
| `BBR-16` | `bob-bazaar-review-deep-review...:63` | Medium | config clamp と packet size 上限 | done | `d668a0fc` | `extensions/bob-bazaar-review`: `npm.cmd test`; `git diff --check` |
| `BBR-17` | `bob-bazaar-review-deep-review...:64` | Medium | MCP config 書き込みの堅牢性 | done | `05ebd74e` | `extensions/bob-bazaar-review`: `npm.cmd test`; `git diff --check` |
| `BBR-18` | `bob-bazaar-review-deep-review...:65` | Low | Webview nonce が `Date.now()` | done | `fae99b40` | `extensions/bob-bazaar-review`: `npm.cmd test`; `git diff --check` |
| `BBR-19` | `bob-bazaar-review-deep-review...:66` | Low | workflow-register provider registration の retry が弱い | done | `b42ac217` | `extensions/bob-bazaar-review`: `npm.cmd test`; `git diff --check` |
| `BBR-20` | `bob-bazaar-review-deep-review...:67` | Low | MCP text encoding config が GUI / command とずれる | done | `c085b107` | `extensions/bob-bazaar-review`: `npm.cmd test`; `git diff --check` |

### bob-code-consistency-review

| canonical id | source | severity | summary | status | done commits / next action | verification |
| --- | --- | --- | --- | --- | --- | --- |
| `CCR-01` | `bob-code-consistency-review-deep-review...:48` | High | workspace path boundary が一貫しない | open | `resolveWorkspacePathStrict` を導入 |  |
| `CCR-02` | `bob-code-consistency-review-deep-review...:49` | High | Git / Bazaar revision validation が弱い | open | Git SHA 化と Bazaar revision validator 共有 |  |
| `CCR-03` | `bob-code-consistency-review-deep-review...:50` | High | `bzrPath` を workflow args で上書きできる | open | user/global 設定限定または confirmation |  |
| `CCR-04` | `bob-code-consistency-review-deep-review...:51` | High | Bob output canonicalizer が補正しすぎる | open | raw validation と canonicalized validation を分離 |  |
| `CCR-05` | `bob-code-consistency-review-deep-review...:52` | High | generated artifacts の機密情報リスク | open | `.gitignore` helper、警告、redaction |  |
| `CCR-06` | `bob-code-consistency-review-deep-review...:53` | Medium | 文書抽出・diff・Bob input のサイズ上限不足 | open | bytes / rows / sheets / excerpts 上限 |  |
| `CCR-07` | `bob-code-consistency-review-deep-review...:54` | Medium | hand-written artifact path の workspace 内確認がない | open | validator 側も containment 必須化 |  |
| `CCR-08` | `bob-code-consistency-review-deep-review...:55` | Medium | traceability AI draft の永続化前検証が浅い | open | schema validation と item / field size limits |  |
| `CCR-09` | `bob-code-consistency-review-deep-review...:56` | Medium | `docsRoot` の workspace escape | open | docsRoot も strict resolver 対象にする |  |
| `CCR-10` | `bob-code-consistency-review-deep-review...:57` | Medium | Bob output fallback が stale output を拾い得る | open | fallback confirmation または run / review_id 照合 |  |
| `CCR-11` | `bob-code-consistency-review-deep-review...:58` | Medium | C/C++ analyzer の basename fallback | open | 複数候補時 warning + 不採用 |  |
| `CCR-12` | `bob-code-consistency-review-deep-review...:59` | Medium | package 出力先の stale files | open | 管理対象ファイルの clean と generation id |  |
| `CCR-13` | `bob-code-consistency-review-deep-review...:60` | Medium | AI draft / Bob output 抽出ロジックの曖昧さ | open | balanced parser、最大入力 bytes、複数候補エラー |  |
| `CCR-14` | `bob-code-consistency-review-deep-review...:61` | Medium | workflow inputs と trusted command options が混ざっている | open | user input と trusted command options を分離 |  |
| `CCR-15` | `bob-code-consistency-review-deep-review...:62` | Low | notification が軽すぎる | open | 重要操作は VS Code notification と report document |  |
| `CCR-16` | `bob-code-consistency-review-deep-review...:63` | Low | dependency / CI policy が弱い | open | lockfile、audit、license / SBOM、VSIX CI |  |

## Cross-review mapping

| source id | source | canonical id | status | notes |
| --- | --- | --- | --- | --- |
| `extensions-review:WR-01` | `extensions-review...:48` | `WFR-01` | duplicate / done | deep review の `WFR-01` として対応済み。 |
| `extensions-review:WR-02` | `extensions-review...:49` | `WFR-05` | duplicate / done | snapshot privacy は `WFR-05` として対応済み。 |
| `extensions-review:WR-03` | `extensions-review...:56` | `WFR-09` | duplicate / open | workflow builder edit boundary。 |
| `extensions-review:WR-04` | `extensions-review...:58` | `WR-04` | open | Windows reserved name / trailing dot 対応。deep review に同一 ID なし。 |
| `extensions-review:BBR-01` | `extensions-review...:50` | `BBR-01`, `BBR-02` | duplicate / done | MCP allowed root と write tool capability は対応済み。 |
| `extensions-review:BBR-02` | `extensions-review...:54` | `BBR-04`, `BBR-16` | duplicate / done | runtime clamp と packet size clamp は対応済み。 |
| `extensions-review:BBR-03` | `extensions-review...:55` | `BBR-07` | duplicate / done | packet 選択の曖昧さは `BBR-07` として対応済み。 |
| `extensions-review:BBR-04` | `extensions-review...:57` | `BBR-18` | duplicate / done | Webview nonce は対応済み。 |
| `extensions-review:CCR-01` | `extensions-review...:51` | `CCR-02` | duplicate / open | revision validation。 |
| `extensions-review:CCR-02` | `extensions-review...:52` | `CCR-01`, `CCR-07`, `CCR-09` | duplicate / open | path boundary。 |
| `extensions-review:CCR-03` | `extensions-review...:53` | `CCR-06` | duplicate / open | document / diff size limits。 |
| `extensions-review:CCR-04` | `extensions-review...:268` | `CCR-05` | duplicate / open | review package privacy。 |

## Maintainability backlog rollup

| tracking id | source | priority | summary | status | notes |
| --- | --- | --- | --- | --- | --- |
| `WFR-MAINT-H` | `workflow-register-maintainability-review...:401` | High | model 分割、source map 方針、madge、command ID guardrail、`type-fixes.d.ts` 撤去 | partial | command ID guardrail は `WFR-01` で対応済み。 |
| `WFR-MAINT-M` | `workflow-register-maintainability-review...:409` | Medium | lockfile / `npm ci`、unused checks、service 分割、parser re-export 整理、VSIX budget | backlog |  |
| `WFR-MAINT-L` | `workflow-register-maintainability-review...:417` | Low | core 段階分割、README 追記、PR metrics | backlog |  |
| `BBR-MAINT-H` | `bob-bazaar-review-maintainability-review...:452` | High | MCP allowed roots、MCP server 分割、runtime clamp、VSIX budget、madge | partial | runtime clamp は `BBR-04` / `BBR-16` で対応済み。 |
| `BBR-MAINT-M` | `bob-bazaar-review-maintainability-review...:460` | Medium | src 構造整理、extension composition root 化、packet URI/state 化、unused checks、lockfile | backlog | packet URI/state は `BBR-07` と連動。 |
| `BBR-MAINT-L` | `bob-bazaar-review-maintainability-review...:468` | Low | MCP tool 型分離、README、template / prompt / schema size budget、`export *` 禁止 | backlog |  |
| `CCR-MAINT-H` | `bob-code-consistency-review-maintainability-review...:460` | High | strict path resolver、revision validation、size limits、runtime dependency、VSIX CI | open | deep review の `CCR-01` / `CCR-02` / `CCR-06` / `CCR-16` と連動。 |
| `CCR-MAINT-M` | `bob-code-consistency-review-maintainability-review...:468` | Medium | extractor / analyzer / command 分割、unused checks、madge | backlog |  |
| `CCR-MAINT-L` | `bob-code-consistency-review-maintainability-review...:476` | Low | domain type 分割、traceability facade 分離、README、`.gitignore` helper | backlog |  |
| `EXT-MAINT-H` | `extensions-maintainability-review...:519` | High | 3 拡張共通の madge、VSIX contents、source map 方針、heavy dependency lazy loading、workflow model 方針 | backlog | 各拡張の maintainability backlog と重複あり。 |
| `EXT-MAINT-M` | `extensions-maintainability-review...:527` | Medium | unused checks、lockfile / `npm ci`、README、size budget | backlog |  |
| `EXT-MAINT-L` | `extensions-maintainability-review...:534` | Low | re-export shim 限定、LOC/file count PR comment、schema / TypeScript drift check | backlog |  |

## Additional verification checks

| tracking id | scope | check | status | done commits / next action | verification |
| --- | --- | --- | --- | --- | --- |
| `ENC-01` | `extensions/workflow-register`, `extensions/bob-bazaar-review`, `extensions/bob-code-consistency-review` | Git tracked text files are valid UTF-8 without BOM | done | `c17cbb34` | `extensions/bob-bazaar-review`: `npm.cmd test`; ad-hoc scan result: 343/343 `utf8`, 0 mismatches |

## Completed commit index

| commit | tracked ids | note |
| --- | --- | --- |
| `4b7ebb0f` | `WFR-01` | runtime command ID guardrail |
| `e4daab04` | `WFR-01` | public schema / test sync |
| `b2404b8c` | `WFR-02` | enforce approval guardrail holds before command execution and resume only after approval |
| `d668a0fc` | `BBR-04`, `BBR-16`, `extensions-review:BBR-02` | Bazaar review size clamp and truncate handling |
| `30e0264f` | `WFR-03` | block reviewed workflow steps until accepted |
| `83049480` | `WFR-04` | rerun generic agent retries and scope Bob recovery to the current step messages |
| `8bef221a` | `WFR-05`, `extensions-review:WR-02` | default task snapshots to no chat messages, redact secrets, and ignore workflow run artifacts |
| `aad8feb6` | `BBR-06` | dynamic Markdown fences for review packet content |
| `ba88d772` | `WFR-06` | workspace containment for preflight paths |
| `0692e045` | `WFR-07` | isolate workflow state and command result prompt data from executable instructions |
| `236d8a83` | `WFR-08` | add explicit JSON state template syntax and warnings for bare placeholders |
| `ce7f6ae1` | `WFR-09` | restrict GUI builder and AI repair overwrites to .bob workflow documents |
| `3a6e76e4` | `WFR-10` | add definition hashes to legacy workflow parsing |
| `9acda46b` | `WFR-11` | strict registration diagnostics, x- extension fields, and step-type field warnings |
| `6c94c7e1` | `WFR-12` | byte-safe command result truncation |
| `2e6eb4c3` | `WFR-13` | clarify IBM Bob as optional for authoring and required only for Bob UI registration |
| `8c86eb05` | `BBR-14` | Bazaar revision validation |
| `fae99b40` | `BBR-18`, `extensions-review:BBR-04` | random GUI nonce |
| `c085b107` | `BBR-20` | pass text encoding to MCP config |
| `b668b76d` | `BBR-15` | parse Bazaar rename and binary diffs |
| `05ebd74e` | `BBR-17` | harden MCP config writes |
| `6f1db85c` | `BBR-09` | require project rules assets for project-rules Bazaar review entrypoints |
| `c17cbb34` | `ENC-01` | enforce UTF-8 without BOM for tracked extension text files |
| `25719710` | `BBR-10` | back up existing review-result JSON and Markdown before atomic overwrite |
| `b21ff2d2` | `BBR-11` | reject oversized MCP stdio requests and return JSON-RPC parse errors |
| `a0fceb5a` | `BBR-12` | preview and confirm workflow template refresh before overwriting existing files |
