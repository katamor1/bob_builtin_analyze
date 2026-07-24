# 3拡張 UI・文書契約 Task 8 受入証跡

- 記録日: 2026-07-25（Asia/Tokyo）
- Pull Request: #144
- Base: `b141523c054ce04fb4d21d582621360066701c57`
- Product／test payload head: `e883d2b193bf628f8b5e80d40b4b78e732a132f1`
- 最終受入対象: この証跡を含むPR branchの最終head
- 判定: **Integration NO-GO / PR draft維持**

## 1. 対象契約

現在の操作者向け入口は次の4 routeである。

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

## 2. Task 6 文書契約の静的確認

次をPR差分として確認した。

- `scripts/three-extension-documentation-contract.json` が対象rootとcurrent／historical分類を一元管理する。
- `scripts/three-extension-documentation-contract.test.js` がcurrent文書の旧route・旧表示名を拒否する。
- historical文書は本文を保持し、冒頭の `Replaced:` または `Superseded:` 通知で現在のrouteを示す。
- 既存の設定名、内部module名、技術code fenceを利用者向け表示名と誤認しない境界を持つ。
- Bazaarのtemplate更新順序、MCP write opt-in、Code Consistencyのworkflow更新と既存入力backup-only契約を検査する。

履歴通知の修復監査では、通知追加対象の本文を元の内容へ戻した後、通知1行と空行だけを追加する差分へ統一した。

この証跡自体も`docs/`配下のcurrent文書として再帰分類される。そのため、最終的なdocumentation contractはproduct／test payload headではなく、この証跡を含むPR branchの最終headで実行する。

## 3. Task 7 Extension Host surface契約の静的確認

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
2. `vscode.commands.getCommands(true)` で公開commandと代表的な内部commandの登録を確認する。
3. 主GUI commandを実行し、正確なview typeとtab titleを確認する。
4. 開いたtabを閉じ、fixture READMEが残ることを確認する。
5. 未処理Promise rejectionが0件であることを確認する。
6. 資料選択を伴う規約作成commandは登録だけを確認し、非対話smokeでは実行しない。

`.github/workflows/extensions-quality.yml` は3つのUbuntu jobと3つのWindows matrix entryへ、同じ共有surface test、workspace fixture、公開command、内部command、主GUI期待値を渡す。

最新GREEN差分として、製品側のpanel titleをsmoke期待値へ合わせた。

```text
bobBazaarReviewGui             -> Bazaar レビュー
bobCodeConsistencyReviewWizard -> 整合プレレビュー
```

Code Consistencyの個別operator smokeも同じ主GUI titleへ同期した。

`c14497626241131c52083b112a86777a5493337f..e883d2b193bf628f8b5e80d40b4b78e732a132f1` の差分は次の3ファイルだけで、各ファイル1行追加・1行削除である。

```text
extensions/bob-bazaar-review/src/ui/reviewGui.ts
extensions/bob-code-consistency-review/src/webview/consistencyReviewWizard.ts
scripts/triage-integrity-extension-host.test.js
```

## 4. GitHub Actions起動状態の比較

### 4.1 直近の正常baseline

同じrepositoryでは、PR #141のhead `948a9df143656ccbbfc74e4fde285b2277645fd8` で次が成功している。

```text
extensions-quality:               29777975188 / success
code-consistency-review-scaffold: 29777975200 / success
```

`extensions-quality`ではUbuntu／Windowsの各jobが `Set up job`、`Checkout`、`Setup Node.js`、dependency／architecture／source policy、unit test、package、VSIX policy、Extension Host smokeまで実行して完了している。したがって、workflow定義とrepositoryのActions実行経路はこのbaseline時点ではrunner上で機能していた。

### 4.2 Product／test payload headの結果

`e883d2b193bf628f8b5e80d40b4b78e732a132f1` に紐づくrunは次のとおりである。

```text
extensions-quality:               30119225146
code-consistency-review-scaffold: 30119225117
```

`extensions-quality` の8 jobはすべて `completed/failure` だが、全jobで `steps` が空、job logが存在しない。

```text
89567430283 Extension source metrics
89567430325 Real-machine environment contracts
89567430332 Windows / bob-bazaar-review
89567430333 bob-bazaar-review
89567430334 Windows / bob-code-consistency-review
89567430342 Windows / workflow-register
89567430354 bob-code-consistency-review
89567430544 workflow-register
```

scaffold側の2 jobも同じ状態である。

```text
89567429912 Validate scaffold
89567430023 Validate VS Code extension
```

job logを直接取得した場合もGitHub側から`BlobNotFound`が返り、repository commandの失敗logは得られなかった。さらに、先行run `30088630427` と `30088630452` のfailed-job再実行でも、全jobがstep 0件のまま終了する状態を再現した。

したがって、checkout、dependency install、repository contract、compile、unit test、policy、package、Extension Host実行のいずれも開始していない。この結果は製品テスト失敗でも成功でもない。

### 4.3 他PRとの比較

別branch・別payloadを持つopen PRでも同じ起動前症状が記録されている。

- PR #145: dedicated Ubuntu／Windows matrixとworkflow-contract jobが `steps: null`／`logs_url: null` で終了し、再実行でも同じ状態。
- PR #153: repository compile、policy、full test、Ubuntu／Windows実行が未実行で、`steps: null`／`logs_url: null` をinfrastructure evidenceとして扱っている。

PR #144だけでなく独立した複数branchで同時期に同じ状態が出ており、直前にはPR #141で同じrepositoryのActionsが正常完走している。この比較は、現在の失敗がPR #144固有のrepository test failureではなく、repository／account側のActions起動基盤にあることを強く示唆する。ただしGitHub側の課金、利用上限、ポリシー、runner割当など、具体的な原因まではjob APIだけでは確定できない。

## 5. 未確認ゲート

PR branchの最終headでは次を実行済み証跡として扱わない。

```bash
node --test \
  scripts/three-extension-command-surface.test.js \
  scripts/three-extension-documentation-contract.test.js \
  scripts/extension-host-smoke-contract.test.js

git diff --check
```

また、3拡張のcompile、dependency／architecture／source policy、unit test、package、package policy、Ubuntu／Windows Extension Hostも未確認である。

## 6. 受入判断

次の理由によりPR #144はdraftを維持し、Ready化またはmergeを行わない。

- 文書契約とsurface契約は静的に整合しているが、repository上での実行結果がない。
- 最終headと同一SHAのUbuntu／Windows gate成功がない。
- packageとpackage policyの成功証跡がない。
- Actions jobがcheckout前に終了しており、失敗原因をrepository差分へ帰属できない。

Actions runnerがrepository stepを開始できる状態へ戻った後、**この証跡を含むPR branchの最終head**でTask 8の全gateを再実行する。headが移動した場合は、新しいheadで全gateを最初から実行する。
