---
name: explain
description: Explains complete Z source files (COBOL, PL/I, HLASM, JCL, REXX) in a simple, clear manner. Use when user asks to 'explain [filename]', 'what does [program] do', 'help me understand [file]', or 'explain this COBOL/JCL/assembler program'. For whole-file explanations only, not code snippets or sections.
---

# Whole File Explanation Skill

This skill guides you through explaining a complete source file or job in a structured, mode-specific way.

It is designed for **whole-file explanations**, not snippets.

**Mode-Specific Behavior**:

- **Z Architect Mode**: Provides architectural explanations focused on system design, component interactions, and integration points
- **Z Code Mode**: Provides developer-focused explanations with implementation details, code structure, and technical operations

## When to Use This Skill

Activate this skill when the user:

- asks to explain a complete source file
- asks what a full program, module, script, or job does
- provides a source file path and requests an explanation

Examples:

- `Explain LGACDB01.cbl`
- `Explain programname.asm`
- `Explain programname.jcl`
- `Explain programname.rexx`
- `Explain what nightly-job.jcl does`
- `Generate an explanation for customer-module.asm`
- `Help me understand what my-macro.mac does`

## When NOT to Use This Skill

Do **not** activate this skill when the user:

- Asks about code snippets, line ranges, or specific sections such as:
  - For **COBOL**, do not use this skill for: paragraphs, sections, PERFORM blocks, IF/EVALUATE statements, file I/O operations, WORKING-STORAGE declarations, CICS/SQL command blocks, COPY statements, or line ranges (e.g., [`program.cbl:100-150`](program.cbl:100))
    - Examples:
      - `Explain the CALCULATE-TOTAL paragraph`
      - `What does this CICS READ command do`
  - For **PL/I**, do not use this skill for: procedures, functions, DO loops, IF/SELECT statements, file I/O operations, DECLARE blocks, ON-unit handlers, structure declarations, or line ranges (e.g., [`program.pli:45-65`](program.pli:45))
    - Examples:
      - `Explain the CALCULATE_TAX procedure`
      - `What does this DO loop do`
  - For **HLASM/Assembler**, do not use this skill for: subroutines, CSECTs, macros, register sequences, data definition blocks, USING statements, branch tables, DSECTs, or line ranges (e.g., [`module.asm:200-250`](module.asm:200))
    - Examples:
      - `Explain this macro`
      - `What does this register sequence do`
  - For **JCL**, do not use this skill for: JOB cards, EXEC steps, DD statements, PROC definitions, IF-THEN-ELSE blocks, COND parameters, SYSIN data, utility control statements, or line ranges (e.g., [`job.jcl:20-35`](job.jcl:20))
    - Examples:
      - `Explain this EXEC step`
      - `What do these DD statements do`
  - For **REXX**, do not use this skill for: subroutines, functions, DO loops, SELECT statements, IF-THEN-ELSE blocks, PARSE statements, EXECIO commands, TSO/ISPF service calls, error handlers, or line ranges (e.g., [`script.rexx:75-100`](script.rexx:75))
    - Examples:
      - `Explain this DO loop`
      - `What does this PARSE statement do`

- Requests code transformation or validation rather than explanation

**If the request is for a snippet:** Explain it directly without using this skill.

## Prerequisites

Before starting, ensure:

- the request is for a **complete file** (not a snippet or section)
- the file to explain is known or can be identified
- you have access to the workspace directory
- you are prepared to create a TODO list before analysis

## Complete Workflow Overview

### Workflow Phases

1. **Phase 1: Scope Confirmation** - Confirm this is a whole-file explanation task
2. **Phase 2: Initial Setup** - Use the BOB_TOOL_UPDATE_TODO_LIST tool to create a TODO list, resolve the file, identify the language
3. **Phase 3: Explanation Generation** - Generate the explanation

### Explanation Path

- Provides a high-level overview of the program's purpose
- For COBOL and PL/I files: uses the `data-dictionary-management` skill to ensure data dictionary context is available before generating the explanation

---

## Phase 1: Scope Confirmation

**Purpose**: Ensure this skill is only used for full-file explanation tasks.

### Step 1.1: Determine Explanation Scope

Check whether the user is asking for:

- a complete file explanation, or
- only a snippet / section explanation

**Use this skill if the request refers to:**

- a complete `.cbl`, `.pli`, `.asm`, `.jcl`, `.rexx`, or other z/OS language extension file
- a full source file path
- a complete program or job by name

**Do NOT use this skill if the request refers to:**

- Specific sections, paragraphs, procedures, or labels
- Selected line ranges (e.g., [`program.cbl:100-150`](program.cbl:100))
- Individual statements or control blocks
- Pasted code snippets

**If this is not a full-file explanation**:

- stop using this skill
- provide a direct explanation of the snippet instead

---

## Phase 2: Initial Setup

**Purpose**: Prepare the task structure and determine the source file and language.

### Step 2.1: Create TODO List with BOB_TOOL_UPDATE_TODO_LIST

Use the BOB_TOOL_UPDATE_TODO_LIST tool to create a TODO list immediately before performing any detailed analysis.

Recommended TODO structure:

- [ ] Confirm this is a full-file explanation
- [ ] Detect current mode (Z Architect or Z Code)
- [ ] Resolve the file path and language
- [ ] **MANDATORY: For COBOL and PL/I files** - Invoke `data-dictionary-management` skill to ensure data dictionary is present and current before reading the source file
- [ ] **MANDATORY: For COBOL with MQ** - Scan for MQ keywords, if found call `tool_hint_mq`
- [ ] **MANDATORY: For HLASM** - Scan for z/TPF macros, if found call `tool_hint_ztpf_macro`
- [ ] Generate mode-specific explanation (architectural or developer-focused)
- [ ] Include Mermaid diagram visualization (Program Flow or Job Flow)

**Critical Rule**:

- Do not skip TODO creation for a whole-file explanation task

### Step 2.2: Resolve File to Explain

**If the user already provided a file**:

- use that file directly

**If no file was provided**:

Prompt user:

```text
Which file would you like me to explain?
```

Wait for the user to respond before continuing.

### Step 2.3: Identify the Language

Determine whether the file is:

- COBOL
- PL/I
- Assembler (HLASM)
- JCL
- REXX

This controls which sub-steps are required later.

#### For COBOL and PL/I Files

**MANDATORY**: Before reading the source file, invoke the `data-dictionary-management` skill. This skill will:

1. Check whether a data dictionary (`bobz/DD.json`) exists for the program
2. If it does not exist or is out of date, guide the user through creating or updating it
3. Once the data dictionary is ready, read both the source file and `bobz/DD.json` together in the same `BOB_TOOL_READ_FILE` call

**Do NOT** skip this step or treat it as optional. The data dictionary provides essential semantic context (variable meanings, business terms, data scope) that is required for accurate, business-relevant explanations of COBOL and PL/I programs. An explanation produced without the data dictionary will lack business context and may misrepresent variable purposes.

**If the user has previously declined data dictionary creation** (file appears in `data_dictionary_skip_files` in `.bobz/local-settings.json`), skip the creation prompt and read only the source file — but note in the explanation that variable context is limited.

#### For COBOL Files with IBM MQ Operations

When explaining COBOL files that contain IBM MQ operations, use the `tool_hint_mq` tool to get authoritative IBM MQ documentation.

**Tool**: `tool_hint_mq`

**Parameter**: `mqKeywords` (array of strings)

**When to use** (MANDATORY):

- **ALWAYS** scan COBOL source files for IBM MQ keywords
- If you find ANY MQ keywords (MQCNO-\*, MQOO-\*, MQGMO-\*, MQPMO-\*, MQCO-\*, etc.), you **MUST** call this tool
- The tool recognizes **135+ IBM MQ operation keywords** defined in [`packages/explain/src/hints/explain-cobol.hint.ts`](../../../packages/explain/src/hints/explain-cobol.hint.ts)

**Usage**:

1. Read the COBOL source file
2. Scan and collect ALL MQ keywords
3. Call `tool_hint_mq` with detected keywords: `{"mqKeywords": ["MQCNO-NONE", "MQOO-INPUT-SHARED", "MQGMO-WAIT"]}`
4. Incorporate the authoritative MQ descriptions into your explanation

#### For HLASM Files with z/TPF Macros

When explaining HLASM files that contain z/TPF macros, use the `tool_hint_ztpf_macro` tool to get authoritative z/TPF macro documentation.

**Tool**: `tool_hint_ztpf_macro`

**Parameter**: `macroKeywords` (array of strings)

**When to use** (MANDATORY):

- **ALWAYS** scan HLASM source files for z/TPF macro calls
- If you find ANY z/TPF macros (ENTRC, BACKC, CALLC, FINDC, GETCC, ALASC, DBOPN, etc.), you **MUST** call this tool
- The tool recognizes **270+ z/TPF macro keywords** defined in [`packages/explain/src/hints/explain-hlasm.hint.ts`](../../../packages/explain/src/hints/explain-hlasm.hint.ts)

**Usage**:

1. Read the HLASM source file
2. Scan and collect ALL z/TPF macro invocations
3. Call `tool_hint_ztpf_macro` with detected macros: `{"macroKeywords": ["ENTRC", "BACKC", "FINDC", "GETCC"]}`
4. Incorporate the authoritative macro descriptions into your explanation

---

## Phase 3: Mode-Specific Explanation

**Purpose**: Provide an explanation tailored to the current mode context.

Read the source file and generate an explanation appropriate for the user's current mode.

### When in Z Architect Mode

Provide an **architectural explanation** that focuses on:

- **System Design Perspective**: How this program fits into the larger system architecture
- **Component Interactions**: How it interacts with other programs, files, databases, or services
- **Data Flow**: High-level view of data movement through the program
- **Business Purpose**: What business function or process this program supports
- **Integration Points**: External dependencies, APIs, database tables, files accessed
- **Architectural Patterns**: Design patterns or architectural approaches used
- **Impact Scope**: Which parts of the system would be affected if this program changed

**Guidelines for Architect Mode**:

- Focus on "what" and "why" rather than "how"
- Emphasize system-level concerns and integration points
- Highlight dependencies and relationships with other components
- Use business terminology where data dictionary provides context
- Keep technical implementation details minimal
- Ideal for understanding system structure and planning changes

### When in Z Code Mode

Provide a **developer-focused explanation** that focuses on:

- **Primary Purpose**: What the program does and why it exists
- **Code Structure**: Key sections, divisions, procedures, and their organization
- **Implementation Details**: Important algorithms, logic flows, and processing patterns
- **Data Structures**: Key variables, records, tables, and their purposes (using data dictionary context when available)
- **Control Flow**: How the program processes data from start to finish
- **Technical Operations**: File I/O, database operations, calculations, transformations
- **Error Handling**: How the program handles exceptions and edge cases
- **Code-Level Insights**: Noteworthy implementation techniques or patterns
- **Screen Handling**: How the program handles each PF Key or AID Key

**Guidelines for Code Mode**:

- Focus on "how" the code works
- Provide implementation-level details
- Explain key code sections and their logic
- Reference specific variables, procedures, and code constructs
- Include technical terminology and code-specific context
- Ideal for developers who need to understand, modify, or maintain the code

### Mode Detection

- Check the current mode context from the conversation
- Default to **Code Mode** explanation style if mode is not explicitly specified
- Adjust explanation depth and focus based on detected mode

### Mermaid Diagram Visualization

**For all whole-file explanations, include a Program/Job Flow visualization using Mermaid diagrams.**

Generate a **single Mermaid diagram** using `flowchart TD` notation that represents the program's execution flow.

#### Diagram Requirements by Mode

**Z Architect Mode** - Focus on architectural and system-level flow:

- Use **architecturally meaningful labels** that describe system roles and integration points
- Focus on how the program fits into the overall system architecture
- Emphasize component interactions, dependencies, and integration patterns
- Avoid low-level implementation details or statement-level references
- Examples of good labels: "Initialize transaction context", "Coordinate DB2 access", "Handle integration failure"

**Z Code Mode** - Focus on technical and developer-oriented flow:

- Use **clear, descriptive, developer-friendly labels** that explain technical actions
- Include more detail than business-level view but less than line-by-line trace
- Reference concrete technical operations and middleware interactions
- Do not collapse multiple major processing steps into a single node
- Examples of good labels: "Read input VSAM record", "Execute DB2 update", "Handle SQL error"

#### Common Diagram Elements (Both Modes)

The diagram should illustrate:

- Program/Job entry and initialization
- Main processing sequence and control flow
- Conditional branching and decision points
- Interactions with databases, files, middleware, or external resources
- Error handling and exceptional paths
- Normal and abnormal termination points

#### Language-Specific Diagram Guidelines

**COBOL Programs**:

- **Z Architect Mode**: Focus on business purpose, component interactions, data flow, and integration points
- **Z Code Mode**: Include divisions/sections structure, conditional logic (IF/EVALUATE), middleware/database interactions, error handling

**PL/I Programs**:

- **Z Architect Mode**: Describe role in system architecture, coordination with middleware (CICS, DB2, IMS), integration dependencies
- **Z Code Mode**: Show internal procedures, data handling flow, middleware interactions, error recovery logic

**HLASM Programs**:

- **Z Architect Mode**: Emphasize role (batch step, exit, utility), subsystem dependencies (CICS, DB2, IMS, MQ, OS services), integration patterns
- **Z Code Mode**: Detail processing phases, control transfers/branches, OS service interactions, return code handling

**JCL Jobs**:

- **Z Architect Mode**: Map job's role in batch architecture, system workflow, upstream/downstream dependencies
- **Z Code Mode**: Show ordered EXEC steps, conditional execution (COND/IF logic), dataset interactions, utility processing, step failures

**REXX Programs**:

- **Z Architect Mode**: Describe role in enterprise architecture, coordination with system environment, architectural dependencies
- **Z Code Mode**: Show logical processing sequence, conditional logic (IF/SELECT), dataset/command interactions, error handling

#### Diagram Styling Requirements

**All diagrams must use a pastel color palette:**

- Define explicit `classDef` styles with fill, stroke, and black text (`color:#000`)
- Assign a class to every node
- Do not allow default or dark colors

Example styling:

```mermaid
classDef initStyle fill:#E8F4F8,stroke:#4A90A4,color:#000
classDef processStyle fill:#FFF4E6,stroke:#D4A574,color:#000
classDef decisionStyle fill:#F0E6FF,stroke:#9B7EBF,color:#000
classDef errorStyle fill:#FFE6E6,stroke:#C77777,color:#000
```

#### Important Notes

- Generate **only one diagram** per explanation
- Do not include any other diagrams beyond the Program/Job Flow
- The diagram should help readers understand runtime behavior without requiring detailed code review
- Tailor diagram detail level to the current mode (architect vs. developer focus)

### General Guidelines (Both Modes)

- Keep explanation clear and well-organized
- Use markdown formatting for readability
- Include code examples or references where helpful
- If data dictionary is available, use variable descriptions for context
- **For COBOL with MQ operations**: Use `tool_hint_mq` to get authoritative IBM MQ documentation (see Phase 2, Step 2.3)
- **For HLASM with z/TPF macros**: Use `tool_hint_ztpf_macro` to get authoritative z/TPF macro documentation (see Phase 2, Step 2.3)
- **Always include a Mermaid diagram** as specified above
- No need for expanded source or deep dependency analysis
- Complete the task and mark all TODOs as complete

### Sections to Omit (Both Modes)

Do **not** add trailing sections that collect and re-present information already covered elsewhere in the explanation. Each section must introduce something new; if its content is drawn entirely from earlier sections, omit it. This applies to both Z Architect and Z Code modes.

The following sections must not be included:

- **Any section that steps back to interpret, label, or reframe what the explanation has already shown** — such as a "mental model" of the algorithm, a call-out of which details are "important", or a reflection on the program's "architectural significance" — when the code walkthrough has already communicated all of that directly. The same content has already been covered; repeating it under a different heading adds length without new information.

- **A section that extracts items already explained inline** — such as listing key variables or key paragraphs — when those items were already described in context during the code walkthrough. Each item belongs where it was first encountered; pulling them out into a separate list only duplicates what is already there.

- **A closing summary that expands into a full step-by-step re-trace** of the processing flow at the same level of detail as the walkthrough. A short closing sentence or two that captures the program's overall purpose is fine; expanding it into a detailed walkthrough recap is not.

- **Maintenance notes / maintenance history** — repeats change-control context already implied by the code structure.

- **Potential issues & considerations** — repeats risks or edge cases already described in the relevant processing sections.

- **Usage scenarios** — repeats the program's purpose already stated in the overview.

- **Developer notes** — repeats implementation detail already covered in the code walkthrough.

- **Testing considerations** — out of scope for an explanation; repeats logic already described.

- **Performance considerations** — repeats data-access or algorithmic observations already made inline.

**Rule of thumb**: every section must earn its place by containing information not present anywhere else in the explanation. If a section only collects, rephrases, or summarises content from earlier sections, remove it entirely.

---

## AGENTS.md Enforcement

This skill does **not** require AGENTS.md updates by default.

**Update AGENTS.md only when**:

- the repository introduces a project-specific rule requiring explain-workflow documentation there
- the user explicitly asks for AGENTS.md updates

---

## Common Scenarios

### Scenario 1: COBOL Program in Z Architect Mode

1. Create TODO list
2. Resolve the file path
3. Read the COBOL source file (and data dictionary if available)
4. If MQ keywords found, call `tool_hint_mq` with detected keywords
5. Generate architectural explanation focusing on:
   - Business purpose and system role
   - Component interactions and dependencies
   - Data flow and integration points
   - Impact scope for potential changes
6. Include Mermaid Program Flow diagram with architecturally meaningful labels

### Scenario 2: COBOL Program in Z Code Mode

1. Create TODO list
2. Resolve the file path
3. Read the COBOL source file (and data dictionary if available)
4. If MQ keywords found, call `tool_hint_mq` with detected keywords
5. Generate developer-focused explanation covering:
   - Code structure (divisions, sections, paragraphs)
   - Key variables and data structures
   - Processing logic and control flow
   - File operations and database interactions
6. Include Mermaid Program Flow diagram with developer-friendly technical labels

### Scenario 3: PL/I Program in Z Architect Mode

1. Create TODO list
2. Resolve the PL/I file path
3. Read the PL/I source (and data dictionary if available)
4. Generate architectural overview of system integration
5. Include Mermaid Program Flow diagram emphasizing middleware coordination

### Scenario 4: PL/I Program in Z Code Mode

1. Create TODO list
2. Resolve the PL/I file path
3. Read the PL/I source (and data dictionary if available)
4. Generate implementation-focused explanation of code logic
5. Include Mermaid Program Flow diagram with detailed technical steps

### Scenario 5: JCL Job (Any Mode)

1. Create TODO list
2. Resolve the JCL file path
3. Read the JCL source
4. Generate explanation appropriate to mode:
   - **Architect Mode**: Job purpose, system workflow, dependencies
   - **Code Mode**: Job steps, DD statements, program execution sequence
5. Include Mermaid Job Flow diagram (architectural or technical based on mode)

### Scenario 6: REXX Program (Any Mode)

1. Create TODO list
2. Resolve the file path
3. Read the REXX source
4. Generate mode-appropriate explanation:
   - **Architect Mode**: System role and integration context
   - **Code Mode**: Implementation details and code structure
5. Include Mermaid Program Flow diagram tailored to current mode

### Scenario 7: HLASM Program in Z Architect Mode

1. Create TODO list
2. Resolve the file path
3. Read the HLASM source
4. If z/TPF macros found, call `tool_hint_ztpf_macro` with detected macros
5. Generate architectural explanation focusing on:
   - System-level assembly routines and their purpose
   - Integration with other programs or system services
   - Data structures and storage layouts (high-level)
6. Include Mermaid Program Flow diagram with architectural focus on subsystem interactions

### Scenario 8: HLASM Program in Z Code Mode

1. Create TODO list
2. Resolve the file path
3. Read the HLASM source
4. If z/TPF macros found, call `tool_hint_ztpf_macro` with detected macros
5. Generate developer-focused explanation covering:
   - Instruction sequences and register usage
   - Macro definitions and expanded macro code
   - Storage management and addressing modes
   - Implementation-level assembly techniques
6. Include Mermaid Program Flow diagram showing detailed processing phases and control flow

---

## Troubleshooting

### Issue: The request was actually for a snippet

**Cause**: this skill was activated for a non-whole-file request.

**Solution**:

- stop using this skill
- explain the snippet directly
- do not run the whole-file workflow

---

## Best Practices

### For Optimal Results

**Confirm whole-file scope first** - Avoid activating this skill for snippets or partial code requests.

### For Efficiency

**Keep the original source path stable** - Use the same file path consistently across the workflow.

### For Quality

**Do not guess beyond the code** - Mark assumptions clearly when evidence is weak.

---

## Summary

This skill ensures consistent whole-file explanation behavior.
By following this skill, you can produce consistent, high-quality, repository-compliant whole-file explanations across supported Z languages.
