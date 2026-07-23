# Bob Review 実機テスト環境 文書入力 Fixture アップグレード設計

**Date:** 2026-07-20  
**Status:** Design approved; written specification awaiting review  
**Scope:** `bob-bazaar-review` と `bob-code-consistency-review` の既存実機テスト環境へ PDF・Word・Excel の synthetic input documents を追加する  
**Base branch:** `main` after PR #140

## 1. Goal

PR #140 で追加した `tools/real-machine-test-environment` を拡張し、既存の次の2シナリオへ再現可能な文書fixtureを追加する。

- `bazaar-core`
- `consistency-ai-matrix`

追加する文書形式は次のとおりとする。

- Word `.docx`
- Excel `.xlsx`
- テキスト抽出可能な PDF `.pdf`

本変更は、両拡張の実機テスト環境に文書入力データを用意し、既存機能の範囲で操作確認できるようにすることを目的とする。拡張本体の抽出機能、schema、command ID、workflow provider、VSIX version は変更しない。

## 2. Confirmed decisions

- 実装方針は「fixtureと実機操作手順を追加し、extension runtimeは変更しない」とする。
- 新しいscenario IDは追加しない。
- `bazaar-core`へDOCX・XLSX・PDFを組み込む。
- `consistency-ai-matrix`へDOCX・XLSX・PDFを組み込む。
- `bob-code-consistency-review`の`review-input.yaml`が参照するのはDOCXとXLSXだけとする。
- `bob-code-consistency-review`用PDFはworkspaceへ配置するだけで、`review-input.yaml`へ含めない。
- `bob-bazaar-review`ではDOCX・XLSX・PDFをproject rule authoringのfile pickerから選択する。
- 文書fixtureはbinaryを直接commitせず、Node.js標準機能だけを使って環境生成時に決定論的に作る。
- Microsoft OfficeやPopplerはfixture生成には必要としない。
- BazaarのPDF抽出確認には既存機能どおりPoppler `pdftotext`を利用する。
- Poppler不足は`bazaar-core`環境全体を`blocked`にしない。PDFを含む`PRA-WIN-001`のoperator結果だけを`blocked`として記録する。
- 環境生成処理は文書入力の実機テスト結果を自動で`pass`にしない。

## 3. Existing capability boundary

### 3.1 `bob-bazaar-review`

Project rule authoringは、次の入力を扱う既存機能を持つ。

- `.docx`: heading、paragraph、list、table
- `.xlsx`: sheet、row、保存済みcell value、cell range
- text PDF: page locator付きtext chunk

PDF抽出は外部`pdftotext`を使う。image-only PDF、`.doc`、`.xls`、OCR、Office変換は今回のfixture対象外とする。

### 3.2 `bob-code-consistency-review`

文書抽出は、次の入力を扱う既存機能を持つ。

- Markdown
- `.docx`
- `.xlsx`

PDF抽出は未対応である。したがって、PDFをworkspaceに配置しても`review-input.yaml`から参照しない。今回の変更でPDF対応を追加したり、未対応エラーを新しい正常系testcaseとして扱ったりしない。

## 4. Considered approaches

### A. Officeで作成したbinaryをcommitする

**Advantages**

- 実際のOffice保存ファイルに近い。

**Disadvantages**

- Git diffで内容を確認しにくい。
- 作成者、更新日時、端末情報などのmetadata混入を継続管理する必要がある。
- 意味のある変更とzip内部の揺れを分離しにくい。

### B. Base64 binaryをPowerShellへ埋め込む

**Advantages**

- 外部dependencyなしで再現できる。

**Disadvantages**

- 巨大なopaque stringになり、レビューと更新が難しい。
- fixtureの意図とbinary内容の対応が読み取りにくい。

### C. Node.jsで決定論的に生成する

**Advantages**

- source definitionを人が読める。
- timestamp、entry順、object番号を固定できる。
- SHA-256で再現性を検証できる。
- 既存のOOXML test fixture生成パターンと整合する。
- Microsoft Office、LibreOffice、PDF libraryをCIへ追加しない。

**Disadvantages**

- synthetic fixtureであり、Office製品が保存した全variationを再現するものではない。
- minimal OOXML/PDF writerのcontract testが必要になる。

**Decision:** Approach Cを採用する。

## 5. Repository layout

次を追加する。

```text
tools/
  real-machine-test-environment/
    document-fixtures/
      Generate-InputDocumentFixtures.js
      fixture-content.json
```

次を変更する。

```text
tools/real-machine-test-environment/scenarios.json
tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1
tools/real-machine-test-environment/lib/ScenarioManifest.ps1
tools/real-machine-test-environment/lib/ScenarioExecution.ps1
tools/real-machine-test-environment/checklists/bazaar-core.md
tools/real-machine-test-environment/checklists/consistency-ai-matrix.md
tools/real-machine-test-environment/README-ja.md

docs/workflows/bazaar-project-rule-review/integration/
  launch-bob-bazaar-review-sandbox.ps1

docs/workflows/code-consistency-review/integration/
  launch-bob-code-consistency-sandbox.ps1

scripts/
  real-machine-test-environment.test.js
  real-machine-input-document-fixtures.test.js

extensions/bob-code-consistency-review/test/
  realMachineDocumentFixtures.test.js

.github/workflows/extensions-quality.yml
```

生成された`.docx`、`.xlsx`、`.pdf`はrepositoryへcommitしない。

## 6. Scenario layout

### 6.1 `bazaar-core`

生成後のlayoutは次のとおりとする。

```text
bazaar-core/
  bob-managed/
  bazaar-source/
  input-documents/
    project-review-rules.docx
    review-traceability-ledger.xlsx
    system-review-guidelines.pdf
    document-fixture-manifest.json
    EXPECTED_DOCUMENT_INPUTS.md
  bob-bazaar-review.code-workspace
```

`input-documents`は`bob-managed`および`bazaar-source`の外に置く。Project rule authoringが原本を`.bob`へ自動コピーしないprivacy boundaryを、fixture配置でも明確にする。

### 6.2 `consistency-ai-matrix`

生成後のlayoutは次のとおりとする。

```text
consistency-ai-matrix/
  workspace/
    docs/
      input-documents/
        requirements-and-design.docx
        verification-matrix.xlsx
        supplemental-reference.pdf
        document-fixture-manifest.json
        EXPECTED_DOCUMENT_EXTRACTION.md
    review-input.yaml
```

PDFは`docs/input-documents`に存在するが、`review-input.yaml`では参照しない。

## 7. Generator contract

### 7.1 CLI

Generatorは次のCLIを提供する。

```text
node Generate-InputDocumentFixtures.js \
  --profile <bazaar-core|consistency-ai-matrix> \
  --output <new-directory> \
  [--review-input <existing-review-input.yaml>]
```

Write-free validationを提供する。

```text
node Generate-InputDocumentFixtures.js \
  --profile <bazaar-core|consistency-ai-matrix> \
  --validate-only
```

### 7.2 Profile allowlist

許可するprofileは次の2件だけとする。

```text
bazaar-core
consistency-ai-matrix
```

Profile、file name、destination layoutはcode内のallowlistで固定する。`fixture-content.json`から任意path、任意command、script bodyを指定できる形にしない。

### 7.3 Output safety

- `--output`は新規directoryでなければならない。
- 既存directoryを上書きしない。
- Generatorが書くfile nameはprofileごとの固定allowlistに限定する。
- absolute path、`..`、separatorを含むlogical file nameを拒否する。
- write前後に、対象がoutput root内にあることを確認する。
- symlinkまたはjunctionを経由したwriteを拒否する。
- failure時は不完全なfileを成功manifestへ記録しない。

### 7.4 Deterministic bytes

同じgenerator version、profile、`fixture-content.json`からは同じbytesを生成する。

固定する要素は次のとおりとする。

- OOXML ZIP entry順
- OOXML ZIP timestamp
- XML declaration、namespace、attribute順
- relationship ID
- workbook sheet順とsheet ID
- PDF object番号
- PDF page tree
- PDF font resource
- PDF metadataの不使用
- line ending
- UTF-8 encoding

生成時刻や絶対pathをbinaryへ埋め込まない。

## 8. Fixture content

### 8.1 `bazaar-core` profile

#### `project-review-rules.docx`

次を含む。

- Heading 1: project review rules
- Paragraphと箇条書き
- Heading 2ごとの規約
- 規約table
- `RULE-DOC-001`
- `RULE-DOC-002`
- `RULE-DOC-003`
- `RULE-DOC-004`

抽出確認対象はheading、paragraph、list、tableとする。

#### `review-traceability-ledger.xlsx`

次の2sheetを固定順で持つ。

```text
Rules
Verification
```

列は少なくとも次を持つ。

```text
Rule ID
Owner
Area
Verification method
Status
```

DOCXのrule IDと対応するrowを含める。

#### `system-review-guidelines.pdf`

- text extraction可能なPDF
- 組み込みHelveticaを使用
- ASCII中心の本文
- 3 page
- page 2は内部の空page
- `PDF-RULE-001`
- `PDF-RULE-002`
- `PDF-RULE-003`

日本語fontを同梱せず、font licenseと端末依存を持ち込まない。

#### `EXPECTED_DOCUMENT_INPUTS.md`

次を人が確認できる形で記載する。

- logical file name
- DOCX heading/tableの期待値
- XLSX sheet/rowの期待値
- PDF page locatorの期待値
- page 2が空pageとして保持されること
- 原本をコピーしてはならないpath
- Poppler不足時のoperator記録方法

### 8.2 `consistency-ai-matrix` profile

#### `requirements-and-design.docx`

次を含む。

- `REQ-DOC-001`
- `REQ-DOC-002`
- `BD-DOC-001`
- Heading、paragraph、table
- 要求と基本設計の対応表

#### `verification-matrix.xlsx`

次を含む。

- `Verification` sheet
- `TC-DOC-001`
- `TC-DOC-002`
- selector対象外の補助sheet

#### `supplemental-reference.pdf`

- text extraction可能なsynthetic PDF
- 配置確認用の識別文字列
- `review-input.yaml`からは参照しない
- `bob-code-consistency-review`のPDF対応を主張しない

#### `EXPECTED_DOCUMENT_EXTRACTION.md`

次を記載する。

- review inputで参照するDOCX/XLSX path
- PDFが参照対象外であること
- 期待selector
- `REQ-DOC-001`
- `REQ-DOC-002`
- `BD-DOC-001`
- `TC-DOC-001`
- `TC-DOC-002`
- `document-index.json`、`document-excerpts.md`、`tables/*.md`で確認する内容

## 9. Fixture manifest

各profileは`document-fixture-manifest.json`を生成する。

```json
{
  "schemaVersion": 1,
  "generator": {
    "id": "bob-review-input-document-fixtures",
    "version": 1,
    "profile": "bazaar-core"
  },
  "files": [
    {
      "logicalName": "project-review-rules.docx",
      "mediaType": "docx",
      "sha256": "<lowercase hex>",
      "byteSize": 0,
      "referencedByReviewInput": false,
      "expectedSelectors": ["RULE-DOC-001"],
      "expectedLocators": []
    }
  ]
}
```

Manifestは次を含めない。

- absolute path
- username
- hostname
- environment variable
- credential
- document本文全文
- generated timestamp

`sha256`と`byteSize`は生成した実fileから計算し、manifest write前に照合する。

## 10. Launcher integration

### 10.1 Common switch

両launcherへ次を追加する。

```powershell
[switch]$IncludeDocumentFixtures
```

Defaultは`false`とし、既存の直接利用を変更しない。

### 10.2 Bazaar launcher

処理順は次のとおりとする。

```text
Bob root作成
→ Bazaar repository作成
→ workspace file作成
→ IncludeDocumentFixtures時だけdocument fixture生成
→ sandbox README作成
→ VSIX install
→ 任意起動
```

生成先は固定する。

```text
<SandboxRoot>\input-documents
```

Bazaar launcherはすでに解決しているNode executableをgenerator起動に使う。

### 10.3 Code consistency launcher

`IncludeDocumentFixtures`は`Sample = ai-verification-matrix`の場合だけ許可する。他のsampleとの組み合わせは入力エラーにする。

処理順は次のとおりとする。

```text
workspace-commonコピー
→ baseline fixtureコピー
→ document fixture生成
→ review-input.yamlへDOCX/XLSX参照を挿入
→ git init
→ baseline commit
→ feature branch作成
→ head fixtureコピー
→ head commit
```

これにより、文書fileはbaseline inputとしてcommitされ、feature branchのコード変更差分へ混入しない。生成直後のGit working treeはcleanでなければならない。

Code consistency launcherは`node`を内部でresolveし、generatorをshellなしのargument arrayで起動する。

## 11. `review-input.yaml` patch contract

Generatorは`consistency-ai-matrix` profileで`--review-input`を受けた場合だけ、既存`review-input.yaml`へ次のentryを追加する。

```yaml
artifacts:
  requirements:
    - path: docs/input-documents/requirements-and-design.docx
      version: "1.0"
      sections:
        - REQ-DOC-001
        - REQ-DOC-002
        - BD-DOC-001

  test_spec:
    - path: docs/input-documents/verification-matrix.xlsx
      version: "1.0"
      sheets:
        - Verification
      rows:
        - TC-DOC-001
        - TC-DOC-002
```

既存Markdown artifactは削除しない。

Patchは次の条件を満たす。

- `artifacts.requirements`と`artifacts.test_spec`の既知anchorを使う。
- anchorが0件または複数件なら失敗する。
- 同じpathが既に存在する場合は失敗する。
- `supplemental-reference.pdf`を追加しない。
- `review`、`base`、`head`、`review_focus`、既存artifactを変更しない。
- 期待したfixture版以外のYAMLを推測して書き換えない。
- failure時に部分的なYAMLを残さない。temporary fileへ生成し、検証後にreplaceする。

## 12. Manifest integration

`scenarios.json`のscenario数、group、execution orderは変更しない。

### 12.1 `bazaar-core`

次を追加する。

```json
"documentFixtureProfile": "bazaar-core"
```

`testCases`へ追加する。

```text
PRA-WIN-001
```

`expectedArtifacts`へ追加する。

```text
input-documents/project-review-rules.docx
input-documents/review-traceability-ledger.xlsx
input-documents/system-review-guidelines.pdf
input-documents/document-fixture-manifest.json
input-documents/EXPECTED_DOCUMENT_INPUTS.md
```

### 12.2 `consistency-ai-matrix`

次を追加する。

```json
"documentFixtureProfile": "consistency-ai-matrix"
```

`testCases`へ追加する。

```text
CCR-RT-019
CCR-RT-020
```

`expectedArtifacts`へ追加する。

```text
workspace/docs/input-documents/requirements-and-design.docx
workspace/docs/input-documents/verification-matrix.xlsx
workspace/docs/input-documents/supplemental-reference.pdf
workspace/docs/input-documents/document-fixture-manifest.json
workspace/docs/input-documents/EXPECTED_DOCUMENT_EXTRACTION.md
```

### 12.3 Validation rules

`documentFixtureProfile`は次の組み合わせだけを許可する。

```text
bazaar-core scenario -> bazaar-core profile
consistency-ai-matrix scenario -> consistency-ai-matrix profile
```

他のscenario、重複profile、未知profileを拒否する。

`PRA-WIN-*`は次の仕様書からtestcase存在確認を行う。

```text
extensions/bob-bazaar-review/docs/project-rule-authoring-windows-uat.md
```

`BZR-*`と`CCR-*`の既存lookupを変更しない。

## 13. Common runner integration

Common runnerは、`documentFixtureProfile`を持つscenarioでだけ、launcher invocationへ次を注入する。

```powershell
IncludeDocumentFixtures = $true
```

このswitchを`scenario.generator.arguments`から指定させない。`RepoRoot`、`SandboxRoot`、`NoLaunch`と同様、runner-controlled argumentとする。

`-ValidateOnly`ではlauncherを呼ばず、binaryも生成しない。選択scenarioのprofileに対してgeneratorのwrite-free validationを実行する。

```text
node Generate-InputDocumentFixtures.js --profile <profile> --validate-only
```

Generator validation失敗はmanifest validation failureとして扱う。

## 14. Poppler and operator status

`pdftotext`を`bazaar-core.requiredCommands`へ追加しない。

理由は次のとおりである。

- Bazaar revision reviewはPopplerなしで実行できる。
- DOCX/XLSX previewはPopplerなしで実行できる。
- PDF file自体はPopplerなしで生成できる。

`bazaar-core`のchecklistは次の分岐を明記する。

### `pdftotext` available

- DOCX、XLSX、PDFを選択する。
- `PRA-WIN-001`の全項目を実施する。
- 結果に応じて`pass`または`fail`を記録する。

### `pdftotext` unavailable

- DOCXとXLSXのpreviewを確認する。
- PDF fixtureが存在し、manifest hashが一致することを確認する。
- `PRA-WIN-001`を`blocked`とする。
- notesへ`Poppler unavailable`を記録する。
- `bazaar-core`環境生成statusは`ready`のままとする。

## 15. Checklist updates

### 15.1 `bazaar-core`

既存操作に次を追加する。

1. `input-documents`の3 binaryとmanifestのSHA-256を確認する。
2. `bobBazaar.authorProjectRulesFromDocuments`を開く。
3. DOCXのheading、paragraph、list、tableを確認する。
4. XLSXの`Rules`、`Verification` sheetとrule rowを確認する。
5. PopplerがあればPDF page 1、empty page 2、page 3を確認する。
6. 原本が`bob-managed`、`bazaar-source`、`.bob/review/rule-authoring`へ事前コピーされていないことを確認する。
7. `PRA-WIN-001`のstatusとevidence pathを記録する。

### 15.2 `consistency-ai-matrix`

既存操作に次を追加する。

1. `review-input.yaml`がDOCXとXLSXだけを参照していることを確認する。
2. `supplemental-reference.pdf`が存在することを確認する。
3. PDF pathが`review-input.yaml`、`document-index.json`、`document-excerpts.md`にないことを確認する。
4. Preprocessを実行する。
5. `document-index.json`にDOCXとXLSXが存在することを確認する。
6. `document-excerpts.md`に`REQ-DOC-001`、`REQ-DOC-002`、`BD-DOC-001`、`TC-DOC-001`、`TC-DOC-002`が存在することを確認する。
7. XLSX由来の`tables/*.md`を確認する。
8. `CCR-RT-019`と`CCR-RT-020`を記録する。

## 16. Failure handling

### Generator failure

- 対象scenarioを`failed`にする。
- 他の独立scenario生成は続行する。
- Generator stdout/stderrをscenario logへ保存する。
- binary本文をrun manifestやsummaryへ転記しない。

### Review input patch failure

- `consistency-ai-matrix`を`failed`にする。
- Git repository初期化を開始しない。
- 元の`review-input.yaml`を保持する。
- 部分更新fileを削除する。

### Hash mismatch

- Fixture manifest生成を失敗させる。
- Scenarioを`ready`にしない。

### Poppler failure

- Environment generation failureにはしない。
- `PRA-WIN-001` operator statusで扱う。
- `pdftotext`のabsolute pathやraw document textを共有evidenceへ記録しない。

## 17. Automated tests

### 17.1 Generator contract test

`scripts/real-machine-input-document-fixtures.test.js`はNode.js標準機能だけを使い、次を確認する。

1. 2profileの`--validate-only`がwrite-freeで成功する。
2. 同じprofileを2つのtemporary directoryへ生成し、全binaryのSHA-256が一致する。
3. DOCX/XLSX ZIP entry名、entry順、timestampが固定される。
4. DOCXに期待IDと構造partが存在する。
5. XLSXに期待sheetとIDが存在する。
6. PDFが`%PDF-`で始まり、固定page treeと識別文字列を持つ。
7. PDFのpage 2がempty content streamとして表現される。
8. ManifestのSHA-256、byteSize、mediaTypeが実fileと一致する。
9. `consistency-ai-matrix` manifestでPDFの`referencedByReviewInput`が`false`である。
10. 既存output directoryを拒否する。
11. Unknown profileとunsafe outputを拒否する。
12. `tools/real-machine-test-environment/document-fixtures`配下にfixture binaryがcommitされていない。

### 17.2 Repository integration contract

`scripts/real-machine-test-environment.test.js`へ次を追加する。

- scenario数が6のままである。
- `documentFixtureProfile`が2scenarioだけに存在する。
- profileとscenario IDの組み合わせが固定される。
- `PRA-WIN-001`、`CCR-RT-019`、`CCR-RT-020`が正しいspecに存在する。
- 10件の新しいexpected artifactが宣言される。
- Common runnerが`IncludeDocumentFixtures = $true`を注入する。
- Manifestから同switchを上書きできない。
- `-ValidateOnly`がgeneratorの`--validate-only`だけを呼ぶ。
- Launcherのswitch defaultがfalseである。
- Code consistency launcherが`IncludeDocumentFixtures`を他sampleで拒否する。
- Review input patch contractにPDF pathが含まれない。

### 17.3 Code consistency extractor integration

`extensions/bob-code-consistency-review/test/realMachineDocumentFixtures.test.js`はtemporary workspaceを作り、generatorが作成したDOCX/XLSXを現在のextractorへ渡す。

確認対象は次のとおりとする。

```text
REQ-DOC-001
REQ-DOC-002
BD-DOC-001
TC-DOC-001
TC-DOC-002
```

さらに次を確認する。

- evidence IDが一意
- DOCX tableがexcerptへ含まれる
- XLSX rowがtable evidenceになる
- supplemental PDFが抽出結果へ含まれない

このtestはPDF抽出成功を確認しない。

### 17.4 Existing launcher regression

既存の次のtestを維持する。

```text
extensions/bob-bazaar-review/test/integrationSandboxScript.test.js
extensions/bob-code-consistency-review/test/integrationSandboxScript.test.js
```

Switchなしの既存launcher利用が同じlayoutと起動contractを維持することを確認する。

## 18. CI

`extensions-quality.yml`の既存path filterは、tool directory、両launcher directory、code consistency example、両実機test specを監視している。この範囲を維持する。

`real-machine-environment-contracts` jobで次を実行する。

```text
node --test scripts/real-machine-test-environment.test.js scripts/real-machine-input-document-fixtures.test.js
pwsh -NoProfile -File tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 -ValidateOnly
```

既存extension jobで`realMachineDocumentFixtures.test.js`を含むunit suiteを実行する。

CIでは次を行わない。

- Microsoft Office install
- LibreOffice install
- Poppler install
- GUI起動
- IBM Bobへのprompt送信
- PDF semantic extraction test
- 6scenarioのfull environment generation

## 19. Security and privacy

Fixtureに次を含めない。

- 実在の個人名
- 顧客名
- 社内project名
- credential
- URL token
- absolute path
- hostname
- author metadata
- macro
- external relationship
- embedded executable object
- remote image

Document textはsynthetic test dataとし、外部systemからコピーしない。

Bazaar authoringのrun-local artifactやraw extracted textをrepositoryへcommitしない。共有可能なevidenceはfixture logical name、SHA-256、count、portable testcase ID、statusに限定する。

## 20. Non-goals

- `bob-code-consistency-review`へのPDF extractor追加
- `.doc`または`.xls`の変換
- image-only PDF
- OCR
- macro execution
- Excel formula recalculation
- external link refresh
- embedded object execution
- Microsoft Office生成fileとの完全互換性認定
- LibreOffice生成fileとの完全互換性認定
- document semanticsのAI自動採点
- 新しいscenarioの追加
- 他の4scenarioへの文書fixture展開
- runtime dependency、command ID、workflow provider ID、VSIX versionの変更

## 21. Acceptance criteria

- `scenarios.json`は既存6scenarioを同じ順序で維持する。
- `bazaar-core`がDOCX、XLSX、text PDF、manifest、expected documentを生成する。
- `consistency-ai-matrix`がDOCX、XLSX、PDF、manifest、expected documentを生成する。
- Code consistencyの`review-input.yaml`はDOCXとXLSXだけを参照する。
- Code consistencyのPDFはworkspaceに存在するが、抽出対象に含まれない。
- Bazaar原本はBob rootとBazaar repositoryの外に置かれる。
- `PRA-WIN-001`、`CCR-RT-019`、`CCR-RT-020`がoperator resultへ追加される。
- Poppler不足でも`bazaar-core`環境生成は`ready`になり得る。
- Poppler不足時の`PRA-WIN-001`は`blocked`として記録される。
- Generatorは同一inputから同一bytesを生成する。
- Fixture manifestのSHA-256とbyteSizeが実fileに一致する。
- 既存output directoryを上書きしない。
- `-ValidateOnly`はbinary、output root、temporary review inputを作成しない。
- Switchなしの既存launcher動作に回帰がない。
- Code consistency extractor integration testで5つのdocument ID markerが確認できる。
- Repository-level Node contractsとWindows PowerShell validationがCIで成功する。
- Generatorはoperator resultを自動で`pass`にしない。

## 22. Manual UAT boundary

Synthetic fixture generationとextractor contractが成功しても、Microsoft Officeで保存した実文書との完全互換性は証明しない。

Windows実機では次を別途実施する。

- `bazaar-core`でDOCX、XLSX、PDFをfile pickerから選択
- PopplerによるPDF page locator確認
- 原本非コピーの確認
- `consistency-ai-matrix`でDOCX/XLSX preprocess
- `document-index.json`、`document-excerpts.md`、`tables/*.md`の確認
- PDFが抽出対象外であることの確認
- Developer Tools Consoleの未処理例外確認

全operator testcaseは実施前に`not_run`であり、実測結果だけを`pass`、`fail`、`blocked`へ変更する。
