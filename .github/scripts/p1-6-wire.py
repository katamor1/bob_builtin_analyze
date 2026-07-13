from __future__ import annotations

import json
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if new in text:
            return text
        raise RuntimeError(f"missing {label} anchor")
    return text.replace(old, new, 1)


lease_path = Path("extensions/workflow-register/src/core/runtime/runCleanupLease.ts")
lease = lease_path.read_text(encoding="utf-8")
lease = replace_once(
    lease,
    'const RUNS_ROOT_SEGMENTS = [".bob", "workflows", "runs"] as const\nconst CLEANUP_LEASE_DIRECTORY = ".cleanup-leases"',
    'const WORKFLOWS_ROOT_SEGMENTS = [".bob", "workflows"] as const\nconst CLEANUP_LEASE_DIRECTORY = "run-cleanup-leases"',
    "cleanup lease location",
)
lease = lease.replace("for (const segment of RUNS_ROOT_SEGMENTS)", "for (const segment of WORKFLOWS_ROOT_SEGMENTS)")
lease_path.write_text(lease, encoding="utf-8")

lease_test_path = Path("extensions/workflow-register/test/workflowRunCleanupLease.test.js")
lease_test = lease_test_path.read_text(encoding="utf-8")
lease_test = lease_test.replace(
    'path.join(root, ".bob", "workflows", "runs", ".cleanup-leases")',
    'path.join(root, ".bob", "workflows", "run-cleanup-leases")',
)
lease_test_path.write_text(lease_test, encoding="utf-8")

lock_path = Path("extensions/workflow-register/src/core/runtime/runLock.ts")
lock = lock_path.read_text(encoding="utf-8")
import_anchor = 'import {\n  createRunDurabilityFile,\n  readRunDurabilityFile,\n  removeRunDurabilityFile,\n  replaceRunDurabilityFile\n} from "./runDurabilityPath"\n'
lease_import = 'import { workflowRunCleanupLeasePresent } from "./runCleanupLease"\n'
if lease_import not in lock:
    lock = replace_once(lock, import_anchor, import_anchor + lease_import, "run lock import")
old_lock = '''    let contentionMessage = "Lock metadata changed while it was being inspected."
    try {
      if (await createRunDurabilityFile(workspaceRoot, runId, "run.lock.json", serializeWorkflowRunLock(owner))) return owner

      const snapshot = await readRunDurabilityFile(workspaceRoot, runId, "run.lock.json")
      if (!snapshot) continue
      const inspection = inspectExistingLock(snapshot.bytes, snapshot.mtimeMs, runId, options)
      contentionMessage = inspection.message
      if (inspection.reclaim) {
        const removed = await removeRunDurabilityFile(workspaceRoot, runId, "run.lock.json", snapshot.bytes)
        if (removed) {
          try {
            options.onReclaimed?.(inspection.message)
          } catch (error) {
            console.warn("Workflow run lock reclamation callback failed.", error)
          }
          continue
        }
      }
    } catch (error) {
      if (!isTransientLockContention(error, runId)) throw error
      contentionMessage = `Lock metadata changed while it was being inspected (${formatError(error)}).`
    }
'''
new_lock = '''    let contentionMessage = "Lock metadata changed while it was being inspected."
    try {
      if (await workflowRunCleanupLeasePresent(workspaceRoot, runId)) {
        contentionMessage = "Reserved by a workflow run cleanup operation."
      } else {
        if (await createRunDurabilityFile(workspaceRoot, runId, "run.lock.json", serializeWorkflowRunLock(owner))) return owner

        const snapshot = await readRunDurabilityFile(workspaceRoot, runId, "run.lock.json")
        if (!snapshot) continue
        const inspection = inspectExistingLock(snapshot.bytes, snapshot.mtimeMs, runId, options)
        contentionMessage = inspection.message
        if (inspection.reclaim) {
          const removed = await removeRunDurabilityFile(workspaceRoot, runId, "run.lock.json", snapshot.bytes)
          if (removed) {
            try {
              options.onReclaimed?.(inspection.message)
            } catch (error) {
              console.warn("Workflow run lock reclamation callback failed.", error)
            }
            continue
          }
        }
      }
    } catch (error) {
      if (!isTransientLockContention(error, runId)) throw error
      contentionMessage = `Lock or cleanup lease metadata changed while it was being inspected (${formatError(error)}).`
    }
'''
lock = replace_once(lock, old_lock, new_lock, "run lock acquisition")
lock_path.write_text(lock, encoding="utf-8")

extension_path = Path("extensions/workflow-register/src/extensionWithAuthoring.ts")
extension = extension_path.read_text(encoding="utf-8")
import_line = '''import {
  cleanupCompletedWorkflowRuns,
  deleteSelectedWorkflowRuns,
  inspectWorkflowRunStorage,
  pinWorkflowRun,
  previewWorkflowRunCleanup,
  unpinWorkflowRun
} from "./commands/runRetention"
'''
import_anchor = 'import { WorkflowRunControlView } from "./commands/runControlView"\n'
if import_line not in extension:
    extension = replace_once(extension, import_anchor, import_anchor + import_line, "extension retention import")
registration_anchor = '    vscode.commands.registerCommand("workflowRegister.refreshRunsView", () => runControlView.refresh()),\n'
registrations = '''    vscode.commands.registerCommand("workflowRegister.inspectRunStorage", inspectWorkflowRunStorage),
    vscode.commands.registerCommand("workflowRegister.previewRunCleanup", previewWorkflowRunCleanup),
    vscode.commands.registerCommand("workflowRegister.cleanupCompletedRuns", cleanupCompletedWorkflowRuns),
    vscode.commands.registerCommand("workflowRegister.deleteSelectedRuns", deleteSelectedWorkflowRuns),
    vscode.commands.registerCommand("workflowRegister.pinRun", pinWorkflowRun),
    vscode.commands.registerCommand("workflowRegister.unpinRun", unpinWorkflowRun),
'''
if 'workflowRegister.inspectRunStorage' not in extension:
    extension = replace_once(extension, registration_anchor, registration_anchor + registrations, "extension command registration")
extension_path.write_text(extension, encoding="utf-8")

package_path = Path("extensions/workflow-register/package.json")
package = json.loads(package_path.read_text(encoding="utf-8"))
commands = [
    ("workflowRegister.inspectRunStorage", "Run storage を確認"),
    ("workflowRegister.previewRunCleanup", "Run cleanup をプレビュー"),
    ("workflowRegister.cleanupCompletedRuns", "完了 Run をcleanup"),
    ("workflowRegister.deleteSelectedRuns", "選択した Run を削除"),
    ("workflowRegister.pinRun", "Workflow Run をPin"),
    ("workflowRegister.unpinRun", "Workflow Run のPinを解除"),
]
for command, title in commands:
    event = f"onCommand:{command}"
    if event not in package["activationEvents"]:
        package["activationEvents"].append(event)
    if not any(item.get("command") == command for item in package["contributes"]["commands"]):
        package["contributes"]["commands"].append({"command": command, "title": title, "category": "Bob Workflow"})
properties = package["contributes"]["configuration"]["properties"]
properties.update(
    {
        "workflowRegister.runs.retention.enabled": {
            "type": "boolean",
            "default": False,
            "description": "将来のautomatic run cleanup opt-in。P1-6ではautomatic deletionを実行しません。",
        },
        "workflowRegister.runs.retention.completedDays": {
            "type": "number",
            "default": 30,
            "minimum": 0,
            "description": "cleanup previewでterminal runを古いと判定する日数。",
        },
        "workflowRegister.runs.retention.maxCompletedRuns": {
            "type": "integer",
            "default": 100,
            "minimum": 0,
            "description": "保持するterminal run件数。",
        },
        "workflowRegister.runs.retention.maxTotalBytes": {
            "type": "integer",
            "default": 524288000,
            "minimum": 0,
            "description": "workflow run storageの目標最大byte数。",
        },
    }
)
palette = package["contributes"]["menus"]["commandPalette"]
for command, _ in commands:
    if not any(item.get("command") == command for item in palette):
        palette.append({"command": command})
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
