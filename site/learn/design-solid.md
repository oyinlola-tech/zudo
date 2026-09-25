---
title: "SOLID, DRY, KISS and YAGNI — ZudoJS Academy"
description: "Meet SOLID, DRY, KISS and YAGNI through real invoice, promotion and reminder bugs, then see how each principle goes wrong when it is applied without judgement."
source: https://zudojs.oyinlola.site/learn/design-solid
---

LEVEL 11 · LESSON 2 OF 12

Design principles Core

# SOLID, DRY, KISS and YAGNI

Meet SOLID, DRY, KISS and YAGNI through real invoice, promotion and reminder bugs, then see how each principle goes wrong when it is applied without judgement.

- **55 min** to read and try
- **You need:** Design principles through refactoring, Classes in TypeScript and Unions and narrowing
- **You build:** An invoicing module split by who asks for changes, with pluggable promotions, contract-tested stores and a reminder job that depends only on what it uses

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Split a module by the people who ask for its changes, not by its size
- Add new behaviour through extension points where change is frequent, and use exhaustive switches where the set is closed
- Write a contract test that every implementation of an interface must pass
- Give each consumer a small interface and invert dependencies so policy does not import details
- Tell real duplication from look-alike code, and recognise when DRY, KISS and YAGNI are being misapplied

## The invoice change that broke accounting

A wholesale food business sends invoices to shops. The same class computes an invoice, renders it for the customer, and exports it for the accounting system. Last week the finance team asked for customer invoices to show amounts the Nigerian way, with the naira sign and thousands separators. A developer changed one helper. Here is the class after that change:

invoice-problem.ts

```ts
interface InvoiceLine {
  readonly description: string;
  readonly qty: number;
  readonly unitKobo: number;
}

interface Invoice {
  readonly number: string;
  readonly customer: string;
  readonly lines: readonly InvoiceLine[];
}

class InvoiceService {
  total(invoice: Invoice): number {
    const subtotal = invoice.lines.reduce((sum, line) => sum + line.qty * line.unitKobo, 0);
    return subtotal + Math.round(subtotal * 0.075);
  }

  private money(kobo: number): string {
    return "₦" + (kobo / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  render(invoice: Invoice, format: "text" | "csv"): string {
    switch (format) {
      case "text":
        return `Invoice ${invoice.number} for ${invoice.customer}\nTotal due: ${this.money(this.total(invoice))}`;
      case "csv":
        return `${invoice.number},${invoice.customer},${this.money(this.total(invoice))}`;
    }
  }
}

const invoice: Invoice = {
  number: "INV-7",
  customer: "Adaeze Stores",
  lines: [{ description: "Rice 50kg", qty: 1, unitKobo: 1_341_000 }],
};

const service = new InvoiceService();
console.log(service.render(invoice, "text"));
const row = service.render(invoice, "csv");
console.log(row);
console.log("columns accounting sees:", row.split(",").length);
```

Output of `npx tsx invoice-problem.ts` and of the browser terminal

```ts
Invoice INV-7 for Adaeze Stores
Total due: ₦14,415.75
INV-7,Adaeze Stores,₦14,415.75
columns accounting sees: 4
```

The customer invoice looks exactly as finance wanted. The CSV export, which the accounting system imports every night, now has a comma inside the amount, so each row has four columns instead of three and the import rejects every invoice. The developer was not careless: `money` looked like one helper with one job. It actually served two different groups of people who want different things.

This lesson is about the five principles known as **SOLID**, plus three shorter ones, **DRY**, **KISS** and **YAGNI**. Each exists because teams kept hitting bugs like this one. Each also has a failure mode when it is applied mechanically, and you will see those too. They build on [Design principles through refactoring](https://zudojs.oyinlola.site/learn/design-principles): cohesion, coupling and abstraction are the ideas underneath all eight.

## S: single responsibility

The **single responsibility principle** (SRP) is often quoted as "a class should do one thing". That version is too vague to use: computing a total is "one thing", so is "handling invoices". Robert C. Martin, who named SOLID, restated it more usefully: **a module should have one reason to change**, which in practice means it should answer to **one actor**, one group of people who request changes.

List who asks for changes to `InvoiceService`:

| Part | Actor | Typical request |
| --- | --- | --- |
| `total` | finance | "VAT changes on 1 January" |
| text rendering | customer service, marketing | "show the naira sign", "add our logo" |
| CSV export | accounting's system | "amounts in kobo, no formatting, quote text fields" |

The shared `money` helper tied the second and third actors together. Split along the actors: one module computes, and one module per consumer renders. The consumers share the *calculation* (one truth about the total) but not the *formatting* (each consumer's own taste):

invoice.ts

```ts
export interface InvoiceLine {
  readonly description: string;
  readonly qty: number;
  readonly unitKobo: number;
}

export interface Invoice {
  readonly number: string;
  readonly customer: string;
  readonly lines: readonly InvoiceLine[];
}

export interface InvoiceTotals {
  readonly subtotalKobo: number;
  readonly vatKobo: number;
  readonly totalKobo: number;
}

export function invoiceTotals(invoice: Invoice): InvoiceTotals {
  const subtotalKobo = invoice.lines.reduce((sum, line) => sum + line.qty * line.unitKobo, 0);
  const vatKobo = Math.round(subtotalKobo * 0.075);
  return { subtotalKobo, vatKobo, totalKobo: subtotalKobo + vatKobo };
}
```

customer-invoice.ts

```ts
import { invoiceTotals, type Invoice } from "./invoice.js";

function naira(kobo: number): string {
  return "₦" + (kobo / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function renderCustomerInvoice(invoice: Invoice): string {
  const { totalKobo } = invoiceTotals(invoice);
  return `Invoice ${invoice.number} for ${invoice.customer}\nTotal due: ${naira(totalKobo)}`;
}
```

accounting-export.ts

```ts
import { invoiceTotals, type Invoice } from "./invoice.js";

function csvField(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toAccountingRow(invoice: Invoice): string {
  const { totalKobo } = invoiceTotals(invoice);
  return [invoice.number, invoice.customer, totalKobo].map(csvField).join(",");
}
```

srp-test.ts

```ts
import { toAccountingRow } from "./accounting-export.js";
import { renderCustomerInvoice } from "./customer-invoice.js";
import type { Invoice } from "./invoice.js";

const check = (name: string, ok: boolean) => console.log(`${ok ? "PASS" : "FAIL"} ${name}`);

const invoice: Invoice = { number: "INV-7", customer: "Adaeze Stores", lines: [{ description: "Rice 50kg", qty: 1, unitKobo: 1_341_000 }] };
const tricky: Invoice = { ...invoice, number: "INV-8", customer: "Musa, Sons & Co" };

console.log(renderCustomerInvoice(invoice));
console.log(toAccountingRow(invoice));
console.log(toAccountingRow(tricky));
check("customers see naira formatting", renderCustomerInvoice(invoice).endsWith("₦14,415.75"));
check("accounting gets whole kobo", toAccountingRow(invoice) === "INV-7,Adaeze Stores,1441575");
check("a comma in a name stays in one field", toAccountingRow(tricky).startsWith('INV-8,"Musa, Sons & Co"'));
```

Output of `npx tsx srp-test.ts` and of the browser terminal

```ts
Invoice INV-7 for Adaeze Stores
Total due: ₦14,415.75
INV-7,Adaeze Stores,1441575
INV-8,"Musa, Sons & Co",1441575
PASS customers see naira formatting
PASS accounting gets whole kobo
PASS a comma in a name stays in one field
```

Now finance can change the naira format and the export cannot notice. The split also exposed a second, older bug: a customer whose name contains a comma would have broken the CSV even before last week's change. The export now has one owner who cares about CSV rules.

### How SRP gets misapplied

Read as "one thing per class", SRP produces classes like `InvoiceSubtotalCalculator`, `InvoiceVatCalculator` and `InvoiceTotalAdder`, each with one method, all changed together by finance every time. That scatters one responsibility across three files, which is low cohesion. The test is not size but **who asks**: `invoiceTotals` computes three numbers and is still one responsibility, because only finance ever changes it.

## O: open for extension, closed for modification

The same business runs promotions. The discount function started with one coupon and grew one `else if` per campaign. In March, marketing added a weekend promo:

promo-problem.ts

```ts
interface Order {
  readonly subtotalKobo: number;
  readonly firstOrder: boolean;
  readonly day: string;
  readonly coupon?: string;
}

function discountKobo(order: Order): number {
  if (order.coupon === "SAVE10") return Math.round(order.subtotalKobo * 0.1);
  else if (order.day === "Saturday") return 50_000; // added in March
  else if (order.firstOrder) return Math.round(order.subtotalKobo * 0.15);
  return 0;
}

console.log("new customer, Tuesday:", discountKobo({ subtotalKobo: 2_000_000, firstOrder: true, day: "Tuesday" }));
console.log("new customer, Saturday:", discountKobo({ subtotalKobo: 2_000_000, firstOrder: true, day: "Saturday" }));
```

Output of `npx tsx promo-problem.ts` and of the browser terminal

```ts
new customer, Tuesday: 300000
new customer, Saturday: 50000
```

A new customer who orders on a Saturday now gets ₦500 off instead of ₦3,000. The weekend line was inserted above the first-order line, so it silently wins. Every new campaign means editing this function, re-reading every branch, and deciding a priority that is written down nowhere except in the order of the `if`s.

The **open/closed principle** (OCP) says a module should be **open for extension** (you can add behaviour) but **closed for modification** (you add it without editing code that already works). The move is to find the part that keeps changing, the list of promotions, and turn it into data: each promotion becomes an object with the same shape, and the function that picks a discount is written once, with its policy stated explicitly:

promotions.ts

```ts
export interface Order {
  readonly subtotalKobo: number;
  readonly firstOrder: boolean;
  readonly day: string;
  readonly coupon?: string;
}

export interface Promotion {
  readonly name: string;
  appliesTo(order: Order): boolean;
  discountKobo(order: Order): number;
}

export function bestDiscount(order: Order, promotions: readonly Promotion[]): { name: string; kobo: number } {
  let best = { name: "none", kobo: 0 };
  for (const promo of promotions) {
    if (!promo.appliesTo(order)) continue;
    const kobo = promo.discountKobo(order);
    if (kobo > best.kobo) best = { name: promo.name, kobo };
  }
  return best;
}

export const save10: Promotion = {
  name: "SAVE10",
  appliesTo: (order) => order.coupon === "SAVE10",
  discountKobo: (order) => Math.round(order.subtotalKobo * 0.1),
};

export const firstOrder: Promotion = {
  name: "first order",
  appliesTo: (order) => order.firstOrder,
  discountKobo: (order) => Math.round(order.subtotalKobo * 0.15),
};
```

The weekend promo is now a new object in a new place. `bestDiscount`, `save10` and `firstOrder` are not touched, and "the customer gets the best single discount" is one tested rule instead of an accident of line order:

ocp-test.ts

```ts
import { bestDiscount, firstOrder, save10, type Promotion } from "./promotions.js";

const weekend: Promotion = {
  name: "weekend",
  appliesTo: (order) => order.day === "Saturday" || order.day === "Sunday",
  discountKobo: () => 50_000,
};

const active = [save10, firstOrder, weekend];
const check = (name: string, ok: boolean) => console.log(`${ok ? "PASS" : "FAIL"} ${name}`);

const newOnSaturday = bestDiscount({ subtotalKobo: 2_000_000, firstOrder: true, day: "Saturday" }, active);
const regularOnSunday = bestDiscount({ subtotalKobo: 300_000, firstOrder: false, day: "Sunday" }, active);
console.log(newOnSaturday, regularOnSunday);
check("a new customer keeps the bigger first-order discount", newOnSaturday.name === "first order");
check("the weekend promo still works on its own", regularOnSunday.kobo === 50_000);
```

Output of `npx tsx ocp-test.ts` and of the browser terminal

```json
{ name: 'first order', kobo: 300000 } { name: 'weekend', kobo: 50000 }
PASS a new customer keeps the bigger first-order discount
PASS the weekend promo still works on its own
```

You have seen this shape before: [notifiers composed from the outside](https://zudojs.oyinlola.site/learn/design-principles#composition) were OCP too. ZudoJS is built on it in many places. Middleware lets you add logging, authentication or rate limiting around handlers without editing them ([Middleware in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-middleware)), and event handlers let new features react to an order without changing the code that places it ([Events in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-events)).

### When closed is the wrong goal: exhaustive switches

OCP pays off on the axis that changes often. Not every list is like that. An invoice's status is `draft`, `sent` or `paid`: a small, closed set that the business rarely extends. For a closed set, a plain `switch` is simpler than a plugin system, and TypeScript can make it *safer*: if every case returns, the value after the switch has the type `never`. When someone adds `"void"` to the union, every switch that forgot it stops compiling:

status-label.ts

```ts
type InvoiceStatus = "draft" | "sent" | "paid" | "void";

function statusLabel(status: InvoiceStatus): string {
  switch (status) {
    case "draft":
      return "Not sent yet";
    case "sent":
      return "Awaiting payment";
    case "paid":
      return "Paid, thank you";
  }
  const unhandled: never = status;
  return unhandled;
}
```

What `npx tsc --noEmit` prints

```ts
status-label.ts:12:9 - error TS2322: Type '"void"' is not assignable to type 'never'.

12   const unhandled: never = status;
           ~~~~~~~~~


Found 1 error in status-label.ts:12
```

Here "modify every switch" is exactly what you want, and the compiler finds every place for you. Use extension points (objects in a list, middleware, events) where new cases arrive every month from people outside the team. Use exhaustive switches where the set is part of the domain and a new case must be thought through everywhere. Building a registry for three statuses that never change is OCP misapplied.

## L: Liskov substitution

The **Liskov substitution principle** (LSP) says: code written against a type must keep working with *any* implementation of that type. [Inheritance and composition](https://zudojs.oyinlola.site/learn/js-composition#coupling) showed it with a locked cart that threw on `addItem`. With interfaces the same rule applies, and it is broken in quieter ways than throwing: by returning something different from what the interface promised.

The invoicing module stores invoices through an interface. The team has an in-memory store for tests and a store for the old accounting database. The interface says `find` returns `undefined` for an unknown number. The legacy store was written by someone who assumed "not found" is an error:

invoice-type.ts

```ts
export interface Invoice {
  readonly number: string;
  readonly customer: string;
  readonly totalKobo: number;
}
```

stores.ts

```ts
import type { Invoice } from "./invoice-type.js";

export interface InvoiceStore {
  save(invoice: Invoice): Promise<void>;
  /** Returns undefined when there is no invoice with this number. */
  find(number: string): Promise<Invoice | undefined>;
}

export class MemoryInvoiceStore implements InvoiceStore {
  readonly #rows = new Map<string, Invoice>();
  async save(invoice: Invoice) {
    this.#rows.set(invoice.number, invoice);
  }
  async find(number: string) {
    return this.#rows.get(number);
  }
}

export class LegacyInvoiceStore implements InvoiceStore {
  readonly #rows = new Map<string, string>();
  async save(invoice: Invoice) {
    this.#rows.set(invoice.number.toUpperCase(), JSON.stringify(invoice));
  }
  async find(number: string) {
    const row = this.#rows.get(number.toUpperCase());
    if (row === undefined) throw new Error(`ERR 404: invoice ${number}`);
    return JSON.parse(row) as Invoice;
  }
}
```

Both classes compile: `implements` only checks the *types* of the methods, not their behaviour. The practical tool for LSP is a **contract test**: one test suite, written against the interface, that every implementation must pass. It is a function that takes a way to build a fresh store:

store-contract.ts

```ts
import type { InvoiceStore } from "./stores.js";

export async function invoiceStoreContract(name: string, makeStore: () => InvoiceStore): Promise<void> {
  const check = (test: string, ok: boolean) => console.log(`${ok ? "PASS" : "FAIL"} [${name}] ${test}`);

  const store = makeStore();
  const invoice = { number: "inv-9", customer: "Adaeze Stores", totalKobo: 1_441_575 };
  await store.save(invoice);
  const found = await store.find("inv-9");
  check("find returns what was saved", JSON.stringify(found) === JSON.stringify(invoice));

  try {
    check("find of an unknown number returns undefined", (await makeStore().find("inv-404")) === undefined);
  } catch (error) {
    check(`find of an unknown number returns undefined (threw "${(error as Error).message}")`, false);
  }
}
```

contract-test.ts

```ts
import { invoiceStoreContract } from "./store-contract.js";
import { LegacyInvoiceStore, MemoryInvoiceStore } from "./stores.js";

await invoiceStoreContract("memory", () => new MemoryInvoiceStore());
await invoiceStoreContract("legacy", () => new LegacyInvoiceStore());
```

Output of `npx tsx contract-test.ts` and of the browser terminal

```ts
PASS [memory] find returns what was saved
PASS [memory] find of an unknown number returns undefined
PASS [legacy] find returns what was saved
FAIL [legacy] find of an unknown number returns undefined (threw "ERR 404: invoice inv-404")
```

The legacy store breaks the promise in the interface. Code such as "create the invoice if it does not exist yet" works in every test (which use the memory store) and crashes in production. The fix belongs in the legacy store, not in every caller: catch its "not found" and return `undefined`, as the interface says. Then the contract test passes for both.

The general rule, due to Barbara Liskov and Jeannette Wing: an implementation may accept *more* than the interface requires and promise *more* than it guarantees, never less. It must not demand extra conditions from callers (a store that only accepts upper-case numbers), must not return less (throwing where the interface promised a value or `undefined`), and must keep the type's invariants.

## I: interface segregation

The invoice repository grew with the business. By now it has twelve methods. A new job sends payment reminders for overdue invoices, and needs exactly one of them. Here is the job's first test, which tries to pass a fake with only that one method:

fat-interface.ts

```ts
interface Invoice {
  readonly number: string;
  readonly email: string;
  readonly totalKobo: number;
}

interface InvoiceRepository {
  save(invoice: Invoice): Promise<void>;
  find(number: string): Promise<Invoice | undefined>;
  remove(number: string): Promise<void>;
  listByCustomer(email: string): Promise<Invoice[]>;
  listOverdue(now: Date): Promise<Invoice[]>;
  markPaid(number: string): Promise<void>;
  markVoid(number: string): Promise<void>;
  countByStatus(): Promise<Record<string, number>>;
  exportAll(): Promise<string>;
  importAll(csv: string): Promise<number>;
  archiveBefore(date: Date): Promise<number>;
  search(text: string): Promise<Invoice[]>;
}

async function sendReminders(repository: InvoiceRepository, now: Date): Promise<number> {
  const overdue = await repository.listOverdue(now);
  return overdue.length;
}

const fake: InvoiceRepository = { listOverdue: async () => [] };
console.log(await sendReminders(fake, new Date()));
```

What `npx tsc --noEmit` prints

```ts
fat-interface.ts:27:7 - error TS2740: Type '{ listOverdue: () => Promise<never[]>; }' is missing the following properties from type 'InvoiceRepository': save, find, remove, listByCustomer, and 7 more.

27 const fake: InvoiceRepository = { listOverdue: async () => [] };
         ~~~~


Found 1 error in fat-interface.ts:27
```

To satisfy the type, the test must stub eleven methods it does not care about, typically with `throw new Error("not used")`. Worse, the reminder job now *depends* on all twelve: when `importAll` changes its signature, the job's tests stop compiling, although the job never imports anything. The **interface segregation principle** (ISP) says: **no code should be forced to depend on methods it does not use**. Give each consumer a small interface that lists what it needs:

reminders.ts

```ts
export interface OverdueInvoice {
  readonly number: string;
  readonly email: string;
  readonly totalKobo: number;
}

export interface OverdueInvoices {
  listOverdue(now: Date): Promise<readonly OverdueInvoice[]>;
}

export interface ReminderSender {
  send(to: string, text: string): Promise<void>;
}

export async function sendReminders(invoices: OverdueInvoices, sender: ReminderSender, now: Date): Promise<number> {
  const overdue = await invoices.listOverdue(now);
  for (const invoice of overdue) {
    await sender.send(invoice.email, `Invoice ${invoice.number} (NGN ${(invoice.totalKobo / 100).toFixed(2)}) is overdue.`);
  }
  return overdue.length;
}
```

reminders-test.ts

```ts
import { sendReminders } from "./reminders.js";

const sent: string[] = [];
const count = await sendReminders(
  { listOverdue: async () => [{ number: "INV-3", email: "musa@shop.ng", totalKobo: 950_000 }] },
  { send: async (to, text) => void sent.push(`${to}: ${text}`) },
  new Date("2026-03-02T09:00:00Z"),
);

console.log(count, sent);
```

Output of `npx tsx reminders-test.ts` and of the browser terminal

```ts
1 [ 'musa@shop.ng: Invoice INV-3 (NGN 9500.00) is overdue.' ]
```

The big repository class can still exist and implement all twelve methods; TypeScript's structural typing means it satisfies `OverdueInvoices` automatically, without even saying `implements`. What changed is what the job *asks for*. For a one-off, `Pick<InvoiceRepository, "listOverdue">` expresses the same idea without a new name ([Utility types](https://zudojs.oyinlola.site/learn/ts-utility-types)).

Misapplied, ISP becomes "one interface per method" for everything, and every class implements eight tiny interfaces nobody can remember. Segregate by *consumer*: an interface should match what one kind of caller needs, which is often two or three methods that belong together.

## D: dependency inversion

Look at which way the imports point. In the first version of the reminder job, the job imported the e-mail class directly:

```ts
before                                    after
reminders.ts ──imports──▶ smtp-mailer.ts   reminders.ts  (owns ReminderSender)
  policy          depends on   detail            ▲
                                                 │ imports the interface
                                           smtp-sender.ts  implements ReminderSender
```

Before, the policy ("remind customers about overdue invoices") depended on a detail (SMTP). Any change to the mailer could break the job, and the job could not run without a mail server. The **dependency inversion principle** (DIP) says: **high-level policy should not depend on low-level details; both should depend on an abstraction, and the abstraction belongs to the policy**. In `reminders.ts` above, the job defines `ReminderSender` in its own words, and the SMTP code imports that interface to implement it. The source-code arrow now points from the detail to the policy: it has been *inverted*. This is the dependency rule of [Backend architecture](https://zudojs.oyinlola.site/learn/backend-architecture#layers), stated as a principle.

Three terms are often confused:

| Term | What it is |
| --- | --- |
| **Dependency inversion** | A rule about the direction of source dependencies: details depend on interfaces owned by policy. |
| **Dependency injection** | A technique: pass collaborators in (constructor or parameters) instead of creating them inside. |
| **DI container** | A tool that does the injection for you from registrations: [Typed dependency injection](https://zudojs.oyinlola.site/learn/ts-typed-di) builds one, [The ZudoJS container](https://zudojs.oyinlola.site/learn/zudo-container) is the framework's. |

### The interface with one implementation forever

DIP is the principle most often turned into ceremony: every class gets an `IUserService` interface and a `UserServiceImpl`, although there will only ever be one implementation. That doubles the files and makes "go to definition" land on an interface instead of code.

REASON IT OUT

### Should this become an interface?

You are about to write `ExchangeRates`, a class that fetches the naira/dollar rate from a bank's API, used by a pricing function. Before deciding whether to put an interface in front of it, ask:

- How many implementations exist today? How many can you name that will exist in the next few months?
- Does it talk to something outside the process (network, disk, clock, randomness)? Will tests need to replace it?
- Who owns the abstraction: is there a policy module that should not know about the bank's API?
- If you skip the interface now, what does it cost to add one later?

**Show the reasoning**

- One real implementation today, maybe a second provider one day. That alone does not justify an interface.
- Yes, it calls the network. Tests must replace it, so there are effectively two implementations already: the real one and the fake. That is the strongest reason for a seam.
- The pricing function is policy and should not know URLs or response formats, so the abstraction ("give me a rate") belongs to pricing.
- In TypeScript, very little. Types are **structural**: a class used as a type is already an interface, and any object with the same public members fits it. You can start with the class as the type and extract an interface when you need one. The next two examples show the one catch.

A class with only public members can be faked with a plain object, no interface needed:

class-as-type.ts

```ts
class ExchangeRates {
  async rate(from: string, to: string): Promise<number> {
    throw new Error(`would call the bank API for ${from}/${to}`);
  }
}

async function priceInDollars(kobo: number, rates: ExchangeRates): Promise<string> {
  const rate = await rates.rate("NGN", "USD");
  return ((kobo / 100) * rate).toFixed(2);
}

const fakeRates = { rate: async () => 0.00065 };
console.log(await priceInDollars(1_441_575, fakeRates));
```

Output of `npx tsx class-as-type.ts` and of the browser terminal

```ts
9.37
```

The catch: once the class gains a `#private` field (or a TypeScript `private` one), only real instances of that class fit its type, because no other object can have that private member:

class-private.ts

```ts
class ExchangeRates {
  #cache = new Map<string, number>();

  async rate(from: string, to: string): Promise<number> {
    return this.#cache.get(`${from}/${to}`) ?? 1;
  }
}

async function priceInDollars(kobo: number, rates: ExchangeRates): Promise<string> {
  return ((kobo / 100) * (await rates.rate("NGN", "USD"))).toFixed(2);
}

console.log(await priceInDollars(1_441_575, { rate: async () => 0.00065 }));
```

What `npx tsc --noEmit` prints

```ts
class-private.ts:13:45 - error TS2741: Property '#cache' is missing in type '{ rate: () => Promise<number>; }' but required in type 'ExchangeRates'.

13 console.log(await priceInDollars(1_441_575, { rate: async () => 0.00065 }));
                                               ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  class-private.ts:2:3 - '#cache' is declared here.
    2   #cache = new Map<string, number>();
        ~~~~~~


Found 1 error in class-private.ts:13
```

That is the moment to extract the interface, owned by the pricing code: `interface RateSource { rate(from: string, to: string): Promise<number> }`. It is a small, local change, and callers that pass real instances do not change at all. So in TypeScript the advice is: put a seam in front of anything that crosses the process boundary, name it from the consumer's side, and do not create `IThing`/`ThingImpl` pairs for internal logic.

## DRY, and the wrong abstraction

**DRY**, "don't repeat yourself", comes from *The Pragmatic Programmer*: every piece of **knowledge** should have a single, authoritative representation in a system. The scattered VAT rate in the [previous lesson](https://zudojs.oyinlola.site/learn/design-principles#cohesion) broke DRY: one fact, three copies, and they drifted apart.

The word that matters is *knowledge*, not *code*. Two pieces of code can look identical and still encode different knowledge. The business charges a delivery fee and a service fee. On launch day both happened to be 2% of the subtotal with a ₦500 minimum, so a developer merged them. Then the two fees started to change for different reasons, and the shared function grew flags:

premature-dry.ts

```ts
type FeeKind = "delivery" | "service";

function feeKobo(subtotalKobo: number, kind: FeeKind, options: { lagos?: boolean; weekend?: boolean } = {}): number {
  let fee = Math.max(50_000, Math.round(subtotalKobo * 0.02));
  if (kind === "delivery" && options.lagos) fee -= 20_000;
  if (options.weekend) fee += 30_000; // logistics: weekend drivers cost more
  return fee;
}

const weekend = { weekend: true };
console.log("delivery on a weekend:", feeKobo(2_000_000, "delivery", weekend));
console.log("service fee on a weekend:", feeKobo(2_000_000, "service", weekend));
```

Output of `npx tsx premature-dry.ts` and of the browser terminal

```ts
delivery on a weekend: 80000
service fee on a weekend: 80000
```

The weekend surcharge was meant for delivery only. Because the checkout passes the same options object to both calls, customers now pay a weekend *service* fee too. Every new rule has to be guarded by `kind === …`, and the function is on its way to a dozen flags. Sandi Metz put it this way: **duplication is far cheaper than the wrong abstraction**. The fix is to undo the merge, because the two fees are two pieces of knowledge owned by two teams:

two-fees.ts

```ts
function deliveryFeeKobo(subtotalKobo: number, where: { lagos: boolean; weekend: boolean }): number {
  const base = Math.max(50_000, Math.round(subtotalKobo * 0.02));
  return base - (where.lagos ? 20_000 : 0) + (where.weekend ? 30_000 : 0);
}

function serviceFeeKobo(subtotalKobo: number): number {
  return Math.max(50_000, Math.round(subtotalKobo * 0.02));
}

const check = (name: string, ok: boolean) => console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
check("weekend raises delivery", deliveryFeeKobo(2_000_000, { lagos: false, weekend: true }) === 80_000);
check("weekend leaves the service fee alone", serviceFeeKobo(2_000_000) === 50_000);
check("big orders pay 2%", serviceFeeKobo(5_000_000) === 100_000);
```

Output of `npx tsx two-fees.ts` and of the browser terminal

```ts
PASS weekend raises delivery
PASS weekend leaves the service fee alone
PASS big orders pay 2%
```

Two questions tell real duplication from look-alike code:

- **If one changes, must the other change too?** The VAT copies: yes, always. The two fees: no.
- **Do the same people own both?** Finance owns VAT everywhere. Logistics owns delivery, product owns the service fee.

A common rule of thumb is the **rule of three**: tolerate a second copy, and extract on the third, when you can see what the copies really share. Note the tension with SRP: code shared between two actors couples them, which is exactly what went wrong with `money` in the invoice class.

## KISS: keep it simple

**KISS**, "keep it simple", asks for the simplest design that fully solves today's problem. Marketing wanted a way to configure discounts, so a developer built a small rule engine: rules are data with a field name, an operator and a value, and a generic evaluator runs them:

rule-engine.ts

```ts
interface Rule {
  field: string;
  op: string;
  value: number;
  discountKobo: number;
}

const rules: Rule[] = [{ field: "subtotalKobo", op: "gte ", value: 2_000_000, discountKobo: 100_000 }];

function evaluate(order: Record<string, number>, ruleList: Rule[]): number {
  let discount = 0;
  for (const rule of ruleList) {
    const actual = order[rule.field];
    if (actual === undefined) continue;
    const matches = rule.op === "gte" ? actual >= rule.value : rule.op === "lt" ? actual < rule.value : false;
    if (matches) discount = Math.max(discount, rule.discountKobo);
  }
  return discount;
}

console.log("big order discount:", evaluate({ subtotalKobo: 5_000_000 }, rules));
```

Output of `npx tsx rule-engine.ts` and of the browser terminal

```ts
big order discount: 0
```

A trailing space in `"gte "` switched the promotion off, and nothing complained. The engine turned code into strings, so the compiler, the editor and the tests all lost sight of it. Marketing never edited a rule themselves anyway: they asked a developer. The simple version is five lines, and every typo in it is a compile error:

simple-discount.ts

```ts
const bigOrderDiscountKobo = (subtotalKobo: number): number => (subtotalKobo >= 2_000_000 ? 100_000 : 0);

console.log("big order discount:", bigOrderDiscountKobo(5_000_000));
console.log("small order discount:", bigOrderDiscountKobo(1_999_999));
```

Output of `npx tsx simple-discount.ts` and of the browser terminal

```ts
big order discount: 100000
small order discount: 0
```

KISS is misapplied when "simple" is read as "easy for me right now". The tangled `placeOrder` from the previous lesson was easy to write and anything but simple to change. Skipping validation, error handling or tests is not simplicity. A simple design has few moving parts *and* handles the real cases; it is often more work to reach than a clever one.

## YAGNI: you aren't gonna need it

**YAGNI** warns against building features or flexibility for needs you only imagine. The rule engine was YAGNI too: configurability nobody used. Other common examples in backend code:

- multi-currency support in a shop that only sells in naira, so every function takes a `currency` argument and every test has twice the cases;
- a plugin system for two export formats;
- a generic repository base class for a project with one table;
- an abstract base class with one subclass, "in case".

Each costs code to read, tests to maintain and choices made before you knew the real requirement. When the need finally arrives it usually looks different from the guess, and the speculative code has to be rewritten anyway.

YAGNI is misapplied when it is used to skip decisions that are **expensive to change later**. The test is not "do we need it now?" but "what does it cost to add later?":

| Cheap to add later: wait | Expensive to add later: decide now |
| --- | --- |
| a second export format | storing money as integer kobo, not floats |
| a second payment provider | storing timestamps in UTC |
| a promotion engine | idempotency keys on payment endpoints |
| caching | authorization checks on every endpoint |
| an interface in front of internal code | an audit log of money movements (you cannot log the past) |

The right-hand column is about data and security: once wrong data is stored or a breach has happened, no refactoring brings it back.

## Tests as design feedback

Most violations of these principles show up first as pain in tests. When a test is awkward to write, the design is usually telling you something:

| Test symptom | Likely cause | Principle |
| --- | --- | --- |
| A fake needs ten stub methods that throw "not used" | the code depends on a fat interface | ISP |
| A unit test needs a network, a database or the real clock | policy imports details directly | DIP |
| Adding a promotion breaks an old promotion's test | every case is edited into one function | OCP |
| A change for one team breaks another team's tests | one module answers to two actors | SRP |
| Tests pass with the fake, production fails with the real one | an implementation breaks the interface's promise | LSP: add a contract test |
| One change needs the same edit in three test files | one piece of knowledge has three copies | DRY |

The contract test from the LSP section is worth adopting in every project that has more than one implementation of an interface. Run it against the in-memory fake *and* the real adapter (against a test database), and your fakes stay honest.

## Principles in tension

None of these is a law. They pull against each other, and applying one can break another:

- **DRY vs SRP**: extracting shared code couples everyone who uses it. The `money` helper was DRY and broke SRP.
- **OCP vs KISS and YAGNI**: every extension point is a moving part. Add one when the second or third case arrives, not for the first.
- **DIP vs KISS**: an interface in front of every class is ceremony. Put seams at process boundaries.
- **ISP vs cohesion**: many tiny interfaces scatter one idea. Segregate by consumer, not by method.

In code review, use the principles as *vocabulary*, to explain a concrete risk ("this helper serves both the customer invoice and the accounting export, so a format change for one breaks the other"), never as a verdict ("this violates SRP"). The concrete risk is what convinces people and what helps them decide whether the trade-off is worth it.

## Practice

TRY IT YOURSELF

### Split a payroll module by actor

A `Payroll` module computes net pay (HR and finance own the rules: 7.5% pension, flat ₦2,000 union dues) and writes the bank's salary file (the bank owns the format: `account|amountKobo`, one line per employee). Both use a shared `formatAmount` that HR now wants to show as naira with commas. Write the two parts so that HR's formatting cannot reach the bank file, and test both.

**Show a solution**

payroll.ts

```ts
interface Employee {
  readonly name: string;
  readonly account: string;
  readonly grossKobo: number;
}

// HR and finance: the rules
function netPayKobo(employee: Employee): number {
  const pension = Math.round(employee.grossKobo * 0.075);
  return employee.grossKobo - pension - 200_000;
}

// HR: what employees read
function payslipLine(employee: Employee): string {
  const naira = (netPayKobo(employee) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${employee.name}: ₦${naira}`;
}

// the bank: the file format
function bankFile(employees: readonly Employee[]): string {
  return employees.map((employee) => `${employee.account}|${netPayKobo(employee)}`).join("\n");
}

const staff: Employee[] = [
  { name: "Tunde", account: "0123456789", grossKobo: 45_000_000 },
  { name: "Ngozi", account: "9876543210", grossKobo: 38_000_000 },
];

const check = (name: string, ok: boolean) => console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
console.log(staff.map(payslipLine));
console.log(bankFile(staff));
check("bank amounts are plain kobo", /^\d{10}\|\d+$/m.test(bankFile(staff)));
check("payslips are formatted for people", payslipLine(staff[0]!).includes("₦414,250.00"));
```

Output of `npx tsx payroll.ts` and of the browser terminal

```json
[ 'Tunde: ₦414,250.00', 'Ngozi: ₦349,500.00' ]
0123456789|41425000
9876543210|34950000
PASS bank amounts are plain kobo
PASS payslips are formatted for people
```

The three parts share the calculation, which is one piece of knowledge, and nothing else. The formatter now lives inside `payslipLine`, owned by HR, and the bank file cannot see it.

TRY IT YOURSELF

### Add a promotion without editing

Using `promotions.ts`, add a "bulk" promotion: ₦2,500 off orders of ₦50,000 or more. Do not edit `promotions.ts`. Then prove with tests that a new customer ordering ₦60,000 still gets the first-order discount (15% is bigger), and a returning customer gets the bulk discount.

**Show a solution**

bulk-promo.ts

```ts
import { bestDiscount, firstOrder, save10, type Promotion } from "./promotions.js";

const bulk: Promotion = {
  name: "bulk",
  appliesTo: (order) => order.subtotalKobo >= 5_000_000,
  discountKobo: () => 250_000,
};

const promotions = [save10, firstOrder, bulk];
const check = (name: string, ok: boolean) => console.log(`${ok ? "PASS" : "FAIL"} ${name}`);

const newCustomer = bestDiscount({ subtotalKobo: 6_000_000, firstOrder: true, day: "Monday" }, promotions);
const returning = bestDiscount({ subtotalKobo: 6_000_000, firstOrder: false, day: "Monday" }, promotions);
const small = bestDiscount({ subtotalKobo: 4_999_999, firstOrder: false, day: "Monday" }, promotions);
console.log(newCustomer, returning, small);
check("first order wins for a new customer", newCustomer.name === "first order" && newCustomer.kobo === 900_000);
check("bulk applies to a returning customer", returning.name === "bulk");
check("one kobo under the limit gets nothing", small.kobo === 0);
```

Output of `npx tsx bulk-promo.ts` and of the browser terminal

```json
{ name: 'first order', kobo: 900000 } { name: 'bulk', kobo: 250000 } { name: 'none', kobo: 0 }
PASS first order wins for a new customer
PASS bulk applies to a returning customer
PASS one kobo under the limit gets nothing
```

Only the list of active promotions changed. The boundary test (one kobo below ₦50,000) is the one that catches `>` written instead of `>=`.

TRY IT YOURSELF

### Make the legacy store honest

Write `HonestLegacyStore`, a wrapper that holds a `LegacyInvoiceStore`, implements `InvoiceStore`, and turns the legacy "ERR 404" error into `undefined` while letting every other error through. Run the contract test against it.

**Show a solution**

honest-store.ts

```ts
import { invoiceStoreContract } from "./store-contract.js";
import type { Invoice } from "./invoice-type.js";
import { LegacyInvoiceStore, type InvoiceStore } from "./stores.js";

class HonestLegacyStore implements InvoiceStore {
  constructor(private readonly legacy: LegacyInvoiceStore) {}

  save(invoice: Invoice): Promise<void> {
    return this.legacy.save(invoice);
  }

  async find(number: string): Promise<Invoice | undefined> {
    try {
      return await this.legacy.find(number);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("ERR 404")) return undefined;
      throw error;
    }
  }
}

await invoiceStoreContract("honest legacy", () => new HonestLegacyStore(new LegacyInvoiceStore()));
```

Output of `npx tsx honest-store.ts` and of the browser terminal

```ts
PASS [honest legacy] find returns what was saved
PASS [honest legacy] find of an unknown number returns undefined
```

The wrapper passes the same contract as the memory store. It only translates the one error that means "not found"; a connection failure still throws, because turning it into `undefined` would make callers believe the invoice does not exist. Wrapping an object to change its interface like this is the adapter pattern, coming up in [Structural patterns](https://zudojs.oyinlola.site/learn/design-patterns-structural#adapter).

## Recap

- **SRP**: one module, one actor who asks for its changes. Split by who asks, not by size.
- **OCP**: where cases arrive often, add them as new objects behind a stable interface. Where the set is closed, an exhaustive switch is simpler and the compiler finds every place to update.
- **LSP**: every implementation must keep the interface's promises. Prove it with a contract test run against each implementation.
- **ISP**: each consumer asks only for the methods it uses; the big class can still satisfy many small interfaces.
- **DIP**: policy owns the interfaces, details implement them. Put seams at process boundaries; skip `IThing`/`ThingImpl` ceremony for internal code.
- **DRY** is about knowledge, not text. Duplication is cheaper than the wrong abstraction.
- **KISS**: the simplest design that handles the real cases. **YAGNI**: do not build for imagined needs, but do decide now what is expensive to change later.

Next: [Creational patterns](https://zudojs.oyinlola.site/learn/design-patterns-creational), named solutions for the recurring problem of creating the right object.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
