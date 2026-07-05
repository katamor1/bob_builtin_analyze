#!/usr/bin/env node
"use strict"

const { spawnSync } = require("node:child_process")

const checks = [
  {
    label: "knip dependency policy",
    command: "knip",
    args: ["--production", "--include", "dependencies,unlisted,unresolved"],
  },
  {
    label: "depcheck dependency policy",
    command: "depcheck",
    args: [".", "--ignore-bin-package", "--skip-missing"],
  },
]

const failures = []

for (const check of checks) {
  console.log(`\n[unused-policy] ${check.label}`)
  const result = spawnSync(check.command, check.args, {
    cwd: process.cwd(),
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  })

  if (result.error) {
    failures.push(`${check.label}: ${result.error.message}`)
    continue
  }

  if (result.signal) {
    failures.push(`${check.label}: terminated by ${result.signal}`)
    continue
  }

  if (result.status !== 0) {
    failures.push(`${check.label}: exit ${result.status}`)
  }
}

if (failures.length > 0) {
  console.error("\n[unused-policy] Failing unused dependency policy:")
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exitCode = 1
} else {
  console.log("\n[unused-policy] Dependency, unlisted, and unresolved checks passed.")
}
