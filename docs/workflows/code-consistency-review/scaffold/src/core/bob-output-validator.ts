import YAML from "yaml";
import { readTextFile } from "./file-system.js";
import type { ValidationReport } from "./result.js";

export async function validateBobOutput(input: {
  packageDir: string;
  bobOutputPath: string;
}): Promise<ValidationReport> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const raw = await readTextFile(input.bobOutputPath);
  const parsed = YAML.parse(raw) as Record<string, unknown> | null;

  if (!parsed || typeof parsed !== "object") {
    return { errors: ["bob-output.yaml must be a YAML object"], warnings };
  }

  for (const key of ["schema_version", "review_summary", "findings", "questions", "coverage_notes", "rejected_or_uncertain"]) {
    if (!(key in parsed)) {
      errors.push(`Missing top-level key: ${key}`);
    }
  }

  const reviewSummary = parsed.review_summary as Record<string, unknown> | undefined;
  if (reviewSummary?.final_approval !== "not_performed") {
    errors.push("review_summary.final_approval must be not_performed");
  }

  const findings = parsed.findings;
  if (Array.isArray(findings)) {
    for (const finding of findings) {
      const item = finding as Record<string, unknown>;
      if (!Array.isArray(item.evidence) || item.evidence.length === 0) {
        errors.push(`finding ${String(item.id ?? "unknown")} must have evidence`);
      }
      if (!item.human_check) {
        errors.push(`finding ${String(item.id ?? "unknown")} must have human_check`);
      }
    }
  } else if ("findings" in parsed) {
    errors.push("findings must be an array");
  }

  if (input.packageDir.length === 0) {
    warnings.push("packageDir is empty; evidence-index check skipped");
  } else {
    warnings.push("MVP scaffold: evidence-index existence check is TODO");
  }

  return { errors, warnings };
}
