# Phase 4 標準テンプレート作成 UAT

## 目的

本UATは、独立したテンプレート用画面ではなく、`ワークフロー作成・編集` の `標準テンプレートから作成` モードから、標準テンプレート選択、profile / customization の安全な編集、workflow preview、diff、明示確認、backup付き保存、readiness report確認までを実施できることを確認する。

## Sandbox 準備

1. 対象workspaceに `.bob/template-library/standard/process-code-precheck/metadata.yaml` と `WORKFLOW.md` があることを確認する。
2. `.bob/process/process-catalog.yaml` を配置する。
3. checklistを配置する。
   - 例: `.bob/process/checklists/alpha-code-precheck.yaml`
4. UAT evidenceを配置する。
   - 例: `docs/uat/evidence/alpha-product.md`
5. Bazaar workspaceの場合、UAT手順とprofileの両方で `bzr --no-aliases` を明記する。
6. 既存workflowの置換ケースでは、比較用の `WORKFLOW.md` を事前に保存する。

## 基本操作

1. Command Paletteから `Bob Workflow: ワークフローを作成・編集` を開く。
2. `標準テンプレートから作成` モードへ切り替える。
3. template libraryで `process-code-precheck` を選ぶ。
4. 次を入力する。
   - projectId: `alpha-product`
   - targetLanguage: `c_cpp`
   - vcs.type: `bazaar`
   - checklist path: `.bob/process/checklists/alpha-code-precheck.yaml`
   - workflowName: `alpha-code-precheck`
   - prompt supplement: `Bazaar 操作では bzr --no-aliases を使う。`
5. profileとcustomizationの検証を実行する。
6. workflow previewを実行し、生成予定 `WORKFLOW.md` に `x-bob-template` が含まれることを確認する。
7. 既存workflowがある場合はdiffを開き、置換内容を確認する。
8. 標準テンプレートをBuilder modelへ反映し、通常のPreview / Diff / 保存確認を通して保存する。
9. readiness checkを実行し、JSON / Markdown reportを開く。

## UATケース

| ID | 操作 | 期待結果 |
| --- | --- | --- |
| P4-GUI-UAT-001 | `ワークフロー作成・編集` を開く。 | 新規作成、標準テンプレートから作成、既存workflow編集の3モードを選択できる。 |
| P4-GUI-UAT-002 | `標準テンプレートから作成`へ切り替える。 | tracked standard template `process-code-precheck` を選択できる。 |
| P4-GUI-UAT-003 | Bazaar profileを検証する。 | `vcs.noAliases: true` 前提でprofileがvalidになり、UI文言に `bzr --no-aliases` が残る。 |
| P4-GUI-UAT-004 | unsafe pathを入力してpreviewする。 | diagnosticsにworkspace escapeが表示され、workflowは生成・保存されない。 |
| P4-GUI-UAT-005 | valid inputでpreviewする。 | 生成予定Markdownが既存workflow validatorを通り、`x-bob-template`を持つ。 |
| P4-GUI-UAT-006 | 標準テンプレートをBuilder modelへ反映する。 | 生成内容が同じpanelの通常編集モデルへ移り、直接ファイル保存を迂回しない。 |
| P4-GUI-UAT-007 | 既存workflowとの差分を確認して保存する。 | 明示確認後にbackupが作成され、transactional saveが完了する。cancel時は既存fileもbackupも変更されない。 |
| P4-GUI-UAT-008 | checklistを消してreadinessを実行する。 | `status: fail` と `required-files` のnextActionsが表示される。 |
| P4-GUI-UAT-009 | UAT evidenceを消してreadinessを実行する。 | `status: warning` とUAT evidenceのnextActionsが表示される。 |
| P4-GUI-UAT-010 | checklistとUAT evidenceを戻してreadinessを実行する。 | `status: pass` となり、JSON / Markdown reportが `.bob/template-readiness/alpha-product/` に保存される。 |
| P4-GUI-UAT-011 | panelを閉じて保存済みworkflowを再度編集する。 | 同じ `ワークフロー作成・編集` panelで既存workflow編集モードとして読み込める。 |

## 視覚・操作確認

- 200% zoomでもmode selector、field label、preview、diff、保存結果を識別できる。
- Windows High ContrastまたはVS Code High Contrast themeでbutton、input、diagnostics、statusを識別できる。
- Tab / Shift+Tabだけでmode選択、template選択、入力、preview、diff、保存、readinessへ移動できる。
- 未保存の編集がある状態で外部から別workflowを開いても、現在の編集を黙って破棄しない。
- Developer Tools Consoleにuncaught exception、unhandled rejection、CSP violationがない。

## 合格条件

- 独立したテンプレート用公開commandや別panelを使わず、`workflowRegister.openWorkflowBuilder`から全操作を完了できる。
- 標準テンプレート生成はin-memory Builder modelを経由し、Preview / Diff / 明示確認 / backup / transactional saveを迂回しない。
- cancel時は既存workflowを変更しない。
- profile / customization / workflowはworkspace境界内の所定pathへ保存される。
- readiness UIでstatus、score、checks、nextActionsを追跡できる。
- guardrails、command provider、result sink typeを任意変更するUIが存在しない。
