/**
 * zudojs-cli — Version resolution
 *
 * The CLI's own version, read from its `package.json` at runtime.
 *
 * It used to be a hand-maintained string literal duplicated in two places
 * (`constants/index.ts` and `cliConstant.value.ts`). Both are stamped into the
 * manifest of every generated project, so a release that bumped `package.json`
 * without editing both copies would silently scaffold projects claiming the
 * previous version. Reading the manifest removes the duplication entirely.
 *
 * @module cliConstant/cliVersion
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Package name to match, so a parent workspace manifest is never picked up. */
const PACKAGE_NAME = "zudojs-cli";

/** Directory levels to walk upward before giving up. */
const MAX_LOOKUP_DEPTH = 8;

/**
 * Walks upward from this module looking for the CLI's own `package.json`.
 *
 * The compiled layout (`dist/src/cliConstant/`) sits one level deeper than the
 * source layout (`src/cliConstant/`), so a fixed relative path would be correct
 * in only one of them. Matching on `name` also means a parent workspace
 * manifest cannot be mistaken for ours.
 *
 * @returns The version string declared in the CLI's `package.json`.
 * @throws {Error} If the manifest cannot be located or has no string version.
 */
function readOwnVersion(): string {
  let directory = dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < MAX_LOOKUP_DEPTH; depth += 1) {
    const manifestPath = join(directory, "package.json");

    if (existsSync(manifestPath)) {
      const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));

      if (typeof parsed === "object" && parsed !== null) {
        const { name, version } = parsed as {
          readonly name?: unknown;
          readonly version?: unknown;
        };

        if (
          name === PACKAGE_NAME &&
          typeof version === "string" &&
          version.length > 0
        ) {
          return version;
        }
      }
    }

    const parent = dirname(directory);
    if (parent === directory) {
      break;
    }
    directory = parent;
  }

  throw new Error(
    `${PACKAGE_NAME}: could not resolve its own package.json to read the version.`,
  );
}

/** The CLI's version, matching its `package.json`. */
export const CLI_VERSION: string = readOwnVersion();
