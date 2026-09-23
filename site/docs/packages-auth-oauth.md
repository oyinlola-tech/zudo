---
title: "@zudojs/auth-oauth"
description: "@zudojs/auth-oauth: OAuth 2.0 sign-in with PKCE, timing-safe state checks, code exchange and presets for Google, GitHub, Microsoft, Apple and Discord."
source: https://zudojs.oyinlola.site/docs/packages-auth-oauth
---

v1.2.0

# @zudojs/auth-oauth

Sign in with Google, GitHub and other providers.

OAUTH 2.0 PKCE SECURITY

## OVERVIEW

*OAuth 2.0* is the protocol behind buttons like "Sign in with Google". Instead of asking someone for a new password, you send them to Google, Google asks them whether your app may see their profile, and Google hands your server a short-lived key to read it.

`@zudojs/auth-oauth` implements the server half of that conversation. It builds the URL you send the user to, exchanges the code that comes back for tokens, and turns each provider's profile payload into one shape you can use. It ships endpoint presets for Google, GitHub, Microsoft, Apple and Discord, plus a `custom` provider where you supply the URLs yourself.

The reason to use it rather than hand-rolling four `fetch` calls is the parts people skip. PKCE is always on, anti-CSRF `state` is mandatory and compared in constant time, every endpoint URL is checked before a request is made, and redirect URIs must appear in an allowlist you configure. Those are explained in [Security guarantees](#security).

When you need it

- You want "Sign in with Google / GitHub / Microsoft / Apple / Discord".
- You need an access token to call a provider's API on the user's behalf.
- You are integrating an in-house OAuth2 server (`provider: "custom"`).

When you don't

- You only need email-and-password login — that is `@zudojs/auth`.
- You want this package to create the user row or the session. It does not; it returns a profile and stops.
- You need the signature on an OIDC `id_token` verified. The token is returned to you unparsed and unchecked.
- You are writing a browser-only app. The client secret must stay on a server.

## INSTALLATION

There are no peer packages to add. This package is built on Node built-ins (`node:crypto` and the global `fetch`) plus `@zudojs/errors` (error base classes) and `@zudojs/security` (IPv6 helpers for the SSRF guard), both installed automatically. It needs Node 24 or newer.

```bash
$ npm install @zudojs/auth-oauth
```

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

## HOW OAUTH WORKS

If you have never implemented this before, "Sign in with Google" looks like magic. It is not. It is six steps, and your server only does three of them.

1. **You build a URL.** The user clicks your sign-in button. Your server calls `createAuthorizationUrl` and redirects the browser to Google. The URL says who you are (`client_id`), what you want (`scope`), and where to come back to (`redirect_uri`).
2. **The user signs in at Google.** This happens entirely on Google's site. Their password never touches your server.
3. **The user consents.** Google shows a screen: "This app wants to see your email address and profile." The user says yes or no.
4. **Google sends the browser back to you** at your redirect URI, with two things in the query string: `code` and `state`. The `code` is a one-time ticket. It is not a token and it is worth nothing on its own.
5. **Your server trades the code for tokens.** Your server — not the browser — POSTs the code to Google's token endpoint along with your client secret. Google returns an *access token*. This is `exchangeCodeForToken`.
6. **Your server reads the profile.** With the access token you call Google's user-info endpoint and get back an id, a name, an email. This is `fetchUserInfo`. From here on it is your application's job: look the person up, create them if they are new, start your own session.

Three words appear over and over. Here is what each one means:

- **Redirect URI.** The exact address on your site that the provider sends the browser back to after consent — for example `https://app.example.com/auth/callback`. You register it in the provider's dashboard, and you also list it in `allowedRedirectUris` here. It is exact: a trailing slash or a different port is a different URI.
- **State.** A random string you generate before the redirect, store against the user's session, and check when they come back. Without it, an attacker can complete a sign-in at Google as themselves and then feed their `code` to your callback in the victim's browser — the victim ends up logged into the attacker's account. This package will not build an authorization URL without a `state` of at least 16 characters.
- **PKCE** (say "pixy", short for Proof Key for Code Exchange). Your server invents a random secret called the *code verifier*, sends only its SHA-256 hash (the *code challenge*) in step 1, and reveals the verifier in step 5. Anyone who steals the `code` in transit cannot use it, because they do not have the verifier. It costs you nothing — `createAuthorizationUrl` generates the verifier for you and you hand it back at exchange time.

> WATCH OUT
>
>
>
> The `state` and the `codeVerifier` must be stored *server-side* — a session record, or a signed, httpOnly cookie. The verifier is a secret. Putting it in a URL, in `localStorage`, or in a readable cookie throws away the protection PKCE gives you.

## QUICK START

This is step 1 of the flow: build the URL you send the user to. It makes no network request, so you can run it right now.

```ts
import { createAuthorizationUrl, generateState } from "@zudojs/auth-oauth";
import type { OAuthConfig } from "@zudojs/auth-oauth";

const callback = "https://app.example.com/auth/callback";

const config: OAuthConfig = {
  provider: "google",
  clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  allowedRedirectUris: [callback],
};

const state = generateState();
const { url, codeVerifier } = createAuthorizationUrl(config, {
  state,
  redirectUri: callback,
});

console.log(url);
// https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&prompt=consent
//   &response_type=code&client_id=your-client-id&redirect_uri=https%3A%2F%2Fapp.example.com%2Fauth%2Fcallback
//   &scope=openid+email+profile&state=THE_RANDOM_STATE&code_challenge=THE_SHA256_HASH&code_challenge_method=S256

console.log(codeVerifier.length);
// 64  — store this and `state` in the user's session, then redirect to `url`
```

What you should see: one long URL. Note what is *not* in it. The client secret is never in an authorization URL, and neither is the code verifier — only its hash, as `code_challenge`.

## CONFIGURATION

An `OAuthConfig` is a plain object. There is no service to construct and nothing to start: every function takes the config as its first argument and validates it before doing anything.

Four fields are required — `provider`, `clientId`, `clientSecret` and `allowedRedirectUris`. Everything else has a default, and for the five named providers the endpoint URLs and scopes come from a preset.

| Field | What it does | Notes |
| --- | --- | --- |
| `provider` | Which preset to use. | `"google" \| "github" \| "microsoft" \| "apple" \| "discord" \| "custom"`. |
| `clientId` | Your app's public identifier at the provider. | Required, non-empty. |
| `clientSecret` | Your app's secret. Never appears in a URL, an error message or a stack. | For Apple, this is the ES256 client-secret JWT you mint yourself. |
| `allowedRedirectUris` | Exact redirect URIs this client may use. | At least one. Anything not listed is rejected. |
| `authorizeUrl`, `tokenUrl`, `userInfoUrl` | Endpoint overrides. | Optional for named providers, required for `custom`. |
| `scopes` | What you are asking for. | Defaults to the preset's scopes. |
| `clientAuthMethod` | `"basic"` (Authorization header) or `"body"` (form fields). | Defaults to whatever the preset says the provider expects. |
| `timeoutMs` | Per-request timeout. | Default `10000`, max `120000`. |
| `maxResponseBytes` | Hard cap on a provider response body. | Default `262144`, min `1024`, max `5242880`. |
| `fetch` | Your own `fetch`, for proxying or tests. | Defaults to the global `fetch`. |

The presets are exported as `PROVIDER_PRESETS` if you want to read them. This prints what Google's preset asks for by default.

```ts
import { PROVIDER_PRESETS } from "@zudojs/auth-oauth";

console.log(PROVIDER_PRESETS.google.defaultScopes);
// [ 'openid', 'email', 'profile' ]

console.log(PROVIDER_PRESETS.github.supportsRefresh);
// false

console.log(PROVIDER_PRESETS.apple.userInfoUrl);
// undefined  — Apple has no user-info endpoint
```

> WATCH OUT
>
>
>
> A preset only fills in defaults. Anything you set on the config wins — so a tenanted Microsoft install or a self-hosted server can override `authorizeUrl` and `tokenUrl` without switching to `provider: "custom"`.

## THE AUTHORIZATION REQUEST

`createAuthorizationUrl(config, options)` is synchronous and makes no network call. It returns four things: the `url` to redirect to, the `state` you passed in, the `codeVerifier` it generated, and the `codeChallenge` it sent (informational).

It always emits `response_type=code`, `code_challenge_method=S256` and your `state`. There is no option to turn PKCE off.

This asks GitHub for a narrower scope than the preset's default and adds a provider-specific parameter.

```ts
import { createAuthorizationUrl, generateState } from "@zudojs/auth-oauth";
import type { OAuthConfig } from "@zudojs/auth-oauth";

const callback = "https://app.example.com/auth/github/callback";

const config: OAuthConfig = {
  provider: "github",
  clientId: process.env.GITHUB_CLIENT_ID ?? "",
  clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
  allowedRedirectUris: [callback],
  scopes: ["read:user"],
};

const result = createAuthorizationUrl(config, {
  state: generateState(),
  redirectUri: callback,
  additionalParams: { allow_signup: "false" },
});

const parsed = new URL(result.url);
console.log(parsed.searchParams.get("scope"));
// read:user
console.log(parsed.searchParams.get("code_challenge_method"));
// S256
```

`additionalParams` cannot overwrite the parameters that carry the security properties. Passing `state`, `code_challenge`, `redirect_uri`, `scope`, `response_type`, `client_id`, `client_secret` or `code_challenge_method` there throws an `OAuthConfigurationError`.

> COMMON MISTAKE
>
>
>
> Generating `state` and then not storing it. The value in the result is the one you must persist against the session — if you throw it away, you have nothing to compare the callback against and `verifyState` can only return `false`.

## THE CALLBACK AND CODE EXCHANGE

When the browser comes back to your redirect URI, do two things in this order: check the `state`, then exchange the `code`. Checking state first means a forged callback never reaches the provider at all.

`verifyState(expected, received)` returns a boolean and never throws. It compares bytes in constant time, so an attacker cannot recover the value one character at a time by measuring how long the check takes. Unequal lengths, empty strings and non-strings are always `false`.

This handles a callback end to end: verify, exchange, read the profile. `session` stands in for whatever you stored in step 1.

```ts
import {
  exchangeCodeForToken,
  fetchUserInfo,
  verifyState,
  OAuthStateMismatchError,
} from "@zudojs/auth-oauth";
import type { OAuthConfig, OAuthUserInfo } from "@zudojs/auth-oauth";

const callback = "https://app.example.com/auth/callback";

const config: OAuthConfig = {
  provider: "google",
  clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  allowedRedirectUris: [callback],
};

async function handleCallback(
  session: { state: string; codeVerifier: string },
  query: { code: string; state: string },
): Promise<OAuthUserInfo> {
  if (!verifyState(session.state, query.state)) {
    throw new OAuthStateMismatchError();
  }

  const tokens = await exchangeCodeForToken(config, {
    code: query.code,
    codeVerifier: session.codeVerifier,
    redirectUri: callback,
  });

  console.log(tokens.tokenType, tokens.expiresIn);
  // Bearer 3599

  return await fetchUserInfo(config, tokens.accessToken);
}
```

What you get back: an `OAuthUserInfo` such as `{ providerId: "1078…", email: "alice@example.com", emailVerified: true, name: "Alice", avatarUrl: "https://…", raw: { … } }`. Key your user records on `providerId` plus the provider name — it is the only field guaranteed to be there.

The `redirectUri` you pass here must be the same one used to build the authorization URL, and it must be in the allowlist. Both calls check it independently.

> TIP
>
>
>
> A `code` is single-use. If the user reloads your callback page, the second exchange fails with an `OAuthProviderError`. Redirect away from the callback URL as soon as the exchange succeeds.

## USER PROFILES

Every provider returns a differently shaped profile. `fetchUserInfo` calls the user-info endpoint with `Authorization: Bearer` — never the token in the query string, where proxies and access logs would capture it — and maps the result onto `OAuthUserInfo`.

The mapping is also exported on its own as `normalizeUserInfo(provider, payload)`, which is useful when you already have a payload from somewhere else. It returns `undefined` when the payload has no stable id.

```ts
import { normalizeUserInfo } from "@zudojs/auth-oauth";

console.log(normalizeUserInfo("github", {
  id: 42,
  login: "octocat",
  avatar_url: "https://avatars.example/42",
}));
// { providerId: '42', name: 'octocat', avatarUrl: 'https://avatars.example/42',
//   raw: { id: 42, login: 'octocat', avatar_url: 'https://avatars.example/42' } }
```

Notice there is no `email`. That is deliberate. GitHub omits the address from `/user` when the user has made it private, and Discord omits it unless you asked for the `email` scope. This package never invents one from the login name.

For GitHub there is one fallback: if the profile has no email *and* your configured scopes include `user:email`, `fetchUserInfo` asks `/user/emails` for the primary verified address. If that request fails — usually because the scope was not granted — the profile simply comes back without an email.

> WATCH OUT
>
>
>
> Apple has no user-info endpoint. Calling `fetchUserInfo` with `provider: "apple"` throws an `OAuthConfigurationError` telling you to read the profile from the `idToken` on the token set instead. This package returns that token but does not parse or verify it.

## REFRESH TOKENS

An access token expires — Google's last about an hour. A *refresh token* is a longer-lived credential you exchange for a fresh access token without sending the user through consent again.

`refreshAccessToken(config, refreshToken)` POSTs a `grant_type=refresh_token` request and returns a new `OAuthTokenSet`.

```ts
import { refreshAccessToken } from "@zudojs/auth-oauth";
import type { OAuthConfig } from "@zudojs/auth-oauth";

const config: OAuthConfig = {
  provider: "google",
  clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  allowedRedirectUris: ["https://app.example.com/auth/callback"],
};

const stored = process.env.GOOGLE_REFRESH_TOKEN ?? "";
const tokens = await refreshAccessToken(config, stored);

console.log(tokens.accessToken.length > 0, tokens.expiresIn);
// true 3599
```

Most providers do not send a new `refresh_token` in the response. Keep using the one you have unless `tokens.refreshToken` is set, in which case replace it.

> GITHUB HAS NO REFRESH TOKENS
>
>
>
> Calling `refreshAccessToken` with `provider: "github"` throws an `OAuthConfigurationError` before any request is made. This is not a gap in the package: a classic GitHub OAuth App issues access tokens that never expire and no refresh token at all, so there is nothing to refresh. If you are using a *GitHub App* with expiring user tokens, that flow does issue refresh tokens — configure it as `provider: "custom"` with GitHub's endpoint URLs supplied explicitly.

> TIP
>
>
>
> Google only issues a refresh token when the authorization request carries `access_type=offline` and `prompt=consent`. The Google preset sets both for you.

## SECURITY GUARANTEES

These are the properties the package enforces for you. None of them is optional and none has a flag to turn it off.

- **PKCE is always `S256`, with no `plain` fallback.** Every authorization URL carries `code_challenge_method=S256` and a SHA-256 challenge. The `plain` method is not implemented: it sends the verifier itself, which gives no protection against anyone who can read the authorization request.
- **State is mandatory and compared in constant time.** `createAuthorizationUrl` refuses a missing, blank or under-16-character `state`. `verifyState` uses `timingSafeEqual` on the raw bytes, so the comparison leaks nothing through timing and does not treat different Unicode normalisations as equal.
- **Endpoint URLs are guarded against internal addresses.** The `tokenUrl` and `userInfoUrl` are fetched by *your server*, which makes them an SSRF sink. Before any request, each must be `https` with no embedded credentials and must not point at a loopback, private (`10/8`, `172.16/12`, `192.168/16`), carrier-grade-NAT, link-local (including the `169.254.169.254` cloud-metadata address), unique-local, multicast or reserved address, nor at names like `localhost`, `*.local`, `*.internal` or `metadata.google.internal` (trailing-dot forms of these names are rejected too). IPv6 literals embedding an IPv4 address (e.g. `[::127.0.0.1]`, NAT64 `[64:ff9b::169.254.169.254]`) are judged as that IPv4 address.
- **Redirect URIs must match the allowlist.** Every `redirectUri` is parsed, canonicalised (scheme and host case-insensitive, the rest byte-exact, fragments rejected) and must appear in `allowedRedirectUris`. An arbitrary redirect target is never reflected into an authorization request. Browser-facing URLs must be `https`, except on `localhost` / `127.0.0.1` / `[::1]` for local development.
- **Redirects are not followed.** Provider requests use `redirect: "manual"`, and a 3xx response raises an `OAuthProviderError`. A redirect cannot walk your request to a host that never passed the URL guard.
- **Responses are bounded and defensively parsed.** Each request is capped in time (`timeoutMs`) and in bytes (`maxResponseBytes`, refused early on an oversized `Content-Length`). Parsed JSON has `__proto__`, `constructor` and `prototype` keys stripped and its depth bounded.
- **Secrets stay out of messages.** No error message, name or stack contains the client secret, an access token, a refresh token or a code verifier. The only provider-supplied text that reaches a message is an OAuth `error` code, filtered to `[A-Za-z0-9_.:-]{1,64}` — an `error_description` is never interpolated.

> KNOWN LIMIT
>
>
>
> The URL guard inspects the literal host in the URL. It does not resolve DNS, so a public hostname that resolves to a private address (DNS rebinding) is not caught. If you accept endpoint URLs from untrusted operators, pair this with network egress controls.

## API REFERENCE

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| `createAuthorizationUrl(config, options)` | Builds the URL you redirect the user to. | Synchronous. Returns `AuthorizationUrlResult`. |
| `exchangeCodeForToken(config, options)` | Trades the callback `code` for an `OAuthTokenSet`. | `async`. Needs `code`, `codeVerifier`, `redirectUri`. |
| `refreshAccessToken(config, refreshToken)` | Gets a fresh access token from a refresh token. | `async`. Throws for `provider: "github"`. |
| `fetchUserInfo(config, accessToken)` | Reads and normalises the user's profile. | `async`. Throws for `provider: "apple"`. |
| `generateState()` | 256 bits of base64url randomness for `state`. | 43 characters. |
| `verifyState(expected, received)` | Constant-time comparison of the two states. | Returns a boolean; never throws. |
| `generateCodeVerifier()` | A 64-character PKCE verifier. | `createAuthorizationUrl` calls it for you. |
| `deriveCodeChallenge(verifier)` | `base64url(SHA-256(verifier))`. | Throws if the verifier is malformed. |
| `assertValidCodeVerifier(verifier)` | Throws unless the verifier is 43–128 unreserved characters. | RFC 7636 §4.1. |
| `normalizeUserInfo(provider, payload)` | Maps a raw provider payload to `OAuthUserInfo`. | Returns `undefined` if there is no stable id. |
| `parseTokenResponse(payload)` | Validates a token-endpoint payload into an `OAuthTokenSet`. | Useful when the payload came from elsewhere. |
| `resolveConfig(config)` | Validates a config and merges in its preset. | Returns `ResolvedOAuthConfig`. Called for you by every entry point. |
| `resolveAuthorizeUrl`, `resolveTokenUrl`, `resolveUserInfoUrl` | Return the checked `URL` for one endpoint. | Each takes a `ResolvedOAuthConfig`. |
| `assertRedirectUriAllowed(resolved, redirectUri)` | Throws unless the URI is allowlisted; returns its canonical form. | Takes a `ResolvedOAuthConfig`. |
| `assertSafeUrl(raw, label, use)` | Applies the URL guard. `use` is `"browser"` or `"fetch"`. | Returns the parsed `URL`. |
| `isBlockedFetchHost(hostname)` | Whether a host literal is refused for server-side fetching. | Boolean. |
| `sanitizeJsonValue`, `parseJsonObject`, `parseJsonValue` | Strip prototype-polluting keys from provider JSON. | Applied to every response already. |

### Types

| Name | What it does | Notes |
| --- | --- | --- |
| `OAuthConfig` | The configuration object every function takes. | See [Configuration](#configuration). |
| `OAuthProvider` | The six provider identifiers. | Union of string literals. |
| `ClientAuthMethod` | `"basic"` or `"body"`. | How the secret reaches the token endpoint. |
| `AuthorizationUrlOptions` / `AuthorizationUrlResult` | Input and output of `createAuthorizationUrl`. | Result carries `url`, `state`, `codeVerifier`, `codeChallenge`. |
| `CodeExchangeOptions` | Input of `exchangeCodeForToken`. | `code`, `codeVerifier`, `redirectUri`. |
| `OAuthTokenSet` | A validated token response. | `accessToken`, `tokenType`, optional `expiresIn`, `refreshToken`, `scope`, `idToken`, plus `raw`. |
| `OAuthUserInfo` | A normalised profile. | Only `providerId` is guaranteed. |
| `OAuthProviderPreset` | The shape of one entry in `PROVIDER_PRESETS`. | Includes `supportsRefresh`. |
| `ResolvedOAuthConfig` | A validated config with its preset merged in. | Returned by `resolveConfig`. |
| `FetchLike` | The `fetch` shape you may inject. | `(input: string, init: RequestInit) => Promise<Response>`. |
| `UrlUse` | `"browser"` or `"fetch"`. | Second policy is the stricter one. |

### Errors

Every error extends `OAuthError`, which extends the shared `OAuthError` from `@zudojs/errors` (a `BaseError`; its codes equal `ErrorCode.OAUTH_*`), and carries a `code`, a suggested `statusCode`, and an `expose` flag saying whether the message is safe to show an end user.

| Name | What it does | Notes |
| --- | --- | --- |
| `OAuthError` | Base class for every failure. | Fields: `code`, `statusCode`, `expose`. |
| `OAuthConfigurationError` | Your config or arguments are unusable. | 500, `expose: false`. Also thrown for GitHub refresh and Apple user-info. |
| `OAuthEndpointNotAllowedError` | A URL failed the scheme, credential or SSRF guard. | 500, `expose: false`. |
| `OAuthRedirectUriError` | The redirect URI is not allowlisted, or has a fragment. | 400. |
| `OAuthStateMismatchError` | The callback state did not match. | 400. Throw it yourself after `verifyState` returns false. |
| `OAuthProviderError` | The provider returned non-2xx, a 3xx, or an `error` payload. | 502. Adds `providerError` and `providerStatus`. |
| `OAuthResponseError` | The response was not a usable OAuth2 payload. | 502. |
| `OAuthResponseTooLargeError` | The body exceeded `maxResponseBytes`. | 502. |
| `OAuthNetworkError` | The request timed out or the transport failed. | 504. |
| `OAuthErrorCode` | The stable string codes, as a const object and a type. | e.g. `OAuthErrorCode.STATE_MISMATCH` is `"OAUTH_STATE_MISMATCH"`. |

### Constants

| Name | What it does | Notes |
| --- | --- | --- |
| `PROVIDER_PRESETS` | Endpoint, scope and auth defaults per provider. | Keyed by `OAuthProvider`. |
| `DEFAULT_TIMEOUT_MS` / `MAX_TIMEOUT_MS` | Bounds for `timeoutMs`. | `10000` / `120000`. |
| `DEFAULT_MAX_RESPONSE_BYTES` | Default body cap. | `262144` (256 KiB). |
| `MIN_MAX_RESPONSE_BYTES` / `MAX_MAX_RESPONSE_BYTES` | Bounds for `maxResponseBytes`. | `1024` / `5242880`. |

## COMMON MISTAKES

- **Not persisting the `codeVerifier`.** `exchangeCodeForToken` then has nothing to send and the provider rejects the exchange. Store the verifier and the state server-side, keyed to the session, before you redirect.
- **A redirect URI that is not byte-identical.** `https://app.example.com/auth/callback/` with a trailing slash is not the same URI, and you get an `OAuthRedirectUriError`. Use one constant for the value in `allowedRedirectUris`, in both calls, and in the provider's dashboard.
- **Comparing state with `===`.** It works, but it leaks timing and returns `true` for an empty string compared with itself. `verifyState` handles both.
- **Assuming `email` is always there.** It is optional on `OAuthUserInfo`. If you key accounts by email, check for its absence and ask the user to grant the scope — never synthesise an address from the login name.
- **Calling `refreshAccessToken` for GitHub.** It throws an `OAuthConfigurationError` without making a request, because classic OAuth App tokens do not expire. Store the access token and use it; for a GitHub App with expiring tokens, use `provider: "custom"`.
- **Trusting `idToken`.** It is passed through exactly as the provider sent it. Nothing here parses or verifies its signature. Verify it with a JWT library before you believe any claim inside it.
- **Testing against a local mock server over `http`.** A `tokenUrl` on `localhost` is rejected by the SSRF guard — `fetch` URLs must be public `https`. Inject a stub through `config.fetch` instead; that is how the package's own tests work.

## RELATED PACKAGES

- [@zudojs/auth](https://zudojs.oyinlola.site/docs/packages-auth.md) — what happens after this package hands you a profile: your own sessions, JWTs and password login. This package deliberately stops before that.
- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — serves the two routes this flow needs: the one that redirects to the provider and the callback that receives `code` and `state`.
- [@zudojs/permissions](https://zudojs.oyinlola.site/docs/packages-permissions.md) — deciding what a user may do once you know who they are. OAuth scopes are the provider's permissions, not yours.
- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the framework-wide error hierarchy. This package's `OAuthError` extends its shared `OAuthError`.

## COMPLETE EXPORT INDEX

Every name `@zudojs/auth-oauth` exports from its package root at v1.2.1 — **50** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 50 exports**

Classes (9)

`OAuthConfigurationError` `OAuthEndpointNotAllowedError` `OAuthError` `OAuthNetworkError` `OAuthProviderError` `OAuthRedirectUriError` `OAuthResponseError` `OAuthResponseTooLargeError` `OAuthStateMismatchError`

Functions (21)

`assertRedirectUriAllowed` `assertSafeUrl` `assertValidCodeVerifier` `createAuthorizationUrl` `deriveCodeChallenge` `exchangeCodeForToken` `fetchUserInfo` `generateCodeVerifier` `generateState` `isBlockedFetchHost` `normalizeUserInfo` `parseJsonObject` `parseJsonValue` `parseTokenResponse` `refreshAccessToken` `resolveAuthorizeUrl` `resolveConfig` `resolveTokenUrl` `resolveUserInfoUrl` `sanitizeJsonValue` `verifyState`

Interfaces (9)

`AuthorizationUrlOptions` `AuthorizationUrlResult` `CodeExchangeOptions` `OAuthConfig` `OAuthErrorOptions` `OAuthProviderPreset` `OAuthTokenSet` `OAuthUserInfo` `ResolvedOAuthConfig`

Type aliases (4)

`ClientAuthMethod` `FetchLike` `OAuthProvider` `UrlUse`

Constants (7)

`DEFAULT_MAX_RESPONSE_BYTES` `DEFAULT_TIMEOUT_MS` `MAX_MAX_RESPONSE_BYTES` `MAX_TIMEOUT_MS` `MIN_MAX_RESPONSE_BYTES` `OAuthErrorCode` `PROVIDER_PRESETS`
