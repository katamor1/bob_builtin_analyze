# Wave 0A trusted transcript terminal-LF 比較例外の限定設計追補

- Addendum ID: `WAVE0A-TERMINAL-LF-COMPARISON-EXCEPTION-V1`
- Correction ID: `WAVE0A-PLAN-CONTEXT-INTERVAL-DEREFERENCE-CORRECTION-V1`
- Status: terminal-LF比較例外の旧設計と旧実装計画は承認済みだが、旧plan-contextの区間比較が外部作成前に安全停止した。plan-context限定訂正設計は作成済みでwritten-spec review待ち。訂正plan、capture、Task 0、source/test実装は未承認・未実行。
- Date: 2026-08-30
- Repository: `katamor1/bob_builtin_analyze`
- Base checkpoint: `7383d96c37b8a86cd32fe4114839ff3650a9280a`
- Scope: composed-plan実装承認のうち、固定された一つのassistant promptと一つのuser approvalの本文比較、および承認済みplan blob内で発見されたplan-context区間wrapper参照不整合の限定訂正。

## 1. 権威、作成許可、停止境界

本追補は次の原本を上書きしない。後続のidentity固定済み実装計画が別途明示承認された場合に限り、後述する一つの比較規則と、それに伴うTask 0のHEAD/allowlist条件だけを限定的に置換する。それ以外の実装順、root/removal安全契約、承認境界、停止条件は原本を継承する。

| 原本 | 固定identity |
| --- | --- |
| `docs/superpowers/plans/2026-08-27-wave0a-approved-root-removal-addenda-composed-implementation.md` | commit `7383d96c37b8a86cd32fe4114839ff3650a9280a`; blob `36f5377c813d686dd57fc82c299068784a932f46`; SHA-256 `e3cf6684be198ee9289d3a0550087a36cb0516a1707a85125f57b04e3d35434e` |
| `docs/superpowers/specs/2026-08-27-wave0a-root-path-contract-addendum-design.md` | commit `86670e2b7a76c9f866270314c000e1da9a8a43c2`; blob `700b539bab9c5740736af9a1b0432a80eaf82ce2`; SHA-256 `8104d3e24b4fd826d450de0464db24880166c3795232cf74b488afe930c24c4d` |
| `docs/superpowers/plans/2026-08-27-wave0a-root-path-contract-addendum.md` | commit `86670e2b7a76c9f866270314c000e1da9a8a43c2`; blob `21d05822ec7c51d947a60beec1db27c7c93c4fac`; SHA-256 `c9bb9e2eaa4143b3b060d57b2bb7813e01928b461f5cfd8a56cf76cfa97d320d` |
| `docs/superpowers/specs/2026-08-27-wave0a-removal-cap-and-mutable-directory-identity-design.md` | commit `3f70335f96d7fb14dceab7f6d3e2d4b71f07f98f`; blob `74d2f02adf937123338dca91843635d10dfa8abe`; SHA-256 `0b50db92aa59014226595b30a291a191feaa0f69a4229ce8ee7d45b2dea3a868` |

追補作成の依頼は、同一trusted Codex taskの次のprovider observationで確認した。

| Role | Provider message ID | Ordinal / observedAt | UTF-8 bytes / text SHA-256 | raw record SHA-256 |
| --- | --- | --- | --- | --- |
| assistant exception request | `msg_05f07830af5cd031016a9187bf284887d0af92b2e902ef502e` | `1249` / `2026-08-28T13:06:10.824Z` | `797` / `07cf915b10bbb27ea143acc11bd568d4204ef719ab3c59ad7f8cf44a25494d4f` | `8225425885605f325ca87a17c35a11b73bcd7f770f02b125b136c1e54df17d20` |
| user authoring instruction | `msg_01a04973-e0d2-7832-8dc4-13fbdb502c85` | `1254` / `2026-08-28T17:38:46.098Z` | `41` / `3b2f166c523c502b68dfe04ef22d1fc0bbf20f2f2f036ed8ba79e86ba46ade6f` | `54b88701d269d476d7bf1fbfdc4ecacaa61b793d18628df60342258615af8ab8` |

この指示は本設計書と後続実装計画を文書限定で作成・review・local commitする許可である。比較例外の使用、`approval.json`または例外sidecarの作成、Task 0/R1、campaign/control authority、main/remote/PR、branch/worktree cleanup、保護clone、既存archiveの変更を許可しない。

計画化監査で、初版commit `08a6540e5ad93e16aba21a69f9d47748c123d5ac` / blob `3b3895cbe5843414636f045f124a24bb24ced7ae` / SHA-256 `993e865d271b975103d91e22ec4b8cfdaf37bce5b2fdb05c0f2a8776ce9caa78` に、既知draft SHAの2桁欠落、計画自身のidentityを計画bytesへ埋め込む固定点、Task 0前のcapture実装ownership欠落を確認した。ユーザーは、(1) 64桁SHAへの訂正、(2) plan identityのcommit後substitution、(3) committed plan blob内のidentity固定済みoperatorをrepository非変更で実行する方式、(4) 訂正commitを含むHEAD chainへの更新、を承認した。本訂正も文書限定であり、最終exact approvalまでは外部・source/test mutationを許可しない。

訂正設計commit `e15b77aea11e11db165eff0670a29280c35b3c3c` / blob `20e0d77de4034ca4d2a66b89869ed1b7cc90865e` / SHA-256 `f9b82de9ba5c8a0f82f87e75f13fa6dd2ea663310e2c167bbe6c22e0335fa41e` の計画化監査で、25 repository commit slicesに必要な50 progress-row wrappersと4 non-progress wrappersから、56 sections / 54 action invocationsの完全bundleが必要である一方、同bundleをsidecar top-levelとself-test receiptへ完全展開するclosed schemaは、極端に短い値を使った保守的下限でもsidecarの65,536-byte capを超えることを確認した。単一bundleの独立下限は90,393 bytes、旧record全体の独立下限は189,753 bytesであり、参照共有を持たないcanonical JSONでは適合encodingが存在しない。

ユーザーはprovider message `msg_01a049fe-9ecd-72a3-84ea-142e2e46f033`（message ordinal `1301`、`2026-08-28T20:10:18.701Z`、raw text 65 UTF-8 bytes / SHA-256 `104473206433590e45ef203f4ac79462552089d9bc2ba2c1105f911e3ce862d9`、raw record 427 bytes / SHA-256 `6cb1b73e8a4f7b6701df6de4c990a3711701ca16854e4aee4909607dac76c0f7`）で `WAVE0A-TERMINAL-LF-BUNDLE-COMMITMENT-CORRECTION-V1` を承認した。この承認は、65,536-byte cap、56/54の完全台帳、row-specific wrapper、action-specific contractを維持したまま、外部record内の完全bundle複製だけを後述するcontent-addressed commitmentへ置換する文書訂正に限る。外部capture、Task 0、claim、source/test mutationを許可しない。

## 2. 観測された不一致

対象threadは `019f89ad-da0a-7103-9224-c5dbb2c320ba`。provider logは次のappend-only prefixで固定する。

```text
canonicalPath: C:/Users/stell/.codex/sessions/2026/07/22/rollout-2026-07-22T20-55-05-019f89ad-da0a-7103-9224-c5dbb2c320ba.jsonl
dev: 2248873766
ino: 27303072741156331
prefixByteLength: 159497194
prefixSha256: 0eb93e24abf0f8843b49cd20c8f67bfe9660bdd1a059e5762419ab747408d702
prefixLastRecord: msg_01a04973-e0d2-7832-8dc4-13fbdb502c85
```

full logのsize/mtimeは後続messageで増加してよいが、canonical no-follow path、dev/ino、上記prefix bytes/hashは変化してはならない。capture時は同一handleの読込前後identity、regular-file、link count 1、reparse tag 0、`size >= prefixByteLength`を検証する。

composed planが要求した三つのmessage observationのうち、本追補が対象にするtripletは次の一組だけである。

| Semantic role | Provider role / phase | Provider message ID | Ordinal / observedAt | UTF-8 bytes / text SHA-256 | raw record SHA-256 | terminal LF |
| --- | --- | --- | --- | --- | --- | --- |
| `assistant_announcement` | `assistant` / `final_answer` | `msg_05f07830af5cd031016a904a6ced4087d08575cb98b4769945` | `1219` / `2026-08-27T14:32:14.279Z` | `217` / `5afb32ea46f609cfb19d328c20e3e58821d6f22f50ebfa19448f27acf171fc27` | `31ff2d01f055be564e05ac9185a373ba52469d9e236118baa31e860140e304f1` | 0 |
| `assistant_prompt` | `assistant` / `final_answer` | `msg_05f07830af5cd031016a904a83dfe887d094a16d030f870105` | `1222` / `2026-08-27T14:32:38.503Z` | `238` / `11fe1f35881a718f3e8409e508bfc0925eb94b39088b64a2b1d45f51fdeb9e0c` | `30012e4cba3d392f0b446411e36f792692cc1af98bef921af62a8d318e815766` | 0 |
| `user_approval` | `user` / `null` | `msg_01a04879-8fe1-7fc0-8424-3a1e835afef5` | `1246` / `2026-08-28T13:05:21.377Z` | `239` / `9376e598f24c8e6cb6b96ff5f3e841e616e043ebef33290e14112db2c378cfbb` | `fa6da4183c6b21eb2c8ad92252c0edff92e38402ee9e279f95df4017bd17b571` | exactly 1 |

announcementとpromptはcomposed planのliteral全体へ一致する。user approvalはpromptの238 bytesと同一prefixを持ち、その直後に一つの`0x0A`だけを持つ。既存`normalizeApprovalMessage`はUTF-8 decode、NFC、CR/CRLFからLFへの統一だけを行い、末尾をtrimしないため、通常比較では意図どおり不一致になる。

先行user message `msg_01a043b8-30cd-73c0-8724-33ee6145db79`は末尾LFが2個、`msg_01a043c3-a314-7821-a653-6e6984635489`は末尾LFが1個だが、どちらも対象外である。同じ本文や同じhashだけでmessage identityを代替しない。

## 3. 選択肢と採用案

| 案 | 判断 |
| --- | --- |
| 固定tripletとplan identityにだけ、user normalized body末尾の単一LFを比較時に除外する | 採用。保存証跡を変えず、例外を一message、一plan、一用途へ閉じられる |
| `normalizeApprovalMessage`へ`trim`/`trimEnd`または一般的な末尾改行除去を追加する | 不採用。全承認へ波及し、prefix/suffix/second-line拒否を弱める |
| 2026-08-23の既存terminal-LF例外、fingerprintまたはsidecarを再利用する | 不採用。旧plan、旧message IDs、旧purposeだけに固定された歴史的証跡である |
| 別message、同じ本文、generic `承認`、正規表現またはwhitespace tolerant比較を認める | 不採用。replay、identity crossing、suffix混入を許す |
| announcement/promptを作り直すか、再送だけを繰り返す | 不採用。固定済みtripletを変え、同じtransport差分を解決しない |

採用案はnormalizerの意味を変えない。raw provider record、raw/normalized body、各hashは保存時のまま保持し、比較結果のために本文やhashを再書込みしない。

## 4. 限定比較契約

例外比較は次の全条件が成立した後に一度だけ実行する。

1. target composed-plan path、commit、blob、SHA-256が1節の固定値へ一致する。
2. provider log prefix、thread、三つのmessage ID、provider role/phase、semantic role、ordinal、timestamp、raw record hash、raw text hash、normalized text hashが2節の固定値へ一致する。
3. announcement normalized bodyはcomposed plan item 1のliteral全体、prompt normalized bodyはitem 2のliteral全体へbyte-identicalであり、どちらも末尾LFを持たない。
4. user normalized bodyは239 UTF-8 bytes、最後のbyteは`0x0A`、その直前のbyteは`0x0A`でも`0x0D`でもなく、promptより正確に1 byte長い。
5. exact lengthを先に検証した後、`userNormalizedBytes.subarray(0, promptUtf8ByteLength)`の238 bytesだけを取り、SHA-256がprompt normalized body hash `11fe1f35881a718f3e8409e508bfc0925eb94b39088b64a2b1d45f51fdeb9e0c`へ一致し、その238 bytesがprompt normalized bytesへbyte-identicalであることを確認する。

比較操作は次の一つだけである。

```text
operation = remove_exactly_one_terminal_byte_0x0a_from_pinned_user_message_for_equality_only
comparisonSubject = msg_01a04879-8fe1-7fc0-8424-3a1e835afef5
comparisonResult = userNormalizedBytes without final 0x0A equals pinned promptNormalizedBytes
```

`slice(0,-1)`だけを先に実行してからidentityを照合してはならない。identity/hash/shapeを先に全て検証し、その固定subjectに限って最後の1 byteを比較対象から外す。`trim`、`trimEnd`、任意newlineの除去、CRLFの2-byte除去、複数LF除去、Unicode whitespace除去、case folding、NFKC、prefix/substring比較は禁止する。

通常の`TrustedApprovalTranscript`、別plan、別thread、別message、別purposeは従来のbyte-identical条件を維持する。announcementには例外を適用しない。

## 5. Closed exception recordと一回利用

後続実装計画はrepository/campaign/protected clone外の次のfresh non-reparse rootとfixed leafだけを使い、closed canonical JSONをcreate-newで保存する。

```text
C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-29-wave0a-composed-plan-terminal-lf-comparison-exception
leaf: comparison-exception.json
```

recordのtop-level keyは次のliteral集合だけとし、未知/欠落fieldを拒否する。ここで使う型も本追補専用のclosed型であり、現行42-schema attachment registryやgeneric approval schemaへoptional fieldとして追加しない。

`CanonicalU64DecimalString`はASCII `0`または先頭0のない`[1-9][0-9]{0,19}`で、`0..18446744073709551615`だけを許す。`dev`、`ino`、`prefixByteLength`、file size、native time、link countはJSON numberへせずこの型で保存し、`BigInt`だけでparse/比較する。`Number`、指数表記、符号、空白、leading zeroを拒否する。

```ts
type RepoObjectIdentity = {
  repositoryPath: SafeRepositoryPath
  containingCommitSha: LowercaseSha
  blobOid: LowercaseSha
  blobSha256: LowercaseSha256
}

type ProviderLogPrefixIdentity = {
  canonicalPath:
    'C:/Users/stell/.codex/sessions/2026/07/22/rollout-2026-07-22T20-55-05-019f89ad-da0a-7103-9224-c5dbb2c320ba.jsonl'
  dev: CanonicalU64DecimalString
  ino: CanonicalU64DecimalString
  prefixByteLength: CanonicalU64DecimalString
  prefixSha256: LowercaseSha256
}

type ProviderMessageObservation = {
  source: 'codex_trusted_transcript_v1'
  threadId: '019f89ad-da0a-7103-9224-c5dbb2c320ba'
  messageId: SafeId
  providerRole: 'assistant' | 'user'
  providerPhase: 'final_answer' | null
  role:
    | 'assistant_announcement'
    | 'assistant_prompt'
    | 'user_approval'
    | 'exception_announcement'
    | 'exception_prompt'
    | 'exception_confirmation'
  ordinal: PositiveSafeInteger
  observedAt: CanonicalUtc
  rawText: BoundedUtf8String
  rawUtf8Sha256: LowercaseSha256
  normalizedText: BoundedUtf8String
  normalizedUtf8Sha256: LowercaseSha256
  rawRecord: BoundedUtf8String
  rawRecordUtf8Sha256: LowercaseSha256
}

type ExternalFileIdentity = {
  canonicalPath: AbsolutePath
  dev: CanonicalU64DecimalString
  ino: CanonicalU64DecimalString
  size: CanonicalU64DecimalString
  mtimeNs: CanonicalU64DecimalString
  ctimeNs: CanonicalU64DecimalString
  linkCount: '1'
  reparseTag: '0'
  sha256: LowercaseSha256
}

type ExternalDirectoryIdentity = {
  canonicalPath: AbsolutePath
  dev: CanonicalU64DecimalString
  ino: CanonicalU64DecimalString
  reparseTag: '0'
}

type PlanEmbeddedOperatorOperation =
  | 'capture'
  | 'task0_verify'
  | 'consume'
  | 'progress_row'
  | 'complete'

type PlanEmbeddedOperatorCommandArgument = string
type PlanEmbeddedOperatorEnvironmentValue = string

type PlanEmbeddedOperatorSectionIdentity = {
  ordinal: PositiveSafeInteger
  sectionId: BoundedAsciiToken
  role: 'library' | 'test' | 'operation_wrapper'
  operation: PlanEmbeddedOperatorOperation | null
  boundProgressRowId: BoundedAsciiToken | null
  allowedPredecessorSectionId: BoundedAsciiToken | null
  startMarker: BoundedAsciiToken
  endMarker: BoundedAsciiToken
  utf8ByteLength: CanonicalU64DecimalString
  sha256: LowercaseSha256
}

type PlanEmbeddedOperatorInvocationIdentity = {
  schemaVersion:
    'bob-builtin-analyze/wave0a-terminal-lf-action-invocation/v2'
  actionId: BoundedAsciiToken
  operation: PlanEmbeddedOperatorOperation
  boundProgressRowId: BoundedAsciiToken | null
  selectedWrapperSectionId: BoundedAsciiToken
  planRevision: LowercaseSha
  planBlobReaderExecutable: ExternalFileIdentity
  bootstrapExecutable: ExternalFileIdentity
  bootstrapProgramUtf8Sha256: LowercaseSha256
  powershellExecutable: ExternalFileIdentity
  commandContractSha256: LowercaseSha256
  exactArgvSha256: LowercaseSha256
  workingDirectory: ExternalDirectoryIdentity
  environmentNameValueManifestSha256: LowercaseSha256
  stdinFraming:
    'exact_library_bytes_then_exact_selected_wrapper_bytes_utf8_no_bom'
  callerInputs: 'none'
}

type PlanEmbeddedOperatorExactArgvHashPreimage = {
  schemaVersion:
    'bob-builtin-analyze/wave0a-terminal-lf-exact-argv-preimage/v1'
  bootstrap: readonly PlanEmbeddedOperatorCommandArgument[]
  planRevisionBefore: readonly PlanEmbeddedOperatorCommandArgument[]
  planBlobRead: readonly PlanEmbeddedOperatorCommandArgument[]
  planRevisionAfter: readonly PlanEmbeddedOperatorCommandArgument[]
  powershell: readonly PlanEmbeddedOperatorCommandArgument[]
}

type PlanEmbeddedOperatorEnvironmentHashPreimage = {
  schemaVersion:
    'bob-builtin-analyze/wave0a-terminal-lf-environment-preimage/v1'
  entries: readonly {
    name: BoundedAsciiToken
    value: PlanEmbeddedOperatorEnvironmentValue
  }[]
}

type PlanEmbeddedOperatorCommandContractHashPreimage = {
  schemaVersion:
    'bob-builtin-analyze/wave0a-terminal-lf-command-contract-preimage/v1'
  invocationSchemaVersion:
    'bob-builtin-analyze/wave0a-terminal-lf-action-invocation/v2'
  actionId: BoundedAsciiToken
  operation: PlanEmbeddedOperatorOperation
  boundProgressRowId: BoundedAsciiToken | null
  selectedWrapperSectionId: BoundedAsciiToken
  planRevision: LowercaseSha
  planBlobReaderExecutable: ExternalFileIdentity
  bootstrapExecutable: ExternalFileIdentity
  bootstrapProgramUtf8Sha256: LowercaseSha256
  powershellExecutable: ExternalFileIdentity
  exactArgvSha256: LowercaseSha256
  workingDirectory: ExternalDirectoryIdentity
  environmentNameValueManifestSha256: LowercaseSha256
  stdinFraming:
    'exact_library_bytes_then_exact_selected_wrapper_bytes_utf8_no_bom'
  callerInputs: 'none'
}

type PlanEmbeddedOperatorBundleIdentity = {
  schemaVersion:
    'bob-builtin-analyze/wave0a-terminal-lf-plan-embedded-operator-bundle/v2'
  planIdentity: RepoObjectIdentity
  extraction:
    'raw_committed_plan_blob_unique_lf_marker_interiors_no_markers'
  execution:
    'concatenate_fixed_sections_and_pipe_utf8_to_pinned_pwsh_stdin'
  librarySection: PlanEmbeddedOperatorSectionIdentity
  testSection: PlanEmbeddedOperatorSectionIdentity
  operationSections: readonly PlanEmbeddedOperatorSectionIdentity[]
  sectionRosterSha256: LowercaseSha256
  actionInvocations: readonly PlanEmbeddedOperatorInvocationIdentity[]
  actionInvocationRosterSha256: LowercaseSha256
}

type PlanEmbeddedOperatorSectionRosterHashPreimage = {
  schemaVersion:
    'bob-builtin-analyze/wave0a-terminal-lf-section-roster-preimage/v1'
  sections: readonly PlanEmbeddedOperatorSectionIdentity[]
}

type PlanEmbeddedOperatorActionInvocationRosterHashPreimage = {
  schemaVersion:
    'bob-builtin-analyze/wave0a-terminal-lf-action-invocation-roster-preimage/v1'
  actionInvocations: readonly PlanEmbeddedOperatorInvocationIdentity[]
}

type PlanEmbeddedOperatorBundleIdentityHashPreimage = {
  schemaVersion:
    'bob-builtin-analyze/wave0a-terminal-lf-plan-embedded-operator-bundle-identity-preimage/v2'
  bundleIdentity: PlanEmbeddedOperatorBundleIdentity
}

type PlanEmbeddedOperatorBundleCommitment = {
  schemaVersion:
    'bob-builtin-analyze/wave0a-terminal-lf-plan-embedded-operator-bundle-commitment/v1'
  planIdentity: RepoObjectIdentity
  sectionCount: 56
  actionInvocationCount: 54
  sectionRosterSha256: LowercaseSha256
  actionInvocationRosterSha256: LowercaseSha256
  operatorBundleIdentitySha256: LowercaseSha256
}

type PlanEmbeddedOperatorSelfTestWorkspaceIdentity = {
  schemaVersion:
    'bob-builtin-analyze/wave0a-terminal-lf-self-test-workspace/v1'
  temporaryParentIdentity: ExternalDirectoryIdentity & {
    canonicalPath:
      'C:/Users/stell/source/archives/bob_builtin_analyze'
    linkCount: CanonicalU64DecimalString
  }
  temporaryRootIdentity: ExternalDirectoryIdentity & {
    canonicalPath:
      'C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-29-wave0a-terminal-lf-operator-self-test'
    linkCount: '1'
  }
  protectedSentinelBeforeIdentity: ExternalFileIdentity & {
    canonicalPath:
      'C:/Users/stell/source/repos/bob_builtin_analyze/.worktrees/feature-integration-selection-design/docs/superpowers/specs/2026-08-29-wave0a-trusted-transcript-terminal-lf-exception-design.md'
  }
  protectedSentinelAfterIdentity: ExternalFileIdentity & {
    canonicalPath:
      'C:/Users/stell/source/repos/bob_builtin_analyze/.worktrees/feature-integration-selection-design/docs/superpowers/specs/2026-08-29-wave0a-trusted-transcript-terminal-lf-exception-design.md'
  }
  heldAncestorRosterSha256: LowercaseSha256
  parentInventoryBeforeSha256: LowercaseSha256
  temporaryRootFinalInventorySha256: LowercaseSha256
  parentInventoryAfterSha256: LowercaseSha256
  deletionProofSha256: LowercaseSha256
  temporaryRootWasAbsentBefore: true
  temporaryRootAbsentAfter: true
}

type PlanEmbeddedOperatorSelfTestReceipt = {
  schemaVersion:
    'bob-builtin-analyze/wave0a-terminal-lf-operator-self-test-receipt/v2'
  operatorBundleIdentitySha256: LowercaseSha256
  testCaseRosterSha256: LowercaseSha256
  testCaseCount: PositiveSafeInteger
  passedCaseCount: PositiveSafeInteger
  failedCaseCount: 0
  redObservationSha256: LowercaseSha256
  greenObservationSha256: LowercaseSha256
  workspaceIdentity: PlanEmbeddedOperatorSelfTestWorkspaceIdentity
  cleanupResult: 'temporary_root_removed_sentinel_unchanged'
  startedAt: CanonicalUtc
  completedAt: CanonicalUtc
}

type ExactGitRepositoryState = {
  exactHead: LowercaseSha
  statusPorcelainV1ZSha256: LowercaseSha256
  indexStageManifestZSha256: LowercaseSha256
  cachedDiffBinarySha256: LowercaseSha256
  workingTreeDiffBinarySha256: LowercaseSha256
  untrackedPathManifestSha256: LowercaseSha256
  untrackedContentManifestSha256: LowercaseSha256
  cachedPaths: readonly SafeRepositoryPath[]
  trackedWorktreePaths: readonly SafeRepositoryPath[]
  untrackedPaths: readonly SafeRepositoryPath[]
  stateSha256: LowercaseSha256
}

type TrustedApprovalMessage = {
  source: 'codex_trusted_transcript_v1'
  threadId: '019f89ad-da0a-7103-9224-c5dbb2c320ba'
  messageId: SafeId
  role: 'assistant_announcement' | 'assistant_prompt' | 'user_approval'
  normalizedText: BoundedUtf8String
  normalizedUtf8Sha256: LowercaseSha256
  observedAt: CanonicalUtc
  ordinal: PositiveSafeInteger
}
```

`BoundedUtf8String`はUTF-8/NFCで、個々のmessage textは1..4,096 bytes、`rawRecord`は1..16,384 bytesとする。sidecar全体のcanonical UTF-8 bytesは1..65,536。canonical JSONはUTF-8、sorted keys、terminal LF 1個を要求し、BOM、CRLF、duplicate key、accessor/caller objectを受理しない。captureはself-test完了後、まだ未知の`evidenceRootIdentity.dev` / `ino`だけを最大20桁のcanonical U64値へ置換したpre-root size envelopeをbounded memoryでcanonical化し、65,536 bytes以下の場合だけfixed evidence rootをcreate-newする。root identity取得後に全actual fieldを持つcandidate sidecarを改めてcanonical化し、candidate byte lengthが記録済みenvelope以下かつ1..65,536 bytesであることを確認してからsidecar leafをcreate-newする。schema-valid actual identityはenvelopeを超えないため、超過は別の正常なpost-root armではなく実装・schema driftである。その場合はrootを既存のまま保持して新しい承認待ちで停止し、推測削除・再利用しない。投影値を受入条件にせず、pre-root envelopeとactual candidate bytesの両方へhard gateを適用する。

Task 0前のcapture、Task 0 read-only verification、claim/receipt、manifest/progress、completionはrepository sourceへbootstrap実装を追加しない。後続実装計画のcommitted blobへ、共通PowerShell/C# library、portable/real-Windows self-test、各operation wrapperを一意なASCII start/end marker付きsectionとして収録する。markerはplan blob内に各一回だけ存在し、section bytesはstart marker直後のLFからend marker直前まで、markerを含めずLF line endingのUTF-8 raw bytesとして抽出する。section identity、roster、command contractの宣言は全marker interiorの外に置き、宣言が自分または別section interiorと重なる場合を拒否する。nested/duplicate/missing marker、CR/CRLF、working-tree bytes、caller text、別commit/pathを拒否する。

実装計画はsectionごとのordinal、role、operation、progress-row binding、allowed predecessor、marker、byte length、SHA-256と、ordinal sort済みsection roster hashを本文へ固定する。library/test/wrapperのrole組合せ、全ordinal、predecessor、operation bindingをclosed rosterと照合し、`progress_row` wrapperは一つのliteral row IDだけへ結合する。25 repository commit slicesのstart/completeに50 progress-row wrappers、`capture` / `task0_verify` / `consume` / `complete`に4 wrappersを要求するため、sectionはlibrary 1 + test 1 + operation wrapper 54のexact 56件、action invocationはoperation wrapperと一対一のexact 54件とする。54 actionの`selectedWrapperSectionId`集合は54 operation-wrapper section IDsの完全なpermutationで、重複・欠落がなく、各invocationの`operation`と`boundProgressRowId`は選択sectionの同fieldへexact一致する。50 literal progress row IDsは各一回だけbindし、4 non-progress wrappersは`boundProgressRowId:null`を各一回だけ持つ。これらはsection interior bytesのhashであり、plan自身のcommit/blob/SHA-256をplan bytesへ埋め込まない。commit後に`planIdentity`を導出し、同じcommitted blobから全section identityと全action invocation identityを再計算して完全な`PlanEmbeddedOperatorBundleIdentity/v2`を構成する。

`sectionRosterSha256`は`UTF8('bob-builtin-analyze/wave0a-terminal-lf-section-roster/v1') || 0x00 || sectionRosterPreimageCanonicalBytes`、`actionInvocationRosterSha256`は`UTF8('bob-builtin-analyze/wave0a-terminal-lf-action-invocation-roster/v1') || 0x00 || actionInvocationRosterPreimageCanonicalBytes`、`operatorBundleIdentitySha256`は`UTF8('bob-builtin-analyze/wave0a-terminal-lf-plan-embedded-operator-bundle-identity/v2') || 0x00 || bundleIdentityPreimageCanonicalBytes`の各SHA-256として再導出する。三つのpreimage rootはそれぞれ上記`PlanEmbeddedOperatorSectionRosterHashPreimage`、`PlanEmbeddedOperatorActionInvocationRosterHashPreimage`、`PlanEmbeddedOperatorBundleIdentityHashPreimage`のexact own-key setだけを持つ。`sections`はbundleの`[librarySection, testSection, ...operationSections]`とcanonical object単位でbyte-identical、`actionInvocations`はbundleの同arrayと同順・同objectでbyte-identicalでなければならず、別arrayをhashするsplit viewを拒否する。section rosterはordinal順・56件・重複なし、action invocation rosterとbundleの同arrayは`actionId`のUTF-8 byte順・54件・重複なしで各operation wrapperへ一対一対応させる。bundle preimageは完全な`PlanEmbeddedOperatorBundleIdentity/v2`を一fieldも省略せず包含し、その中のsection SHA-256、二つのroster SHA-256、bootstrap/program/argv/environment/command SHA-256、plan blob SHA-256を全てpreimageへ含める。commitmentの`operatorBundleIdentitySha256`だけはbundle identity型のfieldではないためpreimageへ入らず、自己参照しない。

canonical JSON valueはRFC 8785/JCSのobject-key orderingとJSON string serializationを使い、入力stringを先にNFCへ固定し、unpaired surrogateを拒否する。keyはown enumerable data propertyだけ、numberはsafe integerだけをshortest decimal・非指数表記で表し、literal `true` / `false` / `null`以外のprimitive表現を持たない。JCS bytesへterminal LF一個を追加したものを本設計のcanonical bytesとし、UTF-8、BOM/生CRなし、solidusの任意escapeや非ASCIIの任意`\u` escapeを許可しない。accessor、`toJSON`、unknown/missing key、sparse array、非finite number、`-0`を拒否する。bundle identity preimage canonical bytesは1..262,144 bytesとする。

完全な56-section / 54-action ledgerはcommitted plan blobと実行中のbounded memoryにだけ保持し、sidecar、self-test receipt、claimへ配列を再展開しない。外部recordへはplan identity、exact counts、二つのroster hash、完全bundle hashだけを持つ`PlanEmbeddedOperatorBundleCommitment`を保存する。capture、Task 0、claimの各境界はcaller提供のledger、commitment、hashまたは別bundle artifactを受理せず、exact committed plan blobから完全bundleを独立再構成した後にcommitmentの全fieldを照合する。

各操作は、計画がmarker外へliteral固定した一つのaction-specific command-contract templateだけで起動する。templateはfuture plan commit用のmetavariable `PC`をrevision-bearing fieldだけに持ち、plan commit後に`operatorBundle.planIdentity.containingCommitSha`を一括substitutionして、選択済みwrapper section、raw plan blobを読むpinned executableとactual exact argv、最小bootstrap executableとprogram hash、pinned PowerShell executable、`-NoLogo` / `-NoProfile` / `-NonInteractive` / stdin executionを含むactual exact argv、canonical cwd、closed environment name/value manifest、stdin framingを持つ`PlanEmbeddedOperatorInvocationIdentity/v2`を構成する。`planRevision`と全revision-bearing argv itemは同じsubstituted PCへ一致し、template自身、PC occurrence locations、substitution countはplan blobがliteral固定する。action-specific launcherだけがcommitted `RepoObjectIdentity`とcapture時のprovider observationまたは後続の永久evidence chainからPCを再導出し、authorityではないequality guardとしてbootstrap argvへ渡す。CLI、user、generic caller、environmentからPCまたは別revisionを受け取らず、callerは値を入力・置換できない。

`bootstrapProgramUtf8Sha256`は`UTF8('bob-builtin-analyze/wave0a-terminal-lf-bootstrap-program/v1') || 0x00 || exactProgramUtf8Bytes`、`exactArgvSha256`は`UTF8('bob-builtin-analyze/wave0a-terminal-lf-exact-argv/v1') || 0x00 || exactArgvPreimageCanonicalBytes`、`environmentNameValueManifestSha256`は`UTF8('bob-builtin-analyze/wave0a-terminal-lf-environment/v1') || 0x00 || environmentPreimageCanonicalBytes`、`commandContractSha256`は`UTF8('bob-builtin-analyze/wave0a-terminal-lf-command-contract/v1') || 0x00 || commandContractPreimageCanonicalBytes`の各SHA-256とする。exact programは7-bit ASCII、BOM/CR/NULなし、LF line ending、1..12,000 bytesとする。`bootstrap` argvはexact 4 items `['-e', exactProgramUtf8String, '--', PC]`で、index 1のUTF-8 bytesが`exactProgramUtf8Bytes`へbyte-identicalでなければならない。残る4 named arraysでchild-process引数境界を保持し、各arrayは1..32 items、各argumentはstrict UTF-8/NFC、NULなし、0..16,384 bytesとし、`exactArgvPreimageCanonicalBytes`全体を1..131,072 bytesに制限する。各processについて`2 * executablePathUtf16CodeUnits + 1 + Σ(2 * argumentUtf16CodeUnits + 3) <= 32,766`の保守的Windows command-line envelopeをspawn前に要求し、実際のargv item境界はshellを介さずprocess APIへ渡す。environmentは1..32 entries、canonical preimage全体1..65,536 bytesで、entry名はASCII uppercase `^[A-Z][A-Z0-9_]{0,63}$`、ASCII byte順、case-insensitive重複なし、valueはstrict UTF-8/NFC、NULなし、0..8,192 bytes、planがliteral固定するexact name/value集合とする。command contract preimageは`invocationSchemaVersion`を含み、`commandContractSha256`以外のinvocation semantic fieldsを上記closed型へ全て複製し、他の三hash、actual PC、全executable identity、cwd、stdin framingを含める。

substitution後の`planRevisionBefore`と`planRevisionAfter` argvはexact `['rev-parse','--verify',PC + '^{commit}']`、`planBlobRead` argvはexact `['cat-file','blob',PC + ':docs/superpowers/plans/2026-08-29-wave0a-trusted-transcript-terminal-lf-exception.md']`、`powershell` argvはexact `['-NoLogo','-NoProfile','-NonInteractive','-Command','-']`とする。bootstrapは前後revision outputが同じPCであること、raw blobから再導出したGit blob OIDとSHA-256が`operatorBundle.planIdentity`のPO/PSへ一致すること、captureではprovider approval triplet、以後は永久sidecar/claim/receipt/progress chainから再導出したPC/PO/PSへ一致することを、各operationの最初のauthority checkとして要求する。current HEADはTask 0/consumeまではPC、progress/completeではrow-specific repository stateが要求するPC descendantであり、PCとの同一性を要求しない。別revision、working-tree read、caller revision/path、HEAD-relative plan readを拒否する。bootstrapはこのraw blobから全section/action identityを検証し、固定libraryとcontractが選択した一つのwrapperだけを連結してPowerShell stdinへ渡す。operation selectorを受けるgeneric driverは作らず、caller argv/path/JSON/text、environment-selected mode、profile、network、script file、repository import、working-tree fallbackを全て拒否する。planから抽出・検証・連結・起動する主体もこのaction-specific contractであり、contract外の手作業または別bootstrapを許可しない。

capture wrapperは固定archive rootへ触れる前に、planがliteral固定したarchive parentをstable held ancestorからno-followで開き、固定leaf `2026-08-29-wave0a-terminal-lf-operator-self-test`が存在しないことを確認してcreate-newする。全ancestorとroot handleを保持し、dev/ino/reparse、link count、canonical path、parent/root inventoryを固定する。corrected design fileの固定absolute pathとplan記載の完全な`ExternalFileIdentity`をread-only protected sentinelとしてheld handleで開き、before/afterのpath/dev/ino/size/time/link/reparse/hashを全て一致させる。callerはparent/root/sentinelを指定できない。

test sectionを作成したroot内へ先にmaterializeしてlibrary不在のREDを観測し、次にcommitted planからlibrary bytesを同じrootへmaterializeして同じcase rosterをGREENにする。case rosterはportable schema/transcript testsとreal-Windows held-ancestor/create-new/reparse/hard-link/race/crash testsを含み、root内の固定relative-path allowlist以外を作成しない。GREEN後は保持中の同一root identity配下だけをallowlist照合して削除し、held parent相対の同一leaf/identity関係を再検証してrootだけを削除する。成功前のprocess crash、初回確認時にroot既存、identity/allowlist driftでは既存rootをadopt・repair・deleteせず、新しい明示承認まで停止する。case count、RED/GREEN raw receipt hashes、held ancestor、parent/root inventories、deletion proof、sentinelの完全identityと完全bundle hashをclosed self-test receiptへ固定し、全件pass、root absent、sentinel byte/identity不変の場合だけfixed evidence rootの作成へ進む。self-test receiptは完全bundle配列を再掲せずtop-level commitmentと同じ`operatorBundleIdentitySha256`を保存する。Task 0はplan blobから56/54のtool/test/wrapper/command-contract台帳を再導出し、counts、両roster hash、完全bundle hashを独立再検証する。

```ts
type TerminalLfComparisonExceptionRecord = {
  schemaVersion:
    'bob-builtin-analyze/wave0a-composed-plan-terminal-lf-comparison-exception/v2'
  purpose: 'compare_one_pinned_composed_plan_user_approval_only'
  mutationAuthority: false
  scope: 'one_time_local_comparison_only_no_campaign_repository_or_remote_mutation'
  maxUses: 1
  evidenceRootIdentity: ExternalDirectoryIdentity & {
    canonicalPath:
      'C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-29-wave0a-composed-plan-terminal-lf-comparison-exception'
  }
  approvedExceptionIdentity: {
    design: RepoObjectIdentity
    implementationPlan: RepoObjectIdentity
  }
  operatorBundleCommitment: PlanEmbeddedOperatorBundleCommitment
  captureSelfTestReceipt: PlanEmbeddedOperatorSelfTestReceipt
  targetPlanIdentity: RepoObjectIdentity
  authoringProviderLogPrefix: ProviderLogPrefixIdentity
  captureProviderLogPrefix: ProviderLogPrefixIdentity
  targetTranscript: {
    source: 'codex_trusted_transcript_v1'
    threadId: '019f89ad-da0a-7103-9224-c5dbb2c320ba'
    assistantAnnouncement: ProviderMessageObservation
    assistantPrompt: ProviderMessageObservation
    userApproval: ProviderMessageObservation
  }
  comparison: {
    operation:
      'remove_exactly_one_terminal_byte_0x0a_from_pinned_user_message_for_equality_only'
    allowedSubjectMessageId:
      'msg_01a04879-8fe1-7fc0-8424-3a1e835afef5'
    requiredTerminalByteHex: '0a'
    promptUtf8ByteLength: 238
    userUtf8ByteLength: 239
    promptNormalizedUtf8Sha256:
      '11fe1f35881a718f3e8409e508bfc0925eb94b39088b64a2b1d45f51fdeb9e0c'
    userNormalizedUtf8Sha256:
      '9376e598f24c8e6cb6b96ff5f3e841e616e043ebef33290e14112db2c378cfbb'
    result: 'equal_after_exact_single_terminal_lf_exclusion'
  }
  exceptionApproval: {
    assistantAnnouncement: ProviderMessageObservation
    assistantPrompt: ProviderMessageObservation
    userConfirmation: ProviderMessageObservation
  }
  consumer: {
    canonicalPath:
      'C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-27-wave0a-approved-addenda-composed-plan-approval/approval.json'
    purpose: 'implement_approved_wave0a_root_and_removal_addenda'
    useMarker: 'successful_create_new'
    maxUses: 1
  }
  implementationUse: {
    claimCanonicalPath:
      'C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-29-wave0a-composed-plan-terminal-lf-comparison-exception/implementation-consumption-claim.json'
    receiptCanonicalPath:
      'C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-29-wave0a-composed-plan-terminal-lf-comparison-exception/implementation-consumption-receipt.json'
    completionCanonicalPath:
      'C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-29-wave0a-composed-plan-terminal-lf-comparison-exception/implementation-completion.json'
    purpose: 'consume_one_pinned_composed_plan_implementation_approval'
    maxUses: 1
  }
  capturedAt: CanonicalUtc
}
```

`TerminalLfComparisonExceptionRecord/v1`、`PlanEmbeddedOperatorSelfTestReceipt/v1`、`TerminalLfImplementationConsumptionClaim/v1`と、外部record内へ完全な`PlanEmbeddedOperatorBundleIdentity`を展開する旧shapeは受理しない。これは未作成・未消費の外部証跡schemaを最初のcapture前に訂正するものであり、migration、dual parser、auto-upgradeを追加しない。top-level `operatorBundleCommitment.planIdentity`は`approvedExceptionIdentity.implementationPlan`へ完全一致し、self-test receiptとuse descriptorの`operatorBundleIdentitySha256`はそのcommitmentの同名fieldへ完全一致させる。

`authoringProviderLogPrefix`は2節の固定値へ完全一致させる。`captureProviderLogPrefix`は後続user confirmation recordのterminal LFを含む行末までを覆い、同じcanonical path/dev/inoを持ち、authoring prefixをbyte-for-byte prefixとして含む。両prefixとも全fileの将来appendを権威にせず、指定prefixのexact bytes/hashだけを権威とする。

provider observationをcaller-shaped JSONから組み立てない。held handleから`captureProviderLogPrefix.prefixByteLength`だけを読んでprefix hashを検証し、LF-delimited JSONL recordとしてparseする。各messageはそのprefix内のrecord boundaryに正確に一回だけ存在しなければならず、`rawRecord`はdelimiter LFを除くexact record bytesから得る。provider role/phase、message text、timestamp、thread metadataをrecordから再導出し、全`payload.type:'message'`を先頭から数えてordinalを再計算する。target tripletは2節のliteralへ一致し、exception approval tripletは6節のcommit後protocolへ一致する。capture prefixはuser confirmation recordのdelimiter LF直後で終了し、後続recordを含めない。

唯一のconsumerは、元composed planが固定した次のleaf pathとpurposeである。

```text
C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-27-wave0a-approved-addenda-composed-plan-approval/approval.json
purpose: implement_approved_wave0a_root_and_removal_addenda
```

sidecar、元approval leaf、implementation claim/receipt、全evidence manifest/progress leaf、completion leafは、stable volume/root anchorから各ancestor directoryをno-follow・handle-relativeに一componentずつ開いて全handleを保持し、fixed leafを保持済みparent handle相対のcreate-newで作る。作成前後に全ancestorとleafのidentity/canonical handle pathを再検証し、canonical bytesを書いてfileと全変更parent directoryをsyncし、同一handle再読込とno-follow reopen後のsize/SHA/FileIdentityを照合する。path-based open/create fallback、先行path check後の通常path create、symlink/reparse、hard link、上書き、rename fallback、別名leaf、caller-supplied pathを許可しない。

fresh evidence root自体も固定archive parentのheld handle相対でcreate-newし、parentをsync後に新directoryをno-follow handleで開き、canonical handle path、identity、完全empty enumerationを照合してからsidecarを書く。root作成後・sidecar作成前にcrashした場合、既存empty rootを推測採用せずfail closedとし、新しい承認なしに削除・再作成しない。sidecarは作成前に得たroot identityを`evidenceRootIdentity`へ保存し、以後のapproval/claim/receipt/progress/completion操作は同じroot handle identityへ一致させる。元approval rootが未作成の場合も同じ規則を使う。

生成する`approval.json`は既存generic schemaへoptional fieldを足さず、次の新しいclosed versionだけを使う。

```ts
type ComposedPlanApprovalWithTerminalLfException = {
  schemaVersion:
    'bob-builtin-analyze/wave0a-composed-plan-implementation-approval-with-terminal-lf-exception/v1'
  purpose: 'implement_approved_wave0a_root_and_removal_addenda'
  mutationAuthority: false
  maxUses: 1
  approvalRootIdentity: ExternalDirectoryIdentity & {
    canonicalPath:
      'C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-27-wave0a-approved-addenda-composed-plan-approval'
  }
  approvedPlanIdentity: RepoObjectIdentity
  trustedTranscript: {
    source: 'codex_trusted_transcript_v1'
    threadId: '019f89ad-da0a-7103-9224-c5dbb2c320ba'
    assistantAnnouncement: TrustedApprovalMessage
    assistantPrompt: TrustedApprovalMessage
    userApproval: TrustedApprovalMessage
  }
  approvalText:
    'WAVE0A-APPROVED-ADDENDA-COMPOSED-IMPLEMENTATION-V1 を承認 planCommit=7383d96c37b8a86cd32fe4114839ff3650a9280a planBlob=36f5377c813d686dd57fc82c299068784a932f46 planSha256=e3cf6684be198ee9289d3a0550087a36cb0516a1707a85125f57b04e3d35434e'
  comparisonException: {
    recordIdentity: ExternalFileIdentity
    operation:
      'remove_exactly_one_terminal_byte_0x0a_from_pinned_user_message_for_equality_only'
    subjectMessageId:
      'msg_01a04879-8fe1-7fc0-8424-3a1e835afef5'
  }
  capturedAt: CanonicalUtc
}
```

`TrustedApprovalMessage`はcomposed planの既存closed normalized message keysだけを持ち、user normalized body/hashは末尾LFを含む239-byte値のまま保存する。raw provider record/bodyはsidecarだけに保持し、approval recordへ重複させない。新schemaはtarget plan/purpose/message IDs/sidecar identity/operationへ全て一致した場合だけ受理し、通常のapproval validatorと2026-08-23 pinned exceptionを変更しない。これはexternal approval schemaのversion追加であり、42-schema campaign attachment registry、public保存schema、設定、APIの変更ではない。

sidecar作成後、approval leaf作成前のcrashは未消費として、同じsidecar bytes/identityを再検証した場合だけ再開できる。approval leafが存在する場合は同一bytesでも再作成・別leaf作成を拒否する。Task 0はsidecarとapprovalを同じheld-handle methodで再読し、provider membership、comparison、closed schemasを独立に再実行する。

`maxUses:1`のimplementation消費点はTask 0成功後、R1の最初のrepository mutation前に行うfixed claimの成功したcreate-newである。sidecarとapprovalは将来の`useId`を含めない。これにより自身のbytes/hashを入力にする循環を避ける。claim/receiptは次のclosed versionだけを使う。

```ts
type TerminalLfImplementationUseDescriptor = {
  purpose: 'consume_one_pinned_composed_plan_implementation_approval'
  scope: 'one_local_composed_plan_implementation_attempt'
  sidecarIdentity: ExternalFileIdentity
  approvalIdentity: ExternalFileIdentity
  approvedExceptionIdentity: {
    design: RepoObjectIdentity
    implementationPlan: RepoObjectIdentity
  }
  operatorBundleIdentitySha256: LowercaseSha256
  targetPlanIdentity: RepoObjectIdentity
  repository: {
    worktree: ExternalDirectoryIdentity & {
      canonicalPath:
        'C:/Users/stell/source/repos/bob_builtin_analyze/.worktrees/feature-integration-selection-design'
    }
    gitLink: ExternalFileIdentity & {
      canonicalPath:
        'C:/Users/stell/source/repos/bob_builtin_analyze/.worktrees/feature-integration-selection-design/.git'
    }
    worktreeAdminDirectory: ExternalDirectoryIdentity
    gitCommonDirectory: ExternalDirectoryIdentity
    task0State: ExactGitRepositoryState
    knownDraft: {
      repositoryPath:
        'tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs'
      sha256:
        '17234f43c7c264ff4d0c2abf04158c666fd81a0c434f88fcf6c5d3e11e1b877d'
    }
  }
  claimCanonicalPath:
    'C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-29-wave0a-composed-plan-terminal-lf-comparison-exception/implementation-consumption-claim.json'
  receiptCanonicalPath:
    'C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-29-wave0a-composed-plan-terminal-lf-comparison-exception/implementation-consumption-receipt.json'
  progressRosterSha256: LowercaseSha256
  completionCanonicalPath:
    'C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-29-wave0a-composed-plan-terminal-lf-comparison-exception/implementation-completion.json'
}

type TerminalLfImplementationConsumptionClaim = {
  schemaVersion:
    'bob-builtin-analyze/wave0a-terminal-lf-implementation-consumption-claim/v2'
  mutationAuthority: false
  maxUses: 1
  useDescriptor: TerminalLfImplementationUseDescriptor
  useId: LowercaseSha256
  createdAt: CanonicalUtc
}

type TerminalLfImplementationConsumptionReceipt = {
  schemaVersion:
    'bob-builtin-analyze/wave0a-terminal-lf-implementation-consumption-receipt/v1'
  purpose: 'record_consumption_before_first_repository_mutation'
  mutationAuthority: false
  maxUses: 1
  useId: LowercaseSha256
  claimIdentity: ExternalFileIdentity
  sidecarIdentity: ExternalFileIdentity
  approvalIdentity: ExternalFileIdentity
  status: 'consumed_before_first_repository_mutation'
  consumedAt: CanonicalUtc
}

type TerminalLfEvidenceObservation = {
  ordinal: PositiveSafeInteger
  evidenceId: BoundedAsciiToken
  evidenceKind:
    | 'repository_state'
    | 'git_commit'
    | 'command_receipt'
    | 'review_receipt'
    | 'external_file'
  sourceReceiptSha256: LowercaseSha256
  observedAt: CanonicalUtc
}

type TerminalLfPhaseEvidenceManifest = {
  schemaVersion:
    'bob-builtin-analyze/wave0a-terminal-lf-phase-evidence-manifest/v1'
  purpose: 'bind_one_progress_boundary_to_rederived_evidence'
  mutationAuthority: false
  useId: LowercaseSha256
  progressOrdinal: PositiveSafeInteger
  phaseId: BoundedAsciiToken
  boundary: 'start' | 'complete'
  requiredEvidenceRosterSha256: LowercaseSha256
  entries: readonly TerminalLfEvidenceObservation[]
  createdAt: CanonicalUtc
}

type TerminalLfImplementationProgressRecord = {
  schemaVersion:
    'bob-builtin-analyze/wave0a-terminal-lf-implementation-progress/v1'
  purpose: 'record_one_composed_plan_phase_boundary'
  mutationAuthority: false
  useId: LowercaseSha256
  ordinal: PositiveSafeInteger
  phaseId: BoundedAsciiToken
  boundary: 'start' | 'complete'
  predecessorIdentity: ExternalFileIdentity
  repositoryState: ExactGitRepositoryState
  evidenceManifestIdentity: ExternalFileIdentity
  recordedAt: CanonicalUtc
}

type TerminalLfImplementationCompletionRecord = {
  schemaVersion:
    'bob-builtin-analyze/wave0a-terminal-lf-implementation-completion/v1'
  purpose: 'permanently_close_one_composed_plan_implementation_use'
  mutationAuthority: false
  useId: LowercaseSha256
  predecessorIdentity: ExternalFileIdentity
  finalRepositoryState: ExactGitRepositoryState
  preCompletionEvidenceManifestIdentity: ExternalFileIdentity
  status: 'completed_no_further_repository_mutation'
  completedAt: CanonicalUtc
}
```

`task0State.exactHead`は`approvedExceptionIdentity.implementationPlan.containingCommitSha`へ一致させる。worktree pathは上のliteralだけであり、`.git` backpointerをheld handleから読んでworktree admin directoryを導出し、そのheld `commondir`からgit common directoryを導出する。caller pathや別worktreeを受理しない。`status --porcelain=v1 -z --untracked-files=all`、`ls-files --stage -z`、cached/working-tree binary diff、NUL-delimited untracked path/content manifestを固定tool/environmentからraw bytesで採り、個別SHA-256とclosed path集合を検証する。path arraysはordinal sort・重複なし・各83件以下とし、raw status/diff/manifestから再導出する。untracked content manifestはpath length/path/type/byte length/SHA-256をlength-prefixで結合し、symlink/reparseを拒否する。`stateSha256`はdomain separatorと同objectの`stateSha256`以外のcanonical fieldsから再導出する。claim直前にもTask 0と同じbytesを再取得し、`cachedPaths=[]`、`trackedWorktreePaths=[既知draft]`、`untrackedPaths=[]`を含む全stateが一致しなければ停止する。

`progressRosterSha256`は後続のidentity固定済み実装計画に列挙するexact ordered rosterから再導出する。各roster rowはordinal、phase/task ID、`start|complete`、fixed evidence-manifest leaf、fixed progress leaf、required-evidence roster hash、expected predecessor kind、owned changed-path集合を持つ。composed planの各top-level implementation phase `R1 -> Task 1 -> R2 -> Task 2 -> R3 -> R4`と、Task 1/Task 2が継承する全corridor taskについて、各repository-mutating commit/checkpointを一つの`start -> complete` pairへ分割し、最後にfixed completion leafを持つ。一つのpairへ複数commitを許可しない。後続計画は全rowとcanonical pathsをliteralで列挙する。leaf pathはevidence root直下の4桁ordinalと固定phase/boundary tokenから計画が固定し、glob、caller token、欠落、追加、順序変更を許可しない。ordinal 1のpredecessorはreceipt、以後は直前ordinalのprogress leaf、completionのpredecessorは最後のR4 complete leafである。

各roster rowのrequired-evidence rosterは、期待する`evidenceId`、kind、固定source pathまたは固定command/tool/argv/cwd/environment contract、commit parent/changed paths/tree contract、review source、receipt canonicalizationをliteralで列挙する。`TerminalLfPhaseEvidenceManifest.entries`は1..512件、ordinal sort・重複なしでそのrosterへbyte-for-byte対応し、各`sourceReceiptSha256`をheld repository/external handle、raw command receipt、またはtrusted review observationから独立再導出する。caller-provided entry/hashを受理しない。manifestはprogress leafより先に同rowのfixed leafへcanonical create-newし、その`ExternalFileIdentity`をprogress recordへ保存する。start manifest/progressは当該sliceの最初のrepository mutation前、complete manifest/progressは唯一のcommitとrequired gate/review成功後に作る。

`useId`は`UTF8('bob-builtin-analyze/wave0a-terminal-lf-implementation-use/v2') || 0x00 || useDescriptorCanonicalBytes`のSHA-256として再導出し、caller値を受理しない。descriptorはsidecar/approvalのexact identity、exception plan/spec、committed plan blobから再導出したplan-embedded operator bundleの完全hash、target plan、固定worktree/git identities、exact Task 0 state、既知draft、purpose、scope、固定claim/receipt/completion paths、progress roster hashを全て結合する。claim作成直前に完全な56-section / 54-action bundleを再構成し、top-level commitmentのcounts、両roster hash、`operatorBundleIdentitySha256`へ全て一致させる。claimは完全配列を複製せず同じ完全bundle hashだけをdescriptorへ保存し、receiptはclaim/sidecar/approvalの`ExternalFileIdentity`と同じ`useId`を保持する。

first R1 repository mutationはreceiptのcreate-new・sync・reopen検証とR1 start manifest/progress作成後だけ許可する。crash recoveryは、claimあり/receiptなしなら同じclaimを再検証してreceiptを一度だけ作成する。receipt後はfixed leaf集合をenumerateし、存在するmanifest/progress recordsがrosterの唯一のcontiguous prefixで、全predecessor identity/useId/state/manifest identityが連鎖する場合だけ再開する。

各pairのcrash armを次の三つへ閉じる。(1) start後・commit前はHEADがstart stateと同じで、計画owned pathだけのin-progress index/diff/untracked contentが再導出できる場合だけ同sliceを再開する。(2) commit後・complete manifest/progress前は、live HEADがstart recordのHEADを唯一のparentとするnon-merge一commitで、changed paths/tree/index/draft lineageがroster contractへ一致する場合だけ、そのcommitを再作成・amendせずadoptする。required gate/reviewをread-onlyで再実行し、成功receiptを再導出してfixed complete manifest/progressを一回だけ作る。(3) manifest作成後・progress作成前はmanifest identity/bytesを再検証してfixed progressだけを作る。gate/review前後のcrashは成功を推測せず再実行する。leaf create/write/sync/reopen前後のcrashでfixed leafが存在する場合は、期待canonical bytesへ完全一致するときだけ同じhandleで再sync/reopenしてadoptし、partial/mismatchなら上書き・削除せずfail closedにする。rollback、gap、二commit以上、別prefix/phase、既完了slice、別claim/receipt、identity/hash/useId不一致を拒否する。

completion recordはR4の全commit/gateとR4 complete manifest/progress完了後にfixed leafへcreate-newする。`preCompletionEvidenceManifestIdentity`はR4 complete progressが参照する同じmanifest identityであり、そのmanifestはcompletion bytes/identity/postscriptを入力に含めない。completion作成後はread-only reporting以外のrepository mutationを拒否する。sidecar、approval、claim、receipt、manifest、progress、completionの全root/leafは永久保持し、rename・delete・truncate・overwrite・cleanup対象化を禁止する。completionありの再開、または一件でも存在する消費/progress履歴に対するmarker欠落・非contiguous prefixはfail closedとする。receiptと各manifest/progress identityは後続recordのpredecessor/evidenceとして固定する。completion identityはrepository bytesやpre-completion candidate evidenceへ後記せず、外部read-only完了報告へ出力し、将来の別承認によるexternal control requestだけが入力として参照できる。Task 0のread-only再検証はuseではないが、claim後の再開は必ず同じ永久chainへ結び付ける。

時刻はprovider recordと同じhost clockからcanonical UTCで採り、`exception confirmation observedAt <= sidecar capturedAt <= approval capturedAt <= claim createdAt <= receipt consumedAt <= evidence manifest createdAt <= progress recordedAt（各ordinal順） <= completion completedAt`を要求する。逆転、未来値、同ordinalの複数recordを拒否する。

## 6. Addendum自身の承認プロトコル

本設計書のcommitだけでは比較例外を有効にしない。written specの確認後、後続実装計画を別commitに固定し、次の順序で同一trusted task内のdistinct provider observationsを取得する。

`PC/PO/PS`は後続実装計画のlowercase 40/40/64-hex commit/blob/SHA-256、`DC/DO/DS`は本訂正を含む最新設計書commitのlowercase 40/40/64-hex commit/blob/SHA-256である。実装計画はcommit前に既知の`DC/DO/DS`をliteralで固定し、`PC/PO/PS`を次のtemplate内のexact metavariableとして再掲する。plan bytesは自分自身の`PC/PO/PS`を含めない。planを一件commitした後、provider captureがcommitted plan pathから`PC/PO/PS`を再導出し、metavariableを一回ずつ置換した結果だけを承認言語とする。これはhash/commit fixed pointではなく、commit後identity substitutionである。

```text
assistant announcement:
Wave 0A terminal-LF comparison exception committed exceptionPlanCommit=PC exceptionPlanBlob=PO exceptionPlanSha256=PS exceptionDesignCommit=DC exceptionDesignBlob=DO exceptionDesignSha256=DS

assistant prompt:
WAVE0A-TERMINAL-LF-COMPARISON-EXCEPTION-V1 を承認 exceptionPlanCommit=PC exceptionPlanBlob=PO exceptionPlanSha256=PS exceptionDesignCommit=DC exceptionDesignBlob=DO exceptionDesignSha256=DS

user confirmation bytes:
UTF8(assistant prompt literal with substituted identities) || 0x0A
```

1. assistant announcementのnormalized body全体はsubstituted announcement literalへbyte-identicalで、provider role/phase/semantic roleは`assistant` / `final_answer` / `exception_announcement`とする。
2. 後のdistinct assistant promptのnormalized body全体はsubstituted prompt literalへbyte-identicalで、provider role/phase/semantic roleは`assistant` / `final_answer` / `exception_prompt`とし、そこでyieldする。
3. 後のdistinct user confirmationのraw/normalized body全体はsubstituted prompt literalにterminal `0x0A`を正確に一つ付加したbytesで、provider role/phase/semantic roleは`user` / `null` / `exception_confirmation`とする。これはpromptとの寛容比較ではなく、事前定義されたuser confirmation literalそのもののexact検証である。

三件は同一thread、distinct message IDs、strict ordinal/time orderを要求する。template前後の説明、Markdown fence、prefix/suffix、identity省略または追加fieldをmessage bodyへ含めない。

assistant promptにLFを追加しない。user confirmationのraw/normalized bodyは末尾LFを含む値としてhash・保存し、除去後のhashへ置換しない。0 LF、2 LF、CR、CRLF、space suffix、second line、generic `承認`、wrong identity、assistant echo、別thread/copyを拒否する。

承認captureは5節の`comparison-exception.json`へ含める。このaddendum approvalが許可するのは、固定sidecarと固定`approval.json`の作成、Task 0から元composed planのlocal implementation/candidate evidence範囲へ進むことだけである。main/remote/PR、campaign/control authority、current project/protected/campaign branch・worktree cleanupは引き続き別承認である。

## 7. Composed planへの限定supersession

後続実装計画の承認後、composed planの次の記述だけを置換する。

| Composed plan契約 | 限定置換 |
| --- | --- |
| 61行と87行のprompt/user byte-identical比較 | 2節の固定tripletについてだけ4節のexact-one-LF比較を使う |
| 65行と87行のapproval closed record | 5節の固定sidecar identityとcomparison operationを追加し、他のfield/安全条件を維持する |
| Task 0より前のcapture実装ownership | identity固定済みimplementation plan blob内のsectioned operatorだけを使い、repository source/testを変更せずfixed sidecarとapprovalを作成する。Task 0は同じplan blobのread-only verify wrapperだけを使う |
| Task 0 Step 1のHEAD chain | `HEAD=exception implementation plan commit`、`HEAD^=bundle commitment訂正を含む最新設計書commit`、`HEAD^^=e15b77aea11e11db165eff0670a29280c35b3c3c`、`HEAD^^^=08a6540e5ad93e16aba21a69f9d47748c123d5ac`、`HEAD^^^^=7383d96c...`、`HEAD^^^^^=3f70335f...`を要求する |
| Task 0 Step 2の`C=HEAD`と動的`C/O/S` | `HEAD`はexception implementation plan identityの検証だけに使う。target approvalの`C/O/S`はsidecarの固定`targetPlanIdentity`=`7383d96c...` / `36f5377c...` / `e3cf6684...`から再導出し、固定target tripletへ照合する。exception design/implementation-plan identitiesと6節のaddendum approval tripletは別のclosed照合として検証する |
| Task 6Cのclosed changed-path集合 | frozen 75 pathsと既存delta 6 pathsに次の2 pathsだけを加え、sort済み83 pathsへ訂正する |

追加する2 pathsは次のliteralだけである。

```text
docs/superpowers/plans/2026-08-29-wave0a-trusted-transcript-terminal-lf-exception.md
docs/superpowers/specs/2026-08-29-wave0a-trusted-transcript-terminal-lf-exception-design.md
```

Task 6CとR4は`allowedChangedPaths.length === 83`、frozen 75 + literal delta 8、ordinal sort、重複なし、`git diff --name-only B...H`とのbyte-for-byte一致を独立に要求する。75、80、81、82、84、追加2件の欠落/順序違反/余分なpath、glob、directory-prefix許可を全て拒否する。

## 8. 明示的に変更しないもの

- composed planのannouncement/prompt literal、same thread、distinct IDs、strict ordinal/time order、`maxUses:1`、purpose、`mutationAuthority:false`
- 通常のapproval validatorと2026-08-23の旧fingerprint/sidecar例外
- root/descendant union、4 GiB inclusive cap、stable directory identity、same-handle lifecycle、crash prefix、entry/depth/plan/campaign caps
- 42-schema registry、15-operation roster、20-node DAG、21 evidence-contract rows、public command/API、保存schema、VSIX version、dependency
- R1/R2/R3/R4の順序とreview/TDD/native/full gate
- 元XLSX改修、OOXML安全化、実機受入証跡
- main/origin main、remote/PR、campaign/control authority、protected clone、current project branch/worktree cleanup

本追補のために`.gitattributes`、一般line-ending規則、generic canonical JSON、message normalizerを変更しない。新しいpublic export、runtime flag、環境変数、fallbackを追加しない。

terminal-LF比較と外部証跡操作の実装はcommitted plan blob内のprivate operational sectionsだけであり、`featureIntegrationCampaignPolicy.mjs`、そのtest、将来の`wave0a-windows-native.ps1`へ例外modeを追加しない。R1以後のsource/test変更は元composed planが既に所有する実装だけであり、本例外をgeneric runtimeへ昇格させない。

5節のsidecar、versioned external `approval.json`、claim、receipt、manifest、progress、completionとembedded self-test receiptはrepository外の本追補専用証跡である。これは42-schema campaign attachment registry、public保存schema、既存generic approval schemaを変更または緩和するものではない。

## 9. 受入・拒否matrix

| Case | Expected |
| --- | --- |
| 固定triplet、固定plan、user=`prompt + 0x0A`、承認済みsidecar、fresh fixed approval leaf | accept exactly once |
| userが0 LFまたは2 LF | reject |
| user末尾がCR/CRLF、space、tab、Unicode whitespace、second line | reject |
| announcementまたはpromptにLFを付加 | reject |
| 先行user IDs、同一本文の別message、別thread、別plan/purpose | reject |
| text hashだけ一致しraw record hash/ordinal/time/role/phaseが不一致 | reject |
| target/exception message recordが固定prefix内のrecord boundaryに存在しない、または複数回存在 | reject |
| capture prefixがuser confirmationのdelimiter LF直後で終わらない、authoring prefixを含まない、path/dev/ino/hashが不一致 | reject |
| committed plan blobのexact 56 sections / 54 action invocations、全marker/section/marker外identity宣言、ordinal/role/operation/predecessor roster、action-specific capture contract、pinned executables/argv/cwd/environment/stdin framingを再導出し、二つのroster hash、完全bundle hash、compact commitment、RED/GREEN self-test、fixed temporary root/protected sentinel/cleanupが全て一致し、capture prefixとclosed recordもexact verification済み | admit that exact capture wrapper only |
| working-tree plan、duplicate/nested/overlapping marker、identity宣言がmarker interior内、section/roster drift、generic selector、別wrapper、script path/import、caller mode/argv/path/JSON、profile/network/cwd/environment variation/fallback | reject before archive access |
| self-test root/sentinelがcaller指定、rootが事前に存在、held ancestor/root identityまたはallowlist不一致、RED未観測、GREEN一件でも失敗、temporary inventory/sentinel完全identity/deletion proof不一致 | reject before fixed evidence root creation; do not adopt, repair, or delete an existing root |
| sidecar/approvalのextra/missing key、非canonical bytes、symlink/reparse、hard link、identity drift、旧full-bundle shape、55/57 sections、53/55 actions、roster順序・count・hash・commitment drift | reject |
| 上記全preconditionとexact selected capture wrapperだけが成功し、fixed evidence rootをheld archive parent相対でcreate-newしてempty/identity/syncを検証 | accept root creation once |
| evidence root作成後・sidecar作成前のcrash、既存empty root、path-based directory create | reject pending new authorization |
| 旧2026-08-23 exception artifact/fingerprintの流用 | reject |
| fixed approval leafが既存、または二回目/別名への使用 | reject |
| sidecar作成後・approval作成前のcrashで同じsidecar identityを再検証 | resume before first use |
| approval作成後のTask 0 read-only再検証 | accept as verification, not a second use |
| Task 0成功後、fresh claimとreceiptを順にcreate-new・sync・reopen検証 | consume once, then permit first R1 mutation |
| worktree/admin/common-dir pathまたはidentity、exact plan HEAD、index/diff/untracked Task 0 stateが不一致 | reject before claim |
| claimあり/receiptなしでcrashし、同じdescriptor/identity/useIdを再検証 | create the fixed receipt once and resume |
| claim/receiptとcontiguous manifest/progress prefixが揃い全predecessor/state/useId/manifest identityが一致 | adopt only the slice selected by that prefix |
| receiptのみ、二個目のclaim、別path、descriptor/identity/useId不一致 | reject |
| receipt検証前のrepository mutation | reject and do not repair forward |
| progressのgap、rollback、別phase、extra leaf、最新recordより古いHEAD/index/diff | reject |
| start後・commit前のcrashでowned in-progress stateだけが存在 | resume the same slice without another start record |
| exact single commit後・complete manifest/progress前のcrash | adopt that commit only after parent/path/tree/gate/review revalidation, then create missing records |
| complete manifestあり・progressなしでmanifest identity/rosterが一致 | create the fixed progress leaf once |
| manifest/progress create中のcrashでleafがexact canonical bytes | resync/reopen and adopt; partial or mismatched bytes reject |
| R4完了後にfixed completion leafをcreate-newし全chainを再検証 | close the use permanently |
| completionが自身のidentity/postscriptをpre-completion evidenceへ含める | reject self-reference |
| completion後の再開、またはsidecar/approval/claim/receipt/manifest/progress/completionのdelete/rename/欠落 | reject |
| capture/claim/receipt/manifest/progress/completion timestampが規定順序に反する | reject |

後続実装計画はplan-embedded test sectionを先に固定temporary rootへmaterializeし、library不在のREDを観測してから固定library bytesをmaterializeする。case rosterはexact fingerprint/message IDs/hashes、0/1/2 LF、CRLF、別message、replay、section宣言のmarker内配置、wrapper取り違え、generic selector/caller input、argv/cwd/environment drift、external create-new/no-follow/sync/reopen、fixed root/sentinel ownership、race、全crash境界を固定する。さらにexact 56 sections / 54 action invocations、両roster hash、完全bundle hash、compact commitment、sidecarのactual 65,536-byte hard capを固定する。55/57 sections、53/55 actionsに加え、56/54を保った一件duplicate + 別一件omit、二actionの同一wrapper選択、operationまたはbound rowとsectionの不一致、同じprogress rowの二重bind、roster順序変更、一field/一byte置換を個別REDにする。section preimageだけを内部整合した別のschema-valid 56件へ置換してhashを再計算するsplit viewと、action preimageだけを内部整合した別のschema-valid 54件へ置換してhashを再計算するsplit viewも個別REDにする。各hash preimageのbare array化、wrapper schema変更、nested section/command/plan hashの省略、argv item境界の結合、bootstrap argv index 1とprogram bytesの不一致、environment名のcase crossing、PCのprogram bytesまたは非指定template fieldへの埋込み、PO/PSのprogram/argv埋込み、actual argvのPC不一致、current descendant HEADをPCと誤比較する実装も個別REDにする。PC templateは指定locationの一件欠落、一件重複、substitution count不一致、pre-substitution roster hashをactual hashとして流用するcaseを個別REDにする。RFC 8785/JCSのcross-runtime golden vectorsはcomposed/decomposed `é`、solidus、quote/backslash、U+0000..U+001F escape、non-ASCII、unpaired surrogate拒否、ASCII外keyを含むUTF-16 object-key ordering代表vectorを含め、NodeとPowerShell/.NETで同じcanonical bytes/hashを要求する。pre-root sidecar envelopeは65,535 / 65,536 / 65,537 bytes、bundle preimageは262,143 / 262,144 / 262,145 bytes、bootstrap programは11,999 / 12,000 / 12,001 bytes、argv preimageは131,071 / 131,072 / 131,073 bytes、Windows command-line envelopeは32,765 / 32,766 / 32,767 UTF-16 code unitsを固定する。post-root actual candidateは記録済みenvelope以下を受理し、envelope超過を独立したsize armではなくinternal consistency failureとしてroot保持・停止にする。comparison record `/v1`、self-test receipt `/v1`、claim `/v1`、`/v2`へのlegacy full bundle併記、別planのcompact commitment、caller commitmentを全てREDにする。repository側は通常のbyte-identical approval testと83-path policy testを元計画どおり維持し、この例外用source/test変更がなくgeneric pathへ到達しないことをdiff/source gateで確認する。

## 10. 文書作成ゲートと停止点

訂正段階で変更するrepository fileも本書一件だけである。既存のunstaged draft `tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs`、原本plan/spec、source、test、JSON assetを変更・stageしない。

訂正文書限定gateは次とする。初版design commitとbytes、stage前後のindex、既知draft、全porcelain集合を明示的に固定する。

```powershell
$TerminalLfSpec = 'docs/superpowers/specs/2026-08-29-wave0a-trusted-transcript-terminal-lf-exception-design.md'
$KnownDraft = 'tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs'
$ExpectedHead = 'e15b77aea11e11db165eff0670a29280c35b3c3c'
$ExpectedOriginalSpecBlob = '20e0d77de4034ca4d2a66b89869ed1b7cc90865e'
$ExpectedOriginalSpecSha256 = 'f9b82de9ba5c8a0f82f87e75f13fa6dd2ea663310e2c167bbe6c22e0335fa41e'
$ExpectedDraftSha256 = '17234f43c7c264ff4d0c2abf04158c666fd81a0c434f88fcf6c5d3e11e1b877d'
$ExpectedInitialStatus = @(
  ' M docs/superpowers/specs/2026-08-29-wave0a-trusted-transcript-terminal-lf-exception-design.md'
  ' M tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs'
)
$ExpectedStagedStatus = @(
  'M  docs/superpowers/specs/2026-08-29-wave0a-trusted-transcript-terminal-lf-exception-design.md'
  ' M tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs'
)
$ExpectedCommittedStatus = @(
  ' M tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs'
)

function Assert-TerminalLfStatus([string[]] $Expected) {
  $TerminalLfActualStatus = @(git status --porcelain=v1 --untracked-files=all)
  $TerminalLfStatusDelta = @(Compare-Object -CaseSensitive -ReferenceObject $Expected -DifferenceObject $TerminalLfActualStatus)
  if ($TerminalLfActualStatus.Count -ne $Expected.Count -or $TerminalLfStatusDelta.Count -ne 0) {
    throw 'unexpected working tree status set'
  }
}

if ((git rev-parse HEAD).Trim() -cne $ExpectedHead) { throw 'unexpected HEAD' }
if ((git rev-parse "HEAD:$TerminalLfSpec").Trim() -cne $ExpectedOriginalSpecBlob) { throw 'unexpected original spec blob' }
$OriginalSpecBlobSha256 = (node -e "const c=require('node:crypto'),p=require('node:child_process').spawnSync('git',['cat-file','blob',process.argv[1]],{encoding:null});if(p.status!==0)process.exit(p.status??1);process.stdout.write(c.createHash('sha256').update(p.stdout).digest('hex'))" "HEAD:$TerminalLfSpec").Trim()
if ($OriginalSpecBlobSha256 -cne $ExpectedOriginalSpecSha256) { throw 'unexpected original spec bytes' }
if (@(git diff --cached --name-only).Count -ne 0) { throw 'index must start empty' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $KnownDraft).Hash.ToLowerInvariant() -cne $ExpectedDraftSha256) { throw 'known draft changed' }
Assert-TerminalLfStatus $ExpectedInitialStatus

git diff --check
if ($LASTEXITCODE -ne 0) { throw 'unstaged diff check failed' }
$UnfinishedTokenPattern = @(
  ('TO' + 'DO')
  ('TB' + 'D')
  ('FIX' + 'ME')
  ('PLACE' + 'HOLDER')
  ('X' + 'XX')
) -join '|'
$UnfinishedTokenHits = @(rg -n -i -- $UnfinishedTokenPattern $TerminalLfSpec)
if ($LASTEXITCODE -gt 1) { throw 'unfinished-token scan failed' }
if ($UnfinishedTokenHits.Count -ne 0) { throw 'unfinished token found' }
git add -- $TerminalLfSpec

$CachedPaths = @(git diff --cached --name-only)
if ($CachedPaths.Count -ne 1 -or $CachedPaths[0] -cne $TerminalLfSpec) { throw 'unexpected staged path set' }
Assert-TerminalLfStatus $ExpectedStagedStatus
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'staged diff check failed' }
node --test scripts/three-extension-documentation-contract.test.js
if ($LASTEXITCODE -ne 0) { throw 'documentation contract failed' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $KnownDraft).Hash.ToLowerInvariant() -cne $ExpectedDraftSha256) { throw 'known draft changed during gate' }
$TerminalLfCachedPathsAfterTests = @(git diff --cached --name-only)
if ($TerminalLfCachedPathsAfterTests.Count -ne 1 -or $TerminalLfCachedPathsAfterTests[0] -cne $TerminalLfSpec) { throw 'staged path set changed during tests' }
Assert-TerminalLfStatus $ExpectedStagedStatus

git commit --only -m 'docs: compact Wave 0A operator bundle evidence' -- $TerminalLfSpec
if ($LASTEXITCODE -ne 0) { throw 'documentation commit failed' }
if ((git rev-parse HEAD^).Trim() -cne $ExpectedHead) { throw 'unexpected documentation commit parent' }
$TerminalLfCommitPaths = @(git diff-tree --no-commit-id --name-only -r HEAD)
if ($TerminalLfCommitPaths.Count -ne 1 -or $TerminalLfCommitPaths[0] -cne $TerminalLfSpec) { throw 'unexpected documentation commit path set' }
if (@(git diff --cached --name-only).Count -ne 0) { throw 'index not empty after commit' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $KnownDraft).Hash.ToLowerInvariant() -cne $ExpectedDraftSha256) { throw 'known draft changed after commit' }
Assert-TerminalLfStatus $ExpectedCommittedStatus
git diff --quiet HEAD -- $TerminalLfSpec
if ($LASTEXITCODE -ne 0) { throw 'committed spec is not clean' }
$TerminalLfCommittedBlobSha256 = (node -e "const c=require('node:crypto'),p=require('node:child_process').spawnSync('git',['cat-file','blob',process.argv[1]],{encoding:null});if(p.status!==0)process.exit(p.status??1);process.stdout.write(c.createHash('sha256').update(p.stdout).digest('hex'))" "HEAD:$TerminalLfSpec").Trim()

$TerminalLfCommittedIdentity = [pscustomobject]@{
  Commit = (git rev-parse HEAD).Trim()
  Blob = (git rev-parse "HEAD:$TerminalLfSpec").Trim()
  Sha256 = $TerminalLfCommittedBlobSha256
  WorktreeSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $TerminalLfSpec).Hash.ToLowerInvariant()
}
$TerminalLfCommittedIdentity | Format-List
```

このgateで本書一件だけをlocal bundle-commitment correction commitに固定し、commit changed-path集合が本書だけ、parentが`e15b77aea11e11db165eff0670a29280c35b3c3c`、indexが空、既知draftだけが同じSHA-256のunstaged fileとして残ることを再検証する。訂正commit/blob/SHA-256を提示してwritten spec reviewを得る。その承認前に実装計画を書かない。実装計画commitの別exact approval前にsidecar、`approval.json`、claim/receipt、Task 0、source/test変更を行わない。

## 11. plan-context限定訂正の権威と停止観測

本節以降は `WAVE0A-PLAN-CONTEXT-INTERVAL-DEREFERENCE-CORRECTION-V1` として、承認済み旧実装計画のcaptureが外部作成前に停止した事実だけを訂正する。旧commitをrewrite、amend、replace、deleteしない。以下では旧設計を`DC0/DO0/DS0`、旧planを`PC0/PO0/PS0`、本書の訂正commit後identityを`DC1/DO1/DS1`、後続訂正planのcommit後identityを`PC1/PO1/PS1`と呼ぶ。

§§1–10は`DC0/PC0`を作成した時点のhistorical contractとして保持する。`DC1/PC1`については§§11–20が、§1の「比較規則とTask 0条件だけを置換する」という旧範囲制限と旧plan authoring permission、§7のTask 0 plan lineage、§9の95-case前提、§10の旧design authoring gateだけを限定的にsupersedeする。§1の旧permissionは`PC0`を作成して終了しており、`PC1`の作成を許可しない。§20が`DC1`に対する唯一のauthoring gateであり、HEAD=`e15b77a...`を要求する§10を再実行しない。四operand、exact two-version history、96-case roster、real-context gate以外の§§1–10契約は継承する。

| Authority | Fixed identity |
| --- | --- |
| `DC0/DO0/DS0` | `613ff084f51340e7439f8adb2d26707a53d2e80a` / `4ad9d5ee074edaaeb8927311550c086c286a2d47` / `0e900bc12fd07c4d3947d5a3a99e8b803bc3d0f69657d879939c9b928a1846b0` |
| `PC0/PO0/PS0` | `ea49f588c736e713125d03d774782b143c893091` / `2b4d83d483c36e81e2ea0581ce8e551f96495229` / `fa33f0cd719fb757d46e5f1043fb1d9083f50efb90e3089bd11a575a2663d682` |
| branch/worktree | `codex/feature-integration-selection-design` / `C:/Users/stell/source/repos/bob_builtin_analyze/.worktrees/feature-integration-selection-design` |
| known draft | `tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs`; SHA-256 `17234f43c7c264ff4d0c2abf04158c666fd81a0c434f88fcf6c5d3e11e1b877d` |

`PC0`へのexact approval tripletは一意に成立した。trusted launch gateはaction `a0010-capture`、approval message `msg_01a04e69-4160-7960-b1cd-317a8f0dc0ce`、exact argv SHA-256 `59c0589cb6a23e6ba2659bc381c8156895341b97056a1d43ec5cbca8dec14a7a`、section roster SHA-256 `d9c3e5316a83e902ad053d3b2b1154234a6f4e13f6fa4121ad4df345ff9764fa`、static runtime-core SHA-256 `ff98151717555828221c49c23874ef58692dde870c475d445a43fb7a756cca31`を再構成して成功した。その直後、PowerShell wrapperが`Get-WavePlanContext -ExpectedRevision PC0`を呼んだ時点で次のerrorによりexit 1となった。

```text
Wave0A bootstrap: PowerShell operation failed: Get-WavePlanContext:
The property 'FullCharEndExclusive' cannot be found on this object.
```

このfailure observationはprovider JSONL line `72722`、timestamp `2026-08-29T16:51:39.966Z`、output ID `ctco_01a04e6f-1d3e-7670-a8a6-8d5e8b4957f5`、call ID `call_wKWb8nLfX7U0gEjwEtU84U4j`、raw record 1,953 bytes / SHA-256 `8c4007673a3f57e89cd84113787689c2d5377277fb80a3079f9feb22a39d2d78`へ固定する。S0010 wrapperは`Initialize-WaveActionInvocation`でplan contextを構築してから`Invoke-Wave0ACapture`へ進むため、line 1693のfailure時点ではcapture function、archive access、self-test、evidence writeのいずれにも到達していない。

停止後のread-only確認では、次の三rootはすべて不存在である。

```text
C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-29-wave0a-composed-plan-terminal-lf-comparison-exception
C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-27-wave0a-approved-addenda-composed-plan-approval
C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-29-wave0a-terminal-lf-operator-self-test
```

sidecar、approval、claim、receipt、manifest、progress、completion、Task 0、source/test commitは一件も作成されていない。HEADは`PC0`、indexは空、porcelainは既知draft一件だけで、そのSHA-256も不変だった。`main == origin/main == c59db06ecb32eb7a57beeb3e932acdd5b4774de5`も不変である。したがって既存artifactのadopt、repair、rename、delete、migration、互換読込は設計しない。旧approval tripletは失敗した`PC0`に対する履歴証拠としてのみ残り、`PC1`を許可せず、useを消費した証拠にもならない。

本訂正設計書の作成権限は同一trusted taskの次のprovider observationで確認した。

| Role | Provider message ID | JSONL line / observedAt | decoded UTF-8 bytes / SHA-256 | raw record bytes / SHA-256 |
| --- | --- | --- | --- | --- |
| assistant correction request | `msg_05f07830af5cd031016a9311977d8c87d09e67ece63e54fe2a` | `73055` / `2026-08-29T17:06:30.362Z` | `406` / `90fe0b6dffcbe6d3ac15f8d27ca90ece951f8bd931103ca9928654c3bdff8bb6` | `782` / `939a47957dc12dc9b4abc3a5cebe478bb3f7804320972cf9dce4feeba4904d7d` |
| user authoring approval | `msg_01a04f0b-f397-7490-ad8c-681a45dd096e` | `73061` / `2026-08-29T19:42:58.455Z` | `87` / `926c86bf0c078e1688b223ab4780992cd357a37fd6376a331d231398cd526a3f` | `450` / `0a5d66eb5e85fb36c7ca1a68483538a0378d27549caccd8f17c33c1b402ef9b6` |

user decoded textはopening/closing backtick、closing backtick後のASCII space二つ、terminal LF一つを含み、CRを含まない。target phraseはUTF-8 byte offset 1にexactly once存在し、上記assistant requestより後の一件だけである。この権限は本書一件の編集、self-review、local commit、identity提示までに限る。訂正plan、外部root、capture、Task 0、source/test、remote、PR、main、cleanupを許可しない。

## 12. root causeと訂正単位

`Get-WaveDelimitedInterval`は単一の正常な`PSCustomObject`を返す。pipeline output混入、marker ambiguity、UTF-8 byte/character split、manifest overlapではない。実際の`PC0` section bytesによる最小再現では、最初のsection `s0001-library`を追加した後、二番目のsection `s0002-selftest`と比較する最初のcharacter armで同じ`PropertyNotFoundException`が発生した。

`Get-WavePlanContext`は各過去sectionを次のwrapperとして保存する。

```powershell
[pscustomobject]@{
  SectionId = [string]$Section.sectionId
  MarkerCode = [string]$Section.markerCode
  Interval = $Interval
}
```

一方、四つのpairwise checkはwrapper自身を`Test-WaveIntervalsDisjoint`へ渡す。calleeが要求する`FullCharStart`、`FullCharEndExclusive`、`FullByteStart`、`FullByteEndExclusive`はwrapper直下ではなく`wrapper.Interval`にある。訂正対象は次の四operandだけである。

| Unit / direction | `PC0` operand | corrected operand |
| --- | --- | --- |
| character / previous to current | `$Previous` | `$Previous.Interval` |
| character / current to previous | `$Previous` | `$Previous.Interval` |
| byte / previous to current | `$Previous` | `$Previous.Interval` |
| byte / current to previous | `$Previous` | `$Previous.Interval` |

`SectionIntervals`へraw intervalだけを保存する案は採用しない。下流`Get-WaveSectionBytes`は`SectionId`でwrapperを選択し、`Selected[0].Interval.BodyBytes`を読むため、wrapper shapeは正しい公開前private contractである。`Test-WaveIntervalsDisjoint`のgeneric property contract、marker抽出、section order、manifest shapeも変更しない。

既存95-case self-testがGREENだったのは、S0002が既に構成済みの`$script:WaveSelfTestPlanContext`を受け取り、`Get-WavePlanContext`を一度も呼ばないためである。production captureはself-test context設定より先に`Get-WavePlanContext`を呼ぶので、failure時にはself-test sectionへ到達しない。この順序自体は安全なfail-closed境界であり変更しない。検出漏れは、S0002のactual interval comparison、decoded production loopのstatic source/shape guard、postcommitとtrusted launchでactual `PC1`を読むreal-context gateの三段で閉じる。

## 13. 訂正方式の比較

| Approach | Decision | Reason |
| --- | --- | --- |
| A. 既存design/plan pathを二つの新commitで順次訂正する | 採用 | 旧objectsを保持し、固定83-path集合、固定root名、既存外部schemaを維持できる。history guardを明示的な二version遷移へ変える必要があるが、変更範囲をauthority layer内に閉じられる |
| B. 新しいdesign/plan pathを追加する | 不採用 | unique-add規則は単純になるが、base-to-final path集合が83から85へ増え、Task 6C/R4、completion verifier、policy/tests、evidence contractへ不要な変更を波及させる |
| C. shim、profile、type adapter、stdin前置、decoded bytes patch、temporary scriptで`PC0`を通す | 禁止 | committed section hash、exact stdin framing、no-caller-input、pinned program/argv、bundle commitmentと旧approval identityを破る。旧tripletの権限では認証できない |

採用案は旧commitを変更せず、同じ二pathに新しいhistoryを追加する。新しいgeneric correction framework、runtime flag、fallback、optional schema fieldは作らない。

## 14. exact correction lineage

`DC1`と`PC1`はcommit後に導出するlowercase 40-hexであり、本書bytesへ将来値を埋め込まない。後続planは次のhistoryをすべて固定値として検証する。

```text
PC1^  = DC1
DC1^  = PC0
PC0^  = DC0
```

full first-parent authority prefixは次へ一致させる。

```text
PC1 -> DC1 -> ea49f588c736e713125d03d774782b143c893091
    -> 613ff084f51340e7439f8adb2d26707a53d2e80a
    -> e15b77aea11e11db165eff0670a29280c35b3c3c
    -> 08a6540e5ad93e16aba21a69f9d47748c123d5ac
    -> 7383d96c37b8a86cd32fe4114839ff3650a9280a
    -> 3f70335f96d7fb14dceab7f6d3e2d4b71f07f98f
    -> 86670e2b7a76c9f866270314c000e1da9a8a43c2
```

各commitの変更pathはexactly oneである。

```text
DC1: docs/superpowers/specs/2026-08-29-wave0a-trusted-transcript-terminal-lf-exception-design.md
PC1: docs/superpowers/plans/2026-08-29-wave0a-trusted-transcript-terminal-lf-exception.md
```

後続planとtrusted launcherは次を独立に要求する。

1. design pathは`08a6540e5ad93e16aba21a69f9d47748c123d5ac`で一度だけaddされ、変更commit rosterはnewest-firstでexactly `[DC1, 613ff084f51340e7439f8adb2d26707a53d2e80a, e15b77aea11e11db165eff0670a29280c35b3c3c, 08a6540e5ad93e16aba21a69f9d47748c123d5ac]`、`DC1^`のblobが`DO0`、`DC1`のblobが`DO1`である。
2. `DC1`はsingle-parent `PC0`で、diff-tree changed pathはdesign path一件だけである。
3. plan pathは`PC0`で一度だけaddされ、`PC1^`のblobが`PO0`、`PC1`のblobが`PO1`である。
4. `PC1`はsingle-parent `DC1`で、diff-tree changed pathはplan path一件だけである。
5. plan pathを変更したcommit rosterはnewest-firstでexactly `[PC1, PC0]`、add-filter rosterはexactly `[PC0]`である。`HEAD`から導出しても同じrosterである。
6. design/plan両pathのtouch rosterとadd-filter rosterをfixed argvから別々に再導出し、途中の別commit、replace ref、graft、shallow history、alternate object databaseを拒否する。
7. `HEAD=PC1`、index/admin/common-dir/root contract、known draft、tracked inventory、object database leaseが後続planのTask 0条件へ一致する。

`PC0`の「current plan revision自身がunique add commit」というguardは、上記のexact two-version transitionに限って置換する。任意のmodified plan、三version目、別add commit、同一blobの別commit、new path、working-tree fallbackを一般許可しない。PowerShell S0001、全54 action-specific Node bootstrap、trusted pre-bootstrap launcherの三境界で同じhistoryを別実装として再導出する。

## 15. private operatorの訂正

後続planは既存56 sections / 54 actions / 50 progress rowsを維持する。section追加、action追加、wrapper selector追加は行わない。

S0001ではproduction loopの四operandだけを`$Previous.Interval`へ変更する。private helper、auto-unwrapping、wrapper shape validatorを追加せず、`Test-WaveIntervalsDisjoint`、`SectionIntervals` storage、既存の四overlap error semanticsをそのまま維持する。

S0002へcase ID `bundle.section-wrapper-interval-dereference`を追加し、self-test rosterを95から96へ増やす。一つのcase内で次を固定する。

- non-overlappingな二つのwrapped intervalを用意し、actual `Test-WaveIntervalsDisjoint`へ`.Interval`を渡すcharacter/byteの両方向が`true`になる。
- current/previousをoverlapさせた四armでactual `Test-WaveIntervalsDisjoint`がそれぞれ`false`になり、production-shaped `Assert-Wave(...)`式が既存のexact message `plan bundle section intervals overlap in character space`、`plan bundle section intervals overlap bidirectionally in character space`、`plan bundle section intervals overlap in byte space`、`plan bundle section intervals overlap bidirectionally in byte space`をoperator prefix付きでthrowする。
- decoded production `Get-WavePlanContext`のsource/shape contractがcorrected four call sitesをexactly one set持ち、bare `$Previous` operandの旧四callを0件にする。
- `Get-WaveSectionBytes`が`SectionId`選択と`.Interval.BodyBytes`を引き続き使えることを確認する。

S0002の実行前にcontext構築が必要という順序は変えないため、このcaseだけをcapture admission proofにしない。後述するpostcommit real-context gateが、actual `PC1` plan blob、actual 56-section manifest、actual production `Get-WavePlanContext`を先に実行して補完する。

全54 Node bootstrapの`planGuard`は14節のhistoryへ更新する。action ID、selected wrapper、operation、bound row、exact argv item boundary、closed environment、pinned executable、stdin framing、program capは変更しない。action-specific Brotli payloadを再生成し、各payloadが同じ共通history guardと固有ACTION/WRAPPERだけを持つことをauthoring gateで比較する。

## 16. preapproval regressionと生成ゲート

訂正planのauthoringは、commit前static gate、commit後real-context gate、exact approval前trusted-launch gateの三段階とする。

### 16.1 commit前static gate

- decoded S0001に旧四callが0件、production loop内のcorrected four-arm codeがexactly one set存在する。
- decoded S0002にcase IDがexactly once存在し、96件のsorted unique roster/hashへ一致する。
- all 56 marker intervalsとmanifest intervalがcharacter/byteの両空間で非重複である。
- 54 bootstrapをdecompressし、history guardが14節へ一致し、旧unique-current-add guardが0件である。
- section 56、action 54、progress 50、finalChangedPaths 83、environment 26を維持する。
- NodeとPowerShell/.NETのJCS golden、section/action/static-core/bundle preimage cross-runtime比較を再実行する。
- root-cause/PowerShell semantics、history/authority、bundle/hash regenerationを別担当のread-only reviewとして三件実施し、critical findingが0件になるまでplan commitへ進まない。

### 16.2 commit後real-context gate

`PC1/PO1/PS1`導出後、trusted authoring taskはworking-tree planを読まず、pinned Gitで`PC1:<plan path>`をblobとして読む。canonical manifestとS0001をhash検証して抽出し、closed 26-entry environment、pinned PowerShell、fixed CWDでS0001だけをloadする。その後、design-approved fixed one-line read-only probeからproduction `Get-WavePlanContext -ExpectedRevision PC1`を呼ぶ。

probeはpath、mode、JSON、selector、environment、networkを受け取らず、repository/evidence write APIを呼ばない。次を出力してexit 0とする。

```text
revision = PC1
sectionIntervalCount = 56
firstSectionId = s0001-library
lastSectionId = s0999-complete
manifestDisjoint = true
allPairwiseDisjoint = true
```

probe bytes/hash、S0001 bytes/hash、exact argv、environment manifest、CWD、executablesをpostcommit gate invocation内で再構成して照合する。結果はそのprocessのexit/outputとして観測するだけで、repository file、external receipt、provider message、caller-supplied identityへ保存しない。

negative variantはhash-verified actual `PC1` S0001からdecodeしたlibrary bytesだけを入力とする。authoring gateはcorrected four call-site byte patternsが各exactly once、bare-wrapper old patternsが0件であることを先に確認し、design-approved replacement tupleで`.Interval`を除くexactly four scoped replacements（character/byte × forward/reverse）だけを行う。置換前後のbyte diffがその四rangeだけであること、byte length/hash、re-encoding round tripを独立に検証し、後続planへnegative library hashを固定する。negative bytesは別closed PowerShell processへだけ渡し、actual `PC1`、同じfixed probe/CWD/environment/executablesでnonzero exit、second section、`PropertyNotFoundException`、`FullCharEndExclusive`を要求する。corrected actual S0001は同じ条件で56件完走しなければならない。両processの前後で三external root不存在とrepository state不変を再確認する。negative bytesをfile、receipt、provider messageへ保存せず、capture stdinへ決して渡さない。

### 16.3 exact approval前trusted-launch gate

trusted launcherは`PC1/PO1/PS1`と`DC1/DO1/DS1`をinert dataとして受け、14節のhistory、all manifest commitments、selected capture program、exact argvを再構成する。captureを開始せず、16.2のfixed read-only probeをactual `PC1`から独立に再実行し、current repository stateと同じidentitiesで56件完走することを確認する。その後にだけ新しいannouncement/promptを一回ずつ提示する。postcommit gateの過去outputやunspecified receiptをauthorityとして受け取らない。

新しいuser confirmationは`PC1/PO1/PS1 + DC1/DO1/DS1`へbindしたdistinct exact tripletでなければならない。旧`PC0` triplet、同じ本文の別message、generic approval、assistant echo、0/2 LF、CR/CRLF、space suffix、別threadを拒否する。新triplet成立後もcapture action一件だけが許可され、remote/PR/main/cleanupは許可されない。

## 17. identity再生成範囲

future commitまたはfuture provider messageへ依存するidentityを先に要求しない。再生成を次の三phaseへ分け、各phaseで既知になったidentityだけをgateする。

### 17.1 plan precommit template/static phase

1. approved `DC1/DO1/DS1`とprotected design sentinelのsize/hash/time/object identity。
2. decoded PowerShell library identity。
3. S0001/S0002のUTF-8 byte lengthとSHA-256。
4. 96-case self-test roster count/hash。
5. static 56-section roster hashとstatic runtime-core hash。
6. common history guardを含む54 action program templates、各program hash、PC metavariable cardinality、argv template identity。
7. native source/assembly/reference roster、fixed executable/CWD/environment identity。

このphaseはfuture `PC1/PO1/PS1`、PC substitution後hash、provider prefix、approval message identityを要求しない。template/static identityが内部整合して初めてplan pathをstage/commitできる。

### 17.2 plan postcommit identity phase

1. final `PC1/PO1/PS1`、postcommit plan byte length、terminal exactly one LF、CR/NUL absence。
2. `PC1` substitution後の54 exact-argv hashesとcommand-contract hashes。
3. 54 action-invocation roster hash、full operator-bundle identity hash、compact commitment。
4. postcommit real-context probeのfixed bytes/hash、live exit/outputとcross-runtime golden identity。

このphaseが全てGREENになって初めてplan identityをuserへ提示できる。失敗したplan commitをamendせず、新しい訂正設計権限まで停止する。

### 17.3 pre-capture transcript phase

1. new announcement/prompt/user confirmationのdistinct message identitiesとexact body/hash/order。
2. user confirmation delimiter直後までのnew provider capture prefix identity。
3. trusted-launch preflightのselected action、exact argv、actual `PC1`から独立再実行したreal-context probe結果。

このphaseは`PC1` commitとpostcommit gateの後にだけ実行する。new exact triplet/prefixが成立して初めてcaptureを一回許可する。

native C# source/assemblyはinterval dereferenceに関与しないためsemantic変更しない。後続plan生成時に現行source/assembly bytesとcompiler/reference rosterを再計測し、同一identityであることを証明する。差がある場合は本訂正へ混入させず停止する。

## 18. 明示的に変更しないもの

- fixed external root/leaf names、canonical JSON schema、self-bound envelope、size caps、no-follow/create-new/sync/reopen契約
- provider prefix/triplet identity検証、terminal-LF限定比較、`maxUses: 1`、fixed purpose、`mutationAuthority: false`
- 56 sections、54 actions、50 progress rows、83 final paths、26 environment entries
- 42-schema registry、15-operation roster、20-node DAG、21 evidence-contract rows
- Task 0以後の25 implementation slices、owned paths、RED/GREEN/review順序
- public command/API、設定、保存schema、VSIX version、dependency、OOXML/XLSX/PDF fixtureと実機受入証跡
- main、origin/main、remote、PR、campaign/control authority、protected clone、branch/worktree cleanup
- known draftのbytes、stage状態、ownership
- `.gitattributes`、generic normalizer、public export、runtime flag、environment-selected mode、fallback

本訂正のrepository path deltaは0である。既存design pathとplan pathはすでに83-path集合に含まれ、同じpathの新commitはbase-to-final name集合を増やさない。

## 19. correction acceptance matrix

| Case | Expected |
| --- | --- |
| `DC1^=PC0`、design一path、`PC1^=DC1`、plan一path、plan touch history `[PC1,PC0]` | accept lineage |
| old commitsのamend/rewrite、replace/graft/shallow、third plan version、別plan path | reject before section execution |
| four armsが`Previous.Interval`を使い、real-context gateが56件完走 | accept context construction |
| one armでもwrapper自身、direction/unit欠落、helperとloopのsplit view | reject before approval |
| 96-case rosterとnew wrapper regressionがGREEN、old negative variantがexact failure | accept regression evidence |
| embedded self-testだけGREENでreal-context gateなし | reject as insufficient |
| section/action/progress/path/environment countが56/54/50/83/26以外 | reject |
| 54 bootstrapの一件だけ旧history guard、program/argv/contract hash drift | reject |
| old `PC0` tripletを`PC1`へ再利用 | reject |
| fixed rootsのいずれか既存、またはfailed capture artifactをadopt/repair/delete | reject pending separate authority |
| new exact triplet後、trusted gateがreal-context probeをactual `PC1`から再実行して56件完走 | admit capture action once |
| correction design/plan approvalからremote/PR/main/cleanupへ進む | reject as out of scope |

## 20. correction design authoring gateと停止点

本訂正設計段階で変更するrepository fileは既存の本書一件だけである。`PC0` plan、known draft、source/test、manifest、external rootsを変更しない。次のgateは本書編集後に実行する。

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

$CorrectionSpec = 'docs/superpowers/specs/2026-08-29-wave0a-trusted-transcript-terminal-lf-exception-design.md'
$ApprovedPlan = 'docs/superpowers/plans/2026-08-29-wave0a-trusted-transcript-terminal-lf-exception.md'
$KnownDraft = 'tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs'
$ExpectedHead = 'ea49f588c736e713125d03d774782b143c893091'
$ExpectedOriginalSpecBlob = '4ad9d5ee074edaaeb8927311550c086c286a2d47'
$ExpectedOriginalSpecSha256 = '0e900bc12fd07c4d3947d5a3a99e8b803bc3d0f69657d879939c9b928a1846b0'
$ExpectedPlanBlob = '2b4d83d483c36e81e2ea0581ce8e551f96495229'
$ExpectedPlanSha256 = 'fa33f0cd719fb757d46e5f1043fb1d9083f50efb90e3089bd11a575a2663d682'
$ExpectedDraftSha256 = '17234f43c7c264ff4d0c2abf04158c666fd81a0c434f88fcf6c5d3e11e1b877d'
$ExpectedBranch = 'codex/feature-integration-selection-design'
$ExpectedTopLevel = 'C:/Users/stell/source/repos/bob_builtin_analyze/.worktrees/feature-integration-selection-design'
$ExpectedGitDir = 'C:/Users/stell/source/repos/bob_builtin_analyze/.git/worktrees/feature-integration-selection-design'
$ExpectedCommonDir = 'C:/Users/stell/source/repos/bob_builtin_analyze/.git'
$ExpectedInitialStatus = @(
  ' M docs/superpowers/specs/2026-08-29-wave0a-trusted-transcript-terminal-lf-exception-design.md'
  ' M tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs'
)
$ExpectedStagedStatus = @(
  'M  docs/superpowers/specs/2026-08-29-wave0a-trusted-transcript-terminal-lf-exception-design.md'
  ' M tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs'
)
$ExpectedCommittedStatus = @(
  ' M tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs'
)
$ExternalRoots = @(
  'C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-29-wave0a-composed-plan-terminal-lf-comparison-exception'
  'C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-27-wave0a-approved-addenda-composed-plan-approval'
  'C:/Users/stell/source/archives/bob_builtin_analyze/2026-08-29-wave0a-terminal-lf-operator-self-test'
)

function Assert-CorrectionStatus([string[]] $Expected) {
  $Actual = @(git status --porcelain=v1 --untracked-files=all)
  $Delta = @(Compare-Object -CaseSensitive -ReferenceObject $Expected -DifferenceObject $Actual)
  if ($Actual.Count -ne $Expected.Count -or $Delta.Count -ne 0) { throw 'unexpected working tree status set' }
}

function Get-GitBlobSha256([string] $RevisionPath) {
  return (node -e "const c=require('node:crypto'),p=require('node:child_process').spawnSync('git',['cat-file','blob',process.argv[1]],{encoding:null,maxBuffer:64*1024*1024});if(p.status!==0)process.exit(p.status??1);process.stdout.write(c.createHash('sha256').update(p.stdout).digest('hex'))" $RevisionPath).Trim()
}

function ConvertTo-CorrectionPath([string] $Value) {
  $Normalized = [IO.Path]::GetFullPath($Value).Replace('\\', '/').TrimEnd('/')
  if ($Normalized -match '^[a-z]:') { $Normalized = $Normalized.Substring(0, 1).ToUpperInvariant() + $Normalized.Substring(1) }
  return $Normalized
}

function Assert-CorrectionWorktree {
  $Branch = (@(git branch --show-current) -join '').Trim()
  $TopLevel = (@(git rev-parse --show-toplevel) -join '').Trim()
  $GitDir = (@(git rev-parse --absolute-git-dir) -join '').Trim()
  $CommonDir = (@(git rev-parse --git-common-dir) -join '').Trim()
  $Superproject = (@(git rev-parse --show-superproject-working-tree) -join '').Trim()
  if ($Branch -cne $ExpectedBranch) { throw 'unexpected branch' }
  if ((ConvertTo-CorrectionPath $TopLevel) -cne $ExpectedTopLevel) { throw 'unexpected worktree root' }
  if ((ConvertTo-CorrectionPath $GitDir) -cne $ExpectedGitDir) { throw 'unexpected linked worktree git dir' }
  if ((ConvertTo-CorrectionPath $CommonDir) -cne $ExpectedCommonDir) { throw 'unexpected git common dir' }
  if (-not [string]::IsNullOrEmpty($Superproject)) { throw 'unexpected superproject' }
}

Assert-CorrectionWorktree
if ((git rev-parse HEAD).Trim() -cne $ExpectedHead) { throw 'unexpected HEAD' }
if ((git rev-parse "HEAD:$CorrectionSpec").Trim() -cne $ExpectedOriginalSpecBlob) { throw 'unexpected original spec blob' }
if ((Get-GitBlobSha256 "HEAD:$CorrectionSpec") -cne $ExpectedOriginalSpecSha256) { throw 'unexpected original spec bytes' }
if ((git rev-parse "HEAD:$ApprovedPlan").Trim() -cne $ExpectedPlanBlob) { throw 'unexpected approved plan blob' }
if ((Get-GitBlobSha256 "HEAD:$ApprovedPlan") -cne $ExpectedPlanSha256) { throw 'unexpected approved plan bytes' }
if (@(git diff --cached --name-only).Count -ne 0) { throw 'index must start empty' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $KnownDraft).Hash.ToLowerInvariant() -cne $ExpectedDraftSha256) { throw 'known draft changed' }
if (@($ExternalRoots | Where-Object { Test-Path -LiteralPath $_ }).Count -ne 0) { throw 'external root unexpectedly exists' }
Assert-CorrectionStatus $ExpectedInitialStatus

git diff --check
if ($LASTEXITCODE -ne 0) { throw 'unstaged diff check failed' }
$UnfinishedTokenPattern = @((('TO' + 'DO')), (('TB' + 'D')), (('FIX' + 'ME')), (('PLACE' + 'HOLDER')), (('X' + 'XX'))) -join '|'
$PSNativeCommandUseErrorActionPreference = $false
try {
  $UnfinishedTokenHits = @(rg -n -i -- $UnfinishedTokenPattern $CorrectionSpec)
  $UnfinishedTokenExit = $LASTEXITCODE
} finally {
  $PSNativeCommandUseErrorActionPreference = $true
}
if ($UnfinishedTokenExit -gt 1 -or $UnfinishedTokenHits.Count -ne 0) { throw 'unfinished token scan failed' }

git add -- $CorrectionSpec
$CachedPaths = @(git diff --cached --name-only)
if ($CachedPaths.Count -ne 1 -or $CachedPaths[0] -cne $CorrectionSpec) { throw 'unexpected staged path set' }
Assert-CorrectionStatus $ExpectedStagedStatus
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'staged diff check failed' }
node --test scripts/three-extension-documentation-contract.test.js
if ($LASTEXITCODE -ne 0) { throw 'documentation contract failed' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $KnownDraft).Hash.ToLowerInvariant() -cne $ExpectedDraftSha256) { throw 'known draft changed during gate' }
if ((git rev-parse "HEAD:$ApprovedPlan").Trim() -cne $ExpectedPlanBlob) { throw 'approved plan changed during gate' }
if (@($ExternalRoots | Where-Object { Test-Path -LiteralPath $_ }).Count -ne 0) { throw 'external root created during gate' }
Assert-CorrectionWorktree
Assert-CorrectionStatus $ExpectedStagedStatus

git commit --only -m 'docs: correct Wave 0A plan context interval dereference' -- $CorrectionSpec
if ($LASTEXITCODE -ne 0) { throw 'correction design commit failed' }
if ((git rev-parse HEAD^).Trim() -cne $ExpectedHead) { throw 'unexpected correction design parent' }
$CommitPaths = @(git diff-tree --no-commit-id --name-only -r HEAD)
if ($CommitPaths.Count -ne 1 -or $CommitPaths[0] -cne $CorrectionSpec) { throw 'unexpected correction design path set' }
if (@(git diff --cached --name-only).Count -ne 0) { throw 'index not empty after commit' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $KnownDraft).Hash.ToLowerInvariant() -cne $ExpectedDraftSha256) { throw 'known draft changed after commit' }
if ((git rev-parse "HEAD:$ApprovedPlan").Trim() -cne $ExpectedPlanBlob) { throw 'approved plan changed after commit' }
if ((Get-GitBlobSha256 "HEAD:$ApprovedPlan") -cne $ExpectedPlanSha256) { throw 'approved plan bytes changed after commit' }
if (@($ExternalRoots | Where-Object { Test-Path -LiteralPath $_ }).Count -ne 0) { throw 'external root created after commit' }
Assert-CorrectionWorktree
Assert-CorrectionStatus $ExpectedCommittedStatus

$CommittedIdentity = [pscustomobject]@{
  Commit = (git rev-parse HEAD).Trim()
  Blob = (git rev-parse "HEAD:$CorrectionSpec").Trim()
  Sha256 = Get-GitBlobSha256 "HEAD:$CorrectionSpec"
  WorktreeSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $CorrectionSpec).Hash.ToLowerInvariant()
}
$CommittedIdentity | Format-List
```

commit後に`DC1/DO1/DS1`を提示し、user written-spec reviewを得る。その承認前に`superpowers:writing-plans`を開始せず、訂正planを編集しない。written-spec approval後に作る訂正planも別local commitとし、`PC1/PO1/PS1 + DC1/DO1/DS1`へbindした新しいexact plan approval前にcapture、外部artifact、Task 0、source/test mutationを行わない。
