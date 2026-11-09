import { canonicalizePhysicalPathSync, normalizeWorkspaceRelativePath, isPortablePathContained, resolvePhysicalContainedPathSync, resolvePhysicalContainedPath, selectDeepestPhysicalRoot, PathPolicyError, type PhysicalContainedPath, type CanonicalPhysicalPath } from "@bob/processing-budget-runtime/path-policy"
const relative: string = normalizeWorkspaceRelativePath("日本語 docs/file.md")
const canonical: CanonicalPhysicalPath = canonicalizePhysicalPathSync("/root", { expectedType: "directory" })
const contained: PhysicalContainedPath = resolvePhysicalContainedPathSync({rootPath: canonical.path, candidatePath: relative, mustExist: false, expectedType: "file"})
void isPortablePathContained("/root", "/root/file", "linux")
void resolvePhysicalContainedPath({rootPath: canonical.path, candidatePath: relative, mustExist: false})
void selectDeepestPhysicalRoot([canonical.path], contained.path)
const error = new PathPolicyError("path_policy_escape", "outside"); void error.code
// @ts-expect-error physical observations are readonly
contained.exists = true
// @ts-expect-error expected type is file or directory only
canonicalizePhysicalPathSync("/root", {expectedType: "socket"})
// @ts-expect-error path-only subpath does not expose a ledger
import { ProcessingBudgetLedger } from "@bob/processing-budget-runtime/path-policy"
void ProcessingBudgetLedger
