/**
 * zudojs-cli — Job Generator
 *
 * Generates job files.
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { normalizeName, toCamelCase } from "../../utils/utils.name.js";

export interface GenerateJobOptions {
  readonly name: string;
  readonly basePath: string;
  readonly dryRun?: boolean;
}

export async function generateJob(
  options: GenerateJobOptions,
  cwd: string,
): Promise<string[]> {
  const name = normalizeName(options.name);
  const nameCamel = toCamelCase(options.name);

  const files: Record<string, string> = {
    [`${options.basePath}/jobs/${name}.job.ts`]: `/**
 * ${name} job.
 */

export async function ${nameCamel}Job() {
  // Job implementation
}
`,
  };

  if (options.dryRun) {
    return Object.keys(files);
  }

  await writeFileTree(cwd, files);
  return Object.keys(files);
}
