# @zudojs/feature-flags

Feature flag system with deterministic rollouts, rule engine, providers, variants, snapshots, and evaluation context.

## Installation

```bash
npm install @zudojs/feature-flags
```

## Quick Start

Flags come from a **provider**; `createFeatureFlags` evaluates them against a
context.

```typescript
import {
  createFeatureFlags,
  createMemoryProvider,
} from "@zudojs/feature-flags";

const flags = createFeatureFlags({
  provider: createMemoryProvider([
    {
      key: "new-ui",
      enabled: true,
      defaultValue: false,
      rules: [{ type: "percentage", percentage: 10, value: true }],
    },
    {
      key: "beta-feature",
      enabled: true,
      defaultValue: false,
      rules: [{ type: "user", users: ["user-123"], value: true }],
    },
  ]),
});

await flags.isEnabled("beta-feature", { userId: "user-123" }); // true
await flags.isEnabled("new-ui", { userId: "user-456" }); // stable per user
```

`isEnabled` is strictly boolean: a flag whose value is a string, a number or
an object reports `false`. Use `get()` for a typed value, or `getBoolean(key,
fallback)` when a missing or unreachable flag should fall back to a value you
choose.

## Flag definition

```typescript
interface FeatureFlag {
  key: string;
  enabled: boolean; // the global kill switch
  defaultValue: FeatureFlagValue; // used whenever no rule decides
  state?: "active" | "archived" | "draft";
  visibility?: "client" | "server";
  rules?: FeatureFlagRule[]; // evaluated in order, first match wins
  dependencies?: string[]; // other flags that must be enabled
  metadata?: { expiresAt?: Date /* … */ };
}
```

`expiresAt` may also arrive as an ISO string or a timestamp — a flag loaded
from JSON does — and expires the flag just the same.

## Rules

| Type         | Matches when                                    |
| ------------ | ----------------------------------------------- |
| `static`     | always                                          |
| `user`       | `context.userId` is in `users`                  |
| `tenant`     | `context.tenantId` is in `tenants`              |
| `attribute`  | `attribute` compared to `value` with `operator` |
| `percentage` | the subject's bucket falls inside `percentage`  |
| `schedule`   | now is between `startAt` and `endAt`            |
| `variant`    | always, assigning a variant by weight           |

Rules are evaluated in declaration order and the first match wins. The
subject for `percentage` and `variant` is `userId`, then `tenantId`, then
`sessionId`, then `"anonymous"`.

Operators: `equals`, `not_equals`, `contains`, `starts_with`, `ends_with`,
`in`, `not_in`, `greater_than`, `greater_than_or_equal`, `less_than`,
`less_than_or_equal`, `exists`, `matches`.

Attribute paths use dot notation and are resolved against the context first,
then `context.attributes`. Only **own** properties are traversed:
`__proto__`, `constructor` and `prototype` never resolve, so a rule cannot
accidentally (or deliberately) target everyone through the prototype chain. A
`matches` pattern that does not compile, or is longer than 512 characters,
matches nothing instead of throwing.

## Rollouts and variants

```typescript
import { getBucket, isInRollout, hashString } from "@zudojs/feature-flags";
```

Bucketing is deterministic: `hash(flagKey + ":" + subject)` over 10,000
buckets, so the same subject always lands in the same bucket for the same
flag, and raising a percentage never removes anyone already inside it.
Variant weights are applied over those same buckets, so a 90/10 split really
is 90/10.

## Dependencies

A flag may declare `dependencies`. It evaluates normally only when every
dependency — transitively — exists and is enabled; otherwise the result is
`dependency_disabled` with the declared default. Cycles resolve to disabled;
a shared dependency reached down two branches is not a cycle.

`evaluateFlag()` on its own has no registry and cannot resolve dependencies,
so it reports `dependency_disabled` for any flag that declares them unless
the caller passes `{ dependenciesSatisfied: true }`.

## Providers

```typescript
import {
  createMemoryProvider,
  createEnvironmentProvider,
  createCompositeProvider,
  createCachedProvider,
} from "@zudojs/feature-flags";

const provider = createCachedProvider(
  createCompositeProvider([
    createEnvironmentProvider({ prefix: "FEATURE_" }),
    remoteProvider,
  ]),
  { ttl: 30_000 },
);
```

`createMemoryProvider` returns a typed provider with `set`, `delete` and
`setAll`, and it announces every change to subscribers. `createCachedProvider`
and `createCompositeProvider` forward those announcements — the cache is
dropped first, and the composite announces its merged view — so the stack
above still propagates a change made to `remoteProvider`.

`createEnvironmentProvider` parses `true`/`false` and numbers; anything else,
including an empty `FEATURE_X=`, stays a string.

## Change propagation

`createFeatureFlags` subscribes to the provider when it offers `subscribe()`,
so a flag flipped at the source reaches an already-loaded instance without a
manual `refresh()`. Call `flags.close()` to unsubscribe, and
`flags.refresh()` to reload explicitly from a provider that cannot announce
changes.

## Failure behaviour

| Situation                        | Result                                                 |
| -------------------------------- | ------------------------------------------------------ |
| Flag not found                   | `not_found`, value `undefined`; `isEnabled` is `false` |
| Flag not found, `throwOnMissing` | throws `FeatureFlagNotFoundError`                      |
| Flag disabled or draft           | `disabled`, the declared default                       |
| Flag archived or expired         | `expired`, the declared default                        |
| Dependency not satisfied         | `dependency_disabled`, the declared default            |
| Provider unreachable             | `error`, reported to `onError`; never enabled          |

"Unreachable" covers both `getAll()` and a `get()` for a flag not yet loaded:
a lookup the store could not answer is `error`, never `not_found`, and does
not throw `FeatureFlagNotFoundError` under `throwOnMissing`.

An unreachable store never enables a flag. Set `throwOnProviderError: true`
to own the failure yourself instead.

```typescript
const flags = createFeatureFlags({
  provider,
  onError: (error, source) => logger.error({ error, source }, "flag store"),
});
```

## Snapshots

```typescript
const snapshot = await flags.snapshot({ userId });
```

Only flags explicitly marked `visibility: "client"` are included — a snapshot
is shipped to a browser, so a flag that declares no visibility is withheld.

## Errors

`FeatureFlagError` is the base: `FeatureFlagNotFoundError` ·
`FeatureFlagProviderError` · `FeatureFlagEvaluationError` ·
`FeatureFlagRuleError` · `FeatureFlagDependencyError` ·
`FeatureFlagConfigurationError` · `FeatureFlagTypeError`.

## Use Cases

- Gradual feature rollouts
- A/B testing
- Kill switches
- Beta feature access
