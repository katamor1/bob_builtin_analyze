# workflow-register 単体テスト仕様書

## 1. 目的

本書は`extensions/workflow-register`の自動テスト契約を定義する。
対象はcommand surface、文書契約、parser / validator、engine、run state、pause / review / branching、task snapshot、artifact reuse、retention、`Bob 操作ハブ`、`ワークフロー作成・編集`、公開APIである。

## 2. 実行方式

| 項目 | 内容 |
| --- | --- |
| compile | `npm run compile` |
| extension test | `node --test test/*.test.js` |
| repository contract | `node --test ../../scripts/three-extension-command-surface.test.js ../../scripts/three-extension-documentation-contract.test.js` |
| package gate | `npm run package && npm run package:policy` |
| runner | Node.js built-in test runner |
| filesystem | `fs.mkdtemp()`でtestごとに独立workspaceを作る |
| external API | VS Code / IBM BobはmockまたはExtension Host testで置換する |

## 3. 最上位surface contract

### WR-UT-SURFACE-001 manifest entry point

- `package.json.main`は`./out/extensionWithAuthoring.js`である。
- required `extensionDependencies`を追加しない。
- `onStartupFinished`と内部command activationを維持する。

### WR-UT-SURFACE-002 Command Palette公開

workflow-registerがCommand Paletteへ公開するcommandは次の2件だけである。

```text
workflowRegister.openOperationHub
workflowRegister.openWorkflowBuilder
```

title、category、menu visibilityをbyte-for-byteで検査する。内部commandはregistrationとactivation eventを維持しつつ、公開menuから隠す。

実テスト:

- `test/commandPalettePolicy.test.js`
- `../../scripts/three-extension-command-surface.test.js`

### WR-UT-SURFACE-003 廃止済み識別子

source、manifest、current documentationへ廃止済みcommand / view / panel identifierが再導入されていないことを検査する。
`workflowRegister.runs.retention.*`はsettings namespaceとして許可し、短いprefixだけで誤検知しない。

実テスト:

- `../../scripts/three-extension-command-surface.test.js`
- `../../scripts/three-extension-documentation-contract.test.js`

### WR-UT-SURFACE-004 current / historical documentation

- configured rootを再帰探索する。
- missing、duplicate、outside-root、symlinkを拒否する。
- unlisted documentはcurrentとする。
- current documentに旧IDまたは旧ユーザー向け表示名を許可しない。
- historical documentに旧参照がある場合、冒頭の`Superseded:`または`Replaced:`で正規routeを示す。
- internal module名やtest file名はユーザー向け表示名として誤検知しない。

実テスト: `../../scripts/three-extension-documentation-contract.test.js`

## 4. `Bob 操作ハブ`

### WR-UT-HUB-001 panel lifecycle

- viewTypeは`workflowRegisterOperationHub`。
- titleは`Bob 操作ハブ`。
- openを繰り返してもsingle panelを再利用する。
- close / extension disposeでpanel listener、watcher、timerを破棄する。

実テスト:

- `test/operationHubProviderBehavior.test.js`
- `test/operationHub.test.js`
- `test/japaneseGuiCopy.test.js`

### WR-UT-HUB-002 model

- workspace root、workflow catalog、run、extension status、setup stateをmodelへ反映する。
- running / paused / reviewing / held / checkpoint / completed / failedを正しく分類する。
- focus runはworkspace rootとrun IDの組で選ぶ。
- no-workspaceとoptional extension不在を安全に表示する。

実テスト:

- `test/operationHub.test.js`
- `test/operationHubHeldRecovery.test.js`

### WR-UT-HUB-003 自動更新

- `run.json`、`control.json`、artifact manifestのcreate / change / deleteをwatchする。
- event burstをdebounceする。
- action後の段階refreshを予約する。
- dispose後にrefreshしない。
- background error通知を同じcontextで重複させない。

実テスト: `test/operationHubAutoRefresh.test.js`

### WR-UT-HUB-004 action allowlist

- `operationHub.action`以外を拒否する。
- unknown actionを拒否する。
- actionごとのrequired fieldを検査する。
- optional extension不在時は対応commandを実行せず理由を返す。
- artifact openはcontained pathだけを許可する。

実テスト:

- `test/operationHubProviderBehavior.test.js`
- `test/operationHubArtifactReuse.test.js`

### WR-UT-HUB-005 mutation safety

- canonical physical workspace rootを使う。
- open workspace外rootを拒否する。
- workflow targetをcurrent catalogへ再照合する。
- run `expectedRevision`不一致を拒否する。
-同一root / target / actionを直列化する。
- stale mutationはstateを変更せずrefresh-requiredになる。

実テスト: `test/operationHubMutations.test.js`

### WR-UT-HUB-006 held recovery / artifact reuse

- live task、active manual step、artifact manifest、task snapshotの組合せでrecovery classを決める。
- evidence不足時にcompleted扱いしない。
- artifact manifestのworkflow identity、hash、inputs、contained pathを検証する。

実テスト:

- `test/operationHubHeldRecovery.test.js`
- `test/operationHubArtifactReuse.test.js`

## 5. `ワークフロー作成・編集`

### WR-UT-BUILDER-001 single panel / session

- viewTypeは`workflowRegisterBuilder`、titleは`ワークフロー作成・編集`。
- `empty` / `standard-template` / `edit`を同一panelで扱う。
- 同一sessionをrevealし、別sessionはgenerationを更新する。
- dirty sessionへ外部内容を無断適用しない。

### WR-UT-BUILDER-002 model round trip

- authoring modelをv1 Markdownへserializeできる。
- unknown front matterとMarkdown bodyを保持する。
- parser / validatorで再読込できる。
- branching、transition、manual form / approvalを保持する。

### WR-UT-BUILDER-003 reference analysis

- `includeState`、`stateKey`、`artifact.producedBy`、`requiredWhen`のproducer削除・移動を検出する。
- step draftの利用者向けmessage、button label、confirmationを検証する。

### WR-UT-BUILDER-004 標準テンプレートから作成

- metadataから選択肢とtyped defaultを生成する。
- project profile、customization、preview、diff、readinessを同一sessionで扱う。
- `string` / `number` / `boolean` / `null`の型を保持する。
- VCS別prompt supplementを誤混入しない。

### WR-UT-BUILDER-005 transactional save

- target pathをworkspace内へ制限する。
- symlink / junction escapeを拒否する。
- open時のfile expectationと現在fileを比較する。
- target path単位のqueueとtransaction lockで直列化する。
- backup作成後にtemporary fileからatomic commitする。
- stale generation、external change、validation errorでは保存しない。

実テスト:

- `test/workflowBuilderTransactionalSave.test.js`
- `test/workflowBuilderSkipResumeReadinessWebview.test.js`
- `test/workflowSkipResumeReadinessPreview.test.js`
- `test/templateCustomizationStudio.test.js`
- authoring / serializer / loader / reference analysis test群

## 6. parser / schema / validator

| ID | 観点 | 期待結果 |
| --- | --- | --- |
| WR-UT-PARSE-001 | v1 parse | normalized `CoreWorkflowDefinition`を返す。 |
| WR-UT-PARSE-002 | legacy parse | compatibility parserで読み、diagnosticsを返す。 |
| WR-UT-PARSE-003 | required field | `name` / `description`不足をerrorにする。 |
| WR-UT-VALID-001 | duplicate | step / decision ID重複を拒否する。 |
| WR-UT-VALID-002 | state reference | missing producerと前方参照を拒否する。 |
| WR-UT-VALID-003 | artifact | missing `producedBy`とsource mismatchを拒否する。 |
| WR-UT-VALID-004 | guardrail | allowed / denied衝突を拒否する。 |
| WR-UT-VALID-005 | branching | unknown target、undeclared backward loop、上限不正を拒否する。 |
| WR-UT-VALID-006 | workflow contract | provider、preflight、nested command、template mirror driftを検出する。 |

## 7. engine / run state

| ID | 観点 | 期待結果 |
| --- | --- | --- |
| WR-UT-ENGINE-001 | full | 全step完了でrunが`completed`になる。 |
| WR-UT-ENGINE-002 | single step | 1step完了後も次stepをpendingで保持する。 |
| WR-UT-ENGINE-003 | out-of-order | predecessor未完了を拒否する。 |
| WR-UT-ENGINE-004 | manual | completion source無しで`held`になる。 |
| WR-UT-ENGINE-005 | review | step成功後に`reviewing`で停止する。 |
| WR-UT-ENGINE-006 | retry | previous attemptを保存して再実行する。 |
| WR-UT-ENGINE-007 | preflight | failureをrun / stepへ保存する。 |
| WR-UT-ENGINE-008 | branching | transition、loop reset、checkpoint、approve / abortを決定的に処理する。 |
| WR-UT-RUN-001 | atomic save | `run.json`をtemporary file + renameで保存する。 |
| WR-UT-RUN-002 | recovery | workflow identity、hash、file、inputs一致時だけreuseする。 |
| WR-UT-RUN-003 | path safety | traversal、symlink、junction、identity changeを拒否する。 |

## 8. pause / review / held

- `control.json`のrequest / clear / resume note / override round trip。
- manual pauseをautomatic pauseより先に評価する。
- elapsed minutes、agent count、local cutoffの境界値をfixed clockで検証する。
- paused runの再開時にcontrolをclearする。
- completed / failed runへのpauseを拒否する。
- review acceptanceをdurable stateとlive Bob gateへ一度だけ反映する。
- detached held recoveryで根拠不足を拒否する。
- lock heartbeatのatomic replacementをtransient contentionとして再試行する。

## 9. task snapshot / handoff / artifact

- latest更新、max-per-run pruning、byte cap、optional field削減。
-必須identityだけで上限超過する場合は保存拒否。
- workflow / run / step / definition hash一致時だけassistant textを復旧。
- `args[0]`と明示fieldへ同じtrim済みtextを渡す。
- file sinkのworkspace escape拒否。
- artifact manifest schema、hash、source run、inputs、producer stepを検証。
- task snapshot import後もmanifestをauthorityにする。

## 10. retention

- inventoryのbounded direct scanとmeasurement completeness。
- active / referenced / pinned / future / malformed / unsafe runをblockする。
- stable plan digestとfresh inventory再構築。
- trust checkをroot discovery / filesystem accessより前に行う。
- multi-rootでrootをrunより先に選ぶ。
- owner guard、lease token、heartbeat、release、execution exclusion。
- quarantine rename、reverse rollback、residual preservation。
- migration backupのcreate-once publicationとcross-process crash pair保全。
- diagnostics / evidenceへ本文を出さないprivacy contract。

## 11. soft dependency / provider ownership

| ID | 観点 | 期待結果 |
| --- | --- | --- |
| WR-UT-INTEGRATION-001 | IBM Bob不在 | standalone commandとBuilderを利用できる。 |
| WR-UT-INTEGRATION-002 | companion不在 |操作ハブに理由を表示し、他機能を維持する。 |
| WR-UT-INTEGRATION-003 | late activation | provider登録が回復する。 |
| WR-UT-INTEGRATION-004 | owner collision | 同一IDの別owner登録を拒否する。 |
| WR-UT-INTEGRATION-005 | disposable | owner disposal後だけ再登録でき、古いdisposableは新登録を削除しない。 |

## 12. 非機能観点

- testごとにworkspace、clock、UUID、process resultを固定する。
- Windows / POSIX path差をtable-drivenで検証する。
- UTF-8 byte上限はcharacter countで代用しない。
- WebviewはCSP、nonce、message allowlist、keyboard labelを検証する。
- source regexだけでなくmodel helperと実file I/Oを検証する。
- testは実workspace、個人path、credential、live Bob taskへ依存しない。

## 13. 完了条件

- `npm run compile`が成功する。
- `node --test test/*.test.js`が成功する。
- 3拡張command surface契約が成功する。
- 3拡張documentation契約が成功する。
- `npm run package`と`npm run package:policy`が成功する。
- Linux / Windowsで同一契約を実行できる。
