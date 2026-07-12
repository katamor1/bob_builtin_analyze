# 人間 triage 仕様

## 1. 目的

人間 triage は、Bob が出したプレレビュー結果を、そのまま正式指摘にせず、人間が根拠を確認して採用・棄却・追加調査・保留・質問へ分類する工程である。

Bob output 由来の本文と、人間が入力する decision は別の成果物へ保存する。GUI から source 本文を更新せず、source ID をキーとして人間 decision だけを更新する。

## 2. triage の位置付け

```text
review-package 生成
  ↓
Bob プレレビュー
  ↓
Bob output の schema / evidence 検証
  ↓
triage source snapshot 生成
  ↓
人間 decision 保存
  ↓
互換 YAML / Markdown projection 再生成
  ↓
正式レビューまたは後続対応へ引き継ぎ
```

## 3. 基本原則

1. `triage-source.yaml` を Bob output 由来の immutable snapshot とする。
2. `triage-decisions.yaml` を人間 decision の正本とする。
3. `triage-result.yaml` は既存利用者向けの互換 projection とする。
4. Markdown は source と decisions から毎回再生成し、人手編集した内容を正本にしない。
5. item identity は配列位置ではなく `source_id` とする。
6. 保存時は `source_sha256` と `decision_revision` を照合する。
7. Bob が最終承認や合否判定を行わない。

## 4. 判断区分

| decision | 内容 | 必須条件 |
|---|---|---|
| `accepted` | 正式レビュー対象として採用 | `reason`、`owner`、`final_severity` |
| `rejected` | 誤検知・対象外などとして棄却 | `reason` |
| `needs_investigation` | 追加調査が必要 | `reason` と、`owner` または `follow_up.action` |
| `deferred` | 後続対応へ保留 | `reason`、`follow_up.due` |
| `question` | 作成者・仕様担当への質問 | `reason` と、`owner` または `suggested_recipient` |

未判断は空文字で表し、decision enum には含めない。

`final_severity` は次のいずれかとする。

```text
critical | high | medium | low | info
```

## 5. 入力

- `.bob-review/bob-output/bob-output.yaml`
- review-package の `manifest.yaml`
- `evidence-index.json`
- code slice、table excerpt、document excerpt、diff context
- 人間が追加で確認した資料

Bob output を検証できない場合は、通常の triage 開始条件を満たさない。

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
| `triage-source.yaml` | 拡張機能 | Bob output 由来の source snapshot |
| `triage-decisions.yaml` | 人間 / GUI | source ID ごとの decision と follow-up |
| `triage-result.yaml` | 拡張機能 | 既存利用者向け互換 projection |
| 各 Markdown | 拡張機能 | decision に基づく人間向け projection |
| `migration-report.md` | 拡張機能 | legacy migration、drop、rebase の記録 |

## 7. triage-source.yaml

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
    summary: timeout 異常系が要求と一致しない可能性がある
    reason: 要求と変更コードの動作が異なる
    impact: 呼び出し元へ誤った結果を返す可能性がある
    recommended_action: timeout 分岐を確認する
    human_check: 設計担当が要求範囲を確認する
    evidence:
      - evidence_id: REQ-0001
        type: requirement
        ref: REQ-123
      - evidence_id: SRC-0001
        type: code
        ref: src/control/foo.c:112-172
```

### 7.1 source snapshot ルール

- Bob output の finding / question の全 source field を保持する。
- Bob output の `id` を `source_id` へ変換する。
- `source_type` は `finding` または `question` とする。
- 空 ID、重複 ID、不正な top-level 配列は生成エラーとする。
- GUI message から source item を再構築しない。
- source YAML 本文全体の SHA-256 を `source_sha256` として decision 側へ記録する。

## 8. triage-decisions.yaml

```yaml
schema_version: triage-decisions/v1
review_id: REVIEW-0001
source_sha256: fedcba9876543210...
decision_revision: 3
updated_at: "2026-07-12T06:15:00.000Z"
triaged_by: reviewer01
triaged_at: "2026-07-12T06:15:00.000Z"
items:
  PRE-001:
    decision: accepted
    final_severity: high
    owner: reviewer01
    reason: 要求とコード差分を確認し、正式レビュー対象と判断した
    review_comment: timeout 時の戻り値を要求どおりに修正してください
    follow_up:
      required: true
      action: 実装または詳細設計の修正
      due: "2026-07-20"
```

### 8.1 decision 保存ルール

- `items` は `source_id` を key とする map とする。
- GUI は editable field だけを送る。
- disk 上の既存 decision record へ known field を merge する。
- 同一 schema version の既存 unknown field は保持する。
- GUI が送った unknown field は採用しない。
- 空の known string は stored value の削除として扱う。
- `required: false` かつ action / due が空の follow-up は保存しない。
- 未判断で editable field が空の item は decision map に作らない。

## 9. 競合検出

保存要求は次を含む。

```text
sourceSha256
decisionRevision
items[]
```

### 9.1 source 競合

現在の `triage-source.yaml` の SHA-256 と画面表示時の `sourceSha256` が異なる場合、次の error として保存を拒否する。

```text
TRIAGE_SOURCE_CHANGED
```

### 9.2 revision 競合

現在の `decision_revision` と画面表示時の revision が異なる場合、次の error として保存を拒否する。

```text
TRIAGE_REVISION_CONFLICT
```

正常保存ごとに revision を1増やす。競合時は再読込して最新 source / decision を確認する。

## 10. projection

### 10.1 triage-result.yaml

既存 consumer 向けに、source と decisions を結合した配列形式を生成する。

```yaml
schema_version: 1
review_id: REVIEW-0001
decision_revision: 3
source_sha256: fedcba9876543210...
items:
  - source_id: PRE-001
    source_type: finding
    decision: accepted
    final_severity: high
    owner: reviewer01
    reason: 要求とコード差分を確認した
    review_comment: timeout 処理を修正してください
    question: ""
    follow_up:
      required: true
      action: 実装修正
      due: "2026-07-20"
```

`triage-result.yaml` を直接編集しても、次回 projection で上書きされる。

### 10.2 Markdown 分類

| ファイル | 対象 |
|---|---|
| `accepted-findings.md` | `accepted` の finding のみ |
| `rejected-findings.md` | `rejected` の finding のみ |
| `investigation-items.md` | `needs_investigation` / `deferred` |
| `questions-to-author.md` | Bob question と `question` decision の item |
| `follow-up-actions.md` | `follow_up.required: true` の item |

生成直後の未判断 finding を `accepted-findings.md` へ出してはならない。

## 11. 複数ファイル更新

source、decisions、互換 YAML、Markdown は関連成果物として扱う。

1. 同一 triage directory 配下に staging directory を作成する。
2. 全 target text を staging へ書く。
3. staged YAML を parse して検証する。
4. 既存 target を一意な `.bak-<timestamp>-<suffix>` へ退避する。
5. staged files を final path へ rename する。
6. 途中失敗時は新規 target を削除し、backup を復元する。
7. `finally` で staging directory を削除する。

検証失敗時に既存 projection を一部だけ更新してはならない。

## 12. legacy migration

`triage-decisions.yaml` がなく、legacy `triage-result.yaml` がある場合に一度だけ移行する。

1. Bob output から新しい source snapshot を作る。
2. legacy item から decision field だけを抽出する。
3. 現在の source に存在する `source_id` だけを移す。
4. unmatched ID は decision へ追加せず `migration-report.md` に記録する。
5. `triaged_by` / `triaged_at` があれば保持する。
6. 1件以上移行した場合は revision を1とする。
7. legacy projection を backup してから新しい projection を生成する。

source 再生成時に消えた decision ID も report へ記録し、別 item へ付け替えない。

## 13. GUI trust boundary

- Webview action は `generateTriage`、`saveDecisions`、`openResultCapture` だけを許可する。
- save には non-empty source SHA、非負整数 revision、重複のない source ID 配列を要求する。
- summary、category、evidence、Bob reason、suggested owner は source context として表示するだけで、browser payload を正としない。
- suggested owner を人間 owner field へ自動転記しない。
- CSP nonce、HTML escape、inline handler 禁止を維持する。

## 14. accept 時の確認ルール

`accepted` にする前に以下を確認する。

- evidence ID が `evidence-index.json` に存在する。
- file path、line range、文書 ID が実在する。
- 今回の変更範囲に関係する。
- severity と confidence を混同していない。
- 指摘文が断定しすぎていない。
- owner と follow-up が明確である。

## 15. reject reason の代表分類

| 理由 | 内容 |
|---|---|
| `not_changed_area` | 今回の変更範囲ではない |
| `evidence_mismatch` | 根拠が指摘内容を支えていない |
| `existing_behavior` | 既存仕様どおり |
| `document_old` | 入力文書が古い |
| `test_exists` | 既にテストが存在する |
| `duplicate` | 他の指摘と重複 |
| `ai_misread` | Bob の読み違い |

reason field には、人間が実際に確認した内容を記録する。

## 16. triage の完了条件

- finding / question がすべて判断済み、または明示的に後続へ回されている。
- accepted item に reason、owner、final severity がある。
- rejected item に reason がある。
- investigation / deferred item に必要な owner、action、due がある。
- question item に問い合わせ先がある。
- source SHA と decision revision が最新である。
- projection が decision map と一致する。
- unresolved evidence validation error がない。

## 17. テスト要件

最低限、次を自動テストする。

1. source snapshot が finding / question の source field を保持する。
2. duplicate source ID を拒否する。
3. posted item の順序を変えても decision identity が変わらない。
4. stored unknown field を保存後も保持する。
5. posted unknown field を採用しない。
6. decision-specific required field を検証する。
7. source hash conflict と revision conflict を検出する。
8. 未判断保存で空 decision record を作らない。
9. accepted / rejected / investigation / question / follow-up projection を正しく分類する。
10. staged YAML validation failure時に既存ファイルを維持する。
11. legacy migration、unmatched warning、backupを確認する。
12. Webview message whitelist、token、重複IDを検証する。
13. Ubuntu / Windows の unit、package、Extension Host smoke を実行する。

## 18. 製品境界

Human Triage は正式レビュー前の人間判断支援であり、Bob による自動承認機能ではない。最終的な採用、棄却、修正要求、正式レビューへの引き継ぎは人間が行う。
