# Detached Held Run Recovery

## 目的

VS CodeやIBM Bobの再起動後、`run.json`は`held`のままでも、元のBob taskまたはmanual-step handleが失われることがあります。

この機能は、永続化されたrunを自動的に完了扱いせず、現在の証拠を分類して、Operation Hubに安全なprimary actionを1つだけ表示します。`run.json`が実行状態の正本です。

## 分類

| 分類 | 条件 | primary action |
| --- | --- | --- |
| Connected | live Bob taskまたはactive manual-step handleがある | 手動ステップを開く |
| Detached / resumable | definition、step順序、必要state、manual form／approval結果が互換で、live handleがない | 保存済み状態から再開 |
| Detached / artifact recoverable | 直接再開はblockedだが、互換artifact manifestまたは互換task snapshotがある | 成果物を確認／Task Snapshotを確認 |
| Blocked | 定義不一致、step欠落、必要state不足などがあり、互換復旧証拠もない | 診断を開く |

通常の`resumeRun`は、live gateが存在する従来のBob-visible owner stepではsingle-step resumeを維持します。live gateもmanual handleもない真のdetached held runだけは、通常resumeで黙って完了せず、専用復旧コマンドへ誘導します。

## Operation Hub

held runのカードには分類、説明、最大5件のblockerを表示します。primary actionは分類ごとに1つだけです。

- Connected: `手動ステップを開く`
- Detached / resumable: `保存済み状態から再開`
- Artifact recoverable: `成果物から開始`または`Task Snapshotから成果物を取り込む`
- Blocked: `詳細`／診断

専用復旧はOperation Hubのrun mutation queueへ入り、workspace root、run ID、表示時revisionを再検証します。同じrunへの異なるmutationは直列化されます。

## 保存済み状態から再開

`workflowRegister.recoverDetachedHeldRun`は次の順序を守ります。

1. workspace trustを確認する。
2. 対象runとworkflowを読み直す。
3. current revisionと実行中runの有無を確認する。
4. 副作用なしで分類し、metadata-only previewを表示する。
5. modal confirmationを要求する。
6. review／mutation gateへ入る。
7. runを再読込し、分類を再計算する。
8. engine execution lease内でheld stepをsingle-step完了する。
9. 成功したrunに最小provenanceを保存する。

previewにはrun ID、workflow ID、held step、next step、state key名だけを表示します。state値、form値、snapshot本文、artifact本文は表示しません。

## 再開可能性の判定

直接再開には次が必要です。

- workflow definitionが読み込める。
- runのdefinition hashと現在のdefinitionが互換である。
- current held stepがrunとworkflowの両方に存在する。
- current stepまでのstep ID／順序が一致する。
- current stepとnext stepが要求するstate keyが存在する。
- manual formを使う場合、persisted result objectに必須fieldが存在する。
- manual approvalを使う場合、persisted decisionが`approved`または`rejected`である。

artifact manifestは現在のworkflow／inputsに対する既存validatorがerrorを返さない場合だけ証拠として採用します。task snapshotはrunのcurrent step、workflow ID、存在する場合はworkflow definition hashが一致する場合だけ採用します。

## Provenance

成功時は`run.state["workflow.heldRecovery"]`へ次のmetadataだけを保存します。

```json
{
  "schemaVersion": "workflow-register/held-recovery/v1",
  "kind": "saved-state",
  "runId": "...",
  "stepId": "...",
  "nextStepId": "...",
  "recoveredAt": "...",
  "source": "operation-hub"
}
```

Run Diagnosticsと共通provenance projectorはこのmetadataを表示します。control character、schema不一致、run ID不一致などの不正recordは無視します。

## 失敗時

次の場合はheld stepを完了しません。

- preview後にrun revisionが変わった。
- 再分類結果が変わった。
- runが別処理で実行中になった。
- definition、step順序、必要state、manual resultが不適合になった。
- execution leaseまたはdurable saveに失敗した。

復旧経路がartifactまたはsnapshotへ変わった場合は、Operation Hubをrefreshして新しいprimary actionを使用します。

## 検証基準

- classifier、Operation Hub、dedicated command、diagnostics、engine guardのfocused suite。
- complete `workflow-register` test suite。
- dependency、architecture、source、schema policy。
- package、VSIX policy、Extension Host smoke。
- Ubuntu／Windowsの通常`extensions-quality` matrix。
- `workflow-contracts`。

一時的なmutation／diagnostic workflowは最終差分へ残しません。

## 製品リリースUAT

コード／CIとは別に、製品配布前に次を実機確認します。

- IBM Bobでconnected heldの既存manual-step flowが維持されること。
- VS Code再起動後のdetached-resumable分類とconfirmation。
- artifact／snapshot recoveryへの安全な切替。
- 同一run IDを含むmulti-rootでworkspaceが混同されないこと。
- Run Diagnosticsに本文やstate値が漏れないこと。
