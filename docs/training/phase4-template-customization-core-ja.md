# Phase 4 標準テンプレート作成 Training

## 目的

この手順は、7プロジェクト展開前に `process-code-precheck` 標準テンプレートを安全にプロジェクト別workflowへカスタマイズできる人を育成するための教材である。現在のGUI経路は、独立画面ではなく `ワークフロー作成・編集` の `標準テンプレートから作成` モードである。command surfaceはworkflow連携用として維持されるが、operatorはBuilderのPreview / Diff / 明示確認 / backup / transactional saveを使う。

## 対象ロール

| ロール | できる状態 | 主な成果物 |
| --- | --- | --- |
| Operator | 生成済みworkflowをBob / VS Codeから実行し、artifactとhuman gateを確認できる。 | 実行run、review-result、process record |
| Reviewer | `WORKFLOW.md`、diff、readiness reportを読み、保存・UATへ進めるか判断できる。 | readiness判定、差戻しコメント |
| Customizer | project profileとcustomizationを作成し、Builder preview、保存、readiness checkを通せる。 | profile YAML、customization YAML、生成workflow |

## GUI手順

1. Command Paletteから `Bob Workflow: ワークフロー作成・編集` を開く。
2. `標準テンプレートから作成` モードへ切り替える。
3. 標準テンプレートを確認する。
   - metadata: `.bob/template-library/standard/process-code-precheck/metadata.yaml`
   - base workflow: `.bob/template-library/standard/process-code-precheck/WORKFLOW.md`
4. project profileを作る。
   - `schemaVersion: bob-project-profile/v1`
   - `targetLanguage`は `c_cpp`、`csharp`、`java`、`javascript_typescript`、`python` など既存process languageに合わせる。
   - Bazaarの場合は `vcs.noAliases: true` を設定し、手順上も `bzr --no-aliases` を使う。
5. customizationを作る。
   - `schemaVersion: bob-workflow-customization/v1`
   - `baseTemplateHash`は対象base `WORKFLOW.md` のhashと一致させる。
   - 変更対象はtitle、description、既存input default、checklist path、prompt補足、artifact output root、human gate / stepReviewに限定する。
   - guardrails、command provider、result sink typeは変更しない。
6. profile / customizationを検証する。
7. workflow previewを生成する。
   - 出力候補: `.bob/workflows/<workflowName>/WORKFLOW.md`
   - front matterの `x-bob-template` でtemplateId、templateVersion、baseTemplateHash、projectId、customizationPathを追跡する。
8. 標準テンプレートをBuilder modelへ反映する。
9. 通常のPreviewとDiffを確認し、保存を明示承認する。
   - 既存fileと異なる場合はbackupを作成してから置換する。
   - cancel時は既存fileとbackupを変更しない。
10. readiness checkを実行する。
    - 出力先: `.bob/template-readiness/<projectId>/<workflowName>-readiness.json`
    - Markdown reportも同じ場所へ出る。

## Workflow連携用command

次のcommand IDはbundled workflowや自動テストから利用できるよう登録を維持するが、通常のoperator導線は `workflowRegister.openWorkflowBuilder` である。

- `bobTemplate.validateLibrary`
- `bobTemplate.validateProjectProfile`
- `bobTemplate.validateCustomization`
- `bobTemplate.generateWorkflow`
- `bobTemplate.checkReadiness`

## Ready判定

| 判定 | 条件 |
| --- | --- |
| Operator Ready | `ワークフロー作成・編集`で生成済みworkflowを確認し、human gateで承認 / 差戻しを説明できる。 |
| Reviewer Ready | Preview、Diff、backup、readiness reportのfail / warningを読み、required files、guardrails、artifact paths、UAT evidenceの問題を説明できる。 |
| Customizer Ready | profile / customizationを作成し、unsafe pathやforbidden overrideをpreview / readinessでfailにできることを確認してからpassへ修正できる。 |

## 最小演習

1. `alpha-product` 用profileを作り、Bazaar profileでは `vcs.noAliases: true` を設定する。
2. `alpha-code-precheck` customizationでchecklist pathとprompt supplementを変更する。
3. `標準テンプレートから作成`でpreviewを生成し、Builder modelへ反映する。
4. 既存workflowとの差分を確認し、backup付きで `.bob/workflows/alpha-code-precheck/WORKFLOW.md` へ保存する。
5. checklist fileを一度削除してreadiness checkを実行し、`required-files`がfailになることを確認する。
6. checklist fileとUAT evidenceを戻してreadinessをpassにする。
7. 保存をcancelするケースを実行し、既存workflowとbackupが増えないことを確認する。
