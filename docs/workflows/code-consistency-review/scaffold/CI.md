# scaffold CI 検証

## 1. 目的

この文書は、整合プレレビュー scaffold の GitHub Actions 検証方針を定義する。

ローカルの `npm run unit` / `npm run smoke` に加えて、PR 上でも最低限の検証を実行し、validator や CLI scaffold の破損に早く気づけるようにする。

## 2. workflow

追加する workflow:

```text
.github/workflows/code-consistency-review-scaffold.yml
```

workflow 名:

```text
code-consistency-review-scaffold
```

## 3. 実行タイミング

以下のパスが変更されたときに実行する。

```text
docs/workflows/code-consistency-review/scaffold/**
docs/workflows/code-consistency-review/schemas/**
docs/workflows/code-consistency-review/templates/**
.github/workflows/code-consistency-review-scaffold.yml
```

対象イベント:

- pull_request
- main への push
- workflow_dispatch

## 4. 実行内容

```text
npm install
npm run typecheck
npm run unit
npm run smoke
```

## 5. 検証対象

### typecheck

TypeScript の型検証を行う。

### unit

Node.js 標準の `node:test` で validator の自動テストを実行する。

対象:

- `review-input-validator.test.ts`
- `bob-output-validator.test.ts`

### smoke

CLI の最低限の実行確認を行う。

対象:

- help 表示
- valid bob-output の検証
- human triage 生成

## 6. 注意

- scaffold はまだ正式な拡張機能配置ではないため、この workflow は scaffold 関連パスに限定して起動する。
- `preprocess` は Git 差分対象ブランチの準備が必要なため、CI の最初の対象からは外す。
- `package-lock.json` は workflow の cache-dependency-path と依存関係固定のために配置する。
- 将来、実装配置へ移行したら workflow の working-directory と対象パスを見直す。

## 7. 後続改善

- `npm ci` へ切り替える。
- preprocess 用の Git fixture を作り、CI でも review-package 生成まで確認する。
- 生成された `.bob-review` 成果物の snapshot test を追加する。
- CI 結果を PR 上の必須チェックにするか検討する。
