/**
 * zudojs-cli — Middleware Generator
 *
 * Generates middleware files.
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { normalizeName, toCamelCase } from "../../utils/utils.name.js";

export interface GenerateMiddlewareOptions {
  readonly name: string;
  readonly basePath: string;
  readonly dryRun?: boolean;
}

export async function generateMiddleware(
  options: GenerateMiddlewareOptions,
  cwd: string,
): Promise<string[]> {
  const name = normalizeName(options.name);
  const nameCamel = toCamelCase(options.name);

  const files: Record<string, string> = {
    [`${options.basePath}/middlewares/${name}.middleware.ts`]: `/**
 * ${name} middleware.
 */

export function ${nameCamel}Middleware() {
  return async (ctx: unknown, next: () => Promise<void>) => {
    await next();
  };
}
`,
  };

  if (options.dryRun) {
    return Object.keys(files);
  }

  await writeFileTree(cwd, files);
  return Object.keys(files);
}
