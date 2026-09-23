/**
 * zudojs-cli — Version ranges written for `@zudojs/*` dependencies.
 *
 * Every generated package.json used to depend on `^1.0.0` of every framework
 * package, which resolves to any 1.x release — including ones that predate
 * the APIs the generated code calls (`createRouter` OpenAPI metadata,
 * `mountOpenAPI`, `createHttpTestClient`). Each package now gets a caret
 * range on the version this CLI build was generated against
 * ({@link ZUDOJS_PACKAGE_VERSIONS}), so a newer compatible release is still
 * picked up but an older one never is.
 */

import { ZUDOJS_PACKAGE_VERSIONS } from "./zudojsVersions.generated.js";

/**
 * Fallback for a package the version map does not know (for example a
 * name recorded by an older project). A plain caret on the first major.
 */
export const ZUDOJS_FALLBACK_VERSION_RANGE = "^1.0.0" as const;

/** The range written for `name` (`^<version this CLI targets>`). */
export function zudojsVersionRange(name: string): string {
  const version = Object.hasOwn(ZUDOJS_PACKAGE_VERSIONS, name)
    ? ZUDOJS_PACKAGE_VERSIONS[name]
    : undefined;
  return version === undefined ? ZUDOJS_FALLBACK_VERSION_RANGE : `^${version}`;
}

/** `{ name: range }` for a list of `@zudojs/*` packages, deduplicated. */
export function zudojsDependencies(
  names: readonly string[],
): Record<string, string> {
  return Object.fromEntries(
    [...new Set(names)].map((name) => [name, zudojsVersionRange(name)]),
  );
}
