# @zudojs/auth-oauth

## 1.2.5

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2
  - @zudojs/security@1.3.3

## 1.2.4

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1
  - @zudojs/security@1.3.2

## 1.2.3

### Patch Changes

- Updated dependencies [`e546629`]:
  - @zudojs/security@1.3.1

## 1.2.2

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0
  - @zudojs/security@1.3.0

## 1.2.1

### Patch Changes

- Updated dependencies [`c904687`, `95c1d56`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/security@1.2.0

## 1.2.0

### Minor Changes

- Round 10 security fix:

  - SEC-06: the SSRF guard on server-fetched endpoints judges IPv6 literals that embed an IPv4 address as that IPv4 address. This covers IPv4-compatible `[::127.0.0.1]` (serialised as `[::7f00:1]`), mapped, translated `[::ffff:0:a9fe:a9fe]`, NAT64 `[64:ff9b::169.254.169.254]` and 6to4 `2002::/16`. It also refuses the local-use NAT64 prefix `64:ff9b:1::/48` and fails closed on an unparseable literal.

  Round 10 phase 2:

  - SEC-06: the SSRF guard imports `expandIpv6` / `embeddedIpv4` / `isNonPublicIpv6Range` from `@zudojs/security`; the mirrored `oauthIpv6.guard.ts` is deleted. No behaviour change.
  - CONV-02: `OAuthError` now extends the shared `OAuthError` from `@zudojs/errors` (a `BaseError`) instead of `Error`. Names, codes, `statusCode` and `expose` defaults are unchanged. **Behaviour change:** OAuth errors gain `category` (`authentication`), `severity`, `isOperational`, `metadata`, `toJSON()` and `toLogObject()`, and `JSON.stringify(err)` now emits the structured BaseError shape. The package now depends on `@zudojs/errors` and `@zudojs/security`.

### Patch Changes

- Updated dependencies [`d2b01bf`, `5d6b957`]:
  - @zudojs/errors@1.1.0
  - @zudojs/security@1.1.0

## 1.1.1

### Patch Changes

- - **SSRF guard: trailing-dot hostnames were not blocked.** `https://metadata.google.internal./…`, `https://localhost./…` and any `*.internal.` / `*.local.` / `*.localhost.` name with a trailing dot passed `assertSafeUrl(…, "fetch")` and `isBlockedFetchHost()`, because the WHATWG URL parser keeps the dot on domain hosts and DNS resolves the dotted and undotted forms identically. Trailing dots are now stripped before the name-based rules run.
  - A timeout that fires while the response body is streaming, or a transport failure mid-body, escaped as a raw `DOMException` / transport error. Both now surface as the documented `OAuthNetworkError`.
  - The per-request `scopes` override on `createAuthorizationUrl()` is validated with the same RFC 6749 scope-token rule as `config.scopes`; a blank, space-containing or non-string entry now throws `OAuthConfigurationError` instead of reaching the `scope` parameter.

## 1.1.0

### Minor Changes

- [`ff883a7`](https://github.com/oyinlola-tech/zudo/commit/ff883a799aefd7aa2abfc3c3c54bc18dc0b43797) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - New package: a real OAuth2 authorization-code client for the Zudojs framework.

  `@zudojs/auth` advertised OAuth2 in its npm description while shipping only
  types — no authorize-URL builder, no code exchange, no state or PKCE handling,
  no user-info fetch, and no strategy registry. This package replaces that promise
  with an implementation, and those five type exports are removed from
  `@zudojs/auth`.

  **What it does.** Provider presets for Google, GitHub, Microsoft, Apple and
  Discord plus `custom`; `createAuthorizationUrl` (returning the `state` and
  `code_verifier` you must persist); `exchangeCodeForToken`; `fetchUserInfo`,
  normalising each provider's payload; `verifyState`; and `refreshAccessToken`
  where the provider supports it.

  **It has no dependencies** — not even `@zudojs/errors`. Only `node:crypto` and
  global `fetch`. It defines its own error types.

  **The security properties are the point of the package**, so they are stated
  explicitly and each is covered by a test:

  - **PKCE is always S256.** There is no `plain` code path. The verifier is
    `randomBytes(48)` rendered base64url, so it carries no modulo bias, and the
    challenge transform is verified against the RFC 7636 Appendix B test vector.
    The verifier never appears in the authorization URL.
  - **`state` is mandatory** (minimum 16 characters) and `verifyState` compares
    with `crypto.timingSafeEqual` behind type, emptiness and length checks.
    CSRF protection is not opt-in.
  - **Endpoint URLs are SSRF-guarded.** Token and user-info hosts are rejected
    when they resolve to loopback (including IPv4-mapped), `10/8`, `172.16/12`,
    `192.168/16`, `0/8`, CGNAT, `198.18/15`, `169.254/16` including the cloud
    metadata address, multicast and reserved space, `fc00::/7`, `fe80::/10`,
    `ff00::/8`, or to `localhost`, `*.local`, `*.internal` and
    `metadata.google.internal`. Config can be operator- or tenant-supplied, which
    makes it an SSRF sink.
  - **https only**, with http permitted solely for `localhost` on browser-facing
    URLs. URLs carrying embedded credentials are rejected.
  - **Redirects are not followed** (`redirect: "manual"`), so a 3xx cannot walk the
    request to an unguarded host.
  - **`redirect_uri` must match a non-empty allowlist** by canonical exact
    comparison; traversal, an extra query string and a foreign host are all
    rejected.
  - **No secret, token or PKCE verifier reaches any error message or stack.** Only
    a charset-filtered provider `error` code is admitted; `error_description` is
    never propagated. There is a test that asserts the secret stays out even when
    the transport itself leaks it.
  - **Responses are bounded**: a `Content-Length` pre-check plus a streamed body
    cap, and `AbortSignal.timeout` on every request. An OAuth provider is an
    untrusted remote for this purpose.
  - **Token responses are parsed defensively** — a non-object body, a missing or
    blank `access_token` and a non-numeric `expires_in` are all rejected (17
    malformed shapes are covered, including a 200 carrying an error), and
    `__proto__`, `constructor` and `prototype` are stripped at every depth behind
    a depth cap.
  - Secrets travel in the body or the `Authorization` header, never in a URL;
    reserved authorization parameters cannot be overridden through
    `additionalParams`; scope tokens are validated per RFC 6749.

  **Known limitation:** `refreshAccessToken` throws for `provider: "github"`,
  because classic GitHub OAuth App tokens do not expire. A GitHub App with
  expiring user tokens needs `provider: "custom"` until a preset is added.

  103 tests.
