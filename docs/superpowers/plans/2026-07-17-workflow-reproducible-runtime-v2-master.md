# Workflow Reproducible Runtime v2 Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 承認済みの Reproducible Runtime v2 設計を、互換性を保ちながら段階導入し、event replay 一致、重複副作用ゼロ、未検証 artifact 非再利用、non-idempotent 結果不明時の自動 retry 禁止を実証する。

**Architecture:** v1 event stream を不変 prefix として保持し、run.imported または stream.cutover 以降の v2 append-only event stream を唯一の正本にする。run.json、artifact manifest、execution manifest、Bob/UI state は同じ pure projector から生成する派生 projection とし、既存 lease と event-head CAS の両方を満たす commit coordinator が journal、event、projection の順で永続化する。外部作用は attempt、effect intent、idempotency policy、staging artifact、budget/cancel、approval target、retry/fork lineage をすべて event evidence に結び付ける。

**Tech Stack:** TypeScript、Node.js、VS Code Extension API、JSONL、SHA-256、node:test、GitHub Actions（Ubuntu/Windows）、既存 workflow-register runtime。

## Global Constraints

- 承認済み仕様は ../specs/2026-07-17-workflow-reproducible-runtime-v2-design.md とする。計画と実装の解釈が衝突した場合は仕様を優先し、仕様変更が必要なら先に design amendment を承認する。
- v1 event の byte sequence と hash chain は書き換えない。既存 run を v2 化するときは run.imported または stream.cutover を append する。
- v2 authoritative mode では run.json、manifest、Bob/UI state を直接 mutate しない。RunCommitCoordinator が event append と deterministic projection を統括する。
- 同一 run の write は有効な lease と expected event head/sequence の CAS を両方要求する。CAS conflict は自動 merge しない。
- canonical-json/v1 と projection JSON の byte rules は固定し、OS、locale、timezone、object insertion order に依存させない。
- provider、Bob、Bazaar、multi-root workspace の既存契約を一括破壊しない。shadow、canary、authoritative の順で切り替える。
- 外部作用の前に effect.intent-recorded を durable にする。non-idempotent effect が結果不明なら effect.in-doubt として停止し、自動 retry しない。
- artifact は attempt staging で生成・検証し、artifact-set/v2 commit 後にのみ再利用可能にする。committed attempt directory は immutable とする。
- approval は actor、reason、artifact set hash、plan digest、attempt diff、pending action を束ねた approvalTargetDigest に対して記録する。
- parent run は retry/fork のいずれでも過去 event と committed artifact を変更しない。fork は child run の run.forked event に lineage を記録する。
- failpoint は test-only dependency injection とし、本番設定や環境変数で偶発的に有効化されない構造にする。
- 各タスクは RED、最小実装、GREEN、関連回帰、コミットの順に進める。既存の unrelated change は混ぜない。

---

## Plan Set and Integration Order

| Order | Plan | Consumes | Produces | Release gate |
|---|---|---|---|---|
| 1 | 2026-07-17-workflow-reproducible-runtime-v2-foundation-authority.md | v1 run/event/journal/lease | canonical-json/v1、run-state/v2、event v2、pure projector、journal v2、legacy import/rebuild | shadow replay 一致、CAS/lease safety |
| 2 | 2026-07-17-workflow-reproducible-runtime-v2-attempt-effects-artifacts.md | authoritative event commit | attempt workspace、effect ledger、idempotency policy、atomic artifact-set/v2 | 重複副作用ゼロ、未検証 artifact 非再利用 |
| 3 | 2026-07-17-workflow-reproducible-runtime-v2-provenance-approval-lineage.md | event/effect/artifact evidence | execution manifest、approval event、retry/fork lineage、Bob/UI projection | provenance 完全性、parent 不変性 |
| 4 | 2026-07-17-workflow-reproducible-runtime-v2-budgets-cancellation.md | effect invocation envelope、manifest | timeout/cancel/output/AI call/token budget | 全境界で fail-closed、cancel race 決定性 |
| 5 | 2026-07-17-workflow-reproducible-runtime-v2-failure-rollout.md | 1–4 の統合 runtime | failure injection suite、CI matrix、shadow/canary rollout evidence | crash/corruption/lease/CAS/Bob interruption を含む全受入条件 |

順序 2 と 3 の内部モジュールは並行開発可能だが、統合は 1 → 2 → 3 → 4 → 5 とする。Plan 2 の provider adapter と Plan 4 の budget-aware provider contract は同じ interface を変更するため、Plan 2 を先に merge し、Plan 4 がその final shape を拡張する。

## Cross-Plan Stable Interfaces

- RunEventCodecRegistry
  - v1 decoder を凍結し、v2 envelope の decode、validate、canonical encode、hash verify を登録する。
  - unknown future schema は read-only diagnostic とし、書き込みを拒否する。
- RunEventStore
  - inspectHead、readVerifiedStream、appendWithCas を公開する。
  - appendWithCas は lease proof、expected sequence、expected event hash、expected log length を検証する。
- RunProjector
  - initial、apply、replay を pure function として公開する。
  - wall clock、filesystem、environment、VS Code API を参照しない。
- RunCommitCoordinator
  - prepare → durable journal → exact event append → exact projection replace → journal remove を実施する。
  - crash recovery は journal bytes を再利用し、新しい時刻や ID を発行しない。
- AttemptWorkspace
  - staging path、committed path、safe relative path validation、atomic promote を提供する。
- EffectLedger
  - intent、success、failure、cancelled、in-doubt、reconciled を event として記録する。
  - policy は pure、idempotent、non-idempotent の closed union とする。
- ExecutionManifestProjector
  - runtime、plan、input、provider、effect、artifact、budget、approval、lineage の digest-backed provenance を生成する。
- BudgetController
  - start 前 preflight と execution 中 consumption/cancel arbitration を同じ immutable budget state から判定する。
- FaultController
  - production default は no-op。test harness だけが named failpoint を注入できる。

公開 interface の変更は consuming plan の先頭タスクで compile test を追加してから行う。

## Release Gates

### Gate A — Shadow authority

- [ ] Phase 4 fixture、legacy fixture、新規 native v2 run を同じ projector で replay し、expected projection bytes と一致させる。
- [ ] shadow mismatch は stable diagnostic code、runId、sequence、expected/actual hash を記録し、v1 write path を継続する。
- [ ] corrupt middle event、torn final line、unknown schema を区別し、破損 stream への write を拒否する。

### Gate B — Canary authority

- [ ] opt-in canary run の正本を v2 event に切り替え、run.json 直接 write を検出して失敗させる。
- [ ] lease expiry と event-head CAS conflict の両方が projection publish 前に停止する。
- [ ] crash recovery 後の event bytes と projection bytes が crash 無し実行と一致する。

### Gate C — Safe effects and artifacts

- [ ] 同じ idempotency key の retry/fork/concurrent invocation で外部副作用が一度だけ起きる。
- [ ] non-idempotent call の post-dispatch crash は in-doubt となり、自動 retry されない。
- [ ] staging、hash mismatch、missing verification、wrong attempt owner の artifact は seed/reuse 対象にならない。
- [ ] artifact-set commit と committed directory promotion は replay と crash recovery で一貫する。

### Gate D — Complete evidence and controls

- [ ] execution manifest から plan、runtime、input、provider、effect、artifact、budget、approval、lineage の全 digest を追跡できる。
- [ ] approvalTargetDigest の任意要素が変化すると過去 approval が無効になる。
- [ ] timeout、cancel、output bytes、AI call、input/output/total token の各境界を超える前または超えた直後に deterministic event が記録される。
- [ ] retry は新 attempt、fork は新 child run となり、parent event/artifact hash は不変である。

### Gate E — Rollout

- [ ] Ubuntu、Windows、Extension Host、real Bob/Bazaar、multi-root workspace の matrix が通る。
- [ ] failure injection suite が crash point ごとの expected recovery class を検証する。
- [ ] shadow mismatch、CAS conflict、in-doubt effect、projection rebuild、budget exhaustion の運用診断が文書化される。
- [ ] authoritative mode rollback は event を削除せず projection consumer を read-only compatibility mode に戻す。

## Required Verification Commands

各 plan の focused test に加え、最終統合では extensions/workflow-register で次を実行する。

    npm ci
    npm run dependency:policy
    npm run architecture:policy
    npm run source:policy
    npm run schema:policy
    npm run unused:report
    npm run audit:prod
    npm run test
    npm run package
    npm run package:policy
    git diff --check

Windows 固有、Extension Host、real provider integration は GitHub Actions の対応 job で検証し、job URL と commit SHA を rollout evidence に残す。

## Final Acceptance Trace

| Original acceptance | Owning plan | Proof artifact |
|---|---|---|
| event replay 一致 | Foundation/authority + Failure/rollout | fixture replay byte comparison、rebuild comparison |
| 重複副作用ゼロ | Attempt/effects/artifacts | idempotency/concurrency/fork effect-count tests |
| 未検証 artifact 非再利用 | Attempt/effects/artifacts | negative seed/reuse matrix |
| non-idempotent 結果不明時の自動 retry 禁止 | Attempt/effects/artifacts + Failure/rollout | post-dispatch crash/in-doubt child-process test |
| append-only event store と deterministic projection | Foundation/authority | v1-prefix + v2 replay tests |
| lease/CAS | Foundation/authority | cross-process lease/CAS tests |
| attempt staging と atomic commit | Attempt/effects/artifacts | crash-safe promotion tests |
| budgets/cancel | Budgets/cancellation | boundary/race matrix |
| execution manifest/provenance | Provenance/approval/lineage | digest completeness/replay tests |
| approval evidence | Provenance/approval/lineage | target mutation invalidation tests |
| legacy import/rebuild | Foundation/authority | v0/v1/future/corrupt fixture tests |
| failure injection | Failure/rollout | named failpoint matrix |
| retry/fork lineage と parent 不変性 | Provenance/approval/lineage | before/after parent tree hash comparison |

## Definition of Done

- [ ] 5 本の phase plan の全 checkbox が完了している。
- [ ] 仕様の event kind、schema version、canonicalization rule、diagnostic code が implementation と test fixture に固定されている。
- [ ] 全 acceptance trace に再実行可能な automated proof がある。
- [ ] committed event/artifact fixture を意図せず更新するテスト運用を禁止し、更新手順に reviewer approval を要求する。
- [ ] migration と rollback の operator runbook がある。
- [ ] source、test、schema、package、CI、documentation の全 gate が green である。
