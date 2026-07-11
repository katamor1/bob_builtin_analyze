const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs/promises")
const path = require("node:path")
const { test } = require("node:test")

const { createWorkflowEngineContext } = require("./helpers/workflowEngineFixtures")

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

test("workflow engine preserves provider-written canonical process artifacts", async () => {
  const { actions, engine, workspaceRoot } = createWorkflowEngineContext()
  const canonicalArtifacts = [
    {
      id: "evidenceIndex",
      stepId: "collect-evidence",
      path: ".bob-process-runs/{{run.id}}/evidence-index.json",
      content: "{\n  \"schemaVersion\": \"bob-process-evidence-index/v1\",\n  \"entries\": []\n}\n"
    },
    {
      id: "processRecord",
      stepId: "write-process-record",
      path: ".bob-process-records/campaigns/CAMP-1/records/{{run.id}}/record.yaml",
      content: "schemaVersion: bob-process-record/v1\ncampaignId: CAMP-1\nstatus: completed\n"
    },
    {
      id: "campaignSummary",
      stepId: "generate-campaign-summary",
      path: ".bob-process-records/campaigns/CAMP-1/summary.yaml",
      content: "schemaVersion: bob-process-campaign-summary/v1\ncampaignId: CAMP-1\nrecordCount: 1\n"
    }
  ]
  for (const artifact of canonicalArtifacts) {
    actions.register({
      id: `sample.${artifact.stepId}`,
      execute: async (input) => {
        const relativePath = artifact.path.replace("{{run.id}}", input.runId)
        const absolutePath = path.join(workspaceRoot, ...relativePath.split("/"))
        await fs.mkdir(path.dirname(absolutePath), { recursive: true })
        await fs.writeFile(absolutePath, artifact.content, "utf8")
        return {
          $workflow: {
            artifacts: [{
              id: artifact.id,
              ownership: "provider",
              path: relativePath,
              bytes: 1,
              sha256: "provider-supplied-value-must-not-be-trusted"
            }]
          },
          status: "ok",
          diagnostics: [],
          relativePath
        }
      }
    })
  }
  const workflow = {
    id: "workflow-register.provider-artifacts",
    name: "provider-artifacts",
    label: "Provider Artifacts",
    description: "Provider-owned canonical process artifacts.",
    schemaVersion: "workflow-register/v1",
    workflowRoot: workspaceRoot,
    inputs: {},
    artifacts: canonicalArtifacts.map((artifact) => ({
      id: artifact.id,
      producedBy: artifact.stepId,
      path: artifact.path
    })),
    engineSteps: canonicalArtifacts.map((artifact) => ({
      id: artifact.stepId,
      title: artifact.stepId,
      type: "command",
      action: { provider: `sample.${artifact.stepId}` },
      resultKey: artifact.id
    }))
  }

  const run = await engine.runWorkflow(workflow, {})
  const actualContents = await Promise.all(canonicalArtifacts.map((artifact) => (
    fs.readFile(path.join(workspaceRoot, ...artifact.path.replace("{{run.id}}", run.runId).split("/")), "utf8")
  )))
  const manifestPath = path.join(workspaceRoot, ".bob", "workflows", "runs", run.runId, "artifacts", "manifest.json")
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"))

  assert.equal(run.status, "completed")
  assert.deepEqual(actualContents, canonicalArtifacts.map((artifact) => artifact.content))
  for (const artifact of canonicalArtifacts) {
    assert.deepEqual(JSON.parse(run.state[artifact.id]), {
      status: "ok",
      diagnostics: [],
      relativePath: artifact.path.replace("{{run.id}}", run.runId)
    })
    const entry = manifest.artifacts.find((candidate) => candidate.id === artifact.id)
    assert.deepEqual(
      { source: entry.source, bytes: entry.bytes, sha256: entry.sha256 },
      {
        source: "provider-artifact",
        bytes: Buffer.byteLength(artifact.content, "utf8"),
        sha256: sha256(artifact.content)
      }
    )
  }
})

test("workflow engine rejects invalid provider artifact metadata", async (t) => {
  const cases = [
    {
      name: "invalid workflow metadata shape",
      workflowMetadata: null,
      error: /\$workflow metadata must be an object/
    },
    {
      name: "invalid artifacts shape",
      metadata: () => ({ artifacts: "not-an-array" }),
      error: /\$workflow\.artifacts must be an array/
    },
    {
      name: "missing id",
      metadata: (artifactPath) => ({ artifacts: [{ ownership: "provider", path: artifactPath }] }),
      error: /artifacts\[0\]\.id must be a non-empty string/
    },
    {
      name: "missing path",
      metadata: () => ({ artifacts: [{ id: "evidenceIndex", ownership: "provider" }] }),
      error: /artifacts\[0\]\.path must be a non-empty string/
    },
    {
      name: "invalid ownership",
      metadata: (artifactPath) => ({ artifacts: [{ id: "evidenceIndex", ownership: "engine", path: artifactPath }] }),
      error: /ownership must be 'provider'/
    },
    {
      name: "duplicate id",
      metadata: (artifactPath) => ({ artifacts: [
        { id: "evidenceIndex", ownership: "provider", path: artifactPath },
        { id: "evidenceIndex", ownership: "provider", path: artifactPath }
      ] }),
      error: /duplicate provider artifact metadata id 'evidenceIndex'/
    },
    {
      name: "duplicate workflow declaration",
      duplicateDeclaration: true,
      metadata: (artifactPath) => ({ artifacts: [{ id: "evidenceIndex", ownership: "provider", path: artifactPath }] }),
      error: /Provider artifact 'evidenceIndex' has duplicate workflow declarations/
    },
    {
      name: "undeclared id",
      metadata: (artifactPath) => ({ artifacts: [{ id: "undeclared", ownership: "provider", path: artifactPath }] }),
      error: /Provider artifact 'undeclared' is not declared by the workflow/
    },
    {
      name: "wrong producing step",
      producedBy: "other-step",
      metadata: (artifactPath) => ({ artifacts: [{ id: "evidenceIndex", ownership: "provider", path: artifactPath }] }),
      error: /Provider artifact 'evidenceIndex' is declared for step 'other-step', not 'collect-evidence'/
    },
    {
      name: "path mismatch",
      metadata: () => ({ artifacts: [{ id: "evidenceIndex", ownership: "provider", path: ".bob-process-runs/wrong/evidence-index.json" }] }),
      error: /Provider artifact 'evidenceIndex' path does not match declared artifact path/
    },
    {
      name: "workspace escape",
      declaredPath: "../outside/evidence-index.json",
      metadata: () => ({ artifacts: [{ id: "evidenceIndex", ownership: "provider", path: "../outside/evidence-index.json" }] }),
      error: /Provider artifact 'evidenceIndex' path escapes the workspace/
    },
    {
      name: "missing provider file",
      metadata: (artifactPath) => ({ artifacts: [{ id: "evidenceIndex", ownership: "provider", path: artifactPath }] }),
      error: /Provider artifact 'evidenceIndex' file does not exist/
    }
  ]

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const { actions, engine, workspaceRoot } = createWorkflowEngineContext()
      const declaredPath = scenario.declaredPath ?? ".bob-process-runs/{{run.id}}/evidence-index.json"
      actions.register({
        id: "sample.collect-evidence",
        execute: (input) => {
          const artifactPath = declaredPath.replace("{{run.id}}", input.runId)
          return {
            $workflow: Object.prototype.hasOwnProperty.call(scenario, "workflowMetadata")
              ? scenario.workflowMetadata
              : scenario.metadata(artifactPath),
            status: "ok",
            diagnostics: [],
            relativePath: artifactPath
          }
        }
      })
      const workflow = {
        id: "workflow-register.invalid-provider-artifact",
        name: "invalid-provider-artifact",
        label: "Invalid Provider Artifact",
        description: "Reject invalid provider artifact metadata.",
        schemaVersion: "workflow-register/v1",
        workflowRoot: workspaceRoot,
        inputs: {},
        artifacts: [
          { id: "evidenceIndex", producedBy: scenario.producedBy ?? "collect-evidence", path: declaredPath },
          ...(scenario.duplicateDeclaration
            ? [{ id: "evidenceIndex", producedBy: "collect-evidence", path: declaredPath }]
            : [])
        ],
        engineSteps: [{
          id: "collect-evidence",
          title: "Collect evidence",
          type: "command",
          action: { provider: "sample.collect-evidence" },
          resultKey: "evidenceIndex"
        }]
      }

      const run = await engine.runWorkflow(workflow, {})

      assert.equal(run.status, "failed")
      assert.match(run.error, scenario.error)
    })
  }
})

test("metadata-free providers retain engine-owned artifact writes", async () => {
  const { actions, engine, workspaceRoot } = createWorkflowEngineContext()
  actions.register({
    id: "sample.metadata-free",
    execute: () => ({ status: "ok", diagnostics: [], value: "engine-owned" })
  })
  const workflow = {
    id: "workflow-register.metadata-free-artifact",
    name: "metadata-free-artifact",
    label: "Metadata-free Artifact",
    description: "Retain engine-owned artifact behavior.",
    schemaVersion: "workflow-register/v1",
    workflowRoot: workspaceRoot,
    inputs: {},
    artifacts: [{
      id: "evidenceIndex",
      producedBy: "collect-evidence",
      path: ".bob-process-runs/{{run.id}}/evidence-index.json"
    }],
    engineSteps: [{
      id: "collect-evidence",
      title: "Collect evidence",
      type: "command",
      action: { provider: "sample.metadata-free" },
      resultKey: "evidenceIndex"
    }]
  }

  const run = await engine.runWorkflow(workflow, {})
  const artifactPath = path.join(workspaceRoot, ".bob-process-runs", run.runId, "evidence-index.json")
  const manifestPath = path.join(workspaceRoot, ".bob", "workflows", "runs", run.runId, "artifacts", "manifest.json")
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"))

  assert.equal(run.status, "completed")
  assert.equal(await fs.readFile(artifactPath, "utf8"), JSON.stringify({ status: "ok", diagnostics: [], value: "engine-owned" }))
  assert.equal(manifest.artifacts[0].source, "workflow-artifact")
})
