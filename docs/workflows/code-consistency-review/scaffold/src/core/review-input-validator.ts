import YAML from "yaml";
import { readTextFile } from "./file-system.js";
import type { ReviewInput } from "./result.js";

export async function validateReviewInput(inputPath: string): Promise<ReviewInput> {
  const raw = await readTextFile(inputPath);
  const parsed = YAML.parse(raw) as Partial<ReviewInput>;

  const errors: string[] = [];

  if (parsed.schema_version !== 1) {
    errors.push("schema_version must be 1");
  }
  if (!parsed.review?.id) {
    errors.push("review.id is required");
  }
  if (!parsed.review?.title) {
    errors.push("review.title is required");
  }
  if (!parsed.review?.change_type) {
    errors.push("review.change_type is required");
  }
  if (!parsed.review?.base) {
    errors.push("review.base is required");
  }
  if (!parsed.review?.head) {
    errors.push("review.head is required");
  }
  if (!parsed.artifacts || Object.keys(parsed.artifacts).length === 0) {
    errors.push("artifacts must not be empty");
  }
  if (!parsed.review_focus || parsed.review_focus.length === 0) {
    errors.push("review_focus must not be empty");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid review-input.yaml:\n${errors.map((e) => `- ${e}`).join("\n")}`);
  }

  return parsed as ReviewInput;
}
