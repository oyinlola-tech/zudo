---
"@zudojs/permissions": minor
"@zudojs/security": minor
"@zudojs/crypto": minor
---

Closed four places where a security decision was made from input that could
not support it, and two where a revoked grant kept answering from a cache.
Every change here refuses more than it did before; none of them accepts
anything new.

**@zudojs/permissions**

- `createPermissionRegistry()` now has `subscribe(listener)`, the same change
  notifier `createRoleRegistry()` and `createPolicyRegistry()` already
  carried, and it fires on `define`, a `remove` that removed something, and
  `clear`. `createPermissionEngine({ expandImplied })` accepts the registry
  itself in place of a closure — pass `expandImplied: permissions` — and
  subscribes to it, so revoking an implication drops the decisions that were
  cached while it stood. Previously `permissions.remove("post:admin")` left
  every `post:delete` it had implied answering `true` for the whole cache TTL,
  while `skipCache: true` correctly said `false`. A bare
  `(permission) => permissions.expandImplied(permission)` still works, but it
  cannot announce a change, so an engine given one now caches no decisions
  rather than serving one made under a revoked implication.
- An engine with a `roleResolver` or a `permissionResolver` no longer caches
  decisions by default. A resolver reads authorization state the engine does
  not own and cannot see change, and none of it was in the cache key, so a
  grant withdrawn upstream kept being served until the entry expired. To get
  caching back, supply the new `resolverCacheKey` — a function of the actor
  returning something that changes whenever the resolver's answer for that
  actor could change (a grants-table version, an `updatedAt` stamp).
  Returning `undefined` leaves that actor uncached. Engines without a resolver
  are unaffected.
- The README's request-metadata example imported `requireCurrentTenant` from
  `@zudojs/tenancy`, which does not export it; it now uses
  `createContextManager({ storage: getDefaultStorage() }).requireCurrentTenant().id`,
  which is where the method actually lives.

**@zudojs/security**

- `extractClientIp` no longer reads `X-Forwarded-For` when the chain is
  shorter than the configured `trustProxy` count. Such a chain did not pass
  through the proxies whose entries make it trustworthy, and the index clamp
  landed on the entry the client wrote — so with `trustProxy: 2` a request
  arriving at an inner hop with `X-Forwarded-For: 1.2.3.4` was rate-limited as
  `1.2.3.4`, and rotating that value gave the caller a fresh bucket each time.
  Short chains now fall through to `x-real-ip` and then `remoteAddress`.
  Chains at or above the configured length behave exactly as before.
- `createCsrfProtection` and `requiresCsrfProtection` reject a `methods` list
  that is empty, not an array, or contains a blank entry, with
  `ConfigurationError`. `methods: []` used to turn CSRF off for every request
  in silence, which is what
  `process.env.CSRF_METHODS?.split(",").filter(Boolean) ?? []` produces when
  the variable is unset. Omit `methods` for the defaults.
- `containsTraversal` and `validateRequestTarget` strip RFC 3986 path
  parameters before segmenting, so `/a/..;/b` is reported as traversal like
  every other spelling of it. Tomcat, Jetty and several reverse-proxy pairings
  resolve it to `/a/../b`. `....//` is still not a traversal, and nothing that
  was already caught has changed.
- `sanitizeObject` rejects a `maxDepth` that is not an integer of 1 or more
  with `ConfigurationError`. `maxDepth: 0` discarded the argument itself and
  returned `undefined` under a non-optional `T`.

**@zudojs/crypto**

- A provider's declared `capabilities` are now consulted before every
  operation. A provider declaring `signing: false` had `sign` called anyway;
  it now throws a `CryptoError` naming the capability and the operation.
  `hash`, `hmac`, `encryption`, `signing`, `random`, `keyDerivation` and
  `passwordHashing` are all checked, including through `verifyPassword`,
  which raises rather than reporting a missing capability as a wrong password.
  A provider that declares every capability it implements is unaffected.
- `setDefaultCryptoProvider` checks that all twelve provider methods are
  functions and that every capability flag is a boolean, so installing a
  partial object fails at the call that installs it instead of throwing a
  `TypeError` from inside whichever operation reached the missing method
  first. A rejected provider is not installed.
- New exports: `assertProviderCapability`, `assertCryptoProvider`,
  `assertRandomCapability`, `assertHashCapability`, `assertHmacCapability`,
  `assertPasswordHashingCapability` and `CRYPTO_PROVIDER_METHODS`, for
  anyone writing their own provider or wrapper.
