import { extractionStatusLabel, ruleAuthoringPhaseLabel } from "./displayLabels"
const MAX_AI_PAYLOAD_BYTES = 1024 * 1024
const MAX_SOURCES = 20
const MAX_CHUNKS = Math.floor(MAX_AI_PAYLOAD_BYTES / 128)

export interface RuleAuthoringGuiEnvironmentModel {
  workspaceName: string
  workspaceReady: boolean
  bobExtensionAvailable: boolean
  configuredBobModelRoute: string
}

export interface RuleAuthoringGuiResumableRunModel {
  runId: string
  phase: string
  updatedAt: string
}

export interface RuleAuthoringGuiSourceModel {
  sourceId: string
  logicalName: string
  mediaType: string
  byteSize: number
  extractionStatus: string
  warnings: readonly string[]
}

export interface RuleAuthoringGuiChunkModel {
  chunkId: string
  sourceId: string
  title: string
  locator: string
  utf8Bytes: number
  included: boolean
}

export interface RuleAuthoringGuiAiPayloadModel {
  logicalNames: readonly string[]
  selectedChunkCount: number
  utf8Bytes: number
}

export interface RuleAuthoringGuiModel {
  cspSource: string
  phase: string
  environment: RuleAuthoringGuiEnvironmentModel
  runId?: string
  resumableRuns: readonly RuleAuthoringGuiResumableRunModel[]
  sources: readonly RuleAuthoringGuiSourceModel[]
  chunks: readonly RuleAuthoringGuiChunkModel[]
  aiPayload?: RuleAuthoringGuiAiPayloadModel
  warnings: readonly string[]
  scopeOverflow: boolean
  exclusionsApproved: boolean
  canConfirmAiPayload: boolean
  status: string
}

interface SafeRuleAuthoringGuiModel {
  cspSource: string
  phase: string
  environment: RuleAuthoringGuiEnvironmentModel
  runId: string
  resumableRuns: RuleAuthoringGuiResumableRunModel[]
  sources: RuleAuthoringGuiSourceModel[]
  chunks: RuleAuthoringGuiChunkModel[]
  aiPayload: RuleAuthoringGuiAiPayloadModel
  warnings: string[]
  scopeOverflow: boolean
  exclusionsApproved: boolean
  canConfirmAiPayload: boolean
  status: string
}

export function renderRuleAuthoringGuiHtml(model: RuleAuthoringGuiModel, nonce: string): string {
  const safe = allowlistedModel(model)
  const escapedNonce = escapeHtml(boundedText(nonce, 256))
  const canConfirm = consentAllowed(safe)
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${escapeHtml(safe.cspSource)} 'unsafe-inline'; script-src 'nonce-${escapedNonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>規約資料の取り込み</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 18px; }
    h1 { font-size: 21px; margin: 0 0 8px; }
    h2 { font-size: 15px; margin: 0 0 8px; }
    .card { border: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); border-radius: 6px; padding: 12px; margin-top: 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
    .metric, .source, .chunk, .run { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; }
    .source, .chunk, .run { margin-top: 7px; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    button { border: 0; padding: 7px 11px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button:disabled { opacity: 0.55; cursor: default; }
    .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .warning { color: var(--vscode-editorWarning-foreground); margin-top: 5px; }
    .guidance { border-left: 3px solid var(--vscode-editorWarning-foreground); padding-left: 8px; margin-top: 6px; }
    .status { white-space: pre-wrap; }
    code { font-family: var(--vscode-editor-font-family); overflow-wrap: anywhere; }
    ul { margin: 6px 0 0; padding-left: 20px; }
  </style>
</head>
<body>
  <h1>規約資料の取り込み</h1>
  <div class="muted">実行 ID <code>${escapeHtml(safe.runId || "未開始")}</code> · 工程 <code>${escapeHtml(ruleAuthoringPhaseLabel(safe.phase))}</code></div>

  <section class="card" aria-labelledby="environment-heading">
    <h2 id="environment-heading">実行環境</h2>
    <div class="grid">
      <div class="metric"><strong>ワークスペース</strong><div>${escapeHtml(safe.environment.workspaceName)}</div><div class="muted">${safe.environment.workspaceReady ? "使用可能" : "要確認"}</div></div>
      <div class="metric"><strong>Bob 拡張機能</strong><div>${safe.environment.bobExtensionAvailable ? "利用可能" : "未検出"}</div></div>
      <div class="metric"><strong>設定済みの Bob モデル経路</strong><div>${escapeHtml(safe.environment.configuredBobModelRoute)}</div><div class="muted">表示のみです。この画面から Bob タスクは開始しません。</div></div>
    </div>
  </section>

  ${renderResumeRuns(safe.resumableRuns)}

  <section class="card" aria-labelledby="sources-heading">
    <h2 id="sources-heading">資料の選択</h2>
    <div class="muted">DOCX、XLSX、PDF、旧形式の DOC／XLS を最大20件選択できます。旧形式の Office ファイルは抽出前に変換が必要です。</div>
    <div class="actions">
      <button type="button" data-action="chooseSources">資料を選択</button>
      <button type="button" data-action="extractSources"${safe.sources.length === 0 ? " disabled" : ""}>選択した資料を読み取る</button>
    </div>
    ${renderSources(safe.sources)}
  </section>

  <section class="card" aria-labelledby="scope-heading">
    <h2 id="scope-heading">抽出内容と対象範囲</h2>
    <div class="muted">ここには資料名などの論理情報だけを表示します。本文とローカルパスは拡張機能内に保持されます。</div>
    ${renderChunks(safe.chunks)}
  </section>

  <section class="card" aria-labelledby="payload-heading">
    <h2 id="payload-heading">AI に送る内容の確認</h2>
    <div class="grid">
      <div class="metric"><strong>資料名</strong>${renderLogicalNames(safe.aiPayload.logicalNames)}</div>
      <div class="metric"><strong>選択した範囲</strong><div>${escapeHtml(safe.aiPayload.selectedChunkCount)}</div></div>
      <div class="metric"><strong>UTF-8 バイト数</strong><div>${escapeHtml(safe.aiPayload.utf8Bytes)}バイト</div><div class="muted">上限: ${MAX_AI_PAYLOAD_BYTES}バイト（1 MiB）</div></div>
    </div>
    ${safe.scopeOverflow ? `<div class="warning">選択した根拠が 1 MiB の上限を超えています。AI に送る前に対象範囲を減らしてください。</div>` : ""}
    ${!safe.exclusionsApproved && hasExclusionRequiringSource(safe.sources) ? `<div class="warning">重複、一部抽出、抽出不可、共有不可の除外には明示的な承認が必要です。</div>` : ""}
    ${renderWarnings(safe.warnings)}
    <div class="actions">
      <button type="button" data-action="confirmAiPayload"${canConfirm ? "" : " disabled"}>この内容で AI に渡す</button>
      <button type="button" class="secondary" data-action="cancelRun">中止</button>
    </div>
    <div id="status" class="status muted">${escapeHtml(safe.status)}</div>
  </section>

  <script nonce="${escapedNonce}">
    const vscode = acquireVsCodeApi();
    const allowedActions = new Set([
      'chooseSources',
      'removeSource',
      'extractSources',
      'setChunkIncluded',
      'confirmAiPayload',
      'resumeRun',
      'cancelRun'
    ]);
    document.addEventListener('click', (event) => {
      const element = event.target && event.target.closest ? event.target.closest('[data-action]') : undefined;
      if (!element || element.disabled) return;
      const type = element.dataset.action;
      if (!allowedActions.has(type) || type === 'setChunkIncluded') return;
      if (type === 'removeSource') {
        vscode.postMessage({ type, sourceId: element.dataset.sourceId });
      } else if (type === 'resumeRun') {
        vscode.postMessage({ type, runId: element.dataset.runId });
      } else {
        vscode.postMessage({ type });
      }
    });
    document.addEventListener('change', (event) => {
      const element = event.target;
      if (!element || element.dataset.action !== 'setChunkIncluded') return;
      vscode.postMessage({
        type: 'setChunkIncluded',
        chunkId: element.dataset.chunkId,
        included: Boolean(element.checked)
      });
    });
  </script>
</body>
</html>`
}

function renderResumeRuns(runs: readonly RuleAuthoringGuiResumableRunModel[]): string {
  if (runs.length === 0) return ""
  return `<section class="card" aria-labelledby="resume-heading">
    <h2 id="resume-heading">途中の取り込みを再開</h2>
    ${runs.map((run) => `<div class="run row">
      <div><code>${escapeHtml(run.runId)}</code><div class="muted">${escapeHtml(ruleAuthoringPhaseLabel(run.phase))} · ${escapeHtml(run.updatedAt)}</div></div>
      <button type="button" class="secondary" data-action="resumeRun" data-run-id="${escapeHtml(run.runId)}">続きから再開</button>
    </div>`).join("")}
  </section>`
}

function renderSources(sources: readonly RuleAuthoringGuiSourceModel[]): string {
  if (sources.length === 0) return `<div class="muted">資料が選択されていません。</div>`
  return sources.map((source) => `<div class="source">
    <div class="row">
      <div><strong>${escapeHtml(source.logicalName)}</strong><div class="muted">${escapeHtml(source.mediaType)} · ${escapeHtml(source.byteSize)}バイト · ${escapeHtml(extractionStatusLabel(source.extractionStatus))}</div></div>
      <button type="button" class="secondary" data-action="removeSource" data-source-id="${escapeHtml(source.sourceId)}">選択から外す</button>
    </div>
    ${renderSourceGuidance(source)}
    ${renderWarnings(source.warnings)}
  </div>`).join("")
}

function renderSourceGuidance(source: RuleAuthoringGuiSourceModel): string {
  if (source.mediaType === "doc" || source.mediaType === "xls" || source.extractionStatus === "requires_conversion") {
    return `<div class="guidance">ファイル変換が必要です。旧形式の Office ファイルを DOCX または XLSX に変換し、変換後のファイルを選択してください。</div>`
  }
  if (source.extractionStatus === "requires_ocr") {
    return `<div class="guidance">OCR が必要です。この PDF は画像のみの可能性があります。OCR を実行し、文字検索できる PDF を選択してください。</div>`
  }
  if (source.extractionStatus === "partial") {
    return `<div class="guidance">一部のみ抽出されました。抽出できた範囲は含まれ、取得できない部分は除外されます。AI に送る前に除外内容を確認してください。</div>`
  }
  if (source.extractionStatus === "blocked" || source.extractionStatus === "failed") {
    return `<div class="guidance">抽出できません。この資料は対象から除外されます。含めるには別のファイルへ置き換えてください。</div>`
  }
  return ""
}

function renderChunks(chunks: readonly RuleAuthoringGuiChunkModel[]): string {
  if (chunks.length === 0) return `<div class="muted">資料を読み取ると、AI に送る範囲を選択できます。</div>`
  return chunks.map((chunk) => `<label class="chunk row">
    <span><strong>${escapeHtml(chunk.title)}</strong><span class="muted"> · ${escapeHtml(chunk.locator)} · ${escapeHtml(chunk.utf8Bytes)}バイト</span></span>
    <input type="checkbox" data-action="setChunkIncluded" data-chunk-id="${escapeHtml(chunk.chunkId)}"${chunk.included ? " checked" : ""}>
  </label>`).join("")
}

function renderLogicalNames(names: readonly string[]): string {
  if (names.length === 0) return `<div class="muted">なし</div>`
  return `<ul>${names.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul>`
}

function renderWarnings(warnings: readonly string[]): string {
  if (warnings.length === 0) return ""
  return `<ul class="warning">${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
}

function consentAllowed(model: SafeRuleAuthoringGuiModel): boolean {
  const selectedChunks = model.chunks.filter((chunk) => chunk.included)
  const selectedBytes = selectedChunks.reduce((total, chunk) => total + chunk.utf8Bytes, 0)
  return Boolean(
    model.canConfirmAiPayload &&
    !model.scopeOverflow &&
    selectedChunks.length === model.aiPayload.selectedChunkCount &&
    selectedBytes === model.aiPayload.utf8Bytes &&
    model.aiPayload.selectedChunkCount > 0 &&
    model.aiPayload.utf8Bytes > 0 &&
    model.aiPayload.utf8Bytes <= MAX_AI_PAYLOAD_BYTES &&
    (!hasExclusionRequiringSource(model.sources) || model.exclusionsApproved) &&
    model.sources.length > 0 &&
    model.sources.every((source) => source.extractionStatus !== "selected" && source.extractionStatus !== "pending")
  )
}

function hasExclusionRequiringSource(sources: readonly RuleAuthoringGuiSourceModel[]): boolean {
  return sources.some((source) => [
    "partial",
    "blocked",
    "failed",
    "requires_conversion",
    "requires_ocr",
    "duplicate"
  ].includes(source.extractionStatus))
}

function allowlistedModel(input: RuleAuthoringGuiModel): SafeRuleAuthoringGuiModel {
  const environment: Record<string, unknown> = isRecord(input?.environment) ? input.environment : {}
  const sources = Array.isArray(input?.sources)
    ? input.sources.slice(0, MAX_SOURCES).map(allowlistedSource).filter(isPresent)
    : []
  const chunks = Array.isArray(input?.chunks)
    ? input.chunks.slice(0, MAX_CHUNKS).map(allowlistedChunk).filter(isPresent)
    : []
  const payload: Record<string, unknown> = isRecord(input?.aiPayload) ? input.aiPayload : {}
  const selectedChunkCount = safeNonNegativeInteger(payload.selectedChunkCount)
  const utf8Bytes = safeNonNegativeInteger(payload.utf8Bytes)
  return {
    cspSource: safeCspSource(input?.cspSource),
    phase: sanitizeRemoteSafeText(input?.phase, 64),
    environment: {
      workspaceName: sanitizeRemoteSafeText(environment.workspaceName, 255),
      workspaceReady: environment.workspaceReady === true,
      bobExtensionAvailable: environment.bobExtensionAvailable === true,
      configuredBobModelRoute: sanitizeRemoteSafeText(environment.configuredBobModelRoute, 512)
    },
    runId: safeGeneralId(input?.runId) ?? "",
    resumableRuns: Array.isArray(input?.resumableRuns)
      ? input.resumableRuns.slice(0, 100).map(allowlistedRun).filter(isPresent)
      : [],
    sources,
    chunks,
    aiPayload: {
      logicalNames: Array.isArray(payload.logicalNames)
        ? payload.logicalNames.slice(0, MAX_SOURCES).map((name) => boundedLogicalName(name)).filter(isPresent)
        : [],
      selectedChunkCount,
      utf8Bytes
    },
    warnings: Array.isArray(input?.warnings)
      ? input.warnings.slice(0, 100).map((warning) => sanitizeRemoteSafeText(warning, 512))
      : [],
    scopeOverflow: input?.scopeOverflow === true || utf8Bytes > MAX_AI_PAYLOAD_BYTES,
    exclusionsApproved: input?.exclusionsApproved === true,
    canConfirmAiPayload: input?.canConfirmAiPayload === true,
    status: sanitizeRemoteSafeText(input?.status, 512)
  }
}

function allowlistedRun(value: unknown): RuleAuthoringGuiResumableRunModel | undefined {
  if (!isRecord(value)) return undefined
  const runId = safeGeneralId(value.runId)
  if (!runId) return undefined
  return {
    runId,
    phase: sanitizeRemoteSafeText(value.phase, 64),
    updatedAt: sanitizeRemoteSafeText(value.updatedAt, 64)
  }
}

function allowlistedSource(value: unknown): RuleAuthoringGuiSourceModel | undefined {
  if (!isRecord(value)) return undefined
  const sourceId = safeSourceId(value.sourceId)
  const logicalName = boundedLogicalName(value.logicalName)
  if (!sourceId || !logicalName) return undefined
  return {
    sourceId,
    logicalName,
    mediaType: sanitizeRemoteSafeText(value.mediaType, 32),
    byteSize: safeNonNegativeInteger(value.byteSize),
    extractionStatus: sanitizeRemoteSafeText(value.extractionStatus, 64),
    warnings: Array.isArray(value.warnings)
      ? value.warnings.slice(0, 100).map((warning) => sanitizeRemoteSafeText(warning, 128))
      : []
  }
}

function allowlistedChunk(value: unknown): RuleAuthoringGuiChunkModel | undefined {
  if (!isRecord(value)) return undefined
  const chunkId = safeChunkId(value.chunkId)
  const sourceId = safeSourceId(value.sourceId)
  if (!chunkId || !sourceId) return undefined
  return {
    chunkId,
    sourceId,
    title: sanitizeRemoteSafeText(value.title, 240),
    locator: sanitizeRemoteSafeText(value.locator, 240),
    utf8Bytes: safeNonNegativeInteger(value.utf8Bytes),
    included: value.included === true
  }
}

function safeCspSource(value: unknown): string {
  const candidate = boundedText(value, 512)
  return /^[A-Za-z0-9+.:/_-]+$/.test(candidate) ? candidate : "vscode-resource:"
}

function safeGeneralId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  try {
    return validateRuleAuthoringId(value, "id")
  } catch {
    return undefined
  }
}

function safeSourceId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  return /^(?:selected-[a-f0-9]{32}|src-[a-f0-9]{12,64})$/.test(value) ? value : undefined
}

function safeChunkId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  return /^chunk-[a-f0-9]{64}$/.test(value) ? value : undefined
}

function boundedLogicalName(value: unknown): string | undefined {
  if (typeof value !== "string" || value.includes("/") || value.includes("\\") || /[\u0000-\u001f\u007f-\u009f]/.test(value)) {
    return undefined
  }
  const bounded = sanitizeRemoteSafeText(value, 255)
  return bounded || undefined
}

function boundedText(value: unknown, maxBytes: number): string {
  const text = typeof value === "string" ? value : String(value ?? "")
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text
  let output = ""
  let bytes = 0
  for (const codePoint of text) {
    const size = Buffer.byteLength(codePoint, "utf8")
    if (bytes + size > maxBytes) break
    output += codePoint
    bytes += size
  }
  return output
}

function safeNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
import { sanitizeRemoteSafeText } from "../ruleAuthoring/remoteSafeText"
import { validateRuleAuthoringId } from "../ruleAuthoring/ruleAuthoringPaths"
