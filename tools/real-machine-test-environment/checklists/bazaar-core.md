# {{SCENARIO_ID}} 実機チェックリスト

- Scenario root: `{{SCENARIO_ROOT}}`
- Workspace: `{{WORKSPACE_PATH}}`
- Bob root: `{{BOB_ROOT}}`
- VCS root: `{{VCS_ROOT}}`
- Review target: {{REVIEW_TARGET}}
- Launch: `{{LAUNCH_COMMAND}}`

## Test cases
{{TEST_CASES}}

## 操作
1. Bazaar Review GUI を開き、Bob root と Bazaar root が別 root として表示されることを確認する。
2. revision range `1..2` を読み込み、project rules 付き packet を生成する。
3. Bob Workflow UI から `bazaar-project-rule-review` を実行する。
4. valid / invalid review-result の capture と validation を行う。
5. MCP `initialize`、`tools/list`、readonly Bazaar tools、allowed roots を確認する。
6. Shift-JIS fixture が packet で大きく文字化けしないことを確認する。

## Expected artifacts
{{EXPECTED_ARTIFACTS}}

Developer Tools Console に未処理例外がないことを確認し、`operator-result.json` に testcase status、notes、evidence path を記録する。生成直後の status はすべて `not_run` のままにする。
