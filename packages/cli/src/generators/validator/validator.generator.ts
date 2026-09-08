/**
 * zudojs-cli — Validator Generator
 *
 * Generates validator files.
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { normalizeName, toPascalCase } from "../../utils/utils.name.js";

export interface GenerateValidatorOptions {
  readonly name: string;
  readonly basePath: string;
  readonly dryRun?: boolean;
}

export async function generateValidator(
  options: GenerateValidatorOptions,
  cwd: string,
): Promise<string[]> {
  const name = normalizeName(options.name);
  const namePascal = toPascalCase(options.name);

  const files: Record<string, string> = {
    [`${options.basePath}/validators/${name}.validator.ts`]: `/**
 * ${name} validator.
 */

export function validate${namePascal}(input: unknown): boolean {
  return true;
}
`,
  };

  if (options.dryRun) {
    return Object.keys(files);
  }

  await writeFileTree(cwd, files);
  return Object.keys(files);
}
