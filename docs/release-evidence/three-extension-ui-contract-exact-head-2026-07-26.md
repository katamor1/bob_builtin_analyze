# 3拡張 UI契約CI exact-head補足証跡

- 記録日: 2026-07-26（Asia/Tokyo）
- Pull Request: #144
- 対象branch: `codex/ui-doc-command-surface-20260723`
- 先行head: `e0388453b1d22c58494fa83d87202aeb1a5f6dcd`
- exact-head契約RED commit: `db58cb042610a87ce40a4f4e67a4d96db202223e`
- exact-head契約GREEN commit: `807e37ce2938ae142d7d17eaabe9ae2a18a4b115`
- 最終受入対象: この補足証跡を含むPR branchの最終head
- 判定: **Integration NO-GO / PR draft維持**

## 1. 発見した受入証跡のずれ

専用workflowは`pull_request`で起動するが、checkout対象の`ref`を明示していなかった。一方、Task 8はPR branchの最終headと同一SHAで契約、差分、compile、package、Extension Hostを検証することを要求する。

merge refまたはevent既定refを暗黙利用した結果をbranch headの受入証跡として扱わないよう、checkout SHA、実checkout SHA、`git diff --check`のheadを同じ式へ固定した。

## 2. RED契約

`scripts/three-extension-ui-contract-workflow.test.js`を追加し、次を要求した。

```text
checkout ref
  = github.event.pull_request.head.sha || github.sha

EXPECTED_HEAD_SHA
  = github.event.pull_request.head.sha || github.sha

git rev-parse HEAD
  = EXPECTED_HEAD_SHA

HEAD_SHA
  = github.event.pull_request.head.sha || github.sha

pull_request diff
  = BASE_SHA...HEAD_SHA
```

旧workflow snapshotに対する局所実行結果は次のとおりである。

```text
node --test scripts/three-extension-ui-contract-workflow.test.js
1 test / 0 pass / 1 fail
missing exact-head checkout ref
```

## 3. GREEN実装

`.github/workflows/three-extension-ui-contracts.yml`を次のように更新した。

- `actions/checkout`の`ref`をexact head式へ固定する。
- checkout直後に`git rev-parse HEAD`と期待SHAを比較する。
- PR差分検査を`BASE_SHA...HEAD_SHA`へ固定する。
- push／manual dispatchでは`github.sha`を使用する。
- 専用jobでexact-head契約を含む7 focused contractを実行する。

対象Git blobは次のとおりである。

```text
e21dff9c2cc4bcc0d481aec1575461828fd6365c  .github/workflows/three-extension-ui-contracts.yml
de89418a61ddd9394717f9d8426abe3f224c3ec5  scripts/three-extension-ui-contract-workflow.test.js
```

この2 blobを使った局所実行結果は次のとおりである。

```text
node --check scripts/three-extension-ui-contract-workflow.test.js
PASS

node --test scripts/three-extension-ui-contract-workflow.test.js
1 test / 1 pass / 0 fail
```

`e0388453b1d22c58494fa83d87202aeb1a5f6dcd..807e37ce2938ae142d7d17eaabe9ae2a18a4b115`は2 commit、2 fileだけを変更する。

```text
.github/workflows/three-extension-ui-contracts.yml
  +14 / -3

scripts/three-extension-ui-contract-workflow.test.js
  +28 / -0
```

## 4. GitHub Actions起動状態

GREEN commit `807e37ce2938ae142d7d17eaabe9ae2a18a4b115`では次のrunが生成された。

```text
three-extension-ui-contracts:      30196893263
extensions-quality:                30196893280
code-consistency-review-scaffold:  30196893283
```

専用job `89779877571`は`completed/failure`だが、`steps: null`、job logなしで終了した。新しい`Verify checked-out commit`を含め、repository stepは1件も開始していない。

したがって、このrunはexact-head契約の製品失敗でも成功でもない。runnerがrepository stepを開始できる状態へ戻った後、この補足証跡を含むPR branchの最終headで全gateを再実行する。

## 5. 未確認ゲート

```bash
node --test \
  scripts/three-extension-command-surface.test.js \
  scripts/three-extension-documentation-contract.test.js \
  scripts/bazaar-review-documentation-parity.test.js \
  scripts/code-consistency-documentation-parity.test.js \
  scripts/workflow-register-documentation-parity.test.js \
  scripts/extension-host-smoke-contract.test.js \
  scripts/three-extension-ui-contract-workflow.test.js

git diff --check <base>...<exact-head>
```

加えて、3拡張のcompile、unit、dependency／architecture／source policy、package、package policy、および同一exact headでのUbuntu／Windows Extension Host成功が必要である。
