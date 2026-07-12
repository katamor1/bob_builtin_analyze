# Bob Evidence Scope Phase 5 実装記録

## 概要

Phase 5 は Phase 4 で確立した repository symbol/reference index consumer 契約の背後に、Git repository から index を生成する組込み producer と、file fragment 単位の増分 cache を追加した。

review 時に毎回 workspace 全体を文字列走査するのではなく、immutable Git commit の tracked blob を入力とし、変化していない blob は過去の source-free fragment を再利用する。生成した v1 index は同じ `preprocessReview` 呼出内で Phase 4 loader によって再検証され、そのまま evidence scope に利用される。

## 設定

```yaml
analysis_options:
  repository_symbol_index_mode: build
  repository_symbol_index_path: .bob/evidence-scope/repository-symbol-index.json
  repository_symbol_index_cache_path: .bob/evidence-scope/repository-symbol-index.cache.json
```

- `repository_symbol_index_mode`: `consume` または `build`。未指定時は `consume`。
- `build` は `repository_symbol_index_path` を必須とする。
- cache path は build mode だけで使用できる。
- cache path 未指定時は index path から `.cache.json` を導出する。
- build mode は Git repository のみ対応する。Bazaar consumer は Phase 4 のまま利用可能だが、producer は明示的な unsupported error を返す。

## Immutable Git snapshot

producer は working-tree file を解析入力にしない。

1. `sourceRevision` が40桁 commit SHAであることを確認する。
2. repository `HEAD` と `sourceRevision` の一致を確認する。
3. `git ls-tree -r -l -z <sha>` から tracked blob path、object ID、byte size を列挙する。
4. 対象 source の dirty state を `git diff --name-only -z <sha> --` で拒否する。
5. 新規・変更 fragment だけを `git cat-file blob <object-id>` で読む。

これにより、`core.autocrlf`、checkout の EOL、filesystem mtime に依存せず、同じ commit と producer options から同じ index bytes を生成できる。

## Source extractor

`repositorySourceExtractor` は raw source を artifact/cache に保持せず、各 file から次の source-free fragment を生成する。

- stable symbol metadata
- import/include path reference
- test-target reference
- function call candidate
- type-use candidate
- local deterministic warning

stable ID の代表例:

```text
file:src/payment/api.ts
function:src/payment/api.ts#authorize
type:src/payment/api.ts#Request
```

対応 language は C/C++、TypeScript/JavaScript、Python、C#、Java、Go、Rust。宣言抽出は conservative lexical policy であり、compiler-grade semantic index を偽装しない。解決できない参照は unknown edge として human-visible に残す。

## Global linker

fragment の再利用有無にかかわらず、全 fragment を集めた後に global link を毎回再計算する。

- relative import/include は repository path へ解決する。
- test file から production file への path reference は `tests` edge にする。
- name reference は同 kind の候補が repository 内で一意な場合だけ resolved edge にする。
- ambiguous name は resolved とせず warning/unknown impact を維持する。
- symbols と edges は canonical identity で sort・deduplicate する。

この再リンクにより、callee file だけが変更・追加・削除された場合でも、再利用した caller fragment の edge が最新 graph に追随する。

## Incremental cache

cache schema version は1。cache は `.bob/evidence-scope/*.cache.json` または `.custom/*.cache.json` に限定する。

cache header:

- producer ID/version
- producer options hash
- source revision
- text encoding policy

file record:

- normalized path
- Git blob object ID
- exact blob SHA-256
- byte size
- language
- source-free extraction fragment

再利用条件は producer version/options hash と blob object ID の一致。変更/新規 blob だけを rebuild し、削除 path は drop する。language list、encoding、extractor policy など output semantics に影響する option が変わると全 fragment を invalidate する。

cache が missing、破損、未知 schema、semantic invalid の場合は warning として full rebuild へ fallback する。cache を正しい source of truth として扱わない。

## Atomic output

index と cache は canonical JSON + trailing newline で生成し、workspace-local temporary file へ書いてから rename する。Windows の置換競合に対して限定的な retry を行う。

index の `contentHash` は最終 index bytes の exact SHA-256。cache 本文や raw source は review package に複製しない。

## Pipeline integration

`preprocessReview` の順序:

1. review input と VCS diff を読み、base/head を immutable SHA に解決する。
2. build mode の場合、repository index producer を実行する。
3. Phase 4 loader が生成 index を同じ呼出内で read-only load・schema/semantic/freshness validation する。
4. document/code analysis と current-analysis-authoritative merge を行う。
5. evidence scope、context budget report、manifest を生成する。

`PreprocessResult.repositoryIndexBuild` は、index/cache path、revision/hash、symbol/edge count、scanned/reused/rebuilt/removed file count、cache status、warnings を返す。

consumer-only mode と index 未設定 mode の既存挙動は維持する。

## Security / privacy

- absolute path、`..`、control character、workspace escape、symlink escape を拒否
- index/cache output は `.bob/evidence-scope/` または `.custom/` 配下だけ
- Git command timeout と stdout byte limit
- source file count、per-file byte、aggregate byte limit
- tracked Git blob 以外を producer input にしない
- raw source、資格情報、cache body を review packageへ保存しない
- new npm dependency なし

## TDD

RED commit:

```text
4c94f5ab8dcd79fff9a38b6c10c04f345d7a53ad
```

RED は producer module、build-mode schema、public export が存在しないことを検出した。GREEN では producer/cache/source extractor、pipeline wiring、schema、public APIを最小単位で追加した。

追加 review により、cache options hash に text encoding を含め、working-tree bytesではなく immutable Git blob bytesから抽出するよう強化した。

## 非目標

Phase 5 は次を行わない。

- compiler/LSP/ctags の自動導入
- Bazaar index producer
- repository 外 source の走査
- cache の user-facing artifact 化
- producer 横断 artifact ledger
- remote/distributed cache
- stale artifact の ledger 伝播
