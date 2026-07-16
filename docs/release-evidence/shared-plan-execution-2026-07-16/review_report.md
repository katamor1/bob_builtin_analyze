# 共有計画 独立レビュー報告

日付: 2026-07-16
対象base: `f4f9d3308361333e02ab1af732706b7a9e5fc952`
対象code head: `d73f883b72a19d197c8a87a49cf3ca82980dcef5`

## 結論

最終再レビューではCritical／Importantの未解決findingはありません。初回レビューと最初の再レビューで検出した重要findingは、すべて失敗テストで再現してから修正し、focused testと全testで確認しました。公開を止めていたlegacy v1 cacheのcredential再保持も、互換version 2への更新とseeded upgrade testで解消しています。

## レビュー履歴

1. PR #72統合済み実装を共有計画Phase 1〜6と照合。
2. 6件のImportantと2件のMinorを検出。
3. 3つの独立TDD taskで修正し、mainとの差分を別担当が再レビュー。
4. 再レビューでlegacy v1 cache再利用によるcredential残存をImportant blockerとして追加検出。
5. remote publicationを停止し、seeded legacy cache testをREDにして互換versionを更新。
6. 同じレビュアーがcommit `d73f883b`を再確認し、Important／Criticalなしと判定。

## Findingの最終状態

| Finding | Severity | 最終状態 | 検証 |
|---|---|---|---|
| unsafe URI／credentialがrepository cacheへ保存される | Important | 解消 | credential fixtureを含む新規抽出でcache／index非保持 |
| legacy v1 cacheが修正前fragmentを再利用する | Important | 解消 | credential-bearing v1 cacheをseedし、miss・3 file rebuild・v2 hitを確認 |
| retryable rename fallbackが旧destinationを削除する | Important | 解消 | 連続rename失敗後も旧bytesを保持 |
| dangling dependencyのsynthetic missing recordがない | Important | 解消 | closed prefix、metadata-only record、伝播、512件上限を確認 |
| configured upstream消失／破損時にcheckpoint前にthrowする | Important | 解消 | 元errorを維持し、prior upstreamをmissing、packageをstale化 |
| repository risk tagが現在解析へ再混入する | Important | 解消 | 現在解析symbolが一致するindex metadataを完全置換 |
| duplicate symbol IDが入力順でlast-winsになる | Important | 解消 | 逆順入力でも同じsorted errorでfail closed |
| `max_call_depth`既定値がruntime／schema／sampleで不一致 | Minor | 解消 | active schema、builder、initializer、README、sampleを1へ統一 |
| timeout clamp testがscheduler速度に依存する | Minor | 解消 | 非終了processのerrorでexact 1,000ms clampを直接検証 |
| Phase 6 evidenceの計画名とcanonical名が不一致 | Minor | 解消 | exact Phase 6名のalias 3 filesとchecksum mappingを追加 |

## 独立再レビュー証跡

- 初回再レビューfocused tests: 58 passed / 0 failed
- legacy cache probe: `cacheStatus=hit`, `reusedFiles=2`, `rebuiltFiles=0`, credential残存を再現
- blocker修正後producer focused tests: 12 passed / 0 failed
- blocker修正後結論: Critical 0、Important 0
- `git diff --check`: pass
- reviewerはread-onlyで、実装・evidence fileを変更していない

## 残余リスク

- lexical source extractorは完全なlanguage parserではなく、意図的に保守的である。
- Windowsでrenameが一時的に失敗した場合はbounded retryし、永続的失敗では更新をfail closedにして旧artifactを保持する。
- 破損済みledgerからは失われたidentity／lineageを復元できないため、有効に読み取れたmetadataだけで再構築する。
- append-only履歴、server synchronization、Bazaar producer generation、独立VSIX分割は元計画どおりscope外である。
