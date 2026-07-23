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
3. `review-input.yaml` が `requirements-and-design.docx` と `verification-matrix.xlsx` を参照し、`supplemental-reference.pdf` を参照しないことを確認する。
4. Preprocess 後、`document-index.json` と `document-excerpts.md` に DOCX／XLSX があり、PDF path がないことを確認する。
5. `document-excerpts.md` に `REQ-DOC-001`、`REQ-DOC-002`、`BD-DOC-001`、`TC-DOC-001`、`TC-DOC-002` があることを確認する。
6. XLSX 由来の table evidence と、PDF が参照対象外であることを確認し、`CCR-RT-019` と `CCR-RT-020` を記録する。
7. 実 AI では OK / NG / N/A / question の代表ケースを確認する。
8. Offline smoke では同梱 expected output を capture、validate、triage する。
9. Human triage artifacts と Developer Tools Console を確認する。

## Expected artifacts
{{EXPECTED_ARTIFACTS}}

Developer Tools Console に未処理例外がないことを確認し、`operator-result.json` に testcase status、notes、evidence path を記録する。生成直後の status はすべて `not_run` のままにする。
