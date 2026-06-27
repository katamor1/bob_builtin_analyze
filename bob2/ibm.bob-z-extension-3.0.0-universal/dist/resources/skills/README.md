# Skills Directory

This directory stores skill-based resources that extend the capabilities of IBM Bob Premium Package for Z.

## Purpose

The `resources/skills/` directory is designed to store modular skill definitions and configurations that can be dynamically loaded by the Bob Z extension to enhance its capabilities in specific domains or tasks.

## Current Purpose

Skills provide:

- **Task-Oriented Workflows**: Pre-configured workflows for common development tasks
- **Reusable Patterns**: Best practices and patterns for specific scenarios
- **Domain-Specific Expertise**: Specialized knowledge for particular mainframe technologies (e.g., CICS, IMS, DB2)
- **Context-Aware Assistance**: Intelligent suggestions based on the current development context

## Current Structure

Skills follow a structure similar to:

```txt
resources/skills/
├── README.md (this file)
├── z-coding-standards-skill-builder/
│   └── SKILL.md
├── data-dictionary-management/
│   └── SKILL.md
├── generate-doc/
│   └── SKILL.md
├── example/
│   └── SKILL.md
├── impact-analysis/
│   └── SKILL.md
├── implementation-planning/
│   └── SKILL.md
├── refactor-report-generation/
│   └── SKILL.md
└── explain/
    └── SKILL.md
```

Each skill includes:

- **SKILL.md**: Metadata, trigger conditions, workflow, prerequisites, and operational guidance

## Contributing

When adding new skills to this directory:

1. Create a dedicated subdirectory for each skill
2. Include a `SKILL.md` manifest file with metadata
3. Document the skill's purpose, prerequisites, and usage
4. Follow the extension's coding standards and conventions

## Notes

- Skills are used to centralize reusable workflows and reduce rule duplication
- Rules may delegate execution to a skill instead of embedding the full workflow inline
- This directory structure may evolve as additional skills are added

---

For questions or suggestions about skill-based features, please refer to the main extension documentation or contact the development team.
