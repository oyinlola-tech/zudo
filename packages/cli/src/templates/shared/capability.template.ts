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
 * {@link resolveProjectCapabilities} is the single source of truth for what
 * a new project was created with: `zudojs create` records exactly this list
 * as `capabilities` in `.zudojs/manifest.json` and as `zudojs.features` in
 * every backend app's package.json, and {@link capabilityPackages} gives the
 * packages that back it, so a declared feature is always installed.
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
 * The capability ids a scaffolded project was created with: the `enable*`
 * flags in manifest order, then the selected capabilities that have no flag
 * (`events`, `security`) in the order they were chosen.
 *
 * Those two used to reach the manifest but not package.json, so
 * `--capabilities events,cqrs` recorded `["cqrs","events"]` in one and
 * `["cqrs"]` in the other. A frontend-only project has no backend app to
 * carry a capability and records none.
 */
export function resolveProjectCapabilities(
  options: ScaffoldOptions,
): readonly string[] {
  if (options.projectType === "frontend") return [];

  const capabilities = CAPABILITY_FLAGS.filter(
    ([, flag]) => options[flag] === true,
  ).map(([capability]) => capability);

  for (const capability of options.capabilities ?? []) {
    if (!capabilities.includes(capability)) capabilities.push(capability);
  }

  return capabilities;
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
