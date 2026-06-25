# Customizing modes

You can create **custom modes** to tailor Bob's behavior to specific tasks or workflows. Custom modes can be either **global** (available across all projects) or **project-specific** (defined within a single project).

## Why use custom modes

*   **Specialization:** Create modes optimized for specific tasks, like "Documentation Writer," "Test Engineer," or "Refactoring Expert."
*   **Safety:** Restrict a mode's access to sensitive files or commands. For example, a "Review Mode" could be limited to read-only operations.
*   **Experimentation:** Safely experiment with different prompts and configurations without affecting other modes.
*   **Team collaboration:** Share custom modes with your team to standardize workflows.


## What's included in a custom mode

Custom modes are defined by several key properties. Understanding these concepts will help you tailor Bob's behavior effectively.

| UI Field / YAML Property                 | Conceptual Description                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Slug (`slug`)                            | A **unique internal identifier** for the mode. It's used by Bob to reference the mode, especially for associating [mode-specific instruction files](#mode-specific-instructions-via-filesdirectories).                                                                                                                                                                                                   |
| Name (`name`)                            | The **display name** for the mode as it appears in the Bob user interface. This should be human-readable and descriptive.                                                                                                                                                                                                                                                                               |
| Role Definition (`roleDefinition`)       | Defines the **core identity and expertise** of the mode. This text is placed at the beginning of the system prompt.<br />- Its primary function is to define Bob's personality and behavior when this mode is active.<br />- The **first sentence** (up to the first period `.`) serves as a default concise summary for Bob to understand the mode's general purpose. <br />- **However, if the `whenToUse` property is defined, `whenToUse` takes precedence** for summarizing the mode's function, especially in contexts like task orchestration or mode switching. In such cases, the first sentence of `roleDefinition` is less critical for this specific summarization task, though the entire `roleDefinition` is still used when the mode is active to guide its overall behavior. |
| Available Tools (`groups`)               | Defines the **allowed toolsets and file access permissions** for the mode.<br />- In the UI, this corresponds to selecting which general categories of tools (like reading files, editing files, browsing, or executing commands) the mode can use.<br />- File type restrictions for the "edit" group are typically managed via manual YAML/JSON configuration or by asking Bob to set them up, as detailed in the [Property details for `groups`](#yamlson-property-details). |
| Custom Instructions (optional) (`customInstructions`) | **Specific behavioral guidelines** or rules for the mode.<br />- These instructions are added near the end of the system prompt to further refine Bob's behavior beyond the `roleDefinition`.<br />- This can be provided directly in the configuration or via separate instruction files.                                                                                                                               |

## Methods for creating and configuring custom modes

You can create and configure custom modes in several ways:

### Ask Bob! (Recommended)

You can quickly create a basic custom mode by asking Bob to do it for you. For example:
```
Create a new mode called "Documentation Writer". It should only be able to read files and write Markdown files.
```
Bob will guide you through the process, prompting for necessary information for the properties described in the [What's included in a custom mode](#whats-included-in-a-custom-mode) table. Bob will create the mode using the preferred YAML format. For fine-tuning or making specific adjustments later, you can use the Prompts tab or manual configuration.

### Using the Prompts tab

1.  **Open Prompts Tab:** Click the <Codicon name="notebook" /> icon in the Bob top menu bar.
2.  **Create New Mode:** Click the <Codicon name="add" /> button to the right of the Modes heading.
3.  **Fill in Fields:**


The interface provides fields for `Name`, `Slug`, `Save Location`, `Role Definition`, `When to Use (optional)`, `Available Tools`, and `Custom Instructions`. After filling these, click the "Create Mode" button. Bob will save the new mode in YAML format.

*Refer to the [What's included in a custom mode](#whats-included-in-a-custom-mode) table for conceptual explanations of each property. File type restrictions for the "edit" tool group can be added by asking Bob or through manual YAML/JSON configuration.*