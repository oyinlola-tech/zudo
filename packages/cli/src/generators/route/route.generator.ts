/**
 * zudojs-cli — Route Generator
 *
 * Generates route files.
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { normalizeName, toCamelCase } from "../../utils/utils.name.js";

export interface GenerateRouteOptions {
  readonly name: string;
  readonly basePath: string;
  readonly dryRun?: boolean;
}

export async function generateRoute(
  options: GenerateRouteOptions,
  cwd: string,
): Promise<string[]> {
  const name = normalizeName(options.name);
  const nameCamel = toCamelCase(options.name);

  const files: Record<string, string> = {
    [`${options.basePath}/routes/${name}.route.ts`]: `/**
 * ${name} route.
 */

export const ${nameCamel}Route = {
  path: "/${name}",
  method: "GET",
  handler: async () => {
    return { message: "${name}" };
  },
};
`,
  };

  if (options.dryRun) {
    return Object.keys(files);
  }

  await writeFileTree(cwd, files);
  return Object.keys(files);
}
