# IBM Bob Premium Package for Z

## Introduction

IBM Bob Premium Package for Z delivers agents designed to help you analyze, explain, and develop your mainframe applications with greater efficiency and confidence.

For more information on available capabilities, see the [**IBM Bob Premium Package for Z Overview**](https://bob.ibm.com/docs/ide/premium-packages/bob-for-z/bob-for-z-index).

## Key features

- Modes to support planning and implementation of changes across your mainframe applications.
- Workflows to guide you through complex mainframe tasks.
- Generate code and code explanations for COBOL, JCL, PL/I, REXX, and Assembler programs.
- Generate documentation for COBOL, PL/I, and Assembler programs (supports up to 100 programs per run via file or folder selection).
- Explanation types generate tailored explanations of Z code for architecture, development, and business users.
  - Architect: Learn how the program fits within the application at a high level, with focus on structure, data flows, system interactions, and integration patterns.
  - Developer: Learn the logic behind the program, with focus on logic flow, data structures, algorithmic implementations, and performance considerations.
  - Business: Learn the value of the program to the business, with focus on business decisions and business processes.
- Automated data dictionary generation to interpret cryptic Z naming conventions and enrich code understanding.
- Extract business logic from a COBOL program to generate a COBOL service program.

## Modes

IBM Premium Package for Z offers Z-centric modes that build on your IBM Bob experience to optimize your mainframe development workflows. Modes are optimized for different tasks and collaborate to ensure a streamlined experience. IBM Bob Premium Package for Z includes the following specialized modes:

| Mode          | Description                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `z-architect` | Conduct implementation planning, impact analysis, understand system design, and generate technical documentation |
| `z-code`      | Explain, change, and modernize your mainframe applications                                                       |

## Workflows

IBM Bob Premium Package for Z includes the following specialized workflows that guide you through complex tasks step by step with built-in AI prompts:

| Workflow                            | Description                                                                                                                                                                                                 | Related mode        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Explain code                        | Generate a comprehensive explanation of COBOL, PL/I, JCL, REXX, or Assembler code that includes context from referenced files and the data dictionary from an Architect, Business, or Developer perspective | Z Architect, Z Code |
| Generate data dictionary            | Map variables in an application to their semantic interpretation by generating descriptions, business terms, and business descriptions for a data dictionary rules                                          | Z Architect, Z Code |
| Generate documentation              | Generate documentation for COBOL, PL/I, and Assembler programs that includes business rules                                                                                                                 | Z Architect, Z Code |
| Generate refactored service program | Generate a new service program using code blocked sliced from the Refactor COBOL or PL/I program workflow                                                                                                   | Z Code              |
| Refactor COBOL or PL/I program      | Modernize COBOL and PL/I applications by identifying and extracting services or business logic, then turn them into a service program with the Generate refactored service program workflow                 | Z Code              |

## Skills

IBM Bob Premium Package for Z includes the following specialized skills that help with mainframe development:

| Skill                              | Description                                                                                                                                                                 | Related mode        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `data-dictionary-management`       | Generate a data dictionary based on programs mentioned in the implementation plan to improve code generation and explanations while making code changes                     | Z Architect, Z Code |
| `explain`                          | Provide quick explanations of entire source files                                                                                                                           | Z Architect, Z Code |
| `impact-analysis`                  | Generate a comprehensive impact analysis for proposed mainframe code changes in COBOL, PL/I, JCL, Assembler or REXX to learn how code changes will affect your applications | Z Architect         |
| `implementation-planning`          | Generate an implementation plan that describes necessary code changes to meet a business requirement                                                                        | Z Architect         |
| `refactor`                         | Refactor parts of an application into modular and reusable services with the same functionality                                                                             | Z Code              |
| `refactor-report-generation`       | Generate comprehensive refactor reports for COBOL or PL/I service refactoring workflows                                                                                     | Z Code              |
| `sign-in-to-z-understand`          | Sign in to Z Understand to get full access to any central data dictionaries and enterprise-level metadata                                                                   | Z Architect, Z Code |
| `sync-data-dictionary`             | Retrieves information from a central server to add to a local data dictionary file                                                                                          | Z Architect, Z Code |
| `z-coding-standards-skill-builder` | Create coding standards in your workspace based on common practices through analyzing existing files to improve code generation                                             | Z Code              |

## Commands

IBM Bob Premium Package for Z includes the following slash commands you can use during your chat session:

| Command     | Description                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| `/init`     | Analyze the application code and create a concise AI configuration file (AGENTS.md)                    |
| `/refactor` | Launch the refactor skill to find candidates for service code extraction to generate a service program |

## Prerequisites

- IBM Z Open Editor 6.6.0 or later: This extension provides language support for the IBM Enterprise programming languages for z/OS.
- Markdown (by MermaidChart) 2.7.0 or later: This extension provides support for Mermaid diagrams in generated wiki and explanations.
