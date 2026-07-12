# Workflow Builder Skip Resume Readiness Design

- Date: 2026-07-12
- Repository: `katamor1/bob_builtin_analyze`
- Component: `extensions/workflow-register`
- Roadmap item: Recovery UX P1-1
- Base: `main` after PR #77 (`57ff053bc3f476e3e9d268a743f25edeb0d68356`)

## 1. Goal

Workflow Builderだけでfile-bound skip resumeを安全に構成できるようにする。利用者はstep outputを選択し、生成予定の`x-skipResume`とartifact定義を確認してからform modelへ適用する。適用後も通常のBuilder validation / diff / saveを通す。

## 2. Non-goals

- `WORKFLOW.md`をwizard操作だけで即時保存しない。
- 既存artifactを自動変更または上書きしない。
- resultKeyのないagent stepへresultKeyを推測して追加しない。
- runtimeのartifact manifest、hydration、start-from-artifacts契約を変更しない。
- P1-2 task snapshot import preview、P1-3 provenance表示、P1-4 detached held recoveryを同じPRへ含めない。

## 3. Authoring model contract

`WorkflowAuthoringModel`へ次を追加する。

```ts
skipResume?: {
  fileBound: boolean
}
```

Loaderは`x-skipResume.fileBound`をGUI管理fieldとして読み込み、Serializerはopt-in時だけ次を出力する。

```yaml
x-skipResume:
  fileBound: true
```

これによりYAML手編集→Builder→保存のround-tripで設定を失わない。

## 4. Shared plan/apply service

新しいpure moduleをauthoring coreへ追加する。

```ts
planWorkflowSkipResumeReadiness(model, selectedCandidateIds?)
applyWorkflowSkipResumeReadiness(model, selectedCandidateIds?)
formatWorkflowSkipResumeReadinessDiff(plan)
```

### 4.1 Candidate identity

1つのoutput candidateを`stepId`と`resultKey`の組で識別する。対象outputは次のとおり。

- step-level `resultKey`
- manual form `resultKey`
- manual approval `resultKey`

resultKeyを持たないagent stepは自動生成対象にせずwarningとする。result stepは既存file sinkを使うため、自動artifact candidateにはしない。

### 4.2 Generated artifact

既定値はstep typeに応じる。

| Producer | schema | extension |
| --- | --- | --- |
| agent | `text/markdown` | `.md` |
| command / manual | `application/json` | `.json` |

path:

```text
.bob/workflows/runs/{{run.id}}/artifacts/<stepId>/<resultKey>.<ext>
```

artifact IDはresultKey、`producedBy`はstep IDとする。これにより既存strict file-bound validatorと一致する。

### 4.3 Existing artifact handling

- 同じ`id`と`producedBy`でrun-scoped pathを持つartifactは`ready`として保持する。
- 同じIDが別stepに属する場合はconflictとする。
- 同じ`id` / `producedBy`でもrun-scopedでない場合はconflictとし、自動修正しない。
- duplicate IDや複数一致はconflictとする。
- 無関係な既存artifactは順序と値を維持する。

applyはconflict candidate、未知candidate、空選択を明示的に扱い、入力modelを変更しない。成功時だけcloneへ`fileBound: true`と不足artifactを追加する。

## 5. Builder interaction

Artifacts tabへSkip Resume Readiness cardを追加する。

1. output candidateをcheckboxで選択する。
2. `変更をプレビュー`を押す。
3. host側pure serviceがplanとdiffを返す。
4. warnings / conflicts / generated YAML summaryを表示する。
5. conflictがなく、preview後にmodelが変わっていない場合だけ`プレビュー内容を適用`を有効にする。
6. applyはBuilder modelだけを更新する。ファイル保存は既存`保存`操作で行う。

field変更、step変更、artifact変更、template reset後はpreviewを無効化する。

## 6. Preview/apply parity

previewとapplyは同じpure plannerを呼ぶ。apply時はcandidate selectionとmodel fingerprintを再照合する。古いpreview tokenや変更済みmodelに対するapplyは拒否し、再previewを要求する。

fingerprintはserialize済みauthoring modelとselectionのstable hashで構成する。tokenはBuilder session内だけで有効とし、別workflow sessionへ持ち越さない。

## 7. Validation

apply後のmodelを既存serializerでMarkdownへ変換し、既存strict validatorを実行する。planner固有errorが0でもworkflow全体がinvalidならapply resultへdiagnosticsを返し、saveは既存Builder gateで拒否される。

## 8. Tests

- candidate discoveryとdefault selection
- agent / command / manual schemaとpath生成
- existing ready artifactの保持
- artifact ID / path conflictのfail closed
- no input mutation
- preview/apply parityとstale fingerprint rejection
- `x-skipResume` loader/serializer round-trip
- strict validation通過
- Builder HTMLにselection / preview / apply UIが存在
- model変更後にpreviewが無効化されるclient contract
- panel message routingとsession isolation

## 9. Rollout

独立Draft PRとして実装する。Phase 4の正式Linux/Windows gateを基準点とし、focused tests、full suite、policies、package、Ubuntu/Windows、Extension Host、focused reviewがgreenになるまでMerge / ReleaseはNO-GOとする。
