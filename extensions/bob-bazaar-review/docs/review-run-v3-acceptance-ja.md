# Review Run Wizard v3 受入・統合契約

## 1. 目的

本書は、Review Run Wizard v3のIteration 1〜3を個別機能ではなく、一つの運用フローとして受け入れるための契約を定義する。

対象フロー:

```text
Review Run開始
  -> Bazaar review packet保存
  -> review-result JSON / Markdown保存
  -> Human Triage確定
  -> metrics補正
  -> record.yaml作成・検証
  -> summary.json / summary.md更新
  -> Campaign Dashboard生成
  -> dashboard.json / dashboard.md / dashboard.csv export
```

## 2. 自動受入テスト

実装ファイル:

```text
test/reviewRunV3Acceptance.test.js
```

このテストは一時workspace内で、次を実際のdomain APIとfilesystem artifactを使って実行する。

1. `startReviewRun()`でcampaign / review identityを確定する。
2. `recordReviewPacket()`で`review-packet.md`を保存する。
3. validなreview-result JSON / Markdownを保存し、`recordReviewResult()`で同じrunへ関連付ける。
4. validな`triage.yaml`を保存し、`recordTriageCompleted()`でHuman Triageを完了する。
5. baseline時間を補正し、`finalizeReviewRun()`でrecordとsummaryを生成する。
6. persisted `review-run.json`と`record.yaml`を再読込し、identity・phase・metricsを検証する。
7. `generateCampaignDashboard()`でcampaignを集計する。
8. `writeCampaignDashboardArtifacts()`でJSON / Markdown / CSVをexportする。
9. Dashboard生成・export前後で既存review evidenceのSHA-256を比較する。

## 3. 必須不変条件

### 3.1 Identity

- campaign IDは全artifactで同一である。
- review IDはReview Run、review-result、triage、record、Dashboardで同一である。
- ID不一致を暗黙補正しない。

### 3.2 Phase

- valid Human Triageなしでrecord / summaryを確定しない。
- finalize後は`status=completed`、`phase=completed`である。
- `target / packet / result / triage / record / summary`がすべてcompletedである。

### 3.3 Metrics

- finalized metricsは`record.yaml`をsource of truthとする。
- 自動計測されたBob review / Human Triage時間を分へ変換する。
- baseline入力済みの場合だけ推定削減時間を意味のある値として扱う。
- Dashboardのtime totalはfinalized recordと一致する。

### 3.4 Human Triage

- finding decisionはvalidな`triage.yaml`だけから集計する。
- accepted findingはDashboardのaccepted件数とrule trendへ反映する。
- pendingまたはinvalid triageを自動採否しない。

### 3.5 Evidence immutability

Campaign Dashboardのrefresh / exportは、次のbytesを変更してはならない。

- `review-run.json`
- `review-packet.md`
- review-result JSON / Markdown
- `triage.yaml`
- `record.yaml`
- `summary.json` / `summary.md`

変更を許可するのは次のderived artifactだけである。

- `dashboard.json`
- `dashboard.md`
- `dashboard.csv`

## 4. 回帰gate

対象extension rootで次を実行する。

```powershell
npm ci
npm test
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run unused:report
npm run unused:policy
npm run artifact:policy
npm run audit:prod
npm run package
npm run package:policy
npm run package:metrics
```

合格条件:

- compile errorが0件。
- unit / acceptance test failureが0件。
- dependency / architecture / source / unused / artifact policyが成功する。
- high以上のproduction audit violationで失敗しない。
- VSIXが生成でき、size policyを満たす。

## 5. Stacked PR統合順

Review Run v3は次の順で統合する。

```text
PR #76  Iteration 1: Contextと画面間handoff
  -> PR #79  Iteration 2: Resume / metrics / finalize / recovery
  -> PR #83  Iteration 3: Campaign Dashboard
  -> PR #85  Stack acceptance / release evidence
```

後続PRを先にmainへmergeしない。各PRをmergeした後、次PRのbaseをmainへ更新し、差分とgateを再確認する。

## 6. 統合後確認

各merge後に次を確認する。

1. 後続PRがGitHub上でmergeableである。
2. 後続PRのchanged filesが、そのiteration固有の差分だけになっている。
3. `bob-bazaar-review` CI jobが全step成功する。
4. command ID、workflow provider ID、artifact pathに意図しない差分がない。
5. 最終PRでは`reviewRunV3Acceptance.test.js`を含む全testが成功する。

## 7. Rollback

問題が見つかった場合は、stackの後ろからrevertする。

```text
PR #85 acceptance-only change
  -> PR #83 Dashboard
  -> PR #79 Resume / finalize
  -> PR #76 Review Run handoff
```

Dashboardだけをrevertしても、既存のpacket / result / triage / record / summary artifactは維持される。Review Run schema、record schema、triage schemaは各iterationで互換維持されているため、後段のderived機能から順に切り戻す。

## 8. 重複PR

PR #84はPR #83と同じIteration 3を別実装した重複PRである。統合対象をPR #83へ一本化し、PR #84は未mergeでcloseする。
