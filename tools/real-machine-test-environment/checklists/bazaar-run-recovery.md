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
1. Review GUI の未完了 run 一覧を開く。
2. `resume-result-capture` が結果取り込みへ再開することを確認する。
3. `resume-human-triage` が人による判定へ再開することを確認する。
4. `resume-finalize` が finalize へ再開することを確認する。
5. `malformed-run-hidden` が通常一覧に表示されないことを確認する。
6. `test-data/invalid` の schema error と review ID mismatch を capture / validate し、正式 result directory に保存されないことを確認する。
7. Decision ごとの必須値と metrics 補正 validation を確認する。

## Expected artifacts
{{EXPECTED_ARTIFACTS}}

Developer Tools Console に未処理例外がないことを確認し、`operator-result.json` に testcase status、notes、evidence path を記録する。生成直後の status はすべて `not_run` のままにする。
