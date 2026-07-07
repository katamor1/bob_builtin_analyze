export function renderWorkflowBuilderHelpCatalogSupplementScript(): string {
  return String.raw`
Object.assign(helpCatalog, {
  'tab.branching': { id: 'tab.branching', labelJa: 'Branching', fieldKey: 'branching', summary: '条件分岐と step-back loop を定義します。', effect: 'transition で前の step へ戻る場合に loop ID、entryStep、反復上限、checkpoint 文言を明示できます。' },
  'input.requiredWhen': { id: 'input.requiredWhen', labelJa: '条件付き必須', fieldKey: 'inputs.<id>.requiredWhen', summary: '他の input 値に応じて、この input を必須にする条件式です。', effect: 'モード依存の入力条件を workflow 定義へ残せます。', caution: 'validator は参照先 input の存在を確認します。未対応の式は warning になります。' },
  'input.prompt': { id: 'input.prompt', labelJa: '開始時に尋ねる', fieldKey: 'inputs.<id>.prompt', summary: 'workflow 開始時にユーザーへ入力を促す対象かを指定します。', effect: '実行前入力 UI で値を集める前提を明示できます。' },
  'input.defaultJson': { id: 'input.defaultJson', labelJa: '既定値', fieldKey: 'inputs.<id>.default', summary: 'input の既定値です。GUI では JSON として編集します。', effect: 'string / number / boolean / null の型を保ったまま保存できます。', caution: '文字列は引用符付き JSON で入力してください。' },
  'artifact.schema': { id: 'artifact.schema', labelJa: '成果物 schema', fieldKey: 'artifacts[].schema', summary: '成果物の形式や検証 schema を表す任意の識別子です。', effect: 'completion.validateResult などで成果物の期待形を説明しやすくなります。' },
  'branching.enabled': { id: 'branching.enabled', labelJa: 'Branching 有効化', fieldKey: 'branching.enabled', summary: 'step transition による分岐を有効にします。', effect: 'transition を使う workflow では true にする必要があります。' },
  'branching.loop.id': { id: 'branching.loop.id', labelJa: 'Loop ID', fieldKey: 'branching.loops[].id', summary: 'backward goto で参照する loop の識別子です。', effect: 'transition.decisions[].loop から参照され、反復回数の制御に使われます。' },
  'branching.loop.entryStep': { id: 'branching.loop.entryStep', labelJa: 'Loop entryStep', fieldKey: 'branching.loops[].entryStep', summary: 'loop の開始 step です。', effect: 'backward goto は、この entryStep を指す必要があります。' },
  'branching.loop.title': { id: 'branching.loop.title', labelJa: 'Loop 表示名', fieldKey: 'branching.loops[].title', summary: 'loop を人間に説明する名称です。', effect: 'checkpoint や診断で loop の目的を理解しやすくします。' },
  'branching.loop.maxIterations': { id: 'branching.loop.maxIterations', labelJa: '最大反復回数', fieldKey: 'branching.loops[].maxIterations', summary: 'loop を何回まで繰り返せるかを指定します。', effect: '無限に戻り続けることを防ぎます。' },
  'branching.loop.extensionSize': { id: 'branching.loop.extensionSize', labelJa: '延長単位', fieldKey: 'branching.loops[].extensionSize', summary: 'checkpoint で反復回数を延長するときの単位です。', effect: '人間承認により追加試行を許可する設計にできます。' },
  'branching.loop.checkpointTitle': { id: 'branching.loop.checkpointTitle', labelJa: 'Checkpoint タイトル', fieldKey: 'branching.loops[].checkpoint.title', summary: 'loop 上限到達時に表示する checkpoint 名です。', effect: '利用者に、なぜ workflow が止まったのかを伝えやすくします。' },
  'branching.loop.checkpointMessage': { id: 'branching.loop.checkpointMessage', labelJa: 'Checkpoint メッセージ', fieldKey: 'branching.loops[].checkpoint.message', summary: 'loop 上限到達時に表示する確認文です。', effect: '延長、調査、中止の判断に必要な観点を示せます。' },
  'section.branchCheckpoint': { id: 'section.branchCheckpoint', labelJa: 'Checkpoint', fieldKey: 'branching.loops[].checkpoint', summary: 'loop が上限に達したときの人間確認設定です。', effect: '反復を続けるか、中止するかを人間が判断しやすくします。' }
});
`
}

export function renderWorkflowBuilderHelpTabSupplementScript(): string {
  return String.raw`
const workflowBuilderHelpTabForIdBase = helpTabForId;
helpTabForId = function(id) {
  if (!id) return undefined;
  if (id.indexOf('branching.') === 0 || id === 'section.branchCheckpoint') return 'branching';
  if (id.indexOf('manual.') === 0 || id.indexOf('transition.') === 0 || id.indexOf('result.sink.') === 0 || id === 'section.manualForm' || id === 'section.manualApproval' || id === 'section.transition' || id === 'section.resultSinks') return 'step';
  return workflowBuilderHelpTabForIdBase(id);
};
if (typeof decorateHelpTargets === 'function') decorateHelpTargets(document);
if (typeof renderHelpPanel === 'function') renderHelpPanel(activeHelpId || helpForActiveTab());
`
}
