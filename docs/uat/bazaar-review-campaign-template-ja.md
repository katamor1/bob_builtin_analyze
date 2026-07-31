# Phase 1 Bazaar レビュー実績 campaign テンプレート

このテンプレートは、Phase 1 Bazaarレビュー実績作成をCODEXまたはUAT担当者が再実行できるようにするための運用手順である。実案件名、担当者名、revisionはcampaign開始前に置き換える。

## 1. 公開入口

通常operatorは次の公開Command Palette entryから開始する。

```text
Bob Bazaar Review: レビューを開始
```

以降は`Bazaar レビュー`主GUI内で、レビュー対象、レビュー資料、`レビュー結果取り込み`、`指摘確認・振り分け`、`レビュー実績`の順に進む。保存、検証、record生成用の内部Command IDを通常手順としてCommand Paletteから呼ばない。

## 2. 作成する成果物

```text
.bob-review-records/
  campaigns/
    <campaign_id>/
      campaign.yaml
      targets.yaml
      records/
        <review_id>/
          review-run.json
          record.yaml
          triage.yaml
          triage.md
          metrics.json
          notes.md
          review-packet.md
      summary.json
      summary.md
```

`.bob/review/results/<review_id>.json`と`.bob/review/results/<review_id>.md`はreview-resultの正本として維持する。`record.yaml`はそれらを参照するevidence recordであり、`review-run.json`は主GUIのstageとresume identityを保持する。

## 3. 事前準備

1. Bazaar CLIが`bzr --no-aliases status`で動作することを確認する。
2. `.bob/review/checklist.json`と`.bob/review/review-result.schema.json`が存在することを確認する。
3. `campaign.yaml`へproject、owner、share level、baseline review minutesの要否を記録する。
4. `targets.yaml`へsingleRevision、revisionRange、workingTreeSinceRevisionの候補を記録する。
5. `.bob-review-records/`の共有範囲とignore方針を確認する。
6. tested commit SHAと使用するVSIX build commit SHAを記録する。

## 4. 実行手順

1. `Bob Bazaar Review: レビューを開始`を実行する。
2. 主GUIでtargetを選び、review packetを生成する。
3. packetをrecord配下の`review-packet.md`へ保存する。
4. Bobへレビュー資料を渡し、review-result JSONを取得する。
5. 主GUIの`レビュー結果取り込み`でJSONを抽出、schema検証、保存する。
6. 同じreview identityのまま`指摘確認・振り分け`へ進む。
7. findingごとに`accepted`、`rejected`、`needs_investigation`、`deferred`を選び、owner、reason、actionを保存する。
8. `レビュー実績`で`record.yaml`、`metrics.json`、summaryを生成する。
9. `summary.json`と`summary.md`の件数をsource artifactと照合する。
10. `notes.md`へ失敗、再実行条件、改善backlogを記録する。

cancel、stale review revision、schema error、workspace mismatchでは既存成果物を部分更新しない。

## 5. Phase 1 UATケース

| ID | 目的 | 必須証跡 | 判定 |
|---|---|---|---|
| BZR-RT-036 | campaign初期化で`.bob-review-records`が作られる。 | campaign.yaml, targets.yaml | ok / ng / n/a |
| BZR-RT-037 | 主GUIでpacket artifactをrecord配下に保存できる。 | review-packet.md, review-run.json | ok / ng / n/a |
| BZR-RT-038 | `レビュー結果取り込み`から検証済みresultを保存できる。 | review-result JSON / Markdown | ok / ng / n/a |
| BZR-RT-039 | `指摘確認・振り分け`で全findingを人間が分類できる。 | triage.yaml | ok / ng / n/a |
| BZR-RT-040 | decision validation errorとstale saveを検出できる。 | validation log | ok / ng / n/a |
| BZR-RT-041 | 複数recordからcampaign summaryを生成できる。 | summary.json, summary.md | ok / ng / n/a |
| BZR-RT-042 | workflow run metadataとrecordが紐付く。 | workflow.run_idまたはunavailable flag | ok / ng / n/a |
| BZR-RT-043 | campaign summaryから実績報告を作成できる。 | report Markdown | ok / ng / n/a |
| BZR-RT-044 | close / reopen後も同じreview identityで再開できる。 | review-run.json, screenshot-free log | ok / ng / n/a |
| BZR-RT-045 | keyboard-only、200% zoom、High Contrastで主要操作が可能。 | UAT evidence | ok / ng / n/a |

## 6. 指摘確認・振り分け基準

| decision | 意味 | actionの例 |
|---|---|---|
| `accepted` | 人間が妥当な指摘として採用した。 | fix_required, backlog, document |
| `rejected` | 対象外、誤検出、既知の許容事項として棄却した。 | no_action |
| `needs_investigation` | 追加調査が必要。 | investigate |
| `deferred` | Phase 1では判断せず後続phaseへ送る。 | defer |

Bobの提案だけでdecisionを確定しない。根拠、変更範囲、rule IDを人間が確認する。

## 7. 完了条件

- `record.yaml`がtarget、packet、result、decision、metricsを追跡する。
- review-result JSONがschemaとchecklist contractを通過している。
- 全findingが判断済み、または明示的に後続へ回されている。
- summaryのrecords、findings、decision、estimated minutesがsource artifactと一致する。
- workspace外path、Bazaar書込み、暗黙MCP write toolを使用していない。
- tested commitとVSIX build commitが一致する。
- Developer Tools Consoleに未処理exception / rejectionがない。
