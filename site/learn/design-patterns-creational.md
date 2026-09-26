---
title: "Creational patterns — ZudoJS Academy"
description: "Fix real object-creation bugs with factories, abstract factories and builders, then see why a DI container's singleton lifetime beats the singleton pattern."
source: https://zudojs.oyinlola.site/learn/design-patterns-creational
---

LEVEL 11 · LESSON 3 OF 12

Design patterns Core

# Creational patterns

Fix real object-creation bugs with factories, abstract factories and builders, then see why a DI container's singleton lifetime beats the singleton pattern.

- **55 min** to read and try
- **You need:** SOLID, DRY, KISS and YAGNI, Classes in TypeScript and SQL basics
- **You build:** A payment provider factory routed by country, per-environment infrastructure families, an immutable SQL query builder run against PostgreSQL, and a singleton replaced by a container lifetime

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Replace creation logic copied across a codebase with one factory that fails fast on unknown input
- Use an abstract factory to guarantee that infrastructure parts come from the same environment
- Decide between an options object and a builder, and write an immutable builder that produces parameterised SQL
- Explain why tests that share a singleton depend on their order, and replace it with a lifetime chosen in the composition root
- Recognise where ZudoJS uses factories and lifetimes

## The refund that went to the wrong provider

A shop sells across West and East Africa. Each country uses a different payment provider: Paystack in Nigeria, Flutterwave in Ghana, and since June, M-Pesa in Kenya. The code that picks the provider was written with `if`s, and then copied: once in the checkout, once in the refund handler, and once in the webhook that confirms payments. When Kenya launched, the developer found two of the three copies:

problem.ts

```ts
interface Charge {
  readonly provider: string;
  readonly reference: string;
  readonly amountKobo: number;
}

// checkout.ts
function chargeCustomer(country: string, amountKobo: number): Charge {
  if (country === "NG") return { provider: "paystack", reference: "PSK-1", amountKobo };
  if (country === "GH") return { provider: "flutterwave", reference: "FLW-1", amountKobo };
  if (country === "KE") return { provider: "mpesa", reference: "MP-1", amountKobo }; // added in June
  throw new Error(`no payment provider for ${country}`);
}

// refunds.ts, written two years ago
function refundCustomer(country: string, charge: Charge): string {
  if (country === "NG") return `paystack refunds ${charge.reference}`;
  if (country === "GH") return `flutterwave refunds ${charge.reference}`;
  return `stripe refunds ${charge.reference}`; // the old default
}

const charge = chargeCustomer("KE", 500_000);
console.log(charge);
console.log(refundCustomer("KE", charge));
```

Output of `npx tsx problem.ts` and of the browser terminal

```json
{ provider: 'mpesa', reference: 'MP-1', amountKobo: 500000 }
stripe refunds MP-1
```

Every Kenyan refund is sent to Stripe, which has never heard of charge `MP-1`. The customer waits for money that never comes. The bug is not in any single line. The knowledge "which provider serves which country, and how to build it" is *copied*, so the copies drifted apart: the DRY problem from [the last lesson](https://zudojs.oyinlola.site/learn/design-solid#dry), in the specific form of **object creation**.

Creating objects is where a lot of design goes wrong: `new` spread across the code ties every caller to concrete classes, their constructor arguments and their configuration. The **creational patterns** are named solutions to recurring creation problems. A **design pattern** is a well-known, reusable shape of solution to a problem that keeps coming up; the classic catalogue is the 1994 book *Design Patterns* by Gamma, Helm, Johnson and Vlissides (the "Gang of Four"). The names are the useful part: "put a factory here" says in three words what would otherwise take a paragraph.

This lesson covers four: **factory**, **abstract factory**, **builder** and **singleton**. Each starts from a bug like the one above. They are written in TypeScript with functions and small classes, as [Object-oriented TypeScript](https://zudojs.oyinlola.site/learn/ts-oop) and [Functional TypeScript](https://zudojs.oyinlola.site/learn/ts-functional) taught, not as the deep class hierarchies of the 1994 book.

## Factory: one place that knows how to build it

REASON IT OUT

### Choosing a payment provider: what can go wrong?

Before writing the factory, think through the creation problem itself:

- What should happen for a country the shop does not serve yet, such as `"ZA"`? When should you find out: at the first South African checkout, or earlier?
- Each provider needs a secret key. What if the Kenyan key is missing from the production configuration?
- A customer paid in Kenya and later moved to Ghana. Which provider must refund them?
- Next year, Kenya switches from M-Pesa to Flutterwave. What happens to refunds of payments made before the switch?
- How will tests get a provider that does not move money?

**Show the reasoning**

- An unknown country is a programming or configuration error. It should fail loudly with a clear message, and a startup check should try every configured country so the error appears at deploy time, not when a customer pays.
- Also fail fast: the factory should refuse to build a provider without its key, at startup. A provider that fails on the first charge is much worse.
- The provider that *took* the payment, whatever the customer's country is now. So a charge must record the provider's name, and refunds must build the provider from that name, not from the country.
- Same answer: routing (country → provider) and construction (provider name → object) are two separate facts. Changing the routing must not change which provider refunds old charges.
- The service should receive the factory as a dependency, so a test can pass one that builds fakes.

A **factory** is a function (or a method) whose job is to create objects, so that callers ask for "a payment provider for Kenya" instead of calling `new` on a specific class. Following the reasoning above, the shop gets two small, separate tables: one that routes countries to provider names, and one that knows how to build each provider:

payments.ts

```ts
export type Country = "NG" | "GH" | "KE";
export type ProviderName = "paystack" | "flutterwave" | "mpesa";

export interface PaymentProvider {
  readonly name: ProviderName;
  charge(amountKobo: number): Promise<{ readonly provider: ProviderName; readonly chargeId: string }>;
  refund(chargeId: string): Promise<string>;
}

export type ProviderKeys = Readonly<Record<ProviderName, string | undefined>>;

function simulatedProvider(name: ProviderName, prefix: string, key: string | undefined): PaymentProvider {
  if (!key) throw new Error(`missing secret key for ${name}`);
  let next = 1;
  return {
    name,
    async charge() {
      return { provider: name, chargeId: `${prefix}-${next++}` };
    },
    async refund(chargeId) {
      return `${name} refunded ${chargeId}`;
    },
  };
}

const builders: Record<ProviderName, (keys: ProviderKeys) => PaymentProvider> = {
  paystack: (keys) => simulatedProvider("paystack", "PSK", keys.paystack),
  flutterwave: (keys) => simulatedProvider("flutterwave", "FLW", keys.flutterwave),
  mpesa: (keys) => simulatedProvider("mpesa", "MP", keys.mpesa),
};

const routes: Record<Country, ProviderName> = { NG: "paystack", GH: "flutterwave", KE: "mpesa" };

export function providerFor(country: string): ProviderName {
  if (!Object.hasOwn(routes, country)) throw new Error(`no payment provider for country "${country}"`);
  return routes[country as Country];
}

export function createPaymentProvider(name: ProviderName, keys: ProviderKeys): PaymentProvider {
  return builders[name](keys);
}
```

The simulated providers stand in for real SDK clients so the example runs anywhere; [Structural patterns](https://zudojs.oyinlola.site/learn/design-patterns-structural#adapter) shows how a real SDK is wrapped to fit an interface like `PaymentProvider`. Now the checkout and the refund handler ask the factory, and the charge carries the provider's name:

factory-test.ts

```ts
import { createPaymentProvider, providerFor, type ProviderKeys } from "./payments.js";

const keys: ProviderKeys = { paystack: "sk_test_ng", flutterwave: "sk_test_gh", mpesa: "sk_test_ke" };
const check = (name: string, ok: boolean) => console.log(`${ok ? "PASS" : "FAIL"} ${name}`);

// checkout: route by country, remember who took the money
const charge = await createPaymentProvider(providerFor("KE"), keys).charge(500_000);
console.log(charge);

// refund: build the provider that took the payment, not the one for the country
console.log(await createPaymentProvider(charge.provider, keys).refund(charge.chargeId));

try {
  providerFor("ZA");
} catch (error) {
  console.log((error as Error).message);
}
try {
  createPaymentProvider("mpesa", { ...keys, mpesa: undefined });
} catch (error) {
  console.log((error as Error).message);
}

const countries = ["NG", "GH", "KE"];
check("every served country builds at startup", countries.every((c) => createPaymentProvider(providerFor(c), keys)));
```

Output of `npx tsx factory-test.ts` and of the browser terminal

```json
{ provider: 'mpesa', chargeId: 'MP-1' }
mpesa refunded MP-1
no payment provider for country "ZA"
missing secret key for mpesa
PASS every served country builds at startup
```

The last line is a **startup check**: building every provider once when the application starts turns a missing key into a failed deploy instead of a failed payment.

### Let the compiler keep the tables complete

The tables are typed as `Record<Country, …>` and `Record<ProviderName, …>`, not as plain objects. A `Record` over a union requires a key for *every* member. When someone adds South Africa to `Country` but forgets the route, the code does not compile, which is exactly the check the copied `if`s never had:

record-complete.ts

```ts
type Country = "NG" | "GH" | "KE" | "ZA";
type ProviderName = "paystack" | "flutterwave" | "mpesa";

const routes: Record<Country, ProviderName> = { NG: "paystack", GH: "flutterwave", KE: "mpesa" };
console.log(routes);
```

What `npx tsc --noEmit` prints

```ts
record-complete.ts:4:7 - error TS2741: Property 'ZA' is missing in type '{ NG: "paystack"; GH: "flutterwave"; KE: "mpesa"; }' but required in type 'Record<Country, ProviderName>'.

4 const routes: Record<Country, ProviderName> = { NG: "paystack", GH: "flutterwave", KE: "mpesa" };
        ~~~~~~


Found 1 error in record-complete.ts:4
```

### Kinds of factory

| Form | Example | Use it when |
| --- | --- | --- |
| **Factory function** | `createPaymentProvider(name, keys)` | the caller should not know which class it gets. The everyday form in TypeScript. |
| **Static factory method** (named constructor) | `Order.create(…)` in [Design principles](https://zudojs.oyinlola.site/learn/design-principles#encapsulation), `Money.fromNaira(12.5)` | construction must validate or compute, or several ways to create need clear names. |
| **Factory method** (the Gang of Four version) | a base class calls `this.createProvider()`, subclasses override it | rarely in TypeScript. Passing a factory function in does the same job without inheritance. |
| **Injected factory** | a service receives `makeProvider: (name) => PaymentProvider` | the service must create objects at run time (one per request or per country) and tests must control what it creates. |

The last row matters for testing. A service that calls `createPaymentProvider` directly is coupled to the real providers again. A service that *receives* the factory lets a test pass `() => fakeProvider`, the same move as injecting the gateway in [Design principles](https://zudojs.oyinlola.site/learn/design-principles#coupling).

## Abstract factory: parts that must match

The shop lets customers upload photos of damaged deliveries. The web server stores the file and queues a job; a worker process makes a thumbnail. Storage and queue are each configurable, with `STORAGE=disk|s3` and `QUEUE=memory|redis`. On the new staging server someone copied the queue setting from production and the storage setting from a laptop:

mixed-family.ts

```ts
const bucket = new Map<string, string>(); // stands in for S3: every machine sees it
const redisList: { job: string; key: string }[] = []; // stands in for Redis: every machine sees it

function diskStorage(disk: Map<string, string>) {
  return { put: (key: string, body: string) => void disk.set(key, body), get: (key: string) => disk.get(key) };
}

// staging: STORAGE=disk (from a laptop .env), QUEUE=redis (from production)
const webMachineDisk = new Map<string, string>();
diskStorage(webMachineDisk).put("uploads/7.jpg", "<jpeg bytes>");
redisList.push({ job: "thumbnail", key: "uploads/7.jpg" });

// the worker runs on another machine, with its own disk
const workerMachineDisk = new Map<string, string>();
for (const job of redisList) {
  console.log(`worker: ${job.job} ${job.key} ->`, diskStorage(workerMachineDisk).get(job.key) ?? "file not found");
}
console.log("files in the shared bucket:", bucket.size);
```

Output of `npx tsx mixed-family.ts` and of the browser terminal

```ts
worker: thumbnail uploads/7.jpg -> file not found
files in the shared bucket: 0
```

Each setting was valid on its own. The *combination* is broken: a shared queue announces a file that lives on one machine's local disk. Disk storage only works with an in-process queue (everything on one machine), and a shared queue only works with shared storage. These parts form a **family**, and families must not be mixed.

An **abstract factory** is an object that creates a whole family of related objects, so that picking the factory picks every part at once. The configuration changes from two independent switches to one:

infrastructure.ts

```ts
export interface FileStorage {
  readonly kind: string;
  put(key: string, body: string): Promise<void>;
  get(key: string): Promise<string | undefined>;
}

export interface JobQueue {
  readonly kind: string;
  enqueue(job: string, key: string): Promise<void>;
  take(): Promise<{ job: string; key: string } | undefined>;
}

export interface Infrastructure {
  readonly name: string;
  createStorage(): FileStorage;
  createQueue(): JobQueue;
}

/** One machine: local disk and an in-process queue. */
export function localInfrastructure(): Infrastructure {
  const disk = new Map<string, string>();
  const jobs: { job: string; key: string }[] = [];
  return {
    name: "local",
    createStorage: () => ({ kind: "disk", put: async (k, b) => void disk.set(k, b), get: async (k) => disk.get(k) }),
    createQueue: () => ({ kind: "memory", enqueue: async (job, key) => void jobs.push({ job, key }), take: async () => jobs.shift() }),
  };
}

/** Many machines: shared object storage and a shared queue (simulated here by one shared object). */
export function cloudInfrastructure(cloud: { bucket: Map<string, string>; list: { job: string; key: string }[] }): Infrastructure {
  return {
    name: "cloud",
    createStorage: () => ({ kind: "s3", put: async (k, b) => void cloud.bucket.set(k, b), get: async (k) => cloud.bucket.get(k) }),
    createQueue: () => ({ kind: "redis", enqueue: async (job, key) => void cloud.list.push({ job, key }), take: async () => cloud.list.shift() }),
  };
}

export type Environment = "local" | "cloud";
```

In a real project, `cloudInfrastructure` would wrap the AWS SDK and a Redis client, and the `cloud` parameter would be their connection settings. Here a shared object plays both services, so the example runs. The upload flow and the worker only see `FileStorage` and `JobQueue`; the composition root chooses the family:

families-test.ts

```ts
import { cloudInfrastructure, localInfrastructure, type Infrastructure } from "./infrastructure.js";

async function upload(infra: Infrastructure): Promise<void> {
  await infra.createStorage().put("uploads/7.jpg", "<jpeg bytes>");
  await infra.createQueue().enqueue("thumbnail", "uploads/7.jpg");
}

async function work(infra: Infrastructure): Promise<string> {
  const job = await infra.createQueue().take();
  if (job === undefined) return "no job";
  const file = await infra.createStorage().get(job.key);
  return `${infra.name}: ${job.job} ${job.key} -> ${file ?? "file not found"}`;
}

// local: web and worker share one process, so they share one family instance
const local = localInfrastructure();
await upload(local);
console.log(await work(local));

// cloud: two machines, two family instances, one shared cloud
const cloud = { bucket: new Map<string, string>(), list: [] as { job: string; key: string }[] };
const webMachine = cloudInfrastructure(cloud);
const workerMachine = cloudInfrastructure(cloud);
await upload(webMachine);
console.log(await work(workerMachine));
```

Output of `npx tsx families-test.ts` and of the browser terminal

```ts
local: thumbnail uploads/7.jpg -> <jpeg bytes>
cloud: thumbnail uploads/7.jpg -> <jpeg bytes>
```

Mixing disk with Redis is no longer something a configuration file can express. That is the point of the pattern: it turns "these must match" from a rule people must remember into a structure the code enforces. A test environment is one more family, whose parts record what happened.

> NOTE
>
> In modern TypeScript the "abstract factory" is often just an object of factory functions, or one module per environment, chosen in the composition root. A DI container with a set of registrations per environment is a generalised abstract factory. ZudoJS takes the idea further for external platforms in [Adapters](https://zudojs.oyinlola.site/learn/zudo-adapters), where adapters are registered and looked up by the capabilities they provide.

## Builder: constructing complex things step by step

Creating a delivery needs eight values. The function takes them in order:

positional.ts

```ts
function createDelivery(recipient: string, phone: string, street: string, city: string, state: string, express: boolean, fragile: boolean, notes?: string): string {
  return `${recipient} (${phone}), ${street}, ${city}, ${state}${express ? ", EXPRESS" : ""}${fragile ? ", FRAGILE" : ""}${notes ? `, note: ${notes}` : ""}`;
}

console.log(createDelivery("Ada Obi", "Lagos", "12 Allen Avenue", "Ikeja", "08031234567", true, false));
```

Output of `npx tsx positional.ts` and of the browser terminal

```ts
Ada Obi (Lagos), 12 Allen Avenue, Ikeja, 08031234567, EXPRESS
```

The phone number and the state were swapped. Both are strings, so TypeScript is happy, and the rider will call "Lagos". Two booleans in a row (`true, false`) are just as easy to swap, and nobody reading the call can tell which is which. In TypeScript the first fix is not a pattern at all, it is an **options object**: every value gets its name at the call site.

options-object.ts

```ts
interface DeliveryRequest {
  readonly recipient: string;
  readonly phone: string;
  readonly address: { readonly street: string; readonly city: string; readonly state: string };
  readonly express?: boolean;
  readonly fragile?: boolean;
  readonly notes?: string;
}

function createDelivery(request: DeliveryRequest): string {
  const { recipient, phone, address, express = false, fragile = false } = request;
  return `${recipient} (${phone}), ${address.street}, ${address.city}, ${address.state}${express ? ", EXPRESS" : ""}${fragile ? ", FRAGILE" : ""}`;
}

console.log(createDelivery({
  recipient: "Ada Obi",
  phone: "08031234567",
  address: { street: "12 Allen Avenue", city: "Ikeja", state: "Lagos" },
  express: true,
}));
```

Output of `npx tsx options-object.ts` and of the browser terminal

```ts
Ada Obi (08031234567), 12 Allen Avenue, Ikeja, Lagos, EXPRESS
```

For most "too many parameters" problems, stop here (KISS). The **builder** pattern is for objects that are genuinely built in steps: many optional parts, rules that span several parts, and a final step that assembles the result. The standard example in backend code is a query.

### A query builder

The admin screen searches orders by any combination of status, customer, minimum total and date range, sorted and paged. Building the SQL by gluing strings together is how SQL injection happens ([SQL with PostgreSQL](https://zudojs.oyinlola.site/learn/sql-basics#injection)). A builder collects the filters as *placeholders plus values* and only assembles the text at the end:

order-query.ts

```ts
type Status = "pending" | "paid" | "refunded";
type Column = "placed_at" | "total_kobo";

interface Filter {
  readonly sql: string;
  readonly value: string | number;
}

export class OrderQuery {
  private constructor(
    private readonly filters: readonly Filter[],
    private readonly order: string,
    private readonly max: number,
  ) {}

  static all(): OrderQuery {
    return new OrderQuery([], "placed_at DESC", 50);
  }

  status(status: Status): OrderQuery {
    return this.where("status = ?", status);
  }

  customer(email: string): OrderQuery {
    return this.where("email = ?", email.toLowerCase());
  }

  minTotal(kobo: number): OrderQuery {
    return this.where("total_kobo >= ?", kobo);
  }

  sortBy(column: Column, direction: "ASC" | "DESC"): OrderQuery {
    return new OrderQuery(this.filters, `${column} ${direction}`, this.max);
  }

  limit(max: number): OrderQuery {
    if (!Number.isInteger(max) || max < 1 || max > 100) throw new Error(`limit must be 1 to 100, got ${max}`);
    return new OrderQuery(this.filters, this.order, max);
  }

  build(): { text: string; values: (string | number)[] } {
    const values = this.filters.map((filter) => filter.value);
    const conditions = this.filters.map((filter, i) => filter.sql.replace("?", `$${i + 1}`));
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
    return { text: `SELECT id, email, status, total_kobo FROM orders${where} ORDER BY ${this.order} LIMIT ${this.max}`, values };
  }

  private where(sql: string, value: string | number): OrderQuery {
    return new OrderQuery([...this.filters, { sql, value }], this.order, this.max);
  }
}
```

Each method returns a new builder, so calls chain into a sentence. An API shaped like this is called a **fluent interface**:

query-build.ts

```ts
import { OrderQuery } from "./order-query.js";

const query = OrderQuery.all().status("paid").minTotal(1_000_000).sortBy("total_kobo", "DESC").limit(10).build();
console.log(query.text);
console.log(query.values);

const hostile = OrderQuery.all().customer("x' OR '1'='1").build();
console.log(hostile.text.includes("OR '1'='1'"), hostile.values);

try {
  OrderQuery.all().limit(5000);
} catch (error) {
  console.log((error as Error).message);
}
```

Output of `npx tsx query-build.ts` and of the browser terminal

```ts
SELECT id, email, status, total_kobo FROM orders WHERE status = $1 AND total_kobo >= $2 ORDER BY total_kobo DESC LIMIT 10
[ 'paid', 1000000 ]
false [ "x' or '1'='1" ]
limit must be 1 to 100, got 5000
```

Look at what the builder guarantees. User input only ever travels in `values`, never in the SQL text, so the hostile e-mail is harmless. The sort column and direction are unions, so a caller cannot pass arbitrary SQL there. The limit is checked when it is set. And every combination of filters produces correct `$1`, `$2` numbering, which is the fiddly part people get wrong by hand. The built query runs unchanged on PostgreSQL:

query-run.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

import { OrderQuery } from "./order-query.js";

const db = new PGlite();
await db.exec(`
  CREATE TABLE orders (id serial PRIMARY KEY, email text NOT NULL, status text NOT NULL,
    total_kobo integer NOT NULL, placed_at timestamptz NOT NULL);
  INSERT INTO orders (email, status, total_kobo, placed_at) VALUES
    ('ada@shop.ng', 'paid', 1441575, '2026-03-01T10:00:00Z'),
    ('bola@shop.ng', 'paid', 483750, '2026-03-02T11:00:00Z'),
    ('ada@shop.ng', 'refunded', 2500000, '2026-03-03T12:00:00Z'),
    ('chi@shop.ng', 'paid', 3200000, '2026-03-04T13:00:00Z');
`);

const { text, values } = OrderQuery.all().status("paid").minTotal(1_000_000).sortBy("total_kobo", "DESC").build();
console.log((await db.query(text, values)).rows);
await db.close();
```

Output of `npx tsx query-run.ts`

```json
[
  { id: 4, email: 'chi@shop.ng', status: 'paid', total_kobo: 3200000 },
  { id: 1, email: 'ada@shop.ng', status: 'paid', total_kobo: 1441575 }
]
```

### Why the builder is immutable

Every method above returns a *new* `OrderQuery` and never changes `this`. Many builders are written the other way, changing themselves and returning `this`. That looks the same in a single chain, but breaks as soon as someone reuses a partly built query:

mutable-builder.ts

```ts
class MutableQuery {
  private readonly conditions: string[] = [];

  where(condition: string): this {
    this.conditions.push(condition);
    return this;
  }

  build(): string {
    return `SELECT * FROM orders WHERE ${this.conditions.join(" AND ")}`;
  }
}

const paid = new MutableQuery().where("status = 'paid'");
const bigOrders = paid.where("total_kobo >= 1000000");
const adasOrders = paid.where("email = 'ada@shop.ng'");

console.log(bigOrders.build());
console.log(adasOrders.build());
```

Output of `npx tsx mutable-builder.ts` and of the browser terminal

```ts
SELECT * FROM orders WHERE status = 'paid' AND total_kobo >= 1000000 AND email = 'ada@shop.ng'
SELECT * FROM orders WHERE status = 'paid' AND total_kobo >= 1000000 AND email = 'ada@shop.ng'
```

`paid`, `bigOrders` and `adasOrders` are the same object, so both queries got both filters and Ada's order history silently hides her small orders. With the immutable `OrderQuery`, a base query can be shared safely, which is how admin screens are usually built: a base query per screen, with filters added per request.

> TIP
>
> Builders are also common in tests, as **test data builders**: `anOrder().paid().withTotal(500_000).build()` gives valid defaults for everything a test does not care about. In TypeScript, a function with defaults and a `Partial` of overrides, `makeOrder({ status: "paid" })`, usually does the same job with less code.

## Singleton, and why DI usually replaces it

The **singleton** pattern makes a class that can only ever have one instance and gives everyone global access to it, usually through a static `getInstance()`. It solves a real problem: some things should exist once per process, such as the configuration or a database connection pool. Here is the shop's configuration as a classic singleton, and two tests that use it:

singleton-problem.ts

```ts
class AppConfig {
  static #instance: AppConfig | undefined;
  readonly values = new Map<string, string>();

  private constructor() {}

  static getInstance(): AppConfig {
    this.#instance ??= new AppConfig();
    return this.#instance;
  }
}

function maxQuantity(): number {
  return Number(AppConfig.getInstance().values.get("MAX_QUANTITY") ?? "10");
}

// test 1: a shop that limits orders to 2 items
AppConfig.getInstance().values.set("MAX_QUANTITY", "2");
console.log("test 1:", maxQuantity() === 2 ? "PASS" : "FAIL");

// test 2: the default limit
console.log("test 2:", maxQuantity() === 10 ? "PASS" : "FAIL", `(got ${maxQuantity()})`);
```

Output of `npx tsx singleton-problem.ts` and of the browser terminal

```ts
test 1: PASS
test 2: FAIL (got 2)
```

Test 2 is correct and fails anyway, because test 1 left its setting in the one shared instance. Run test 2 alone and it passes. Tests whose result depends on which tests ran before them are among the most expensive bugs a team can have: they fail at random in CI, and people learn to re-run until green. The singleton caused two separate problems:

- **Hidden dependency.** Nothing in `maxQuantity()`'s signature says it reads configuration. You only find out by reading its body, and a test cannot pass a different configuration in.
- **Global mutable state.** "Exactly one instance" became "one instance shared by every test in the process", the global coupling from [Design principles](https://zudojs.oyinlola.site/learn/design-principles#coupling).

An ES module is also a singleton: `export const config = loadConfig()` runs once, and every importer gets the same object. That has the same two problems, plus a third: the work happens at import time, so merely importing the file reads the environment or opens a connection.

### One instance is a lifetime, not a class property

The need behind the singleton is real, but "there is one of these" is not something the class should decide. It is a decision about **lifetime**, and it belongs in the composition root: create the object once there and pass it to everyone who needs it. Tests then create their own:

injected-config.ts

```ts
interface AppConfig {
  readonly maxQuantity: number;
}

function loadConfig(env: Readonly<Record<string, string | undefined>>): AppConfig {
  return Object.freeze({ maxQuantity: Number(env["MAX_QUANTITY"] ?? "10") });
}

function canOrder(quantity: number, config: AppConfig): boolean {
  return quantity <= config.maxQuantity;
}

// production: the composition root loads it once and passes it on
const config = loadConfig({ MAX_QUANTITY: "5" });
console.log("production allows 4:", canOrder(4, config));

// tests: each builds exactly the configuration it needs
console.log("test 1:", canOrder(3, loadConfig({ MAX_QUANTITY: "2" })) === false ? "PASS" : "FAIL");
console.log("test 2:", canOrder(10, loadConfig({})) === true ? "PASS" : "FAIL");
```

Output of `npx tsx injected-config.ts` and of the browser terminal

```ts
production allows 4: true
test 1: PASS
test 2: PASS
```

The configuration is also frozen, so no code can change it after startup. Freezing turns "shared" from dangerous into harmless: shared *immutable* state has none of the singleton's problems.

When the application has dozens of such objects, passing them by hand gets tedious, and a **DI container** takes over. A container makes "singleton" one of several lifetimes you choose per registration. With `@zudojs/container`, which [The ZudoJS container](https://zudojs.oyinlola.site/learn/zudo-container#lifetimes) covers in full, the payment provider from the start of this lesson is registered as a factory with a singleton lifetime:

container-lifetime.ts

```ts
import { ContainerScope, createContainer, createToken } from "@zudojs/container";

interface Config {
  readonly country: string;
}
interface Provider {
  readonly name: string;
}

const CONFIG = createToken<Config>("config");
const PROVIDER = createToken<Provider>("payment provider");

let built = 0;
const app = createContainer();
app.registerValue(CONFIG, { country: "KE" });
app.registerFactory(PROVIDER, (config) => {
  built++;
  return { name: config.country === "KE" ? "mpesa" : "paystack" };
}, [CONFIG], { scope: ContainerScope.SINGLETON });

console.log(app.resolve(PROVIDER), app.resolve(PROVIDER) === app.resolve(PROVIDER), "built:", built);

// a test builds its own container: its own "singleton", nothing shared with the app
const testContainer = createContainer();
testContainer.registerValue(CONFIG, { country: "NG" });
testContainer.registerFactory(PROVIDER, () => ({ name: "fake" }), [CONFIG], { scope: ContainerScope.SINGLETON });
console.log(testContainer.resolve(PROVIDER), "app still has:", app.resolve(PROVIDER).name);

await app.dispose();
await testContainer.dispose();
```

Output of `npx tsx container-lifetime.ts` and of the browser terminal

```json
{ name: 'mpesa' } true built: 1
{ name: 'fake' } app still has: mpesa
```

`registerFactory` is the factory pattern, the container calls it for you with its dependencies (`[CONFIG]`), and `ContainerScope.SINGLETON` means "call it once per container". One per container, not one per process, is the difference that matters: every test gets a fresh world. [Typed dependency injection](https://zudojs.oyinlola.site/learn/ts-typed-di) shows how a container like this is typed and built.

|  | Singleton pattern | Singleton lifetime (DI) |
| --- | --- | --- |
| Who decides there is one? | the class itself | the composition root or container |
| How do users get it? | global access: `getInstance()` | passed in as a parameter or constructor argument |
| Visible in signatures? | no, hidden dependency | yes |
| Tests | share one instance, order-dependent | each test builds its own |
| Two of them (a read replica, a second tenant)? | impossible without rewriting | register or create a second one |

## When creational patterns go wrong

- **Factories that read globals.** A factory that calls `process.env` inside itself is a hidden dependency with a nicer name. Pass the configuration in, as `createPaymentProvider(name, keys)` does.
- **Factories that hide failure.** Returning a default provider for an unknown country is exactly the `stripe` bug from the start. A factory should refuse unknown input loudly.
- **Pattern stacking.** `PaymentProviderFactoryFactory`, or an abstract factory with one family, adds names and hides nothing. Introduce the abstract factory when a second family exists and mixing them is a real risk.
- **Builders for simple objects.** A builder for a three-field object is more code than the object. Reach for an options object first.
- **Mutable builders shared between callers**, as shown above. Return new builders.
- **Singletons holding request data.** A singleton that stores "the current user" leaks one user's data into another request as soon as two requests overlap. Per-request data needs a per-request (scoped) lifetime or explicit parameters.

## Where ZudoJS uses these patterns

- **Factory functions as the public API.** Almost every ZudoJS package is used through a `createX` function (`createContainer`, `createLogger`, `createEventBus`…) rather than `new` on exported classes. The package can then change which class it returns, validate options, and freeze the result.
- **Factory providers and lifetimes.** The container's `registerFactory` and its singleton, scoped and transient lifetimes, above and in [The ZudoJS container](https://zudojs.oyinlola.site/learn/zudo-container).
- **Families of adapters.** [Adapters](https://zudojs.oyinlola.site/learn/zudo-adapters) registers implementations of external-platform contracts and looks them up by capability, the abstract factory idea applied to a whole framework.

## Practice

TRY IT YOURSELF

### Launch South Africa

The shop launches in South Africa with a new provider, Ozow. Change the factory's types and tables so `providerFor("ZA")` works and refunds go to Ozow. What does the compiler force you to update, and what does it not catch?

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Five small additions, in this order: add `"ZA"` to `Country`, add `"ozow"` to `ProviderName`, add `ozow: "k4"` to `keys`, add an `ozow` entry to `builders` shaped like the others, and add `ZA: "ozow"` to `routes`.

HINT 2

The `ozow` builder is `() => make("ozow", keys.ozow)`, and the route is `ZA: "ozow"`, matching the shape of the entries already there.

SOLUTION

launch-za.ts

```ts
type Country = "NG" | "GH" | "KE" | "ZA";
type ProviderName = "paystack" | "flutterwave" | "mpesa" | "ozow";

interface PaymentProvider {
  readonly name: ProviderName;
  refund(chargeId: string): string;
}

const make = (name: ProviderName, key: string | undefined): PaymentProvider => {
  if (!key) throw new Error(`missing secret key for ${name}`);
  return { name, refund: (chargeId) => `${name} refunded ${chargeId}` };
};

const keys: Record<ProviderName, string | undefined> = { paystack: "k1", flutterwave: "k2", mpesa: "k3", ozow: "k4" };
const builders: Record<ProviderName, () => PaymentProvider> = {
  paystack: () => make("paystack", keys.paystack),
  flutterwave: () => make("flutterwave", keys.flutterwave),
  mpesa: () => make("mpesa", keys.mpesa),
  ozow: () => make("ozow", keys.ozow),
};
const routes: Record<Country, ProviderName> = { NG: "paystack", GH: "flutterwave", KE: "mpesa", ZA: "ozow" };

const provider = builders[routes["ZA"]]();
console.log(provider.name, provider.refund("OZ-1"));
console.log(Object.keys(routes).map((country) => builders[routes[country as Country]]().name));
```

Output of `npx tsx launch-za.ts` and of the browser terminal

```ts
ozow ozow refunded OZ-1
[ 'paystack', 'flutterwave', 'mpesa', 'ozow' ]
```

Adding `"ZA"` and `"ozow"` to the unions made the compiler demand a route, a builder and a key entry, because all three are `Record`s over those unions. What it cannot catch is a missing key *value* in the production environment; the startup check (building every routed provider, the last line) catches that at deploy time.

TRY IT YOURSELF

### Extend the query builder

Add `placedBetween(from, to)` to `OrderQuery` as a new builder in your own file: it should add two filters, `placed_at >= $n` and `placed_at < $n`, and refuse a range where `from` is not before `to`. Show that a shared base query is not changed.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Guard first: `if (!(Date.parse(from) < Date.parse(to))) throw new Error(...)`. `!(a < b)` also catches unparseable dates, since any comparison with `NaN` is false.

HINT 2

Return `new OrderSearch([...this.filters, { sql: "placed_at >= ?", value: from }, { sql: "placed_at < ?", value: to }])`, the same pattern `status` uses.

SOLUTION

between.ts

```ts
type Filter = { readonly sql: string; readonly value: string | number };

class OrderSearch {
  private constructor(private readonly filters: readonly Filter[]) {}

  static all(): OrderSearch {
    return new OrderSearch([]);
  }

  status(status: string): OrderSearch {
    return new OrderSearch([...this.filters, { sql: "status = ?", value: status }]);
  }

  placedBetween(from: string, to: string): OrderSearch {
    if (!(Date.parse(from) < Date.parse(to))) throw new Error(`empty date range: ${from} to ${to}`);
    return new OrderSearch([...this.filters, { sql: "placed_at >= ?", value: from }, { sql: "placed_at < ?", value: to }]);
  }

  build(): { text: string; values: (string | number)[] } {
    const where = this.filters.map((f, i) => f.sql.replace("?", `$${i + 1}`)).join(" AND ");
    return { text: `SELECT * FROM orders${where ? ` WHERE ${where}` : ""}`, values: this.filters.map((f) => f.value) };
  }
}

const paid = OrderSearch.all().status("paid");
const march = paid.placedBetween("2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z");

console.log(march.build());
console.log(paid.build().text);
try {
  paid.placedBetween("2026-04-01T00:00:00Z", "2026-03-01T00:00:00Z");
} catch (error) {
  console.log((error as Error).message);
}
```

Output of `npx tsx between.ts` and of the browser terminal

```json
{
  text: 'SELECT * FROM orders WHERE status = $1 AND placed_at >= $2 AND placed_at < $3',
  values: [ 'paid', '2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z' ]
}
SELECT * FROM orders WHERE status = $1
empty date range: 2026-04-01T00:00:00Z to 2026-03-01T00:00:00Z
```

A half-open range (`>=` start, `<` end) never counts an order twice when you page through consecutive months. The check `!(a < b)` also rejects unparseable dates, because a comparison with `NaN` is always false. The base query `paid` kept its single filter.

TRY IT YOURSELF

### Remove a singleton

A `Clock` singleton makes invoice tests depend on the real date. Replace it: `isOverdue` should receive a clock object, production passes one that reads the real time, and a test passes a fixed one. Test an invoice due on 1 March against 28 February and 2 March.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`clock.now()` gives you a `Date`; compare its `.getTime()` with `Date.parse(invoice.dueAt)` using `>`.

HINT 2

`return clock.now().getTime() > Date.parse(invoice.dueAt);`

SOLUTION

clock.ts

```ts
interface Clock {
  now(): Date;
}

const systemClock: Clock = { now: () => new Date() };
const fixedClock = (iso: string): Clock => ({ now: () => new Date(iso) });

function isOverdue(invoice: { dueAt: string }, clock: Clock): boolean {
  return clock.now().getTime() > Date.parse(invoice.dueAt);
}

const invoice = { dueAt: "2026-03-01T00:00:00Z" };
console.log("before:", isOverdue(invoice, fixedClock("2026-02-28T12:00:00Z")));
console.log("after:", isOverdue(invoice, fixedClock("2026-03-02T00:00:00Z")));
console.log("system clock is a Clock:", typeof systemClock.now().getTime() === "number");
```

Output of `npx tsx clock.ts` and of the browser terminal

```ts
before: false
after: true
system clock is a Clock: true
```

The clock is now a visible dependency. Production creates `systemClock` once in the composition root (a singleton lifetime), and every test picks its own moment in time, so the tests pass on any day they are run.

## Recap

- A **factory** puts the knowledge "how to build this, and which one" in one place. Fail fast on unknown input, check every configuration at startup, and let `Record` types keep the tables complete.
- Keep routing and construction separate, and record which implementation did the work, so later actions (refunds) use the right one.
- An **abstract factory** creates a family of parts that must match, so a configuration cannot mix them.
- For many parameters, start with an **options object**. Use a **builder** for step-by-step construction with rules, such as a query; make it immutable so partial builders can be shared.
- The **singleton** pattern hides dependencies and shares mutable state between tests. Make "one instance" a lifetime chosen in the composition root or a container, and freeze what is shared.

Next: [Structural patterns](https://zudojs.oyinlola.site/learn/design-patterns-structural), for wrapping and connecting objects: adapter, decorator, proxy and repository.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
