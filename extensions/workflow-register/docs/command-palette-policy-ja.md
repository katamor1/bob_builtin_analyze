# Command Palette 表示名ポリシー

workflow-register の Command Palette 表示名は、VS Code が `category` と `title` を組み合わせて表示する前提で管理します。

- 表示形式は `Bob Workflow: <日本語の操作名>` とする。
- `category` はコロンの手前に出るため、英語の機能領域名 `Bob Workflow` を使う。
- `title` にはコロンを含めず、日本語の操作名だけを書く。
- コロンの手前は3拡張で既存の英語機能領域名を維持し、workflow-register では `Bob Workflow` を使う。
