Title: このチャットを見てみる

URL Source: https://chatgpt.com/share/6a53743e-7444-83e8-b0f8-b21f9a9864d5

Markdown Content:
結論から言うと、`bob-document-evidence` と `bob-artifact-ledger` は競合案ではなく、処理の前後を担当する補完関係です。

ただし、今回挙げられた「大規模コードから変更箇所と影響範囲を絞り、プロジェクト規約も含めてトークン効率よく整合判断する」という課題は、どちら単独でも解決できません。ここには第三の中核機能として、仮称 **`bob-evidence-scope`** が必要です。

## GitHub上の現状評価

現行 `bob-code-consistency-review` は、既にVCS差分、変更ファイル、変更関数、文書抜粋、evidence indexをまとめた `review-package` を生成しています。[README](https://chatgpt.com/share/6a53743e-7444-83e8-b0f8-b21f9a9864d5)

一方、現在の実装には次の限界があります。

*   C/C++解析は、変更されたファイル内でdiff行を関数へ割り当てています。

*   caller検出は、解析対象ファイル内の直接callerが中心です。

*   リポジトリ全体の永続的なsymbol/reference indexはありません。

*   C/C++以外は、現時点では深い意味解析より汎用diff evidenceが中心です。

*   `max_call_depth` などの設定は定義されていますが、現在のC/C++ analyzerでリポジトリ横断展開を制御している状態ではありません。

*   `bob-input.md` は最大2MB、raw diffは最大1MBで切り詰めますが、「重要度順に選ぶ」というより最終的なサイズ制限です。

根拠は [`cCppChangeAnalyzer.ts`](https://chatgpt.com/share/6a53743e-7444-83e8-b0f8-b21f9a9864d5)、[`codeChangeAnalyzer.ts`](https://chatgpt.com/share/6a53743e-7444-83e8-b0f8-b21f9a9864d5)、[`reviewPackageBuilder.ts`](https://chatgpt.com/share/6a53743e-7444-83e8-b0f8-b21f9a9864d5) です。

## 1. `bob-document-evidence`

### 目的

Word、Excel、Markdown、HTML、Shift-JISテキストなどを、AIが直接読む巨大文書ではなく、安定した参照位置を持つ小さな `evidence unit` へ変換します。

現在の文書抽出は、`review-input.yaml` に列挙された文書をレビュー実行ごとに読み、Markdown見出し、Word見出し・段落・表、Excelのシート・行を抜粋します。[documentExtractor.ts](https://chatgpt.com/share/6a53743e-7444-83e8-b0f8-b21f9a9864d5)

新拡張では、これをレビュー専用処理から全工程共通の文書evidence基盤へ発展させます。

### 主な機能

*   文書ルートと文書種別のproject profile登録

*   Word、Excel、Markdown、HTML、テキストの正規化

*   見出し、表、シート、行、ケースID単位の分割

*   安定したlocatorの付与

*   文書全体hashとevidence unit単位hash

*   extractor versionを含む増分キャッシュ

*   更新、削除、移動、内容変更の検出

*   チケットID、要求ID、変更symbol、キーワードによる候補絞り込み

*   トークン予算内のevidence bundle生成

*   文書取得不能、locator消失、版数不一致の診断

### 成果物イメージ

`evidence unit` は次のような情報を持ちます。

JSON

現在の `REQ-0001` のような処理順依存IDだけでなく、文書・locator・内容hashから再現可能なIDを持たせることが重要です。

### 既存全文検索との関係

既に導入されている全文検索を置き換えるべきではありません。

全文検索は「候補文書を見つける」、`bob-document-evidence` は「候補文書をAIに安全かつ再現可能な単位で渡す」という役割分担にします。

約3,000文書を毎回クロールせず、全文検索結果、明示されたパス、更新された文書だけを処理します。

### ADファイルサーバ対応

文書がワークスペース外のAD認証ファイルサーバにある場合、現在のworkspace内限定path契約だけでは不足します。

以下の安全策が必要です。

*   UNCルートの明示allowlist

*   VS Code Trusted Workspace必須

*   Windowsの既存AD認証を使用し、資格情報は保存しない

*   read-onlyアクセス

*   raw文書を無条件にキャッシュへ複製しない

*   キャッシュには原則としてhash、locator、必要な抜粋だけを保存

*   機密区分に応じたevidence bundle出力制御

### Workflow action provider案

### 強みと限界

強みは、文書読込の重複を減らし、調査・設計・レビュー・テストで共通利用できることです。`mammoth` やExcelライブラリなどの重い依存を `workflow-register` から分離できる点も、新規VSIX化の根拠になります。

ただし、これだけではコードの変更範囲や影響関数を特定できません。また、規約文書を抽出できても、その規約が今回の変更に適用されるかは別の判定が必要です。

## 2. `bob-artifact-ledger`

### 目的

各workflowや拡張機能が作った成果物について、「何を入力に、どの版の処理で、誰が確認して作ったか」を横断管理します。

これはevidenceを発見する機能ではなく、作られた成果物の由来・鮮度・再利用可否を管理する台帳です。

### 現行機能との差

`workflow-register` には既にrun単位のartifact manifestがあります。

*   workflow ID

*   definition hash

*   inputs hash

*   artifact path

*   checksum

*   bytes

*   producer step

*   task snapshotからの取込

*   前回成果物からのstate復元

[`artifactManifest.ts`](https://chatgpt.com/share/6a53743e-7444-83e8-b0f8-b21f9a9864d5) / [`stateHydration.ts`](https://chatgpt.com/share/6a53743e-7444-83e8-b0f8-b21f9a9864d5)

`bob-artifact-ledger` が追加するのは、runをまたいだ横断管理です。

### 対象にする成果物

*   `.bob/workflows/runs/**/artifacts/manifest.json`

*   `.bob-review/review-package/manifest.yaml`

*   `.bob/review/results/*.artifact-metadata.json`

*   `.bob-trace/traceability-catalog.json`

*   `.bob-process-runs/**`

*   `.bob-process-records/**`

*   `bob-document-evidence` のbundle

*   将来のunitTestRunner evidence

### 主な機能

*   各形式のmanifestを共通artifact recordへ正規化

*   成果物間の依存関係を記録

*   source revision、rule pack、document bundle、workflow definitionの版を追跡

*   checksum検証

*   入力変更によるstale伝播

*   同じ入力・同じ処理版の既存成果物検索

*   次工程へ渡すhandoff package作成

*   承認済み、差戻し、TBD、未確認の状態表示

*   欠損manifest、壊れた参照、孤立artifactの診断

### 共通artifact record

JSON

### 鮮度判定

mtimeだけではなく、次のいずれかが変わった場合にstaleとします。

*   base/headのresolved commit SHA

*   変更scope hash

*   文書evidence bundle hash

*   project rule pack hash

*   workflow definition hash

*   tool/extractor/analyzer version

 -主要input hash

人間がstaleを承知で再利用する場合は、理由、承認者、期限を記録します。

### Workflow action provider案

### 強みと限界

強みは、同じ証跡の再生成を避けられること、工程間handoffを再現可能にできること、規約や文書が更新されたときに過去レビューをstaleと判断できることです。

ただし、初回実行時に「どのコードや文書が重要か」は判断できません。間違った範囲で作った成果物を、正確に記録してしまうだけになる危険があります。

そのため、新規VSIXとしては `bob-document-evidence` より後の優先度です。まず共通schemaとread-only scannerとして開始し、正本を二重化しないことが重要です。

## 3. 大規模コードを扱うための `bob-evidence-scope`

今回の課題に最も直接効くのは、この第三の機能です。

### Change Scope Engine

VCS差分をsource of truthとして、次の順に対象を絞ります。

1.   base/headをimmutableなcommit SHAへ解決

2.   changed filesとdiff hunkを取得

3.   hunkを関数、method、class、SQL objectなどへ割り当て

4.   変更symbolのsignature、visibility、interface属性を判定

5.   repository indexから依存関係を展開

6.   riskと規約に応じて必要範囲だけ採用

7.   token budget内のcode sliceを生成

永続indexには次のedgeを保持します。

関数ポインタ、reflection、動的SQLなど解決できないものは削除せず、`unknown-impact` として人間確認へ残します。

### コンテキストの優先順位

| 優先度 | 内容 | 扱い |
| --- | --- | --- |
| 必須 | 変更行、包含symbol、公開interface変更、適用規約 | 必ず渡す |
| 高 | 直接caller/callee、read/writeされるglobal・型、対応要求・設計 | 原則渡す |
| 中 | 2-hop依存、関連テスト、関連台帳 | riskに応じて渡す |
| 低 | 変更と関係が確認できないコード、全文raw diff | 通常は渡さない |

単純なbyte切詰めではなく、採用・除外理由とtoken見積りを `context-budget-report.json` に保存します。

### Project Rule Pack Engine

現状、プロジェクト規約は `bob-bazaar-review` の `.bob/review/checklist.json` に存在しますが、Bazaarレビュー中心で、コード整合pipelineへ共通適用されていません。[bob-bazaar-review README](https://chatgpt.com/share/6a53743e-7444-83e8-b0f8-b21f9a9864d5)

規約は次の階層で統合するのがよいです。

自由記述の `applies_when` だけでなく、機械判定可能な構造にします。

YAML

処理順は次の通りです。

1.   Change Scope Engineが変更scopeとrisk tagを生成

2.   Rule Pack Engineが適用規約だけを決定

3.   機械検査可能な規約をローカルで実行

4.   意味判断が必要な規約だけをAIへ渡す

5.   AI出力をevidence参照付きで検証

6.   人間が最終triageする

7.   適用したrule pack hashをledgerへ記録

## 推奨アーキテクチャ

Mermaid

## 4案の比較

| 候補 | 主な問い | トークン効率 | プロジェクト規約 | 工程横断追跡 | 優先度 |
| --- | --- | --- | --- | --- | --- |
| `bob-evidence-scope` | 今回、何を見るべきか | 非常に高い | 適用規約を選定 | 入力manifestまで | 1 |
| `bob-document-evidence` | 文書のどこを読むべきか | 高い | 規約文書を供給 | bundle単位 | 2 |
| `bob-artifact-ledger` | 何を根拠に何を作ったか | 再利用時に有効 | rule pack版を記録 | 非常に高い | 3 |
| `bob-process-assurance` | 工程を完了扱いにできるか | 間接的 | gateとして確認 | campaign/工程単位 | 4 |

## 推奨方針

現在の課題を優先するなら、`bob-process-assurance` より先に、次を進めるのが妥当です。

1.   `bob-code-consistency-review` の前処理を切り出し、`bob-evidence-scope` を新規domain extensionとして設計する。

2.   その中にChange Scope Engine、Project Rule Pack Engine、Document Evidence adapterを置く。

3.   文書処理が複数workflowから独立利用される段階で、`bob-document-evidence` を別VSIXへ分離する。

4.   `bob-artifact-ledger` は最初は共通schema＋read-only索引として実装する。

5.   3つ以上のproducerから横断検索・再利用する実需要が確認できた段階で、ledgerを独立VSIX化する。

6.   `bob-process-assurance` は、これらの成果物を工程gateへ接続する上位層とする。

つまり、新規拡張の第一候補は、単純な文書抽出拡張ではなく、**`bob-evidence-scope`＝「今回見るべきコード・文書・規約を決定論的に選ぶ拡張」**へ修正するのが最も整合します。
