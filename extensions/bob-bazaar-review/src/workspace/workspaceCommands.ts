import * as vscode from "vscode"
import { resolveBzrPath } from "../bazaar/bzrPathTrust"
import { configureWorkspaceMcpServer } from "../mcp/mcpConfig"
import { initializeProjectRules } from "../projectRules/io"
import {
  DEFAULT_RULE_AUTHORING_LIMITS,
  type RuleAuthoringLimits
} from "../ruleAuthoring/ruleAuthoringLimits"
import { openRuleAuthoringGui } from "../ui/ruleAuthoringGui"
import { initializeRuleAuthoringWorkspaceFromTemplates } from "./bobWorkspaceInit"
import { resolveBazaarWorkspaceFolder, resolveBobWorkspaceFolder } from "./workspaceResolver"

export interface RuleAuthoringHostConfiguration {
  pdfToTextPath: string
  limits: RuleAuthoringLimits
}

/**
 * 選択した Bob workspace に Bazaar MCP server 設定を書き込む。
 *
 * allowedRoots と bzrPath は外部コマンド境界に直結するため、GUI 選択と信頼済み設定からだけ組み立てる。
 *
 * @param context MCP 設定で使う拡張リソース解決用の VS Code extension context。
 * @returns 設定保存または folder 選択 cancel 後に解決する Promise。
 */
export async function configureMcp(context: vscode.ExtensionContext): Promise<void> {
  const folder = await pickBobWorkspaceFolder(undefined, true)
  if (!folder) return

  const config = vscode.workspace.getConfiguration("bobBazaar")
  const bzrPath = resolveBzrPath(config, vscode.workspace.isTrusted)
  const textEncoding = config.get<string>("textEncoding", "auto")
  const serverName = config.get<string>("mcpServerName", "bazaar")
  const bazaarFolder = await resolveBazaarWorkspaceFolder({ workflowRoot: folder.uri.fsPath, allowPick: false })

  const result = await configureWorkspaceMcpServer({
    workspaceFolder: folder,
    extensionContext: context,
    serverName,
    bzrPath,
    textEncoding,
    allowedRoots: bazaarFolder ? [bazaarFolder.uri.fsPath] : undefined
  })

  await vscode.window.showInformationMessage(
    `Bob MCP サーバー '${result.serverName}' を ${result.configPath} に設定しました。すでに起動中の場合は Bob MCP サーバーを Refresh / Restart してください。`
  )
}

/**
 * 選択した Bob workspace に project review rule file を初期化する。
 *
 * 生成 file は以後 Bob output validation の契約になるため、既定 template を workspace 内へ配置する。
 *
 * @returns scaffold 作成または folder 選択 cancel 後に解決する Promise。
 */
export async function initProjectRules(): Promise<void> {
  const folder = await pickBobWorkspaceFolder(undefined, true)
  if (!folder) return

  const paths = await initializeProjectRules(folder.uri.fsPath)
  await vscode.window.showInformationMessage(`プロジェクトレビュー規約を初期化しました: ${paths.reviewDir}`)

  const checklistDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(paths.checklistPath))
  await vscode.window.showTextDocument(checklistDoc, { preview: false })
}

export async function authorProjectRulesFromDocuments(
  context: vscode.ExtensionContext
): Promise<void> {
  const folder = await pickBobWorkspaceFolder(undefined, true)
  if (!folder) return
  const readiness = await initializeRuleAuthoringWorkspaceFromTemplates({
    context,
    workspaceFolder: folder
  })
  if (!readiness.initialized) {
    await vscode.window.showWarningMessage(
      `プロジェクト規約作成 workspace の準備が完了していません: ${readiness.missing.join(", ")}`
    )
    return
  }
  const configuration = getRuleAuthoringHostConfiguration()
  const result = await openRuleAuthoringGui(context, {
    workspaceRoot: folder.uri.fsPath,
    limits: configuration.limits,
    pdfToTextPath: configuration.pdfToTextPath
  })
  if (result.status !== "confirmed") return
  await vscode.window.showInformationMessage(
    `資料の抽出範囲を確認しました（run: ${result.authoringSession.run_id}）。Bob UI から 'bazaar-project-rule-authoring' workflow を開始してください。`
  )
}

export function getRuleAuthoringHostConfiguration(): RuleAuthoringHostConfiguration {
  const config = vscode.workspace.getConfiguration("bobBazaar.ruleAuthoring")
  const pdfToTextPath = boundedCommandPath(config.get<unknown>("pdfToTextPath", "pdftotext"))
  return {
    pdfToTextPath,
    limits: {
      ...DEFAULT_RULE_AUTHORING_LIMITS,
      maxSourceFiles: boundedConfiguredLimit(config, "maxSourceFiles"),
      maxSourceBytes: boundedConfiguredLimit(config, "maxSourceBytes"),
      maxAggregateSourceBytes: boundedConfiguredLimit(config, "maxAggregateSourceBytes"),
      maxChunkBytes: boundedConfiguredLimit(config, "maxChunkBytes"),
      maxSelectedEvidenceBytes: boundedConfiguredLimit(config, "maxSelectedEvidenceBytes")
    }
  }
}

function boundedConfiguredLimit(
  config: vscode.WorkspaceConfiguration,
  key: keyof Pick<
    RuleAuthoringLimits,
    | "maxSourceFiles"
    | "maxSourceBytes"
    | "maxAggregateSourceBytes"
    | "maxChunkBytes"
    | "maxSelectedEvidenceBytes"
  >
): number {
  const ceiling = DEFAULT_RULE_AUTHORING_LIMITS[key]
  const value = config.get<unknown>(key, ceiling)
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`bobBazaar.ruleAuthoring.${key} must be a positive safe integer`)
  }
  return Math.min(value as number, ceiling)
}

function boundedCommandPath(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("bobBazaar.ruleAuthoring.pdfToTextPath must be a string")
  }
  const normalized = value.trim()
  if (
    !normalized ||
    Buffer.byteLength(normalized, "utf8") > 4096 ||
    /[\u0000-\u001f\u007f-\u009f]/.test(normalized)
  ) {
    throw new Error("bobBazaar.ruleAuthoring.pdfToTextPath is invalid")
  }
  return normalized
}

/**
 * workflow input または interactive picker から Bob workspace folder を解決する。
 *
 * @param workflowRoot workflow-register から渡される workspace root path。
 * @param allowPick root がない場合に interactive picker を表示するか。
 * @returns 選択された workspace folder。利用できない場合は undefined。
 */
async function pickBobWorkspaceFolder(workflowRoot?: string, allowPick = true): Promise<vscode.WorkspaceFolder | undefined> {
  return resolveBobWorkspaceFolder({ workflowRoot, allowPick, title: "Bob ワークスペースを選択" })
}
