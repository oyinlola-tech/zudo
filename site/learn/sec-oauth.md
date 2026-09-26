---
title: "OAuth 2.0 and OpenID Connect — ZudoJS Academy"
description: "Implement the OAuth code flow with PKCE and OpenID Connect against your own small authorization server, then attack it with forged states and stolen codes."
source: https://zudojs.oyinlola.site/learn/sec-oauth
---

LEVEL 10 · LESSON 2 OF 6

Identity Core

# OAuth 2.0 and OpenID Connect

Implement the OAuth code flow with PKCE and OpenID Connect against your own small authorization server, then attack it with forged states and stolen codes.

- **60 min** to read and try
- **You need:** Authentication, and Cryptography with node:crypto
- **You build:** A working authorization server and client in Node.js, with real PKCE S256 maths, state and nonce checks, a code-for-token exchange, RS256 ID tokens verified through a JWKS endpoint, and scoped access tokens

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Name the four OAuth roles and explain what each token (authorization code, access token, refresh token, ID token) is for
- Compute and verify a PKCE S256 code challenge, and explain what it stops
- Implement the authorization code flow with state, nonce and exact redirect URI matching
- Verify an OpenID Connect ID token (signature via JWKS, issuer, audience, expiry, nonce)
- Enforce scopes at the resource server
- Recognise the common OAuth mistakes and the OAuth 2.1 rules that remove them

## "Give us your bank password"

A budgeting app wants to show Ada her spending. It needs her bank transactions. The old way was blunt: the app asked for Ada's online-banking password, logged in as her, and read the pages. Think about what that gives away:

- The app can do *anything* Ada can: transfer money, change her address, read her messages. It only needed to read transactions.
- Ada cannot take the access back without changing her password, which also breaks every other app she gave it to.
- The app now stores her bank password. If the app is breached, so is her bank account.
- The bank cannot tell Ada from the app, so it cannot protect her with, for example, a second factor on log-in.

**OAuth 2.0** is the standard answer. Ada signs in *at the bank*, on the bank's own page, and approves a narrow request: "Budget App wants to read your transactions". The bank then gives the app a **token** that allows only that, can expire, and can be revoked on its own. The app never sees the password.

OAuth is about *authorization*: what an app may do. Log-in with Google or GitHub is *authentication*: who the user is. **OpenID Connect** (OIDC) is a thin layer on top of OAuth that adds exactly that, as a signed **ID token**. This lesson builds both, with no library: a small authorization server and a client, in Node.js, and then attacks them. [Sign in with OAuth](https://zudojs.oyinlola.site/learn/zudo-oauth) later uses `@zudojs/auth-oauth` for the client side; after this lesson you will know what every step of it checks.

## Roles, tokens and the flow

OAuth names four roles:

- the **resource owner**: Ada, who owns the data;
- the **client**: the Budget App, which wants access. A **confidential** client runs on a server and can keep a **client secret**; a **public** client (a mobile or single-page app) cannot, because anyone can read its code;
- the **authorization server**: the bank's log-in service, which authenticates Ada, asks for her consent and issues tokens;
- the **resource server**: the bank's API, which accepts tokens and serves data.

What the client asks for is expressed as **scopes**, space-separated names such as `openid email transactions:read`. And there are four kinds of credential, each with one job:

| Credential | Who receives it | What it is for | Lifetime |
| --- | --- | --- | --- |
| Authorization code | The client, through the browser | A one-time ticket to exchange for tokens | About a minute, single use |
| Access token | The client, server to server | Calling the resource server's API, within its scopes | Minutes to an hour |
| Refresh token | The client, server to server | Getting new access tokens without asking Ada again | Days to months, revocable |
| ID token (OIDC) | The client | Telling the client who logged in; never sent to APIs | Minutes; checked once at log-in |

The **authorization code flow** with PKCE is the one flow you should use for users, whatever the client type:

```ts
 Ada's browser            Budget App (client)             Bank (authorization server + API)
      │  click "Connect bank"  │                                     │
      │ ─────────────────────► │ make state, nonce, code_verifier    │
      │ ◄───── 302 to /authorize?client_id&redirect_uri&scope       │
      │        &state&nonce&code_challenge                           │
      │ ───────────────────────────────────────────────────────────► │ Ada signs in, consents
      │ ◄───── 302 to https://budget.example/callback?code&state ─── │
      │ ─────────────────────► │ check state                         │
      │                        │ POST /token: code + code_verifier   │
      │                        │ + client secret  ─────────────────► │ check code, PKCE, secret
      │                        │ ◄──── access_token, id_token ────── │
      │                        │ verify ID token (JWKS, aud, nonce)  │
      │                        │ GET /api/transactions  ───────────► │ check token and scope
```

The code travels through the browser; the tokens travel only between servers.

## What can go wrong

REASON IT OUT

### Before you trust a callback

The callback URL, `https://budget.example/callback?code=…&state=…`, is public. Before writing the client, think it through:

- Who can make a browser open that URL, with any code they like?
- The code sits in a URL. Where can a URL leak?
- What stops someone who has a leaked code from exchanging it for tokens?
- What if an attacker changes `redirect_uri` in the authorization URL to their own site?
- The ID token says "this is Ada". What stops an attacker from giving the Budget App an ID token that some *other* app received for Ada, or an old one?

**Show the reasoning**

**Anyone.** An attacker can sign in at the bank as *themselves*, stop before the callback, and trick Ada's browser into opening the callback with the attacker's code. If the app accepts it, Ada's session is now linked to the attacker's bank account, and whatever she saves is theirs (**login CSRF**). The `state` parameter stops this: a random value the app created for *this* browser's log-in and stored on the server, which must come back unchanged.

URLs leak through browser history, proxy and server logs, the `Referer` header, and malicious apps on phones that register the same URL scheme. So a code must be short-lived and single-use, and holding it must not be enough.

**PKCE** (Proof Key for Code Exchange): the app sends a hash of a random secret in the first step and the secret itself in the exchange. A thief has the code but not the secret. A confidential client also authenticates with its client secret.

The authorization server must compare `redirect_uri` **exactly** against the values registered for the client, and refuse (without redirecting) when it does not match. Otherwise it would hand codes to the attacker's site.

The ID token must be verified: signed by the provider (checked with the provider's published keys), `iss` is the provider, `aud` is *this* client's id, not expired, and its `nonce` equals the random value this log-in sent. A token for another app fails `aud`; an old or replayed one fails `exp` or `nonce`.

## PKCE, by hand

PKCE is defined in RFC 7636. The client creates a **code verifier**: 43 to 128 characters from the "unreserved" set (letters, digits, `-`, `.`, `_`, `~`). It sends the **code challenge** in the authorization request:

code_challenge = BASE64URL( SHA-256( code_verifier ) ), with code_challenge_method = S256

At the exchange it sends the verifier itself, and the server recomputes the hash and compares. Because SHA-256 cannot be reversed, seeing the challenge in a URL does not reveal the verifier. Public clients such as single-page apps compute this in the browser, so this example uses Web Crypto, which works in both the browser and Node.js. It checks the example pair printed in the RFC itself:

pkce.js

```ts
function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function challengeFor(verifier) {
  return base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
}

const rfcVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
console.log("computed: ", await challengeFor(rfcVerifier));
console.log("RFC 7636: ", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");

const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
const valid = /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier);
const challenge = await challengeFor(verifier);
console.log("new verifier:", verifier.length, "chars, valid:", valid, "| challenge:", challenge.length, "chars");
console.log("challenge reveals verifier:", challenge.includes(verifier));
```

Output of `node pkce.js` and of the browser terminal

```ts
computed:  E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
RFC 7636:  E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
new verifier: 43 chars, valid: true | challenge: 43 chars
challenge reveals verifier: false
```

32 random bytes encode to exactly 43 base64url characters, the minimum length, with 256 bits of randomness. The RFC also defines a `plain` method where the challenge *is* the verifier. It protects nothing against anyone who can read the URL, so servers should refuse it; the OAuth 2.1 draft requires S256.

## A small authorization server

To see every check from the server's side, here is a complete, tiny authorization server and resource server in one `node:http` process: the bank. It is for learning and testing only, but each rule in it is one that real servers apply:

- `GET /authorize`: validates the client and its **exactly** registered redirect URI, requires a PKCE S256 challenge, checks the scopes, and (Ada having already signed in at the bank, and consented) redirects back with a code. The code remembers the client, the redirect URI, the challenge, the scopes, the nonce and the user.
- `POST /token`: authenticates the client with its secret, redeems a code once, checks the redirect URI and the PKCE verifier, and returns an access token and, for `openid`, an ID token signed with RS256.
- `GET /jwks`: the public key that verifies ID tokens, as a **JSON Web Key Set**.
- `GET /api/transactions` and `POST /api/transfers`: the bank's API, which checks the access token and its scopes.

bank.js

```ts
import http from "node:http";
import { createHash, generateKeyPairSync, randomBytes, sign, timingSafeEqual } from "node:crypto";

export const ISSUER = "https://id.bank.example";
const KID = "bank-key-2026-09";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const sha256 = (text) => createHash("sha256").update(text).digest();
const random = () => randomBytes(32).toString("base64url");
const b64 = (object) => Buffer.from(JSON.stringify(object)).toString("base64url");

const CLIENTS = {
  "budget-app": { secret: "budget-app-secret-0123456789", redirectUris: ["https://budget.example/callback"], scopes: ["openid", "email", "transactions:read"] },
  "quiz-app": { secret: "quiz-app-secret-0123456789", redirectUris: ["https://quiz.example/callback"], scopes: ["openid", "email"] },
};
const USERS = { ada: { sub: "248289761001", email: "ada@example.com", email_verified: true } };
const codes = new Map();
const accessTokens = new Map();

function idToken(claims) {
  const signingInput = `${b64({ alg: "RS256", typ: "JWT", kid: KID })}.${b64(claims)}`;
  return `${signingInput}.${sign("sha256", Buffer.from(signingInput), privateKey).toString("base64url")}`;
}

function authorize(params, userName) {
  const clientId = params.get("client_id");
  const client = CLIENTS[clientId];
  const redirectUri = params.get("redirect_uri");
  if (!client || !client.redirectUris.includes(redirectUri)) {
    return { status: 400, body: { error: "invalid_request", error_description: "unknown client_id or redirect_uri" } };
  }
  const back = new URL(redirectUri);
  const reply = (name, value) => {
    back.searchParams.set(name, value);
    if (params.has("state")) back.searchParams.set("state", params.get("state"));
    return { status: 302, location: back.href };
  };
  const scopes = (params.get("scope") ?? "").split(" ");
  const challenge = params.get("code_challenge") ?? "";
  if (params.get("response_type") !== "code") return reply("error", "unsupported_response_type");
  if (params.get("code_challenge_method") !== "S256" || !/^[\w-]{43}$/.test(challenge)) return reply("error", "invalid_request");
  if (!scopes.every((scope) => client.scopes.includes(scope))) return reply("error", "invalid_scope");
  const user = USERS[userName];
  if (!user) return reply("error", "login_required");
  const code = random();
  codes.set(code, { clientId, redirectUri, challenge, scopes, nonce: params.get("nonce"), user, expiresAt: Date.now() + 60_000, used: false });
  return reply("code", code);
}

function token(form) {
  const clientId = form.get("client_id");
  const client = CLIENTS[clientId];
  if (!client || !timingSafeEqual(sha256(form.get("client_secret") ?? ""), sha256(client.secret))) {
    return { status: 401, body: { error: "invalid_client" } };
  }
  const code = form.get("code") ?? "";
  const grant = codes.get(code);
  if (!grant || grant.clientId !== clientId || grant.redirectUri !== form.get("redirect_uri") || grant.expiresAt < Date.now()) {
    return { status: 400, body: { error: "invalid_grant" } };
  }
  if (grant.used) {
    for (const [value, info] of accessTokens) if (info.code === code) accessTokens.delete(value);
    return { status: 400, body: { error: "invalid_grant" } };
  }
  if (sha256(form.get("code_verifier") ?? "").toString("base64url") !== grant.challenge) {
    return { status: 400, body: { error: "invalid_grant" } };
  }
  grant.used = true;
  const accessToken = random();
  accessTokens.set(accessToken, { sub: grant.user.sub, scopes: grant.scopes, code, expiresAt: Date.now() + 600_000 });
  const body = { access_token: accessToken, token_type: "Bearer", expires_in: 600, scope: grant.scopes.join(" ") };
  if (grant.scopes.includes("openid")) {
    const iat = Math.floor(Date.now() / 1000);
    body.id_token = idToken({ iss: ISSUER, sub: grant.user.sub, aud: clientId, iat, exp: iat + 600, nonce: grant.nonce, email: grant.user.email, email_verified: grant.user.email_verified });
  }
  return { status: 200, body };
}

function api(method, authorization) {
  const info = accessTokens.get((authorization ?? "").replace(/^Bearer /, ""));
  if (!info || info.expiresAt < Date.now()) return { status: 401, headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' } };
  const needed = method === "GET" ? "transactions:read" : "transactions:write";
  if (!info.scopes.includes(needed)) {
    return { status: 403, headers: { "WWW-Authenticate": `Bearer error="insufficient_scope", scope="${needed}"` } };
  }
  return { status: 200, body: [{ date: "2026-09-20", description: "Shoprite Lekki", amountKobo: -1850000 }, { date: "2026-09-22", description: "Salary", amountKobo: 45000000 }] };
}

export function startBank() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    let text = "";
    for await (const chunk of req) text += chunk;
    const userName = (req.headers.cookie ?? "").match(/provider_session=(\w+)/)?.[1];
    let result = { status: 404 };
    if (url.pathname === "/authorize") result = authorize(url.searchParams, userName);
    if (url.pathname === "/token" && req.method === "POST") result = token(new URLSearchParams(text));
    if (url.pathname === "/jwks") result = { status: 200, body: { keys: [{ ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" }] } };
    if (url.pathname.startsWith("/api/")) result = api(req.method, req.headers.authorization);
    res.writeHead(result.status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...result.headers, ...(result.location && { Location: result.location }) });
    res.end(result.body ? JSON.stringify(result.body) : undefined);
  });
  return new Promise((resolve) => {
    server.listen(0, () => resolve({ base: `http://localhost:${server.address().port}`, close: () => server.close() }));
  });
}
```

A few details worth noticing before moving on:

- An unknown client or a redirect URI that is not registered gets a 400 *on the bank's own page*. Every other error is sent back to the (verified) redirect URI with `error=…` and the `state`, so the client can show a message.
- If a code is presented a *second* time, the server refuses it and also revokes the access tokens issued from it: someone besides the client has the code, and the tokens may be in the wrong hands.
- The token response has `Cache-Control: no-store`, so no proxy or browser cache keeps a copy of the tokens.
- The resource server answers a missing or expired token with 401 and a token with the wrong scope with 403, each with a `WWW-Authenticate` header naming the error.

## The client: the Budget App

The client has two steps. `startLogin` creates three random values (`state`, `nonce` and the PKCE verifier), keeps them on the server for this browser, and builds the authorization URL. `finishLogin` handles the callback: it checks the state, exchanges the code with the verifier and the client secret, and verifies the ID token with the bank's public key from the JWKS endpoint:

budget-app.js

```ts
import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";

export const BUDGET_APP = {
  clientId: "budget-app",
  clientSecret: "budget-app-secret-0123456789",
  redirectUri: "https://budget.example/callback",
  issuer: "https://id.bank.example",
};

const random = () => randomBytes(32).toString("base64url");
const decode = (part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
const sameSecret = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function startLogin(bankBase, app = BUDGET_APP, scope = "openid email transactions:read") {
  const pending = { state: random(), nonce: random(), verifier: random() };
  const url = new URL("/authorize", bankBase);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: app.clientId,
    redirect_uri: app.redirectUri,
    scope,
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: createHash("sha256").update(pending.verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  return { url: url.href, pending };
}

export async function verifyIdToken(bankBase, app, idToken, expectedNonce) {
  const [header, payload, signature] = String(idToken).split(".");
  const { alg, kid } = decode(header);
  if (alg !== "RS256") throw new Error(`ID token algorithm ${alg} not allowed`);
  const { keys } = await (await fetch(new URL("/jwks", bankBase))).json();
  const jwk = keys.find((key) => key.kid === kid);
  if (!jwk) throw new Error("ID token signed with an unknown key");
  const key = createPublicKey({ key: jwk, format: "jwk" });
  if (!verify("sha256", Buffer.from(`${header}.${payload}`), key, Buffer.from(signature, "base64url"))) {
    throw new Error("ID token signature is invalid");
  }
  const claims = decode(payload);
  if (claims.iss !== app.issuer) throw new Error("ID token from the wrong issuer");
  if (claims.aud !== app.clientId) throw new Error("ID token was issued to another client");
  if (claims.exp < Date.now() / 1000) throw new Error("ID token expired");
  if (!sameSecret(claims.nonce, expectedNonce)) throw new Error("ID token nonce does not match this log-in");
  return claims;
}

export async function finishLogin(bankBase, callbackUrl, pending, app = BUDGET_APP) {
  const params = new URL(callbackUrl).searchParams;
  if (!sameSecret(params.get("state"), pending?.state)) throw new Error("state mismatch: not a log-in this browser started");
  if (params.has("error")) throw new Error(`the bank refused: ${params.get("error")}`);
  const response = await fetch(new URL("/token", bankBase), {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.get("code") ?? "",
      redirect_uri: app.redirectUri,
      client_id: app.clientId,
      client_secret: app.clientSecret,
      code_verifier: pending.verifier,
    }),
  });
  const tokens = await response.json();
  if (!response.ok) throw new Error(`token exchange failed: ${tokens.error}`);
  const claims = await verifyIdToken(bankBase, app, tokens.id_token, pending.nonce);
  return { account: `${claims.iss}|${claims.sub}`, email: claims.email, accessToken: tokens.access_token, scope: tokens.scope, idToken: tokens.id_token };
}
```

Two choices in `finishLogin` matter more than they look:

- The state is checked **first**, even before an `error` in the callback is believed: a forged callback must not even produce an error message of the attacker's choosing.
- The local account is keyed by `iss` plus `sub` (subject), the provider's permanent, unique id for the user. **Not** by e-mail: e-mail addresses change, get recycled, and at some providers are not verified.

The examples play the browser with a helper. Ada has already signed in at the bank (a cookie at the bank's domain), so `/authorize` redirects straight back; the helper returns the `Location` it was sent to, or the error page:

browser.js

```ts
export async function openInBrowser(url, bankUser = "ada") {
  const response = await fetch(url, { redirect: "manual", headers: { Cookie: `provider_session=${bankUser}` } });
  if (response.status === 302) return response.headers.get("location");
  return `error page ${response.status}: ${(await response.json()).error_description}`;
}
```

## The whole flow

Now run it end to end: start, sign in at the bank, come back, exchange, verify, and call the API. Random values change on every run, so the example prints their names and lengths instead of their values:

happy-path.jsNode.js only

```ts
import { startBank } from "./bank.js";
import { finishLogin, startLogin } from "./budget-app.js";
import { openInBrowser } from "./browser.js";

const bank = await startBank();

const { url, pending } = startLogin(bank.base);
const request = new URL(url);
console.log("1. to the bank:", [...request.searchParams.keys()].join(", "));

const callback = await openInBrowser(url);
console.log("2. back at:", new URL(callback).origin + new URL(callback).pathname, "with", [...new URL(callback).searchParams.keys()].join(", "));

const login = await finishLogin(bank.base, callback, pending);
console.log("3. logged in:", login.account, login.email, "| scope:", login.scope);
console.log("   access token:", login.accessToken.length, "chars, opaque; ID token parts:", login.idToken.split(".").length);

const api = (method, path) => fetch(bank.base + path, { method, headers: { Authorization: `Bearer ${login.accessToken}` } });
const read = await api("GET", "/api/transactions");
console.log("4. GET transactions:", read.status, (await read.json()).map((t) => `${t.description} ${t.amountKobo / 100}`));
const write = await api("POST", "/api/transfers");
console.log("5. POST transfer:", write.status, write.headers.get("www-authenticate"));
bank.close();
```

Output of `node happy-path.js`

```ts
1. to the bank: response_type, client_id, redirect_uri, scope, state, nonce, code_challenge, code_challenge_method
2. back at: https://budget.example/callback with code, state
3. logged in: https://id.bank.example|248289761001 ada@example.com | scope: openid email transactions:read
   access token: 43 chars, opaque; ID token parts: 3
4. GET transactions: 200 [ 'Shoprite Lekki -18500', 'Salary 450000' ]
5. POST transfer: 403 Bearer error="insufficient_scope", scope="transactions:write"
```

- The authorization URL carries everything the bank needs, and nothing secret: the challenge, not the verifier; the client id, not the secret.
- The callback carries only the code and the state.
- Ada's account at the Budget App is `issuer|sub`. Her e-mail is a display detail.
- The access token read transactions, and was refused for a transfer with 403 `insufficient_scope`. That is the point of OAuth: the Budget App got exactly the access Ada approved, and nothing more.

### Inside the ID token and the key set

The ID token is a JWT like the one you built in [Authentication](https://zudojs.oyinlola.site/learn/sec-authentication#jwt), with one difference: it is signed with **RS256**, an RSA private key that only the bank holds. Anyone can verify it with the matching *public* key, which the bank publishes at its JWKS endpoint. That is what lets thousands of client apps verify the bank's tokens without sharing a secret with it:

inside-id-token.jsNode.js only

```ts
import { startBank } from "./bank.js";
import { finishLogin, startLogin } from "./budget-app.js";
import { openInBrowser } from "./browser.js";

const bank = await startBank();
const { url, pending } = startLogin(bank.base);
const { idToken } = await finishLogin(bank.base, await openInBrowser(url), pending);

const [header, payload] = idToken.split(".").slice(0, 2).map((part) => JSON.parse(Buffer.from(part, "base64url").toString()));
console.log("header:", header);
console.log("claims:", Object.keys(payload).join(", "));
console.log("nonce is this log-in's:", payload.nonce === pending.nonce, "| lifetime:", payload.exp - payload.iat, "s");

const { keys } = await (await fetch(`${bank.base}/jwks`)).json();
const { n, ...rest } = keys[0];
console.log("published key:", rest, "| modulus:", Buffer.from(n, "base64url").length * 8, "bits");
bank.close();
```

Output of `node inside-id-token.js`

```ts
header: { alg: 'RS256', typ: 'JWT', kid: 'bank-key-2026-09' }
claims: iss, sub, aud, iat, exp, nonce, email, email_verified
nonce is this log-in's: true | lifetime: 600 s
published key: {
  kty: 'RSA',
  e: 'AQAB',
  kid: 'bank-key-2026-09',
  alg: 'RS256',
  use: 'sig'
} | modulus: 2048 bits
```

The header names the algorithm and the key id (`kid`); the client looks that id up in the key set, which lets the bank rotate keys by publishing the new one before it starts signing with it. The key set contains only the public parts of the key (the modulus `n` and exponent `e`), so publishing it gives nothing away.

## Attacking the flow

### Login CSRF: a callback this browser did not start

The attacker signs in at the bank as themselves, keeps the callback URL, and sends it to Ada. Ada's browser opens it, carrying *her* pending log-in (her state):

attack-state.jsNode.js only

```ts
import { startBank } from "./bank.js";
import { finishLogin, startLogin } from "./budget-app.js";
import { openInBrowser } from "./browser.js";

const bank = await startBank();
const attacker = startLogin(bank.base);
const attackersCallback = await openInBrowser(attacker.url);

const ada = startLogin(bank.base);
for (const [label, callback, pending] of [
  ["attacker's callback in Ada's browser", attackersCallback, ada.pending],
  ["callback with the state removed", attackersCallback.replace(/&state=[^&]+/, ""), ada.pending],
  ["callback, but no pending log-in", attackersCallback, undefined],
]) {
  try {
    await finishLogin(bank.base, callback, pending);
    console.log(label, "-> ACCEPTED");
  } catch (error) {
    console.log(label, "->", error.message);
  }
}
bank.close();
```

Output of `node attack-state.js`

```ts
attacker's callback in Ada's browser -> state mismatch: not a log-in this browser started
callback with the state removed -> state mismatch: not a log-in this browser started
callback, but no pending log-in -> state mismatch: not a log-in this browser started
```

All three are refused before the code is even sent to the bank. The pending values live on the Budget App's server, keyed by an `HttpOnly` cookie, and are deleted once used, exactly like `pending.ts` in the ZudoJS OAuth lesson. Comparing the state against a value that *also* comes from the browser (a second cookie the attacker can set) would prove nothing.

### A stolen code, and a replayed one

Suppose the code leaks from a log file. The thief knows the Budget App's public details, and in the worst case even its client secret (a public client has none). What they do not have is the verifier:

attack-code.jsNode.js only

```ts
import { startBank } from "./bank.js";
import { BUDGET_APP, finishLogin, startLogin } from "./budget-app.js";
import { openInBrowser } from "./browser.js";

const bank = await startBank();
const { url, pending } = startLogin(bank.base);
const callback = await openInBrowser(url);
const code = new URL(callback).searchParams.get("code");

async function exchange(verifier) {
  const response = await fetch(`${bank.base}/token`, {
    method: "POST",
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: BUDGET_APP.redirectUri,
      client_id: BUDGET_APP.clientId, client_secret: BUDGET_APP.clientSecret, code_verifier: verifier }),
  });
  return { status: response.status, ...(await response.json()) };
}

console.log("thief, guessed verifier:", (await exchange("a".repeat(43))).error);
const login = await finishLogin(bank.base, callback, pending);
console.log("real app:", "logged in as", login.email);

const replay = await exchange(pending.verifier);
console.log("same code again, even with the verifier:", replay.status, replay.error);
const api = await fetch(`${bank.base}/api/transactions`, { headers: { Authorization: `Bearer ${login.accessToken}` } });
console.log("the first access token after the replay:", api.status, api.headers.get("www-authenticate"));
bank.close();
```

Output of `node attack-code.js`

```ts
thief, guessed verifier: invalid_grant
real app: logged in as ada@example.com
same code again, even with the verifier: 400 invalid_grant
the first access token after the replay: 401 Bearer error="invalid_token"
```

The thief's exchange failed: without the verifier, the hash does not match the challenge. The real app's exchange worked. When the same code came back a second time, the bank refused it *and* revoked the tokens already issued from it, because a second redemption means the code is in two places. The honest app has to start again, which is a small price for cutting off a thief.

### Changing the redirect URI

The attacker edits the authorization URL so the code is sent to their own site, or to a URL that merely starts with the registered one:

attack-redirect.jsNode.js only

```ts
import { startBank } from "./bank.js";
import { startLogin } from "./budget-app.js";
import { openInBrowser } from "./browser.js";

const bank = await startBank();
const { url } = startLogin(bank.base);

for (const evil of [
  "https://evil.example/steal",
  "https://budget.example/callback/../../redirect?to=https://evil.example",
  "https://budget.example.evil.example/callback",
  "https://budget.example/callback?next=https://evil.example",
]) {
  const tampered = new URL(url);
  tampered.searchParams.set("redirect_uri", evil);
  console.log(await openInBrowser(tampered.href));
}
console.log(new URL(await openInBrowser(url)).host, "(the registered URI still works)");
bank.close();
```

Output of `node attack-redirect.js`

```ts
error page 400: unknown client_id or redirect_uri
error page 400: unknown client_id or redirect_uri
error page 400: unknown client_id or redirect_uri
error page 400: unknown client_id or redirect_uri
budget.example (the registered URI still works)
```

Every variant got the bank's own error page, and no redirect: an exact string comparison against the registered list has no clever edge cases. Servers that allowed "any URL starting with" or wildcard subdomains have leaked codes in real incidents. On the client side, the same care applies to the page you send Ada to *after* log-in: a `?next=` parameter must be checked against your own paths, or your callback becomes an **open redirect**.

### An ID token meant for someone else

Now a subtler attack. Ada also uses Quiz App, a harmless app that signs users in with the same bank. Quiz App (or someone who breached it) holds a valid, correctly signed ID token for Ada. Can it be used to log in to the Budget App as Ada? And what about a genuine Budget App ID token from an earlier log-in, replayed now?

attack-id-token.jsNode.js only

```ts
import { startBank } from "./bank.js";
import { BUDGET_APP, finishLogin, startLogin, verifyIdToken } from "./budget-app.js";
import { openInBrowser } from "./browser.js";

const bank = await startBank();
const QUIZ_APP = { clientId: "quiz-app", clientSecret: "quiz-app-secret-0123456789", redirectUri: "https://quiz.example/callback", issuer: "https://id.bank.example" };

const quiz = startLogin(bank.base, QUIZ_APP, "openid email");
const quizLogin = await finishLogin(bank.base, await openInBrowser(quiz.url), quiz.pending, QUIZ_APP);
const [, payload] = quizLogin.idToken.split(".");
const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
console.log("Quiz App's ID token for Ada: aud =", claims.aud, "| sub =", claims.sub);

const budget = startLogin(bank.base);
const tries = {
  "Quiz App's token at Budget App": [quizLogin.idToken, budget.pending.nonce],
  "old Budget App token, new log-in": [(await finishLogin(bank.base, await openInBrowser(budget.url), budget.pending)).idToken, startLogin(bank.base).pending.nonce],
  "token with a changed payload": [quizLogin.idToken.replace(payload, Buffer.from(JSON.stringify({ ...claims, aud: "budget-app" })).toString("base64url")), budget.pending.nonce],
};
for (const [label, [token, nonce]] of Object.entries(tries)) {
  try {
    await verifyIdToken(bank.base, BUDGET_APP, token, nonce);
    console.log(label.padEnd(34), "-> ACCEPTED");
  } catch (error) {
    console.log(label.padEnd(34), "->", error.message);
  }
}
bank.close();
```

Output of `node attack-id-token.js`

```ts
Quiz App's ID token for Ada: aud = quiz-app | sub = 248289761001
Quiz App's token at Budget App     -> ID token was issued to another client
old Budget App token, new log-in   -> ID token nonce does not match this log-in
token with a changed payload       -> ID token signature is invalid
```

Each check stops a different attack. The audience check rejects a real token issued to another app. The nonce check rejects a real Budget App token that belongs to a different log-in. The signature check rejects a token whose audience was edited. Skip any one of them and there is an attack that gets through.

> THE ACCESS TOKEN IS NOT A LOG-IN
>
> A tempting shortcut: "the user gave us an access token, we called the provider's profile endpoint with it, it returned Ada, so this is Ada". But an access token says nothing about *which client* it was issued to. Quiz App could call your API with Ada's token from Quiz App and be treated as Ada. To learn who logged in to *your* app, use the ID token, verified with `aud` equal to your client id, or run the whole code flow yourself.

## Common mistakes, and OAuth 2.1

| Mistake | What goes wrong | Instead |
| --- | --- | --- |
| Implicit flow (`response_type=token`) | Access tokens come back in the URL fragment: browser history, extensions and logs see them; no way to bind them to the client | Authorization code flow with PKCE, even in single-page apps |
| Resource owner password grant | The app collects the user's password: the exact problem OAuth was made to solve | Redirect to the authorization server |
| No `state`, or a state compared with a cookie the browser also controls | Login CSRF | Random state stored server-side per log-in, single use |
| No PKCE, or `plain` | A leaked code is enough to get tokens | PKCE S256 for every client |
| Prefix or wildcard redirect URI matching | Codes delivered to attacker-controlled URLs | Exact matching against registered URIs |
| Not verifying the ID token (or skipping `aud`, `nonce`) | Tokens from other apps or old log-ins accepted | Signature via JWKS, `iss`, `aud`, `exp`, `nonce` |
| Using the access token as proof of identity | Token substitution between apps | Use the verified ID token |
| Linking accounts by e-mail | An unverified or recycled e-mail takes over an existing account | Key accounts by `iss` + `sub`; link by e-mail only after the user proves both accounts |
| Tokens in `localStorage`, in logs, or in URLs | Stolen by XSS, read from logs | Keep tokens server-side (a "backend for frontend"), log token ids at most |
| Asking for every scope "just in case" | Users refuse, and a breach exposes far more | Least privilege: ask for what the feature needs, when it needs it |

**OAuth 2.1**, the consolidation of OAuth 2.0 and a decade of security advice, turns most of this table into rules. It is still an IETF Internet-Draft, not yet a published RFC, but providers already follow it, and the OAuth 2.0 Security Best Current Practice (RFC 9700) says the same things: PKCE is required for all clients, redirect URIs must match exactly, and the implicit and password grants are gone. If you follow this lesson, you are already writing OAuth 2.1.

## Testing and production concerns

- **Use a certified library for the client**, and a real product for the server. OpenID Connect has certified implementations (for Node.js, `openid-client`), and running your own authorization server is a product in itself. This lesson's server exists to show the rules, not to be deployed.
- **Discovery.** Real providers publish their endpoints and settings at `/.well-known/openid-configuration`: the authorization and token URLs, the `jwks_uri`, supported scopes and algorithms. Clients read it instead of hard-coding URLs.
- **Cache the JWKS, and refresh on an unknown `kid`.** Providers rotate signing keys; fetching the key set on every log-in is slow, and never refreshing it breaks on rotation. Fetch again when a token names a key you do not have (at most every few minutes).
- **Test offline with a stand-in provider**, as this lesson and the [ZudoJS OAuth lesson](https://zudojs.oyinlola.site/learn/zudo-oauth#exchange) do, including every attack above as a test case. Then test once against the real provider in a staging environment.
- **After the flow, your own session.** OAuth ends with verified identity; what follows is the log-in from [Authentication](https://zudojs.oyinlola.site/learn/sec-authentication#sessions): a fresh server-side session, a `__Host-` cookie, idle and absolute expiry. Store refresh tokens encrypted, server-side only, and revoke them when the user disconnects the bank.
- **Secrets from the environment.** The client secret is a password for your app. Keep it out of code and git, and rotate it if it leaks, as with every secret in [Cryptography for developers](https://zudojs.oyinlola.site/learn/sec-crypto).

## Practice

TRY IT YOURSELF

### Validate a code verifier

A server receives `code_verifier` values. Write `checkVerifier(v)` that returns `"ok"` only for 43 to 128 characters from the unreserved set, and a reason otherwise. Test a good verifier, one of 42 characters, one with a space, and one of 129 characters.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Check the type and length first, in order: not a string, too short, too long, each with its own `return`.

HINT 2

The character check is a regular expression: `!/^[A-Za-z0-9\-._~]+$/.test(v)`. Only after every check passes does the function return `"ok"`.

SOLUTION

check-verifier.js

```ts
function checkVerifier(v) {
  if (typeof v !== "string") return "missing";
  if (v.length < 43) return "too short";
  if (v.length > 128) return "too long";
  if (!/^[A-Za-z0-9\-._~]+$/.test(v)) return "characters outside the unreserved set";
  return "ok";
}

for (const v of ["dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", "x".repeat(42), "correct horse battery staple and more words", "y".repeat(129)]) {
  console.log(String(v.length).padStart(3), checkVerifier(v));
}
```

Output of `node check-verifier.js` and of the browser terminal

```ts
 43 ok
 42 too short
 43 characters outside the unreserved set
129 too long
```

The minimum length is what gives a verifier its strength: 43 characters from 66 possible symbols is more than 256 bits when generated randomly. A human-chosen phrase with spaces is refused outright, which also stops a client from using something guessable.

TRY IT YOURSELF

### Exact redirect URI matching

Write two matchers for registered redirect URIs: `prefixMatch` (the broken kind: the requested URI starts with a registered one) and `exactMatch`. Show which of these requests each accepts: the registered URI, `https://budget.example/callbackevil`, `https://budget.example/callback/../admin` and `https://budget.example.evil.example/callback` (registered: `https://budget.example/callback`).

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`exactMatch` needs no loop or comparison operator you have not already used: an array method that asks "is this value one of these?"

HINT 2

`const exactMatch = (uri) => registered.includes(uri);`

SOLUTION

redirect-match.js

```ts
const registered = ["https://budget.example/callback"];
const prefixMatch = (uri) => registered.some((r) => uri.startsWith(r));
const exactMatch = (uri) => registered.includes(uri);

for (const uri of [
  "https://budget.example/callback",
  "https://budget.example/callbackevil",
  "https://budget.example/callback/../admin",
  "https://budget.example.evil.example/callback",
]) {
  console.log(prefixMatch(uri) ? "prefix: yes" : "prefix: no ", exactMatch(uri) ? "| exact: yes" : "| exact: no ", uri);
}
```

Output of `node redirect-match.js` and of the browser terminal

```ts
prefix: yes | exact: yes https://budget.example/callback
prefix: yes | exact: no  https://budget.example/callbackevil
prefix: yes | exact: no  https://budget.example/callback/../admin
prefix: no  | exact: no  https://budget.example.evil.example/callback
```

The prefix matcher accepts two attacker-shaped URIs; the exact matcher accepts only the registered one. (The last one is refused by both here, but a matcher that compared only the end of the host, or allowed wildcards such as `https://*.budget.example`, would accept a look-alike.) Exact comparison is simple, and simple is what you want in a security check.

TRY IT YOURSELF

### A safe return path after log-in

The Budget App's log-in link is `/login?next=/reports/september`, and after the callback it sends the user to `next`. Write `safeNext(next)` that allows only paths on the app itself and falls back to `/`. Test `/reports/september`, `https://evil.example`, `//evil.example`, `/\evil.example` and `javascript:alert(1)`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Guard first, with plain string checks: `typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")`, returning `"/"` when any is true.

HINT 2

Then `const url = new URL(next, "https://budget.example"); return url.origin === "https://budget.example" ? url.pathname + url.search : "/";`.

SOLUTION

safe-next.js

```ts
function safeNext(next) {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  const url = new URL(next, "https://budget.example");
  return url.origin === "https://budget.example" ? url.pathname + url.search : "/";
}

for (const next of ["/reports/september", "https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)"]) {
  console.log(next.padEnd(20), "->", safeNext(next));
}
```

Output of `node safe-next.js` and of the browser terminal

```ts
/reports/september   -> /reports/september
https://evil.example -> /
//evil.example       -> /
/\evil.example       -> /
javascript:alert(1)  -> /
```

`//evil.example` is a *protocol-relative* URL: browsers read it as another site. Some browsers treat a backslash like a slash, which makes `/\evil.example` the same trick. Resolving against your own origin and comparing origins catches whatever the string checks miss.

## Summary

- OAuth 2.0 lets a user grant an app limited, revocable access (scopes) without sharing a password. OpenID Connect adds a signed ID token that tells the app who logged in.
- The authorization code flow sends a short-lived, single-use code through the browser and exchanges it server to server for tokens. Use it with PKCE for every client.
- PKCE: `code_challenge = BASE64URL(SHA-256(code_verifier))`, method S256; the verifier is sent only at the exchange, so a leaked code is useless.
- `state` binds the callback to the browser that started the log-in (stopping login CSRF); `nonce` binds the ID token to that log-in; both are random, stored server-side, and single use.
- Authorization servers match redirect URIs exactly, redeem codes once (revoking tokens on reuse), and resource servers enforce scopes with 401 and 403.
- Verify ID tokens completely: signature with the provider's JWKS key, `iss`, `aud`, `exp`, `nonce`. Key accounts by `iss` + `sub`. Never treat an access token as a log-in.
- The OAuth 2.1 draft makes this the only way: PKCE everywhere, exact redirect URIs, no implicit or password grants.

Next: [Browser attacks and defences](https://zudojs.oyinlola.site/learn/sec-web): CSRF, CORS, XSS and the security headers that protect the cookies and tokens from these two lessons.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
