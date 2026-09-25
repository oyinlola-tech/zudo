---
title: "Testing strategies — ZudoJS Academy"
description: "Plan the tests for a checkout: unit, integration and e2e tests, test doubles, fixtures, isolation, contract, property-based, load and security tests."
source: https://zudojs.oyinlola.site/learn/testing-strategies
---

LEVEL 7 · LESSON 12 OF 15

Testing strategies Core

# Testing strategies

Plan the tests for a checkout: unit, integration and e2e tests, test doubles, fixtures, isolation, contract, property-based, load and security tests.

- **60 min** to read and try
- **You need:** Testing fundamentals, TypeScript on Node.js and Type-safe API layers
- **You build:** A layered test suite for a shop's checkout - table-driven unit tests, stubs, spies, mocks and fakes, a rollback-per-test PostgreSQL suite, end-to-end and security tests over HTTP, a payment gateway contract, fast-check properties and a small load test

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Decide which level (unit, integration, end-to-end) should catch a given bug, and why
- Choose between a dummy, stub, spy, mock and fake, and avoid tests that only check the mocks
- Keep tests isolated with fresh fixtures, builders and a rollback per test, and expose order dependence with a random seed
- Keep a fake honest with a contract suite that also runs against the real service
- Find edge cases with fast-check properties and read a shrunk counterexample
- Write security tests for authentication, ownership, trusted prices, injection and error leaks, and run a basic load test

## Green tests, broken checkout

A shop's checkout has 400 tests. All of them are green on Friday. On Saturday the first real customer pays for a ₦20,425 bag of rice and is charged ₦204.25. Every test passed because every test used a hand-written stand-in for the payment provider, and that stand-in took amounts in naira. The real provider takes them in **kobo** (1 naira = 100 kobo). The tests tested the code against a world that did not exist.

More tests would not have helped. The team needed a **test strategy**: a plan for *what* to test at *which* level, with *which* stand-ins, and how to keep those stand-ins honest. [Testing fundamentals](https://zudojs.oyinlola.site/learn/testing-basics) taught you how to write a test. This lesson is about choosing tests, so that together they catch the bugs that matter at a cost you can afford.

You will test one small checkout service from every side. Every test runs with `node:test` through tsx, as in the earlier lessons; at the end you will see the same ideas in Vitest.

## What to test where

Every test sits somewhere between two extremes. A **unit test** checks one function or class alone: fast, precise, and blind to how the parts fit. An **end-to-end (e2e) test** drives the whole running system from outside: slow, but it proves the parts really work together. **Integration tests** sit between: your code plus one real neighbour, usually the database.

```ts
            ▲ slower, fewer, broader
           ╱ ╲
          ╱e2e╲          a few: the main journeys over HTTP
         ╱─────╲
        ╱ integ-╲        some: SQL, queries, adapters against the real thing
       ╱ ration  ╲
      ╱───────────╲
     ╱    unit     ╲     many: rules, calculations, parsing, edge cases
    ╱───────────────╲
            ▼ faster, more, narrower
```

The test pyramid: many cheap tests at the bottom, a few expensive ones at the top.

The pyramid is a rule of thumb, not a law. Some teams prefer a "trophy" with more integration tests, because modern databases like PGlite make them nearly as fast as unit tests. The useful question is always the same: **what is the cheapest test that would catch this bug?**

REASON IT OUT

### Which test catches it?

Here are six real checkout bugs. For each one, decide the cheapest kind of test that would have caught it, before reading the answers:

1. VAT is rounded down instead of to the nearest kobo.
2. The SQL that saves an order puts the total in the `subtotal` column.
3. The route for `POST /orders` was renamed, and the mobile app still calls the old one.
4. The stand-in for the payment provider takes naira; the real one takes kobo.
5. A voucher bigger than the cart makes the total negative.
6. Customer B can read customer A's order by changing the id in the URL.

**Show the reasoning**

(1) A **unit** test of the pricing function, with a price whose VAT ends in half a kobo. (2) An **integration** test against a real database: a stand-in store would happily "save" wrong columns. (3) An **end-to-end** test over HTTP, or a **contract** test between the app and the API. (4) A **contract** test: one suite that runs against both the stand-in and the real provider's sandbox. (5) A **property-based** test: "the total is never negative", checked on thousands of generated carts, finds the case you did not think of. (6) A **security** test, end-to-end: log in as B and ask for A's order.

Notice that half of these bugs are not "the code computes the wrong value". They are about the joints: between your code and the database, the provider, the client, and an attacker. That is why a strategy needs more than unit tests.

| Kind | Catches | Misses | Typical speed |
| --- | --- | --- | --- |
| Unit | Wrong rules, rounding, parsing, edge cases | Wrong SQL, wiring, HTTP | Milliseconds |
| Integration | Wrong SQL, constraints, JSON columns, adapters | Routing, authentication, the whole flow | Tens of milliseconds, plus setup |
| End-to-end | Wiring, status codes, auth, the real journey | Rare branches (too slow to test them all) | Tenths of a second |
| Contract | A stand-in that behaves unlike the real thing | Your own logic | Fast against a fake, slow against a sandbox |
| Property-based | Edge cases nobody wrote down | Rules you did not state as a property | Fast (hundreds of runs per test) |
| Load | Slowness and failures under many users | Correctness | Minutes, run separately |

## The code under test

The shop sells groceries and prices everything in kobo, as whole numbers, never decimals. `priceCart` is pure: it adds up the lines, takes off a voucher, and adds 7.5% VAT. A **basis point** is a hundredth of a percent, so 7.5% is 750 basis points, which keeps the arithmetic in whole numbers:

src/pricing.tsNode.js only

```ts
export interface CartLine {
  readonly sku: string;
  readonly unitKobo: number;
  readonly quantity: number;
}

export interface Totals {
  readonly subtotalKobo: number;
  readonly discountKobo: number;
  readonly vatKobo: number;
  readonly totalKobo: number;
}

export const VAT_BASIS_POINTS = 750;

export function priceCart(lines: readonly CartLine[], voucherKobo = 0): Totals {
  if (lines.length === 0) throw new RangeError("the cart is empty");
  for (const line of lines) {
    if (!Number.isSafeInteger(line.unitKobo) || line.unitKobo < 0) throw new RangeError(`bad price for ${line.sku}`);
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) throw new RangeError(`bad quantity for ${line.sku}`);
  }
  const subtotalKobo = lines.reduce((sum, line) => sum + line.unitKobo * line.quantity, 0);
  const discountKobo = Math.min(voucherKobo, subtotalKobo);
  const vatKobo = Math.round(((subtotalKobo - discountKobo) * VAT_BASIS_POINTS) / 10_000);
  return { subtotalKobo, discountKobo, vatKobo, totalKobo: subtotalKobo - discountKobo + vatKobo };
}

export function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}
```

The checkout service needs three things from outside: somewhere to store orders, a payment provider and a mailer. As in [Type-safe API layers](https://zudojs.oyinlola.site/learn/ts-api-layers#services), it depends on interfaces, which is exactly what makes it testable:

src/ports.tsNode.js only

```ts
import type { CartLine, Totals } from "./pricing.js";

export type ChargeResult =
  | { readonly status: "succeeded"; readonly chargeId: string; readonly amountKobo: number }
  | { readonly status: "declined"; readonly reason: string };

export interface PaymentGateway {
  charge(request: { readonly reference: string; readonly amountKobo: number; readonly cardToken: string }): Promise<ChargeResult>;
}

export interface Order {
  readonly id: number;
  readonly customerId: number;
  readonly lines: readonly CartLine[];
  readonly totals: Totals;
  readonly status: "pending" | "paid" | "declined";
}

export interface OrderStore {
  create(order: Omit<Order, "id" | "status">): Promise<Order>;
  setStatus(id: number, status: Order["status"]): Promise<void>;
  find(id: number): Promise<Order | undefined>;
}

export interface Mailer {
  send(to: number, subject: string): Promise<void>;
}
```

src/checkout.tsNode.js only

```ts
import type { Mailer, Order, OrderStore, PaymentGateway } from "./ports.js";
import { naira, priceCart } from "./pricing.js";
import type { CartLine } from "./pricing.js";

export class CheckoutService {
  constructor(
    private readonly orders: OrderStore,
    private readonly gateway: PaymentGateway,
    private readonly mailer: Mailer,
  ) {}

  async checkout(customerId: number, lines: readonly CartLine[], cardToken: string, voucherKobo = 0): Promise<Order> {
    const totals = priceCart(lines, voucherKobo);
    const order = await this.orders.create({ customerId, lines, totals });
    const result = await this.gateway.charge({ reference: `order-${order.id}`, amountKobo: totals.totalKobo, cardToken });
    if (result.status === "declined") {
      await this.orders.setStatus(order.id, "declined");
      return { ...order, status: "declined" };
    }
    if (result.amountKobo !== totals.totalKobo) throw new Error(`charged ${result.amountKobo}, expected ${totals.totalKobo}`);
    await this.orders.setStatus(order.id, "paid");
    await this.mailer.send(customerId, `Receipt: ${naira(totals.totalKobo)} for order ${order.id}`);
    return { ...order, status: "paid" };
  }
}
```

Read `checkout` and list what can go wrong: a bad cart, a declined card, a provider that charged a different amount than asked, a mailer that fails. Each is a test.

## Unit tests: many cases, one table

Pricing is pure, so its tests need no setup at all. When several tests differ only in their data, write the data as a **table** and loop over it. Each row still becomes its own named test, so a failure tells you exactly which case broke:

tests/pricing.test.tsNode.js only

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { priceCart } from "../src/pricing.js";

const rice = { sku: "RICE-5KG", unitKobo: 950_000, quantity: 2 };
const oil = { sku: "OIL-1L", unitKobo: 250_050, quantity: 1 };

describe("priceCart", () => {
  const cases = [
    { name: "one line", lines: [rice], voucher: 0, total: 2_042_500 },
    { name: "VAT is rounded to the nearest kobo", lines: [oil], voucher: 0, total: 268_804 },
    { name: "a voucher comes off before VAT", lines: [rice], voucher: 100_000, total: 1_935_000 },
    { name: "a voucher never goes below zero", lines: [oil], voucher: 999_999_99, total: 0 },
  ];

  for (const { name, lines, voucher, total } of cases) {
    it(name, () => {
      assert.equal(priceCart(lines, voucher).totalKobo, total);
    });
  }

  it("refuses an empty cart and a zero quantity", () => {
    assert.throws(() => priceCart([]), /empty/);
    assert.throws(() => priceCart([{ ...rice, quantity: 0 }]), /bad quantity for RICE-5KG/);
  });
});
```

Output of `npx tsx tests/pricing.test.ts`

```ts
▶ priceCart
  ✔ one line (1.386707ms)
  ✔ VAT is rounded to the nearest kobo (0.193406ms)
  ✔ a voucher comes off before VAT (0.165886ms)
  ✔ a voucher never goes below zero (0.153813ms)
  ✔ refuses an empty cart and a zero quantity (0.771092ms)
✔ priceCart (4.670384ms)
ℹ tests 5
ℹ suites 1
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 125.870934
```

The cases were chosen on purpose, not at random. `OIL-1L` costs ₦2,500.50, and 7.5% of it is 18,753.75 kobo: the test pins the rounding rule. The huge voucher checks the lower boundary. Good unit tests sit on **boundaries** (zero, one, the maximum, just past it) and on the rules that are easy to get subtly wrong.

## Test doubles

A **test double** is anything that stands in for a real dependency during a test, like a stunt double for an actor. The word covers five different tools, and mixing them up leads to bad tests:

| Double | What it does | Use it when |
| --- | --- | --- |
| **Dummy** | Fills a parameter; is never used. Ours throws if it is. | The code needs the object, this path must not touch it |
| **Stub** | Returns canned answers | You need the dependency to say something specific: "declined" |
| **Spy** | Records how it was called | The *effect* is the point: a receipt was sent once |
| **Mock** | Knows in advance which calls it expects, and fails otherwise | The exact call is the contract: "charge exactly this total" |
| **Fake** | A working, simplified implementation | Many tests need realistic behaviour: an in-memory store |

Fakes are code you write once and reuse. This fake gateway behaves like the documented provider: amounts in kobo, the test card `tok_declined` is declined, and a repeated `reference` returns the first result instead of charging again (the provider's **idempotency** promise):

tests/fakes.tsNode.js only

```ts
import type { ChargeResult, Mailer, Order, OrderStore, PaymentGateway } from "../src/ports.js";

export class MemoryOrderStore implements OrderStore {
  private readonly orders = new Map<number, Order>();

  async create(order: Omit<Order, "id" | "status">): Promise<Order> {
    const saved: Order = { ...order, id: this.orders.size + 1, status: "pending" };
    this.orders.set(saved.id, saved);
    return saved;
  }

  async setStatus(id: number, status: Order["status"]): Promise<void> {
    const order = this.orders.get(id);
    if (order !== undefined) this.orders.set(id, { ...order, status });
  }

  async find(id: number): Promise<Order | undefined> {
    return this.orders.get(id);
  }
}

export class FakeGateway implements PaymentGateway {
  private readonly charges = new Map<string, ChargeResult>();

  async charge(request: { reference: string; amountKobo: number; cardToken: string }): Promise<ChargeResult> {
    const previous = this.charges.get(request.reference);
    if (previous !== undefined) return previous;
    const result: ChargeResult = request.cardToken === "tok_declined"
      ? { status: "declined", reason: "insufficient funds" }
      : { status: "succeeded", chargeId: `ch_${this.charges.size + 1}`, amountKobo: request.amountKobo };
    this.charges.set(request.reference, result);
    return result;
  }
}

export const silentMailer: Mailer = { send: async () => {} };
```

Now one test per kind of double. `mock.fn` from `node:test` makes a function that records its calls; with a type argument, `mock.fn<PaymentGateway["charge"]>`, it is checked against the real signature:

tests/checkout.test.tsNode.js only

```ts
import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import { CheckoutService } from "../src/checkout.js";
import type { Mailer, PaymentGateway } from "../src/ports.js";
import { FakeGateway, MemoryOrderStore } from "./fakes.js";

const rice = [{ sku: "RICE-5KG", unitKobo: 950_000, quantity: 2 }];

const dummyMailer: Mailer = {
  send: () => {
    throw new Error("this test must not send mail");
  },
};

describe("CheckoutService", () => {
  it("marks the order declined when the card is declined (stub + dummy)", async () => {
    const declining: PaymentGateway = { charge: async () => ({ status: "declined", reason: "insufficient funds" }) };
    const orders = new MemoryOrderStore();
    const order = await new CheckoutService(orders, declining, dummyMailer).checkout(1, rice, "tok_any");
    assert.equal(order.status, "declined");
    assert.equal((await orders.find(order.id))?.status, "declined");
  });

  it("sends exactly one receipt with the total (spy)", async () => {
    const mailer = { send: mock.fn(async (_customerId: number, _subject: string) => {}) };
    await new CheckoutService(new MemoryOrderStore(), new FakeGateway(), mailer).checkout(1, rice, "tok_visa");
    assert.equal(mailer.send.mock.callCount(), 1);
    assert.deepEqual(mailer.send.mock.calls[0]?.arguments, [1, "Receipt: ₦20,425.00 for order 1"]);
  });

  it("asks the gateway for the exact total, once (mock)", async () => {
    const charge = mock.fn<PaymentGateway["charge"]>(async (request) => {
      assert.deepEqual(request, { reference: "order-1", amountKobo: 2_042_500, cardToken: "tok_visa" });
      return { status: "succeeded", chargeId: "ch_1", amountKobo: request.amountKobo };
    });
    await new CheckoutService(new MemoryOrderStore(), { charge }, { send: async () => {} }).checkout(1, rice, "tok_visa");
    assert.equal(charge.mock.callCount(), 1);
  });

  it("stops if the gateway charged a different amount (stub)", async () => {
    const wrongAmount: PaymentGateway = { charge: async () => ({ status: "succeeded", chargeId: "ch_9", amountKobo: 20_425 }) };
    const service = new CheckoutService(new MemoryOrderStore(), wrongAmount, dummyMailer);
    await assert.rejects(service.checkout(1, rice, "tok_visa"), /charged 20425, expected 2042500/);
  });
});
```

Output of `npx tsx tests/checkout.test.ts`

```ts
▶ CheckoutService
  ✔ marks the order declined when the card is declined (stub + dummy) (1.629948ms)
  ✔ sends exactly one receipt with the total (spy) (27.141743ms)
  ✔ asks the gateway for the exact total, once (mock) (0.674851ms)
  ✔ stops if the gateway charged a different amount (stub) (0.791317ms)
✔ CheckoutService (32.130556ms)
ℹ tests 4
ℹ suites 1
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 146.041665
```

- **Stub + dummy.** The stub makes the "declined" branch happen on demand, which a real card would do only in the provider's sandbox. The dummy mailer proves that a declined order sends no receipt: if the code called it, the test would fail.
- **Spy.** The receipt is the observable result, so the test checks it: exactly one mail, with the formatted total.
- **Mock.** The expectation is written *before* the call, inside the double. It checks the exact request, including the reference the provider uses for idempotency.
- **The last stub** plays a misbehaving provider. The service's safety check turns it into an error instead of a paid order with the wrong amount.

> DON'T MOCK WHAT YOU OWN
>
> A test that mocks every collaborator ends up checking that the code calls the mocks in the order the test says, not that the checkout works. Such tests break on every harmless refactor and never catch a real bug. Use real objects for your own pure code (`priceCart` is never mocked here), fakes for your own stores, and stubs or mocks only at the **edges**: providers, mail, the clock, the network.

## Fixtures and builders

A **fixture** is the fixed state a test starts from: a cart, a customer, rows in a table. Copying the same object literal into fifty tests means fifty places to fix when `CartLine` gets a new field. A **builder** is a function that returns a valid default and lets each test override only what it cares about:

tests/builders.tsNode.js only

```ts
import type { CartLine } from "../src/pricing.js";

export function aLine(overrides: Partial<CartLine> = {}): CartLine {
  return { sku: "RICE-5KG", unitKobo: 950_000, quantity: 1, ...overrides };
}

export function aCart(...lines: CartLine[]): CartLine[] {
  return lines.length > 0 ? lines : [aLine()];
}
```

try-builders.tsNode.js only

```ts
import { naira, priceCart } from "./src/pricing.js";
import { aCart, aLine } from "./tests/builders.js";

const bulkOil = aCart(aLine(), aLine({ sku: "OIL-1L", unitKobo: 250_050, quantity: 12 }));
console.log(bulkOil.map((line) => `${line.quantity} x ${line.sku}`).join(", "));
console.log("total:", naira(priceCart(bulkOil).totalKobo));

const first = aLine();
const second = aLine();
console.log("fresh object each time:", first !== second);
```

Output of `npx tsx try-builders.ts`

```ts
1 x RICE-5KG, 12 x OIL-1L
total: ₦42,468.95
fresh object each time: true
```

A test that says `aLine({ quantity: 0 })` shows its intent at a glance: everything is normal except the quantity. And because every call returns a **new** object, a test that changes its fixture cannot change another test's.

## Isolation: order must not matter

A test is **isolated** when it passes alone, in any order, and in parallel with the others. The usual enemies are shared state: a module-level variable, a database row left behind, the clock, random numbers, environment variables, a fixed port. Here is a quiet one. Both tests share one store:

tests/leaky.test.tsNode.js only

```ts
import assert from "node:assert/strict";
import { it } from "node:test";

import { MemoryOrderStore } from "./fakes.js";

const store = new MemoryOrderStore();
const order = { customerId: 1, lines: [], totals: { subtotalKobo: 0, discountKobo: 0, vatKobo: 0, totalKobo: 0 } };

it("starts with no orders", async () => {
  assert.equal(await store.find(1), undefined);
});

it("gives the first order id 1", async () => {
  assert.equal((await store.create(order)).id, 1);
});
```

In the order written, both pass. Node's test runner can run tests in a random order with `--test-randomize`, and a fixed `--test-random-seed` repeats one particular order. This script runs the file with two seeds:

run-leaky.tsNode.js only

```ts
import { spawnSync } from "node:child_process";

for (const seed of [7, 1]) {
  const run = spawnSync(process.execPath, ["--test", `--test-random-seed=${seed}`, "--import", "tsx", "tests/leaky.test.ts"], {
    encoding: "utf8",
  });
  const report = run.stdout.split("\n");
  const results = report
    .slice(0, report.findIndex((line) => line.startsWith("ℹ")))
    .filter((line) => /^[✔✖] /.test(line))
    .map((line) => line.replace(/ \([\d.]+ms\)$/, ""));
  console.log(`seed ${seed}: ${results.join("  ")}`);
}
```

Output of `npx tsx run-leaky.ts`

```ts
seed 7: ✔ starts with no orders  ✔ gives the first order id 1
seed 1: ✔ gives the first order id 1  ✖ starts with no orders
```

With seed 1, "gives the first order id 1" ran first, so "starts with no orders" found order 1 and failed. Neither test is wrong on its own; they are wrong together. The fix is to create the store in `beforeEach` (or inside each test), so every test gets its own. Run your suite randomized in CI now and then: order dependence is much cheaper to find on purpose than by accident.

## Integration tests: a real database, rolled back

The PostgreSQL order store is tested against PostgreSQL, because the bugs that matter here (a wrong column, broken JSON, a constraint) only exist in the database. The store keeps the lines and totals as `jsonb`:

src/pg-order-store.tsNode.js only

```ts
import type { PGlite } from "@electric-sql/pglite";

import type { Order, OrderStore } from "./ports.js";

export const ORDERS_TABLE = `CREATE TABLE IF NOT EXISTS orders (
  id serial PRIMARY KEY,
  customer_id integer NOT NULL,
  lines jsonb NOT NULL,
  totals jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'paid', 'declined'))
)`;

interface OrderRow {
  readonly id: number;
  readonly customer_id: number;
  readonly lines: Order["lines"];
  readonly totals: Order["totals"];
  readonly status: Order["status"];
}

const toOrder = (row: OrderRow): Order => ({
  id: row.id, customerId: row.customer_id, lines: row.lines, totals: row.totals, status: row.status,
});

export class PgOrderStore implements OrderStore {
  constructor(private readonly db: PGlite) {}

  async create(order: Omit<Order, "id" | "status">): Promise<Order> {
    const { rows } = await this.db.query<OrderRow>(
      `INSERT INTO orders (customer_id, lines, totals, status) VALUES ($1, $2, $3, 'pending') RETURNING *`,
      [order.customerId, JSON.stringify(order.lines), JSON.stringify(order.totals)],
    );
    return toOrder(rows[0]!);
  }

  async setStatus(id: number, status: Order["status"]): Promise<void> {
    await this.db.query("UPDATE orders SET status = $2 WHERE id = $1", [id, status]);
  }

  async find(id: number): Promise<Order | undefined> {
    const { rows } = await this.db.query<OrderRow>("SELECT * FROM orders WHERE id = $1", [id]);
    return rows[0] === undefined ? undefined : toOrder(rows[0]);
  }
}
```

[Testing fundamentals](https://zudojs.oyinlola.site/learn/testing-basics#database) gave every test its own copy of the database with `clone()`. A cheaper trick when the tests share one connection: start a transaction before each test and **roll it back** after, so nothing a test writes survives it:

tests/pg-order-store.test.tsNode.js only

```ts
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { ORDERS_TABLE, PgOrderStore } from "../src/pg-order-store.js";

const totals = { subtotalKobo: 1_900_000, discountKobo: 0, vatKobo: 142_500, totalKobo: 2_042_500 };
const lines = [{ sku: "RICE-5KG", unitKobo: 950_000, quantity: 2 }];

describe("PgOrderStore", () => {
  const db = new PGlite();
  const store = new PgOrderStore(db);

  before(() => db.query(ORDERS_TABLE));
  beforeEach(() => db.exec("BEGIN"));
  afterEach(() => db.exec("ROLLBACK"));
  after(() => db.close());

  it("stores lines and totals as JSON and reads them back", async () => {
    const created = await store.create({ customerId: 1, lines, totals });
    assert.deepEqual(await store.find(created.id), { ...created, status: "pending" });
  });

  it("sees an empty table again after the rollback", async () => {
    const { rows } = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM orders");
    assert.equal(rows[0]?.count, 0);
  });

  it("lets the database refuse an unknown status", async () => {
    const created = await store.create({ customerId: 1, lines, totals });
    await assert.rejects(store.setStatus(created.id, "shipped" as "paid"), { code: "23514" });
  });
});
```

Output of `npx tsx tests/pg-order-store.test.ts`

```ts
▶ PgOrderStore
  ✔ stores lines and totals as JSON and reads them back (17.459997ms)
  ✔ sees an empty table again after the rollback (4.664163ms)
  ✔ lets the database refuse an unknown status (9.41189ms)
✔ PgOrderStore (3917.191271ms)
ℹ tests 3
ℹ suites 1
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3957.004942
```

The second test proves the rollback works. Two limits to know. **Sequences are not rolled back**: the `serial` id keeps counting across tests, so never assert that an order got id 1 here. And code that opens its *own* transactions, or uses several connections, cannot be wrapped this way; give those tests a fresh database instead. The `"shipped" as "paid"` cast is deliberate: the test lies to the compiler to prove the *database* would still refuse the value.

## End-to-end tests over HTTP

An end-to-end test starts the real server and talks HTTP to it. The API below prices carts from a catalog, charges through the gateway and lets customers read their own orders. Authentication is a lookup from token to customer id, standing in for the signed tokens from [BookStore API: authentication and tests](https://zudojs.oyinlola.site/learn/bookstore-auth#tokens):

src/catalog.tsNode.js only

```ts
const CATALOG: Readonly<Record<string, number>> = {
  "RICE-5KG": 950_000,
  "OIL-1L": 250_050,
  "SUGAR-1KG": 120_000,
};

export function priceOf(sku: string): number | undefined {
  return CATALOG[sku];
}
```

src/server.tsNode.js only

```ts
import { createServer } from "node:http";
import type { IncomingMessage, Server } from "node:http";

import type { CheckoutService } from "./checkout.js";
import type { OrderStore } from "./ports.js";
import { priceOf } from "./catalog.js";
import type { CartLine } from "./pricing.js";

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    if (!Buffer.isBuffer(chunk)) throw new HttpError(400, "expected bytes");
    size += chunk.length;
    if (size > 10_000) throw new HttpError(413, "body too large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "body is not JSON");
  }
}

export function parseCart(body: unknown): { lines: CartLine[]; cardToken: string } {
  if (typeof body !== "object" || body === null || !("items" in body) || !Array.isArray(body.items)) throw new HttpError(400, "send items");
  if (!("cardToken" in body) || typeof body.cardToken !== "string") throw new HttpError(400, "send a cardToken");
  const lines = body.items.map((item: unknown): CartLine => {
    if (typeof item !== "object" || item === null || !("sku" in item) || !("quantity" in item)) throw new HttpError(400, "bad item");
    const unitKobo = typeof item.sku === "string" ? priceOf(item.sku) : undefined;
    if (unitKobo === undefined || typeof item.sku !== "string") throw new HttpError(400, "unknown product");
    if (!Number.isInteger(item.quantity)) throw new HttpError(400, "bad quantity");
    return { sku: item.sku, unitKobo, quantity: Number(item.quantity) };
  });
  return { lines, cardToken: body.cardToken };
}

export function createApi(checkout: CheckoutService, orders: OrderStore, customers: ReadonlyMap<string, number>): Server {
  return createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    };
    try {
      const token = req.headers.authorization?.replace(/^Bearer /, "");
      const customerId = token === undefined ? undefined : customers.get(token);
      if (customerId === undefined) throw new HttpError(401, "log in first");
      const url = new URL(req.url ?? "/", "http://localhost");
      const orderId = /^\/orders\/(\d+)$/.exec(url.pathname)?.[1];
      if (req.method === "POST" && url.pathname === "/orders") {
        const { lines, cardToken } = parseCart(await readJson(req));
        send(201, await checkout.checkout(customerId, lines, cardToken));
      } else if (req.method === "GET" && orderId !== undefined) {
        const order = await orders.find(Number(orderId));
        if (order === undefined || order.customerId !== customerId) throw new HttpError(404, "no such order");
        send(200, order);
      } else {
        throw new HttpError(404, "no such route");
      }
    } catch (error) {
      if (error instanceof HttpError) send(error.status, { error: error.message });
      else if (error instanceof RangeError) send(400, { error: error.message });
      else send(500, { error: "internal error" });
    }
  });
}
```

How far does "end to end" reach? Here, the database is real and the payment provider is the fake. That is the usual choice: your system is tested end to end, and the provider's side is covered by the contract tests in the next section. Tests that hit the provider's real sandbox are slow and flaky, so they run separately. The suite also contains the security tests, which the [security section](#security) below explains:

tests/api.e2e.test.tsNode.js only

```ts
import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, describe, it } from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { CheckoutService } from "../src/checkout.js";
import { ORDERS_TABLE, PgOrderStore } from "../src/pg-order-store.js";
import { createApi } from "../src/server.js";
import { FakeGateway, silentMailer } from "./fakes.js";

const db = new PGlite();
const store = new PgOrderStore(db);
const server = createApi(new CheckoutService(store, new FakeGateway(), silentMailer), store, new Map([["tok-ada", 1], ["tok-bola", 2]]));
let base = "";

before(async () => {
  await db.query(ORDERS_TABLE);
  server.listen(0);
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected a TCP address");
  base = `http://localhost:${address.port}`;
});
after(async () => {
  server.close();
  await db.close();
});

function call(method: string, path: string, token?: string, body?: string): Promise<Response> {
  const headers: Record<string, string> = token === undefined ? {} : { authorization: `Bearer ${token}` };
  return fetch(base + path, { method, headers, body });
}
const cart = JSON.stringify({ items: [{ sku: "RICE-5KG", quantity: 2 }], cardToken: "tok_visa" });

describe("checkout API", () => {
  it("places an order and shows it to its owner", async () => {
    const created = await call("POST", "/orders", "tok-ada", cart);
    assert.equal(created.status, 201);
    const order = (await created.json()) as { id: number; status: string };
    assert.equal(order.status, "paid");
    assert.equal((await call("GET", `/orders/${order.id}`, "tok-ada")).status, 200);
  });
});

describe("security", () => {
  it("refuses a missing or unknown token", async () => {
    assert.equal((await call("GET", "/orders/1")).status, 401);
    assert.equal((await call("GET", "/orders/1", "tok-mallory")).status, 401);
  });

  it("hides one customer's order from another", async () => {
    const { id } = (await (await call("POST", "/orders", "tok-ada", cart)).json()) as { id: number };
    assert.equal((await call("GET", `/orders/${id}`, "tok-bola")).status, 404);
  });

  it("ignores a price sent by the client", async () => {
    const cheap = JSON.stringify({ items: [{ sku: "RICE-5KG", quantity: 1, unitKobo: 1 }], cardToken: "tok_visa" });
    const order = (await (await call("POST", "/orders", "tok-ada", cheap)).json()) as { totals: { subtotalKobo: number } };
    assert.equal(order.totals.subtotalKobo, 950_000);
  });

  it("treats SQL in a field as plain data", async () => {
    const attack = JSON.stringify({ items: [{ sku: "RICE-5KG'; DROP TABLE orders; --", quantity: 1 }], cardToken: "tok_visa" });
    assert.equal((await call("POST", "/orders", "tok-ada", attack)).status, 400);
    assert.equal((await call("POST", "/orders", "tok-ada", cart)).status, 201);
  });

  it("refuses a huge body", async () => {
    assert.equal((await call("POST", "/orders", "tok-ada", "x".repeat(20_000))).status, 413);
  });

  it("never leaks internals in an error", async () => {
    const response = await call("POST", "/orders", "tok-ada", "{broken");
    const text = await response.text();
    assert.equal(response.status, 400);
    assert.doesNotMatch(text, /stack|at .*\.ts|SyntaxError/);
  });
});
```

Output of `npx tsx tests/api.e2e.test.ts`

```ts
▶ checkout API
  ✔ places an order and shows it to its owner (73.418335ms)
✔ checkout API (3633.402191ms)
▶ security
  ✔ refuses a missing or unknown token (6.515213ms)
  ✔ hides one customer's order from another (10.695394ms)
  ✔ ignores a price sent by the client (7.148748ms)
  ✔ treats SQL in a field as plain data (11.84591ms)
  ✔ refuses a huge body (7.526784ms)
  ✔ never leaks internals in an error (4.942228ms)
✔ security (50.584873ms)
ℹ tests 7
ℹ suites 2
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3746.76751
```

Most of the time is PGlite starting once, in `before`. The tests themselves take milliseconds, which is why a few well-chosen end-to-end tests are affordable.

## Contract tests: keeping fakes honest

The bug from the start of the lesson lived in a fake. Fakes are only useful if they behave like the real thing, and nothing checks that by default. A **contract test** is a suite that states the behaviour both sides rely on and runs against **every** implementation: the fake on every commit, the real provider's sandbox on a schedule. When the provider changes, the sandbox run fails and tells you to update the fake.

The contract is written once, as a list of checks that take any `PaymentGateway`:

tests/gateway.contract.tsNode.js only

```ts
import assert from "node:assert/strict";

import type { PaymentGateway } from "../src/ports.js";

export interface ContractCheck {
  readonly name: string;
  run(gateway: PaymentGateway): Promise<void>;
}

let next = 0;
const reference = () => `contract-${Date.now()}-${next++}`;

export const paymentGatewayContract: readonly ContractCheck[] = [
  {
    name: "charges the exact amount, in kobo",
    async run(gateway) {
      const result = await gateway.charge({ reference: reference(), amountKobo: 2_042_500, cardToken: "tok_visa" });
      assert.ok(result.status === "succeeded", "a normal card must succeed");
      assert.equal(result.amountKobo, 2_042_500, `charged ${result.amountKobo} instead of 2042500 kobo`);
    },
  },
  {
    name: "declines the test card tok_declined",
    async run(gateway) {
      const result = await gateway.charge({ reference: reference(), amountKobo: 50_000, cardToken: "tok_declined" });
      assert.equal(result.status, "declined", `tok_declined gave "${result.status}"`);
    },
  },
  {
    name: "never charges one reference twice",
    async run(gateway) {
      const request = { reference: reference(), amountKobo: 50_000, cardToken: "tok_visa" };
      const first = await gateway.charge(request);
      const again = await gateway.charge(request);
      assert.deepEqual(again, first, "a repeated reference must return the first result, not a new charge");
    },
  },
];
```

The real adapter talks to the provider's HTTP API. It sends the reference as an `Idempotency-Key` header, the way many payment providers document it:

src/http-gateway.tsNode.js only

```ts
import type { ChargeResult, PaymentGateway } from "./ports.js";

export class HttpPaymentGateway implements PaymentGateway {
  constructor(private readonly baseUrl: string, private readonly secretKey: string) {}

  async charge(request: { reference: string; amountKobo: number; cardToken: string }): Promise<ChargeResult> {
    const response = await fetch(`${this.baseUrl}/charges`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        "content-type": "application/json",
        "idempotency-key": request.reference,
      },
      body: JSON.stringify({ amount: request.amountKobo, card: request.cardToken }),
    });
    const data = (await response.json()) as { id?: string; status?: string; amount?: number; reason?: string };
    if (data.status === "success" && typeof data.id === "string" && typeof data.amount === "number") {
      return { status: "succeeded", chargeId: data.id, amountKobo: data.amount };
    }
    return { status: "declined", reason: data.reason ?? `provider answered ${response.status}` };
  }
}
```

The test file runs the contract against the fake and, when the sandbox settings are present, against the real adapter. Without them, that suite is skipped with a reason, instead of failing on every laptop:

tests/gateway.contract.test.tsNode.js only

```ts
import { describe, it } from "node:test";

import { HttpPaymentGateway } from "../src/http-gateway.js";
import type { PaymentGateway } from "../src/ports.js";
import { paymentGatewayContract } from "./gateway.contract.js";
import { FakeGateway } from "./fakes.js";

function runContract(name: string, make: () => PaymentGateway, skip: string | false = false): void {
  describe(`PaymentGateway contract: ${name}`, { skip }, () => {
    for (const check of paymentGatewayContract) {
      it(check.name, () => check.run(make()));
    }
  });
}

runContract("FakeGateway", () => new FakeGateway());

const sandbox = process.env["PAYMENT_SANDBOX_URL"];
const key = process.env["PAYMENT_SANDBOX_KEY"];
runContract(
  "provider sandbox",
  () => new HttpPaymentGateway(sandbox ?? "", key ?? ""),
  sandbox === undefined || key === undefined ? "set PAYMENT_SANDBOX_URL and PAYMENT_SANDBOX_KEY to run" : false,
);
```

Output of `npx tsx tests/gateway.contract.test.ts`

```ts
▶ PaymentGateway contract: FakeGateway
  ✔ charges the exact amount, in kobo (1.440715ms)
  ✔ declines the test card tok_declined (0.308688ms)
  ✔ never charges one reference twice (0.651545ms)
✔ PaymentGateway contract: FakeGateway (4.288283ms)
﹣ PaymentGateway contract: provider sandbox (0.112271ms) # set PAYMENT_SANDBOX_URL and PAYMENT_SANDBOX_KEY to run
ℹ tests 3
ℹ suites 2
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 128.036423
```

Now the fake from the start of the lesson. It takes naira, declines nothing, and charges again on every retry. Run the same contract against it:

check-sloppy-fake.tsNode.js only

```ts
import type { ChargeResult, PaymentGateway } from "./src/ports.js";
import { paymentGatewayContract } from "./tests/gateway.contract.js";

class SloppyGateway implements PaymentGateway {
  private count = 0;

  async charge(request: { amountKobo: number; cardToken: string }): Promise<ChargeResult> {
    this.count += 1;
    return { status: "succeeded", chargeId: `ch_${this.count}`, amountKobo: request.amountKobo / 100 };
  }
}

for (const check of paymentGatewayContract) {
  try {
    await check.run(new SloppyGateway());
    console.log("PASS", check.name);
  } catch (error) {
    console.log("FAIL", check.name, "->", error instanceof Error ? error.message.split("\n")[0] : error);
  }
}
```

Output of `npx tsx check-sloppy-fake.ts`

```ts
FAIL charges the exact amount, in kobo -> charged 20425 instead of 2042500 kobo
FAIL declines the test card tok_declined -> tok_declined gave "succeeded"
FAIL never charges one reference twice -> a repeated reference must return the first result, not a new charge
```

All three failures are bugs that 400 green tests had hidden. This style, one suite for several implementations, works for every port: an in-memory and a PostgreSQL repository, a local and an S3 file store. Between separate teams the same idea is called **consumer-driven contract testing**: the client team writes down the requests it makes and the answers it relies on, and the API team runs those expectations in its own CI (Pact is a popular tool for it). [API contracts](https://zudojs.oyinlola.site/learn/api-contracts) goes deeper.

## Property-based tests with fast-check

Example-based tests check the cases you thought of. A **property** is a rule that must hold for *every* input, such as "the total is never negative". A property-based testing library generates hundreds of random inputs, and when one breaks the rule it **shrinks** it: it keeps simplifying the failing input while it still fails, and reports the smallest one. **fast-check** is the standard library for this in JavaScript (`npm install -D fast-check`).

Imagine an early version of the pricing function that forgot to cap the voucher. Describe carts and vouchers with fast-check's **arbitraries** (generators of random values), and state the property:

find-negative-total.tsNode.js only

```ts
import fc from "fast-check";

import { VAT_BASIS_POINTS } from "./src/pricing.js";
import type { CartLine } from "./src/pricing.js";

function priceCartV1(lines: readonly CartLine[], voucherKobo: number): number {
  const subtotal = lines.reduce((sum, line) => sum + line.unitKobo * line.quantity, 0);
  const vat = Math.round((subtotal * VAT_BASIS_POINTS) / 10_000);
  return subtotal - voucherKobo + vat;
}

const line = fc.record({
  sku: fc.constantFrom("RICE-5KG", "OIL-1L", "SUGAR-1KG"),
  unitKobo: fc.integer({ min: 0, max: 5_000_000 }),
  quantity: fc.integer({ min: 1, max: 99 }),
});
const cart = fc.array(line, { minLength: 1, maxLength: 5 });
const voucher = fc.integer({ min: 0, max: 2_000_000 });

try {
  fc.assert(fc.property(cart, voucher, (lines, voucherKobo) => priceCartV1(lines, voucherKobo) >= 0), { seed: 2026 });
} catch (error) {
  console.log(error instanceof Error ? error.message : error);
}
```

Output of `npx tsx find-negative-total.ts`

```ts
Property failed after 24 tests
{ seed: 2026, path: "23:0:0:0:0:1:0:0:0:0:0:0:0:0:0:0:0:0:0:0", endOnFailure: true }
Counterexample: [[{"sku":"RICE-5KG","unitKobo":0,"quantity":1}],1]
Shrunk 19 time(s)

Hint: Enable verbose mode in order to have the list of all failing values encountered during the run
```

Read the report line by line. fast-check needed 24 random carts to find a failure. The counterexample is the smallest cart fast-check could find: one free item and a voucher of 1 kobo, which gives a total of −1. It started from a much bigger random cart and shrank it 19 times. The `seed` makes the run repeatable: the same seed always generates the same inputs, so you can reproduce a failure from CI on your laptop. (The example fixes the seed so its output is the same on every run; normally you leave it out and fast-check picks a new one each time.)

The real `priceCart` caps the voucher. Properties for it state rules, not single answers:

tests/pricing.property.test.tsNode.js only

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import fc from "fast-check";

import { VAT_BASIS_POINTS, priceCart } from "../src/pricing.js";

const line = fc.record({
  sku: fc.constantFrom("RICE-5KG", "OIL-1L", "SUGAR-1KG"),
  unitKobo: fc.integer({ min: 0, max: 5_000_000 }),
  quantity: fc.integer({ min: 1, max: 99 }),
});
const cart = fc.array(line, { minLength: 1, maxLength: 5 });
const voucher = fc.integer({ min: 0, max: 2_000_000 });

describe("priceCart properties", () => {
  it("never charges a negative total", () => {
    fc.assert(fc.property(cart, voucher, (lines, voucherKobo) => priceCart(lines, voucherKobo).totalKobo >= 0));
  });

  it("adds up: subtotal - discount + VAT = total", () => {
    fc.assert(fc.property(cart, voucher, (lines, voucherKobo) => {
      const t = priceCart(lines, voucherKobo);
      assert.equal(t.subtotalKobo - t.discountKobo + t.vatKobo, t.totalKobo);
    }));
  });

  it("charges VAT within half a kobo of 7.5%", () => {
    fc.assert(fc.property(cart, voucher, (lines, voucherKobo) => {
      const t = priceCart(lines, voucherKobo);
      const exact = ((t.subtotalKobo - t.discountKobo) * VAT_BASIS_POINTS) / 10_000;
      return Math.abs(t.vatKobo - exact) <= 0.5;
    }));
  });

  it("does not depend on the order of the lines", () => {
    fc.assert(fc.property(cart, (lines) => priceCart(lines).totalKobo === priceCart(lines.toReversed()).totalKobo));
  });
});
```

Output of `npx tsx tests/pricing.property.test.ts`

```ts
▶ priceCart properties
  ✔ never charges a negative total (7.457861ms)
  ✔ adds up: subtotal - discount + VAT = total (2.886537ms)
  ✔ charges VAT within half a kobo of 7.5% (2.939279ms)
  ✔ does not depend on the order of the lines (3.217657ms)
✔ priceCart properties (18.419885ms)
ℹ tests 4
ℹ suites 1
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 112.329343
```

Good properties come in a few families: **invariants** (never negative; the parts add up), **oracles** (agrees with a simple but slow reference calculation, here the exact VAT), **symmetry** (the order of the lines does not matter), and **round trips** (decode after encode gives the original; you saw one with pagination cursors). Properties do not replace examples: an example pins the known right answer for one case, a property guards a rule across all of them.

## Security tests

Most tests check that the right thing happens. **Security tests** check that the wrong thing does *not* happen, even when someone tries. The `security` block of the end-to-end suite above tests six attacks, one per line of defence:

- **No token or a made-up token** gets 401.
- **Another customer's order** gets 404. This is the classic **IDOR** (insecure direct object reference): changing an id in a URL to read someone else's data. It must be tested with two real users, because a single-user test can never see it.
- **A price sent by the client** is ignored; prices come from the catalog.
- **SQL in a field** is refused as an unknown product, and the next order still works, so no table was dropped.
- **A huge body** gets 413 before it fills the server's memory.
- **A broken body** gets a plain message with no stack trace, file path or error class in it.

### Fuzzing the parser

Security bugs hide in inputs nobody imagined. **Fuzzing** means throwing huge numbers of generated inputs at code that reads untrusted data, and fast-check is a good fuzzer for typed code. The property for `parseCart`: whatever the body, the answer is a cart with catalog prices, or a 400. Random JSON almost never looks like a cart, so this runner also builds *cart-shaped* bodies with suspicious product codes mixed in:

fuzz-cart.tsNode.js only

```ts
import assert from "node:assert/strict";

import fc from "fast-check";

import { HttpError, parseCart } from "./src/server.js";

const item = fc.record({
  sku: fc.oneof(fc.constantFrom("RICE-5KG", "OIL-1L"), fc.string({ maxLength: 12 }), fc.constantFrom("toString", "constructor", "__proto__")),
  quantity: fc.integer({ min: 1, max: 3 }),
});
const body = fc.record({ items: fc.array(item, { minLength: 1, maxLength: 3 }), cardToken: fc.constant("tok_visa") });

try {
  fc.assert(
    fc.property(body, (input) => {
      try {
        for (const line of parseCart(input).lines) assert.ok(typeof line.unitKobo === "number" && line.unitKobo > 0, `price of ${line.sku} is ${typeof line.unitKobo}`);
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
      }
    }),
    { seed: 7 },
  );
  console.log("no counterexample found");
} catch (error) {
  if (!(error instanceof Error)) throw error;
  console.log(error.message.split("\n\n")[0]);
  console.log("cause:", error.cause instanceof Error ? error.cause.message : error.cause);
}
```

Output of `npx tsx fuzz-cart.ts`

```ts
Property failed after 5 tests
{ seed: 7, path: "4:0:0:0", endOnFailure: true }
Counterexample: [{"items":[{"sku":"toString","quantity":1}],"cardToken":"tok_visa"}]
Shrunk 3 time(s)
cause: price of toString is function
```

A real bug. `CATALOG["toString"]` does not find a product; it finds the `toString` method every object inherits from `Object.prototype`. The type `Record<string, number>` promised a number and got a function. In this shop, `priceCart`'s own checks happened to turn it into a 400. Without them, the order would have been priced with a function: `NaN` kobo. The fix is a lookup that only sees the catalog's own entries. A `Map` has no inherited keys:

src/catalog.tsNode.js only

```ts
const CATALOG = new Map<string, number>([
  ["RICE-5KG", 950_000],
  ["OIL-1L", 250_050],
  ["SUGAR-1KG", 120_000],
]);

export function priceOf(sku: string): number | undefined {
  return CATALOG.get(sku);
}
```

fuzz-cart-again.tsNode.js only

```ts
import "./fuzz-cart.js";
```

Output of `npx tsx fuzz-cart-again.ts`

```ts
no counterexample found
```

Keep the fuzz property in the suite, so the bug can never come back. This version runs without a fixed seed, so every run explores new inputs:

tests/parse-cart.fuzz.test.tsNode.js only

```ts
import assert from "node:assert/strict";
import { it } from "node:test";

import fc from "fast-check";

import { HttpError, parseCart } from "../src/server.js";

const item = fc.record({
  sku: fc.oneof(fc.constantFrom("RICE-5KG", "OIL-1L"), fc.string({ maxLength: 12 }), fc.constantFrom("toString", "constructor", "__proto__")),
  quantity: fc.integer({ min: 1, max: 3 }),
});
const cartBody = fc.record({ items: fc.array(item, { minLength: 1, maxLength: 3 }), cardToken: fc.constant("tok_visa") });

function cartOr400(input: unknown): void {
  try {
    for (const line of parseCart(input).lines) assert.ok(typeof line.unitKobo === "number" && line.unitKobo > 0);
  } catch (error) {
    assert.ok(error instanceof HttpError && error.status === 400, `unexpected ${String(error)}`);
  }
}

it("answers any JSON value with a cart or a 400", () => {
  fc.assert(fc.property(fc.jsonValue(), cartOr400), { numRuns: 1_000 });
});

it("prices every item that looks like a cart from the catalog", () => {
  fc.assert(fc.property(cartBody, cartOr400), { numRuns: 1_000 });
});
```

Output of `npx tsx tests/parse-cart.fuzz.test.ts`

```ts
✔ answers any JSON value with a cart or a 400 (81.862133ms)
✔ prices every item that looks like a cart from the catalog (24.036721ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 222.165285
```

Security testing goes further than unit and e2e tests: dependency audits (`npm audit`), static analysis, and penetration tests by specialists. The tests here are the part every developer owns: each security rule you write in code gets a test that attacks it.

## Load testing basics

A **load test** answers a different question: does the checkout stay fast and correct when many customers use it at once? Four words to know:

- **Concurrency**: how many requests are in flight at the same time.
- **Throughput**: requests completed per second.
- **Latency percentiles**: p50 is the time the median request took; p95 is the time 95% of requests beat. Averages hide the slow tail; p95 and p99 show what your unluckiest customers feel.
- **Error rate**: the share of requests that failed. A server that is fast because it answers 500 to everyone is not fast.

Here is the whole idea in one small script: 300 checkouts, 30 at a time, against the API with in-memory fakes. It reports status counts, percentiles and whether p95 stays under a budget:

load.tsNode.js only

```ts
import { once } from "node:events";
import { performance } from "node:perf_hooks";

import { CheckoutService } from "./src/checkout.js";
import { createApi } from "./src/server.js";
import { FakeGateway, MemoryOrderStore, silentMailer } from "./tests/fakes.js";

const orders = new MemoryOrderStore();
const server = createApi(new CheckoutService(orders, new FakeGateway(), silentMailer), orders, new Map([["tok-ada", 1]]));
server.listen(0);
await once(server, "listening");
const address = server.address();
if (address === null || typeof address === "string") throw new Error("expected a TCP address");
const url = `http://localhost:${address.port}/orders`;

const TOTAL = 300;
const CONCURRENCY = 30;
const latencies: number[] = [];
const statuses = new Map<number, number>();
let sent = 0;

async function worker(): Promise<void> {
  while (sent < TOTAL) {
    sent += 1;
    const start = performance.now();
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: "Bearer tok-ada" },
      body: JSON.stringify({ items: [{ sku: "RICE-5KG", quantity: 1 }], cardToken: "tok_visa" }),
    });
    await response.arrayBuffer();
    latencies.push(performance.now() - start);
    statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
server.close();

function percentile(values: readonly number[], p: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.ceil((p / 100) * sorted.length) - 1] ?? Number.NaN;
}

const BUDGET_MS = 2_000;
console.log("requests:", latencies.length, "statuses:", Object.fromEntries(statuses));
console.log("orders stored:", (await orders.find(TOTAL)) !== undefined);
const ms = (p: number) => `${percentile(latencies, p).toFixed(1)} ms`;
console.log(`p50 ${ms(50)}, p95 ${ms(95)}, p99 ${ms(99)}`);
console.log(`p95 within the budget of ${BUDGET_MS} ms: ${percentile(latencies, 95) <= BUDGET_MS}`);
```

Output of `npx tsx load.ts`

```ts
requests: 300 statuses: { '201': 300 }
orders stored: true
p50 29.8 ms, p95 297.2 ms, p99 406.4 ms
p95 within the budget of 2000 ms: true
```

Your numbers will differ from run to run and machine to machine, which is exactly why load results are compared against a **budget** ("p95 under 300 ms at 50 concurrent users") rather than read as absolute truths. Real load tests use dedicated tools. **autocannon** is a Node.js tool for hammering one endpoint. Here: 50 connections (`-c`) for 30 seconds (`-d`), each sending the same checkout:

Terminal on your computer

```bash
$ npx autocannon -c 50 -d 30 -m POST -H "authorization=Bearer $LOAD_TEST_TOKEN" -H "content-type=application/json" -b '{"items":[{"sku":"RICE-5KG","quantity":1}],"cardToken":"tok_visa"}' http://localhost:3000/orders
```

It prints a table of latency percentiles, a table of requests and bytes per second, and a count of non-2xx responses and errors. Read the percentile rows and the error count first. **k6** runs whole scenarios written in JavaScript, ramps users up and down, and fails the run when a **threshold** is broken, which makes it fit for CI:

load/checkout.k6.js

```ts
import http from "k6/http";
import { check } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 50 },
    { duration: "1m", target: 50 },
    { duration: "15s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<300"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const body = JSON.stringify({ items: [{ sku: "RICE-5KG", quantity: 1 }], cardToken: "tok_visa" });
  const response = http.post(`${__ENV.BASE_URL}/orders`, body, {
    headers: { authorization: `Bearer ${__ENV.LOAD_TEST_TOKEN}`, "content-type": "application/json" },
  });
  check(response, { "status is 201": (r) => r.status === 201 });
}
```

Terminal on your computer

```bash
$ k6 run -e BASE_URL=https://staging.shop.example -e LOAD_TEST_TOKEN=$LOAD_TEST_TOKEN load/checkout.k6.js
```

k6 ends with a summary of every metric and marks each threshold as passed or failed; a failed threshold makes the command exit with a non-zero code, so CI can block a release. Three rules: never load-test production without permission and a plan, test against a staging copy with a fake payment provider, and change one thing at a time between runs so you know what made the difference.

## The same ideas in Vitest

ZudoJS projects use Vitest (you set it up in [Testing TypeScript](https://zudojs.oyinlola.site/learn/ts-testing#setup), and [Testing fundamentals](https://zudojs.oyinlola.site/learn/testing-basics#vitest) maps its names to `node:test`). Every idea in this lesson carries over; the names change. `it.each` is the table-driven test, `vi.fn()` is `mock.fn()`, and `vi.useFakeTimers()` controls the clock:

tests/pricing.test.ts

```ts
import { describe, expect, it, vi } from "vitest";

import { naira, priceCart } from "../src/pricing.js";

const rice = { sku: "RICE-5KG", unitKobo: 950_000, quantity: 2 };

describe("priceCart", () => {
  it.each([
    { voucher: 0, total: 2_042_500 },
    { voucher: 100_000, total: 1_935_000 },
    { voucher: 999_999_99, total: 0 },
  ])("voucher $voucher gives total $total", ({ voucher, total }) => {
    expect(priceCart([rice], voucher).totalKobo).toBe(total);
  });

  it("refuses an empty cart", () => {
    expect(() => priceCart([])).toThrow(/empty/);
  });
});

describe("receipts", () => {
  it("formats the total once per order", () => {
    const send = vi.fn();
    send(`Receipt: ${naira(priceCart([rice]).totalKobo)}`);
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith("Receipt: ₦20,425.00");
  });
});
```

Terminal on your computer

```bash
$ npx vitest run --reporter=verbose

 RUN  v5.0.1 ~/shop

 ✓ tests/pricing.test.ts > priceCart > voucher 0 gives total 2042500 3ms
 ✓ tests/pricing.test.ts > priceCart > voucher 100000 gives total 1935000 0ms
 ✓ tests/pricing.test.ts > priceCart > voucher 99999999 gives total 0 0ms
 ✓ tests/pricing.test.ts > priceCart > refuses an empty cart 1ms
 ✓ tests/pricing.test.ts > receipts > formats the total once per order 30ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  23:03:35
   Duration  420ms (transform 70%, tests 15%, import 12%, worker 2%)
```

fast-check works in Vitest unchanged, and `@fast-check/vitest` adds a `test.prop` helper. [Testing a ZudoJS app](https://zudojs.oyinlola.site/learn/zudo-testing) builds on this.

## A strategy for CI

Tests only protect you if they run. A workable plan for a backend like this:

- **On every push:** type check, unit tests, property tests, integration tests with PGlite, contract tests against the fakes, end-to-end and security tests. Aim for a few minutes; a slow suite gets skipped.
- **Nightly or before a release:** contract tests against the provider's sandbox, a randomized-order run, longer fuzzing (more `numRuns`), and a load test against staging.
- **Flaky tests** (pass or fail with no code change) are bugs. Usually the cause is shared state, real time, or the network. Fix them or delete them; a suite people have learned to re-run teaches them to ignore red.
- **Coverage** (`node --test --experimental-test-coverage`, or `vitest run --coverage` with a coverage provider such as `@vitest/coverage-v8` installed) shows which lines no test runs. Use it to find untested branches, not as a target: 100% coverage with weak assertions proves little.
- **Test data is data.** Never use real card numbers, real customer e-mails or production secrets in tests or fixtures. Providers publish test cards such as `tok_declined` for exactly this reason.

## Practice

TRY IT YOURSELF

### The provider is down

What should `checkout` do when `charge` throws a network error? Write a stub that throws `Error("ECONNRESET")` and a test that checks two things: the error reaches the caller, and the order stays `pending` (the money may or may not have moved, so it must not be marked paid or declined).

**Show a solution**

tests/provider-down.test.tsNode.js only

```ts
import assert from "node:assert/strict";
import { it } from "node:test";

import { CheckoutService } from "../src/checkout.js";
import type { PaymentGateway } from "../src/ports.js";
import { aCart } from "./builders.js";
import { MemoryOrderStore, silentMailer } from "./fakes.js";

it("leaves the order pending when the provider cannot be reached", async () => {
  const unreachable: PaymentGateway = {
    charge: async () => {
      throw new Error("ECONNRESET");
    },
  };
  const orders = new MemoryOrderStore();
  await assert.rejects(new CheckoutService(orders, unreachable, silentMailer).checkout(1, aCart(), "tok_visa"), /ECONNRESET/);
  assert.equal((await orders.find(1))?.status, "pending");
});
```

Output of `npx tsx tests/provider-down.test.ts`

```ts
✔ leaves the order pending when the provider cannot be reached (2.682255ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 157.486158
```

"Pending" is honest: a timeout does not tell you whether the charge happened. A background job later asks the provider about `order-1` and settles it; [Queues and background jobs](https://zudojs.oyinlola.site/learn/backend-queues) builds that kind of job. Because the provider is idempotent by reference, retrying the same charge is also safe.

TRY IT YOURSELF

### A property for split orders

A customer can split a cart into two orders. Without vouchers, the two subtotals must add up to the subtotal of the whole cart. Write that property with fast-check. Does it also hold for the *totals*? Think about rounding, then let fast-check answer (fix the seed so it is repeatable).

**Show a solution**

split-property.tsNode.js only

```ts
import fc from "fast-check";

import { priceCart } from "./src/pricing.js";
import type { Totals } from "./src/pricing.js";

const line = fc.record({
  sku: fc.constantFrom("RICE-5KG", "OIL-1L"),
  unitKobo: fc.integer({ min: 0, max: 1_000 }),
  quantity: fc.integer({ min: 1, max: 5 }),
});
const twoCarts = fc.tuple(fc.array(line, { minLength: 1, maxLength: 4 }), fc.array(line, { minLength: 1, maxLength: 4 }));

function check(name: string, sameFor: (a: Totals, b: Totals, all: Totals) => boolean): void {
  try {
    fc.assert(fc.property(twoCarts, ([a, b]) => sameFor(priceCart(a), priceCart(b), priceCart([...a, ...b]))), { seed: 4 });
    console.log(`${name}: holds`);
  } catch (error) {
    console.log(`${name}: fails`);
    console.log(error instanceof Error ? error.message.split("\n")[2] : error);
  }
}

check("subtotals add up", (a, b, all) => a.subtotalKobo + b.subtotalKobo === all.subtotalKobo);
check("totals add up", (a, b, all) => a.totalKobo + b.totalKobo === all.totalKobo);
```

Output of `npx tsx split-property.ts`

```ts
subtotals add up: holds
totals add up: fails
Counterexample: [[[{"sku":"RICE-5KG","unitKobo":87,"quantity":1}],[{"sku":"RICE-5KG","unitKobo":20,"quantity":1}]]]
```

Subtotals always add up. Totals do not: VAT is rounded once per order, so two orders can round differently from one. In the counterexample, an order of 87 kobo gets 7 kobo of VAT (6.525 rounds up) and an order of 20 kobo gets 2 (1.5 rounds up): 9 kobo in total. As one order, 107 kobo gets 8 kobo of VAT (8.025 rounds down). The small prices are on purpose: with prices up to ₦50,000 the property fails just as surely, but shrinking cannot find a small example, because most smaller carts happen to round the same way. That is not necessarily a bug; tax rules say where rounding happens. The property made the rule visible, and now the business can decide.

TRY IT YOURSELF

### Pick the double

Which double fits each test? (a) Checking that a failed login writes one line to the audit log. (b) Making the exchange-rate service return exactly 1,550 naira per dollar. (c) Fifty tests that need somewhere to save users. (d) A constructor wants a logger, but this test never logs. (e) Asserting that the SMS provider is called with exactly `+2348031234567` and the one-time code.

**Show a solution**

(a) A spy on the audit log: the effect is the point. (b) A stub: a canned answer. (c) A fake: an in-memory user store, shared by all fifty tests and itself checked by a contract suite. (d) A dummy. (e) A mock (or a spy checked afterwards): the exact call to the provider is the contract, and the provider is an edge of the system, so this is a place where checking calls is right.

## Recap

- A strategy picks the cheapest test that catches each kind of bug: unit for rules, integration for SQL and adapters, end-to-end for wiring and journeys, and special tests for the joints.
- Dummies fill parameters, stubs answer, spies record, mocks expect, fakes work. Double the edges, not your own logic.
- Builders give each test fresh, valid fixtures. Random order (`--test-randomize`, `--test-random-seed`) exposes tests that depend on each other; a rollback per test isolates database tests.
- Contract tests run one suite against the fake and the real service, so fakes cannot drift into fiction.
- fast-check checks properties on generated inputs and shrinks failures to a minimal counterexample; a seed makes a failure repeatable. As a fuzzer it finds inputs nobody imagined.
- Security tests attack each rule: tokens, ownership, trusted prices, injection, body size, error leaks.
- Load tests measure percentiles and errors against a budget, with autocannon or k6, away from production.

Next: [Caching](https://zudojs.oyinlola.site/learn/backend-caching), where your checkout reads the catalog thousands of times a minute and you make it fast without making it wrong.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
