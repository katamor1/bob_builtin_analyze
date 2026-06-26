# Bob 2.0.0 Workflow Discovery Analysis

調査日: 2026-06-27  
対象: `bob2/bob-code` の `Start Workflow` UI と、`ワークフローが見つかりませんでした` が出る理由

## 結論

画像の `Bobワークフロー` 画面は、`bob-code.task.workflow` コマンドで開かれる workflow picker と見てよい。

`ワークフローが見つかりませんでした` は、workflow picker 自体の異常ではなく、**Bob の workflow registry / workflow source から QuickPick に渡せる workflow item が 0 件になっている** 状態を示す。

任意 workflow を追加する最も安全な方法は、Bob 本体を改造することではなく、対象 workspace 直下に次のような Markdown workflow を置くこと。

```text
<project-root>/
  .bob/
    workflows/
      my-workflow.md
```

Bob 本体側に安定した外部 `contributes.workflows` のような VSCode contribution point は確認できないため、第三者拡張から内部 registry を直接叩くより、`.bob/workflows/*.md` を workspace に配置する方式を第一候補にする。

## 1. 画面を出している入口

`bob2/bob-code/package.json` には `bob-code.task.workflow` command が定義されており、表示名は localization 上 `Start Workflow` である。

既存調査メモでも、command 一覧に `bob-code.task.workflow` が `Start Workflow` として整理されている。

```text
bob-code.task.workflow -> Start Workflow
```

また menus では Chat view の title 領域に workflow command が出る構成で、command palette でも workflow の表示制御がある。

重要なのは、menu の `when` 条件に `bob-code.hasWorkflows` が使われていること。つまり Bob extension host 側は workflow の有無を VSCode context key として管理している。

```text
bob-code.hasWorkflows
bob-code.hasRequestsWaiting
bob-code.commitGenerationInProgress
```

## 2. Bob 内部で workflow がどう扱われているか

ZIP 実体を調査した既存メモでは、Bob は `SourceRegistry` 相当の singleton を持ち、そこに次の source を登録する構造と整理されている。

- modes
- tools
- findings
- workflows
- groups
- skills
- mcpHub
- workspaces

同メモでは、registry に `registerWorkflow(sourceId, workflow)` 相当の拡張点があると整理されている。

また task manager 側には `openTask({ useWorkspace, location, workflow, defaultMode, onReady })` が確認されており、workflow は単なる menu item ではなく、task 起動時の入力として渡される。

したがって picker は概ね次の流れで動いていると考えられる。

```text
bob-code.task.workflow
  -> workflow registry / source から利用可能 workflow を取得
  -> QuickPick に workflow items を設定
  -> 選択された workflow を task manager.openTask({ workflow }) に渡す
```

## 3. `ワークフローが見つかりませんでした` が表示される主な理由

### 3.1 workspace に `.bob/workflows/*.md` が無い

このケースが最も可能性が高い。

既存の `bob-bazaar-review` テンプレートは、project root に `.bob` をコピーする構成で、配置例に `.bob/workflows/bazaar-project-rule-review.md` が含まれている。

```text
<project-root>/
  .bob/
    workflows/
      bazaar-project-rule-review.md
```

さらに `bobWorkspaceInit.ts` の `REQUIRED_FILES` でも `.bob/workflows/bazaar-project-rule-review.md` が必須ファイルとして扱われている。

つまり workflow は extension install だけではなく、**開いている workspace の `.bob/workflows` に実体 Markdown が配置されて初めて Bob から見える**、という設計前提で扱うのが妥当。

### 3.2 template は extension にあるが、workspace へコピーされていない

`extensions/bob-bazaar-review/templates/.bob/workflows/bazaar-project-rule-review.md` は repository 内に存在するが、Bob 本体は任意 extension の `templates/.bob` を自動探索するとは限らない。

`bobWorkspaceInit.ts` には template directory を workspace の `.bob` へコピーする処理があるが、このファイルは Bob 本体ではなく companion extension 側の処理である。

したがって、template が repository に存在しても、workspace 直下に `.bob/workflows/*.md` が無ければ picker は空になる。

### 3.3 workflow source / add-on が enable されていない

Bob 2.0.0 では built-in review workflow や Premium Package の workflow が存在するが、これらは feature flag、entitlement、関連 extension install 状態に依存する可能性がある。

既存 ZIP 分析では、review source は `review-flow-enabled` feature flag により enable/disable されると整理されている。

このため、Bob 本体や premium add-on の workflow を期待している場合は、次を疑う。

- Bob へのログイン状態
- add-on entitlement
- 関連 VSCode extension の install 状態
- feature flag
- workspace trust
- Git repository / SCM API の利用可能状態

### 3.4 `bob-code.hasWorkflows` が false または stale

`bob-code.hasWorkflows` は menu 表示条件に使われる context key である。

通常、この値が false なら Chat view title や command palette から workflow command は見えにくくなる。直接 `bob-code.task.workflow` を実行した場合、command handler は起動できても、内部 workflow list が空なら picker に `ワークフローが見つかりませんでした` が出る。

`.bob/workflows` を追加した直後に反映されない場合は、Bob / VSCode の file watcher または source registry 更新が走っていない可能性があるため、Window reload が必要になることがある。

## 4. 任意 workflow の追加方法

### 4.1 最小手順

1. 対象 project root に `.bob/workflows` を作成する。
2. Markdown workflow を 1 ファイル追加する。
3. VSCode でその project root を workspace として開く。
4. Bob Chat view を開く。
5. 必要なら `Developer: Reload Window` を実行する。
6. `Start Workflow` を開き、追加した workflow が出るか確認する。

例:

```text
.my-project/
  .bob/
    workflows/
      design-review.md
```

### 4.2 Markdown workflow 例

```md
# Design Review Workflow

設計変更を、既存仕様・外部I/F・RT/TS境界・テスト観点でレビューするワークフローです。

## Inputs

- `target_files`: 変更対象ファイルまたは設計書
- `change_summary`: 変更概要
- `review_scope`: 確認範囲

## Recommended mode

Use `ask` for investigation-only review. Use a project-specific reviewer mode if `.bob/custom_modes.yaml` defines one.

## Steps

1. 変更概要と対象ファイルを確認する。
2. 外部I/F、共有メモリ、RT thread、TS service に関係する箇所を抽出する。
3. 既存仕様と矛盾する可能性を列挙する。
4. テスト観点を `pass / fail / unknown / not_applicable` で整理する。
5. 不明な点は推測で埋めず、追加で必要な資料を明記する。

## Output

1. Summary
2. Findings
3. Required follow-up evidence
4. Test cases to add or update
```

### 4.3 mode / skill / MCP と一緒に置く場合

workflow が専用 mode、skill、MCP tool に依存する場合は、同じ `.bob` 配下に置く。

```text
<project-root>/
  .bob/
    custom_modes.yaml
    mcp.json
    skills/
      project-review-checklist/
        SKILL.md
    workflows/
      design-review.md
```

既存 template も同じ構成を採用している。

## 5. companion extension から配布する場合

複数 project に同じ workflow を配りたい場合は、Bob 本体を patch するより、companion extension で template を持ち、初期化 command で workspace へコピーするのがよい。

`bobWorkspaceInit.ts` には次の設計がすでにある。

- `REQUIRED_FILES` に `.bob/workflows/...` を含める
- extension 内の `templates/.bob` を workspace の `.bob` へコピーする
- 既存ファイルは上書きしない
- `.bob/mcp.json` は template ではなく command で生成する

この方式なら、Bob 本体の minified 内部 API に依存せず、workflow / mode / skill / MCP config を project 単位で配布できる。

## 6. 実装・運用上の注意

### 6.1 `package.json` に command を足しても workflow は増えない

`bob-code.task.workflow` は workflow picker を開く入口であり、workflow item そのものではない。

workflow を増やすには、workflow registry / source が読み込む実体を増やす必要がある。実用上は `.bob/workflows/*.md` を増やす。

### 6.2 内部 registry 直接登録は避ける

ZIP 分析上は `registerWorkflow` 相当の registry があるが、これは Bob extension bundle 内部の minified 実装であり、VSCode の公開 contribution point ではない。

Premium Package のような IBM 公式 add-on は内部 source 登録を使っている可能性があるが、第三者側で安定利用できる API としては確認できない。

### 6.3 反映されない場合のチェックリスト

- VSCode で開いている root と `.bob` を置いた root が一致しているか。
- `.bob/workflows/*.md` が workspace root 直下にあるか。
- ファイル拡張子が `.md` か。
- workspace trust が許可されているか。
- Bob にログイン済みか。
- `Developer: Reload Window` 後も表示されないか。
- add-on workflow を期待している場合、関連 extension / entitlement / feature flag が有効か。

## 7. 参考にした repository 内ファイル

- `bob2/bob-code/package.json`
  - `bob-code.task.workflow` command と `bob-code.hasWorkflows` 条件を確認。
- `docs/bob-dedicated-extension-foundation-analysis.md`
  - manifest / command / menu / context key の既存分析。
- `docs/bob-code-zip-implementation-analysis.md`
  - source registry、task manager、review workflow、feature flag の既存分析。
- `extensions/bob-bazaar-review/templates/.bob/README.md`
  - `.bob/workflows` を project root に配置する前提の template。
- `extensions/bob-bazaar-review/src/bobWorkspaceInit.ts`
  - `.bob/workflows/bazaar-project-rule-review.md` を required file として扱う workspace 初期化処理。
- `extensions/bob-bazaar-review/templates/.bob/workflows/bazaar-project-rule-review.md`
  - 実際の workflow Markdown 例。
