# Phase 4 標準テンプレート作成 GUI Training

## 目的

この教材は、独立したTemplate Studioではなく、`ワークフロー作成・編集`の`標準テンプレートから作成`モードで`process-code-precheck`を安全にproject別workflowへ変換する手順を定義する。

## 開始

1. VS Code / Bob extension hostで対象workspaceを開く。
2. Command Paletteから`Bob Workflow: ワークフローを作成・編集`を実行する。
3. `標準テンプレートから作成`モードへ切り替える。
4. template libraryで`process-code-precheck`を選択する。

## 入力

編集できる項目は次に限定する。

- projectId、displayName、targetLanguage、vcs.type、vcs.root
- checklist path
- artifact output root
- UAT evidence path
- workflowName、title、description
- 既存input default
- prompt supplement
- human gate / stepReview pauseAfter

Bazaar / bzr profileは`vcs.noAliases: true`を持ち、手順上も`bzr --no-aliases`を使う。guardrails、command provider、result sink typeを任意変更するUIは提供しない。

## 操作順

1. profile / customizationを検証し、unsupported language / VCS、unsafe path、hash不整合がないことを確認する。
2. workflow previewを作成し、生成予定`WORKFLOW.md`とDiagnosticsを確認する。
3. 既存workflowがある場合はDiffを開く。
4. 生成結果を同じpanelの通常Builder modelへ反映する。
5. Preview / Diagnostics / Diffを再確認し、保存を明示承認する。
6. 既存fileが異なる場合は一意なbackupが作成され、transactional save後にcatalogがreloadされることを確認する。
7. cancel時は既存fileとbackup setが変化しないことを確認する。
8. readiness checkを実行し、status、score、checks、nextActionsとJSON / Markdown reportを確認する。

## Ready判定

| ロール | Ready条件 |
| --- | --- |
| Operator Ready | Builderで生成済みworkflowを確認し、human gateの承認 / 差戻しとrun確認を説明できる。 |
| Reviewer Ready | Preview、Diff、backup、readinessのfail / warningを読み、UATへ進めるか判断できる。 |
| Customizer Ready | profile / customizationを作成し、unsafe inputをfailさせてからvalidなworkflowをbackup付きで保存できる。 |

## 注意

- template、validation、generation、readinessの内部Command IDはworkflow連携用に維持するが、通常のCommand Palette入口ではない。
- browser側入力を正本にせず、host側validator、current file expectation、transaction lockを最終境界にする。
- stale generation、別session completion、workspace外path、symlink / junction escapeを拒否する。
