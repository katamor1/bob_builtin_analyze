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
1. Review Wizard または Bob Workflow UI から preprocess を実行する。
2. `changed-files.json`、`evidence-index.json`、`bob-input.md` を確認する。
3. 実 AI では OK / NG / N/A / question の代表ケースを確認する。
4. Offline smoke では同梱 expected output を capture、validate、triage する。
5. Human triage artifacts と Developer Tools Console を確認する。

## Expected artifacts
{{EXPECTED_ARTIFACTS}}

Developer Tools Console に未処理例外がないことを確認し、`operator-result.json` に testcase status、notes、evidence path を記録する。生成直後の status はすべて `not_run` のままにする。
