# REG-BRIDGE-OWNER-VERSION-LIFECYCLE 詳細設計

作成日: 2026-10-18。状態: **詳細設計レビュー待ち。製品実装・受入完了の記録ではない。**

## 1. 目的と既存の承認範囲

V2移行計画M3と機能選別仕様§7.2に従い、3拡張が提供するaction、preflight、result sink、agentを、installed owner/versionに結び付いた一つの登録単位として公開・解除する。途中失敗で一部だけが見えたり、再起動後に古い登録が残ったりしない状態を作る。

今回の対象はordinal9のREG-BRIDGE-OWNER-VERSION-LIFECYCLEだけ。次のREG-BRIDGE-DISCOVERY-EVIDENCE、Processing、R3以降、V2実行の有効化は含めない。単一compiler、単一Contract V2 provider truth、既存V1 APIと実行動作を維持する。

基準mainは88de3a67aedf5c8d1b3ee2ea3226a973703ebaf0。正式進捗は8/20。R2までの完了記録、static20の順序、旧completion referenceを変更しない。

根拠:

- docs/superpowers/plans/2026-09-28-v2-migration-remaining-work.md §M3
- docs/superpowers/specs/2026-08-23-feature-selection-and-sequential-main-integration-design.md §7.2、§10.2
- docs/superpowers/specs/2026-07-17-workflow-contract-v2-design.md §12
- feature-selection-source-universe.jsonでこのcapabilityが所有する46 source items。archiveは意味と試験の参照であり、一括復元しない。

## 2. 現在の実装と不足

| 領域 | 現mainにあるもの | 今回追加するもの |
| --- | --- | --- |
| Contract V2 | ActionRegistryが持つ一つのWorkflowProviderRegistry、id/version重複拒否、token付き解除、immutable catalog | 既存owner内の拡張単位のatomic registration |
| compiler lifecycle | provider変更時のnamespace更新、環境生成失敗時のrollback | 一括処理の途中状態を公開しない接続 |
| companion actions | Bazaar 11件、Consistency 16件を逐次登録し、失敗時にrollback | installed provenance検証後、一度の公開と一つのdisposable |
| agent/result sink | 上書きfield、append配列、runtime生成時のsnapshot | 同じownerからのlive resolverと解除 |
| shutdown | 一部の先行dispose失敗が後続処理を止め得る | 全resourceの解除を試み、失敗を集約する処理 |
| 試験 | 単体providerとretry generationの既存回帰 | 3拡張の実登録を結合した再有効化・収束試験 |

単体providerの重複拒否やstale-disposalを作り直さない。既存のV2 snapshotは登録解除後もimmutableであり、古いleaseのprivate bindingを新登録へ付け替えない。

## 3. 検討した構成と採用案

1. **採用: 既存WorkflowProviderRegistryを唯一のowned backendとして拡張する。** pure validator、activation facade、runtime viewsを分離し、live storageを新たなregistry classへ複製しない。既存V2のbinding/catalog authorityを保てる。代償は、既存ownerにV1 contributionのlifecycle責務を追加すること。
2. archiveのContributionRegistryとProviderRegistryHostをそのまま追加する案。既存V2 registryと二つの真実を作るため採らない。
3. 既存の逐次registerとrollbackだけを強化する案。handler呼出しやreentrancyから途中状態が見えるため、atomic publicationの受入条件を満たさない。

ActionRegistryは引き続き一つだけWorkflowProviderRegistryを構築する。新しいProviderRegistryHostはそのActionRegistryへの限定facadeを受け取り、自分ではregistryを構築しない。pure preparation moduleは検証済みの一時的な登録案を作るだけで、live handler/catalogを所有しない。

既存Contract V2のid/SemVer/dispatch ABIと、V1 contributionのid/contract_version/handler ABIは区別する。V1 contributionをV2 contractへ自動変換せず、V2 catalogへmirrorしない。両ABIの間でfallbackしない。ここでいう単一ownerはlifetimeとlive storageの所有者であり、異なるABIのhandlerを相互利用するという意味ではない。

## 4. 登録契約

追加の公開APIはapiVersion=provider-registry/v1、negotiateProviderRegistry(range)、registerContributionSet(manifest, provenance, handlers)。既存のcompile、V2 registration、V1 action/agent/sink APIは互換性を保つ。

manifestはworkflow-contributions/v1。ownerはinstalled extensionのpublisher.nameとexact SemVerを持ち、provenanceは実際のextension package/contextから作る。workspace内の同名packageや呼出し側のsourceIdだけをinstalled identityとして信頼しない。manifest ownerのid/versionがprovenanceと違えば登録前に拒否する。

host facadeにはinstalled extension resolverを注入し、製品ではvscode.extensions.getExtension(owner.id)から得たpackage identity/version/rootを照合に使う。caller提供contextだけでは受け入れない。これはinstalled metadataとの整合性の検証であり、同一extension host内で呼出し元JavaScriptの出自を認証するsandboxではない。

registry_apiはmin/maxだけを持つclosed range。provider-registry/vNのNは正の10進整数、文字列長上限64。BigIntで比較し、min<=maxかつv1を含む場合だけv1を返す。accessor、Proxy、余分なkey、非文字列、0、先頭0、不正suffix、逆転、非互換rangeを固定typed errorで拒否し、handlerを読まない。

manifestはaction_providers、preflight_checks、result_sinks、optional agent_provider、workflow_templates、schemasを宣言する。全宣言のid/typeを一つのcontribution collision domainで検証し、contract_versionは正のversionを持つ固定形式にする。schemaのfile pathをidentifierとして扱わない。owner idはinstalled extension idとして検証し、V2のsourceId用F4 idとは混同しない。

各handler集合は宣言と完全一致させる。欠落、余分、別kind、非callable、accessor/Proxy、agentの多重登録を拒否する。入力をdetached snapshotとして検証し、登録後の呼出し元によるMap/record変更を反映しない。検証中にprovider handlerを実行しない。入力上限は既存のbounded validation方針に揃え、無制限の再帰・配列・文字列を認めない。

discovery用のworkflow claims、legacy compiler/report、manual catalog、host path由来のevidenceは今回導入しない。次sliceでP4/P7のimmutable bytes/catalogへ接続する。

## 5. Atomic publicationと解除

prepare→validate→conflict check→immutable next generationの作成→一度のstate publicationの順に行う。すべてのhandlerとmetadataが準備できるまでlive stateを変更しない。後半handlerの不正、後半identifierの衝突、準備処理の失敗でcatalog、登録数、既存handler identityは不変。

同じowner idの二重登録はversion違いでも拒否する。contribution id/typeの衝突は同一owner・別ownerともset全体を拒否する。既存V1 compatibility登録と新atomic actionが同じ実行identifierを競合させる場合も、部分置換を行わない。V2 provider contract同士の既存id+SemVerルールは変更しない。

mutation中の再登録・解除は固定errorで拒否する。新しいtokenを各owner generationに結び付け、disposableは自分のtokenと一致するgenerationだけを削除する。disposeは冪等。未公開案のdisposable、古いdisposable、遅れて到着したretry結果は、新generationを削除できない。

facadeは手動dispose後にtrackingを解放する。shutdown開始後は新規登録を拒否し、逆登録順で全setの解除を試みる。一つの解除が失敗しても残りの解除とtimer/listener/resourceの後始末を試み、失敗を集約して報告する。解除できなかった登録を成功扱いでtrackingから消さない。

V1 contributionだけの変更はV2 catalog bytesを変更しない。V2 contract変更に伴う既存compiler namespace rotationと、古いleaseの有効期間は維持する。公開後のUI通知失敗で既に確定したstateを部分的にrollbackしない。

## 6. Runtimeと3拡張の接続

action/preflight/result sink/agentのruntime viewsは同じowned backendを参照する。runtime作成時のcustom-handler snapshotを廃止し、登録前に作成したruntimeも実行時に現generationを参照する。default built-insは一つのowned setにまとめ、二重登録しない。standalone factoryの既存default動作を維持する。

result sinkは呼出し前に宣言contract_versionとの一致を確認する。file transactionはrun/ownerごとのbindingにし、古いruntimeや解除済みownerへ新transactionを渡さない。explicit agentと登録済みagentの既存優先順位を保持し、未登録agentへの暗黙fallbackを追加しない。

Bazaar/Consistencyは既存retry controllerのAPI identity/generation機構を再利用する。完全な新API shapeを検証し、交渉成功後にinstalled manifest/provenanceと正確なhandler setを一度だけ登録する。部分的な旧APIへ順次登録するfallbackを追加しない。optional integrationが未利用可能な場合の待機・再試行動作は維持する。

workflow-register自身のbuilt-insと2 companionsで、steady stateは3 owned sets。通知だけでは増えない。host/API交代、処理中deactivation、遅延completion、再有効化後も、現hostの3 setだけが残る。全deactivate後は0 set。旧hostへの遅延結果は解除される。

## 7. 実装単位と所有ファイル

実装担当は主スレッド一人。読取り調査と最後の独立reviewだけを分離する。

1. **契約・prepare**: 新しいcore/contributionManifest.ts、core/contributionRegistration.ts、schema/workflow-contributions.v1.schema.jsonと3 installed manifests。getter/proxy、owner/version、range、handler完全一致のRED→GREEN。
2. **owned atomic backend**: 既存core/contractV2/providerRegistry.tsとcore/actionRegistry.tsを拡張。新api/providerRegistryApi.tsは非所有facade。registry重複、atomicity、reentrancy、tracking、stale disposalのRED→GREEN。
3. **runtime/lifetime**: service、runtimeFactory、preflight、sink、agent、builtInContributions、disposeResourcesを接続。live views、contract mismatch、全解除のRED→GREEN。
4. **companions**: Bazaar/Consistency bridgeとregistrationをatomic APIへ接続。既存retry controllerを再利用し、3拡張結合のactivation/restart/late-result/shutdownを検証。
5. **候補検証と独立review**: focused、影響拡張の全回帰、3拡張quality gates、VSIX、同一hashのinstalled-host UAT、独立whole-branch review。一度の修正pass後に対象回帰を実行。
6. **公開・統合・別完了記録**: source候補とmainの実CI・通常統合を確認した後、別metadata PRで今回sliceだけを昇格する。source M1とmetadata M2を区別する。

詳細な実装計画は、この文書のレビュー後にwriting-plansで固定する。上記はファイル責務と検証単位であり、未実行試験を成功扱いするものではない。

## 8. 必須の試験と受入条件

- owner/version/range/manifest不正をhandler read・commit前に拒否し、動作呼出し件数0。
- 同owner、別owner、別version、後半handler、後半衝突の失敗で全state/identityが不変。
- pre-publication/reentrant disposal、stale disposer、反復register/disposeで既存・新generationが保護され、tracking数が収束。
- 同じActionRegistryにowned backendは一つ。別ActionRegistryは完全分離。V2 catalogは同じowned registryからのみ生成される。
- 古いruntimeから見た登録・解除・再登録、sink version mismatch、agent優先順位が実挙動で正しい。
- 3拡張の実handler registrationを結合し、11/16 actionの途中公開なし、host再起動と遅延完了後に3 set、全解除後に0 set。単なるsource regexを結合試験の代用にしない。
- cleanup途中のthrowでも後続cleanupを実行し、失敗も証拠に残す。
- V2製品経路のlease取得、provider dispatch、Bob dispatch、run directory、artifact stagingはすべて0。runtimeActivation=falseを維持する。
- current V1 command/public API/persistence、P1–P7、R1/R2の回帰を維持する。reachability policyのhash更新だけで境界変更を承認しない。

## 9. 容量・CI・保留境界

workflow-registerの上限は1,200,000 bytes、R2最終VSIXは1,199,470 bytesで余裕530 bytes。最初の縦断実装から実packageとpackage:policyを測る。既存33圧縮対象、version0.1.0、engine^1.106.1、依存/lockを黙って変更しない。超過時は実失敗artifactと差分を保持し、具体的な容量対策を別途提示する。設計承認は上限引上げの承認ではない。

R2のCI免除はこのsliceへ継承しない。candidate/mainそれぞれのexact headとUbuntu/Windowsの実結果を収集し、failure/not_runを成功へ書き換えない。未解決CIがあればsource/metadataの受入完了は保留し、完了を主張しない。

live Bob/model、最終Program UAT、R3 durable/recovery/exactly-once、V2 activation、Program cleanupは今回の完了条件に混入させない。3拡張を結合した非モデルhost UATと最終Program UATは区別する。

保護対象、旧証跡、失敗artifact、branch、worktree、profileは削除しない。実装前の正式進捗は8/20のまま。source受入前にordinal9をVERIFIEDにしない。

## 10. Review focus

1. backendを拡張したつもりで新しいregistry/cache/catalog authorityが生まれていないか。
2. owner id/versionの自己申告とinstalled provenanceを取り違えたり、host交代後の旧disposerが新登録を削除したりしないか。
3. inputのgetter、Proxy、Map mutation、reentrant callback、後半失敗から途中stateが見えないか。
4. runtimeが古いhandler/file transaction/agentを保持し、解除後にも呼び出したりsink version検証を省略したりしないか。
5. V1互換維持またはbuilt-in移設を理由にV2 dispatch、legacy catalog fallback、複数owner、余分なactivation経路を持ち込んでいないか。
