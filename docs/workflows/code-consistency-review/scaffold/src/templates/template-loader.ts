import { join } from "node:path";
import { readTextFile } from "../core/file-system.js";

export type PromptTemplates = {
  system: string;
  task: string;
  outputFormat: string;
  bobInputTemplate: string;
};

export async function loadPromptTemplates(rootDir: string): Promise<PromptTemplates> {
  const templateDir = join(rootDir, "docs/workflows/code-consistency-review/templates/prompts/consistency-review-v1");
  return {
    system: await readTextFile(join(templateDir, "system.md")),
    task: await readTextFile(join(templateDir, "task.md")),
    outputFormat: await readTextFile(join(templateDir, "output-format.md")),
    bobInputTemplate: await readTextFile(join(templateDir, "bob-input.template.md")),
  };
}

export function applyTemplate(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}
