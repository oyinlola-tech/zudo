/**
 * zudojs-cli — Registering a generated module with the runtime.
 *
 * `zudojs generate module` used to emit a plain class that was not a runtime
 * `Module` and that nothing imported, so it never ran. The generator now
 * emits a `BaseModule` subclass (the same template `zudojs create` uses),
 * exports it from the modules barrel, and adds it to the module list in the
 * sibling `app.ts` written by `zudojs create`.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { activeWriteCapture } from "../../utils/utils.writeGuard.js";

/** Marker `renderAppFile` emits at the start of the module list. */
const MODULE_LIST = "  for (const module of [\n";

/** Outcome of {@link registerModuleInApp}. */
export interface ModuleRegistration {
  /** Whether app.ts now registers the module. */
  readonly registered: boolean;
  /** Lines to add by hand when `registered` is false. */
  readonly manualSteps: readonly string[];
}

/**
 * Adds `new <className>()` to the module list in `appPath` and imports it
 * from `importPath`. Idempotent. Leaves a hand-edited app.ts it does not
 * recognise untouched and returns the lines to add instead. With `dryRun`
 * it reports the outcome and writes nothing, so a dry run can list app.ts
 * among the files a real run would change.
 */
export function registerModuleInApp(
  cwd: string,
  appPath: string,
  className: string,
  importPath: string,
  dryRun = false,
): ModuleRegistration {
  const importLine = `import { ${className} } from "${importPath}";`;
  const entry = `    new ${className}(),\n`;
  const manualSteps = [
    importLine,
    `new ${className}() in the modules passed to createRuntime`,
  ];
  const fullPath = join(cwd, appPath);

  if (!existsSync(fullPath)) return { registered: false, manualSteps };
  const source = readFileSync(fullPath, "utf-8");
  if (source.includes(entry)) return { registered: true, manualSteps: [] };

  const listAt = source.indexOf(MODULE_LIST);
  const lastImport = source.lastIndexOf("\nimport ");
  if (listAt === -1 || lastImport === -1)
    return { registered: false, manualSteps };

  const importEnd = source.indexOf("\n", lastImport + 1);
  const insertAt = listAt + MODULE_LIST.length;
  const updated =
    source.slice(0, importEnd + 1) +
    `${importLine}\n` +
    source.slice(importEnd + 1, insertAt) +
    entry +
    source.slice(insertAt);

  // During the overwrite check the generator runs with writes captured; the
  // registration is an intended edit, not a conflict, so it is skipped then.
  if (!dryRun && !activeWriteCapture()) writeFileSync(fullPath, updated);
  return { registered: true, manualSteps: [] };
}
