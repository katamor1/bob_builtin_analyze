# WF2-R2-INVOKE 詳細設計

状態: 2026-10-18の設計レビュー用提案。製品コードの実装、CI実行、PR公開、main統合、R2の完了認定はまだ行っていない。

## 1. 目的と今回の範囲

R1が保持する正規のrun／lease／実行scopeから、P4で束縛済みのproviderを一度呼び出し、input・output・error・artifact stagingの境界を検証する。一般の製品入口は引き続きshadowとし、R2を内部テストから実行できることと、製品でV2 workflowを実行できることを区別する。

ユーザーの依頼は、現在の移行計画の次工程R2を進めること。成功条件は、既存P4/P5/R1の所有関係を保ったinvocation boundary、製品からのV2到達件数0、現行V1互換、独立reviewと実測証跡である。R3のartifact transaction、R4のexecutor、R5のBob runtime、resume、activationは今回に含めない。

根拠は[採否・逐次統合仕様](2026-08-23-feature-selection-and-sequential-main-integration-design.md) §§7.1、10.2、[Contract仕様](2026-07-17-workflow-contract-v2-design.md) §§12、14、17、[R1詳細設計](2026-10-12-wf2-r1-provenance-design.md)、[旧Runtime実装計画](../plans/2026-07-17-workflow-contract-v2-runtime.md) R2。新しい採否・shadow条件を古いengine接続の指示より優先する。

計画基準mainは `abdedeb23fe133c2b541c8cc2fa7d35f2e8b5688`。status上で20 mandatory slice中7件がVERIFIED、R1が直前、R2がordinal 8・planned/nextである。R3–R5はconditional/inactive、R6はnot_applicableのまま維持する。

## 2. 調査結果と採用方針

現mainにはP4のprivate stateにcompiled schema viewとopaque dispatch handleがあり、R2でcompiler・registry・schema validatorを増設する必要はない。`requireActiveWorkflowPlanLease()`は既に本物のpublished/runtime leaseを認証する。ただし、それだけではR1のretained workspace/run ownershipと開いているAsyncLocalStorage scopeを認証できない。

歴史的なR2 range `66e005faf0046ca931c83abc41ce533488d2f581..7bad4e42`を読み取り監査した。固定source catalog SHA256は `dc215522dfcae4c114740b2411e63a90ded87d2f803a8e946bed47be352881f2`。R2は13 family rows、7 test families、12個のcommit/path raw originを持ち、blob・byte数・SHA256を再確認した。旧codeの実行・一括復元はしていない。

選択肢は、旧5-field invocation ABIを保ってattemptにR1所有者を結合する方式と、invocationのたびにworkspace/runを追加で渡す方式がある。前者を採用する。所有情報をbranded attemptに一度だけ捕捉し、毎回R1で再認証することで、呼出し側の重複引数と所有者不一致を減らせる。lease単独の旧実装、任意のstaging callback、製品stepExecutor接続は採らない。

## 3. ファイルと所有

新規runtime moduleは `extensions/workflow-register/src/core/contractV2/` の次の3本とする。

| ファイル | 責任 |
|---|---|
| `providerEnvelopeSnapshot.ts` | bounded structural preflightと既存F1 cloneによるdetached/frozen JSON |
| `providerAttemptStaging.ts` | R1に結合したopaque attempt、retry bookkeeping、RAM内の隔離staging |
| `providerInvocation.ts` | compiled binding解決、入力検証、bridge単発呼出し、結果検証、writer sessionの封印 |

既存 `providerRegistry.ts` に単一bridgeを追加する。`planLease.ts` に旧archiveの別accessorは戻さず、現行の認証APIを使う。R1のlease/context/store/coordinatorも所有者を増やさず再利用する。

P6のproduct/entrypoint/runtime factory/service、`core/engine/stepExecutor.ts`、`reportedActionError.ts`、public barrelのruntime value exports、既存V1 run保存形式は変更しない。`core/contractV2/index.ts` から新しいruntime関数を公開しない。

## 4. 固定するAPI

```ts
createWorkflowAttemptStaging(input: {
  readonly workspaceRoot: string
  readonly run: WorkflowRunState
  readonly stepId: string
  readonly attemptId: string
}): WorkflowAttemptStaging

invokeCompiledWorkflowProvider(input: {
  readonly lease: WorkflowPlanLease
  readonly stepId: string
  readonly value: unknown
  readonly signal: AbortSignal
  readonly attempt: WorkflowAttemptStaging
}): Promise<CompiledProviderInvocationResult>

// providerRegistry.tsのみで実装、providerInvocation.tsだけがvalue-import可能。
invokeBoundWorkflowProviderDispatch(
  handle: BoundWorkflowProviderDispatchHandle,
  input: WorkflowProviderDispatchInput
): Promise<unknown> | unknown
```

3つの入力wrapperはclosed ordinary own-data recordとし、proxy/accessor/symbol/unknown fieldをgetter/trap実行なしで拒否する。`stepId`と`attemptId`は1–128文字のF4 idである。signalはnative AbortSignalとして認証し、proxyやlookalikeを受け入れない。ABI wrapperをfreezeしてもAbortSignal本体はfreezeしない。

結果型は旧R2の次の3 variantを維持し、すべてdetached/frozenとする。

```ts
type CompiledProviderInvocationResult =
  | { readonly ok: true; readonly output:
      { readonly kind: "unit" } | { readonly kind: "value"; readonly value: JsonValue };
      readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly failure: "provider-error";
      readonly error: JsonValue; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly failure: "validation";
      readonly diagnostics: readonly WorkflowContractV2Diagnostic[] }
```

`ok: true`はprovider結果の検証完了だけを表す。committed output、run success、artifact promotion、transition判定、再利用許可は発行しない。所有者・型・scope違反はプログラマ契約違反として固定文言のTypeError、abortはAbortErrorとし、schema不正に偽装しない。

## 5. R1の所有認証

attempt作成は `requireWorkflowContractV2RunPlanLeaseForExecution(workspaceRoot, run)` が成功する開いたR1 scope内だけで許可する。module-private WeakMapに正規lease、run、元runId、正規化workspace identity、step、attemptIdを保持する。caller指定のdispatch、schema、key、effect、commit/staging callbackは受け取らない。

invocationは入力leaseを現行P5 APIで認証し、attempt内のleaseとobject identityで一致し、R1のretained run/scopeから再取得したleaseとも一致することを必要とする。同じ公開digestの別environment/lease、別run/workspace/step、lease/attemptを模したDTO、authoring/evidence handle、released lease、終了したscopeはdispatch前に拒否する。attemptは新しいlease・cache・retained run ownerを作らず、P5 leaseをreleaseしない。

すべてのawait後、staging entry、bridge直前、結果受入直前でR1所有とabortを再確認する。scopeが閉じたdetached async workは、retained lease自体が生存していても再開できない。lease/run markerの削除・runId変更・provenance差替えを権限拡大に使えない。

## 6. Compiled bindingとbridge

stepは既存handleのfrozen command stepからstepIdで一意に解決する。対応するlocked provider evidence、private dispatch handle、input/output/error compiled schema viewsを一意に取得する。欠落・重複・非command step・schema evidence不一致は拒否し、live registry、package source、current pointer、YAML、raw schemaを読み直さない。

bridgeはF6の `handleDispatches` WeakMapを照合し、captured dispatchを `this=undefined` で正確に1回呼び、同期値またはpromiseをそのまま返す。forged handleはTypeError、dispatch 0回。bridge内にvalidation/catch/retry/artifact/state/commitを置かない。dispose/re-register後もsnapshot時のdispatch identityを使う。

通常のF6 register/snapshot/bindは製品で継続利用できる。providerRegistry全体をprivate moduleにするのでなく、新bridge symbolだけを限定する。named alias、destructured require alias、namespace/property access、re-export、star export、import-equals、dynamic importによる迂回をarchitecture testで拒否する。

## 7. 入力・出力・エラー

構造上限は歴史的R2のdepth 64、nodes 65,536、array items 65,536、単一object properties 1,024を維持する。input/errorとvalue outputのcanonical UTF-8 JSON上限は16,777,216 bytes、outputはさらに当該stepのmaxBytes以下とする。境界値ちょうどと1超過を検証する。

bounded preflightはcaptured native descriptorだけを使い、proxy/getter/toJSON/iteratorを呼ばない。上限確認後のJSON妥当性とdetached/frozen値は既存F1 `cloneAndFreezeJsonValue()`、schema検証は既存 `validateLocalJsonSchemaViewValue()` が所有する。providerには元のmutable valueを渡さない。循環、sparse、exotic、symbol、非finite、-0、ill-formed UnicodeもF1と同じ扱いにする。

入力不正は `WF2_PROVIDER_INPUT_INVALID` でdispatch/staging/commitすべて0。value出力不正・上限超過は `WF2_PROVIDER_OUTPUT_INVALID`、unitは正確にundefinedだけを受け入れ、output idを生成しない。

同期throwとnative promise rejectionの生値だけをbound error schemaへ渡す。適合するplain JSONは `failure: provider-error`、不適合は `WF2_PROVIDER_ERROR_INVALID`。既存V1 ReportedActionError変換や任意のtoJSON/message/stack読出しを持ち込まない。非native thenableはunknown valueとして扱い、then getterをawaitによって暗黙実行しない。native promiseはcaptured native settling経路で扱い、改変されたthen/catch propertyに依存しない。

診断は固定の一般文言とpackage-relative path/pointerだけを持ち、providerの値・例外・stack・host path・secretを含めない。schema failureやstaging failureから成功値を返さない。

## 8. Attempt・retry・staging

attemptはprivate stateで `fresh → in_flight → accepted | provider_failed | rejected` を管理する。再入・同時利用はdispatch前に拒否し、同じlease/run/step/attemptIdの重複作成も拒否する。失敗した古いwriterや別attemptのbufferを再利用しない。

R2は1呼出しにつきbridgeを1回だけ実行し、自動retry loopは持たない。`provider_failed`から同じattemptを再呼出しできるのは、bound modeがidempotentまたはkey-required、input digestが同一、plan.resumePolicy.modeがrestart-step、呼出し回数がmaxAttempts未満の場合だけとする。key-required keyはrun identity、plan/provider binding、step、attemptId、最初の検証済みinput digestからruntimeがcanonical SHA-256で発行し、再呼出しでも変えない。callerが任意keyやretry可否flagを注入できない。

non-idempotentはdispatch開始後に再呼出ししない。output/error validation failure、artifact failure、abort/owner loss、accepted resultもterminalである。R2は同一process内のattempt policyを検証する段階で、durable effect ledgerやcrash後のexactly-onceを主張しない。それらは後続RuntimeとR3以降の契約である。

effect/idempotency discriminantはbound contractからだけ構築する。none/externalにwriterを渡さず、workspace-writeだけがfrozen one-method `writeArtifact({id, bytes})` を受け取る。reserved capabilityとの整合はF6/P4で確定した内容を再確認する。external adapterを別に解決し直さない。

stagingはR2 module内のRAM限定で、filesystem、公開callback、path/read/promote/commit APIを持たない。writerはentry時点でnon-proxy・non-shared・非detached Uint8Arrayのbytesを同期snapshotする。宣言済みで当該stepが所有するprovider artifact idだけを許可し、各maxBytes、128 writes、合計67,108,864 bytes、重複idを検査する。

開いているwriter sessionのviolationはsticky failureとし、providerがrejectをcatchしても結果受入を禁止する。未awaitのwrite promiseも追跡・settleし、dispatchがthrow/resolve/rejectしたら新規writeを封印する。封印後のwriteは拒否し、終了したattemptや返却済みresultを変更しない。遅延writeや結果返却後の元buffer変更は受入snapshotを変更できない。失敗時は隔離bufferを結果へ公開しない。R3のdisk transaction・content schema・promotion・recoveryは未実装のままとする。

await後の処理順は、owner/scope/abort確認、sticky staging failureとpending writes、provider error検証またはoutput検証、attempt受入の順で固定する。どの段階が失敗してもsuccess/artifact commitとtransitionは0。state/journal/outputを変更する実装はない。

## 9. 実行テストとGate R

source catalogとsource universeは変更しない。13 family rowsのorigin/path/hashをcurrent interfaceへ対応付け、未使用symbolや変更しない旧planLease accessorにも根拠を残す。historical test bodyをarchiveから実行しない。

R2の7 familyを次の現main testに対応付ける。各testには対応するrequired caseが実際に成功する必要があり、helper fileの存在だけを成功扱いしない。

| family | current test | required case |
|---|---|---|
| invocation | `workflowContractV2ProviderInvocation.test.js` | `R2_compiled_input_output_error_contract` |
| architecture | `workflowContractV2ProviderInvocationArchitecture.test.js` | `R2_product_paths_remain_unreachable` |
| followup | `workflowContractV2ProviderInvocationFollowup.test.js` | `R2_snapshot_dispatch_and_retry_identity` |
| failure precedence | `workflowContractV2ProviderInvocationFailurePrecedence.test.js` | `R2_staging_failure_and_settlement_precedence` |
| fixture foundation | `workflowContractV2ProviderInvocationFoundation.test.js` | `R2_authentic_retained_run_and_attempt_foundation` |
| hardening | `workflowContractV2ProviderInvocationHardening.test.js` | `R2_bounded_hostile_values_and_write_sessions` |
| review cases | `workflowContractV2ProviderInvocationReviewCases.test.js` | `R2_closed_scope_and_concurrent_attempt_refusal` |

`workflowContractV2ProviderInvocationTestSupport.js`は実P4/P5/R1でnonempty provider fixtureを作るhelperとし、上のfoundation testがそれを実行する。fake leaseやsuccess counterの代用にしない。現R1の8 familyをすべて維持する。

`gate-r-main-admission.json` / `gateRMainAdmissionPolicy.mjs`は、現mainの実1111+R1差分を測った新base snapshotと、R2だけの固定path/family/after-blob deltaに更新する。既存R1 admissionのraw bytes/digestと全証跡は外部保全し、新candidateを旧R1許可に紛れ込ませない。self-hashingするruntime policy/source範囲や将来completion recordへの依存を作らない。

`gate-r-active-suite.json`と`gateRPolicy.mjs`はR1+R2、8+7=15実行suiteを固定する。runnerは既存の全体120秒・合計captured output 1 MiB・child settle・厳密TAP・archive test非実行を維持する。fixture helperを直接testとして走らせない。再帰実行、empty/skipped/duplicate/missing required case、timeout、overflow、残存childは失敗である。

新resultは `workflow-gate-r-result/v3`、capabilities `[WF2-R1-PROVENANCE, WF2-R2-INVOKE]`、runtimeSuitesExecuted=15、archiveTestsExecuted=0、runtimeActivation=falseとし、R1の旧resultは書き換えない。R1の実測wiring markerに加え、新R2 boundary testも実製品surfaceの5 counter=0を出す。runnerは観測をdecodeして初めて採用し、literal 0を捏造しない。hosted test/workflowはこのv3をUbuntu/Windowsで比較する。

## 10. 製品境界と回帰

`scripts/check-contract-v2-runtime-reachability.js`とarchitecture testsのprivate module/symbol制約に新3 moduleとbridge/attempt APIを追加する。既存のfrozen P5/P6 owner hash、slot fail-closed、legacy V1 behaviorを保持する。既存source Minor M1は別の保留事項として残し、新bridgeのalias検査を追加しただけで解消扱いにしない。

validation、registration、operation_hub、authoring、legacy_v1を実際に呼び、Contract V2のlease acquisition/provider/Bob dispatch/run-directory/artifact stagingが各0であることをspyとsource graphの両方で検証する。既存V1自身の正規実行・保存・Bob呼出しを0に変える指示ではない。

## 11. パッケージの実現性を最初に測る

R1の実測baseline VSIXは1,199,583 bytes、上限1,200,000 bytes、余裕417 bytes。現在のproviderRegistry.jsだけへの既存compactor適用は428 bytesの圧縮余地を示したが、新R2の搭載可能性を証明してはいない。

実装計画の最初の技術ゲートは、同じlock/engine/version・既存buildで新3 moduleとbridgeのsize見積りを実際のemit/ZIPで測り、必要headroomを確定すること。予測やarchiveのZIPサイズだけでpackage gateを通さない。

追加のtoken compaction対象は新3 moduleと、R2の直接依存 `providerRegistry.js`、`compiledPlan.js`、`jsonSchemaCatalog.js`、`jsonSchema.js`、`jsonValue.js`、`canonicalJson.js` に限定できるものとする。既存10対象は維持する。全対象で現行AST signature同値、候補outに対するpayload単位比較、全entry manifestと未対象payload不変を検証する。global/minifier導入、依存追加、予算引上げ、同値未証明のsource短縮、test削除はしない。

この固定対象でも収まらない場合は、実数・失敗artifactを保存し、publish前に具体的なpackaging変更案を別途提示する。収まる見込みをR2完了と取り違えない。

## 12. 受入と後続

順序は、source audit/packaging feasibility → RED/GREENで内部R2 → 全15 Gate R/policies/既定回帰 → 同一候補VSIXのpayload/実installed host観測 → fresh-context whole review → source candidate/main受入 → 固定completion観測とstatus公開である。詳細なコマンド・コミット境界・証跡bindingは本書レビュー後の実装計画に記載する。

既定回帰のdeadline/concurrency/skipを都合よく変更しない。Windowsのowned temporary pathとprocess-local core.longpathsは、既存の長いfixtureに必要な場合だけ別の環境回復記録にする。全失敗と再検証を保持し、合成coverageを単一green runとは記載しない。

R1で承認されたCI免除はR1の4 phaseに記録されている。R2に黙って転用せず、R2の実際のCI結果と受入条件を別に扱う。起動前の失敗でも成功に改変せず、local実装・reviewを完成させてから具体的な未達と判断材料を提示する。branch protection/billing/credential変更、force/admin mergeはしない。

R2が実際の受入条件を満たすまではstatusはplanned/nextのまま。完了時もruntime/activeSliceIds/mutationAuthority/automaticCleanupはfalse/空であり、次は既存ordinal 9の `REG-BRIDGE-OWNER-VERSION-LIFECYCLE` である。final Program UATをR2のinstalled observationで代用しない。

primaryの保護8項目、旧/新worktree・branch・profile・archive・R1の9完了記録を保持する。自動cleanup、旧R6復活、外部メッセージ、他sliceの並行実装はしない。

## 13. 設計レビューの確認点

1. genuine leaseでも別run/workspace/environment/終了scopeならdispatchとwriteを拒否できるか。
2. thenable/getter/proxy、promise改変、unit/value境界とescape後byte上限でsource behavior・内容漏洩を起こさないか。
3. reentrant invocation、未await write、providerが握り潰したwriter失敗、late write、abort/owner lossで受入が起きないか。
4. stable key・input digest・同一attempt・maxAttemptsが結び付き、non-idempotentの曖昧な結果を再dispatchしないか。
5. 7 R2 familyと8 R1 familyが実行され、製品到達不可・candidate blob sealing・既存記録不変・VSIX上限が別々に証明されるか。

本書の承認はR2内部境界の詳細設計に対するもの。実装計画はこの設計を入力に作成し、具体的な作業単位と検証条件を提示する。R3以降のGO、製品有効化、未測定CI成功、最終UAT完了を含まない。
