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
1. `main..feature/multi-language-git-review` を対象に preprocess を実行する。
2. `changed-files.json` に TypeScript、Python、Java が含まれることを確認する。
3. `evidence-index.json` と `code-slices/*.md` に `SRC-*` evidence があることを確認する。
4. `bob-input.md` に汎用コード変更根拠が含まれることを確認する。

## Expected artifacts
{{EXPECTED_ARTIFACTS}}

Developer Tools Console に未処理例外がないことを確認し、`operator-result.json` に testcase status、notes、evidence path を記録する。生成直後の status はすべて `not_run` のままにする。
