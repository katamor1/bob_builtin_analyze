# Project Rule Authoring Windows UAT Runbook

Status: **PENDING — Windows 実機で記録が作成されるまで未完了**

この runbook は Windows 11、Microsoft Office で作成した資料、Poppler、IBM Bob、workflow-register を用いて project rule authoring の release candidate を確認する手順です。操作は必ず disposable test workspace と機密情報を含まない fixture で行います。

## 1. Evidence record

実行ごとに次を記録します。値が path や本文を含む場合は記録せず、portable ID、version、count、SHA-256 だけを残します。

| Evidence field | Recorded value |
| --- | --- |
| test date / operator |  |
| extension version |  |
| extension commit / VSIX SHA-256 |  |
| OS build | Windows 11 /  |
| VS Code or Bob IDE version |  |
| IBM Bob version |  |
| workflow-register version |  |
| Poppler version |  |
| Node.js / npm version |  |
| Bazaar version |  |
| fixture SHA-256 | DOCX: / XLSX: / text PDF: / conversion and OCR fixtures: |
| authoring run ID |  |
| selected source count |  |
| selected evidence bytes |  |
| rule decisions | accept: / reject: / edit: / retire: |
| transaction ID |  |
| final asset SHA-256 | checklist: / context: / addendum: / sources: / provenance: |
| approved-rule review evidence | Bazaar revision review ID / matching rule ID / result artifact SHA-256 |
| passed / failed / pending cases |  |
| redacted defects |  |

## 2. Fixture preparation

Microsoft Office で、個人名、顧客名、実 path、credential を含まない次の fixture を作成します。

- `.docx`: heading、paragraph、list、table に異なる規約を置く。
- `.xlsx`: 複数 sheet、空 row、保存済み formula value、離れた cell range を含める。
- text PDF: 複数 page と内部の空 page を含める。
- `.doc` と `.xls`: conversion 表示確認専用。
- image-only PDF: OCR が必要な状態の確認専用。
- conflicting sources: 同じ主題について相反する rule を DOCX と XLSX に置く。
- Bazaar fixture: 最後に承認した rule に違反する小さな revision を用意する。

fixture は workspace 外の一時 directory に置き、hash だけを evidence record へ転記します。

```powershell
$FixtureRoot = "C:\UAT\bob-rule-authoring-fixtures"
Get-ChildItem -LiteralPath $FixtureRoot -File |
  Get-FileHash -Algorithm SHA256 |
  Select-Object Path, Hash
```

共有する記録では `Path` を削除し、logical fixture name と hash だけにします。

## 3. Environment preflight

PowerShell で version と package gate を記録します。

```powershell
$ErrorActionPreference = "Stop"
node --version
npm --version
code --version
bzr --version
pdftotext.exe -v 2>&1

Set-Location <repository>\extensions\bob-bazaar-review
npm ci
npm test
npm run architecture:policy
npm run source:policy
npm run unused:policy
npm run artifact:policy
npm run dependency:policy
npm run audit:prod
npm run package
npm run package:policy
npm run package:metrics
```

Poppler が PATH にない場合は user setting `bobBazaar.ruleAuthoring.pdfToTextPath` に検証済み `pdftotext.exe` の絶対パスを設定し、その binary の `Poppler version` と SHA-256 をローカル evidence に記録します。absolute path 自体は共有記録へ残しません。

生成した VSIX を test profile に導入し、IBM Bob と workflow-register の version / commit を evidence record へ記入します。

## 4. UAT cases

### PRA-WIN-001 標準 DOCX / XLSX / text PDF

1. Command Palette で `bobBazaar.authorProjectRulesFromDocuments` を開く。
2. workspace 外の `.docx`、`.xlsx`、text PDF を個別選択する。
3. DOCX の heading/table、XLSX の sheet/row/cell range、PDF の page locator と preview を照合する。
4. duplicate SHA-256、source count、chunk count、selected evidence bytes を記録する。

期待結果: 原本を workspace へコピーせず、構造 locator と bounded preview が表示される。

### PRA-WIN-002 conversion / OCR / Poppler failure

1. `.doc` と `.xls` を選び、`requires_conversion` になることを確認する。
2. image-only PDF を選び、`requires_ocr` になることを確認する。
3. `pdftotext.exe` の設定を一時的に無効な test value にし、PDF だけが `blocked` になることを確認する。
4. 設定を戻し、DOCX / XLSX の結果を失わず再開する。

期待結果: conversion / OCR 対象本文を AI へ送らず、他の成功 source は利用者の明示確認後に継続できる。

### PRA-WIN-003 AI consent と Bob workflow

1. AI consent 画面で source logical names、selected chunk count、selected evidence bytes、model route を記録する。
2. 承認前に Bob へ本文が送られていないことを確認する。
3. 承認後、Bob UI から `bazaar-project-rule-authoring` workflow を開始する。
4. evidence selection と proposal capture が strict JSON を受理することを確認する。

期待結果: Palette command が Bob task を自動起動せず、Bob UI の明示操作で workflow が始まる。

### PRA-WIN-004 conflicting sources と Human Triage

1. conflicting sources を含む run を proposal まで進める。
2. conflict が関連 operation と source locator を示すことを確認する。
3. Human Triage で候補ごとに accept、reject、edit、retire を選び、rule decisions を記録する。
4. unresolved blocking conflict が apply を止めること、解決後の apply preview が判断を反映することを確認する。

期待結果: AI が conflict を独断で解消せず、人間の decision overlay が正本になる。

### PRA-WIN-005 VS Code restart と resume

1. extraction 完了後に VS Code を終了し、再起動して resume する。
2. agent failure 後に再起動し、保持済み deterministic artifact から agent step だけ再試行する。
3. proposal capture 後と Human Triage 途中でも VS Code restart / resume を確認する。

期待結果: source の再選択や完了済み phase の再実行を強制せず、authoritative artifact pointer から続行する。

### PRA-WIN-006 induced write failure と rollback

このケースは disposable workspace だけで実行します。開始前に5つの project-owned asset の SHA-256 を記録します。

```powershell
$Review = Join-Path $TestWorkspace ".bob\review"
$Assets = @(
  "checklist.json",
  "project-context.md",
  "review-prompt-addendum.md",
  "rule-sources.json",
  "rule-provenance.json"
)
$Before = $Assets | ForEach-Object {
  Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $Review $_)
}
```

1. apply preview を表示した後、後半 target の一つを test 用に read-only にして induced write failure を起こす。例: `attrib +R (Join-Path $Review "rule-provenance.json")`。
2. apply を実行し、transaction が `committed` にならず rollback または明示 recovery を要求することを確認する。
3. `attrib -R` で test 属性を戻す。
4. incomplete transaction があれば Human Triage recovery UI から rollback を完了する。
5. transaction ID と状態だけを記録し、journal / backup 本文は共有しない。
6. 全 asset を `Get-FileHash -Algorithm SHA256` で再計算し、`$Before` と一致する rollback confirmation を記録する。

期待結果: 途中まで replaced された target も変更前 hash へ戻り、rollback failure を成功として隠さない。

### PRA-WIN-007 selective apply と最終 hash

1. add / update / retire の一部だけを accept し、apply preview と実結果を比較する。
2. transaction ID と final asset SHA-256 を evidence record へ記入する。
3. `rule-sources.json` / `rule-provenance.json` に absolute path、document text、raw model output がないことを確認する。
4. `bobBazaar.verifyRuleAuthoringApply` が verified を返すことを確認する。

期待結果: 採用した operation だけが project-owned asset に反映され、source/provenance 参照が整合する。

### PRA-WIN-008 approved rule の Bazaar review 利用

1. 承認済み rule に違反する Bazaar revision を作成する。
2. Bob UI で `bazaar-project-rule-review` を開始するか、規約付き direct review を実行する。
3. approved rule が review packet / workflow state に入り、対応する `rule_id` の checklist result と finding が生成されることを確認する。
4. review-result JSON の SHA-256 と review ID を approved-rule review evidence として記録する。

期待結果: approved rule が実際の Bazaar revision review で評価され、optional context / addendum と bounded provenance metadata が参照される。

## 5. Privacy and commit hygiene

redacted UAT evidence だけを commit できます。次は never commit / コミットしない対象です。

- original documents
- extracted text
- absolute paths
- raw model output
- backups
- run-local state

加えて `.bob/review/rule-authoring/**` の run、generation、transaction journal、lock、source location mapping、raw proposal を添付しません。共有可能なのは version、portable run / transaction ID、count、decision 集計、fixture / VSIX / final asset / review result の SHA-256、sanitized warning code、合否だけです。

## 6. Completion decision

全 case の実測記録、rollback confirmation、approved-rule review evidence が揃い、Developer Tools Console に未処理例外がなく、package gate が成功した場合だけ Windows UAT を complete とします。未実施または private evidence しかない場合は **pending** のまま報告します。
