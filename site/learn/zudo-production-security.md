---
title: "A production security review — ZudoJS Academy"
description: "Review the Task API before launch: seventeen checks from authentication to log leakage, each with the safe ZudoJS setup and a test that proves it holds."
source: https://zudojs.oyinlola.site/learn/zudo-production-security
---

LEVEL 17 · LESSON 2 OF 5

Production Production

# A production security review

Review the Task API before launch: seventeen checks from authentication to log leakage, each with the safe ZudoJS setup and a test that proves it holds.

- **60 min** to read and try
- **You need:** Production engineering, Security for every public API, Authentication, Permissions, and the Security course
- **You build:** A security review of the Task API as runnable checks: a PASS or FAIL line per checklist item, plus a findings report that includes two real findings in published ZudoJS packages

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Turn a security checklist into tests that fail when a protection is removed
- Prove authentication, authorization, JWT, cookie, CSRF, CORS and OAuth settings hold, over real HTTP
- Prove that injection-style input (SQL, paths, prototype keys, ambiguous HTTP framing, internal URLs) is refused or stored as plain data
- Find secrets and personal data in logs and error responses with a canary search
- Configure @zudojs/core logging and @zudojs/errors serialization so they cannot leak, and write findings up with evidence and severity

## The Friday before launch

The Task API goes live on Monday. It has users, passwords, cookies, a webhook feature that makes your server call URLs that customers type in, and a database full of other people's tasks. You have met every protection it needs in earlier lessons. The question now is different: **are they all switched on, configured correctly, and still working?**

That is what a **security review** answers. It is not a hunt for clever attacks. It is a checklist worked through item by item, where every "yes" comes with evidence. The best evidence is a **test**: a small program that sends the request an attacker would send and checks that the answer is the safe one. A test keeps working after the review is over. When someone removes a protection by accident in six months, the test fails before the release does.

This lesson is that review for the Task API. You will not see how to break anything here; the lessons linked in each row teach the attacks. Here, each row gets the safe ZudoJS setup and a check that prints `PASS` or `FAIL`:

| # | Item | Proved when | Basics in |
| --- | --- | --- | --- |
| 1 | [Authentication](#authn) | Every route that is not marked public answers 401 without credentials | [Authentication](https://zudojs.oyinlola.site/learn/zudo-auth) |
| 2 | [Authorization](#authz) | A user cannot read another user's task, and cannot tell that it exists | [Permissions](https://zudojs.oyinlola.site/learn/zudo-permissions) |
| 3 | [JWT](#jwt) | Tokens for another audience, another key or the wrong type are refused; access tokens live 15 minutes | [JWTs, taken apart](https://zudojs.oyinlola.site/learn/sec-authentication#jwt) |
| 4 | [Cookies](#cookies) | Every cookie is `HttpOnly`, `Secure` and `SameSite` | [Cookies](https://zudojs.oyinlola.site/learn/sec-authentication#cookies) |
| 5 | [CSRF](#csrf) | A cookie-authenticated write without the session's token gets 403 | [CSRF](https://zudojs.oyinlola.site/learn/sec-web#csrf) |
| 6 | [CORS](#cors) | Only the listed `https` origin gets CORS headers | [CORS](https://zudojs.oyinlola.site/learn/sec-web#cors) |
| 7 | [OAuth](#oauth) | Login links carry state and PKCE, and only allow-listed redirect URIs | [OAuth](https://zudojs.oyinlola.site/learn/zudo-oauth) |
| 8 | [Rate limiting](#rate-limit) | The sixth login in 15 minutes gets 429, whatever `X-Forwarded-For` says | [Rate limiting](https://zudojs.oyinlola.site/learn/api-rate-limiting) |
| 9 | [SSRF](#ssrf) | Webhook URLs that are not public `https` are refused, including by DNS | [SSRF](https://zudojs.oyinlola.site/learn/sec-injection#ssrf) |
| 10 | [XSS](#xss) | User text goes out as JSON with `nosniff` and a CSP, and is escaped in HTML | [XSS](https://zudojs.oyinlola.site/learn/sec-web#xss) |
| 11 | [SQL injection](#sql) | Hostile text is stored and read back as plain data; no query is built from strings | [SQL](https://zudojs.oyinlola.site/learn/sec-injection#sql) |
| 12 | [Path traversal](#http) | Paths with `..` are refused before routing, and ids must be UUIDs | [Paths](https://zudojs.oyinlola.site/learn/sec-injection#paths) |
| 13 | [Request smuggling](#http) | Requests with ambiguous length or an unknown `Host` get 400 | [Smuggling](https://zudojs.oyinlola.site/learn/sec-injection#smuggling) |
| 14 | [Prototype pollution](#xss) | A body with a `__proto__` key gets 400 | [Prototype pollution](https://zudojs.oyinlola.site/learn/sec-injection#prototype-pollution) |
| 15 | [Secrets](#secrets) | The app refuses to start with missing, short or shared secrets, and never prints one | [Secrets management](https://zudojs.oyinlola.site/learn/sec-crypto#secrets) |
| 16 | [Error leakage](#errors) | Error bodies carry no stack, no internal message and no private metadata; security headers are on error responses too | [Errors](https://zudojs.oyinlola.site/learn/zudo-errors) |
| 17 | [Logging leakage](#logs) | No password, token or secret appears in any log line | [Logging](https://zudojs.oyinlola.site/learn/zudo-logging#redaction) |

Two of the findings at the end are in published ZudoJS packages, not in the Task API. Reviews find those too, and the right response is the same: prove the problem, configure around it, and keep a test that tells you when the package fixes it.

## How to review

Before any code, decide what you are protecting and from whom. For the Task API the **assets** are the tasks (private to each user), the accounts (passwords, sessions), and the secrets (signing keys). The **entry points** are everything that comes from outside: the request line, headers, cookies, bodies, and the URLs the server is asked to call. A **trust boundary** is where data crosses from one side to the other; every check below sits on one.

REASON IT OUT

### Five questions before you read the code

Answer these about any API you review, before opening its source:

1. Which routes can someone call without logging in? How would you find out without trusting the documentation?
2. What does the server believe about the caller that the caller wrote themselves (a header, a body field, a cookie)?
3. If a handler throws halfway, what exactly does the client receive, and what goes into the log?
4. Where does each secret travel after it is read at startup?
5. For each protection, what test would fail if someone deleted it tomorrow?

**Show the reasoning**

1. Ask the router, not the docs. `router.list()` returns every registered route with its metadata, so a test can call each one anonymously. A route someone adds next month is covered without anyone remembering to add a test.
2. Anything in the request is a claim. The caller's identity comes only from a token the server verifies; the owner of a new task comes from that token, never the body; the client address comes from the connection unless a proxy you run vouches for it.
3. The client should get a status, a short safe message and nothing else. The log should get the details, including the stack, tagged with the request id. Both are testable: send a request that fails and read the response and the captured log.
4. A secret should go from the environment into the one object that uses it, and nowhere else. You test that with a **canary**: run the app with secrets you know, drive real traffic, then search every log line and response for them.
5. A test that sends the forbidden request and expects the refusal. If the protection were removed, the status or header would change, and the test would fail. A test that would pass either way proves nothing.

Point 5 is the rule for everything below: each check sends a request that the protection must refuse, and checks the refusal. Record every problem you find as a **finding**: what, where, evidence, severity, fix, and the test that now guards it. You will write the Task API's findings up at the end.

## The Task API under review

This is the version of the Task API going to production, cut down to the parts that matter for security: configuration, authentication, routes and the middleware pipeline. It uses the same packages and patterns as [the security lesson](https://zudojs.oyinlola.site/learn/zudo-security#together) and [the authentication lesson](https://zudojs.oyinlola.site/learn/zudo-auth#routes). Configuration first. Every setting is checked at startup, and an error names the setting but never shows its value:

config.ts

```ts
import { ConfigurationError } from "@zudojs/errors";
import { schema } from "@zudojs/schema";

const secret = schema.string().min(32);
const Env = schema.object({
  NODE_ENV: schema.enum(["development", "test", "production"]),
  JWT_ACCESS_SECRET: secret,
  JWT_REFRESH_SECRET: secret,
  CSRF_SECRET: secret,
  CORS_ORIGINS: schema.string().default(""),
  PUBLIC_HOST: schema.string().default("localhost"),
});

export interface Config {
  readonly nodeEnv: string;
  readonly accessSecret: string;
  readonly refreshSecret: string;
  readonly csrfSecret: string;
  readonly corsOrigins: readonly string[];
  readonly publicHost: string;
}

/** Reads and checks every setting. Errors name the setting, never its value. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const result = Env.safeParse(env);
  if (!result.success) {
    const problems = result.issues.map((issue) => `${issue.path.join(".")} (${issue.code})`);
    throw new ConfigurationError(`Invalid configuration: ${problems.join(", ")}`);
  }
  const e = result.data;
  if (new Set([e.JWT_ACCESS_SECRET, e.JWT_REFRESH_SECRET, e.CSRF_SECRET]).size !== 3) {
    throw new ConfigurationError("Invalid configuration: every secret must be different");
  }
  const corsOrigins = e.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (e.NODE_ENV === "production" && corsOrigins.some((origin) => !origin.startsWith("https://"))) {
    throw new ConfigurationError("Invalid configuration: CORS_ORIGINS must be https:// in production");
  }
  return Object.freeze({
    nodeEnv: e.NODE_ENV,
    accessSecret: e.JWT_ACCESS_SECRET,
    refreshSecret: e.JWT_REFRESH_SECRET,
    csrfSecret: e.CSRF_SECRET,
    corsOrigins,
    publicHost: e.PUBLIC_HOST,
  });
}
```

Authentication. The web app keeps the access token in an `HttpOnly` cookie, so JavaScript on the page can never read it. Because the browser sends that cookie by itself, every write that is authenticated by the cookie must also carry a CSRF token bound to the session. Mobile clients send `Authorization: Bearer …` instead, which no other website can make a browser send, so they need no CSRF token:

auth.ts

```ts
import { randomUUID } from "node:crypto";
import {
  createTokenPair, hashPassword, parseBearerToken, parseCookies, toSessionId, toUserId, verifyAccessToken, verifyPassword,
} from "@zudojs/auth";
import type { TokenConfig, TokenPayload } from "@zudojs/auth";
import { forbidden, unauthorized, type HttpMiddleware, type HttpRouterContext } from "@zudojs/http";
import { createCsrfProtection } from "@zudojs/security";
import type { Config } from "./config.js";

export function createAuth(config: Config) {
  const tokens: TokenConfig = {
    accessSecret: config.accessSecret,
    refreshSecret: config.refreshSecret,
    accessTtl: 15 * 60,
    issuer: "task-api",
    audience: "task-api",
  };
  const csrf = createCsrfProtection({ secret: config.csrfSecret });
  const users = new Map<string, { id: string; hash: string }>();

  async function register(id: string, email: string, password: string): Promise<void> {
    users.set(email, { id, hash: await hashPassword(password) });
  }

  async function login(email: string, password: string) {
    const user = users.get(email);
    if (user === undefined || !(await verifyPassword(password, user.hash))) throw unauthorized("Wrong email or password");
    const sessionId = randomUUID();
    const pair = createTokenPair(toUserId(user.id), tokens, { sessionId: toSessionId(sessionId) });
    return { userId: user.id, accessToken: pair.accessToken, csrf: csrf.issue({ sessionId }) };
  }

  /** 401 without a valid token; 403 for a cookie-authenticated write without the session's CSRF token. */
  const requireUser: HttpMiddleware = async (context, next) => {
    const request = context.request;
    const cookieHeader = request.getHeader("cookie") ?? "";
    const bearer = parseBearerToken(request.getHeader("authorization"));
    const token = bearer ?? parseCookies(cookieHeader)["access_token"];
    const result = token === undefined ? undefined : verifyAccessToken(token, tokens);
    if (result?.valid !== true || result.payload === undefined) throw unauthorized("Login required");
    if (bearer === null && csrf.requiresProtection(request.method)) {
      const headers = { "x-csrf-token": request.getHeader("x-csrf-token") ?? undefined };
      const sessionId = String(result.payload.sid);
      if (!csrf.verify({ method: request.method, headers, cookieHeader }, { sessionId })) {
        throw forbidden("CSRF token missing or invalid");
      }
    }
    context.state.set("user", result.payload);
    return next();
  };

  return { tokens, register, login, requireUser };
}

export function currentUser(ctx: HttpRouterContext): TokenPayload {
  const user = ctx.state.get("user") as TokenPayload | undefined;
  if (user === undefined) throw new Error("requireUser did not run for this route");
  return user;
}
```

The routes and the pipeline. Two routes are marked `public` in their metadata; everything else goes through `requireUser`. The error middleware turns every error into a response *inside* the pipeline, so the security headers are added to error responses too ([section 16](#errors) shows why that matters):

app.ts

```ts
import { randomUUID } from "node:crypto";
import { normalizeUnknownError, serializePublicError } from "@zudojs/errors";
import {
  HttpMiddlewarePipeline, badRequest, createCorsMiddleware, createHttpServer, createNodeHttpAdapter,
  createRateLimitMiddleware, createResponseContext, createRouter, createSecurityMiddleware, notFound,
  type HttpMiddleware, type HttpRequestContext, type HttpRouterContext,
} from "@zudojs/http";
import { logError, type Logger } from "@zudojs/logger";
import { schema } from "@zudojs/schema";
import { isPrivateHostname, isSafeUrl } from "@zudojs/security";
import { createAuth, currentUser } from "./auth.js";
import type { Config } from "./config.js";

export type Resolver = (hostname: string) => Promise<string[]>;
interface Task { readonly id: string; readonly ownerId: string; readonly title: string }

const LoginBody = schema.object({ email: schema.string().max(254), password: schema.string().min(1).max(1024) });
const NewTask = schema.object({ title: schema.string().trim().min(1).max(200) });
const NewWebhook = schema.object({ url: schema.string().max(2048) });
const TaskId = schema.string().uuid();

function readBody<T>(ctx: HttpRouterContext, shape: { safeParse(value: unknown): { success: true; data: T } | { success: false } }): T {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(ctx.request.body as Uint8Array));
  } catch {
    throw badRequest("Body must be JSON");
  }
  const result = shape.safeParse(value);
  if (!result.success) throw badRequest("Invalid request body");
  return result.data;
}

export function createTaskApi(config: Config, log: Logger, resolve: Resolver) {
  const auth = createAuth(config);
  const tasks = new Map<string, Task>();
  const router = createRouter();
  const signedIn = { middleware: [auth.requireUser] };

  router.get("/health", () => createResponseContext().json({ status: "ok" }), { metadata: { public: true } });
  router.post("/auth/login", async (ctx) => {
    const { email, password } = readBody(ctx, LoginBody);
    const session = await auth.login(email, password);
    log.info("login succeeded", { userId: session.userId, requestId: ctx.request.id });
    return createResponseContext()
      .cookie("access_token", session.accessToken, { maxAge: 900, path: "/", httpOnly: true, secure: true, sameSite: "Lax" })
      .header("set-cookie", session.csrf.setCookie)
      .json({ csrfToken: session.csrf.token });
  }, { metadata: { public: true }, middleware: [createRateLimitMiddleware({ windowMs: 15 * 60_000, max: 5 })] });

  router.get("/tasks", (ctx) => {
    const me = currentUser(ctx).sub;
    return createResponseContext().json([...tasks.values()].filter((task) => task.ownerId === me));
  }, signedIn);
  router.post("/tasks", (ctx) => {
    const task: Task = { id: randomUUID(), ownerId: currentUser(ctx).sub, title: readBody(ctx, NewTask).title };
    tasks.set(task.id, task);
    return createResponseContext({ status: 201 }).json(task);
  }, signedIn);
  router.get("/tasks/:id", (ctx) => {
    const id = TaskId.safeParse(ctx.params.id);
    const task = id.success ? tasks.get(id.data) : undefined;
    if (task === undefined || task.ownerId !== currentUser(ctx).sub) throw notFound("Task not found");
    return createResponseContext().json(task);
  }, signedIn);
  router.post("/webhooks", async (ctx) => {
    const { url } = readBody(ctx, NewWebhook);
    const refused = badRequest("Webhook URL must be a public https URL");
    if (!isSafeUrl(url, ["https:"])) throw refused;
    const addresses = await resolve(new URL(url).hostname);
    if (addresses.length === 0 || addresses.some(isPrivateHostname)) throw refused;
    return createResponseContext({ status: 201 }).json({ url });
  }, signedIn);

  const errorsToResponses: HttpMiddleware = async (context, next) => {
    try {
      return await next();
    } catch (error) {
      const safe = serializePublicError(normalizeUnknownError(error), { publicMetadataKeys: ["field"] });
      if (safe.statusCode >= 500) {
        logError(log, error instanceof Error ? error : new Error(String(error)), "request failed", {
          requestId: context.request.id,
          path: context.request.path,
        });
      }
      return createResponseContext({ status: safe.statusCode }).json(safe);
    }
  };

  const pipeline = new HttpMiddlewarePipeline();
  pipeline.use(createSecurityMiddleware());
  pipeline.use(createCorsMiddleware({
    allowOrigin: [...config.corsOrigins], credentials: true, allowMethods: "GET,POST", allowHeaders: "content-type,x-csrf-token",
  }));
  pipeline.use(errorsToResponses);
  pipeline.use(async (context) => (await router.dispatch(context.request)).response);

  const server = createHttpServer({
    adapter: createNodeHttpAdapter({
      host: "127.0.0.1", port: 0, maxBodySize: 16_384,
      security: { allowedHosts: [config.publicHost, "127.0.0.1"] },
    }),
    handler: (request: HttpRequestContext) => pipeline.execute(request, createResponseContext()),
  });
  return { server, router, auth, tasks };
}
```

Last, the review harness: a helper that starts the API on a free port with random test secrets, captures every log line in an array, and prints one line per check. Real secrets never go near a test. The fake DNS table lets the SSRF check run the same way on every computer:

review.ts

```ts
import { randomBytes } from "node:crypto";
import { createJsonLoggerFormatter, createLogger } from "@zudojs/logger";
import { createTaskApi, type Resolver } from "./app.js";
import { loadConfig } from "./config.js";

const fakeDns: Record<string, string[]> = {
  "hooks.example.org": ["93.184.215.14"],
  "internal.example.org": ["10.0.0.8"],
};
const resolve: Resolver = async (hostname) => fakeDns[hostname] ?? [];

/** Random per run. Checks search every log line and response for them. */
export const secrets = {
  JWT_ACCESS_SECRET: randomBytes(32).toString("hex"),
  JWT_REFRESH_SECRET: randomBytes(32).toString("hex"),
  CSRF_SECRET: randomBytes(32).toString("hex"),
};
export const ADA = { email: "ada@example.com", password: "correct horse battery staple" };
export const LINUS = { email: "linus@example.com", password: "another long passphrase" };

export async function startApi() {
  const config = loadConfig({ NODE_ENV: "production", CORS_ORIGINS: "https://app.example.com", ...secrets });
  const logLines: string[] = [];
  const log = createLogger({
    name: "task-api",
    formatter: createJsonLoggerFormatter(),
    transports: [(entry) => { logLines.push(entry.formatted ?? entry.message); }],
  });
  const api = createTaskApi(config, log, resolve);
  await api.auth.register("u-ada", ADA.email, ADA.password);
  await api.auth.register("u-linus", LINUS.email, LINUS.password);
  await api.server.start();

  const base = `http://127.0.0.1:${api.server.address?.port}`;
  const call = (path: string, init: RequestInit = {}) => fetch(base + path, init);
  async function login(who = ADA) {
    const res = await call("/auth/login", { method: "POST", body: JSON.stringify(who) });
    const setCookies = res.headers.getSetCookie();
    const cookie = setCookies.map((line) => line.split(";")[0]).join("; ");
    const { csrfToken } = (await res.json()) as { csrfToken: string };
    return { setCookies, cookie, csrfToken };
  }
  return { api, base, call, login, logLines, stop: () => api.server.stop() };
}

export function check(name: string, ok: boolean): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) process.exitCode = 1;
}
```

Save the four files in a folder with the Task API's dependencies, then each check below is one more file you run with `npx tsx`. A `FAIL` line also sets the exit code to 1, which is what a CI pipeline looks at.

## Identity: authentication, authorization and tokens

### 1. Authentication: deny by default

The usual mistake is not a broken login. It is a new route where someone forgot the middleware. So the check does not list routes by hand. It asks the router for every route and calls each one that is not marked public, with no credentials:

check-authn.tsNode.js only

```ts
import { check, startApi } from "./review.js";

const t = await startApi();
const someId = "00000000-0000-4000-8000-000000000000";
for (const route of t.api.router.list()) {
  if (route.metadata.public === true) continue;
  const res = await t.call(route.path.replace(":id", someId), { method: route.method });
  check(`${route.method} ${route.path} needs a login (got ${res.status})`, res.status === 401);
}
const publicRoutes = t.api.router.list().filter((route) => route.metadata.public === true);
check(`only these routes are public: ${publicRoutes.map((r) => r.path).join(", ")}`, publicRoutes.length === 2);
await t.stop();
```

Output of `npx tsx check-authn.ts`

```ts
PASS  GET /tasks/:id needs a login (got 401)
PASS  GET /tasks needs a login (got 401)
PASS  POST /tasks needs a login (got 401)
PASS  POST /webhooks needs a login (got 401)
PASS  only these routes are public: /auth/login, /health
```

The second check matters as much as the first. Marking a route public is a decision, so the list of public routes is pinned in the test: adding a third one makes the test fail until someone updates it on purpose, in a pull request a reviewer can see.

### 2. Authorization: other people's tasks

Being logged in is not permission to read everything. Ada creates a task; Linus, who is also logged in, asks for it by its id:

check-authz.tsNode.js only

```ts
import { ADA, LINUS, check, startApi } from "./review.js";

const t = await startApi();
const ada = await t.login(ADA);
const linus = await t.login(LINUS);
const created = await t.call("/tasks", {
  method: "POST",
  headers: { cookie: ada.cookie, "x-csrf-token": ada.csrfToken },
  body: JSON.stringify({ title: "Pay rent", ownerId: "u-linus" }),
});
const task = (await created.json()) as { id: string; ownerId: string };

check("the owner comes from the token, not the body", task.ownerId === "u-ada");
const asAda = await t.call(`/tasks/${task.id}`, { headers: { cookie: ada.cookie } });
const asLinus = await t.call(`/tasks/${task.id}`, { headers: { cookie: linus.cookie } });
const missing = await t.call("/tasks/00000000-0000-4000-8000-000000000000", { headers: { cookie: linus.cookie } });
check("the owner can read it", asAda.status === 200);
check("another user gets 404", asLinus.status === 404);
check("that 404 looks exactly like a missing task", (await asLinus.text()) === (await missing.text()));
const list = (await (await t.call("/tasks", { headers: { cookie: linus.cookie } })).json()) as unknown[];
check("another user's list is empty", list.length === 0);
await t.stop();
```

Output of `npx tsx check-authz.ts`

```ts
PASS  the owner comes from the token, not the body
PASS  the owner can read it
PASS  another user gets 404
PASS  that 404 looks exactly like a missing task
PASS  another user's list is empty
```

Linus gets `404`, not `403`, and the body is byte for byte the one for a task that does not exist. A `403` would confirm that the id is real, which lets someone map other users' data one id at a time. The Task API compares owners by hand; [the permissions lesson](https://zudojs.oyinlola.site/learn/zudo-permissions#owner) does the same with `isOwner` rules, and its "escalation" sections are a checklist of their own.

### 3. JWT settings

The token checks are about configuration: the `issuer` and `audience` are set and checked, access and refresh tokens use different keys, and access tokens are short-lived. Each line below builds a token that is valid *somewhere*, just not here:

check-jwt.tsNode.js only

```ts
import { randomBytes } from "node:crypto";
import { createTokenPair, toUserId, verifyAccessToken } from "@zudojs/auth";
import type { TokenConfig } from "@zudojs/auth";
import { createAuth } from "./auth.js";
import { loadConfig } from "./config.js";
import { check, secrets } from "./review.js";

const taskApi = createAuth(loadConfig({ NODE_ENV: "test", ...secrets })).tokens;
const key = () => randomBytes(32).toString("hex");
const billingApi: TokenConfig = { ...taskApi, audience: "billing-api" };
const otherKeys: TokenConfig = { ...taskApi, accessSecret: key(), refreshSecret: key() };
const noClaims: TokenConfig = { accessSecret: taskApi.accessSecret, refreshSecret: taskApi.refreshSecret };

const ada = toUserId("u-ada");
const pair = createTokenPair(ada, taskApi);
const payload = verifyAccessToken(pair.accessToken, taskApi).payload!;
check("access tokens live 15 minutes", payload.exp - payload.iat === 900);
check("a token for another API is refused", !verifyAccessToken(createTokenPair(ada, billingApi).accessToken, taskApi).valid);
check("a token signed with another key is refused", !verifyAccessToken(createTokenPair(ada, otherKeys).accessToken, taskApi).valid);
check("a token without issuer and audience is refused", !verifyAccessToken(createTokenPair(ada, noClaims).accessToken, taskApi).valid);
check("a refresh token is not an access token", !verifyAccessToken(pair.refreshToken, taskApi).valid);
```

Output of `npx tsx check-jwt.ts`

```ts
PASS  access tokens live 15 minutes
PASS  a token for another API is refused
PASS  a token signed with another key is refused
PASS  a token without issuer and audience is refused
PASS  a refresh token is not an access token
```

The third line is the reason `issuer` and `audience` belong in the configuration. If a second service shares your signing key (it should not, but it happens), its tokens would work on the Task API without them. How a JWT is taken apart, and why `alg` must never come from the token, is in [JWTs, taken apart](https://zudojs.oyinlola.site/learn/sec-authentication#jwt). Refused tokens were also checked over HTTP in check 1: they end as the same `401`.

## The browser boundary: cookies, CSRF, CORS and OAuth

### 4. Cookies

Log in once and read the `Set-Cookie` lines. Every cookie the API sets must be `HttpOnly` (no page script can read it), `Secure` (HTTPS only) and `SameSite` (not sent with requests that other sites start), and the session must not outlive the token:

check-cookies.tsNode.js only

```ts
import { check, startApi } from "./review.js";

const t = await startApi();
const { setCookies } = await t.login();
for (const line of setCookies) {
  const [pair, ...rest] = line.split(";").map((part) => part.trim());
  const name = pair!.split("=")[0];
  const attributes = new Set(rest.map((part) => part.toLowerCase()));
  const maxAge = Number(rest.find((part) => /^max-age=/i.test(part))?.split("=")[1]);
  check(`${name} is HttpOnly`, attributes.has("httponly"));
  check(`${name} is Secure`, attributes.has("secure"));
  check(`${name} has SameSite=Lax or Strict`, attributes.has("samesite=lax") || attributes.has("samesite=strict"));
  check(`${name} expires within an hour`, maxAge > 0 && maxAge <= 3600);
}
await t.stop();
```

Output of `npx tsx check-cookies.ts`

```ts
PASS  _csrf is HttpOnly
PASS  _csrf is Secure
PASS  _csrf has SameSite=Lax or Strict
PASS  _csrf expires within an hour
PASS  access_token is HttpOnly
PASS  access_token is Secure
PASS  access_token has SameSite=Lax or Strict
PASS  access_token expires within an hour
```

The CSRF cookie is `SameSite=Strict`; the access token is `Lax`, so a user who follows a link to the web app from an email arrives logged in. Both are fine. `SameSite=None` would fail the check, and should: it is only for cookies that other sites must send, which the Task API has none of.

### 5. CSRF

A cookie-authenticated write is only accepted with the CSRF token that was issued for *this* session. Four requests, one expected to pass:

check-csrf.tsNode.js only

```ts
import { ADA, LINUS, check, startApi } from "./review.js";

const t = await startApi();
const ada = await t.login(ADA);
const linus = await t.login(LINUS);
const post = (headers: Record<string, string>) =>
  t.call("/tasks", { method: "POST", headers, body: JSON.stringify({ title: "Book a plumber" }) });

check("cookie + no token: 403", (await post({ cookie: ada.cookie })).status === 403);
check("cookie + another session's token: 403", (await post({ cookie: ada.cookie, "x-csrf-token": linus.csrfToken })).status === 403);
check("cookie + own token: 201", (await post({ cookie: ada.cookie, "x-csrf-token": ada.csrfToken })).status === 201);
const accessToken = ada.cookie.match(/access_token=([^;]+)/)![1]!;
check("Bearer token, no cookie: 201", (await post({ authorization: `Bearer ${accessToken}` })).status === 201);
check("reads need no token", (await t.call("/tasks", { headers: { cookie: ada.cookie } })).status === 200);
await t.stop();
```

Output of `npx tsx check-csrf.ts`

```ts
PASS  cookie + no token: 403
PASS  cookie + another session's token: 403
PASS  cookie + own token: 201
PASS  Bearer token, no cookie: 201
PASS  reads need no token
```

The second line is the one people forget: a token is not enough, it must be *the session's* token. That is why `auth.ts` passes `sessionId` to both `csrf.issue` and `csrf.verify`. The Bearer line shows why the exemption is safe: no other website can make a browser add an `Authorization` header.

### 6. CORS

CORS decides which other origins may *read* responses in a browser. The check sends the preflight request a browser sends before a cross-origin `POST`, from the real web app and from an origin that is not on the list, and also checks the startup rule for production:

check-cors.tsNode.js only

```ts
import { loadConfig } from "./config.js";
import { check, secrets, startApi } from "./review.js";

const t = await startApi();
const preflight = (origin: string) =>
  t.call("/tasks", { method: "OPTIONS", headers: { origin, "access-control-request-method": "POST" } });

const app = await preflight("https://app.example.com");
check("the web app is allowed", app.headers.get("access-control-allow-origin") === "https://app.example.com");
check("with credentials", app.headers.get("access-control-allow-credentials") === "true");
for (const origin of ["https://evil.example", "https://app.example.com.evil.example", "http://app.example.com", "null"]) {
  const res = await preflight(origin);
  check(`${origin} gets no CORS headers`, res.headers.get("access-control-allow-origin") === null);
}
await t.stop();

let refused = false;
try {
  loadConfig({ NODE_ENV: "production", CORS_ORIGINS: "http://localhost:5173", ...secrets });
} catch {
  refused = true;
}
check("production refuses an http:// origin at startup", refused);
```

Output of `npx tsx check-cors.ts`

```ts
PASS  the web app is allowed
PASS  with credentials
PASS  https://evil.example gets no CORS headers
PASS  https://app.example.com.evil.example gets no CORS headers
PASS  http://app.example.com gets no CORS headers
PASS  null gets no CORS headers
PASS  production refuses an http:// origin at startup
```

CORS binds browsers only. `curl` can call the API from anywhere, which is fine: checks 1, 2 and 8 stop it, not CORS.

### 7. OAuth login links

If the Task API offers "Log in with Google" through `@zudojs/auth-oauth`, from [the OAuth lesson](https://zudojs.oyinlola.site/learn/zudo-oauth), the review checks three properties of the link it builds, and that the package refuses the two dangerous shortcuts:

check-oauth.tsNode.js only

```ts
import { randomBytes } from "node:crypto";
import { createAuthorizationUrl, generateState } from "@zudojs/auth-oauth";
import type { OAuthConfig } from "@zudojs/auth-oauth";
import { check } from "./review.js";

const CALLBACK = "https://tasks.example.com/auth/google/callback";
const google: OAuthConfig = {
  provider: "google",
  clientId: "task-api.apps.googleusercontent.com",
  clientSecret: randomBytes(24).toString("base64url"),
  allowedRedirectUris: [CALLBACK],
};
const start = createAuthorizationUrl(google, { state: generateState(), redirectUri: CALLBACK });
const query = new URL(start.url).searchParams;
check("the link carries the state", query.get("state") === start.state);
check("the link uses PKCE with S256", query.get("code_challenge_method") === "S256");
check("neither the secret nor the verifier is in the link", !start.url.includes(google.clientSecret!) && !start.url.includes(start.codeVerifier));

function refuses(build: () => unknown): boolean {
  try {
    build();
    return false;
  } catch {
    return true;
  }
}
check("a redirect URI that is not allow-listed is refused", refuses(() => createAuthorizationUrl(google, { state: generateState(), redirectUri: "https://tasks.example.com.evil.example/cb" })));
check("a link without state is refused", refuses(() => createAuthorizationUrl(google, { state: "", redirectUri: CALLBACK })));
```

Output of `npx tsx check-oauth.ts`

```ts
PASS  the link carries the state
PASS  the link uses PKCE with S256
PASS  neither the secret nor the verifier is in the link
PASS  a redirect URI that is not allow-listed is refused
PASS  a link without state is refused
```

The remaining OAuth items live in the callback: the state is compared with the copy kept *on the server*, used once, and the code is exchanged with the stored verifier. The OAuth lesson tests those with a fake provider; copy its `try-state.ts` checks into your review.

## 8. Rate limiting

The login route has its own limiter: 5 attempts per 15 minutes per client address. The check makes six attempts with wrong passwords, each claiming a different address in `X-Forwarded-For`:

check-rate-limit.tsNode.js only

```ts
import { check, startApi } from "./review.js";

const t = await startApi();
const statuses: number[] = [];
let retryAfter: string | null = null;
for (let attempt = 1; attempt <= 6; attempt++) {
  const res = await t.call("/auth/login", {
    method: "POST",
    headers: { "x-forwarded-for": `198.51.100.${attempt}` },
    body: JSON.stringify({ email: "ada@example.com", password: `guess-${attempt}` }),
  });
  statuses.push(res.status);
  retryAfter = res.headers.get("retry-after");
}
console.log(statuses.join(" "));
check("the sixth attempt gets 429", statuses[5] === 429);
check("429 says when to come back", Number(retryAfter) > 0);
check("a fake X-Forwarded-For does not reset the count", statuses.slice(0, 5).every((s) => s === 401));
await t.stop();
```

Output of `npx tsx check-rate-limit.ts`

```ts
401 401 401 401 401 429
PASS  the sixth attempt gets 429
PASS  429 says when to come back
PASS  a fake X-Forwarded-For does not reset the count
```

The adapter has no `trustProxy` setting, so it keys the limit on the connection's real address and ignores the header. In production behind Caddy or a load balancer you set `trustProxy` to that proxy, as [the deployment lesson](https://zudojs.oyinlola.site/learn/deployment#https) shows, and add one more check: a request that arrives *directly*, not through the proxy, must still not be able to choose its address. With several app servers, move the counters to a shared store such as Redis, or each server allows its own five.

## Input: SSRF, XSS, prototype pollution, SQL, paths and framing

### 9. SSRF: webhook URLs

Customers register a webhook URL, and the Task API will call it when a task changes. That makes the server fetch an address a stranger chose, so the route accepts only `https` URLs whose host resolves to public addresses:

check-ssrf.tsNode.js only

```ts
import { check, startApi } from "./review.js";

const t = await startApi();
const ada = await t.login();
const register = (url: string) =>
  t.call("/webhooks", { method: "POST", headers: { cookie: ada.cookie, "x-csrf-token": ada.csrfToken }, body: JSON.stringify({ url }) });

check("a public https URL is accepted", (await register("https://hooks.example.org/tasks")).status === 201);
for (const url of [
  "http://hooks.example.org/tasks",
  "https://169.254.169.254/latest/meta-data/",
  "https://[::ffff:10.0.0.8]/",
  "https://internal.example.org/tasks",
  "https://unknown.example/tasks",
  "file:///etc/passwd",
]) {
  check(`refused: ${url}`, (await register(url)).status === 400);
}
await t.stop();
```

Output of `npx tsx check-ssrf.ts`

```ts
PASS  a public https URL is accepted
PASS  refused: http://hooks.example.org/tasks
PASS  refused: https://169.254.169.254/latest/meta-data/
PASS  refused: https://[::ffff:10.0.0.8]/
PASS  refused: https://internal.example.org/tasks
PASS  refused: https://unknown.example/tasks
PASS  refused: file:///etc/passwd
```

`internal.example.org` looks public but resolves to `10.0.0.8` in the fake DNS table, and `unknown.example` does not resolve at all; both are refused. A check at registration is not the end: when the webhook is actually sent, resolve again, refuse private addresses, and do not follow redirects, because DNS answers can change ([DNS rebinding](https://zudojs.oyinlola.site/learn/zudo-security#ssrf)). Send webhooks from a worker that has no access to your internal network if you can.

### 10 and 14. XSS and prototype pollution

The Task API stores what users type, including text that looks like HTML. That is correct: the defence against XSS is not refusing input, it is making sure the output is never read as HTML. For a JSON API that means the right `Content-Type`, `nosniff` so the browser does not guess otherwise, and a CSP. The same check sends a body with a `__proto__` key:

check-input.tsNode.js only

```ts
import { escapeHtml } from "@zudojs/security";
import { check, startApi } from "./review.js";

const t = await startApi();
const ada = await t.login();
const headers = { cookie: ada.cookie, "x-csrf-token": ada.csrfToken };
const title = '<img src=x onerror="alert(1)">';

const res = await t.call("/tasks", { method: "POST", headers, body: JSON.stringify({ title }) });
const saved = (await res.json()) as { title: string };
check("the title is stored exactly as typed", saved.title === title);
check("it goes out as JSON", res.headers.get("content-type")?.startsWith("application/json") === true);
check("with nosniff", res.headers.get("x-content-type-options") === "nosniff");
check("and a CSP that allows no inline script", !/script-src[^;]*'unsafe-inline'/.test(res.headers.get("content-security-policy") ?? ""));
check("HTML output escapes it", !escapeHtml(saved.title).includes("<"));

const polluted = await t.call("/tasks", { method: "POST", headers, body: '{"title":"Buy milk","__proto__":{"isAdmin":true}}' });
check("a __proto__ key gets 400", polluted.status === 400);
check("Object.prototype is untouched", !("isAdmin" in {}));
await t.stop();
```

Output of `npx tsx check-input.ts`

```ts
PASS  the title is stored exactly as typed
PASS  it goes out as JSON
PASS  with nosniff
PASS  and a CSP that allows no inline script
PASS  HTML output escapes it
PASS  a __proto__ key gets 400
PASS  Object.prototype is untouched
```

The `escapeHtml` line covers the places where task titles become HTML: the reminder email and the admin page. Encode where the text lands, for the language it lands in. The `__proto__` body is refused by the schema itself: `@zudojs/schema` objects reject that key with an `invalid_key` issue before any of your code copies the body. If a route ever accepts free-form JSON without a schema, add `findUnsafeKey` from `@zudojs/security`.

### 11. SQL injection

The production Task API stores tasks in PostgreSQL. Its repository sends every value as a parameter, never inside the SQL text:

task-repository.ts

```ts
import type { PGlite } from "@electric-sql/pglite";

export function createTaskRepository(db: PGlite) {
  return {
    async add(ownerId: string, title: string): Promise<number> {
      const { rows } = await db.query<{ id: number }>("INSERT INTO tasks (owner_id, title) VALUES ($1, $2) RETURNING id", [ownerId, title]);
      return rows[0]!.id;
    },
    async find(ownerId: string, id: number) {
      const { rows } = await db.query<{ title: string }>("SELECT title FROM tasks WHERE owner_id = $1 AND id = $2", [ownerId, id]);
      return rows[0];
    },
  };
}
```

Two checks. The first stores text that contains SQL syntax and proves it comes back unchanged, with nothing else in the table changed. The second reads the repository's *source* and fails if any query is built with a template literal: a cheap static check that catches the mistake before any test data could:

check-sql.tsNode.js only

```ts
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { check } from "./review.js";
import { createTaskRepository } from "./task-repository.js";

const db = new PGlite();
await db.exec("CREATE TABLE tasks (id SERIAL PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL)");
const tasks = createTaskRepository(db);
await tasks.add("u-linus", "Linus's private task");

const hostile = ["O'Brien's report", "x'); DROP TABLE tasks; --", "1 OR 1=1", "\\'; SELECT pg_sleep(10); --"];
for (const title of hostile) {
  const id = await tasks.add("u-ada", title);
  check(`round-trips: ${title}`, (await tasks.find("u-ada", id))?.title === title);
}
const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM tasks");
check("the table holds exactly the rows written", rows[0]!.n === hostile.length + 1);
await db.close();

const source = await readFile(new URL("./task-repository.ts", import.meta.url), "utf8");
const stringBuilt = /\.(query|exec)\(\s*`[^`]*\$\{/;
check("no query is built from a template literal", !stringBuilt.test(source));
check("the scan does spot one", stringBuilt.test("db.query(`SELECT * FROM tasks WHERE id = ${id}`)"));
```

Output of `npx tsx check-sql.ts`

```ts
PASS  round-trips: O'Brien's report
PASS  round-trips: x'); DROP TABLE tasks; --
PASS  round-trips: 1 OR 1=1
PASS  round-trips: \'; SELECT pg_sleep(10); --
PASS  the table holds exactly the rows written
PASS  no query is built from a template literal
PASS  the scan does spot one
```

The last line tests the test: a scanner that never matches anything would pass forever. In a real project you run the scan over all of `src/` in CI, or use a linter rule that does the same. When a query needs a dynamic column name (sorting, for example), allow-list it, as in [the injection lesson](https://zudojs.oyinlola.site/learn/sec-injection#sql); parameters only carry values.

### 12 and 13. Path traversal and request smuggling

These two live below your routes, in how the HTTP request itself is read. `fetch` cleans up paths and headers before sending, so it cannot send what these checks need. The check writes raw HTTP to a socket instead, the way an unusual client or a misbehaving proxy would:

check-http.tsNode.js only

```ts
import { connect } from "node:net";
import { check, startApi } from "./review.js";

const t = await startApi();
const port = t.api.server.address?.port ?? 0;
const ada = await t.login();

function send(head: string, body = ""): Promise<number> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1", () => socket.end(`${head}\r\nConnection: close\r\n\r\n${body}`));
    let reply = "";
    socket.on("data", (chunk) => (reply += chunk));
    socket.on("close", () => resolve(Number(reply.split(" ")[1])));
  });
}

check("a normal request works", (await send("GET /health HTTP/1.1\r\nHost: 127.0.0.1")) === 200);
check("../ in the path: 400", (await send(`GET /tasks/../../etc/passwd HTTP/1.1\r\nHost: 127.0.0.1\r\nCookie: ${ada.cookie}`)) === 400);
check("encoded ../ as an id: 404", (await send(`GET /tasks/..%2F..%2Fetc%2Fpasswd HTTP/1.1\r\nHost: 127.0.0.1\r\nCookie: ${ada.cookie}`)) === 404);
check("unknown Host: 400", (await send("GET /health HTTP/1.1\r\nHost: evil.example")) === 400);
check("Content-Length and Transfer-Encoding together: 400",
  (await send("POST /auth/login HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 4\r\nTransfer-Encoding: chunked", "0\r\n\r\n")) === 400);
check("two different Content-Lengths: 400",
  (await send("POST /auth/login HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 4\r\nContent-Length: 40", "abcd")) === 400);
await t.stop();
```

Output of `npx tsx check-http.ts`

```ts
PASS  a normal request works
PASS  ../ in the path: 400
PASS  encoded ../ as an id: 404
PASS  unknown Host: 400
PASS  Content-Length and Transfer-Encoding together: 400
PASS  two different Content-Lengths: 400
```

What refused what:

- **Path traversal:** the adapter's request guard refuses a path with `..` segments before routing. The encoded form reaches the router as a single segment, fails the UUID check on `:id`, and ends in the ordinary 404. The Task API never builds a file path from request data at all; when a feature must (file downloads), confine the path as in [the injection lesson](https://zudojs.oyinlola.site/learn/sec-injection#paths).
- **Host:** `security: { allowedHosts: […] }` on the adapter refuses requests for any other host name, so links the app builds from the `Host` header (password reset emails, for example) cannot point elsewhere.
- **Smuggling:** a request with two ways to state its length is exactly what lets a proxy and the app disagree about where it ends. Node's own HTTP parser refuses both forms here, and the ZudoJS guard checks the same framing rules as a second layer. Your proxy must be strict too; see [request smuggling](https://zudojs.oyinlola.site/learn/sec-injection#smuggling).

## 15. Secrets

Three properties: the app refuses to start without real secrets; it refuses to reuse one secret for two jobs; and the refusal message never contains the value. The check uses a recognisable fake secret as the **canary**, and searches the message for it:

check-secrets.tsNode.js only

```ts
import { loadConfig } from "./config.js";
import { check, secrets } from "./review.js";

function startupError(env: Record<string, string | undefined>): string {
  try {
    loadConfig(env);
    return "started";
  } catch (error) {
    return (error as Error).message;
  }
}

const canary = "canary-9f2c-short-secret";
const tooShort = startupError({ NODE_ENV: "production", ...secrets, JWT_ACCESS_SECRET: canary });
const missing = startupError({ NODE_ENV: "production", JWT_ACCESS_SECRET: secrets.JWT_ACCESS_SECRET });
const shared = startupError({ NODE_ENV: "production", ...secrets, CSRF_SECRET: secrets.JWT_ACCESS_SECRET });
console.log(tooShort);
console.log(missing);
console.log(shared);
check("a short secret stops startup", tooShort !== "started");
check("a missing secret stops startup", missing !== "started");
check("a secret used twice stops startup", shared !== "started");
check("no message contains a secret value", ![tooShort, missing, shared].some((m) => m.includes(canary) || m.includes(secrets.JWT_ACCESS_SECRET)));
```

Output of `npx tsx check-secrets.ts`

```ts
Invalid configuration: JWT_ACCESS_SECRET (too_small)
Invalid configuration: JWT_REFRESH_SECRET (required), CSRF_SECRET (required)
Invalid configuration: every secret must be different
PASS  a short secret stops startup
PASS  a missing secret stops startup
PASS  a secret used twice stops startup
PASS  no message contains a secret value
```

The review also looks outside the code:

- `.env` is in `.gitignore` (a generated project has this), and `.env.example` holds names only. A secret scanner such as gitleaks runs on every push; [the CI/CD lesson](https://zudojs.oyinlola.site/learn/zudo-ci-cd) adds it to the pipeline.
- Production values live in the host's secret store, readable only by the app's user ([deployment](https://zudojs.oyinlola.site/learn/deployment#linux)).
- Rotation is possible without a code change, and someone knows how: see [key rotation with key ids](https://zudojs.oyinlola.site/learn/sec-crypto#rotation).

## 16. Error leakage

When a handler fails, the client needs to know *that* it failed, not *why*. The details go to the log. The check adds a route that fails the way a database outage does, with an internal address in the message:

check-errors.tsNode.js only

```ts
import { check, startApi } from "./review.js";

const t = await startApi();
t.api.router.get("/reports", () => {
  throw new Error("connect ECONNREFUSED 10.0.0.5:5432 (user=taskapi)");
});
const res = await t.call("/reports", { headers: { "x-request-id": "req-42" } });
const body = await res.text();
console.log(res.status, body);
check("the client gets 500", res.status === 500);
check("with no internal message", !body.includes("ECONNREFUSED") && !body.includes("10.0.0.5"));
check("and no stack trace", !body.includes("at ") && !body.includes(".ts:"));
check("the error response has the security headers", res.headers.get("x-content-type-options") === "nosniff");
const logged = t.logLines.find((line) => line.includes('"req-42"')) ?? "";
check("the log has the message, the stack and the request id", logged.includes("ECONNREFUSED") && logged.includes('"stack"'));
await t.stop();
```

Output of `npx tsx check-errors.ts`

```ts
500 {"code":"ERR_INTERNAL_ERROR","message":"An unexpected error occurred.","category":"system","statusCode":500}
PASS  the client gets 500
PASS  with no internal message
PASS  and no stack trace
PASS  the error response has the security headers
PASS  the log has the message, the stack and the request id
```

Two review findings came out of this section while the Task API was being prepared. Both are worth knowing, because both pass every normal functional test.

### Finding: error responses skipped the security headers

The first draft of `app.ts` let errors propagate out of the pipeline, like many examples do. The adapter then turns the error into a safe response, but that response is built *outside* the pipeline, after the security middleware has already been skipped. Here is that shape reduced to its core, next to the fixed one:

finding-headers.tsNode.js only

```ts
import {
  HttpMiddlewarePipeline, createHttpServer, createNodeHttpAdapter, createResponseContext,
  createSecurityMiddleware, unauthorized, type HttpMiddleware,
} from "@zudojs/http";

const route: HttpMiddleware = async () => {
  throw unauthorized("Login required");
};
const errorsToResponses: HttpMiddleware = async (_context, next) => {
  try {
    return await next();
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    return createResponseContext({ status }).json({ error: status < 500 ? (error as Error).message : "Internal Server Error" });
  }
};

for (const [label, middlewares] of [
  ["errors thrown out of the pipeline", [createSecurityMiddleware(), route]],
  ["errors turned into responses inside it", [createSecurityMiddleware(), errorsToResponses, route]],
] as const) {
  const server = createHttpServer({
    adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
    handler: (request) => new HttpMiddlewarePipeline({ middlewares: [...middlewares] }).execute(request, createResponseContext()),
  });
  await server.start();
  const res = await fetch(`http://127.0.0.1:${server.address?.port}/tasks`);
  console.log(`${label}: ${res.status}, nosniff=${res.headers.get("x-content-type-options")}, X-Frame-Options=${res.headers.get("x-frame-options")}`);
  await server.stop();
}
```

Output of `npx tsx finding-headers.ts`

```ts
errors thrown out of the pipeline: 401, nosniff=null, X-Frame-Options=null
errors turned into responses inside it: 401, nosniff=nosniff, X-Frame-Options=DENY
```

Same status, same body, but the first 401 carries no security headers. That is why `app.ts` has `errorsToResponses` *after* `createSecurityMiddleware()`: the security middleware wraps it and decorates whatever it returns. Two responses are still built by the adapter itself and so still come without these headers: the `413` for an oversized body and the `400` from the request guard. Both are small JSON bodies, so the risk is low; have your reverse proxy add the headers to every response as the backstop (Caddy's `header` directive).

### Finding: `serializePublicError` publishes metadata

`serializePublicError` from `@zudojs/errors` makes an error safe for a response: for a 5xx it replaces the message with a generic one. But for an error with `expose: true`, which every 4xx error in `@zudojs/errors` has by default, it copies the error's whole `metadata` into the public result. Only keys with secret-looking names are redacted. Metadata is where developers put things for the logs:

finding-public-error.ts

```ts
import { ConflictError, serializePublicError } from "@zudojs/errors";

const error = new ConflictError("A task with this title already exists", {
  metadata: { field: "title", existingTaskId: "t-981", ownerEmail: "grace@example.com", apiToken: "tok_123" },
});
console.log("exposed:", error.expose);
console.log("default:", serializePublicError(error));
console.log("allow-list:", serializePublicError(error, { publicMetadataKeys: ["field"] }));
```

Output of `npx tsx finding-public-error.ts` and of the browser terminal

```ts
exposed: true
default: {
  code: 'ERR_CONFLICT',
  message: 'A task with this title already exists',
  category: 'conflict',
  statusCode: 409,
  metadata: {
    field: 'title',
    existingTaskId: 't-981',
    ownerEmail: 'grace@example.com',
    apiToken: '[REDACTED]'
  }
}
allow-list: {
  code: 'ERR_CONFLICT',
  message: 'A task with this title already exists',
  category: 'conflict',
  statusCode: 409,
  metadata: { field: 'title' }
}
```

With the defaults, a conflict tells the caller that another user's task exists and whose it is. `apiToken` was caught by the name-based redaction; `ownerEmail` was not, because an email address does not look like a secret. The fix is the `publicMetadataKeys` option: an allow-list of keys that may leave the server, here only `field`. The Task API passes it in `errorsToResponses`, and this check guards it:

check-public-error.tsNode.js only

```ts
import { ConflictError } from "@zudojs/errors";
import { check, startApi } from "./review.js";

const t = await startApi();
t.api.router.get("/conflict", () => {
  throw new ConflictError("A task with this title already exists", {
    metadata: { field: "title", ownerEmail: "grace@example.com" },
  });
});
const res = await t.call("/conflict");
const body = await res.text();
console.log(res.status, body);
check("the allow-listed field is kept", body.includes('"field":"title"'));
check("other metadata stays on the server", !body.includes("grace@example.com"));
await t.stop();
```

Output of `npx tsx check-public-error.ts`

```ts
409 {"code":"ERR_CONFLICT","message":"A task with this title already exists","category":"conflict","statusCode":409,"metadata":{"field":"title"}}
PASS  the allow-listed field is kept
PASS  other metadata stays on the server
```

## 17. Logging leakage

Logs are copied to other systems, kept for months and read by many people. A password in a log line has leaked. The review uses the canary method on the whole app: log in, fail a login, create a task, cause a 500, then search every captured log line for the password, the token and every secret:

check-logs.tsNode.js only

```ts
import { ADA, check, secrets, startApi } from "./review.js";

const t = await startApi();
const ada = await t.login(ADA);
await t.call("/auth/login", { method: "POST", body: JSON.stringify({ email: ADA.email, password: "wrong-password-canary" }) });
await t.call("/tasks", { method: "POST", headers: { cookie: ada.cookie, "x-csrf-token": ada.csrfToken }, body: JSON.stringify({ title: "Renew passport" }) });
t.api.router.get("/fail", () => {
  throw new Error("database unavailable");
});
await t.call("/fail", { headers: { cookie: ada.cookie } });

const logs = t.logLines.join("\n");
const accessToken = ada.cookie.match(/access_token=([^;]+)/)![1]!;
console.log(`${t.logLines.length} log lines captured`);
check("no password", !logs.includes(ADA.password) && !logs.includes("wrong-password-canary"));
check("no access token", !logs.includes(accessToken));
check("no CSRF token", !logs.includes(ada.csrfToken));
check("no secret", !Object.values(secrets).some((secret) => logs.includes(secret)));
check("the failure was logged", logs.includes("database unavailable"));
await t.stop();
```

Output of `npx tsx check-logs.ts`

```ts
2 log lines captured
PASS  no password
PASS  no access token
PASS  no CSRF token
PASS  no secret
PASS  the failure was logged
```

The last check matters: a log that contains nothing passes every "no leak" check. The Task API uses `@zudojs/logger`, which also redacts metadata keys that look secret (`password`, `token`, `authorization`, …) by default, as [the logging lesson](https://zudojs.oyinlola.site/learn/zudo-logging#redaction) shows. Redaction works on key *names* only, so the canary search is still needed: it also catches a secret glued into a message string.

### Finding: the `@zudojs/core` logger does not redact by default

Apps assembled with `createApplication` from [@zudojs/core](https://zudojs.oyinlola.site/learn/zudo-core) get a different logger: `ConsoleLogger`. Unlike `@zudojs/logger`, it redacts nothing unless you give it a redaction hook. Here are both, logging the same failed login:

finding-core-logger.tsNode.js only

```ts
import { ConsoleLogger, createLogRedactor } from "@zudojs/core";

const attempt = { email: "ada@example.com", password: "hunter2", authorization: "Bearer eyJhbGciOi..." };

new ConsoleLogger({ timestamps: false }).info("login failed", attempt);
new ConsoleLogger({ timestamps: false, redact: createLogRedactor() }).info("login failed", attempt);
```

Output of `npx tsx finding-core-logger.ts`

```json
{"level":"info","message":"login failed","context":{"email":"ada@example.com","password":"hunter2","authorization":"Bearer eyJhbGciOi..."}}
{"level":"info","message":"login failed","context":{"email":"ada@example.com","password":"[REDACTED]","authorization":"[REDACTED]"}}
```

The first line prints the password and the bearer token in clear. `createLogRedactor()` replaces values under secret-looking keys, and `patterns` adds your own (`createLogRedactor({ patterns: ["email"] })` for personal data). When you use `createApplication`, pass it through the logger options, and keep a canary check so that a refactor which drops it fails:

check-core-logger.tsNode.js only

```ts
import { createApplication, createLogRedactor } from "@zudojs/core";

const lines: string[] = [];
const info = console.info;
console.info = (line: string) => lines.push(line);
const app = await createApplication({ logger: { timestamps: false, redact: createLogRedactor() } });
app.applicationContext?.getLogger().info("login failed", { email: "ada@example.com", password: "canary-hunter2" });
console.info = info;

const leaked = lines.some((line) => line.includes("canary-hunter2"));
console.log(`${leaked ? "FAIL" : "PASS"}  the core logger hides passwords (${lines.length} lines checked)`);
```

Output of `npx tsx check-core-logger.ts`

```ts
PASS  the core logger hides passwords (2 lines checked)
```

## Write up the findings

A review ends with a short report that someone can act on. One row per finding: what and where, the evidence (the check that shows it), how bad it is, the fix, and the test that now guards it. **Severity** is impact times likelihood: a leak of other users' data that any logged-in user can trigger is high; a missing header on a JSON error body is low.

| ID | Finding | Severity | Fix | Guarded by |
| --- | --- | --- | --- | --- |
| F1 | `@zudojs/core` `ConsoleLogger` logs `password` and `authorization` values in clear by default (package) | High, if the app uses `createApplication` | Pass `redact: createLogRedactor()` | `check-core-logger.ts` |
| F2 | `serializePublicError` copies all metadata of exposed errors into responses (package) | Medium: leaks whatever a developer put in metadata | `publicMetadataKeys: ["field"]` | `check-public-error.ts` |
| F3 | Error responses thrown out of the pipeline had no security headers | Low | Turn errors into responses inside the pipeline; proxy adds headers as backstop | `check-errors.ts` |
| F4 | Adapter-level 400 and 413 responses have no security headers (package) | Low | Reverse proxy adds them | A check against the deployed URL |

F1, F2 and F4 are in the framework, so they also go to its maintainers as bug reports, with the example that reproduces each. Your own checks stay in place after the packages are fixed: they protect against the next regression, in either codebase.

### Run the review on every change

A review done once decays. Keep the checks in the repository, in `tests/security/`, and run them in CI with the unit tests. In a generated project they are ordinary Vitest tests: each `check(name, ok)` becomes `expect(ok).toBe(true)` inside an `it(name, …)`, and the harness starts the API in `beforeAll`. [The CI/CD lesson](https://zudojs.oyinlola.site/learn/zudo-ci-cd) wires this into the pipeline, next to a dependency audit and a secret scan. Repeat the manual part of the review, the questions above, whenever a feature adds a new entry point: a new public route, an upload, an outbound call, a new cookie.

## Practice

TRY IT YOURSELF

### Security headers on every kind of response

Check 16 tested the headers on one 500. Write a check that sends four requests to the Task API (a 200, a 401, a 404 for an unknown path, and a 400 for a body that is not JSON) and checks that each response has `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`.

**Show a solution**

check-headers.tsNode.js only

```ts
import { check, startApi } from "./review.js";

const t = await startApi();
const ada = await t.login();
const requests: Array<[string, string, RequestInit]> = [
  ["200 health", "/health", {}],
  ["401 tasks", "/tasks", {}],
  ["404 unknown path", "/no-such-page", {}],
  ["400 not JSON", "/tasks", { method: "POST", headers: { cookie: ada.cookie, "x-csrf-token": ada.csrfToken }, body: "{oops" }],
];
for (const [label, path, init] of requests) {
  const res = await t.call(path, init);
  const ok = res.headers.get("x-content-type-options") === "nosniff" && res.headers.get("x-frame-options") === "DENY";
  check(`${label} (${res.status}) has the headers`, ok);
}
await t.stop();
```

Output of `npx tsx check-headers.ts`

```ts
PASS  200 health (200) has the headers
PASS  401 tasks (401) has the headers
PASS  404 unknown path (404) has the headers
PASS  400 not JSON (400) has the headers
```

All four pass because every one of those responses is produced inside the pipeline: the 404 by the router, the 400 and 401 by `errorsToResponses`. Try moving `pipeline.use(errorsToResponses)` above `createSecurityMiddleware()`: the 401 and 400 lines turn into `FAIL`, which shows the test can fail.

TRY IT YOURSELF

### An allow-list for validation errors

A `ValidationError` for the task title carries `field`, `maxLength` and `receivedValue` in its metadata. The client should learn the field and the limit, but never see its own input echoed back (it may be a pasted password, and echoing input is how reflected XSS starts). Serialize it so only the first two keys leave the server.

**Show a solution**

validation-error.ts

```ts
import { ValidationError, serializePublicError } from "@zudojs/errors";

const error = new ValidationError("Title is too long", {
  metadata: { field: "title", maxLength: 200, receivedValue: "x".repeat(300) },
});
const safe = serializePublicError(error, { publicMetadataKeys: ["field", "maxLength"] });
console.log(safe);
```

Output of `npx tsx validation-error.ts` and of the browser terminal

```json
{
  code: 'ERR_VALIDATION_FAILED',
  message: 'Title is too long',
  category: 'validation',
  statusCode: 400,
  metadata: { field: 'title', maxLength: 200 }
}
```

The allow-list names what may leave, so a key someone adds later stays private until they decide otherwise. A block-list (removing `receivedValue`) would leak the next new key.

TRY IT YOURSELF

### Triage four reports

A colleague's review of another service lists four problems. Give each a severity (high, medium, low) and a fix: (a) `GET /invoices/:id` answers 403 for other customers' invoices and 404 for missing ones; (b) the login route has no rate limit, but accounts lock after 5 failures; (c) the `/health` response includes the PostgreSQL version and host name; (d) `CORS_ORIGINS` is read from the environment and defaults to `*` when unset.

**Show a solution**

- (a) **Medium.** Nobody reads the invoice, but the status difference lets anyone enumerate which invoice ids exist, and in what range. Answer 404 for both, with the same body, and add the check from section 2.
- (b) **Medium.** Lockout stops guessing one account, not trying one common password against thousands of accounts, and it lets anyone lock real users out on purpose. Add a per-address limit (section 8) and keep the lockout.
- (c) **Low.** Version and host names help an attacker pick known vulnerabilities. Report only `ok` or `unavailable` and per-dependency `up`/`down`, as the generated `/health` does.
- (d) **High if the API uses cookies**, low otherwise. A missing variable silently opens the API to every website. Make the setting required in production and refuse `*` together with credentials at startup (the package already refuses that combination in `generateSimpleHeaders`), and add the startup check from section 6.

## Summary

- A security review is a checklist where every "yes" comes with evidence, and the best evidence is a test that sends the forbidden request and checks the refusal.
- Ask the router for the routes instead of listing them, and pin the list of public routes, so a forgotten middleware fails a test.
- Authorization failures on other users' data answer exactly like missing data. Tokens are checked for issuer, audience, type and key; cookies are `HttpOnly`, `Secure` and `SameSite`; cookie-authenticated writes need the session's CSRF token.
- Input is stored as data and encoded where it lands: parameters for SQL, JSON with `nosniff` and a CSP for responses, `escapeHtml` for HTML, schemas that refuse `__proto__`, public-only webhook URLs checked by DNS too, and a strict HTTP parser with a `Host` allow-list.
- Search logs and responses for canaries: known secrets, passwords and tokens used only in the test. Check that the thing you expect to be logged is there, too.
- Two package findings to configure around: pass `createLogRedactor()` to `@zudojs/core` loggers, and `publicMetadataKeys` to `serializePublicError`. Turn errors into responses inside the pipeline so they get the security headers.

Next: [diagnosing performance](https://zudojs.oyinlola.site/learn/zudo-performance), where the same rule applies. Measure first, then change one thing, then measure again.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
