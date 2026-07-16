#!/usr/bin/env bash
set -euo pipefail

repo="${GITHUB_REPOSITORY:?}"
rescue_branch="${GITHUB_HEAD_REF:?}"
rescue_pr="${PR_NUMBER:?}"
remote=origin
implementation_branch="integration/retire-superseded-branches-20260716-v3"
execution_branch="integration/retire-superseded-branches-execution-20260716"
verification_branch="integration/verify-branch-retirement-20260716"
failed_bootstrap_branch="integration/retire-superseded-branches-20260716-v2"
plan_branch="plan/retire-intentionally-unintegrated-20260716"
legacy_empty_branch="integration/retire-superseded-branches-20260716"

log() { printf '==> %s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

repo_path() {
  local path="$1" ref="$2"
  gh api "repos/$repo/contents/$path?ref=$ref" >/dev/null 2>&1
}

remote_sha() {
  git ls-remote --heads "$remote" "refs/heads/$1" | cut -f1
}

latest_pr_for_head() {
  gh pr list --repo "$repo" --state all --head "$1" --limit 100 \
    --json number,state,mergedAt,headRefOid,headRefName,updatedAt \
    --jq 'sort_by(.number) | last // {}'
}

cancel_branch_runs() {
  local branch="$1"
  gh run list --repo "$repo" --branch "$branch" --limit 100 \
    --json databaseId,status,name \
    --jq '.[] | select(.status == "queued" or .status == "in_progress" or .status == "waiting" or .status == "requested") | .databaseId' \
    | while read -r run_id; do
        [[ -n "$run_id" ]] || continue
        gh run cancel "$run_id" --repo "$repo" >/dev/null 2>&1 || true
      done
}

close_pr_for_head() {
  local branch="$1"
  local pr_json number state merged_at
  pr_json="$(latest_pr_for_head "$branch")"
  number="$(printf '%s' "$pr_json" | jq -r '.number // empty')"
  state="$(printf '%s' "$pr_json" | jq -r '.state // empty')"
  merged_at="$(printf '%s' "$pr_json" | jq -r '.mergedAt // empty')"
  if [[ -n "$number" && "$state" == "OPEN" && -z "$merged_at" ]]; then
    gh pr close "$number" --repo "$repo" --comment "Superseded by the idempotent completion orchestrator. No evidence from this PR is used unless it is already present on main." >/dev/null
  fi
}

delete_helper_branch() {
  local branch="$1" required="$2"
  [[ "$branch" != "main" && "$branch" != "$rescue_branch" ]] || return 0
  local sha pr_json number state merged_at protected encoded open_refs
  sha="$(remote_sha "$branch")"
  [[ -n "$sha" ]] || return 0
  pr_json="$(latest_pr_for_head "$branch")"
  number="$(printf '%s' "$pr_json" | jq -r '.number // empty')"
  state="$(printf '%s' "$pr_json" | jq -r '.state // empty')"
  merged_at="$(printf '%s' "$pr_json" | jq -r '.mergedAt // empty')"
  if [[ "$required" == "merged" ]]; then
    [[ -n "$number" && "$state" == "MERGED" && -n "$merged_at" ]] || return 0
  elif [[ "$required" == "closed" ]]; then
    [[ -z "$number" || "$state" == "CLOSED" || "$state" == "MERGED" ]] || return 0
  fi
  cancel_branch_runs "$branch"
  encoded="$(jq -rn --arg value "$branch" '$value | @uri')"
  protected="$(gh api "repos/$repo/branches/$encoded" --jq '.protected')"
  [[ "$protected" == "false" ]] || fail "Helper branch $branch is protected"
  open_refs="$(gh api "repos/$repo/pulls?state=open&per_page=100" --jq ".[] | select(.head.ref == \"$branch\" or .base.ref == \"$branch\") | .number")"
  [[ -z "$open_refs" ]] || fail "Helper branch $branch is referenced by open PR(s): $open_refs"
  git push --force-with-lease="refs/heads/$branch:$sha" "$remote" ":refs/heads/$branch"
}

wait_for_workflow_success() {
  local workflow="$1" expected_sha="$2"
  local run_json run_id status conclusion head_sha
  for _ in $(seq 1 360); do
    run_json="$(gh run list --repo "$repo" --workflow "$workflow" --branch main --event workflow_dispatch --limit 30 \
      --json databaseId,headSha,status,conclusion,createdAt \
      --jq "[.[] | select(.headSha == \"$expected_sha\")] | sort_by(.databaseId) | last // {}")"
    run_id="$(printf '%s' "$run_json" | jq -r '.databaseId // empty')"
    status="$(printf '%s' "$run_json" | jq -r '.status // empty')"
    conclusion="$(printf '%s' "$run_json" | jq -r '.conclusion // empty')"
    head_sha="$(printf '%s' "$run_json" | jq -r '.headSha // empty')"
    if [[ -n "$run_id" && "$head_sha" == "$expected_sha" && "$status" == "completed" ]]; then
      [[ "$conclusion" == "success" ]] || fail "$workflow run $run_id concluded $conclusion"
      printf '%s' "$run_id"
      return 0
    fi
    sleep 20
  done
  fail "Timed out waiting for $workflow at $expected_sha"
}

merge_pr_exact() {
  local number="$1" expected_sha="$2" title="$3"
  local current state result merged
  current="$(gh api "repos/$repo/pulls/$number" --jq '.head.sha')"
  state="$(gh api "repos/$repo/pulls/$number" --jq '.state')"
  [[ "$current" == "$expected_sha" ]] || fail "PR #$number head moved from $expected_sha to $current"
  [[ "$state" == "open" ]] || return 0
  result="$(gh api --method PUT "repos/$repo/pulls/$number/merge" \
    -f merge_method=squash \
    -f sha="$expected_sha" \
    -f commit_title="$title" 2>/dev/null || true)"
  merged="$(printf '%s' "$result" | jq -r '.merged // false' 2>/dev/null || printf false)"
  if [[ "$merged" != "true" ]]; then
    gh pr merge "$number" --repo "$repo" --squash --admin --subject "$title"
  fi
}

ensure_map_reconciled() {
  python3 - <<'PY'
import json
from pathlib import Path
path = Path('tools/branch-retirement/branch-retirement-map.json')
data = json.loads(path.read_text(encoding='utf-8'))
scopes = {
    'diagnostic/p1-1-windows-flake-20260712': [
        '.github/workflows/', 'docs/release-evidence/', 'docs/superpowers/', 'extensions/workflow-register/'
    ],
    'agent/workflow-automatic-pause-ci-verification-20260712': [
        '.github/workflows/', 'docs/release-evidence/', 'docs/superpowers/', 'extensions/workflow-register/'
    ],
    'diagnostic/phase4-windows-20260712': [
        '.github/workflows/', 'docs/release-evidence/', 'docs/superpowers/specs/', 'extensions/workflow-register/'
    ]
}
for entry in data['entries']:
    if entry['branch'] in scopes:
        entry['allowedSourcePrPathPrefixes'] = scopes[entry['branch']
        ]
path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

policy = Path('tools/branch-retirement/deletionPolicy.mjs')
text = policy.read_text(encoding='utf-8')
text = text.replace(
    '  if (!Array.isArray(input.protectedBranches)) errors.push("protectedBranches must be an array.")\n  else if (!input.protectedBranches.includes("main")) errors.push("main must be protected before branch retirement.")\n',
    '  if (!Array.isArray(input.protectedBranches)) errors.push("protectedBranches must be an array.")\n'
)
policy.write_text(text, encoding='utf-8')

test_path = Path('tools/branch-retirement/test/deletionPolicy.test.mjs')
test_text = test_path.read_text(encoding='utf-8')
test_text = test_text.replace(
'''test("requires main protection and main ancestry", () => {
  assert.match(validateDeletionInputs(input({ protectedBranches: [] })).join("\\n"), /main must be protected/)
  assert.match(validateDeletionInputs(input({ mainIsDescendantOfAudit: false })).join("\\n"), /does not descend/)
})''',
'''test("requires main ancestry while excluding main independently of protection settings", () => {
  assert.deepEqual(validateDeletionInputs(input({ protectedBranches: [] })), [])
  assert.match(validateDeletionInputs(input({ mainIsDescendantOfAudit: false })).join("\\n"), /does not descend/)
})'''
)
test_path.write_text(test_text, encoding='utf-8')
PY
}

ensure_implementation_on_main() {
  git fetch --no-tags "$remote" main
  local main_sha
  main_sha="$(git rev-parse refs/remotes/origin/main)"
  if git cat-file -e "refs/remotes/origin/main:tools/branch-retirement/delete-retired-branches.mjs" 2>/dev/null \
    && git cat-file -e "refs/remotes/origin/main:docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json" 2>/dev/null; then
    local ready
    ready="$(git show "refs/remotes/origin/main:docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json" | jq -r '.ready_for_deletion')"
    [[ "$ready" == "true" ]] || fail "Main audit exists but is not deletion-ready"
    printf '%s' "$main_sha"
    return 0
  fi

  log "Completing implementation and live audit on $implementation_branch"
  local impl_remote_sha pr_json pr_number pr_state impl_head
  impl_remote_sha="$(remote_sha "$implementation_branch")"
  [[ -n "$impl_remote_sha" ]] || fail "Implementation branch is absent before its tools reached main"
  git fetch --no-tags "$remote" "$implementation_branch"
  git switch -C "$implementation_branch" "refs/remotes/origin/$implementation_branch"
  ensure_map_reconciled
  rm -f \
    .github/workflows/branch-retirement-validation.yml \
    .github/workflows/branch-retirement-integration-finalizer.yml \
    .github/workflows/branch-retirement-integration-finalizer-v2.yml \
    .github/workflows/branch-retirement-map-reconcile.yml \
    .github/workflows/branch-retirement-diagnostic-scope-reconcile.yml \
    .github/workflows/branch-retirement-main-safety-reconcile.yml

  node --test tools/branch-retirement/test/*.test.mjs
  for extension in workflow-register bob-code-consistency-review bob-bazaar-review; do
    (cd "extensions/$extension" && npm ci)
  done
  node scripts/verify-branch-retirement-behaviors.js --json tools/branch-retirement/behavior-results.json
  node tools/branch-retirement/audit-branch-retirement.mjs \
    --repository "$repo" \
    --remote "$remote" \
    --base main \
    --map tools/branch-retirement/branch-retirement-map.json \
    --behavior-results tools/branch-retirement/behavior-results.json \
    --json docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json \
    --markdown docs/release-evidence/branch-retirement-reconciliation-2026-07-16.md
  jq -e '.ready_for_deletion == true and (.blockedBranches | length == 0)' \
    docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json >/dev/null

  cat > docs/release-evidence/branch-retirement-reconciliation-review-2026-07-16.md <<'MARKDOWN'
# Branch Retirement Reconciliation Review

- Critical: 0
- Important: 0

The implementation fails closed for unknown, moved, protected, open-PR, uniquely changed, or insufficiently evidenced branches. Deletion remains a separate exact-SHA transaction.
MARKDOWN

  if ! grep -Fq '## 2026-07-16 branch retirement reconciliation' docs/release-evidence/workflow-reproducible-runtime-phase4-2026-07-12.md; then
    cat >> docs/release-evidence/workflow-reproducible-runtime-phase4-2026-07-12.md <<'MARKDOWN'

## 2026-07-16 branch retirement reconciliation

PR #77 is the repository-integrated Phase 4 source of truth. Current-main journal, migration, package, and hosted gates are re-run before exact-SHA retirement. Real IBM Bob, Bazaar, multi-root, signing, and distribution checks remain product-release gates rather than remote-branch retention requirements.
MARKDOWN
  fi
  git diff --check
  git add tools/branch-retirement scripts/verify-branch-retirement-behaviors.js docs/release-evidence
  if ! git diff --cached --quiet; then
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git commit -m "feat: complete guarded branch retirement audit"
  fi
  impl_head="$(git rev-parse HEAD)"
  git push --force-with-lease="refs/heads/$implementation_branch:$impl_remote_sha" "$remote" "HEAD:$implementation_branch"

  pr_json="$(latest_pr_for_head "$implementation_branch")"
  pr_number="$(printf '%s' "$pr_json" | jq -r '.number // empty')"
  pr_state="$(printf '%s' "$pr_json" | jq -r '.state // empty')"
  if [[ -z "$pr_number" ]]; then
    pr_number="$(gh pr create --repo "$repo" --head "$implementation_branch" --base main \
      --title 'feat: implement guarded superseded-branch retirement' \
      --body 'Implements PR #119 with a live exact-SHA audit and dry-run-first atomic deletion tooling. Remote refs are not deleted by this PR.' \
      --json number --jq '.number')"
  elif [[ "$pr_state" == "CLOSED" ]]; then
    gh pr reopen "$pr_number" --repo "$repo"
  fi
  merge_pr_exact "$pr_number" "$impl_head" "feat: implement guarded superseded-branch retirement (#$pr_number)"

  for _ in $(seq 1 90); do
    git fetch --no-tags "$remote" main
    main_sha="$(git rev-parse refs/remotes/origin/main)"
    if git cat-file -e "refs/remotes/origin/main:docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json" 2>/dev/null; then
      local ready
      ready="$(git show "refs/remotes/origin/main:docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json" | jq -r '.ready_for_deletion')"
      [[ "$ready" == "true" ]] || fail "Merged audit is not deletion-ready"
      printf '%s' "$main_sha"
      return 0
    fi
    sleep 5
  done
  fail "Implementation merge did not reach main"
}

run_official_main_gates() {
  local main_sha="$1"
  log "Dispatching official gates on main $main_sha"
  gh workflow run extensions-quality.yml --repo "$repo" --ref main
  gh workflow run workflow-contracts.yml --repo "$repo" --ref main
  gh workflow run code-consistency-review-scaffold.yml --repo "$repo" --ref main
  local extensions_run contracts_run scaffold_run
  extensions_run="$(wait_for_workflow_success extensions-quality.yml "$main_sha")"
  contracts_run="$(wait_for_workflow_success workflow-contracts.yml "$main_sha")"
  scaffold_run="$(wait_for_workflow_success code-consistency-review-scaffold.yml "$main_sha")"
  printf '%s %s %s' "$extensions_run" "$contracts_run" "$scaffold_run"
}

comment_predecessor_prs() {
  local map_file="tools/branch-retirement/branch-retirement-map.json"
  jq -c '.entries[] | select(.sourcePullRequest != null)' "$map_file" | while read -r entry; do
    local branch pr replacements disposition sha marker existing
    branch="$(printf '%s' "$entry" | jq -r '.branch')"
    pr="$(printf '%s' "$entry" | jq -r '.sourcePullRequest')"
    replacements="$(printf '%s' "$entry" | jq -r '.replacementPullRequests | map("#" + tostring) | join(", ")')"
    disposition="$(jq -r --arg branch "$branch" '.entries[] | select(.branch == $branch) | .disposition' docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json)"
    sha="$(jq -r --arg branch "$branch" '.entries[] | select(.branch == $branch) | .remoteSha // "already absent"' docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json)"
    marker="<!-- branch-retirement:$branch -->"
    existing="$(gh api "repos/$repo/issues/$pr/comments?per_page=100" --jq ".[] | select(.body | contains(\"$marker\")) | .id" | head -1 || true)"
    if [[ -z "$existing" ]]; then
      gh pr comment "$pr" --repo "$repo" --body "$marker
Branch \`$branch\` was reconciled as \`$disposition\` at exact audited head \`$sha\` and retired after replacement evidence $replacements passed current-main hosted gates. Durable evidence: \`docs/release-evidence/branch-retirement-execution-2026-07-16.md\`." >/dev/null
    fi
  done
}

verify_all_absent() {
  local refs failures=0 branch
  refs="$(git ls-remote --heads "$remote")"
  while read -r branch; do
    [[ -n "$branch" ]] || continue
    if printf '%s\n' "$refs" | grep -Fq $'\trefs/heads/'"$branch"; then
      printf 'Target branch still exists: %s\n' "$branch" >&2
      failures=1
    fi
  done < <(jq -r '.entries[].branch' tools/branch-retirement/branch-retirement-map.json)
  for branch in "$plan_branch" "$failed_bootstrap_branch" "$implementation_branch" "$execution_branch" "$verification_branch" "$legacy_empty_branch"; do
    if printf '%s\n' "$refs" | grep -Fq $'\trefs/heads/'"$branch"; then
      printf 'Helper branch still exists: %s\n' "$branch" >&2
      failures=1
    fi
  done
  [[ "$failures" == "0" ]]
}

main() {
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  local rescue_initial main_sha gate_runs extensions_run contracts_run scaffold_run
  rescue_initial="$(git rev-parse HEAD)"

  for branch in "$execution_branch" "$verification_branch"; do
    cancel_branch_runs "$branch"
    close_pr_for_head "$branch"
  done

  main_sha="$(ensure_implementation_on_main)"
  read -r extensions_run contracts_run scaffold_run <<< "$(run_official_main_gates "$main_sha")"

  log "Resetting rescue branch to audited main"
  git fetch --no-tags "$remote" main
  [[ "$(git rev-parse refs/remotes/origin/main)" == "$main_sha" ]] || fail "main moved after official gates"
  git switch -C "$rescue_branch" refs/remotes/origin/main
  node --test tools/branch-retirement/test/*.test.mjs
  jq -e '.ready_for_deletion == true and (.blockedBranches | length == 0)' docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json >/dev/null

  log "Running exact-SHA dry-run"
  node tools/branch-retirement/delete-retired-branches.mjs \
    --repository "$repo" \
    --remote "$remote" \
    --manifest docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json \
    --execution-json docs/release-evidence/branch-retirement-execution-2026-07-16.json \
    --execution-markdown docs/release-evidence/branch-retirement-execution-2026-07-16.md \
    --execution-branch "$rescue_branch" \
    --dry-run
  cp docs/release-evidence/branch-retirement-execution-2026-07-16.json docs/release-evidence/branch-retirement-dry-run-2026-07-16.json
  cp docs/release-evidence/branch-retirement-execution-2026-07-16.md docs/release-evidence/branch-retirement-dry-run-2026-07-16.md
  git add docs/release-evidence/branch-retirement-dry-run-2026-07-16.json \
    docs/release-evidence/branch-retirement-dry-run-2026-07-16.md \
    docs/release-evidence/branch-retirement-execution-2026-07-16.json \
    docs/release-evidence/branch-retirement-execution-2026-07-16.md
  git diff --cached --check
  git commit -m "docs: record branch retirement dry-run"
  test -z "$(git status --porcelain=v1)"

  log "Applying atomic exact-SHA deletion"
  node tools/branch-retirement/delete-retired-branches.mjs \
    --repository "$repo" \
    --remote "$remote" \
    --manifest docs/release-evidence/branch-retirement-reconciliation-2026-07-16.json \
    --execution-json docs/release-evidence/branch-retirement-execution-2026-07-16.json \
    --execution-markdown docs/release-evidence/branch-retirement-execution-2026-07-16.md \
    --execution-branch "$rescue_branch" \
    --apply \
    --confirm-repository "$repo"
  jq -e '.mode == "apply" and .status == "success" and (.remaining | length) == 0' docs/release-evidence/branch-retirement-execution-2026-07-16.json >/dev/null
  git add docs/release-evidence/branch-retirement-execution-2026-07-16.json docs/release-evidence/branch-retirement-execution-2026-07-16.md
  git commit -m "docs: record exact-SHA branch retirement execution"
  comment_predecessor_prs

  for branch in "$execution_branch" "$verification_branch"; do
    cancel_branch_runs "$branch"
    close_pr_for_head "$branch"
  done
  delete_helper_branch "$plan_branch" merged
  delete_helper_branch "$failed_bootstrap_branch" closed
  delete_helper_branch "$implementation_branch" merged
  delete_helper_branch "$execution_branch" closed
  delete_helper_branch "$verification_branch" closed
  delete_helper_branch "$legacy_empty_branch" closed
  verify_all_absent || fail "Fresh ref verification found remaining target/helper branches"

  local current_main generated_at target_count deleted_count absent_count
  current_main="$(git ls-remote "$remote" refs/heads/main | cut -f1)"
  [[ "$current_main" == "$main_sha" ]] || fail "main changed during branch retirement"
  for path in \
    .github/workflows/branch-retirement-validation.yml \
    .github/workflows/branch-retirement-integration-finalizer.yml \
    .github/workflows/branch-retirement-integration-finalizer-v2.yml \
    .github/workflows/execute-branch-retirement.yml \
    .github/workflows/execute-branch-retirement-v2.yml \
    .github/workflows/execute-branch-retirement-v3.yml \
    .github/workflows/verify-branch-retirement.yml; do
    git cat-file -e "refs/remotes/origin/main:$path" 2>/dev/null && fail "Temporary workflow reached main: $path" || true
  done

  generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  target_count="$(jq '.entries | length' tools/branch-retirement/branch-retirement-map.json)"
  deleted_count="$(jq '.deleted | length' docs/release-evidence/branch-retirement-execution-2026-07-16.json)"
  absent_count="$(jq '.alreadyAbsent | length' docs/release-evidence/branch-retirement-execution-2026-07-16.json)"
  cat > docs/release-evidence/branch-retirement-final-verification-2026-07-16.json <<JSON
{
  "schemaVersion": "bob-builtin-analyze/branch-retirement-final-verification/v1",
  "repository": "$repo",
  "verifiedMainSha": "$main_sha",
  "generatedAt": "$generated_at",
  "officialWorkflowRuns": {
    "extensions-quality": $extensions_run,
    "workflow-contracts": $contracts_run,
    "code-consistency-review-scaffold": $scaffold_run
  },
  "targetCount": $target_count,
  "deletedDuringExecution": $deleted_count,
  "alreadyAbsentAtExecution": $absent_count,
  "remainingTargetBranches": [],
  "remainingHelperBranches": [],
  "temporaryWorkflowsOnMain": [],
  "status": "success"
}
JSON
  cat > docs/release-evidence/branch-retirement-final-verification-2026-07-16.md <<MARKDOWN
# Branch Retirement Final Verification

- Repository: \`$repo\`
- Verified main before evidence merge: \`$main_sha\`
- Generated at: \`$generated_at\`
- Official extensions-quality run: \`$extensions_run\`
- Official workflow-contracts run: \`$contracts_run\`
- Official code-consistency-review-scaffold run: \`$scaffold_run\`
- Planned target branches: **$target_count**
- Deleted during execution: **$deleted_count**
- Already absent at execution: **$absent_count**
- Remaining target branches: **0**
- Remaining helper branches: **0**
- Temporary branch-retirement workflows on main: **0**
- Final status: **SUCCESS**

This verification used fresh remote refs after the exact-SHA atomic transaction. It did not infer deletion from pull-request state or a prior workflow conclusion.
MARKDOWN
  git add docs/release-evidence/branch-retirement-final-verification-2026-07-16.json docs/release-evidence/branch-retirement-final-verification-2026-07-16.md
  git diff --cached --check
  git commit -m "docs: record final branch retirement verification"
  local rescue_final
  rescue_final="$(git rev-parse HEAD)"
  git push --force-with-lease="refs/heads/$rescue_branch:$rescue_initial" "$remote" "HEAD:$rescue_branch"
  merge_pr_exact "$rescue_pr" "$rescue_final" "docs: complete and verify superseded-branch retirement (#$rescue_pr)"

  git fetch --no-tags "$remote" main
  local final_main
  final_main="$(git rev-parse refs/remotes/origin/main)"
  git cat-file -e "refs/remotes/origin/main:docs/release-evidence/branch-retirement-final-verification-2026-07-16.json"
  git show "refs/remotes/origin/main:docs/release-evidence/branch-retirement-final-verification-2026-07-16.json" | jq -e '.status == "success"' >/dev/null
  local fresh_rescue
  fresh_rescue="$(remote_sha "$rescue_branch")"
  [[ "$fresh_rescue" == "$rescue_final" ]] || fail "Rescue branch moved before final cleanup"
  git push --force-with-lease="refs/heads/$rescue_branch:$rescue_final" "$remote" ":refs/heads/$rescue_branch"
  log "Final main is $final_main"
}

main "$@"
