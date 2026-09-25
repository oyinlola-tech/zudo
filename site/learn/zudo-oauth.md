---
title: "Sign in with OAuth — ZudoJS Academy"
description: "Add Sign in with Google to the Task API with @zudojs/auth-oauth: the OAuth 2 code flow, state and PKCE, provider presets, tested offline."
source: https://zudojs.oyinlola.site/learn/zudo-oauth
---

LEVEL 13 · LESSON 8 OF 12

Security and identity Advanced

# Sign in with OAuth

Add Sign in with Google to the Task API with @zudojs/auth-oauth: the OAuth 2 code flow, state and PKCE, provider presets, tested offline.

- **50 min** to read and try
- **You need:** The Authentication lesson
- **You build:** A "Sign in with Google" flow for the Task API that ends in your own session

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Build an authorization URL for a built-in provider preset such as Google
- Defend the callback against login CSRF with a server-checked state value
- Defend the code exchange against interception with a PKCE verifier and S256 challenge
- Exchange a code for a token and fetch the user's profile from the provider
- Find or create a local account by provider and provider id, and start your own session
- Handle where providers differ: missing refresh tokens, no profile endpoint, optional email

## Let someone else check the password

In [the Authentication lesson](https://zudojs.oyinlola.site/learn/zudo-auth) the Task API checked passwords itself. Many users would rather not create one more password. With "Sign in with Google", Google checks who they are and tells your server. Your server never sees their Google password.

The standard behind those buttons is **OAuth 2**. Four parties take part:

- the **user**, in a web browser;
- your **app**, the Task API. OAuth calls it the *client*;
- the **provider**, for example Google, which knows the user;
- the provider's **API**, which returns the user's profile.

The flow you will build is the **authorization code flow**. It has six steps:

1. The user clicks "Sign in with Google". Your server builds a long URL on Google and redirects the browser there.
2. The user signs in at Google, on Google's own page.
3. Google asks: "Task API wants your email and name. Allow?" The user says yes.
4. Google redirects the browser back to your **callback URL** with a short-lived `code` in the query string.
5. Your server sends the code, plus its own **client secret**, directly to Google and gets an **access token** back.
6. Your server uses the access token to ask Google for the user's profile. Then it creates *its own* session, exactly like after a password login.

Steps 5 and 6 happen server to server, so the access token and the client secret never pass through the browser. That is the point of the flow. `@zudojs/auth-oauth` does steps 1, 5 and 6, and adds two protections that you will study in detail: **state** and **PKCE**.

## Install and register your app

In your `task-api` folder:

Terminal on your computer

```bash
$ npm install @zudojs/auth-oauth

added 1 package, and audited 12 packages in 4s

found 0 vulnerabilities
```

To use a real provider you register your app with it once. For Google that is in the Google Cloud console under "APIs & Services", "Credentials", "OAuth client ID", type "Web application". You get two values:

- a **client id**. It is public: it appears in the URL of step 1;
- a **client secret**. It proves that a request really comes from your server. Treat it like the JWT secrets: `.env` only, never in code or git.

You also enter the exact **redirect URI** (the callback URL) there. For local development this lesson uses `http://localhost:3000/auth/google/callback`.

You do not need a Google account for this page. Every example runs offline against a small stand-in for Google, and the package never contacts the internet unless you ask it to.

## The built-in providers

The package knows the addresses and habits of five providers. Print what it ships:

providers.tsNode.js only

```ts
import { PROVIDER_PRESETS } from "@zudojs/auth-oauth";

for (const [name, preset] of Object.entries(PROVIDER_PRESETS)) {
  console.log(name, {
    login: preset.authorizeUrl ?? "(you supply it)",
    scopes: preset.defaultScopes.join(" "),
    secretSentIn: preset.clientAuth,
    refresh: preset.supportsRefresh,
    profile: preset.userInfoUrl ?? "none",
  });
}
```

Output of `npx tsx providers.ts`

```ts
google {
  login: 'https://accounts.google.com/o/oauth2/v2/auth',
  scopes: 'openid email profile',
  secretSentIn: 'body',
  refresh: true,
  profile: 'https://openidconnect.googleapis.com/v1/userinfo'
}
github {
  login: 'https://github.com/login/oauth/authorize',
  scopes: 'read:user user:email',
  secretSentIn: 'body',
  refresh: false,
  profile: 'https://api.github.com/user'
}
microsoft {
  login: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  scopes: 'openid email profile offline_access User.Read',
  secretSentIn: 'body',
  refresh: true,
  profile: 'https://graph.microsoft.com/v1.0/me'
}
apple {
  login: 'https://appleid.apple.com/auth/authorize',
  scopes: 'name email',
  secretSentIn: 'body',
  refresh: true,
  profile: 'none'
}
discord {
  login: 'https://discord.com/oauth2/authorize',
  scopes: 'identify email',
  secretSentIn: 'basic',
  refresh: true,
  profile: 'https://discord.com/api/v10/users/@me'
}
custom {
  login: '(you supply it)',
  scopes: '',
  secretSentIn: 'body',
  refresh: true,
  profile: 'none'
}
```

- **Scopes** are what you ask the user to allow. `openid email profile` means "who you are, your email, your name and picture". Ask for as little as you need.
- `secretSentIn` is how the client secret travels in step 5: as a form field (`body`) or in an HTTP Basic `Authorization` header (`basic`). Never in a URL, where logs would keep it.
- GitHub gives no refresh tokens and Apple has no profile endpoint. You will see both errors at the end of this lesson.
- `custom` is for any other OAuth 2 server: you supply its three URLs yourself.

## Configuration from the environment

Every function in the package takes a plain configuration object. Build it in one place, reading both values from the environment:

env.tsNode.js only

```ts
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Add it to your .env file.`);
  }
  return value;
}
```

google.tsNode.js only

```ts
import type { FetchLike, OAuthConfig } from "@zudojs/auth-oauth";
import { requireEnv } from "./env.js";

export const CALLBACK_URL = "http://localhost:3000/auth/google/callback";

export function googleConfig(fetch?: FetchLike): OAuthConfig {
  return {
    provider: "google",
    clientId: requireEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
    allowedRedirectUris: [CALLBACK_URL],
    ...(fetch === undefined ? {} : { fetch }),
  };
}
```

- `allowedRedirectUris` is an allow-list. The package refuses to send Google any other callback address, so nobody can trick your server into sending users, and their codes, somewhere else.
- The optional `fetch` replaces the function the package uses to call the provider. Your app never passes it. The examples on this page pass the stand-in for Google through it.

Without the environment variables:

missing-env.tsNode.js only

```ts
import { createAuthorizationUrl, generateState } from "@zudojs/auth-oauth";
import { CALLBACK_URL, googleConfig } from "./google.js";

try {
  googleConfig();
} catch (error) {
  console.log("our check:", (error as Error).message);
}

try {
  createAuthorizationUrl(
    {
      provider: "google",
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      allowedRedirectUris: [CALLBACK_URL],
    },
    { state: generateState(), redirectUri: CALLBACK_URL },
  );
} catch (error) {
  console.log("the package:", (error as Error).name, "-", (error as Error).message);
}
```

Output of `npx tsx missing-env.ts`

```ts
our check: GOOGLE_CLIENT_ID is not set. Add it to your .env file.
the package: OAuthConfigurationError - clientId is required and must be a non-empty string.
```

The package refuses to work with an empty client id or secret, even for step 1, which does not send the secret. Like in the last lesson, the other examples on this page import a demo-only file first, so they run without your `.env`:

demo-env.tsNode.js only

```ts
/*
 * DEMO ONLY. Lets the examples on this page run without a Google account.
 * The client id is a made-up public name and the secret is random for this run,
 * so nothing here can talk to the real Google. Never copy this into your app.
 */
import { randomBytes } from "node:crypto";

process.env.GOOGLE_CLIENT_ID ??= "task-api-demo.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET ??= randomBytes(24).toString("base64url");
process.env.JWT_ACCESS_SECRET ??= randomBytes(32).toString("base64url");
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString("base64url");
```

## Step 1: the authorization URL

start.tsNode.js only

```ts
import "./demo-env.js";
import { createAuthorizationUrl, generateState } from "@zudojs/auth-oauth";
import { CALLBACK_URL, googleConfig } from "./google.js";

const start = createAuthorizationUrl(googleConfig(), {
  state: generateState(),
  redirectUri: CALLBACK_URL,
});

const url = new URL(start.url);
console.log(url.origin + url.pathname);
for (const [name, value] of url.searchParams) {
  console.log(`  ${name} = ${value}`);
}
console.log("keep on the server:", Object.keys(start));
console.log("secret in the URL?", start.url.includes(process.env.GOOGLE_CLIENT_SECRET!));
console.log("verifier in the URL?", start.url.includes(start.codeVerifier));
```

Output of `npx tsx start.ts`

```ts
https://accounts.google.com/o/oauth2/v2/auth
  access_type = offline
  prompt = consent
  response_type = code
  client_id = task-api-demo.apps.googleusercontent.com
  redirect_uri = http://localhost:3000/auth/google/callback
  scope = openid email profile
  state = GN0lrhektq-3AHYlpviVIs4koaN7HFrelwr9ewQNlRE
  code_challenge = nmrvjNoGTT0fjHO9-dkBYOrAzZ1V_h7aH1zwI9oXiFA
  code_challenge_method = S256
keep on the server: [ 'url', 'state', 'codeVerifier', 'codeChallenge' ]
secret in the URL? false
verifier in the URL? false
```

The browser will see this URL, so everything in it is public:

- `response_type=code` asks for the authorization code flow. `client_id`, `redirect_uri` and `scope` say who is asking, where to come back to, and for what.
- `access_type=offline` and `prompt=consent` come from the Google preset. They make Google issue a refresh token.
- `state` and `code_challenge` are the two protections, explained next. They are random, so yours will differ. `generateState()` makes 43 random characters; `createAuthorizationUrl` refuses a state shorter than 16, because a short one could be guessed.
- The client secret and the `codeVerifier` are **not** in the URL. The function returns the verifier to you, and you keep it on the server until step 5.

## State: is this callback for a login I started?

Your callback URL is public. Anyone can make a browser open `/auth/google/callback?code=...`. Here is the attack that state prevents: an attacker signs in at Google with *their own* account, stops before the callback, and sends you a link with their code. If your server accepted it, you would be logged in to the attacker's account, and everything you then saved would be theirs to read. This is login CSRF (cross-site request forgery).

The fix: before step 1 your server creates a random `state`, stores it on the server for this browser, and sends it to Google. Google returns it unchanged in step 4. A callback whose state does not match a login *this browser* started is rejected. Each pending login is also used **once** and expires after 10 minutes:

pending.tsNode.js only

```ts
import { randomBytes } from "node:crypto";
import { OAuthStateMismatchError, verifyState } from "@zudojs/auth-oauth";

interface PendingLogin {
  readonly state: string;
  readonly codeVerifier: string;
  readonly expiresAt: number;
}

const pending = new Map<string, PendingLogin>();
const TEN_MINUTES = 10 * 60 * 1000;

export function savePendingLogin(state: string, codeVerifier: string): string {
  const loginId = randomBytes(32).toString("base64url");
  pending.set(loginId, { state, codeVerifier, expiresAt: Date.now() + TEN_MINUTES });
  return loginId;
}

export function takeVerifiedLogin(loginId: string | undefined, receivedState: string): string {
  const login = loginId === undefined ? undefined : pending.get(loginId);
  if (loginId !== undefined) pending.delete(loginId);
  if (login === undefined || login.expiresAt < Date.now() || !verifyState(login.state, receivedState)) {
    throw new OAuthStateMismatchError();
  }
  return login.codeVerifier;
}
```

- `savePendingLogin` stores the state and the PKCE verifier under a random `loginId`. The browser only gets the `loginId`, in an HttpOnly cookie. The state and the verifier never leave the server.
- `takeVerifiedLogin` deletes the entry *before* checking it, so the same callback can never be used twice, even when the check fails.
- `verifyState` compares in constant time, so an attacker cannot guess the state one character at a time by measuring response times. It returns `false` for an empty or missing value. It does not throw, so you throw `OAuthStateMismatchError` yourself.

Now try a forged state, a missing cookie, an empty state, the real callback, and a replay of it:

try-state.tsNode.js only

```ts
import { OAuthStateMismatchError, generateState } from "@zudojs/auth-oauth";
import { savePendingLogin, takeVerifiedLogin } from "./pending.js";

function callback(label: string, loginId: string | undefined, state: string): void {
  try {
    console.log(label, "-> ok, verifier", takeVerifiedLogin(loginId, state));
  } catch (error) {
    if (error instanceof OAuthStateMismatchError) console.log(label, "->", error.statusCode, error.message);
  }
}

const state = generateState();
const loginId = savePendingLogin(state, "the-verifier");

callback("forged state", savePendingLogin(state, "v"), generateState());
callback("no login cookie", undefined, state);
callback("empty state", savePendingLogin(state, "v"), "");
callback("real callback", loginId, state);
callback("same callback again", loginId, state);
```

Output of `npx tsx try-state.ts`

```ts
forged state -> 400 OAuth state verification failed.
no login cookie -> 400 OAuth state verification failed.
empty state -> 400 OAuth state verification failed.
real callback -> ok, verifier the-verifier
same callback again -> 400 OAuth state verification failed.
```

Only the real callback passes, and only once. All failures give the same message, so an attacker learns nothing about which check failed.

> COMMON MISTAKE
>
> Comparing the state with `===` against a value from a cookie that the browser also sends back. If both sides come from the browser, an attacker controls both. Keep the state on the server, like `pending.ts` does.

## PKCE: is this the server that started the login?

The `code` travels through the browser in step 4, and a URL can leak: browser history, a proxy log, a malicious browser extension. **PKCE** (Proof Key for Code Exchange, say "pixy") makes a stolen code useless:

1. Before step 1 your server creates a random secret, the **code verifier**.
2. It sends only its SHA-256 hash, the **code challenge**, in the URL. Google remembers it with the code.
3. In step 5 your server sends the verifier itself. Google hashes it and compares it with the challenge. A thief has the code but not the verifier.

The challenge is `base64url(SHA-256(verifier))`. The standard that defines PKCE, RFC 7636, contains an example pair. Check the package against it, and against Node's own SHA-256:

pkce.tsNode.js only

```ts
import { createHash } from "node:crypto";
import { assertValidCodeVerifier, deriveCodeChallenge, generateCodeVerifier, OAuthError } from "@zudojs/auth-oauth";

const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
console.log("package:  ", deriveCodeChallenge(verifier));
console.log("by hand:  ", createHash("sha256").update(verifier).digest("base64url"));
console.log("RFC 7636: ", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");

const mine = generateCodeVerifier();
console.log(mine.length, "characters,", deriveCodeChallenge(mine) === deriveCodeChallenge(generateCodeVerifier()));

try {
  assertValidCodeVerifier("too-short");
} catch (error) {
  if (error instanceof OAuthError) console.log(error.code, "-", error.message);
}
```

Output of `npx tsx pkce.ts`

```ts
package:   E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
by hand:   E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
RFC 7636:  E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
64 characters, false
OAUTH_PKCE_INVALID - PKCE code verifier must be 43-128 characters from the unreserved alphabet.
```

All three agree. A generated verifier is 64 random characters, and two verifiers never give the same challenge. The package only implements the `S256` method. The older `plain` method sends the verifier itself in the URL, which protects nothing, so you cannot turn it on.

REASON IT OUT

### state already stops login CSRF. Why also carry PKCE, and could one replace the other?

`state` is a random value your server made up and checks on the way back; PKCE is a verifier and a hash of it. Both end up as extra values around the same authorization code. Before writing the callback handler: what attack does each one stop, and does dropping either one leave a real hole?

**Show the reasoning**

They defend against different attackers at different points. `state` answers "is this callback for a login *my server* started?" — without it, an attacker can start their own login with Google, capture the resulting code, and trick a victim's browser into visiting your callback URL with that code, logging the victim into the attacker's account (login CSRF). PKCE answers a different question: "is whoever is exchanging this code the same server that requested it?" — it defends against the code itself leaking after a legitimate login already started, from browser history, a proxy log or a malicious extension on the user's machine.

Dropping `state` leaves the CSRF hole open even though PKCE is present, because PKCE never checks that the flow belongs to this browser's session — it only checks that the exchanger holds the original verifier, which an attacker who started their own login also holds. Dropping PKCE leaves code interception open even though `state` is present, because `state` never travels with a secret the thief lacks. Neither substitutes for the other; a correct flow checks both, in the order this lesson does: `state` first, to know the callback is even yours, then the code exchange, which PKCE protects.

## Steps 4 to 6: code, token, profile

To test the rest without the internet, here is a small stand-in for Google. `signInAtGoogle` plays steps 2 to 4: it takes the authorization URL and returns the callback URL with a new code. `fakeGoogleFetch` answers the token and profile requests, and checks PKCE exactly like Google: the verifier must hash to the challenge that came with the code, and each code works once.

fake-google.tsNode.js only

```ts
import { createHash, randomBytes } from "node:crypto";
import type { FetchLike } from "@zudojs/auth-oauth";

/* A tiny stand-in for Google, for testing only. It never touches the network. */
const codes = new Map<string, { challenge: string; redirectUri: string }>();
const accessTokens = new Set<string>();

export function signInAtGoogle(authorizationUrl: string): string {
  const params = new URL(authorizationUrl).searchParams;
  const code = randomBytes(16).toString("hex");
  const redirectUri = params.get("redirect_uri") ?? "";
  codes.set(code, { challenge: params.get("code_challenge") ?? "", redirectUri });
  return `${redirectUri}?code=${code}&state=${params.get("state")}`;
}

export const fakeGoogleFetch: FetchLike = async (url, init) => {
  if (url === "https://oauth2.googleapis.com/token") {
    const form = new URLSearchParams(String(init.body));
    const grant = codes.get(form.get("code") ?? "");
    codes.delete(form.get("code") ?? "");
    const proof = createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url");
    if (!grant || grant.challenge !== proof || grant.redirectUri !== form.get("redirect_uri")) {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }
    const accessToken = randomBytes(16).toString("hex");
    accessTokens.add(accessToken);
    return Response.json({ access_token: accessToken, token_type: "Bearer", expires_in: 3599 });
  }
  const auth = new Headers(init.headers).get("authorization") ?? "";
  if (!accessTokens.has(auth.replace("Bearer ", ""))) {
    return Response.json({ error: "invalid_token" }, { status: 401 });
  }
  return Response.json({ sub: "10769150350006150715113082367", email: "ada@example.com", email_verified: true, name: "Ada Lovelace" });
};
```

Now the real package calls, `exchangeCodeForToken` (step 5) and `fetchUserInfo` (step 6), first with a wrong verifier, then correctly, then with the same code again:

exchange.tsNode.js only

```ts
import "./demo-env.js";
import { createAuthorizationUrl, exchangeCodeForToken, fetchUserInfo, generateState, OAuthProviderError } from "@zudojs/auth-oauth";
import { fakeGoogleFetch, signInAtGoogle } from "./fake-google.js";
import { CALLBACK_URL, googleConfig } from "./google.js";

const config = googleConfig(fakeGoogleFetch);
const start = createAuthorizationUrl(config, { state: generateState(), redirectUri: CALLBACK_URL });

const callback = new URL(signInAtGoogle(start.url));
const code = callback.searchParams.get("code") ?? "";
console.log("back at", callback.pathname, "with", [...callback.searchParams.keys()]);

try {
  await exchangeCodeForToken(config, { code, codeVerifier: "x".repeat(64), redirectUri: CALLBACK_URL });
} catch (error) {
  if (error instanceof OAuthProviderError) console.log("wrong verifier ->", error.message);
}

const second = new URL(signInAtGoogle(start.url)).searchParams.get("code") ?? "";
const tokens = await exchangeCodeForToken(config, { code: second, codeVerifier: start.codeVerifier, redirectUri: CALLBACK_URL });
console.log("token type:", tokens.tokenType, "expires in:", tokens.expiresIn);

const profile = await fetchUserInfo(config, tokens.accessToken);
console.log(profile.providerId, profile.email, profile.emailVerified, profile.name);

try {
  await exchangeCodeForToken(config, { code: second, codeVerifier: start.codeVerifier, redirectUri: CALLBACK_URL });
} catch (error) {
  if (error instanceof OAuthProviderError) console.log("same code again ->", error.statusCode, error.providerError);
}
```

Output of `npx tsx exchange.ts`

```ts
back at /auth/google/callback with [ 'code', 'state' ]
wrong verifier -> The token endpoint returned HTTP 400 (invalid_grant).
token type: Bearer expires in: 3599
10769150350006150715113082367 ada@example.com true Ada Lovelace
same code again -> 502 invalid_grant
```

- With a wrong verifier the provider refuses the code. That is what happens to a thief who has only the code. Like Google, the stand-in then throws the code away, so the example signs in a second time.
- `fetchUserInfo` turns each provider's own profile format into one shape: `providerId`, `email`, `emailVerified`, `name`, `avatarUrl`.
- Provider errors are `OAuthProviderError` with status 502 (Bad Gateway: a service behind you failed). The message contains only the short OAuth error code, never a secret, a token or the provider's free-text description.

## The whole flow in the Task API

After step 6 you know that Google vouches for this person. Now your app takes over. First, find or create the local account. Key it by provider and provider id, **not by email**: emails change, and an email that is not verified proves nothing. The role is chosen by your server, as always:

accounts.tsNode.js only

```ts
import { toUserId } from "@zudojs/auth";
import type { AuthUser, UserId } from "@zudojs/auth";
import type { OAuthProvider, OAuthUserInfo } from "@zudojs/auth-oauth";

const byProviderId = new Map<string, AuthUser>();

export function findOrCreateAccount(provider: OAuthProvider, profile: OAuthUserInfo): AuthUser {
  const key = `${provider}:${profile.providerId}`;
  const existing = byProviderId.get(key);
  if (existing !== undefined) return existing;
  const user: AuthUser = {
    id: toUserId(`u-${byProviderId.size + 1}`),
    email: profile.emailVerified === true && profile.email !== undefined ? profile.email : "",
    name: profile.name,
    roles: ["user"],
    active: true,
    createdAt: new Date(),
  };
  byProviderId.set(key, user);
  return user;
}

export async function findAccountById(id: UserId): Promise<AuthUser | null> {
  return [...byProviderId.values()].find((user) => user.id === id) ?? null;
}
```

Second, start a session. `@zudojs/auth`'s `login()` needs a password, which an OAuth user does not have. `auth.createSessionForUser(userId, { method })` creates the session and its tokens for a user your code has already authenticated in another way. The auth service then checks these tokens, and logs them out, exactly like password logins:

sessions.tsNode.js only

```ts
import { createAuthService, createMemorySessionStore } from "@zudojs/auth";
import { findAccountById } from "./accounts.js";
import { requireEnv } from "./env.js";

export const auth = createAuthService({
  token: {
    accessSecret: requireEnv("JWT_ACCESS_SECRET"),
    refreshSecret: requireEnv("JWT_REFRESH_SECRET"),
  },
  sessionStore: createMemorySessionStore(),
  sessionTtlSeconds: 30 * 60,
  absoluteSessionTtlSeconds: 7 * 24 * 60 * 60,
  findUser: async () => null,
  findUserById: findAccountById,
  verifyPassword: async () => false,
  externalSessionMethods: ["oauth"],
});
```

- `findUser` returns `null` and `verifyPassword` returns `false`, so password login is switched off for this service. In an app with both kinds of login, you pass your real functions.
- `createSessionForUser` checks no password: it trusts your code. So it is switched off until you list the method in `externalSessionMethods`. It still loads the user with `findUserById` and refuses an unknown or deactivated one. Call it only after the callback has checked the state and exchanged the code, and never with a user id taken from the request.

Third, the two routes:

server.tsNode.js only

```ts
import { parseCookies } from "@zudojs/auth";
import { createAuthorizationUrl, exchangeCodeForToken, fetchUserInfo, generateState } from "@zudojs/auth-oauth";
import type { OAuthConfig } from "@zudojs/auth-oauth";
import { badRequest, createNodeHttpAdapter, createResponseContext, createRouter } from "@zudojs/http";
import { findOrCreateAccount } from "./accounts.js";
import { CALLBACK_URL } from "./google.js";
import { savePendingLogin, takeVerifiedLogin } from "./pending.js";
import { auth } from "./sessions.js";

export async function startServer(google: OAuthConfig, port = 0) {
  const router = createRouter();

  router.get("/auth/google", () => {
    const state = generateState();
    const { url, codeVerifier } = createAuthorizationUrl(google, { state, redirectUri: CALLBACK_URL });
    const loginId = savePendingLogin(state, codeVerifier);
    return createResponseContext()
      .cookie("oauth_login", loginId, { maxAge: 600, path: "/auth/google" })
      .redirect(url);
  });

  router.get("/auth/google/callback", async (ctx) => {
    const loginId = parseCookies(ctx.request.getHeader("cookie")).oauth_login;
    const state = typeof ctx.query.state === "string" ? ctx.query.state : "";
    const codeVerifier = takeVerifiedLogin(loginId, state);
    const code = ctx.query.code;
    if (typeof code !== "string" || code === "") throw badRequest("Sign-in was cancelled");

    const tokens = await exchangeCodeForToken(google, { code, codeVerifier, redirectUri: CALLBACK_URL });
    const user = findOrCreateAccount("google", await fetchUserInfo(google, tokens.accessToken));
    const session = await auth.createSessionForUser(user.id, { method: "oauth", metadata: { provider: "google" } });
    return createResponseContext()
      .cookie("oauth_login", "", { maxAge: 0, path: "/auth/google" })
      .json({ userId: user.id, accessToken: session.tokens.accessToken });
  });

  const adapter = createNodeHttpAdapter({
    host: "127.0.0.1",
    port,
    handler: async (request) => (await router.dispatch(request)).response,
  });
  await adapter.start();
  return { url: `http://127.0.0.1:${adapter.address?.port}`, stop: () => adapter.stop() };
}
```

- `GET /auth/google` saves the pending login, sets the `oauth_login` cookie (HttpOnly, Secure and SameSite=Lax by default, 10 minutes, only sent to `/auth/google...`) and redirects the browser to Google.
- `SameSite=Lax` still sends the cookie when Google redirects the browser back, because that is a normal top-level navigation with `GET`.
- The callback checks state **first**. A forged callback never reaches Google. If the user pressed "Cancel" at Google, there is no `code` and the answer is 400.
- The Google access token is used once and thrown away. The client gets *your* token, from your session.
- Errors like `OAuthStateMismatchError` carry their status (400), so the HTTP layer answers with it. Configuration errors are 500 with a hidden message.

Test the whole flow: start, "sign in at Google", callback, then a replay of the same callback and a callback from a browser that never started a login:

try-oauth.tsNode.js only

```ts
import "./demo-env.js";
import { fakeGoogleFetch, signInAtGoogle } from "./fake-google.js";
import { googleConfig } from "./google.js";
import { startServer } from "./server.js";
import { auth } from "./sessions.js";

const server = await startServer(googleConfig(fakeGoogleFetch));

const start = await fetch(server.url + "/auth/google", { redirect: "manual" });
const cookie = (start.headers.get("set-cookie") ?? "").split(";")[0]!;
console.log(start.status, new URL(start.headers.get("location")!).host, cookie.split("=")[0]);

const callback = new URL(signInAtGoogle(start.headers.get("location")!));
const path = callback.pathname + callback.search;

const done = await fetch(server.url + path, { headers: { cookie } });
const body = (await done.json()) as { userId: string; accessToken: string };
console.log(done.status, body.userId, (await auth.verifyToken(body.accessToken)).sub);

const replay = await fetch(server.url + path, { headers: { cookie } });
console.log("replayed callback:", replay.status, await replay.text());

const noCookie = await fetch(server.url + path);
console.log("callback without cookie:", noCookie.status, await noCookie.text());
await server.stop();
```

Output of `npx tsx try-oauth.ts`

```ts
302 accounts.google.com oauth_login
200 u-1 u-1
replayed callback: 400 {"error":"OAuth state verification failed.","code":"OAUTH_STATE_MISMATCH"}
callback without cookie: 400 {"error":"OAuth state verification failed.","code":"OAUTH_STATE_MISMATCH"}
```

The first request answers 302 (a redirect) to `accounts.google.com` and sets the cookie. After the callback, the Task API's own `auth.verifyToken` accepts the new token for user `u-1`. The replay and the cookie-less callback, the login CSRF attack from above, both get 400.

### With the real Google

The only change is to leave out the stand-in and listen on port 3000, the port in `CALLBACK_URL`. This file needs real credentials, so it is not run on this page:

main.tsNode.js only

```ts
import { googleConfig } from "./google.js";
import { startServer } from "./server.js";

const server = await startServer(googleConfig(), 3000);
console.log(`Open http://localhost:3000/auth/google in your browser (server on ${server.url})`);
```

Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and the two JWT secrets in `.env`, add `http://localhost:3000/auth/google/callback` as an authorized redirect URI in the Google console, and run `npx tsx --env-file=.env src/main.ts`. Open the printed address, sign in, and the browser shows a JSON object with your new `userId` and `accessToken`. In a real web app you would put the token in an HttpOnly cookie and redirect to your home page instead of showing JSON.

> IN PRODUCTION
>
> Use an `https://` callback URL. The package allows `http` only for `localhost`, `127.0.0.1` and `[::1]`. And keep pending logins in a shared store (your database or Redis) if you run more than one server: the callback may reach a different server than the start.

## Providers differ

Some differences show up as errors from the package, before any request is made:

limits.tsNode.js only

```ts
import "./demo-env.js";
import { fetchUserInfo, normalizeUserInfo, OAuthError, refreshAccessToken } from "@zudojs/auth-oauth";
import { googleConfig } from "./google.js";

const google = googleConfig();

async function show(label: string, action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof OAuthError) console.log(label, "->", error.name, "-", error.message);
  }
}

await show("GitHub refresh", () => refreshAccessToken({ ...google, provider: "github" }, "stored-refresh-token"));
await show("Apple profile", () => fetchUserInfo({ ...google, provider: "apple" }, "access-token"));
await show("token URL to cloud metadata", () =>
  refreshAccessToken({ ...google, tokenUrl: "https://169.254.169.254/latest/meta-data" }, "stored-refresh-token"));

console.log(normalizeUserInfo("github", { id: 583231, login: "octocat", avatar_url: "https://avatars.githubusercontent.com/u/583231" }));
```

Output of `npx tsx limits.ts`

```ts
GitHub refresh -> OAuthConfigurationError - This provider does not issue refresh tokens for the authorization-code flow.
Apple profile -> OAuthConfigurationError - Apple has no user-info endpoint; read the profile from the id_token returned by the token exchange.
token URL to cloud metadata -> OAuthEndpointNotAllowedError - tokenUrl resolves to a non-public host, which is not allowed.
{
  providerId: '583231',
  name: 'octocat',
  avatarUrl: 'https://avatars.githubusercontent.com/u/583231',
  raw: {
    id: 583231,
    login: 'octocat',
    avatar_url: 'https://avatars.githubusercontent.com/u/583231'
  }
}
```

- **GitHub** tokens do not expire and come with no refresh token, so there is nothing to refresh.
- **Apple** has no profile endpoint. The profile is inside the `idToken` from the token exchange, and this package does not check that token's signature. You must verify it yourself before trusting it. Apple also sends its callback as a `POST` form (`response_mode=form_post`), which a `SameSite=Lax` cookie does not follow.
- Your server fetches the token and profile URLs itself. The package refuses private and cloud-metadata addresses there, so a bad configuration cannot make your server fetch internal secrets. This attack is called SSRF, server-side request forgery.
- A GitHub profile without a public email simply has no `email`. The package never makes one up, so your code must handle an account without an email.

> ACCOUNT TAKEOVER
>
> Never link an OAuth login to an existing password account just because the emails match, unless the provider says the email is verified and the user proves they own the existing account (for example by logging in to it first). Otherwise anyone who creates a provider account with Ada's address could log in as Ada.

## Practice

TRY IT YOURSELF

### Spot the mistakes

This callback handler works, but has three security problems. Find them.

```ts
router.get("/auth/google/callback", async (ctx) => {
  const tokens = await exchangeCodeForToken(google, {
    code: String(ctx.query.code), codeVerifier: String(ctx.query.verifier), redirectUri: CALLBACK_URL,
  });
  const profile = await fetchUserInfo(google, tokens.accessToken);
  const user = usersByEmail.get(profile.email ?? "") ?? createUser(profile);
  return createResponseContext().json({ googleToken: tokens.accessToken });
});
```

**Show a solution**

1. No state check. Anyone can send a victim a callback link with the attacker's code (login CSRF). Take the pending login from the server and call `verifyState` first.
2. The PKCE verifier comes from the query string, so it travelled through the browser next to the code. A thief who has one has both. Keep the verifier on the server, as in `pending.ts`.
3. Accounts are matched by email, verified or not, which allows account takeover. And the handler returns Google's access token to the browser instead of starting your own session. Key accounts by `provider:providerId` and return your own token.

TRY IT YOURSELF

### A GitHub config

Write `githubConfig()` like `googleConfig()`, reading `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, with the callback `http://localhost:3000/auth/github/callback` and only the `read:user` scope. Print the `scope` and `redirect_uri` of its authorization URL.

**Show a solution**

github.tsNode.js only

```ts
import { randomBytes } from "node:crypto";
import { createAuthorizationUrl, generateState } from "@zudojs/auth-oauth";
import type { OAuthConfig } from "@zudojs/auth-oauth";
import { requireEnv } from "./env.js";

process.env.GITHUB_CLIENT_ID ??= "demo-github-client-id";
process.env.GITHUB_CLIENT_SECRET ??= randomBytes(24).toString("base64url");

const GITHUB_CALLBACK = "http://localhost:3000/auth/github/callback";

function githubConfig(): OAuthConfig {
  return {
    provider: "github",
    clientId: requireEnv("GITHUB_CLIENT_ID"),
    clientSecret: requireEnv("GITHUB_CLIENT_SECRET"),
    allowedRedirectUris: [GITHUB_CALLBACK],
    scopes: ["read:user"],
  };
}

const { url } = createAuthorizationUrl(githubConfig(), { state: generateState(), redirectUri: GITHUB_CALLBACK });
const params = new URL(url).searchParams;
console.log(new URL(url).host, params.get("scope"), params.get("redirect_uri"));
```

Output of `npx tsx github.ts`

```ts
github.com read:user http://localhost:3000/auth/github/callback
```

The two `??=` lines are demo-only placeholders, like `demo-env.ts`. Without `user:email`, GitHub profiles will usually have no email.

## Recap

- OAuth 2's authorization code flow lets a provider check who the user is. The code comes back through the browser; the token and the client secret stay between servers.
- The client id is public, the client secret lives in `.env`, and redirect URIs are an allow-list.
- `state` is stored on the server, checked with `verifyState` before anything else, and used once. It stops login CSRF.
- PKCE: the server keeps the verifier and sends only its SHA-256 challenge, so a stolen code is useless. The package always uses `S256`.
- `exchangeCodeForToken` and `fetchUserInfo` finish the flow. Then you find or create the account by `provider:providerId` and start your own session.
- Providers differ: no refresh on GitHub, no profile endpoint on Apple, email is optional. Never link accounts on an unverified email.

You now know who is calling. Next, decide what they may do, in [Permissions](https://zudojs.oyinlola.site/learn/zudo-permissions).

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
