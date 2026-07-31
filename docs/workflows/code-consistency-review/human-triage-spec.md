# 指摘確認・振り分け仕様

## 1. 目的

この工程は、Bob が生成した整合プレレビュー結果を正式指摘として自動確定せず、人間が根拠を確認して採用、棄却、追加調査、保留、確認依頼へ分類するためのものである。

operator は Command Palette の `Bob Code Consistency Review: 整合プレレビューを開始` から主GUIを開く。主GUI内では、レビュー準備と前処理の後に `レビュー結果取り込み` を行い、そのまま `指摘確認・振り分け` stageへ進む。独立した公開panelや別の常時表示Command Palette entryは使用しない。

Bob output由来の本文と、人間が入力するdecisionは別成果物へ保存する。browserからsource本文を更新せず、`source_id`をキーとして人間decisionだけを更新する。

## 2. 工程の位置付け

```text
整合プレレビュー
  ↓
review-package生成
  ↓
Bobプレレビュー
  ↓
レビュー結果取り込み
  ↓
Bob outputのschema / evidence検証
  ↓
triage source snapshot生成
  ↓
指摘確認・振り分け
  ↓
人間decision保存
  ↓
互換YAML / Markdown projection再生成
  ↓
正式レビューまたは後続対応へ引き継ぎ
```

## 3. 基本原則

1. `triage-source.yaml`をBob output由来のimmutable snapshotとする。
2. `triage-decisions.yaml`を人間decisionの正本とする。
3. `triage-result.yaml`は既存consumer向けの互換projectionとする。
4. Markdownはsourceとdecisionsから毎回再生成し、人手編集した内容を正本にしない。
5. item identityは配列位置ではなく`source_id`とする。
6. 保存時は`source_sha256`と`decision_revision`を照合する。
7. Bobは最終承認、合否判定、正式レビュー完了を行わない。
8. stage serviceは主GUIのsession、workspace root、render tokenを再利用し、独立panelを作成しない。

## 4. 判断区分

| decision | 内容 | 必須条件 |
|---|---|---|
| `accepted` | 正式レビュー対象として採用 | `reason`、`owner`、`final_severity` |
| `rejected` | 誤検知・対象外などとして棄却 | `reason` |
| `needs_investigation` | 追加調査が必要 | `reason`と、`owner`または`follow_up.action` |
| `deferred` | 後続対応へ保留 | `reason`、`follow_up.due` |
| `question` | 作成者・仕様担当への確認依頼 | `reason`と、`owner`または`suggested_recipient` |

未判断は空文字で表し、decision enumには含めない。`final_severity`は`critical`、`high`、`medium`、`low`、`info`のいずれかとする。

## 5. 入力

- `.bob-review/bob-output/bob-output.yaml`
- review-packageの`manifest.yaml`
- `evidence-index.json`
- code slice、table excerpt、document excerpt、diff context
- 人間が追加で確認した資料

Bob outputをschemaとevidence indexで検証できない場合は、通常の`指摘確認・振り分け`開始条件を満たさない。

## 6. 出力

```text
.bob-review/
  human-triage/
    triage-source.yaml
    triage-decisions.yaml
    triage-result.yaml
    accepted-findings.md
    rejected-findings.md
    investigation-items.md
    questions-to-author.md
    follow-up-actions.md
    migration-report.md
```

| ファイル | 更新主体 | 役割 |
|---|---|---|
| `triage-source.yaml` | extension host | Bob output由来のsource snapshot |
| `triage-decisions.yaml` | 人間／主GUI | source IDごとのdecisionとfollow-up |
| `triage-result.yaml` | extension host | 既存consumer向け互換projection |
| 各Markdown | extension host | decisionに基づく人間向けprojection |
| `migration-report.md` | extension host | legacy migration、drop、rebaseの記録 |

## 7. `triage-source.yaml`

```yaml
schema_version: triage-source/v1
review_id: REVIEW-0001
package_id: PACKAGE-0001
bob_output_sha256: 0123456789abcdef...
generated_at: "2026-07-12T06:00:00.000Z"
items:
  - source_id: PRE-001
    source_type: finding
    category: requirement-code-consistency
    severity: high
    confidence: medium
    summary: timeout異常系が要求と一致しない可能性がある
    reason: 要求と変更コードの動作が異なる
    evidence:
      - evidence_id: REQ-0001
      - evidence_id: SRC-0001
```

source snapshotはBob outputのfinding / questionの全source fieldを保持する。Bob outputの`id`を`source_id`へ変換し、空ID、重複ID、不正なtop-level配列を拒否する。browser payloadからsource itemを再構築しない。

## 8. `triage-decisions.yaml`

```yaml
schema_version: triage-decisions/v1
review_id: REVIEW-0001
source_sha256: fedcba9876543210...
decision_revision: 3
updated_at: "2026-07-12T06:15:00.000Z"
triaged_by: reviewer01
items:
  PRE-001:
    decision: accepted
    final_severity: high
    owner: reviewer01
    reason: 根拠を確認し、正式レビュー対象と判断した
    review_comment: timeout時の戻り値を要求どおりに修正してください
    follow_up:
      required: true
      action: 実装または詳細設計の修正
      due: "2026-07-20"
```

保存規則は次のとおりである。

- `items`は`source_id`をkeyとするmapとする。
- 主GUIはeditable fieldだけを送る。
- disk上の既存decision recordへknown fieldをmergeする。
- 同一schema versionの既存unknown fieldは保持する。
- browserが送ったunknown fieldは採用しない。
- 空のknown stringはstored valueの削除として扱う。
- 未判断でeditable fieldが空のitemはdecision mapへ作らない。

## 9. 競合検出

保存要求は`sourceSha256`、`decisionRevision`、`items[]`を含む。

現在の`triage-source.yaml`のSHA-256と表示時tokenが異なる場合は`TRIAGE_SOURCE_CHANGED`で拒否する。現在の`decision_revision`と表示時revisionが異なる場合は`TRIAGE_REVISION_CONFLICT`で拒否する。

正常保存ごとにrevisionを1増やす。競合時は主GUIを再読込し、最新source / decisionを確認してから再入力する。stale saveを自動mergeしてはならない。

## 10. projection

`triage-result.yaml`はsourceとdecisionsを結合した互換配列として生成する。各Markdownの分類は次のとおりである。

| ファイル | 対象 |
|---|---|
| `accepted-findings.md` | `accepted`のfindingのみ |
| `rejected-findings.md` | `rejected`のfindingのみ |
| `investigation-items.md` | `needs_investigation` / `deferred` |
| `questions-to-author.md` | Bob questionと`question` decisionのitem |
| `follow-up-actions.md` | `follow_up.required: true`のitem |

生成直後の未判断findingを`accepted-findings.md`へ出してはならない。`triage-result.yaml`やMarkdownを直接編集しても、次回projectionで上書きされる。

## 11. 複数ファイル更新

source、decisions、互換YAML、Markdownは関連成果物として扱う。

1. 同一directory配下にstaging directoryを作る。
2. 全target textをstagingへ書く。
3. staged YAMLをparseして検証する。
4. 既存targetを一意な`.bak-<timestamp>-<suffix>`へ退避する。
5. staged filesをfinal pathへrenameする。
6. 途中失敗時は新規targetを削除し、backupを復元する。
7. `finally`でstaging directoryを削除する。

検証失敗時に既存projectionを一部だけ更新してはならない。

## 12. legacy migration

`triage-decisions.yaml`がなく、legacy `triage-result.yaml`がある場合に一度だけ移行する。

- Bob outputから新しいsource snapshotを作る。
- legacy itemからdecision fieldだけを抽出する。
- 現在のsourceに存在する`source_id`だけを移す。
- unmatched IDはdecisionへ追加せず`migration-report.md`へ記録する。
- `triaged_by` / `triaged_at`があれば保持する。
- legacy projectionをbackupしてから新しいprojectionを生成する。

source再生成時に消えたdecision IDもreportへ記録し、別itemへ付け替えない。

## 13. 主GUIのtrust boundary

- panel ownerは`bobCodeConsistencyReviewWizard`だけである。
- `レビュー結果取り込み`と`指摘確認・振り分け`はembedded stage serviceであり、公開panelを所有しない。
- Webview actionはallowlist済みmessageだけを受け付ける。
- saveにはnon-empty source SHA、非負整数revision、重複のないsource ID配列を要求する。
- summary、category、evidence、Bob reason、suggested ownerはsource contextとして表示するだけで、browser payloadを正としない。
- CSP nonce、HTML escape、inline handler禁止、workspace containmentを維持する。

## 14. 完了条件

- finding / questionがすべて判断済み、または明示的に後続へ回されている。
- accepted itemにreason、owner、final severityがある。
- rejected itemにreasonがある。
- investigation / deferred itemに必要なowner、action、dueがある。
- question itemに問い合わせ先がある。
- source SHAとdecision revisionが最新である。
- projectionがdecision mapと一致する。
- unresolved evidence validation errorがない。

## 15. テスト要件

最低限、source field保持、duplicate ID拒否、keyed identity、unknown field保持、decision別validation、source / revision conflict、projection分類、transaction rollback、legacy migration、message whitelist、主GUIstage reopenを自動テストする。

Ubuntu / Windowsではcompile、unit、package、VSIX policy、Extension Host smokeを同一source headで実行する。IBM Bob本体を使う実機UATでは、200% zoom、High Contrast、keyboard-only操作、Developer Tools Console、Bob result handoffを確認する。

## 16. 製品境界

`指摘確認・振り分け`は正式レビュー前の人間判断支援であり、Bobによる自動承認機能ではない。最終的な採用、棄却、修正要求、正式レビューへの引き継ぎは人間が行う。
