# bob2 拡張機能ソースコード調査ドキュメント

**対象:** `bob2` フォルダ配下の VS Code 拡張機能一式  
**指定コミット:** `14afe83c2218d881a9cd7b17b68b837c53507114` (`v2.0.0`)  
**リポジトリ:** `katamor1/bob_builtin_analyze`  
**作成日:** 2026-07-04  
**調査入力:** GitHub 上の指定コミット確認、および同一内容として提供された `bob2.zip` の展開内容

## 1. エグゼクティブサマリー

`bob2` は、単一の拡張機能ではなく、IBM Bob 本体、Bob に追加能力を登録するプレミアムパッケージ、IBM i / IBM Z の基盤拡張、チュートリアル用拡張で構成される VS Code 拡張群である。中心にあるのは `bob-code` で、チャット、タスク履歴、設定、レビュー、インライン編集、SCM 連携、Webview UI、認証、外部パッケージ向けの Bob API を提供する。Java / IBM i / IBM Z のプレミアムパッケージは、通常の VS Code コマンドを大量に追加するのではなく、Bob API 経由で `source`、`mode`、`tool`、`workflow`、`skill` を登録して Bob の会話・ワークフロー内で機能する作りになっている。

主な構成は次のとおり。

| フォルダ | 拡張機能 | 役割 |
|---|---|---|
| `bob-code` | IBM Bob 2.0.1 | Bob 本体。チャット、タスク、Webview、認証、レビュー、SCM、外部パッケージ向け API を提供。 |
| `bob-code_2.0.0` | IBM Bob 2.0.0 | 同じ Bob 本体の 2.0.0 版。source map が同梱され、内部モジュール名の追跡に有用。 |
| `bob-walkthroughs` | Bob Walkthroughs 0.0.1 | Bob Labs / Walkthrough を VS Code の Getting Started と連携して起動する学習用拡張。 |
| `ibm.bob-java-1.0.0-universal` | IBM Bob Premium Package for Java Modernization 1.0.0 | Java アップグレード、Liberty 移行、JUnit 生成、UI モダナイズ、脆弱性検出を Bob に追加。 |
| `ibm.bob-z-extension-3.0.0-universal` | IBM Bob Premium Package for Z 3.0.0 | COBOL / PL/I / JCL / HLASM / REXX などの説明、影響分析、データ辞書、変換、Z Understand 連携を Bob に追加。 |
| `ibm.vscode-clle-1.2.6-universal` | CL 1.2.6 | IBM i の CL / CLLE / CMD / BND 向け言語支援、文法チェック、CL コマンド文書表示。 |
| `ibm.vscode-ibmi-bob-1.0.0-universal` | IBM Bob Premium Package for i 1.0.0 | IBM i 専用の Bob モード、QSYS/IFS/CL/SQL/PASE 操作ツール、RPG モダナイズ、RPGUnit、SQL index advisor を追加。 |
| `ibm.vscode-ibmi-testing-1.3.4-universal` | IBM i Testing 1.3.4 | RPGUnit を使った IBM i のテスト実行、テストスタブ生成、カバレッジ表示。 |
| `ibm.zopeneditor-6.6.0-universal` | IBM Z Open Editor 6.6.0 | IBM Z 言語の LSP、構文強調、Zowe 連携、User Build、ZCodeScan、グラフ/表 Webview、MCP 連携基盤。 |

重要な読み解きポイントは次の 3 点である。

1. **Bob 本体とプレミアムパッケージは疎結合**である。Java / i / Z 側は Bob API の `registerSource` を起点に、モード、ツール、ワークフロー、スキルを追加登録する。これにより Bob 本体を IDE/AI ランタイムとして使い、各領域固有の機能をプラグイン化している。
2. **実処理の多くは VS Code 外部の開発環境に委譲される。** Java は Maven / Gradle / OpenRewrite / JaCoCo / OSV API、IBM i は Code for IBM i 経由の QSYS / IFS / CL / SQL / PASE / RPGUnit、IBM Z は Z Open Editor / Zowe / Z Understand / Java Language Server などを利用する。
3. **同梱コードは多くがバンドル済み JavaScript である。** 一部は source map で TypeScript の元ファイル名を追えるが、多くは `sourcesContent` がないため、完全な元ソースの復元ではなく、manifest、README、NLS、設定スキーマ、バンドル文字列・クラス・登録処理からの実装分析になる。

## 2. 調査方法と前提

### 2.1 確認した主なファイル

各拡張機能で主に以下を確認した。

- `package.json`: VS Code への寄与点、コマンド、ビュー、設定、依存拡張、起動条件。
- `package.nls*.json`: 表示名、コマンド名、設定説明の解決。
- `README.md` / `readme.md`: 機能説明、利用シナリオ、前提条件。
- `dist/extension.js` または `out/extension.js`: 実装バンドル。`registerCommand`、`registerTool`、`registerWorkflow`、`registerMode`、`createTestController` 等の登録箇所を確認。
- `dist/extension.js.map`: ある場合は元 TypeScript モジュール名を確認。ただし `sourcesContent` がないものは元コード本文までは含まれない。
- `schemas/*.json`: 設定ファイルやテスト定義のスキーマ。
- `dist/*.html`, `webview`, `language-server`, `resources`: Webview UI、言語サーバー、リモート処理に必要な同梱資産。

### 2.2 分析上の注意

バンドル済み JavaScript は minify / bundle されているため、関数名やクラス名が短縮されている箇所がある。そのため本資料では、次のように確度を分けて記述している。

- `package.json` / README / NLS / スキーマで確認できるもの: 直接確認できた仕様として記載。
- `registerTool` / `getId()` / `registerWorkflow` / `getLabel()` などの文字列で確認できるもの: 実装上の登録名として記載。
- minify された処理の詳細: 文字列、周辺処理、依存 API からの実装推定として記載。

## 3. 全体アーキテクチャ

`bob2` の構造は、以下のレイヤーで理解すると分かりやすい。

### 3.1 Bob IDE / AI ランタイムレイヤー

`bob-code` が該当する。VS Code の Webview、Sidebar、Panel、SCM メニュー、認証、タスク履歴、設定画面、レビュー画面、チャット画面を持つ。外部拡張向けには Bob API を exports しており、後述の Premium Package が `registerSource` で接続する。

### 3.2 Bob Premium Package レイヤー

`ibm.bob-java-*`、`ibm.vscode-ibmi-bob-*`、`ibm.bob-z-extension-*` が該当する。これらは VS Code のコマンドを少しだけ持つか、まったく持たず、主に Bob API で以下を登録する。

- **Source:** Bob 側の機能提供元。権限、利用可否、Entitlement の単位になる。
- **Mode:** Bob の振る舞いを変える専門家モード。例: Java Modernization、IBM i Developer、Z Code。
- **Tool:** Bob が呼び出せる具体的操作。例: `execute_sql_statement`、`run_recipe`、`scan_program`。
- **Workflow:** 複数ステップのガイド付き処理。例: Java Upgrade、RPG Modernization、Transform COBOL or PL/I to Java。
- **Skill / Slash command:** 特定領域のプロンプト・知識・手順を Bob に与える仕組み。

### 3.3 ドメイン基盤レイヤー

IBM i / IBM Z の実作業を支える拡張が該当する。

- `ibm.vscode-clle-*`: CL 言語支援と IBM i 上での CL 文法チェック。
- `ibm.vscode-ibmi-testing-*`: RPGUnit テスト実行、スタブ生成、カバレッジ。
- `ibm.zopeneditor-*`: COBOL / PL/I / HLASM / REXX / JCL Language Server、Zowe、User Build、ZCodeScan、グラフ系 UI。

Premium Package はこれらの基盤拡張を前提にし、Bob から操作できるツールとして包む。

### 3.4 学習 / Labs レイヤー

`bob-walkthroughs` が該当する。VS Code の walkthrough 機能と Bob のチャット/ビュー操作をつなぎ、Lab 用 workspace を初期化してチュートリアルを起動する。

---

## 4. `bob-code` / `bob-code_2.0.0` - IBM Bob 本体

### 4.1 概要

`bob-code` は IBM Bob の中核拡張である。VS Code の Secondary Sidebar に Bob Chat を表示し、Panel に Findings、SCM に Review View を追加する。ユーザーはチャット、タスク履歴、設定、コンテキスト追加、コード説明、コード改善、コミットメッセージ生成、PR 作成、レビュー、レポート送信などを Bob から実行できる。

`bob2` には `bob-code` 2.0.1 と `bob-code_2.0.0` 2.0.0 が同梱されている。manifest 上は同じ拡張 ID / name (`bob-code`) で、実質的には同一拡張の異なるバージョンである。2.0.0 版には `dist/extension.js.map` があり、内部モジュール名を追う上で特に有用である。

### 4.2 VS Code への寄与点

主な寄与点は次のとおり。

- `authentication`: `bobLogin` という認証プロバイダを追加。
- `viewsContainers.secondarySidebar`: `bob-chat` コンテナを追加。
- `viewsContainers.panel`: `bob-findings-panel` を追加。
- `views`: `bobChatView`、`bobFindingsView`、SCM 内 `bobReviewView` を Webview として追加。
- `themes`: `Bob Theme` を追加。
- `menus`: view title、editor context、explorer context、SCM title、command palette に Bob コマンドを追加。

ユーザー向けの代表コマンドは以下である。

- タスク管理: `bob-code.task.history`, `bob-code.task.export`, `bob-code.task.import`, `bob-code.task.wipe`, `bob-code.task.pickWorkspace`, `bob-code.task.exportCurrent`, `bob-code.task.workflow`
- エディタ操作: `bob-code.explainCode`, `bob-code.improveCode`, `bob-code.addToContext`
- Explorer 操作: `bob-code.explainFile`, `bob-code.explainFolder`
- SCM 操作: `bob-code.generateCommitMessage`, `bob-code.cancelCommitGeneration`, `bob-code.createPullRequest`
- 設定/レビュー: `bob-code.openSettings`, `bob-code.reviewView.openSettings`, `bob-code.reportIssue`

### 4.3 実現方法

内部構成は、大きく以下の要素で実現されている。

**Webview ベースの UI**  
`dist` には `chat.html`、`settings.html`、`findings.html`、`review.html`、`feedback.html` などの Webview エントリが含まれる。VS Code 拡張側は `WebviewViewProvider` / `WebviewPanel` 相当の仕組みでこれらをホストし、メッセージハンドラでチャット、タスク、設定、レビュー状態をやり取りする。

**コマンド登録**  
バンドル内には `registerCommand("bob-code.task.export"...)`、`registerCommand("bob-code.explainCode"...)`、`registerCommand("bob-code.generateCommitMessage"...)` などの登録が含まれる。manifest の `contributes.commands` は表示とメニュー連携、実処理は `dist/extension.js` の command handler が担当する。

**AI エージェント / タスク実行基盤**  
2.0.0 の source map には `../core/webview/ClineProvider.ts`、`../core/webview/generateSystemPrompt.ts`、`../shared/WebviewMessage.ts`、`../core/config/ProviderSettingsManager.ts` などが見える。Bob はチャット UI からタスクを生成し、システムプロンプト、コンテキスト、ツール利用、Webview メッセージを組み合わせて実行していると読める。

**Cloud / 認証 / 設定連携**  
source map には `packages/cloud/src/WebAuthService.ts`、`StaticTokenAuthService.ts`、`CloudAPI.ts`、`CloudSettingsService.ts`、`TaskChannel.ts` などが含まれる。`bobLogin` 認証プロバイダと組み合わせ、Bob Cloud 側の認証・設定・タスクチャネルを扱う。

**コード解析とコンテキスト管理**  
`dist` には `tiktoken_bg.wasm`、`cl100k_base.json`、多数の `tree-sitter-*.wasm` が同梱されている。これはトークン数の見積もり、コード構造解析、ファイルコンテキストの抽出に使われる構成である。対応言語は bash / C / C++ / CSS / C# / Go / Java / JavaScript / JSON / Kotlin / PHP / Python / Ruby / Rust / TypeScript / YAML など多岐にわたる。

**レビュー / Findings / SCM**  
source map には `../ibm/services/findings/*`、`../ibm/services/review/*`、`../ibm/tools/submit-review-findings/*`、`../ibm/core/prompts/sections/review-prompt.ts` が見える。SCM View に Review Webview を出し、LLM で発見したレビュー指摘を Findings として UI に表示し、修正/送信する構造である。

**外部パッケージ向け API**  
Java / IBM i / Z の Premium Package が使う `registerSource`、`registerTool`、`registerWorkflow`、`registerMode`、`registerSkill` などの入口は Bob 本体側で提供される。これにより、Bob 本体は UI と AI 実行基盤を持ち、各ドメイン拡張は機能登録だけを行う。

### 4.4 実装上の特徴

- Bob 本体は、単なるチャット UI ではなく、タスク履歴、ワークフロー、レビュー、Inline Edit、SCM、Telemetry、設定、Findings を統合する IDE エージェント基盤である。
- `bob-code_2.0.0` には source map があるが `sourcesContent` はないため、元 TypeScript のファイル名は追えるものの本文までは同梱されていない。
- `bob-code` 2.0.1 は 2.0.0 より新しいが、source map が見当たらないため、詳細調査では 2.0.0 の source map と 2.0.1 の manifest / bundle を併用するのが現実的である。

---

## 5. `bob-walkthroughs` - Bob Labs / Walkthrough 拡張

### 5.1 概要

`bob-walkthroughs` は、Bob の使い方を学ぶための walkthrough / lab を VS Code 上で提供する拡張である。`package.json` の `contributes.walkthroughs` に 8 種類の walkthrough が定義され、画像・Markdown・コマンドリンクを使って Bob の操作手順をガイドする。

含まれる主な walkthrough は次のとおり。

- `learn-ui`: Working with Bob
- `learn-agentic-dev`: Agentic AI coding partner
- `learn-docker-container-mgmt`: Docker Container Management with Bob
- `learn-devsecops`: DevSecOps lab with Bob
- `java-upgrade`: Java Upgrade Modernization
- `liberty-replatforming`: Liberty Replatforming
- `ibmi-rpg`: IBM i RPG Modernization with Bob
- `secret`: テスト用 walkthrough

### 5.2 ユーザー向け機能

代表コマンドは以下である。

- `bob-walkthroughs.welcome`: Bob Labs の選択 Webview を表示。
- `bob-walkthroughs.launchWalkthrough`: 現在の workspace 設定から対象 walkthrough を選んで起動。
- `bob-walkthroughs.workspaceReset`: Lab workspace を初期状態に戻す。
- `bob-walkthroughs.views.focusSidebar`: Bob Sidebar にフォーカス。
- `bob-walkthroughs.views.focusHistory`: Bob History にフォーカス。
- `bob-walkthroughs.views.focusModes`: Bob Modes にフォーカス。
- `bob-walkthroughs.tools.generateMarkdownUrl`: Markdown から VS Code command URI を生成。
- `bob-walkthroughs.chat.javaModernization`: Java Modernization 開始用の Bob プロンプトを送信。

### 5.3 実現方法

この拡張はバンドルが小さく、実装内容を直接追いやすい。

**walkthrough 定義**  
`package.json` の `contributes.walkthroughs` に walkthrough ID、タイトル、説明、ステップ、画像、Markdown が定義される。VS Code の `workbench.action.openWalkthrough` に `{ category: "IBM.bob-walkthroughs#<id>", step: 0 }` を渡して起動する。

**Bob コマンド名の吸収**  
実装には Bob コマンド prefix を組み立てる関数があり、通常は `bob-code`、`RooVeterinaryInc.roo-cline` が入っている場合は `roo-cline` を使う。これにより、Bob/Roo 系のコマンド差分を吸収する。

**Lab 選択 Webview**  
`bob-walkthroughs.welcome` は `window.createWebviewPanel("walkthroughSelector", "Bob Labs", ...)` で簡易 HTML を生成し、利用可能な Lab をクリック選択できる UI を表示する。

**workspace 設定の読み取り**  
`.vscode/settings.json` や workspace configuration の `bob-code.walkthrough` を読み、どの Lab を表示・起動するかを決める。文字列または文字列配列に対応している。

**workspace reset**  
Lab workspace では `git checkout master`、`git reset --hard`、`git clean -f` などを hidden terminal で実行し、必要に応じて branch を作る。Java Lab では `mvn clean`、`sdk default java 8.0.462.fx-zulu`、Liberty 用 jar の local Maven install も行う。

**ドキュメントリンク生成**  
`bob-walkthroughs.tools.generateMarkdownUrl` はアクティブエディタのファイルパスと選択範囲から `command:bob-walkthroughs.openDocument?...` 形式の Markdown リンクを生成し、clipboard にコピーする。

### 5.4 実装上の特徴

- Bob の機能本体ではなく、学習体験を整える補助拡張である。
- Lab workspace を破棄的に reset するため、通常プロジェクトで使うより、専用 Lab 環境向けの設計である。
- walkthrough と Bob チャットを command URI でつなぎ、手順書から Bob 操作へ誘導する。

---

## 6. `ibm.bob-java-1.0.0-universal` - Java Modernization Premium Package

### 6.1 概要

`ibm.bob-java` は、Java モダナイゼーションを Bob に追加する拡張である。VS Code コマンドは定義されていない。主な UI は Bob のチャット / ワークフローに現れる。README では、Java Upgrade、WebSphere traditional から Liberty への移行、Java Unit Testing、UI Modernization、Vulnerability Detection が主機能として説明されている。

### 6.2 Bob への登録方式

実装バンドルでは、Bob API に対して以下を登録している。

- `registerSource(...)`: Java Premium Package を Bob の source として登録。
- `setConfiguration(...)`: Java source の有効/無効設定スキーマを設定。
- `registerPermissionGroup(...)`: Java インストール操作などの権限グループを登録。
- `registerMode(...)`: Java モダナイゼーション向けの Bob mode を登録。
- `registerTool(...)`: Java プロジェクト解析、ビルド、レシピ実行、テスト、脆弱性照会などの tool を登録。
- `registerWorkflow(...)`: Java モダナイゼーションのガイド付き workflow を登録。
- `registerSkill(...)`: `start-java-mod` などの workflow 起動用 skill を登録。

### 6.3 登録される主なツール

実装バンドルで確認できる代表的な tool は以下である。

| Tool ID | 役割 |
|---|---|
| `get_java_env` | Java プロジェクトの build tool、依存関係、build order、Java インストール状況を読む。 |
| `analyze_java_modernization` | dependencies、frameworks、Java version、build configuration などの包括的メタデータを収集し、任意で LLM による推奨も生成。 |
| `run_recipe` | Maven / Gradle 経由で OpenRewrite recipe を実行。patch 生成または直接ファイル変更に対応。 |
| `build_and_parse` | build command を実行し、warning / error を構造化して返す。 |
| `install_java_version` | Java 11 / 17 / 21 / 25 をインストールする。 |
| `switch_java_version` | インストール済み Java の default version を切り替える。 |
| `run_unit_test` | Maven / Gradle のテストを実行し、JaCoCo coverage や詳細 log を取得。 |
| `detect_dependencies` | `pom.xml` / Gradle build file などから package と version を検出。 |
| `query_vulnerabilities` | OSV API に package 情報を問い合わせ、脆弱性を取得。 |

### 6.4 登録される主なワークフロー

| Workflow ID | 表示名 / 目的 |
|---|---|
| `java_modernization_workflow` | Java Modernization の入口。プロジェクトを分析し、Java Upgrade / Liberty / UI / Testing / Vulnerability などへ誘導。 |
| `java_modernization_java_upgrade_workflow` | Java Upgrade。Java 11 / 17 / 21 / 25 への移行、OpenRewrite、build parse、agentic fix loop を実施。 |
| `java_modernization_liberty_replatforming_workflow` | Liberty Replatforming。AMA report を読み、WebSphere traditional から Liberty へ移行。 |
| `java_modernization_ui_modernization_workflow` | UI Modernization。JSF / Struts などから Java backend + React frontend へ分離・移行する流れ。 |
| `java_unit_test_workflow` | Java Unit Testing。JUnit / JaCoCo の設定確認、戦略作成、テスト生成、実行を行う。 |
| `vulnerabilities_workflow` | Java Vulnerabilities Detection。依存関係を OSV で照会し、脆弱性と修正候補を提示。 |

### 6.5 実現方法

**OpenRewrite を中心にした自動変換**  
Java Upgrade / Liberty 移行では、Bob が対象 project / module / recipe を決め、`run_recipe` tool が Maven / Gradle 経由で OpenRewrite を実行する。patch mode と直接変更 mode があり、大規模プロジェクトでは直接変更が必要になる設計になっている。

**build-and-fix loop**  
`build_and_parse` が build 出力を warning / error として構造化し、ワークフロー側が似たエラーを root cause ごとにまとめる。README にある “agentic fix loop” は、この構造化エラーを Bob の subagent / mode に渡して修正・再 build を繰り返す流れとして実装されている。

**JDK 操作**  
`install_java_version` / `switch_java_version` は target Java version を受け取り、環境に Java を導入・切替する。README では Linux/macOS は SDKMAN、Windows は WinGet の利用が説明されている。

**テスト/カバレッジ**  
`run_unit_test` は test command、coverage 有効化、log 有効化を引数に持つ。JaCoCo が導入されていない場合の追加や、CSV/HTML coverage 取得をワークフローが扱う。

**OSV 脆弱性照会**  
`query_vulnerabilities` は package name / ecosystem / version を入力し、OSV の `/v1/query` や batch 形式の照会を使う構成である。`detect_dependencies` と組み合わせて、Maven 依存関係の CVE / advisory を Bob が説明・修正案提示に使う。

### 6.6 実装上の特徴と注意点

- 通常の VS Code コマンドではなく、Bob の workflow/tool 体系に完全に寄せた拡張である。
- `install_java_version` や build 実行はローカル環境に変更を加える。権限グループを設けているのはこのためである。
- 脆弱性照会では外部 API を使うため、dependency metadata が外部サービスに送信されうる。
- OpenRewrite や build tool による大量のファイル変更が起きるため、Git 差分確認と branch 運用が重要である。

---

## 7. `ibm.bob-z-extension-3.0.0-universal` - Bob Premium Package for Z

### 7.1 概要

`ibm.bob-z-extension` は、IBM Z / mainframe 開発向けの Bob 機能を追加する Premium Package である。README では、COBOL / PL/I / JCL / REXX / Assembler のコード説明、ドキュメント生成、データ辞書生成、影響分析、Z Understand によるリファクタリング、COBOL から Java への変換などが説明されている。

依存拡張として `ibm.zopeneditor` と `mermaidchart.vscode-mermaid-chart` を要求する。起動条件は `*` で、VS Code 起動時に広く activate される。

### 7.2 ユーザー向けコマンドと設定

主な VS Code コマンドは次のとおり。

- `bob-z.understandLogin`: Z Understand にサインイン。
- `bob-z.selectUnderstandProject`: Z Understand project を選択。
- `bob-z.refactorCodeGeneration`: サービスコード生成。
- `bob-z.collectDiagnostics`: 診断情報を収集。
- `bob-z.editorTransformSnippetCommand`: エディタ上のコード片を Java へ変換。
- `bob-z.explorerTransformFileCommand`: Explorer のファイルを Java へ変換。

主な設定は以下である。

- `bob-z.logLevel`: log level。
- `bob-z.understand.URL`: Z Understand Refactoring Services endpoint。
- `bob-z.understand.certificate`: Z Understand 用 custom SSL certificate path。
- `bob-z.understand.callbackPort`: OAuth callback port。default は `3233`。

### 7.3 Bob への登録方式

実装では Bob 本体拡張 `IBM.bob-code` を取得し、少なくとも Bob 2.0.0 を前提として API を使う。`registerSource("z", "IBM Bob Premium Package for Z")` 相当の処理で Z source を登録し、設定を紐づけたうえで、mode、tool、workflow、skill、findings を登録する。

また、watsonx Code Assistant for Z との共存を検知し、競合時には Bob Z 側を無効化 / 警告する処理が入っている。activate 後には VS Code search exclude に `**/.bobz` を追加し、内部作業ディレクトリが通常検索に混ざらないようにする。

### 7.4 Bob Modes

実装バンドル上、少なくとも次の 2 mode が登録される。

| Mode | 目的 |
|---|---|
| `Z Code` | Z 固有ツールを使い、mainframe application の説明、変更実装、モダナイズを行う。CICS / MQ / IMS / SQL / DB2 などを含む Z code 作業向け。 |
| `Z Architect` | アーキテクチャ分析、設計理解、影響分析、依存関係整理、技術ドキュメント生成向け。コード変更ではなく分析・計画に寄せた mode。 |

### 7.5 登録される主なツール

実装バンドルの `getId()` / `static ID` から確認できる代表 tool は次のとおり。

| 分類 | Tool ID | 役割 |
|---|---|---|
| コード解析 | `scan_program` | COBOL / PL/I などの program を scan。 |
| メタデータ SQL | `execute_sql_query` | parsed COBOL metadata を格納した SQL DB への query。 |
| 制御/段落 | `get_control_flow`, `get_paragraphs` | program control flow や paragraph 情報を取得。 |
| プロジェクト分析 | `get_project_inventory`, `get_project_programs`, `get_project_tables`, `get_project_variables`, `get_project_statement_types` | project 全体の program / table / variable / statement metadata を取得。 |
| データ辞書 | `get_variables`, `edit_data_dictionary`, `sync_data_dictionary` | variable を抽出し、semantic description / business term を補完・編集・同期。 |
| Z Understand | `sign_in_to_z_understand`, `refactor`, `submit_refactor_findings` | Z Understand への認証、refactor 対象抽出、findings 送信。 |
| 説明 | `persona_profile`, `get_expanded_source` | 説明対象の persona profile、copybook/include 展開後 source を取得。 |
| 変換 | `get_source_to_java_metadata`, `transform_metadata` | COBOL / PL/I から Java 変換に必要な metadata を取得。 |
| 検証 | `data_preparation`, `resource_mapper`, `junit_generation`, `junit_execution` | 変換後 Java の検証、JUnit 生成・実行。 |

### 7.6 登録される主なワークフロー

| Workflow ID | 表示名 / 目的 |
|---|---|
| `data-dictionary-workflow` | Generate data dictionary。Z 変数名に semantic interpretation、business term、business description を付与。 |
| `transform-workflow` | Transform COBOL or PL/I program to Java。IMS / CICS / Db2 / z/OS encoding を考慮して Java アプリへ変換。 |
| `validate-workflow` | Validate transformed code。変換後コードを自動テストで検証。デフォルトでは disabled として実装されている。 |
| `refactor-code-generation-workflow` | Generate refactored service program。Z Understand で抽出した sliced code blocks から service program を生成。 |
| `refactor-workflow` | Refactor 系 workflow。Z Understand による relevant sections の抽出に関係する。 |
| `refactor-report-generation` | Refactor 結果レポート生成。 |

README とバンドル内の文言から、上記に加えてコード説明 / documentation generation / impact analysis / implementation planning も skill / workflow / mode の組み合わせで提供される。

### 7.7 実現方法

**Z Open Editor との連携**  
Z Open Editor の言語解析、expanded source、program control flow、data elements などの知見を Bob の tool として利用する。Z Open Editor は COBOL / PL/I / HLASM / REXX / JCL の Language Server と Zowe 連携を持つため、Bob Z はそれを AI 向け tool interface として包む役割を持つ。

**Z Understand 連携**  
`bob-z.understand.URL`、certificate、callback port を設定として持ち、OAuth login と project selection を VS Code command で提供する。Z Understand は COBOL / PL/I の refactoring service として使われ、extract relevant sections / service program 生成の材料を返す。

**データ辞書生成**  
`scan_program`、`get_variables`、`edit_data_dictionary`、`sync_data_dictionary` を組み合わせ、暗号的・略語的な Z 変数名を business term / semantic description に変換する。Data dictionary は理解、説明、変換の前処理として重要である。

**COBOL / PL/I から Java への変換と検証**  
`transform-workflow` は metadata、coding standards、project setup、class generation、method implementation などのステップを持つ。`validate-workflow` は resource mapping、JUnit generation / execution を含み、変換後 Java が元の振る舞いに近いかを検証する。

### 7.8 実装上の特徴と注意点

- Bob Z は Bob 本体、Z Open Editor、Mermaid、Z Understand をまたぐ統合拡張である。
- `transform-workflow` と `validate-workflow` は実装上 `isEnabled` が `false` になっている箇所があり、通常の workflow 一覧ではなく VS Code command などから開始する設計の可能性がある。
- `**/.bobz` を search exclude に追加するため、内部生成ファイルを通常検索対象から外す。
- メインフレームコードの外部サービス連携・変換・生成を行うため、利用時はプロジェクト機密情報、Z Understand endpoint、証明書、生成物の扱いに注意が必要である。

---

## 8. `ibm.vscode-clle-1.2.6-universal` - CL / CLLE 言語支援

### 8.1 概要

`vscode-clle` は IBM i の CL / CLLE / BND / CMD 向けの言語支援拡張である。依存拡張は `halcyontechltd.code-for-ibmi` で、IBM i への接続、remote command、content access は Code for IBM i の API を利用する。

### 8.2 ユーザー向け機能

代表機能は次のとおり。

- CL ソース向け snippet。
- 選択中 CL command の実行 (`vscode-clle.runSelected`)。
- CL / BND / CMD の文法チェック (`vscode-clle.syntax.checkDocument`)。
- CL command documentation の hover / full documentation 表示 (`vscode-clle.viewFullDocumentation`)。
- Command / parameter documentation の hover 表示。
- Language Server 相当の module 情報取得 (`vscode-clle.server.getModules`)。

### 8.3 実現方法

**Code for IBM i API 利用**  
実装は `halcyontechltd.code-for-ibmi` の exports から `instance`、`componentRegistry`、`tools` を取得する。IBM i への接続、remote command、SQL、member / stream file 操作は Code for IBM i に委譲する。

**選択 CL command の実行**  
`vscode-clle.runSelected` は active editor の selection または現在行から CL command 文字列を抽出し、`code-for-ibmi.runAction` に `{ command, environment: "ile", name: "CL command" }` を渡して実行する。

**GENCMDXML remote component**  
CL command documentation 取得のため、IBM i 上に `GENCMDXML` という CL program を作成する。内部で IBM i API `QCDRCMDD` を呼び、command definition を `/tmp/<id>` に XML として出力し、拡張側が download / XML parse する。

**CLSyntaxChecker remote component**  
CL syntax check のために C++ program と SQL UDTF を IBM i 上に作成する。`CL_SYNTAX_CHECKER` 関数を SQL で呼び、`MSGID`、`MSGTEXT`、`CMDSTRING` を取得して VS Code の diagnostics に変換する。対象 language id は `cl`、`bnd`、`cmd` で、document edit 時の debounce interval は設定値で制御される。

### 8.4 主な設定

- `vscode-clle.general.displayCommandDocumentation`: hover で command documentation を表示するか。
- `vscode-clle.syntax.checkOnOpen`: ファイル open 時に文法チェックするか。
- `vscode-clle.syntax.checkOnEdit`: 編集時に自動チェックするか。
- `vscode-clle.syntax.checkInterval`: 編集後チェックまでの待機時間 ms。

### 8.5 実装上の特徴と注意点

- CL 文法チェックはローカルだけで完結せず、IBM i 上に helper program / UDTF を導入して行う。
- Remote component の library は Code for IBM i の temp library を使い、未設定時は `ILEDITOR` が fallback として使われる。
- 文法チェック対象 document が長すぎる場合の制限や、接続状態に依存する機能がある。

---

## 9. `ibm.vscode-ibmi-bob-1.0.0-universal` - Bob Premium Package for i

### 9.1 概要

`vscode-ibmi-bob` は IBM i 開発向けに Bob を拡張する Premium Package である。IBM i 上の QSYS member / IFS stream file / CL / SQL / PASE / compile / RPGUnit / documentation retrieval などを Bob tool として登録し、RPG modernization、business rules extraction、RPGUnit、SQL index strategy などの workflow を提供する。

依存拡張は以下である。

- `halcyontechltd.code-for-ibmi`
- `halcyontechltd.vscode-rpgle`
- `halcyontechltd.vscode-db2i`
- `IBM.vscode-clle`
- `IBM.vscode-ibmi-testing`
- `barrettotte.ibmi-languages`

### 9.2 起動と Bob への登録

実装では Bob 本体拡張 `IBM.bob-code` を取得し、`registerSource` で IBM i source を登録する。minimum version は 1.9.9 として扱われている。登録後、`source.isEnabled()` と `source.isEntitled()` を確認し、両方が true の場合に `vscode-ibmi-bob:isActive` context を true にする。

有効化後に以下を登録する。

- Workspaces: local、library list、home directory など。
- Permission groups: documentation など。
- Modes: IBM i Developer、IBM i Database。
- Tools: QSYS / IFS / CL / SQL / PASE / build / test / docs。
- Skills: RPG、CL、DDS、Db2 for i、performance、security、journaling、temporal tables など。
- Workflows: RPG Modernization、SQL Index Strategy Advisor、Business Rules Extraction、RPGUnit Test Plan / Implementation。
- VS Code commands: Welcome、Add to Bob、Extract business rules。

### 9.3 Bob Modes

| Mode | 目的 |
|---|---|
| `IBM i Developer` | RPG、CL、DDS、COBOL、Db2 for i、compile、test、documentation を扱う IBM i 開発者 mode。 |
| `IBM i Database` | Db2 for i SQL の生成、モダナイズ、チューニング、レビュー、セキュリティ確認に特化した mode。 |

### 9.4 登録される主なツール

実装の tool 登録一覧から、以下が確認できる。

| Tool ID | 役割 |
|---|---|
| `read_member` | QSYS source member を読む。`/LIBRARY/FILE/MEMBER.EXT` 形式を扱う。 |
| `search_qsys` | Library / file / member / object を検索。 |
| `write_member` | QSYS source member を作成・更新。 |
| `read_stream_file` | IFS stream file を読む。 |
| `search_ifs` | IFS path / file pattern / content term で検索。 |
| `write_stream_file` | IFS stream file を作成・更新。 |
| `execute_cl_command` | IBM i の CL command を実行。設定で library-qualified command を強制できる。 |
| `execute_sql_statement` | Db2 for i SQL を実行。deny list と最大取得行数の guardrail を持つ。 |
| `execute_pase_command` | PASE shell command を実行。 |
| `convert_rpg_source` | IBM i の `CVTRPGSRC` を使い、RPG source を RPGLE に変換。 |
| `get_compile_actions` | Code for IBM i の compile action 候補を取得。 |
| `execute_compile_action` | 選択した compile action を実行し、spool / diagnostics を返す。 |
| `generate_rpg_unit_test_stub` | RPGUnit test stub を生成。 |
| `run_rpg_unit_test_suite` | RPGUnit test suite を実行。 |
| `fetch_cl_command_doc` | CLLE 拡張の command documentation 取得機能を利用。 |
| `search_sql_examples` | Db2 for i SQL examples を検索。 |
| `fetch_sql_example` | SQL example の詳細を取得。 |
| `search_ibm_i_docs_with_rag` | IBM i documentation を RAG 検索。 |

### 9.5 登録される主なワークフロー

| Workflow ID | 表示名 / 目的 |
|---|---|
| `ibmi_rpg_modernization` | RPG Modernization。OPM RPG / fixed-format RPG を ILE / free-format へ移行。 |
| `ibmi_db2_indexing_strategy` | SQL Index Strategy Advisor。Plan Cache Snapshot / Database Monitor / Index Advisor / MTI を分析して index 戦略を提案・作成。 |
| `ibmi_business_rules_extraction` | Business Rules Extraction。RPGLE source から business rules を抽出し Markdown / Mermaid report を生成。 |
| `ibmi_create_rpgunit_test_plan` | RPGUnit Test Plan Creation。対象 code と docs を読んで structured test plan を作成。 |
| `ibmi_implement_rpgunit_test_plan` | RPGUnit Test Suite Implementation。test plan に基づき RPGUnit suite を実装し、実行・修正する。 |

### 9.6 実現方法

**Code for IBM i の上に Bob tool を載せる**  
QSYS / IFS / CL / SQL / PASE / compile は Code for IBM i の connection API と deploy tools を使う。Premium Package for i はこれらを Bob tool として抽象化し、Bob が必要に応じて呼べるようにする。

**path scheme による workspace 抽象化**  
QSYS member と IFS stream file は異なるファイルシステムだが、Bob tool は `member` scheme / `streamfile` scheme / local file を意識して使い分ける。実装には「QSYS member には `read_member` / `write_member`、IFS stream file には `read_stream_file` / `write_stream_file`」を使うよう Bob prompt / tool hint が含まれる。

**Guardrails**  
`execute_cl_command` には library-qualified command を強制する設定があり、`execute_sql_statement` には default deny SQL statement types がある。default の deny list には `DROP`、`UPDATE`、`TRUNCATE`、`GRANT`、`REVOKE`、`CALL`、`COMMIT`、`ROLLBACK` など破壊的または影響が大きい statement が含まれる。

**RPG Modernization**  
`convert_rpg_source` が IBM i の `CVTRPGSRC` を利用し、ワークフロー側が fixed-to-free、OPM-to-ILE、I-spec / O-spec の外部化などを段階的に処理する。自動変換結果は Bob が読み、compile / diagnostics を使って修正する設計である。

**SQL Index Strategy**  
Plan Cache Snapshot や Database Monitor の既存データ、または新規 capture を読み、Index Advisor recommendations、MTI、elapsed time、CPU、database reads などから index 候補を選び、作成・検証・cleanup まで支援する。

**RAG documentation**  
`search_ibm_i_docs_with_rag` は IBM i ドキュメントを Bob の回答に取り込む。スキル側にも「documentation search で検証する」旨の指示が含まれており、IBM i 特有の正確な API / command / SQL service の参照に使われる。

### 9.7 主な設定

- `vscode-ibmi-bob.general.maxRowsToFetch`: Bob が SQL 実行時に取得する最大行数。default は `100`。
- `vscode-ibmi-bob.guardrails.enforceQualifiedCLCommands`: CL command の library qualification を強制。default は `true`。
- `vscode-ibmi-bob.guardrails.deniedSQLStatementTypes`: 追加確認なしに許可しない SQL statement type の list。

### 9.8 実装上の特徴と注意点

- IBM i に対する read / write / execute 権限を Bob に渡す拡張であるため、Entitlement、接続先 user authority、guardrail 設定が非常に重要である。
- CL / SQL / PASE はリモート実行であり、プロンプトや workflow が意図せず破壊的操作を選ばないよう設定・レビューが必要である。
- Documentation / example retrieval は IBM i 固有知識を補う強力な仕組みだが、回答生成時に実 code / system metadata が context として扱われる点に留意する。

---

## 10. `ibm.vscode-ibmi-testing-1.3.4-universal` - IBM i Testing

### 10.1 概要

`vscode-ibmi-testing` は、IBM i 上の RPG / COBOL テストを VS Code から実行し、RPGUnit を使った test suite、test stub、code coverage を扱う拡張である。Premium Package for i からも test tool として利用される。

依存拡張は `halcyontechltd.code-for-ibmi` と `halcyontechltd.vscode-rpgle` である。

### 10.2 ユーザー向け機能

README と実装から確認できる主機能は以下である。

- RPGUnit の product library / test source file を使った test discovery。
- VS Code Testing API による Test Controller 作成と test run 表示。
- RPGUnit test suite / case の実行。
- test stub 生成コマンド `vscode-ibmi-testing.generateTestStub`。
- RPGLE editor code action から「Generate test case」「Generate test suite」を提供。
- `testing.json` の schema validation。
- test result の detail 表示、failure / error message の inline 表示。
- line / procedure level coverage の editor overlay。

### 10.3 実現方法

**VS Code Testing API**  
バンドル内には `createTestController` の利用と Test Manager 作成処理が含まれる。IBM i に接続したタイミングで test manager を生成し、切断時には controller を dispose する。Code for IBM i の connection lifecycle に subscribe している。

**RPGUnit remote component**  
同梱ファイルとして `RPGUNIT-6.0.0.SAVF` が含まれる。設定 `IBM i Testing.productLibrary` の default は `RPGUNIT` で、test 実行時には RPGUnit の command / API を利用する。

**test stub generation**  
`vscode-ibmi-testing.generateTestStub` は RPGLE document から exported procedure を解析し、test case / suite の template を生成する。設定に応じて以下を自動挿入する。

- `testing.json` default configuration
- `ctl-opt nomain ...` などの control options / directives
- `/copy` / `/include`
- prototype
- test case procedure

既存 document の includes / procedures を解析して挿入位置を決め、`WorkspaceEdit` でファイルまたは source member に反映する。

**IBM i 上の source file 作成**  
member scheme の test file target が存在しない場合、`QSYS/CRTSRCPF FILE(<lib>/<file>) RCDLEN(112)` で source physical file を作成する処理がある。編集後は Code for IBM i object browser refresh を呼ぶ。

### 10.4 主な設定

主な設定は以下である。

- `IBM i Testing.productLibrary`: RPGUnit product library。default `RPGUNIT`。
- `IBM i Testing.testSourceFiles`: test 検索対象 source file。default `QTESTSRC`。
- `IBM i Testing.testStubPreferences`: stub preview、test source file / directory、default config 生成、include / prototype / comments 追加など。
- `IBM i Testing.libraryListValidation`: RPGUnit / QDEVTOOLS など required library の library list 検証。
- `IBM i Testing.runOrder`: test procedure 実行順。default `*API`。
- `IBM i Testing.libraryList`, `jobDescription`, `reportDetail`, `createReport`, `reclaimResources`, `onFailure`: RPGUnit 実行時の runtime option。

### 10.5 実装上の特徴と注意点

- テスト実行は VS Code 内で見えるが、実処理は IBM i 上の RPGUnit に依存する。
- test stub 生成は既存 source に編集を加えるため、preview / workspace edit の確認が重要である。
- product library や library list が正しくないと discovery / run が失敗するため、Code for IBM i の接続設定と library list が前提になる。

---

## 11. `ibm.zopeneditor-6.6.0-universal` - IBM Z Open Editor

### 11.1 概要

`zopeneditor` は IBM Z 言語向けの総合開発拡張である。COBOL、PL/I、HLASM、REXX、JCL などの language support を提供し、Language Server、TextMate grammar、snippets、semantic tokens、Zowe 連携、User Build、ZCodeScan、advanced analysis view、MCP tools を含む。

Bob Z Premium Package は、この拡張の分析能力や Zowe 連携を前提に動く。

### 11.2 VS Code への寄与点

主な寄与点は以下である。

- `languages`: `cobol`, `pl1`, `jcl`, `jesjcl`, `jesmsglg`, `spool`, `hlasm`, `hlasmlst`, `rexx` など 9 種類。
- `grammars`: 各言語の TextMate grammar。
- `snippets`: COBOL / PL/I / JCL / HLASM などの snippet。
- `semanticTokenTypes` / `semanticTokenScopes`: Z language 用 semantic tokens。
- `configuration`: 67 個の設定項目。
- `commands`: 59 個のコマンド。
- `viewsContainers.panel`: Resource Table、Data Elements、Program Control Flow、Data Flow、Hex Line Editor など。
- `views`: Webview type の各パネル。
- `keybindings`: COBOL / PL/I / HLASM / REXX / JCL の save 時 truncate check、tab / revtab など。

### 11.3 主な機能

- COBOL / PL/I / HLASM / REXX / JCL の構文強調、real-time syntax check、outline、hover、go to definition、references、rename、completion。
- COBOL copybook、PL/I include、HLASM macro の解決。
- Zowe Explorer との連携による data set / USS / jobs 操作。
- IBM User Build / full User Build。
- COBOL / PL/I preprocessor の local / remote 実行と差分比較。
- ZCodeScan による COBOL / PL/I scan。
- Data Elements view、Program Control Flow graph、Data Flow graph。
- z/OS Resources Table。
- Remote Connection Emulator / 3270 emulator 起動。
- ZAPP file validation / save。
- MCP server / agent mode 連携基盤。

### 11.4 実現方法

**Java Language Server**  
`language-server` ディレクトリに Java ベースの language server / plugin が含まれる。README では Java SDK / JRE 21 以上が必要とされ、`zopeneditor.JAVA_HOME`、`java.home`、`JAVA_HOME`、PATH、platform default の順に Java を探す構成である。

**TextMate grammar + LSP の二層構造**  
TextMate grammar は immediate syntax highlight を提供し、Language Server は diagnostics、outline、definition、references、rename、completion、copybook/include 解決などを提供する。

**Zowe 連携**  
依存拡張 `Zowe.vscode-extension-for-zowe` と連携し、MVS data set、USS file、job spool を扱う。Zowe profile refresh / change、RSE password prompt、Zowe tree item から Resource Table 表示などの command が含まれる。

**Advanced Webviews**  
`dist/webviews` 配下には dataElements、dataFlowGraph、pcfGraph、resourcesTable、hexLineEditor などの Webview asset が含まれる。Language Server / backend analysis 結果を UI 表示する。

### 11.5 実装上の特徴と注意点

- Z Open Editor は Bob なしでも独立して利用できる Z 開発基盤である。
- Advanced capability は license / trial / activation kit / RSE API connection に依存する部分がある。
- Java runtime と Zowe profile の設定が正しくないと、LSP / remote 操作 / advanced views が機能しない。
- Bob Z は Z Open Editor の機能を AI tool 化するため、Z Open Editor の状態が Bob Z の成功率に直結する。

---

## 12. 拡張間の連携関係

### 12.1 Bob 本体を中心にした連携

`bob-code` は IDE 側の AI runtime であり、Premium Package は Bob API に機能を登録する。Java / i / Z それぞれが独立に workflow / tool / skill を持つため、Bob 本体の UI は共通でも、実行される処理は source ごとに分離される。

### 12.2 IBM i 系連携

IBM i 系は以下の依存関係で動く。

- `vscode-ibmi-bob` が Bob 連携と workflow/tool を提供。
- `code-for-ibmi` が IBM i 接続、QSYS/IFS、CL/SQL/PASE、component registry を提供。
- `vscode-clle` が CL documentation と syntax checker を提供。
- `vscode-ibmi-testing` が RPGUnit test / coverage / stub generation を提供。
- `vscode-rpgle` や `ibmi-languages` が RPGLE / IBM i language support を補完。

したがって IBM i Premium Package は「Bob + Code for IBM i + CLLE + IBM i Testing」の統合レイヤーである。

### 12.3 IBM Z 系連携

IBM Z 系は以下の構成である。

- `bob-z-extension` が Bob 連携、Z mode、workflow、tool、Z Understand 連携を提供。
- `zopeneditor` が Z 言語 LSP、Zowe、advanced analysis view、MCP tools を提供。
- `mermaidchart.vscode-mermaid-chart` が diagram 表示に関わる。
- Z Understand server が refactoring / service extraction の外部分析基盤になる。

### 12.4 Java 系連携

Java Premium Package は比較的独立しており、外部 VS Code 拡張よりもローカル toolchain / external service への依存が大きい。

- Maven / Gradle
- OpenRewrite
- JDK installer / switcher (SDKMAN / WinGet など)
- JaCoCo
- OSV API
- IBM AMA report / Liberty migration assets

---

## 13. 実装パターン別まとめ

### 13.1 VS Code command / menu パターン

`bob-code`、`bob-walkthroughs`、`bob-z-extension`、`vscode-clle`、`vscode-ibmi-bob`、`zopeneditor` は `contributes.commands` と `commands.registerCommand` を使い、Command Palette、Editor context、Explorer context、SCM、View title、Testing code action から機能を起動する。

### 13.2 Webview パターン

`bob-code`、`bob-walkthroughs`、`zopeneditor` は Webview を多用する。

- `bob-code`: Chat / Settings / Findings / Review / Feedback。
- `bob-walkthroughs`: Bob Labs selector。
- `zopeneditor`: Resource Table / Data Elements / Program Control Flow / Data Flow / Hex Line Editor。

### 13.3 Bob API registration パターン

Premium Package は `registerSource` を起点に `registerTool`、`registerWorkflow`、`registerSkill`、`registerMode` を呼ぶ。これにより VS Code UI に直接コマンドを増やすより、Bob chat / workflow 内に専門能力を統合する。

### 13.4 Remote execution パターン

IBM i / IBM Z では remote system の状態に強く依存する。

- IBM i: CL command、SQL statement、PASE command、QSYS source member、IFS stream file、RPGUnit、compile actions。
- IBM Z: Zowe profile、data set、USS、Language Server、Z Understand、Z Open Editor advanced features。
- Java: local build / package manager / OpenRewrite / OSV external API。

### 13.5 Guardrail / entitlement パターン

Premium Package for i は `isEnabled()` と `isEntitled()` を確認し、SQL deny list や CL qualification 設定を持つ。Bob Z は Bob version と競合拡張を確認する。Java は Java installation 操作に permission group を持つ。AI が実際の環境を変更するため、これらの guardrail は重要である。

---

## 14. 運用・保守上の注意点

### 14.1 バンドルコードと source map

多くの拡張は `dist/extension.js` に bundled/minified された状態で入っている。脆弱性調査や不具合調査では、manifest と runtime string だけでなく、元リポジトリの TypeScript source へのアクセスがあると精度が上がる。今回の同梱物では `bob-code_2.0.0` に source map があり、モジュール名の追跡には有効だったが、`sourcesContent` はない。

### 14.2 破壊的操作の確認

以下は実環境を変更する可能性があるため、実行前に workspace / branch / remote user 権限を確認するべきである。

- `bob-walkthroughs.workspaceReset`: `git reset --hard` / `git clean -f`。
- Java tools: OpenRewrite、JDK install/switch、build file 変更、dependency upgrade。
- IBM i tools: `write_member`、`write_stream_file`、`execute_cl_command`、`execute_sql_statement`、`execute_pase_command`、compile / test。
- Z tools: transform / refactor / generated service code / validation artifacts。

### 14.3 外部サービス・機密情報

OSV、Z Understand、Bob Cloud、RAG documentation、remote IBM i/Z systems への接続を伴う。ソースコード、依存関係、system metadata、エラー log、business rules などが context として扱われるため、組織のデータ分類・送信ポリシーと照合する必要がある。

### 14.4 バージョン整合性

- `bob-z-extension` は Bob 2.0.0 以上を前提にしている。
- `vscode-ibmi-bob` は Bob 1.9.9 以上を前提としている。
- `zopeneditor` は Java 21 以上が必要。
- IBM i 系は Code for IBM i と接続先 library list / temp library に依存する。
- `bob2` 内に `bob-code` 2.0.1 と 2.0.0 が混在するため、実際に VS Code に入れる場合は同じ extension ID の競合に注意する。

---

## 15. 付録 A: 各拡張の主要ファイル

| 拡張 | 主要ファイル |
|---|---|
| `bob-code` | `package.json`, `dist/extension.js`, `dist/chat.html`, `dist/settings.html`, `dist/findings.html`, `dist/review.html`, `dist/tiktoken_bg.wasm`, `dist/tree-sitter-*.wasm` |
| `bob-code_2.0.0` | `package.json`, `dist/extension.js`, `dist/extension.js.map`, `readme.md`, `changelog.md`, Webview assets |
| `bob-walkthroughs` | `package.json`, `dist/extension.js`, `walkthroughs/**/*`, `assets/**/*` |
| `bob-java` | `package.json`, `dist/extension.js`, `readme.md`, Java workflow / tool prompts embedded in bundle |
| `bob-z-extension` | `package.json`, `dist/extension.js`, `readme.md`, `resources/rules/commands/init`, Z workflow/tool prompts embedded in bundle |
| `vscode-clle` | `package.json`, `out/extension.js`, `out/server.js`, `schemas/cl.code-snippets` |
| `vscode-ibmi-bob` | `package.json`, `dist/extension.js`, `README.md`, skills/workflows/tools embedded in bundle |
| `vscode-ibmi-testing` | `package.json`, `dist/extension.js`, `schemas/testing.json`, `RPGUNIT-6.0.0.SAVF`, `readme.md` |
| `zopeneditor` | `package.json`, `dist/extension`, `dist/web/extension.js`, `language-server/**/*`, `resources/**/*`, `dist/webviews/**/*` |

## 16. 付録 B: 代表コマンド一覧

### Bob 本体 (`bob-code`)

- `bob-code.task.history`: Tasks
- `bob-code.openSettings`: Settings
- `bob-code.task.export`: Export Task History
- `bob-code.task.import`: Import Task History
- `bob-code.task.wipe`: Clear Chat History
- `bob-code.task.pickWorkspace`: New Task
- `bob-code.task.workflow`: Start Workflow
- `bob-code.explainFile` / `bob-code.explainFolder`: Explain with Bob
- `bob-code.explainCode`: Explain Code
- `bob-code.improveCode`: Improve Code
- `bob-code.addToContext`: Add to Context
- `bob-code.generateCommitMessage`: Generate Commit Message
- `bob-code.createPullRequest`: Create Pull Request
- `bob-code.reviewView.openSettings`: Open Review Settings
- `bob-code.reportIssue`: Report Issue

### Bob Walkthroughs

- `bob-walkthroughs.welcome`
- `bob-walkthroughs.launchWalkthrough`
- `bob-walkthroughs.workspaceReset`
- `bob-walkthroughs.views.focusSidebar`
- `bob-walkthroughs.views.focusHistory`
- `bob-walkthroughs.views.focusModes`
- `bob-walkthroughs.tools.generateMarkdownUrl`
- `bob-walkthroughs.chat.javaModernization`

### Bob Premium Package for Z

- `bob-z.understandLogin`
- `bob-z.selectUnderstandProject`
- `bob-z.refactorCodeGeneration`
- `bob-z.collectDiagnostics`
- `bob-z.editorTransformSnippetCommand`
- `bob-z.explorerTransformFileCommand`

### CL

- `vscode-clle.runSelected`
- `vscode-clle.syntax.checkDocument`
- `vscode-clle.viewFullDocumentation`

### IBM Bob Premium Package for i

- `vscode-ibmi-bob.openWelcomePage`
- `vscode-ibmi-bob.addToContext`
- `vscode-ibmi-bob.extractBusinessRules`

### IBM i Testing

- `vscode-ibmi-testing.generateTestStub`

### IBM Z Open Editor

Z Open Editor は 59 個の command を持つ。代表例は以下である。

- COBOL / PL/I / HLASM / REXX / JCL truncate check and save
- `cobol.renumber` / `cobol.unnumber`
- `hlasm.refreshMaclibs`
- `extension.userbuild` / `extension.full-userbuild`
- `preprocessor.local.execute.*`, `preprocessor.mvs.execute.*`, `preprocessor.*.diff.check`
- `cobol.expandSource`, `pl1.expandSource`, `jcl.expandSource`
- `cobol.zCodeScan.execute`, `pl1.zCodeScan.execute`
- `zopeneditor.openResourceTable`
- `zopeneditor.data.elements.open`
- `zopeneditor.program.control.flow`
- `zopeneditor.data.flow`
- `zopeneditor.hexEditLine`
- `zopeneditor.zapp.validateAndSave`
- `zopeneditor.export.support.files`

## 17. 付録 C: 調査結果の短い結論

`bob2` の拡張群は、Bob 本体を中心に、ドメイン別の専門能力を後付け登録する構成で整理されている。Java / IBM i / IBM Z の各 Premium Package は、独自 UI を大きく持つよりも、Bob の会話・workflow・tool 実行モデルに溶け込む実装になっている。一方で、IBM i と IBM Z の領域では実システムへの read/write/execute を伴い、Java 領域ではローカル toolchain と外部 API を使うため、導入・運用時には権限、ネットワーク、データ送信、破壊的変更、version 互換性の確認が欠かせない。
