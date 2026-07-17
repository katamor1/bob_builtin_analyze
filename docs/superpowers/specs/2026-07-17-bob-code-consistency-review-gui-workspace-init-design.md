# Bob Code Consistency Review GUI Workspace Initialization Design

**Date:** 2026-07-17

**Status:** Approved

**Scope:** `extensions/bob-code-consistency-review` の Consistency Review Wizard に、`.bob` ワークフロー初期化導線を追加する

**Base revision:** `f4f9d3308361333e02ab1af732706b7a9e5fc952`

## 1. Goal

Consistency Review Wizard を開いた利用者が、コード整合プレレビュー用のワークフロー定義をまだ配置していない場合、その画面から `.bob/workflows/code-consistency-review/WORKFLOW.md` を初期化できるようにする。

表示と操作感は `bob-bazaar-review` の Review GUI に合わせる。未初期化時だけ警告カードと初期化ボタンを表示し、成功後は最新状態を再取得してカードを消す。

## 2. Confirmed product decisions

- 初期化ボタンは常設せず、コード整合プレレビュー用ワークフローが未配置の場合だけ表示する。
- 初期化済み判定の正本は `.bob/workflows/code-consistency-review/WORKFLOW.md` の存在とする。
- GUI 専用の書き込み処理は追加せず、既存の `bobCodeConsistency.initializeWorkspace` コマンドを再利用する。
- 既存 initializer が行う workflow 更新時のバックアップ、`review-input.yaml` の保護、placeholder 文書と `.gitignore` の初期化契約を維持する。
- `review-input.yaml` の有無だけでは警告カードを再表示しない。Wizard 自身が review-input 作成導線を持つため、カードは workflow 配置状態に限定する。
- Bazaar 側の実装や共通基盤は変更しない。

## 3. Considered approaches

### A. Code-consistency 固有の状態カードから既存コマンドを実行

Wizard model に初期化状態を加え、未初期化時だけカードを描画する。ボタンは既存コマンドを workspace 指定付きで実行し、完了後に model を再構築する。

**Advantages:** 既存の安全な初期化契約を一元利用でき、Bazaar 側に回帰リスクを持ち込まない。画面状態も実ファイルから再判定できる。

**Disadvantages:** Bazaar と code-consistency の状態カード実装は別々に残る。

### B. Webview にボタンだけ追加

状態 model を持たず、常時または固定条件でコマンドを呼ぶ。

**Advantages:** 変更量が最小になる。

**Disadvantages:** 初期化済み状態へ追随できず、成功後も不要なボタンが残る。選択された表示要件を満たさない。

### C. Bazaar と共通の `.bob` initializer UI 基盤へ再構成

両 extension の状態取得、カード描画、初期化 orchestration を共有 module に移す。

**Advantages:** 長期的な UI 重複を減らせる。

**Disadvantages:** extension 間の責務と package 境界を広げ、今回の小さな導線追加に対して変更範囲が大きい。

**Decision:** Approach A を採用する。

## 4. Initialization status contract

Workspace initializer module に read-only の状態取得関数を追加する。

```ts
interface CodeConsistencyWorkspaceInitializationStatus {
  initialized: boolean
  workflowPath: string
  missing: string[]
}
```

判定規則:

- canonical target は `<workspaceRoot>/.bob/workflows/code-consistency-review/WORKFLOW.md` とする。
- target が通常ファイルとして確認できる場合は `initialized: true` とする。
- target が存在しない、通常ファイルでない、または読み取り時に確認できない場合は `initialized: false` とし、workspace 相対 path を `missing` に含める。
- 状態取得はファイルを作成、更新、修復しない。
- template 内容の一致は表示条件に含めない。既存ファイルの更新は従来どおり Command Palette から明示的に再実行できる。

Workflow relative path は initializer と status 判定で同じ定数を共有し、path の二重定義を避ける。

## 5. Wizard model and UI

`ConsistencyReviewWizardModel` に初期化状態を追加する。

```ts
initialization: {
  initialized: boolean
  workflowPath: string
  missing: string[]
}
```

未初期化の場合、画面上部の VCS / Revision より前へ次のカードを表示する。

- 見出し: `.bob ワークフロー初期化: 未完了`
- 説明: コード整合プレレビュー用ワークフローを workspace に配置する必要があることを示す
- ボタン: `.bob を初期化`
- missing list: `.bob/workflows/code-consistency-review/WORKFLOW.md`

初期化済みの場合はカード自体を HTML に含めない。既存 CSP 方針を維持し、inline `onclick` は追加せず、既存の `data-action` event delegation を使用する。

成功メッセージは再描画後も失われない model-backed status とする。通常の discovery warning と成功通知を区別し、成功時は既存の `.ok` 表示を使用する。

## 6. Command flow and single-flight

新しい Webview action `initializeWorkspace` を許可リストへ追加する。

```text
button click
  -> consistencyWizard.action / initializeWorkspace
  -> host-side single-flight guard
  -> executeCommand(
       "bobCodeConsistency.initializeWorkspace",
       { workspaceRoot }
     )
  -> initialization status and Wizard model reload
  -> rerender without initialization card
  -> show initializer result
```

Host controller は初期化実行中フラグを持つ。最初の action が完了するまで同じ controller からの後続初期化 action はコマンドを再実行せず、「初期化を実行中です」と通知する。Webview 側の一時的な button disable だけを副作用重複防止の根拠にしない。

成功時は command result の `message` と backup path があれば status に表示する。GUI は command の戻り値を初期化済み判定の正本にはせず、必ず filesystem status を再取得する。

## 7. Failure behavior

- command failure: 現在の HTML を維持し、カードを残して Status に error を表示する。
- duplicate click: 2回目以降の command execution を開始しない。
- unexpected command result shape: filesystem status を再取得し、汎用の成功文言を表示する。
- workflow が作成されなかった場合: 再取得後もカードを表示し、初期化未完了として扱う。
- panel disposal: 既存 Webview lifecycle の範囲を変更せず、外部へ追加 state を永続化しない。

初期化中フラグは success、failure の両方で `finally` により解除する。

## 8. Compatibility and scope boundaries

- command ID、設定 key、workflow schema、review-input schema は変更しない。
- 既存 `bobCodeConsistency.initializeWorkspace` の Command Palette 利用を維持する。
- 既存 workflow file の backup/update と review-input non-overwrite 契約を維持する。
- `bob-bazaar-review` と `workflow-register` は変更しない。
- 新しい runtime dependency は追加しない。
- workflow 内容の version/drift 表示、共通 initializer UI、process-wide operation coordinator は本変更に含めない。

## 9. Test strategy

失敗テストを先に追加し、次を固定する。

1. status helper は workflow file missing/present を正しく分類し、状態取得だけでは書き込まない。
2. 未初期化 model は警告カード、missing path、`data-action="initializeWorkspace"` を描画する。
3. 初期化済み model は警告カードと初期化ボタンを描画しない。
4. HTML は inline `onclick` を含まず、既存 CSP/event delegation を維持する。
5. action parser は `initializeWorkspace` を受理し、未知 action を拒否する。
6. controller は `bobCodeConsistency.initializeWorkspace` を `{ workspaceRoot }` 付きで実行する。
7. 成功時は model を再取得し、カードを消して結果を表示する。
8. failure 時は error を表示して再実行可能な状態へ戻る。
9. concurrent duplicate action は initializer command を1回だけ実行する。

検証 command:

```text
npm run compile
node --test test/guiFirstSurfaces.test.js <new focused tests>
npm test
npm run architecture:policy
npm run source:policy
npm run package
npm run package:policy
```

## 10. Known baseline condition

Base revision の全258 testは、この実行環境で並列実行すると257件成功、外部processの1秒または2秒境界に依存する既存 test が1件失敗する状態を2回確認した。各失敗 test は単体再実行で成功した。

今回の変更ではこの unrelated timing flake を修正しない。最終検証では focused test と compile/policy/package gate を必須とし、全suiteの結果は baseline と区別して記録する。

## 11. Acceptance criteria

- workflow 未配置の workspace で Wizard を開くと、初期化カードと `.bob を初期化` ボタンが表示される。
- ボタン1回で既存 initializer command が現在の workspace に対して実行される。
- 連続操作でも initializer command の副作用は同時に1回だけ実行される。
- workflow 作成成功後はカードが消え、作成・更新・backup 結果が Status に表示される。
- 初期化失敗時はカードが残り、利用者が原因を確認して再実行できる。
- 初期化済み workspace ではカードを表示しない。
- 既存 review-input と workflow backup/update 契約に回帰がない。
