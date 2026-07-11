# 3拡張機能修正 リリース証跡

## 1. 対象

| 項目 | 値 |
| --- | --- |
| Pull Request | `#68` |
| Branch | `agent/three-extension-remediation-20260711` |
| Base | `main` / `559929f9e076bce0563de25759ab2cfccb67fb18` |
| 対象拡張 | `workflow-register`、`bob-bazaar-review`、`bob-code-consistency-review` |
| 判定 | **最終検証保留・merge不可** |

本書は、依存契約、provider lifecycle、Git/Bazaar外部プロセス、path境界、processing limit、workflow契約、Windows/Extension Host CIの修正について、リリース前に必要な証跡を一箇所へ集約する。

## 2. 実装済み契約

- IBM Bobおよびcompanion extensionをsoft dependencyとして扱い、未導入時も通常commandを起動できる。
- providerは`sourceId`を持ち、同一IDの無警告上書きを拒否し、登録解除用Disposableを返す。
- provider登録controllerはAPI identityとgenerationを管理し、stale/late/partial registrationをrollbackする。
- Git/Bazaar processは`shell: false`、hard timeout、AbortSignal、output budget、process-tree killを使用する。
- Git revision validationは`nonZeroExit`だけを不正revisionへ正規化し、cancel/timeout等のprocess error kindを保持する。
- Bazaar revision/pathはtrim前の制御文字を拒否する。pathはPOSIX/Windows absolute、drive-relative、UNC、device path、dot/traversal segmentも拒否する。
- review processing limitはmanifest/runtime共通のmin/default/maxを持ち、最終Bob入力は総byte budget内へ切り詰める。
- repository内の対象`WORKFLOW.md`を再帰探索し、provider、preflight、nested command、template mirrorをstrict検証する。
- sample固有の外部commandは、正確なsample pathとworkflow guardrail宣言の両方を満たす場合だけ許可する。

## 3. 確認済み証跡

### 3.1 過去のGitHub Actions focused test

| 対象 | 結果 | 備考 |
| --- | --- | --- |
| workflow-register provider ownership / duplicate / Disposable | 9 passed / 0 failed | PR conversationへActions botが記録済み |
| bob-bazaar-review path / process runner / provider | 20 passed / 0 failed | PR conversationへActions botが記録済み |
| bob-code-consistency-review full unit suite | 139 passed / 0 failed | PR conversationへActions botが記録済み |

これらは修正途中のcommitでの証跡であり、最新head全体のgreen判定を代替しない。

### 3.2 2026-07-11 局所再現

| 検証 | 結果 | 内容 |
| --- | --- | --- |
| retry registration controller | 3 passed / 0 failed | 同一API維持、generation切替、部分登録rollbackとstale disposal |
| remediation behavior | 4 passed / 0 failed | Git cancel分類保持、invalid Git ref正規化、Bazaar revision/pathのtrim前制御文字拒否 |
| sample command allowlist | passed | sample path限定、guardrail宣言必須、production pathでは拒否 |
| provider API identity typecheck | passed | registrationで取得したAPI型をcontrollerへ直接返せること |

局所再現は変更ロジックを隔離した補助証跡であり、repository全体のcompile/testを代替しない。

## 4. GitHub Actions runner起動前ブロッカー

### 4.1 本体workflow

実装head `fcd1a08d213833e78b49a9d30ec240e5d7dbb657` で次のrunを確認した。

| Workflow | Run ID | 結果 |
| --- | ---: | --- |
| `extensions-quality` | `29141950093` | failure |
| `workflow-contracts` | `29141950101` | failure |
| `code-consistency-review-scaffold` | `29141950122` | failure |

`extensions-quality`のUbuntu/Windowsを含む全jobが`steps: null`、`logs_url: null`のまま終了した。

### 4.2 第三者Actionを使わないrunner probe

原因をrepository code、checkout、npm、第三者Actionから切り離すため、一時的に単一echo stepだけを持つ`actions-runner-probe`を追加した。

| Workflow | Run ID | Job | 結果 |
| --- | ---: | --- | --- |
| `actions-runner-probe` | `29142077414` | `ubuntu-probe` | failure / `steps: null` / logなし |
| `actions-runner-probe` | `29142077414` | `windows-probe` | failure / `steps: null` / logなし |

probeはcheckoutやrepository fileを参照せず、`echo`と`node --version`だけを実行する。それでも両OSでstep開始前に終了したため、現在のfailureはworkflow実装やテストコードではなく、GitHub-hosted runner割当以前のaccount/repository設定にあると判定した。診断後、probe workflowはcommit `15b2003468a80905d8dc095edf037655f0aa33f2`で削除した。

ただしgreen evidenceが存在しないためmergeは許可しない。

### 4.3 repository管理者が確認する項目

1. GitHub accountのBilling / PlansでActions利用枠、spending limit、支払い状態を確認する。
2. Repository Settings → Actions → GeneralでActionsが許可されていることを確認する。
3. GitHub-hosted runnerの利用が無効化されていないことを確認する。
4. Actions利用制限を解除後、PR #68の最新runで`Re-run all jobs`を実行する。
5. jobがstep 1を開始し、job logを生成することを確認する。

## 5. 最新headで必要な自動ゲート

| Gate | 必須結果 | 実績 |
| --- | --- | --- |
| workflow-register Ubuntu | dependency / architecture / source / schema / unit / package / VSIX policy 全成功 | 未実施 |
| bob-bazaar-review Ubuntu | dependency / architecture / source / unused / artifact / unit / package / VSIX policy 全成功 | 未実施 |
| bob-code-consistency-review Ubuntu | dependency / architecture / source / unit / package / VSIX policy 全成功 | 未実施 |
| Windows matrix | 3拡張すべて成功 | 未実施 |
| Extension Host smoke | 3拡張のactivationと代表command登録成功 | 未実施 |
| workflow contracts | 全対象workflow strict/provider-aware検証成功 | 未実施 |
| code consistency scaffold | scaffoldとVS Code extensionの2 job成功 | 未実施 |

## 6. 実機ゲート

### 6.1 IBM Bob / VS Code

| Case | 手順概要 | 期待結果 | 実績 |
| --- | --- | --- | --- |
| soft dependency | companionを無効化して各拡張を起動 | 通常commandが利用可能 | 未実施 |
| delayed recovery | `workflow-register`を後から有効化 | providerが重複なく登録される | 未実施 |
| API restart | `workflow-register`をreload | 旧providerが解除され新APIへ再登録 | 未実施 |
| step review | review付きworkflowを実行 | reviewing → accept/retryが整合 | 未実施 |
| result handoff | agent結果をcapture providerへ渡す | 既存assistant textからartifact保存 | 未実施 |
| Webview | Bazaar GUI / consistency wizard / Operation Hub | 未処理例外なく表示・操作可能 | 未実施 |

### 6.2 実Bazaar

| Case | 手順概要 | 期待結果 | 実績 |
| --- | --- | --- | --- |
| timeout | 終了しないBazaar wrapperを指定 | 上限時間で`timeout`、子process残留なし | 未実施 |
| cancel | 実行中progressをキャンセル | `cancelled`、子process残留なし | 未実施 |
| path boundary | drive / UNC / device / traversal / control文字を投入 | CLI実行前に拒否 | 未実施 |
| exit code 1 | 差分ありのdiff | 成功扱い | 未実施 |

### 6.3 multi-root

| Case | 手順概要 | 期待結果 | 実績 |
| --- | --- | --- | --- |
| `.bob` / `.bzr`分離 | Bob rootとBazaar rootを別folderにする | rules/resultはBob root、diff/logはBazaar root | 未実施 |
| code consistency VCS root | Bob rootとGit/Bazaar rootを分離 | review packageはBob root、VCS取得は指定root | 未実施 |
| duplicate workflow IDs | 複数rootに同一logical IDを配置 | 登録IDが一意化され衝突しない | 未実施 |

## 7. 最終承認

| 項目 | 記入欄 |
| --- | --- |
| 最新PR head SHA |  |
| Actions再実行日時 |  |
| Ubuntu合格 |  |
| Windows合格 |  |
| Extension Host合格 |  |
| Workflow contract合格 |  |
| IBM Bob実機担当 / 結果 |  |
| Bazaar実機担当 / 結果 |  |
| multi-root担当 / 結果 |  |
| 未解決リスク |  |
| リリース判定者 |  |
| 判定 | `release / conditional / reject` |

全必須欄が合格するまではPRをdraftのまま維持する。最終mergeは履歴を整理するためsquashを使用する。
