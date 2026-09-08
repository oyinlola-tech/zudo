/**
 * zudojs-cli — Service Generator
 *
 * Generates a new service with CQRS structure.
 */

import {
  writeFileTree,
  mergeBarrelExport,
} from "../../utils/utils.fileSystem.js";
import { CLIGenerationError } from "../../errors/index.js";

export interface GenerateServiceOptions {
  readonly name: string;
  readonly basePath?: string;
  readonly dryRun?: boolean;
}

export async function generateService(
  options: GenerateServiceOptions,
  cwd: string,
): Promise<string[]> {
  const basePath = options.basePath ?? "services";
  const name = options.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const namePascal = name
    .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/^./, (c) => c.toUpperCase());

  const files: Record<string, string> = {
    [`${basePath}/${name}/${name}.service.ts`]: `import { createLogger } from "@zudojs/logger";

export class ${namePascal}Service {
  private readonly logger = createLogger({ name: "${name}-service" });

  async initialize(): Promise<void> {
    this.logger.info("${name} service initialized");
  }
}
`,

    // Merge with any existing barrel content instead of overwriting it.
    [`${basePath}/${name}/index.ts`]: mergeBarrelExport(
      cwd,
      `${basePath}/${name}/index.ts`,
      `export { ${namePascal}Service } from "./${name}.service.js";`,
    ),

    // Preserve any existing content in the CQRS barrels.
    [`${basePath}/${name}/commands/index.ts`]: mergeBarrelExport(
      cwd,
      `${basePath}/${name}/commands/index.ts`,
      "",
    ),

    [`${basePath}/${name}/queries/index.ts`]: mergeBarrelExport(
      cwd,
      `${basePath}/${name}/queries/index.ts`,
      "",
    ),
  };

  if (options.dryRun) {
    return Object.keys(files);
  }

  try {
    await writeFileTree(cwd, files);
    return Object.keys(files);
  } catch (error) {
    throw new CLIGenerationError(`Failed to generate service: ${name}`, error);
  }
}
