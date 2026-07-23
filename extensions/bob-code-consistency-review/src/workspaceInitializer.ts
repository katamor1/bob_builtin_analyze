import { randomUUID } from "node:crypto"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as vscode from "vscode"
import { isInsidePath, resolveWorkspacePathStrict } from "./core/fileSystem"

export const CODE_CONSISTENCY_WORKFLOW_RELATIVE_PATH = path.join(
  ".bob",
  "workflows",
  "code-consistency-review",
  "WORKFLOW.md"
)

export interface CodeConsistencyWorkspaceInitializationStatus {
  initialized: boolean
  workflowPath: string
  missing: string[]
}

export interface InitializeCodeConsistencyWorkspaceOptions {
  context: vscode.ExtensionContext
  workspaceRoot: string
  reviewInputPath?: string
}

export interface InitializeCodeConsistencyWorkspaceResult {
  status: "created" | "updated" | "unchanged"
  workspaceRoot: string
  workflowPath: string
  reviewInputPath: string
  gitignorePath: string
  placeholderDocumentPath?: string
  backupPath?: string
  reviewInputBackupPath?: string
  workflowResult: CodeConsistencyFileInitializationResult
  reviewInputResult: CodeConsistencyFileInitializationResult
  message: string
}

export interface CodeConsistencyFileInitializationResult {
  status: "created" | "updated" | "unchanged"
  path: string
  backupPath?: string
  message: string
}

type FileInitializationResult = CodeConsistencyFileInitializationResult

interface WorkspaceWriteGuard {
  logicalRoot: string
  physicalRoot: string
  device: bigint
  inode: bigint
}

interface ParentWriteGuard {
  logicalPath: string
  physicalPath: string
  device: bigint
  inode: bigint
}

interface DirectFileIdentity {
  device: bigint
  inode: bigint
}

interface DirectFileSnapshot {
  bytes: Buffer
  identity: DirectFileIdentity
  parent: ParentWriteGuard
}

const WORKFLOW_TEMPLATE_RELATIVE_PATH = path.join("templates", ".bob", "workflows", "code-consistency-review", "WORKFLOW.md")
const REVIEW_INPUT_RELATIVE_PATH = "review-input.yaml"
const REVIEW_PLACEHOLDER_DOCUMENT_RELATIVE_PATH = path.join("docs", "review-input-placeholder.md")
const GENERATED_ARTIFACT_IGNORE_LINES = [".bob-review/", ".bob-trace/ai-traceability-draft/", ".bob/workflows/runs/"]
const GENERATED_ARTIFACT_IGNORE_HEADER = "# Bob code consistency generated review artifacts"
const workflowTransactionTails = new Map<string, Promise<void>>()

const REVIEW_INPUT_TEMPLATE = `# Bob Code Consistency Review input skeleton.
# 実レビュー前に id/title/purpose/base/head、artifact path、section ID を実案件向けに更新してください。
schema_version: 1
review:
  id: sample-review
  title: コード整合プレレビュー
  change_type: maintenance
  purpose: 要求・設計・テスト仕様とコード変更の整合性を正式レビュー前に確認する
  base: HEAD~1
  head: HEAD
  vcs: git
  ticket_ids:
    - TICKET-PLACEHOLDER
  out_of_scope:
    - 生成された雛形のため、実レビュー前に文書パスと section ID を更新する
artifacts:
  requirements:
    - path: docs/review-input-placeholder.md
      sections:
        - REQ-PLACEHOLDER
  basic_design:
    - path: docs/review-input-placeholder.md
      sections:
        - BD-PLACEHOLDER
  detailed_design:
    - path: docs/review-input-placeholder.md
      sections:
        - DD-PLACEHOLDER
  test_spec:
    - path: docs/review-input-placeholder.md
      sections:
        - TC-PLACEHOLDER
review_focus:
  - requirement-code-consistency
  - design-code-consistency
  - test-gap
analysis_options:
  include_callers: true
  include_callees: true
  include_global_access: true
  include_struct_impact: true
  include_ledgers: true
  max_call_depth: 1
  max_code_context_lines: 80
bob_options:
  prompt_template: consistency-review-v1
  output_format: yaml
  require_evidence: true
  allow_questions: true
  forbid_final_approval: true
`

const REVIEW_PLACEHOLDER_DOCUMENT_TEMPLATE = `# review-input placeholder

このファイルは \`bobCodeConsistency.initializeWorkspace\` が生成する review-input.yaml 雛形用の仮文書です。
実レビューでは、実際の要求書・基本設計書・詳細設計書・テスト仕様書へ差し替えてください。

## REQ-PLACEHOLDER

- 仮の要求 section です。実レビュー前に REQ-* などの実 ID へ置き換えてください。

## BD-PLACEHOLDER

- 仮の基本設計 section です。実レビュー前に BD-* などの実 ID へ置き換えてください。

## DD-PLACEHOLDER

- 仮の詳細設計 section です。実レビュー前に DD-* などの実 ID へ置き換えてください。

## TC-PLACEHOLDER

- 仮のテスト仕様 section です。実レビュー前に TC-* などの実 ID へ置き換えてください。
`

export async function getCodeConsistencyWorkspaceInitializationStatus(
  workspaceRoot: string
): Promise<CodeConsistencyWorkspaceInitializationStatus> {
  const workflowPath = path.join(workspaceRoot, CODE_CONSISTENCY_WORKFLOW_RELATIVE_PATH)
  let initialized = false
  try {
    initialized = (await fs.lstat(workflowPath)).isFile()
  } catch {
    initialized = false
  }
  return {
    initialized,
    workflowPath,
    missing: initialized
      ? []
      : [path.relative(workspaceRoot, workflowPath).replace(/\\/g, "/")]
  }
}

export async function initializeCodeConsistencyWorkspace(options: InitializeCodeConsistencyWorkspaceOptions): Promise<InitializeCodeConsistencyWorkspaceResult> {
  const workspace = await bindWorkspaceWriteGuard(options.workspaceRoot)
  const workflowPath = resolveWorkspacePathStrict(
    workspace.logicalRoot,
    CODE_CONSISTENCY_WORKFLOW_RELATIVE_PATH,
    "workflowPath"
  )
  const reviewInputPath = resolveWorkspacePathStrict(
    workspace.logicalRoot,
    options.reviewInputPath ?? REVIEW_INPUT_RELATIVE_PATH,
    "reviewInputPath"
  )
  const placeholderDocumentPath = resolveWorkspacePathStrict(
    workspace.logicalRoot,
    REVIEW_PLACEHOLDER_DOCUMENT_RELATIVE_PATH,
    "placeholderDocumentPath"
  )
  const gitignorePath = resolveWorkspacePathStrict(workspace.logicalRoot, ".gitignore", "gitignorePath")
  await Promise.all([
    preflightWriteTarget(workspace, workflowPath, "workflowPath"),
    preflightWriteTarget(workspace, reviewInputPath, "reviewInputPath"),
    preflightWriteTarget(workspace, placeholderDocumentPath, "placeholderDocumentPath"),
    preflightWriteTarget(workspace, gitignorePath, "gitignorePath")
  ])

  const templatePath = options.context.asAbsolutePath(WORKFLOW_TEMPLATE_RELATIVE_PATH)
  const template = await fs.readFile(templatePath)
  const workflowResult = await writeOrUpdateTemplateFile(workspace, workflowPath, template, {
    created: `コード整合プレレビュー workflow を作成しました: ${workflowPath}`,
    updated: `コード整合プレレビュー workflow を更新しました: ${workflowPath}`,
    unchanged: `コード整合プレレビュー workflow は既に最新です: ${workflowPath}`
  })

  const reviewInputResult = await createReviewInputSkeletonIfMissing(workspace, reviewInputPath)
  const placeholderDocumentResult = await createPlaceholderDocumentIfNeeded(
    workspace,
    placeholderDocumentPath,
    reviewInputResult
  )
  const gitignoreResult = await ensureGeneratedArtifactGitignore(workspace, gitignorePath)

  const status = mergeStatus([workflowResult.status, reviewInputResult.status, placeholderDocumentResult?.status ?? "unchanged", gitignoreResult.status])
  const message = [workflowResult.message, reviewInputResult.message, placeholderDocumentResult?.message, gitignoreResult.message].filter(Boolean).join("\n")

  return {
    status,
    workspaceRoot: options.workspaceRoot,
    workflowPath,
    reviewInputPath,
    gitignorePath: gitignoreResult.path,
    placeholderDocumentPath: placeholderDocumentResult?.path,
    backupPath: workflowResult.backupPath,
    reviewInputBackupPath: reviewInputResult.backupPath,
    workflowResult,
    reviewInputResult,
    message
  }
}

async function ensureGeneratedArtifactGitignore(
  workspace: WorkspaceWriteGuard,
  gitignorePath: string
): Promise<FileInitializationResult> {
  const current = await readIfExists(gitignorePath)
  const missing = GENERATED_ARTIFACT_IGNORE_LINES.filter((line) => !hasGitignoreLine(current ?? "", line))
  if (missing.length === 0) {
    return {
      status: "unchanged",
      path: gitignorePath,
      message: `生成物 ignore は既に .gitignore に設定済みです: ${gitignorePath}`
    }
  }

  const block = [GENERATED_ARTIFACT_IGNORE_HEADER, ...missing].join("\n")
  const next = current && current.trim()
    ? `${current.trimEnd()}\n\n${block}\n`
    : `${block}\n`
  await writeGuardedFile(workspace, gitignorePath, next, "gitignorePath", "utf8")
  return {
    status: current === undefined ? "created" : "updated",
    path: gitignorePath,
    message: `.gitignore に生成物 ignore を追加しました: ${gitignorePath}\n生成物は機密情報を含む可能性があります: .bob-review/ と .bob-trace/ai-traceability-draft/ を確認してください。`
  }
}

function hasGitignoreLine(text: string, expected: string): boolean {
  return text.split(/\r?\n/).some((line) => line.trim() === expected)
}

async function writeOrUpdateTemplateFile(
  workspace: WorkspaceWriteGuard,
  filePath: string,
  template: Buffer,
  messages: { created: string; updated: string; unchanged: string }
): Promise<FileInitializationResult> {
  return withWorkflowTransactionLock(workspace, filePath, async () => {
    const current = await readGuardedFileSnapshotIfExists(workspace, filePath, "workflowPath")
    if (current?.bytes.equals(template)) {
      return { status: "unchanged", path: filePath, message: messages.unchanged }
    }

    const backupPath = await publishWorkflowTemplate(workspace, filePath, template, current)
    const status = current === undefined ? "created" : "updated"
    return {
      status,
      path: filePath,
      backupPath,
      message: status === "created" ? messages.created : messages.updated
    }
  })
}

async function createReviewInputSkeletonIfMissing(
  workspace: WorkspaceWriteGuard,
  reviewInputPath: string
): Promise<FileInitializationResult> {
  let current = await readGuardedBufferIfExists(workspace, reviewInputPath, "reviewInputPath")
  if (current === undefined) {
    const created = await createGuardedFileExclusively(
      workspace,
      reviewInputPath,
      Buffer.from(REVIEW_INPUT_TEMPLATE, "utf8"),
      "reviewInputPath"
    )
    if (created !== false) {
      return {
        status: "created",
        path: reviewInputPath,
        message: `review-input.yaml の雛形を作成しました: ${reviewInputPath}`
      }
    }
    current = await readGuardedBufferIfExists(workspace, reviewInputPath, "reviewInputPath")
    if (current === undefined) throw new Error(`reviewInputPath disappeared after exclusive create conflict: ${reviewInputPath}`)
  }

  if (current.equals(Buffer.from(REVIEW_INPUT_TEMPLATE, "utf8"))) {
    return {
      status: "unchanged",
      path: reviewInputPath,
      message: `review-input.yaml の雛形は既に存在します: ${reviewInputPath}`
    }
  }

  const backupPath = resolveWorkspacePathStrict(
    workspace.logicalRoot,
    `${reviewInputPath}.bak-${timestampForFileName(new Date())}`,
    "reviewInputBackupPath"
  )
  await writeGuardedFile(workspace, backupPath, current, "reviewInputBackupPath")
  return {
    status: "unchanged",
    path: reviewInputPath,
    backupPath,
    message: `既存の review-input.yaml を検出したため上書きせず、バックアップだけ作成しました: ${backupPath}`
  }
}

async function createPlaceholderDocumentIfNeeded(
  workspace: WorkspaceWriteGuard,
  placeholderDocumentPath: string,
  reviewInputResult: FileInitializationResult
): Promise<FileInitializationResult | undefined> {
  if (reviewInputResult.status !== "created") return undefined

  const current = await readIfExists(placeholderDocumentPath)
  if (current !== undefined) {
    return {
      status: "unchanged",
      path: placeholderDocumentPath,
      message: `review-input.yaml 雛形用の仮文書は既に存在します: ${placeholderDocumentPath}`
    }
  }

  await writeGuardedFile(
    workspace,
    placeholderDocumentPath,
    REVIEW_PLACEHOLDER_DOCUMENT_TEMPLATE,
    "placeholderDocumentPath",
    "utf8"
  )
  return {
    status: "created",
    path: placeholderDocumentPath,
    message: `review-input.yaml 雛形用の仮文書を作成しました: ${placeholderDocumentPath}`
  }
}

function mergeStatus(statuses: Array<InitializeCodeConsistencyWorkspaceResult["status"]>): InitializeCodeConsistencyWorkspaceResult["status"] {
  if (statuses.includes("updated")) return "updated"
  if (statuses.includes("created")) return "created"
  return "unchanged"
}

async function readIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8")
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined
    throw error
  }
}

async function bindWorkspaceWriteGuard(workspaceRoot: string): Promise<WorkspaceWriteGuard> {
  const logicalRoot = path.resolve(workspaceRoot)
  const physicalRoot = await fs.realpath(logicalRoot)
  const stats = await fs.stat(physicalRoot, { bigint: true })
  if (!stats.isDirectory()) throw new Error(`workspaceRoot is not a directory: ${workspaceRoot}`)
  return {
    logicalRoot,
    physicalRoot,
    device: stats.dev,
    inode: stats.ino
  }
}

async function preflightWriteTarget(
  workspace: WorkspaceWriteGuard,
  filePath: string,
  label: string
): Promise<void> {
  await validateWorkspaceWriteGuard(workspace)
  await assertNearestExistingAncestorInsideWorkspace(workspace, filePath, label)
  await assertDirectRegularFileOrMissing(filePath, label)
}

async function writeGuardedFile(
  workspace: WorkspaceWriteGuard,
  filePath: string,
  data: string | Uint8Array,
  label: string,
  encoding?: BufferEncoding
): Promise<void> {
  await preflightWriteTarget(workspace, filePath, label)
  const parent = await prepareParentWriteGuard(workspace, filePath, label)
  await validateParentWriteGuard(workspace, parent, filePath, label)
  if (typeof data === "string") {
    await fs.writeFile(filePath, data, encoding ?? "utf8")
  } else {
    await fs.writeFile(filePath, data)
  }
}

async function publishWorkflowTemplate(
  workspace: WorkspaceWriteGuard,
  filePath: string,
  template: Buffer,
  original: DirectFileSnapshot | undefined
): Promise<string | undefined> {
  const transactionId = randomUUID().replace(/-/g, "")
  const temporaryPath = resolveWorkspacePathStrict(
    workspace.logicalRoot,
    `${filePath}.workspace-init-${transactionId}.tmp`,
    "workflowTemporaryPath"
  )
  const temporaryIdentity = await createGuardedFileExclusively(
    workspace,
    temporaryPath,
    template,
    "workflowTemporaryPath"
  )
  if (temporaryIdentity === false) throw new Error(`workflow temporary path already exists: ${temporaryPath}`)
  const parent = await captureExistingParentWriteGuard(workspace, filePath, "workflowPath")
  let backupPath: string | undefined
  let backupOwned = false
  let published = false

  try {
    await assertOwnedDirectFile(workspace, parent, temporaryPath, "workflowTemporaryPath", temporaryIdentity)
    if (original) {
      await assertDirectSnapshotCurrent(workspace, filePath, "workflowPath", original)
      backupPath = resolveWorkspacePathStrict(
        workspace.logicalRoot,
        `${filePath}.bak-${timestampForFileName(new Date())}-${transactionId.slice(0, 12)}`,
        "workflowBackupPath"
      )
      const backupParent = await prepareParentWriteGuard(workspace, backupPath, "workflowBackupPath")
      assertSameParent(parent, backupParent, "workflowBackupPath")
      await assertPathMissing(backupPath, "workflowBackupPath")
      try {
        await fs.link(filePath, backupPath)
        backupOwned = true
      } catch (error) {
        backupOwned = await pathHasIdentity(backupPath, original.identity)
        throw error
      }
      await assertOwnedDirectFile(workspace, backupParent, backupPath, "workflowBackupPath", original.identity)
      await assertDirectFileBytes(workspace, backupPath, "workflowBackupPath", original.identity, original.bytes)
      await assertDirectSnapshotCurrent(workspace, filePath, "workflowPath", original)
      await assertOwnedDirectFile(workspace, parent, temporaryPath, "workflowTemporaryPath", temporaryIdentity)
      await validateParentWriteGuard(workspace, parent, filePath, "workflowPath")
      try {
        await fs.rename(temporaryPath, filePath)
        published = true
      } catch (error) {
        published = await pathHasIdentity(filePath, temporaryIdentity)
        throw error
      }
      await assertOwnedDirectFile(workspace, parent, filePath, "workflowPath", temporaryIdentity)
      await assertDirectFileBytes(workspace, filePath, "workflowPath", temporaryIdentity, template)
      await assertOwnedDirectFile(workspace, backupParent, backupPath, "workflowBackupPath", original.identity)
      await assertDirectFileBytes(workspace, backupPath, "workflowBackupPath", original.identity, original.bytes)
      return backupPath
    }

    await validateParentWriteGuard(workspace, parent, filePath, "workflowPath")
    await assertPathMissing(filePath, "workflowPath")
    try {
      await fs.link(temporaryPath, filePath)
      published = true
    } catch (error) {
      published = await pathHasIdentity(filePath, temporaryIdentity)
      throw error
    }
    await assertOwnedDirectFile(workspace, parent, filePath, "workflowPath", temporaryIdentity)
    await assertDirectFileBytes(workspace, filePath, "workflowPath", temporaryIdentity, template)
    const cleanupError = await removeOwnedDirectFile(
      workspace,
      parent,
      temporaryPath,
      "workflowTemporaryPath",
      temporaryIdentity
    )
    if (cleanupError) throw new Error(`workflow temporary cleanup failed: ${cleanupError}`)
    return undefined
  } catch (error) {
    const rollbackErrors = await rollbackWorkflowPublication({
      workspace,
      parent,
      filePath,
      temporaryPath,
      temporaryIdentity,
      original,
      backupPath,
      backupOwned,
      published
    })
    if (rollbackErrors.length > 0) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`${message}; workflow rollback failed: ${rollbackErrors.join("; ")}`, { cause: error })
    }
    throw error
  }
}

async function rollbackWorkflowPublication(input: {
  workspace: WorkspaceWriteGuard
  parent: ParentWriteGuard
  filePath: string
  temporaryPath: string
  temporaryIdentity: DirectFileIdentity
  original?: DirectFileSnapshot
  backupPath?: string
  backupOwned: boolean
  published: boolean
}): Promise<string[]> {
  const errors: string[] = []
  const targetIsPublished = await pathHasIdentity(input.filePath, input.temporaryIdentity).catch(() => false)
  const published = input.published || targetIsPublished
  let restored = false

  if (published) {
    if (!targetIsPublished) {
      errors.push(`workflow target changed before rollback: ${input.filePath}`)
    } else {
      const removeError = await removeOwnedDirectFile(
        input.workspace,
        input.parent,
        input.filePath,
        "workflowPath",
        input.temporaryIdentity
      )
      if (removeError) {
        errors.push(removeError)
      } else if (input.original && input.backupPath && input.backupOwned) {
        try {
          await validateParentWriteGuard(input.workspace, input.parent, input.filePath, "workflowPath")
          await assertPathMissing(input.filePath, "workflowPath")
          try {
            await fs.link(input.backupPath, input.filePath)
          } catch (error) {
            if (!await pathHasIdentity(input.filePath, input.original.identity)) throw error
          }
          await assertOwnedDirectFile(input.workspace, input.parent, input.filePath, "workflowPath", input.original.identity)
          await assertDirectFileBytes(
            input.workspace,
            input.filePath,
            "workflowPath",
            input.original.identity,
            input.original.bytes
          )
          restored = true
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error))
        }
      }
    }
  }

  const temporaryError = await removeOwnedDirectFile(
    input.workspace,
    input.parent,
    input.temporaryPath,
    "workflowTemporaryPath",
    input.temporaryIdentity
  )
  if (temporaryError) errors.push(temporaryError)

  if (input.backupPath && input.backupOwned && (!published || restored)) {
    const backupError = await removeOwnedDirectFile(
      input.workspace,
      input.parent,
      input.backupPath,
      "workflowBackupPath",
      input.original?.identity ?? input.temporaryIdentity
    )
    if (backupError) errors.push(backupError)
  }
  return errors
}

async function assertDirectSnapshotCurrent(
  workspace: WorkspaceWriteGuard,
  filePath: string,
  label: string,
  expected: DirectFileSnapshot
): Promise<void> {
  const current = await readGuardedFileSnapshotIfExists(workspace, filePath, label)
  if (!current || !sameFileIdentity(current.identity, expected.identity) || !current.bytes.equals(expected.bytes)) {
    throw new Error(`${label} changed before workflow publication: ${filePath}`)
  }
  assertSameParent(current.parent, expected.parent, label)
}

async function assertDirectFileBytes(
  workspace: WorkspaceWriteGuard,
  filePath: string,
  label: string,
  identity: DirectFileIdentity,
  expected: Uint8Array
): Promise<void> {
  const current = await readGuardedFileSnapshotIfExists(workspace, filePath, label)
  if (!current || !sameFileIdentity(current.identity, identity) || !current.bytes.equals(expected)) {
    throw new Error(`${label} bytes changed during workflow publication: ${filePath}`)
  }
}

function assertSameParent(left: ParentWriteGuard, right: ParentWriteGuard, label: string): void {
  if (!samePhysicalPath(left.physicalPath, right.physicalPath) ||
    left.device !== right.device || left.inode !== right.inode) {
    throw new Error(`${label} must use the guarded workflow parent`)
  }
}

async function assertPathMissing(filePath: string, label: string): Promise<void> {
  try {
    await fs.lstat(filePath)
    throw new Error(`${label} appeared during workflow publication: ${filePath}`)
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return
    throw error
  }
}

async function pathHasIdentity(filePath: string, identity: DirectFileIdentity): Promise<boolean> {
  try {
    const stats = await fs.lstat(filePath, { bigint: true })
    return stats.isFile() && !stats.isSymbolicLink() && stats.dev === identity.device && stats.ino === identity.inode
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false
    throw error
  }
}

function sameFileIdentity(left: DirectFileIdentity, right: DirectFileIdentity): boolean {
  return left.device === right.device && left.inode === right.inode
}

async function createGuardedFileExclusively(
  workspace: WorkspaceWriteGuard,
  filePath: string,
  bytes: Uint8Array,
  label: string
): Promise<DirectFileIdentity | false> {
  await preflightWriteTarget(workspace, filePath, label)
  const parent = await prepareParentWriteGuard(workspace, filePath, label)
  await validateParentWriteGuard(workspace, parent, filePath, label)
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  let identity: DirectFileIdentity | undefined
  try {
    try {
      handle = await fs.open(filePath, "wx")
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") return false
      throw error
    }
    const stats = await handle.stat({ bigint: true })
    if (!stats.isFile()) throw new Error(`${label} exclusive target is not a regular file: ${filePath}`)
    identity = { device: stats.dev, inode: stats.ino }
    await assertOwnedDirectFile(workspace, parent, filePath, label, identity)
    await handle.writeFile(bytes)
    await handle.close()
    handle = undefined
    await assertOwnedDirectFile(workspace, parent, filePath, label, identity)
    return identity
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined)
    if (identity) {
      const cleanupError = await removeOwnedDirectFile(workspace, parent, filePath, label, identity)
      if (cleanupError) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`${message}; exclusive create cleanup failed: ${cleanupError}`, { cause: error })
      }
    }
    throw error
  }
}

async function readGuardedBufferIfExists(
  workspace: WorkspaceWriteGuard,
  filePath: string,
  label: string
): Promise<Buffer | undefined> {
  return (await readGuardedFileSnapshotIfExists(workspace, filePath, label))?.bytes
}

async function readGuardedFileSnapshotIfExists(
  workspace: WorkspaceWriteGuard,
  filePath: string,
  label: string
): Promise<DirectFileSnapshot | undefined> {
  await preflightWriteTarget(workspace, filePath, label)
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  try {
    try {
      handle = await fs.open(filePath, "r")
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return undefined
      throw error
    }
    const stats = await handle.stat({ bigint: true })
    if (!stats.isFile()) throw new Error(`${label} is not a regular file: ${filePath}`)
    const identity = { device: stats.dev, inode: stats.ino }
    const parent = await captureExistingParentWriteGuard(workspace, filePath, label)
    await assertOwnedDirectFile(workspace, parent, filePath, label, identity)
    const bytes = await handle.readFile()
    await assertOwnedDirectFile(workspace, parent, filePath, label, identity)
    return { bytes, identity, parent }
  } finally {
    if (handle) await handle.close()
  }
}

async function prepareParentWriteGuard(
  workspace: WorkspaceWriteGuard,
  filePath: string,
  label: string
): Promise<ParentWriteGuard> {
  await validateWorkspaceWriteGuard(workspace)
  await assertNearestExistingAncestorInsideWorkspace(workspace, filePath, label)
  const logicalPath = path.dirname(filePath)
  await fs.mkdir(logicalPath, { recursive: true })
  await validateWorkspaceWriteGuard(workspace)
  const physicalPath = await fs.realpath(logicalPath)
  assertPhysicalWorkspaceContainment(workspace, physicalPath, label)
  const stats = await fs.stat(physicalPath, { bigint: true })
  if (!stats.isDirectory()) throw new Error(`${label} parent is not a directory: ${logicalPath}`)
  return { logicalPath, physicalPath, device: stats.dev, inode: stats.ino }
}

async function captureExistingParentWriteGuard(
  workspace: WorkspaceWriteGuard,
  filePath: string,
  label: string
): Promise<ParentWriteGuard> {
  await validateWorkspaceWriteGuard(workspace)
  const logicalPath = path.dirname(filePath)
  const physicalPath = await fs.realpath(logicalPath)
  assertPhysicalWorkspaceContainment(workspace, physicalPath, label)
  const stats = await fs.stat(physicalPath, { bigint: true })
  if (!stats.isDirectory()) throw new Error(`${label} parent is not a directory: ${logicalPath}`)
  return { logicalPath, physicalPath, device: stats.dev, inode: stats.ino }
}

async function validateWorkspaceWriteGuard(workspace: WorkspaceWriteGuard): Promise<void> {
  const physicalRoot = await fs.realpath(workspace.logicalRoot)
  if (!samePhysicalPath(physicalRoot, workspace.physicalRoot)) {
    throw new Error(`workspaceRoot changed during initialization: ${workspace.logicalRoot}`)
  }
  const stats = await fs.stat(physicalRoot, { bigint: true })
  if (!stats.isDirectory() || stats.dev !== workspace.device || stats.ino !== workspace.inode) {
    throw new Error(`workspaceRoot identity changed during initialization: ${workspace.logicalRoot}`)
  }
}

async function validateParentWriteGuard(
  workspace: WorkspaceWriteGuard,
  parent: ParentWriteGuard,
  filePath: string,
  label: string
): Promise<void> {
  await validateWorkspaceWriteGuard(workspace)
  const physicalPath = await fs.realpath(parent.logicalPath)
  assertPhysicalWorkspaceContainment(workspace, physicalPath, label)
  if (!samePhysicalPath(physicalPath, parent.physicalPath)) {
    throw new Error(`${label} parent changed during initialization: ${parent.logicalPath}`)
  }
  const stats = await fs.stat(physicalPath, { bigint: true })
  if (!stats.isDirectory() || stats.dev !== parent.device || stats.ino !== parent.inode) {
    throw new Error(`${label} parent identity changed during initialization: ${parent.logicalPath}`)
  }
  await assertDirectRegularFileOrMissing(filePath, label)
}

async function assertNearestExistingAncestorInsideWorkspace(
  workspace: WorkspaceWriteGuard,
  filePath: string,
  label: string
): Promise<void> {
  let current = path.resolve(filePath)
  while (true) {
    try {
      const physicalPath = await fs.realpath(current)
      assertPhysicalWorkspaceContainment(workspace, physicalPath, label)
      if (!samePhysicalPath(current, filePath)) {
        const stats = await fs.stat(physicalPath)
        if (!stats.isDirectory()) throw new Error(`${label} parent is not a directory: ${current}`)
      }
      return
    } catch (error) {
      if (!isNodeError(error) || (error.code !== "ENOENT" && error.code !== "ENOTDIR")) throw error
      try {
        const stats = await fs.lstat(current)
        if (stats.isSymbolicLink()) throw new Error(`${label} traverses a dangling symbolic link: ${filePath}`)
      } catch (lstatError) {
        if (!isNodeError(lstatError) || (lstatError.code !== "ENOENT" && lstatError.code !== "ENOTDIR")) {
          throw lstatError
        }
      }
      const parent = path.dirname(current)
      if (parent === current) throw new Error(`${label} has no existing workspace ancestor: ${filePath}`)
      current = parent
    }
  }
}

async function assertDirectRegularFileOrMissing(filePath: string, label: string): Promise<void> {
  try {
    const stats = await fs.lstat(filePath)
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error(`${label} must be a direct regular file: ${filePath}`)
    }
  } catch (error) {
    if (isNodeError(error) && (error.code === "ENOENT" || error.code === "ENOTDIR")) return
    throw error
  }
}

async function assertOwnedDirectFile(
  workspace: WorkspaceWriteGuard,
  parent: ParentWriteGuard,
  filePath: string,
  label: string,
  identity: DirectFileIdentity
): Promise<void> {
  await validateParentWriteGuard(workspace, parent, filePath, label)
  const stats = await fs.lstat(filePath, { bigint: true })
  if (!stats.isFile() || stats.isSymbolicLink() || stats.dev !== identity.device || stats.ino !== identity.inode) {
    throw new Error(`${label} changed during direct file access: ${filePath}`)
  }
  const physicalPath = await fs.realpath(filePath)
  assertPhysicalWorkspaceContainment(workspace, physicalPath, label)
}

async function removeOwnedDirectFile(
  workspace: WorkspaceWriteGuard,
  parent: ParentWriteGuard,
  filePath: string,
  label: string,
  identity: DirectFileIdentity
): Promise<string | undefined> {
  try {
    await assertOwnedDirectFile(workspace, parent, filePath, label, identity)
    await fs.rm(filePath)
    return undefined
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined
    return error instanceof Error ? error.message : String(error)
  }
}

async function withWorkflowTransactionLock<T>(
  workspace: WorkspaceWriteGuard,
  filePath: string,
  operation: () => Promise<T>
): Promise<T> {
  const physicalTarget = await resolvePhysicalTargetPath(workspace, filePath, "workflowPath")
  const key = process.platform === "win32" ? physicalTarget.toLowerCase() : physicalTarget
  const predecessor = workflowTransactionTails.get(key) ?? Promise.resolve()
  const owner = predecessor.then(operation, operation)
  const tail = owner.then(() => undefined, () => undefined)
  workflowTransactionTails.set(key, tail)
  try {
    return await owner
  } finally {
    if (workflowTransactionTails.get(key) === tail) workflowTransactionTails.delete(key)
  }
}

async function resolvePhysicalTargetPath(
  workspace: WorkspaceWriteGuard,
  filePath: string,
  label: string
): Promise<string> {
  let current = path.resolve(filePath)
  const suffix: string[] = []
  while (true) {
    try {
      const ancestor = await fs.realpath(current)
      const physicalTarget = path.resolve(ancestor, ...suffix)
      assertPhysicalWorkspaceContainment(workspace, physicalTarget, label)
      return physicalTarget
    } catch (error) {
      if (!isNodeError(error) || (error.code !== "ENOENT" && error.code !== "ENOTDIR")) throw error
      try {
        const stats = await fs.lstat(current)
        if (stats.isSymbolicLink()) throw new Error(`${label} traverses a dangling symbolic link: ${filePath}`)
      } catch (lstatError) {
        if (!isNodeError(lstatError) || (lstatError.code !== "ENOENT" && lstatError.code !== "ENOTDIR")) {
          throw lstatError
        }
      }
      const parent = path.dirname(current)
      if (parent === current) throw new Error(`${label} has no existing workspace ancestor: ${filePath}`)
      suffix.unshift(path.basename(current))
      current = parent
    }
  }
}

function assertPhysicalWorkspaceContainment(workspace: WorkspaceWriteGuard, filePath: string, label: string): void {
  if (!isInsidePath(workspace.physicalRoot, filePath)) {
    throw new Error(`${label} resolves outside workspace: ${filePath}`)
  }
}

function samePhysicalPath(left: string, right: string): boolean {
  const normalizedLeft = path.normalize(left)
  const normalizedRight = path.normalize(right)
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error
}

function timestampForFileName(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}
