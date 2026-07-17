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
1. Traceability AI draft prompt を生成する。
2. proposed-only JSON を catalog に反映する。
3. Traceability Prep で accepted / rejected / deprecated を人間が判断する。
4. Gate report を生成し、accepted item から review-input を作る。
5. Preprocess、Bob output capture、validate、triage を順に実行する。
6. HTML / script 風文字列が UI text として escape されることを確認する。

## Expected artifacts
{{EXPECTED_ARTIFACTS}}

Developer Tools Console に未処理例外がないことを確認し、`operator-result.json` に testcase status、notes、evidence path を記録する。生成直後の status はすべて `not_run` のままにする。
