# Bob Bazaar Review Run Wizard v3 Iteration 3 Dashboard Plan

**Goal:** Review Run、record、triage、review-resultから、campaignの進捗・品質・時間・rule有効性を再現可能に集計し、VS Code上で確認・再生成・CSV出力できるDashboardを追加する。

**Architecture:** 既存`CampaignSummary`は互換維持する。新規`src/dashboard/`をVS Code非依存の集計・CSV・artifact層と、薄いWebview controllerへ分離する。推測値は生成せず、取得不能な指標はcoverageとwarningで明示する。

## Constraints

- `bazaar-review-run/v1`、`bazaar-review-record/v1`、`bazaar-review-triage/v1`を変更しない。
- 既存summary JSON/Markdownのfieldとpathを変更しない。
- Dashboard artifactは`.bob-review-records/campaigns/<campaign_id>/dashboard.{json,md,csv}`へ追加する。
- `baseline_review_minutes`が存在するrecordだけを削減時間KPIへ含め、coverageを併記する。
- rule別集計はreview-resultの`findings[].rule_id`とtriageの`finding_id`照合に基づく。推測・title一致は行わない。
- change typeは`record.vcs.revision_mode`の既存値だけを使う。
- malformed、ID不一致、workspace外path、symlink/junctionはwarningまたはblockingとして扱う。
- 新規runtime dependencyを追加しない。
- WebviewはCSP nonce、host側message allowlist、inline handler禁止を維持する。

## Task 1: Dashboard domain and data quality

- [ ] RED: mixed completed/incomplete/invalid fixtureからstatus、quality、timing coverage、warningsを期待するtestを追加する。
- [ ] GREEN: `CampaignDashboard`型と純粋集計関数を実装する。
- [ ] baseline coverage、triage coverage、schema-valid coverageを0除算なしで算出する。
- [ ] 未完了Review Runをphase別に集計し、record未生成も隠さない。

## Task 2: Rule and change-type analysis

- [ ] RED: accepted/rejected/needs-investigation/deferredをrule別に集計するtestを追加する。
- [ ] GREEN: result findingとtriage itemを`finding_id`で結合する。
- [ ] orphan finding、orphan triage、missing rule IDをwarningへ出す。
- [ ] `singleRevision`、`revisionRange`、`workingTreeSinceRevision`別に件数・findings・時間を集計する。

## Task 3: Artifacts

- [ ] RED: stable CSV header、CSV escaping、Markdown主要section、atomic writeを検証する。
- [ ] GREEN: dashboard JSON、Markdown、CSVを生成する。
- [ ] CSVはrule rowsを出力し、spreadsheet式注入を防ぐため`= + - @`先頭値を安全化する。
- [ ] artifact pathはworkspace containmentを通す。

## Task 4: VS Code Dashboard GUI

- [ ] `bobBazaar.openCampaignDashboard` commandを追加する。
- [ ] workspaceとcampaignを選択し、refresh/export/open artifactを提供する。
- [ ] scorecard、coverage、phase、change type、rule table、warningsを表示する。
- [ ] table filterはseverity/rule/statusのクライアント側表示に限定し、集計値はhost生成値を正とする。

## Task 5: Documentation and gates

- [ ] README、docs index、単体テスト仕様、実機テスト仕様、Iteration 3実装仕様を更新する。
- [ ] dependency、architecture、source、unused、artifact、audit、unit、package、VSIX policy/metricsを実行する。
- [ ] stacked diffに診断workflowや無関係変更がないことを確認する。
- [ ] PR本文へKPI定義、coverage、検証結果、既知の制約を記載する。

## Acceptance Criteria

1. campaignの未完了runを含む進捗がDashboardに表示される。
2. rule別decision集計はfinding IDで追跡可能である。
3.削減時間にはbaseline入力済みrecordだけが含まれ、coverageが表示される。
4. JSON/Markdown/CSVが同じ集計値から生成される。
5. malformed artifactは黙って除外せずwarningになる。
6. 既存summary、command、provider、artifact contractを破壊しない。
7. 全`bob-bazaar-review`品質ゲートが成功する。
