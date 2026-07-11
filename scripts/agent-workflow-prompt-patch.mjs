import fs from "node:fs"
import path from "node:path"

const workflowRoot = ".bob/workflows"
const promptByStepId = {
  "validate-catalog": "設定された工程カタログを検証し、利用可能な工程定義として読み込んでください。",
  "load-process-input": "process-input.yaml を検証し、キャンペーンと対象工程の入力値を読み込んでください。",
  "collect-evidence": "対象工程の証跡を収集し、evidence-index.json を作成してください。",
  "validate-review-result": "工程レビュー結果を process-review-result/v1 と evidence index に照らして検証してください。",
  "human-gate": "工程の成果物、検証結果、レビュー結果を人間が確認し、記録へ進むか差し戻すかを判断してください。",
  "write-process-record": "人間承認済みの工程結果を監査可能な工程記録として保存してください。",
  "generate-campaign-summary": "最新の工程記録を集約し、キャンペーンサマリーを更新してください。"
}

for (const entry of fs.readdirSync(workflowRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith("process-")) continue
  const workflowPath = path.join(workflowRoot, entry.name, "WORKFLOW.md")
  if (!fs.existsSync(workflowPath)) continue
  let text = fs.readFileSync(workflowPath, "utf8")
  if (!/^stepMessage:\s*step\s*$/m.test(text)) continue

  let changed = false
  for (const [stepId, prompt] of Object.entries(promptByStepId)) {
    const stepStart = text.indexOf(`  - id: ${stepId}\n`)
    if (stepStart < 0) continue
    const nextStep = text.indexOf("\n  - id: ", stepStart + 1)
    const stepEnd = nextStep < 0 ? text.indexOf("\n---", stepStart) : nextStep
    const blockEnd = stepEnd < 0 ? text.length : stepEnd
    const block = text.slice(stepStart, blockEnd)
    if (/^    prompt:/m.test(block)) continue
    const typeMatch = block.match(/^    type:\s*(command|manual)\s*$/m)
    if (!typeMatch || typeMatch.index === undefined) {
      throw new Error(`Cannot locate supported type line for ${workflowPath}#${stepId}`)
    }
    const typeLineEnd = stepStart + typeMatch.index + typeMatch[0].length
    text = `${text.slice(0, typeLineEnd)}\n    prompt: ${prompt}${text.slice(typeLineEnd)}`
    changed = true
  }

  if (changed) fs.writeFileSync(workflowPath, text, "utf8")
}
