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
1. `review-input-missing-required.yaml` を editor で開き diagnostics を実行する。
2. `review-input-path-escape.yaml` を一時的に active input path へコピーし、workspace 外 path が拒否されることを確認して元の input を復元する。
3. `bob-output-schema-error.yaml` を capture / validate し、schema error を確認する。
4. `bob-output-unknown-evidence.yaml` を validate し、unknown evidence ID を確認する。
5. `traceability-draft-invalid-status.json` を適用し、proposed-only contract rejection を確認する。
6. Invalid fixture が正式 artifact path に残っていないことを確認する。

## Expected artifacts
{{EXPECTED_ARTIFACTS}}

Developer Tools Console に未処理例外がないことを確認し、`operator-result.json` に testcase status、notes、evidence path を記録する。生成直後の status はすべて `not_run` のままにする。
