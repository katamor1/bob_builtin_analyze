# Branch retirement main-guard deviation

## Decision

The repository default branch is `main`, but GitHub reported it as unprotected during the live retirement audit. The original plan therefore stopped before any ref deletion. The connected GitHub app and pull-request `GITHUB_TOKEN` do not expose branch-protection mutation, so the implementation keeps protected-main behavior as the default and adds a narrower, explicit alternative for this repository.

## Explicit exact-SHA guard

The unprotected-main path is disabled unless both audit and deletion commands receive `--allow-unprotected-main-with-exact-sha-guard`. Even with that flag, execution requires all of the following:

- GitHub reports the default branch as exactly `main`.
- Branch-protection enumeration completed successfully and reports `main` as unprotected.
- The audit records the exact live `main` SHA in the signed-off manifest.
- The deletion preflight fetches `main`, requires the audited SHA to remain an ancestor, and requires the remote `main` SHA to equal the fresh preflight SHA.
- `main`, protected refs, open-PR refs, and the execution branch are excluded from the deletion allowlist.
- Every target ref uses its audited SHA in `--force-with-lease`.
- All target deletions are submitted through one `git push --atomic`; no sequential fallback is allowed.
- Post-verification requires the default branch still to be `main`, every target to be absent, and the `main` SHA to be unchanged during deletion.

## Fail-closed behavior

Without the explicit flag, an unprotected `main` remains a hard error. A changed protection state, default branch, target SHA, open PR reference, or `main` SHA requires a fresh audit. No deletion occurred before this deviation was documented and tested.
