# GUIファースト操作 Operator / UAT ガイド

- 対象: 3拡張の統合operator surface
- 対象拡張: `workflow-register`, `bob-bazaar-review`, `bob-code-consistency-review`
- 前提: 常時表示するCommand Palette entryは次の5件だけとする。

| Job | 公開表示名 | Command ID |
| --- | --- | --- |
| workflow運用 | `Bob: 操作ハブを開く` | `workflowRegister.openOperationHub` |
| workflow作成・編集 | `Bob Workflow: ワークフローを作成・編集` | `workflowRegister.openWorkflowBuilder` |
| Bazaar review | `Bob Bazaar Review: レビューを開始` | `bobBazaar.openReviewGui` |
| 資料からproject rules作成 | `Bob Bazaar Review: 資料からプロジェクト規約を作成` | `bobBazaar.authorProjectRulesFromDocuments` |
| コード整合review | `Bob Code Consistency Review: 整合プレレビューを開始` | `bobCodeConsistency.openReviewWizard` |

workflow、validation、record、capture、decision、retention用の内部commandは登録を維持するが、通常のCommand Paletteには表示しない。

## 1. 起動とsoft dependency

1. VS Code / Bob IDEで対象workspaceを開く。
2. `Bob: 操作ハブを開く`を実行し、wide panelの`Bob 操作ハブ`を開く。
3. setup、workflow catalog、run一覧、optional integrationの利用可否を確認する。
4. IBM Bobまたはcompanion extensionを無効化してもactivationが失敗せず、利用できないactionに理由が表示されることを確認する。
5. Explorerに重複する旧run viewや別のrun status UIがなく、実行操作が操作ハブへ集約されていることを確認する。

## 2. ワークフロー作成・編集 UAT

1. `Bob Workflow: ワークフローを作成・編集`を開く。
2. 次の3モードだけが表示されることを確認する。
   - 空のworkflowから作成
   - `標準テンプレートから作成`
   - 既存workflowを編集
3. validなworkflowをPreviewし、DiagnosticsとDiffを確認する。
4. cancelして既存fileとbackupが変化しないことを確認する。
5. 再度保存し、明示確認後にbackupと更新fileが作成されることを確認する。
6. 別sessionでfileを変更し、stale sessionからの保存が拒否されることを確認する。

合格条件:

- template調整用の独立公開panelまたは公開commandがない。
- template生成も通常のPreview / Diff / confirmation / backup / transactional saveを通る。
- 保存後にworkflow catalogが更新される。

## 3. Bazaar Review UAT

1. `Bob Bazaar Review: レビューを開始`を開く。
2. campaign、target mode、revision / range、review IDを確認する。
3. 対象情報を取得し、Bazaar操作が`bzr --no-aliases`経路で実行されることを確認する。
4. Review Runを開始し、`review-run.json`と`review-packet.md`が同じidentityで保存されることを確認する。
5. 同じpanel内の`レビュー結果取り込み`stageへ進み、expected review IDとschema validationを確認する。
6. 同じpanel内の`指摘確認・振り分け`stageへ進み、decision、owner、action、reasonを保存する。
7. `レビュー実績`stageでpending、rate、rule / target mode trend、warningを確認し、JSON / Markdown / CSVをexportする。
8. refresh / export前後でpacket、result、decision、record、summaryのbytesが変化しないことを確認する。

合格条件:

- capture、decision、metricsの独立公開panel / commandがない。
- active Review Run identityをstageごとに再入力しない。
- invalid result、stale revision、unsafe workspace rootを保存前に拒否する。
- MCPはread-only既定で、write toolは明示opt-inとallowed rootを要求する。

## 4. 資料からproject rules作成 UAT

1. `Bob Bazaar Review: 資料からプロジェクト規約を作成`を開く。
2. source選択、抽出preview、AI送信対象の名称・件数・byte数を確認する。
3. AI consent前にworkflowを開始しないことを確認する。
4. proposalを規約候補の確認・適用で個別判定する。
5. apply preview、backup、journal、transaction、rollback契約を確認する。
6. MCPの`project_rules_init`が`BOB_BAZAAR_ENABLE_WRITE_TOOLS=1`と`BOB_BAZAAR_ALLOWED_ROOTS`なしでは公開・実行されないことを確認する。

## 5. Code Consistency Review UAT

1. `Bob Code Consistency Review: 整合プレレビューを開始`を開く。
2. workflowがない場合だけ初期化cardが表示されることを確認する。
3. workflow templateが異なる場合はbackup後に更新され、既存`review-input.yaml`は上書きされずbackupだけが作成されることを確認する。
4. input / evidenceを選択する。
5. 同じpanel内の`トレーサビリティ整理`stageでproposed itemを承認・棄却・廃止する。
6. review-inputを生成し、preprocessing / package previewを確認する。
7. 同じpanel内の`レビュー結果取り込み`stageでBob outputをcapture・validateする。
8. 同じpanel内の`指摘確認・振り分け`stageでdecisionを保存する。
9. source change conflict、two-window revision conflict、legacy migration、backup / projectionを確認する。

合格条件:

- traceability、capture、decisionの各serviceが独立した公開panel / commandを持たない。
- AIはproposed候補までを担当し、accepted / rejected / deprecatedを確定しない。
- source contextと人間decisionを別成果物として維持する。

## 6. Bob 操作ハブ / run UAT

1. workflow catalogから任意workflowを開始する。
2. run cardが`.bob/workflows/runs/<runId>/run.json`のstatus、current step、revisionと一致することを確認する。
3. 状態に応じてresume、retry、accept、accept-and-next、run-next、pause、held recovery、diagnostics、artifact操作が表示されることを確認する。
4. task snapshot importとartifact reuseでpreview / digest / provenanceを確認する。
5. retention previewでprotected runを除外し、明示確認後だけcleanupすることを確認する。
6. 同じrunへのmutationが直列化され、stale revisionが拒否されることを確認する。

## 7. Visual / keyboard / Console gate

各primary panelで次を確認する。

- 200% zoomで横スクロールに依存せず主要操作へ到達できる。
- High Contrastでfocus、status、warning、disabled reasonを識別できる。
- Tab / Shift+Tabだけで主要actionへ到達できる。
- focus indicatorが見える。
- stale completion後もcurrent stageとstatusを見失わない。
- Developer Tools Consoleのuncaught exception、unhandled rejection、CSP violationが0件である。

## 8. Regression gate

repository rootで次を実行する。

```powershell
node --test scripts/three-extension-command-surface.test.js scripts/three-extension-documentation-contract.test.js
git diff --check
```

各拡張では、その`package.json`に定義されたcompile、policy、unit、package、package policyを実行する。Linux / WindowsのExtension Host gateは同一source head SHAで、activation、5公開command、4primary panel、代表hidden commandを確認する。

## 9. Evidence

最低限、次を保存する。

- tested source head SHA
- OS、VS Code / Bob IDE、各extension version
- VSIX SHA-256
- start state / operation result screenshot
- relevant `run.json` / `control.json` / manifestのredacted copy
- Console log
- testcaseごとのpass / fail / pendingと理由

IBM Bob実環境caseが未実施の場合は`pending`とし、automated gateだけでproduct release passへ繰り上げない。
