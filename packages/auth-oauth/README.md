# @zudojs/auth-oauth

OAuth2 **authorization-code** client for the Zudojs framework: PKCE `S256` by
default, mandatory anti-CSRF `state` with a timing-safe check, an SSRF guard on
every endpoint URL, a redirect-URI allowlist, and size- and time-bounded
requests to the provider.

Depends on nothing but Node built-ins (`node:crypto` and the global `fetch`).

```bash
pnpm add @zudojs/auth-oauth
```

Requires Node >= 24.

## Why this package exists

`@zudojs/auth` handles passwords, JWTs, sessions and RBAC. It has no OAuth2 and
never did. This package is the real implementation: it builds the authorization
request, exchanges the code, refreshes tokens and normalises the provider's
profile — with the parts people usually skip (PKCE, state, SSRF, response
bounds) built in rather than bolted on.

It does **not** create users, issue your own sessions, or verify an OIDC
`id_token` signature. It gets you a verified provider profile; what you do with
it is your application's business.

## The whole flow

```ts
import {
  createAuthorizationUrl,
  exchangeCodeForToken,
  fetchUserInfo,
  generateState,
  verifyState,
  type OAuthConfig,
} from "@zudojs/auth-oauth";

const config: OAuthConfig = {
  provider: "google",
  clientId: process.env["GOOGLE_CLIENT_ID"] ?? "",
  clientSecret: process.env["GOOGLE_CLIENT_SECRET"] ?? "",
  // Every redirect URI this client may use, listed exactly.
  allowedRedirectUris: ["https://app.example.com/auth/callback"],
};

const REDIRECT_URI = "https://app.example.com/auth/callback";

// 1. Start the flow.
app.get("/auth/google", (req, res) => {
  const state = generateState();
  const { url, codeVerifier } = createAuthorizationUrl(config, {
    state,
    redirectUri: REDIRECT_URI,
  });

  // Both values are secrets. Keep them server-side, scoped to this session,
  // and short-lived (a few minutes is plenty).
  req.session.oauth = { state, codeVerifier };
  res.redirect(url);
});

// 2. Handle the callback.
app.get("/auth/callback", async (req, res) => {
  const pending = req.session.oauth;
  delete req.session.oauth; // single use, whatever happens next

  if (pending === undefined) return res.status(400).send("No pending login.");

  // 3. Verify state before anything else touches the provider.
  if (!verifyState(pending.state, String(req.query["state"] ?? ""))) {
    return res.status(400).send("Invalid state.");
  }

  // 4. Exchange the code, proving possession of the PKCE verifier.
  const tokens = await exchangeCodeForToken(config, {
    code: String(req.query["code"] ?? ""),
    codeVerifier: pending.codeVerifier,
    redirectUri: REDIRECT_URI,
  });

  // 5. Fetch the profile.
  const profile = await fetchUserInfo(config, tokens.accessToken);

  if (profile.email === undefined) {
    return res.status(400).send("This provider did not release an email address.");
  }

  // Now it is your application's turn: find or create the local account keyed
  // by (provider, profile.providerId) — not by email alone.
  const user = await users.upsertFromOAuth("google", profile);
  req.session.userId = user.id;
  res.redirect("/");
});
```

Refreshing later:

```ts
import { refreshAccessToken } from "@zudojs/auth-oauth";

const fresh = await refreshAccessToken(config, storedRefreshToken);
// Most providers do not rotate the refresh token; keep the old one unless
// `fresh.refreshToken` is set.
```

## API

| Export | What it does |
| --- | --- |
| `createAuthorizationUrl(config, options)` | Builds the authorize URL. Returns `{ url, state, codeVerifier, codeChallenge }`. |
| `exchangeCodeForToken(config, options)` | Authorization-code grant. Returns a validated `OAuthTokenSet`. |
| `refreshAccessToken(config, refreshToken)` | Refresh-token grant, where the provider supports one. |
| `fetchUserInfo(config, accessToken)` | Bearer GET of the user-info endpoint, normalised to `OAuthUserInfo`. |
| `generateState()` / `verifyState(expected, received)` | 256-bit state, timing-safe comparison. |
| `generateCodeVerifier()` / `deriveCodeChallenge(verifier)` | PKCE primitives (`S256`). |
| `parseTokenResponse(payload)` | Validate a token payload you obtained elsewhere. |
| `normalizeUserInfo(provider, payload)` | Normalise a profile payload you obtained elsewhere. |
| `assertSafeUrl(url, label, use)` / `isBlockedFetchHost(host)` | The URL and SSRF guards, exposed for your own checks. |
| `PROVIDER_PRESETS` | Endpoint defaults per provider. |

## Providers

| Provider | Endpoints | Client auth | Refresh | Notes |
| --- | --- | --- | --- | --- |
| `google` | preset | body | yes | `access_type=offline` + `prompt=consent` are sent so a refresh token is actually issued. |
| `github` | preset | body | **no** | Classic OAuth App tokens do not expire and no refresh token is issued; `refreshAccessToken` throws rather than making a pointless request. |
| `microsoft` | preset (`common` tenant) | body | yes | Override `authorizeUrl`/`tokenUrl` for a single-tenant app. |
| `apple` | preset | body | yes | `clientSecret` is the ES256 JWT you mint from your private key — this package does not generate it. Apple has **no user-info endpoint**; the profile is in the `id_token`, so `fetchUserInfo` throws for `apple`. |
| `discord` | preset | **basic** | yes | |
| `custom` | you supply all three URLs | body | yes | |

Any preset URL can be overridden on the config; every override goes through the
same validation.

### About email

`OAuthUserInfo.email` is **optional**, and deliberately so.

- **GitHub** omits `email` from `/user` whenever the address is private, which
  is the default. When the `user:email` scope was granted, this package asks
  `/user/emails` and uses the primary *verified* address. Without the scope, or
  without a verified primary, the profile simply comes back with no email.
- **Discord** returns no email unless the `email` scope was granted.

No address is ever synthesised from a login name. Key your local accounts by
`(provider, providerId)`, not by email — emails change, and an unverified email
from a provider is not proof of anything.

## Security

Every one of these is covered by a test in `tests/`.

- **`state` is mandatory.** `createAuthorizationUrl` refuses to build a URL
  without one, and refuses one under 16 characters. `verifyState` compares with
  `crypto.timingSafeEqual` after a length check, and returns `false` for empty
  or non-string input, so a missing `state` can never pass.
- **PKCE `S256`, always.** The verifier is 384 bits from `randomBytes`, encoded
  base64url so it lands in the unreserved alphabet with no modulo bias. There is
  no switch to turn PKCE off and `plain` is not implemented.
- **Redirect-URI allowlist.** `allowedRedirectUris` is required and non-empty;
  the requested URI is parsed, canonicalised (scheme and host case-insensitive,
  fragment forbidden, path and query byte-exact) and must match an entry. An
  arbitrary redirect target is never reflected.
- **URL validation and SSRF guard.** Every URL must be `https` — `http` is
  tolerated only for `localhost` / `127.0.0.1` / `[::1]` and only on
  browser-facing URLs — and must not embed credentials. The *server-fetched*
  endpoints (token, user-info) additionally may not point at a loopback,
  private, CGNAT, link-local, unique-local, multicast or reserved address, at
  `169.254.169.254` and friends, or at a `localhost` / `*.local` / `*.internal`
  / `metadata.google.internal` name. Redirects are not followed
  (`redirect: "manual"`), so a 3xx cannot walk the request somewhere that never
  passed the guard.
  **Limit:** the check is on the literal host; DNS is not resolved, so DNS
  rebinding is out of scope. Pair this with network egress controls if endpoint
  URLs come from untrusted operators.
- **Bounded responses.** Every provider request carries
  `AbortSignal.timeout(timeoutMs)` (default 10s) and the body is streamed and
  abandoned the moment it passes `maxResponseBytes` (default 256 KiB); an
  oversized `Content-Length` is refused before a byte is read.
- **Defensive parsing.** A token response must be a JSON *object* with a
  non-blank string `access_token`; `expires_in` must be a non-negative integer
  (or its decimal string); `refresh_token`, `id_token`, `scope` and `token_type`
  must be strings when present. `__proto__`, `constructor` and `prototype` are
  stripped from every object reconstructed from provider JSON, at every depth.
- **No secret in any error.** No message, and therefore no stack, ever contains
  the client secret, an access or refresh token, or a PKCE verifier. The only
  provider-supplied text that reaches a message is the OAuth `error` code, and
  only after passing `[A-Za-z0-9_.:-]{1,64}` — an `error_description` is never
  interpolated, so a provider cannot echo material into your logs.
  The one thing this cannot police is `cause`: when you supply your own
  `config.fetch`, its rejection is attached untouched.
- **Secrets travel in the body or the `Authorization` header**, never in a URL
  where a proxy or access log would capture them.

## Errors

Every failure is an `OAuthError` with a machine-readable `code`, a suggested
`statusCode`, and `expose` saying whether the message is safe to show a user.

| Class | Code | Status | Exposed |
| --- | --- | --- | --- |
| `OAuthConfigurationError` | `OAUTH_CONFIGURATION_INVALID` | 500 | no |
| `OAuthEndpointNotAllowedError` | `OAUTH_ENDPOINT_NOT_ALLOWED` | 500 | no |
| `OAuthRedirectUriError` | `OAUTH_REDIRECT_URI_NOT_ALLOWED` | 400 | yes |
| `OAuthStateMismatchError` | `OAUTH_STATE_MISMATCH` | 400 | yes |
| `OAuthProviderError` | `OAUTH_PROVIDER_REJECTED` | 502 | yes |
| `OAuthResponseError` | `OAUTH_PROVIDER_RESPONSE_INVALID` | 502 | yes |
| `OAuthResponseTooLargeError` | `OAUTH_RESPONSE_TOO_LARGE` | 502 | yes |
| `OAuthNetworkError` | `OAUTH_NETWORK` | 504 | yes |

## Configuration reference

| Field | Required | Default |
| --- | --- | --- |
| `provider` | yes | — |
| `clientId`, `clientSecret` | yes | — |
| `allowedRedirectUris` | yes, non-empty | — |
| `authorizeUrl`, `tokenUrl`, `userInfoUrl` | only for `custom` | the preset's |
| `scopes` | no | the preset's |
| `clientAuthMethod` | no | the preset's |
| `timeoutMs` | no | `10000` (1 - 120000) |
| `maxResponseBytes` | no | `262144` (1024 - 5242880) |
| `fetch` | no | global `fetch` |

Out-of-range values are rejected, not clamped.

## What this package does not do

- **No `id_token` verification.** `idToken` is passed through unparsed and
  unverified. If you rely on its claims, verify the signature against the
  provider's JWKS yourself.
- **No implicit, password or client-credentials grant.** Authorization code
  only, which is the only flow current guidance recommends for user login.
- **No state or verifier storage.** Where you keep them between the two requests
  is your decision; the package hands them to you and asks for them back.
- **No account linking, user creation or session issuing.** Pair it with
  `@zudojs/auth` for sessions and tokens.

## Development

```bash
pnpm --filter @zudojs/auth-oauth typecheck   # both tsconfigs, full strictness
pnpm --filter @zudojs/auth-oauth test
pnpm --filter @zudojs/auth-oauth build
```

## License

MIT
