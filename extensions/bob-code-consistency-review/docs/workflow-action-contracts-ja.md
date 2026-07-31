# Code Consistency workflow action contract

`bob-code-consistency-review`が`local.workflow-register`へ登録するaction provider IDのローカル契約です。source ownerは`local.bob-code-consistency-review`です。providerはworkflow連携用であり、Command Paletteの公開入口は`bobCodeConsistency.openReviewWizard`だけです。

## Workspace and review-input

| Provider ID | Contract |
| --- | --- |
| `bobCodeConsistency.initializeWorkspace` | bundled workflowをbackup後に更新し、既存`review-input.yaml`は変更せずbackupだけ作成する。 |
| `bobCodeConsistency.createReviewInput` | 対話入力をbuilder / schema / path validatorへ通して`review-input.yaml`を作成する。 |
| `bobCodeConsistency.prepareAiReviewInputDraft` | AIへ渡すbounded draft promptを作成する。 |
| `bobCodeConsistency.applyAiReviewInputDraft` | AIの`ReviewInputDraft` JSONをhost側で再検証して適用する。 |
| `bobCodeConsistency.repairReviewInput` | 既知の旧enumなどをpreview / backup付きで修復する。 |
| `bobCodeConsistency.explainReviewInputDiagnostics` | review-input診断を説明する。 |

## Traceability

| Provider ID | Contract |
| --- | --- |
| `bobCodeConsistency.prepareAiTraceabilityDraft` | proposed-only候補用promptを作成する。 |
| `bobCodeConsistency.captureAiTraceabilityDraft` | AI draft JSONを検証しworkflow stateへ渡す。 |
| `bobCodeConsistency.applyAiTraceabilityDraft` | proposed-only JSONをsidecar catalogへmergeする。 |
| `bobCodeConsistency.openTraceabilityPrep` | 独立panelを作らず、保持中の`整合プレレビュー`主GUIを`トレーサビリティ整理`stageへrouteする。 |
| `bobCodeConsistency.validateTraceabilityCatalog` | catalog gateを検証してreportを生成する。 |
| `bobCodeConsistency.createReviewInputFromTraceability` | accepted itemから`review-input.yaml`を生成する。 |

## Review execution

| Provider ID | Contract |
| --- | --- |
| `bobCodeConsistency.preprocess` | review-input、VCS差分、文書、コード根拠からreview-packageを生成する。 |
| `bobCodeConsistency.captureBobOutput` | result handoff / clipboard / textからBob output YAMLを取り込み、固定workspaceへ保存する。 |
| `bobCodeConsistency.validateOutput` | Bob outputをschemaとevidence indexで検証する。 |
| `bobCodeConsistency.triage` | immutable source snapshot、人間decision store、projectionを生成する。 |

## Registration boundary

- optionalな`workflow-register`が存在する場合だけproviderを登録する。
- provider inputの`args`、`inputs`、`state`から許可fieldだけを取り出す。
- workflowRoot、workspaceRoot、run ID、pathをhost側で再検証する。
- 登録途中で失敗した場合は、既に登録したproviderを逆順にdisposeする。
- extension停止時に全registrationをdisposeする。
- provider IDと同名のtechnical command IDは互換性のため維持するが、通常operatorには主GUIを案内する。
