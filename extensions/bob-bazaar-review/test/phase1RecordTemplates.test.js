const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const extensionRoot = path.resolve(__dirname, "..")

function extensionFile(relativePath) {
  return path.join(extensionRoot, relativePath)
}

function readExtensionFile(relativePath) {
  return fs.readFileSync(extensionFile(relativePath), "utf8")
}

function assertLocalFile(relativePath) {
  assert.ok(fs.existsSync(extensionFile(relativePath)), `${relativePath} must be extension-local`)
}

function readRealMachineCase(spec, id) {
  const headings = [...spec.matchAll(new RegExp(`^(#{3,4}) ${id} .+$`, "gm"))]
  assert.equal(headings.length, 1, `real-machine spec must define ${id} exactly once`)

  const heading = headings[0]
  const start = heading.index
  const level = heading[1].length
  const followingHeading = /^(#{1,6}) .+$/gm
  followingHeading.lastIndex = start + heading[0].length

  let end = spec.length
  for (let candidate = followingHeading.exec(spec); candidate; candidate = followingHeading.exec(spec)) {
    if (candidate[1].length <= level) {
      end = candidate.index
      break
    }
  }
  return spec.slice(start, end)
}

function readMarkdownTableRow(markdown, id) {
  const rows = markdown.split(/\r?\n/).filter((line) => new RegExp(`^\\|\\s*${id}\\s*\\|`).test(line))
  assert.equal(rows.length, 1, `campaign UAT table must define ${id} exactly once`)
  return rows[0]
}

test("Phase 1 campaign operation docs are extension-local", () => {
  const campaignDoc = readExtensionFile("docs/uat/bazaar-review-campaign-template-ja.md")
  for (const phrase of [
    "campaign.yaml",
    "targets.yaml",
    "record.yaml",
    "triage.yaml",
    "summary.json",
    "summary.md",
    "BZR-RT-036",
    "BZR-RT-043",
    ".bob-review-records",
    "accepted",
    "rejected",
    "needs_investigation",
    "deferred"
  ]) {
    assert.ok(campaignDoc.includes(phrase), `campaign doc must include ${phrase}`)
  }

  const campaignCases = [
    ["BZR-RT-036", /campaign.*初期化/i],
    ["BZR-RT-037", /(?:review packet|レビュー資料).*(?:artifact|成果物).*保存/i],
    ["BZR-RT-038", /review-result.*record\.yaml.*作成/i],
    ["BZR-RT-039", /指摘確認・振り分け.*(?:雛形|一覧).*(?:生成|作成)/],
    ["BZR-RT-040", /指摘確認・振り分け.*(?:validation|検証)/i],
    ["BZR-RT-041", /(?:campaign summary.*生成|集計レポート.*作成)/i],
    ["BZR-RT-042", /workflow run metadata.*紐付け/i],
    ["BZR-RT-043", /実績報告 Markdown.*作成/i],
    ["BZR-RT-044", /レビュー実行開始.*artifact関連付け/i],
    ["BZR-RT-045", /再起動後.*再開/],
    ["BZR-RT-046", /decision別.*指摘確認・振り分け.*validation/i],
    ["BZR-RT-047", /Metrics.*自動計測.*補正/i],
    ["BZR-RT-048", /レビュー実行.*一括finalize/i],
    ["BZR-RT-049", /Summary失敗.*再試行/i],
    ["BZR-RT-050", /Legacy artifact recovery/i]
  ]

  for (const [id, purpose] of campaignCases) {
    assert.match(readMarkdownTableRow(campaignDoc, id), purpose, `${id} must keep its canonical semantic purpose`)
  }

  const acceptanceGate = campaignDoc.split("## 共通 acceptance gate", 2)[1] ?? ""
  assert.doesNotMatch(acceptanceGate, /BZR-RT-\d+/, "cross-cutting accessibility checks must remain ID-less")
  for (const phrase of ["keyboard-only", "200% zoom", "High Contrast"]) {
    assert.ok(acceptanceGate.includes(phrase), `common acceptance gate must include ${phrase}`)
  }
})

test("Phase 1 record and summary templates are extension-local", () => {
  for (const relativePath of [
    "docs/uat/bazaar-review-record-template.yaml",
    "docs/uat/bazaar-review-triage-template.yaml",
    "docs/uat/bazaar-review-summary-template.md",
    "templates/.bob-review-records/campaigns/phase1-bazaar-review-uat-001/campaign.yaml",
    "templates/.bob-review-records/campaigns/phase1-bazaar-review-uat-001/targets.yaml",
    "templates/.bob-review-records/campaigns/phase1-bazaar-review-uat-001/records/_template/record.yaml",
    "templates/.bob-review-records/campaigns/phase1-bazaar-review-uat-001/records/_template/triage.yaml"
  ]) {
    assertLocalFile(relativePath)
  }

  assert.match(readExtensionFile("docs/uat/bazaar-review-record-template.yaml"), /^schema_version: bazaar-review-record\/v1$/m)
  assert.match(readExtensionFile("docs/uat/bazaar-review-triage-template.yaml"), /^schema_version: bazaar-review-triage\/v1$/m)
  assert.ok(readExtensionFile("docs/uat/bazaar-review-summary-template.md").includes("IBM Bob Bazaar"))
})

test("Phase 1 review record operations are documented in local docs", () => {
  const readme = readExtensionFile("README.md")
  const realMachineSpec = readExtensionFile("docs/real-machine-test-spec-ja.md")

  for (const phrase of [
    "bobBazaar.records.initCampaign",
    "bobBazaar.records.createRecord",
    "bobBazaar.records.createTriage",
    "bobBazaar.records.generateSummary",
    "review-packet.md",
    "summary.json"
  ]) {
    assert.ok(readme.includes(phrase), `README must document ${phrase}`)
  }

  const phase1Cases = [
    {
      id: "BZR-RT-036",
      heading: /Phase 1.*(?:campaign|キャンペーン).*初期化/,
      phrases: [
        ".bob-review-records/campaigns/phase1-bazaar-review-uat-001",
        "campaign.yaml",
        "targets.yaml",
        "records/_template/record.yaml",
        "records/_template/triage.yaml"
      ]
    },
    {
      id: "BZR-RT-037",
      heading: /(?:review packet|レビュー資料).*(?:artifact|成果物).*保存/,
      phrases: [
        ".bob-review-records/campaigns/<campaign_id>/records/<review_id>/review-packet.md",
        "backup"
      ]
    },
    {
      id: "BZR-RT-038",
      heading: /review-result.*(?:record\.yaml|実績記録).*作成/,
      phrases: [".bob/review/results", "record.yaml", "target", "packet", "metrics"]
    },
    {
      id: "BZR-RT-039",
      heading: /指摘確認・振り分け.*(?:雛形|一覧).*(?:生成|作成)/,
      phrases: ["triage.yaml", "指摘確認・振り分け一覧を作成", "needs_investigation", "finding"]
    },
    {
      id: "BZR-RT-040",
      heading: /(?:triage|指摘確認・振り分け).*(?:validation|検証).*(?:error|エラー)/,
      phrases: ["triage.yaml", "指摘確認・振り分け内容を検証", "unknown finding_id", "summary mismatch"]
    },
    {
      id: "BZR-RT-041",
      heading: /(?:campaign summary|集計レポート).*(?:生成|作成)/,
      phrases: ["record.yaml", "triage.yaml", "summary.json", "summary.md", "estimated minutes saved"]
    },
    {
      id: "BZR-RT-042",
      heading: /workflow run metadata.*紐付け/,
      phrases: ["record.yaml", "run_id", "status", "unavailable: true"]
    },
    {
      id: "BZR-RT-043",
      heading: /実績報告 Markdown.*作成/,
      phrases: ["summary.md", "採用/棄却/追加調査", "triage missing", "invalid record"]
    },
    {
      id: "BZR-RT-044",
      heading: /レビュー実行開始.*(?:artifact|成果物).*関連付け/,
      phrases: ["review-run.json", "review-packet.md", "同じcampaign / review ID", "packet completed", "result in_progress"]
    },
    {
      id: "BZR-RT-045",
      heading: /再起動後.*再開/,
      phrases: ["未完了レビュー実行", "updatedAt", "resultCapture", "campaign / review ID、packetを再入力・再生成しない"]
    },
    {
      id: "BZR-RT-046",
      heading: /decision別.*指摘確認・振り分け.*(?:validation|検証)/,
      phrases: [
        "`accepted` | ownerとactionの両方",
        "`rejected` | reason",
        "`needs_investigation` | ownerまたはaction",
        "`deferred` | reason",
        "host側validation",
        "triage phaseがcompleted"
      ]
    },
    {
      id: "BZR-RT-047",
      heading: /Metrics.*自動計測.*補正/i,
      phrases: ["自動記録", "user_corrected", "invalid補正は拒否", "二重加算しない"]
    },
    {
      id: "BZR-RT-048",
      heading: /レビュー実行.*一括finalize/i,
      phrases: ["レビュー実行を完了して集計", "record.yaml", "summary.json", "summary.md", "レビュー実行全体がcompleted"]
    },
    {
      id: "BZR-RT-049",
      heading: /Summary失敗.*再試行/i,
      phrases: ["record phaseはcompleted", "summaryだけfailed", "retryable issue", "recordを作り直さずsummaryから続行"]
    },
    {
      id: "BZR-RT-050",
      heading: /Legacy artifact recovery/i,
      phrases: [
        "previewとmodal確認",
        "複数campaignは明示選択までblock",
        "ID不一致と既存run上書きを拒否",
        "承認後に追加されるのは`review-run.json`だけ",
        "既存packet / result / triage / recordのbytesが変化しない"
      ]
    }
  ]

  for (const { id, heading, phrases } of phase1Cases) {
    const testCase = readRealMachineCase(realMachineSpec, id)
    const headingLine = testCase.split(/\r?\n/, 1)[0]
    assert.match(headingLine, heading, `${id} must keep its Phase 1 semantic heading`)
    for (const phrase of phrases) {
      assert.ok(testCase.includes(phrase), `${id} must document ${phrase}`)
    }
  }
})
