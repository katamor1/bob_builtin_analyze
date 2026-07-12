# Review Run Wizard v3 Iteration 3 Campaign Dashboard 実装仕様

## 1. 目的

Iteration 3は、Iteration 1と2で蓄積したReview Run、record、Human Triage、metricsをcampaign単位で読み取り、運用状況と実績を同じ画面で確認できるDashboardを追加する。

```text
review-run.json / record.yaml / triage.yaml / review-result JSON
  -> source-backed aggregation
  -> Campaign Dashboard Webview
  -> dashboard.json / dashboard.md / dashboard.csv
```

Dashboardは派生成果物であり、review evidenceのsource of truthではない。再生成しても既存のpacket、result、triage、record、summaryを変更しない。

## 2. commandと起動導線

新規command:

```text
bobBazaar.openCampaignDashboard
```

Command PaletteまたはReview GUIの`Campaign Dashboardを開く`から起動する。Review GUIから開く場合は、active Review Runまたは選択済みworkspaceの`workspaceRoot`と`campaignId`を引き渡す。

Webviewから受け付けるmessage typeは次だけである。

- `campaignDashboard.refresh`
- `campaignDashboard.selectCampaign`
- `campaignDashboard.export`

任意command IDや任意出力pathはWebviewから受け取らない。

## 3. source artifactと優先順位

| artifact | Dashboardで使う情報 |
| --- | --- |
| `review-run.json` | run status、phase、target mode、updatedAt、issues、provisional metrics |
| `record.yaml` | quality gate、確定metrics |
| `triage.yaml` | finding decision、rule ID |
| review-result JSON | rule titleの補完、triage照合 |

優先順位:

1. finding decisionはvalidな`triage.yaml`を正とする。
2. 時間指標は`record.yaml`を優先する。
3. record未作成runは`review-run.json`の値を`review_run` sourceとして表示するが、campaign totalには確定recordだけを加算する。
4. invalidまたは欠落artifactはwarningとし、accepted / rejectedを推測しない。

## 4. Dashboard model

schema identifier:

```text
bazaar-campaign-dashboard/v1
```

主なsection:

- `overview`
- `runs`
- `triage_pending`
- `rule_trends`
- `change_type_trends`
- `warnings`

`runs`は`updated_at`降順、rule trendは`detected_count`降順と`rule_id`昇順で安定sortする。

## 5. 指標定義

### 5.1 schema

```text
schema_validation_rate = schema_valid_records / records_total
```

### 5.2 finding

```text
finding_acceptance_rate = accepted / findings_total
finding_rejection_rate = rejected / findings_total
finding_resolution_rate = (accepted + rejected) / findings_total
```

### 5.3 rule trend

各ruleの`detected_count`はvalid triage item数である。accept / reject rateの分母もそのruleの`detected_count`とする。

### 5.4 zero denominator

分母が0の場合、rateは`0`ではなく`null`とする。これは「0%」と「判断できる証跡がない」を区別するためである。UIとMarkdownでは`n/a`として表示する。

### 5.5 change type

Dashboard v1の`change_type`はReview Run target modeである。

- `singleRevision`
- `revisionRange`
- `workingTreeSinceRevision`

changed file名からsource / test / docsを推測しない。Review Run v1には完全なchanged-file manifestが永続化されていないためである。

### 5.6 time

campaign totalは確定したrecord metricsを加算する。

```text
estimated_minutes_saved = baseline - Bob review - Human Triage
```

run rowではrecord未作成時もReview Run metricsをprovisional値として表示する。

## 6. Human Triage pending

次のrunを`triage_pending`へ表示する。

- triage artifactがない。
- triageがreview-resultと一致しない。
- decision別必須入力に違反する。
- triageを読み込めない。

pending runはrun一覧から除外せず、accepted / rejected集計だけから除外する。

## 7. Data quality warning

代表的なwarning:

- campaign directoryがない。
- `review-run.json`、`record.yaml`、`triage.yaml`、review-result JSONがmalformed。
- artifactのcampaign / review identityが不一致。
- triage itemに`rule_id`がない。
- symlink / junction経由のrecord directoryを除外した。

warningには可能な範囲で`review_id`とartifact pathを含める。raw packet、diff、finding descriptionはDashboard modelへ含めない。

## 8. export

出力先:

```text
.bob-review-records/campaigns/<campaign_id>/dashboard.json
.bob-review-records/campaigns/<campaign_id>/dashboard.md
.bob-review-records/campaigns/<campaign_id>/dashboard.csv
```

- JSONは完全なtyped model。
- MarkdownはOverview、pending triage、run、rule、change type、time、warningの順で表示する。
- CSVは`section`列を持つ正規化tableとし、RFC 4180形式でquote / comma / newlineをescapeする。

3形式は同じin-memory modelから生成する。JSON serializationを含むrenderが成功してから書き込みを開始し、既存exportはtransaction backupを使って置換する。途中失敗時は旧exportを復元する。

## 9. セキュリティ

- `workspaceRoot`はopen workspace配下に限定する。
- campaign IDをsafe path segmentとして再検証する。
- filesystem traversalはrealpath containmentを通す。
- symbolic link経由のcampaign / record / destinationを拒否または除外する。
- WebviewはCSP nonceを使い、値をHTML escapeする。
- export pathはhost側で固定し、Webviewから受け取らない。
- Dashboardはreview evidenceを書き換えない。

## 10. error handling

- campaignなし: empty Dashboardとwarningを表示する。
- malformed artifact: 該当evidenceを除外し、残りのrunを表示する。
- export失敗: 現在表示中のDashboardを維持し、旧exportを可能な限り復元する。
- campaign選択不一致: host側で拒否する。

## 11. test

追加test:

- `campaignDashboardCore.test.js`
- `campaignDashboard.test.js`
- `campaignDashboardExport.test.js`
- `campaignDashboardGui.test.js`

確認項目:

- rateの分母と`null`。
- rule / change type trend。
- valid triageだけのdecision集計。
- record metricsとprovisional Review Run metricsの区別。
- malformed / missing / identity mismatch / symlink warning。
- JSON / Markdown / CSV整合とCSV escape。
- atomic export preservation。
- CSP、HTML escape、固定message allowlist。
- command registrationとReview GUI handoff。

## 12. UAT

### UAT-01 Campaign選択とrefresh

- campaignを切り替え、run数とupdated順がartifactと一致する。
- refresh後に最新のtriage / recordが反映される。

### UAT-02 Human Triage pending

- triageなし、invalid triageをpendingとして表示する。
- pending findingはaccepted / rejectedへ加算しない。

### UAT-03 ratesとtrend

- schema、finding、ruleのrateを手計算と照合する。
- 分母0は`n/a`になる。
- change typeはtarget mode別に集計される。

### UAT-04 export

- JSON / Markdown / CSVのcampaign ID、件数、rule、warningが一致する。
- comma / quote / newlineを含むwarningがCSVで壊れない。

### UAT-05 evidence immutability

- export前後でpacket、result、triage、record、summaryのbytesが変化しない。

## 13. 互換性

- Review Run、record、triage schema versionを変更しない。
- 既存summary JSON / Markdownを変更しない。
- 既存command IDとworkflow provider IDを変更しない。
- runtime dependencyを追加しない。
