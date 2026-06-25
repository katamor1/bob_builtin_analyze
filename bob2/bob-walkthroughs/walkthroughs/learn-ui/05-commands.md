# Using slash commands

Create custom slash commands to automate repetitive tasks and extend Bob's functionality with simple markdown files.

To get started, type `/` in the chat to see all available commands, or create your own by adding a markdown file to `.bob/commands/` or `~/.bob/commands/`

## Overview

Slash commands let you create reusable prompts and workflows that can be triggered instantly. Turn complex multi-step processes into single commands, standardize team practices, and automate repetitive tasks with simple markdown files.

Key benefits:

- Workflow automation: Turn complex multi-step processes into single commands
- Team standardization: Share commands across your team for consistent practices
- Context preservation: Include project-specific context in every command
- Quick access: Fuzzy search and autocomplete for instant command discovery

## Creating custom commands

Custom commands extend Bob's functionality by adding markdown files to specific directories:

- Project-specific: `.bob/commands/` in your workspace root
- Global: `~/.bob/commands/` in your home directory

The filename becomes the command name. For example:

- `review.md` → `/review`
- `test-api.md` → `/test-api`
- `deploy-check.md` → `/deploy-check`

### Command name processing

When creating commands through the UI, command names are automatically processed:

- Converted to lowercase
- Spaces replaced with dashes
- Special characters removed
- Leading/trailing dashes removed

Example: "My Cool Command!" becomes my-cool-command

### Basic command format

Create a simple command by adding a markdown file:

```markdown
Help me review this code for security issues and suggest improvements.
```

### Advanced command with frontmatter

Add metadata using frontmatter for enhanced functionality:

```markdown
---
description: Create a new API endpoint
argument-hint: <endpoint-name> <http-method>
---
Create a new API endpoint called $1 that handles $2 requests.
Include proper error handling and documentation.
```

#### Frontmatter fields

- description: Appears in the command menu to help users understand the command's purpose
- argument-hint: Provides a hint about expected arguments when using the command


## Command management UI

Bob provides a dedicated UI for managing custom commands.

Click the commands icon in the Bob panel to open the command manager.

### Creating a new command

1. Type your command name in the input field (e.g., "Sample command name")
2. Click the + button to create the command
3. A new file will be created and opened automatically (e.g., sample-command-name.md)

## Using slash commands

Type / in the chat to see a unified menu containing both types of commands. The menu shows both custom workflow commands and mode-switching commands in the same interface.

1. Unified menu: Both custom commands and mode-switching commands appear together
2. Autocomplete: Start typing to filter commands (e.g., /sam shows sample-command-name)
3. Fuzzy search: Find commands even with partial matches
4. Description preview: See command descriptions in the menu
5. Visual indicators: Mode commands are distinguished from custom commands with special icons

## Best practices

### Command naming

- Use descriptive, action-oriented names
- Keep names concise but clear
- Use hyphens for multi-word commands
- Avoid generic names like help or test
- Note: Names are automatically slugified (lowercase, special characters removed)
- The .md extension is automatically added/removed as needed

### Command content

- Start with a clear directive
- Use structured formats (lists, sections)
- Include specific requirements
- Reference project conventions
- Keep commands focused on a single task

### Organization

- Group related commands in subdirectories
- Use consistent naming patterns
- Document complex commands
- Version control your commands
- Share team commands in the project repository