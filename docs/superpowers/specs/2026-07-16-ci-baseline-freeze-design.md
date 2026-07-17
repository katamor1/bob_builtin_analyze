# CI Executability and Baseline Freeze Design

**Date:** 2026-07-16  
**Repository:** `katamor1/bob_builtin_analyze`  
**Base commit:** `f4f9d3308361333e02ab1af732706b7a9e5fc952`

## Goal

GitHub Actions が runner 割当後に実 step を実行できる状態を最新 `main` 相当で再確認し、Ubuntu／Windows の commit、runner 環境、run／job 結果を `docs/review-findings-tracking.md` に固定する。

## Current diagnosis

PR #68 の失敗 run では、単一 `echo` probe を含む全 job が runner 割当前に終了し、`steps: null`、job logなしだった。このため、当時の空 job はrepository codeやworkflow内のcommand failureではなく、Actions利用条件、spending／billing、またはGitHub-hosted runner許可に属する外部割当ブロッカーとして扱う。

その後、PR #97 の exact head `6f3c92e8544b3ebeccab465a66825f8f4bee4518` では `extensions-quality` run `29490126805` がUbuntu 3 job、Windows 3 job、metrics 1 jobをすべて実 step付きで完走し、`workflow-contracts` run `29490126819` も成功した。したがって外部割当ブロッカーは現在再現していない。ただし、管理画面の履歴を取得できないため、解除された個別設定を推測して確定原因として記録しない。

## Design

### 1. Keep the existing workflows authoritative

既存の次のworkflowを正本として維持し、診断専用workflowや重複probe jobは追加しない。

- `.github/workflows/extensions-quality.yml`
- `.github/workflows/workflow-contracts.yml`
- `.github/workflows/code-consistency-review-scaffold.yml`

`extensions-quality` の既存Ubuntu／Windows jobで、dependency／architecture／source policy、unit test、package、VSIX policy、Extension Host smokeを実行する。workflow契約とscaffoldはそれぞれ既存jobで検証する。

### 2. Add bounded, non-sensitive environment evidence

共通のNode.jsスクリプト `scripts/ci-baseline-summary.js` を追加し、既存jobのNode setup直後に実行する。このstepは次の値だけを標準出力と `$GITHUB_STEP_SUMMARY` に記録する。

- `GITHUB_SHA`、`GITHUB_RUN_ID`、`GITHUB_RUN_ATTEMPT`
- `RUNNER_OS`、`RUNNER_ARCH`
- `ImageOS`、`ImageVersion`（未提供時は `unavailable`）
- `process.version`

secret、token、workspace absolute path、environment全量は出力しない。summary fileがないローカル実行でも標準出力だけで成功する。

スクリプトは環境値を引数として整形する純粋関数と、summaryへの追記を分離する。`scripts/ci-baseline-summary.test.js` で、値の固定順、欠損値、Markdown escaping、秘密値非出力、summary fileなしの動作を失敗テスト先行で固定する。

### 3. Trigger a current-main-equivalent run

専用ブランチを最新 `main` のbase commitから作成し、上記スクリプト、テスト、既存workflow stepの変更でPRを開く。workflowファイル自身が変更対象になるため、3 workflowをPR eventで起動できる。

基準runとして採用するcommitは、環境証跡stepとテストを含む最初の完全な実装headとする。全jobについて `steps` が非空であり、少なくともcheckout、Node setup、環境証跡、対象検証step、job完了が存在することをGitHub Actions APIで確認する。

### 4. Freeze evidence in tracking

基準run完了後、`docs/review-findings-tracking.md` に `CI-BASELINE-01` を追加し、次を1か所へ集約する。

- base commit、基準commit、PR番号
- 各workflowのrun ID／URLと結論
- Ubuntu／Windowsの代表job ID／URL
- runner OS、image、runner version、Node version
- job数、実stepの存在、成功／失敗／skipped数
- 旧空jobの分類と、現在は再現しないこと
- 未確認範囲（IBM Bob、実Bazaar、multi-root等の製品UAT）

`REM-M03` は strict provider-aware workflow contract run成功時に `done`、`REM-M04` はUbuntu／Windows品質matrixと3拡張のExtension Host smoke成功時にCI部分を `done` とする。製品UATは別gateとして閉じない。

## Error handling

- いずれかのjobが再び `steps: null` またはlogなしで終了した場合、repository code failureへ分類せず、runner割当ブロッカーとして停止する。
- stepが開始後に失敗した場合だけ、最初の失敗stepとlogを根拠にworkflow／test failureとして修正する。
- 3回以上異なる修正で改善しない場合は追加patchを重ねず、runner／workflow architectureを再評価する。
- baseline summaryの欠損値は `unavailable` として残し、推測で補完しない。

## Verification

1. `node --test scripts/ci-baseline-summary.test.js` のREDを確認する。
2. 最小実装後に同testをGREENにする。
3. workflow構文と変更差分をレビューし、外部Action参照がfull commit SHAのままであることを確認する。
4. PRで `extensions-quality`、`workflow-contracts`、`code-consistency-review-scaffold` を起動する。
5. `extensions-quality` でUbuntu 3 job、Windows 3 job、metrics jobが実step付きで完了することを確認する。
6. workflow contracts 1 job、scaffold 2 jobが実step付きで完了することを確認する。
7. job logからUbuntu／Windowsの代表環境を取得し、tracking記録と照合する。
8. tracking-only末尾変更後、基準commit以後にproduction／workflow logicが変わっていないことを差分で確認する。

## Non-goals

- 新しい診断専用workflowまたはself-hosted runnerの導入
- GitHub billing／spending／repository visibility設定の自動変更
- IBM Bob、実Bazaar、multi-root、署名・配布UATの完了扱い
- CIからtracking文書へ自動commitするwrite-back処理
