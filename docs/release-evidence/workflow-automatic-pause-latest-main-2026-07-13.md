# Automatic Pause P1-5 Latest-Main Reverification

## Scope

PR #75でmainへ統合済みの決定的Automatic Pauseを、Recovery UX P1-1〜P1-4統合後の最新mainで再検証する。Production behaviorの変更は行わない。

## Baseline

- Original pull request: #75
- Original merge commit: `d78dec21db25fb705b407c08676757ba80e147c2`
- P1-4 merge commit: `829be5f9c31056b4e106a2e1ecc2fde8c62e4b25`
- Verification branch: `agent/workflow-automatic-pause-reverification-20260713`
- Final verified head before this evidence-only commit: `6c5c77b8a2618e2187bee29a428ba683a4185279`

## Contract

- 3種類のlimitは次のstep／AI呼び出し前のsafe checkpointで評価する。
- 実行中AI／command／processを強制停止しない。
- workflow設定とworkspace設定はより厳しい値を採用する。
- invalid timezoneはvalidation errorにする。
- overrideは期限付きで、manual Pauseはoverrideより優先される。
- pause／override provenanceはmetadataのみを保存する。
- standalone／Bob runtime wiringが同じpolicyを使用する。

## Verification state

- Focused Automatic Pause suite: **PASS** — run `29224962727`
- Full workflow-register suite: **PASS** — run `29224962727`
- Dependency／architecture／source／schema policies: **PASS** — run `29224962727`
- Unused report／production audit: **PASS** — run `29224962727`
- Package／VSIX policy: **PASS** — run `29224962727`
- Linux／Windows extensions-quality: **PASS** — run `29225166378`
- Whole-diff review: **PASS — Critical 0 / Important 0 / Minor 0**

`extensions-quality` run `29225166378` completed all Linux and Windows jobs successfully, including workflow-register unit tests, package, VSIX policy, and Extension Host smoke.

## Merge and release gate

- Repository regression gate: **GO**
- Main merge: **GO**
- Product release: **NO-GO pending real IBM Bob／Bazaar／multi-root／signing／distribution UAT**

## Review checklist

- [x] No Automatic Pause production behavior changed in this PR.
- [x] All focused tests pass on the exact verified head.
- [x] The complete workflow-register suite passes on the exact verified head.
- [x] Package and VSIX policy pass.
- [x] Linux and Windows workflow-register jobs pass through Extension Host smoke.
- [x] Critical findings: 0 open.
- [x] Important findings: 0 open.

## Fresh Linux evidence

GitHub Actions run `29224962727` completed the focused Automatic Pause suite, full workflow-register suite, dependency／architecture／source／schema policies, unused report, production audit, package, and VSIX policy before its evidence update was committed.

## Final matrix evidence

GitHub Actions run `29225166378` completed the normal repository matrix on the connector-authored documentation head. Every Linux and Windows extension job succeeded; no temporary workflow remains in the deliverable diff.
