/**
 * zudojs-cli — DTO Generator
 *
 * Generates DTO files.
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { normalizeName, toPascalCase } from "../../utils/utils.name.js";

export interface GenerateDtoOptions {
  readonly name: string;
  readonly basePath: string;
  readonly dryRun?: boolean;
}

export async function generateDto(
  options: GenerateDtoOptions,
  cwd: string,
): Promise<string[]> {
  const name = normalizeName(options.name);
  const namePascal = toPascalCase(options.name);

  const files: Record<string, string> = {
    [`${options.basePath}/dtos/${name}.dto.ts`]: `/**
 * ${name} DTO.
 */

export interface Create${namePascal}Dto {
  readonly name: string;
}
`,
  };

  if (options.dryRun) {
    return Object.keys(files);
  }

  await writeFileTree(cwd, files);
  return Object.keys(files);
}
