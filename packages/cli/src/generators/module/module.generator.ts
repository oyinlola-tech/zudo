/**
 * zudojs-cli — Module Generator
 *
 * Generates a runtime module (a `BaseModule` subclass, rendered by the same
 * template `zudojs create` uses), exports it from the modules barrel and
 * registers it in the sibling `app.ts`.
 */

import { basename, dirname } from "node:path";

import { mergeBarrelExport, writeFileTree } from "../../utils/utils.fileSystem.js";
import { CLIGenerationError, CLIValidationError } from "../../errors/index.js";
import { assertGeneratableName, toPascalCase } from "../../utils/utils.name.js";
import { moduleSpec, renderModuleFile } from "../../templates/shared/appRuntime.template.js";
import { registerModuleInApp, type ModuleRegistration } from "./module.registration.js";
import {
  moduleRoutesWiring,
  renderModuleRoutesIndex,
} from "../../templates/backendApp/index.js";
import { MARKERS, applyMarkerEdits, conflictingImport } from "../../wiring/index.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

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

  // A module gets its own routes index, registered with the app's
  // src/routes/index.ts, when the app has one (every app `create` writes).
  const appSrc = dirname(basePath);
  const appRoutes = `${appSrc}/routes/index.ts`;
  const routes = moduleRoutesWiring(name);
  const hasAppRoutes = existsSync(join(cwd, appRoutes));
  const clash = hasAppRoutes ? conflictingImport(cwd, appRoutes, routes.importLine) : undefined;
  if (clash !== undefined) {
    throw new CLIValidationError(
      `${appRoutes} already imports ${routes.functionName} (${clash.trim()}), so module "${name}" cannot register its routes. Choose another name.`,
    );
  }
  if (hasAppRoutes) {
    files[`${basePath}/${name}/routes/index.ts`] = renderModuleRoutesIndex(
      routes.functionName,
      "../../../container.js",
    );
  }

  if (options.dryRun) {
    return hasAppRoutes ? [...Object.keys(files), appRoutes] : Object.keys(files);
  }

  try {
    await writeFileTree(cwd, files);
  } catch (error) {
    throw new CLIGenerationError(`Failed to generate module: ${name}`, error);
  }

  const routeEdits = hasAppRoutes
    ? await applyMarkerEdits(cwd, [
        { file: appRoutes, marker: MARKERS.routeImports, line: routes.importLine },
        { file: appRoutes, marker: MARKERS.routes, line: routes.entryLine },
      ])
    : undefined;

  const appPath = `${dirname(basePath)}/app.ts`;
  const registration = registerModuleInApp(
    cwd,
    appPath,
    spec.className,
    `./${basename(basePath)}/index.js`,
  );
  options.onRegistered?.(
    routeEdits && routeEdits.manualSteps.length > 0
      ? {
          registered: registration.registered,
          manualSteps: [...registration.manualSteps, ...routeEdits.manualSteps],
        }
      : registration,
  );

  return [
    ...Object.keys(files),
    ...(registration.registered ? [appPath] : []),
    ...(routeEdits?.edited ?? []),
  ];
}
