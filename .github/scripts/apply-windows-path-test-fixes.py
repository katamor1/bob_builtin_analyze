from pathlib import Path


def replace_once(path_value: str, old: str, new: str) -> None:
    path = Path(path_value)
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path_value}: expected one match, found {count}: {old!r}")
    path.write_text(text.replace(old, new), encoding="utf-8")


replace_once(
    "extensions/workflow-register/test/helpers/workflowEngineFixtures.js",
    '  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))',
    '  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))'
)
replace_once(
    "extensions/workflow-register/test/bobGateLifecycle.test.js",
    '  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))',
    '  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))'
)
replace_once(
    "extensions/workflow-register/test/operationHubMutations.test.js",
    '  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-register-operation-hub-"))',
    '  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "workflow-register-operation-hub-")))'
)
replace_once(
    "extensions/workflow-register/test/workflowPlatformP0E2e.test.js",
    '  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))',
    '  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))'
)
replace_once(
    "extensions/workflow-register/test/workflowArtifactManifest.test.js",
    '  return fs.mkdtempSync(path.join(os.tmpdir(), "workflow-register-artifacts-"))',
    '  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "workflow-register-artifacts-")))'
)
replace_once(
    "extensions/workflow-register/test/workspaceFileTransaction.test.js",
    '  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-register-file-transaction-"))',
    '  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "workflow-register-file-transaction-")))'
)
replace_once(
    "extensions/workflow-register/test/workflowRunStateMigrationPath.test.js",
    '  return fs.mkdtempSync(path.join(os.tmpdir(), "workflow-run-migration-path-"))',
    '  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "workflow-run-migration-path-")))'
)
replace_once(
    "extensions/workflow-register/test/runStateStorePathBoundary.test.js",
    '  return fs.mkdtemp(path.join(os.tmpdir(), "workflow-run-store-boundary-"))',
    '  return fs.mkdtemp(path.join(os.tmpdir(), "workflow-run-store-boundary-")).then((root) => fs.realpath(root))'
)

snapshot_path = Path("extensions/workflow-register/test/workflowTaskSnapshotArtifactImport.test.js")
snapshot_text = snapshot_path.read_text(encoding="utf-8")
marker = 'const root = fs.mkdtempSync(path.join(os.tmpdir(), '
count = snapshot_text.count(marker)
if count < 2:
    raise SystemExit(f"{snapshot_path}: expected at least two root fixtures, found {count}")
lines = []
for line in snapshot_text.splitlines(keepends=True):
    if marker in line and "realpathSync.native" not in line:
        stripped = line.rstrip("\r\n")
        line_ending = line[len(stripped):]
        stripped = stripped.replace(
            'const root = fs.mkdtempSync(',
            'const root = fs.realpathSync.native(fs.mkdtempSync(',
            1
        ) + ')'
        line = stripped + line_ending
    lines.append(line)
snapshot_path.write_text("".join(lines), encoding="utf-8")

trace_path = Path("extensions/bob-code-consistency-review/test/traceabilityCatalogStore.test.js")
trace = trace_path.read_text(encoding="utf-8")
call_marker = "const barrier = installTargetTempOpenBarrier("
call_count = trace.count(call_marker)
if call_count < 1:
    raise SystemExit(f"{trace_path}: no temp-open barriers found")
trace = trace.replace(call_marker, "const barrier = await installTargetTempOpenBarrier(")
old_function = '''function installTargetTempOpenBarrier(targetPath) {
  const originalOpen = fs.open
  const expectedDirectory = normalizePhysicalPath(path.dirname(targetPath))
'''
new_function = '''async function installTargetTempOpenBarrier(targetPath) {
  const originalOpen = fs.open
  const expectedDirectory = normalizePhysicalPath(await fs.realpath(path.dirname(targetPath)))
'''
if trace.count(old_function) != 1:
    raise SystemExit(f"{trace_path}: temp-open barrier function anchor mismatch")
trace_path.write_text(trace.replace(old_function, new_function), encoding="utf-8")
print(f"Updated {call_count} traceability barrier call site(s).")
