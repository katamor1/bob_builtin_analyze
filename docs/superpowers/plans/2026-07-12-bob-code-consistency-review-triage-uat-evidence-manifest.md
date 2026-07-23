Replaced: `workflowRegister.openOperationHub`, `workflowRegister.openWorkflowBuilder`, `bobBazaar.openReviewGui`, and `bobCodeConsistency.openReviewWizard` are the current operator routes; the legacy Human Triage label below is retained only as historical UAT-evidence context.

# Bob Code Consistency Review Triage UAT Evidence Manifest Plan

- Status: implemented and verified
- Date: 2026-07-12
- Repository: `katamor1/bob_builtin_analyze`
- Extension: `extensions/bob-code-consistency-review`
- Branch: `agent/bob-code-consistency-review-triage-integrity`
- Pull Request: `#74`
- Parent plan: `docs/superpowers/plans/2026-07-12-bob-code-consistency-review-triage-operator-extension-host.md`

## Goal

実IBM Bob UATの実施後に、Human Triage成果物の存在、bytes、SHA-256、tested commitとVSIX build commitの一致を一つのmachine-readable manifestへ固定する。

この自動化はUATのoperator判断を代替しない。manifestの`status: complete`は、必要artifactが存在しcommitが一致することだけを示す。Bob Workflow UI、MCP、visual layout、keyboard操作、Console確認、sign-offの合否はUAT evidence Markdownで別途判定する。

## Deliverables

- `extensions/bob-code-consistency-review/scripts/triage-uat-evidence.js`
- `extensions/bob-code-consistency-review/test/triageUatEvidence.test.js`
- `extensions/bob-code-consistency-review/docs/triage-uat-evidence-manifest-ja.md`

## Manifest contract

```json
{
  "schema_version": "triage-uat-evidence-manifest/v1",
  "generated_at": "2026-07-12T16:00:00.000Z",
  "workspace_name": "sandbox-name",
  "tested_commit_sha": "<40 hex>",
  "vsix_build_commit_sha": "<40 hex>",
  "commit_match": true,
  "status": "complete",
  "missing_required": [],
  "artifacts": [
    {
      "path": ".bob-review/human-triage/triage-source.yaml",
      "bytes": 1234,
      "sha256": "<64 hex>"
    }
  ]
}
```

Rules:

1. Required artifacts are emitted in stable path order.
2. Existing `*.bak-*` files in the triage directory are included as optional evidence.
3. Missing required files produce `status: incomplete` and exit code `2`.
4. A tested/VSIX commit mismatch produces `status: incomplete` and exit code `2`.
5. Invalid input produces exit code `1`.
6. A complete manifest produces exit code `0`.
7. Absolute workspace paths are not written to the manifest.
8. Symlinks and non-regular artifact paths are rejected.
9. No new runtime dependency is added.

## TDD execution

### RED

- [x] `test/triageUatEvidence.test.js`を先に追加した。
- [x] commit `7369d9441dc805810709a6f6ad6bee83643da130`へRED contractを保存した。
- [x] GitHub Actions run `29199321795`の`Validate VS Code extension / Unit tests`が、未実装moduleにより失敗することを確認した。

### GREEN

- [x] required artifactの存在、bytes、SHA-256を収集する実装を追加した。
- [x] backup artifactをstable orderで含めた。
- [x] tested commit / VSIX commitの40文字hex validationと一致判定を追加した。
- [x] absolute workspace pathをmanifestへ出さないようにした。
- [x] incompleteでもmanifestを書き、exit codeでgateできるCLIを追加した。
- [x] commit `2ed604780fca08ec4b0f122d1aa2c213178df9ef`へGREEN implementationを保存した。
- [x] GitHub Actions run `29199403731`でcompile、unit、package、VSIX policyが成功した。
- [x] `extensions-quality` run `29199403748`のUbuntu `bob-code-consistency-review`でunit、package、VSIX policy、Extension Host smokeが成功した。

## Required artifacts

```text
.bob-review/bob-output/bob-output.yaml
.bob-review/human-triage/accepted-findings.md
.bob-review/human-triage/follow-up-actions.md
.bob-review/human-triage/investigation-items.md
.bob-review/human-triage/migration-report.md
.bob-review/human-triage/questions-to-author.md
.bob-review/human-triage/rejected-findings.md
.bob-review/human-triage/triage-decisions.yaml
.bob-review/human-triage/triage-result.yaml
.bob-review/human-triage/triage-source.yaml
```

## Remaining manual gate

- [ ] 実IBM Bob環境でUAT runbookを実行する。
- [ ] manifestをUAT evidence directoryへ生成する。
- [ ] 日付入りUAT evidenceへmanifest pathとSHA-256を記録する。
- [ ] Operator / reviewer / release ownerがsign-offする。

未実施項目は`pass`にせず`pending`として扱う。
