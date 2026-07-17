# 共有計画 実装・検証報告

日付: 2026-07-16
対象 main: `f4f9d3308361333e02ab1af732706b7a9e5fc952`

## 結論

共有計画の基礎実装はPR #72 `feat: complete bob evidence scope and artifact stale ledger` として main へ公開済みでした。今回、BLOCKED runの成果物を再構成するだけでなく、独立レビューで検出した実装ギャップをTDDで修正しました。2026年7月12日の BLOCKED 状態は、空の入力と欠落成果物を持つ当該runには正しいものの、現在の実行結果はそれを置き換えます。

PR #72 の merge commit `d275f911acf28d3924a52901de01328679aa8100` は current main の祖先です。GitHub compare は `ahead 7 / behind 0`、merge-baseを同 merge commitとして返しました。以降の7 commitには evidence-scope production code の変更はありません。

## 実装済み範囲

1. 変更symbol、incoming/outgoing dependency、unknown impactの決定論的展開
2. required/high/medium/low のcontext budgetと採否理由
3. workspace-local project rule packのbounded read、schema検証、SHA-256 provenance
4. repository-wide symbol/reference indexの読込、freshness、graph semantic検証
5. immutable Git blobベースのindex producer、source-free incremental cache、global re-link
6. preprocess build/consume modeと`context-budget-report.json`／manifest handoff
7. metadata-only artifact ledger、missing/fresh/stale、推移的stale伝播
8. package生成前後のtwo-checkpoint reconciliation
9. path confinement、symlink、revision、dirty tree、timeout、件数／bytes上限、privacy境界

## 既存公開証跡

- PR: `https://github.com/katamor1/bob_builtin_analyze/pull/72`
- final merge: `d275f911acf28d3924a52901de01328679aa8100`
- original completed local suite: 243 passed / 0 failed
- original authoritative CI:
  - `code-consistency-review-scaffold` run `29209078322`: success
  - `extensions-quality` run `29209078319`: success
  - Linux／Windowsの3拡張がpackage、VSIX policy、Extension Host smokeまで成功
- PR上のP1「repository index producer不足」は実装追加後に返信・解決済み
- 旧 remote branch `codex/execute-shared-plan-6a53743e` は exact-SHA reconciliation 後に `merged-source` として退役済み

## 今回の補完実装

| Commit | 補完内容 |
|---|---|
| `4937712b2e75eb49c7db20a7edc5488433a30430` | unsafe URI／credentialをsource-free cacheへ残さず、reference reasonを分類語だけに限定。retryable rename失敗時も旧ファイルを削除しない。 |
| `9edd2b48b9378e0fc3fac6e55c69b51c0f3d6b29` | dangling依存にsynthetic `missing` recordを生成し、512件上限とclosed ID prefixを強制。上流load失敗前にledgerをcheckpoint。 |
| `dc5fcdef4bb73fcf0bdfd718fb03abaa71ba6233` | 重複symbol IDを入力順非依存で拒否。現在解析をrepository metadataより優先。`max_call_depth`既定値を1へ統一。 |
| `52eb75a3b3aa8ffbc3e05de463aceed51a73339f` | external process timeout testをscheduler速度から分離し、安全下限1,000msを直接検証。 |
| `d73f883b72a19d197c8a87a49cf3ca82980dcef5` | 独立再レビューで判明したlegacy v1 cacheのcredential再保持を防ぐため、cache互換versionを2へ更新し全再構築を強制。 |

補完差分は main `f4f9d3308361333e02ab1af732706b7a9e5fc952` に対して26 files、702 insertions、54 deletionsです。

## 2026年7月16日のfresh verification

作業環境:

- branch: `agent/execute-shared-plan-verification`
- Node.js: `v24.14.0`
- npm: `11.9.0`

結果:

| 検証 | 結果 |
|---|---|
| evidence-scope focused tests | 56 passed / 0 failed |
| full `npm test` | 270 passed / 0 failed |
| dependency policy | 2 passed / 0 failed |
| import-cycle policy | 98 TypeScript files、違反0 |
| export-star policy | 98 TypeScript files、違反0 |
| unused-code/dependency report | exit 0 |
| production dependency audit | 0 vulnerabilities |
| VSIX package | 3,695,683 bytes、1,912 entries、SHA-256 `9e0a123df621c0b9322c613d0078fb853b0d67df8346ab41630634f9304781d4` |
| VSIX policy | 11,000,000 bytes上限内、exit 0 |

初回full suiteでは、並列負荷中の実プロセスが1,000ms safety minimumを越え、timeout clamp testが失敗しました。単独実行でもscheduler負荷によって再現したため、実装の安全下限を変更せず、長時間processのerror messageが正確に`1000 ms`となることを直接検証するテストへ変更しました。timeout以外のassertionに使うtest helperは10秒へ分離し、明示的timeout testは従来どおり短いoverrideを使います。その後の全suiteは269/269成功しました。

workspace直下へVSIXを直接生成した2回は、環境のworkspace同期中にZIP終端が切り詰められました。同じ`vsce package`を`/tmp`へ生成するとZIP全entry検証に成功し、最終code headから生成した完成済み3,695,683 bytesをpolicy位置へコピーした後、VSIX policyは1,912 entriesで成功しました。これはpackage内容ではなく実行環境の出力先に限定された事象です。

## 今回の変更方針

PR #72の実装を基準に、独立レビューで再現できた欠陥だけを失敗テスト先行で修正しました。新しい機能境界や依存packageは追加していません。今回のブランチは補完修正、実行成果物、fresh verification、独立再レビューを1つの公開単位にします。

## 公開

- follow-up PR: `https://github.com/katamor1/bob_builtin_analyze/pull/133`
- state: open draft
- base: `main` at `f4f9d3308361333e02ab1af732706b7a9e5fc952`
- published code head: `b07313875501eb0b657d8b4805a5f278a8e98b4f`
- remote compare before evidence commit: 5 commits ahead、0 behind、26 files、702 insertions、54 deletions
