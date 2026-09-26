---
title: "Capstone: a production SaaS — ZudoJS Academy"
description: "Build FeesDesk, a multi-school fees platform in naira: a tested payment slice that uses most of ZudoJS, then milestones and the graduation checklist."
source: https://zudojs.oyinlola.site/learn/capstone-saas
---

LEVEL 19 · LESSON 9 OF 10

Capstone Production

# Capstone: a production SaaS

Build FeesDesk, a multi-school fees platform in naira: a tested payment slice that uses most of ZudoJS, then milestones and the graduation checklist.

- **150 min** to read and try
- **You need:** The whole ZudoJS track, the real-world use cases, Capstone: ShopFlow and Deploying a ZudoJS app
- **You build:** FeesDesk's working core (schools as tenants, sessions, per-school permissions, card payments through a provider adapter with timeouts, retries and idempotency, a ledger in one transaction, receipts through a queue, storage and RPC, a daily reminder, health, metrics and traces, an acceptance suite) plus the milestones that finish it

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Turn a product brief into a vertical slice and a list of milestones with acceptance criteria
- Combine ZudoJS packages at one composition root and start and stop them in dependency order
- Take money safely: validate, authorize, reserve, charge outside the transaction, settle inside it, and survive timeouts and double clicks
- Keep every school's data apart in queries, permissions, caches, jobs and files
- Prove the product's promises with an acceptance suite that runs over real HTTP
- Check yourself against the graduation standard and know which lesson to revisit for each gap

## The brief: school fees without the spreadsheet

Every term, hundreds of private schools in Nigeria send parents a fee bill, and parents pay by bank transfer. The bursar then spends a week matching transfer narrations ("CHIDI SCH FEES PT1") against a spreadsheet, chasing parents who say they paid, and writing receipts by hand. A start-up wants to sell those schools a service: **FeesDesk**.

| Who | What they need |
| --- | --- |
| A school (the customer) | Its own private space: its students, bills, payments and staff, invisible to every other school on the platform. |
| A parent | Sees only their own children's bills, pays by card, gets a receipt by e-mail, and can pay in instalments where the school allows it. |
| The bursar | Sees every bill of the school and every payment, never has to match a transfer again, and is told which parents are late. |
| The start-up | A platform it can run: one deployment for all schools, a payment provider it can replace, health checks, logs, metrics, traces, and releases that never double-charge anyone. |

This is the last project of the academy, and it is built the way you would build it at work. You will not build everything. You build one **vertical slice** end to end, the one where mistakes cost real money: *a parent pays a term fee*. It crosses every layer (HTTP, authentication, tenancy, permissions, validation, the provider, the database, events, a queue, storage, notifications, observability) and it runs for real: a real HTTP server on a random port, real PostgreSQL through PGlite, and a pretend card provider that is also a real HTTP server. Everything else becomes [milestones](#milestones) with acceptance criteria, and the lesson ends with the [graduation standard](#graduation), each item linked to the lesson that teaches it.

[ShopFlow](https://zudojs.oyinlola.site/learn/capstone-shopflow) taught one transaction that never oversells. [The multi-tenant SaaS use case](https://zudojs.oyinlola.site/learn/usecase-saas) taught isolation with row-level security. FeesDesk assumes both and adds what they left out: an external provider that can be slow, down or ambiguous, background work that must keep the tenant, and an application that starts and stops as one system.

## Before any code: what can go wrong with a payment?

REASON IT OUT

### A parent presses Pay

Ada pays ₦200,000 of her son's ₦450,000 fee. Think through each question before reading on. Most of them have cost real companies real money.

1. Her phone is on a weak network. The app shows a spinner, she presses Pay again. How many times is she charged?
2. The card provider takes 40 seconds to answer. What does your server do, and what does Ada see? Did the charge happen?
3. Ada and her husband both pay the full fee from two phones at the same moment. What stops the school receiving ₦900,000?
4. Tunde's child is at another school on the platform. He changes the bill id in the URL to Ada's bill. What does he get back?
5. The provider charged the card, then your database write failed. Where is the money?
6. The receipt e-mail service is down. Should Ada's payment fail?
7. The server is being redeployed while Ada's payment is in progress. What happens to it?
8. Which of these facts can you trust from the request: the school, the parent, the bill, the amount, the price?

**Show the reasoning**

1. Once, if the client sends an **Idempotency-Key** header (a random id per payment attempt, reused on retries) and the server stores it with a unique constraint. The second press finds the first payment and returns it. The same trick is repeated one level down: FeesDesk sends the provider a *reference* per payment, and the provider does not charge the same reference twice. See [API idempotency](https://zudojs.oyinlola.site/learn/api-idempotency).
2. Every call to the provider has a **timeout**, and only failures that might succeed later are retried. If no answer ever comes, the outcome is **unknown**: the charge may or may not have happened. The honest answer is "pending" (HTTP 202), not "failed", because a retry by Ada could charge her twice. A reconciliation job settles it later by asking the provider about the reference.
3. A **reservation**: inside one transaction, lock the bill, subtract what is paid *and what is pending*, and only then record the new pending payment. The second request waits for the lock, sees the first payment pending, and is refused. The database's `CHECK (paid_kobo <= amount_kobo)` is the last line of defence.
4. 404. The bill is looked up *within his school*, from his session, and the permission check answers "not found" rather than "forbidden", so bill ids cannot be probed.
5. With the provider, which is why the order matters: record the intention (pending) first, charge outside any transaction, then settle the outcome, the bill and the ledger in one transaction. A crash between charge and settle leaves a pending payment with a reference, which reconciliation can finish. Never hold a database transaction open while waiting for a network call.
6. No. The payment is complete when the money is recorded. The receipt is a side effect: an event after commit puts a job on a queue, which retries on its own.
7. Graceful shutdown stops taking new requests, lets the ones in progress finish, then stops the workers, then the database. A payment in progress completes.
8. Only the bill id and the amount, and both are checked. The school and the parent come from the session. The price comes from the bill in the database. Nothing in the body can change who you are or what you owe.

## The shape of the slice

```ts
 POST /v1/bills/1/payments   Authorization: Bearer …   Idempotency-Key: ada-sept-0001
        │
        ▼  edge: security headers · trace span · request metric · log unexpected errors
 router ──▶ session → school (tenancy context) ──▶ command bus: PayBill
        │
        ▼  billing.payBill
   1. replay?  same key → same payment (owner only)
   2. reserve  ┌ transaction: lock bill · permission · outstanding − pending · flag · INSERT pending ┐
   3. charge   KoboPay adapter · timeout per attempt · retry only 503/timeout · same reference
   4. settle   ┌ transaction: payment · bill · ledger (2 rows) · afterCommit → fee.paid ┐
        │
        ▼  event fee.paid ── metric ── cache invalidation ── queue: render-receipt
                                                             │  (worker, retries, as the school)
                                                             ├─ storage: receipts/FD-1.txt
                                                             └─ RPC: notifications.send
 scheduler: 07:00 UTC weekdays → overdue reminders (RPC)       lifecycle: database → receipts, scheduler → http
```

One request, four steps, and the work that happens after the commit. The lifecycle line is the start order; shutdown runs it backwards.

The whole brief lists more than thirty capabilities. This table says which ones the core you build today uses, and which milestone finishes the rest. Nothing is left out; some of it is simply not built yet, which is how every real product looks.

| Capability | Package | In the core |
| --- | --- | --- |
| Configuration, validated at start-up | `@zudojs/config`, `@zudojs/schema` | `config.ts` |
| Database, transactions | PGlite, `@zudojs/transactions` | `db.ts` |
| Authentication, sessions | `@zudojs/auth`, `@zudojs/crypto` | `identity.ts` |
| Tenancy | `@zudojs/tenancy` | `identity.ts`, every query |
| Permissions (RBAC and ABAC) | `@zudojs/permissions` | `access.ts` |
| Adapters, timeouts, retries | `@zudojs/adapters`, `@zudojs/rpc` | `payment-provider.ts` |
| Services, repositories, flags, cache, events, tracing | `@zudojs/feature-flags`, `@zudojs/cache`, `@zudojs/events`, `@zudojs/observability` | `billing.ts` |
| Queue, storage, RPC, scheduler | `@zudojs/queue`, `@zudojs/storage`, `@zudojs/rpc`, `@zudojs/scheduler` | `notices.ts`, `app.ts` |
| HTTP, OpenAPI, security headers, rate limits, commands and queries | `@zudojs/http`, `@zudojs/security`, `@zudojs/cqrs` | `http.ts` |
| DI, lifecycle, graceful shutdown, health, metrics, logs | `@zudojs/container`, `@zudojs/lifecycle`, `@zudojs/observability` | `app.ts` |
| Tests | Vitest, the harness | `harness.ts`, `acceptance.ts`, `feesdesk.test.ts` |
| OAuth sign-in for staff | `@zudojs/auth-oauth` | Milestone 1 |
| API operations for the admin API | `@zudojs/api` | Milestone 2 |
| Reconciliation, refunds, webhooks, outbox | `@zudojs/adapters`, `@zudojs/transactions` | Milestone 3 |
| Messaging, plugins, a separate notifications service | `@zudojs/messaging`, `@zudojs/plugins`, `@zudojs/rpc` | Milestone 4 |
| Real PostgreSQL, Redis, object storage, deployment | `pg`, adapters | Milestone 5 |
| Core and runtime modules in a CLI project | `zudojs-cli`, `@zudojs/core`, `@zudojs/runtime` | Milestone 6 |

## Set up

Terminal on your computer

```bash
$ mkdir feesdesk && cd feesdesk
$ npm init -y
$ npm pkg set type=module
$ npm install @zudojs/adapters @zudojs/auth @zudojs/cache @zudojs/config @zudojs/container @zudojs/cqrs @zudojs/crypto @zudojs/errors @zudojs/events @zudojs/feature-flags @zudojs/http @zudojs/lifecycle @zudojs/observability @zudojs/permissions @zudojs/queue @zudojs/rpc @zudojs/scheduler @zudojs/schema @zudojs/security @zudojs/storage @zudojs/tenancy @zudojs/transactions @electric-sql/pglite
added 31 packages, and audited 32 packages in 3m

1 package is looking for funding
  run `npm fund` for details

found 0 vulnerabilities
$ npm install -D typescript tsx @types/node vitest
…
```

Use the strict `tsconfig.json` from [the TypeScript setup lesson](https://zudojs.oyinlola.site/learn/ts-setup) and create the files below in order, all in the `feesdesk` folder. Each file is short and does one job; the order is the order of the dependencies. In [Milestone 6](#milestones) they move into a project made by the CLI, as in [A whole project through the CLI](https://zudojs.oyinlola.site/learn/zudo-cli-project).

## Configuration that refuses to start

A payment platform with a wrong provider URL or a test secret in production must not start at all. `loadConfig` reads `FEESDESK_*` variables over defaults with `@zudojs/config`, validates them with a schema, and turns every problem into one `ConfigurationError`, as in [the configuration lesson](https://zudojs.oyinlola.site/learn/zudo-config). It takes the environment as a parameter, so tests pass their own.

config.ts

```ts
import { createConfigManager, createDefaultsConfigSource, createEnvironmentConfigSource } from "@zudojs/config";
import { ConfigurationError } from "@zudojs/errors";
import { isSchemaValidationError, schema, type Infer } from "@zudojs/schema";

const ConfigSchema = schema.object({
  node_env: schema.enum(["development", "test", "production"]),
  port: schema.coerce.number().int().min(0).max(65535),
  provider_url: schema.string().url(),
  provider_secret: schema.string().min(16).max(256),
  provider_timeout_ms: schema.coerce.number().int().min(50).max(30_000),
  receipts_dir: schema.string().min(1),
});

export type AppConfig = Readonly<Infer<typeof ConfigSchema>>;

/** Reads FEESDESK_* variables over safe defaults; refuses to start on anything invalid. */
export async function loadConfig(env: Record<string, string | undefined>): Promise<AppConfig> {
  const manager = createConfigManager({
    sources: [
      createDefaultsConfigSource({ node_env: "development", port: 3000, provider_timeout_ms: 2000 }),
      createEnvironmentConfigSource({ prefix: "FEESDESK_", env, priority: 20 }),
    ],
  });
  await manager.load();
  try {
    return Object.freeze(ConfigSchema.parse(manager.toObject()));
  } catch (error) {
    if (!isSchemaValidationError(error)) throw error;
    const problems = error.issues.map((issue) => `${issue.path.join(".").toUpperCase()}: ${issue.message}`);
    throw new ConfigurationError(`Invalid configuration. ${problems.join("; ")}`);
  }
}
```

config-check.tsNode.js only

```ts
import { loadConfig } from "./config.js";

try {
  await loadConfig({ FEESDESK_PORT: "80a", FEESDESK_PROVIDER_URL: "kobopay", FEESDESK_PROVIDER_SECRET: "sk_test_1" });
} catch (error) {
  console.log((error as Error).name);
  for (const problem of (error as Error).message.split(/\. |; /)) console.log("  " + problem);
}

const config = await loadConfig({
  FEESDESK_PROVIDER_URL: "https://api.kobopay.test",
  FEESDESK_PROVIDER_SECRET: "sk_live_0123456789abcdef",
  FEESDESK_RECEIPTS_DIR: "/var/lib/feesdesk/receipts",
});
console.log(config.node_env, config.port, config.provider_timeout_ms, Object.isFrozen(config));
```

Output of `npx tsx config-check.ts`

```ts
ConfigurationError
  Invalid configuration
  PORT: Cannot coerce string to number
  PROVIDER_URL: Invalid url format
  PROVIDER_SECRET: String must be at least 16 characters
  RECEIPTS_DIR: Required field missing: receipts_dir
development 3000 2000 true
```

All four problems are reported at once, so a deploy that fails tells the operator everything to fix. The secret's value never appears in the error. Never print the whole configuration object in a log for the same reason.

## The database, and a transaction trap

Eight tables. The constraints carry the rules the code must never break, so a bug in the code is refused by the database instead of silently corrupting money:

- Money is whole **kobo** in integers, with `CHECK (paid_kobo >= 0 AND paid_kobo <= amount_kobo)`: a bill can never be overpaid.
- `UNIQUE (school_id, idempotency_key)` on payments: the same key cannot create two payments.
- Every row that belongs to a school has a `school_id`. Sessions store only a hash of the token.
- The `ledger` is double-entry: every settled payment writes two rows that sum to zero, so the books can always be checked.

Transactions come from `@zudojs/transactions`, as in [the transactions lesson](https://zudojs.oyinlola.site/learn/zudo-transactions), with one twist. PGlite is a single connection, so the adapter here runs each transaction inside PGlite's own `transaction()`, which makes every other query wait until it finishes. Without that, a second request's query would run inside the first request's open transaction. `sql()` returns the current transaction's connection when there is one, and the plain database otherwise; every repository query goes through it.

db.ts

```ts
import { PGlite, type Transaction as PgTransaction } from "@electric-sql/pglite";
import { createTransactionManager, type Transaction, type TransactionAdapter } from "@zudojs/transactions";

interface Handle {
  readonly tx: PgTransaction;
  readonly finish: (commit: boolean) => void;
  readonly done: Promise<unknown>;
}

/** Runs @zudojs/transactions on PGlite's own transaction, which makes other queries wait. */
function pgliteAdapter(pg: PGlite): TransactionAdapter {
  return {
    capabilities: { savepoints: false, nestedTransactions: false, isolationLevels: [], readOnlyTransactions: false, timeouts: true },
    begin: () =>
      new Promise<Handle>((resolve) => {
        let finish: (commit: boolean) => void = () => {};
        const decided = new Promise<boolean>((settle) => (finish = settle));
        const done = pg.transaction(async (tx) => {
          resolve({ tx, finish, done });
          if (!(await decided)) await tx.rollback();
        });
      }),
    commit: async (handle) => {
      (handle as Handle).finish(true);
      await (handle as Handle).done;
    },
    rollback: async (handle) => {
      (handle as Handle).finish(false);
      await (handle as Handle).done;
    },
  };
}

const SCHEMA = `
  CREATE TABLE schools (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active');
  CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL);
  CREATE TABLE memberships (school_id TEXT NOT NULL REFERENCES schools, user_id TEXT NOT NULL REFERENCES users,
    role TEXT NOT NULL CHECK (role IN ('bursar', 'parent')), PRIMARY KEY (school_id, user_id));
  CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users,
    school_id TEXT NOT NULL REFERENCES schools, expires_at TIMESTAMPTZ NOT NULL);
  CREATE TABLE students (id SERIAL PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools, name TEXT NOT NULL,
    guardian_id TEXT NOT NULL REFERENCES users);
  CREATE TABLE bills (id SERIAL PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools,
    student_id INT NOT NULL REFERENCES students, term TEXT NOT NULL, due_date DATE NOT NULL,
    amount_kobo INT NOT NULL CHECK (amount_kobo > 0),
    paid_kobo INT NOT NULL DEFAULT 0 CHECK (paid_kobo >= 0 AND paid_kobo <= amount_kobo));
  CREATE TABLE payments (id SERIAL PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools,
    bill_id INT NOT NULL REFERENCES bills, amount_kobo INT NOT NULL CHECK (amount_kobo > 0),
    status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'declined')),
    idempotency_key TEXT NOT NULL, charge_id TEXT, receipt_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (school_id, idempotency_key));
  CREATE TABLE ledger (id SERIAL PRIMARY KEY, school_id TEXT NOT NULL, payment_id INT NOT NULL REFERENCES payments,
    account TEXT NOT NULL, amount_kobo INT NOT NULL);
`;

export type Queryable = Pick<PGlite, "query">;

/** The database, its transaction manager, and `sql()`: the connection of the current transaction, if any. */
export async function createDatabase() {
  const pg = new PGlite();
  await pg.exec(SCHEMA);
  const transactions = createTransactionManager({ adapter: pgliteAdapter(pg) });
  const sql = (): Queryable => transactions.getCurrentHandle<Handle>()?.tx ?? pg;
  /** Runs `work` after `tx` commits, detached from it: `fee.paid`'s handler must not join a finished transaction. */
  const afterCommit = (tx: Transaction, work: () => Promise<void>) => tx.afterCommit(work);
  return { pg, transactions, sql, afterCommit, close: () => pg.close() };
}

export type Database = Awaited<ReturnType<typeof createDatabase>>;
```

What is `afterCommit` for? FeesDesk publishes `fee.paid` after the payment commits, and a handler of that event queues the receipt job — a job that opens its *own* transaction a little later, once `render-receipt` reaches the front of the queue. That job must never find itself inside the payment's transaction, which has already committed by then. `afterCommit` callbacks run detached from the transaction that registered them, so a `manager.run` called from inside one starts a genuinely new transaction rather than joining a closed one. Here it is, with a stand-in adapter so only the transaction logic runs:

tx-context.tsNode.js only

```ts
import { createTransactionManager, type TransactionAdapter } from "@zudojs/transactions";

// A stand-in adapter: begin, commit and rollback do nothing, so only the context logic runs.
const adapter: TransactionAdapter = {
  capabilities: { savepoints: false, nestedTransactions: false, isolationLevels: [], readOnlyTransactions: false, timeouts: false },
  begin: async () => ({}),
  commit: async () => {},
  rollback: async () => {},
};

const manager = createTransactionManager({ adapter });
let receiptJob: Promise<void> = Promise.resolve();
await manager.run(async (payment) => {
  payment.afterCommit(async () => {
    console.log("inside afterCommit, manager.getCurrent():", manager.getCurrent());
    // "publish fee.paid": a handler queues a job that runs a little later and opens its own transaction
    receiptJob = new Promise((resolve) => setTimeout(async () => {
      await manager.run(async (job) => {
        console.log(`job sees: ${job.kind}, same transaction as the payment: ${job.id === payment.id}`);
      });
      resolve();
    }, 5));
  });
});
await receiptJob;
```

Output of `npx tsx tx-context.ts`

```ts
inside afterCommit, manager.getCurrent(): undefined
job sees: root, same transaction as the payment: false
```

`manager.getCurrent()` is `undefined` even while the callback runs, and the later job's own `manager.run` opens a fresh, root transaction rather than joining the payment's. Before `@zudojs/transactions` 1.3, an `afterCommit` callback inherited the finished transaction's asynchronous context, so its own `manager.run` believed a transaction was already in progress and joined it as a *participant* — in FeesDesk that surfaced as the receipt job failing with PGlite's "Transaction is closed", retried forever, and the only fix was to run the callback through a separately created context's `exit`. That workaround is gone; a plain `afterCommit` is now the correct and only thing to write.

## Identity and tenancy

A parent logs in *to one school*: the login body names the school, the session row stores it, and every later request takes its school from the session, never from a header or the body. The school is loaded through a `@zudojs/tenancy` tenant manager backed by the `schools` table, so a suspended school is refused with 403 even with a valid session. `runAs` gives background jobs the same tenant context a request has, which the receipt worker relies on. Passwords and session tokens follow [the authentication lesson](https://zudojs.oyinlola.site/learn/zudo-auth): scrypt hashes, a decoy hash so unknown e-mails take as long as wrong passwords, and only a hash of the token in the database.

identity.ts

```ts
import { hashPassword, verifyPassword } from "@zudojs/auth";
import { generateSessionToken, hashToken } from "@zudojs/crypto";
import { AuthenticationError } from "@zudojs/errors";
import { schema } from "@zudojs/schema";
import {
  createContextManager,
  createTenantContextStorage,
  createTenantId,
  createTenantManager,
  type Tenant,
  type TenantRepository,
} from "@zudojs/tenancy";

import type { Database } from "./db.js";

/** Who is calling, and for which school. Built only from the session, never from the request body. */
export interface Caller {
  readonly userId: string;
  readonly email: string;
  readonly role: "bursar" | "parent";
  readonly schoolId: string;
}

const Login = schema.object({
  school: schema.string().trim().toLowerCase().min(1).max(40),
  email: schema.string().trim().toLowerCase().email(),
  password: schema.string().min(12).max(128),
});

export function createIdentity(db: Database) {
  const schools: TenantRepository = {
    async findById(id) {
      const { rows } = await db.sql().query<{ id: string; name: string; status: "active" | "suspended" }>(
        "SELECT id, name, status FROM schools WHERE id = $1", [id]);
      const row = rows[0];
      return row && { id: createTenantId(row.id), name: row.name, status: row.status, metadata: {} };
    },
  };
  const tenants = createTenantManager({ repository: schools, storage: createTenantContextStorage() });
  const tenantContext = createContextManager({ storage: createTenantContextStorage() });
  const decoyHash = hashPassword(crypto.randomUUID());

  return {
    tenantContext,
    /** The school of the request in progress; throws outside a request. */
    currentSchool: (): Tenant => tenantContext.requireCurrentTenant(),
    /** Runs background work (a job, a schedule) as one school, the way a request would. */
    async runAs<T>(schoolId: string, work: () => Promise<T>): Promise<T> {
      const school = await tenants.requireActive(createTenantId(schoolId));
      return tenantContext.run(school, work);
    },

    async login(input: unknown): Promise<string> {
      const { school, email, password } = Login.parse(input);
      const { rows } = await db.sql().query<{ id: string; password_hash: string; role: string | null }>(
        `SELECT u.id, u.password_hash, m.role FROM users u
         LEFT JOIN memberships m ON m.user_id = u.id AND m.school_id = $2 WHERE u.email = $1`, [email, school]);
      const valid = await verifyPassword(password, rows[0]?.password_hash ?? (await decoyHash));
      if (!rows[0] || !valid || !rows[0].role) throw new AuthenticationError("Wrong school, e-mail or password");
      const token = await generateSessionToken();
      await db.sql().query("INSERT INTO sessions VALUES ($1, $2, $3, now() + interval '8 hours')",
        [await hashToken(token), rows[0].id, school]);
      return token;
    },

    /** The caller for a bearer token, and the school to run the request in. Suspended schools are refused. */
    async authenticate(token: string | undefined): Promise<{ caller: Caller; school: Tenant }> {
      if (!token) throw new AuthenticationError("Log in first");
      const { rows } = await db.sql().query<Caller>(
        `SELECT u.id AS "userId", u.email, m.role, s.school_id AS "schoolId" FROM sessions s
         JOIN users u ON u.id = s.user_id
         JOIN memberships m ON m.user_id = s.user_id AND m.school_id = s.school_id
         WHERE s.token_hash = $1 AND s.expires_at > now()`, [await hashToken(token)]);
      if (!rows[0]) throw new AuthenticationError("Session expired, log in again");
      return { caller: rows[0], school: await tenants.requireActive(createTenantId(rows[0].schoolId)) };
    },
  };
}

export type Identity = ReturnType<typeof createIdentity>;

/** Seeds a user; used by setup scripts and tests, never by the public API. */
export async function addUser(db: Database, user: { id: string; email: string; name: string; password: string }) {
  await db.sql().query("INSERT INTO users VALUES ($1, $2, $3, $4)",
    [user.id, user.email, user.name, await hashPassword(user.password)]);
}
```

The `Caller` type is the only way the rest of the code learns who is calling. It is built from a database join on the session, so a request can never claim a role or a school.

## Permissions: 404 or 403

Two roles, written with `@zudojs/permissions` as in [the permissions lesson](https://zudojs.oyinlola.site/learn/zudo-permissions). A parent may read and pay a bill only when it is their child's (`isOwner("guardianId")`) *and* it belongs to their school (`tenantIsolation`). A bursar may read every bill of the school, but paying is not a bursar's job.

access.ts

```ts
import { AuthorizationError, NotFoundError } from "@zudojs/errors";
import { allOf, createPermissionActor, createPermissionEngine, isOwner, tenantIsolation } from "@zudojs/permissions";

import type { Caller } from "./identity.js";

/** Parents may read and pay their own children's bills; bursars may read every bill of their school. */
const engine = createPermissionEngine({
  roles: [
    {
      name: "parent",
      permissions: [],
      rules: [{
        effect: "allow", resource: "bill", action: ["read", "pay"],
        condition: allOf(isOwner("guardianId"), tenantIsolation("schoolId", "schoolId")),
      }],
    },
    {
      name: "bursar",
      permissions: [],
      rules: [{ effect: "allow", resource: "bill", action: ["read"], condition: tenantIsolation("schoolId", "schoolId") }],
    },
  ],
});

function can(caller: Caller, permission: string, resource: object): Promise<boolean> {
  const actor = createPermissionActor(caller.userId, { roles: [caller.role] });
  return engine.can(actor, permission, resource, { metadata: { schoolId: caller.schoolId } });
}

/** 404 when the caller may not even see the bill (so ids cannot be probed), 403 when they see it but may not act. */
export async function requireAccess(caller: Caller, action: "read" | "pay", bill: { id: number }): Promise<void> {
  if (!(await can(caller, "bill:read", bill))) throw new NotFoundError(`Bill ${bill.id} was not found`);
  if (action !== "read" && !(await can(caller, `bill:${action}`, bill))) throw new AuthorizationError(`Not allowed to ${action} bill ${bill.id}`);
}
```

access-check.tsNode.js only

```ts
import { requireAccess } from "./access.js";
import type { Caller } from "./identity.js";

const ada: Caller = { userId: "u-ada", email: "ada@example.com", role: "parent", schoolId: "greenfield" };
const bola: Caller = { userId: "u-bola", email: "bola@greenfield.test", role: "bursar", schoolId: "greenfield" };
const tunde: Caller = { userId: "u-tunde", email: "tunde@example.com", role: "parent", schoolId: "unity" };
const chidisBill = { id: 1, schoolId: "greenfield", guardianId: "u-ada" };
const zainabsBill = { id: 2, schoolId: "greenfield", guardianId: "u-kemi" };

const cases: Array<[string, Caller, "read" | "pay", { id: number }]> = [
  ["ada pays her son's bill", ada, "pay", chidisBill],
  ["ada pays another child's", ada, "pay", zainabsBill],
  ["bola reads any bill", bola, "read", zainabsBill],
  ["bola pays a bill", bola, "pay", zainabsBill],
  ["tunde (unity) reads it", tunde, "read", chidisBill],
];
for (const [label, caller, action, bill] of cases) {
  const outcome = await requireAccess(caller, action, bill).then(() => "allowed", (error: { statusCode: number; name: string }) => `${error.statusCode} ${error.name}`);
  console.log(label.padEnd(26), outcome);
}
```

Output of `npx tsx access-check.ts`

```ts
ada pays her son's bill    allowed
ada pays another child's   404 NotFoundError
bola reads any bill        allowed
bola pays a bill           403 AuthorizationError
tunde (unity) reads it     404 NotFoundError
```

`requireAccess` first asks "may this caller even see the bill?". If not, the answer is 404, the same as for a bill that does not exist, so nobody can probe which ids exist in which school. Only a caller who can see the bill gets the more honest 403 for an action they may not take.

## The payment provider

FeesDesk must be able to change card provider without touching billing, as [the adapters lesson](https://zudojs.oyinlola.site/learn/zudo-adapters) showed with a checkout. `PaymentProvider` is FeesDesk's own contract; `KoboPayAdapter` translates it to one provider's HTTP API. For development and tests, "KoboPay" is a small HTTP server in the same process, with `controls` to make it slow or failing:

kobopay-server.ts

```ts
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * "KoboPay", a pretend card provider running in this process on a random port.
 * Tests steer it with `controls`: add latency, fail the next N calls with 503.
 */
export async function startKoboPay(secretKey: string) {
  const charges = new Map<string, object>();
  const controls = { latencyMs: 0, failNext: 0, chargeCalls: 0 };

  const server = createServer(async (req, res) => {
    const send = (status: number, body: object) =>
      res.writeHead(status, { "content-type": "application/json", connection: "close" }).end(JSON.stringify(body));
    let raw = "";
    for await (const chunk of req) raw += chunk;
    await new Promise((resolve) => setTimeout(resolve, controls.latencyMs));
    if (req.headers.authorization !== `Bearer ${secretKey}`) return send(401, { error: "invalid_api_key" });
    if (req.url === "/v1/health") return send(200, { ok: true });
    if (controls.failNext > 0) {
      controls.failNext -= 1;
      return send(503, { error: "temporarily_unavailable" });
    }
    const key = String(req.headers["idempotency-key"] ?? "");
    const previous = charges.get(key);
    if (previous) return send(200, previous);
    controls.chargeCalls += 1;
    const input = JSON.parse(raw) as { amount: number; source: string };
    const charge = input.source === "tok_declined"
      ? { id: `ch_${charges.size + 1}`, status: "failed", amount: input.amount, failure_message: "insufficient_funds" }
      : { id: `ch_${charges.size + 1}`, status: "succeeded", amount: input.amount, failure_message: null };
    charges.set(key, charge);
    send(200, charge);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    controls,
    async stop(): Promise<void> {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
```

payment-provider.ts

```ts
import { createHealthyHealth, createUnhealthyHealth, type AdapterHealth, type LifecycleAdapter } from "@zudojs/adapters";
import { ServiceUnavailableError } from "@zudojs/errors";
import { retry, runWithTimeout } from "@zudojs/rpc";

export interface ChargeRequest {
  /** Our payment reference; the provider treats it as an idempotency key. */
  readonly reference: string;
  readonly amountKobo: number;
  readonly cardToken: string;
}

export type ChargeResult =
  | { readonly status: "succeeded"; readonly chargeId: string }
  | { readonly status: "declined"; readonly reason: string };

/** What FeesDesk needs from any card provider. Nothing here is KoboPay-specific. */
export interface PaymentProvider extends LifecycleAdapter {
  charge(request: ChargeRequest, signal: AbortSignal): Promise<ChargeResult>;
}

export class KoboPayAdapter implements PaymentProvider {
  readonly name = "kobopay";
  readonly version = "1.0.0";
  readonly capabilities = { http: true, abortSignal: true };

  constructor(private readonly baseUrl: string, private readonly secretKey: string) {}

  private call(path: string, signal: AbortSignal, init: RequestInit = {}) {
    return fetch(`${this.baseUrl}${path}`, {
      ...init, signal, headers: { authorization: `Bearer ${this.secretKey}`, "content-type": "application/json", ...init.headers },
    });
  }

  async charge(request: ChargeRequest, signal: AbortSignal): Promise<ChargeResult> {
    const response = await this.call("/v1/charges", signal, {
      method: "POST",
      headers: { "idempotency-key": request.reference },
      body: JSON.stringify({ amount: request.amountKobo, currency: "NGN", source: request.cardToken }),
    });
    if (response.status >= 500) throw new ServiceUnavailableError(`KoboPay answered ${response.status}`);
    if (!response.ok) throw new Error(`KoboPay refused the request with ${response.status}`);
    const body = (await response.json()) as { id: string; status: string; failure_message: string | null };
    return body.status === "succeeded"
      ? { status: "succeeded", chargeId: body.id }
      : { status: "declined", reason: body.failure_message ?? "declined" };
  }

  async health(): Promise<AdapterHealth> {
    try {
      const response = await this.call("/v1/health", AbortSignal.timeout(1000));
      return response.ok ? createHealthyHealth() : createUnhealthyHealth(`status ${response.status}`);
    } catch (error) {
      return createUnhealthyHealth((error as Error).message);
    }
  }
}

const transient = (error: unknown) =>
  error instanceof ServiceUnavailableError || (error as Error).name === "RPCTimeoutError";

/** Every attempt has its own deadline; only failures that may succeed later are retried. */
export function chargeWithRetry(provider: PaymentProvider, request: ChargeRequest, timeoutMs: number,
  onRetry: (error: unknown, attempt: number) => void = () => {}): Promise<ChargeResult> {
  return retry(
    () => runWithTimeout((signal) => provider.charge(request, signal), timeoutMs, `${provider.name}.charge`),
    { attempts: 3, delay: 50, backoff: "exponential", maxDelay: 500, retryIf: transient, onRetry },
  );
}
```

`chargeWithRetry` combines two helpers from `@zudojs/rpc`. `runWithTimeout` gives each attempt its own deadline and aborts the `fetch` through its signal when the deadline passes. `retry` tries up to three times with exponential backoff and full jitter, but only when `transient` says the failure might pass: a 503 or a timeout. A decline is an answer, not a failure, and a 401 from a wrong secret will not fix itself. See [failure engineering](https://zudojs.oyinlola.site/learn/dist-reliability) for the reasoning. Here it is against the real fake:

provider-check.tsNode.js only

```ts
import { startKoboPay } from "./kobopay-server.js";
import { chargeWithRetry, KoboPayAdapter } from "./payment-provider.js";

const secret = `sk_test_${crypto.randomUUID()}`;
const kobopay = await startKoboPay(secret);
const provider = new KoboPayAdapter(kobopay.url, secret);
const retries: string[] = [];
const charge = (reference: string, cardToken = "tok_visa") =>
  chargeWithRetry(provider, { reference, amountKobo: 45_000_000, cardToken }, 1000,
    (error, attempt) => retries.push(`${reference} attempt ${attempt}: ${(error as Error).name}`))
    .then((result) => JSON.stringify(result), (error: Error) => `${error.name}: ${error.message}`);

console.log("health:", (await provider.health()).status);
console.log("normal:        ", await charge("fd_greenfield_1"));
console.log("same reference:", await charge("fd_greenfield_1"));
kobopay.controls.failNext = 2;
console.log("two 503s:      ", await charge("fd_greenfield_2"));
console.log("declined:      ", await charge("fd_unity_3", "tok_declined"));
kobopay.controls.latencyMs = 1500;
console.log("too slow:      ", await charge("fd_unity_4"));
console.log(retries.join("\n"));
await new Promise((resolve) => setTimeout(resolve, 1700));
console.log("charges KoboPay made:", kobopay.controls.chargeCalls);
await kobopay.stop();
```

Output of `npx tsx provider-check.ts`

```ts
health: healthy
normal:         {"status":"succeeded","chargeId":"ch_1"}
same reference: {"status":"succeeded","chargeId":"ch_1"}
two 503s:       {"status":"succeeded","chargeId":"ch_2"}
declined:       {"status":"declined","reason":"insufficient_funds"}
too slow:       RPCTimeoutError: RPC operation timed out after 1000ms.
fd_greenfield_2 attempt 1: ServiceUnavailableError
fd_greenfield_2 attempt 2: ServiceUnavailableError
fd_unity_4 attempt 1: RPCTimeoutError
fd_unity_4 attempt 2: RPCTimeoutError
charges KoboPay made: 4
```

Read the last lines carefully. The slow charge timed out three times, and yet KoboPay made the charge: its answer simply arrived after FeesDesk stopped waiting. All three attempts carried the same reference, so it charged *once*. That is the unknown outcome from the reasoning block, and it is why a timeout must never be reported to the parent as a failed payment.

## Billing: reserve, charge, settle

This file is the heart of FeesDesk. Every query is scoped to the school of the request through `schoolId()`. `payBill` runs the four steps from the diagram:

billing.ts

```ts
import type { CacheService } from "@zudojs/cache";
import { ConflictError, NotFoundError, ValidationError } from "@zudojs/errors";
import type { EventBus } from "@zudojs/events";
import type { FeatureFlags } from "@zudojs/feature-flags";
import { withSpan, type Observability } from "@zudojs/observability";
import { schema } from "@zudojs/schema";

import { requireAccess } from "./access.js";
import type { Database } from "./db.js";
import type { Caller, Identity } from "./identity.js";
import { chargeWithRetry, type PaymentProvider } from "./payment-provider.js";

export interface Bill {
  readonly id: number;
  readonly schoolId: string;
  readonly studentName: string;
  readonly guardianId: string;
  readonly term: string;
  readonly dueDate: string;
  readonly amountKobo: number;
  readonly paidKobo: number;
}
export interface Payment {
  readonly id: number;
  readonly billId: number;
  readonly amountKobo: number;
  readonly status: "pending" | "succeeded" | "declined";
  readonly receiptKey: string | null;
}
export interface FeePaid {
  readonly schoolId: string;
  readonly paymentId: number;
  readonly amountKobo: number;
}

export const PayBillBody = schema.object({
  amountKobo: schema.number().int().min(100).max(100_000_000),
  cardToken: schema.string().min(4).max(64),
});

const BILLS = `SELECT b.id, b.school_id AS "schoolId", st.name AS "studentName", st.guardian_id AS "guardianId", b.term,
  b.due_date::text AS "dueDate", b.amount_kobo AS "amountKobo", b.paid_kobo AS "paidKobo"
  FROM bills b JOIN students st ON st.id = b.student_id`;
const PAYMENTS = `SELECT id, bill_id AS "billId", amount_kobo AS "amountKobo", status, receipt_key AS "receiptKey" FROM payments`;

export interface BillingDeps {
  readonly db: Database;
  readonly identity: Identity;
  readonly flags: FeatureFlags;
  readonly provider: PaymentProvider;
  readonly events: EventBus;
  readonly cache: CacheService;
  readonly obs: Observability;
  readonly providerTimeoutMs: number;
}

export function createBilling({ db, identity, flags, provider, events, cache, obs, providerTimeoutMs }: BillingDeps) {
  const schoolId = () => identity.currentSchool().id;

  async function findBill(id: number, lock = ""): Promise<Bill> {
    const { rows } = await db.sql().query<Bill>(`${BILLS} WHERE b.id = $1 AND b.school_id = $2 ${lock}`, [id, schoolId()]);
    if (!rows[0]) throw new NotFoundError(`Bill ${id} was not found`);
    return rows[0];
  }

  async function paymentByKey(key: string): Promise<Payment | undefined> {
    const { rows } = await db.sql().query<Payment>(`${PAYMENTS} WHERE school_id = $1 AND idempotency_key = $2`, [schoolId(), key]);
    return rows[0];
  }

  /** Step 1, in one transaction: lock the bill, check what is left to pay, record a pending payment. */
  async function reserve(caller: Caller, billId: number, amountKobo: number, key: string): Promise<Payment> {
    return db.transactions.run(async () => {
      const bill = await findBill(billId, "FOR UPDATE OF b");
      await requireAccess(caller, "pay", bill);
      const { rows: [pending] } = await db.sql().query<{ kobo: number }>(
        "SELECT coalesce(sum(amount_kobo), 0)::int AS kobo FROM payments WHERE bill_id = $1 AND status = 'pending'", [billId]);
      const outstanding = bill.amountKobo - bill.paidKobo - (pending?.kobo ?? 0);
      if (amountKobo > outstanding) throw new ValidationError(`Only ${outstanding} kobo is left to pay on bill ${billId}`);
      const partAllowed = await flags.isEnabled("installments", { tenantId: bill.schoolId, userId: caller.userId });
      if (amountKobo < outstanding && !partAllowed) throw new ValidationError("This school does not accept part payments");
      const { rows } = await db.sql().query<Payment>(
        `INSERT INTO payments (school_id, bill_id, amount_kobo, status, idempotency_key) VALUES ($1, $2, $3, 'pending', $4)
         RETURNING id, bill_id AS "billId", amount_kobo AS "amountKobo", status, receipt_key AS "receiptKey"`,
        [bill.schoolId, billId, amountKobo, key]);
      return rows[0]!;
    });
  }

  /** Step 3, in one transaction: the outcome, the bill, the ledger; the event only after commit. */
  async function settle(payment: Payment, chargeId: string | undefined): Promise<Payment> {
    return db.transactions.run(async (tx) => {
      const status = chargeId ? "succeeded" : "declined";
      await db.sql().query("UPDATE payments SET status = $1, charge_id = $2 WHERE id = $3", [status, chargeId ?? null, payment.id]);
      if (chargeId) {
        await db.sql().query("UPDATE bills SET paid_kobo = paid_kobo + $1 WHERE id = $2", [payment.amountKobo, payment.billId]);
        await db.sql().query(
          "INSERT INTO ledger (school_id, payment_id, account, amount_kobo) VALUES ($1, $2, 'kobopay-clearing', $3), ($1, $2, 'fees-receivable', $4)",
          [schoolId(), payment.id, payment.amountKobo, -payment.amountKobo]);
        const paid: FeePaid = { schoolId: schoolId(), paymentId: payment.id, amountKobo: payment.amountKobo };
        db.afterCommit(tx, async () => void (await events.publishEvent({ type: "fee.paid", payload: paid })));
      }
      return { ...payment, status };
    });
  }

  return {
    async listBills(caller: Caller): Promise<readonly Bill[]> {
      const school = schoolId();
      const load = async () => {
        const mine = caller.role === "parent" ? "AND st.guardian_id = $2" : "";
        const params = caller.role === "parent" ? [school, caller.userId] : [school];
        return (await db.sql().query<Bill>(`${BILLS} WHERE b.school_id = $1 ${mine} ORDER BY b.id`, params)).rows;
      };
      return (await cache.getOrSet(`bills.${school}.${caller.userId}`, load, { tags: [`bills.${school}`] })).value;
    },

    async payBill(caller: Caller, billId: number, key: string, body: unknown): Promise<Payment> {
      const { amountKobo, cardToken } = PayBillBody.parse(body);
      const replay = await paymentByKey(key);
      if (replay) {
        await requireAccess(caller, "read", await findBill(replay.billId));
        if (replay.billId !== billId || replay.amountKobo !== amountKobo) throw new ConflictError("Idempotency-Key reused for a different payment");
        return replay;
      }
      const payment = await reserve(caller, billId, amountKobo, key);
      const reference = `fd_${schoolId()}_${payment.id}`;
      try {
        const result = await withSpan(obs.tracer, "kobopay.charge", () =>
          chargeWithRetry(provider, { reference, amountKobo, cardToken }, providerTimeoutMs,
            (error, attempt) => {
              obs.metrics.counter("kobopay.retries").increment();
              obs.logger.warn("charge retry", { reference, attempt, error: (error as Error).name });
            }));
        return await settle(payment, result.status === "succeeded" ? result.chargeId : undefined);
      } catch (error) {
        obs.logger.error("charge outcome unknown, left pending", { reference, error: (error as Error).message });
        return payment;
      }
    },

    async payment(caller: Caller, paymentId: number): Promise<Payment> {
      const { rows } = await db.sql().query<Payment>(`${PAYMENTS} WHERE id = $1 AND school_id = $2`, [paymentId, schoolId()]);
      if (!rows[0]) throw new NotFoundError(`Payment ${paymentId} was not found`);
      await requireAccess(caller, "read", await findBill(rows[0].billId)).catch((error: unknown) => {
        throw error instanceof NotFoundError ? new NotFoundError(`Payment ${paymentId} was not found`) : error;
      });
      return rows[0];
    },
  };
}

export type Billing = ReturnType<typeof createBilling>;
```

- **Replay** looks the key up first, checks that the caller may see its payment, and refuses a key reused for a different bill or amount with 409. A stranger's key is a 404, not someone else's receipt.
- **Reserve** runs in one transaction. `FOR UPDATE OF b` locks the bill row, so on a real PostgreSQL server a second payment for the same bill waits here; the outstanding amount subtracts pending payments. The `installments` flag decides whether part payments are allowed for this school, per [the feature flags lesson](https://zudojs.oyinlola.site/learn/zudo-feature-flags).
- **Charge** happens outside any transaction, inside a trace span, with every retry counted in a metric and logged.
- **Settle** is one transaction: the payment's status, the bill's `paid_kobo`, two ledger rows, and the event registered to run after commit. If the process dies before settle, the payment stays pending with its reference; if it dies inside settle, the transaction rolls back and the payment stays pending too. There is no state in which the bill is credited without a ledger entry.
- If the charge outcome is unknown after all retries, `payBill` returns the pending payment, and the HTTP layer answers 202.

`listBills` reads through `@zudojs/cache`. The key and the tag both carry the school, so one school's invalidation never touches another's cache, and a settled payment invalidates its school's tag. Cache keys only accept letters, digits, dots, dashes and underscores; the first version used colons and got a 400 from `getOrSet`.

## Receipts, notifications and reminders

Everything that happens after the money is recorded lives in `notices.ts`:

notices.ts

```ts
import { createRPCMemoryTransport, createRPCProcedure, RPCClient, RPCServer } from "@zudojs/rpc";
import type { Queue } from "@zudojs/queue";
import { schema } from "@zudojs/schema";
import type { ObjectStorage } from "@zudojs/storage";

import type { Database } from "./db.js";
import type { Identity } from "./identity.js";

export interface Notice {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}
export interface ReceiptJob {
  readonly schoolId: string;
  readonly paymentId: number;
}

const NoticeSchema = schema.object({
  to: schema.string().email(),
  subject: schema.string().min(1).max(120),
  text: schema.string().min(1).max(5000),
});

const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

/** The notifications service, reached over RPC. In-process today; over HTTP once it is its own service. */
export function createNotifications() {
  const sent: Notice[] = [];
  const server = new RPCServer();
  server.register(createRPCProcedure("notifications.send", async (notice: Notice) => {
    sent.push(notice);
    return { queued: true };
  }, { input: NoticeSchema }));
  const client = new RPCClient(createRPCMemoryTransport(server), { timeout: 2_000 });
  return { sent, send: (notice: Notice) => client.call<Notice, { queued: boolean }>("notifications.send", notice) };
}
export type Notifications = ReturnType<typeof createNotifications>;

/** Renders a receipt, stores it, e-mails the guardian. Safe to run twice: the key is fixed per payment. */
export function registerReceiptWorker(deps: {
  queue: Queue<ReceiptJob>; db: Database; identity: Identity; storage: ObjectStorage; notifications: Notifications;
}): void {
  const { queue, db, identity, storage, notifications } = deps;
  queue.process("render-receipt", async (job) => {
    await identity.runAs(job.data.schoolId, async () => {
      const { rows } = await db.sql().query<{ school: string; student: string; term: string; kobo: number; email: string }>(
        `SELECT sc.name AS school, st.name AS student, b.term, p.amount_kobo AS kobo, u.email FROM payments p
         JOIN bills b ON b.id = p.bill_id JOIN students st ON st.id = b.student_id
         JOIN schools sc ON sc.id = p.school_id JOIN users u ON u.id = st.guardian_id
         WHERE p.id = $1 AND p.school_id = $2 AND p.status = 'succeeded'`, [job.data.paymentId, job.data.schoolId]);
      const row = rows[0];
      if (!row) throw new Error(`payment ${job.data.paymentId} is not a settled payment of ${job.data.schoolId}`);
      const text = `${row.school}\nReceipt FD-${job.data.paymentId}\n${row.student}, ${row.term}\nPaid: ${naira.format(row.kobo / 100)}\n`;
      const key = `schools/${job.data.schoolId}/receipts/FD-${job.data.paymentId}.txt`;
      await storage.put(key, new TextEncoder().encode(text), { contentType: "text/plain" });
      await db.sql().query("UPDATE payments SET receipt_key = $1 WHERE id = $2", [key, job.data.paymentId]);
      await notifications.send({ to: row.email, subject: `Receipt FD-${job.data.paymentId}`, text });
    });
  });
}

/** The daily reminder: every unpaid bill past its due date, one notice per guardian and bill. */
export async function sendOverdueReminders(db: Database, notifications: Notifications, today: string): Promise<number> {
  const { rows } = await db.sql().query<{ email: string; student: string; term: string; owed: number; school: string }>(
    `SELECT u.email, st.name AS student, b.term, b.amount_kobo - b.paid_kobo AS owed, sc.name AS school
     FROM bills b JOIN students st ON st.id = b.student_id JOIN users u ON u.id = st.guardian_id
     JOIN schools sc ON sc.id = b.school_id
     WHERE b.paid_kobo < b.amount_kobo AND b.due_date < $1::date AND sc.status = 'active' ORDER BY b.id`, [today]);
  for (const row of rows) {
    await notifications.send({
      to: row.email, subject: `${row.school}: school fees overdue`,
      text: `${row.student}, ${row.term}: ${naira.format(row.owed / 100)} is overdue.`,
    });
  }
  return rows.length;
}
```

- **Notifications** is a service with one RPC procedure, validated with a schema, called through an `RPCClient` with a timeout, as in [the RPC lesson](https://zudojs.oyinlola.site/learn/zudo-rpc). Today the transport is in memory. When it becomes its own service (Milestone 4), only the transport changes.
- The **receipt worker** processes `render-receipt` jobs from `@zudojs/queue`. The job carries only ids, and the worker re-enters the school with `runAs` and reloads what it needs, so a job can never act on stale or cross-school data. The storage key is fixed per payment, so running the job twice overwrites the same receipt instead of creating two; the queue retries a failing job with exponential backoff.
- **Overdue reminders** are a system job that deliberately spans every active school, the one place in the code that does. It is a plain function, so the test can call it with a fixed date.

## The HTTP layer

Routes are thin: authenticate, enter the school, validate the path and headers, send a command or a query to a `@zudojs/cqrs` bus, and choose the status. The command type `PayBill` is the whole contract between HTTP and billing. A job, a CLI tool or an admin screen can send the same command.

http.ts

```ts
import type { CommandBus, CommandOf, QueryBus, QueryOf } from "@zudojs/cqrs";
import { RateLimitError, ValidationError } from "@zudojs/errors";
import {
  createResponseContext, createRouter, HttpMiddlewarePipeline, mountOpenAPI,
  type HttpMiddleware, type HttpRouterContext,
} from "@zudojs/http";
import { SpanKind, withSpan, type Observability } from "@zudojs/observability";
import { schema } from "@zudojs/schema";
import { createRateLimiter, generateSecurityHeaders } from "@zudojs/security";
import type { ObjectStorage } from "@zudojs/storage";

import type { Bill, Payment } from "./billing.js";
import { PayBillBody } from "./billing.js";
import type { Caller, Identity } from "./identity.js";

export type PayBill = CommandOf<"PayBill", { caller: Caller; billId: number; idempotencyKey: string; body: unknown }>;
export type ListBills = QueryOf<"ListBills", { caller: Caller }>;
export type GetPayment = QueryOf<"GetPayment", { caller: Caller; paymentId: number }>;

const Id = schema.object({ id: schema.coerce.number().int().min(1) });
const IdempotencyKey = schema.string().regex(/^[A-Za-z0-9_-]{8,100}$/);
const STATUS = { succeeded: 201, pending: 202, declined: 402 } as const;

function body(ctx: HttpRouterContext): unknown {
  const text = new TextDecoder().decode(ctx.request.body as Uint8Array | undefined);
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new ValidationError("The body must be JSON");
  }
}

export interface HttpDeps {
  readonly identity: Identity;
  readonly commands: CommandBus;
  readonly queries: QueryBus;
  readonly storage: ObjectStorage;
  readonly obs: Observability;
  readonly readiness: () => Promise<{ ready: boolean; checks: Record<string, string> }>;
}

export function createHttpPipeline({ identity, commands, queries, storage, obs, readiness }: HttpDeps) {
  const router = createRouter();
  const logins = createRateLimiter({ windowMs: 60_000, max: 5 });

  /** Authenticates the bearer token, then runs the handler as the caller's school. */
  const asCaller = <T>(ctx: HttpRouterContext, handler: (caller: Caller) => Promise<T>): Promise<T> =>
    identity.authenticate(ctx.request.getHeader("authorization")?.replace(/^Bearer /, "")).then(({ caller, school }) =>
      identity.tenantContext.run(school, () => handler(caller)));

  router.post("/v1/sessions", async (ctx) => {
    if (!logins.check({ ip: ctx.request.remoteAddress ?? "unknown" }).allowed) throw new RateLimitError("Too many login attempts");
    return createResponseContext({ status: 201 }).json({ token: await identity.login(body(ctx)) });
  }, { openapi: { summary: "Log in to one school", tags: ["sessions"] } });

  router.get("/v1/bills", (ctx) => asCaller(ctx, async (caller) =>
    createResponseContext().json(await queries.execute<ListBills, readonly Bill[]>({ type: "ListBills", caller }))),
  { openapi: { summary: "Bills the caller may see", tags: ["bills"] } });

  router.post("/v1/bills/:id/payments", (ctx) => asCaller(ctx, async (caller) => {
    const { id } = Id.parse(ctx.params);
    const idempotencyKey = IdempotencyKey.parse(ctx.request.getHeader("idempotency-key") ?? "");
    const payment = await commands.execute<PayBill, Payment>({ type: "PayBill", caller, billId: id, idempotencyKey, body: body(ctx) });
    return createResponseContext({ status: STATUS[payment.status] }).json(payment);
  }), { openapi: { summary: "Pay a bill by card", tags: ["bills"], params: Id, body: PayBillBody } });

  router.get("/v1/payments/:id/receipt", (ctx) => asCaller(ctx, async (caller) => {
    const payment = await queries.execute<GetPayment, Payment>({ type: "GetPayment", caller, paymentId: Id.parse(ctx.params).id });
    const file = payment.receiptKey ? await storage.get(payment.receiptKey) : null;
    if (!file) return createResponseContext({ status: 404 }).json({ error: "The receipt is not ready yet" });
    return createResponseContext().setHeader("content-type", "text/plain; charset=utf-8")
      .text(new TextDecoder().decode(await file.arrayBuffer()));
  }), { openapi: { summary: "Download a payment's receipt", tags: ["payments"], params: Id } });

  router.get("/health", async () => createResponseContext().json({ status: "alive" }), { openapi: false });
  router.get("/ready", async () => {
    const report = await readiness();
    return createResponseContext({ status: report.ready ? 200 : 503 }).json(report);
  }, { openapi: false });
  mountOpenAPI(router, { info: { title: "FeesDesk API", version: "1.0.0" } });

  const headers = Object.entries(generateSecurityHeaders());
  /** Security headers, a trace span and a request counter for every request; unexpected errors are logged. */
  const edge: HttpMiddleware = async (ctx, next) =>
    withSpan(obs.tracer, `${ctx.request.method} ${ctx.request.path}`, async () => {
      let status = 500;
      try {
        const response = (await next()).clone();
        status = response.status;
        const present = new Set(Object.keys(response.headers).map((name) => name.toLowerCase()));
        for (const [name, value] of headers) if (!present.has(name.toLowerCase())) response.setHeader(name, value);
        return response;
      } catch (error) {
        const exposed = error as { expose?: boolean; statusCode?: number };
        status = exposed.expose && exposed.statusCode ? exposed.statusCode : 500;
        if (status >= 500) obs.logger.error("request failed", { path: ctx.request.path }, error as Error);
        throw error;
      } finally {
        obs.metrics.counter("http.requests", { method: ctx.request.method, status: String(status) }).increment();
      }
    }, { kind: SpanKind.SERVER });
  const dispatch: HttpMiddleware = async (ctx) => (await router.dispatch(ctx.request, { signal: ctx.signal })).response;

  return { pipeline: new HttpMiddlewarePipeline({ middlewares: [edge, dispatch] }), close: () => logins.destroy() };
}
```

- A payment answers **201** when it succeeded, **202** when the outcome is pending, **402** when the card was declined. The client can act on each one differently.
- The `edge` middleware wraps every request in a server span, adds the `@zudojs/security` headers the response has not set itself, counts every request by method and status, and logs unexpected errors (status 500) with their message, which the generated project in the CLI lesson forgot to do. Expected errors from `@zudojs/errors` are turned into JSON answers by the HTTP server with their own status.
- `/health` says the process is alive. `/ready` says whether it should receive traffic: the lifecycle is ready, the database answers and KoboPay's health check passes. A load balancer uses the second, per [Production engineering](https://zudojs.oyinlola.site/learn/production-engineering).
- Login is rate limited per client IP with `createRateLimiter`. The acceptance suite finds a weakness in that choice; exercise 1 fixes it.
- `mountOpenAPI` documents the routes from their metadata at `/openapi.json`, as in [the OpenAPI lesson](https://zudojs.oyinlola.site/learn/zudo-openapi).

## The composition root

`app.ts` is the only file that knows every other file. It builds the objects with a `@zudojs/container` (factories with explicit dependency lists, registered as singletons, as [the DI architecture lesson](https://zudojs.oyinlola.site/learn/zudo-di-architecture) recommends over classes with unchecked `inject` lists), wires the event handlers and buses, schedules the reminder, and hands four components to a `@zudojs/lifecycle` manager in dependency order.

app.ts

```ts
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";
import { ContainerScope, createContainer, createToken } from "@zudojs/container";
import { createCommandBus, createQueryBus } from "@zudojs/cqrs";
import { createEventBus, type Event } from "@zudojs/events";
import { createFeatureFlags, createMemoryProvider } from "@zudojs/feature-flags";
import { createHttpServer, createNodeHttpAdapter, createResponseContext, type HttpRequestContext } from "@zudojs/http";
import { createLifecycleManager } from "@zudojs/lifecycle";
import { createObservability, type Observability } from "@zudojs/observability";
import { createExponentialBackoff, createInMemoryQueue, createQueueName, createWorker } from "@zudojs/queue";
import { Scheduler } from "@zudojs/scheduler";
import { LocalObjectStorage } from "@zudojs/storage";

import { createBilling, type FeePaid } from "./billing.js";
import type { AppConfig } from "./config.js";
import { createDatabase } from "./db.js";
import { createHttpPipeline, type GetPayment, type ListBills, type PayBill } from "./http.js";
import { createIdentity } from "./identity.js";
import { createNotifications, registerReceiptWorker, sendOverdueReminders, type ReceiptJob } from "./notices.js";
import { KoboPayAdapter } from "./payment-provider.js";

const singleton = { scope: ContainerScope.SINGLETON };
const T = {
  config: createToken<AppConfig>("Config"),
  obs: createToken<Observability>("Observability"),
  db: createToken<Awaited<ReturnType<typeof createDatabase>>>("Database"),
  identity: createToken<ReturnType<typeof createIdentity>>("Identity"),
  provider: createToken<KoboPayAdapter>("PaymentProvider"),
  billing: createToken<ReturnType<typeof createBilling>>("Billing"),
};

/** The composition root: every object is built here, once, and started and stopped in dependency order. */
export async function createFeesDesk(config: AppConfig, options: { obs?: Observability; today?: () => string } = {}) {
  const today = options.today ?? (() => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }));
  const container = createContainer();
  container.registerValue(T.config, config);
  container.registerValue(T.obs, options.obs ?? createObservability({ serviceName: "feesdesk", environment: config.node_env }));
  container.registerValue(T.db, await createDatabase());
  container.registerFactory(T.identity, (db) => createIdentity(db), [T.db], singleton);
  container.registerFactory(T.provider, (c) => new KoboPayAdapter(c.provider_url, c.provider_secret), [T.config], singleton);

  const events = createEventBus();
  const cache = createCacheService({ adapter: createMemoryCacheAdapter({ maxEntries: 10_000 }), config: { defaultTtl: 60_000 } });
  const flags = createFeatureFlags({ provider: createMemoryProvider([
    { key: "installments", enabled: true, defaultValue: false, rules: [{ type: "tenant", tenants: ["greenfield"], value: true }] },
  ]) });
  container.registerFactory(T.billing, (db, identity, provider, obs, c) =>
    createBilling({ db, identity, provider, obs, flags, events, cache, providerTimeoutMs: c.provider_timeout_ms }),
  [T.db, T.identity, T.provider, T.obs, T.config], singleton);

  const [db, identity, billing, obs] = [container.resolve(T.db), container.resolve(T.identity), container.resolve(T.billing), container.resolve(T.obs)];
  const storage = new LocalObjectStorage(config.receipts_dir, { maxObjectBytes: 64 * 1024 });
  const notifications = createNotifications();
  const receipts = createInMemoryQueue<ReceiptJob>(createQueueName("receipts"), {
    autoProcess: false,
    defaultJobOptions: { attempts: 5, backoff: createExponentialBackoff(100, { maxDelay: 5_000 }) },
  });
  registerReceiptWorker({ queue: receipts, db, identity, storage, notifications });
  const worker = createWorker("receipts-1", receipts, { concurrency: 2, pollInterval: 20 });

  events.on<Event<FeePaid>>("fee.paid", async ({ payload }) => {
    obs.metrics.counter("fees.paid_kobo", { school: payload.schoolId }).increment(payload.amountKobo);
    await cache.invalidateByTag([`bills.${payload.schoolId}`]);
    await receipts.add("render-receipt", { schoolId: payload.schoolId, paymentId: payload.paymentId });
  });

  const commands = createCommandBus().register<PayBill, unknown>("PayBill", (c) => billing.payBill(c.caller, c.billId, c.idempotencyKey, c.body));
  const queries = createQueryBus()
    .register<ListBills, unknown>("ListBills", (q) => billing.listBills(q.caller))
    .register<GetPayment, unknown>("GetPayment", (q) => billing.payment(q.caller, q.paymentId));

  const scheduler = new Scheduler();
  scheduler.define({ id: "overdue-reminders", name: "Remind guardians of overdue fees", handler: async () => void (await sendOverdueReminders(db, notifications, today())) });
  // 08:00 in Lagos is 07:00 UTC (no daylight saving); cron accepts only UTC or the server's own zone.
  const reminders = scheduler.cron("0 7 * * 1-5", "overdue-reminders", { timezone: "UTC" });

  const lifecycle = createLifecycleManager({ handleSignals: false, shutdownTimeout: 10_000 });
  const readiness = async () => {
    const provider = await container.resolve(T.provider).health();
    const database = await db.pg.query("SELECT 1").then(() => "up", () => "down");
    const checks = { lifecycle: lifecycle.state, database, kobopay: provider.status };
    return { ready: lifecycle.state === "ready" && database === "up" && provider.status === "healthy", checks };
  };
  const web = createHttpPipeline({ identity, commands, queries, storage, obs, readiness });
  const server = createHttpServer({
    adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: config.port }),
    handler: (request: HttpRequestContext) => web.pipeline.execute(request, createResponseContext()),
  });

  lifecycle.register({ name: "database", dispose: () => db.close() });
  lifecycle.register({ name: "receipts", start: () => worker.start(), stop: () => worker.stop() }, { dependsOn: ["database"] });
  lifecycle.register({ name: "scheduler", start: async () => scheduler.start(), stop: () => scheduler.stop({ drain: true }) }, { dependsOn: ["database"] });
  lifecycle.register({ name: "http", start: async () => void (await server.start()), stop: async () => { await server.stop(); web.close(); } },
    { dependsOn: ["receipts", "scheduler"] });

  return {
    db, obs, notifications, receipts, reminders, lifecycle,
    start: () => lifecycle.start(),
    stop: () => lifecycle.shutdown(),
    url: () => `http://127.0.0.1:${server.address?.port}`,
    runReminders: () => sendOverdueReminders(db, notifications, today()),
  };
}

export type FeesDesk = Awaited<ReturnType<typeof createFeesDesk>>;
```

Two details are worth a second look. `registerFactory` creates a new object on every `resolve` unless you pass the singleton scope; without it, the billing service would get a second, empty identity service. And the reminder is scheduled at 07:00 UTC rather than 08:00 Africa/Lagos, because the published scheduler's cron trigger accepts only UTC or the server's own zone (it throws `InvalidScheduleError` for `"Africa/Lagos"`); Lagos has no daylight saving, so the two are the same moment all year.

## Run it

Seed data comes from a script, never from the public API. Passwords are new random values on every run:

seed.ts

```ts
import type { Database } from "./db.js";
import { addUser } from "./identity.js";

/** Two schools, a bursar, three parents and their children's first-term bills. Passwords are new every run. */
export async function seed(db: Database) {
  const password = () => crypto.randomUUID();
  const people = {
    bola: { id: "u-bola", email: "bola@greenfield.test", name: "Bola (bursar)", password: password() },
    ada: { id: "u-ada", email: "ada@example.com", name: "Ada Okafor", password: password() },
    kemi: { id: "u-kemi", email: "kemi@example.com", name: "Kemi Bello", password: password() },
    tunde: { id: "u-tunde", email: "tunde@example.com", name: "Tunde Ade", password: password() },
  };
  await db.pg.exec(`INSERT INTO schools (id, name) VALUES ('greenfield', 'Greenfield Academy, Lekki'), ('unity', 'Unity College, Ibadan')`);
  await Promise.all(Object.values(people).map((person) => addUser(db, person)));
  await db.pg.exec(`
    INSERT INTO memberships VALUES ('greenfield', 'u-bola', 'bursar'), ('greenfield', 'u-ada', 'parent'),
      ('greenfield', 'u-kemi', 'parent'), ('unity', 'u-tunde', 'parent');
    INSERT INTO students (school_id, name, guardian_id) VALUES
      ('greenfield', 'Chidi Okafor', 'u-ada'), ('greenfield', 'Zainab Bello', 'u-kemi'), ('unity', 'Ife Ade', 'u-tunde');
    INSERT INTO bills (school_id, student_id, term, due_date, amount_kobo) VALUES
      ('greenfield', 1, 'First term 2026/27', '2026-09-15', 45000000),
      ('greenfield', 2, 'First term 2026/27', '2026-09-15', 45000000),
      ('unity', 3, 'First term 2026/27', '2026-10-10', 28000000);
  `);
  return people;
}
```

The harness starts a complete FeesDesk on random ports: KoboPay, the application with a fresh database and a temporary receipts folder, and a small HTTP client. The story and the tests both use it.

harness.ts

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createObservability } from "@zudojs/observability";

import { createFeesDesk } from "./app.js";
import { loadConfig } from "./config.js";
import { startKoboPay } from "./kobopay-server.js";
import { seed } from "./seed.js";

/** A whole FeesDesk on random ports: fake KoboPay, fresh PGlite, temp receipts folder. For demos and tests. */
export async function startFeesDesk(today = "2026-09-25") {
  const secret = `sk_test_${crypto.randomUUID()}`;
  const kobopay = await startKoboPay(secret);
  const receiptsDir = await mkdtemp(join(tmpdir(), "feesdesk-"));
  const config = await loadConfig({
    FEESDESK_PORT: "0", FEESDESK_PROVIDER_URL: kobopay.url, FEESDESK_PROVIDER_SECRET: secret,
    FEESDESK_PROVIDER_TIMEOUT_MS: "1000", FEESDESK_RECEIPTS_DIR: receiptsDir,
  });
  const obs = createObservability({ serviceName: "feesdesk", useConsoleExporters: false });
  const app = await createFeesDesk(config, { obs, today: () => today });
  const people = await seed(app.db);
  await app.start();

  async function call(method: string, path: string, options: { token?: string; key?: string; body?: unknown } = {}) {
    const response = await fetch(app.url() + path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.key ? { "idempotency-key": options.key } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    const json = /^[[{]/.test(text) ? JSON.parse(text) : undefined;
    return { status: response.status, text, json };
  }
  const login = async (school: string, who: { email: string; password: string }): Promise<string> =>
    (await call("POST", "/v1/sessions", { body: { school, email: who.email, password: who.password } })).json.token;

  return {
    app, kobopay, obs, people, call, login,
    async stop() {
      await app.stop();
      await obs.shutdown();
      await kobopay.stop();
      await rm(receiptsDir, { recursive: true, force: true });
    },
  };
}
```

main.tsNode.js only

```ts
import { startFeesDesk } from "./harness.js";

const { app, kobopay, obs, people, call, login, stop } = await startFeesDesk();
const show = (label: string, r: { status: number; text: string }) =>
  console.log(`${label.padEnd(28)} ${r.status} ${r.text.length > 90 ? r.text.slice(0, 87) + "..." : r.text}`);
const pay = (token: string, bill: number, key: string, amountKobo: number, cardToken = "tok_visa") =>
  call("POST", `/v1/bills/${bill}/payments`, { token, key, body: { amountKobo, cardToken } });

const ada = await login("greenfield", people.ada);
const tunde = await login("unity", people.tunde);
const bills = await call("GET", "/v1/bills", { token: ada });
console.log("ada sees:", bills.json.map((b: { id: number; studentName: string; amountKobo: number }) => `bill ${b.id} ${b.studentName} ${b.amountKobo}`));

const first = await pay(ada, 1, "ada-sept-0001", 20_000_000);
show("ada pays ₦200,000", first);
show("same request, same key", await pay(ada, 1, "ada-sept-0001", 20_000_000));
show("tunde pays a greenfield bill", await pay(tunde, 1, "tunde-sept-01", 100));
show("tunde pays part at unity", await pay(tunde, 3, "tunde-sept-02", 10_000_000));
kobopay.controls.failNext = 2;
show("ada pays rest, 2 x 503", await pay(ada, 1, "ada-sept-0002", 25_000_000));
show("declined card", await pay(tunde, 3, "tunde-sept-03", 28_000_000, "tok_declined"));
console.log("KoboPay charges:", kobopay.controls.chargeCalls, "| retries:", obs.metrics.counter("kobopay.retries").getValue(),
  "| paid at greenfield:", obs.metrics.counter("fees.paid_kobo", { school: "greenfield" }).getValue());

while ((await app.receipts.getStats()).succeeded < 2) await new Promise((resolve) => setTimeout(resolve, 20));
console.log((await call("GET", `/v1/payments/${first.json.id}/receipt`, { token: ada })).text);
console.log("overdue reminders:", await app.runReminders());
console.log(app.notifications.sent.map((notice) => `${notice.to}: ${notice.subject}`).sort());
show("readiness", await call("GET", "/ready"));
await stop();
console.log("after shutdown:", app.lifecycle.state);
```

Output of `npx tsx main.ts`

```ts
ada sees: [ 'bill 1 Chidi Okafor 45000000' ]
ada pays ₦200,000            201 {"id":1,"billId":1,"amountKobo":20000000,"status":"succeeded","receiptKey":null}
same request, same key       201 {"id":1,"billId":1,"amountKobo":20000000,"status":"succeeded","receiptKey":null}
tunde pays a greenfield bill 404 {"error":"Bill 1 was not found","code":"ERR_RESOURCE_NOT_FOUND"}
tunde pays part at unity     400 {"error":"This school does not accept part payments","code":"ERR_VALIDATION_FAILED"}
ada pays rest, 2 x 503       201 {"id":2,"billId":1,"amountKobo":25000000,"status":"succeeded","receiptKey":null}
declined card                402 {"id":3,"billId":3,"amountKobo":28000000,"status":"declined","receiptKey":null}
KoboPay charges: 3 | retries: 2 | paid at greenfield: 45000000
Greenfield Academy, Lekki
Receipt FD-1
Chidi Okafor, First term 2026/27
Paid: ₦200,000.00

overdue reminders: 1
[
  'ada@example.com: Receipt FD-1',
  'ada@example.com: Receipt FD-2',
  'kemi@example.com: Greenfield Academy, Lekki: school fees overdue'
]
readiness                    200 {"ready":true,"checks":{"lifecycle":"ready","database":"up","kobopay":"healthy"}}
after shutdown: disposed
```

Read the story line by line:

- Ada sees one bill: her son's. Kemi's daughter's bill at the same school is not in her list.
- She pays ₦200,000 (Greenfield allows instalments). Her phone sends the same request again with the same key: same payment, and KoboPay still made only one charge for it.
- Tunde, from Unity College, tries to pay Ada's bill: 404. At his own school a part payment is refused, because Unity has not enabled instalments.
- KoboPay fails twice with 503 while Ada pays the rest. Two retries later the payment succeeds. The metrics show two retries and ₦450,000 paid at Greenfield.
- A declined card answers 402 and leaves no trace in the ledger.
- The queue rendered two receipts, stored them and e-mailed them; the reminder job found Kemi's unpaid, overdue bill. Readiness is green, and the shutdown ends with every component disposed.

## Prove it

A story on the screen is not a test. The acceptance suite checks each promise of the brief through the real HTTP API, including the ones that only break under concurrency, slowness or shutdown:

acceptance.tsNode.js only

```ts
import { loadConfig } from "./config.js";
import { startFeesDesk } from "./harness.js";

const results: string[] = [];
async function check(name: string, test: () => Promise<boolean>): Promise<void> {
  const ok = await test().catch((error: Error) => (console.log(`  ${name}: threw ${error.message}`), false));
  results.push(`${ok ? "PASS" : "FAIL"} ${name}`);
}

const desk = await startFeesDesk();
const { app, kobopay, people, call, login } = desk;
const [ada, kemi, tunde, bola] = await Promise.all([
  login("greenfield", people.ada), login("greenfield", people.kemi), login("unity", people.tunde), login("greenfield", people.bola),
]);
const pay = (token: string, bill: number, key: string, amountKobo: number) =>
  call("POST", `/v1/bills/${bill}/payments`, { token, key, body: { amountKobo, cardToken: "tok_visa" } });

await check("a parent sees only their own children's bills", async () => {
  const [mine, bursar] = [await call("GET", "/v1/bills", { token: ada }), await call("GET", "/v1/bills", { token: bola })];
  return mine.json.length === 1 && mine.json[0].guardianId === "u-ada" && bursar.json.length === 2;
});
await check("another school's bill is 404, not 403", async () => (await pay(tunde, 1, "probe-000001", 100)).status === 404);
await check("a bursar may read but not pay", async () => (await pay(bola, 2, "bola-0000001", 45_000_000)).status === 403);
await check("two full payments at once: one wins, one is refused", async () => {
  const both = await Promise.all([pay(kemi, 2, "kemi-tab-0001", 45_000_000), pay(kemi, 2, "kemi-tab-0002", 45_000_000)]);
  return both.map((r) => r.status).sort().join() === "201,400" && kobopay.controls.chargeCalls === 1;
});
await check("a key replays its payment for its owner only, and only for the same payment", async () => {
  const first = await pay(ada, 1, "ada-part-0001", 10_000_000);
  const replay = await pay(ada, 1, "ada-part-0001", 10_000_000);
  const changed = await pay(ada, 1, "ada-part-0001", 100);
  const stranger = await pay(kemi, 1, "ada-part-0001", 10_000_000);
  return first.status === 201 && replay.json.id === first.json.id && changed.status === 409 && stranger.status === 404;
});
await check("no answer from KoboPay: 202 pending, charged once, nothing credited", async () => {
  kobopay.controls.latencyMs = 1500;
  const response = await pay(ada, 1, "ada-slow-0001", 35_000_000);
  kobopay.controls.latencyMs = 0;
  await new Promise((resolve) => setTimeout(resolve, 1700));
  const bill = (await call("GET", "/v1/bills", { token: ada })).json[0];
  return response.status === 202 && response.json.status === "pending" && kobopay.controls.chargeCalls === 3 && bill.paidKobo === 10_000_000;
});
await check("a pending payment holds the amount: no second full payment", async () =>
  (await pay(ada, 1, "ada-again-001", 35_000_000)).status === 400);
await check("a suspended school is refused", async () => {
  await app.db.pg.query("UPDATE schools SET status = 'suspended' WHERE id = 'unity'");
  const refused = (await call("GET", "/v1/bills", { token: tunde })).status === 403;
  await app.db.pg.query("UPDATE schools SET status = 'active' WHERE id = 'unity'");
  return refused;
});
await check("logins are limited per IP, and successful ones count too", async () => {
  const wrong = { school: "greenfield", email: people.ada.email, password: "not-the-password" };
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) statuses.push((await call("POST", "/v1/sessions", { body: wrong })).status);
  return statuses.join(" ") === "401 429 429 429 429 429";
});
await check("a bad setting stops the app before it starts", async () =>
  loadConfig({ FEESDESK_PROVIDER_SECRET: "short" }).then(() => false, (error: Error) => error.name === "ConfigurationError"));
await check("shutdown lets a payment in progress finish", async () => {
  kobopay.controls.latencyMs = 300;
  const inFlight = pay(tunde, 3, "tunde-late-01", 28_000_000);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await desk.stop();
  const response = await inFlight;
  return app.lifecycle.state === "disposed" && response.status === 201;
});
console.log(results.join("\n"));
```

Output of `npx tsx acceptance.ts`

```ts
PASS a parent sees only their own children's bills
PASS another school's bill is 404, not 403
PASS a bursar may read but not pay
PASS two full payments at once: one wins, one is refused
PASS a key replays its payment for its owner only, and only for the same payment
PASS no answer from KoboPay: 202 pending, charged once, nothing credited
PASS a pending payment holds the amount: no second full payment
PASS a suspended school is refused
PASS logins are limited per IP, and successful ones count too
PASS a bad setting stops the app before it starts
PASS shutdown lets a payment in progress finish
```

Three checks deserve a closer look:

- **Two full payments at once**: both requests arrive together. The reservation lets one through; the other finds the first one pending and gets 400. KoboPay was charged once.
- **No answer from KoboPay**: the provider takes 1.5 seconds against a 1-second timeout. After three attempts FeesDesk answers 202 pending and credits nothing, while KoboPay did charge the card once. That gap between the two systems is real and permanent until something reconciles it: exercise 2.
- **The login limit** passes, but look at what it proves: the first wrong password was a 401 and the second a 429. The four successful logins at the start of the suite, all from 127.0.0.1, had used up the budget. In production, a whole school's parents behind one mobile network share an IP, so parents would lock each other out while an attacker spread over many IPs would not be stopped. A test that passes can still describe a bad design.

The same checks, as a Vitest suite for your CI pipeline:

feesdesk.test.ts

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startFeesDesk } from "./harness.js";

let desk: Awaited<ReturnType<typeof startFeesDesk>>;
let ada = "";
let tunde = "";
beforeAll(async () => {
  desk = await startFeesDesk();
  ada = await desk.login("greenfield", desk.people.ada);
  tunde = await desk.login("unity", desk.people.tunde);
}, 30_000); // PGlite start-up and four scrypt password hashes
afterAll(() => desk?.stop());

const pay = (token: string, bill: number, key: string, amountKobo: number, cardToken = "tok_visa") =>
  desk.call("POST", `/v1/bills/${bill}/payments`, { token, key, body: { amountKobo, cardToken } });

describe("paying a bill", () => {
  it("charges once per Idempotency-Key", async () => {
    const first = await pay(ada, 1, "ada-test-0001", 20_000_000);
    const again = await pay(ada, 1, "ada-test-0001", 20_000_000);
    expect(first.status).toBe(201);
    expect(again.json).toEqual(first.json);
    expect(desk.kobopay.controls.chargeCalls).toBe(1);
  });

  it("hides other schools' bills", async () => {
    expect((await pay(tunde, 1, "tunde-test-01", 100)).status).toBe(404);
  });

  it("retries a provider that is briefly down", async () => {
    desk.kobopay.controls.failNext = 2;
    expect((await pay(ada, 1, "ada-test-0002", 25_000_000)).status).toBe(201);
    expect(desk.obs.metrics.counter("kobopay.retries").getValue()).toBe(2);
  });

  it("records a declined card without touching the ledger", async () => {
    const declined = await pay(tunde, 3, "tunde-test-02", 28_000_000, "tok_declined");
    const ledger = await desk.app.db.pg.query("SELECT count(*)::int AS n FROM ledger WHERE school_id = 'unity'");
    expect(declined.status).toBe(402);
    expect(ledger.rows).toEqual([{ n: 0 }]);
  });

  it("writes a receipt and e-mails it", async () => {
    await expect.poll(async () => (await desk.app.receipts.getStats()).succeeded).toBe(2);
    const receipt = await desk.call("GET", "/v1/payments/1/receipt", { token: ada });
    expect(receipt.text).toContain("Paid: ₦200,000.00");
    expect(desk.app.notifications.sent.map((notice) => notice.subject).sort()).toEqual(["Receipt FD-1", "Receipt FD-2"]);
  });
});
```

Terminal on your computer

```bash
$ npx vitest run --reporter=verbose feesdesk.test.ts

 RUN  v5.0.1 ~/feesdesk

 ✓ feesdesk.test.ts > paying a bill > charges once per Idempotency-Key 284ms
 ✓ feesdesk.test.ts > paying a bill > hides other schools' bills 114ms
 ✓ feesdesk.test.ts > paying a bill > retries a provider that is briefly down 539ms
 ✓ feesdesk.test.ts > paying a bill > records a declined card without touching the ledger 231ms
 ✓ feesdesk.test.ts > paying a bill > writes a receipt and e-mails it 241ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  03:06:34
   Duration  32.16s (tests 84%, import 12%, transform 3%)
```

The `beforeAll` needs a 30-second timeout: starting PGlite and hashing four passwords with scrypt took longer than Vitest's default 10 seconds on a busy machine. Slow set-up is a cost you pay in every run, which is one more reason to share one harness per test file.

## What is still missing for production

The core is correct, not finished. These are the gaps a reviewer would find, each one a milestone below:

- **Everything lives in one process**: PGlite, the in-memory cache, queue and rate limiter, and the local receipts folder. Two instances would disagree about all of them.
- **Pending payments are never resolved.** Nothing yet asks KoboPay about them, and a reservation holds the bill until someone does.
- **The event can be lost.** `fee.paid` is published after commit; if the process dies in between, no receipt is ever sent. An outbox table written in the settle transaction fixes that, as in [transactions across services](https://zudojs.oyinlola.site/learn/dist-transactions).
- **The login limit is per IP** and counts successes, as the suite showed.
- **Validation errors say only "Validation failed"**: the HTTP server maps schema errors to 400 without the list of issues. A client team will want the issues.
- **Trace spans are named after the raw path**, so every bill id makes a new span name. Name them after the route pattern.

## Milestones

Each milestone is done when every criterion holds **and is covered by a test** that fails when you break the code it protects. Keep the rules of the core: the school from the session, validation at every edge, permissions before data, money only in transactions, side effects after commit, and every external call with a timeout.

### Milestone 1: accounts and sign-in

- `DELETE /v1/sessions` logs out; the old token then gets 401. Sessions expire after 8 hours, and a nightly scheduled job deletes expired rows.
- Wrong passwords are limited per school and e-mail, and a success clears the count (exercise 1). A parent at the same IP is never locked out by another parent.
- Browser clients get the token in an `HttpOnly; Secure; SameSite=Lax` cookie, and state-changing routes check a CSRF token from `@zudojs/security` ([the security lesson](https://zudojs.oyinlola.site/learn/zudo-security)).
- School staff sign in with Google through `@zudojs/auth-oauth` with PKCE and state ([the OAuth lesson](https://zudojs.oyinlola.site/learn/zudo-oauth)), linked to a membership only by a verified e-mail. A Google account without a membership gets 403, not a new account.

### Milestone 2: school administration

- An `admin` role manages students, guardians and bursars of its own school only; an admin of Greenfield cannot touch Unity.
- The admin API is built from `@zudojs/api` operations ([the API operations lesson](https://zudojs.oyinlola.site/learn/zudo-api)): every operation has an input and output schema, and the same operation runs over HTTP and in a test without HTTP.
- "Bill every student for the term" runs as a queue job per class, is idempotent per student and term (running it twice creates no duplicates), and reports progress.
- Every list is paginated with a cursor ([pagination and versioning](https://zudojs.oyinlola.site/learn/api-pagination-versioning)) and returns at most 100 rows.

### Milestone 3: payments, complete

- A scheduled reconciliation job finds payments pending for more than 10 minutes, asks the provider about each reference, and settles them exactly as `settle` does. A test makes KoboPay slow, checks the 202, runs the job, and finds the bill credited once (exercise 2).
- KoboPay's webhook (`POST /v1/webhooks/kobopay`) is accepted only with a valid HMAC signature and a fresh timestamp, and settles payments idempotently: the same webhook twice changes nothing.
- `fee.paid` is written to an `outbox` table in the settle transaction, and a relay publishes it; killing the process between commit and publish still produces a receipt.
- A bursar can refund a payment: the adapter's refund, a reversing pair of ledger rows, and the bill's `paid_kobo` reduced, in one transaction after the provider confirms. The ledger's sum per school is always zero.
- A bursar can record a cash payment with a mandatory note; it appears in the ledger under a different account.

### Milestone 4: communication and extension

- Notifications move into their own service: the same procedures served with `createRPCFetchHandler` over HTTP with a service token, called with a timeout and retries, and `traceparent` propagated so one payment is one trace across both services.
- Schools send announcements to all parents of a class through `@zudojs/messaging` ([the messaging lesson](https://zudojs.oyinlola.site/learn/zudo-messaging)), with at-least-once delivery and a handler that is safe to run twice.
- An "SMS receipts" plugin built with `@zudojs/plugins` ([the plugins lesson](https://zudojs.oyinlola.site/learn/zudo-plugins)) can be enabled per school without changing billing, and a failing plugin cannot fail a payment.
- A school can switch to a second provider adapter behind the same `PaymentProvider` contract, chosen per school by configuration; the acceptance suite runs against both fakes.

### Milestone 5: production

- PostgreSQL with a `pg` pool replaces PGlite; the transaction adapter takes one client per transaction. Row-level security enforces the school on every table, as in [the multi-tenant SaaS use case](https://zudojs.oyinlola.site/learn/usecase-saas), and a test proves a query without the school filter returns nothing.
- The cache, the queue and the rate limiter use Redis; receipts use object storage with private keys and short-lived download links ([file uploads](https://zudojs.oyinlola.site/learn/zudo-file-uploads)).
- Logs are JSON with a request id and trace id; metrics are exported and a dashboard shows payments per minute, declines, retries, pending payments older than 10 minutes and p95 latency, with an alert on the last two ([observability](https://zudojs.oyinlola.site/learn/zudo-observability)).
- Docker image, CI pipeline (type check, unit, acceptance, build, security audit) and a deployment with migrations before start, per [Deploying a ZudoJS app](https://zudojs.oyinlola.site/learn/deployment) and [CI/CD](https://zudojs.oyinlola.site/learn/zudo-ci-cd). A database backup has been restored into a test environment.
- A load test of 50 payments per second for 5 minutes shows no double charge, no overpaid bill and p95 below 800 ms ([performance](https://zudojs.oyinlola.site/learn/zudo-performance)). The [production security review](https://zudojs.oyinlola.site/learn/zudo-production-security) has no open high findings.

### Milestone 6: modules, then services

- The code moves into a project created with `zudojs create --architecture modular-monolith`, with modules `identity`, `billing` and `notices`, started by `@zudojs/runtime` and `@zudojs/core` modules instead of the hand-made lifecycle ([core](https://zudojs.oyinlola.site/learn/zudo-core), [runtime](https://zudojs.oyinlola.site/learn/zudo-runtime)). A test fails if one module imports another's private files.
- Billing talks to notices only through events and the RPC contract; the contract is versioned ([contracts between services](https://zudojs.oyinlola.site/learn/dist-contracts)).
- Notifications is extracted into a separate deployable service first, because it has the clearest boundary and no money. Billing stays in the monolith until a measured reason says otherwise ([architecture styles](https://zudojs.oyinlola.site/learn/arch-styles)).

## The graduation standard

The academy began with "what is a program?". It ends with this list. A graduate can do every item on it without help, and can explain the trade-offs to a colleague. Go through it honestly: where you hesitate, the linked lesson is your next step.

| You can… | Learn it in | FeesDesk |
| --- | --- | --- |
| Reason about a problem before coding: inputs, edge cases, what can fail, what can be trusted | [Logical reasoning](https://zudojs.oyinlola.site/learn/think-reasoning), [Decomposition](https://zudojs.oyinlola.site/learn/think-decomposition) | [The payment questions](#think) |
| Write clear, correct JavaScript and TypeScript, and model a domain with types | [Functions](https://zudojs.oyinlola.site/learn/js-functions), [Domain modelling](https://zudojs.oyinlola.site/learn/ts-domain-modeling) | Every file |
| Handle asynchronous work, concurrency and cancellation | [Concurrency](https://zudojs.oyinlola.site/learn/js-concurrency), [The event loop](https://zudojs.oyinlola.site/learn/js-event-loop) | Timeouts, the race tests |
| Choose data structures and algorithms by their cost | [Complexity](https://zudojs.oyinlola.site/learn/dsa-complexity) | Queries, indexes, caches |
| Design a relational schema whose constraints enforce the rules | [Data modelling](https://zudojs.oyinlola.site/learn/db-modeling), [Database transactions](https://zudojs.oyinlola.site/learn/db-transactions) | [The schema](#database) |
| Design an HTTP API: resources, status codes, idempotency, pagination | [REST design](https://zudojs.oyinlola.site/learn/rest-design), [Idempotency](https://zudojs.oyinlola.site/learn/api-idempotency) | 201/202/402, Idempotency-Key |
| Start and grow a ZudoJS project with the CLI, and review what it generates | [A whole project through the CLI](https://zudojs.oyinlola.site/learn/zudo-cli-project) | Milestone 6 |
| Compose an application at one composition root with DI | [DI architecture](https://zudojs.oyinlola.site/learn/zudo-di-architecture), [The container](https://zudojs.oyinlola.site/learn/zudo-container) | [app.ts](#root) |
| Validate configuration and input at every boundary | [Configuration](https://zudojs.oyinlola.site/learn/zudo-config), [Validation](https://zudojs.oyinlola.site/learn/zudo-validation) | [config.ts](#config), schemas |
| Map errors to responses without leaking internals | [Errors](https://zudojs.oyinlola.site/learn/zudo-errors), [Error design](https://zudojs.oyinlola.site/learn/js-error-design) | The edge middleware |
| Route, compose middleware and document an API | [Routing](https://zudojs.oyinlola.site/learn/zudo-routing), [Pipelines](https://zudojs.oyinlola.site/learn/zudo-middleware-pipelines), [OpenAPI](https://zudojs.oyinlola.site/learn/zudo-openapi) | [http.ts](#http) |
| Authenticate users and store secrets safely | [Authentication](https://zudojs.oyinlola.site/learn/sec-authentication), [ZudoJS auth](https://zudojs.oyinlola.site/learn/zudo-auth), [Crypto](https://zudojs.oyinlola.site/learn/zudo-crypto) | [identity.ts](#identity) |
| Sign users in with OAuth and OpenID Connect | [OAuth](https://zudojs.oyinlola.site/learn/sec-oauth), [ZudoJS OAuth](https://zudojs.oyinlola.site/learn/zudo-oauth) | Milestone 1 |
| Authorize with roles and attributes, and choose 404 over 403 when it matters | [Permissions](https://zudojs.oyinlola.site/learn/zudo-permissions) | [access.ts](#access) |
| Isolate tenants in every query, cache, job and file | [Tenancy](https://zudojs.oyinlola.site/learn/zudo-tenancy), [Multi-tenant SaaS](https://zudojs.oyinlola.site/learn/usecase-saas) | Every query, `runAs` |
| Defend against the web's attacks and review a system's security | [Web attacks](https://zudojs.oyinlola.site/learn/sec-web), [Injection](https://zudojs.oyinlola.site/learn/sec-injection), [Security review](https://zudojs.oyinlola.site/learn/zudo-production-security) | Parameterised SQL, headers, limits |
| Keep money and other invariants correct with transactions and constraints | [Transactions](https://zudojs.oyinlola.site/learn/zudo-transactions), [ShopFlow](https://zudojs.oyinlola.site/learn/capstone-shopflow) | [Reserve and settle](#billing) |
| Separate commands from queries and react to events | [CQRS](https://zudojs.oyinlola.site/learn/zudo-cqrs), [Events](https://zudojs.oyinlola.site/learn/zudo-events), [Event-driven apps](https://zudojs.oyinlola.site/learn/zudo-event-driven) | PayBill, fee.paid |
| Move work to queues and schedules that retry safely | [Queues](https://zudojs.oyinlola.site/learn/zudo-queue), [Scheduler](https://zudojs.oyinlola.site/learn/zudo-scheduler) | [notices.ts](#after) |
| Call other services with contracts, timeouts and retries | [Calling services with RPC](https://zudojs.oyinlola.site/learn/zudo-rpc), [Failure engineering](https://zudojs.oyinlola.site/learn/dist-reliability) | [chargeWithRetry](#provider) |
| Hide external providers behind adapters | [Adapters](https://zudojs.oyinlola.site/learn/zudo-adapters) | PaymentProvider |
| Handle unknown outcomes and consistency across systems | [Transactions across services](https://zudojs.oyinlola.site/learn/dist-transactions), [Distributed fundamentals](https://zudojs.oyinlola.site/learn/dist-fundamentals) | 202 pending, Milestone 3 |
| Release features gradually and per customer | [Feature flags](https://zudojs.oyinlola.site/learn/zudo-feature-flags) | installments |
| Cache without serving stale or foreign data | [Cache](https://zudojs.oyinlola.site/learn/zudo-cache), [Caching](https://zudojs.oyinlola.site/learn/backend-caching) | Tagged per school |
| Store and serve files safely | [Storage](https://zudojs.oyinlola.site/learn/zudo-storage), [File uploads](https://zudojs.oyinlola.site/learn/zudo-file-uploads) | Receipts |
| Extend an application with messaging and plugins | [Messaging](https://zudojs.oyinlola.site/learn/zudo-messaging), [Plugins](https://zudojs.oyinlola.site/learn/zudo-plugins) | Milestone 4 |
| Start, stop and drain an application in dependency order | [Lifecycle](https://zudojs.oyinlola.site/learn/zudo-lifecycle), [Runtime](https://zudojs.oyinlola.site/learn/zudo-runtime) | The shutdown test |
| Observe a system: logs, metrics, traces, health and readiness | [Logging](https://zudojs.oyinlola.site/learn/zudo-logging), [Observability](https://zudojs.oyinlola.site/learn/zudo-observability), [Production engineering](https://zudojs.oyinlola.site/learn/production-engineering) | The edge middleware, `/ready` |
| Test every layer, including concurrency, failure and shutdown | [Testing strategies](https://zudojs.oyinlola.site/learn/testing-strategies), [Testing ZudoJS apps](https://zudojs.oyinlola.site/learn/zudo-testing-apps) | [The acceptance suite](#prove) |
| Debug by method, not by guessing | [The debugging method](https://zudojs.oyinlola.site/learn/debug-method) | The transaction trap |
| Build, ship and operate: containers, CI, migrations, performance | [Deployment](https://zudojs.oyinlola.site/learn/deployment), [CI/CD](https://zudojs.oyinlola.site/learn/zudo-ci-cd), [Performance](https://zudojs.oyinlola.site/learn/zudo-performance) | Milestone 5 |
| Choose an architecture and change it when the evidence says so | [Architecture styles](https://zudojs.oyinlola.site/learn/arch-styles), [Modular monolith](https://zudojs.oyinlola.site/learn/zudo-modular-monolith), [Microservices](https://zudojs.oyinlola.site/learn/zudo-microservices) | Milestone 6 |
| Serialize data that crosses service boundaries, and version its contracts | [Serialization](https://zudojs.oyinlola.site/learn/zudo-serialization), [Contracts between services](https://zudojs.oyinlola.site/learn/dist-contracts) | Milestone: the RPC service split |
| Scale the system: find the real bottleneck by measuring, then fix that | [Diagnosing performance](https://zudojs.oyinlola.site/learn/zudo-performance) | Milestone: production |
| Read a framework's source to answer "how does this really work?" | [Reading ZudoJS internals](https://zudojs.oyinlola.site/learn/zudo-internals) | Why `afterCommit` detaches |
| Extend ZudoJS with your own packages and plugins | [Creating a ZudoJS package](https://zudojs.oyinlola.site/learn/zudo-create-package), [Building a complete ZudoJS plugin](https://zudojs.oyinlola.site/learn/zudo-create-plugin) | Milestone: plugins |

## Practice

TRY IT YOURSELF

### A login limit that fits a school

Replace the per-IP login limit. Count only *failed* logins, per school and e-mail, allow 5 in 15 minutes, clear the count on a success, and keep refusing a locked account even when the right password arrives. Use `createRateLimiter`'s `keyGenerator`.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Pass `keyGenerator: (request) => String(request.headers?.["x-login-account"])` to `createRateLimiter`, the same way the reset limiter reads `"x-reset-account"`.

HINT 2

Check `failures.getCount(key) >= 5` first and throw before anything else. Only call `failures.check(request)` on a wrong password (that is what counts the failure), and only call `failures.reset(key)` on a right one.

SOLUTION

login-limit.tsNode.js only

```ts
import { RateLimitError } from "@zudojs/errors";
import { createRateLimiter } from "@zudojs/security";

// One budget per school + e-mail, counting only failures, cleared by a success.
const failures = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 5,
  keyGenerator: (request) => String(request.headers?.["x-login-account"]),
});

async function login(school: string, email: string, passwordOk: boolean): Promise<string> {
  const request = { headers: { "x-login-account": `${school}/${email.trim().toLowerCase()}` } };
  if (failures.getCount(String(request.headers["x-login-account"])) >= 5) throw new RateLimitError("Too many failed logins; try again later");
  if (!passwordOk) {
    failures.check(request);
    return "401";
  }
  failures.reset(String(request.headers["x-login-account"]));
  return "201";
}

const attempt = (email: string, ok: boolean) => login("greenfield", email, ok).catch((error: Error) => String((error as RateLimitError).statusCode));
const results: string[] = [];
for (let i = 0; i < 3; i++) results.push(await attempt("ada@example.com", true));
for (let i = 0; i < 6; i++) results.push(await attempt("Ada@Example.com", false));
results.push(await attempt("ada@example.com", true), await attempt("kemi@example.com", true));
console.log(results.join(" "));
failures.destroy();
```

Output of `npx tsx login-limit.ts`

```ts
201 201 201 401 401 401 401 401 429 429 201
```

Three correct logins, five wrong ones (401), then the lock (429), which also refuses the correct password: otherwise the lock would only slow an attacker down until they guess right. Kemi, on the same network, is unaffected. The e-mail is normalised before it becomes a key, so `Ada@Example.com` cannot get a second budget. In FeesDesk this goes in `identity.login`, where the school and e-mail are known, and the lock should expire (the window) rather than last forever, or an attacker could lock parents out on purpose.

TRY IT YOURSELF

### Reconcile a pending payment

Payment 7 was left pending because KoboPay did not answer in time. Show that the reconciliation job can safely resend the charge with the same reference, and list what the job must do after it gets the answer.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

`chargeWithRetry(...).then((r) => r.status, (error: Error) => error.name)` turns either outcome into a string you can log, without a `try`/`catch`.

HINT 2

After setting `kobopay.controls.latencyMs = 0`, `await new Promise((resolve) => setTimeout(resolve, 1700))` gives KoboPay's delayed first answer time to arrive before you call `chargeWithRetry` again with the identical `request` object.

SOLUTION

reconcile.tsNode.js only

```ts
import { startKoboPay } from "./kobopay-server.js";
import { chargeWithRetry, KoboPayAdapter } from "./payment-provider.js";

const secret = `sk_test_${crypto.randomUUID()}`;
const kobopay = await startKoboPay(secret);
const provider = new KoboPayAdapter(kobopay.url, secret);
const request = { reference: "fd_greenfield_7", amountKobo: 35_000_000, cardToken: "tok_visa" };

kobopay.controls.latencyMs = 1500;
const during = await chargeWithRetry(provider, request, 1000).then((r) => r.status, (error: Error) => error.name);
console.log("during the request:", during, "-> payment 7 stays pending");

kobopay.controls.latencyMs = 0;
await new Promise((resolve) => setTimeout(resolve, 1700));
// The reconciliation job, minutes later: the same reference is safe to send again.
const later = await chargeWithRetry(provider, request, 1000);
console.log("reconciliation:", JSON.stringify(later), "| charges made:", kobopay.controls.chargeCalls);
await kobopay.stop();
```

Output of `npx tsx reconcile.ts`

```ts
during the request: RPCTimeoutError -> payment 7 stays pending
reconciliation: {"status":"succeeded","chargeId":"ch_1"} | charges made: 1
```

The first call timed out, but KoboPay charged the card. The reconciliation call, with the same reference, returned the *same* charge, `ch_1`, and KoboPay's charge count is still 1. That is only safe because the provider is idempotent per reference; with a provider that is not, the job must use a "look up charge by reference" endpoint instead and never charge again. After the answer, the job enters the school with `runAs` and calls exactly the same `settle` as the request would have: succeeded credits the bill, writes the ledger and publishes `fee.paid`; declined releases the reservation. Run it every few minutes from the scheduler for payments pending longer than 10 minutes, and alert when one stays pending for an hour.

TRY IT YOURSELF

### Where does it go?

For each new requirement, name the file(s) of the core that change, and the one test you would write first: (a) a bursar records a cash payment; (b) Unity College enables instalments; (c) receipts must also go by SMS; (d) a school is suspended for not paying FeesDesk.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Match each requirement to the file that owns that concern: `access.ts` decides who may do what, `billing.ts` holds the money rules, `notices.ts` holds what happens after a payment, and `app.ts` wires flags and dependencies together.

HINT 2

For (b) and (d), a column or a mechanism already in [the schema](#database) and [identity.ts](#identity) does most of the work before you write a single new line — look for what already refuses a request, rather than reaching for new code.

HINT 3

For (c), ask which existing handler already reacts to `fee.paid`, and what a second one next to it would need from the payment that the first one does not.

SOLUTION

- (a) `access.ts` (bursar may `bill:record-cash`), a new `RecordCashPayment` command handled in `billing.ts` that reuses `reserve` and `settle` with a `cash` ledger account, and a route in `http.ts`. First test: a parent sending the same request gets 403, and the ledger still sums to zero.
- (b) Only the flag's rules in `app.ts` (or, in production, the flag provider's data): add `"unity"` to the tenant rule. No code in billing changes. First test: a part payment at Unity answers 201.
- (c) A new handler of `fee.paid` (or a plugin, Milestone 4) that queues an SMS job; billing does not change. First test: a failing SMS provider does not fail the payment and the job is retried.
- (d) Nothing: the `schools.status` column and the tenant manager's `requireActive` already refuse it. First test: already in the acceptance suite. Decide what the reminder job and pending reconciliations should do for a suspended school, and test that too.

## Summary

- FeesDesk's vertical slice, a parent paying a term fee, runs end to end over real HTTP: session and school, permissions, validation, a provider adapter with timeouts and retries, a reservation and a settlement in transactions, a double-entry ledger, an event after commit, a queued receipt in storage, an RPC notification, a daily reminder, metrics, traces, readiness and graceful shutdown.
- Money rules live in three places at once: the code (reserve, settle), the database (constraints and unique keys) and the protocol (idempotency keys and provider references). Any one of them alone has a gap.
- A timeout is not a failure. An unknown outcome is answered with "pending" and settled later by reconciliation.
- Tenancy is carried by the session into every query, cache key, job and file key, and background work re-enters the school explicitly.
- The acceptance suite tests the promises, not the functions, and it found a design problem no type checker could: a login limit that punishes shared networks (Exercise 1). `afterCommit` callbacks run detached from the transaction that registered them, so background work triggered from one starts its own transaction rather than inheriting a closed one.
- Six milestones finish the product; the graduation table tells you where to go for any item you cannot yet do alone.

One step is left: [the final challenge](https://zudojs.oyinlola.site/learn/final-challenge), where you take someone else's broken feature and make it production-ready on your own.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
