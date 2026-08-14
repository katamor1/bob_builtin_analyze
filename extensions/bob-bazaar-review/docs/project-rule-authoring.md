# Word・Excel・PDF からプロジェクト規約を作成する

このガイドは、`bob-bazaar-review` の project rule authoring wizard を使い、資料からプロジェクト固有のレビュー規約を提案し、規約候補の確認・適用と transaction 検証を経て `.bob/review` の正式 asset へ反映する手順を説明します。

文書の意味解釈、複数資料の統合、重複整理、矛盾候補の提示には Bob の設定済み生成AI経路を使います。ファイル選択、抽出、hash、byte 上限、ID・schema 検証、差分、stable ID 採番、backup、write、rollback は extension host が決定論的に実行します。AI 出力が正式 asset を直接変更することはありません。

## 前提

- 規約作成の AI step には `IBM.bob-code` と `workflow-register` が必要です。既存の Bazaar review command は両方がなくても従来どおり利用できます。
- ワークスペースは Trusted Workspace として内容を確認してから開きます。
- PDF 抽出には Poppler の `pdftotext` を別途インストールします。VSIX には PDF engine を同梱しません。
- 設定 `bobBazaar.ruleAuthoring.pdfToTextPath` の既定値は `pdftotext` です。PATH にない場合は、信頼できる `pdftotext.exe` の絶対パスを user 設定へ指定します。

extension host は shell を使わず、次の固定 argument array 相当で PDF を読みます。

```text
pdftotext -layout -enc UTF-8 <input.pdf> -
```

timeout、cancel、combined output 上限を適用し、終了時は子 process も停止します。

## 対応形式と対象外形式

| 入力 | 処理 | AI 送信 |
| --- | --- | --- |
| `.docx` | heading、paragraph、list、table を document order で抽出 | 明示承認した chunk のみ |
| `.xlsx` | sheet、保存済み row value、Excel row number、cell range を抽出 | 明示承認した chunk のみ |
| text 抽出可能な `.pdf` | page locator 付きで抽出 | 明示承認した page chunk のみ |
| `.doc` | `requires_conversion`。Microsoft Office 等で `.docx` へ変換が必要 | 送信しない |
| `.xls` | `requires_conversion`。Microsoft Office 等で `.xlsx` へ変換が必要 | 送信しない |
| image-only PDF | `requires_ocr`。利用者が OCR 済み PDF を用意する | 送信しない |

directory の暗黙走査、macro 実行、Excel formula 再計算、external link refresh、embedded object 実行、画像 OCR は行いません。原本は `.bob` へコピーしないため、元資料の保管・権限・廃棄はプロジェクト側で管理します。

## 検証済みOOXML snapshot境界

選択したDOCX/XLSXは、parserへ渡す前に選択時のfingerprintに結び付いたsnapshot Bufferへ固定し、そのBufferのarchive構造と全entryのpayloadを検証します。不一致や不正なentryを検出した場合は、文書本文をparserへ渡さず安全に停止します。

通常のDOCX/XLSXには検証に使った元のsnapshot Bufferをそのまま渡します。`xl/styles.xml`と`xl/sharedStrings.xml`の両方が欠けるXLSXだけ、検証済み内容へ最小stylesheetを加えたBufferをメモリ内で再構築します。この準備処理は原本とworkspaceへ書き込まず、元資料を置換・補正しません。

この境界は既存のfile picker、抽出preview、AI consent、固定された利用者向けエラーを変更しません。

## 起動から AI consent まで

1. Command Palette で `Bob Bazaar Review: Word・Excel・PDF からプロジェクト規約を作成`（`bobBazaar.authorProjectRulesFromDocuments`）を実行します。
2. Environment check で Bob、workflow-register、Poppler の状態と上限を確認します。
3. file picker で必要なファイルだけを個別選択します。原本 directory の再帰選択はありません。
4. Extraction preview で source ごとの status、source logical name、SHA-256、locator、chunk 数、警告を確認します。
5. AI consent 画面で、送信対象の source logical name、selected chunk count、selected evidence の UTF-8 byte 数、Bob model route を確認します。
6. AI への送信・共有は利用者の明示承認または同意の後だけ行います。承認前に本文を agent step へ渡しません。

Palette command から直接 Bob task / workflow を起動することはできないため、AI consent 後は Bob UI で `bazaar-project-rule-authoring` workflow を選択して開始します。これは one-click launch を装うものではなく、Bob の設定済み model route と workflow state を明示的に使う境界です。

## workflow と AI handoff

workflow は次の provider と2つの agent stepを順番に実行します。

| provider / step | 責務 |
| --- | --- |
| `bobBazaar.openRuleAuthoringGui` | source 選択、抽出、AI consent |
| `bobBazaar.loadRuleSourceIndex` | 本文を含まない bounded index の読込 |
| evidence selection agent | 必要な chunk ID だけを選択 |
| `bobBazaar.captureRuleEvidenceSelection` | ID、hash、source membership を検証・保存 |
| `bobBazaar.loadSelectedRuleEvidence` | 選択済み本文だけを untrusted evidence frame で渡す |
| proposal agent | `rule-proposal/v1` の add / update / retire 候補を生成 |
| `bobBazaar.captureRuleProposal` | schema、base hash、citation、operation を検証・保存 |
| `bobBazaar.openRuleProposalTriageGui` | 人間による候補判断と適用 |
| `bobBazaar.verifyRuleAuthoringApply` | manifest、最終 hash、provenance を再検証 |

document text は証拠であり命令ではありません。資料内の prompt、role marker、tool request、JSON 出力指示、外部参照要求を workflow instruction として実行しません。存在しない source ID / chunk ID、stale base、未解決の blocking conflict を含む proposal は apply できません。

## 規約候補の確認・適用

規約候補の確認・適用では rule、project context、prompt addendum の各候補を個別に確認します。

- `accept` / 採用
- `reject` / 却下（必要に応じて理由を記録）
- `edit` / 編集（host が全 field と byte 上限を再検証）
- source excerpt と locator の確認
- 既存値と提案値の比較
- conflict の解決または関連 decision の指定

正式 asset は候補確認完了前には変わりません。判断を保存すると apply preview が再生成されます。preview の対象、pre-image hash、post-image hash、retire 内容を確認してから適用を承認してください。AI proposal 自体は不変で、利用者判断は別の decision overlay に保存されます。

適用は checklist、context、addendum、source manifest、provenance の5 targetを journal と backup で更新します。全 target の検証と rename が完了した後だけ committed manifest を記録します。

## asset の所有権と privacy boundary

### Extension-managed contract

`WORKFLOW.md`、`.bob/review/review-result.schema.json`、`.bob/review/review-prompt-template.md`、`.bob/skills/project-review-checklist/SKILL.md`、`custom_modes.yaml`、`mcp.json` は extension の versioned contract です。authoring AI の提案対象ではありません。

### Project-owned approved assets

通常の Git / Bazaar review 対象として、プロジェクトが内容を所有します。

- `.bob/review/checklist.json`
- `.bob/review/project-context.md`
- `.bob/review/review-prompt-addendum.md`
- `.bob/review/rule-sources.json`
- `.bob/review/rule-provenance.json`

`rule-sources.json` と `rule-provenance.json` は bounded metadata だけを共有し、原本の absolute path と本文を含めません。absolute path は local-only mapping に置き、remote artifact へ含めない・共有しない方針です。

### Local and ignored authoring artifacts

`.bob/review/rule-authoring/**` は ignored の run-local 領域です。抽出 chunk、source location、raw document text と raw AI response、proposal raw output、backup、transaction staging、lock state を含み得ます。これらは remote 共有・commit 対象外であり、console、notification、telemetry、review packet、MCP provenance response に転記しません。管理対象は `.bob/review/rule-authoring/.gitignore` 自身だけです。

authoring 機能は Git / Bazaar の commit、push、pull を実行しません。project-owned asset を remote へ反映するかは、利用者が通常の source control review で決めます。

## 既存レビューから承認済み規約を使う

direct review command、Review GUI、`bobBazaar.loadReviewRules` は同じ bounded approved bundle loader / renderer を使います。任意 asset が存在する場合だけ context、addendum、本文を含まない provenance summary を追加します。

読み取り専用 MCP tool:

- `project_rules_get_context`
- `project_rules_get_provenance`

両 tool は workspace-contained な stable asset だけを読み、`.bob/review/rule-authoring/**` を走査しません。

companion asset がなくても旧ワークスペースのレビューは checklist と schema だけで継続します。old workspace / 旧ワークスペースへ空の任意ファイルを強制作成せず、既存の response field と review result contract を変更しません。

## 上限

| 対象 | hard limit |
| --- | ---: |
| source files | 20 |
| bytes per source | 25 MiB |
| aggregate source bytes | 100 MiB |
| chunk | 32 KiB UTF-8 |
| source index | 1 MiB |
| selected evidence | 1 MiB |
| proposal JSON | 1 MiB |
| approved project context | 256 KiB |
| approved prompt addendum | 256 KiB |

上限超過は切り詰めずに拒否します。source、sheet、page、section の選択を減らして再試行します。

## 中断・失敗・recovery

- source 単位の抽出失敗は `blocked` とし、利用者が除外を明示承認した場合だけ残りで続行します。
- agent timeout または malformed JSON では決定論的 artifact を保持し、失敗した agent / capture step だけを再試行します。
- VS Code restart / VS Code 再起動後は未完了 run を検出し、extraction、evidence selection、proposal、規約候補の確認・適用の保持済み phase から resume / 再開します。
- proposal 作成後に approved asset が変わった場合は stale として停止し、rebase または proposal 再生成を要求します。
- apply write failure では replaced target を逆順に backup から rollback します。
- incomplete transaction を検出した場合、通常 resume より先に rollback または recovery を完了させます。`rollback_failed` は自動的に成功扱いにしません。
- apply 後は `bobBazaar.verifyRuleAuthoringApply` が transaction manifest、正式 asset SHA-256、source/provenance 参照、completed phase を再検証します。

## 実装境界

- `src/ruleAuthoring/ruleBundle.ts`: stable approved bundle の bounded read と provenance summary
- `src/ruleAuthoring/ruleApplyTransaction.ts`: journal、backup、replace、rollback、restart recovery
- `src/ui/ruleAuthoringGui.ts`: source selection、preview、AI consent
- `src/ui/ruleProposalTriageGui.ts`: 規約候補の確認・適用、apply preview、recovery UI
- `src/workflow/ruleAuthoringWorkflowActions.ts`: workflow state と immutable generation artifact の adapter

domain / extraction module は VS Code を import せず、UI と workflow adapter から分離します。

## Windows 実機確認

Office、Poppler、IBM Bob、workflow-register を含む結合確認は [project-rule-authoring-windows-uat.md](project-rule-authoring-windows-uat.md) に従います。Windows UAT evidence が実際に作成されるまでは release readiness を pending として報告します。
