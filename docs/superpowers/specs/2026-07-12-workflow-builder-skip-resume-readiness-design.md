# Workflow Builder Skip Resume Readiness Design

- Date: 2026-07-12
- Repository: `katamor1/bob_builtin_analyze`
- Component: `extensions/workflow-register`
- Roadmap item: `P1-1. Workflow Builder に Skip Resume Readiness セットアップを追加する`

## 1. Goal

Workflow Builder の Artifacts タブから、既存の `workflow-register/v1` workflow を file-bound skip resume 対応へ安全に設定できるようにする。

利用者は次を手編集せずに行える。

- 再利用対象の step output を選ぶ。
- `x-skipResume.fileBound: true` を設定する。
- `resultKey` と同名の artifact 定義を生成する。
- run ごとの保存先、schema、`producedBy` を事前確認する。
- 生成前後の差分を確認してから model へ適用する。

## 2. Existing Contracts

既存 runtime と validator の契約を変更しない。

- opt-in field は `x-skipResume.fileBound: true`。
- reusable output は step の `resultKey`、manual form の `resultKey`、manual approval の `resultKey`。
- artifact `id` は result key と同じ値を使う。
- artifact `producedBy` は output を生成する step id。
- artifact path は `{{run.id}}` または `{{runId}}` を含む。
- strict validation では file-bound warning が error へ昇格する。
- GUI 管理外の front matter は引き続き保持する。

## 3. Considered Approaches

### A. Webview-only generator

Webview script が steps と artifacts を直接走査し、model を更新する。

- 長所: host 変更が少ない。
- 短所: validator と生成ロジックが乖離しやすい。preview と apply の同一性も保証しにくい。
- 判定: 不採用。

### B. Shared host planner with preview/apply messages

純粋な core planner が候補、競合、生成artifact、next modelを計算する。Webview は選択と表示だけを担当し、preview と apply は同じ planner を再実行する。

- 長所: deterministic、testable、preview/apply parity、strict validationとの統合が容易。
- 短所: host message が2種類増える。
- 判定: 採用。

### C. Apply first, then use the existing Builder diff

model を先に変更し、既存 `diff` 操作で確認する。

- 長所: 実装量が小さい。
- 短所: 「生成前にdiff」を満たさず、create modeでは既存diffを利用できない。
- 判定: 不採用。

## 4. Architecture

### 4.1 Authoring model

`WorkflowAuthoringModel` に次を追加する。

```ts
skipResume?: {
  fileBound: boolean
}
```

loader は `x-skipResume` を GUI 管理fieldとして読み、serializer は同じfield名で書き戻す。これにより YAML 手編集と GUI round-trip の両方で設定が消えない。

### 4.2 Pure readiness planner

新規module:

```text
extensions/workflow-register/src/core/authoring/workflowSkipResumeReadiness.ts
```

公開interface:

```ts
export type SkipResumeReadinessCandidateStatus =
  | "ready"
  | "existing"
  | "blocked"

export interface SkipResumeReadinessCandidate {
  stepId: string
  stepTitle: string
  stepType: WorkflowStepType
  resultKey: string
  artifact: WorkflowArtifactDefinition
  status: SkipResumeReadinessCandidateStatus
  selected: boolean
  issues: string[]
}

export interface SkipResumeReadinessPlan {
  candidates: SkipResumeReadinessCandidate[]
  blockingIssues: string[]
  changes: string[]
  selectedStepIds: string[]
  nextModel: WorkflowAuthoringModel
}

export function planSkipResumeReadiness(
  model: WorkflowAuthoringModel,
  selectedStepIds?: readonly string[]
): SkipResumeReadinessPlan
```

Planner は入力modelを変更せず、deep cloneした `nextModel` を返す。

### 4.3 Candidate generation

候補artifactは次の形式とする。

```yaml
id: <resultKey>
producedBy: <stepId>
path: .bob/workflows/runs/{{run.id}}/artifacts/<stepId>/<resultKey>.md
schema: text/markdown
```

候補は command / agent / manual step のoutputごとに1件作る。result step は既存file sinkが正本であり、artifact自動生成対象にはしない。

### 4.4 Existing artifact behavior

既存artifactを無断で上書きしない。

- 同じ `id + producedBy` でrun-scoped pathを持つartifact: `existing` として保持する。
- 同じartifact idを別stepが所有する: blocking conflict。
- 同じstepがresult keyと異なるartifact idを所有する: strict validationを通せないためblocking conflict。
- 同じ `id + producedBy` でもrun-scoped pathでない: blocking conflict。
- 完全に無関係なartifact: そのまま保持する。

### 4.5 Readiness blockers

次はapplyを禁止する。

- agent step に `resultKey` がない。
- result step にfile sinkがない。
- candidateと既存artifactが競合する。
- 選択されたcandidateがblockedである。
- 生成後modelがstrict validationを通らない。

command / manual stepがoutputを持たないこと自体はblockerにしない。

### 4.6 Host messages

`WorkflowBuilderPanel` に次を追加する。

```ts
{ type: "previewSkipResumeReadiness"; model; selectedStepIds?: string[] }
{ type: "applySkipResumeReadiness"; model; selectedStepIds: string[] }
```

Preview response:

```ts
{
  type: "skipResumeReadinessPreviewResult"
  ok: boolean
  candidates
  blockingIssues
  changes
  selectedStepIds
  beforeMarkdown
  afterMarkdown
  diagnostics
}
```

Apply response:

```ts
{
  type: "skipResumeReadinessApplied"
  model: WorkflowAuthoringModel
}
```

preview と apply は同じ `planSkipResumeReadiness()` と strict validation を使う。apply時にも再計算し、staleなWebview previewを信頼しない。

### 4.7 Webview UX

Artifacts タブ上部に `途中再開 readiness` card を追加する。

1. tabを開くとpreview requestを送る。
2. reusable outputをcheckboxで表示する。
3. artifact id、`producedBy`、path、schema、existing/blocked statusを表示する。
4. blocking issueを明示する。
5. before/after Markdownを並べたpreviewを表示する。
6. previewがgreenの場合だけ `この設定を適用` を有効化する。
7. apply後に返されたmodelを通常のBuilder modelとして再描画する。

applyはファイル保存ではない。既存BuilderのPreview / Diagnostics、Diff、Saveの通常経路を引き続き使う。

## 5. Error Handling

- Planner は競合を黙って修正・削除しない。
- Host はmalformed messageを通常のvalidation failureとしてWebviewへ返す。
- Apply時にblockerまたはstrict errorがあればmodelを変更しない。
- Error messageにはstep id、artifact id、競合理由を含める。
- Webviewはpreview source signatureを保持し、steps / artifacts / skipResumeが変わったら古いpreviewを破棄する。

## 6. Testing

### Core planner

- resultKeyからdeterministic artifactを生成する。
- manual form / approval resultKeyを候補化する。
- existing compatible artifactを保持する。
- artifact conflictをblockする。
- agent missing resultKeyをblockする。
- result step missing file sinkをblockする。
- input modelを変更しない。
- repeated applyがidempotentである。
- generated modelがstrict validationを通る。

### Loader / serializer

- `x-skipResume.fileBound` を明示modelへ読み込む。
- serialize後も同fieldを保持する。
- unmanaged extension fieldを失わない。

### Webview / host boundary

- Artifacts tabにreadiness UIとpreview/apply actionが含まれる。
- clientはpreviewがない状態でapplyを有効化しない。
- host message unionがpreview/applyを処理する。
- preview/apply双方がcore plannerを呼ぶ。

## 7. Out of Scope

- Task Snapshot Import preview（P1-2）。
- Reused / Skipped表示統一（P1-3）。
- Detached Held Run recovery assistant（P1-4）。
- artifact schemaの自動推論。
- resultKeyの自動追加。
- 既存artifactの自動削除・rename。
- WORKFLOW.mdの自動保存。

## 8. Release Gate

同一headで次を要求する。

```text
npm run compile
node --test \
  test/workflowSkipResumeReadiness.test.js \
  test/workflowAuthoringLoader.test.js \
  test/workflowAuthoringSerializer.test.js \
  test/workflowBuilderWebviewModules.test.js
npm test
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run schema:policy
npm run unused:report
npm run audit:prod
npm run package
npm run package:policy
```

Ubuntu / Windows matrix、VSIX policy、Extension Host smoke、whole-diff review Critical 0 / Important 0がmerge条件である。
