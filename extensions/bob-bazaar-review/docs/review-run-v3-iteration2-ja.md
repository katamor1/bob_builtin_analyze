# Review Run Wizard v3 Iteration 2 実装仕様

## 1. 目的

Iteration 2は、Iteration 1で接続したBazaar target、packet、review-result、Human Triageを、**中断・再開でき、実績確定まで完了できるReview Run**へ拡張する。

対象範囲:

```text
未完了Review Runを検出
  -> 現在phaseとartifactを表示
  -> 次の操作へ再開
  -> Human Triage decisionを検証
  -> Bob review / Human Triage時間を確定
  -> record.yamlを生成・検証
  -> campaign summaryを再生成
  -> Review Runをcompletedへ更新
```

加えて、Iteration 1導入前に作られたpacket、review-result、triage、recordを変更せず、確認付きで`review-run.json`へ関連付ける。

Campaign DashboardはIteration 3とし、本仕様には含めない。

## 2. 互換性

- Review Run schema versionは`bazaar-review-run/v1`を維持する。
- Iteration 1の`review-run.json`は読み込み時に新fieldを補完する。
- 既存command ID、workflow provider ID、artifact pathを変更しない。
- Result CaptureとHuman Triageのstandalone modeを維持する。
- 新規runtime dependencyを追加しない。
- Bazaar CLIの`--no-aliases`、readonly MCP、Human Triage gateを維持する。

## 3. Review Run progress

`ReviewRunContext`へ次を追加する。

```ts
status: "in_progress" | "completed"
phases: {
  target: PhaseProgress
  packet: PhaseProgress
  result: PhaseProgress
  triage: PhaseProgress
  record: PhaseProgress
  summary: PhaseProgress
}
metrics: ReviewRunMetrics
issues: ReviewRunIssue[]
```

`PhaseProgress.status`:

- `not_started`
- `in_progress`
- `completed`
- `blocked`
- `failed`
- `skipped`

各phaseには任意で`startedAt`、`completedAt`、`issue`を保存する。

### 3.1 artifact不変条件

phaseを`completed`にする場合、次のartifactが必要である。

| phase | 必須artifact |
|---|---|
| packet | `reviewPacketPath` |
| result | `reviewResultJsonPath`, `reviewResultMarkdownPath` |
| triage | `triageYamlPath` |
| record | `recordYamlPath` |
| summary | `summaryJsonPath`, `summaryMarkdownPath` |

Review Run全体を`completed`にするには、6 phaseすべてが`completed`でなければならない。

### 3.2 Iteration 1 artifactの補完

旧artifactに`phases`がない場合、既存のtop-level `phase`とartifact pathから補完する。

- targetは`completed`
- packet/resultは必要artifactがあれば`completed`
- `triage.yaml`が存在しても、Human Triageの妥当性を確認できるまでは`triage.in_progress`
- record/summaryは対応artifactがあれば`completed`
- top-level phaseが`completed`ならstatusも`completed`

読み込みによる補完だけではartifactを書き換えない。

## 4. 更新競合

`writeReviewRun(context, { expectedUpdatedAt })`は、保存直前にpersisted `updatedAt`を比較する。

値が異なる場合:

```text
Review Run changed since it was loaded
```

として拒否し、新しい状態を保持する。

extension host内では、`workspaceRoot + campaignId + reviewId`をkeyとするPromise queueで更新を直列化する。複数Webviewが同じrunを操作しても、古い画面からの上書きを許可しない。

## 5. Metrics

```ts
interface ReviewRunMetrics {
  baselineReviewMinutes?: number
  bobReviewSeconds: number
  humanTriageSeconds: number
  timingSource: "auto_wall_clock" | "user_corrected"
  correctedByUser: boolean
  bobReviewStartedAt?: string
  humanTriageStartedAt?: string
}
```

### 5.1 自動計測

- packet保存時: Bob review timer開始
- valid result保存時: Bob review timer停止、Human Triage timer開始
- valid triage保存時: Human Triage timer停止

### 5.2 手動補正

確定前に次を分単位で補正できる。

- baseline review
- Bob review
- Human Triage

補正値は有限、0以上、30日以下とする。補正後は`timingSource=user_corrected`、`correctedByUser=true`とする。

recordへは小数第1位の分へ変換する。

## 6. Human Triage decision契約

| decision | 必須入力 |
|---|---|
| `accepted` | `owner`または`action` |
| `rejected` | `reason` |
| `needs_investigation` | `owner`と`action` |
| `deferred` | `reason` |

Webviewは保存前に同じ条件を表示するが、extension hostの`validateTriage()`を正とする。

valid decisionを保存すると、triage artifactを保存し、Review Runの`triage`を`completed`へ進める。

## 7. Finalize

`Review Runを完了して集計`は次を実行する。

1. triage phaseが`completed`であることを確認する。
2. packet、review-result JSON/Markdown、triageを読み込む。
3. triageをreview-resultと照合して再検証する。
4. Review Run metricsを既存ReviewRecord形式へ変換する。
5. `record.yaml`を生成する。
6. `validateReviewRecord()`を実行する。
7. record phaseを`completed`へ更新する。
8. campaign summary JSON/Markdownを再生成する。
9. summary phaseを`completed`へ更新する。
10. Review Run全体を`completed`へ更新する。

### 7.1 失敗時

- record生成・検証失敗: record phaseを`failed`、retryable issueを保存する。
- summary失敗: 作成済みrecordを保持し、summaryだけを`failed`にする。
- 成功済みartifactを削除・巻き戻ししない。
- 再実行時は失敗phaseから続行する。

## 8. Resume

Review GUIは選択workspaceの`.bob-review-records/campaigns/*/records/*/review-run.json`を走査する。

- `_template`を除外する。
- symlink/junctionを追跡しない。
- malformed JSONとlegacy-only directoryは一覧から除外し、legacy recoveryへ委譲する。
- `updatedAt`降順で表示する。

次の操作判定:

| 状態 | action |
|---|---|
| packet未完了 | `review` |
| packet完了、result未完了 | `resultCapture` |
| result完了、triage未完了 | `humanTriage` |
| triage完了、record/summary未完了 | `finalize` |
| status completed | `none` |

Review GUIは6 phase、次のaction、target、artifact pathを表示する。

## 9. Legacy recovery

### 9.1 検出

`.bob/review/results/*.json`を候補とし、同一review IDのrecord directoryをcampaign横断で探す。

検出対象:

- review-result JSON/Markdown
- review-packet.md
- triage.yaml
- record.yaml
- campaign summary JSON/Markdown

### 9.2 blocking条件

- result file名とJSON内`review_id`が不一致
- review IDまたはcampaign IDがunsafe
- campaign候補が複数で未選択
- campaign候補がなくcampaign未指定
- `review-run.json`が既に存在

### 9.3 previewと確認

Review GUIは候補とcampaignを選択し、推測したtarget、artifact、warningをmodal dialogで表示する。

明示的に「復旧する」を選択した場合だけ処理する。

### 9.4 書き込み契約

復旧処理が新規作成するのは`review-run.json`だけである。

次を行わない。

- packet/result/triage/recordのrename
- artifact本文の修正
- existing `review-run.json`の上書き
- review IDの暗黙補正

## 10. セキュリティ

- campaign/review IDをsafe path segmentとして再検証する。
- workspace-relative pathとrealpath containmentを維持する。
- symlink/junctionを経由したartifactを拒否する。
- command引数のworkspace rootをopen workspace配下に限定する。
- Webview actionはhost側allowlistで処理する。
- CSP nonceとinline handler禁止を維持する。
- Human Triageなしでfindingを自動確定しない。

## 11. テスト

追加・更新する主なテスト:

- `reviewRunMetrics.test.js`
- `reviewRunState.test.js`
- `reviewRunStore.test.js`
- `reviewTriageDecision.test.js`
- `reviewRunFinalize.test.js`
- `reviewRunResume.test.js`
- `reviewRunRecovery.test.js`
- `guiFirstSurfaces.test.js`

## 12. UAT

### UAT-01 result保存前に中断

1. packetを作成する。
2. VS Codeを閉じる。
3. Review GUIを再度開く。
4. 未完了runを選択する。

合格条件:

- actionが`resultCapture`になる。
- campaign/review IDを再入力しない。
- packetを再生成しなくてよい。

### UAT-02 triage中に中断

合格条件:

- result/packetがcompleted表示になる。
- actionが`humanTriage`になる。
- triage draftが存在すればitemsを再表示する。

### UAT-03 decision validation

合格条件:

- rejectedでreasonなしは保存不可。
- needs_investigationでowner/action不足は保存不可。
- 修正後にtriage phaseがcompletedになる。

### UAT-04 finalize

合格条件:

- metricsを確認・補正できる。
- recordとsummaryが生成される。
- Review Runがcompletedになる。
- すべて同じcampaign/review IDで結び付く。

### UAT-05 summary失敗から再試行

合格条件:

- record.yamlを保持する。
- summary phaseだけfailedになる。
- 再試行でsummaryから続行できる。

### UAT-06 legacy recovery

合格条件:

- previewとmodal確認が表示される。
- 既存artifactのbytesが変化しない。
- `review-run.json`だけが追加される。
- ID不一致や複数campaign未選択は復旧不可。
