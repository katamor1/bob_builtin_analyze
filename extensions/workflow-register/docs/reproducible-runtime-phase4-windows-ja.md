# Reproducible Runtime Phase 4 Windows 補遺

## 1. 目的

この文書は、Phase 4 のphysical workspace identityとcross-process leaseをWindowsで検証するときの追加契約を定義します。

対象は、Windowsの8.3 short path、Node.jsのrealpath API差分、heartbeat中のlock file atomic replacementです。Phase 4本体の契約は`reproducible-runtime-phase4-ja.md`を正本とし、この文書はWindows固有の運用・テスト補遺です。

## 2. Physical workspace identity

同一workspaceを次のような異なる文字列表現で参照できる場合があります。

```text
C:\Users\RUNNER~1\AppData\Local\Temp\workflow-register-...
C:\Users\runneradmin\AppData\Local\Temp\workflow-register-...
```

両者が同じdirectoryを指していても、文字列比較だけでは同一identityになりません。runtimeはphysical pathへcanonicalizeしてからcase-insensitive comparisonを行います。

次の契約を維持します。

- workspace containment判定はphysical pathを基準にする。
- 8.3 short path、junction、symlink、aliasを文字列lowercaseだけで同一視しない。
- test fixtureがruntimeのphysical identityを期待値に使う場合は、同期APIでは`fs.realpathSync.native()`を使う。
- 非nativeの`fs.realpathSync()`をWindowsのphysical identity期待値として使わない。
- async runtime pathは`fs.promises.realpath()`または同等のnative canonicalizationを使う。

Windows Server 2025 / Node.js 22のprobeでは、`fs.realpathSync.native()`と`fs.promises.realpath()`が長いphysical pathを返し、`fs.realpathSync()`は8.3 short pathを保持することを確認しました。

## 3. Lock heartbeatとの競合

`run.lock.json`のheartbeatはatomic replacementを行います。別processが同じ瞬間にlockを検査すると、次の一時状態を観測できます。

- old lockを確認した後でfile identityが変わる。
- heartbeat replaceの間に`ENOENT`または`ENOTDIR`を観測する。
- direct-file identity検証が「読取中に変更された」と報告する。

これらはlock acquisition timeout内ではtransient readとして扱います。

```text
read lock
  ├─ valid owner evidence → ownership / stale判定
  ├─ transient identity change / ENOENT / ENOTDIR → bounded retry
  └─ timeout到達 → stable busy error
```

次はtransient扱いにしません。

- unsupported lock schema
- stable malformed recent lock
- workspace containment failure
- run-directory alias / junction
- ownership token mismatch

## 4. Regression coverage

Windows verificationでは、少なくとも次を確認します。

- active owner中にlock fileが一時的に消えてもacquirerが即時I/O errorを漏らさない。
- heartbeat replace中のidentity changeをbounded retryする。
- timeout後は`busy or locked by another process` familyへ収束する。
-同一physical rootのshort/long representationでduplicate executionを許可しない。
- Operation Hub、Bob runner、artifact transaction、migration backupが同じphysical rootを共有する。
- temporary diagnostic workflowを最終diffへ残さない。

## 5. Operator guidance

`busy or locked by another process`を確認した場合は、live ownerを調べる前に`run.lock.json`を削除しないでください。

Windows pathが`RUNNER~1`などのshort representationで表示された場合も、それだけでworkspace escapeとは判断しません。Run Diagnostics、physical root、lock owner token、PID、hostname、heartbeat ageを合わせて確認します。

手動調査用にpathを正規化する場合も、runtimeのcontainment checkを無効化したり、short pathを無条件で許可したりしないでください。
