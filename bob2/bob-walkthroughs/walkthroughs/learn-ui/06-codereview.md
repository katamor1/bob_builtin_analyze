# Code reviews

Bob can review your code directly from your IDE, catching potential issues before you commit your work.

## Why use this feature?

- **Catch errors early**: Identify issues before they make it into your committed work.
- **Save time**: Address potential comments that reviewers might leave, reducing the time needed for PR approval.
- **Improve code quality**: Get suggestions for better coding practices and maintainability.

## How it works

When you have uncommitted changes in your workspace, you can ask Bob to review them. Bob analyzes your changes and flags potential issues in the Bob Findings panel.

You can click on any finding to get more details and work with Bob to fix the issue. Findings can be referenced in two ways:

- From the Bob Findings panel
- By clicking on @issues in the context dropdown menu in the chat interface

## Getting started

### Prerequisites

- You must have uncommitted changes in your workspace

### Basic usage

You can initiate a code review in two ways:

- Use the command palette:

  1. Press `Cmd+Shift+P` on Mac or `Ctrl+Shift+P` on Windows/Linux.
  2. Search for "Bob: Review Current Changes".

- Use the following slash command in the chat interface:

  ```
  /review
  ```

Bob will analyze your changes and display findings in the Bob Findings panel.


## Tips and best practices

  ```
  /review
  ```

Bob will analyze your changes and display findings in the Bob Findings panel.


## Tips and best practices

- **Commit frequently**: Smaller, focused commits make reviews more targeted and effective.
- **Use with pre-commit hooks**: Integrate Bob reviews into your pre-commit workflow for consistent quality checks.
- **Combine with manual reviews**: Use Bob's automated reviews as a first pass before human code reviews.