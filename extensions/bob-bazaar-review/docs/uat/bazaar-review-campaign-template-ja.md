# Phase 1 Bazaar レビュー実績 campaign テンプレート

このローカルテンプレートは、bob-bazaar-review extension 単体のテストで利用する UAT contract です。

## 成果物

```text
.bob-review-records/
  campaigns/<campaign_id>/
    campaign.yaml
    targets.yaml
    records/<review_id>/
      record.yaml
      triage.yaml
    summary.json
    summary.md
```

## UAT ケース

| ID | semantic purpose | 主な確認内容 |
| --- | --- | --- |
| BZR-RT-036 | Phase 1 campaign 初期化 | `.bob-review-records` 配下へ `campaign.yaml`、`targets.yaml`、`records/_template/record.yaml`、`records/_template/triage.yaml` を作成する。 |
| BZR-RT-037 | レビュー資料 artifact 保存 | `review-packet.md` を同じ campaign / review ID の record 配下へ保存し、更新時は backup を残す。 |
| BZR-RT-038 | review-result から record.yaml 作成 | target、packet、review-result、triage、metrics を `record.yaml` で追跡する。 |
| BZR-RT-039 | 指摘確認・振り分け一覧の雛形作成 | finding ごとの item と、初期 decision `needs_investigation` を持つ `triage.yaml` を作成する。 |
| BZR-RT-040 | 指摘確認・振り分け validation | invalid decision、unknown finding ID、summary mismatch を検出する。 |
| BZR-RT-041 | campaign summary 生成 | 複数 record / triage から `summary.json` と `summary.md` を生成し、件数、形式検証、decision、所要時間を集計する。 |
| BZR-RT-042 | workflow run metadata 紐付け | workflow 経由では run ID / status を record に記録し、取得不能時は unavailable として継続する。 |
| BZR-RT-043 | 実績報告 Markdown 作成 | `summary.md` で件数、採用 / 棄却 / 追加調査、所要時間、warning を確認できるようにする。 |
| BZR-RT-044 | レビュー実行開始とartifact関連付け | `review-run.json` と `review-packet.md` を同じ campaign / review ID で作成し、packet完了から結果取り込みへ遷移する。 |
| BZR-RT-045 | VS Code再起動後の再開 | 未完了runを再起動後に再開し、campaign / review ID とpacketを再入力・再生成せず次の工程へ進む。 |
| BZR-RT-046 | decision別の指摘確認・振り分け validation | accepted / rejected / needs_investigation / deferred ごとの必須 owner、action、reason をWebviewとhostの両方で検証する。 |
| BZR-RT-047 | Metricsの自動計測と補正 | Bobレビューと指摘確認・振り分けの経過時間を自動記録し、validな補正だけを `user_corrected` として保存する。 |
| BZR-RT-048 | レビュー実行一括finalize | `record.yaml` を検証し、`summary.json` / `summary.md` を再生成して全artifactを同じidentityで完了する。 |
| BZR-RT-049 | Summary失敗からの再試行 | 完了済みrecordを保持したまま失敗したsummary工程だけを再試行し、persisted stateから完了する。 |
| BZR-RT-050 | Legacy artifact recovery | 既存artifactを変更せず、確認後に `review-run.json` だけを追加してlegacy runを復旧する。 |

## 指摘確認・振り分け decision

- accepted
- rejected
- needs_investigation
- deferred

## 共通 acceptance gate

次の横断確認は個別UATケースのIDを割り当てず、各画面に適用する。

- keyboard-only で主要操作、focus移動、保存、再開を完了できる。
- VS Codeの200% zoomでも主要操作と状態表示が欠けない。
- High Contrastでもfocus、状態、warning、errorを識別できる。
