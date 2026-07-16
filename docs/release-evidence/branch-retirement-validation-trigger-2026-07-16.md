# Branch Retirement Validation Trigger

This documentation-only marker was added through the repository connector after the stacked diagnostic path scopes were reconciled. Its purpose is to trigger a fresh pull-request validation run on the final replacement map rather than relying on a workflow-token push, which does not recursively start GitHub Actions workflows.

The marker carries no runtime behavior and may remain as audit provenance.
