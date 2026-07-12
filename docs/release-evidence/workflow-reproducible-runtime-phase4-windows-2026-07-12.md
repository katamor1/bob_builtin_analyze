# Workflow Reproducible Runtime Phase 4 Windows 検証証跡

## 1. Scope

- Date: 2026-07-12
- Repository: `katamor1/bob_builtin_analyze`
- Component: `extensions/workflow-register`
- Pull request: `#77`
- Branch: `agent/workflow-reproducible-runtime-phase4-hardening-20260712`
- Verified code head before this evidence commit: `8ec553afad7f32715da9e315556483eec23a7d4c`

この補遺は、Phase 4 hardeningで残っていたWindows unit-test failureの原因、RED/GREEN、修正、正式matrixの再実行条件を記録します。

## 2. Initial Windows failure

公式`extensions-quality` run `29194017597`では、次がgreenでした。

- Linux `workflow-register`
- Linux `bob-code-consistency-review`
- Linux `bob-bazaar-review`
- Windows `bob-code-consistency-review`
- Windows `bob-bazaar-review`
- Extension source metrics

同runの`Windows / workflow-register`だけがunit testで失敗しました。

短縮診断では18件のfailureがあり、すべて次のroot identity差に収束しました。

```text
expected: C:\Users\RUNNER~1\AppData\Local\Temp\...
actual:   C:\Users\runneradmin\AppData\Local\Temp\...
```

Bob runner、Operation Hub、artifact transaction、migration backup、run recoveryなど複数testに現れていましたが、各機能の状態遷移不良ではなく、fixture期待値のworkspace root representationが共通原因でした。

## 3. Root-cause probe

Windows Server 2025 / Node.js 22でpath canonicalizerを比較したworkflow run:

```text
29194758759
```

結果:

| API | Result |
| --- | --- |
| `path.resolve()` | 8.3 short pathを保持 |
| `fs.realpathSync()` | 8.3 short pathを保持 |
| `fs.realpathSync.native()` | 長いphysical pathへ展開 |
| `fs.promises.realpath()` | 長いphysical pathへ展開 |
| callback `fs.realpath()` | 8.3 short pathを保持 |
| callback `fs.realpath.native()` | 長いphysical pathへ展開 |

runtimeのasync physical-root canonicalizationと同期test fixtureの期待値が異なるAPIを使っていたことがroot causeです。

## 4. Lock acquisition RED/GREEN

別件として、heartbeatが`run.lock.json`をatomic replaceする瞬間にacquirerが`ENOENT`、`ENOTDIR`、またはidentity-change errorを漏らす経路を確認しました。

追加したregression:

```text
lock acquisition retries when the owner file disappears before inspection
```

REDでは、simulated `ENOENT`がstable busy contractへ収束せず、そのままrejectされました。

GREENでは、acquisition timeout内でtransient readをretryし、owner release後にsecond acquirerが取得できることを確認しました。

production change:

- `ENOENT` / `ENOTDIR`をtransient lock readとして扱う。
- `run.lock.json`の読取中identity changeをtransientとして扱う。
- bounded timeoutを超えた場合だけstable busy errorへ収束する。
- malformed schema、containment failure、ownership mismatchはretry対象にしない。

## 5. Windows fixture correction

Windowsでruntimeと同じphysical identityを期待値に使う同期fixtureを、`fs.realpathSync.native()`へ統一しました。

対象は次の領域です。

- Bob gate lifecycle
- shared workflow engine fixtures
- Operation Hub mutations
- artifact manifest rollback
- workflow platform P0 E2E
- workflow run recovery
- migration backup path
- task snapshot artifact import
- workspace file transaction

`fs.realpathSync()`へ変更する仮説はWindows full suiteで棄却されました。Windows probeに基づき`.native()`へ修正し、修正後のfull `workflow-register` suiteをWindows上で通過した場合だけcommitするguarded workflowを使用しました。

検証・commit workflow run:

```text
29194946829
```

結果:

- coordinated head確認: PASS
- fixture変換: PASS
- temporary diagnostic workflow削除: PASS
- `npm ci`: PASS
- Windows full `npm test`: PASS
- commit / push: PASS

作成されたcommit:

```text
8ec553afad7f32715da9e315556483eec23a7d4c
```

## 6. CI recursion handling

上記commitはGitHub Actions tokenからpushされたため、直後のautomatic pull-request runは`action_required`となりjobを生成しませんでした。これはrepository codeのtest failureではなく、GitHub Actionsのrecursive workflow suppressionです。

そのため、GitHub App経由でこのoperator補遺とrelease-evidence補遺をcommitし、最新headで通常の`extensions-quality` matrixを再生成します。

## 7. Current gate

このevidence commit時点では次が完了しています。

- journal ancestry hardening
- future read-only diagnostic preservation
- independent `control.json` operator signal contract
- run-directory alias rejection
- heartbeat lock-read retry
- Windows physical-root fixture correction
- Linux full suite / policy / package / Extension Host smoke
- Windows full `workflow-register` suiteのguarded verification
- Windows CCR / Bazaar matrix verification

残るgate:

1. このevidenceを含む最新headの正式`extensions-quality` 7-job matrix
2. final diff reviewでCritical 0 / Important 0
3. PR本文とrelease decisionの同期
4. temporary diagnostic PR #78のclose

上記が完了するまでPR #77はDraft、Merge / Releaseは**NO-GO**です。
