# Review Run command 引数境界

## 1. 対象境界

レビュー結果取り込みと指摘確認・振り分けは、`bobBazaar.openReviewGui`で開いた単一panel内のstageである。独立GUI commandは公開しない。

引数形は次である。

```ts
interface ReviewRunCommandInput {
  workspaceRoot: string
  campaignId: string
  reviewId: string
}
```

主GUIで未完了Review Runを再開するとき、このidentityを検証してactive contextへ束縛する。

## 2. workspaceRoot検証

Webview messageは改ざんできるため、再開要求の値を内部データとして信頼しない。

Review Run bound modeでartifactを読み書きする前に、`workspaceRoot`が現在openされているいずれかのworkspace folderと同一、またはその配下であることを確認する。

次を拒否する。

- open workspace folderがない状態で渡されたReview Run context
- open workspaceの親directory
- open workspaceと無関係な絶対path
- path traversalでworkspace外へ解決される値

workspace内の合法なdot-prefixed child、たとえば`..project`は親参照ではないため許可する。

## 3. ID再検証

stage遷移境界では`campaignId`と`reviewId`も再検証する。

- path separator
- Windows禁止文字
- Windows予約名
- 制御文字
- 末尾dot/space

を含むIDは、persisted Review Runを読む前に拒否する。

## 4. 適用箇所

レビュー結果取り込みと指摘確認・振り分けは、主controllerが検証・読込み済みのactive Review Runだけを受け取る。

```text
resume message
  -> open workspace boundary validation
  -> campaign/review ID validation
  -> review-run.json load
  -> existing validator / artifact helper
```

GUIに表示する値はHTML escapeし、Webview actionは既存allowlistを維持する。

## 5. テスト

次を自動テストで保証する。

- open workspaceと同一rootを許可する。
- open workspace配下のrootを許可する。
- workspace外rootを拒否する。
- unsafe campaign/review IDを拒否する。
- `..project`のようなdot-prefixed childを許可する。
- 主GUIのresumeと各stageがvalidation helperを経由し、exact Review Run identityを維持する。
