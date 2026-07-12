# Review Run Wizard v3 Iteration 1 実装仕様

## 1. 目的

Iteration 1 は、Bazaar Review GUI、Result Capture、Human Triage を、1つの永続化された **Review Run** として接続する。

標準フローでは、利用者が画面ごとに次を再入力しないことを目標とする。

- `campaign_id`
- `review_id`
- review-result JSON path
- triage path

対象範囲は次の通りである。

```text
Bazaar target を取得
  -> Review Run を開始
  -> review packet を保存
  -> Bob context へ追加
  -> review-result を検証・保存
  -> 同じ Review Run の Human Triage を開く
  -> triage 雛形を保存
```

中断 run の一覧・再開、時間計測、record / summary 一括 finalize、legacy recovery、Campaign Dashboard は Iteration 2 以降とする。

## 2. Review Run artifact

Review Run は既存の review record directory に保存する。

```text
.bob-review-records/
  campaigns/
    <campaign_id>/
      records/
        <review_id>/
          review-run.json
          review-packet.md
          triage.yaml
          record.yaml
```

review-result の既存保存先は変更しない。

```text
.bob/review/results/<review_id>.json
.bob/review/results/<review_id>.md
.bob/review/results/<review_id>.artifact-metadata.json
```

## 3. `review-run.json`

schema version は次で固定する。

```text
bazaar-review-run/v1
```

代表例:

```json
{
  "schemaVersion": "bazaar-review-run/v1",
  "workspaceRoot": "C:/repo",
  "campaignId": "phase1-bazaar-review-uat-001",
  "reviewId": "bazaar-r125-project-rule-review",
  "phase": "packet",
  "createdAt": "2026-07-12T00:00:00.000Z",
  "updatedAt": "2026-07-12T00:01:00.000Z",
  "target": {
    "mode": "singleRevision",
    "repositoryRoot": "C:/repo",
    "revision": "125"
  },
  "artifacts": {
    "reviewPacketPath": ".bob-review-records/campaigns/phase1-bazaar-review-uat-001/records/bazaar-r125-project-rule-review/review-packet.md"
  }
}
```

### 3.1 phase

phase は次の順序で進む。

```text
target -> packet -> result -> triage -> completed
```

Iteration 1 が自動更新する phase は `target`、`packet`、`result`、`triage` である。

phase を逆方向へ戻す更新は拒否する。

### 3.2 artifacts

artifact path は workspace-relative の POSIX 形式で保存する。

- `reviewPacketPath`
- `reviewResultJsonPath`
- `reviewResultMarkdownPath`
- `reviewResultMetadataPath`
- `triageYamlPath`
- 将来用: `recordYamlPath`
- 将来用: `summaryJsonPath`
- 将来用: `summaryMarkdownPath`

workspace 外へ解決される path は保存しない。

## 4. ID と path の安全性

`campaignId` と `reviewId` は1つの安全な path segment でなければならない。

次を拒否する。

- 空文字
- `.` / `..`
- `/` / `\`
- 制御文字
- Windows 予約名: `CON`, `PRN`, `AUX`, `NUL`, `COM1`..`COM9`, `LPT1`..`LPT9`
- 末尾の dot
- 末尾の space

Review GUI はtargetからreview IDを提案する。

| mode | 例 |
|---|---|
| `singleRevision` | `bazaar-r125-project-rule-review` |
| `revisionRange` | `bazaar-r120-r126-project-rule-review` |
| `workingTreeSinceRevision` | `bazaar-r126-working-tree-project-rule-review` |

利用者は提案値を変更できるが、host側で再検証する。

## 5. 保存方式

`review-run.json` は次の順で保存する。

1. record directory を作成する。
2. 同じdirectory内の一時ファイルへUTF-8 JSONを書き込む。
3. 一時ファイルを `review-run.json` へrenameする。
4. 失敗時は所有する一時ファイルを削除する。

Windowsで既存fileへのrenameが拒否された場合のみ、既存destinationを削除してrenameを再試行する。

## 6. Review GUI

`Bob Bazaar Review: GUI を開く` は Wizard v3 として次を表示する。

- `campaign_id`
- `review_id`
- target mode / revision入力
- project rules利用有無
- Review Run状態
- Result Captureへの導線
- Human Triageへの導線

### 6.1 target取得

`対象情報を取得` の成功時に、target metadataと提案review IDを画面へ返す。

### 6.2 Review Run開始

`Review Run を開始して Bob に追加` は次を行う。

1. targetを再取得する。
2. `ReviewRunContext`を`target` phaseで保存する。
3. packetへReview Run metadataを追加する。
4. packetを`review-packet.md`へ保存する。
5. runを`packet` phaseへ更新する。
6. Markdown documentを開く。
7. IBM Bobが利用可能ならBob contextへ追加する。
8. workflow step連携を従来通り実行する。

packetには次の契約を含める。

```md
## Review Run

- campaign_id: <campaign_id>
- review_id: <review_id>
- output_contract: Use this exact review_id in the final review-result JSON.
```

## 7. Result Capture

`bobBazaar.openResultCaptureGui` は従来通り引数なしで利用できる。

Review Runから開く場合は、次をcommand引数として受け取る。

```ts
interface ReviewRunCommandInput {
  workspaceRoot: string
  campaignId: string
  reviewId: string
}
```

Review Run bound modeでは次を行う。

1. persisted `review-run.json`を読み直す。
2. active Review Runの`workspaceRoot`をcapture保存先に使う。
3. Bob出力を既存validatorで検証する。
4. captured `review_id`とactive Review Runの`reviewId`を比較する。
5. 一致時だけresult artifact pathをrunへ保存する。
6. runを`result` phaseへ更新する。
7. 同じReview Run引数でHuman Triageを開く。

captured `review_id`が一致しない場合は、暗黙補正や自動renameを行わずエラーにする。

## 8. Human Triage

`bobBazaar.openHumanTriageGui` も引数なしのstandalone modeを維持する。

Review Run bound modeでは次の値をread-only表示する。

- `campaign_id`
- `review_id`
- review-result JSON path

`triage 雛形を生成` の成功後、`triage.yaml` pathをReview Runへ保存し、phaseを`triage`へ更新する。

既存のdecision保存、record作成、summary生成commandは変更しない。

## 9. 互換性

次を維持する。

- 既存command ID
- workflow action provider ID
- `.bob/review/results` artifact path
- `.bob-review-records` record / triage / summary形式
- Result Capture standalone mode
- Human Triage standalone mode
- Bazaar CLIの`--no-aliases`
- MCPのreadonly既定値
- Webview CSP nonce
- host側message action allowlist

新規runtime dependencyは追加しない。

## 10. テスト

追加テスト:

- `reviewRunPaths.test.js`
  - safe path生成
  - traversal / separator / reserved name拒否
- `reviewRunState.test.js`
  - context作成
  - immutable phase更新
  - backward transition拒否
  - stable review ID生成
- `reviewRunStore.test.js`
  - JSON round trip
  - temporary file cleanup
  - malformed JSON拒否
  - unsupported schema拒否
  - identity mismatch拒否
- `reviewRunCoordinator.test.js`
  - run開始
  - packet保存
  - result ID mismatch拒否
  - result path保存
  - triage path保存
  - workspace escape拒否
- `guiFirstSurfaces.test.js`
  - Wizard v3表示
  - command context handoff
  - Result Capture active run表示
  - Human Triage read-only identity
  - CSP / inline handler回帰

## 11. UAT

### UAT-01 single revision標準フロー

1. Bazaar Review GUIを開く。
2. campaignを確認する。
3. revisionを指定して対象情報を取得する。
4. 提案review IDを確認する。
5. Review Runを開始する。
6. Bob出力JSONをResult Captureで保存する。
7. 自動で開いたHuman Triageからtriage雛形を生成する。

合格条件:

- campaign ID、review ID、result pathを画面ごとに再入力しない。
- `review-run.json`、`review-packet.md`、review-result、`triage.yaml`が同じreview IDで結び付く。
- Review Run phaseが`triage`になる。

### UAT-02 review ID mismatch

1. Review Runとは異なる`review_id`を持つJSONを貼り付ける。

合格条件:

- review-result自体のvalidation結果とは別に、Review Run mismatchが表示される。
- active Review Runは`packet` phaseのままになる。
- 別IDのartifactをactive runへ関連付けない。

### UAT-03 standalone互換性

1. Command PaletteからResult Captureを直接開く。
2. Command PaletteからHuman Triageを直接開く。

合格条件:

- 従来通りworkspaceやIDを選択・入力できる。
- Review Run引数がなくてもcommandが動作する。
