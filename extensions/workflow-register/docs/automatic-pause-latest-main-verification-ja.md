# Automatic Pause 最新main再検証

## 目的

Recovery UX P1-1〜P1-4を統合した最新`main`上で、既存のAutomatic Pause実装が回帰していないことを再確認する。

Automatic Pauseのproduction実装はPR #75で統合済みであり、このフェーズでは動作仕様を追加・変更しない。

## 再検証対象

- `maxRunMinutes`
- `maxAgentStepsPerRun`
- `pauseAtLocalTime`
- IANA timezone validation
- workflow設定とworkspace設定の厳しい方を採用する優先順位
- safe checkpointだけでpauseすること
- 実行中AI／commandを強制停止しないこと
- 15／30／60分の期限付きoverride
- manual Pauseがoverrideより優先されること
- pause reason、limit、observed value、overrideのdiagnostics
- standalone engineとBob adapterのruntime wiring

## Repository verification

次のfocused testを実行する。

```text
workflowAutomaticPauseDefinition.test.js
workflowAutomaticPauseSettings.test.js
workflowAutomaticPauseEvaluator.test.js
workflowAutomaticPauseEngine.test.js
workflowAutomaticPauseDiagnostics.test.js
workflowAutomaticPauseRuntimeWiring.test.js
workflowAutomaticPauseContractHardening.test.js
workflowAutomaticPauseOverride.test.js
workflowRunLockHeartbeatContention.test.js
```

続けてfull suite、dependency／architecture／source／schema policy、unused report、production audit、package、VSIX policy、Linux／Windows Extension Host smokeを実行する。

## 判定

Repository gateは、同じ最終headでfocused verificationと通常の`extensions-quality`が成功し、whole-diff reviewでCritical 0／Important 0になった場合にGOとする。

実IBM Bob、実Bazaar、multi-root、署名済みVSIX配布は外部UATであり、repository gateがGOでもproduct releaseはNO-GOのまま維持する。
