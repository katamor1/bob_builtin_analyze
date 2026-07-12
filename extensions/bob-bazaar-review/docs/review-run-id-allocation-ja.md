# Review Run ID 割り当て契約

## 1. 目的

同じ campaign で同じ target を複数回レビューしても、既存の `review-run.json`、`review-packet.md`、`record.yaml`、`triage.yaml` を暗黙に上書きしない。

## 2. 割り当て規則

利用者または target から得た ID を要求 ID とする。

```text
review-1
```

同じ campaign の record directory が存在しなければ、その ID をそのまま割り当てる。

既に存在する場合は、2桁以上の連番 suffix を付ける。

```text
review-1
review-1-02
review-1-03
...
```

`review-run.json` がなくても、record directory が存在すれば占有済みとして扱う。したがって、旧形式の `record.yaml` や `triage.yaml` だけが存在する legacy record も上書きしない。

## 3. 並行開始

ID の空き確認と予約を別操作にしない。候補 record directory を `recursive: false` の directory 作成で予約する。

複数の Review Run が同時に開始された場合、一方だけが要求 ID の directory を作成できる。ほかの開始処理は `EEXIST` を受けて次の suffix 候補へ進む。

このため、同時開始でも同じ ID の `review-run.json` を共有しない。

## 4. 失敗時

ID予約後、初回 `review-run.json` 保存に失敗した場合は、予約した directory が空であるときだけ削除する。

既存または別処理が作成した内容がある directory は削除しない。

## 5. 出力契約

実際に割り当てられた ID を次のすべてに使用する。

- `ReviewRunContext.reviewId`
- packet内の `review_id`
- Result Captureの期待 `review_id`
- review-result保存先
- Human Triageの `review_id`
- record directory

suffixが追加された場合、Review GUIは開始結果を受け取った時点で表示中の `review_id` を実際の割り当て値へ更新する。

## 6. テスト

`reviewRunCoordinator.test.js` で次を保証する。

- 2回目の同名開始は `-02` になる。
- 元の `review-run.json` は変更されない。
- legacy record directory は占有済みとして扱う。
- 並行開始した2件には異なるIDが割り当てられる。
