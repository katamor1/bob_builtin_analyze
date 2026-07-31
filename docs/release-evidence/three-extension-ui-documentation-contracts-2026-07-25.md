# 3拡張 UI・文書契約 Task 8 受入証跡

- 記録日: 2026-07-25（Asia/Tokyo）
- Pull Request: #144
- Base: `b141523c054ce04fb4d21d582621360066701c57`
- Task 7製品／surface payload head: `e883d2b193bf628f8b5e80d40b4b78e732a132f1`
- Task 6 runtime parity／専用CI payload head: `2b247b30bc3c10c72baf68a7d090dec5725ccb54`
- 最終受入対象: この証跡を含むPR branchの最終head
- 判定: **Integration NO-GO / PR draft維持**

## 1. 対象契約

現在の操作者向けrouteは次の4件である。

```text
workflowRegister.openOperationHub
workflowRegister.openWorkflowBuilder
bobBazaar.openReviewGui
bobCodeConsistency.openReviewWizard
```

Command Paletteで常時表示する項目は次の5件である。

```text
Bob: 操作ハブを開く
Bob Workflow: ワークフローを作成・編集
Bob Bazaar Review: レビューを開始
Bob Bazaar Review: 資料からプロジェクト規約を作成
Bob Code Consistency Review: 整合プレレビューを開始
```

workflowから呼ばれるその他のcommandは登録を維持し、通常のCommand Paletteでは非表示にする。

## 2. Task 6 文書契約

### 2.1 current／historical分類

次をPR差分として確認した。

- `scripts/three-extension-documentation-contract.json`が対象rootとcurrent／historical分類を一元管理する。
- `scripts/three-extension-documentation-contract.test.js`がcurrent文書の旧route・旧表示名を拒否する。
- historical文書は本文を保持し、冒頭の`Replaced:`または`Superseded:`通知で現在のrouteを示す。
- 設定名、内部module名、技術code fenceを利用者向け表示名と誤認しない境界を持つ。
- Bazaarのtemplate更新順序とMCP write opt-in、Code Consistencyのworkflow更新と既存入力backup-only契約を検査する。

履歴通知の修復監査では、通知対象本文を元の内容へ戻した後、通知1行と空行だけを追加する差分へ統一した。

### 2.2 runtime parity追加監査

current詳細設計を実装型・実在moduleと照合した結果、初回の表示名中心の契約では検出できなかった意味的ずれを発見した。

#### Bazaar Review

旧記述には次の不一致があった。

- `review-run.json`を`bazaar-review-run/v3`と記載していたが、codecのcurrent schemaは`bazaar-review-run/v1`。
- snake_case fieldと`decision` stageを記載していたが、runtimeはcamelCase fieldと`triage` phase。
- cached panelを`reveal()`すると記載していたが、command呼出しごとに新しい`bobBazaarReviewGui`を生成する。
- 実装に存在しない規約作成module名を列挙していた。

次でRED条件と修正を固定した。

```text
b319a5b0c8d5e1a9e06ebb59ea62b3d56ee46082  test: expose Bazaar documentation runtime drift
d6a39975167b6c1a8f524037069286263b8645ce  docs: align Bazaar design with runtime contracts
scripts/bazaar-review-documentation-parity.test.js
```

#### Code Consistency Review

旧記述には次の不一致があった。

- stageを`input / preprocess / result / decision`と記載していたが、runtimeは`review / traceability / review-result-capture / triage`。
- cached panelを再利用すると記載していたが、command呼出しごとに新しい`bobCodeConsistencyReviewWizard`を生成する。
- 存在しない`core/traceabilityStore.ts`を列挙し、実体の`core/traceabilityCatalogStore.ts`を欠いていた。

次でRED条件と修正を固定した。

```text
67557b94d26197ce3626311f43b3b3271f009e17  test: expose Code Consistency documentation drift
6cf81a30fa46d4e5fbb5f869ae143fe5edb953e7  docs: align Code Consistency design with runtime contracts
scripts/code-consistency-documentation-parity.test.js
```

#### workflow-register

Operation Hub、Builder、run-state codecは実装と設計が一致していたため、誤修正せず次を回帰契約へ固定した。

- Operation Hubはcached panelを`reveal()`する。
- Builderはsingle current panelを持ち、`empty / standard-template / edit`の3モードを扱う。
- writable run-state codecのcurrent schemaは`workflow-register/run-state/v1`。
- unversioned stateはv1へmigrationし、future versionはread-onlyで扱う。

```text
ff504352aeea9d5303f56dff15a348282fa4a5b1  test: lock workflow-register documentation parity
scripts/workflow-register-documentation-parity.test.js
```

この証跡自体も`docs/`配下のcurrent文書として再帰分類される。そのため最終documentation contractは、上記payload headではなく、この証跡を含むPR branchの最終headで実行する。

## 3. Task 7 Extension Host surface契約

次の成果物が存在する。

```text
scripts/extension-host-smoke-contract.test.js
scripts/three-extension-surface-extension-host.test.js
extensions/workflow-register/test/fixtures/gui-surface-workspace/README.md
extensions/bob-bazaar-review/test/fixtures/gui-surface-workspace/README.md
extensions/bob-code-consistency-review/test/fixtures/gui-surface-workspace/README.md
```

共有surface testは次を行う。

1. 対象拡張をactivationする。
2. `vscode.commands.getCommands(true)`で公開commandと代表的な内部commandの登録を確認する。
3. 主GUI commandを実行し、正確なview typeとtab titleを確認する。
4. 開いたtabを閉じ、fixture READMEが残ることを確認する。
5. 未処理Promise rejectionが0件であることを確認する。
6. 資料選択を伴う規約作成commandは登録だけを確認し、非対話smokeでは実行しない。

`.github/workflows/extensions-quality.yml`は3つのUbuntu jobと3つのWindows matrix entryへ、同じsurface test、workspace fixture、公開command、内部command、主GUI期待値を渡す。

製品側のpanel titleは次へ同期済みである。

```text
bobBazaarReviewGui              -> Bazaar レビュー
bobCodeConsistencyReviewWizard -> 整合プレレビュー
```

`c14497626241131c52083b112a86777a5493337f..e883d2b193bf628f8b5e80d40b4b78e732a132f1`の製品GREEN差分は次の3ファイルだけで、各ファイル1行追加・1行削除である。

```text
extensions/bob-bazaar-review/src/ui/reviewGui.ts
extensions/bob-code-consistency-review/src/webview/consistencyReviewWizard.ts
scripts/triage-integrity-extension-host.test.js
```

## 4. 専用契約CI

`2b247b30bc3c10c72baf68a7d090dec5725ccb54`で`.github/workflows/three-extension-ui-contracts.yml`を追加した。

同一jobで次を実行する。

```bash
node --test \
  scripts/three-extension-command-surface.test.js \
  scripts/three-extension-documentation-contract.test.js \
  scripts/bazaar-review-documentation-parity.test.js \
  scripts/code-consistency-documentation-parity.test.js \
  scripts/workflow-register-documentation-parity.test.js \
  scripts/extension-host-smoke-contract.test.js
```

PRではbase SHAからHEADまでの`git diff --check`も実行する。checkoutとsetup-nodeは既存品質workflowと同じimmutable commit SHAを使用する。

## 5. GitHub Actions起動状態

### 5.1 正常baseline

同じrepositoryではPR #141のhead `948a9df143656ccbbfc74e4fde285b2277645fd8`で次が成功している。

```text
extensions-quality:               29777975188 / success
code-consistency-review-scaffold: 29777975200 / success
```

この`extensions-quality`ではUbuntu／Windows jobがSet up、Checkout、Node setup、policy、unit test、package、VSIX policy、Extension Host smokeまで実行して完了している。

### 5.2 現在の起動前失敗

Task 6 parityと専用CIを含むpayload head `2b247b30bc3c10c72baf68a7d090dec5725ccb54`では次のrunが生成された。

```text
code-consistency-review-scaffold: 30161406772
three-extension-ui-contracts:      30161406777
extensions-quality:                30161406795
```

専用CIのjob `89687213042`は`completed/failure`だが、`steps: null`、job logなしで終了した。既存2workflowも同じ起動前失敗である。

先行run、公式GitHub Status上のActions障害解決後の再実行、failed-job単体再実行でも、全jobがstep 0件のまま終了した。job logを直接取得すると`BlobNotFound`となり、repository commandの失敗logは得られなかった。

したがってcheckout、dependency install、repository contract、compile、unit test、policy、package、Extension Host実行はいずれも開始していない。この結果は製品テスト失敗でも成功でもない。

別branch・別payloadのopen PR #145、#153でも同時期に同じ`steps: null`／`logs_url: null`症状が報告されている。具体的な原因が課金、利用上限、policy、runner allocationのどれかはjob APIだけでは確定できない。

## 6. 未確認ゲート

PR branchの最終headでは次を実行済み証跡として扱わない。

```bash
node --test \
  scripts/three-extension-command-surface.test.js \
  scripts/three-extension-documentation-contract.test.js \
  scripts/bazaar-review-documentation-parity.test.js \
  scripts/code-consistency-documentation-parity.test.js \
  scripts/workflow-register-documentation-parity.test.js \
  scripts/extension-host-smoke-contract.test.js

git diff --check <base>...HEAD
```

また、3拡張のcompile、dependency／architecture／source policy、unit test、package、package policy、Ubuntu／Windows Extension Hostも未確認である。

## 7. 受入判断

次の理由によりPR #144はdraftを維持し、Ready化またはmergeを行わない。

- runtime parityの既知不一致は修正し、回帰テストを追加したが、private repository全体での実行結果がない。
- 最終headと同一SHAのUbuntu／Windows gate成功がない。
- packageとpackage policyの成功証跡がない。
- Actions jobがcheckout前に終了しており、失敗原因をrepository差分へ帰属できない。

Actions runnerがrepository stepを開始できる状態へ戻った後、**この証跡を含むPR branchの最終head**でTask 8の全gateを再実行する。headが移動した場合は、新しいheadで全gateを最初から実行する。
