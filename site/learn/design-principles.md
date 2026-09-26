---
title: "Design principles through refactoring — ZudoJS Academy"
description: "Refactor a tangled order function step by step into validation, pricing, payment, storage and notification parts, with tests printed after every step."
source: https://zudojs.oyinlola.site/learn/design-principles
---

LEVEL 11 · LESSON 1 OF 12

Design principles Core

# Design principles through refactoring

Refactor a tangled order function step by step into validation, pricing, payment, storage and notification parts, with tests printed after every step.

- **55 min** to read and try
- **You need:** Classes in TypeScript, Inheritance and composition, and Testing basics
- **You build:** A tested order service assembled from small parts, refactored out of one tangled function

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Spot the separate concerns hidden in one long function and pull them apart without changing behaviour
- Protect a refactoring with characterization tests written before the first change
- Recognise low cohesion and the kinds of coupling, and lower the coupling that hurts
- Encapsulate state behind methods that enforce the rules
- Design an abstraction that hides what varies without leaking the provider underneath
- Assemble a service from small parts and add behaviour by composing, not editing

## The order function nobody wants to touch

A small online shop sells groceries. Two years ago someone wrote the checkout in one afternoon, as one function. It still runs, it earns money, and every developer on the team is afraid of it. Here it is. Read it once from top to bottom:

check.ts

```ts
export function check(name: string, ok: boolean): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
}
```

tangled.ts

```ts
export interface OrderRequest {
  email: string;
  card: string;
  coupon?: string;
  items: { sku: string; qty: number }[];
}

const PRICES: Record<string, number> = { "RICE-5KG": 850000, "OIL-1L": 320000, "SUGAR-1KG": 150000 };

export const db = { orders: new Map<string, { email: string; totalKobo: number; status: string }>(), nextId: 1 };
export const charges: string[] = [];
export const outbox: string[] = [];

export function placeOrder(request: OrderRequest): string {
  if (!request.email.includes("@")) throw new Error("invalid email");
  if (request.items.length === 0) throw new Error("empty order");
  let subtotal = 0;
  for (const item of request.items) {
    const price = PRICES[item.sku];
    if (price === undefined) throw new Error(`unknown product ${item.sku}`);
    if (item.qty < 1) throw new Error("bad quantity");
    subtotal += price * item.qty;
  }
  if (request.coupon === "SAVE10") subtotal = Math.round(subtotal * 0.9);
  const total = subtotal + Math.round(subtotal * 0.075);
  if (request.card.startsWith("4000")) throw new Error("card declined");
  charges.push(`charged card ending ${request.card.slice(-4)}: ${total} kobo`);
  const id = `ORD-${db.nextId++}`;
  db.orders.set(id, { email: request.email, totalKobo: total, status: "paid" });
  outbox.push(`to ${request.email}: order ${id} confirmed, total NGN ${(total / 100).toFixed(2)}`);
  return id;
}
```

It works. Place an order and look at everything it touched:

problem.ts

```ts
import { charges, db, outbox, placeOrder } from "./tangled.js";

const id = placeOrder({
  email: "ada@shop.ng",
  card: "5399830000001234",
  coupon: "SAVE10",
  items: [{ sku: "RICE-5KG", qty: 1 }, { sku: "OIL-1L", qty: 2 }],
});

console.log(id, db.orders.get(id));
console.log(charges);
console.log(outbox);
```

Output of `npx tsx problem.ts` and of the browser terminal

```ts
ORD-1 { email: 'ada@shop.ng', totalKobo: 1441575, status: 'paid' }
[ 'charged card ending 1234: 1441575 kobo' ]
[ 'to ada@shop.ng: order ORD-1 confirmed, total NGN 14415.75' ]
```

Now the finance team asks a simple question: "Is VAT charged before or after the coupon?" To answer it with a test, you must call `placeOrder`. There is no other way to reach the pricing code. So every pricing test charges a card and sends an e-mail:

problem-tests.ts

```ts
import { check } from "./check.js";
import { charges, outbox, placeOrder } from "./tangled.js";

const card = "5399830000001234";
const email = "test@shop.ng";

placeOrder({ email, card, items: [{ sku: "SUGAR-1KG", qty: 1 }] });
placeOrder({ email, card, coupon: "SAVE10", items: [{ sku: "SUGAR-1KG", qty: 1 }] });
placeOrder({ email, card, coupon: "WRONG", items: [{ sku: "SUGAR-1KG", qty: 1 }] });

check("three pricing tests ran", true);
console.log("cards charged by the tests:", charges.length);
console.log("e-mails sent by the tests:", outbox.length);
```

Output of `npx tsx problem-tests.ts` and of the browser terminal

```ts
PASS three pricing tests ran
cards charged by the tests: 3
e-mails sent by the tests: 3
```

Here the "payment" and the "e-mail" are arrays, so nothing real happened. In the real shop they are a payment provider and a mail server. A test suite that charges real cards cannot be run a hundred times a day, so the team stopped testing, and so they stopped changing the code.

This lesson fixes that function in small, safe steps. Each step is named after a **design principle**: a rule of thumb, learned the hard way by many teams, for arranging code so it stays cheap to change. You meet six of them, each where the tangled code breaks it: **separation of concerns**, **cohesion**, **coupling**, **encapsulation**, **abstraction** and **composition**. After every step you run tests, and the output shows them passing. The [next lesson](https://zudojs.oyinlola.site/learn/design-solid) builds the SOLID principles on top of these six.

## Step 0: name the concerns, pin the behaviour

A **concern** is one area of knowledge the code needs: something a single expert could own. Read `placeOrder` again and label each line with who would care about it:

| Concern | Lines in `placeOrder` | Who asks for changes |
| --- | --- | --- |
| Validation | the e-mail, empty order and quantity checks | product team, security |
| Pricing | the price list, subtotal, coupon, VAT | finance, marketing |
| Payment | the card check and the charge | payments team, the provider |
| Storage | the id counter and `db.orders.set` | database team |
| Notification | the e-mail text and sending it | customer support, marketing |

Five concerns, five groups of people who each want to change "their" part, and every change goes through the same 20 lines. **Separation of concerns** means giving each concern its own place in the code, so that a change to pricing does not require reading, retesting or risking the payment code.

### Pin the current behaviour first

Before you move a single line, write down what the code does *today*, including its odd parts, as a test. This is a **characterization test**: it does not claim the behaviour is right, only that it is what users currently get. If a refactoring changes a total by one kobo, this test catches it. The order above cost `1441575` kobo; two more runs give two more fixed points:

characterize.ts

```ts
import { db, placeOrder } from "./tangled.js";

const card = "5399830000001234";
const carts = [
  { coupon: "SAVE10", items: [{ sku: "RICE-5KG", qty: 1 }, { sku: "OIL-1L", qty: 2 }] },
  { items: [{ sku: "SUGAR-1KG", qty: 3 }] },
  { coupon: "SAVE10", items: [{ sku: "SUGAR-1KG", qty: 1 }] },
];

for (const cart of carts) {
  const id = placeOrder({ email: "pin@shop.ng", card, ...cart });
  console.log(JSON.stringify(cart.items), cart.coupon ?? "-", db.orders.get(id)?.totalKobo);
}
```

Output of `npx tsx characterize.ts` and of the browser terminal

```json
[{"sku":"RICE-5KG","qty":1},{"sku":"OIL-1L","qty":2}] SAVE10 1441575
[{"sku":"SUGAR-1KG","qty":3}] - 483750
[{"sku":"SUGAR-1KG","qty":1}] SAVE10 145125
```

These three numbers are your safety net. Every step below must keep producing them.

> TIP
>
> Refactoring means changing the structure of code without changing what it does. If you change behaviour and structure in the same step and a test fails, you cannot tell which change broke it. Keep them in separate steps.

## Step 1: separation of concerns

Start with the two concerns that need nothing from the outside world: validation and pricing. They only compute. Pull them out as **pure functions** ([Functional JavaScript](https://zudojs.oyinlola.site/learn/js-functional#pure)): same input, same output, no side effects. The price list moves to its own small module too, because both of them need it:

catalog.ts

```ts
export interface Line {
  readonly sku: string;
  readonly qty: number;
}

export type Catalog = ReadonlyMap<string, number>;

export const shopCatalog: Catalog = new Map([
  ["RICE-5KG", 850000],
  ["OIL-1L", 320000],
  ["SUGAR-1KG", 150000],
]);
```

pricing.ts

```ts
import type { Catalog, Line } from "./catalog.js";

export const VAT_RATE = 0.075;
const COUPONS: Readonly<Record<string, number>> = { SAVE10: 0.1 };

export interface Price {
  readonly subtotalKobo: number;
  readonly discountKobo: number;
  readonly vatKobo: number;
  readonly totalKobo: number;
}

export function priceOrder(lines: readonly Line[], catalog: Catalog, coupon?: string): Price {
  let subtotalKobo = 0;
  for (const line of lines) {
    const unit = catalog.get(line.sku);
    if (unit === undefined) throw new Error(`unknown product ${line.sku}`);
    subtotalKobo += unit * line.qty;
  }
  const rate = coupon === undefined ? 0 : (COUPONS[coupon] ?? 0);
  const afterDiscount = Math.round(subtotalKobo * (1 - rate));
  const vatKobo = Math.round(afterDiscount * VAT_RATE);
  return {
    subtotalKobo,
    discountKobo: subtotalKobo - afterDiscount,
    vatKobo,
    totalKobo: afterDiscount + vatKobo,
  };
}
```

Validation now returns *every* problem as a list instead of throwing at the first one. That is a small behaviour change for callers, made on purpose: a customer who typed a bad e-mail *and* a quantity of zero sees both messages at once.

validation.ts

```ts
import type { Catalog, Line } from "./catalog.js";

export interface OrderInput {
  readonly email: string;
  readonly card: string;
  readonly coupon?: string;
  readonly items: readonly Line[];
}

export function validateOrder(input: OrderInput, catalog: Catalog): string[] {
  const problems: string[] = [];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) problems.push("email is not valid");
  if (input.items.length === 0) problems.push("order has no items");
  for (const item of input.items) {
    if (!catalog.has(item.sku)) problems.push(`unknown product ${item.sku}`);
    if (!Number.isInteger(item.qty) || item.qty < 1) problems.push(`quantity of ${item.sku} must be 1 or more`);
  }
  return problems;
}
```

Now the pricing questions can be answered without a card, a database or a mail server. The first three tests are the characterization numbers from step 0:

step1-test.ts

```ts
import { shopCatalog } from "./catalog.js";
import { check } from "./check.js";
import { priceOrder } from "./pricing.js";
import { validateOrder } from "./validation.js";

const rice = { sku: "RICE-5KG", qty: 1 };
const oil = { sku: "OIL-1L", qty: 2 };
const sugar = (qty: number) => ({ sku: "SUGAR-1KG", qty });

check("pinned: rice + 2 oil with SAVE10", priceOrder([rice, oil], shopCatalog, "SAVE10").totalKobo === 1441575);
check("pinned: 3 sugar", priceOrder([sugar(3)], shopCatalog).totalKobo === 483750);
check("pinned: 1 sugar with SAVE10", priceOrder([sugar(1)], shopCatalog, "SAVE10").totalKobo === 145125);

const price = priceOrder([sugar(1)], shopCatalog, "SAVE10");
check("VAT is charged after the discount", price.vatKobo === Math.round(135000 * 0.075));
check("an unknown coupon gives no discount", priceOrder([sugar(1)], shopCatalog, "WRONG").discountKobo === 0);
console.log(validateOrder({ email: "ada@", card: "", items: [{ sku: "YAM", qty: 0 }] }, shopCatalog));
```

Output of `npx tsx step1-test.ts` and of the browser terminal

```ts
PASS pinned: rice + 2 oil with SAVE10
PASS pinned: 3 sugar
PASS pinned: 1 sugar with SAVE10
PASS VAT is charged after the discount
PASS an unknown coupon gives no discount
[
  'email is not valid',
  'unknown product YAM',
  'quantity of YAM must be 1 or more'
]
```

Finance has its answer (after), in a test that runs in a millisecond and costs nothing. Notice what made this possible: not a framework, not a pattern, just moving code that computes away from code that *does things* to the outside world. That split, calculations in the middle and side effects at the edges, is the single most useful separation you will make.

## Step 2: cohesion

Separation tells you to split. **Cohesion** tells you what belongs *together* after the split. A module has **high cohesion** when everything in it serves one purpose and changes for the same reasons. It has **low cohesion** when it is a drawer of unrelated things, or when one idea is scattered over many drawers.

The shop had the second kind. VAT was computed in the checkout, again in the invoice generator, and again in the receipt e-mail. When the VAT rate was (hypothetically) raised to 10%, one developer updated the receipt and nothing else:

scattered-vat.ts

```ts
// checkout.ts
function amountToCharge(subtotalKobo: number): number {
  return subtotalKobo + Math.round(subtotalKobo * 0.075);
}

// invoice.ts
function invoiceVat(subtotalKobo: number): number {
  return Math.round(subtotalKobo * 0.075);
}

// receipt.ts, updated for the new rate
function receiptTotal(subtotalKobo: number): number {
  return subtotalKobo + Math.round(subtotalKobo * 0.1);
}

const subtotal = 1341000;
console.log("charged:", amountToCharge(subtotal));
console.log("invoice VAT:", invoiceVat(subtotal));
console.log("receipt says:", receiptTotal(subtotal));
```

Output of `npx tsx scattered-vat.ts` and of the browser terminal

```ts
charged: 1441575
invoice VAT: 100575
receipt says: 1475100
```

The customer's receipt now claims ₦335.25 more than the card was charged. No single file is wrong by itself; the *idea* "how an order total is computed" has no home. After step 1 it has one: `pricing.ts` owns the price list lookup, the coupon, the rounding and the VAT rate. A receipt, an invoice and the checkout all ask `priceOrder`, so they cannot disagree:

receipt.ts

```ts
import type { Price } from "./pricing.js";

export function receiptText(orderId: string, price: Price): string {
  const naira = (kobo: number) => (kobo / 100).toFixed(2);
  return [
    `Order ${orderId}`,
    `Subtotal NGN ${naira(price.subtotalKobo)}`,
    `Discount NGN ${naira(price.discountKobo)}`,
    `VAT      NGN ${naira(price.vatKobo)}`,
    `Total    NGN ${naira(price.totalKobo)}`,
  ].join("\n");
}
```

step2-test.ts

```ts
import { shopCatalog } from "./catalog.js";
import { check } from "./check.js";
import { priceOrder } from "./pricing.js";
import { receiptText } from "./receipt.js";

const price = priceOrder([{ sku: "RICE-5KG", qty: 1 }, { sku: "OIL-1L", qty: 2 }], shopCatalog, "SAVE10");
const receipt = receiptText("ORD-1", price);
console.log(receipt);
check("the receipt shows what was charged", receipt.includes((price.totalKobo / 100).toFixed(2)));
check("the lines add up", price.subtotalKobo - price.discountKobo + price.vatKobo === price.totalKobo);
```

Output of `npx tsx step2-test.ts` and of the browser terminal

```ts
Order ORD-1
Subtotal NGN 14900.00
Discount NGN 1490.00
VAT      NGN 1005.75
Total    NGN 14415.75
PASS the receipt shows what was charged
PASS the lines add up
```

The opposite failure, the drawer of unrelated things, usually has a name like `utils.ts`, `helpers.ts` or `OrderManager`. Here is a real-looking one:

```ts
OrderUtils
  formatNaira(kobo)        used by: receipts, admin screens
  isValidEmail(text)       used by: sign-up, checkout
  vatFor(kobo)             used by: checkout          (a second home for VAT!)
  retry(fn, times)         used by: payment, storage
  slugify(title)           used by: product pages
```

Nothing in it uses anything else in it. Every team edits the file, so it conflicts in every merge, and `vatFor` quietly duplicates pricing. A quick test for cohesion: **describe the module in one sentence without the word "and"**. "Computes order prices" works. "Formats money and validates e-mails and retries things" does not. Move each function to the module whose sentence it fits, or to a small module of its own.

## Step 3: coupling

Two pieces of code are **coupled** when changing one can force you to change the other. Some coupling is unavoidable (the checkout must be able to charge a card), so the goal is not zero coupling. The goal is **loose coupling**: depend on as little as possible, through the narrowest, most stable surface.

The payment part of the shop's checkout had grown into this. It creates its own provider client, with the key typed into the code, and reaches into a shared global store:

coupled.ts

```ts
class PaystackClient {
  constructor(private readonly secretKey: string) {}

  charge(card: string, amountKobo: number): string {
    console.log(`POST https://api.paystack.co/charge (key ${this.secretKey.slice(0, 7)}...) ${amountKobo} kobo`);
    return `PSK-${card.slice(-4)}`;
  }
}

export const orders = new Map<string, { email: string; totalKobo: number }>();

export function checkout(orderId: string, email: string, card: string, totalKobo: number): string {
  const client = new PaystackClient("sk_live_hardcoded_key");
  const chargeId = client.charge(card, totalKobo);
  orders.set(orderId, { email, totalKobo });
  return chargeId;
}

// "a unit test"
console.log(checkout("ORD-9", "test@shop.ng", "5399830000001234", 145125));
console.log(orders.size);
```

Output of `npx tsx coupled.ts` and of the browser terminal

```ts
POST https://api.paystack.co/charge (key sk_live...) 145125 kobo
PSK-1234
1
```

The "unit test" talks to the live payment provider with the live key. It cannot be stopped from doing so, because `checkout` decides for itself which client to use. And moving to another provider means editing `checkout`. Coupling comes in recognisable kinds, from worst to best:

| Kind | What it looks like | In the shop |
| --- | --- | --- |
| **Content coupling** | One module reaches into another's internals. | code that writes `db.orders` or `db.nextId` directly |
| **Global (common) coupling** | Modules share mutable global state. | `orders`, `charges`, `outbox` exported and changed by anyone |
| **Creation coupling** | A function builds its own collaborators with `new`. | `new PaystackClient(…)` inside `checkout` |
| **Control coupling** | A caller passes a flag that picks the callee's code path. | `notify(order, true)` where `true` means "SMS instead of e-mail" |
| **Stamp coupling** | Passing a whole record when a part would do. | the e-mail code receiving the full order with the card number |
| **Data coupling** | Passing only the values needed, as parameters. | `priceOrder(lines, catalog, coupon)`: the goal |

The fix for the first three is the same move: the function stops creating and reaching, and **receives** what it needs as parameters. It says what it needs as types, and the caller decides what to pass. This is **dependency injection**, which you did by hand in [Classes in TypeScript](https://zudojs.oyinlola.site/learn/ts-classes#injection):

checkout-v1.ts

```ts
import type { Catalog } from "./catalog.js";
import { priceOrder } from "./pricing.js";
import { validateOrder, type OrderInput } from "./validation.js";

export interface CheckoutDeps {
  readonly catalog: Catalog;
  readonly charge: (card: string, amountKobo: number) => Promise<string>;
  readonly save: (id: string, email: string, totalKobo: number) => Promise<void>;
  readonly sendEmail: (to: string, text: string) => Promise<void>;
  readonly nextId: () => string;
}

export async function placeOrder(input: OrderInput, deps: CheckoutDeps): Promise<string> {
  const problems = validateOrder(input, deps.catalog);
  if (problems.length > 0) throw new Error(problems.join("; "));
  const { totalKobo } = priceOrder(input.items, deps.catalog, input.coupon);
  await deps.charge(input.card, totalKobo);
  const id = deps.nextId();
  await deps.save(id, input.email, totalKobo);
  await deps.sendEmail(input.email, `order ${id} confirmed, total NGN ${(totalKobo / 100).toFixed(2)}`);
  return id;
}
```

A test now passes **fakes**: tiny stand-ins that record what they were asked to do. Nothing real is charged, and the test can see exactly which calls happened, in which order:

step3-test.ts

```ts
import { shopCatalog } from "./catalog.js";
import { check } from "./check.js";
import { placeOrder, type CheckoutDeps } from "./checkout-v1.js";

const calls: string[] = [];
const deps: CheckoutDeps = {
  catalog: shopCatalog,
  charge: async (card, amount) => {
    calls.push(`charge ${card.slice(-4)} ${amount}`);
    return "CH-1";
  },
  save: async (id, email, total) => void calls.push(`save ${id} ${email} ${total}`),
  sendEmail: async (to) => void calls.push(`email ${to}`),
  nextId: () => "ORD-77",
};

const id = await placeOrder({ email: "ada@shop.ng", card: "5399830000001234", items: [{ sku: "SUGAR-1KG", qty: 3 }] }, deps);
check("returns the new id", id === "ORD-77");
check("charges the pinned total", calls[0] === "charge 1234 483750");
console.log(calls);

try {
  await placeOrder({ email: "ada", card: "1", items: [] }, deps);
} catch (error) {
  check("invalid input never reaches the gateway", calls.length === 3);
  console.log((error as Error).message);
}
```

Output of `npx tsx step3-test.ts` and of the browser terminal

```ts
PASS returns the new id
PASS charges the pinned total
[
  'charge 1234 483750',
  'save ORD-77 ada@shop.ng 483750',
  'email ada@shop.ng'
]
PASS invalid input never reaches the gateway
email is not valid; order has no items
```

The function still knows the *order* of the steps, which is its job. It no longer knows which provider, which database or which mail server. Those are the caller's decisions, made in one place.

## Step 4: encapsulation

The next bug report: a customer was refunded ₦4,837.50 for an order that was never paid, and another order shows a total lower than its items. Both come from the same habit. The order is a plain object, and any code anywhere can change any field:

mutable-order.ts

```ts
interface OrderRecord {
  status: "pending" | "paid" | "refunded";
  items: { sku: string; qty: number }[];
  totalKobo: number;
}

const order: OrderRecord = { status: "pending", items: [{ sku: "SUGAR-1KG", qty: 3 }], totalKobo: 483750 };

// admin screen, "refund" button: nobody checked the status
order.status = "refunded";
console.log("refunded an order with status that was pending:", order.status);

// a "free gift" feature added later, after the total was computed
order.items.push({ sku: "RICE-5KG", qty: 1 });
console.log("items:", order.items.length, "total still:", order.totalKobo);
```

Output of `npx tsx mutable-order.ts` and of the browser terminal

```ts
refunded an order with status that was pending: refunded
items: 2 total still: 483750
```

An order has rules that must always hold: only a paid order can be refunded; the total always matches the lines. A rule that must always be true is an **invariant**. With a public, writable object, every line of code in the system is responsible for every invariant, which means nobody is.

**Encapsulation** means keeping the data together with the code that guards it, and letting the outside change the data *only* through methods that check the rules. The data becomes private; the methods become the only doors:

order.ts

```ts
import type { Catalog, Line } from "./catalog.js";
import { priceOrder, type Price } from "./pricing.js";

export type OrderStatus = "pending" | "paid" | "refunded";

export class Order {
  #status: OrderStatus = "pending";
  #chargeId: string | undefined;

  private constructor(
    readonly id: string,
    readonly email: string,
    readonly lines: readonly Line[],
    readonly price: Price,
  ) {}

  static create(id: string, email: string, lines: readonly Line[], catalog: Catalog, coupon?: string): Order {
    const frozen = Object.freeze(lines.map((line) => Object.freeze({ ...line })));
    return new Order(id, email, frozen, priceOrder(frozen, catalog, coupon));
  }

  get status(): OrderStatus {
    return this.#status;
  }

  get chargeId(): string | undefined {
    return this.#chargeId;
  }

  markPaid(chargeId: string): void {
    if (this.#status !== "pending") throw new Error(`cannot pay an order that is ${this.#status}`);
    this.#status = "paid";
    this.#chargeId = chargeId;
  }

  markRefunded(): void {
    if (this.#status !== "paid") throw new Error(`cannot refund an order that is ${this.#status}`);
    this.#status = "refunded";
  }
}
```

- The constructor is `private`, so the only way to get an order is `Order.create`, which always computes the price from the lines. There is no way to build an order whose total does not match.
- The lines are copied and frozen with `Object.freeze` ([Objects in depth](https://zudojs.oyinlola.site/learn/js-objects-deep)). Changing them after pricing is impossible, not just discouraged.
- The status is a `#private` field behind a getter. It changes only through `markPaid` and `markRefunded`, and each checks the current status first. These two methods are a tiny **state machine**: pending → paid → refunded, and nothing else.

TypeScript already refuses the admin screen's shortcut:

order-misuse.ts

```ts
import { shopCatalog } from "./catalog.js";
import { Order } from "./order.js";

const order = Order.create("ORD-5", "ada@shop.ng", [{ sku: "SUGAR-1KG", qty: 3 }], shopCatalog);
order.status = "refunded";
```

What `npx tsc --noEmit` prints

```ts
order-misuse.ts:5:7 - error TS2540: Cannot assign to 'status' because it is a read-only property.

5 order.status = "refunded";
        ~~~~~~


Found 1 error in order-misuse.ts:5
```

And at run time the methods refuse what types cannot see:

step4-test.ts

```ts
import { shopCatalog } from "./catalog.js";
import { check } from "./check.js";
import { Order } from "./order.js";

const order = Order.create("ORD-5", "ada@shop.ng", [{ sku: "SUGAR-1KG", qty: 3 }], shopCatalog);
check("a new order is pending", order.status === "pending");
check("the total comes from the lines", order.price.totalKobo === 483750);

try {
  order.markRefunded();
} catch (error) {
  console.log((error as Error).message);
}

order.markPaid("CH-1");
order.markRefunded();
check("pending -> paid -> refunded works", order.status === "refunded");

try {
  (order.lines as Array<{ sku: string; qty: number }>).push({ sku: "RICE-5KG", qty: 1 });
} catch (error) {
  check("lines cannot grow after pricing", error instanceof TypeError && order.lines.length === 1);
}
```

Output of `npx tsx step4-test.ts` and of the browser terminal

```ts
PASS a new order is pending
PASS the total comes from the lines
cannot refund an order that is pending
PASS pending -> paid -> refunded works
PASS lines cannot grow after pricing
```

> NOTE
>
> Encapsulation is not the same as "make every field private and add a getter and setter for each". A public setter for `status` would be just as open as the plain object. The point is that the methods speak the language of the business (`markPaid`, `markRefunded`) and each one protects a rule.

## Step 5: abstraction

An **abstraction** is a simplified view of something that hides the details a caller does not need. `priceOrder` is an abstraction: callers get a `Price` and never see the loop, the coupon table or the rounding. The hard abstraction in this shop is payment, because there the details are someone else's.

In step 3 the checkout received a `charge` function. The team's first attempt at a "payment interface" simply passed the provider's own request and response through. The service then had to understand Paystack's answer format. Months later the shop added Flutterwave, whose answers look different:

leaky.ts

```ts
interface ProviderResponse {
  status: boolean | string;
  data: Record<string, string>;
}

const paystack = async (): Promise<ProviderResponse> => ({ status: true, data: { gateway_response: "Approved", reference: "PSK-88" } });
const flutterwave = async (): Promise<ProviderResponse> => ({ status: "success", data: { processor_response: "Approved", flw_ref: "FLW-12" } });

async function isPaid(charge: () => Promise<ProviderResponse>): Promise<boolean> {
  const response = await charge();
  return response.status === true && response.data["gateway_response"] === "Approved";
}

console.log("paystack approved:", await isPaid(paystack));
console.log("flutterwave approved:", await isPaid(flutterwave));
```

Output of `npx tsx leaky.ts` and of the browser terminal

```ts
paystack approved: true
flutterwave approved: false
```

Flutterwave approved the payment, the customer was charged, and the shop marked the order unpaid. The "interface" was an abstraction in name only: Paystack's field names **leaked** through it into the service. A **leaky abstraction** is one whose callers must still know about the details it claims to hide.

A good abstraction is designed from the *caller's* side. Ask: what does the order service need to know after a charge? Whether it worked, a reference to refund it later, and if it failed, whether it is worth retrying. Nothing about HTTP, field names or provider status strings. Write exactly that down as a type:

payments.ts

```ts
export type ChargeResult =
  | { readonly ok: true; readonly chargeId: string }
  | { readonly ok: false; readonly reason: "declined" | "unavailable" };

export interface PaymentGateway {
  charge(card: string, amountKobo: number, reference: string): Promise<ChargeResult>;
  refund(chargeId: string): Promise<void>;
}

export function fakeGateway(log: string[], declined: readonly string[] = []): PaymentGateway {
  let next = 1;
  return {
    async charge(card, amountKobo, reference) {
      if (declined.includes(card)) {
        log.push(`declined ${reference}`);
        return { ok: false, reason: "declined" };
      }
      const chargeId = `CH-${next++}`;
      log.push(`charged ${reference} ${amountKobo} as ${chargeId}`);
      return { ok: true, chargeId };
    },
    async refund(chargeId) {
      log.push(`refunded ${chargeId}`);
    },
  };
}
```

Each provider now gets a small translator that turns its own answer into a `ChargeResult`. The translation lives next to the provider, and the service only ever sees `ok` and `reason`:

step5-test.ts

```ts
import { check } from "./check.js";
import type { ChargeResult, PaymentGateway } from "./payments.js";

type Raw = { status: boolean | string; data: Record<string, string> };

function paystackGateway(call: () => Promise<Raw>): PaymentGateway {
  return {
    async charge(): Promise<ChargeResult> {
      const raw = await call();
      if (raw.status === true && raw.data["gateway_response"] === "Approved") return { ok: true, chargeId: raw.data["reference"] ?? "" };
      return { ok: false, reason: "declined" };
    },
    async refund() {},
  };
}

function flutterwaveGateway(call: () => Promise<Raw>): PaymentGateway {
  return {
    async charge(): Promise<ChargeResult> {
      const raw = await call();
      if (raw.status === "success" && raw.data["processor_response"] === "Approved") return { ok: true, chargeId: raw.data["flw_ref"] ?? "" };
      return { ok: false, reason: "declined" };
    },
    async refund() {},
  };
}

const gateways = {
  paystack: paystackGateway(async () => ({ status: true, data: { gateway_response: "Approved", reference: "PSK-88" } })),
  flutterwave: flutterwaveGateway(async () => ({ status: "success", data: { processor_response: "Approved", flw_ref: "FLW-12" } })),
};

for (const [name, gateway] of Object.entries(gateways)) {
  const result = await gateway.charge("5399830000001234", 145125, "ORD-3");
  check(`${name} approval is seen as ok`, result.ok);
  console.log(result);
}
```

Output of `npx tsx step5-test.ts` and of the browser terminal

```ts
PASS paystack approval is seen as ok
{ ok: true, chargeId: 'PSK-88' }
PASS flutterwave approval is seen as ok
{ ok: true, chargeId: 'FLW-12' }
```

These translators are the **adapter** pattern, which [Structural patterns](https://zudojs.oyinlola.site/learn/design-patterns-structural#adapter) covers properly, and which ZudoJS builds a whole package around in [Adapters](https://zudojs.oyinlola.site/learn/zudo-adapters). The principle underneath is simpler: **the side that uses an abstraction should define it**, in its own words. The `reason` union also turned "is this worth retrying?" into a question with two possible answers the compiler knows about, instead of a provider string compared in five places.

## Step 6: composition

Every part now exists on its own: validation, pricing, the `Order`, the payment gateway. **Composition** means building bigger behaviour by *combining* small parts, each passed in, instead of writing one big part or inheriting from one ([Inheritance and composition](https://zudojs.oyinlola.site/learn/js-composition#wrapper) showed why inheritance couples so tightly). Before assembling the service, think about the order of its steps.

REASON IT OUT

### Charge, save, e-mail: what if one of them fails?

The service will validate, price, charge the card, save the order and send a confirmation. Before reading the code, answer:

- Should you charge first or save first? What does each order risk?
- The card was charged, then saving the order fails (the database is down). What does the customer experience if you do nothing? What should the service do?
- The order is paid and saved, then the e-mail server is down. Should the customer see "order failed"?
- The customer double-clicks "Pay". What happens with this design?
- Which of these decisions belong inside the service, and which could be added from outside?

**Show the reasoning**

- Save first (as "pending") and charge second is the safer order in large systems, because a pending record lets you find half-finished orders. Charging first is simpler and is what this shop does; it then needs the next rule. Either way, there is a gap between two systems that cannot be closed by ordering alone.
- Doing nothing means the customer paid for an order the shop does not know about. The service must **compensate**: refund the charge, mark the order refunded, and report the failure. A compensation is an action that undoes an earlier step that cannot be rolled back like a database transaction.
- No. The money moved and the order exists; the e-mail is a courtesy. A notification failure should be logged and retried later, not turned into a failed order that support must untangle. This is a policy *about* notifying, so it can be composed around the notifier instead of written into the service.
- Two orders and two charges. The fix is an **idempotency key**, a client-chosen id that makes the second request return the first result; [Idempotency](https://zudojs.oyinlola.site/learn/api-idempotency#keys) builds it. It is left out here to keep the focus on design.
- The step order and the refund belong in the service: they are the use case. "Do not fail the order when the e-mail fails", "send e-mail and SMS", "log every notification" are wrappers around a notifier, added by composition.

The remaining outside-world parts get small interfaces of their own, written from the service's side like the gateway was:

ports.ts

```ts
import type { Order } from "./order.js";

export interface OrderStore {
  save(order: Order): Promise<void>;
}

export interface Notifier {
  send(to: string, message: string): Promise<void>;
}
```

Notifiers are where composition shines. Each function below takes notifiers and returns a new notifier, so they plug into each other in any combination:

notifiers.ts

```ts
import type { Notifier } from "./ports.js";

export function outboxNotifier(channel: string, outbox: string[], failing = false): Notifier {
  return {
    async send(to, message) {
      if (failing) throw new Error(`${channel} server unavailable`);
      outbox.push(`${channel} to ${to}: ${message}`);
    },
  };
}

export function allOf(...notifiers: Notifier[]): Notifier {
  return {
    async send(to, message) {
      for (const notifier of notifiers) await notifier.send(to, message);
    },
  };
}

export function bestEffort(notifier: Notifier, log: (line: string) => void): Notifier {
  return {
    async send(to, message) {
      try {
        await notifier.send(to, message);
      } catch (error) {
        log(`notification to ${to} failed: ${(error as Error).message}`);
      }
    },
  };
}
```

The service itself is short, because every decision it does not own lives somewhere else:

order-service.ts

```ts
import type { Catalog } from "./catalog.js";
import { Order } from "./order.js";
import type { PaymentGateway } from "./payments.js";
import type { Notifier, OrderStore } from "./ports.js";
import { validateOrder, type OrderInput } from "./validation.js";

export interface OrderServiceDeps {
  readonly catalog: Catalog;
  readonly gateway: PaymentGateway;
  readonly store: OrderStore;
  readonly notifier: Notifier;
  readonly nextId: () => string;
}

export type PlaceResult =
  | { readonly ok: true; readonly orderId: string; readonly totalKobo: number }
  | { readonly ok: false; readonly error: string; readonly problems?: readonly string[] };

export function createOrderService(deps: OrderServiceDeps) {
  return {
    async place(input: OrderInput): Promise<PlaceResult> {
      const problems = validateOrder(input, deps.catalog);
      if (problems.length > 0) return { ok: false, error: "invalid", problems };

      const order = Order.create(deps.nextId(), input.email, input.items, deps.catalog, input.coupon);
      const charge = await deps.gateway.charge(input.card, order.price.totalKobo, order.id);
      if (!charge.ok) return { ok: false, error: charge.reason };
      order.markPaid(charge.chargeId);

      try {
        await deps.store.save(order);
      } catch {
        await deps.gateway.refund(charge.chargeId);
        order.markRefunded();
        return { ok: false, error: "not_saved" };
      }

      await deps.notifier.send(order.email, `order ${order.id} confirmed, total NGN ${(order.price.totalKobo / 100).toFixed(2)}`);
      return { ok: true, orderId: order.id, totalKobo: order.price.totalKobo };
    },
  };
}
```

Somewhere, all the parts must be created and connected. That place is the **composition root**: usually the program's entry file, and the only file that knows every concrete choice. Here the shop sends e-mail and SMS, and a broken SMS server must not fail an order:

main.ts

```ts
import { shopCatalog } from "./catalog.js";
import { allOf, bestEffort, outboxNotifier } from "./notifiers.js";
import { createOrderService } from "./order-service.js";
import type { Order } from "./order.js";
import { fakeGateway } from "./payments.js";

const payments: string[] = [];
const outbox: string[] = [];
const saved = new Map<string, Order>();
let next = 100;

const service = createOrderService({
  catalog: shopCatalog,
  gateway: fakeGateway(payments, ["4000000000000002"]),
  store: { save: async (order) => void saved.set(order.id, order) },
  notifier: allOf(
    bestEffort(outboxNotifier("email", outbox), console.log),
    bestEffort(outboxNotifier("sms", outbox, true), console.log),
  ),
  nextId: () => `ORD-${next++}`,
});

console.log(await service.place({ email: "ada@shop.ng", card: "5399830000001234", coupon: "SAVE10", items: [{ sku: "RICE-5KG", qty: 1 }, { sku: "OIL-1L", qty: 2 }] }));
console.log(await service.place({ email: "bola@shop.ng", card: "4000000000000002", items: [{ sku: "SUGAR-1KG", qty: 1 }] }));
console.log(await service.place({ email: "chi@shop", card: "5399830000001234", items: [{ sku: "SUGAR-1KG", qty: 0 }] }));
console.log(payments, outbox, [...saved.keys()]);
```

Output of `npx tsx main.ts` and of the browser terminal

```ts
notification to ada@shop.ng failed: sms server unavailable
{ ok: true, orderId: 'ORD-100', totalKobo: 1441575 }
{ ok: false, error: 'declined' }
{
  ok: false,
  error: 'invalid',
  problems: [ 'email is not valid', 'quantity of SUGAR-1KG must be 1 or more' ]
}
[ 'charged ORD-100 1441575 as CH-1', 'declined ORD-101' ] [ 'email to ada@shop.ng: order ORD-100 confirmed, total NGN 14415.75' ] [ 'ORD-100' ]
```

The pinned total is still `1441575`. The SMS failure was logged and the order went through. The declined card saved nothing and sent nothing. Adding SMS did not change one line of the service: it was composed from the outside.

## Testing the result

The real payoff of the refactoring is that every path through the checkout is now cheap to test, including the ones that are hard to produce with real systems: a database that fails right after a successful charge, or a mail server that is down.

service-test.ts

```ts
import { shopCatalog } from "./catalog.js";
import { check } from "./check.js";
import { bestEffort, outboxNotifier } from "./notifiers.js";
import { createOrderService, type OrderServiceDeps } from "./order-service.js";
import { fakeGateway } from "./payments.js";

function setup(overrides: Partial<OrderServiceDeps> = {}) {
  const payments: string[] = [];
  const outbox: string[] = [];
  const logs: string[] = [];
  const service = createOrderService({
    catalog: shopCatalog,
    gateway: fakeGateway(payments, ["4000000000000002"]),
    store: { save: async () => {} },
    notifier: bestEffort(outboxNotifier("email", outbox), (line) => logs.push(line)),
    nextId: () => "ORD-1",
    ...overrides,
  });
  return { service, payments, outbox, logs };
}

const order = { email: "ada@shop.ng", card: "5399830000001234", items: [{ sku: "SUGAR-1KG", qty: 3 }] };

const happy = setup();
const placed = await happy.service.place(order);
check("happy path: paid, saved, e-mailed", placed.ok && happy.payments.length === 1 && happy.outbox.length === 1);

const declined = setup();
await declined.service.place({ ...order, card: "4000000000000002" });
check("declined: no e-mail", declined.outbox.length === 0);

const brokenDb = setup({ store: { save: async () => { throw new Error("connection lost"); } } });
const lost = await brokenDb.service.place(order);
check("save fails: customer gets their money back", !lost.ok && brokenDb.payments[1] === "refunded CH-1");

const noMail = setup();
const mailDown = createOrderService({
  catalog: shopCatalog,
  gateway: fakeGateway(noMail.payments),
  store: { save: async () => {} },
  notifier: bestEffort(outboxNotifier("email", noMail.outbox, true), (line) => noMail.logs.push(line)),
  nextId: () => "ORD-2",
});
check("mail down: the order still succeeds", (await mailDown.place(order)).ok);
check("mail down: the failure is logged", noMail.logs[0] === "notification to ada@shop.ng failed: email server unavailable");
```

Output of `npx tsx service-test.ts` and of the browser terminal

```ts
PASS happy path: paid, saved, e-mailed
PASS declined: no e-mail
PASS save fails: customer gets their money back
PASS mail down: the order still succeeds
PASS mail down: the failure is logged
```

Compare with step 0, where testing the price charged a card. The `setup` helper builds a complete service from fakes in a few lines, and `overrides` replaces exactly the part a test cares about. The test file is itself a second composition root. That is a good sign: if your code is hard to assemble in a test, it is tightly coupled.

## When the principles are overdone

Each principle has a failure mode on the other side. Watch for these in your own code and in code review:

- **Separation into confetti.** Splitting a clear 15-line function into seven files with one line each does not separate concerns; it scatters one concern. If you have to open five files to follow one idea, cohesion is now too low. Separate by *reason to change*, not by line count.
- **Abstraction with nothing to hide.** A `PriceCalculatorFactoryProvider` for a pure function that will only ever have one version adds names without hiding anything. `priceOrder` is a plain function and needed no interface. The payment gateway needed one, because there really are several providers and the real one cannot run in tests. [SOLID, DRY, KISS and YAGNI](https://zudojs.oyinlola.site/learn/design-solid#yagni) looks at this trade-off in depth.
- **Injecting everything.** Pass in what talks to the outside world or what you need to replace in a test (payment, storage, clock, randomness, mail). Do not inject `Math.round`.
- **Encapsulating plain data.** A DTO that only carries values across a boundary ([Backend architecture](https://zudojs.oyinlola.site/learn/backend-architecture#infrastructure)) has no invariants to protect; a readonly interface is enough. Put private state and guarded methods where there are rules.

## Refactoring real code safely

The steps above are the order that works on real code too, where the tangled function is 400 lines and runs in production:

1. **Pin behaviour first.** Write characterization tests around the current function before changing it, even if they are clumsy. For code with side effects, you may need to capture its calls first (replace the mail sender with a recorder at the edge).
2. **Extract the pure parts first.** Validation and pricing moved without touching payment or storage. Each extraction is small, reviewable and reversible.
3. **Keep the old entry point.** Leave `placeOrder(request)` in place as a thin wrapper that calls the new service, so callers move over gradually. Delete it last.
4. **Measure with change requests.** The best practical measure of coupling is "how many files did the last five changes touch?". If "change the VAT rate" touches one file, and "switch payment provider" touches one new file plus the composition root, the design is working.
5. **Keep the composition root boring.** It creates and connects, nothing else. When it grows past what one person can read, that is the job a DI container takes over: [Typed dependency injection](https://zudojs.oyinlola.site/learn/ts-typed-di) builds one, and [The ZudoJS container](https://zudojs.oyinlola.site/learn/zudo-container) is the framework's.

## Practice

TRY IT YOURSELF

### Separate the delivery fee

The shop adds delivery: free for orders of ₦20,000 or more after discount, otherwise ₦1,500 in Lagos and ₦3,500 elsewhere. A developer wants to add these lines inside `createOrderService`. Instead, write the rule as a pure function `deliveryFeeKobo(afterDiscountKobo, state)` and test the edges: exactly ₦20,000, one kobo below, and a state other than Lagos.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Check the threshold first: `if (afterDiscountKobo >= 2_000_000) return 0;`. The boundary test needs `>=`, not `>`.

HINT 2

After the threshold check, return a ternary: `state === "Lagos" ? 150_000 : 350_000`.

SOLUTION

delivery.ts

```ts
function deliveryFeeKobo(afterDiscountKobo: number, state: string): number {
  if (afterDiscountKobo >= 2_000_000) return 0;
  return state === "Lagos" ? 150_000 : 350_000;
}

function check(name: string, ok: boolean): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
}

check("exactly NGN 20,000 is free", deliveryFeeKobo(2_000_000, "Oyo") === 0);
check("one kobo below pays", deliveryFeeKobo(1_999_999, "Lagos") === 150_000);
check("outside Lagos costs more", deliveryFeeKobo(500_000, "Kano") === 350_000);
```

Output of `npx tsx delivery.ts` and of the browser terminal

```ts
PASS exactly NGN 20,000 is free
PASS one kobo below pays
PASS outside Lagos costs more
```

The rule belongs with pricing (it changes when finance or logistics say so), not in the service. The boundary test at exactly 2,000,000 kobo is the one most often wrong: `>` instead of `>=`. The service would then call `deliveryFeeKobo` and add the result; a further step would make `Price` carry a `deliveryKobo` line so receipts show it.

TRY IT YOURSELF

### Encapsulate a wallet

Customers get a shop wallet. Today it is `{ balanceKobo: number }`, and three features change the balance directly; one of them once made a balance negative. Write a `Wallet` class whose balance can only change through `deposit` and `pay`, where amounts must be positive whole kobo and a payment may not exceed the balance. Test both refusals.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Both methods need the same "positive whole number" check. Write it once and call it from each, the way `pay` already does.

HINT 2

`deposit`: `this.#balanceKobo += amountKobo;` after the check. `pay`: throw `new Error(\`insufficient funds: balance ${this.#balanceKobo}, needed ${amountKobo}\`)` when `amountKobo > this.#balanceKobo`, otherwise `this.#balanceKobo -= amountKobo;`.

SOLUTION

wallet.ts

```ts
class Wallet {
  #balanceKobo = 0;

  get balanceKobo(): number {
    return this.#balanceKobo;
  }

  deposit(amountKobo: number): void {
    Wallet.#checkAmount(amountKobo);
    this.#balanceKobo += amountKobo;
  }

  pay(amountKobo: number): void {
    Wallet.#checkAmount(amountKobo);
    if (amountKobo > this.#balanceKobo) throw new Error(`insufficient funds: balance ${this.#balanceKobo}, needed ${amountKobo}`);
    this.#balanceKobo -= amountKobo;
  }

  static #checkAmount(amountKobo: number): void {
    if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) throw new Error(`amount must be positive whole kobo, got ${amountKobo}`);
  }
}

const wallet = new Wallet();
wallet.deposit(1_000_000);
wallet.pay(483_750);
console.log(wallet.balanceKobo);

for (const attempt of [() => wallet.pay(600_000), () => wallet.deposit(-50), () => wallet.deposit(10.5)]) {
  try {
    attempt();
  } catch (error) {
    console.log((error as Error).message);
  }
}
console.log(wallet.balanceKobo);
```

Output of `npx tsx wallet.ts` and of the browser terminal

```ts
516250
insufficient funds: balance 516250, needed 600000
amount must be positive whole kobo, got -50
amount must be positive whole kobo, got 10.5
516250
```

The invariant "the balance is never negative and only changes by whole kobo" is now enforced in one place. The refused operations left the balance untouched. A negative deposit is the classic way to sneak a withdrawal past a check, which is why `deposit` validates too.

TRY IT YOURSELF

### Compose a logging notifier

Support wants a record of every message sent, including which channel sent it. Without editing `createOrderService` or `outboxNotifier`, write a `logged(name, notifier, log)` wrapper that logs `"<name> -> <to>"` before sending, and compose it with the notifiers you already have.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`logged` must return an object with a `send` method, exactly like `outboxNotifier` does: `{ async send(to, message) { ... } }`.

HINT 2

Inside `send`: `log(\`${name} -> ${to}\`);` first, then `await notifier.send(to, message);`.

SOLUTION

logged-notifier.ts

```ts
import { allOf, bestEffort, outboxNotifier } from "./notifiers.js";
import type { Notifier } from "./ports.js";

function logged(name: string, notifier: Notifier, log: (line: string) => void): Notifier {
  return {
    async send(to, message) {
      log(`${name} -> ${to}`);
      await notifier.send(to, message);
    },
  };
}

const outbox: string[] = [];
const lines: string[] = [];
const notifier = allOf(
  logged("email", bestEffort(outboxNotifier("email", outbox), (l) => lines.push(l)), (l) => lines.push(l)),
  logged("sms", bestEffort(outboxNotifier("sms", outbox, true), (l) => lines.push(l)), (l) => lines.push(l)),
);

await notifier.send("ada@shop.ng", "order ORD-7 confirmed");
console.log(lines);
console.log(outbox);
```

Output of `npx tsx logged-notifier.ts` and of the browser terminal

```json
[
  'email -> ada@shop.ng',
  'sms -> ada@shop.ng',
  'notification to ada@shop.ng failed: sms server unavailable'
]
[ 'email to ada@shop.ng: order ORD-7 confirmed' ]
```

`logged` has the same shape as `bestEffort`: it takes a `Notifier` and returns a `Notifier`. Wrappers of that shape can be stacked in any order, and the order matters: `logged` outside `bestEffort` logs every attempt, even failed ones. This is the **decorator** pattern, which [Structural patterns](https://zudojs.oyinlola.site/learn/design-patterns-structural#decorator) takes further.

## Recap

- **Separation of concerns**: give each area of knowledge (validation, pricing, payment, storage, notification) its own place. Split calculations from side effects first.
- **Cohesion**: what is in one module belongs together and changes for the same reason; one idea, such as "how a total is computed", lives in one place.
- **Coupling**: depend on as little as possible. Avoid reaching into internals, shared globals and building your own collaborators; receive what you need.
- **Encapsulation**: keep data with the methods that guard its invariants; let state change only through those methods.
- **Abstraction**: design interfaces from the caller's side, in the caller's words, so provider details cannot leak through.
- **Composition**: build behaviour by combining small parts in a composition root; add features by wrapping, not editing.
- Refactor behind characterization tests, one small step at a time, and do not overdo any principle.

Next: [SOLID, DRY, KISS and YAGNI](https://zudojs.oyinlola.site/learn/design-solid), the named principles built on these ideas, and the ways teams misapply them.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
