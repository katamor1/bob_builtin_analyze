import { sanitizeRemoteSafeText } from "../ruleAuthoring/remoteSafeText"

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
}

export interface RuleProposalTriagePreviewModel {
  targetCount: number
  acceptedCount: number
  editedCount: number
  rejectedCount: number
  generatedAt: string
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
const MAX_EDITABLE_MARKDOWN_BYTES = 256 * 1024

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
  <title>Project Rule Proposal Triage</title>
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
  <h1>Project Rule Proposal Triage</h1>
  <div class="muted">Run <code>${escapeHtml(safe.runId)}</code></div>
  ${renderRecovery(safe.recovery)}
  ${safe.recovery.length > 0 ? "" : safe.groups.map(renderGroup).join("")}
  ${safe.recovery.length > 0 ? "" : renderConflicts(safe.conflicts)}
  <section class="card" aria-labelledby="apply-heading">
    <h2 id="apply-heading">Apply preview and completion</h2>
    ${safe.decisionsComplete ? `<div class="ok">Every candidate has a Human Triage decision.</div>` : `<div class="warning">Decision required: every candidate is pending until explicitly accepted, rejected, or edited.</div>`}
    ${safe.staleWarning ? `<div class="warning">${escapeHtml(safe.staleWarning)}</div>` : ""}
    ${renderPreview(safe.preview)}
    ${renderTransaction(safe.transaction)}
    <div class="actions">
      <button type="button" data-action="previewApply"${canPreview ? "" : " disabled"}>Regenerate apply preview</button>
      <button type="button" data-action="applyApproved"${canApply ? "" : " disabled"}>Apply approved operations</button>
      <button type="button" class="secondary" data-action="close">Close</button>
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
          action: 'rollback'
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
    <h2>${escapeHtml(group.label)}</h2>
    ${group.operations.length === 0
      ? `<div class="muted">No proposed operations.</div>`
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
        <span class="badge">${escapeHtml(operation.operation)}</span>
        <span class="badge">${escapeHtml(operation.confidence)}</span>
        ${operation.severity ? `<span class="badge">${escapeHtml(operation.severity)}</span>` : ""}
        <span class="badge">decision: ${pending ? "pending / required" : escapeHtml(operation.decision)}</span>
      </div>
    </div>
    <div class="muted">candidate <code>${escapeHtml(operation.candidateId)}</code>${operation.targetId ? ` · target <code>${escapeHtml(operation.targetId)}</code>` : ""}</div>
    <p>${escapeHtml(operation.rationale)}</p>
    ${renderComparison(operation)}
    <div><strong>${escapeHtml(operation.sourceCount)} ${operation.sourceCount === 1 ? "source" : "sources"}</strong></div>
    <ul>${operation.sourceLocators.map((locator, index) => `<li class="locator">${escapeHtml(locator)} <button type="button" class="secondary" data-action="openEvidence" data-candidate-id="${escapeHtml(operation.candidateId)}" data-source-ref-index="${index}">Inspect locator</button></li>`).join("")}</ul>
    ${operation.blockingConflictIds.length > 0 ? `<div class="warning">Blocking conflict: ${operation.blockingConflictIds.map(escapeHtml).join(", ")}</div>` : ""}
    <label class="muted">Optional reject reason<br><textarea data-reject-reason="${escapeHtml(operation.candidateId)}">${escapeHtml(operation.rejectReason)}</textarea></label>
    <div class="actions">
      <button type="button" data-action="setDecision" data-candidate-id="${escapeHtml(operation.candidateId)}" data-decision="accept">Accept</button>
      <button type="button" class="secondary" data-action="setDecision" data-candidate-id="${escapeHtml(operation.candidateId)}" data-decision="reject">Reject</button>
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
    <summary>Inspect existing versus proposed</summary>
    <div><strong>Existing approved</strong><pre>${escapeHtml(operation.existingSummary ?? "Unavailable")}</pre></div>
    <div><strong>Proposed</strong><pre>${escapeHtml(operation.proposedSummary ?? "Unavailable")}</pre></div>
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
    <summary>Edit proposed rule</summary>
    <label class="muted">Category<br><input data-edit-field="category" value="${escapeHtml(edit.category)}"></label><br>
    <label class="muted">Title<br><input data-edit-field="title" value="${escapeHtml(edit.title)}"></label><br>
    <label class="muted">Description<br><textarea data-edit-field="description">${escapeHtml(edit.description)}</textarea></label><br>
    <label class="muted">Severity<br><select data-edit-field="severity">${(["error", "warning", "info"] as const).map((severity) => `<option value="${severity}"${edit.severityOnFail === severity ? " selected" : ""}>${severity}</option>`).join("")}</select></label><br>
    <label class="muted">Applies when (one per line)<br><textarea data-edit-field="appliesWhen">${escapeHtml(edit.appliesWhen.join("\n"))}</textarea></label><br>
    <label><input type="checkbox" data-edit-field="evidenceRequired"${edit.evidenceRequired ? " checked" : ""}> Evidence required</label><br>
    <label class="muted">Review hint<br><textarea data-edit-field="reviewHint">${escapeHtml(edit.reviewHint)}</textarea></label>
    <div class="actions"><button type="button" data-action="editRule" data-candidate-id="${escapeHtml(operation.candidateId)}">Validate and save edit</button></div>
  </details>`
}

function renderMarkdownEditForm(operation: RuleProposalTriageOperationModel): string {
  return `<details data-edit-form="${escapeHtml(operation.candidateId)}" data-edit-kind="markdown">
    <summary>Edit proposed managed Markdown</summary>
    <label class="muted">Heading<br><input data-edit-field="heading" value="${escapeHtml(operation.editHeading ?? operation.title)}"></label><br>
    <label class="muted">Markdown<br><textarea data-edit-field="markdown">${escapeHtml(operation.editMarkdown ?? "")}</textarea></label>
    <div class="actions"><button type="button" data-action="editRule" data-candidate-id="${escapeHtml(operation.candidateId)}">Validate and save edit</button></div>
  </details>`
}

function renderConflicts(conflicts: readonly RuleProposalTriageConflictModel[]): string {
  if (conflicts.length === 0) return ""
  return `<section class="card"><h2>Conflicts</h2>${conflicts.map((conflict) => `<article class="operation">
    <div><strong>${escapeHtml(conflict.conflictId)}</strong>${conflict.blocking ? ` <span class="warning">blocking</span>` : ""}</div>
    <p>${escapeHtml(conflict.summary)}</p>
    <div class="muted">Choose an alternative from the affected operation.</div>
    ${conflict.alternatives.map((alternative) => `<div class="operation">
      <div>${escapeHtml(alternative.description)} <code>${escapeHtml(alternative.alternativeId)}</code></div>
      <div class="actions">${(conflict.affectedCandidateIds ?? []).map((candidateId) => `<button type="button" data-action="resolveConflict" data-candidate-id="${escapeHtml(candidateId)}" data-conflict-id="${escapeHtml(conflict.conflictId)}" data-alternative-id="${escapeHtml(alternative.alternativeId)}">Use for ${escapeHtml(candidateId)}</button>`).join("")}</div>
    </div>`).join("")}
  </article>`).join("")}</section>`
}

function renderRecovery(recovery: readonly RuleProposalTriageRecoveryModel[]): string {
  if (recovery.length === 0) return ""
  return `<section class="card"><h2>Transaction recovery required</h2>
    <div class="warning">Preview and apply remain blocked until every incomplete transaction is rolled back.</div>
    ${recovery.map((item) => `<div class="operation row"><div><code>${escapeHtml(item.transactionId)}</code> · ${escapeHtml(item.status)}</div><button type="button" data-action="recoverTransaction" data-transaction-id="${escapeHtml(item.transactionId)}">Rollback</button></div>`).join("")}
  </section>`
}

function renderPreview(preview: RuleProposalTriagePreviewModel | undefined): string {
  if (!preview) return `<div class="muted">No apply preview has been generated.</div>`
  return `<div class="muted">Preview ${escapeHtml(preview.generatedAt)} · ${escapeHtml(preview.targetCount)} targets · ${escapeHtml(preview.acceptedCount)} accepted · ${escapeHtml(preview.editedCount)} edited · ${escapeHtml(preview.rejectedCount)} rejected</div>`
}

function renderTransaction(transaction: RuleProposalTriageTransactionModel | undefined): string {
  if (!transaction) return ""
  return `<div class="${transaction.status === "committed" ? "ok" : "warning"}">Transaction <code>${escapeHtml(transaction.transactionId)}</code>: ${escapeHtml(transaction.status)} (${escapeHtml(transaction.targetCount)} targets)</div>`
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
    status: display(item?.status, SHORT_DISPLAY_BYTES)
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
    editRule: allowlistedRuleEdit(value?.editRule),
    editHeading: value?.editHeading === undefined
      ? undefined
      : editableText(value.editHeading, 512, { nonEmpty: true, singleLine: true, forbidMarker: true }),
    editMarkdown: value?.editMarkdown === undefined
      ? undefined
      : editableText(value.editMarkdown, MAX_EDITABLE_MARKDOWN_BYTES, { forbidMarker: true })
  }
}

function allowlistedRuleEdit(
  value: RuleProposalTriageRuleEditModel | undefined
): RuleProposalTriageRuleEditModel | undefined {
  if (!value) return undefined
  return {
    category: editableText(value.category, 256, { nonEmpty: true }),
    title: editableText(value.title, 512, { nonEmpty: true }),
    description: editableText(value.description, 8_192, { nonEmpty: true }),
    severityOnFail: value.severityOnFail === "warning" || value.severityOnFail === "info"
      ? value.severityOnFail
      : "error",
    appliesWhen: Array.isArray(value.appliesWhen)
      ? value.appliesWhen.slice(0, 32).map((item) => inertRuleCondition(item))
      : [],
    evidenceRequired: value.evidenceRequired === true,
    reviewHint: editableText(value.reviewHint, 4_096)
  }
}

function inertRuleCondition(value: unknown): string {
  return editableText(value, 1_024, { singleLine: true })
}

function editableText(
  value: unknown,
  maxBytes: number,
  options: { nonEmpty?: boolean; singleLine?: boolean; forbidMarker?: boolean } = {}
): string {
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value, "utf8") > maxBytes ||
    EDITABLE_CONTROL.test(value) ||
    (options.nonEmpty === true && value.length === 0) ||
    (options.singleLine === true && /[\r\n]/.test(value)) ||
    (options.forbidMarker === true && MANAGED_MARKER.test(value))
  ) return ""
  return value
}

function allowlistedPreview(value: RuleProposalTriagePreviewModel | undefined): RuleProposalTriagePreviewModel | undefined {
  if (!value) return undefined
  return {
    targetCount: safeCount(value.targetCount),
    acceptedCount: safeCount(value.acceptedCount),
    editedCount: safeCount(value.editedCount),
    rejectedCount: safeCount(value.rejectedCount),
    generatedAt: display(value.generatedAt, SHORT_DISPLAY_BYTES)
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
