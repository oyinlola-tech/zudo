/**
 * zudojs-cli — Module Generator
 *
 * Generates a new feature module within a Zudojs project.
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { CLIGenerationError } from "../../errors/index.js";
import { assertGeneratableName, toPascalCase } from "../../utils/utils.name.js";

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
  const name = assertGeneratableName(options.name, "module name");
  const namePascal = toPascalCase(name);

  const files: Record<string, string> = {
    [`${basePath}/${name}/${name}.module.ts`]: `import { createLogger } from "@zudojs/logger";

export class ${namePascal}Module {
  private readonly logger = createLogger({ name: "${name}-module" });

  id = "${name}-module";

  initialize() {
    this.logger.info("${name} module initialized");
  }
}
`,

    [`${basePath}/${name}/index.ts`]: `export { ${namePascal}Module } from "./${name}.module.js";
`,
  };

  if (options.feature) {
    const featureName = `${name}.feature`;
    files[`${basePath}/${name}/features/${featureName}.ts`] =
      `import { createLogger } from "@zudojs/logger";

export class ${namePascal}Feature {
  private readonly logger = createLogger({ name: "${name}-feature" });
}
`;

    files[`${basePath}/${name}/features/index.ts`] = `export { ${namePascal}Feature } from "./${featureName}.js";
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
