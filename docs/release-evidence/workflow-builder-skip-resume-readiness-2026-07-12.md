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
| Documentation trigger head | `deaa33020527371200b6e4f407690ced069ef817` |
| Temporary workflow cleanup head | `c1433e3f69312229a379c14a8aa8c4bc393d21a9` |
| Full suite | 789 passed / 0 failed / 0 skipped |
| Official matrix | `extensions-quality` run `29201666388`: success |
| Focused/full evidence | `workflow-builder-skip-resume-tdd` run `29201666390`: success |
| Whole-diff review | Critical 0 / Important 0 |
| Merge gate | **GO — temporary workflow cleanup complete; final PR checks must remain green** |

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

`extensions-quality` run `29201666388`は同じimplementation headで成功した。

- Linux `workflow-register`: unit、dependency / architecture / source / schema policy、audit、package、VSIX policy、Extension Host smokeが成功。
- Windows `workflow-register`: unit、policy、package、VSIX policy、Extension Host smokeが成功。
- Linux / Windows `bob-code-consistency-review`: 成功。
- Linux / Windows `bob-bazaar-review`: 成功。
- Extension source metrics: 成功。

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
