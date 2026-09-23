# @zudojs/feature-flags

Feature flag system with deterministic rollouts, rule engine, providers, variants, snapshots, and evaluation context.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-feature-flags](https://zudojs.oyinlola.site/docs/packages-feature-flags) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-feature-flags.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

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
  defaultValue: FeatureFlagValue; // used when the flag is on and no rule decides
  offValue?: FeatureFlagValue; // served while the flag is off (see below)
  state?: "active" | "disabled" | "archived" | "draft";
  visibility?: "client" | "server";
  rules?: FeatureFlagRule[]; // evaluated in order, first match wins
  dependencies?: string[]; // other flags that must be on for the same context
  metadata?: { expiresAt?: Date /* … */ };
}
```

`expiresAt` may also arrive as an ISO string or a timestamp — a flag loaded
from JSON does — and expires the flag just the same.

### Off means off

A flag is **off** when it is killed (`enabled: false` or `state:
"disabled"`), a draft, archived, expired, or blocked by a dependency. An off
flag runs no rules and serves its **off value**:

1. `offValue`, when the flag declares one;
2. otherwise `false` for a boolean flag;
3. otherwise `defaultValue` (a string, number or object flag has no natural
   "off", so the baseline value is served).

So `{ key: "x", enabled: false, defaultValue: true }` evaluates to `false`
and `isEnabled("x")` is `false`. Before 1.4 an off flag served
`defaultValue`, which made the kill switch fail open for any flag whose
default was `true`. For a variant flag, declare the variant to fall back to:

```typescript
{ key: "checkout", enabled: false, defaultValue: "new", offValue: "control",
  rules: [{ type: "variant", variants: [{ key: "new", weight: 50 }, { key: "control", weight: 50 }] }] }
```

## Rules

| Type         | Matches when                                    |
| ------------ | ----------------------------------------------- |
| `static`     | always                                          |
| `user`       | `context.userId` is in `users`                  |
| `tenant`     | `context.tenantId` is in `tenants`              |
| `attribute`  | `attribute` compared to `value` with `operator`; serves `result` (default `true`) |
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
accidentally (or deliberately) target everyone through the prototype chain.

An attribute rule's `value` is the comparison operand; what a match serves is
`result`, which defaults to `true`. On a non-boolean flag set `result`:

```typescript
{ key: "theme", enabled: true, defaultValue: "light",
  rules: [{ type: "attribute", attribute: "plan", operator: "equals", value: "pro", result: "dark" }] }
```

An attribute rule without `result` on a non-boolean flag is skipped, rather
than serving `true` from a string flag.

A `matches` pattern matches nothing, instead of throwing or hanging, when it
does not compile, is longer than 512 characters, or could backtrack
catastrophically — a repeated group that itself repeats or alternates
(`(a+)+`, `(a|aa)*`, `(\w+\s?){2,}`) or a backreference. It is tested only
against values up to 1,024 characters. Patterns used for targeting, such as
`@example\.com$` or `^(beta|alpha)-`, are unaffected.

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
dependency is **on for the same context**: the prerequisite is evaluated —
state, expiry, rules, rollout, and its own dependencies — and must not be
disabled, draft, archived or expired, nor evaluate to `false`, `null` or
`undefined`. A prerequisite rolled out to 10% keeps its dependents off for the
other 90%. Otherwise the result is `dependency_disabled` with the flag's
off value. Cycles resolve to disabled; a shared dependency reached down two
branches is not a cycle.

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

`createCachedProvider` holds at most `maxEntries` keys (default 1,000),
sweeping expired entries and then evicting the oldest. `createFeatureFlags`
remembers a key the provider does not know for `missingFlagTtlMs` (default
30 s, at most 1,000 keys; `0` disables it), so request-supplied keys cannot
turn every evaluation into a remote round trip. The memory is dropped on
every reload.

A provider that fails is left alone for `providerCooloffMs` (default 5 s;
`0` disables it) before it is probed again, so an outage costs one pair of
calls per window instead of two per evaluation. The first successful call
closes the window, and `refresh()` always probes.

`createEnvironmentProvider` parses `true`/`false` and numbers; anything else,
including an empty `FEATURE_X=`, stays a string. Every flag it reads is
enabled.

Keys are the variable name without the prefix, **lower-cased with `_`
turned into `-`**: `FEATURE_NEW_CHECKOUT=true` is the flag `new-checkout`,
the same key a memory or remote provider uses, so an environment variable
overrides that flag inside a composite. `get()` normalises the key it is
asked for the same way, so `NEW_CHECKOUT` and `new_checkout` also find it.
Pass `keyFormat: "preserve"` to keep the variable's spelling (`NEW_CHECKOUT`),
which was the behaviour before 1.4.

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
| Flag disabled or draft           | `disabled`, the off value; `isEnabled` is `false`      |
| Flag archived or expired         | `expired`, the off value; `isEnabled` is `false`       |
| Dependency not satisfied         | `dependency_disabled`, the off value                   |
| Provider unreachable             | `error`, reported to `onError`; never enabled          |

"Unreachable" covers both `getAll()` and a `get()` for a flag not yet loaded:
a lookup the store could not answer is `error`, never `not_found`, and does
not throw `FeatureFlagNotFoundError` under `throwOnMissing`.

An unreachable store never enables a flag. Set `throwOnProviderError: true`
to own the failure yourself instead.

`snapshot()` and `getAll()` reject with `FeatureFlagProviderError` when the
flags were never loaded: an empty `Map` cannot be told apart from "no flags
are configured", and shipping one to a browser turns an outage into every
flag being off. Once a load has succeeded they keep serving that data, even
if a later reload fails.

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
