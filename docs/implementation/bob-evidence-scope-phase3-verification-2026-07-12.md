# Bob Evidence Scope Phase 3 検証記録

## TDD

Phase 3 の test-first 対象は `test/projectRulePack.test.js` である。

RED では次の契約が未実装で失敗した。

- `projectRulePackLoader` の public module
- bounded read-only load と raw-byte SHA-256
- workspace escape / unsupported schema version の拒否
- project-authoritative rule merge
- pipeline report と manifest の rule-pack provenance
- rule-pack bytes のみが変わった場合の stale input hash 更新

実装後、focused suite は 6/6 成功した。

```text
# tests 6
# pass 6
# fail 0
```

## Full suite

GitHub Actions 上で次を実行した。

```bash
cd extensions/bob-code-consistency-review
npm test
```

結果:

```text
# tests 215
# suites 0
# pass 215
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

compile も同一 command 内で成功している。

## 検証内容

### Loader boundary

- workspace-local `.yaml` を read-only に読み込む
- source bytes が読み込み前後で同一
- source path を POSIX 形式の workspace-relative path として保持
- SHA-256 が exact source bytes と一致
- `../outside.yaml` を拒否
- `schema_version: 2` を拒否
- schema error に source path を含める

### Rule semantics

- project rule pack を authoritative とする
- inline-only ID は追加する
- duplicate inline ID は project rule を維持する
- duplicate warning は決定論的に整列する

### Pipeline / stale detection

- `context-budget-report.json.rule_source` が pack path を指す
- report に ID、version、source path、SHA-256 を記録する
- applicable rule に pack rule が含まれる
- manifest に rule-pack provenance を記録する
- rule-pack bytes のみの変更で report hash が変わる
- rule-pack bytes のみの変更で manifest `input_hash` が変わる
- raw rule-pack body を report に格納しない

### Regression

Phase 1/2 の evidence scope、既存 preprocessing、Bob output、traceability、VCS、workflow provider、package freshness を含む全215テストが成功した。

## Policy / package gate

PR CI の既存 workflow で次を検証する。

- dependency policy
- architecture policy
- source policy
- unused dependency report
- production dependency audit
- TypeScript compile
- full unit tests
- VSIX package
- VSIX policy
- Extension Host smoke
- Linux / Windows matrix

最終 CI run ID と conclusion は PR 本文へ同期する。

## 一時診断

失敗原因の切り分けに使用した `.github/workflows/evidence-scope-phase3-diagnostic.yml` と `docs/implementation/diagnostics/` は最終成果物から削除する。診断ログの内容は本記録へ要約し、raw log は残さない。
