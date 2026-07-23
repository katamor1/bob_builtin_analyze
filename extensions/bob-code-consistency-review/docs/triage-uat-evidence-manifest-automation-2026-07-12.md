Replaced: `workflowRegister.openOperationHub`, `workflowRegister.openWorkflowBuilder`, `bobBazaar.openReviewGui`, and `bobCodeConsistency.openReviewWizard` are the current operator routes; the legacy Human Triage terminology below is retained only as historical UAT automation evidence.

# Human Triage UAT Evidence Manifest Automation 証跡

- 対象: `extensions/bob-code-consistency-review`
- Branch: `agent/bob-code-consistency-review-triage-integrity`
- Pull Request: `#74`
- 記録日: 2026-07-12
- 状態: implementation verified / IBM Bob UAT execution pending

## 1. 目的

実IBM Bob UAT後に必要となるHuman Triage artifact inventoryを、手作業のhash転記だけに依存せず、同一contractで収集する。

自動化対象:

- 必須artifactの存在
- artifact bytes
- artifact SHA-256
- triage backup inventory
- tested commit SHA
- VSIX build commit SHA
- commit一致
- missing artifact一覧

自動化対象外:

- Bob agentのreview品質
- workflow result handoffの意味的正しさ
- MCPのoperator判断
- Webviewの視覚・keyboard評価
- Developer Tools Consoleのdisposition
- operator / reviewer / release owner sign-off

## 2. TDD evidence

### RED

- Test commit: `7369d9441dc805810709a6f6ad6bee83643da130`
- Test file: `test/triageUatEvidence.test.js`
- GitHub Actions run: `29199321795`
- Job: `Validate VS Code extension`
- Result: unit test failure
- Reason: contractが参照する`../scripts/triage-uat-evidence`が未実装

### GREEN

- Implementation commit: `2ed604780fca08ec4b0f122d1aa2c213178df9ef`
- Implementation file: `scripts/triage-uat-evidence.js`
- GitHub Actions run: `29199403731`
- Result:
  - compile: success
  - unit tests: success
  - package: success
  - VSIX policy: success
  - scaffold tests: success

追加のrepository workflow:

- `extensions-quality` run `29199403748`
- Ubuntu `bob-code-consistency-review`:
  - unit tests: success
  - package: success
  - VSIX policy: success
  - Extension Host smoke: success

Windows jobは最終文書commitに対するPR checksを正本とする。

## 3. Contract coverage

`test/triageUatEvidence.test.js`は次を確認する。

1. 必須artifactをstable orderで出力する。
2. bytesとSHA-256が実fileに一致する。
3. backup artifactを含める。
4. absolute workspace pathをmanifestへ出さない。
5. missing artifactを`missing_required`へ記録する。
6. tested / VSIX commit不一致を`commit_match: false`にする。
7. 不完全な状態を`status: incomplete`にする。
8. UTF-8 JSONを末尾改行付きで書く。
9. malformed commit SHAを拒否する。

## 4. Manifest boundary

`status: complete`は次だけを意味する。

- required artifactが存在する
- tested commitとVSIX build commitが一致する

この値をUAT全体のpassとして扱ってはならない。UAT evidence templateのtestcase結果、Console確認、defect disposition、sign-offを別に満たす必要がある。

## 5. Privacy / integrity

- manifestへabsolute workspace pathを保存しない。
- workspace basenameだけを`workspace_name`へ保存する。
- symbolic linkとnon-regular artifactを拒否する。
- artifact変更後はmanifestを再生成する。
- manifest自身のSHA-256をUAT evidenceへ記録する。

## 6. 関連成果物

- `scripts/triage-uat-evidence.js`
- `test/triageUatEvidence.test.js`
- `docs/triage-uat-evidence-manifest-ja.md`
- `docs/triage-integrity-ibm-bob-uat-runbook-ja.md`
- `docs/triage-integrity-ibm-bob-uat-evidence-template.md`
- `../../../docs/superpowers/plans/2026-07-12-bob-code-consistency-review-triage-uat-evidence-manifest.md`

## 7. 残件

- [ ] 実IBM Bob環境でUATを実行する。
- [ ] UAT sandboxからmanifestを生成する。
- [ ] manifest pathとSHA-256を日付入りUAT evidenceへ記録する。
- [ ] 全必須testcaseを判定する。
- [ ] Operator / reviewer / release ownerがsign-offする。

実環境の結果が無いため、現時点のrelease判定は`pending`のままとする。
