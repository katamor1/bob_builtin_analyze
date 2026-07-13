# Automatic Pause P1-5 Latest-Main Reverification

## Scope

PR #75でmainへ統合済みの決定的Automatic Pauseを、Recovery UX P1-1〜P1-4統合後の最新mainで再検証する。Production behaviorの変更は行わない。

## Baseline

- Original pull request: #75
- Original merge commit: `d78dec21db25fb705b407c08676757ba80e147c2`
- P1-4 merge commit: `829be5f9c31056b4e106a2e1ecc2fde8c62e4b25`
- Verification branch: `agent/workflow-automatic-pause-reverification-20260713`

## Contract

- 3種類のlimitは次のstep／AI呼び出し前のsafe checkpointで評価する。
- 実行中AI／command／processを強制停止しない。
- workflow設定とworkspace設定はより厳しい値を採用する。
- invalid timezoneはvalidation errorにする。
- overrideは期限付きで、manual Pauseはoverrideより優先される。
- pause／override provenanceはmetadataのみを保存する。
- standalone／Bob runtime wiringが同じpolicyを使用する。

## Verification state

- Focused Automatic Pause suite: **PASS**
- Full workflow-register suite: **PASS**
- Dependency／architecture／source／schema policies: **PASS**
- Unused report／production audit: **PASS**
- Package／VSIX policy: **PASS**
- Linux／Windows extensions-quality: **PENDING**
- Whole-diff review: **PENDING**

## Merge and release gate

- Repository regression gate: **GO after final Linux／Windows matrix**
- Product release: **NO-GO pending real IBM Bob／Bazaar／multi-root／signing／distribution UAT**

## Review checklist

- [x] No Automatic Pause production behavior changed in this PR.
- [x] All focused tests pass on the exact final head.
- [x] The complete workflow-register suite passes on the exact final head.
- [x] Package and VSIX policy pass.
- [ ] Linux and Windows workflow-register jobs pass through Extension Host smoke.
- [ ] Critical findings: 0 open.
- [ ] Important findings: 0 open.

## Fresh Linux evidence

GitHub Actions run `29224962727` completed the focused Automatic Pause suite, full workflow-register suite, dependency／architecture／source／schema policies, unused report, production audit, package, and VSIX policy before this evidence update was committed.
