# Review Run Wizard v3 統合結果

## 1. 目的

本書は、Review Run Wizard v3 Iteration 1〜3とstack横断acceptanceを`main`へ順次統合した結果を、実際のcommit SHA、競合解消、検証、rollback単位とともに記録する。

対象範囲:

```text
Review Run開始
  -> packet / result handoff
  -> 指摘確認・振り分け
  -> resume / metrics / finalize / recovery
  -> レビュー実績
  -> stack acceptance
```

## 2. 統合結果

| 段階 | PR | main同期後のhead | main上のmerge commit | 結果 |
| --- | ---: | --- | --- | --- |
| Iteration 1: context / handoff | #76 | `3387d87405f73b92555aca1cee82fbe7e8b4bdbf` | `221197921eae2a68878ef9a677be35b1dd81bd48` | merged |
| Iteration 2: resume / metrics / finalize / recovery | #79 | `a20adf542342ee782d08a686032cea4b1a6b61e1` | `5d8efef2851760dd3a99a63f31a6fe2255ebecf3` | merged |
| Iteration 3: レビュー実績 | #83 | `af63e516459e20d983e6e59e71ce180ef2bc855c` | `47145268c75b91987b94f9c20ca8556bda1286aa` | merged |
| Stack acceptance | #85 | `0fb80235440d81a2b3813e8363a8b231e59a1e36` | `3a6820f4bb0e396f4222e6c988fe89d0331dc00d` | merged |

重複実装だったPR #84は、より包括的なPR #83へ一本化し、未mergeでcloseした。

## 3. main同期時の競合解消

### 3.1 PR #79

main付け替え時の競合は次の3文書だけだった。実装コードに競合はなかった。

- `extensions/bob-bazaar-review/README.md`
- `extensions/bob-bazaar-review/docs/real-machine-test-spec-ja.md`
- `extensions/bob-bazaar-review/docs/unit-test-spec-ja.md`

解消方針:

- READMEはReview Run Wizard v3の運用導線を中心に整理した。
- test仕様はmain側の既存remediation契約を基準にし、BZR-RT-044〜050とBZR-UT-042〜048を追加した。
- conflict解消後に全gateを実行し、成功した状態だけを同期commitとしてpushした。

### 3.2 PR #83

main付け替え時の競合は実機テスト仕様と単体テスト仕様の2文書だけだった。Dashboard実装コードに競合はなかった。

解消方針:

- main側のIteration 2とremediation記載を保持した。
- BZR-RT-051〜057とBZR-UT-049〜052を追加した。
- Dashboard固有差分が22ファイルだけであることを再確認した。

### 3.3 PR #85

最新mainとのmergeは競合なしだった。最終差分は次の3ファイルだけだった。

- `test/reviewRunV3Acceptance.test.js`
- `docs/review-run-v3-acceptance-ja.md`
- `docs/README-ja.md`

## 4. 検証結果

各同期branchでは、mainを取り込んだworking treeに対して次を実行し、すべて成功した後に同期commitを作成した。

```text
npm test
npm run dependency:policy
npm run architecture:policy
npm run source:policy
npm run unused:report
npm run unused:policy
npm run artifact:policy
npm run audit:prod
npm run package
npm run package:policy
npm run package:metrics
```

Iteration 1はUbuntu / Windowsのpackage、VSIX policy、Extension Host smokeも成功済みである。Iteration 2、Iteration 3、stack acceptanceはmain同期後に同じtarget extension gateを再実行した。

`reviewRunV3Acceptance.test.js`は、次の一連のfilesystem round tripを検証する。

```text
startReviewRun
  -> recordReviewPacket
  -> recordReviewResult
  -> recordTriageCompleted
  -> correctActiveReviewRunMetrics
  -> finalizeReviewRun
  -> generateCampaignDashboard
  -> writeCampaignDashboardArtifacts
```

受入条件:

- `target / packet / result / triage / record / summary`がすべてcompletedになる。
- baseline 20分、Bob review 3分、指摘確認・振り分け 2分、estimated saved 15分になる。
- accepted findingがDashboard overview / rule trend / target-mode trendへ反映される。
- `dashboard.json`、`dashboard.md`、`dashboard.csv`が生成される。
- Dashboard生成・export前後で、Review Run、packet、result、triage、record、summaryのSHA-256が変化しない。

## 5. 互換性と非破壊条件

統合後も次を維持する。

- `bazaar-review-run/v1`
- `bazaar-review-record/v1`
- `bazaar-review-triage/v1`
- 既存command IDとworkflow provider ID
- 既存review-result、record、triage、summaryのpathと形式
- readonly Bazaar / MCP境界
- 指摘確認・振り分け gate
- workspace containment、realpath、symlink / junction拒否
- Webview CSP nonceとhost側action allowlist

新規Dashboard artifactはderived outputであり、既存review evidenceを変更しない。

## 6. Rollback

問題が見つかった場合は、依存関係の逆順で戻す。

1. Stack acceptance merge `3a6820f4bb0e396f4222e6c988fe89d0331dc00d`
2. Iteration 3 merge `47145268c75b91987b94f9c20ca8556bda1286aa`
3. Iteration 2 merge `5d8efef2851760dd3a99a63f31a6fe2255ebecf3`
4. Iteration 1 merge `221197921eae2a68878ef9a677be35b1dd81bd48`

review evidenceを削除するrollbackは行わない。schemaやartifact identityに問題がある場合も、既存成果物を保持し、機能commitだけをrevertする。

## 7. 結論

Review Run Wizard v3の計画範囲はmainへ統合された。標準Review Run、再開、metrics、finalize / retry、legacy recovery、レビュー実績、3形式export、stack横断の証拠不変性が自動テストと運用文書で固定されている。
