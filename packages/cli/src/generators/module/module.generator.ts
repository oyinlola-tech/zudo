/**
 * zudojs-cli — Module Generator
 *
 * Generates a runtime module (a `BaseModule` subclass, rendered by the same
 * template `zudojs create` uses), exports it from the modules barrel and
 * registers it in the sibling `app.ts`.
 */

import { basename, dirname } from "node:path";

import { mergeBarrelExport, writeFileTree } from "../../utils/utils.fileSystem.js";
import { CLIGenerationError } from "../../errors/index.js";
import { assertGeneratableName, toPascalCase } from "../../utils/utils.name.js";
import { moduleSpec, renderModuleFile } from "../../templates/shared/appRuntime.template.js";
import { registerModuleInApp, type ModuleRegistration } from "./module.registration.js";

export interface GenerateModuleOptions {
  readonly name: string;
  readonly feature?: boolean;
  readonly basePath?: string;
  readonly dryRun?: boolean;
  /** Receives the registration outcome (e.g. lines to add by hand). */
  readonly onRegistered?: (registration: ModuleRegistration) => void;
}

export async function generateModule(
  options: GenerateModuleOptions,
  cwd: string,
): Promise<string[]> {
  const basePath = options.basePath ?? "modules";
  const name = assertGeneratableName(options.name, "module name");
  const namePascal = toPascalCase(name);
  const spec = moduleSpec(name, `./${name}/index.js`);

  const files: Record<string, string> = {
    [`${basePath}/${name}/${name}.module.ts`]: renderModuleFile({ module: spec }),
    [`${basePath}/${name}/index.ts`]: `export { ${spec.className} } from "./${name}.module.js";
`,
    [`${basePath}/index.ts`]: mergeBarrelExport(
      cwd,
      `${basePath}/index.ts`,
      `export { ${spec.className} } from "./${name}/index.js";`,
    ),
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
  } catch (error) {
    throw new CLIGenerationError(`Failed to generate module: ${name}`, error);
  }

  const appPath = `${dirname(basePath)}/app.ts`;
  const registration = registerModuleInApp(
    cwd,
    appPath,
    spec.className,
    `./${basename(basePath)}/index.js`,
  );
  options.onRegistered?.(registration);

  return registration.registered ? [...Object.keys(files), appPath] : Object.keys(files);
}
