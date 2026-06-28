import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export async function readJsonFile<T = unknown>(path: string): Promise<T> {
  const text = await readTextFile(path);
  return JSON.parse(text) as T;
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
