---
title: "Structural patterns — ZudoJS Academy"
description: "Wrap a third-party SMS SDK in an adapter, add retries, logging and caching with decorators, control access with proxies, and hide SQL behind a repository."
source: https://zudojs.oyinlola.site/learn/design-patterns-structural
---

LEVEL 11 · LESSON 4 OF 12

Design patterns Core

# Structural patterns

Wrap a third-party SMS SDK in an adapter, add retries, logging and caching with decorators, control access with proxies, and hide SQL behind a repository.

- **60 min** to read and try
- **You need:** Creational patterns, SOLID, DRY, KISS and YAGNI, and SQL basics
- **You build:** An SMS layer with two provider adapters, retry and logging decorators, a cache with a fake clock, lazy and protection proxies, and an order repository contract-tested against memory and PostgreSQL

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Wrap a third-party SDK in an adapter that translates requests, responses and errors into your own interface
- Add retries, logging and caching as decorators, and choose their order and retry rules deliberately
- Use a proxy to delay expensive creation safely and to guard access
- Hide storage behind a repository and prove two implementations equivalent with a contract test
- Name where ZudoJS applies each pattern

## The login code that was never sent

A shop logs customers in with a one-time code sent by SMS. For two years it used one SMS provider. Then the company moved to a cheaper provider, and a developer replaced the SDK call in the login code. Tests passed. The next morning, support was flooded: nobody could log in.

The two providers' SDKs are third-party code the shop cannot change. The stand-ins below behave like the real packages in the ways that matter here: each wants phone numbers in its own format, and each reports problems in its own way.

vendor-sdks.ts

```ts
// Stand-ins for two vendors' npm packages. You cannot change this code.

export class TermiiClient {
  readonly sent: string[] = [];
  failNext = false;

  constructor(private readonly apiKey: string) {}

  async send(payload: { to: string; from: string; sms: string; type: "plain"; channel: "generic" | "dnd" }) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("socket hang up");
    }
    if (!/^234\d{10}$/.test(payload.to)) return { code: "error", message: "Invalid phone number" };
    this.sent.push(payload.to);
    return { code: "ok", message_id: `TRM-${this.sent.length}`, message: "Successfully Sent" };
  }
}

export class AfricasTalkingSms {
  readonly delivered: string[] = [];
  failNext = false;

  constructor(private readonly apiKey: string) {}

  async send(options: { to: string[]; message: string; from?: string }) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("ECONNRESET");
    }
    const recipients = options.to.map((number) => {
      if (!/^\+234\d{10}$/.test(number)) return { number, status: "InvalidPhoneNumber", messageId: "None" };
      this.delivered.push(number);
      return { number, status: "Success", messageId: `ATX-${this.delivered.length}` };
    });
    return { SMSMessageData: { Message: `Sent to ${this.delivered.length}/${options.to.length}`, Recipients: recipients } };
  }
}
```

The login code after the switch:

login-problem.ts

```ts
import { AfricasTalkingSms } from "./vendor-sdks.js";

const sms = new AfricasTalkingSms("at_live_key");

async function sendLoginCode(phone: string, code: string): Promise<string> {
  await sms.send({ to: [phone], message: `Your login code is ${code}` });
  return "code sent";
}

console.log(await sendLoginCode("08031234567", "482913"));
console.log("numbers the provider accepted:", sms.delivered);
```

Output of `npx tsx login-problem.ts` and of the browser terminal

```ts
code sent
numbers the provider accepted: []
```

The old provider accepted local numbers like `08031234567`; the new one wants `+2348031234567`. And the new provider does not throw on a bad number: it answers successfully and puts `"InvalidPhoneNumber"` inside the response. The login code only watched for exceptions, so it reported "code sent" for every customer. Worse, the same direct SDK calls were in the order confirmation, delivery updates and password reset, 23 places in all, and each had to be found and fixed by hand.

The **structural patterns** are about how objects are connected and wrapped. This lesson covers four that every backend uses: **adapter** (make someone else's interface fit yours), **decorator** (add behaviour around an object without changing it), **proxy** (control access to an object) and **repository** (put storage behind a collection-like interface). They build on [Creational patterns](https://zudojs.oyinlola.site/learn/design-patterns-creational) and on the payment translators you wrote in [Design principles](https://zudojs.oyinlola.site/learn/design-principles#abstraction).

## Adapter: make their interface fit yours

First decide what the shop needs from "an SMS provider", in the shop's own words, as [dependency inversion](https://zudojs.oyinlola.site/learn/design-solid#dip) taught. The interface below is the **port**. Note what it promises: a result that says clearly whether the message was accepted, with reasons the business can act on:

sms.ts

```ts
export type SmsResult =
  | { readonly ok: true; readonly messageId: string }
  | { readonly ok: false; readonly reason: "invalid_number" | "rejected" | "unavailable" };

export interface SmsSender {
  send(to: string, text: string): Promise<SmsResult>;
}

/** Accepts 0803..., 234803... or +234803... and returns +234803..., or undefined. */
export function nigerianE164(input: string): string | undefined {
  const digits = input.replace(/[\s-]/g, "");
  if (/^\+234\d{10}$/.test(digits)) return digits;
  if (/^234\d{10}$/.test(digits)) return `+${digits}`;
  if (/^0\d{10}$/.test(digits)) return `+234${digits.slice(1)}`;
  return undefined;
}
```

An **adapter** is an object that implements *your* interface by calling *their* interface, translating in both directions. Each adapter does four translations: the request shape, data formats (the phone number), the response shape, and errors. The number is normalised once, in `nigerianE164`, and each adapter converts it to its vendor's format:

sms-adapters.ts

```ts
import { nigerianE164, type SmsResult, type SmsSender } from "./sms.js";
import type { AfricasTalkingSms, TermiiClient } from "./vendor-sdks.js";

export function termiiSender(client: TermiiClient, senderId: string): SmsSender {
  return {
    async send(to, text): Promise<SmsResult> {
      const number = nigerianE164(to);
      if (number === undefined) return { ok: false, reason: "invalid_number" };
      try {
        const response = await client.send({ to: number.slice(1), from: senderId, sms: text, type: "plain", channel: "generic" });
        if (response.code === "ok" && response.message_id) return { ok: true, messageId: response.message_id };
        return { ok: false, reason: response.message === "Invalid phone number" ? "invalid_number" : "rejected" };
      } catch {
        return { ok: false, reason: "unavailable" };
      }
    },
  };
}

export function africasTalkingSender(sdk: AfricasTalkingSms, senderId: string): SmsSender {
  return {
    async send(to, text): Promise<SmsResult> {
      const number = nigerianE164(to);
      if (number === undefined) return { ok: false, reason: "invalid_number" };
      try {
        const response = await sdk.send({ to: [number], message: text, from: senderId });
        const recipient = response.SMSMessageData.Recipients[0];
        if (recipient?.status === "Success") return { ok: true, messageId: recipient.messageId };
        return { ok: false, reason: recipient?.status === "InvalidPhoneNumber" ? "invalid_number" : "rejected" };
      } catch {
        return { ok: false, reason: "unavailable" };
      }
    },
  };
}
```

Because both adapters promise the same thing, one **contract test** ([Liskov substitution](https://zudojs.oyinlola.site/learn/design-solid#lsp)) checks both. It is the test that would have caught the login outage before it shipped:

adapters-test.ts

```ts
import { africasTalkingSender, termiiSender } from "./sms-adapters.js";
import type { SmsSender } from "./sms.js";
import { AfricasTalkingSms, TermiiClient } from "./vendor-sdks.js";

async function smsContract(name: string, sender: SmsSender, breakNextCall: () => void): Promise<void> {
  const check = (test: string, ok: boolean) => console.log(`${ok ? "PASS" : "FAIL"} [${name}] ${test}`);
  const local = await sender.send("0803 123 4567", "Your login code is 482913");
  check("a local number is delivered", local.ok);
  const bad = await sender.send("0803", "hello");
  check("a short number is invalid_number", !bad.ok && bad.reason === "invalid_number");
  breakNextCall();
  const down = await sender.send("+2348031234567", "hello");
  check("a network error is unavailable, not a crash", !down.ok && down.reason === "unavailable");
}

const termii = new TermiiClient("tk_test");
const at = new AfricasTalkingSms("at_test");
await smsContract("termii", termiiSender(termii, "SHOPNG"), () => (termii.failNext = true));
await smsContract("africastalking", africasTalkingSender(at, "SHOPNG"), () => (at.failNext = true));
console.log(termii.sent, at.delivered);
```

Output of `npx tsx adapters-test.ts` and of the browser terminal

```ts
PASS [termii] a local number is delivered
PASS [termii] a short number is invalid_number
PASS [termii] a network error is unavailable, not a crash
PASS [africastalking] a local number is delivered
PASS [africastalking] a short number is invalid_number
PASS [africastalking] a network error is unavailable, not a crash
[ '2348031234567' ] [ '+2348031234567' ]
```

Switching providers is now one line in the composition root. The 23 call sites depend on `SmsSender` and never saw a vendor type. When a whole external system is kept behind a layer of adapters like this, so its vocabulary and its quirks cannot spread into your code, that layer is called an **anti-corruption layer**.

> NOTE
>
> An adapter changes an interface into the one callers expect. A **facade**, a related pattern, puts one simple interface in front of a complicated subsystem (for example one `checkout()` in front of pricing, payment and stock). In practice an adapter for a big SDK is often a bit of both.

ZudoJS builds a whole package around this idea: [Adapters](https://zudojs.oyinlola.site/learn/zudo-adapters) defines the contracts for HTTP servers, queues, storage and messaging, so the framework talks to your chosen platform through adapters and never to the platform directly.

## Decorator: add behaviour around an object

With the adapters in production, three new requests arrive. Operations wants every SMS logged. The provider fails about one call in fifty with a network error that succeeds on a second try, so someone wants retries. And the product page calls a slow exchange-rate service on every view, so someone wants caching. The obvious way is to add a retry loop and log lines inside each adapter. That copies the same code into every adapter and mixes "how to talk to Termii" with "how often to retry".

A **decorator** is an object that implements the same interface as the object it wraps, forwards calls to it, and adds behaviour before or after. Because it has the same interface, callers cannot tell it apart from the original, and decorators can be stacked. You wrote small ones already: `bestEffort` in [Design principles](https://zudojs.oyinlola.site/learn/design-principles#composition) and the wrappers in [Inheritance and composition](https://zudojs.oyinlola.site/learn/js-composition#wrapper).

REASON IT OUT

### Which SMS failures should be retried?

Before writing a retry decorator, decide:

- The result says `invalid_number`. Will a second attempt help?
- The result says `unavailable` because the connection dropped. Did the provider receive the message or not?
- If the provider did receive it, what does a retry do to the customer?
- How many attempts, and how long between them? What happens to the login request while it waits?
- Where should the log line go: once per send, or once per attempt?

**Show the reasoning**

- No. Invalid numbers and rejections are **permanent** failures; retrying only wastes time and money. Retry only **transient** failures, here `unavailable`.
- You cannot know. The request may have arrived and only the response was lost.
- The customer gets the same code twice. For a login code that is harmless; for "your order has shipped" it is annoying; for a payment it would be a disaster. Retrying is only safe for operations that are harmless to repeat (**idempotent**), or when the provider supports an idempotency key ([Idempotency](https://zudojs.oyinlola.site/learn/api-idempotency#keys)).
- A small number (two or three attempts) with a short wait that grows each time (**backoff**). The user is waiting, so the total must stay within the request's time budget.
- Both are useful and they are different: logging outside the retry records one line per send; inside, one line per attempt. The order you stack the decorators decides which you get.

sms-decorators.ts

```ts
import type { SmsResult, SmsSender } from "./sms.js";

export function withRetry(sender: SmsSender, attempts: number, wait: (ms: number) => Promise<void>): SmsSender {
  return {
    async send(to, text): Promise<SmsResult> {
      let result = await sender.send(to, text);
      for (let attempt = 2; attempt <= attempts && !result.ok && result.reason === "unavailable"; attempt++) {
        await wait(100 * 2 ** (attempt - 2));
        result = await sender.send(to, text);
      }
      return result;
    },
  };
}

export function withLogging(label: string, sender: SmsSender, log: (line: string) => void): SmsSender {
  return {
    async send(to, text): Promise<SmsResult> {
      const result = await sender.send(to, text);
      const masked = to.length > 7 ? `${to.slice(0, 4)}****${to.slice(-3)}` : "****";
      log(`${label} ${masked}: ${result.ok ? `ok ${result.messageId}` : result.reason}`);
      return result;
    },
  };
}
```

The retry waits 100 ms, then 200 ms, and so on. The wait function is injected, so a test does not really sleep and can see every wait. The log masks the phone number, because full phone numbers in logs are personal data that should not be there. Now a sender that fails twice before succeeding, wrapped in both orders:

decorators-test.ts

```ts
import { withLogging, withRetry } from "./sms-decorators.js";
import type { SmsResult, SmsSender } from "./sms.js";

function flakySender(failures: number): SmsSender {
  let calls = 0;
  return {
    async send(): Promise<SmsResult> {
      calls++;
      return calls <= failures ? { ok: false, reason: "unavailable" } : { ok: true, messageId: `MSG-${calls}` };
    },
  };
}

const waits: number[] = [];
const wait = async (ms: number) => void waits.push(ms);

console.log("--- logging outside retry: one line per send");
const once = withLogging("sms", withRetry(flakySender(2), 3, wait), console.log);
await once.send("+2348031234567", "Your code is 482913");
console.log("waited:", waits);

console.log("--- logging inside retry: one line per attempt");
const each = withRetry(withLogging("attempt", flakySender(2), console.log), 3, wait);
await each.send("+2348031234567", "Your code is 482913");

console.log("--- a permanent failure is not retried");
let tries = 0;
const invalid: SmsSender = { send: async () => (tries++, { ok: false, reason: "invalid_number" }) };
console.log(await withRetry(invalid, 3, wait).send("0803", "hi"), "tries:", tries);
```

Output of `npx tsx decorators-test.ts` and of the browser terminal

```ts
--- logging outside retry: one line per send
sms +234****567: ok MSG-3
waited: [ 100, 200 ]
--- logging inside retry: one line per attempt
attempt +234****567: unavailable
attempt +234****567: unavailable
attempt +234****567: ok MSG-3
--- a permanent failure is not retried
{ ok: false, reason: 'invalid_number' } tries: 1
```

The same two decorators, stacked in a different order, give different behaviour. Choose the order on purpose: outermost runs first on the way in and last on the way out. The composition root is where this is decided, for example `withLogging("sms", withRetry(africasTalkingSender(sdk, "SHOPNG"), 3, sleep), logger)`.

### A caching decorator, tested with a fake clock

Caching has the same shape. The product page shows prices in dollars using a rate source that takes a second per call. A decorator keeps each answer for a set time, its **time to live** (TTL). Time is injected as a clock, so the test can move time forward instead of waiting:

cache-decorator.ts

```ts
interface RateSource {
  rate(pair: string): Promise<number>;
}

interface Clock {
  now(): number;
}

function withCache(source: RateSource, ttlMs: number, clock: Clock): RateSource {
  const entries = new Map<string, { value: number; expires: number }>();
  return {
    async rate(pair) {
      const hit = entries.get(pair);
      if (hit !== undefined && hit.expires > clock.now()) return hit.value;
      const value = await source.rate(pair);
      entries.set(pair, { value, expires: clock.now() + ttlMs });
      return value;
    },
  };
}

let calls = 0;
const slowBank: RateSource = { rate: async () => (++calls, 0.00065) };
let time = 0;
const clock: Clock = { now: () => time };

const rates = withCache(slowBank, 60_000, clock);
await rates.rate("NGN/USD");
await rates.rate("NGN/USD");
time = 59_999;
await rates.rate("NGN/USD");
console.log("calls within a minute:", calls);
time = 60_000;
await rates.rate("NGN/USD");
console.log("calls after expiry:", calls);
```

Output of `npx tsx cache-decorator.ts` and of the browser terminal

```ts
calls within a minute: 1
calls after expiry: 2
```

The rate source itself knows nothing about caching, and the cache knows nothing about banks. The test checks both edges of the TTL in a millisecond. This decorator is deliberately small; a production cache also needs a size limit, and protection against many requests missing at once and all calling the slow source together (a **cache stampede**). [Caching in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-cache) covers those.

> TIP
>
> TypeScript also has a language feature called decorators, written `@logged` above a class or method ([Decorators](https://zudojs.oyinlola.site/learn/ts-decorators)). It is one way to apply the decorator pattern to class members. The pattern itself needs no special syntax: a function that takes an object and returns a wrapped one with the same interface. ZudoJS middleware is the same pattern applied to request handlers ([Middleware in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-middleware)).

## Proxy: control access to an object

A **proxy** also has the same interface as the object behind it, and the code often looks like a decorator. The difference is intent: a decorator *adds* behaviour; a proxy *controls access*, deciding whether, when and how the real object is reached. The common kinds are:

- a **virtual** (lazy) proxy, which creates an expensive object only when it is first used;
- a **protection** proxy, which checks permissions before letting a call through;
- a **remote** proxy, which looks like a local object but sends each call over the network. An RPC client is one ([RPC in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-rpc)).

### Lazy loading, and the race inside it

Generating invoice PDFs needs a renderer that loads fonts and templates, which takes a while and a lot of memory. Most requests never render a PDF, so creating it at startup is waste. A lazy proxy creates it on first use. Here is the obvious version, and what happens when two invoices are requested at the same moment:

lazy-proxy.ts

```ts
interface PdfRenderer {
  render(invoiceNumber: string): Promise<string>;
}

let created = 0;
async function createRenderer(): Promise<PdfRenderer> {
  created++;
  await new Promise((resolve) => setTimeout(resolve, 10)); // loading fonts and templates
  return { render: async (invoiceNumber) => `%PDF ${invoiceNumber}` };
}

function naiveLazy(): PdfRenderer {
  let real: PdfRenderer | undefined;
  return {
    async render(invoiceNumber) {
      if (real === undefined) real = await createRenderer();
      return real.render(invoiceNumber);
    },
  };
}

function lazy(): PdfRenderer {
  let real: Promise<PdfRenderer> | undefined;
  return {
    async render(invoiceNumber) {
      real ??= createRenderer();
      return (await real).render(invoiceNumber);
    },
  };
}

const naive = naiveLazy();
console.log("created before use:", created);
await Promise.all([naive.render("INV-1"), naive.render("INV-2")]);
console.log("naive, two requests at once:", created);

created = 0;
const safe = lazy();
console.log(await Promise.all([safe.render("INV-3"), safe.render("INV-4")]));
console.log("promise cached, two requests at once:", created);
```

Output of `npx tsx lazy-proxy.ts` and of the browser terminal

```ts
created before use: 0
naive, two requests at once: 2
[ '%PDF INV-3', '%PDF INV-4' ]
promise cached, two requests at once: 1
```

The naive proxy checks `real === undefined`, then *awaits*. While it waits, the second request checks too, still finds nothing, and starts a second renderer. The fix is to cache the **promise**, which exists immediately, instead of the result, which exists only later. Both callers then wait for the same creation. (A complete version also clears the cached promise if creation fails, so the next call can try again.)

### A protection proxy

The reports service can export every customer's data. Support staff may use the other reports, but only admins may export. A protection proxy puts the check in front of the real service, for one user:

protection-proxy.ts

```ts
interface Reports {
  dailySales(day: string): Promise<string>;
  exportAllCustomers(): Promise<string>;
}

interface User {
  readonly name: string;
  readonly role: "admin" | "support";
}

const realReports: Reports = {
  dailySales: async (day) => `sales for ${day}: NGN 1,204,500.00`,
  exportAllCustomers: async () => "12,408 customers exported",
};

function reportsFor(user: User, reports: Reports): Reports {
  return {
    dailySales: (day) => reports.dailySales(day),
    async exportAllCustomers() {
      if (user.role !== "admin") throw new Error(`${user.name} may not export customer data`);
      return reports.exportAllCustomers();
    },
  };
}

for (const user of [{ name: "Ngozi", role: "admin" }, { name: "Musa", role: "support" }] as const) {
  const reports = reportsFor(user, realReports);
  console.log(await reports.dailySales("2026-03-02"));
  try {
    console.log(await reports.exportAllCustomers());
  } catch (error) {
    console.log((error as Error).message);
  }
}
```

Output of `npx tsx protection-proxy.ts` and of the browser terminal

```ts
sales for 2026-03-02: NGN 1,204,500.00
12,408 customers exported
sales for 2026-03-02: NGN 1,204,500.00
Musa may not export customer data
```

A protection proxy is only safe if nothing can reach the real object around it. If other code can still import `realReports`, the check is decoration. In a real application the rule lives in the use case or a permissions layer and the raw service is never handed out; [Permissions in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-permissions) builds that.

### JavaScript's built-in Proxy

JavaScript has a built-in `Proxy` object that can intercept any property read, write or call on another object, without listing the methods by hand. It is how some libraries build read-only views, change tracking or remote clients. It has a sharp edge with classes that use `#private` fields:

builtin-proxy.ts

```ts
class Account {
  #balanceKobo = 500_000;

  balance(): number {
    return this.#balanceKobo;
  }
}

const reads: string[] = [];
const audited = new Proxy(new Account(), {
  get(target, property, receiver) {
    reads.push(String(property));
    return Reflect.get(target, property, receiver);
  },
});

try {
  console.log(audited.balance());
} catch (error) {
  console.log(error instanceof TypeError, (error as Error).message);
}
console.log("reads:", reads);
```

Output of `npx tsx builtin-proxy.ts` and of the browser terminal

```ts
true Cannot read private member #balanceKobo from an object whose class did not declare it
reads: [ 'balance' ]
```

The method ran with `this` set to the proxy, and the proxy is not an `Account`, so it has no `#balanceKobo`. Built-in proxies are powerful but work at the level of property names, lose type information, and have edge cases like this one. For the patterns in this lesson, a plain object that implements the interface is clearer, typed and easy to test.

## Repository: storage behind a collection

The last structural problem is the most common one in backend code. The orders table is queried from the checkout, the admin screen, the reports and the reminder job, each with its own SQL. When the `total` column became `total_kobo`, four files broke, one of them in production. And every test of every service needs a database.

A **repository** gives one kind of domain object a collection-like interface: find, list, save, in the language of the domain. It hides the storage behind it: SQL, the mapping between rows and objects (`total_kobo` to `totalKobo`), and the database driver. Services depend on the interface. You met repositories in [Backend architecture](https://zudojs.oyinlola.site/learn/backend-architecture#infrastructure); here the focus is what makes one correct.

order-repository.ts

```ts
export type OrderStatus = "pending" | "paid" | "refunded";

export interface Order {
  readonly id: string;
  readonly email: string;
  readonly status: OrderStatus;
  readonly totalKobo: number;
}

export interface OrderRepository {
  findById(id: string): Promise<Order | undefined>;
  findByCustomer(email: string): Promise<Order[]>;
  save(order: Order): Promise<void>;
}

export class MemoryOrderRepository implements OrderRepository {
  readonly #rows = new Map<string, Order>();

  async findById(id: string) {
    return this.#rows.get(id);
  }

  async findByCustomer(email: string) {
    return [...this.#rows.values()].filter((order) => order.email === email.toLowerCase()).sort((a, b) => a.id.localeCompare(b.id));
  }

  async save(order: Order) {
    this.#rows.set(order.id, { ...order, email: order.email.toLowerCase() });
  }
}
```

The PostgreSQL version implements the same interface. All the SQL for orders lives here, and so does the mapping. `save` is an **upsert** (insert, or update if the id exists), so saving the same order twice is safe:

pg-order-repository.tsNode.js only

```ts
import type { PGlite } from "@electric-sql/pglite";

import type { Order, OrderRepository, OrderStatus } from "./order-repository.js";

interface OrderRow {
  id: string;
  email: string;
  status: OrderStatus;
  total_kobo: number;
}

const toOrder = (row: OrderRow): Order => ({ id: row.id, email: row.email, status: row.status, totalKobo: row.total_kobo });

export class PgOrderRepository implements OrderRepository {
  constructor(private readonly db: PGlite) {}

  static async migrate(db: PGlite): Promise<void> {
    await db.exec(`CREATE TABLE IF NOT EXISTS orders (id text PRIMARY KEY, email text NOT NULL,
      status text NOT NULL CHECK (status IN ('pending', 'paid', 'refunded')), total_kobo bigint NOT NULL)`);
  }

  async findById(id: string) {
    const { rows } = await this.db.query<OrderRow>("SELECT id, email, status, total_kobo::int AS total_kobo FROM orders WHERE id = $1", [id]);
    return rows[0] === undefined ? undefined : toOrder(rows[0]);
  }

  async findByCustomer(email: string) {
    const { rows } = await this.db.query<OrderRow>(
      "SELECT id, email, status, total_kobo::int AS total_kobo FROM orders WHERE email = $1 ORDER BY id",
      [email.toLowerCase()],
    );
    return rows.map(toOrder);
  }

  async save(order: Order) {
    await this.db.query(
      `INSERT INTO orders (id, email, status, total_kobo) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, status = EXCLUDED.status, total_kobo = EXCLUDED.total_kobo`,
      [order.id, order.email.toLowerCase(), order.status, order.totalKobo],
    );
  }
}
```

Two implementations of one interface need a contract test, or the in-memory one used by every service test will drift from the real one. The contract is where you write down the details that are easy to get wrong: e-mail matching ignores case, results are sorted, a second `save` updates instead of duplicating, and an unknown id gives `undefined`:

repository-contract.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

import { MemoryOrderRepository, type OrderRepository } from "./order-repository.js";
import { PgOrderRepository } from "./pg-order-repository.js";

async function orderRepositoryContract(name: string, repo: OrderRepository): Promise<void> {
  const check = (test: string, ok: boolean) => console.log(`${ok ? "PASS" : "FAIL"} [${name}] ${test}`);
  await repo.save({ id: "ORD-2", email: "Ada@Shop.ng", status: "pending", totalKobo: 483_750 });
  await repo.save({ id: "ORD-1", email: "ada@shop.ng", status: "paid", totalKobo: 1_441_575 });
  await repo.save({ id: "ORD-2", email: "ada@shop.ng", status: "paid", totalKobo: 483_750 });

  const adas = await repo.findByCustomer("ADA@shop.ng");
  check("finds by e-mail, ignoring case", adas.length === 2);
  check("sorted by id", adas.map((o) => o.id).join() === "ORD-1,ORD-2");
  check("save twice updates, never duplicates", (await repo.findById("ORD-2"))?.status === "paid");
  check("unknown id is undefined", (await repo.findById("ORD-404")) === undefined);
  check("amounts come back as numbers", typeof adas[0]?.totalKobo === "number");
}

await orderRepositoryContract("memory", new MemoryOrderRepository());

const db = new PGlite();
await PgOrderRepository.migrate(db);
await orderRepositoryContract("postgres", new PgOrderRepository(db));
await db.close();
```

Output of `npx tsx repository-contract.ts`

```ts
PASS [memory] finds by e-mail, ignoring case
PASS [memory] sorted by id
PASS [memory] save twice updates, never duplicates
PASS [memory] unknown id is undefined
PASS [memory] amounts come back as numbers
PASS [postgres] finds by e-mail, ignoring case
PASS [postgres] sorted by id
PASS [postgres] save twice updates, never duplicates
PASS [postgres] unknown id is undefined
PASS [postgres] amounts come back as numbers
```

The last check is not paranoia. PostgreSQL's `bigint` can hold numbers larger than JavaScript can represent exactly, so the widely used `pg` driver returns `bigint` columns as *strings*. (PGlite turns them into numbers when they fit, but returns `numeric` columns as strings.) The `::int` casts make every driver return a number, which is safe for amounts up to about ₦21 million per order; a larger shop would map to JavaScript's `bigint` instead. Without the cast, a repository running on `pg` would hand services strings, and `order.totalKobo + fee` would join text instead of adding. Only a contract test run against the real database catches that.

### How repositories go wrong

- **The generic repository.** `Repository<T>` with `findWhere(filter: any)` leaks the query language to every service, and every storage quirk comes with it. Name methods after the questions the domain asks: `findOverdue(now)`, not `findWhere({ dueAt: { lt: now } })`.
- **One repository per table.** An order and its lines are saved and loaded together. One repository per *aggregate* (a group of objects that change together), not per table, keeps them consistent.
- **N+1 queries.** A repository method that loads 50 orders and then runs one query per order for its lines makes 51 round trips. Load related data in one query, or with one query per kind.
- **Transactions across repositories.** "Save the order and reduce the stock" must succeed or fail together, which needs a transaction shared by both repositories. [Transactions](https://zudojs.oyinlola.site/learn/db-transactions) and [Transactions in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-transactions) show how.

## Production concerns

- **Adapters never leak vendor types.** If a vendor's response type appears in a service's signature, the anti-corruption layer has a hole. Translate errors too: a vendor's exception class should never reach a service.
- **Retries need limits.** Retry only transient failures, only idempotent operations, a small number of times, with backoff and some randomness (**jitter**) so that thousands of clients do not retry in lockstep. Pair retries with timeouts, or one slow provider holds every request open.
- **Logs are data.** A logging decorator sees every argument. Mask phone numbers, e-mails and tokens before they are written.
- **Caches serve stale data by design.** Choose the TTL per kind of data. Never cache anything that depends on who is asking under a key that ignores who is asking.
- **Know which object you hold.** With several decorators and proxies stacked, a stack trace shows many wrappers. Name them clearly and build the stack in one place, the composition root.

## Practice

TRY IT YOURSELF

### Adapt a third SMS vendor

A third vendor's SDK has `dispatch(msisdn: string, body: string)`, wants numbers as `2348031234567`, returns `{ accepted: boolean; ref?: string; error?: "BAD_MSISDN" | "BLOCKED" }`, and throws on network errors. Write `thirdVendorSender(sdk)` implementing `SmsSender`, and run the same three contract checks against it.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Start like the other two adapters: `const number = nigerianE164(to); if (number === undefined) return { ok: false, reason: "invalid_number" };`.

HINT 2

Then `try { const response = await sdk.dispatch(number.slice(1), text); if (response.accepted && response.ref) return { ok: true, messageId: response.ref }; return { ok: false, reason: response.error === "BAD_MSISDN" ? "invalid_number" : "rejected" }; } catch { return { ok: false, reason: "unavailable" }; }`.

SOLUTION

third-vendor.ts

```ts
import { nigerianE164, type SmsResult, type SmsSender } from "./sms.js";

class ThirdVendorSdk {
  failNext = false;
  async dispatch(msisdn: string, body: string): Promise<{ accepted: boolean; ref?: string; error?: "BAD_MSISDN" | "BLOCKED" }> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("ETIMEDOUT");
    }
    if (!/^234\d{10}$/.test(msisdn)) return { accepted: false, error: "BAD_MSISDN" };
    return { accepted: true, ref: `TV-${body.length}` };
  }
}

function thirdVendorSender(sdk: ThirdVendorSdk): SmsSender {
  return {
    async send(to, text): Promise<SmsResult> {
      const number = nigerianE164(to);
      if (number === undefined) return { ok: false, reason: "invalid_number" };
      try {
        const response = await sdk.dispatch(number.slice(1), text);
        if (response.accepted && response.ref) return { ok: true, messageId: response.ref };
        return { ok: false, reason: response.error === "BAD_MSISDN" ? "invalid_number" : "rejected" };
      } catch {
        return { ok: false, reason: "unavailable" };
      }
    },
  };
}

const sdk = new ThirdVendorSdk();
const sender = thirdVendorSender(sdk);
console.log(await sender.send("0803 123 4567", "Your login code is 482913"));
console.log(await sender.send("0803", "hi"));
sdk.failNext = true;
console.log(await sender.send("+2348031234567", "hi"));
```

Output of `npx tsx third-vendor.ts` and of the browser terminal

```json
{ ok: true, messageId: 'TV-25' }
{ ok: false, reason: 'invalid_number' }
{ ok: false, reason: 'unavailable' }
```

The structure is the same as the other two adapters: normalise the number once, convert to the vendor's format, translate the response and the exception. None of the services that send SMS change. In a real project you would reuse `smsContract` from the test file instead of three `console.log` lines.

TRY IT YOURSELF

### A timeout decorator

Write `withTimeout(sender, ms)`: if the wrapped `send` has not finished within `ms` milliseconds, return `{ ok: false, reason: "unavailable" }`. Clear the timer when the send finishes first, so it does not keep the process alive. Test it with a sender that never answers and one that answers at once.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Build a timeout promise with `new Promise<SmsResult>((resolve) => { timer = setTimeout(() => resolve({ ok: false, reason: "unavailable" }), ms); })`, then `Promise.race` it against `sender.send(to, text)`.

HINT 2

Wrap the `Promise.race` in `try { ... } finally { clearTimeout(timer); }` so the timer never lingers once either side settles.

SOLUTION

timeout-decorator.ts

```ts
import type { SmsResult, SmsSender } from "./sms.js";

function withTimeout(sender: SmsSender, ms: number): SmsSender {
  return {
    async send(to, text): Promise<SmsResult> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<SmsResult>((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, reason: "unavailable" }), ms);
      });
      try {
        return await Promise.race([sender.send(to, text), timeout]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

const hanging: SmsSender = { send: () => new Promise<SmsResult>(() => {}) };
const fast: SmsSender = { send: async () => ({ ok: true, messageId: "MSG-1" }) };

console.log(await withTimeout(hanging, 20).send("+2348031234567", "hi"));
console.log(await withTimeout(fast, 20).send("+2348031234567", "hi"));
```

Output of `npx tsx timeout-decorator.ts` and of the browser terminal

```json
{ ok: false, reason: 'unavailable' }
{ ok: true, messageId: 'MSG-1' }
```

Mapping a timeout to `unavailable` means `withRetry` can retry it, so the natural stack is `withRetry(withTimeout(adapter, 2000), 3, sleep)`: each attempt gets its own time limit. Remember that a timed-out request may still have reached the provider, which is why the retry rules from the reasoning above still apply.

TRY IT YOURSELF

### Grow the repository

Add `findByStatus(status)` to the memory repository, returning orders sorted by id, and add a contract check for it. Why must the check go into the shared contract rather than into a test of the memory repository alone?

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`#sorted` takes a predicate and does the filtering and sorting for you; `findByStatus` only needs to say which orders to keep.

HINT 2

`return this.#sorted((order) => order.status === status);`, exactly the shape of `findByCustomer`.

SOLUTION

by-status.ts

```ts
import type { Order, OrderRepository, OrderStatus } from "./order-repository.js";

class MemoryOrders implements OrderRepository {
  readonly #rows = new Map<string, Order>();

  async findById(id: string) {
    return this.#rows.get(id);
  }

  async findByCustomer(email: string) {
    return this.#sorted((order) => order.email === email.toLowerCase());
  }

  async findByStatus(status: OrderStatus) {
    return this.#sorted((order) => order.status === status);
  }

  async save(order: Order) {
    this.#rows.set(order.id, { ...order, email: order.email.toLowerCase() });
  }

  #sorted(keep: (order: Order) => boolean): Order[] {
    return [...this.#rows.values()].filter(keep).sort((a, b) => a.id.localeCompare(b.id));
  }
}

const repo = new MemoryOrders();
await repo.save({ id: "ORD-3", email: "chi@shop.ng", status: "paid", totalKobo: 100 });
await repo.save({ id: "ORD-1", email: "ada@shop.ng", status: "paid", totalKobo: 200 });
await repo.save({ id: "ORD-2", email: "bola@shop.ng", status: "pending", totalKobo: 300 });
await repo.save({ id: "ORD-2", email: "bola@shop.ng", status: "paid", totalKobo: 300 });

const check = (name: string, ok: boolean) => console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
const paid = await repo.findByStatus("paid");
console.log(paid.map((o) => o.id));
check("sorted by id", paid.map((o) => o.id).join() === "ORD-1,ORD-2,ORD-3");
check("a re-saved order moves to its new status", (await repo.findByStatus("pending")).length === 0);
```

Output of `npx tsx by-status.ts` and of the browser terminal

```json
[ 'ORD-1', 'ORD-2', 'ORD-3' ]
PASS sorted by id
PASS a re-saved order moves to its new status
```

The interesting case is the re-saved order: it must move from `pending` to `paid`, not appear under both. That rule is part of what `findByStatus` *means*, so it belongs in the contract, where the PostgreSQL implementation (a `WHERE status = $1 ORDER BY id` query) must pass it too. A test of the memory version alone would let the two drift apart.The private `#sorted` helper also keeps the sorting rule in one place for both finders.

## Recap

- **Adapter**: implement your interface by calling theirs, translating requests, formats, responses and errors. A layer of adapters is an anti-corruption layer. Test every adapter with one contract.
- **Decorator**: same interface, wraps an object, adds behaviour before or after. Retries, logging, caching and timeouts stack in the composition root, and the order matters. Retry only transient failures of idempotent operations.
- **Proxy**: same interface, controls access: create lazily (cache the promise, not the result), check permissions, or forward over the network. The built-in `Proxy` is powerful but untyped and breaks `#private` methods.
- **Repository**: one collection-like interface per aggregate, with the SQL and the row mapping inside. Keep the in-memory and real versions honest with a shared contract test.

Next: [Behavioural patterns](https://zudojs.oyinlola.site/learn/design-patterns-behavioral), for how objects divide up the work: strategy, observer, command and chain of responsibility.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
