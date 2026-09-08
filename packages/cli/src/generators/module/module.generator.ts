/**
 * zudojs-cli — Module Generator
 *
 * Generates a new feature module within a Zudojs project.
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { CLIGenerationError } from "../../errors/index.js";

export interface GenerateModuleOptions {
  readonly name: string;
  readonly feature?: boolean;
  readonly basePath?: string;
  readonly dryRun?: boolean;
}

export async function generateModule(
  options: GenerateModuleOptions,
  cwd: string,
): Promise<string[]> {
  const basePath = options.basePath ?? "modules";
  const name = options.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  const files: Record<string, string> = {
    [`${basePath}/${name}/${name}.module.ts`]: `import { createLogger } from "@zudojs/logger";

export class ${
      name
        .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
        .charAt(0)
        .toUpperCase() +
      name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).slice(1)
    }Module {
  private readonly logger = createLogger({ name: "${name}-module" });

  id = "${name}-module";

  initialize() {
    this.logger.info("${name} module initialized");
  }
}
`,

    [`${basePath}/${name}/index.ts`]: `export { ${
      name
        .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
        .charAt(0)
        .toUpperCase() +
      name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).slice(1)
    }Module } from "./${name}.module.js";
`,
  };

  if (options.feature) {
    const featureName = `${name}.feature`;
    files[`${basePath}/${name}/features/${featureName}.ts`] =
      `import { createLogger } from "@zudojs/logger";

export class ${
        name
          .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
          .charAt(0)
          .toUpperCase() +
        name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).slice(1)
      }Feature {
  private readonly logger = createLogger({ name: "${name}-feature" });
}
`;

    files[`${basePath}/${name}/features/index.ts`] = `export { ${
      name
        .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
        .charAt(0)
        .toUpperCase() +
      name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).slice(1)
    }Feature } from "./${featureName}.js";
`;
  }

  if (options.dryRun) {
    return Object.keys(files);
  }

  try {
    await writeFileTree(cwd, files);
    return Object.keys(files);
  } catch (error) {
    throw new CLIGenerationError(`Failed to generate module: ${name}`, error);
  }
}
