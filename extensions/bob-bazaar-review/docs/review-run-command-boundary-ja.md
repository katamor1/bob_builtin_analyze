# Review Run command 引数境界

## 1. 対象 command

次の既存 command は、Review Runから開く場合に任意のcommand引数を受け取る。

```text
bobBazaar.openResultCaptureGui
bobBazaar.openHumanTriageGui
```

引数形は次である。

```ts
interface ReviewRunCommandInput {
  workspaceRoot: string
  campaignId: string
  reviewId: string
}
```

引数なしのstandalone動作は維持する。

## 2. workspaceRoot検証

VS Code commandは別の拡張機能からも呼び出せるため、command引数を内部データとして信頼しない。

Review Run bound modeでartifactを読み書きする前に、`workspaceRoot`が現在openされているいずれかのworkspace folderと同一、またはその配下であることを確認する。

次を拒否する。

- open workspace folderがない状態で渡されたReview Run context
- open workspaceの親directory
- open workspaceと無関係な絶対path
- path traversalでworkspace外へ解決される値

workspace内の合法なdot-prefixed child、たとえば`..project`は親参照ではないため許可する。

## 3. ID再検証

command boundaryでは`campaignId`と`reviewId`も再検証する。

- path separator
- Windows禁止文字
- Windows予約名
- 制御文字
- 末尾dot/space

を含むIDは、persisted Review Runを読む前に拒否する。

## 4. 適用箇所

Result CaptureとHuman Triageは、受け取った引数をそのまま`loadReviewRun`へ渡さない。

```text
command input
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
- Result CaptureとHuman Triageがvalidation helperを経由する。
