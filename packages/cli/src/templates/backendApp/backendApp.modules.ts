/**
 * zudojs-cli — How a module's routes are registered with its app.
 *
 * A module `billing` owns `src/modules/billing/routes/index.ts`, which
 * exports `registerBillingModuleRoutes(router, deps)`. The app's
 * `src/routes/index.ts` imports and calls it between its markers.
 *
 * The `Module` infix keeps it apart from a resource's
 * `registerBillingRoutes`: both used to be imported into the same
 * `src/routes/index.ts` after `generate module billing` and
 * `generate route billing`, and the app failed on the duplicate identifier.
 */

import { toPascalCase } from "../../utils/utils.name.js";

/** The registration of one module's routes. */
export interface ModuleRoutesWiring {
  readonly module: string;
  readonly functionName: string;
  /** The module's routes index, relative to the app root. */
  readonly indexPath: string;
  /** Import line for the app's src/routes/index.ts. */
  readonly importLine: string;
  /** Call for the app's src/routes/index.ts. */
  readonly entryLine: string;
}

/** Describes the routes wiring of module `name`. */
export function moduleRoutesWiring(name: string): ModuleRoutesWiring {
  const functionName = `register${toPascalCase(name)}ModuleRoutes`;
  return {
    module: name,
    functionName,
    indexPath: `src/modules/${name}/routes/index.ts`,
    importLine: `import { ${functionName} } from "../modules/${name}/routes/index.js";`,
    entryLine: `${functionName}(router, deps);`,
  };
}
