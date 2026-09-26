# @zudojs/crypto

## 1.4.0

### Minor Changes

- Round 12 security-group fixes from the academy package findings ([#41](https://github.com/oyinlola-tech/zudo/issues/41), [#76](https://github.com/oyinlola-tech/zudo/issues/76), [#84](https://github.com/oyinlola-tech/zudo/issues/84)–[#88](https://github.com/oyinlola-tech/zudo/issues/88), [#102](https://github.com/oyinlola-tech/zudo/issues/102), [#116](https://github.com/oyinlola-tech/zudo/issues/116), [#117](https://github.com/oyinlola-tech/zudo/issues/117), [#119](https://github.com/oyinlola-tech/zudo/issues/119)–[#122](https://github.com/oyinlola-tech/zudo/issues/122), [#139](https://github.com/oyinlola-tech/zudo/issues/139)).

  **@zudojs/crypto**

  - `encrypt()` refuses a caller-supplied AES-GCM `iv` that this process has already used under the same key (`CryptoError`, `ERR_CRYPTO_CIPHER`). GCM nonce reuse leaks plaintext XORs and the authentication key; omitting `iv` (a fresh random one per call) never trips the guard. `unsafeAllowIvReuse: true` opts out for replaying published test vectors. The guard is per process, a safety net rather than a uniqueness proof.
  - `hashPassword(password, { minLength })` opts into a minimum length; pass `PASSWORD_POLICY.MIN_LENGTH` (8) for the package policy. The default stays permissive so existing credentials can be re-hashed.
  - `sign`, `verify`, `signString` and `verifyString` accept a Node `KeyObject` (new `SignatureKeyMaterial` type), so the pair `generateEd25519KeyPair()` returns can be used without a cast (it always worked at runtime).
  - **Behaviour change (error class):** cryptographic parameter violations now throw `CryptoError` instead of `RangeError`: a short HMAC key (`ERR_CRYPTO_HASH`), an out-of-range scrypt/PBKDF2 work factor or salt (`ERR_CRYPTO_DERIVATION` from `derive*`/`generateSalt`, `ERR_CRYPTO_HASH` from `hashPassword`), a non-positive key length in `generateCryptoKey` (`ERR_CRYPTO_KEY`), and a password outside the length bounds (`ERR_CRYPTO_HASH` with `statusCode: 400`, `expose: true`). Code that matched `instanceof RangeError` for these must match `isCryptoError`/the code instead; `verifyPassword` still returns `false` rather than throwing. Argument-shape mistakes (a non-`Uint8Array` key, an unknown algorithm name, a non-integer random length) remain `TypeError`/`RangeError`.
  - `hmac()` handed a string key now says how to encode it (`new TextEncoder().encode(secret)`), and units are documented and exposed: `randomHex(n)` is characters, `randomBase64Url(n)` bytes, `generateCryptoKey(n)` bytes, and `CryptoKey` gains `byteLength` next to `length` (bits). `CryptoKey.bytes()` is documented as the raw accessor the providers use, gated by `extractable` only through `exportCryptoKey`.

  **@zudojs/auth**

  - `login()`, `refresh()` and `createSessionForUser()` embed `AuthUser.claims` in both tokens, and `createTokenPair()` takes a `claims` option. Reserved names (`sub`, `iat`, `exp`, `nbf`, `typ`, `jti`, `sid`, `roles`, `iss`, `aud`; exported as `RESERVED_JWT_CLAIMS`) are dropped, never overridden.
  - A `revocationStore` without `revokeIfNotRevoked` no longer falls back silently to the racy `isRevoked()` + `revoke()` path: `createAuthService()` emits a `SecurityWarning` through `process.emitWarning` (code `ZUDO_AUTH_RACY_REVOCATION`) at construction, and `requireAtomicRevocation: true` makes it throw `AuthConfigurationError` instead. Exported: `assertAtomicRevocationStore`, `RACY_REVOCATION_WARNING_CODE`.
  - Injectable time: `createAuthService({ clock })` and `TokenConfig.clock` (`{ now(): number }`, the `Clock` from `@zudojs/types`) drive token `iat`/`exp`, verification and lockout deadlines; `createMemorySessionStore`, `createMemoryTokenRevocationStore` and `createMemoryLoginAttemptStore` take the same `clock`, and `isTokenExpired(token, clock?)` accepts one. Expiry tests no longer need fake timers.

  **@zudojs/auth-oauth**

  - Provider requests use a ref'd deadline instead of `AbortSignal.timeout()`, whose unref'd timer let a one-shot script exit with code 13 ("unsettled top-level await") before the timeout fired. The deadline also races the fetch and the body read, so a caller-supplied `config.fetch` that ignores `signal` still ends in `OAuthNetworkError`.
  - README: how to test against a local fake (the SSRF guard rejects `127.0.0.1` token/user-info URLs; keep an `https` URL and route it with `config.fetch`).

  **@zudojs/security**

  - `createRateLimiter` no longer copies a key's whole hit log on every check. Expiry is a binary search over an ordered log with amortised compaction, so a check costs O(log `max`) instead of O(`max`); a limiter with `max: 1_000_000` is as cheap per request as one with `max: 300`. Behaviour (sliding window, `remaining`, `resetAt`, `getCount`) is unchanged.

  **@zudojs/permissions**

  - New `TypedPermissionString` (`` `${string}:${string}` ``) for call sites that want the compiler to insist on `resource:action`; `PermissionString` stays `string` for compatibility. `isValidPermission()` now narrows to it, and `toPermissionString()` validates and brands a runtime string (throws `InvalidPermissionError`).

  **@zudojs/tenancy**

  - `createTenantCacheScope(tenantId, key)` returns `{ namespace: "tenant.<id>", key }`, the shape `@zudojs/cache` accepts (`cache.get(scope.key, { namespace: scope.namespace })`); `createTenantCacheKey`'s `tenant:<id>:<key>` is rejected by the cache because key parts may not contain `:`. Also `createTenantCacheNamespace` and `TENANT_CACHE_PART_PATTERN`. A key outside the cache alphabet throws `ValidationError`.
  - **Response body change:** every refusal from the tenancy middleware now carries a machine-readable `code` next to `error` (`ERR_TENANT_NOT_FOUND`, `ERR_TENANT_REQUIRED`, `ERR_TENANT_FORBIDDEN`, `ERR_TENANT_UNAVAILABLE`, `ERR_TENANT_RESOLUTION_CONFLICT`, `ERR_TENANT_RESOLUTION_FAILED`; exported as `TENANCY_RESPONSE_CODE`), matching the `{ error, code }` shape `@zudojs/http` uses, so a tenant 404 is distinguishable from an application 404. `createNotFound`/`createForbidden`/`createUnauthorized`/`createBadRequest` take an optional `code`.

  **@zudojs/feature-flags**

  - `percentage` and `variant` rules take `bucketBy: "userId" | "tenantId" | "sessionId"` to pin the rollout subject. Without it the subject is still `userId`, then `tenantId`, then `sessionId`, then `"anonymous"`, which split members of one tenant whenever the context carried both ids. With `bucketBy` set, a context missing that field does not match the rule. `resolveRolloutSubject` is exported.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.4.0
  - @zudojs/constants@1.2.0

## 1.3.3

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2
  - @zudojs/constants@1.1.4

## 1.3.2

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1
  - @zudojs/constants@1.1.3

## 1.3.1

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0
  - @zudojs/constants@1.1.2

## 1.3.0

### Minor Changes

- Closed four places where a security decision was made from input that could
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

### Patch Changes

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/constants@1.1.1

## 1.2.0

### Minor Changes

- Round 10 security fixes:

  - CRYPTO-01: new scrypt password hashes default to N=2^14, r=8, p=5 (the OWASP row for N=2^14; p=1 is only adequate at N=2^17). `hashPassword` and the node provider's `hashPassword` refuse a cost below the new `PASSWORD_HASH.SCRYPT.MIN_COST` (16 384) and throw `RangeError`. Previously `cost: 2` was accepted. Stored hashes with a smaller cost still verify. The new constant `PASSWORD_HASH.SCRYPT.PASSWORD_PARALLELIZATION` (5) is the password default. `PASSWORD_HASH.SCRYPT.PARALLELIZATION` stays 1, so keys from `deriveScrypt` do not change. The comment that claimed p=1 was OWASP-compliant has been corrected.
  - New helper `assertNewHashCost`.

### Patch Changes

- Updated dependencies [`d2b01bf`, `d2b01bf`]:
  - @zudojs/constants@1.1.0
  - @zudojs/errors@1.1.0

## 1.1.0

### Minor Changes

- - `derivePbkdf2`, `deriveScrypt`, `validatePbkdf2Options`, `validateScryptOptions` and the Node provider's `deriveKey` now enforce the upper bounds in `PASSWORD_HASH.LIMITS` (scrypt cost ≤ 2^20, block size ≤ 32, parallelization ≤ 16, `128 * cost * blockSize` ≤ 1 GiB, PBKDF2 iterations ≤ 10 000 000). Previously the scrypt memory "bound" was computed from the requested cost, so a cost read from configuration could allocate gigabytes or run for minutes.
  - New `PASSWORD_HASH.LIMITS.MAX_DERIVED_KEY_BYTES` (1024) caps `keyLength` for key derivation; password hashes keep their separate 64-byte bound.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/constants@1.0.1

> Note: this changelog was corrected. An earlier revision opened with a
> `1.0.0` entry (describing a package rename) that never shipped; the
> package is published at `0.1.0`. The `0.1.1`/`0.1.2` entries below
> predate the monorepo-wide realignment to `0.1.0` and are kept for history.

## Unreleased

### Security hardening (audit round 5)

Breaking: unimplemented members were removed from `CryptoAlgorithm`
(`AES_256_CBC`, `CHACHA20_POLY1305`, `ARGON2ID`, `X25519`); `EncryptionAlgorithm`
and `KeyDerivationAlgorithm` no longer list them either.

- AES-256-GCM: enforce 16-byte authentication tags and 12-byte IVs at the provider, `decrypt` and `decryptEnvelope`; reject foreign algorithm labels; all cipher failures are `CryptoError` (`ERR_CRYPTO_CIPHER`) with the Node error as `cause`.
- Random: `randomInt` now delegates to `node:crypto.randomInt` (unbiased up to 2^48, single-value ranges return `min`); string helpers validate lengths and count code points.
- Key derivation: PBKDF2 honours `digest` (`pbkdf2-sha384` label added) and defaults to 600 000 iterations; scrypt forwards `blockSize`/`maxMemory` with a derived memory bound so work factors above 2^14 work; `DerivedKeyResult.algorithm` matches runtime values.
- Passwords: `hashPassword` honours `saltBytes`/`keyBytes` and returns the salt/hash that are inside `encoded`; `verifyPassword` decodes and bounds-checks stored parameters (including a combined `128 * N * r` memory bound) before deriving and never throws; passwords are capped at `PASSWORD_POLICY.MAX_LENGTH`; PBKDF2 password hashes (`v1$pbkdf2-<digest>$<iterations>$salt.hash`) are supported at the provider level.
- Signatures: ECDSA algorithms work; the algorithm binds the key type; `verify` returns false for malformed keys/signatures; keys may be PEM text, PEM bytes or DER.
- Hash/HMAC: runtime allowlist (md5/sha1 rejected), HMAC keys must be at least 16 bytes.
- Keys: `createCryptoKey` validates length per algorithm, fingerprints are domain-separated HMACs, random key generation is restricted to symmetric algorithms.
- Encoding: single Buffer-based implementation with canonical-form validation (non-canonical base64/base64url rejected), strict UTF-8 decoding, token encodings allowlisted, `timingSafeEqualEncoded` returns false on malformed input; constant-time compares use `node:crypto.timingSafeEqual`.
- Service/factory: every wrapper preserves `cause`; factory merges password defaults and copies option objects; provider injection via `setDefaultCryptoProvider`, `createCryptoService({ provider })`, `createCryptoFactory({ provider })` and per-call `provider` options.
- `CRYPTO_ALGORITHM` mirrors `CryptoAlgorithm` exactly (compile-time checked).
- Packaging: source maps and build info no longer ship; LICENSE included; tests are typechecked.

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/constants@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/constants@0.1.1
