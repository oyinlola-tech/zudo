/**
 * Package tier definitions for Zudojs — the single source of truth.
 *
 * A package may depend only on packages of the same or a lower tier.
 *
 *   Tier 0  leaf            no internal dependencies
 *   Tier 1  foundation      building blocks
 *   Tier 2  application     composed domain services
 *   Tier 3  transport       delivery mechanisms
 *   Tier 4  dev experience  tooling built on everything else
 *
 * Both `scripts/architect-check.js` and `tests/architect/boundaries.test.ts`
 * import this map. Do not copy it — a duplicated map silently drifts, which
 * is how `authOauth` came to pass the vitest check while failing the script.
 */
export const TIERS = {
  errors: 0,
  types: 0,
  constants: 1,
  container: 1,
  logger: 1,
  crypto: 1,
  validation: 1,
  schema: 1,
  config: 1,
  middleware: 1,
  serialization: 1,
  events: 1,
  messaging: 1,
  lifecycle: 1,
  transactions: 1,
  permissions: 1,
  featureFlags: 1,
  plugins: 1,
  security: 1,
  tenancy: 1,
  docs: 1,
  cache: 1,
  storage: 1,
  adapters: 1,
  queue: 1,
  scheduler: 1,
  database: 1,
  observability: 1,
  core: 2,
  cqrs: 2,
  auth: 2,
  authOauth: 2,
  runtime: 2,
  openapi: 2,
  rpc: 2,
  api: 2,
  http: 3,
  cli: 3,
  testing: 4,
};

/** Converts a package name such as `@zudojs/auth-oauth` to its tier key. */
export function packageNameToKey(name) {
  return name
    .replace(/^@oyinlola141\/zudojs-/, "")
    .replace(/^@zudojs\//, "")
    .replace(/^zudojs-/, "")
    .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
