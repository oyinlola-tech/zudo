---
title: "@zudojs/feature-flags — Feature Flag System Documentation"
description: "Complete documentation for @zudojs/feature-flags — deterministic rollouts, rule engine, providers, variants, and evaluation context for the Zudojs framework."
source: https://zudojs.oyinlola.site/docs/packages-feature-flags
---

v1.4.0

# @zudojs/feature-flags

Feature flag system with deterministic rollouts, a rule engine, multiple providers, variants, snapshots, and evaluation context. Toggle features without redeploying.

FEATURE FLAGS ROLLOUTS TARGETING VARIANTS

## INSTALLATION

```ts
// npm
npm install @zudojs/feature-flags

// pnpm
pnpm add @zudojs/feature-flags

// yarn
yarn add @zudojs/feature-flags
```

> **Peer Dependencies:** @zudojs/feature-flags depends on @zudojs/errors (v1.3.0) for its error hierarchy and @zudojs/types (v1.2.0) for its shared type guards.

## WHAT IT DOES

`@zudojs/feature-flags` gives you a complete feature flag system. It defines:

- **Evaluation engine** — deterministic flag evaluation with context-aware targeting
- **Rule engine** — 7 rule types: static, user, tenant, attribute, percentage, schedule, variant
- **Multiple providers** — in-memory, environment variables, composite, and cached providers
- **Rollout bucketing** — deterministic FNV-1a hashing for consistent percentage rollouts
- **Variant assignment** — weighted variant assignment for A/B testing
- **Dependency resolution** — a dependent flag is on only where each prerequisite evaluates on for the same context (state, expiry, rules, rollout), with cycle detection
- **Snapshots** — evaluate all flags at once for a given context

> **Core Principle:** Feature flags are evaluated locally — no network calls at evaluation time. Providers fetch definitions; the evaluator runs synchronously with deterministic results.

## WHERE IT SITS

TRANSPORT LAYER (HTTP, CLI, WebSocket)

FEATURE FLAGS (@zudojs/feature-flags)

APPLICATION LAYER (CQRS, Modules, Services)

INFRASTRUCTURE (Container, Config, Logger)

Feature flags sit between transport and application layers. HTTP handlers check flags before executing routes. Application services gate features. Infrastructure observes for logging.

## DEPENDENCIES

| Package | Version | Purpose |
| --- | --- | --- |
| @zudojs/errors | 1.3.0 | Feature flag error hierarchy (FeatureFlagError, NotFoundError, ProviderError, etc.) |
| @zudojs/types | 1.2.0 | Shared type guards (`isPlainObject`, re-exported here and deprecated in favour of importing it from @zudojs/types) |

## CORE TYPES

### FeatureFlagValue

A feature flag value — boolean for simple toggles, string/number for variants.

```ts
type FeatureFlagValue = boolean | string | number | null | Record<string, unknown>;
```

### FeatureFlagState

Feature flag lifecycle state.

```ts
type FeatureFlagState = "active" | "disabled" | "archived" | "draft";
```

### FeatureFlagVisibility

Feature flag visibility scope.

```ts
type FeatureFlagVisibility = "server" | "client";
```

### FeatureFlagContext

Context passed to flag evaluators for targeting decisions.

```ts
interface FeatureFlagContext {
  readonly userId?: string;
  readonly tenantId?: string;
  readonly sessionId?: string;
  readonly environment?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}
```

### FeatureFlag

A complete feature flag definition.

```ts
interface FeatureFlag {
  readonly key: string;
  readonly defaultValue: FeatureFlagValue;
  readonly enabled: boolean;       // the kill switch
  readonly offValue?: FeatureFlagValue; // served while the flag is off (new in v1.4.0)
  readonly description?: string;
  readonly state?: FeatureFlagState;
  readonly visibility?: FeatureFlagVisibility;
  readonly rules?: Readonly<FeatureFlagRule[]>;
  readonly variants?: Readonly<FeatureFlagVariant[]>;
  readonly dependencies?: Readonly<string[]>;
  readonly metadata?: FeatureFlagMetadata;
}
```

### When a flag is off

A flag is *off* when it has `enabled: false` or `state: "disabled"`, is a `"draft"`, is `"archived"` or past `metadata.expiresAt`, or is blocked by a dependency. An off flag skips its rules and serves its **off value**:

- 1. `offValue`, when the flag declares one;
- 2. otherwise `false` for a boolean flag, so the kill switch always turns a boolean feature off;
- 3. otherwise `defaultValue` for a string, number or object flag, which has no natural "off".

```ts
import { createFeatureFlags, createMemoryProvider } from "@zudojs/feature-flags";

const flags = createFeatureFlags({
  provider: createMemoryProvider([
    { key: "new-checkout", enabled: false, defaultValue: true },
    { key: "theme", enabled: false, defaultValue: "blue", offValue: "grey" },
    { key: "legacy-api", enabled: false, defaultValue: false, offValue: true },
  ]),
});

const checkout = await flags.evaluate("new-checkout");
console.log(checkout.value, checkout.reason);         // false disabled
console.log((await flags.evaluate("theme")).value);   // grey
console.log(await flags.isEnabled("legacy-api"));     // true
```

> **Changed in v1.4.0 (behaviour change):** the kill switch now fails closed. Up to v1.3.x an off flag served `defaultValue`, so `{ enabled: false, defaultValue: true }` stayed **on** for everyone, and `state: "disabled"` was not honoured at all. If you relied on a killed flag serving `true`, declare `offValue: true`. `defaultValue` is still what an *on* flag serves when no rule matches.

### FeatureFlagMetadata

Metadata about a feature flag.

```ts
interface FeatureFlagMetadata {
  readonly owner?: string;
  readonly team?: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  readonly expiresAt?: Date;
  readonly ticket?: string;
  readonly tags?: Readonly<string[]>;
}
```

## RULE TYPES

Rules determine how flags are evaluated. Each rule type targets differently.

| Rule Type | Interface | Description |
| --- | --- | --- |
| static | FeatureFlagStaticRule | Always returns its value. No targeting. |
| user | FeatureFlagUserRule | Targets specific users by ID list. |
| tenant | FeatureFlagTenantRule | Targets specific tenants by ID list. |
| attribute | FeatureFlagAttributeRule | Targets by attribute matching with operators. |
| percentage | FeatureFlagPercentageRule | Percentage-based rollout. Deterministic per subject. |
| schedule | FeatureFlagScheduleRule | Time-windowed rule. Enabled only within date range. |
| variant | FeatureFlagVariantRule | Assigns a variant key based on weight. |

### Rule Interfaces

```ts
// Static — always returns its value
interface FeatureFlagStaticRule {
  readonly type: "static";
  readonly value: FeatureFlagValue;
}

// User — targets specific users by ID
interface FeatureFlagUserRule {
  readonly type: "user";
  readonly users: Readonly<string[]>;
  readonly value: FeatureFlagValue;
}

// Tenant — targets specific tenants by ID
interface FeatureFlagTenantRule {
  readonly type: "tenant";
  readonly tenants: Readonly<string[]>;
  readonly value: FeatureFlagValue;
}

// Attribute — targets by attribute matching
interface FeatureFlagAttributeRule {
  readonly type: "attribute";
  readonly attribute: string;
  readonly operator: FeatureFlagOperator;
  readonly value: unknown;
  readonly result?: FeatureFlagValue; // served on match, default true
}

// Percentage — deterministic rollout
interface FeatureFlagPercentageRule {
  readonly type: "percentage";
  readonly percentage: number;
  readonly value: FeatureFlagValue;
}

// Schedule — time-windowed
interface FeatureFlagScheduleRule {
  readonly type: "schedule";
  readonly startAt: string;
  readonly endAt: string;
  readonly value: FeatureFlagValue;
}

// Variant — weighted variant assignment
interface FeatureFlagVariantRule {
  readonly type: "variant";
  readonly variants: Readonly<FeatureFlagVariant[]>;
}

interface FeatureFlagVariant {
  readonly key: string;
  readonly weight: number;
}

// Union of all rule types
type FeatureFlagRule =
  | FeatureFlagStaticRule
  | FeatureFlagUserRule
  | FeatureFlagTenantRule
  | FeatureFlagAttributeRule
  | FeatureFlagPercentageRule
  | FeatureFlagScheduleRule
  | FeatureFlagVariantRule;
```

### Attribute Operators

```ts
type FeatureFlagOperator =
  | "equals"          // exact match
  | "not_equals"      // not equal
  | "contains"        // string contains
  | "starts_with"     // string prefix
  | "ends_with"       // string suffix
  | "in"              // value in list
  | "not_in"          // value not in list
  | "greater_than"    // numeric >
  | "greater_than_or_equal" // numeric >=
  | "less_than"       // numeric <
  | "less_than_or_equal" // numeric <=
  | "exists"          // attribute exists
  | "matches";        // regex match; unsafe (nested-repetition) patterns and inputs > 1024 chars never match
```

### Rule Evaluation

```ts
interface RuleEvaluationResult {
  readonly matched: boolean;
  readonly value?: FeatureFlagValue;
  readonly variant?: string;
}

function evaluateRule(
  rule: FeatureFlagRule,
  context: FeatureFlagContext,
  flagKey: string,
): RuleEvaluationResult;
```

> **First Match Wins:** Rules are evaluated in order. The first matching rule determines the flag value. If no rules match, the `defaultValue` is used.

## EVALUATION

### FeatureFlagEvaluation

The result of evaluating a feature flag.

```ts
interface FeatureFlagEvaluation<TValue extends FeatureFlagValue = FeatureFlagValue> {
  readonly key: string;
  readonly value: TValue;
  readonly reason: FeatureFlagEvaluationReason;
  readonly matchedRule?: number;
  readonly variant?: string;
  readonly defaulted: boolean;
}
```

### Evaluation Reasons

| Reason | Meaning |
| --- | --- |
| default | No rules matched; used defaultValue |
| static | A static rule matched |
| rule_match | A rule matched by condition |
| target_match | User or tenant rule matched |
| percentage_rollout | Percentage rollout matched |
| variant_assignment | Variant assigned |
| disabled | Flag is off: `enabled: false`, `state: "disabled"` or `state: "draft"`. Serves the off value. |
| not_found | Flag does not exist |
| error | Provider unreachable (`provider.getAll()` or `provider.get()` threw); reported to `onError`. This is how `evaluate()` reports an outage — `snapshot()` and `getAll()` reject instead. |
| dependency_disabled | A required dependency is not on for this context (disabled, draft, archived, expired, or evaluates false). Serves the off value. |
| expired | Flag is `state: "archived"` or `metadata.expiresAt` is in the past (a schedule rule outside its window simply does not match). Serves the off value. |

### evaluateFlag

Evaluate a single feature flag against a context.

```ts
function evaluateFlag<TValue extends FeatureFlagValue = FeatureFlagValue>(
  flag: FeatureFlag,
  context?: FeatureFlagContext,
): FeatureFlagEvaluation<TValue>;
```

### Using evaluateRule Directly

Evaluate a single rule against a context.

```ts
import { evaluateRule } from "@zudojs/feature-flags";

const result = evaluateRule(
  { type: "percentage", percentage: 50, value: true },
  { userId: "user-123" },
  "my-flag",
);
// result: { matched: boolean, value?: boolean }
```

## MAIN API — createFeatureFlags

### Options

```ts
interface FeatureFlagsOptions {
  readonly provider: FeatureFlagProvider;
  readonly defaultContext?: FeatureFlagContext;
  readonly throwOnMissing?: boolean;  // default: false
  readonly onError?: (error: unknown, source: string) => void;
  readonly throwOnProviderError?: boolean;  // default: false
  readonly missingFlagTtlMs?: number;  // default: 30_000 — how long a missing flag is remembered
  readonly providerCooloffMs?: number;  // default: 5_000 — how long a failing provider is left alone
}
```

| Option | Default | What it does |
| --- | --- | --- |
| throwOnMissing | `false` | Throw `FeatureFlagNotFoundError` instead of reporting `reason: "not_found"`. |
| onError | none | Receives every contained provider failure, with the call that produced it (`FeatureFlagProvider.getAll`, `.get`, `.refresh`). |
| throwOnProviderError | `false` | Rethrow provider failures instead of containing them, so an unreachable store is a hard failure the caller handles. |
| missingFlagTtlMs | `30_000` | How long a key the provider does not know is remembered as missing. At most 1,000 keys; dropped on every reload. `0` asks the provider on every evaluation. |
| providerCooloffMs | `5_000` | How long a *failing* provider is left alone before it is probed again. `0` restores the pre-v1.3.0 behaviour of calling the provider on every evaluation. A successful call closes the window at once, and `refresh()` always probes regardless. |

New in v1.3.0, `providerCooloffMs` exists because an outage used to cost two remote round trips per evaluation: every single `evaluate()` re-ran `getAll()` and `get(key)` against the store that had just failed, each waiting out its own timeout. With the default 5,000 ms window the provider is probed at most once per window while it is down.

### Returned API

```ts
function createFeatureFlags(options: FeatureFlagsOptions): {
  // Check if a flag is enabled (boolean shorthand)
  isEnabled(key: string, context?: FeatureFlagContext): Promise<boolean>;

  // Get a flag value with optional type parameter
  get<T extends FeatureFlagValue = FeatureFlagValue>(
    key: string, context?: FeatureFlagContext
  ): Promise<T | undefined>;

  // Get a boolean flag with a default fallback
  getBoolean(
    key: string, defaultValue: boolean, context?: FeatureFlagContext
  ): Promise<boolean>;

  // Full evaluation with reason and metadata
  evaluate<T extends FeatureFlagValue = FeatureFlagValue>(
    key: string, context?: FeatureFlagContext
  ): Promise<FeatureFlagEvaluation<T>>;

  // Evaluate every client-visible flag at once.
  // Rejects with FeatureFlagProviderError if the flags never loaded.
  snapshot(context?: FeatureFlagContext): Promise<ReadonlyMap<string, FeatureFlagEvaluation>>;

  // Refresh flags from provider
  refresh(): Promise<void>;

  // Get all flag definitions.
  // Rejects with FeatureFlagProviderError if the flags never loaded.
  getAll(): Promise<Readonly<FeatureFlag[]>>;

  // Stop listening for provider changes
  close(): void;
};
```

### When the provider is unreachable

The two halves of the API deliberately behave differently, and v1.3.0 widened the gap. Get this the wrong way round and a total outage ships to a browser as every flag being off.

| Call | Provider down, nothing ever loaded |
| --- | --- |
| evaluate() | **Resolves** with `reason: "error"`, `defaulted: true`. It does not throw. Unchanged in v1.3.0. |
| isEnabled() / get() / getBoolean() | **Resolve.** They delegate to `evaluate()`, so they fall back to `false`, `undefined` and the `defaultValue` you passed. |
| snapshot() | **Rejects** with `FeatureFlagProviderError`. Before v1.3.0 it resolved to an empty `Map`. |
| getAll() | **Rejects** with `FeatureFlagProviderError`. Before v1.3.0 it resolved to an empty array. |

> **Why the asymmetry:** an evaluation has somewhere to put the bad news — the `reason` field on the result it returns. A `Map` or an array has nowhere, and an empty one is indistinguishable from “no flags are configured”. So the bulk reads now fail loudly instead of quietly reporting an outage as a configuration state. `onError` still sees the underlying failure first, either way.

Two qualifications. Once a load has succeeded, `snapshot()` and `getAll()` keep serving that data even if a later reload fails — only a cold, never-loaded instance rejects. And a provider that genuinely holds no flags still resolves empty, because the load succeeded.

```ts
// Upgrading from v1.2.x: this used to be dead code on a cold outage.
try {
  const visible = await flags.snapshot(context);
  res.json(Object.fromEntries(visible));
} catch (error) {
  if (error instanceof FeatureFlagProviderError) {
    // Serve the last good payload, or fail the request —
    // but do not ship "{}" and call it the flag state.
    res.status(503).end();
    return;
  }
  throw error;
}
```

### Full Example

```ts
import { createFeatureFlags, createMemoryProvider } from "@zudojs/feature-flags";

const provider = createMemoryProvider([
  {
    key: "dark-mode",
    defaultValue: false,
    enabled: true,
    description: "Enable dark mode UI",
    state: "active",
    visibility: "client",
  },
  {
    key: "new-checkout",
    defaultValue: false,
    enabled: true,
    state: "active",
    visibility: "client",
    rules: [
      {
        type: "percentage",
        percentage: 25,
        value: true,
      },
    ],
  },
]);

const flags = createFeatureFlags({ provider });

// Simple boolean check
const darkMode = await flags.isEnabled("dark-mode");

// Get value with type
const checkout = await flags.get<boolean>("new-checkout");

// Full evaluation with reason
const result = await flags.evaluate("new-checkout", {
  userId: "user-42",
});
// result: { key, value, reason: "percentage_rollout", defaulted: false }

// Snapshot every client-visible flag. Both flags above declare
// visibility: "client"; a flag that does not is withheld, because
// a snapshot is what you ship to a browser.
// Rejects with FeatureFlagProviderError if the store never loaded.
const all = await flags.snapshot({ userId: "user-42" });
```

## PROVIDERS

Providers fetch feature flag definitions from a source. Chain them with composite and cached for production use.

### FeatureFlagProvider Interface

```ts
interface FeatureFlagProvider {
  get(key: string): Promise<FeatureFlag | undefined>;
  getAll(): Promise<Readonly<FeatureFlag[]>>;
  refresh?(): Promise<void>;
  subscribe?(listener: FeatureFlagChangeListener): Unsubscribe;
}

type FeatureFlagChangeListener = (flags: Readonly<FeatureFlag[]>) => void;
type Unsubscribe = () => void;
```

### createMemoryProvider

In-memory provider. Flags stored in a Map. Also exposes `set()` and `delete()`.

```ts
function createMemoryProvider(
  flags?: Readonly<FeatureFlag[]>
): FeatureFlagProvider & {
  set(flag: FeatureFlag): void;
  delete(key: string): boolean;
};
```

```ts
import { createMemoryProvider } from "@zudojs/feature-flags";

const provider = createMemoryProvider();
provider.set({
  key: "new-ui",
  defaultValue: false,
  enabled: true,
});
provider.delete("new-ui");
```

### createEnvironmentProvider

Reads `FEATURE_<KEY>` environment variables. Parses booleans, numbers, and strings automatically, and sets both `defaultValue` and `enabled: true` from the variable, so `FEATURE_X=false` is how you switch it off. The key is the variable name with the prefix removed, lower-cased, and `_` turned into `-`: `FEATURE_TASK_EXPORT` becomes the flag `"task-export"`, the same key a memory or remote provider uses, so the variable overrides that flag in a composite. `get()` normalizes the key it is asked for the same way, so `"TASK_EXPORT"`, `"task_export"` and `"task-export"` all find the flag.

```ts
interface EnvironmentProviderOptions {
  readonly prefix?: string;   // default: "FEATURE_"
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly keyFormat?: "kebab" | "preserve";  // default: "kebab"
}

function createEnvironmentProvider(
  options?: EnvironmentProviderOptions
): FeatureFlagProvider;
```

```ts
// FEATURE_DARK_MODE=true FEATURE_ROLLOUT_PERCENT=25
const provider = createEnvironmentProvider();
const flag = await provider.get("dark-mode");
// flag: { key: "dark-mode", enabled: true, defaultValue: true }
// get("DARK_MODE") finds the same flag; getAll() keys are "dark-mode", "rollout-percent"
```

> **Changed in v1.4.0:** up to v1.3.x the key kept its case (`FEATURE_TASK_EXPORT` was the flag `"TASK_EXPORT"`), so an environment variable never overrode the `"task-export"` flag from another provider. Only the keys returned by `getAll()` and `snapshot()` change; lookups by the old spelling still work. Pass `keyFormat: "preserve"` to keep the old keys, which also turns off the lookup normalization.

### createCompositeProvider

Queries providers in order. First provider to return a flag wins. `getAll()` merges with earlier providers taking priority.

```ts
function createCompositeProvider(
  providers: Readonly<FeatureFlagProvider[]>
): RefreshableFeatureFlagProvider; // forwards subscribe() from members that offer it
```

```ts
const provider = createCompositeProvider([
  createEnvironmentProvider(),  // highest priority
  createMemoryProvider(flags),  // fallback
]);
```

### createCachedProvider

Wraps a provider with in-memory TTL caching.

```ts
interface CachedProviderOptions {
  readonly ttl?: number;  // default: 30_000 (ms)
  readonly maxEntries?: number;  // default: 1000 cached flags
}

function createCachedProvider(
  inner: FeatureFlagProvider,
  options?: CachedProviderOptions
): RefreshableFeatureFlagProvider; // forwards subscribe() from the inner provider
```

```ts
const provider = createCachedProvider(
  createEnvironmentProvider(),
  { ttl: 60_000 }  // cache for 60 seconds
);
```

### Production Pattern

```ts
import {
  createFeatureFlags,
  createCompositeProvider,
  createCachedProvider,
  createEnvironmentProvider,
  createMemoryProvider,
} from "@zudojs/feature-flags";

const provider = createCachedProvider(
  createCompositeProvider([
    createEnvironmentProvider(),
    createMemoryProvider(flags),
  ]),
  { ttl: 30_000 }
);

const featureFlags = createFeatureFlags({
  provider,
  defaultContext: { environment: "production" },
  throwOnMissing: false,
  // Leave a failing store alone for 5 s instead of re-querying it
  // on every evaluation. 5_000 is the default; 0 disables the window.
  providerCooloffMs: 5_000,
  onError: (error, source) => console.error(source, error),
});
```

## REGISTRY

An in-memory feature flag registry with O(1) lookup by key.

### FeatureFlagRegistry Interface

```ts
interface FeatureFlagRegistry {
  get(key: string): FeatureFlag | undefined;
  getAll(): Readonly<FeatureFlag[]>;
  set(flag: FeatureFlag): void;
  setAll(flags: Readonly<FeatureFlag[]>): void;
  delete(key: string): boolean;
  has(key: string): boolean;
  readonly size: number;
}

function createFeatureFlagRegistry(
  flags?: Readonly<FeatureFlag[]>
): FeatureFlagRegistry;
```

```ts
import { createFeatureFlagRegistry } from "@zudojs/feature-flags";

const registry = createFeatureFlagRegistry([
  { key: "flag-a", defaultValue: true, enabled: true },
  { key: "flag-b", defaultValue: false, enabled: true },
]);

registry.has("flag-a");  // true
registry.get("flag-a");  // FeatureFlag object
registry.size;            // 2
```

## ROLLOUT UTILITIES

Deterministic FNV-1a hashing for consistent percentage rollouts.

### hashString

Compute a deterministic 32-bit unsigned hash using FNV-1a.

```ts
function hashString(value: string): number;
```

### getBucket

Compute a deterministic bucket for a flag rollout.

```ts
function getBucket(
  key: string,
  subject: string,
  buckets?: number,  // default: 10_000
): number;  // returns value in [0, buckets)
```

### isInRollout

Check whether a subject falls within a percentage rollout.

```ts
function isInRollout(
  key: string,
  subject: string,
  percentage: number,  // 0 to 100, supports decimals like 25.5
): boolean;
```

```ts
import { isInRollout, getBucket } from "@zudojs/feature-flags";

// Same user always gets the same result
isInRollout("new-feature", "user-42", 25);  // true or false, deterministic
isInRollout("new-feature", "user-42", 25);  // same result every time

// Check exact bucket
getBucket("new-feature", "user-42");  // e.g. 4217
```

> **Deterministic:** The same (flag key, subject) pair always produces the same bucket. This means users consistently see the same variant without server-side state.

## ATTRIBUTE HELPERS

### resolvePath

Safely resolve a dot-notation path from an object.

```ts
function resolvePath(obj: unknown, path: string): unknown;
```

```ts
resolvePath({ user: { country: "NG" } }, "user.country");  // "NG"
resolvePath({ user: {} }, "user.country");  // undefined
```

### matchAttribute

Evaluate an attribute rule against a context value.

```ts
function matchAttribute(
  actual: unknown,
  operator: FeatureFlagOperator,
  expected: unknown,
): boolean;
```

```ts
matchAttribute("NG", "equals", "NG");          // true
matchAttribute("Lagos", "contains", "Lag");    // true
matchAttribute(25, "greater_than", 18);     // true
matchAttribute("free", "in", ["free", "trial"]); // true
```

## ERROR HIERARCHY

All errors extend `FeatureFlagError` which extends `ApplicationError` from @zudojs/errors.

| Error Class | When Thrown |
| --- | --- |
| FeatureFlagNotFoundError | Requested flag does not exist and `throwOnMissing: true` |
| FeatureFlagProviderError | Provider fails to fetch or parse flag definitions. Since v1.3.0 also raised by `snapshot()` and `getAll()` when the flags were never loaded, and by any call under `throwOnProviderError: true`. |
| FeatureFlagEvaluationError | Evaluation encounters an error during rule processing |
| FeatureFlagRuleError | A flag rule is malformed or has invalid configuration |
| FeatureFlagDependencyError | Flag dependencies form a cycle |
| FeatureFlagConfigurationError | Flag configuration is invalid |
| FeatureFlagTypeError | Flag value has an unexpected type |

### Error Handling Pattern

```ts
import {
  FeatureFlagError,
  FeatureFlagNotFoundError,
  FeatureFlagProviderError,
} from "@zudojs/feature-flags";

try {
  // A bulk read: this is the call that raises
  // FeatureFlagProviderError on an unreachable store.
  const all = await flags.getAll();
} catch (error) {
  if (error instanceof FeatureFlagNotFoundError) {
    // Flag doesn't exist (throwOnMissing: true)
  } else if (error instanceof FeatureFlagProviderError) {
    // Provider failed
  } else if (error instanceof FeatureFlagError) {
    // Any other feature flag error
  }
}
```

Wrapping `isEnabled()`, `get()`, `getBoolean()` or `evaluate()` in a `try` for a provider failure catches nothing: they contain it and report `reason: "error"`. Read `evaluation.reason`, pass `onError`, or set `throwOnProviderError: true` if you want them to throw. Only `throwOnMissing: true` makes them raise `FeatureFlagNotFoundError`.

## DEPENDENCY RESOLUTION

Flags can depend on other flags. Dependencies are resolved recursively with cycle detection.

### Defining Dependencies

```ts
const flags = [
  {
    key: "base-feature",
    defaultValue: true,
    enabled: true,
  },
  {
    key: "advanced-feature",
    defaultValue: false,
    enabled: true,
    dependencies: ["base-feature"],  // requires base-feature to be enabled
    rules: [
      { type: "percentage", percentage: 50, value: true },
    ],
  },
];
```

### How It Works

- When evaluating `advanced-feature`, the evaluator checks `base-feature` first
- If `base-feature` is not on for the same context (disabled, draft, archived, expired, or evaluates false), the result reason is `dependency_disabled`
- Circular dependencies throw `FeatureFlagDependencyError`
- Dependencies are resolved via the same provider, not the registry

## UTILITY FUNCTIONS

### isPlainObject

```ts
function isPlainObject(value: unknown): value is Record<string, unknown>;
```

Re-export of `isPlainObject` from `@zudojs/types` (deprecated here; import it from types). Returns `false` for `Date` and `Map`.

### valuesEqual

```ts
function valuesEqual(
  a: FeatureFlagValue,
  b: FeatureFlagValue
): boolean;
```

## FULL INTEGRATION EXAMPLE

Complete working example combining providers, targeting, rollouts, variants, and error handling.

```ts
import {
  createFeatureFlags,
  createMemoryProvider,
  createEnvironmentProvider,
  createCompositeProvider,
  createCachedProvider,
  type FeatureFlag,
} from "@zudojs/feature-flags";

// 1. Define flags
const flags: FeatureFlag[] = [
  {
    key: "dark-mode",
    defaultValue: false,
    enabled: true,
    description: "Enable dark mode UI",
    state: "active",
    visibility: "client",
  },
  {
    key: "new-checkout",
    defaultValue: false,
    enabled: true,
    state: "active",
    rules: [
      { type: "user", users: ["user-1", "user-2"], value: true },
      { type: "percentage", percentage: 25, value: true },
    ],
  },
  {
    key: "pricing-tier",
    defaultValue: "free",
    enabled: true,
    state: "active",
    rules: [
      {
        type: "attribute",
        attribute: "plan",
        operator: "equals",
        value: "enterprise",
      },
    ],
    variants: [
      { key: "control", weight: 50 },
      { key: "treatment", weight: 50 },
    ],
  },
];

// 2. Create provider chain
const provider = createCachedProvider(
  createCompositeProvider([
    createEnvironmentProvider(),
    createMemoryProvider(flags),
  ]),
  { ttl: 30_000 }
);

// 3. Create feature flags instance
const featureFlags = createFeatureFlags({
  provider,
  defaultContext: { environment: "production" },
});

// 4. Use in your application
async function handleRequest(userId: string, plan: string) {
  const context = { userId, attributes: { plan } };

  // Simple boolean check
  if (await featureFlags.isEnabled("dark-mode", context)) {
    // apply dark mode
  }

  // Full evaluation
  const checkout = await featureFlags.evaluate("new-checkout", context);
  if (checkout.value) {
    // show new checkout flow
  }

  // Variant assignment
  const tier = await featureFlags.evaluate<string>("pricing-tier", context);
  if (tier.variant === "treatment") {
    // apply treatment pricing
  }

  // Snapshot all flags
  const allFlags = await featureFlags.snapshot(context);
  console.log(Object.fromEntries(allFlags));
}
```

## SOURCE LOCATION

Source Code

packages/feature-flags/src/

Test Suite

packages/feature-flags/tests/

Public API

src/index.ts

Dependencies

@zudojs/errors (1.3.0), @zudojs/types (1.2.0)

## COMPLETE EXPORT INDEX

Every name `@zudojs/feature-flags` exports from its package root at v1.4.2 — **55** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 55 exports**

Classes (8)

`FeatureFlagConfigurationError` `FeatureFlagDependencyError` `FeatureFlagError` `FeatureFlagEvaluationError` `FeatureFlagNotFoundError` `FeatureFlagProviderError` `FeatureFlagRuleError` `FeatureFlagTypeError`

Functions (17)

`createCachedProvider` `createCompositeProvider` `createEnvironmentProvider` `createFeatureFlagRegistry` `createFeatureFlags` `createMemoryProvider` `evaluateFlag` `evaluateRule` `getBucket` `hashString` `isInRollout` `isPlainObject` `matchAttribute` `mergeContext` `resolveDependencies` `resolvePath` `valuesEqual`

Interfaces (22)

`CachedProviderOptions` `EnvironmentProviderOptions` `EvaluateFlagOptions` `FeatureFlag` `FeatureFlagAttributeRule` `FeatureFlagContext` `FeatureFlagErrorOptions` `FeatureFlagEvaluation` `FeatureFlagMetadata` `FeatureFlagPercentageRule` `FeatureFlagProvider` `FeatureFlagRegistry` `FeatureFlags` `FeatureFlagScheduleRule` `FeatureFlagsOptions` `FeatureFlagStaticRule` `FeatureFlagTenantRule` `FeatureFlagUserRule` `FeatureFlagVariant` `FeatureFlagVariantRule` `MemoryFeatureFlagProvider` `RuleEvaluationResult`

Type aliases (8)

`FeatureFlagChangeListener` `FeatureFlagEvaluationReason` `FeatureFlagOperator` `FeatureFlagRule` `FeatureFlagState` `FeatureFlagValue` `FeatureFlagVisibility` `Unsubscribe`
