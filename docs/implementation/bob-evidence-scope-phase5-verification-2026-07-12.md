# Bob Evidence Scope Phase 5 検証記録

## 対象

Phase 5 の検証対象:

- immutable Git blob based repository-index producer
- deterministic stable symbol/reference extraction
- file fragment incremental cache
- changed/new/deleted file invalidation
- global re-link after fragment reuse
- build-and-consume pipeline mode
- schema/path/revision/dirty-state boundary
- source/file/aggregate resource limits
- Linux/Windows portabilityを支えるblob-byte契約
- explicit public API

## TDD RED

Test-only RED commit:

```text
4c94f5ab8dcd79fff9a38b6c10c04f345d7a53ad
```

新規 `repositorySymbolIndexProducer.test.js` は次の未実装境界で期待どおり失敗した。

- `repositorySymbolIndexProducer` module が存在しない
- `produceRepositorySymbolIndex` public API が存在しない
- review-input schema が build/cache settings を許可しない
- `preprocessReview` が build mode を実行しない

既存 Phase 1–4 contract の failure ではなく、Phase 5 producer contract の欠如による RED である。

## Focused GREEN

Phase 5 focused suite:

```text
# tests 9
# pass 9
# fail 0
```

確認した behavior:

1. stable symbol ID と deterministic ordering
2. import/test/call/type relationship の生成
3. raw source sentinel の index/cache 非格納
4.同一 blob の full cache hit
5. changed blob だけの partial rebuild
6. deleted file fragment/edge の除去
7. reused caller fragment を含む global re-link
8. language/encoding option 変更による full invalidation
9. corrupt cache の warning + immutable-blob full rebuild
10. stale revision、dirty selected source、unsafe output path の拒否
11. maxFiles / maxFileBytes / maxTotalBytes enforcement
12. preprocess build mode の即時 consumer handoff
13. unsupported language の deterministic warning
14. nested Git root でも output は workspace-local
15. explicit public export

## Full suite

最終ローカル source tree:

```text
# tests 232
# suites 0
# pass 232
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Phase 1–4 evidence scope、preprocess、document/code extraction、traceability、VCS、package freshness、Bob output、workflow provider の既存 regression を含む。

## Policy / package gates

```text
dependency:policy   2/2 passed
architecture:policy 90 TypeScript files, no import cycles
source:policy       90 TypeScript files, no export-star violation
unused:report       exit 0
audit:prod          0 production vulnerabilities
package             VSIX generated
package:policy      3,674,111 bytes / 1,903 entries
```

## Determinism checks

- same commit + same producer options => same canonical index bytes
- tracked blob object ID unchanged => fragment reuse
- checkout EOL/mtime do not enter cache key
- producer option hash includes repository root、language set、encoding、extractor policy
- symbols、edges、references、warnings are sorted/deduplicated
- global references are re-linked on every build
- exact index bytes are SHA-256 hashed

## Security / privacy checks

- source revision must equal checked-out Git HEAD
- dirty selected tracked source is rejected
- index/cache path confinement and symlink containment
- Git command timeout/output bound
- file count/per-file/aggregate read bound
- raw source is absent from index/cache/report
- output writes are atomic with bounded Windows replacement retry
- no credentials and no new npm dependency

## Final CI

最終 GitHub Actions run IDsと conclusion は、最終 branch head に対する検証完了後に PR #72 本文へ同期する。
