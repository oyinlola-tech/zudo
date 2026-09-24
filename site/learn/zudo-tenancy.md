---
title: "Multi-tenancy"
description: "Serve many companies from one Task API without ever mixing their data. Tenant ids, resolvers and trust levels, resolver chains, AsyncLocalStorage context and tenant-scoped queries with @zudojs/tenancy."
source: https://zudojs.oyinlola.site/learn/zudo-tenancy
---

LESSON 77 OF 84

Platform features Advanced

# Multi-tenancy

Serve many companies from one Task API without ever mixing their data. Tenant ids, resolvers and trust levels, resolver chains, AsyncLocalStorage context and tenant-scoped queries with @zudojs/tenancy.

- **45 min** to read and try
- **You need:** The Task API project, the auth and database lessons
- **You build:** A Task API where each company only ever sees its own tasks, with the tenant taken from the verified session and never from a header

  [Test yourself](#test)

## One app, many customers

The Task API is now sold to companies. Acme and Globex each get their own users and their own tasks, but you run **one** copy of the application and one database for all of them. Each customer is a **tenant**, and an application built this way is **multi-tenant**. Almost every SaaS product (software you rent in the browser) works like this.

There are three common ways to keep the tenants' data apart:

| Strategy | How | Trade-off |
| --- | --- | --- |
| Shared tables | Every row has a `tenant_id` column, and every query filters on it. | Cheapest and simplest to run. One forgotten filter leaks data. |
| Schema per tenant | Each tenant gets its own set of tables in one database. | Stronger walls. Migrations must run once per tenant. |
| Database per tenant | Each tenant gets a whole database. | Strongest isolation, the most expensive, used for large customers. |

This lesson uses shared tables, the usual starting point. Whatever the strategy, the rule is the same, and it is the most important sentence on this page: **a request from one tenant must never read or change another tenant's data.** That is called **tenant isolation**. A bug here is not a small bug: it shows one company's data to a competitor.

Terminal on your computer

```bash
$ npm install @zudojs/tenancy

added 1 package, and audited 75 packages in 7s
…
```

The examples use Node.js features and PGlite from [the databases lesson](https://zudojs.oyinlola.site/learn/databases), so run them on your computer with `npx tsx src/<file>.ts`.

## Tenants and tenant ids

A tenant has an id, a name and a **status**: only `active` tenants may use the app. A tenant that did not pay is `suspended`. A **repository** stores the tenants. The memory one is good for learning and tests:

tenants.tsNode.js only

```ts
import { createMemoryTenantRepository, createTenantId } from "@zudojs/tenancy";

export const tenants = createMemoryTenantRepository();
tenants.add({ id: createTenantId("acme"), name: "Acme", slug: "acme", status: "active", metadata: {} });
tenants.add({ id: createTenantId("globex"), name: "Globex", slug: "globex", status: "active", metadata: {} });
tenants.add({ id: createTenantId("initech"), name: "Initech", status: "suspended", metadata: {} });
```

tenant-ids.tsNode.js only

```ts
import { createTenantId, tryCreateTenantId } from "@zudojs/tenancy";
import { tenants } from "./tenants.js";

console.log(tryCreateTenantId("  ACME "));
console.log(tryCreateTenantId("acme:admin"), tryCreateTenantId("../globex"));
console.log((await tenants.findById(createTenantId("globex")))?.name);
```

Output of `npx tsx tenant-ids.ts`

```ts
acme
undefined undefined
Globex
```

A tenant id is cleaned up (trimmed, lower-cased) and must match `^[a-z0-9][a-z0-9_-]*$`. `tryCreateTenantId` returns `undefined` for anything else, `createTenantId` throws. That matters because tenant ids end up in cache keys, file paths and log lines: an id like `acme:admin` could otherwise forge a key that belongs to someone else.

## Which tenant is this request for?

Every request must be tied to one tenant. Finding out which one is called **tenant resolution**, and the parts that do it are **resolvers**. Each one looks at a different part of the request:

| Resolver | Reads | Trust |
| --- | --- | --- |
| `createJwtResolver` | The `tenant_id` claim of the user's verified token or session | `trusted` |
| `createSubdomainResolver`, `createDomainResolver` | The host name, like `acme.tasks.test` | `verified` |
| `createHeaderResolver`, `createPathResolver` | An `x-tenant-id` header, or the first part of a path like `/acme/tasks` (for `/t/acme/tasks`, pass `{ prefix: "/t" }`) | `untrusted` |

The **trust level** says how much you can believe the answer. A header is `untrusted` because the client writes it: anybody can send `x-tenant-id: globex` with `curl`. If your app believed it, every Acme user could read Globex's tasks by adding one line to their request. The session, on the other hand, was created by your server when the user logged in (as in [the auth lesson](https://zudojs.oyinlola.site/learn/zudo-auth)), so the tenant stored in it is `trusted`.

Resolvers read the request through a small interface: `getClaims`, `getHost`, `getHeader` and `getPath`. This helper builds one from plain values, so you can try resolvers without a server:

fake-request.tsNode.js only

```ts
import type { HttpResolverContext, TenantClaims } from "@zudojs/tenancy";

export interface FakeRequest {
  readonly claims?: TenantClaims;
  readonly host?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export function fakeRequest(request: FakeRequest): HttpResolverContext {
  return {
    getClaims: () => request.claims,
    getHost: () => request.host,
    getHeader: (name) => request.headers?.[name.toLowerCase()],
    getPath: () => "/tasks",
  };
}
```

resolve.tsNode.js only

```ts
import { createHeaderResolver, createJwtResolver, createResolverChain, createSubdomainResolver } from "@zudojs/tenancy";
import { fakeRequest } from "./fake-request.js";

const chain = createResolverChain([
  createJwtResolver(),
  createSubdomainResolver({ baseDomain: "tasks.test" }),
  createHeaderResolver(),
]);

const requests = {
  "session": fakeRequest({ claims: { tenant_id: "acme" } }),
  "subdomain": fakeRequest({ host: "globex.tasks.test" }),
  "header only": fakeRequest({ headers: { "x-tenant-id": "globex" } }),
  "session + header": fakeRequest({ claims: { tenant_id: "acme" }, headers: { "x-tenant-id": "globex" } }),
  "nothing": fakeRequest({ host: "tasks.test" }),
};
for (const [name, request] of Object.entries(requests)) {
  const found = await chain.resolveTenant(request);
  console.log(name.padEnd(16), found ? `${found.tenantId} from ${found.source} (${found.trust})` : "no tenant");
}
```

Output of `npx tsx resolve.ts`

```ts
session          acme from jwt (trusted)
subdomain        globex from subdomain (verified)
header only      globex from header (untrusted)
session + header acme from jwt (trusted)
nothing          no tenant
```

A **resolver chain** asks its resolvers in order of **priority** (the JWT resolver has the highest) and stops at the first answer. That is why "session + header" is Acme: the trusted session wins, and the header is never even read. "header only" found Globex, but marked it `untrusted`. The next section refuses it.

Two more safety details: `www` and the bare domain do not count as tenants, and a resolver that *throws* (for example on an invalid token) stops the whole chain. A failed login can never fall through to the header.

## Enforce trust and status

Resolving is not enough: you must also check that the answer is trustworthy and that the tenant may use the app. `assertTrustLevel` refuses anything below the level you require, and `createTenantManager` loads the tenant and refuses tenants that are not active:

enforce.tsNode.js only

```ts
import { assertTrustLevel, createResolverChain, createHeaderResolver, createJwtResolver, createTenantContextStorage, createTenantManager, TenantError } from "@zudojs/tenancy";
import type { Tenant } from "@zudojs/tenancy";
import { fakeRequest } from "./fake-request.js";
import type { FakeRequest } from "./fake-request.js";
import { tenants } from "./tenants.js";

const chain = createResolverChain([createJwtResolver(), createHeaderResolver()]);
const manager = createTenantManager({ repository: tenants, storage: createTenantContextStorage() });

async function tenantFor(request: FakeRequest): Promise<Tenant> {
  const found = await chain.resolveTenant(fakeRequest(request));
  if (!found) throw new TenantError("No tenant for this request");
  assertTrustLevel(found.trust, "verified", found.source);
  return manager.requireActive(found.tenantId);
}

for (const request of [
  { claims: { tenant_id: "acme" } },
  { headers: { "x-tenant-id": "globex" } },
  { claims: { tenant_id: "initech" } },
  {},
]) {
  try {
    console.log("OK  ", (await tenantFor(request)).name);
  } catch (error) {
    if (error instanceof TenantError) console.log("DENY", error.statusCode, error.name);
  }
}
```

Output of `npx tsx enforce.ts`

```ts
OK   Acme
DENY 403 TenantTrustLevelError
DENY 403 TenantUnavailableError
DENY 403 TenantError
```

Only the trusted session reaches a tenant. The header-only request is refused with `TenantTrustLevelError`, and the suspended Initech with `TenantUnavailableError`. Every tenancy error extends `TenantError`, an `AuthorizationError` from [@zudojs/errors](https://zudojs.oyinlola.site/learn/zudo-errors), so it already carries status 403. Do not tell the client *why*: an attacker probing tenant names should not learn which ones exist or are suspended.

> NOTE
>
> When is a header acceptable? Only when a proxy that you control removes the client's `x-tenant-id` and sets its own, for example an API gateway that has already checked an API key. Then create the resolver with `createHeaderResolver({ trust: "verified" })`, and never expose the app without that proxy.

## The tenant context

Once the tenant is known, every piece of code that handles the request needs it: services, repositories, cache keys, log lines. Passing it as a parameter through every function is tedious, and one forgotten parameter is a leak. Instead, the tenancy package stores it in an **AsyncLocalStorage**, the same Node.js feature that carried the trace id in [the observability lesson](https://zudojs.oyinlola.site/learn/zudo-observability):

context.tsNode.js only

```ts
import { createContextManager, createTenantContextStorage } from "@zudojs/tenancy";

export const tenantStorage = createTenantContextStorage();
export const tenantContext = createContextManager({ storage: tenantStorage });
```

context-demo.tsNode.js only

```ts
import { createTenantId, TenantContextMissingError } from "@zudojs/tenancy";
import { tenantContext } from "./context.js";
import { tenants } from "./tenants.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function listTasks(delayMs: number): Promise<void> {
  await wait(delayMs);
  console.log("listing tasks of", tenantContext.requireCurrentTenant().name);
}

const acme = await tenants.findById(createTenantId("acme"));
const globex = await tenants.findById(createTenantId("globex"));
if (acme && globex) {
  await Promise.all([
    tenantContext.run(acme, () => listTasks(30)),
    tenantContext.run(globex, () => listTasks(10)),
    tenantContext.run(acme, () => listTasks(20)),
  ]);
}

try {
  await listTasks(0);
} catch (error) {
  if (error instanceof TenantContextMissingError) console.log("outside:", error.message);
}
```

Output of `npx tsx context-demo.ts`

```ts
listing tasks of Globex
listing tasks of Acme
listing tasks of Acme
outside: Tenant context is required but none was found
```

The three calls ran at the same time and finished in a different order than they started, and each one saw its own tenant. `listTasks` has no tenant parameter. Outside `run`, `requireCurrentTenant()` throws: code that needs a tenant fails loudly instead of quietly reading everybody's data. `run` also refuses a tenant that is not active.

## Tenant-scoped queries

Now the data. Every task row gets a `tenant_id`. The repository reads the tenant from the context and puts it in **every** query, as a parameter, never glued into the SQL text. Callers cannot even pass a tenant: there is no parameter to get wrong.

task.repository.tsNode.js only

```ts
import type { PGlite } from "@electric-sql/pglite";
import { tenantContext } from "./context.js";

interface TaskRow { id: number; title: string }

export class TaskRepository {
  constructor(private readonly db: PGlite) {}

  private tenantId(): string {
    return tenantContext.requireCurrentTenant().id;
  }

  async list(): Promise<TaskRow[]> {
    const result = await this.db.query<TaskRow>(
      "select id, title from tasks where tenant_id = $1 order by id", [this.tenantId()]);
    return result.rows;
  }

  async get(id: number): Promise<TaskRow | undefined> {
    const result = await this.db.query<TaskRow>(
      "select id, title from tasks where id = $1 and tenant_id = $2", [id, this.tenantId()]);
    return result.rows[0];
  }

  async create(title: string): Promise<TaskRow> {
    const result = await this.db.query<TaskRow>(
      "insert into tasks (tenant_id, title) values ($1, $2) returning id, title", [this.tenantId(), title]);
    const row = result.rows[0];
    if (!row) throw new Error("insert returned no row");
    return row;
  }
}
```

isolation.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";
import { createTenantId } from "@zudojs/tenancy";
import { tenantContext } from "./context.js";
import { TaskRepository } from "./task.repository.js";
import { tenants } from "./tenants.js";

const db = new PGlite();
await db.exec(`create table tasks (
  id serial primary key,
  tenant_id text not null,
  title text not null
)`);
const repo = new TaskRepository(db);
const acme = await tenants.findById(createTenantId("acme"));
const globex = await tenants.findById(createTenantId("globex"));
if (!acme || !globex) throw new Error("tenants missing");

await tenantContext.run(acme, () => repo.create("Acme: ship order 1001"));
const secret = await tenantContext.run(globex, () => repo.create("Globex: secret merger plan"));

await tenantContext.run(acme, async () => {
  console.log("acme sees:", await repo.list());
  console.log(`acme asks for task ${secret.id}:`, await repo.get(secret.id));
});
await tenantContext.run(globex, async () => {
  console.log("globex sees:", await repo.list());
});
await db.close();
```

Output of `npx tsx isolation.ts`

```ts
acme sees: [ { id: 1, title: 'Acme: ship order 1001' } ]
acme asks for task 2: undefined
globex sees: [ { id: 2, title: 'Globex: secret merger plan' } ]
```

This is the test that matters. Acme asked for task 2 by its id, which is easy to guess because ids count up. The query found nothing, because task 2 belongs to Globex: `and tenant_id = $2` is part of the lookup. For the client, "belongs to someone else" and "does not exist" must look the same: a 404. Answering 403 would tell an attacker that the id exists.

> TIP
>
> Use the tenant in other keys too. `tenantKey(tenantId, "tasks:list")` builds a cache key like `tenant:acme:tasks\:list`, so one tenant's cached list is never served to another, and `assertTenantOwnership(resource, tenantId)` throws a `TenantIsolationError` if an object from the wrong tenant reaches your code.

## Put it together: a multi-tenant Task API

Now the real server. When a user logs in, the server stores their user id *and their tenant* in the session. Two middleware guard every task route, in this order:

1. `requireLogin` finds the session. No session means `401`.
2. `createResolveTenantMiddleware` does everything from the last three sections at once. It asks the resolver chain (the JWT resolver reads the session's claims through `getClaims`), requires `verified` trust by default, loads the tenant, refuses one that is unknown or not active, and runs the route inside the tenant context.

The route handlers only call the repository from the last section:

server.tsNode.js only

```ts
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createHttpServer, createNodeHttpAdapter, createResponseContext, createRouter, notFound, unauthorized } from "@zudojs/http";
import type { HttpMiddleware, HttpRequestContext } from "@zudojs/http";
import { createHeaderResolver, createJwtResolver, createResolverChain, createResolveTenantMiddleware } from "@zudojs/tenancy";
import type { TenantClaims } from "@zudojs/tenancy";
import { tenantStorage } from "./context.js";
import { TaskRepository } from "./task.repository.js";
import { tenants } from "./tenants.js";

const db = new PGlite();
await db.exec("create table tasks (id serial primary key, tenant_id text not null, title text not null)");
await db.exec("insert into tasks (tenant_id, title) values ('acme', 'Acme: ship order 1001'), ('globex', 'Globex: secret merger plan')");
const repo = new TaskRepository(db);

const sessions = new Map<string, TenantClaims>();
function login(userId: string, tenantId: string): string {
  const token = randomUUID();
  sessions.set(token, { sub: userId, tenant_id: tenantId });
  return token;
}
const sessionFor = (authorization: string | undefined) => sessions.get(authorization?.replace(/^Bearer /, "") ?? "");

const requireLogin: HttpMiddleware = async (ctx, next) => {
  if (!sessionFor(ctx.request.getHeader("authorization"))) throw unauthorized("Log in first");
  return next();
};
const resolveTenant = createResolveTenantMiddleware({
  resolver: createResolverChain([createJwtResolver(), createHeaderResolver()]).asResolver(),
  repository: tenants,
  storage: tenantStorage,
  getClaims: (ctx) => sessionFor(ctx.request.getHeader?.("authorization")),
});
const middleware = [requireLogin, resolveTenant];

const router = createRouter();
router.get("/tasks", async () => createResponseContext().json(await repo.list()), { middleware });
router.get("/tasks/:id", async (ctx) => {
  const id = Number(ctx.params.id);
  const task = Number.isSafeInteger(id) ? await repo.get(id) : undefined;
  if (!task) throw notFound("Task not found");
  return createResponseContext().json(task);
}, { middleware });

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ port: 0 }),
  handler: async (request: HttpRequestContext) => (await router.dispatch(request)).response,
});
await server.start();
const base = `http://localhost:${server.address?.port}`;
const ada = login("ada", "acme");
const wile = login("wile", "initech");

const calls: [string, string, Record<string, string>][] = [
  ["ada lists tasks", "/tasks", { authorization: `Bearer ${ada}` }],
  ["ada guesses id 2", "/tasks/2", { authorization: `Bearer ${ada}` }],
  ["ada sends x-tenant-id", "/tasks", { authorization: `Bearer ${ada}`, "x-tenant-id": "globex" }],
  ["header, no session", "/tasks", { "x-tenant-id": "globex" }],
  ["suspended tenant", "/tasks", { authorization: `Bearer ${wile}` }],
];
for (const [name, path, headers] of calls) {
  const response = await fetch(base + path, { headers });
  console.log(name.padEnd(22), response.status, await response.text());
}
await server.stop();
await db.close();
```

Output of `npx tsx server.ts`

```ts
ada lists tasks        200 [{"id":1,"title":"Acme: ship order 1001"}]
ada guesses id 2       404 {"error":"Task not found","code":"NOT_FOUND"}
ada sends x-tenant-id  200 [{"id":1,"title":"Acme: ship order 1001"}]
header, no session     401 {"error":"Log in first","code":"UNAUTHORIZED"}
suspended tenant       404 {"error":"Tenant not found"}
```

Read the five answers:

- Ada sees only Acme's task.
- Guessing Globex's id gives a 404, exactly like an id that does not exist.
- Her `x-tenant-id: globex` header changed nothing: the trusted session answered first.
- A header without a session is not even looked at: the request is not logged in.
- Initech's user logged in before the tenant was suspended. The middleware answers `404 Tenant not found`, the same as for a tenant that does not exist, so a caller cannot learn which tenants exist or which are suspended. If only a header had named a tenant, the answer would be `403`: an `untrusted` source is refused.

`.asResolver()` turns the chain into the single resolver the middleware takes. The guard refusals are real HTTP answers with their own status codes (since @zudojs/tenancy 1.3.0 with @zudojs/http 1.4.0), and the middleware fits the route's `middleware` list without a cast.

## Practice

TRY IT YOURSELF

### Add update and delete

Add `rename(id, title)` and `delete(id)` to `TaskRepository`. Both must only touch the current tenant's row, and return whether a row was changed. Show that Acme cannot rename Globex's task.

**Show a solution**

Put `tenant_id` in the `where` of every write, just like in the reads. PGlite reports how many rows changed in `affectedRows`:

rename.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";
import { createTenantId } from "@zudojs/tenancy";
import { tenantContext } from "./context.js";
import { tenants } from "./tenants.js";

const db = new PGlite();
await db.exec("create table tasks (id serial primary key, tenant_id text not null, title text not null)");
await db.exec("insert into tasks (tenant_id, title) values ('acme', 'Acme task'), ('globex', 'Globex task')");

async function rename(id: number, title: string): Promise<boolean> {
  const tenantId = tenantContext.requireCurrentTenant().id;
  const result = await db.query("update tasks set title = $1 where id = $2 and tenant_id = $3", [title, id, tenantId]);
  return (result.affectedRows ?? 0) > 0;
}

const acme = await tenants.findById(createTenantId("acme"));
if (acme) {
  await tenantContext.run(acme, async () => {
    console.log("rename own task:", await rename(1, "Acme task, renamed"));
    console.log("rename Globex's task:", await rename(2, "hacked"));
  });
}
console.log((await db.query("select id, tenant_id, title from tasks order by id")).rows);
await db.close();
```

Output of `npx tsx rename.ts`

```ts
rename own task: true
rename Globex's task: false
[
  { id: 1, tenant_id: 'acme', title: 'Acme task, renamed' },
  { id: 2, tenant_id: 'globex', title: 'Globex task' }
]
```

TRY IT YOURSELF

### Which source?

For each case, say which resolver you would use and whether it is safe on its own: (a) a mobile app whose users log in; (b) each company opens `acme.tasks.test` in the browser, and users still log in; (c) a partner system calls your API with an API key; (d) a `?tenant=acme` query parameter.

**Show a solution**

(a) The session or token claim (`createJwtResolver`): trusted. (b) The subdomain is fine for choosing the login page and the look of the site, but after login, check that the session's tenant equals the subdomain's, with `createResolverChain(..., { detectConflicts: true })`, which throws `TenantResolutionConflictError` when they disagree. (c) Look the tenant up from the API key on the server: trusted, because your server issued the key. (d) Never on its own: the client writes it, like a header. It is untrusted.

## Recap

- A tenant is one customer of a shared application. Tenant isolation, no request ever touching another tenant's data, is the rule above all others.
- Tenant ids are normalized and validated, so they are safe in keys and paths.
- Resolvers find the tenant. Sessions and tokens are trusted, host names verified, headers and paths untrusted, because the client writes them.
- A resolver chain asks by priority. Require `verified` trust, and refuse tenants that are not active without saying why. `createResolveTenantMiddleware` does all of it for a route, and answers an unknown and a suspended tenant with the same 404.
- The tenant context lives in AsyncLocalStorage: `run` sets it, `requireCurrentTenant` reads it, and code outside a tenant fails loudly.
- Every query filters on `tenant_id`, taken from the context and passed as a parameter. Another tenant's row is a 404.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
