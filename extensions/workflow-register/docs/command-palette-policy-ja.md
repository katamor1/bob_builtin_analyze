# Command Palette 表示名ポリシー

3拡張の常時表示Command Palette entryは次の5件に固定します。表示名はVS Codeの`category: title`としてbyte-for-byteで管理します。

| 拡張 | category | title | 完成表示名 | Command ID |
| --- | --- | --- | --- | --- |
| workflow-register | `Bob` | `操作ハブを開く` | `Bob: 操作ハブを開く` | `workflowRegister.openOperationHub` |
| workflow-register | `Bob Workflow` | `ワークフローを作成・編集` | `Bob Workflow: ワークフローを作成・編集` | `workflowRegister.openWorkflowBuilder` |
| bob-bazaar-review | `Bob Bazaar Review` | `レビューを開始` | `Bob Bazaar Review: レビューを開始` | `bobBazaar.openReviewGui` |
| bob-bazaar-review | `Bob Bazaar Review` | `資料からプロジェクト規約を作成` | `Bob Bazaar Review: 資料からプロジェクト規約を作成` | `bobBazaar.authorProjectRulesFromDocuments` |
| bob-code-consistency-review | `Bob Code Consistency Review` | `整合プレレビューを開始` | `Bob Code Consistency Review: 整合プレレビューを開始` | `bobCodeConsistency.openReviewWizard` |

workflow、validation、record、run operation、retention、template、AI補助用commandはregistrationとactivationを維持できますが、`menus.commandPalette`では`when: "false"`にします。README、UAT、training、release checklistは公開5件以外を通常operator向けCommand Palette導線として案内しません。
