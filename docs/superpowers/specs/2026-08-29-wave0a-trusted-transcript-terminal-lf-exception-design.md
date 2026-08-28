# Wave 0A trusted transcript terminal-LF 比較例外の限定設計追補

- Addendum ID: `WAVE0A-TERMINAL-LF-COMPARISON-EXCEPTION-V1`
- Status: 提案。追補文書の作成のみ承認済み。比較例外の適用、外部capture、Task 0、source/test実装の再開は、identity固定済み実装計画に対する別承認待ち。
- Date: 2026-08-29
- Repository: `katamor1/bob_builtin_analyze`
- Base checkpoint: `7383d96c37b8a86cd32fe4114839ff3650a9280a`
- Scope: composed-plan実装承認のうち、固定された一つのassistant promptと一つのuser approvalの本文比較だけ。

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

`BoundedUtf8String`はUTF-8/NFCで、個々のmessage textは1..4,096 bytes、`rawRecord`は1..16,384 bytesとする。sidecar全体のcanonical UTF-8 bytesは1..65,536。canonical JSONはUTF-8、sorted keys、terminal LF 1個を要求し、BOM、CRLF、duplicate key、accessor/caller objectを受理しない。

```ts
type TerminalLfComparisonExceptionRecord = {
  schemaVersion:
    'bob-builtin-analyze/wave0a-composed-plan-terminal-lf-comparison-exception/v1'
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
        '17234f43c7c264ff4d0c2abf04158c666fd81a0c434f88fcf6c5d3e11b877d'
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
    'bob-builtin-analyze/wave0a-terminal-lf-implementation-consumption-claim/v1'
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

`useId`はdomain separator `bob-builtin-analyze/wave0a-terminal-lf-implementation-use/v1`と`useDescriptor`のcanonical JSON bytesからSHA-256で再導出し、caller値を受理しない。descriptorはsidecar/approvalのexact identity、exception plan/spec、target plan、固定worktree/git identities、exact Task 0 state、既知draft、purpose、scope、固定claim/receipt/completion paths、progress roster hashを全て結合する。claim作成時にこれらをheld handleとraw Git outputから再導出し、receiptはclaim/sidecar/approvalの`ExternalFileIdentity`と同じ`useId`を保持する。

first R1 repository mutationはreceiptのcreate-new・sync・reopen検証とR1 start manifest/progress作成後だけ許可する。crash recoveryは、claimあり/receiptなしなら同じclaimを再検証してreceiptを一度だけ作成する。receipt後はfixed leaf集合をenumerateし、存在するmanifest/progress recordsがrosterの唯一のcontiguous prefixで、全predecessor identity/useId/state/manifest identityが連鎖する場合だけ再開する。

各pairのcrash armを次の三つへ閉じる。(1) start後・commit前はHEADがstart stateと同じで、計画owned pathだけのin-progress index/diff/untracked contentが再導出できる場合だけ同sliceを再開する。(2) commit後・complete manifest/progress前は、live HEADがstart recordのHEADを唯一のparentとするnon-merge一commitで、changed paths/tree/index/draft lineageがroster contractへ一致する場合だけ、そのcommitを再作成・amendせずadoptする。required gate/reviewをread-onlyで再実行し、成功receiptを再導出してfixed complete manifest/progressを一回だけ作る。(3) manifest作成後・progress作成前はmanifest identity/bytesを再検証してfixed progressだけを作る。gate/review前後のcrashは成功を推測せず再実行する。leaf create/write/sync/reopen前後のcrashでfixed leafが存在する場合は、期待canonical bytesへ完全一致するときだけ同じhandleで再sync/reopenしてadoptし、partial/mismatchなら上書き・削除せずfail closedにする。rollback、gap、二commit以上、別prefix/phase、既完了slice、別claim/receipt、identity/hash/useId不一致を拒否する。

completion recordはR4の全commit/gateとR4 complete manifest/progress完了後にfixed leafへcreate-newする。`preCompletionEvidenceManifestIdentity`はR4 complete progressが参照する同じmanifest identityであり、そのmanifestはcompletion bytes/identity/postscriptを入力に含めない。completion作成後はread-only reporting以外のrepository mutationを拒否する。sidecar、approval、claim、receipt、manifest、progress、completionの全root/leafは永久保持し、rename・delete・truncate・overwrite・cleanup対象化を禁止する。completionありの再開、または一件でも存在する消費/progress履歴に対するmarker欠落・非contiguous prefixはfail closedとする。receiptと各manifest/progress identityは後続recordのpredecessor/evidenceとして固定する。completion identityはrepository bytesやpre-completion candidate evidenceへ後記せず、外部read-only完了報告へ出力し、将来の別承認によるexternal control requestだけが入力として参照できる。Task 0のread-only再検証はuseではないが、claim後の再開は必ず同じ永久chainへ結び付ける。

時刻はprovider recordと同じhost clockからcanonical UTCで採り、`exception confirmation observedAt <= sidecar capturedAt <= approval capturedAt <= claim createdAt <= receipt consumedAt <= evidence manifest createdAt <= progress recordedAt（各ordinal順） <= completion completedAt`を要求する。逆転、未来値、同ordinalの複数recordを拒否する。

## 6. Addendum自身の承認プロトコル

本設計書のcommitだけでは比較例外を有効にしない。written specの確認後、後続実装計画を別commitに固定し、次の順序で同一trusted task内のdistinct provider observationsを取得する。

`PC/PO/PS`は後続実装計画のlowercase 40/40/64-hex commit/blob/SHA-256、`DC/DO/DS`は本設計書のlowercase 40/40/64-hex commit/blob/SHA-256である。実装計画は六値を自らの固定identityへ代入し、次のtemplate bytesを唯一の承認言語として再掲する。

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
| Task 0 Step 1のHEAD chain | `HEAD=exception implementation plan commit`、`HEAD^=本設計書commit`、`HEAD^^=7383d96c...`、`HEAD^^^=3f70335f...`を要求する |
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

5節のsidecar、versioned external `approval.json`、claim、receiptはrepository外の本追補専用証跡である。これは42-schema campaign attachment registry、public保存schema、既存generic approval schemaを変更または緩和するものではない。

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
| sidecar/approvalのextra/missing key、非canonical bytes、symlink/reparse、hard link、identity drift | reject |
| fixed evidence rootをheld archive parent相対でcreate-newし、empty/identity/syncを検証 | accept root creation once |
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

後続実装計画はpositive/negative testを先行REDにし、exact fingerprint/message IDs/hashes、0/1/2 LF、CRLF、別message、replay、external create-new/no-follow/sync/reopen、crash境界、83-path集合を固定する。通常のbyte-identical approval testも維持し、この例外がgeneric pathへ到達しないことを確認する。

## 10. 文書作成ゲートと停止点

この設計段階で変更するrepository fileは本書一件だけである。既存のunstaged draft `tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs`、原本plan/spec、source、test、JSON assetを変更・stageしない。

文書限定gateは次とする。`git diff --check`だけではuntracked fileを検査できないため、stage前後のindexと既知draftを明示的に固定する。

```powershell
$TerminalLfSpec = 'docs/superpowers/specs/2026-08-29-wave0a-trusted-transcript-terminal-lf-exception-design.md'
$KnownDraft = 'tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs'
$ExpectedHead = '7383d96c37b8a86cd32fe4114839ff3650a9280a'
$ExpectedDraftSha256 = '17234f43c7c264ff4d0c2abf04158c666fd81a0c434f88fcf6c5d3e11e1b877d'
$ExpectedInitialStatus = @(
  ' M tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs'
  '?? docs/superpowers/specs/2026-08-29-wave0a-trusted-transcript-terminal-lf-exception-design.md'
)
$ExpectedStagedStatus = @(
  'A  docs/superpowers/specs/2026-08-29-wave0a-trusted-transcript-terminal-lf-exception-design.md'
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
if (@(git diff --cached --name-only).Count -ne 0) { throw 'index must start empty' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $KnownDraft).Hash.ToLowerInvariant() -cne $ExpectedDraftSha256) { throw 'known draft changed' }
Assert-TerminalLfStatus $ExpectedInitialStatus

git diff --check
if ($LASTEXITCODE -ne 0) { throw 'unstaged diff check failed' }
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

git commit --only -m 'docs: design Wave 0A terminal-LF exception' -- $TerminalLfSpec
if ($LASTEXITCODE -ne 0) { throw 'documentation commit failed' }
if ((git rev-parse HEAD^).Trim() -cne $ExpectedHead) { throw 'unexpected documentation commit parent' }
$TerminalLfCommitPaths = @(git diff-tree --no-commit-id --name-only -r HEAD)
if ($TerminalLfCommitPaths.Count -ne 1 -or $TerminalLfCommitPaths[0] -cne $TerminalLfSpec) { throw 'unexpected documentation commit path set' }
if (@(git diff --cached --name-only).Count -ne 0) { throw 'index not empty after commit' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $KnownDraft).Hash.ToLowerInvariant() -cne $ExpectedDraftSha256) { throw 'known draft changed after commit' }
Assert-TerminalLfStatus $ExpectedCommittedStatus

$TerminalLfCommittedIdentity = [pscustomobject]@{
  Commit = (git rev-parse HEAD).Trim()
  Blob = (git rev-parse "HEAD:$TerminalLfSpec").Trim()
  Sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $TerminalLfSpec).Hash.ToLowerInvariant()
}
$TerminalLfCommittedIdentity | Format-List
```

このgateで本書一件だけをlocal commitし、commit changed-path集合が本書だけ、parentが`7383d96c37b8a86cd32fe4114839ff3650a9280a`、indexが空、既知draftだけが同じSHA-256のunstaged fileとして残ることを再検証する。commit/blob/SHA-256を提示してwritten spec reviewを得る。その承認前に実装計画を書かない。実装計画commitの別承認前にsidecar、`approval.json`、claim/receipt、Task 0、source/test変更を行わない。
