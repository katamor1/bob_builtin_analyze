# Review Run Wizard v3 Iteration 3 Campaign Dashboard 実装仕様

## 1. 目的

Iteration 3は、Review Run、record、triage、review-resultを再集計し、campaignの進捗・品質・時間・rule有効性を一つのDashboardで確認できるようにする。

既存`summary.json` / `summary.md`は互換維持し、Dashboardは追加artifactとして生成する。

```text
.bob-review-records/campaigns/<campaign_id>/
  dashboard.json
  dashboard.md
  dashboard.csv
```

## 2. 集計原則

- source of truthはpersisted Review Run、record、triage、review-resultである。
- 推測値を作らない。
- malformed、ID不一致、orphan finding/triageはwarningとして残す。
- 未完了Review Runをrecord未生成でも進捗へ含める。
- 同じ集計objectからJSON、Markdown、CSVを生成する。

## 3. KPI

### 3.1 Review Run進捗

- total / completed / incomplete
- 次に必要なphase別件数: target、packet、result、triage、record、summary

### 3.2 Coverage

- baseline coverage: `baseline_review_minutes`を持つrecord数 / record総数
- triage coverage: triage artifactを持つrecord数 / record総数
- schema-valid coverage: `quality_gate.schema_valid=true`のrecord数 / record総数

母数0の場合は0%とする。

### 3.3 Timing

- baseline review minutes
- Bob review minutes
- Human Triage minutes
- estimated minutes saved

削減時間はbaseline入力済みrecordごとに次で計算し、負値は0とする。

```text
max(0, baseline - Bob review - Human Triage)
```

baseline未入力recordは削減時間から除外し、coverageで不足を示す。

### 3.4 Rule effectiveness

review-result `findings[].id`とtriage `items[].finding_id`を結合し、`rule_id`ごとに次を集計する。

- findings
- accepted
- rejected
- needs_investigation
- deferred
- acceptance rate
- 最大severity

finding ID以外のtitleや配列位置による推測結合は禁止する。

### 3.5 Change type

`record.vcs.revision_mode`の既存値を使い、typeごとのrecord数、finding数、時間、削減時間を集計する。未知値は`unknown`として表示する。

## 4. CSV契約

CSVはrule集計を1行1ruleで出力する。

```text
campaign_id,rule_id,severity,findings,accepted,rejected,needs_investigation,deferred,acceptance_rate_percent
```

Excel等での式注入を避けるため、文字列が`=`, `+`, `-`, `@`で始まる場合は先頭へapostropheを付与する。quote、comma、改行はRFC 4180相当でescapeする。

## 5. UI

Command Paletteの`Bob Bazaar Review: Campaign Dashboard を開く`から起動する。

- workspace選択
- campaign選択
- scorecard
- coverage
- next phase
- change type
- rule effectiveness
- warnings
- rule/severity filter
- 再集計
- JSON / Markdown / CSVを開く

filterは表示だけを変更し、hostで生成した集計値を変更しない。

## 6. セキュリティ

- campaign/review IDをsafe segmentとして検証する。
- workspace containmentとrealpath検証を維持する。
- symlink/junction経由のcampaign、record、artifactを選択・集計しない。
- WebviewはCSP nonce、message type/action allowlist、inline handler禁止を維持する。
- CSV formula injectionを防止する。

## 7. 互換性

- Review Run、record、triage schema versionを変更しない。
- 既存summary pathとfieldを変更しない。
- 既存command IDとworkflow provider IDを変更しない。
- 新規runtime dependencyを追加しない。

## 8. テスト

- mixed progressとcoverage
- baseline限定削減時間
- rule finding/triage結合
- orphan/missing rule warning
- change type集計
- Markdown/CSV contract
- CSV formula injection
- persisted artifact round trip
- malformed evidence warning
- command contributionとWebview CSP/action allowlist

## 9. UAT

### UAT-01 incomplete campaign

未完了runを含むcampaignを開き、record総数だけでなく次phase件数へ反映されること。

### UAT-02 coverage

baseline入力済みと未入力recordを混在させ、削減時間が入力済みだけから計算され、coverageが正しいこと。

### UAT-03 rule effectiveness

accepted/rejected/needs-investigation/deferredを持つfindingを用意し、finding IDに沿ってrule別集計されること。

### UAT-04 export

再集計後、dashboard.json、dashboard.md、dashboard.csvが同じ値を持ち、各artifactをGUIから開けること。

### UAT-05 malformed evidence

壊れたrecordやID不一致を含めても、valid recordが消えずwarningとして表示されること。
