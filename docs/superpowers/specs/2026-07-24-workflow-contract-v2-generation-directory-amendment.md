# Workflow Contract v2 Generation Directory Encoding Amendment

**Status:** Normative correction adopted by P2 implementation review on 2026-07-24.

**Amends:** `2026-07-17-workflow-contract-v2-design.md`, sections 5, 7, 8, 19, and 21 only where they describe the physical published-generation directory name.

## Problem

The canonical generation identifier and package digest are evidence strings of the form:

```text
sha256:<64 lowercase hexadecimal characters>
```

The original layout notation used that evidence string literally as the directory name under `versions/`. A colon is not permitted in Windows file or directory names, so the literal representation cannot satisfy the approved Windows/POSIX parity requirement.

## Normative correction

The canonical generation identifier remains unchanged everywhere it is data or evidence:

- `current.json.generation`;
- `current.json.packageDigest`;
- `RawWorkflowPackage.generation` and `packageDigest`;
- lock, plan, manifest, run provenance, resume evidence, diagnostics, and comparisons.

A published generation uses this one-to-one physical directory encoding:

```text
canonical: sha256:<64hex>
physical:  sha256-<64hex>
```

The slot layout is therefore physically:

```text
.bob/workflows/<workflow-id>/
├── current.json
└── versions/
    └── sha256-<64hex>/
        ├── workflow.yaml
        ├── workflow.lock.json
        ├── prompts/
        └── schemas/
```

The physical name is not public evidence and is never copied into a pointer, lock, plan, manifest, or run record. Code must derive it only from an already validated canonical digest through the shared `workflowPackageGenerationDirectoryName()` boundary. Callers must not accept a caller-supplied physical generation name or infer canonical evidence from an arbitrary directory name.

Staging names and ownership layout are unchanged:

```text
versions/.staging-<nonce>/owner.json
versions/.staging-<nonce>/package/
```

## Ownership

- P2 owns the canonical-digest-to-physical-segment mapping and published-generation loading.
- A1/A2 and the one-time C2 migration tooling must use the same shared mapping when publishing or locating a generation.
- P3/P4/P5/R1/R6 and all persisted evidence continue to use only the canonical `sha256:<64hex>` identifier.
- Cross-OS tests must prove that no canonical digest punctuation enters a physical path segment and that Windows and POSIX produce identical canonical evidence.

This amendment supersedes only the earlier statement that the physical directory name is literally equal to the canonical digest string. All digest equality, immutability, containment, snapshot, and fail-closed requirements remain unchanged.
