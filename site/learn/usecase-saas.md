---
title: "Use case: a multi-tenant SaaS — ZudoJS Academy"
description: "Build InvoiceHub, where many businesses share one app and one database, and prove with tests that one organization can never read another's data."
source: https://zudojs.oyinlola.site/learn/usecase-saas
---

LEVEL 19 · LESSON 4 OF 10

Real-world use cases Production

# Use case: a multi-tenant SaaS

Build InvoiceHub, where many businesses share one app and one database, and prove with tests that one organization can never read another's data.

- **60 min** to read and try
- **You need:** The ZudoJS lessons on tenancy, permissions, authentication, feature flags, caching and databases, plus the REST API use case
- **You build:** InvoiceHub, a multi-tenant invoicing API on PostgreSQL with organizations, memberships and per-organization roles, row-level security, tenant-scoped caching, a beta feature for 10% of organizations and a Vitest isolation suite

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Turn a SaaS brief into a data model of organizations, users, memberships, roles and resources
- Decide what the tenant of a request can be taken from, and what can never be trusted
- Enforce isolation twice: in every query and in the database with row-level security
- Give each user a different role in each organization and check it on every request
- Scope cache keys and feature-flag rollouts to the organization
- Prove isolation with a test suite that attacks every route from another tenant

## The brief: one app, many businesses

**InvoiceHub** is a start-up in Lagos. Small businesses sign up, add their customers and send invoices in naira. Two of the first organizations are **Ada's Bakery** and **Kola Motors**. The founders send you this brief:

Every business is an *organization*. People join an organization as an *owner*, an *accountant* or a *viewer*. One person can belong to several organizations: Ada owns the bakery and is also an investor who may look at Kola Motors' invoices. An organization's customers and invoices are its own, and nobody outside it may ever see them, not even their count. A suspended organization is locked out at once. We want to try "bulk reminders" with about 10% of organizations before everyone gets it. The dashboard must be fast.

The one sentence that matters most is "nobody outside it may ever see them". An application where many customers share one copy of the code and one database is **multi-tenant**, each customer is a **tenant**, and keeping their data apart is **tenant isolation**. A bug in a normal app shows the wrong data to the right customer. A tenant-isolation bug shows one business's invoices to a competitor. This lesson builds InvoiceHub so that such a bug needs two independent mistakes, and then proves the result with tests that attack every route.

You have met every tool before, so this lesson links back instead of re-teaching: [tenancy](https://zudojs.oyinlola.site/learn/zudo-tenancy) (resolvers, trust levels, the tenant context), [permissions](https://zudojs.oyinlola.site/learn/zudo-permissions), [authentication](https://zudojs.oyinlola.site/learn/zudo-auth), [feature flags](https://zudojs.oyinlola.site/learn/zudo-feature-flags), [caching](https://zudojs.oyinlola.site/learn/zudo-cache) and [HTTP](https://zudojs.oyinlola.site/learn/zudo-http). The HTTP and error style follows [the REST API use case](https://zudojs.oyinlola.site/learn/usecase-rest-api); this one focuses on the *walls between customers*. Everything runs in one Node.js process: PGlite as the real PostgreSQL, a real HTTP server on a random port, and real requests with `fetch`. The examples need Node.js; run them with `npx tsx <file>.ts`.

```ts
organization (the tenant)      Ada's Bakery                 Kola Motors
   └─ memberships              ada: owner                   kola: owner
        (user + role)          bisi: accountant             ada: viewer
                               tunde: viewer
   └─ resources                customers, invoices          customers, invoices
        (every row has         INV-0001, INV-0002           INV-0001
         org_id)
```

The chain from the brief: organization → tenant → users → roles → resources. A role belongs to a membership, not to a user.

## Design the data model

REASON IT OUT

### Who owns each row?

Before any SQL, answer these from the brief. Which tables need an organization id? Where does a user's role live, given that Ada is an owner in one place and a viewer in another? Can an invoice number like `INV-0001` be unique across the whole app? What stops a Kola Motors invoice from pointing at a customer of the bakery? And which of these rules should the database enforce, rather than the code?

**Show the reasoning**

- **Organizations are the tenants.** The tenancy package calls them tenants; the product calls them organizations. One table, `organizations`, with a `status` (only `active` may work) and a `plan`.
- **Users are global.** Ada has one e-mail and one password, whatever she works on. So `users` has *no* organization id.
- **The role lives on the membership.** A `memberships` row is (user, organization, role), with the pair as its primary key. A role on the user ("Ada is an owner") would be wrong for Kola Motors, and a role in the login token has the same problem: owner *of what*?
- **Every business row carries `org_id`.** Customers and invoices both do, even though an invoice could find its organization through its customer. The column is what every query and every database policy filters on, so it must be right there on the row.
- **Uniqueness is per organization.** Both businesses want to start at `INV-0001`, so the constraint is `unique (org_id, number)`, not `unique (number)`.
- **References may not cross tenants.** A plain `customer_id references customers` lets Kola Motors bill the bakery's customer 1. A *composite* foreign key, `(org_id, customer_id) references customers (org_id, id)`, makes the database refuse it: the pair (kola-motors, 1) does not exist.

The last two are database rules on purpose. Code gets refactored; a constraint holds for every future version of it.

Here is the schema. Money is integer kobo, as in [the REST API use case](https://zudojs.oyinlola.site/learn/usecase-rest-api#data): ₦45,000 is `4500000`.

schema.ts

```ts
export const schema = `
create table organizations (
  id     text primary key,
  name   text not null,
  status text not null default 'active',
  plan   text not null default 'free'
);
create table users (
  id            text primary key,
  email         text not null unique,
  password_hash text not null
);
create table memberships (
  user_id text not null references users (id),
  org_id  text not null references organizations (id),
  role    text not null check (role in ('owner', 'accountant', 'viewer')),
  primary key (user_id, org_id)
);
create table customers (
  id     serial primary key,
  org_id text not null references organizations (id),
  name   text not null,
  unique (org_id, id)
);
create table invoices (
  id          serial primary key,
  org_id      text not null references organizations (id),
  number      text not null,
  customer_id integer not null,
  amount_kobo integer not null check (amount_kobo > 0),
  status      text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  created_by  text not null references users (id),
  unique (org_id, number),
  foreign key (org_id, customer_id) references customers (org_id, id)
);
`;
```

`unique (org_id, id)` on `customers` looks redundant, because `id` alone is already unique. PostgreSQL needs it anyway: a foreign key can only point at columns that are declared unique together, and that pair is what the invoice's composite key points at.

## Two walls: the query and the database

The usual way to share tables between tenants is to add `where org_id = $1` to every query, as [the tenancy lesson](https://zudojs.oyinlola.site/learn/zudo-tenancy#isolation) did. That works, until someone writes a new report query at 6 p.m. on a Friday and forgets the filter.

REASON IT OUT

### What if someone forgets the WHERE?

Imagine a new endpoint that runs `select * from invoices` with no filter. What does the client receive? Could the database itself refuse to return other organizations' rows, even to buggy code? What would the database need to know, and when would it need to know it? And what should happen when the code forgets to tell it the organization at all?

**Show the reasoning**

Without help, the client receives every business's invoices. PostgreSQL has a feature for exactly this: **row-level security** (RLS). A **policy** on a table is a condition that PostgreSQL adds to every query on that table, for every role it applies to. The database needs the current organization, so the app tells it at the start of each transaction, in a setting that lives only as long as that transaction. If the app forgets to set it, the setting is empty, the condition matches nothing, and the query returns no rows: the forgotten case fails *closed*. One catch: the owner of the tables (and any superuser) is not bound by policies, so the app must run its tenant queries as a separate, ordinary database role.

That gives two walls. The first is the `org_id` filter in every query. The second is the database policy, which holds even when the first has a hole. `inTenant` is the only way the app runs tenant queries: it switches to the ordinary role `app_user` and sets `app.org_id`, both with `local` scope, so they end with the transaction:

rls.ts

```ts
import type { PGlite, Transaction } from "@electric-sql/pglite";

export const rowLevelSecurity = `
create role app_user nologin;
grant select, insert, update on customers, invoices to app_user;
grant usage on all sequences in schema public to app_user;
alter table customers enable row level security;
alter table invoices enable row level security;
create policy same_org on customers using (org_id = current_setting('app.org_id', true));
create policy same_org on invoices using (org_id = current_setting('app.org_id', true));
`;

/** Runs `work` in a transaction that can only see and write rows of `orgId`. */
export async function inTenant<T>(db: PGlite, orgId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("set local role app_user");
    await tx.query("select set_config('app.org_id', $1, true)", [orgId]);
    return work(tx);
  });
}
```

`set_config(…, true)` is the parameterised form of `set local`: the organization id travels as a `$1` parameter, never glued into SQL text. `current_setting('app.org_id', true)` returns an empty value instead of an error when the setting is missing, so the policy compares with nothing and matches no row. The policy is written once, for all commands: for `insert` and `update` PostgreSQL uses the same condition as a check on the new row.

The database file creates the tables, turns on the policies and adds the seed data from the brief. Every user's demo password is the same long passphrase:

db.ts

```ts
import { PGlite } from "@electric-sql/pglite";
import { hashPassword } from "@zudojs/auth";
import { rowLevelSecurity } from "./rls.js";
import { schema } from "./schema.js";

export async function createDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(schema);
  await db.exec(rowLevelSecurity);
  const password = await hashPassword("correct horse battery staple");
  await db.query(
    `insert into users (id, email, password_hash) values
       ('ada', 'ada@adasbakery.ng', $1), ('bisi', 'bisi@adasbakery.ng', $1),
       ('tunde', 'tunde@adasbakery.ng', $1), ('kola', 'kola@kolamotors.ng', $1)`,
    [password],
  );
  await db.exec(`
    insert into organizations (id, name, status, plan) values
      ('adas-bakery', 'Ada''s Bakery', 'active', 'pro'),
      ('kola-motors', 'Kola Motors', 'active', 'free'),
      ('chidi-pharmacy', 'Chidi Pharmacy', 'suspended', 'free');
    insert into memberships (user_id, org_id, role) values
      ('ada', 'adas-bakery', 'owner'), ('bisi', 'adas-bakery', 'accountant'),
      ('tunde', 'adas-bakery', 'viewer'), ('kola', 'kola-motors', 'owner'),
      ('ada', 'kola-motors', 'viewer');
    insert into customers (org_id, name) values
      ('adas-bakery', 'Mama Put Canteen'), ('adas-bakery', 'Grace Hotel'),
      ('kola-motors', 'Lagos Taxi Co');
    insert into invoices (org_id, number, customer_id, amount_kobo, status, created_by) values
      ('adas-bakery', 'INV-0001', 1, 4500000, 'sent', 'bisi'),
      ('adas-bakery', 'INV-0002', 2, 1200000, 'draft', 'bisi'),
      ('kola-motors', 'INV-0001', 3, 125000000, 'sent', 'kola');
  `);
  return db;
}
```

Now the forgotten `WHERE`, run three ways: as the table owner, inside Kola Motors, and with no organization set. The last lines try to write a row into the bakery from inside Kola Motors:

rls-demo.tsNode.js only

```ts
import { createDatabase } from "./db.js";
import { inTenant } from "./rls.js";

const db = await createDatabase();
const forgotten = "select number, org_id from invoices order by id";
console.log("as the owner of the database:", (await db.query(forgotten)).rows.length, "rows");
const rows = await inTenant(db, "kola-motors", async (tx) => (await tx.query(forgotten)).rows);
console.log("inside kola-motors:", rows);
const none = await inTenant(db, "", async (tx) => (await tx.query(forgotten)).rows);
console.log("no tenant set:", none);
try {
  await inTenant(db, "kola-motors", (tx) =>
    tx.query("insert into invoices (org_id, number, customer_id, amount_kobo, created_by) values ('adas-bakery', 'X-1', 1, 100, 'kola')"));
} catch (error) {
  console.log("write into another org:", (error as Error).message);
}
await db.close();
```

Output of `npx tsx rls-demo.ts`

```ts
as the owner of the database: 3 rows
inside kola-motors: [ { number: 'INV-0001', org_id: 'kola-motors' } ]
no tenant set: []
write into another org: new row violates row-level security policy for table "invoices"
```

The same query text returned 3 rows, 1 row and 0 rows. Inside Kola Motors the database quietly added the organization condition; with no organization it matched nothing, and the cross-tenant insert was refused with an error. That second wall costs one transaction per request and a few lines of SQL. The seed insert ran as the owner, which is why it could write rows for every organization: migrations and seeds are the only code that should ever run as the owner.

> NOTE
>
> PGlite runs a single connection, so every transaction waits its turn. On a real server with a connection pool, `set local` inside a transaction is still correct, because it cannot leak into the next request that borrows the same connection. A plain `set` outside a transaction could.

## Which organization is this request for?

[The tenancy lesson](https://zudojs.oyinlola.site/learn/zudo-tenancy#resolvers) listed where a tenant can come from and how far each source can be trusted. InvoiceHub adds a twist: one user, several organizations.

REASON IT OUT

### What can the request be trusted with?

Ada logs in. She wants to work in Kola Motors. List the places the organization could come from (a header, the URL, the request body, the login token, something stored on the server) and say for each one who wrote it. Then decide: when is the membership checked, once at login or on every request? What if Ada is removed from Kola Motors while her token is still valid? And what should a user who is not a member see, compared with a user who asks for an organization that does not exist?

**Show the reasoning**

- A header (`x-tenant-id`), a path (`/orgs/kola-motors/…`) or the body are written by the client. They may say which organization the user *wants*, never which one they may *have*.
- The token is signed by the server, so its claims are trusted. The `login()` of [@zudojs/auth](https://zudojs.oyinlola.site/learn/zudo-auth#login) puts the user id, a session id (`sid`) and the user's global roles in it, but no organization. That is fine: InvoiceHub keeps the chosen organization **on the server**, next to the session. At login the user names an organization, the server checks the membership, and stores `session → organization`. From then on the organization comes from that server-side record, which is `trusted`.
- The membership is checked at login **and on every request**, and the role is read from the database each time. Tokens live for 15 minutes; a removed accountant must lose access at once, not in 15 minutes.
- "Not a member" and "no such organization" give the same answer. Otherwise the login form becomes a way to find out which organizations use InvoiceHub.

Organizations are the tenants, so the tenant repository reads them from the `organizations` table. The tenant context is the AsyncLocalStorage from [the tenancy lesson](https://zudojs.oyinlola.site/learn/zudo-tenancy#context): `currentOrg()` works anywhere inside a request and throws outside one.

tenants.ts

```ts
import type { PGlite } from "@electric-sql/pglite";
import { createContextManager, createTenantContextStorage, tryCreateTenantId } from "@zudojs/tenancy";
import type { Tenant, TenantRepository, TenantStatus } from "@zudojs/tenancy";

export const tenantStorage = createTenantContextStorage();
export const tenantContext = createContextManager({ storage: tenantStorage });

/** The organization of the current request. Throws outside a tenant context. */
export function currentOrg(): Tenant {
  return tenantContext.requireCurrentTenant();
}

interface OrgRow { id: string; name: string; status: TenantStatus; plan: string }

/** Organizations are the tenants: this repository reads them from the database. */
export function createOrgRepository(db: PGlite): TenantRepository {
  return {
    async findById(id) {
      const { rows } = await db.query<OrgRow>("select id, name, status, plan from organizations where id = $1", [id]);
      const row = rows[0];
      const tenantId = tryCreateTenantId(row?.id);
      if (!row || !tenantId) return undefined;
      return { id: tenantId, name: row.name, status: row.status, metadata: { plan: row.plan } };
    },
  };
}
```

Authentication is the auth service from [the auth lesson](https://zudojs.oyinlola.site/learn/zudo-auth#login), with users loaded from PostgreSQL. Users get no global roles (`roles: []`): in InvoiceHub every role belongs to a membership. The JWT secrets come from the environment, and a small demo file invents them for these examples:

demo-env.ts

```ts
/* DEMO ONLY: invents JWT secrets for this run. Real secrets come from the environment. */
import { randomBytes } from "node:crypto";

process.env.JWT_ACCESS_SECRET ??= randomBytes(32).toString("base64url");
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString("base64url");
```

auth.ts

```ts
import type { PGlite } from "@electric-sql/pglite";
import { createAuthService, createMemorySessionStore, toUserId, verifyPassword } from "@zudojs/auth";
import type { AuthService, AuthUser } from "@zudojs/auth";

interface UserRow { id: string; email: string; password_hash: string }

function toAuthUser(row: UserRow): AuthUser {
  return { id: toUserId(row.id), email: row.email, roles: [], active: true, createdAt: new Date(0) };
}

export function createAuth(db: PGlite): AuthService {
  const byEmail = async (email: string) =>
    (await db.query<UserRow>("select * from users where email = $1", [email])).rows[0];
  const byId = async (id: string) =>
    (await db.query<UserRow>("select * from users where id = $1", [id])).rows[0];
  return createAuthService({
    token: {
      accessSecret: process.env.JWT_ACCESS_SECRET ?? "",
      refreshSecret: process.env.JWT_REFRESH_SECRET ?? "",
      accessTtl: 15 * 60,
      issuer: "invoicehub",
      audience: "invoicehub",
    },
    sessionStore: createMemorySessionStore(),
    sessionTtlSeconds: 30 * 60,
    findUser: async (email) => {
      const row = await byEmail(email);
      return row ? toAuthUser(row) : null;
    },
    findUserById: async (id) => {
      const row = await byId(id);
      return row ? toAuthUser(row) : null;
    },
    verifyPassword: async (id, password) => {
      const row = await byId(id);
      return row ? verifyPassword(password, row.password_hash) : false;
    },
  });
}
```

## Roles per organization

The permission engine from [the permissions lesson](https://zudojs.oyinlola.site/learn/zudo-permissions) knows three roles. An accountant can do everything a viewer can, and create and send invoices. An owner can do everything, including managing members. Nothing here is about *which* organization: the role comes from the membership of the current one.

The engine also gets a second wall of its own: a global **deny rule** that refuses every permission when the resource belongs to a different organization than the request. It uses `tenantIsolation`, which compares `metadata.orgId` (filled by the server from the tenant context) with the resource's `orgId`, and which says "no match" when either side is missing. Wrapped in `not(…)`, a missing organization therefore *denies*. Every check in InvoiceHub passes a resource, even for "list" and "create": then it is `{ orgId: currentOrg().id }`, the organization's collection.

permissions.ts

```ts
import { createPermissionActor, createPermissionEngine, not, tenantIsolation } from "@zudojs/permissions";
import type { PermissionActor } from "@zudojs/permissions";

export type OrgRole = "owner" | "accountant" | "viewer";

export const engine = createPermissionEngine({
  roles: [
    { name: "viewer", permissions: ["invoice:read", "customer:read"] },
    { name: "accountant", permissions: ["invoice:create", "invoice:send", "customer:create"], inherits: ["viewer"] },
    { name: "owner", permissions: ["invoice:*", "customer:*", "member:*"], inherits: ["accountant"] },
  ],
  rules: [{
    name: "same-org-only",
    effect: "deny",
    resource: "*",
    action: "*",
    condition: not(tenantIsolation("orgId", "orgId")),
  }],
});

/** The actor for one request: the user, with the role they have in THIS organization. */
export function actorFor(userId: string, role: OrgRole): PermissionActor {
  return createPermissionActor(userId, { roles: [role] });
}
```

perm-demo.tsNode.js only

```ts
import { actorFor, engine } from "./permissions.js";

const bisi = actorFor("bisi", "accountant");
const inBakery = { metadata: { orgId: "adas-bakery" } };
const draft = { orgId: "adas-bakery", number: "INV-1002" };
const kolasInvoice = { orgId: "kola-motors", number: "INV-2001" };

console.log("read own org's invoice:  ", await engine.can(bisi, "invoice:read", draft, inBakery));
console.log("read Kola Motors invoice:", await engine.check(bisi, "invoice:read", kolasInvoice, inBakery));
console.log("no resource given:       ", await engine.can(bisi, "invoice:create", undefined, inBakery));
console.log("no org in metadata:      ", await engine.can(bisi, "invoice:read", draft));
console.log("viewer creates:          ", await engine.can(actorFor("tunde", "viewer"), "invoice:create", { orgId: "adas-bakery" }, inBakery));
console.log("owner, other org:        ", await engine.can(actorFor("ada", "owner"), "invoice:read", kolasInvoice, inBakery));
```

Output of `npx tsx perm-demo.ts`

```ts
read own org's invoice:   true
read Kola Motors invoice: {
  allowed: false,
  reason: 'rule_deny',
  publicReason: 'Access denied',
  matchedPermission: 'invoice:read',
  policy: 'same-org-only'
}
no resource given:        false
no org in metadata:       false
viewer creates:           false
owner, other org:         false
```

Bisi can read her own organization's invoice. Kola Motors' invoice is refused by the named rule `same-org-only`, although `invoice:read` is one of her permissions: deny rules beat grants. The two checks with missing data (no resource, no organization in the metadata) are refused too, and so is Ada, an owner, when the resource is from another organization. Being an owner somewhere is not being an owner everywhere.

> THE ACTOR IS BUILT FROM YOUR DATABASE
>
> The role in `actorFor(userId, role)` comes from the `memberships` row of the current organization, read by the server on each request. Never from the token's `roles` claim (it has no organization), and never from the request (see [escalation 3](https://zudojs.oyinlola.site/learn/zudo-permissions#body)).

## Tenant-scoped repositories

The invoice repository has no `orgId` parameter anywhere. Each method reads the organization from the tenant context, filters on it in SQL (wall one), and runs inside `inTenant` (wall two). A caller cannot pass the wrong organization, because there is nothing to pass:

invoices.ts

```ts
import type { PGlite } from "@electric-sql/pglite";
import { inTenant } from "./rls.js";
import { currentOrg } from "./tenants.js";

export interface Invoice {
  readonly id: number;
  readonly orgId: string;
  readonly number: string;
  readonly customerId: number;
  readonly amountKobo: number;
  readonly status: "draft" | "sent" | "paid";
}

const columns = `id, org_id as "orgId", number, customer_id as "customerId", amount_kobo as "amountKobo", status`;

/** Every method reads the organization from the tenant context: callers cannot pass one. */
export class InvoiceRepository {
  constructor(private readonly db: PGlite) {}

  list(): Promise<Invoice[]> {
    const orgId = currentOrg().id;
    return inTenant(this.db, orgId, async (tx) =>
      (await tx.query<Invoice>(`select ${columns} from invoices where org_id = $1 order by id`, [orgId])).rows);
  }

  get(id: number): Promise<Invoice | undefined> {
    const orgId = currentOrg().id;
    return inTenant(this.db, orgId, async (tx) =>
      (await tx.query<Invoice>(`select ${columns} from invoices where id = $1 and org_id = $2`, [id, orgId])).rows[0]);
  }

  create(input: { customerId: number; amountKobo: number; createdBy: string }): Promise<Invoice> {
    const orgId = currentOrg().id;
    return inTenant(this.db, orgId, async (tx) => {
      const { rows } = await tx.query<Invoice>(
        `insert into invoices (org_id, number, customer_id, amount_kobo, created_by)
         values ($1, 'INV-' || lpad((select count(*) + 1 from invoices where org_id = $1)::text, 4, '0'), $2, $3, $4)
         returning ${columns}`,
        [orgId, input.customerId, input.amountKobo, input.createdBy]);
      return rows[0]!;
    });
  }

  markSent(id: number): Promise<Invoice | undefined> {
    const orgId = currentOrg().id;
    return inTenant(this.db, orgId, async (tx) =>
      (await tx.query<Invoice>(
        `update invoices set status = 'sent' where id = $1 and org_id = $2 and status = 'draft' returning ${columns}`,
        [id, orgId])).rows[0]);
  }

  totals(): Promise<{ invoices: number; outstandingKobo: number }> {
    const orgId = currentOrg().id;
    return inTenant(this.db, orgId, async (tx) =>
      (await tx.query<{ invoices: number; outstandingKobo: number }>(
        `select count(*)::int as invoices,
                coalesce(sum(amount_kobo) filter (where status = 'sent'), 0)::int as "outstandingKobo"
         from invoices where org_id = $1`, [orgId])).rows[0]!);
  }
}
```

The next invoice number is counted per organization, so both businesses get their own `INV-0001`, `INV-0002`… (Two invoices created at the same moment could compute the same number; `unique (org_id, number)` then refuses the second one, and a retry fixes it. A per-organization counter row, locked with `select … for update`, avoids the retry.) Try the repository directly, in and out of a tenant context:

context-demo.tsNode.js only

```ts
import { createTenantId } from "@zudojs/tenancy";
import { createDatabase } from "./db.js";
import { InvoiceRepository } from "./invoices.js";
import { createOrgRepository, tenantContext } from "./tenants.js";

const db = await createDatabase();
const invoices = new InvoiceRepository(db);
const orgs = createOrgRepository(db);
const [bakery, kola, chidi] = await Promise.all(
  ["adas-bakery", "kola-motors", "chidi-pharmacy"].map((id) => orgs.findById(createTenantId(id))));
if (!bakery || !kola || !chidi) throw new Error("seed data missing");

const numbers = async () => (await invoices.list()).map((invoice) => `${invoice.orgId}/${invoice.number}`);
console.log("bakery:", await tenantContext.run(bakery, numbers));
console.log("kola:  ", await tenantContext.run(kola, numbers));
console.log("kola asks for invoice 1:", await tenantContext.run(kola, () => invoices.get(1)));

for (const attempt of [() => invoices.list(), () => tenantContext.run(chidi, numbers)]) {
  try {
    await attempt();
  } catch (error) {
    console.log("refused:", (error as Error).name);
  }
}
await db.close();
```

Output of `npx tsx context-demo.ts`

```ts
bakery: [ 'adas-bakery/INV-0001', 'adas-bakery/INV-0002' ]
kola:   [ 'kola-motors/INV-0001' ]
kola asks for invoice 1: undefined
refused: TenantContextMissingError
refused: TenantUnavailableError
```

Each organization sees its own `INV-0001`. Kola Motors asking for the bakery's invoice id 1 gets `undefined`, which the API will turn into a 404, the same answer as for an id that does not exist. Outside a tenant context the repository refuses to run at all, and the suspended Chidi Pharmacy cannot even enter one: `tenantContext.run` checks the status.

## A cache that knows the tenant

The dashboard shows how many invoices an organization has and how much money is outstanding. It is read on every page load, so it goes in the cache from [the caching lesson](https://zudojs.oyinlola.site/learn/zudo-cache). The classic multi-tenant caching bug is a key that forgets the tenant:

cache-leak.tsNode.js only

```ts
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";

const cache = createCacheService({ adapter: createMemoryCacheAdapter() });
const totalsInDb: Record<string, { invoices: number; outstandingKobo: number }> = {
  "adas-bakery": { invoices: 2, outstandingKobo: 4_500_000 },
  "kola-motors": { invoices: 1, outstandingKobo: 125_000_000 },
};

async function buggyTotals(orgId: string) {
  return (await cache.getOrSet("dashboard.totals", async () => totalsInDb[orgId])).value;
}
async function scopedTotals(orgId: string) {
  return (await cache.getOrSet("dashboard.totals", async () => totalsInDb[orgId], { namespace: orgId })).value;
}

console.log("BUG  bakery:", await buggyTotals("adas-bakery"));
console.log("BUG  kola:  ", await buggyTotals("kola-motors"));
console.log("OK   bakery:", await scopedTotals("adas-bakery"));
console.log("OK   kola:  ", await scopedTotals("kola-motors"));
```

Output of `npx tsx cache-leak.ts`

```ts
BUG  bakery: { invoices: 2, outstandingKobo: 4500000 }
BUG  kola:   { invoices: 2, outstandingKobo: 4500000 }
OK   bakery: { invoices: 2, outstandingKobo: 4500000 }
OK   kola:   { invoices: 1, outstandingKobo: 125000000 }
```

With the key `dashboard.totals` alone, whichever organization loads the dashboard first decides what everybody sees: Kola Motors was shown the bakery's numbers. Nothing failed, no error was logged, and in production it only shows up when a customer phones in. With `namespace: orgId` each organization has its own entry.

InvoiceHub's dashboard takes the namespace from the tenant context, so a route cannot forget it, and tags every entry with `invoices`. Every write to invoices calls `invoicesChanged()` in the same tenant context, which clears exactly that organization's tagged entries. The response includes `orgId` and `cached`, which the tests will use:

dashboard.ts

```ts
import { createCacheService, createMemoryCacheAdapter, JsonCacheSerializer } from "@zudojs/cache";
import type { InvoiceRepository } from "./invoices.js";
import { currentOrg } from "./tenants.js";

export const cache = createCacheService({
  adapter: createMemoryCacheAdapter({ maxEntries: 10_000 }),
  config: { defaultTtl: 60_000, serializer: new JsonCacheSerializer() },
});

/** Totals for the dashboard, cached per organization for a minute. */
export async function dashboardTotals(invoices: InvoiceRepository) {
  const orgId = currentOrg().id;
  const result = await cache.getOrSet("dashboard.totals", () => invoices.totals(), {
    namespace: orgId,
    tags: ["invoices"],
  });
  return { orgId, ...result.value, cached: result.cached };
}

/** Call after every write to invoices, inside the same tenant context. */
export async function invoicesChanged(): Promise<void> {
  await cache.invalidateByTag(["invoices"], { namespace: currentOrg().id });
}
```

> NOTE
>
> @zudojs/tenancy also has `tenantKey(tenantId, key)`, which builds `tenant:kola-motors:dashboard.totals`. That string contains colons, and @zudojs/cache refuses a key with a colon in it ([keys](https://zudojs.oyinlola.site/learn/zudo-cache#keys)), so with this cache use the namespace instead. A tenant id is always a valid namespace: both allow only letters, digits, `-` and `_`.

## A beta for 10% of organizations

"Bulk reminders" sends a payment reminder to every customer with an unpaid invoice. The founders want it for about 10% of organizations first. A [percentage rollout](https://zudojs.oyinlola.site/learn/zudo-feature-flags#rollout) does that, but the brief says *organizations*, and that detail decides how you call the flag.

flags.ts

```ts
import { createFeatureFlags, createMemoryProvider } from "@zudojs/feature-flags";
import type { Tenant } from "@zudojs/tenancy";

export const flags = createFeatureFlags({
  provider: createMemoryProvider([
    {
      key: "bulk-reminders",
      description: "Beta: remind every customer with an overdue invoice at once.",
      enabled: true,
      defaultValue: false,
      visibility: "client",
      rules: [{ type: "percentage", percentage: 10, value: true }],
      metadata: { owner: "billing-team", expiresAt: new Date("2027-03-01") },
    },
  ]),
});

/** Flags for an organization: the tenant, never the user, is the unit of the rollout. */
export function orgFlagContext(org: Tenant) {
  return { tenantId: org.id, attributes: { plan: org.metadata.plan } };
}
```

flags-demo.tsNode.js only

```ts
import { flags } from "./flags.js";

let inBeta = 0;
for (let i = 0; i < 1000; i++) {
  if (await flags.isEnabled("bulk-reminders", { tenantId: `org-${i}` })) inBeta += 1;
}
console.log(`${inBeta} of 1000 organizations are in the beta`);

for (const tenantId of ["adas-bakery", "kola-motors"]) {
  const result = await flags.evaluate("bulk-reminders", { tenantId });
  console.log(tenantId, result.value, result.reason);
}

console.log("with the user in the context:");
for (const userId of ["ada", "bisi", "tunde"]) {
  console.log(" ", userId, await flags.isEnabled("bulk-reminders", { userId, tenantId: "adas-bakery" }));
}

let split = 0;
for (let i = 0; i < 1000; i++) {
  const answers = new Set<boolean>();
  for (let u = 0; u < 5; u++) {
    answers.add(await flags.isEnabled("bulk-reminders", { userId: `org-${i}-user-${u}`, tenantId: `org-${i}` }));
  }
  if (answers.size > 1) split += 1;
}
console.log(`organizations whose 5 users disagree: ${split} of 1000`);
```

Output of `npx tsx flags-demo.ts`

```ts
104 of 1000 organizations are in the beta
adas-bakery true percentage_rollout
kola-motors false default
with the user in the context:
  ada false
  bisi false
  tunde false
organizations whose 5 users disagree: 445 of 1000
```

With only the organization in the context, about 10% of organizations are in, and the bakery is one of them. But look at what happens when the same code also passes the user: the percentage rule buckets by `userId` first, then `tenantId`, so the organization is ignored. All three bakery users are now outside the beta their organization is in, and across 1,000 organizations almost half had users who disagreed. In a real SaaS that is a support nightmare: the owner sees "Bulk reminders", the accountant does not, and nobody can explain why.

The fix is in `orgFlagContext`: for a feature that belongs to the organization, the context holds the organization and never the user. (Keep the user in the context for features that really are per person, such as a new editor layout.) Two more rules from [the flags lesson](https://zudojs.oyinlola.site/learn/zudo-feature-flags) still apply: the flag is off by default, so a lost flag store means "off", and a flag is not a permission. The bulk-reminder route checks both.

## The API

Now the pieces go behind HTTP. Every organization route runs three middleware, in this order, before its handler:

1. **`requireUser`** verifies the bearer token with the auth service (which also checks that its session is still alive). No valid token: `401`.
2. **`resolveOrg`** is `createResolveTenantMiddleware`. Its `getClaims` builds the claims from the verified token and the server-side `session → organization` map; the JWT resolver reads `tenant_id` from them, with `trusted` trust. It loads the organization, refuses one that is unknown or not active, and runs the rest of the request inside the tenant context.
3. **`loadMembership`** reads the user's role in that organization from the database and builds the permission actor. No membership (any more): the same 404 as an unknown organization.

Each handler then loads what it needs through the tenant-scoped repository (a missing row is a 404) and asks the engine (a refusal is a 403 with the public reason only).

app.ts

```ts
import { AuthError, parseBearerToken } from "@zudojs/auth";
import type { TokenPayload } from "@zudojs/auth";
import {
  badRequest, createHttpServer, createNodeHttpAdapter, createResponseContext, createRouter,
  forbidden, notFound, unauthorized, unprocessableEntity,
} from "@zudojs/http";
import type { HttpMiddleware, HttpRouterContext } from "@zudojs/http";
import type { PermissionActor } from "@zudojs/permissions";
import { schema } from "@zudojs/schema";
import { createJwtResolver, createResolveTenantMiddleware } from "@zudojs/tenancy";
import { createAuth } from "./auth.js";
import { dashboardTotals, invoicesChanged } from "./dashboard.js";
import { createDatabase } from "./db.js";
import { flags, orgFlagContext } from "./flags.js";
import { InvoiceRepository } from "./invoices.js";
import { actorFor, engine } from "./permissions.js";
import type { OrgRole } from "./permissions.js";
import { createOrgRepository, currentOrg, tenantStorage } from "./tenants.js";

const LoginBody = schema.object({ email: schema.string().trim().max(254), password: schema.string().max(1024), org: schema.string().max(63) });
const NewInvoice = schema.object({ customerId: schema.number().int().min(1), amountKobo: schema.number().int().min(1).max(2_000_000_000) });

function readJson(ctx: HttpRouterContext): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(ctx.request.body as Uint8Array));
  } catch {
    throw badRequest("Body must be JSON");
  }
}

export async function startApp() {
  const db = await createDatabase();
  const auth = createAuth(db);
  const invoices = new InvoiceRepository(db);
  const activeOrg = new Map<string, string>();

  const requireUser: HttpMiddleware = async (ctx, next) => {
    const token = parseBearerToken(ctx.request.getHeader?.("authorization"));
    if (!token) throw unauthorized("Log in first");
    try {
      ctx.state.set("user", await auth.verifyToken(token));
    } catch (error) {
      if (error instanceof AuthError) throw unauthorized("Log in first");
      throw error;
    }
    return next();
  };
  const resolveOrg = createResolveTenantMiddleware({
    resolver: createJwtResolver(),
    repository: createOrgRepository(db),
    storage: tenantStorage,
    notFoundResponse: () => ({ error: "Organization not found", code: "NOT_FOUND" }),
    getClaims: (ctx) => {
      const user = ctx.state.get<TokenPayload>("user");
      const org = user?.sid ? activeOrg.get(user.sid) : undefined;
      return user && org ? { sub: user.sub, tenant_id: org } : undefined;
    },
  });
  const loadMembership: HttpMiddleware = async (ctx, next) => {
    const user = ctx.state.get<TokenPayload>("user");
    const { rows } = await db.query<{ role: OrgRole }>(
      "select role from memberships where user_id = $1 and org_id = $2", [user?.sub, currentOrg().id]);
    if (!user || !rows[0]) throw notFound("Organization not found");
    ctx.state.set("actor", actorFor(user.sub, rows[0].role));
    return next();
  };
  const middleware = [requireUser, resolveOrg, loadMembership];

  async function authorize(ctx: HttpRouterContext, permission: string, resource: object): Promise<void> {
    const actor = ctx.state.get("actor") as PermissionActor;
    const decision = await engine.check(actor, permission, resource, { metadata: { orgId: currentOrg().id } });
    if (!decision.allowed) throw forbidden(decision.publicReason);
  }
  const json = (body: unknown, status = 200) => createResponseContext().setStatus(status).json(body);
  const idParam = (ctx: HttpRouterContext) => {
    const id = Number(ctx.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw notFound("Invoice not found");
    return id;
  };

  const router = createRouter();
  router.post("/login", async (ctx) => {
    const body = LoginBody.parse(readJson(ctx));
    const { user, tokens, sessionId } = await auth.login({ identifier: body.email, password: body.password });
    const member = await db.query("select 1 from memberships where user_id = $1 and org_id = $2", [user.id, body.org]);
    if (member.rows.length === 0) {
      await auth.logout(sessionId);
      throw forbidden("You are not a member of that organization");
    }
    activeOrg.set(sessionId, body.org);
    return json({ accessToken: tokens.accessToken });
  });
  router.get("/invoices", async (ctx) => {
    await authorize(ctx, "invoice:read", { orgId: currentOrg().id });
    return json(await invoices.list());
  }, { middleware });
  router.get("/invoices/:id", async (ctx) => {
    const invoice = await invoices.get(idParam(ctx));
    if (!invoice) throw notFound("Invoice not found");
    await authorize(ctx, "invoice:read", invoice);
    return json(invoice);
  }, { middleware });
  router.post("/invoices", async (ctx) => {
    await authorize(ctx, "invoice:create", { orgId: currentOrg().id });
    const body = NewInvoice.parse(readJson(ctx));
    const user = ctx.state.get("user") as TokenPayload;
    try {
      const invoice = await invoices.create({ ...body, createdBy: user.sub });
      await invoicesChanged();
      return json(invoice, 201);
    } catch (error) {
      if ((error as { code?: string }).code === "23503") throw unprocessableEntity("Unknown customer");
      throw error;
    }
  }, { middleware });
  router.post("/invoices/:id/send", async (ctx) => {
    const invoice = await invoices.get(idParam(ctx));
    if (!invoice) throw notFound("Invoice not found");
    await authorize(ctx, "invoice:send", invoice);
    const sent = await invoices.markSent(invoice.id);
    await invoicesChanged();
    return json(sent ?? invoice);
  }, { middleware });
  router.get("/dashboard", async (ctx) => {
    await authorize(ctx, "invoice:read", { orgId: currentOrg().id });
    return json(await dashboardTotals(invoices));
  }, { middleware });
  router.post("/reminders/bulk", async (ctx) => {
    if (!(await flags.isEnabled("bulk-reminders", orgFlagContext(currentOrg())))) throw notFound("Not found");
    await authorize(ctx, "invoice:send", { orgId: currentOrg().id });
    const overdue = (await invoices.list()).filter((invoice) => invoice.status === "sent");
    return json({ reminded: overdue.map((invoice) => invoice.number) });
  }, { middleware });

  const server = createHttpServer({
    adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
    handler: async (request) => (await router.dispatch(request)).response,
  });
  await server.start();
  return {
    url: `http://127.0.0.1:${server.address?.port}`,
    db,
    async stop() {
      await server.stop();
      await db.close();
    },
  };
}
```

A few decisions worth reading twice. The login refuses a non-member with the same 403 whether the organization exists or not, and ends the session it just created. `notFoundResponse` makes "unknown", "suspended" and "not a member any more" all look like one `404 Organization not found`. A foreign-key violation (PostgreSQL code `23503`) becomes `422 Unknown customer`, the same answer for a customer that does not exist and one that belongs to someone else. And the bulk-reminder route answers `404` when the flag is off, because a feature that is not released should look like a feature that does not exist.

A small client for the demos and the tests logs in to one organization and returns a function that sends requests with that session's token:

client.ts

```ts
export interface Reply {
  readonly status: number;
  readonly body: unknown;
}
export type Call = (method: string, path: string, body?: object, headers?: Record<string, string>) => Promise<Reply>;

/** A tiny test client: logs in to one organization and sends requests with its token. */
export function clientFor(url: string) {
  return {
    async login(email: string, org: string): Promise<Call> {
      const res = await fetch(`${url}/login`, {
        method: "POST",
        body: JSON.stringify({ email, password: "correct horse battery staple", org }),
      });
      const { accessToken } = (await res.json()) as { accessToken?: string };
      if (!accessToken) throw new Error(`login of ${email} to ${org} failed with ${res.status}`);
      return async (method, path, body, headers = {}) => {
        const response = await fetch(url + path, {
          method,
          headers: { ...headers, authorization: `Bearer ${accessToken}` },
          body: body ? JSON.stringify(body) : undefined,
        });
        return { status: response.status, body: await response.json() };
      };
    },
  };
}
```

try-app.tsNode.js only

```ts
import "./demo-env.js";
import { startApp } from "./app.js";
import { clientFor } from "./client.js";

const app = await startApp();
const client = clientFor(app.url);
const bisi = await client.login("bisi@adasbakery.ng", "adas-bakery");
const kola = await client.login("kola@kolamotors.ng", "kola-motors");

const show = (who: string, r: { status: number; body: unknown }) => console.log(who.padEnd(28), r.status, JSON.stringify(r.body));
show("bisi GET /invoices", await bisi("GET", "/invoices"));
show("kola GET /invoices", await kola("GET", "/invoices"));
show("kola GET /invoices/1", await kola("GET", "/invoices/1"));
show("bisi POST /invoices", await bisi("POST", "/invoices", { customerId: 1, amountKobo: 250000 }));
show("kola POST, bakery customer", await kola("POST", "/invoices", { customerId: 1, amountKobo: 100 }));
show("bisi GET /dashboard", await bisi("GET", "/dashboard"));
show("bisi GET /dashboard again", await bisi("GET", "/dashboard"));
show("kola GET /dashboard", await kola("GET", "/dashboard"));
show("bisi POST /reminders/bulk", await bisi("POST", "/reminders/bulk"));
show("kola POST /reminders/bulk", await kola("POST", "/reminders/bulk"));
await app.stop();
```

Output of `npx tsx try-app.ts`

```ts
bisi GET /invoices           200 [{"id":1,"orgId":"adas-bakery","number":"INV-0001","customerId":1,"amountKobo":4500000,"status":"sent"},{"id":2,"orgId":"adas-bakery","number":"INV-0002","customerId":2,"amountKobo":1200000,"status":"draft"}]
kola GET /invoices           200 [{"id":3,"orgId":"kola-motors","number":"INV-0001","customerId":3,"amountKobo":125000000,"status":"sent"}]
kola GET /invoices/1         404 {"error":"Invoice not found","code":"NOT_FOUND"}
bisi POST /invoices          201 {"id":4,"orgId":"adas-bakery","number":"INV-0003","customerId":1,"amountKobo":250000,"status":"draft"}
kola POST, bakery customer   422 {"error":"Unknown customer","code":"UNPROCESSABLE_ENTITY"}
bisi GET /dashboard          200 {"orgId":"adas-bakery","invoices":3,"outstandingKobo":4500000,"cached":false}
bisi GET /dashboard again    200 {"orgId":"adas-bakery","invoices":3,"outstandingKobo":4500000,"cached":true}
kola GET /dashboard          200 {"orgId":"kola-motors","invoices":1,"outstandingKobo":125000000,"cached":false}
bisi POST /reminders/bulk    200 {"reminded":["INV-0001"]}
kola POST /reminders/bulk    404 {"error":"Not found","code":"NOT_FOUND"}
```

Read the story line by line. Bisi and Kola each list only their own invoices. Kola guessing id 1 gets the same 404 as a missing invoice. Bisi's new invoice becomes the bakery's `INV-0003`. Kola billing the bakery's customer 1 is stopped by the composite foreign key. The second dashboard call came from the cache, and Kola's first call did not get the bakery's cached numbers. Bulk reminders exist for the bakery, which is in the 10%, and look like a missing route to Kola Motors.

## Prove it: the isolation suite

A demo shows that the app works for the requests you thought of. A test suite has to *attack* it. The rule from the brief becomes a test that runs for every ordered pair of organizations (victim, attacker): a member of the attacker logs in to their own organization and tries every route with every id that belongs to the victim. The suite uses Vitest, and `vitest-run.ts` is the helper from [Testing ZudoJS applications](https://zudojs.oyinlola.site/learn/zudo-testing-apps#setup) that runs Vitest from code so its results can be shown here. On your computer, run `npx vitest run`.

vitest.config.ts

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["tests/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 60_000 } });
```

vitest-run.ts

```ts
import { startVitest } from "vitest/node";

/** Runs test files with Vitest and prints one line per test. */
export async function runTests(...files: string[]): Promise<void> {
  const vitest = await startVitest("test", files, { watch: false, reporters: [] });
  for (const file of vitest.state.getTestModules()) {
    for (const error of file.errors()) console.log(`× ${file.relativeModuleId}: ${error.message}`);
    for (const test of file.children.allTests()) {
      const { state, errors = [] } = test.result();
      console.log(`${state === "passed" ? "✓" : "×"} ${test.fullName}`);
      for (const error of errors) console.log(`    ${error.message}`);
    }
  }
  await vitest.close();
}
```

tests/isolation.test.ts

```ts
import "../demo-env.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApp } from "../app.js";
import { clientFor } from "../client.js";

const members = { "adas-bakery": "bisi@adasbakery.ng", "kola-motors": "kola@kolamotors.ng" } as const;
type Org = keyof typeof members;
const pairs: [victim: Org, attacker: Org][] = [["adas-bakery", "kola-motors"], ["kola-motors", "adas-bakery"]];

let app: Awaited<ReturnType<typeof startApp>>;
beforeAll(async () => { app = await startApp(); });
afterAll(() => app.stop());

async function idsOf(table: "invoices" | "customers", org: Org): Promise<number[]> {
  const { rows } = await app.db.query<{ id: number }>(`select id from ${table} where org_id = $1`, [org]);
  return rows.map((row) => row.id);
}
/** Every org id that appears anywhere in a response body. */
function orgsIn(body: unknown): string[] {
  return [...JSON.stringify(body).matchAll(/"orgId":"([^"]+)"/g)].map((match) => match[1]!);
}

describe.each(pairs)("tenant %s, attacked from %s", (victim, attacker) => {
  it("answers 404 for every one of the victim's invoice ids", async () => {
    const call = await clientFor(app.url).login(members[attacker], attacker);
    const ids = await idsOf("invoices", victim);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      for (const [method, path] of [["GET", `/invoices/${id}`], ["POST", `/invoices/${id}/send`]] as const) {
        const res = await call(method, path);
        expect(res.status, `${method} ${path}`).toBe(404);
        expect(orgsIn(res.body)).not.toContain(victim);
      }
    }
  });

  it("refuses to bill the victim's customers", async () => {
    const call = await clientFor(app.url).login(members[attacker], attacker);
    for (const customerId of await idsOf("customers", victim)) {
      expect((await call("POST", "/invoices", { customerId, amountKobo: 100 })).status).toBe(422);
    }
  });

  it("never lists or counts the victim's rows, even with an x-tenant-id header", async () => {
    const victimCall = await clientFor(app.url).login(members[victim], victim);
    await victimCall("GET", "/dashboard");
    const call = await clientFor(app.url).login(members[attacker], attacker);
    const own = (await idsOf("invoices", attacker)).length;
    for (const path of ["/invoices", "/dashboard"]) {
      const res = await call("GET", path, undefined, { "x-tenant-id": victim });
      expect(res.status).toBe(200);
      expect(orgsIn(res.body)).not.toContain(victim);
    }
    expect((await call("GET", "/dashboard")).body).toMatchObject({ orgId: attacker, invoices: own });
  });

  it("does not let a non-member log in to the victim", async () => {
    await expect(clientFor(app.url).login(members[attacker], victim)).rejects.toThrow("403");
  });
});
```

run-tests.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";
await runTests("tests/isolation.test.ts");
```

Output of `npx tsx run-tests.ts`

```ts
✓ tenant adas-bakery, attacked from kola-motors > answers 404 for every one of the victim's invoice ids
✓ tenant adas-bakery, attacked from kola-motors > refuses to bill the victim's customers
✓ tenant adas-bakery, attacked from kola-motors > never lists or counts the victim's rows, even with an x-tenant-id header
✓ tenant adas-bakery, attacked from kola-motors > does not let a non-member log in to the victim
✓ tenant kola-motors, attacked from adas-bakery > answers 404 for every one of the victim's invoice ids
✓ tenant kola-motors, attacked from adas-bakery > refuses to bill the victim's customers
✓ tenant kola-motors, attacked from adas-bakery > never lists or counts the victim's rows, even with an x-tenant-id header
✓ tenant kola-motors, attacked from adas-bakery > does not let a non-member log in to the victim
```

What makes this suite worth having:

- **The ids come from the database**, not from a list typed into the test. Add a seed invoice and it is attacked automatically.
- **It checks the bodies, not only the status codes.** `orgsIn` finds every `orgId` anywhere in a response. A 200 that leaks a single nested row fails.
- **It warms the victim's cache first**, then reads the attacker's dashboard. A cache keyed without the tenant fails this test, although it passes every test that runs one tenant at a time.
- **It sends the classic forged header**, `x-tenant-id`, which must change nothing.
- **`expect(ids.length).toBeGreaterThan(0)`** guards the guard: a loop over an empty list passes without testing anything.

A test you have never seen fail proves little, so break the code on purpose and run the suite again:

- Remove `and org_id = $2` from `get`: the suite stays green, because row-level security still hides the row. That is the point of the second wall.
- Also replace `inTenant(…)` in `get` with a plain `this.db.query`, which runs as the table owner: the 404 test fails with `expected 403 to be 404`. The permission engine's `same-org-only` rule caught the foreign invoice, a third wall, but a 403 tells the attacker that invoice 1 exists, and the test says so.
- Remove `namespace: orgId` from the dashboard: the header test fails on its `toMatchObject` line, because the attacker was served the victim's cached count.

## When things change under a session

Tenancy bugs often hide in the time *between* login and the next request: a role changes, a member leaves, an organization stops paying. Each of these must take effect on the very next request:

failures.tsNode.js only

```ts
import "./demo-env.js";
import { startApp } from "./app.js";
import { clientFor } from "./client.js";

const app = await startApp();
const client = clientFor(app.url);
const show = (label: string, r: { status: number; body: unknown }) => console.log(label.padEnd(34), r.status, JSON.stringify(r.body));

const adaAtKola = await client.login("ada@adasbakery.ng", "kola-motors");
const adaAtBakery = await client.login("ada@adasbakery.ng", "adas-bakery");
show("ada (viewer) bills at Kola Motors", await adaAtKola("POST", "/invoices", { customerId: 3, amountKobo: 100 }));
show("ada (owner) bills at the bakery", await adaAtBakery("POST", "/invoices", { customerId: 2, amountKobo: 100 }));

const tunde = await client.login("tunde@adasbakery.ng", "adas-bakery");
show("tunde (viewer) sends INV-0002", await tunde("POST", "/invoices/2/send"));
await app.db.query("update memberships set role = 'accountant' where user_id = 'tunde'");
show("tunde, promoted a second later", await tunde("POST", "/invoices/2/send"));

const bisi = await client.login("bisi@adasbakery.ng", "adas-bakery");
await app.db.query("delete from memberships where user_id = 'bisi'");
show("bisi, removed from the bakery", await bisi("GET", "/invoices"));

const kola = await client.login("kola@kolamotors.ng", "kola-motors");
await app.db.query("update organizations set status = 'suspended' where id = 'kola-motors'");
show("kola, organization suspended", await kola("GET", "/invoices"));
show("ada, same org, other session", await adaAtKola("GET", "/invoices"));
await app.stop();
```

Output of `npx tsx failures.ts`

```ts
ada (viewer) bills at Kola Motors  403 {"error":"Access denied","code":"FORBIDDEN"}
ada (owner) bills at the bakery    201 {"id":4,"orgId":"adas-bakery","number":"INV-0003","customerId":2,"amountKobo":100,"status":"draft"}
tunde (viewer) sends INV-0002      403 {"error":"Access denied","code":"FORBIDDEN"}
tunde, promoted a second later     200 {"id":2,"orgId":"adas-bakery","number":"INV-0002","customerId":2,"amountKobo":1200000,"status":"sent"}
bisi, removed from the bakery      404 {"error":"Organization not found","code":"NOT_FOUND"}
kola, organization suspended       404 {"error":"Organization not found","code":"NOT_FOUND"}
ada, same org, other session       404 {"error":"Organization not found","code":"NOT_FOUND"}
```

- Ada is an owner at the bakery and a viewer at Kola Motors. Same person, same password, two sessions, two different answers: the role belongs to the membership.
- Tunde was promoted in the database between two requests, and the second request already used the new role. If the role came from the token, he would wait up to 15 minutes; a *demotion* would also take 15 minutes, which is the dangerous direction.
- Bisi was removed from the bakery. Her token is still valid and her session is alive, but `loadMembership` finds no row: 404.
- Kola Motors was suspended. Both of its sessions, Kola's and Ada's, get the same 404 as a removed member or an unknown organization. Nobody learns *why* from the API; the owner learns it from an e-mail.

Other failure cases to design for, with the answer InvoiceHub gives:

| Failure | What happens |
| --- | --- |
| Code runs without a tenant (a script, a job, a new route without the middleware) | `currentOrg()` throws `TenantContextMissingError`; RLS with no `app.org_id` returns no rows. Loud, not leaky. |
| A client sends `x-tenant-id` or `?org=` | Ignored: the only resolver is the trusted server-side session. |
| An id from another organization in the URL or body | 404 for reads and updates, 422 for references, never 403 (403 would confirm the id exists). |
| The flag store is down | The beta is off for everyone (`defaultValue: false`); the rest of the app works. |
| The cache is down or wrong | The dashboard is slower or briefly stale. It can never show another organization's numbers, because the namespace comes from the tenant context. |

## Production concerns

- **Connection pools and RLS.** Keep `set local` inside a transaction, as `inTenant` does; with a pooler such as PgBouncer in transaction mode, a session-level `set` would leak into another tenant's request. Give the app's login role no `BYPASSRLS` and do not make it the owner of the tables. Run migrations with a separate owner role.
- **Background work carries the tenant.** A job runs outside any request, so it has no context. Put the organization id in the job data, and have the worker load the organization and call `tenantContext.run(org, …)` before touching data. [The next use case](https://zudojs.oyinlola.site/learn/usecase-background-jobs) carries a correlation id from the request into the worker with a queue context carrier; the organization travels the same way.
- **Noisy neighbours.** One big organization can slow everyone down. Rate-limit per organization as well as per user ([security](https://zudojs.oyinlola.site/learn/zudo-security)), give queues per-tenant fairness, and watch per-tenant metrics. Label metrics with the plan, not the organization id, unless you have few tenants: an id label creates one series per customer ([observability](https://zudojs.oyinlola.site/learn/zudo-observability)).
- **Staff access.** Support staff sometimes need to look inside an organization. Make that an explicit, audited path (`runSystem` or a support role with its own permission), never a hidden header, and log who looked at what.
- **Tenant lifecycle.** Signing up creates an organization and its first owner membership in one transaction. Closing an account needs an export of that organization's data and a deletion that removes every row with its `org_id`, including cached entries (`cache.clear({ namespace })`) and files.
- **Growing out of shared tables.** When one organization becomes very large, or a customer's contract demands it, move it to its own schema or database (the strategies table in [the tenancy lesson](https://zudojs.oyinlola.site/learn/zudo-tenancy#what)). Because every row already carries `org_id` and every query goes through tenant-scoped repositories, that move is a data migration, not a rewrite.
- **Keep the isolation suite in CI**, and add every new route to it on the day the route is written.

## Practice

TRY IT YOURSELF

### Customers, the same way

Write a `CustomerRepository` with a `list()` method that follows the invoice repository's rules: no organization parameter, the `org_id` filter, and `inTenant`. Print the customers of both organizations. Then say which line of `tests/isolation.test.ts` you would add for a new `GET /customers` route.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

`currentOrg().id` is the organization of the request in progress; never add a parameter for it, or a caller could pass someone else's.

HINT 2

`inTenant(this.db, orgId, async (tx) => (await tx.query(...)).rows)` runs the query under the row-level security policy for that organization, exactly like `ProductRepository.list` above.

SOLUTION

ex-customers.tsNode.js only

```ts
import type { PGlite } from "@electric-sql/pglite";
import { createTenantId } from "@zudojs/tenancy";
import { createDatabase } from "./db.js";
import { inTenant } from "./rls.js";
import { createOrgRepository, currentOrg, tenantContext } from "./tenants.js";

class CustomerRepository {
  constructor(private readonly db: PGlite) {}

  list(): Promise<{ id: number; orgId: string; name: string }[]> {
    const orgId = currentOrg().id;
    return inTenant(this.db, orgId, async (tx) =>
      (await tx.query<{ id: number; orgId: string; name: string }>(
        `select id, org_id as "orgId", name from customers where org_id = $1 order by id`, [orgId])).rows);
  }
}

const db = await createDatabase();
const customers = new CustomerRepository(db);
const orgs = createOrgRepository(db);
for (const id of ["adas-bakery", "kola-motors"]) {
  const org = await orgs.findById(createTenantId(id));
  if (org) console.log(id, await tenantContext.run(org, () => customers.list()));
}
await db.close();
```

Output of `npx tsx ex-customers.ts`

```ts
adas-bakery [
  { id: 1, orgId: 'adas-bakery', name: 'Mama Put Canteen' },
  { id: 2, orgId: 'adas-bakery', name: 'Grace Hotel' }
]
kola-motors [ { id: 3, orgId: 'kola-motors', name: 'Lagos Taxi Co' } ]
```

For the route, add `"/customers"` to the list of paths in the "never lists or counts" test. Because the rows carry `orgId`, `orgsIn` checks them with no other change. Add `customer:read` to the handler's `authorize` call: viewers already have it.

TRY IT YOURSELF

### Pilot organizations first

Kola Motors asked to join the bulk-reminders beta. Change the flag so that Kola Motors always has it, and about 10% of the other organizations too. Evaluate it for Kola Motors, the bakery and Chidi Pharmacy, and print the reason for each.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

A rule has a `type`, and `value` is what it resolves to on a match: `{ type: "tenant", tenants: ["kola-motors"], value: true }`.

HINT 2

Order matters: the named-tenant rule must come *before* the percentage rule, or the percentage rule could match first and give the wrong reason for Kola Motors specifically (though not the wrong value, here). `{ type: "percentage", percentage: 10, value: true }` is the second rule.

SOLUTION

ex-pilot.tsNode.js only

```ts
import { createFeatureFlags, createMemoryProvider } from "@zudojs/feature-flags";

const flags = createFeatureFlags({
  provider: createMemoryProvider([{
    key: "bulk-reminders",
    enabled: true,
    defaultValue: false,
    rules: [
      { type: "tenant", tenants: ["kola-motors"], value: true },
      { type: "percentage", percentage: 10, value: true },
    ],
  }]),
});

for (const tenantId of ["kola-motors", "adas-bakery", "chidi-pharmacy"]) {
  const result = await flags.evaluate("bulk-reminders", { tenantId });
  console.log(tenantId.padEnd(15), result.value, result.reason);
}
```

Output of `npx tsx ex-pilot.ts`

```ts
kola-motors     true target_match
adas-bakery     true percentage_rollout
chidi-pharmacy  false default
```

Rules run in order and the first match wins: the `tenant` rule names the pilot, the `percentage` rule handles everyone else. Both look only at `tenantId`, so every member of an organization gets the same answer.

TRY IT YOURSELF

### Review three pull requests

For each change, say whether it can leak data between organizations, and why. (a) A new route caches search results with `cache.getOrSet(\`search.${query}\`, …, { namespace: currentOrg().id })`. (b) A nightly "overdue invoices" job loops over all organizations and calls `db.query("select * from invoices where status = 'sent'")` directly, "because the job has no tenant context". (c) A "switch organization" endpoint takes `{ org }` from the body and stores it in `activeOrg` for the current session.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

For (a), where does the namespace's value actually come from — is it something the client sent, or something the server already trusts?

HINT 2

For (b), which role is running this query, and which of the two walls from earlier in the lesson is missing when nobody calls `inTenant`?

HINT 3

For (c), re-read "Which organization is this request for?": a value the client sends in a body is a *want*, never a *have*. What must happen before `{ org }` is trusted with anything?

SOLUTION

(a) Safe from leaks: the namespace comes from the tenant context. (The key is another problem: a search query can contain characters that are not allowed in a cache key, so hash it first.) (b) Leaks by design: running as the table owner bypasses row-level security, and the query has no filter, so every organization's invoices end up in one loop, one log line or one e-mail away from the wrong customer. Loop over the organizations, and for each one call `tenantContext.run(org, …)` and use the repository. (c) Leaks unless it checks the membership: it must look up `memberships` for (current user, `org`) and answer like the login does, the same 403 for "no such organization" and "not a member", before it changes `activeOrg`. The organization in the body is only what the user *wants*.

## Summary

- Model the brief as organizations (the tenants), global users, memberships that carry the role, and resources that each carry `org_id`. Uniqueness and foreign keys are per organization, enforced by the database.
- Build two walls: an `org_id` filter in every query, and a row-level security policy that the database applies even when a query forgets it. Run tenant queries as an ordinary role with `set local`, so a missing tenant returns nothing.
- Take the organization from something the server wrote: here, a server-side session record created after a membership check. Headers, paths and bodies only say what the client wants.
- Read the role from the membership on every request, and add a global deny rule for resources of another organization. Removals, demotions and suspensions then work on the next request.
- Put the tenant in every cache key through the namespace, and roll out organization features with a context that holds the organization and not the user.
- Answer "not yours" exactly like "does not exist", and prove isolation with a suite that attacks every route with every foreign id, checks the bodies and runs in CI.

Next, [Use case: background processing](https://zudojs.oyinlola.site/learn/usecase-background-jobs) moves slow work out of the request: an API that queues jobs, workers with retries and concurrency, scheduled runs, and what happens when a worker crashes halfway through a job.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
