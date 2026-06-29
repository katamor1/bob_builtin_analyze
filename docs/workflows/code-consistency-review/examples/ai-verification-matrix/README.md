# ai-verification-matrix E2E sample

This sample is for real AI verification of `bob-code-consistency-review`.
It is intentionally larger than `simple-timeout-bugfix` and covers expected
OK, NG, N/A, and follow-up question cases in one review package.

## Layout

```text
ai-verification-matrix/
  README.md
  expected-outcomes.yaml
  bob-output.expected.sample.yaml
  fixtures/
    workspace-common/
      review-input.yaml
      docs/
        requirements-ai-matrix.md
        basic-design-ai-matrix.md
        detailed-design-ai-matrix.md
        test-spec-ai-matrix.md
        error-ledger-ai-matrix.md
        tickets-ai-matrix.md
    baseline/
      src/
      tests/
    head/
      src/
```

The launcher builds a temporary Git repository from these fixture folders:

1. Copy `workspace-common/` and `baseline/`.
2. Commit the baseline on `main`.
3. Switch to `feature/ai-verification-matrix`.
4. Overlay `head/`.
5. Commit the review target.

The review input uses `main..feature/ai-verification-matrix`, so the extension
collects a real Git diff rather than a synthetic diff fixture.

## Expected case matrix

| Outcome | Scenario |
| --- | --- |
| OK | `Payment_CalculateLimit` changes the premium limit to `250`, matching requirement, design, and test spec. |
| NG | `Payment_HandleTimeout` returns `ERR_OK` on timeout, conflicting with requirement, design, and ledger. |
| NG | `Payment_AssessFraudScore` uses threshold `90` while design requires `80`, and the test spec has no fraud case. |
| NG | `Payment_UpdateRealtimeCache` adds `printf` in an RT path. |
| N/A | Performance measurement and dashboard UI labels are declared out of scope. |
| Question | Ticket `TICKET-AI-105` says the fraud threshold decision is pending. |

## Manual real-AI smoke

Package the three companion extensions first:

```powershell
cd extensions\workflow-register
npm.cmd run package
cd ..\bob-bazaar-review
npm.cmd run package
cd ..\bob-code-consistency-review
npm.cmd run package
```

Create and launch the isolated Bob workspace:

```powershell
cd C:\Users\stell\source\repos\bob_builtin_analyze
.\docs\workflows\code-consistency-review\integration\launch-bob-code-consistency-sandbox.ps1 -Sample ai-verification-matrix
```

For a dry run that only creates the workspace and prints the launch command:

```powershell
.\docs\workflows\code-consistency-review\integration\launch-bob-code-consistency-sandbox.ps1 -Sample ai-verification-matrix -NoLaunch
```

In Bob, run the `code-consistency-review` workflow. The AI step should produce
YAML only, with `final_approval: not_performed`. The output is expected to be
schema-valid and evidence-backed, but wording and ordering may vary.

## Deterministic checks without real AI

`bob-output.expected.sample.yaml` is a representative output for validating the
capture/validate/triage path without calling real AI. It is not a golden file
for exact model wording.
