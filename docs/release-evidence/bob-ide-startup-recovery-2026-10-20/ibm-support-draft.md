# IBM Bob問い合わせ草案（未送信）

件名：Bob 2.2.3：公開registerSourceで登録した第三者workflowがAddonManagerにより無効化される

IBM Bob 2.2.3（VS Code 1.126.0 / Windows / Electron 42.2.0）で、自作VS Code拡張からBobのexport API `registerSource(id, name)` を呼び、その戻り値の `registerWorkflow(workflow)` で定義を登録しています。

再現手順：

1. trustedなworkspaceを通常プロファイルで開きます。
2. 拡張から `registerSource("custom-workflow-source", "Custom workflows")` を呼び、workspaceで有効となるworkflowを登録します。
3. 登録APIは例外を返しません。ローカル検証と登録診断も成功します。
4. 登録後、Bobログに次の警告が出ます。実際のsource ID部分を除いて同じ文面です。

> Source "workflow-register" is registered but disabled because third party extensions are disabled.

5. Bob標準のStart Workflowボタンとworkflow選択肢が利用できなくなります。自作拡張の操作ハブでは同じ定義を検出できます。

確認したいこと：

- この版のIBM Bobで、第三者workflow sourceの登録は正式にサポートされていますか。
- サポートされる場合、正式な有効化手順、必要な設定、対応API／対応版を教えてください。
- 未対応の場合、独自の複数step workflowを配布・実行する公式な代替機構は何ですか。順序、承認、成果物検証を持つ実行を想定しています。

切り分け済み：workspace trustは有効、拡張のactivationは成功、workflow定義も検証・登録に成功しています。MCPは別途修正済みで、Bobの実clientで接続しています。Bob本体、ホスト名、firstParty指定、entitlement情報は変更していません。

添付する場合は、版情報と該当warningを抽出した最小ログに限定してください。この草案は送信しておらず、利用者の認証情報やソースコードを含みません。上記APIの公開性・サポート契約についても確認をお願いします。
