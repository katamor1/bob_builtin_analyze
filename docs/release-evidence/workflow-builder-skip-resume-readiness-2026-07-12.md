# Workflow Builder Skip Resume Readiness Release Evidence

## 1. 判定

| 項目 | 値 |
| --- | --- |
| 実施日 | 2026-07-12 |
| Repository | `katamor1/bob_builtin_analyze` |
| Component | `extensions/workflow-register` |
| Branch | `agent/workflow-builder-skip-resume-readiness-20260712` |
| Pull request | #82 |
| Verified implementation head | `91d8dcd56b8ef5ee336f09c34e5e7ec73f930055` |
| Reviewed feature/evidence head | `4c774f8c5350562e1ed8b008b421c034b76aa5ae` |
| Test-stabilization head | `49ce3001849820238e44c10a2ca33180796094ae` |
| Latest-main merge-result verification head | `2652efbd17a0612d7fffc1190a4e1e6ef0599f1a` |
| Latest main observed for that merge result | `3e7f8b4283df654a76eb682a11b30f05ee4e4afc` |
| Full suite | 789 passed / 0 failed / 0 skipped |
| Implementation matrix | `extensions-quality` run `29201666388`: success |
| Cleanup/evidence matrix | `extensions-quality` run `29202077515`: success |
| Reviewed feature matrix | `extensions-quality` run `29202805399`: success |
| Latest-main merge-result matrix | `extensions-quality` run `29203656774`: success |
| Focused/full evidence | `workflow-builder-skip-resume-tdd` run `29201666390`: success |
| Whole-diff review | Critical 0 / Important 0 |
| Merge gate | **GO** |

`49ce3001849820238e44c10a2ca33180796094ae`はproduction codeを変更しない。`bobGateLifecycle.test.js`から1秒のwall-clock競争を除き、Node test runnerの20秒timeoutで同じreentrant rejectionと後続mutation解放を検証するtest-only stabilizationである。

`2652efbd17a0612d7fffc1190a4e1e6ef0599f1a`に対するPR merge resultは、当時の最新`main`とheadをGitHubが統合して生成した。run `29203656774`で7ジョブすべてがgreenになったため、履歴上mainより遅れていること自体を未検証リスクとして残さない。

この判定更新commit以降はrelease/review evidenceだけのtailであり、runtime、Webview、authoring model、test contractを変更しない。

## 2. Delivered behavior

- `WorkflowAuthoringModel.skipResume.fileBound`を明示的にround-tripする。
- Artifactsタブで再利用候補をstep単位に選択できる。
- artifact ID、`producedBy`、run-scoped path、schemaをpreviewする。
- Before / Afterの完全なWORKFLOW.mdとstrict diagnosticsをapply前に表示する。
- previewとapplyが同じpure plannerとstrict validatorを使用する。
- applyはmodelだけを更新し、既存Preview / Diff / Save経路を維持する。
- 既存artifactを自動削除、rename、上書きしない。
- stale preview responseをrequest IDとsource signatureで拒否する。
- apply後に適用済みmodelからfresh readiness previewを取得する。
- 生成pathに使うstep ID / resultKeyのpath traversal、separator、Windows予約名を拒否する。
- `x-skipResume`内の未知サブフィールドをBuilder round-tripで保持する。

## 3. TDD evidence

### Portable artifact path boundary

Test-only head `5bc65e7af73cc3adcb24f8acc29da7192057c0b8`で、`../collect`、`../report`、`CON`などを拒否する回帰testを追加した。run `29201030733`で旧実装のfailureを記録し、production fix head `a0db6f0aabffd9d11762d49b9417955a5e2d7f0f`のrun `29201164317`でGREENを確認した。

### Forward-compatible extension fields

Test-only head `e55471fc4e1a93671441452f36b1c46f0073d544`で未知`x-skipResume`サブフィールドの消失を再現した。run `29201519821`では789件中1件が意図どおり失敗し、`unknownFrontMatter["x-skipResume"]`が`undefined`であることを観測した。

Loaderはboolean `fileBound`だけを管理値として抽出し、それ以外をnested unknown front matterとして保存する。Serializerは未知fieldと管理値をmergeする。production head `91d8dcd56b8ef5ee336f09c34e5e7ec73f930055`のrun `29201666390`で789/789 GREENを確認した。

## 4. Full quality gates

Implementation headの`extensions-quality` run `29201666388`、cleanup/evidence headのrun `29202077515`、reviewed feature headのrun `29202805399`、latest-main merge-result run `29203656774`はいずれも成功した。

- Linux `workflow-register`: unit、dependency / architecture / source / schema policy、audit、package、VSIX policy、Extension Host smokeが成功。
- Windows `workflow-register`: unit、policy、package、VSIX policy、Extension Host smokeが成功。
- Linux / Windows `bob-code-consistency-review`: 成功。
- Linux / Windows `bob-bazaar-review`: 成功。
- Extension source metrics: 成功。

Latest-main merge resultでも7ジョブすべてが一回の正式matrixで成功した。

Custom full-suite evidenceでは次を記録した。

```text
tests: 789
pass: 789
fail: 0
cancelled: 0
skipped: 0
full_status=0
```

## 5. Review findings closed

1. apply後に通常previewだけ更新されreadiness previewが古いmodelに残る経路を修正した。
2. generated artifact pathへstep ID / resultKeyを直接埋め込む境界にportable segment validationを追加した。
3. `x-skipResume`をmanaged fieldへ移したことで未知サブフィールドが消える前方互換性問題を修正した。
4. unrelatedなBob gate testの1秒wall-clock競争をtest-runner timeoutへ置き換え、production contractを変えずにCIの非決定性を除いた。

Final review result:

```text
Critical: 0
Important: 0
```

## 6. Residual risks and out-of-scope

- task snapshot import preview / selective applyはP1-2。
- reused / skipped表示統一はP1-3。
- detached held run recovery assistantはP1-4。
- resultKeyの自動追加、artifact schema推論、artifact file実生成は対象外。
- BuilderはYAMLコメントと元のfield順序を完全保存しない。
- 実IBM Bob / Bazaar / multi-root UATは製品配布の別ゲート。

## 7. Cleanup

TDD evidence取得用の`.github/workflows/workflow-builder-skip-resume-tdd.yml`はcommit `9e49f58e343162792b33b5e52f9f892acff2f160`で削除した。Documentation finalizerはcommit `c1433e3f69312229a379c14a8aa8c4bc393d21a9`で削除した。

最終PR file listにtemporary `.github/workflows/workflow-builder-skip-resume-*`は残っていない。実装、test、operator document、plan、release evidence、review evidenceだけを配布候補差分として維持する。

## 8. Latest-main merge-result gate

PR branchは長時間の並行開発中に`main`より履歴上遅れたが、GitHubの`pull_request` workflowは現在のbaseとheadから生成したmerge resultをcheckoutする。run `29203656774`は、この統合結果に対して次をすべて確認した。

- PRはmergeable。
- Linux / Windows `workflow-register`のunit、policy、package、VSIX policy、Extension Host smokeが成功。
- companion extensionのLinux / Windows jobとsource metricsが成功。
- temporary diagnostic workflowはPR差分へ再出現していない。

以上によりCode / CI / package gateは**GO**とする。実IBM Bob / Bazaar / multi-root / distribution-signing UATは製品配布の別ゲートとして継続する。
