import fs from "node:fs"

function appendSection(filePath, marker, section) {
  const source = fs.readFileSync(filePath, "utf8")
  if (source.includes(marker)) return
  const separator = source.endsWith("\n") ? "\n" : "\n\n"
  fs.writeFileSync(filePath, `${source}${separator}${section.trim()}\n`, "utf8")
}

const commonContract = `
<!-- REMEDIATION-2026-07-11 -->
## 2026-07-11 横断修正契約

3拡張の横断レビューに基づき、次をリリース契約とする。

- IBM Bob と companion extension は、機能上必須でない場合は soft dependency とし、未導入でも通常 command を起動できること。
- workflow action provider は所有元 source ID を持ち、同一 ID の無警告上書きを禁止する。登録解除用 disposable を返し、extension 停止時に解除する。
- Git / Bazaar 外部プロセスは shell を使わず、hard timeout、出力上限、AbortSignal、子プロセス終了を必須とする。
- Bazaar repository path は POSIX / Windows の絶対 path、drive-relative path、UNC、device path、dot / traversal / control-character segment を拒否する。
- review processing limit は manifest と runtime で同じ最小・既定・最大値を持つ。UTF-8 切り詰め後の suffix を含めても byte 上限を超えないこと。
- repository 内の全 WORKFLOW.md を strict validation し、provider、preflight、nested command ID、template mirror の契約ずれを CI で拒否する。
- Ubuntu と Windows の両方で compile、unit test、VSIX package、package policy を確認する。IBM Bob 実環境の UI / task / MCP は release candidate 実機ゲートで確認する。
`

const unitContract = `
<!-- REMEDIATION-2026-07-11 -->
## 2026-07-11 追加単体テスト契約

| ID | 観点 | 期待結果 |
| --- | --- | --- |
| EXT-UT-REM-001 | soft dependency | companion extension 不在でも通常 command が利用でき、後から有効化すると provider 登録が回復する。 |
| EXT-UT-REM-002 | provider ownership | 同一 ID の別所有元登録を拒否し、disposable 後は再登録できる。古い disposable は新登録を削除しない。 |
| EXT-UT-REM-003 | external process | timeout、cancel、buffer exceed、非許可 exit code を分類し、子プロセスを終了する。 |
| EXT-UT-REM-004 | Windows path | drive、UNC、device、drive-relative、dot、traversal、control-character path を拒否する。 |
| EXT-UT-REM-005 | processing limits | manifest/runtime の範囲が一致し、極端値を clamp し、UTF-8 byte 上限を守る。 |
| EXT-UT-REM-006 | workflow contracts | 全 workflow を動的探索し、未知 provider / command、strict warning、mirror drift を検出する。 |
`

const realMachineContract = `
<!-- REMEDIATION-2026-07-11 -->
## 2026-07-11 追加リリースゲート

1. Windows と Ubuntu の CI が成功していること。
2. timeout / cancel 後に Git / Bazaar 子プロセスが残留しないこと。
3. companion extension を無効化した状態で通常 command が起動し、再有効化後に provider が回復すること。
4. multi-root workspace で Bob root と VCS root が混同されないこと。
5. IBM Bob 実環境で workflow source、step review、result handoff、MCP、Webview の代表 smoke を実施し、結果を release evidence に保存すること。
6. workflow-contracts CI が repository 内の全対象 WORKFLOW.md を検証し成功していること。
`

const readmeContract = `
<!-- REMEDIATION-2026-07-11 -->
## Integration and process safety

- Companion extensions are optional unless the command explicitly needs them; provider registration retries after delayed activation.
- Workflow providers are owner-scoped, reject duplicate IDs, and are disposed with the extension lifecycle.
- Git and Bazaar subprocesses have bounded output, hard timeouts, cancellation, and process-tree termination.
- Release validation runs on both Ubuntu and Windows, while IBM Bob UI/MCP checks remain a release-candidate real-machine gate.
`

for (const filePath of [
  "extensions/workflow-register/docs/basic-design-ja.md",
  "extensions/workflow-register/docs/detailed-design-ja.md",
  "extensions/bob-bazaar-review/docs/basic-design-ja.md",
  "extensions/bob-bazaar-review/docs/detailed-design-ja.md",
  "extensions/bob-code-consistency-review/docs/basic-design-ja.md",
  "extensions/bob-code-consistency-review/docs/detailed-design-ja.md"
]) appendSection(filePath, "<!-- REMEDIATION-2026-07-11 -->", commonContract)

for (const filePath of [
  "extensions/workflow-register/docs/unit-test-spec-ja.md",
  "extensions/bob-bazaar-review/docs/unit-test-spec-ja.md",
  "extensions/bob-code-consistency-review/docs/unit-test-spec-ja.md"
]) appendSection(filePath, "<!-- REMEDIATION-2026-07-11 -->", unitContract)

for (const filePath of [
  "extensions/workflow-register/docs/real-machine-test-spec-ja.md",
  "extensions/bob-bazaar-review/docs/real-machine-test-spec-ja.md",
  "extensions/bob-code-consistency-review/docs/real-machine-test-spec-ja.md"
]) appendSection(filePath, "<!-- REMEDIATION-2026-07-11 -->", realMachineContract)

for (const filePath of [
  "extensions/workflow-register/README.md",
  "extensions/bob-bazaar-review/README.md",
  "extensions/bob-code-consistency-review/README.md"
]) appendSection(filePath, "<!-- REMEDIATION-2026-07-11 -->", readmeContract)

appendSection(
  "docs/review-findings-tracking.md",
  "<!-- REMEDIATION-2026-07-11 -->",
  `
<!-- REMEDIATION-2026-07-11 -->
## 2026-07-11 three-extension remediation

| ID | Severity | Scope | Summary | Status | Verification |
| --- | --- | --- | --- | --- | --- |
| REM-H01 | High | bob-code-consistency-review | hard / soft dependency contract alignment and delayed provider recovery | implemented | soft-dependency and provider registration tests |
| REM-H02 | High | bob-bazaar-review, bob-code-consistency-review | bounded Git / Bazaar process execution with timeout, cancellation and kill | implemented | externalProcessRunner and wiring tests |
| REM-M01 | Medium | bob-bazaar-review | cross-platform repository-relative path boundary | implemented | bazaarClient Windows / POSIX path tests |
| REM-M02 | Medium | workflow-register and companion extensions | provider ownership, duplicate rejection and disposal | implemented | actionRegistry and provider registration tests |
| REM-M03 | Medium | repository workflows | dynamic strict provider-aware workflow contract CI | in_progress | workflowContractFiles.test.js and workflow-contracts workflow |
| REM-M04 | Medium | CI / release | Ubuntu and Windows quality matrix, IBM Bob release-candidate gate | in_progress | extensions-quality workflow and real-machine evidence |
| REM-M05 | Medium | bob-code-consistency-review | bounded manifest/runtime processing limits and byte-safe truncation | implemented | sizeLimits and limitsPolicy tests |
`
)
