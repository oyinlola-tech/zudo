import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile as writeFileAsync } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

function assertSafePath(basePath: string, filePath: string): void {
  const resolved = join(basePath, filePath);
  const relativePath = relative(basePath, resolved);

  if (relativePath.startsWith("..") || relativePath.includes("..")) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }
}

export async function writeFile(
  basePath: string,
  filePath: string,
  content: string,
): Promise<void> {
  assertSafePath(basePath, filePath);

  const fullPath = join(basePath, filePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFileAsync(fullPath, content);
}

export async function writeFileTree(
  basePath: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [filePath, content] of Object.entries(files)) {
    await writeFile(basePath, filePath, content);
  }
}

/**
 * Returns the content of a barrel index file with `exportLine` appended,
 * preserving any existing exports. If the line is already present, the
 * existing content is returned unchanged.
 */
export function mergeBarrelExport(
  basePath: string,
  indexPath: string,
  exportLine: string,
): string {
  const fullPath = join(basePath, indexPath);
  const line = exportLine.trim();

  let existing = "";
  if (existsSync(fullPath)) {
    existing = readFileSync(fullPath, "utf-8");
  }

  if (existing.includes(line)) {
    return existing;
  }

  const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  return existing + separator + line + "\n";
}
