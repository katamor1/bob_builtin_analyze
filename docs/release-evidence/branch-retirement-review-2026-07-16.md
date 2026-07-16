# Branch Retirement Whole-Diff Review

- Repository: `katamor1/bob_builtin_analyze`
- Execution PR: #120
- Workflow run: `29494601324`
- Workflow job: `87608478763`
- Audited `main`: `d912e4edbc969bfae961ca7e8fbef92ace93d798`
- Deleted branches: 13
- Already absent: 2

## Findings

| Severity | Open count |
| --- | ---: |
| Critical | 0 |
| Important | 0 |

## Review findings addressed

The first automated review identified that a write-capable deletion workflow checked out a mutable branch name. Before the successful run, checkout was changed to `github.event.pull_request.head.sha`, the exact event SHA was verified, and the local execution branch was bound to that immutable commit before any audit or deletion step.

A final whole-diff review identified that an already-absent branch was classified before checking its replacement PR and required current-main paths. A failing regression was added, then `evaluateRetirementEntry()` was changed so replacement and path evidence is verified even when the remote ref is already absent.

Final focused verification after that hardening:

```text
node --test tools/branch-retirement/test/*.test.mjs
# tests 11
# pass 11
# fail 0

node --check tools/branch-retirement/audit-branch-retirement.mjs
node --check tools/branch-retirement/delete-retired-branches.mjs
```

The tested local blobs matched the final GitHub blobs for the two modified files:

- `retirementPolicy.mjs`: `49818d1ca0f0244df7e7b2b224897ec669a4a60a`
- `retirementPolicy.test.mjs`: `c9eb1b565b193b65a50029462f79d056607a44db`

The temporary workflow and encoded staging payload are not deliverables and are removed from the final PR diff.

## Safety review

- Replacement pull requests were required to be merged, including for already-absent refs.
- Current `main` had to contain each replacement's required paths.
- Diagnostic and mutation helper paths had to be absent from `main`.
- Open PR heads/bases and protected targets were excluded.
- Every present target had to equal its reviewed exact SHA.
- The batch used one atomic push and one force-with-lease per ref.
- No branch prefix, glob, sequential fallback, or best-effort deletion was used.
- `main` was explicitly excluded and retained the same SHA before and after deletion.
- Post-execution GitHub connector lookups independently confirmed all target refs were absent.

## Decision

The reconciliation, implementation, atomic deletion, final policy hardening, and durable evidence are repository-complete. The execution PR may be squash-merged after its temporary workflow and staging payload are absent and the final diff is rechecked.
