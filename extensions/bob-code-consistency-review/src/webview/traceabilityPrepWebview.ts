import {
  applyTraceabilityPrepAction,
  buildTraceabilityPrepModel,
  type TraceabilityPrepAction,
  type TraceabilityPrepModel
} from "../core/traceabilityPrepController"
import {
  readTraceabilityCatalog,
  validateAndWriteTraceabilityGateReport,
  writeTraceabilityCatalog
} from "../core/traceabilityCatalogStore"
import type { TraceabilityCatalog } from "../core/traceabilityCatalog"
import {
  renderTraceabilityPrepClientScript,
  renderTraceabilityPrepStyles,
  serializeTraceabilityPrepInitialModel
} from "./traceabilityPrepWebviewAssets"
import type {
  ConsistencyReviewStageHost,
  ConsistencyReviewStageRequest,
  ConsistencyReviewStageService
} from "./consistencyReviewWizardStages"

type TraceabilityPrepWebviewMessage =
  | { type: "ready" }
  | { type: "action"; action: TraceabilityPrepAction }
  | { type: "save" }
  | { type: "restoreOriginalCatalog" }

export function createTraceabilityPrepStage(
  host: ConsistencyReviewStageHost,
  request: ConsistencyReviewStageRequest
): ConsistencyReviewStageService {
  return new TraceabilityPrepStage(host, request)
}

class TraceabilityPrepStage implements ConsistencyReviewStageService {
  private originalCatalog?: TraceabilityCatalog
  private catalog?: TraceabilityCatalog
  private revision: string | null = null
  private messageTail = Promise.resolve()

  constructor(
    private readonly host: ConsistencyReviewStageHost,
    private readonly request: ConsistencyReviewStageRequest
  ) {}

  async initialize() {
    if (!this.host.isActive()) return { status: "error" as const, errors: ["stage is no longer active"] }
    const read = await readTraceabilityCatalog({
      workspaceRoot: this.request.workspaceRoot,
      catalogPath: this.request.catalogPath ?? ".bob-trace/traceability-catalog.json",
      textEncoding: this.request.textEncoding
    })
    if (read.status === "error") return read
    if (!this.host.isActive()) return { status: "error" as const, errors: ["stage is no longer active"] }

    this.originalCatalog = cloneCatalog(read.catalog)
    this.catalog = cloneCatalog(read.catalog)
    this.revision = read.revision
    const renderToken = this.host.nextRenderToken()
    if (!renderToken) return { status: "error" as const, errors: ["stage is no longer active"] }
    if (!this.host.render(renderTraceabilityPrepHtml(
      this.host.cspSource,
      buildTraceabilityPrepModel(this.catalog),
      getNonce(),
      renderToken
    ))) return { status: "error" as const, errors: ["traceability stage could not be rendered"] }
    return { status: "ok" as const, catalogPath: read.catalogPath }
  }

  handleMessage(rawMessage: unknown): Promise<void> {
    const handled = this.messageTail.then(() => this.handleMessageSerial(rawMessage))
    this.messageTail = handled.then(() => undefined, () => undefined)
    return handled
  }

  private async handleMessageSerial(rawMessage: unknown): Promise<void> {
    if (!this.host.isActive() || !this.catalog || !this.originalCatalog) return
    const message = parseTraceabilityMessage(rawMessage)
    if (!message) {
      await this.host.post({ type: "error", message: "不正な画面操作を拒否しました。" })
      return
    }
    if (message.type === "ready") {
      await this.postModel()
      return
    }
    if (message.type === "action") {
      const result = applyTraceabilityPrepAction(this.catalog, message.action, this.originalCatalog)
      if (!this.host.isActive()) return
      this.catalog = result.catalog
      await this.host.post({ type: "model", model: result.model })
      if (result.status === "error") await this.host.post({ type: "error", message: result.message })
      return
    }
    if (message.type === "restoreOriginalCatalog") {
      this.catalog = cloneCatalog(this.originalCatalog)
      await this.postModel()
      await this.host.post({
        type: "info",
        message: "画面を開いた時点の内容に戻しました。ディスクへ反映するには「保存」を押してください。"
      })
      return
    }
    await this.save()
  }

  private async postModel(): Promise<void> {
    if (this.catalog && this.host.isActive()) {
      await this.host.post({ type: "model", model: buildTraceabilityPrepModel(this.catalog) })
    }
  }

  private async save(): Promise<void> {
    if (!this.catalog || !this.host.isActive()) return
    const write = await writeTraceabilityCatalog({
      workspaceRoot: this.request.workspaceRoot,
      catalogPath: this.request.catalogPath ?? ".bob-trace/traceability-catalog.json",
      catalog: this.catalog,
      backupExisting: true,
      expectedRevision: this.revision
    })
    if (!this.host.isActive()) return
    if (write.status === "error") {
      await this.host.post({ type: "error", message: write.errors.join("; ") })
      return
    }
    this.revision = write.revision
    const gate = await validateAndWriteTraceabilityGateReport({
      workspaceRoot: this.request.workspaceRoot,
      catalogPath: this.request.catalogPath ?? ".bob-trace/traceability-catalog.json",
      reportPath: this.request.reportPath ?? ".bob-trace/traceability-gate-report.json",
      textEncoding: this.request.textEncoding,
      expectedRevision: write.revision
    })
    if (!this.host.isActive()) return
    if (gate.status === "error") {
      await this.host.post({ type: "error", message: gate.errors.join("; ") })
      return
    }
    await this.host.post({
      type: "saved",
      catalogPath: write.catalogPath,
      backupPath: write.backupPath,
      reportPath: gate.reportPath
    })
  }
}

function parseTraceabilityMessage(message: unknown): TraceabilityPrepWebviewMessage | undefined {
  if (!message || typeof message !== "object") return undefined
  const candidate = message as Record<string, unknown>
  if (candidate.type === "ready" || candidate.type === "save" || candidate.type === "restoreOriginalCatalog") {
    return { type: candidate.type }
  }
  if (candidate.type === "action" && candidate.action && typeof candidate.action === "object" &&
    typeof (candidate.action as Record<string, unknown>).type === "string") {
    return { type: "action", action: candidate.action as TraceabilityPrepAction }
  }
  return undefined
}

function renderTraceabilityPrepHtml(
  cspSource: string,
  model: TraceabilityPrepModel,
  nonce: string,
  renderToken: string
): string {
  const initialJson = serializeTraceabilityPrepInitialModel(model)
  const cspHeader = "Content-Security-Policy"
  const scriptPolicy = "script-src"
  const inlineStyle = "'unsafe-inline'"
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta http-equiv="${cspHeader}" content="default-src 'none'; style-src ${cspSource} ${inlineStyle}; ${scriptPolicy} 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>トレーサビリティ整理</title>
<style>${renderTraceabilityPrepStyles()}</style>
</head>
<body>
<nav class="actions" aria-label="レビュー工程">
  <button class="secondary" data-stage="review">レビュー準備</button>
  <button data-stage="traceability" aria-current="page" disabled>トレーサビリティ整理</button>
  <button class="secondary" data-stage="review-result-capture">レビュー結果取り込み</button>
  <button class="secondary" data-stage="triage">指摘確認・振り分け</button>
</nav>
<header>
  <div><h1>トレーサビリティ整理</h1><div class="meta">補助台帳の確認・承認</div></div>
  <div class="headerActions"><button id="restore-original-catalog" class="secondary">開いた時点に戻す</button><button id="save">保存</button></div>
</header>
<div class="summary" id="summary"></div>
<div class="tabs">
  <div class="tab active" data-tab="domains">分類</div><div class="tab" data-tab="items">項目</div>
  <div class="tab" data-tab="links">関連</div><div class="tab" data-tab="decisions">判断</div>
  <div class="tab" data-tab="gate">検証レポート</div><div class="tab" data-tab="preview">レビュー入力プレビュー</div>
</div>
<section id="content"></section><div id="status" class="meta"></div>
<script nonce="${nonce}">
const renderToken = ${scriptValue(renderToken)};
${renderTraceabilityPrepClientScript(initialJson, "renderToken")}
document.querySelectorAll('[data-stage]').forEach((button) => button.addEventListener('click', () => {
  vscode.postMessage({ type: 'consistencyReview.navigate', fromStage: 'traceability', stage: button.dataset.stage, renderToken });
}));
</script>
</body>
</html>`
}

function cloneCatalog(catalog: TraceabilityCatalog): TraceabilityCatalog {
  return JSON.parse(JSON.stringify(catalog)) as TraceabilityCatalog
}

function scriptValue(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let text = ""
  for (let index = 0; index < 32; index += 1) text += chars.charAt(Math.floor(Math.random() * chars.length))
  return text
}
