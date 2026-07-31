import * as vscode from "vscode"
import { BazaarClient } from "./bazaar"
import { isBobCodeExtensionAvailable } from "../bob/bobCodeExtension"
import { addMarkdownPacketToBobContext } from "../bob/bobContext"
import { resolveBzrPath } from "./bzrPathTrust"
import { buildProjectRulesSectionFromBundle } from "../projectRules/packet"
import {
  loadProjectRuleBundle,
  PROJECT_RULE_BUNDLE_LIMITS
} from "../ruleAuthoring/ruleBundle"
import { buildReviewPacket } from "./reviewPacket"
import {
  BazaarProcessingCoveragePartialError,
  runBazaarReviewProcessingOperation
} from "./bazaarProcessingCoverage"
import { clampMaxAddedFileContentBytes, clampMaxDiffBytes, maxBufferForDiffBytes } from "./reviewLimits"
import { buildTargetMetadataSection, prepareTarget } from "./reviewTarget"
import { isWorkflowRegisterExtensionAvailable } from "../workflow/workflowRegisterBridge"
import { resolveBazaarWorkspaceFolder, resolveBobWorkspaceFolder } from "../workspace/workspaceResolver"

export async function reviewRevision(context: vscode.ExtensionContext, withProjectRules: boolean): Promise<void> {
  const bazaarFolder = await pickBazaarWorkspaceFolder()
  if (!bazaarFolder) return
  const bobFolder = withProjectRules ? await pickBobWorkspaceFolder(undefined, true) : undefined
  if (withProjectRules && !bobFolder) return

  const revision = await vscode.window.showInputBox({
    title: withProjectRules ? "プロジェクト規約付きで Bazaar 1リビジョンをレビュー" : "Bob で Bazaar 1リビジョンをレビュー",
    prompt: "レビュー対象の Bazaar リビジョンを入力してください。例: 1234 または revid:...",
    validateInput: (value) => value.trim() ? undefined : "リビジョンは必須です。"
  })
  if (!revision) return

  const maxDiffBytes = getMaxDiffBytes()
  const maxAddedFileContentBytes = getMaxAddedFileContentBytes()
  try {
    await withProgress("Bazaar 1リビジョンレビュー packet を作成しています", async (signal) => {
      const result = await runBazaarReviewProcessingOperation({
        reportDirectory: processingReportDirectory(context),
        repositoryScope: bazaarFolder.uri.fsPath,
        operation: {
          mode: "singleRevision",
          revision,
          withProjectRules
        },
        maxDiffBytes,
        maxAddedFileContentBytes,
        signal,
        produce: async ({ recordPreparedTarget }) => {
          const client = makeBazaarClient(signal, maxDiffBytes)
          const prepared = await prepareTarget(client, bazaarFolder.uri.fsPath, { mode: "singleRevision", revision }, {
            includeAddedFiles: true,
            maxAddedFileContentBytes
          })
          recordPreparedTarget(prepared)
          const projectRulesSection = withProjectRules && bobFolder
            ? await buildProjectRulesSectionForWorkspace(bobFolder.uri.fsPath)
            : undefined

          const extraSections = [
            buildTargetMetadataSection(prepared.info),
            prepared.addedFilesSection,
            projectRulesSection
          ].filter((section): section is string => Boolean(section))
          const packet = buildReviewPacket({
            repositoryRoot: prepared.root,
            mode: "singleRevision",
            revision,
            log: prepared.log,
            diff: prepared.diff,
            maxDiffBytes,
            extraSections: extraSections.length > 0 ? extraSections : undefined
          })
          return { prepared, packet }
        }
      })

      throwIfReviewCancelled(signal)
      await showAndOfferBobContext(
        context,
        result.packet,
        withProjectRules ? `bazaar-project-review-${revision}.md` : `bazaar-review-${revision}.md`,
        signal
      )
    })
  } catch (error) {
    if (await showProcessingCoverageFailure(error)) return
    throw error
  }
}

export async function reviewRange(context: vscode.ExtensionContext, withProjectRules: boolean): Promise<void> {
  const bazaarFolder = await pickBazaarWorkspaceFolder()
  if (!bazaarFolder) return
  const bobFolder = withProjectRules ? await pickBobWorkspaceFolder(undefined, true) : undefined
  if (withProjectRules && !bobFolder) return

  const baseRevision = await vscode.window.showInputBox({
    title: withProjectRules ? "プロジェクト規約付きで Bazaar リビジョン範囲をレビュー" : "Bob で Bazaar リビジョン範囲をレビュー",
    prompt: "基準となる Bazaar リビジョンを入力してください。例: 1200",
    validateInput: (value) => value.trim() ? undefined : "基準リビジョンは必須です。"
  })
  if (!baseRevision) return

  const targetRevision = await vscode.window.showInputBox({
    title: withProjectRules ? "プロジェクト規約付きで Bazaar リビジョン範囲をレビュー" : "Bob で Bazaar リビジョン範囲をレビュー",
    prompt: "比較先の Bazaar リビジョンを入力してください。例: 1234",
    validateInput: (value) => value.trim() ? undefined : "比較先リビジョンは必須です。"
  })
  if (!targetRevision) return

  const maxDiffBytes = getMaxDiffBytes()
  const maxAddedFileContentBytes = getMaxAddedFileContentBytes()
  try {
    await withProgress("Bazaar リビジョン範囲レビュー packet を作成しています", async (signal) => {
      const result = await runBazaarReviewProcessingOperation({
        reportDirectory: processingReportDirectory(context),
        repositoryScope: bazaarFolder.uri.fsPath,
        operation: {
          mode: "revisionRange",
          baseRevision,
          targetRevision,
          withProjectRules
        },
        maxDiffBytes,
        maxAddedFileContentBytes,
        signal,
        produce: async ({ recordPreparedTarget }) => {
          const client = makeBazaarClient(signal, maxDiffBytes)
          const prepared = await prepareTarget(client, bazaarFolder.uri.fsPath, { mode: "revisionRange", baseRevision, targetRevision }, {
            includeAddedFiles: true,
            maxAddedFileContentBytes
          })
          recordPreparedTarget(prepared)
          const projectRulesSection = withProjectRules && bobFolder
            ? await buildProjectRulesSectionForWorkspace(bobFolder.uri.fsPath)
            : undefined
          const extraSections = [
            buildTargetMetadataSection(prepared.info),
            prepared.addedFilesSection,
            projectRulesSection
          ].filter((section): section is string => Boolean(section))

          const packet = buildReviewPacket({
            repositoryRoot: prepared.root,
            mode: "revisionRange",
            baseRevision,
            targetRevision: prepared.info.targetRevision,
            log: prepared.log,
            diff: prepared.diff,
            maxDiffBytes,
            extraSections: extraSections.length > 0 ? extraSections : undefined
          })
          return { prepared, packet }
        }
      })

      throwIfReviewCancelled(signal)
      const outputFileName = withProjectRules
        ? `bazaar-project-review-${baseRevision}-${targetRevision}.md`
        : `bazaar-review-${baseRevision}-${targetRevision}.md`
      await showAndOfferBobContext(context, result.packet, outputFileName, signal)
    })
  } catch (error) {
    if (await showProcessingCoverageFailure(error)) return
    throw error
  }
}

async function buildProjectRulesSectionForWorkspace(workspaceRoot: string): Promise<string> {
  const config = vscode.workspace.getConfiguration("bobBazaar")
  const checklistPath = config.get<string>("projectRules.checklistPath", ".bob/review/checklist.json")
  const schemaPath = config.get<string>("projectRules.schemaPath", ".bob/review/review-result.schema.json")
  const bundle = await loadProjectRuleBundle(workspaceRoot, { checklistPath, schemaPath })
  return buildProjectRulesSectionFromBundle(bundle, PROJECT_RULE_BUNDLE_LIMITS)
}

function makeBazaarClient(signal: AbortSignal | undefined, maxDiffBytes = getMaxDiffBytes()): BazaarClient {
  const config = vscode.workspace.getConfiguration("bobBazaar")
  return new BazaarClient({
    bzrPath: resolveBzrPath(config, vscode.workspace.isTrusted),
    maxBuffer: maxBufferForDiffBytes(maxDiffBytes),
    textEncoding: config.get<string>("textEncoding", "auto"),
    timeoutMs: config.get<number>("commandTimeoutMs", 120_000),
    signal
  })
}

function getMaxDiffBytes(): number {
  const config = vscode.workspace.getConfiguration("bobBazaar")
  return clampMaxDiffBytes(config.get<number>("maxDiffBytes", 1024 * 1024))
}

function getMaxAddedFileContentBytes(): number {
  const config = vscode.workspace.getConfiguration("bobBazaar")
  return clampMaxAddedFileContentBytes(config.get<number>("maxAddedFileContentBytes", 256 * 1024))
}

function processingReportDirectory(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.globalStorageUri, "processing-budget-reports").fsPath
}

async function showProcessingCoverageFailure(error: unknown): Promise<boolean> {
  if (!(error instanceof BazaarProcessingCoveragePartialError)) return false
  await vscode.window.showErrorMessage(
    `Bazaar レビュー資料は処理範囲が不完全なため Bob へ渡しません。診断レポート: ${error.reportPath}`,
    { modal: true }
  )
  return true
}

async function pickBazaarWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  return resolveBazaarWorkspaceFolder({ allowPick: true, title: "Bazaar ワークスペースを選択" })
}

async function pickBobWorkspaceFolder(workflowRoot?: string, allowPick = true): Promise<vscode.WorkspaceFolder | undefined> {
  return resolveBobWorkspaceFolder({ workflowRoot, allowPick, title: "Bob ワークスペースを選択" })
}

async function showAndOfferBobContext(
  context: vscode.ExtensionContext,
  packet: string,
  filename: string,
  signal: AbortSignal
): Promise<void> {
  throwIfReviewCancelled(signal)
  const document = await vscode.workspace.openTextDocument({
    language: "markdown",
    content: packet
  })
  throwIfReviewCancelled(signal)
  const editor = await vscode.window.showTextDocument(document, { preview: false })
  throwIfReviewCancelled(signal)

  if (!isBobCodeExtensionAvailable()) {
    await vscode.window.showInformationMessage("IBM Bob 拡張機能が見つからないため、Bazaar Revision Review Request の Markdown を作成しました。Bob チャットへの挿入は行いません。")
    return
  }

  if (!isWorkflowRegisterExtensionAvailable()) {
    const result = await addPacketToBobContext(editor.document.uri, packet)
    if (result === "added") {
      await vscode.window.showInformationMessage("workflow-register 未導入のため、Bazaar Revision Review Request を Bob チャットへ挿入しました。")
    }
    return
  }

  const action = await vscode.window.showInformationMessage(
    "Bazaar レビュー packet を作成しました。Bob コンテキストへ追加しますか？",
    "Bob コンテキストへ追加",
    "クリップボードへコピー",
    "ファイルに保存"
  )
  throwIfReviewCancelled(signal)

  if (action === "Bob コンテキストへ追加") {
    await addPacketToBobContext(editor.document.uri, packet)
  } else if (action === "クリップボードへコピー") {
    await vscode.env.clipboard.writeText(packet)
  } else if (action === "ファイルに保存") {
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(context.globalStorageUri, filename),
      filters: { Markdown: ["md"] }
    })
    throwIfReviewCancelled(signal)
    if (target) {
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(target, ".."))
      throwIfReviewCancelled(signal)
      await vscode.workspace.fs.writeFile(target, Buffer.from(packet, "utf8"))
    }
  }
}

async function addPacketToBobContext(uri: vscode.Uri, packet: string) {
  return addMarkdownPacketToBobContext({
    executeCommand: (command, ...args) => vscode.commands.executeCommand(command, ...args),
    writeClipboard: (text) => vscode.env.clipboard.writeText(text),
    showWarningMessage: (message) => vscode.window.showWarningMessage(message)
  }, uri, packet)
}

function throwIfReviewCancelled(signal: AbortSignal): void {
  if (!signal.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw Object.assign(new Error("Bazaar review handoff was cancelled."), {
    code: "processing_cancelled",
    kind: "user"
  })
}

async function withProgress<T>(title: string, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
  return vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title,
    cancellable: true
  }, async (_progress, token) => {
    const controller = new AbortController()
    const cancellation = token.onCancellationRequested(() => controller.abort())
    try {
      return await task(controller.signal)
    } finally {
      cancellation.dispose()
    }
  })
}
