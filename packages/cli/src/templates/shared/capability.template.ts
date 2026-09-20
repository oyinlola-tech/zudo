/**
 * zudojs-cli — Capabilities a generated project declares.
 *
 * Every template used to stamp `zudojs.features: []` into the package.json it
 * wrote, although it had already used the `enable*` flags to choose the
 * project's dependencies. `zudojs doctor` reads only `pkg.zudojs.features`,
 * so its check ("every declared feature has its package") passed vacuously in
 * every project the CLI created, and `zudojs add` was the only thing that
 * could ever put a value there.
 *
 * The list produced here is the same one `zudojs create` records as
 * `capabilities` in `.zudojs/manifest.json`, and {@link capabilityPackages}
 * gives the packages that back it, so a declared feature is always installed.
 */

import { FEATURE_PACKAGES } from "../../constants/index.js";
import type { ScaffoldOptions } from "../../types/index.js";

/** Capability flags, in the order the manifest records them. */
const CAPABILITY_FLAGS: ReadonlyArray<
  readonly [capability: string, flag: keyof ScaffoldOptions]
> = [
  ["cqrs", "enableCQRS"],
  ["messaging", "enableMessaging"],
  ["observability", "enableObservability"],
  ["openapi", "enableOpenAPI"],
  ["database", "enableDatabase"],
  ["queue", "enableQueue"],
];

/**
 * The capability ids a scaffolded project was created with.
 */
export function resolveProjectCapabilities(
  options: ScaffoldOptions,
): readonly string[] {
  return CAPABILITY_FLAGS.filter(([, flag]) => options[flag] === true).map(
    ([capability]) => capability,
  );
}

/**
 * The `@zudojs/*` packages that back `capabilities`, using the same mapping
 * `zudojs add` and `zudojs doctor` use.
 */
export function capabilityPackages(
  capabilities: readonly string[],
): readonly string[] {
  const packages = new Set<string>();
  for (const capability of capabilities) {
    for (const name of FEATURE_PACKAGES[capability] ?? [
      `@zudojs/${capability}`,
    ]) {
      packages.add(name);
    }
  }
  return [...packages];
}
