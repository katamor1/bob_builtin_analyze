# Workflow Reproducible Runtime Phase 4 Windows 検証証跡

## 1. Scope

- Date: 2026-07-12
- Repository: `katamor1/bob_builtin_analyze`
- Component: `extensions/workflow-register`
- Pull request: `#77`
- Branch: `agent/workflow-reproducible-runtime-phase4-hardening-20260712`
- Guarded Windows code head: `8ec553afad7f32715da9e315556483eec23a7d4c`
- Final cleanup and evidence head: `2ca175ec79c0b6e1541a7295f6c3e5645a86fb1b`
- Documentation-only follow-up head: `1aeed8994b1c9aa3f4b54e77dd492ab4ec19eec6`

この補遺は、Phase 4 hardeningで残っていたWindows unit-test failureの原因、RED/GREEN、修正、正式matrix、および最終review結果を記録します。

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

## 6. Final official verification

一時probe workflowを削除し、operator補遺とrelease evidenceを含むcleanup済みheadで正式workflowを実行しました。

### `extensions-quality`

```text
run: 29195212541
head: 2ca175ec79c0b6e1541a7295f6c3e5645a86fb1b
result: success
```

7 jobs:

| Job | Result |
| --- | --- |
| Linux `workflow-register` | PASS |
| Linux `bob-code-consistency-review` | PASS |
| Linux `bob-bazaar-review` | PASS |
| Windows `workflow-register` | PASS |
| Windows `bob-code-consistency-review` | PASS |
| Windows `bob-bazaar-review` | PASS |
| Extension source metrics | PASS |

`workflow-register`では、LinuxとWindowsの両方でunit tests、dependency / architecture / source policy、package、VSIX policy、Extension Host smokeまで完走しました。Linuxではschema policy、unused report、production auditも完走しています。

### `code-consistency-review-scaffold`

```text
run: 29195212516
head: 2ca175ec79c0b6e1541a7295f6c3e5645a86fb1b
result: success
```

- Validate VS Code extension: PASS
- Validate scaffold: PASS

`1aeed8994b1c9aa3f4b54e77dd492ab4ec19eec6`までのfollow-upはoperator文書、evidence、READMEだけを変更しており、上記で検証したruntime/test/packaging内容は変更していません。

## 7. Final diff review

cleanup済みheadで次を再確認しました。

- journalとnext eventの`previousRunHash` ancestry
- first / subsequent event sequence boundary
- recovery appendのexact next sequence
- future run save rejection後のread-only diagnostic保持
- `control.json`の独立operator-signal契約
- direct run-directory / alias containment
- heartbeat中のtransient lock read retry
- Windows short / long physical-root identity
- temporary diagnostic workflowがPR差分へ残っていないこと

判定:

```text
Critical: 0
Important: 0
```

残余リスクはPhase 4主証跡に記載したevent retention、external provider side effect、filesystem/device durability、same-user TOCTOUです。今回のhardeningで新しい未解決Critical / Important findingは確認していません。

## 8. Release decision

Phase 4 hardeningの実装、回帰test、Linux / Windows full matrix、policy、package、VSIX、Extension Host、scaffold、およびfinal diff reviewは完了しました。

PR #77について、コード・CI・package gateは**GO**です。PR本文同期、Draft解除、診断PR #78のclose後にmergeできます。

この補遺は、主証跡`workflow-reproducible-runtime-phase4-2026-07-12.md`の旧NO-GO判定を、上記final headとrunに対して更新します。
