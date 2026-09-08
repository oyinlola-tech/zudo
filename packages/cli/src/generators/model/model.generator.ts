/**
 * zudojs-cli — Model Generator
 *
 * Generates model files.
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { normalizeName, toPascalCase } from "../../utils/utils.name.js";

export interface GenerateModelOptions {
  readonly name: string;
  readonly basePath: string;
  readonly dryRun?: boolean;
}

export async function generateModel(
  options: GenerateModelOptions,
  cwd: string,
): Promise<string[]> {
  const name = normalizeName(options.name);
  const namePascal = toPascalCase(options.name);

  const files: Record<string, string> = {
    [`${options.basePath}/models/${name}.model.ts`]: `/**
 * ${name} model.
 */

export interface ${namePascal}Model {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
`,
  };

  if (options.dryRun) {
    return Object.keys(files);
  }

  await writeFileTree(cwd, files);
  return Object.keys(files);
}
