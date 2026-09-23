/**
 * zudojs-cli — Middleware Generator
 *
 * Writes `<basePath>/middlewares/<name>.middleware.ts` (an `HttpMiddleware`
 * from @zudojs/http), exports it from the folder barrel and registers it in
 * the app's `src/server.ts` between the `zudojs:server-imports` and
 * `zudojs:server-middleware` markers. A server.ts missing either marker pair
 * is left unchanged (no import without its registration) and the lines to
 * add by hand are reported instead.
 */

import { posix } from "node:path";

import { CLIValidationError } from "../../errors/index.js";
import { mergeBarrelExport, writeFileTree } from "../../utils/utils.fileSystem.js";
import { normalizeName, toCamelCase } from "../../utils/utils.name.js";
import {
  MARKERS,
  applyMarkerEdits,
  conflictingImport,
  planMarkerEdits,
  type MarkerEdit,
} from "../../wiring/index.js";
import { renderMiddlewareFile } from "./middleware.template.js";

export interface GenerateMiddlewareOptions {
  readonly name: string;
  readonly basePath: string;
  readonly dryRun?: boolean;
  /** Receives the registration outcome (e.g. lines to add by hand). */
  readonly onRegistered?: (registration: MiddlewareRegistration) => void;
}

/** Outcome of registering a generated middleware in `server.ts`. */
export interface MiddlewareRegistration {
  /** Whether server.ts now runs the middleware. */
  readonly registered: boolean;
  /** The server file it was (or should be) registered in. */
  readonly serverFile: string;
  /** Lines to add by hand when `registered` is false. */
  readonly manualSteps: readonly string[];
}

/**
 * The app source directory owning `basePath`: `src` for `src` and
 * `src/modules/billing`, `apps/services/x/src` for a service.
 */
export function middlewareAppSrc(basePath: string): string {
  return basePath.replace(/\/modules\/[^/]+$/, "");
}

/** The import and pipeline lines that register `factoryName` in server.ts. */
export function middlewareServerLines(
  basePath: string,
  factoryName: string,
): { readonly serverFile: string; readonly importLine: string; readonly entryLine: string } {
  const appSrc = middlewareAppSrc(basePath);
  const barrel = posix.relative(appSrc, `${basePath}/middlewares/index.js`);
  return {
    serverFile: `${appSrc}/server.ts`,
    importLine: `import { ${factoryName} } from "./${barrel}";`,
    entryLine: `${factoryName}(),`,
  };
}

export async function generateMiddleware(
  options: GenerateMiddlewareOptions,
  cwd: string,
): Promise<string[]> {
  const name = normalizeName(options.name);
  const factoryName = `${toCamelCase(options.name)}Middleware`;
  const lines = middlewareServerLines(options.basePath, factoryName);
  const barrel = `${options.basePath}/middlewares/index.ts`;

  const clash = conflictingImport(cwd, lines.serverFile, lines.importLine);
  if (clash !== undefined) {
    throw new CLIValidationError(
      `${lines.serverFile} already imports ${factoryName} (${clash.trim()}), so middleware "${name}" cannot be registered. Choose another name.`,
    );
  }

  const files: Record<string, string> = {
    [`${options.basePath}/middlewares/${name}.middleware.ts`]: renderMiddlewareFile({
      name,
      factoryName,
      serverFile: lines.serverFile,
    }),
    [barrel]: mergeBarrelExport(
      cwd,
      barrel,
      `export { ${factoryName} } from "./${name}.middleware.js";`,
    ),
  };

  const edits: readonly MarkerEdit[] = [
    { file: lines.serverFile, marker: MARKERS.serverImports, line: lines.importLine },
    { file: lines.serverFile, marker: MARKERS.serverMiddleware, line: lines.entryLine },
  ];

  const planned = planMarkerEdits(cwd, edits).outcome;
  const registered = planned.manualSteps.length === 0;
  if (options.dryRun) {
    return [...Object.keys(files), ...(registered ? planned.edited : [])];
  }

  await writeFileTree(cwd, files);
  const edited = registered ? (await applyMarkerEdits(cwd, edits)).edited : [];
  options.onRegistered?.({
    registered,
    serverFile: lines.serverFile,
    manualSteps: registered
      ? []
      : [
          `In ${lines.serverFile}: ${lines.importLine}`,
          `In ${lines.serverFile}: add ${lines.entryLine} to the middlewares list of the HttpMiddlewarePipeline, before dispatch`,
        ],
  });

  return [...Object.keys(files), ...edited];
}
