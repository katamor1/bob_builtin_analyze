Replaced: `workflowRegister.openOperationHub`, `workflowRegister.openWorkflowBuilder`, `bobBazaar.openReviewGui`, and `bobCodeConsistency.openReviewWizard` are the current operator routes; the legacy Operation Hub, Run Monitor, Result Capture, Human Triage, Campaign Dashboard, Traceability Prep, and Template Studio labels below are retained only as historical terminology-design context.

# 3拡張機能 GUI 日本語文言見直し 設計

- 対象リポジトリ: `katamor1/bob_builtin_analyze`
- 対象拡張機能:
  - `extensions/workflow-register`
  - `extensions/bob-bazaar-review`
  - `extensions/bob-code-consistency-review`
- 作成日: 2026-07-16
- 状態: ユーザー合意済み

## 1. 目的

3つの VS Code 拡張機能の GUI を、日本人ユーザーが日常業務で迷わず利用できる表示へ改訂する。

現状は日本語と英語、業務用語と内部スキーマ名が同じ階層で混在している。特に `Run`、`Human Triage`、`Result Capture`、`Readiness`、`accepted`、`pending` などの実装用語や保存値が、そのまま画面名、見出し、ボタン、状態表示として露出している。

この変更では、主要な操作と状態を自然な日本語で表示し、JSON・YAML キーや保存値など技術上必要な識別子だけを補助情報として残す。これにより、プロジェクトリーダー、SE、プログラマー、テスター、UAT 担当者が、Command Palette や内部データ形式を意識せず操作できる状態を目指す。

## 2. 対象範囲

次のユーザー可視文言を対象とする。

1. Webview のタイトル、見出し、タブ、ラベル、ボタン、空状態、補助説明、確認文、進捗文、エラー文
2. Webview の `aria-label` などアクセシビリティ向け文言
3. VS Code パネルタイトル、Quick Pick、Input Box、通知、確認ダイアログ
4. `package.json` の `displayName`、`description`、コマンドタイトル、コマンドカテゴリ、ビュー名、設定説明
5. 実行状態、判定、重大度、フェーズなど、内部列挙値を画面に出すための表示ラベル
6. GUI の文言を文字列比較している既存テスト

次は変更しない。

- コマンド ID
- Webview メッセージの `type`、`action`、`data-*` 値
- JSON・YAML のフィールド名
- 保存される列挙値
- ファイル名、ディレクトリ構造、成果物スキーマ
- workflow action contract や公開 API
- 英語ロケールへの切り替え機能

## 3. 採用方針

### 3.1 日本語主表示、内部識別子は補助表示

ユーザーの判断や操作に必要なラベルは日本語にする。内部識別子が入力・照合に必要な場合だけ、コード表記または補助説明として併記する。

例:

```text
キャンペーン ID
campaign_id
```

判定値は保存値を維持し、表示だけを日本語化する。

```html
<option value="accepted">採用</option>
```

### 3.2 完全な多言語化基盤は導入しない

今回の対象ユーザーは日本人ユーザーであり、変更目的は既存 GUI の可読性改善である。このため `package.nls.json` や実行時ロケール切り替えは導入しない。

ただし、動的な状態値や判定値は表示関数へ集約し、将来の多言語化で置き換えやすい構造にする。

### 3.3 3拡張間で用語を統一する

3拡張は別 VSIX のまま維持し、共有パッケージは追加しない。各拡張内に小さな表示ラベル関数または定数を置き、同じ日本語用語を使用する。用語の一致は設計書とテストで保証する。

## 4. 文言設計ルール

### 4.1 画面名は実装名ではなく目的を表す

| 現行表現 | 基本表示 |
|---|---|
| Operation Hub | 操作センター |
| Workflow Builder | ワークフロー作成・編集 |
| Result Capture | 結果の取り込み |
| Human Triage | 人による判定 |
| Campaign Dashboard | レビューキャンペーン ダッシュボード |
| Traceability Prep | トレーサビリティ確認 |
| Template Customization Studio | テンプレート調整 |

### 4.2 ボタンは「対象＋動作」で表す

短い英単語だけのボタンは避け、押した結果が予測できる文言にする。

| 現行表現 | 基本表示 |
|---|---|
| Validate | 内容を検証 |
| Save | 保存 |
| Apply | 変更を反映 |
| Export | ファイルに書き出す |
| Open | 開く |
| Resume | 続きから再開 |
| Retry | もう一度実行 |
| Accept | 採用 |
| Reject | 却下 |

### 4.3 状態値は日本語表示へ変換する

保存値や分岐条件は変更しない。画面に表示する直前に、用途別の表示関数を通す。

主な判定値:

| 保存値 | 表示 |
|---|---|
| `accepted` | 採用 |
| `rejected` | 却下 |
| `needs_investigation` | 要調査 |
| `deferred` | 保留 |
| `question` | 確認依頼 |
| `pending` | 未判定 |

主な重大度:

| 保存値 | 表示 |
|---|---|
| `critical` | 緊急 |
| `high` | 高 |
| `medium` | 中 |
| `low` | 低 |
| `info` | 情報 |

主な実行状態:

| 保存値 | 表示 |
|---|---|
| `not_started` | 未開始 |
| `in_progress` | 実行中 |
| `running` | 実行中 |
| `reviewing` | 人による確認待ち |
| `held` | 手動操作待ち |
| `paused` | 一時停止 |
| `completed` | 完了 |
| `failed` | 失敗 |

未知の値は処理を止めず、`不明（<内部値>）` の形式で安全に表示する。

### 4.4 技術用語の扱い

次の固有名詞・形式名は原則として維持する。

- Bob
- Bazaar
- Git
- VS Code
- MCP
- JSON
- YAML
- Markdown
- UTF-8
- Shift-JIS

次の内部用語はユーザー向け日本語を主表示とする。

| 内部・現行用語 | ユーザー向け表示 |
|---|---|
| workflow | ワークフロー |
| run | 実行 |
| step | ステップ |
| Review Run | レビュー実行 |
| campaign | レビューキャンペーン |
| packet | レビュー資料 |
| triage | 判定 |
| finding | 指摘 |
| evidence | 根拠 |
| record | 実績記録 |
| summary | 集計レポート |
| artifact | 成果物 |
| diagnostics | 診断結果 |
| readiness | 適用準備状況 |
| guardrails | 安全制限 |
| preflight | 事前確認 |

`source`、`target` など意味が文脈で変わる語は機械的に一語へ統一せず、`資料`、`参照元`、`レビュー対象`、`反映先` のように画面目的へ合わせる。

### 4.5 エラー文には次の操作を含める

エラーは原因だけで終わらせず、ユーザーが取るべき操作を続ける。

例:

```text
ワークスペースが選択されていません。フォルダーを開いてから再実行してください。
```

```text
レビュー結果を保存できませんでした。下記の入力項目を修正し、もう一度「検証して保存」を押してください。
```

内部例外メッセージをそのまま画面へ出す必要がある場合も、画面側の見出しまたは先頭文でユーザー操作を案内する。

## 5. 実装構造

### 5.1 `package.json`

各拡張の `package.json` は、コマンド ID と設定キーを維持したまま、表示名と説明だけを書き換える。

- コマンドカテゴリは日本語へ統一する。
- `GUI`、`Wizard`、`Human Triage` だけでは目的が分からないタイトルを、業務操作が分かるタイトルへ変える。
- 設定説明は、内部型名よりも設定効果を先に説明する。
- `byte`、`run`、`step` などは文章として自然な日本語へ整える。

### 5.2 Webview の静的文言

HTML レンダラー内の見出し、タブ、ラベル、ボタン、説明、空状態を直接改訂する。

静的文言を大規模な共通ライブラリへ移すことはしない。画面単位の可読性を優先し、同じ画面で使用する文言はそのレンダラーの近くに置く。

### 5.3 Webview の動的文言

内部状態や列挙値をそのまま `textContent` や `<option>` へ渡している箇所には、表示関数を追加する。

代表例:

```ts
function reviewDecisionLabel(value: string): string
function reviewRunPhaseLabel(value: string): string
function reviewRunStatusLabel(value: string): string
function severityLabel(value: string): string
function extractionStatusLabel(value: string): string
```

DOM の `value`、Webview から extension host へ送る値、保存値は従来どおりの英語識別子とする。

### 5.4 通知と確認ダイアログ

extension host 側の `showInformationMessage`、`showWarningMessage`、`showErrorMessage`、Quick Pick、Input Box の表示文言も対象とする。

確認ボタンの戻り値を文字列比較している箇所では、表示ラベルと比較文字列を同時に変更し、操作分岐を壊さない。

### 5.5 セキュリティ境界

既存の HTML エスケープ、CSP、表示文字数上限、サニタイズ処理を維持する。日本語化のために `innerHTML` へ未検証値を追加しない。

## 6. 拡張機能別の改訂範囲

### 6.1 `workflow-register`

主対象:

- Bob Operation Hub
- Workflow Builder
- Manual Step Panel
- Template Customization Studio
- Runs View、Run Diagnostics、Run Control に表示する状態・操作
- コマンドパレットと設定画面

主要な改訂:

- `Bob Operation Hub` → `Bob 操作センター`
- `Run Monitor` → `実行状況`
- `Workflow Builder` → `ワークフロー作成・編集`
- `Step detail` → `ステップ設定`
- `Inputs` → `入力項目`
- `Requires` → `実行条件`
- `Preflight` → `事前確認`
- `Branching` → `分岐・ループ`
- `Artifacts` → `成果物`
- `Guardrails` → `安全制限`
- `Preview / Diagnostics` → `プレビューと診断`
- `Reused`、`Completed`、`Artifact verified` などの実行履歴表示を日本語化
- `Bob Todo` の状態文を、ユーザーが次の操作を判断できる文章へ変更

内部フィールド名が必要な編集画面では、`出力キー resultKey` のように日本語を先に置く。

### 6.2 `bob-bazaar-review`

主対象:

- Bazaar Review GUI
- Review Run 再開 UI
- Result Capture GUI
- Human Triage GUI
- Campaign Dashboard
- Project Rule Source Wizard
- Project Rule Proposal Triage
- コマンドパレットと設定画面

主要な改訂:

- `Wizard v3 / Review Run` → `レビュー手順`
- `Result Capture` → `レビュー結果の取り込み`
- `Human Triage` → `人による判定`
- `Campaign Dashboard` → `レビューキャンペーン ダッシュボード`
- `Project Rule Source Wizard` → `規約資料の取り込み`
- `Project Rule Proposal Triage` → `規約案の確認・採否`
- `campaign_id`、`review_id` は `キャンペーン ID`、`レビュー ID` を主ラベルにし、必要なら内部名を補助表示
- review run のフェーズ、状態、次の操作を日本語化
- 規約資料の抽出状態と AI 送信確認を日本語化
- 規約案の採用、却下、編集、競合解決、反映プレビュー、復旧操作を日本語化
- ダッシュボードの KPI、表見出し、空状態、書き出し操作を日本語化

### 6.3 `bob-code-consistency-review`

主対象:

- Consistency Review Wizard
- Result Capture GUI
- Human Triage GUI
- Traceability Prep Webview
- コマンドパレットと設定画面

主要な改訂:

- `Consistency Review Wizard` → `整合プレレビューを開始`
- `Evidence Picker` → `関連資料の選択`
- `Review Focus` → `確認観点`
- `Package Preview` → `Bob に渡す資料`
- `Code Consistency Result Capture` → `Bob 出力の取り込み`
- `Code Consistency Human Triage` → `指摘・確認事項の判定`
- `Traceability Prep` → `トレーサビリティ確認`
- review focus、change type、traceability status、判定、重大度を表示関数で日本語化
- `Approve`、`Reject`、`Deprecate`、`Restore Original`、`Defer as TBD` などの操作を日本語化
- Bob の判断理由、影響、推奨対応、担当者、後続対応などのフィールド名を自然な日本語へ変更

## 7. データフロー

文言変更後もデータフローは次の形を維持する。

```text
保存済みデータ・内部モデル
  ↓ 英語の識別子・列挙値のまま
Webview 用モデル
  ↓ 表示関数で日本語ラベルへ変換
HTML / DOM 表示
  ↓ ユーザー操作時は元の value を送信
extension host
  ↓ 従来の識別子・列挙値のまま保存
成果物・run state・catalog
```

この境界により、既存成果物、schema、workflow、テストフィクスチャとの互換性を保つ。

## 8. テスト方針

### 8.1 既存テストの更新

表示文字列を期待している既存テストは、新しい日本語文言へ更新する。ライフサイクル、メッセージ型、ファイル書き込み、状態遷移など、表示文言と無関係な期待値は変更しない。

### 8.2 表示値マッピングのテスト

列挙値を表示関数へ集約する箇所では、少なくとも次をテストする。

- 既知の全列挙値が期待する日本語へ変換される
- 未知の値が例外にならず、安全なフォールバック表示になる
- `<option value>` や Webview メッセージでは内部値が維持される
- 日本語表示から内部値を逆変換しない

### 8.3 旧主要文言の残存チェック

ユーザーの主要導線に残してはいけない旧文言を、対象レンダラーのテストで検出する。

例:

- `Human Triage`
- `Result Capture`
- `Campaign Dashboard`
- `Project Rule Source Wizard`
- `Project Rule Proposal Triage`
- `Consistency Review Wizard`
- `Traceability Prep`
- `Run Monitor`

ファイル名、型名、コメント、コマンド ID に含まれる文字列は許容する。検査対象は生成 HTML、パネルタイトル、コマンドタイトルなどユーザー可視部分に限定する。

### 8.4 検証コマンド

各拡張で少なくとも次を実行する。

```text
npm run compile
npm test
```

リポジトリ共通の extension quality gate が利用可能な場合は、3拡張分を実行する。文言変更によって VSIX のファイル構造や成果物契約が変わっていないことも確認する。

## 9. 受け入れ条件

1. 主要な画面タイトル、見出し、ボタンに英語だけの文言が残っていない
2. `accepted`、`pending`、`critical` などの内部列挙値が主要表示として露出していない
3. 内部キーを表示する場合は、日本語の説明が主ラベルになっている
4. 3拡張で `実行`、`ステップ`、`人による判定`、`指摘`、`根拠`、`成果物`、`診断結果` の用語が一致している
5. エラーと空状態に、ユーザーが次に取れる操作が示されている
6. コマンド ID、Webview メッセージ、保存値、schema、既存成果物との互換性が維持されている
7. 既存のセキュリティ境界と HTML エスケープが維持されている
8. 3拡張のコンパイルとテストが成功する
9. 狭いサイドバーと通常パネルの両方で、主要な日本語ラベルが欠けたり判別不能になったりしない
10. GUI 操作手順やテスト内の画面名が、実装後の表示と一致している

## 10. 実装順序

実装は次の順序で行う。

1. 3拡張共通の用語と表示値マッピングを確定する
2. `workflow-register` の入口と共通実行 UI を改訂する
3. `bob-bazaar-review` のレビュー、規約作成、ダッシュボード UI を改訂する
4. `bob-code-consistency-review` のウィザード、出力取り込み、判定、トレーサビリティ UI を改訂する
5. `package.json` のコマンド・設定表示を3拡張で整える
6. テストの期待値と表示値マッピングテストを更新する
7. 3拡張のコンパイル、テスト、共通品質ゲートを実行する
8. 最終的な残存英語と用語不一致を確認する

この順序により、共通の入口である `workflow-register` から専門 UI へ用語を波及させ、後戻りを減らす。
