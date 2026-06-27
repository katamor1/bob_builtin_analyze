---
name: validate
description: Orchestrates 4-phase validation for COBOL or PL/I to Java transformations. Calls validation tools in sequence, executes the prompts they inject into chat, and produces the required validation artifacts.
---

# Transformation Validation Skill

This skill guides validation of supported source-to-Java transformations in a structured, phase-by-phase manner.

It is designed for **complete transformation validation**, not manual source analysis. The validation tools provide the phase instructions, and the chat must execute those instructions to generate files, run steps, and produce the final results.

Use only these four visible workflow phases in the chat UI:

1. Data Preparation
2. Resource Mapping
3. JUnit Generation
4. Test Execution

Do not create additional visible phase names or subphase headings in the chat. If a tool returns detailed internal stages, execute them, but keep progress reporting at the four-phase level only.

## When to Use This Skill

Activate this skill when the user:

- asks to validate a COBOL or PL/I to Java transformation
- asks to verify converted Java behavior against source behavior
- requests JUnit generation or validation test generation for transformed Java
- asks to check whether transformed Java matches the source program
- asks to run `/validate`

Examples:

- `Validate LGACDB01.cbl against LGACDB01.java`
- `Run validation for this COBOL to Java transformation`
- `Generate validation tests for the transformed Java file`
- `Verify the PL/I to Java conversion`
- `/validate`

## When NOT to Use This Skill

Do **not** activate this skill when the user:

- asks to perform the transformation itself
- asks for general code review not tied to transformation validation
- asks for explanation only
- asks for validation of a non-Java target
- asks for validation of an unsupported source language

If the request is about transformation, explanation, or general review, use the appropriate workflow instead.

## Prerequisites

Before starting, ensure:

- the request is for **complete transformation validation**
- the source file path is known
- the Java target file path is known
- the source file is COBOL or PL/I
- the target file is Java
- you are prepared to create a TODO list before Phase 1

Do **not** read the source or target files for manual analysis before starting the validation workflow.

If the user did not provide paths, prompt:

```text
I need file paths to run validation.
1. sourceFile: full path to the COBOL or PL/I source
2. javaFile: full path to the transformed Java file
```

For interactive prompts, use the `BOB_TOOL_ASK_FOLLOWUP_QUESTION` tool instead of plain text questions.

## Workflow Overview

Run exactly these four tool-driven phases in order:

1. `data_preparation`
2. `resource_mapper`
3. `junit_generation`
4. `junit_execution`

Run this as a single continuous flow in the current task.

**Execution Method**: run each phase directly in sequence in `z-code` mode.

Single-flow model:

1. Start phase
2. Call the phase tool in the current flow
3. Execute the tool-returned prompt fully
4. Verify phase artifact exists
5. Pass artifact path to the next phase

Each tool may describe additional internal work. Execute that work, but do not surface it as extra workflow phases.

---

## Activation Rules

Use this skill only if the request is about validating transformation correctness for a supported source-to-Java conversion.

Use this skill if the request refers to:

- full validation of a transformed Java program
- source and target file comparison through the validation workflow
- generation of validation artifacts and test execution

Do not use this skill if the request refers to:

- manual analysis of source code correctness
- partial explanation of one section only
- a request to transform code instead of validate it

If this is not a validation request, stop using this skill.

---

## Setup Rules

Use the BOB_TOOL_UPDATE_TODO_LIST tool to create a TODO list immediately before any validation work.

Recommended TODO structure:

- [ ] Confirm this is a complete validation task
- [ ] Resolve source and Java target file paths
- [ ] Execute Data Preparation
- [ ] Execute Resource Mapping
- [ ] Execute JUnit Generation
- [ ] Execute Test Execution
- [ ] Validate output artifacts and report final status

**Critical Rule**:

- Do not skip TODO creation for a complete validation task.

If the user already provided both files:

- use them directly

If one or both files are missing:

- prompt for the missing path(s)
- wait for user response before continuing

Before Phase 1:

- ensure current mode is `z-code`
- if not, switch to `z-code`
- run phases inline in this workflow (single flow)
- if required inputs are present, start Phase 1 directly without extra confirmation prompts

---

## Execution Contract

### Follow-up Tool Rule (Mandatory)

When user input is required, use `BOB_TOOL_ASK_FOLLOWUP_QUESTION`.

- Do not ask plain-text follow-up questions when `BOB_TOOL_ASK_FOLLOWUP_QUESTION` is available.
- Prefer short prompts with explicit selectable options.
- Ask one decision at a time.

Use `BOB_TOOL_ASK_FOLLOWUP_QUESTION` for:

1. missing required file paths
2. retry/stop decisions after blockers
3. ambiguity that blocks the next phase

### Mandatory Phase Start Gate

At the start of each phase, follow this exact gate:

1. Confirm current mode is `z-code`
2. Confirm required input from prior phase is available
3. Call the phase tool in the current flow
4. Execute returned instructions completely
5. Verify expected artifact exists before continuing

If any gate check fails, stop and resolve the blocker before proceeding.

Default flow policy:

- auto-continue to the next phase after successful artifact verification
- ask follow-up questions only when an input is missing, a blocker occurs, or user confirmation is explicitly required

### Validation Tool Contract

The validation tools do **not** directly create the final artifacts themselves.

Instead, each validation tool:

- pushes a detailed prompt into chat context
- describes the required work for that phase
- specifies output file names or paths
- tells the chat what to generate, save, run, or validate

Your responsibility after each tool call is to:

1. read the tool-returned instructions
2. execute them completely using available chat capabilities
3. create the required files/artifacts
4. verify the artifact exists
5. pass the resulting artifact path to the next phase

## Phase 1: Data Preparation

Call `data_preparation` with:

- `sourceFile`: full path to the source COBOL or PL/I file

After the tool call:

- treat the returned prompt as mandatory phase instructions
- perform the generation work described by that prompt
- create the expected YAML output at the exact instructed path

Expected output:

- `{source}_io_testpoints.yaml`

Before proceeding:

- confirm the YAML file exists
- capture the output path for Phase 2
- do not start Phase 2 until Phase 1 output is verified

## Phase 2: Resource Mapping

Call `resource_mapper` with:

- `testPointsYaml`: Phase 1 output path
- `sourceFile`: full path to source file
- `javaFile`: full path to Java target file

After the tool call:

- treat the returned prompt as mandatory phase instructions
- perform the mapping work described by that prompt
- create the expected YAML output at the exact instructed path

Expected output:

- `{source}_resource_mapper.yaml`

Before proceeding:

- confirm the YAML file exists
- capture the output path for Phase 3
- do not start Phase 3 until Phase 2 output is verified

## Phase 3: JUnit Generation

Call `junit_generation` with:

- `resourceMapperYaml`: Phase 2 output path
- `javaFile`: full path to Java target file

After the tool call:

- treat the returned prompt as mandatory phase instructions
- generate the JUnit file and any associated required content
- save files to the exact instructed path(s)

Expected output:

- `{ClassName}Test.java`

Before proceeding:

- confirm the JUnit test file exists
- capture the output path for Phase 4
- do not start Phase 4 until Phase 3 output is verified

## Phase 4: Test Execution

Call `junit_execution` with:

- `junitTestFile`: Phase 3 output path

After the tool call:

- treat the returned prompt as mandatory phase instructions
- run the required test/build/execution steps described in the prompt
- create the final validation report artifact

Expected output:

- `validation_report.md`

Before completion:

- confirm the validation report exists
- capture the report path for final reporting

---

## Finalization

Before finishing, verify:

- all four phases were executed in order
- each validation tool was called with the correct parameter names
- each returned prompt was fully executed
- each expected artifact was created
- the final validation report exists and is readable

Provide:

1. overall status: PASS / FAIL / PARTIAL
2. output artifact paths for all completed phases
3. validation report path
4. high-level next step

---

## Tool Availability and Execution Diagnostics

If a phase reports that a validation tool is unavailable:

1. confirm current mode is `z-code`
2. confirm this is the `/validate` workflow context
3. confirm exact tool ID spelling
4. retry the tool call in the same workflow after fixing context
5. if tools still do not appear, stop and report the missing tool IDs

Expected validation tool IDs:

- `data_preparation`
- `resource_mapper`
- `junit_generation`
- `junit_execution`

### Follow-up Question Playbook

When a blocker occurs, ask one targeted question with clear options.

Use `BOB_TOOL_ASK_FOLLOWUP_QUESTION` for these interactions.

Examples:

```xml
<BOB_TOOL_ASK_FOLLOWUP_QUESTION>
<question>I could not find the expected Phase 2 artifact. What should I do next?</question>
<follow_up>
<suggest>Retry Phase 2 in this workflow</suggest>
<suggest>Stop and review Phase 2 output details</suggest>
<suggest>Abort validation</suggest>
</follow_up>
</BOB_TOOL_ASK_FOLLOWUP_QUESTION>
```

```xml
<BOB_TOOL_ASK_FOLLOWUP_QUESTION>
<question>The phase tool is unavailable in this context. Choose next step.</question>
<follow_up>
<suggest>Retry tool call after context check</suggest>
<suggest>Stop and report missing tool diagnostics</suggest>
</follow_up>
</BOB_TOOL_ASK_FOLLOWUP_QUESTION>
```

Missing input example:

```xml
<BOB_TOOL_ASK_FOLLOWUP_QUESTION>
<question>I need both file paths to continue validation. Which input would you like to provide now?</question>
<follow_up>
<suggest>Provide sourceFile path</suggest>
<suggest>Provide javaFile path</suggest>
<suggest>Provide both paths</suggest>
</follow_up>
</BOB_TOOL_ASK_FOLLOWUP_QUESTION>
```

## Failure Rules

Stop the workflow if:

- a tool call fails
- a returned prompt cannot be executed
- an expected artifact is not created
- a required path from a previous phase is missing

Do not continue to later phases after a failure.

If failure cause is transient context/tooling state:

1. restart the same phase in the current workflow
2. do not advance phase index until the phase succeeds

## Progress Reporting Template

After each phase, report:

```text
Phase {N} complete: {Phase Name}
- Output: {output_file_path}
- Verification: required artifact created
- Next: Phase {N+1} - {Next Phase Name}
```

Communication style for progress updates:

- keep updates short (2-4 lines)
- state phase status first
- include exact artifact path
- ask a follow-up question only when blocked or when required input is missing
- when asking follow-up, use `BOB_TOOL_ASK_FOLLOWUP_QUESTION`

Do not print extra headings such as `Step 3.2.1`, `PHASE 1: Resource Discovery`, or any other subphase labels in the user-visible progress.

## Best Practices

1. **Always execute the returned prompt** - A validation tool call alone does not complete the phase.
2. **Use exact parameter names** - Do not rename tool parameters.
3. **Use exact output paths** - If a prompt gives a path, save to that exact path.
4. **Verify artifacts between phases** - Never assume a file exists.
5. **Run phases in strict order** - Complete each phase before starting the next.
6. **Stop on blocker** - Ask a targeted follow-up and resume only after resolution.

## Summary

This skill orchestrates validation by running four phase-specific tool calls in sequence within one continuous workflow. Each phase calls one validation tool, executes returned instructions fully, verifies its artifact, and passes outputs to the next phase. Successful validation requires strict phase order, exact tool IDs, exact parameter names, artifact verification, and final report generation.
