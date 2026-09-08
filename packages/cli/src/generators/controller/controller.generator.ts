/**
 * zudojs-cli — Controller Generator
 */

import {
  writeFileTree,
  mergeBarrelExport,
} from "../../utils/utils.fileSystem.js";
import { CLIGenerationError } from "../../errors/index.js";
import { normalizeName, toPascalCase } from "../../utils/utils.name.js";

export interface GenerateControllerOptions {
  readonly name: string;
  readonly service?: string;
  readonly basePath?: string;
  readonly dryRun?: boolean;
}

export async function generateController(
  options: GenerateControllerOptions,
  cwd: string,
): Promise<string[]> {
  const name = normalizeName(options.name);
  const nameCamel = toPascalCase(options.name);
  const basePath = options.basePath ?? "";
  const prefix = basePath ? `${basePath}/` : "";
  const indexPath = `${prefix}controllers/index.ts`;

  const files: Record<string, string> = {
    [`${prefix}controllers/${name}.controller.ts`]: `import { createLogger } from "@zudojs/logger";

export class ${nameCamel}Controller {
  private readonly logger = createLogger({ name: "${name}-controller" });

  async handle(request: Request): Promise<Response> {
    this.logger.info("${name} request received", { method: request.method, url: request.url });

    try {
      const body = request.method !== "GET" ? await request.json() : null;

      return Response.json({ ok: true, data: body ?? {} }, { status: 200 });
    } catch (error) {
      this.logger.error("Failed to handle ${name} request", { error });
      return Response.json({ ok: false, error: "Internal server error" }, { status: 500 });
    }
  }
}
`,

    // Merge with any existing barrel content instead of overwriting it.
    [indexPath]: mergeBarrelExport(
      cwd,
      indexPath,
      `export { ${nameCamel}Controller } from "./${name}.controller.js";`,
    ),
  };

  if (options.dryRun) {
    return Object.keys(files);
  }

  try {
    await writeFileTree(cwd, files);
    return Object.keys(files);
  } catch (error) {
    throw new CLIGenerationError(
      `Failed to generate controller: ${name}`,
      error,
    );
  }
}
