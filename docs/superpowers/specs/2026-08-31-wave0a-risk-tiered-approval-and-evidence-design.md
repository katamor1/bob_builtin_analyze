# Wave 0A リスク段階別承認・証跡簡素化設計

- Status: approved for implementation planning on 2026-08-31
- In-chat direction approved: 2026-08-31
- Date: 2026-08-31
- Repository: `katamor1/bob_builtin_analyze`
- Design branch: `codex/feature-integration-selection-design`
- Scope: Wave 0A と後続の機能取捨選択・main逐次統合で使う、利用者承認、実行境界、証跡、履歴移行

## 1. 決定

Wave 0A の承認方式を、provider transcript、完全一致文、terminal LF、commit/blob/SHA-256 の利用者転記に基づく方式から、次の三段階へ置き換える。

1. read-only の調査・設計・reviewは、依頼された目的の範囲なら追加承認なしで行う。
2. local worktree 内の限定実装は、人が理解できる作業範囲を一度提示し、自然文で承認された後は、実装、テスト、review、local commit、限定されたpackage生成まで継続する。
3. main、remote、PR、既存branch/worktree、既存データへ影響する操作は、操作直前に実対象と影響を提示して新しい確認を得る。

承認本文に固定書式は設けない。各taskで承認待ちの提示は一件だけをactiveにし、その提示へ直接応答した利用者turnの`はい`、`進めてください`、`この範囲で承認します`のような自然文を受理する。別task、過去の会話、処理済み応答から承認を再構成しない。新しい提示を出した場合、または目的、source、target、効果が変わった場合は前の提示を失効させる。hash、OID、message ID、改行、nonceの入力は求めない。

この設計は、過去のcommitと文書を削除・改変して歴史を書き換えるものではない。旧方式は履歴証跡として残すが、将来の実行権限には使わない。

## 2. 背景と問題

旧方式は、文書bytesを固定するたびに新しいcommit/blob/SHA-256、provider message metadata、terminal-LF例外、訂正planを追加した。その結果、安全に実装・統合する作業より、承認文と承認機構自身を証明する作業が大きくなった。

特に次の条件は、人の理解や同意を強くしない一方、転記ミスとtransport差分による停止を増やした。

- commit、Git blob OID、SHA-256を利用者が承認文へ複写する。
- provider JSONLのpath、prefix hash、message ID、ordinal、timestamp、role、phaseを承認の根拠にする。
- assistant announcement、assistant prompt、user responseの三件を完全一致させる。
- terminal LFの有無を利用者意思の一部として扱う。
- Markdown内の多数のbootstrap programと外部progress recordで各local commitを一回ずつ解放する。
- 同じlocal scopeのテスト、再試行、review、commitごとに新しい承認を要求する。

必要なのは、利用者が理解できる操作範囲への同意と、機械が行う対象・状態・差分の検証を分離することである。

## 3. 方式比較

| 方式 | 判断 | 理由 |
| --- | --- | --- |
| 自然文承認 + 三段階リスク境界 + 通常のGit/CI | 採用 | 利用者は影響を判断し、機械はidentityとstateを検証するという責務分離が明確。旧方式の大部分を廃止できる |
| 短いnonceを利用者に入力させ、provider transcript captureを縮小して残す | 不採用 | 完全hash転記より軽いが、現在の対話型local作業には独立したtrust boundaryを追加しない |
| 完全一致本文だけ緩和し、旧operator・sidecar・progress chainを残す | 不採用 | 既存2 MB超の計画と訂正連鎖を温存し、同じ問題を再発させる |

## 4. 三段階の権限境界

### A. 調査・設計・review

現在の依頼目的に必要なread-only操作は追加承認を要しない。

- repository、Git metadata、既存artifact、CI結果、文書、ソース、テストの読取り
- status、diff、log、branch/worktree inventory、dry-run、preflight
- 会話内または一時表示だけの設計案、実装計画、review所見の作成
- 変更を伴わない検証

読取りがcredential、個人データ、保護cloneなど別の明示的境界を越える場合は、その既存のアクセス規則を優先する。本設計はアクセス権限を拡大しない。

repositoryへ設計書・計画書・review記録を作成、編集、commitする操作はlocal mutationなのでBに分類する。

### B. 限定local作業

開始前に次を短い作業範囲として提示し、一度だけ自然文承認を得る。

- repository、worktree、branch
- 目的と変更種別
- 主な変更先または所有範囲
- 実行するテスト、review、local commitの有無
- packageまたはfresh fixtureを作る場合のresolved output root
- network、credential、外部endpointを使うか。使わない場合も`なし`と示す
- 明示的に含まない操作

承認された範囲には次を含められる。

- 指定worktree内のコード、テスト、文書の編集
- compile、test、lint、policy、packageなどのlocal検証
- 指定branchへの通常のlocal commit
- 指定generated output rootへのlocal package生成。現在taskが生成した再作成可能な出力だけを置換でき、保全artifactや出所不明の既存bytesを上書きしない
- 作業範囲に列挙した、新規かつ隔離されたbranch/worktreeの作成
- 作業範囲に列挙したfresh disposable fixtureの作成と、そのfixture rootだけの後片付け
- 同じ範囲での失敗修正、再検証、review対応、同一状態からのresume
- 作業範囲に明記した公開endpointからのcredentialなしdependency取得など、外部書込み、課金、非公開データ送信を伴わないnetwork read

次の場合は追加承認を求めない。

- タスク分割、テスト回数、local commit数が見積りから変わったが、目的・所有範囲・外部影響が変わらない。
- compile生成物やtest-owned一時ファイルを同じ限定root内で再生成する。
- commandがmutation前に失敗し、対象と効果が同一のまま再試行する。
- 機械検証でhash、mtime、CI、testに不一致が見つかり、同じlocal scope内で修正する。

command名ではなく実際の副作用でtierを決める。`test`、`build`、`package`という名前でも、credential使用、telemetryを含む外部書込み、課金、publish、承認root外の変更を行うならCへ昇格する。目的、利用者向け挙動、公開surface、権限、security/privacy上のデータ取扱い、所有範囲のいずれかが変わる場合は、新しいBの作業範囲を提示する。単なるbugfix、test修正、同じ仕様を満たす実装変更では再提示しない。

次は限定local作業へ暗黙には含めない。

- `main`または他の保護branchの更新・履歴書換え
- remoteへのpush、remote ref操作、PR作成・更新・merge
- 既存branch/worktreeの削除、移動、強制切替
- 指定したgenerated output root外の既存archive、保全artifact、ユーザー管理データの削除・rename・overwrite
- live campaign、control authority、protected clone、production相当環境の操作
- packageのpublish、upload、外部共有、署名、registry登録

### C. 外部・保護・破壊的操作

次の操作は、限定local作業の承認から推測せず、実行直前に対象別の新しい確認を得る。

- localまたはremoteの`main`更新、merge、rebase、history rewrite
- push、PR作成・更新・merge、remote branch作成・削除
- 既存local branch/worktreeの削除・移動
- 指定したgenerated output root外の既存archive、保全artifact、fixture外データ、ユーザー管理データの削除・rename・overwrite
- live campaign、control authority、protected clone、外部serviceへの書込み、publish、upload、署名
- 料金、通知、公開範囲、停止時間など外部副作用を持つ操作

確認前に次を提示する。

1. 操作と期待する効果
2. canonicalな最終対象。remote/repository/branch/PR/pathなどを曖昧な表示名だけにしない
3. source commitまたはartifactの短いfingerprintと検証結果。完全digestは機械記録へ保持し、利用者に転記させない
4. 主な差分、対象件数、容量または上限
5. 不可逆性、副作用、rollbackまたは復旧方法

一つの確認は、表示した一組の操作と対象だけに適用する。Cのpending提示はtask内に同時に一件だけ存在し、利用者の直接応答後にその操作集合だけを`approved`へ遷移させる。操作開始後は`executing`とし、効果が適用された場合は`consumed`にする。mutationが一切なかったことを機械的に確認できる失敗は同じproposalの`approved`へ戻し、同一操作を再試行できる。結果不明は`reconciling`へ進め、適用済みなら`consumed`、未適用なら`approved`、判定不能なら`blocked`にする。取消し、対象drift、scope変更では旧proposalを失効させる。処理済みの自然文を別操作へ再利用しない。

mutation前に失敗したことを機械的に確認できる場合は、同一対象・同一効果の再試行に再承認を要求しない。外部operationをdispatchした後は、成功、失敗、結果不明を区別する。結果不明では自動再試行せず、同じoperation identityまたはidempotency keyでread-back/reconciliationし、未適用を確認できた場合だけ同じ承認範囲で再開する。適用済みまたは対象driftなら結果を提示して停止する。

### 提示例

限定local作業では、次の程度の説明で足りる。

```text
対象: codex/feature-integration-selection-design の現在のworktree
含む: 承認方式の実装、テスト、文書、local commit、C:/work/repo/out/wave0a-packageへのpackage生成
network/credential: なし
含まない: main/remote/PR、既存branch・worktree削除、既存保全データ、publish
この範囲で進めてよいですか。
```

利用者は`はい`または同じ意味の自然文で回答できる。machine identityを追記しない。

破壊的操作では、次のように実対象を示す。

```text
操作: 次のlocal worktreeを削除
対象: C:/work/repo/.worktrees/example-feature（branch: codex/example-feature）
状態: 未commit差分なし。branch commitは到達可能
影響: 1 worktreeだけを削除し、branchは保持
復旧: 同じbranchからworktreeを再作成可能
```

実行時には例示値を観測済みの実値へ置き換える。利用者は表示内容を自然文で承認し、pathやhashを再入力しない。

## 5. 人の同意と機械検証の分離

利用者は、目的、範囲、外部影響、破壊性を判断する。機械は次を自動検証する。

- repository、worktree、branch、current HEAD、変更path
- source commit/tree、artifact digest、test/CI結果、およびtrusted exact-head CIが検証・生成したbytesと実際に使用するartifact bytesの同一性
- canonical target、remote URL、ref、expected old SHA、filesystem resolved path
- allowlist、件数・容量上限、credential scope
- 実行直前と実行後のstate drift

機械検証値はログまたは通常の証跡へ残せるが、利用者の入力条件にしない。検証失敗はfail closedとし、修復のためにhash付き承認文を作り直さない。操作範囲が同じならlocalで修正し、対象または影響が変わるときだけ新しい確認へ戻る。

filesystem削除・rename・overwriteではresolved absolute targetを操作直前に再確認し、broad root、未解決variable、危険なglobを使わない。さらに、preflightした同じfile/directory identityと検証済みparent boundaryへ、held handleまたは同等のno-follow/conditional primitiveで実行する。pathを再解決しただけで実行を許可しない。Git ref更新ではexpected old SHAまたは同等のleaseを使う。外部APIではcanonical account/tenant/org/project/environment/regionとredirect後identityを含む最終targetを固定し、version、ETag、idempotency keyなど利用可能なconditional primitiveを使う。これらは承認文を複雑化せずにTOCTOUと誤対象を防ぐ制御である。

CI適格性とartifact identityは一つのprovenance chainとして検証する。moving refや古い成功runを候補へ読み替えず、trusted workflowのexact source revision、workflow/config identity、成功したrequired checks、生成または検証したartifact digestを、publish・install・sign・UATが消費する同じbytesへ結び付ける。完全digestは機械側で扱う。

## 6. 証跡

通常作業の証跡は既存の開発手段へ集約する。

- local作業: Git diff、通常のcommit、test/build/policy出力
- PR統合: PR diff、review、exact-head CI、merge record
- main統合後: exact merged mainのCI、必要なUAT、main-only topology
- 破壊的操作: 対象一覧、直前preflight、実行結果、必要なbefore/after inventory

raw provider transcript、terminal-LF sidecar、approval capture、計画内圧縮bundle、各commit境界の外部start/completion receiptを新規作成しない。通常のcommit履歴とCIで十分なlocal進捗を、別の50件の証跡へ複製しない。

対話型作業の自然文承認そのものをrepository内のauthorization artifactへ変換しない。将来、無人または長時間の外部executorが必要になった場合は、operation、source、target、effectへbindingした短寿命・一回限りのcapabilityを別設計する。その要件を現在のlocal実装へ先取りしない。

## 7. 履歴移行

次の資料はGit履歴として保持するが、2026-08-31以降の新しいcapture、Task 0、source/test mutation、main/remote操作を許可しない。

| 資料群 | 将来の扱い |
| --- | --- |
| `2026-08-23-feature-selection-and-sequential-main-integration-design.md` | 機能取捨選択、逐次PR、exact-head CI、main-only完了という製品・統合目標は参照する。承認方式は本設計で置換する |
| `2026-08-23-feature-integration-program-index-and-wave-0a.md` | historical plan。実行しない。新しい簡潔なplanへ置換する |
| 2026-08-27のroot/removal addenda | path identity、上限、no-follow、TOCTOUなど技術的安全要件の参考として残す。文書identityや承認protocolは継承しない |
| `2026-08-27-wave0a-approved-root-removal-addenda-composed-implementation.md` | historical plan。実行しない |
| 2026-08-29のterminal-LF design/planとその訂正chain | historical evidence。provider transcript、LF例外、operator bundleを実行しない |

既存commitをamend、squash、dropしない。旧文書が名指す外部sidecar、approval、claim、receipt、progress、completionが存在しない場合、それを移行のために作成しない。存在する場合も新方式へimport、adopt、repair、deleteせず、別途明示された保全・削除判断までread-onlyとする。

旧方式を完成させるための`PC2`や追加訂正commitは作らない。新しい設計と後続planは通常のforward commitとして追加する。

## 8. 実装境界

後続の短い実装計画は、現行の`tools/main-consolidation`を製品・統合policyと承認policyへ分けて扱う。

- `featureIntegrationProgramPolicy.mjs`、`create-feature-integration-program-index.mjs`、`feature-integration-program-index.json`と対応testは、slice順、製品要件、exact-head CI、main-only完了を保持する。一方、旧plan identityを実行authorityにするfield、`PLAN_AUTHORING_REQUEST_HASH_APPROVAL_PER_SLICE`、`IMPLEMENTATION_REQUEST_HASH_APPROVAL_PER_SLICE`、利用者のrequest-hash転記をactive policyから除く。
- `featureIntegrationCampaignPolicy.mjs`と対応testは、artifact integrity、append-only recovery、target identityなど技術的安全性と、人の承認recordを区別する。hash fieldがartifact integrityを守る場合は残し、hashを利用者承認tokenとして扱うfieldだけを置換する。
- 承認分類とactive proposal stateは、小さなpure policyとして通常のsource/testへ置く。tier、purpose、repository/worktree/branch、allowed actions/paths/output roots、network/credential effects、exclusions、Cだけのsource/target/effectを持つ。基本遷移は`pending -> approved -> executing -> consumed`、確認済みno-mutationは`executing -> approved`、結果不明は`executing -> reconciling -> approved|consumed|blocked`とする。利用者本文、provider log path、message ID、terminal LFは保存しない。
- executorはcallerの`approved=true`や任意のapproval JSONを信頼しない。現在のtaskでactiveな一件のproposal decisionと、操作直前のmachine preflightの両方を要求する。
- 旧capture/operator/claim入口はhistorical observation以外へauthorityを返さない。旧Markdown bootstrapをcurrent HEADやcommitted blobから実行するfallbackを残さない。
- 現在の未commit draft `tools/main-consolidation/test/featureIntegrationCampaignPolicy.test.mjs`は別作業の利用者変更として保全し、新design commitへ混入させない。後続計画で採否と所有taskを明示する。

新しい汎用authorization service、raw transcript parser、外部approval rootは作らない。active proposalは現在の対話task内の最小stateである。同じtask stateが維持される通常のturn継続ではBを再承認しない。process/task再起動でactive stateを失った場合は、BもCも対象範囲を再提示して自然文承認を一度取り直す。plan、diff、commit、test結果だけを承認済みの根拠にしない。

## 9. 実行フロー

### 限定local作業

1. 現在のrepository/worktree/statusをread-only確認する。
2. 作業範囲と除外範囲を短く提示する。
3. 自然文承認を一度受ける。
4. 同じworktreeで実装、テスト、review、local commitを完了する。
5. 結果、検証、残る差分を報告する。

### PR・main統合

1. local candidateとtest結果を固定し、push/PR/merge予定をread-onlyで提示する。
2. remote、branch、baseからhead、主な差分、CI、rollback方法を提示して確認する。
3. 操作直前にremote/ref/expected old SHAを再検証する。
4. 表示した操作だけを実行する。
5. remote state、PR/merge、exact merged mainの結果を検証して報告する。

### branch/worktree整理

1. branch/worktreeとreachabilityをread-onlyで一覧化する。
2. 保持、archive、削除候補を区別し、exact targetを提示する。
3. 削除対象について新しい確認を得る。
4. targetを再解決し、main、current worktree、未保存変更、unreachable commitを再確認する。
5. 承認されたtargetだけを削除し、postconditionを報告する。

## 10. エラー、停止、再開

- state drift、scope外path、unexpected remote、既存target衝突、test/CI failureでは自動停止する。
- 停止は権限喪失を意味しない。同じlocal scope内の診断と修正は継続できる。
- external/protected/destructive対象が変わった場合だけ、新しい対象表示と確認を行う。
- 既に適用された外部mutationは推測でrollbackしない。観測結果を提示し、別のrollback操作として確認を得る。
- 外部mutationの結果が不明な場合は再送しない。同じoperation identityでread-back/reconciliationし、適用状態を確定するまで停止する。
- resume時はGit、filesystem、remoteの現在stateを再検証する。旧provider prefixや承認messageを再生しない。

## 11. 検証と受入基準

後続実装計画は、少なくとも次をテストまたはreviewで固定する。

- 利用者承認をhash、OID、LF、provider metadataの入力へ依存させない。
- read-only操作に追加承認を要求しない。
- 一度承認されたlocal scopeで、test、review、local commit、同一resumeごとの再承認を要求しない。
- repository文書の作成・編集・commitをread-onlyへ誤分類しない。
- 一task一pending提示、直接の利用者応答、scope/source/target/effect drift時の失効、Cの処理済み応答の再利用拒否を検証する。
- task stateが維持された通常turnではBを継続し、stateを失うprocess/task再起動ではplanやdiffだけからBのmutation authorityを復元しない。
- command名ではなくactual effectsでtierを決定し、credential、外部書込み、課金、非公開データ送信を行うtest/build/packageをCへ分類する。
- main、remote、PR、既存branch/worktree削除、既存データ削除はlocal承認から実行できない。
- 外部・破壊的操作は、canonical target、source、影響、rollbackを提示した新しい確認後だけ実行する。
- target/ref/path/file identity/parent boundary driftを操作直前のmachine preflightとconditional executionで拒否する。
- exact-head CIのsource/workflow/checks/artifact digestと、publish・install・UATが消費するbytesの不一致を拒否する。
- 外部operationの結果不明状態では自動再試行せず、read-back/reconciliationを要求する。
- fresh disposable fixtureの後片付けは、承認されたexact fixture root外へ出ない。
- 旧provider transcript parser、terminal-LF例外、外部approval/claim/progress chainを新しいauthorization pathから呼ばず、旧entry point自体も将来操作へのauthorityを返さない。
- 実装は通常のsource fileとtest fileに置き、Markdown内bootstrapを実行runtimeにしない。
- local candidateは通常のreviewとCIを通し、main統合は別の対象別確認後に行う。

## 12. 非目標

- 過去の承認が暗号学的に正しかったかを再証明しない。
- 旧external evidenceを完成、修復、削除しない。
- 既存のroot/removal/OOXMLなど製品安全要件を弱めない。
- このdesign commitだけでpush、PR、merge、main更新、branch/worktree削除を許可しない。
- 無人production executorや汎用authorization serviceを新設しない。

## 13. 移行順序

1. 本設計をforward commitし、旧Wave 0A entry pointへhistorical noticeを追加する。
2. written spec review後、本設計だけを正本とする短い実装計画を作る。
3. 承認protocolとMarkdown bootstrapを製品要件から分離し、通常のsource/test/CIへ必要な安全制御だけを実装する。
4. local candidateをreview・検証する。
5. push/PR/main統合は対象を提示して新しく確認する。
6. main統合と証跡保全後、branch/worktree整理は削除候補を別表示して確認する。

この順序は、local実装への一度の自然文承認と、外部・破壊的操作の直前確認だけを人に求める。文書commit、test、review、hash計算ごとの承認は要求しない。
