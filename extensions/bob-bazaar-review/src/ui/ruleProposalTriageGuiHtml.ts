import { sanitizeRemoteSafeText } from "../ruleAuthoring/remoteSafeText"
import {
  hasUtf8ByteLength,
  RULE_AUTHORING_TEXT_BYTE_LIMITS
} from "../ruleAuthoring/ruleAuthoringTextLimits"
import { confidenceLabel, proposalAssetLabel, proposalOperationLabel, reviewDecisionLabel, severityLabel } from "./displayLabels"

export type RuleProposalTriageAssetModel = "rule" | "project_context" | "prompt_addendum"
export type RuleProposalTriageDecisionModel = "pending" | "accept" | "reject" | "edit"

export interface RuleProposalTriageRuleEditModel {
  category: string
  title: string
  description: string
  severityOnFail: "error" | "warning" | "info"
  appliesWhen: readonly string[]
  evidenceRequired: boolean
  reviewHint: string
}

export interface RuleProposalTriageOperationModel {
  candidateId: string
  operation: "add" | "update" | "retire"
  targetId: string | null
  title: string
  severity: string
  confidence: string
  rationale: string
  sourceCount: number
  sourceLocators: readonly string[]
  blockingConflictIds: readonly string[]
  decision: RuleProposalTriageDecisionModel
  rejectReason: string
  existingSummary?: string
  proposedSummary?: string
  existingSummaryTruncated?: boolean
  proposedSummaryTruncated?: boolean
  comparisonAvailable?: boolean
  editRule?: RuleProposalTriageRuleEditModel
  editHeading?: string
  editMarkdown?: string
}

export interface RuleProposalTriageGroupModel {
  asset: RuleProposalTriageAssetModel
  label: string
  operations: readonly RuleProposalTriageOperationModel[]
}

export interface RuleProposalTriageConflictAlternativeModel {
  alternativeId: string
  description: string
}

export interface RuleProposalTriageConflictModel {
  conflictId: string
  summary: string
  blocking: boolean
  affectedCandidateIds?: readonly string[]
  alternatives: readonly RuleProposalTriageConflictAlternativeModel[]
}

export interface RuleProposalTriageRecoveryModel {
  transactionId: string
  status: string
  recoveryAction: "rollback" | "resume"
}

export interface RuleProposalTriagePreviewModel {
  targetCount: number
  acceptedCount: number
  editedCount: number
  rejectedCount: number
  generatedAt: string
  planDigest: string
}

export interface RuleProposalTriageTransactionModel {
  transactionId: string
  status: "committed" | "rolled_back"
  targetCount: number
}

export interface RuleProposalTriageGuiModel {
  cspSource: string
  runId: string
  groups: readonly RuleProposalTriageGroupModel[]
  conflicts: readonly RuleProposalTriageConflictModel[]
  decisionsComplete: boolean
  canPreview: boolean
  canApply: boolean
  staleWarning: string
  status: string
  recovery: readonly RuleProposalTriageRecoveryModel[]
  preview?: RuleProposalTriagePreviewModel
  transaction?: RuleProposalTriageTransactionModel
}

interface SafeRuleProposalTriageGuiModel extends RuleProposalTriageGuiModel {
  groups: RuleProposalTriageGroupModel[]
  conflicts: RuleProposalTriageConflictModel[]
  recovery: RuleProposalTriageRecoveryModel[]
}

const DISPLAY_BYTES = 8_192
const SHORT_DISPLAY_BYTES = 512
const MAX_OPERATIONS = 400
const MAX_CONFLICTS = 200
const MAX_SOURCE_LOCATORS = 64
const CSP_SOURCE = /^[A-Za-z0-9+.:/_-]+$/
const EDITABLE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/
const MANAGED_MARKER = /bob-managed-section/i

export function renderRuleProposalTriageGuiHtml(
  model: RuleProposalTriageGuiModel,
  nonce: string
): string {
  const safe = allowlistedModel(model)
  const safeNonce = escapeHtml(display(nonce, 256))
  const recoveryRequired = safe.recovery.length > 0
  const canPreview = safe.canPreview && safe.decisionsComplete && !recoveryRequired
  const canApply = safe.canApply && safe.decisionsComplete && !recoveryRequired
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${escapeHtml(safe.cspSource)} 'unsafe-inline'; script-src 'nonce-${safeNonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>規約案の確認・採否</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 18px; }
    h1 { font-size: 21px; margin: 0 0 8px; }
    h2 { font-size: 16px; margin: 0 0 8px; }
    h3 { font-size: 14px; margin: 0; }
    .card { border: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); border-radius: 6px; padding: 12px; margin-top: 12px; }
    .operation { border: 1px solid var(--vscode-panel-border); border-radius: 5px; margin-top: 8px; padding: 10px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: space-between; }
    .actions { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 9px; }
    .badge { border: 1px solid var(--vscode-panel-border); border-radius: 999px; padding: 2px 7px; font-size: 12px; }
    .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .warning { color: var(--vscode-editorWarning-foreground); white-space: pre-wrap; }
    .error { color: var(--vscode-errorForeground); white-space: pre-wrap; }
    .ok { color: var(--vscode-testing-iconPassed); }
    .locator { margin: 3px 0; overflow-wrap: anywhere; }
    button { border: 0; padding: 7px 10px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button:disabled { opacity: 0.55; cursor: default; }
    textarea, input, select { color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); padding: 6px; }
    textarea { width: min(100%, 720px); min-height: 55px; box-sizing: border-box; }
    details { margin-top: 7px; }
    code { font-family: var(--vscode-editor-font-family); overflow-wrap: anywhere; }
    ul { margin: 5px 0 0; padding-left: 20px; }
  </style>
</head>
<body>
  <h1>規約案の確認・採否</h1>
  <div class="muted">実行 ID <code>${escapeHtml(safe.runId)}</code></div>
  ${renderRecovery(safe.recovery)}
  ${safe.recovery.length > 0 ? "" : safe.groups.map(renderGroup).join("")}
  ${safe.recovery.length > 0 ? "" : renderConflicts(safe.conflicts)}
  <section class="card" aria-labelledby="apply-heading">
    <h2 id="apply-heading">反映プレビューと完了処理</h2>
    ${safe.decisionsComplete ? `<div class="ok">すべての候補を判定済みです。</div>` : `<div class="warning">すべての候補について採用、却下、または編集を選んでください。</div>`}
    ${safe.staleWarning ? `<div class="warning">${escapeHtml(safe.staleWarning)}</div>` : ""}
    ${renderPreview(safe.preview)}
    ${renderTransaction(safe.transaction)}
    <div class="actions">
      <button type="button" data-action="previewApply"${canPreview ? "" : " disabled"}>反映プレビューを更新</button>
      <button type="button" data-action="applyApproved"${canApply ? "" : " disabled"}>採用した変更を反映</button>
      <button type="button" class="secondary" data-action="close">閉じる</button>
    </div>
    <div id="status" class="muted">${escapeHtml(safe.status)}</div>
  </section>
  <script nonce="${safeNonce}">
    const vscode = acquireVsCodeApi();
    const allowedActions = new Set([
      'setDecision',
      'editRule',
      'resolveConflict',
      'openEvidence',
      'previewApply',
      'applyApproved',
      'recoverTransaction',
      'close'
    ]);
    document.addEventListener('click', (event) => {
      const button = event.target && event.target.closest ? event.target.closest('[data-action]') : undefined;
      if (!button || button.disabled) return;
      const type = button.dataset.action;
      if (!allowedActions.has(type)) return;
      if (type === 'setDecision') {
        const message = { type, candidateId: button.dataset.candidateId, decision: button.dataset.decision };
        if (message.decision === 'reject') {
          const field = document.querySelector('[data-reject-reason="' + cssEscape(message.candidateId) + '"]');
          if (field && field.value.trim()) message.rejectReason = field.value.trim();
        }
        vscode.postMessage(message);
        return;
      }
      if (type === 'editRule') {
        const form = document.querySelector('[data-edit-form="' + cssEscape(button.dataset.candidateId) + '"]');
        if (!form) return;
        if (form.dataset.editKind === 'markdown') {
          vscode.postMessage({
            type,
            candidateId: button.dataset.candidateId,
            markdown: {
              heading: form.querySelector('[data-edit-field="heading"]').value,
              markdown: form.querySelector('[data-edit-field="markdown"]').value
            }
          });
          return;
        }
        vscode.postMessage({
          type,
          candidateId: button.dataset.candidateId,
          rule: {
            category: form.querySelector('[data-edit-field="category"]').value,
            title: form.querySelector('[data-edit-field="title"]').value,
            description: form.querySelector('[data-edit-field="description"]').value,
            severity_on_fail: form.querySelector('[data-edit-field="severity"]').value,
            applies_when: splitLines(form.querySelector('[data-edit-field="appliesWhen"]').value),
            evidence_required: Boolean(form.querySelector('[data-edit-field="evidenceRequired"]').checked),
            review_hint: form.querySelector('[data-edit-field="reviewHint"]').value
          }
        });
        return;
      }
      if (type === 'resolveConflict') {
        vscode.postMessage({
          type,
          candidateId: button.dataset.candidateId,
          conflictId: button.dataset.conflictId,
          alternativeId: button.dataset.alternativeId
        });
        return;
      }
      if (type === 'openEvidence') {
        if (button.dataset.comparisonDocument === 'full') {
          vscode.postMessage({
            type,
            candidateId: button.dataset.candidateId,
            comparisonDocument: 'full'
          });
          return;
        }
        vscode.postMessage({
          type,
          candidateId: button.dataset.candidateId,
          sourceRefIndex: Number(button.dataset.sourceRefIndex)
        });
        return;
      }
      if (type === 'recoverTransaction') {
        vscode.postMessage({
          type,
          transactionId: button.dataset.transactionId,
          action: button.dataset.recoveryAction === 'resume' ? 'resume' : 'rollback'
        });
        return;
      }
      vscode.postMessage({ type });
    });
    function splitLines(value) {
      return String(value || '').split(/\\r?\\n/).map((item) => item.trim()).filter(Boolean);
    }
    function cssEscape(value) {
      return String(value || '').replace(/(["\\\\])/g, '\\$1');
    }
  </script>
</body>
</html>`
}

function renderGroup(group: RuleProposalTriageGroupModel): string {
  return `<section class="card" data-asset="${escapeHtml(group.asset)}">
    <h2>${escapeHtml(proposalAssetLabel(group.asset))}</h2>
    ${group.operations.length === 0
      ? `<div class="muted">提案された変更はありません。</div>`
      : group.operations.map((operation) => renderOperation(group.asset, operation)).join("")}
  </section>`
}

function renderOperation(
  asset: RuleProposalTriageAssetModel,
  operation: RuleProposalTriageOperationModel
): string {
  const pending = operation.decision === "pending"
  return `<article class="operation" data-candidate-id="${escapeHtml(operation.candidateId)}">
    <div class="row">
      <h3>${escapeHtml(operation.title)}</h3>
      <div>
        <span class="badge">${escapeHtml(proposalOperationLabel(operation.operation))}</span>
        <span class="badge">確信度: ${escapeHtml(confidenceLabel(operation.confidence))}</span>
        ${operation.severity ? `<span class="badge">重大度: ${escapeHtml(severityLabel(operation.severity))}</span>` : ""}
        <span class="badge">判定: ${pending ? "未判定（必須）" : escapeHtml(reviewDecisionLabel(operation.decision))}</span>
      </div>
    </div>
    <div class="muted">候補 <code>${escapeHtml(operation.candidateId)}</code>${operation.targetId ? ` · 反映先 <code>${escapeHtml(operation.targetId)}</code>` : ""}</div>
    <p>${escapeHtml(operation.rationale)}</p>
    ${renderComparison(operation)}
    <div><strong>${escapeHtml(operation.sourceCount)}件の根拠</strong></div>
    <ul>${operation.sourceLocators.map((locator, index) => `<li class="locator">${escapeHtml(locator)} <button type="button" class="secondary" data-action="openEvidence" data-candidate-id="${escapeHtml(operation.candidateId)}" data-source-ref-index="${index}">根拠を開く</button></li>`).join("")}</ul>
    ${operation.blockingConflictIds.length > 0 ? `<div class="warning">解決が必要な競合: ${operation.blockingConflictIds.map(escapeHtml).join(", ")}</div>` : ""}
    <label class="muted">却下理由（任意）<br><textarea data-reject-reason="${escapeHtml(operation.candidateId)}">${escapeHtml(operation.rejectReason)}</textarea></label>
    <div class="actions">
      <button type="button" data-action="setDecision" data-candidate-id="${escapeHtml(operation.candidateId)}" data-decision="accept">採用</button>
      <button type="button" class="secondary" data-action="setDecision" data-candidate-id="${escapeHtml(operation.candidateId)}" data-decision="reject">却下</button>
    </div>
    ${operation.operation === "retire"
      ? ""
      : asset === "rule"
        ? renderRuleEditForm(operation)
        : renderMarkdownEditForm(operation)}
  </article>`
}

function renderComparison(operation: RuleProposalTriageOperationModel): string {
  if (!operation.existingSummary && !operation.proposedSummary) return ""
  return `<details class="comparison">
    <summary>現在の内容と規約案を比較</summary>
    <div><strong>現在の承認済み内容</strong>${operation.existingSummaryTruncated ? ` <span class="warning">（一部省略）</span>` : ""}<pre>${escapeHtml(operation.existingSummary ?? "利用不可")}</pre></div>
    <div><strong>規約案</strong>${operation.proposedSummaryTruncated ? ` <span class="warning">（一部省略）</span>` : ""}<pre>${escapeHtml(operation.proposedSummary ?? "利用不可")}</pre></div>
    ${operation.comparisonAvailable ? `<button type="button" class="secondary" data-action="openEvidence" data-candidate-id="${escapeHtml(operation.candidateId)}" data-comparison-document="full">全文比較を開く</button>` : ""}
  </details>`
}

function renderRuleEditForm(operation: RuleProposalTriageOperationModel): string {
  const edit = operation.editRule ?? {
    category: "",
    title: operation.title,
    description: "",
    severityOnFail: "error" as const,
    appliesWhen: [],
    evidenceRequired: false,
    reviewHint: ""
  }
  return `<details data-edit-form="${escapeHtml(operation.candidateId)}" data-edit-kind="rule">
    <summary>規約案を編集</summary>
    <label class="muted">カテゴリ<br><input data-edit-field="category" value="${escapeHtml(edit.category)}"></label><br>
    <label class="muted">表示名<br><input data-edit-field="title" value="${escapeHtml(edit.title)}"></label><br>
    <label class="muted">説明<br><textarea data-edit-field="description">${escapeHtml(edit.description)}</textarea></label><br>
    <label class="muted">重大度<br><select data-edit-field="severity">${(["error", "warning", "info"] as const).map((severity) => `<option value="${severity}"${edit.severityOnFail === severity ? " selected" : ""}>${escapeHtml(severityLabel(severity))}</option>`).join("")}</select></label><br>
    <label class="muted">適用条件（1行に1件）<br><textarea data-edit-field="appliesWhen">${escapeHtml(edit.appliesWhen.join("\n"))}</textarea></label><br>
    <label><input type="checkbox" data-edit-field="evidenceRequired"${edit.evidenceRequired ? " checked" : ""}> 根拠を必須にする</label><br>
    <label class="muted">レビュー時の補足<br><textarea data-edit-field="reviewHint">${escapeHtml(edit.reviewHint)}</textarea></label>
    <div class="actions"><button type="button" data-action="editRule" data-candidate-id="${escapeHtml(operation.candidateId)}">検証して編集内容を保存</button></div>
  </details>`
}

function renderMarkdownEditForm(operation: RuleProposalTriageOperationModel): string {
  return `<details data-edit-form="${escapeHtml(operation.candidateId)}" data-edit-kind="markdown">
    <summary>提案された管理対象 Markdown を編集</summary>
    <label class="muted">見出し<br><input data-edit-field="heading" value="${escapeHtml(operation.editHeading ?? operation.title)}"></label><br>
    <label class="muted">Markdown<br><textarea data-edit-field="markdown">${escapeHtml(operation.editMarkdown ?? "")}</textarea></label>
    <div class="actions"><button type="button" data-action="editRule" data-candidate-id="${escapeHtml(operation.candidateId)}">検証して編集内容を保存</button></div>
  </details>`
}

function renderConflicts(conflicts: readonly RuleProposalTriageConflictModel[]): string {
  if (conflicts.length === 0) return ""
  return `<section class="card"><h2>競合</h2>${conflicts.map((conflict) => `<article class="operation">
    <div><strong>${escapeHtml(conflict.conflictId)}</strong>${conflict.blocking ? ` <span class="warning">解決必須</span>` : ""}</div>
    <p>${escapeHtml(conflict.summary)}</p>
    <div class="muted">影響を受ける候補に適用する選択肢を選んでください。</div>
    ${conflict.alternatives.map((alternative) => `<div class="operation">
      <div>${escapeHtml(alternative.description)} <code>${escapeHtml(alternative.alternativeId)}</code></div>
      <div class="actions">${(conflict.affectedCandidateIds ?? []).map((candidateId) => `<button type="button" data-action="resolveConflict" data-candidate-id="${escapeHtml(candidateId)}" data-conflict-id="${escapeHtml(conflict.conflictId)}" data-alternative-id="${escapeHtml(alternative.alternativeId)}">${escapeHtml(candidateId)} に適用</button>`).join("")}</div>
    </div>`).join("")}
  </article>`).join("")}</section>`
}

function renderRecovery(recovery: readonly RuleProposalTriageRecoveryModel[]): string {
  if (recovery.length === 0) return ""
  return `<section class="card"><h2>未完了の反映処理を復旧</h2>
    <div class="warning">未完了の反映処理を安全に復旧するまで、プレビューと反映は実行できません。</div>
    ${recovery.map((item) => `<div class="operation row"><div><code>${escapeHtml(item.transactionId)}</code> · ${escapeHtml(item.status)}</div><button type="button" data-action="recoverTransaction" data-transaction-id="${escapeHtml(item.transactionId)}" data-recovery-action="${item.recoveryAction}">${item.recoveryAction === "resume" ? "反映処理を完了" : "変更前に戻す"}</button></div>`).join("")}
  </section>`
}

function renderPreview(preview: RuleProposalTriagePreviewModel | undefined): string {
  if (!preview) return `<div class="muted">反映プレビューはまだ作成されていません。</div>`
  return `<div class="muted">プレビュー ${escapeHtml(preview.generatedAt)} · 反映先 ${escapeHtml(preview.targetCount)}件 · 採用 ${escapeHtml(preview.acceptedCount)}件 · 編集 ${escapeHtml(preview.editedCount)}件 · 却下 ${escapeHtml(preview.rejectedCount)}件 · 計画 <code>${escapeHtml(preview.planDigest)}</code></div>`
}

function renderTransaction(transaction: RuleProposalTriageTransactionModel | undefined): string {
  if (!transaction) return ""
  return `<div class="${transaction.status === "committed" ? "ok" : "warning"}">反映処理 <code>${escapeHtml(transaction.transactionId)}</code>: ${transaction.status === "committed" ? "完了" : "変更前に復元"}（反映先 ${escapeHtml(transaction.targetCount)}件）</div>`
}

function allowlistedModel(model: RuleProposalTriageGuiModel): SafeRuleProposalTriageGuiModel {
  const groups = Array.isArray(model?.groups) ? model.groups.slice(0, 3).map((group) => ({
    asset: allowedAsset(group?.asset),
    label: display(group?.label, SHORT_DISPLAY_BYTES),
    operations: Array.isArray(group?.operations)
      ? group.operations.slice(0, MAX_OPERATIONS).map(allowlistedOperation)
      : []
  })) : []
  const conflicts = Array.isArray(model?.conflicts) ? model.conflicts.slice(0, MAX_CONFLICTS).map((conflict) => ({
    conflictId: display(conflict?.conflictId, SHORT_DISPLAY_BYTES),
    summary: display(conflict?.summary, DISPLAY_BYTES),
    blocking: conflict?.blocking === true,
    affectedCandidateIds: Array.isArray(conflict?.affectedCandidateIds)
      ? conflict.affectedCandidateIds.slice(0, MAX_OPERATIONS).map((item: unknown) => display(item, SHORT_DISPLAY_BYTES))
      : [],
    alternatives: Array.isArray(conflict?.alternatives) ? conflict.alternatives.slice(0, 20).map((alternative: RuleProposalTriageConflictAlternativeModel) => ({
      alternativeId: display(alternative?.alternativeId, SHORT_DISPLAY_BYTES),
      description: display(alternative?.description, DISPLAY_BYTES)
    })) : []
  })) : []
  const recovery = Array.isArray(model?.recovery) ? model.recovery.slice(0, 100).map((item) => ({
    transactionId: display(item?.transactionId, SHORT_DISPLAY_BYTES),
    status: display(item?.status, SHORT_DISPLAY_BYTES),
    recoveryAction: item?.recoveryAction === "resume" ? "resume" as const : "rollback" as const
  })) : []
  return {
    cspSource: safeCspSource(model?.cspSource),
    runId: display(model?.runId, SHORT_DISPLAY_BYTES),
    groups,
    conflicts,
    decisionsComplete: model?.decisionsComplete === true,
    canPreview: model?.canPreview === true,
    canApply: model?.canApply === true,
    staleWarning: display(model?.staleWarning, DISPLAY_BYTES),
    status: display(model?.status, DISPLAY_BYTES),
    recovery,
    preview: allowlistedPreview(model?.preview),
    transaction: allowlistedTransaction(model?.transaction)
  }
}

function allowlistedOperation(value: RuleProposalTriageOperationModel): RuleProposalTriageOperationModel {
  const sourceLocators = Array.isArray(value?.sourceLocators)
    ? value.sourceLocators.slice(0, MAX_SOURCE_LOCATORS).map((item) => display(item, DISPLAY_BYTES))
    : []
  return {
    candidateId: display(value?.candidateId, SHORT_DISPLAY_BYTES),
    operation: value?.operation === "update" || value?.operation === "retire" ? value.operation : "add",
    targetId: value?.targetId === null ? null : display(value?.targetId, SHORT_DISPLAY_BYTES),
    title: display(value?.title, DISPLAY_BYTES),
    severity: display(value?.severity, SHORT_DISPLAY_BYTES),
    confidence: display(value?.confidence, SHORT_DISPLAY_BYTES),
    rationale: display(value?.rationale, DISPLAY_BYTES),
    sourceCount: safeCount(value?.sourceCount, sourceLocators.length),
    sourceLocators,
    blockingConflictIds: Array.isArray(value?.blockingConflictIds)
      ? value.blockingConflictIds.slice(0, MAX_CONFLICTS).map((item) => display(item, SHORT_DISPLAY_BYTES))
      : [],
    decision: allowedDecision(value?.decision),
    rejectReason: display(value?.rejectReason, DISPLAY_BYTES),
    existingSummary: value?.existingSummary === undefined
      ? undefined
      : display(value.existingSummary, DISPLAY_BYTES),
    proposedSummary: value?.proposedSummary === undefined
      ? undefined
      : display(value.proposedSummary, DISPLAY_BYTES),
    existingSummaryTruncated: value?.existingSummaryTruncated === true,
    proposedSummaryTruncated: value?.proposedSummaryTruncated === true,
    comparisonAvailable: value?.comparisonAvailable === true,
    editRule: allowlistedRuleEdit(value?.editRule),
    editHeading: value?.editHeading === undefined
      ? undefined
      : editableText(value.editHeading, RULE_AUTHORING_TEXT_BYTE_LIMITS.markdownHeading,
        { nonEmpty: true, singleLine: true, forbidMarker: true }),
    editMarkdown: value?.editMarkdown === undefined
      ? undefined
      : editableText(value.editMarkdown, RULE_AUTHORING_TEXT_BYTE_LIMITS.managedMarkdown,
        { forbidMarker: true })
  }
}

function allowlistedRuleEdit(
  value: RuleProposalTriageRuleEditModel | undefined
): RuleProposalTriageRuleEditModel | undefined {
  if (!value) return undefined
  if (
    value.severityOnFail !== "error" &&
    value.severityOnFail !== "warning" &&
    value.severityOnFail !== "info"
  ) throw new Error("Rule proposal editable severity is invalid")
  if (!Array.isArray(value.appliesWhen) || value.appliesWhen.length > 32) {
    throw new Error("Rule proposal editable applicability is invalid")
  }
  if (typeof value.evidenceRequired !== "boolean") {
    throw new Error("Rule proposal editable evidence requirement is invalid")
  }
  return {
    category: editableText(value.category, RULE_AUTHORING_TEXT_BYTE_LIMITS.category, { nonEmpty: true }),
    title: editableText(value.title, RULE_AUTHORING_TEXT_BYTE_LIMITS.title, { nonEmpty: true }),
    description: editableText(value.description, RULE_AUTHORING_TEXT_BYTE_LIMITS.description,
      { nonEmpty: true }),
    severityOnFail: value.severityOnFail,
    appliesWhen: value.appliesWhen.map((item) => inertRuleCondition(item)),
    evidenceRequired: value.evidenceRequired,
    reviewHint: editableText(value.reviewHint, RULE_AUTHORING_TEXT_BYTE_LIMITS.reviewHint)
  }
}

function inertRuleCondition(value: unknown): string {
  return editableText(value, RULE_AUTHORING_TEXT_BYTE_LIMITS.appliesWhen, { singleLine: true })
}

function editableText(
  value: unknown,
  maxBytes: number,
  options: { nonEmpty?: boolean; singleLine?: boolean; forbidMarker?: boolean } = {}
): string {
  if (
    !hasUtf8ByteLength(value, maxBytes) ||
    EDITABLE_CONTROL.test(value) ||
    (options.nonEmpty === true && value.length === 0) ||
    (options.singleLine === true && /[\r\n]/.test(value)) ||
    (options.forbidMarker === true && MANAGED_MARKER.test(value))
  ) throw new Error("Rule proposal editable value is invalid")
  return value
}

function allowlistedPreview(value: RuleProposalTriagePreviewModel | undefined): RuleProposalTriagePreviewModel | undefined {
  if (!value) return undefined
  if (typeof value.planDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.planDigest)) {
    throw new Error("Rule proposal apply preview digest is invalid")
  }
  return {
    targetCount: safeCount(value.targetCount),
    acceptedCount: safeCount(value.acceptedCount),
    editedCount: safeCount(value.editedCount),
    rejectedCount: safeCount(value.rejectedCount),
    generatedAt: display(value.generatedAt, SHORT_DISPLAY_BYTES),
    planDigest: value.planDigest
  }
}

function allowlistedTransaction(
  value: RuleProposalTriageTransactionModel | undefined
): RuleProposalTriageTransactionModel | undefined {
  if (!value) return undefined
  return {
    transactionId: display(value.transactionId, SHORT_DISPLAY_BYTES),
    status: value.status === "rolled_back" ? "rolled_back" : "committed",
    targetCount: safeCount(value.targetCount)
  }
}

function allowedAsset(value: unknown): RuleProposalTriageAssetModel {
  return value === "project_context" || value === "prompt_addendum" ? value : "rule"
}

function allowedDecision(value: unknown): RuleProposalTriageDecisionModel {
  return value === "accept" || value === "reject" || value === "edit" ? value : "pending"
}

function safeCount(value: unknown, fallback = 0): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : fallback
}

function display(value: unknown, maxBytes: number): string {
  const source = typeof value === "string" ? value : String(value ?? "")
  const tags: string[] = []
  const protectedText = source.replace(/<\/[A-Za-z][A-Za-z0-9-]{0,63}>/g, (tag) => {
    const token = `BOB_SAFE_CLOSING_TAG_${tags.length}_TOKEN`
    tags.push(tag)
    return token
  })
  let sanitized = sanitizeRemoteSafeText(protectedText, Math.min(maxBytes, 32 * 1024))
  for (const [index, tag] of tags.entries()) {
    sanitized = sanitized.replace(`BOB_SAFE_CLOSING_TAG_${index}_TOKEN`, tag)
  }
  return sanitized
}

function safeCspSource(value: unknown): string {
  return typeof value === "string" && value.length <= 512 && CSP_SOURCE.test(value)
    ? value
    : "vscode-resource:"
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
