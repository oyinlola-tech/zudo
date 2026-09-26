---
title: "Type-safe domain modelling — ZudoJS Academy"
description: "Model a shop's users, roles, products, orders, payments, events and ledger so illegal states cannot be written: no double payment, no refund before capture."
source: https://zudojs.oyinlola.site/learn/ts-domain-modeling
---

LEVEL 6 · LESSON 12 OF 22

The type system in depth Advanced

# Type-safe domain modelling

Model a shop's users, roles, products, orders, payments, events and ledger so illegal states cannot be written: no double payment, no refund before capture.

- **60 min** to read and try
- **You need:** Union types in depth, Functional TypeScript, The type system in depth and Branded types
- **You build:** A typed commerce domain where an order cannot be paid twice, a refund needs a captured payment and a finance permit, every money movement is a balanced ledger transaction, and stale writes are refused at runtime

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- List a domain's invariants and decide which ones types, smart constructors, runtime checks and the database should enforce
- Model entities as one type per state, with transition functions that accept only legal starting states
- Require proof of authorization in signatures with an unforgeable permit type
- Produce typed domain events and balanced ledger transactions from state changes
- Explain why types cannot stop a stale object being used twice, and refuse stale writes with a version check
- Parse persisted rows back into the domain types at the boundary

## An order that was paid twice and refunded by its customer

Here is the first version of a shop's order and payment model. It is the kind of model that grows naturally: a status string, a boolean, some optional fields, and functions that change objects in place. It compiles under `strict`:

naive.ts

```ts
interface Order {
  id: string;
  customerId: string;
  status: string;
  lines: { sku: string; qty: number; priceKobo: number }[];
  paid: boolean;
  paymentId?: string;
}

interface Payment {
  id: string;
  orderId: string;
  status: string;
  amountKobo: number;
  refundedKobo: number;
}

const bank: string[] = [];

function payOrder(order: Order, payment: Payment): void {
  order.paid = true;
  order.status = "paid";
  order.paymentId = payment.id;
  bank.push(`+${payment.amountKobo} from ${payment.id}`);
}

function refund(payment: Payment, amountKobo: number, byUserId: string): void {
  payment.refundedKobo += amountKobo;
  bank.push(`-${amountKobo} to ${payment.id} (by ${byUserId})`);
}

const order: Order = { id: "ORD-1042", customerId: "USR-1", status: "pending", lines: [], paid: false };
const first: Payment = { id: "PAY-88", orderId: "ORD-1042", status: "captured", amountKobo: 2020000, refundedKobo: 0 };
const second: Payment = { id: "PAY-89", orderId: "ORD-1042", status: "initiated", amountKobo: 2020000, refundedKobo: 0 };

payOrder(order, first);
payOrder(order, second);
refund(second, 2020000, "USR-1");
order.status = "shipped";

console.log(order.status, order.paid, order.paymentId, order.lines.length);
console.log(bank);
```

Output of `npx tsx naive.ts` and of the browser terminal

```ts
shipped true PAY-89 0
[
  '+2020000 from PAY-88',
  '+2020000 from PAY-89',
  '-2020000 to PAY-89 (by USR-1)'
]
```

Count the impossible things that just happened without a single error:

- An order with **no lines** was paid for ₦20,200.
- It was **paid twice**, and the record of the first payment was overwritten.
- The second payment was never captured (its status is `"initiated"`), yet it was **refunded**: money left the bank for a payment that never arrived.
- The refund was made **by the customer**, USR-1, not by anyone in finance.
- The order was marked shipped by assigning a string, which would have compiled just as happily with a typo like `"shiped"`.
- The bank log records money movements with no matching entries anywhere else, so nobody can check that the books balance.

[Union types in depth](https://zudojs.oyinlola.site/learn/ts-unions) fixed one entity, a loan, with a discriminated union. This lesson models a whole domain the same way, with every tool from this module: readonly data and pure transitions ([Functional TypeScript](https://zudojs.oyinlola.site/learn/ts-functional)), shapes that do not accidentally match ([The type system in depth](https://zudojs.oyinlola.site/learn/ts-type-system)) and brands for ids, amounts and proofs ([Branded types](https://zudojs.oyinlola.site/learn/ts-branded-types)). The goal has a well-known name: **make illegal states unrepresentable**. If a state is wrong for the business, the types should make it impossible to build, or at least impossible to pass where it would do harm.

## Rules first, types second

A **domain** is the part of the world your software is about: here, a shop's orders, payments and staff. A **domain model** is the set of types and functions that represent it. An **invariant** is a rule that must be true of the model at all times, such as "a refund never exceeds what was captured". Before writing types, write the invariants down, because each one needs a different enforcement tool.

REASON IT OUT

### The shop's rules, and who enforces each one

Here are the rules the naive model broke, plus a few more. For each one, decide what can enforce it: the **type checker**, a **smart constructor** (a check when a value is created), a **runtime check** in a function, or the **database**.

1. An order has at least one line, and every quantity is a whole number from 1 to 1,000.
2. Only a pending order can be paid, and only once.
3. An order is paid with a captured payment for that order and exactly its total.
4. Only paid orders can be shipped.
5. Only a captured payment can be refunded, and never more than what is left on it.
6. Only finance staff (or an admin) may refund. Customers may only pay their own orders.
7. Every money movement is recorded as a balanced ledger transaction: debits equal credits.
8. Every state change produces an event that other parts of the system can react to.

**Show the reasoning**

| Rule | Enforced by | How |
| --- | --- | --- |
| 1. Non-empty, quantities 1–1,000 | Types + smart constructor | A non-empty tuple type for lines; a `Quantity` brand whose constructor checks the range |
| 2. Only pending orders are paid | Types | `payOrder` accepts a `PendingOrder`, never a `PaidOrder` |
| 2. …and only once | Runtime + database | Two requests can hold the same pending order at once; a version check on save refuses the second |
| 3. Right payment, right amount | Types + runtime check | The type demands a `CapturedPayment`; the order id and amount are compared at runtime |
| 4. Only paid orders ship | Types | `shipOrder` accepts a `PaidOrder` |
| 5. Refund only when captured, never too much | Types + runtime check | The type demands a `CapturedPayment`; the remaining amount is checked at runtime |
| 6. Who may do what | Types + runtime check | Functions demand a `Permit` that only `authorize` can create; ownership of an order is compared at runtime |
| 7. Balanced transactions | Smart constructor | No type can add up a list; `transaction()` checks the sums and brands the result |
| 8. Events for every change | Types | Each use case returns its events in its result type, so a caller cannot forget they exist |

The pattern: types enforce *which kinds of things* may meet (a pending order, a captured payment, a refund permit). Smart constructors enforce facts about *one value* (a quantity, a balanced transaction). Runtime checks enforce facts about *several values together* (this payment belongs to this order). The database enforces facts about *time and other requests* (nobody else paid it first). A good model uses all four and knows which is which.

## Values: ids, money and quantities

The building blocks come first. Ids and amounts are branded as in the previous lesson; the constructors here throw, because values from outside are parsed at the boundary before they reach the domain. `NonEmpty<T>` is a readonly tuple type with one required element and a rest ([Tuples](https://zudojs.oyinlola.site/learn/ts-tuples#optional-rest)), so an empty array does not fit it:

brand.ts

```ts
declare const brand: unique symbol;
export type Brand<T, Name extends string> = T & { readonly [brand]: Name };
```

result.ts

```ts
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

values.ts

```ts
import type { Brand } from "./brand.js";

export type UserId = Brand<string, "UserId">;
export type ProductId = Brand<string, "ProductId">;
export type OrderId = Brand<string, "OrderId">;
export type PaymentId = Brand<string, "PaymentId">;
export type Kobo = Brand<number, "Kobo">;
export type Quantity = Brand<number, "Quantity">;
export type NonEmpty<T> = readonly [T, ...T[]];

function idMaker<Id extends Brand<string, string>>(prefix: string) {
  const pattern = new RegExp(`^${prefix}-\\d{1,12}$`);
  return (raw: string): Id => {
    if (!pattern.test(raw)) throw new TypeError(`not a ${prefix} id: ${JSON.stringify(raw.slice(0, 40))}`);
    return raw as Id;
  };
}

export const userId = idMaker<UserId>("USR");
export const productId = idMaker<ProductId>("PRD");
export const orderId = idMaker<OrderId>("ORD");
export const paymentId = idMaker<PaymentId>("PAY");

export function kobo(amount: number): Kobo {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError(`not an amount of kobo: ${amount}`);
  return amount as Kobo;
}

export function quantity(value: number): Quantity {
  if (!Number.isInteger(value) || value < 1 || value > 1000) throw new RangeError(`quantity must be 1 to 1000, got ${value}`);
  return value as Quantity;
}

export const sumKobo = (amounts: readonly Kobo[]): Kobo => kobo(amounts.reduce((sum, amount) => sum + amount, 0));
export const minusKobo = (from: Kobo, amount: Kobo): Kobo => kobo(from - amount);
```

`kobo` also rejects negative amounts, so "minus a refund" can never produce a negative balance by accident: `minusKobo` throws instead. Where a signed amount is genuinely needed, the ledger below uses a debit or credit *side* instead of a sign.

## Orders: one type per state

An order is an **entity**: it has an identity (its id) that stays the same while its state changes. Each state is its own interface with a literal `status`, and each carries only the data that exists in that state. A pending order has no payment; a paid order must have one; a shipped order has a tracking code:

orders.ts

```ts
import { kobo, sumKobo } from "./values.js";
import type { Kobo, NonEmpty, OrderId, PaymentId, ProductId, Quantity, UserId } from "./values.js";

export interface OrderLine {
  readonly productId: ProductId;
  readonly name: string;
  readonly unitPrice: Kobo;
  readonly quantity: Quantity;
}

interface OrderBase {
  readonly id: OrderId;
  readonly customer: UserId;
  readonly lines: NonEmpty<OrderLine>;
  readonly total: Kobo;
  readonly version: number;
}

export interface PendingOrder extends OrderBase {
  readonly status: "pending";
}
export interface PaidOrder extends OrderBase {
  readonly status: "paid";
  readonly paymentId: PaymentId;
  readonly paidAt: string;
}
export interface ShippedOrder extends OrderBase {
  readonly status: "shipped";
  readonly paymentId: PaymentId;
  readonly paidAt: string;
  readonly trackingCode: string;
}
export interface CancelledOrder extends OrderBase {
  readonly status: "cancelled";
  readonly reason: string;
}

export type Order = PendingOrder | PaidOrder | ShippedOrder | CancelledOrder;

export const lineTotal = (line: OrderLine): Kobo => kobo(line.unitPrice * line.quantity);

export function newOrder(id: OrderId, customer: UserId, lines: NonEmpty<OrderLine>): PendingOrder {
  return { id, customer, lines, total: sumKobo(lines.map(lineTotal)), version: 1, status: "pending" };
}

export function markPaid(order: PendingOrder, paymentId: PaymentId, paidAt: string): PaidOrder {
  return { ...order, status: "paid", paymentId, paidAt, version: order.version + 1 };
}

export function markShipped(order: PaidOrder, trackingCode: string): ShippedOrder {
  return { ...order, status: "shipped", trackingCode, version: order.version + 1 };
}

export function cancel(order: PendingOrder, reason: string): CancelledOrder {
  return { ...order, status: "cancelled", reason, version: order.version + 1 };
}
```

Four design decisions in this file matter beyond this shop:

- **Transitions accept exactly one starting state.** `markPaid` takes a `PendingOrder`. There is no function that takes a `PaidOrder` and returns a `PaidOrder`, so "pay again" has no way to be written. Cancelling is only possible while pending; a paid order is cancelled by refunding it, which is a different business process.
- **Lines hold a price snapshot**, `unitPrice`, not a reference to the product. If the catalogue price changes tomorrow, yesterday's order must still show what the customer agreed to pay. Deciding what an entity *copies* and what it *refers to* is a modelling decision types make visible.
- **The total is computed, not supplied.** `newOrder` calculates it from the lines, so a caller cannot create an order whose total disagrees with its lines.
- **Every transition increments `version`.** The types will not need it; the [section on time](#time) does.

## Payments: a refund needs a completed payment

A payment has its own life. It starts **initiated** (the customer was sent to the payment provider), then becomes **captured** (the money arrived) or **failed**. A captured payment can be refunded in parts; once the whole amount is refunded, it is **refunded** and nothing more can happen to it:

```ts
               capture                 refund (part)
  initiated ───────────► captured ◄──────────────┐
      │                     │  └─────────────────┘
      │ fail                │ refund (the rest)
      ▼                     ▼
    failed               refunded
```

Only a captured payment can be refunded; partial refunds keep it captured until nothing is left.

payments.ts

```ts
import { err, ok } from "./result.js";
import type { Result } from "./result.js";
import { kobo, minusKobo } from "./values.js";
import type { Kobo, OrderId, PaymentId } from "./values.js";

interface PaymentBase {
  readonly id: PaymentId;
  readonly orderId: OrderId;
  readonly amount: Kobo;
}

export interface InitiatedPayment extends PaymentBase {
  readonly status: "initiated";
}
export interface FailedPayment extends PaymentBase {
  readonly status: "failed";
  readonly reason: string;
}
export interface CapturedPayment extends PaymentBase {
  readonly status: "captured";
  readonly capturedAt: string;
  readonly refunded: Kobo;
}
export interface RefundedPayment extends PaymentBase {
  readonly status: "refunded";
  readonly capturedAt: string;
  readonly refundedAt: string;
}

export type Payment = InitiatedPayment | FailedPayment | CapturedPayment | RefundedPayment;

export function capture(payment: InitiatedPayment, capturedAt: string): CapturedPayment {
  return { ...payment, status: "captured", capturedAt, refunded: kobo(0) };
}

export function fail(payment: InitiatedPayment, reason: string): FailedPayment {
  return { ...payment, status: "failed", reason };
}

export type RefundProblem = { readonly code: "nothing-to-refund" } | { readonly code: "exceeds-remaining"; readonly remaining: Kobo };

export const remaining = (payment: CapturedPayment): Kobo => minusKobo(payment.amount, payment.refunded);

export function applyRefund(payment: CapturedPayment, amount: Kobo, at: string): Result<CapturedPayment | RefundedPayment, RefundProblem> {
  if (amount === 0) return err({ code: "nothing-to-refund" });
  const left = remaining(payment);
  if (amount > left) return err({ code: "exceeds-remaining", remaining: left });
  if (amount === left) {
    return ok({ id: payment.id, orderId: payment.orderId, amount: payment.amount, status: "refunded", capturedAt: payment.capturedAt, refundedAt: at });
  }
  return ok({ ...payment, refunded: kobo(payment.refunded + amount) });
}
```

`applyRefund` accepts only a `CapturedPayment`: an initiated, failed or already refunded payment cannot be passed in. The amount rule cannot be a type, because it depends on two runtime numbers, so it is a `Result`. And the return type is itself a union: a partial refund leaves the payment captured, a full refund makes it `RefundedPayment`. The final state builds a fresh object instead of spreading, so the `refunded` counter of a captured payment does not linger on a payment that is no longer captured.

refund-demo.ts

```ts
import { applyRefund, capture } from "./payments.js";
import { kobo, orderId, paymentId } from "./values.js";

const captured = capture({ id: paymentId("PAY-88"), orderId: orderId("ORD-1042"), amount: kobo(2020000), status: "initiated" }, "2026-09-24T10:00:00Z");

const partial = applyRefund(captured, kobo(320000), "2026-09-26T09:00:00Z");
console.log(partial.ok && partial.value.status, partial.ok && partial.value.status === "captured" && partial.value.refunded);

if (partial.ok && partial.value.status === "captured") {
  console.log(applyRefund(partial.value, kobo(2000000), "2026-09-26T09:05:00Z"));
  const rest = applyRefund(partial.value, kobo(1700000), "2026-09-26T09:10:00Z");
  console.log(rest.ok && rest.value);
}
```

Output of `npx tsx refund-demo.ts` and of the browser terminal

```ts
captured 320000
{ ok: false, error: { code: 'exceeds-remaining', remaining: 1700000 } }
{
  id: 'PAY-88',
  orderId: 'ORD-1042',
  amount: 2020000,
  status: 'refunded',
  capturedAt: '2026-09-24T10:00:00Z',
  refundedAt: '2026-09-26T09:10:00Z'
}
```

## Users, roles and permissions as proof

The naive `refund` took a `byUserId: string` and trusted the caller to have checked permissions. Nothing forced that check to happen. A stronger design makes the check produce a value that the operation *requires*. Such a value is a **capability**, or here a **permit**: proof, in the type, that a particular permission was granted to a particular user.

Roles and their permissions are one table, as in [Advanced inference](https://zudojs.oyinlola.site/learn/ts-inference-deep): `as const` keeps the literals and `satisfies` checks the shape. A **role** is a named set of permissions; a **permission** is the right to perform one operation.

users.ts

```ts
import { err, ok } from "./result.js";
import type { Result } from "./result.js";
import type { UserId } from "./values.js";

export const ROLE_PERMISSIONS = {
  customer: ["order:place", "order:pay"],
  warehouse: ["order:ship"],
  finance: ["payment:refund"],
  admin: ["order:place", "order:pay", "order:ship", "payment:refund"],
} as const satisfies Record<string, readonly string[]>;

export type Role = keyof typeof ROLE_PERMISSIONS;
export type Permission = (typeof ROLE_PERMISSIONS)[Role][number];

export interface User {
  readonly id: UserId;
  readonly name: string;
  readonly roles: readonly Role[];
}

declare const permitBrand: unique symbol;

export interface Permit<P extends Permission> {
  readonly by: UserId;
  readonly permission: P;
  readonly [permitBrand]: P;
}

export type Forbidden = { readonly code: "forbidden"; readonly user: UserId; readonly permission: Permission };

export function authorize<P extends Permission>(user: User, permission: P): Result<Permit<P>, Forbidden> {
  const granted = user.roles.some((role) => (ROLE_PERMISSIONS[role] as readonly Permission[]).includes(permission));
  if (!granted) return err({ code: "forbidden", user: user.id, permission });
  return ok(Object.freeze({ by: user.id, permission }) as Permit<P>);
}
```

- `Permission` is derived from the table: `"order:place" | "order:pay" | "order:ship" | "payment:refund"`. A typo in a permission name anywhere in the code is a compile error.
- `Permit<P>` carries a brand keyed by a symbol that is not exported, so no other module can build one. The *only* way to get a `Permit<"payment:refund">` is to call `authorize` with a user who has that permission.
- The brand's type is `P` itself, so a `Permit<"order:pay">` is not a `Permit<"payment:refund">`. A permit for one operation cannot be reused for another.
- The permit records *who* was authorized (`by`), so every operation that takes one knows its actor without a separate, forgeable user id parameter.

authorize-demo.ts

```ts
import { authorize } from "./users.js";
import type { User } from "./users.js";
import { userId } from "./values.js";

const ada: User = { id: userId("USR-1"), name: "Ada", roles: ["customer"] };
const ngozi: User = { id: userId("USR-3"), name: "Ngozi", roles: ["finance"] };

const attempts = [authorize(ada, "payment:refund"), authorize(ngozi, "payment:refund"), authorize(ngozi, "order:ship")];
for (const attempt of attempts) console.log(attempt.ok ? `granted ${attempt.value.permission} to ${attempt.value.by}` : attempt.error);
```

Output of `npx tsx authorize-demo.ts` and of the browser terminal

```json
{ code: 'forbidden', user: 'USR-1', permission: 'payment:refund' }
granted payment:refund to USR-3
{ code: 'forbidden', user: 'USR-3', permission: 'order:ship' }
```

Role-based permissions answer "may this kind of user do this kind of thing?". They do not answer "may Ada pay *this* order?", which depends on the order's data. That second check, about a specific resource, stays a runtime comparison inside the use case. [Permissions](https://zudojs.oyinlola.site/learn/zudo-permissions) shows how `@zudojs/permissions` handles both kinds of rule in a real application.

## Events and transactions

### Domain events

A **domain event** is a record that something meaningful happened: an order was placed, a payment was refunded. Other parts of the system react to events (send an SMS, update a report) without the order code knowing about them. The events are a discriminated union, and `EventOf` picks one member by its `type` with `Extract`:

events.ts

```ts
import type { Kobo, OrderId, PaymentId, UserId } from "./values.js";

export type DomainEvent =
  | { readonly type: "order.placed"; readonly orderId: OrderId; readonly customer: UserId; readonly total: Kobo }
  | { readonly type: "order.paid"; readonly orderId: OrderId; readonly paymentId: PaymentId; readonly amount: Kobo }
  | { readonly type: "order.shipped"; readonly orderId: OrderId; readonly trackingCode: string }
  | { readonly type: "payment.refunded"; readonly paymentId: PaymentId; readonly amount: Kobo; readonly by: UserId };

export type EventType = DomainEvent["type"];
export type EventOf<T extends EventType> = Extract<DomainEvent, { readonly type: T }>;

export function describe(event: DomainEvent): string {
  switch (event.type) {
    case "order.placed":
      return `${event.orderId} placed by ${event.customer} for ${event.total} kobo`;
    case "order.paid":
      return `${event.orderId} paid with ${event.paymentId}`;
    case "order.shipped":
      return `${event.orderId} shipped, tracking ${event.trackingCode}`;
    case "payment.refunded":
      return `${event.amount} kobo refunded on ${event.paymentId} by ${event.by}`;
  }
}
```

Every event carries branded ids and amounts, so a consumer cannot mistake the payment id for the order id either. [A type-safe event system](https://zudojs.oyinlola.site/learn/ts-typed-events), the next lesson, builds the bus that delivers these events.

### Ledger transactions

Every movement of money is recorded in a **double-entry ledger**: each **transaction** has entries on at least two accounts, and the total of the debits must equal the total of the credits, so money is never created or lost in the books. When a customer pays, the bank account is debited (it received money) and the sales account is credited. A refund reverses the flow through a refunds account.

"Debits equal credits" is an invariant over a *list* of numbers. No type can add up a list, so this is the job of a smart constructor. The brand `"Balanced"` means "this passed the check":

ledger.ts

```ts
import type { Brand } from "./brand.js";
import type { Kobo, NonEmpty } from "./values.js";

export type LedgerAccount = "bank" | "sales" | "refunds";

export interface LedgerEntry {
  readonly account: LedgerAccount;
  readonly side: "debit" | "credit";
  readonly amount: Kobo;
}

export type Transaction = Brand<{ readonly memo: string; readonly entries: NonEmpty<LedgerEntry> }, "Balanced">;

export function transaction(memo: string, entries: NonEmpty<LedgerEntry>): Transaction {
  const total = (side: LedgerEntry["side"]) => entries.filter((e) => e.side === side).reduce((sum, e) => sum + e.amount, 0);
  const debits = total("debit");
  const credits = total("credit");
  if (debits !== credits) throw new RangeError(`unbalanced transaction "${memo}": debits ${debits}, credits ${credits}`);
  return Object.freeze({ memo, entries }) as Transaction;
}
```

ledger-demo.ts

```ts
import { transaction } from "./ledger.js";
import { kobo } from "./values.js";

const sale = transaction("payment PAY-88", [
  { account: "bank", side: "debit", amount: kobo(2020000) },
  { account: "sales", side: "credit", amount: kobo(2020000) },
]);
console.log(sale.memo, sale.entries.length, Object.isFrozen(sale));

try {
  transaction("typo in the amount", [
    { account: "bank", side: "debit", amount: kobo(2020000) },
    { account: "sales", side: "credit", amount: kobo(202000) },
  ]);
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx ledger-demo.ts` and of the browser terminal

```ts
payment PAY-88 2 true
RangeError: unbalanced transaction "typo in the amount": debits 2020000, credits 202000
```

A function that accepts a `Transaction` can post it to the books without re-checking: an unbalanced list of entries can never become one. Throwing is right here, not a `Result`: the entries are produced by our own code, so an unbalanced transaction is a bug, not a user mistake.

## Use cases: signatures that read like rules

A **use case** is one operation the business performs, such as "pay an order". Each use case takes a permit, the entities in the states it requires, and returns the new states, the events and the ledger transaction together. The signatures alone state most of the rules:

commerce.ts

```ts
import type { EventOf } from "./events.js";
import { transaction } from "./ledger.js";
import type { Transaction } from "./ledger.js";
import { markPaid, markShipped, newOrder } from "./orders.js";
import type { OrderLine, PaidOrder, PendingOrder, ShippedOrder } from "./orders.js";
import { applyRefund } from "./payments.js";
import type { CapturedPayment, RefundProblem, RefundedPayment } from "./payments.js";
import { err, ok } from "./result.js";
import type { Result } from "./result.js";
import type { Permit } from "./users.js";
import type { Kobo, NonEmpty, OrderId } from "./values.js";

export function placeOrder(permit: Permit<"order:place">, id: OrderId, lines: NonEmpty<OrderLine>) {
  const order = newOrder(id, permit.by, lines);
  const placed: EventOf<"order.placed"> = { type: "order.placed", orderId: id, customer: permit.by, total: order.total };
  return { order, events: [placed] as const };
}

export type PayProblem =
  | { readonly code: "not-your-order" }
  | { readonly code: "payment-for-another-order"; readonly paymentOrder: OrderId }
  | { readonly code: "wrong-amount"; readonly expected: Kobo; readonly captured: Kobo };

export interface Paid {
  readonly order: PaidOrder;
  readonly events: readonly [EventOf<"order.paid">];
  readonly transaction: Transaction;
}

export function payOrder(permit: Permit<"order:pay">, order: PendingOrder, payment: CapturedPayment): Result<Paid, PayProblem> {
  if (permit.by !== order.customer) return err({ code: "not-your-order" });
  if (payment.orderId !== order.id) return err({ code: "payment-for-another-order", paymentOrder: payment.orderId });
  if (payment.amount !== order.total) return err({ code: "wrong-amount", expected: order.total, captured: payment.amount });
  return ok({
    order: markPaid(order, payment.id, payment.capturedAt),
    events: [{ type: "order.paid", orderId: order.id, paymentId: payment.id, amount: payment.amount }],
    transaction: transaction(`payment ${payment.id} for ${order.id}`, [
      { account: "bank", side: "debit", amount: payment.amount },
      { account: "sales", side: "credit", amount: payment.amount },
    ]),
  });
}

export function shipOrder(permit: Permit<"order:ship">, order: PaidOrder, trackingCode: string) {
  const shipped: ShippedOrder = markShipped(order, trackingCode);
  const event: EventOf<"order.shipped"> = { type: "order.shipped", orderId: order.id, trackingCode };
  return { order: shipped, events: [event] as const, shippedBy: permit.by };
}

export interface Refunded {
  readonly payment: CapturedPayment | RefundedPayment;
  readonly events: readonly [EventOf<"payment.refunded">];
  readonly transaction: Transaction;
}

export function refundPayment(permit: Permit<"payment:refund">, payment: CapturedPayment, amount: Kobo, at: string): Result<Refunded, RefundProblem> {
  const applied = applyRefund(payment, amount, at);
  if (!applied.ok) return applied;
  return ok({
    payment: applied.value,
    events: [{ type: "payment.refunded", paymentId: payment.id, amount, by: permit.by }],
    transaction: transaction(`refund on ${payment.id}`, [
      { account: "refunds", side: "debit", amount },
      { account: "bank", side: "credit", amount },
    ]),
  });
}
```

Read `refundPayment`'s parameter list aloud: "given proof that someone may refund, a captured payment and an amount of kobo". The customer who refunded their own uncaptured payment in the opening example would need a `Permit<"payment:refund">` (they cannot get one) and a `CapturedPayment` (they do not have one). The use cases are pure, like the pricing core in Functional TypeScript: they return new states, events and transactions, and a thin shell saves them.

## What the compiler rejects

Here is every illegal move on orders from the opening, written against the new model. `declare const` stands in for values that other code would produce:

illegal-orders.ts

```ts
import { payOrder, placeOrder, shipOrder } from "./commerce.js";
import type { PaidOrder, PendingOrder } from "./orders.js";
import type { CapturedPayment } from "./payments.js";
import type { Permit } from "./users.js";
import { orderId } from "./values.js";

declare const placePermit: Permit<"order:place">;
declare const payPermit: Permit<"order:pay">;
declare const shipPermit: Permit<"order:ship">;
declare const pending: PendingOrder;
declare const paid: PaidOrder;
declare const payment: CapturedPayment;

payOrder(payPermit, paid, payment);
shipOrder(shipPermit, pending, "GIG-1");
placeOrder(placePermit, orderId("ORD-7"), []);
const paidWithoutPayment: PaidOrder = { ...pending, status: "paid" };
```

What `npx tsc --noEmit` prints

```ts
illegal-orders.ts:14:21 - error TS2345: Argument of type 'PaidOrder' is not assignable to parameter of type 'PendingOrder'.
  Types of property 'status' are incompatible.
    Type '"paid"' is not assignable to type '"pending"'.

14 payOrder(payPermit, paid, payment);
                       ~~~~

illegal-orders.ts:15:23 - error TS2739: Type 'PendingOrder' is missing the following properties from type 'PaidOrder': paymentId, paidAt

15 shipOrder(shipPermit, pending, "GIG-1");
                         ~~~~~~~

illegal-orders.ts:16:43 - error TS2345: Argument of type '[]' is not assignable to parameter of type 'NonEmpty<OrderLine>'.
  Source has 0 element(s) but target requires 1.

16 placeOrder(placePermit, orderId("ORD-7"), []);
                                             ~~

illegal-orders.ts:17:7 - error TS2739: Type '{ id: OrderId; customer: UserId; lines: NonEmpty<OrderLine>; total: Kobo; version: number; status: "paid"; }' is missing the following properties from type 'PaidOrder': paymentId, paidAt

17 const paidWithoutPayment: PaidOrder = { ...pending, status: "paid" };
         ~~~~~~~~~~~~~~~~~~


Found 4 errors in the same file, starting at: illegal-orders.ts:14
```

Paying a paid order, shipping an unpaid one, placing an order with no lines and faking a paid order without payment details: four errors, each naming exactly what is wrong. The payments side:

illegal-payments.ts

```ts
import { refundPayment } from "./commerce.js";
import type { CapturedPayment, FailedPayment, InitiatedPayment } from "./payments.js";
import type { Permit } from "./users.js";
import { kobo, userId } from "./values.js";

declare const refundPermit: Permit<"payment:refund">;
declare const payPermit: Permit<"order:pay">;
declare const initiated: InitiatedPayment;
declare const failed: FailedPayment;
declare const captured: CapturedPayment;

refundPayment(refundPermit, initiated, kobo(100000), "2026-09-26T09:00:00Z");
refundPayment(refundPermit, failed, kobo(100000), "2026-09-26T09:00:00Z");
refundPayment(payPermit, captured, kobo(100000), "2026-09-26T09:00:00Z");
refundPayment({ by: userId("USR-1"), permission: "payment:refund" }, captured, kobo(100000), "2026-09-26T09:00:00Z");
```

What `npx tsc --noEmit` prints

```ts
illegal-payments.ts:12:29 - error TS2739: Type 'InitiatedPayment' is missing the following properties from type 'CapturedPayment': capturedAt, refunded

12 refundPayment(refundPermit, initiated, kobo(100000), "2026-09-26T09:00:00Z");
                               ~~~~~~~~~

illegal-payments.ts:13:29 - error TS2739: Type 'FailedPayment' is missing the following properties from type 'CapturedPayment': capturedAt, refunded

13 refundPayment(refundPermit, failed, kobo(100000), "2026-09-26T09:00:00Z");
                               ~~~~~~

illegal-payments.ts:14:15 - error TS2345: Argument of type 'Permit<"order:pay">' is not assignable to parameter of type 'Permit<"payment:refund">'.
  Type '"order:pay"' is not assignable to type '"payment:refund"'.

14 refundPayment(payPermit, captured, kobo(100000), "2026-09-26T09:00:00Z");
                 ~~~~~~~~~

illegal-payments.ts:15:15 - error TS2741: Property '[permitBrand]' is missing in type '{ by: UserId; permission: "payment:refund"; }' but required in type 'Permit<"payment:refund">'.

15 refundPayment({ by: userId("USR-1"), permission: "payment:refund" }, captured, kobo(100000), "2026-09-26T09:00:00Z");
                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  users.ts:26:12 - '[permitBrand]' is declared here.
    26   readonly [permitBrand]: P;
                  ~~~~~~~~~~~~~


Found 4 errors in the same file, starting at: illegal-payments.ts:12
```

Refunding a payment that was only initiated, or one that failed, does not compile. Neither does using a permit for paying as a permit for refunding, or building a permit by hand: the object literal has the right visible fields, but not the brand that only `authorize` can attach. Every one of these compiled in the naive model.

## What types cannot see: time

The table in the reasoning step said "only once" is not a job for types. Here is why. Two payment confirmations for the same order arrive at the same moment (the provider retried a webhook, or the customer double-clicked). Both requests load the order while it is still pending. Each holds its own `PendingOrder`, and each is perfectly entitled, by the types, to pay it:

```ts
  request A: load ORD-1042 (pending, v1) ── payOrder ── save paid v2  ✔
  request B: load ORD-1042 (pending, v1) ─────── payOrder ─── save paid v2  ✘ stale: store has v2
```

Both requests pass the type check; only the save can see that another request got there first.

A type describes a value, not the world at the moment you use it. TypeScript cannot know that the `PendingOrder` in your hand became outdated a millisecond ago in another request, and it has no way to say "this value may be used once". So the rule moves to the place that sees every request: the store. Each saved order carries a `version`, every transition increments it, and a save succeeds only if the stored version is the one the change started from. This is **optimistic concurrency control**:

store.ts

```ts
import { err, ok } from "./result.js";
import type { Result } from "./result.js";

export type Stale = { readonly code: "stale"; readonly id: string; readonly expected: number; readonly found: number };

export class VersionedStore<T extends { readonly id: string; readonly version: number }> {
  readonly #rows = new Map<string, T>();

  get(id: string): T | undefined {
    return this.#rows.get(id);
  }

  save(next: T): Result<T, Stale> {
    const found = this.#rows.get(next.id)?.version ?? 0;
    if (found !== next.version - 1) return err({ code: "stale", id: next.id, expected: next.version - 1, found });
    this.#rows.set(next.id, next);
    return ok(next);
  }
}
```

race.ts

```ts
import { payOrder, placeOrder } from "./commerce.js";
import type { Order } from "./orders.js";
import { capture } from "./payments.js";
import type { Result } from "./result.js";
import { VersionedStore } from "./store.js";
import { authorize } from "./users.js";
import { kobo, orderId, paymentId, productId, quantity, userId } from "./values.js";

function must<T, E>(result: Result<T, E>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

const ada = { id: userId("USR-1"), name: "Ada", roles: ["customer"] } as const;
const orders = new VersionedStore<Order>();
const { order } = placeOrder(must(authorize(ada, "order:place")), orderId("ORD-1042"), [
  { productId: productId("PRD-1"), name: "Rice 5kg", unitPrice: kobo(850000), quantity: quantity(2) },
]);
must(orders.save(order));

const payment = capture({ id: paymentId("PAY-88"), orderId: order.id, amount: order.total, status: "initiated" }, "2026-09-24T10:00:00Z");
const requestA = orders.get("ORD-1042");
const requestB = orders.get("ORD-1042");

for (const [name, loaded] of [["A", requestA], ["B", requestB]] as const) {
  if (loaded?.status !== "pending") continue;
  const paid = must(payOrder(must(authorize(ada, "order:pay")), loaded, payment));
  const saved = orders.save(paid.order);
  console.log(`request ${name}:`, saved.ok ? `saved version ${saved.value.version}` : saved.error);
}
```

Output of `npx tsx race.ts` and of the browser terminal

```ts
request A: saved version 2
request B: { code: 'stale', id: 'ORD-1042', expected: 1, found: 2 }
```

Request B's `payOrder` call type-checked and even succeeded as a pure function; the store refused its result. In a real database the same check is one condition on the update, `UPDATE orders SET … WHERE id = $1 AND version = $2`, followed by a check that one row changed. A unique index on the payment's order id adds a second line of defence. [Transactions, isolation and locks](https://zudojs.oyinlola.site/learn/db-transactions) covers locks, isolation levels and optimistic concurrency with PostgreSQL.

Time is not the only thing outside the types. Whether a product is still in stock involves another entity that other requests change; whether an id exists involves the database. The model's job is to make those checks *unavoidable* (a use case that needs stock takes a reservation value produced by the stock check), not to pretend the type system can do them.

## Build: the whole checkout, end to end

Everything together: Ada (a customer) places and pays an order, a duplicate confirmation is refused, Ada tries to refund and is refused, Bola (warehouse) ships, and Ngozi (finance) refunds the palm oil, then tries to refund more than is left. The shell collects every event and ledger transaction:

main.ts

```ts
import { payOrder, placeOrder, refundPayment, shipOrder } from "./commerce.js";
import { describe } from "./events.js";
import type { DomainEvent } from "./events.js";
import type { Transaction } from "./ledger.js";
import type { Order } from "./orders.js";
import { capture } from "./payments.js";
import type { Result } from "./result.js";
import { VersionedStore } from "./store.js";
import { authorize } from "./users.js";
import type { User } from "./users.js";
import { kobo, orderId, paymentId, productId, quantity, userId } from "./values.js";

function must<T, E>(result: Result<T, E>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

const ada: User = { id: userId("USR-1"), name: "Ada", roles: ["customer"] };
const bola: User = { id: userId("USR-2"), name: "Bola", roles: ["warehouse"] };
const ngozi: User = { id: userId("USR-3"), name: "Ngozi", roles: ["finance"] };

const orders = new VersionedStore<Order>();
const events: DomainEvent[] = [];
const ledger: Transaction[] = [];

const placed = placeOrder(must(authorize(ada, "order:place")), orderId("ORD-1042"), [
  { productId: productId("PRD-1"), name: "Rice 5kg", unitPrice: kobo(850000), quantity: quantity(2) },
  { productId: productId("PRD-2"), name: "Palm oil 1L", unitPrice: kobo(320000), quantity: quantity(1) },
]);
must(orders.save(placed.order));
events.push(...placed.events);

const payment = capture({ id: paymentId("PAY-88"), orderId: placed.order.id, amount: placed.order.total, status: "initiated" }, "2026-09-24T10:00:00Z");

for (const attempt of ["first", "duplicate"]) {
  const loaded = orders.get("ORD-1042");
  if (loaded?.status !== "pending") {
    console.log(`${attempt} confirmation: order is already ${loaded?.status}`);
    continue;
  }
  const paid = must(payOrder(must(authorize(ada, "order:pay")), loaded, payment));
  must(orders.save(paid.order));
  events.push(...paid.events);
  ledger.push(paid.transaction);
  console.log(`${attempt} confirmation: paid`);
}

const adaRefund = authorize(ada, "payment:refund");
console.log("Ada tries to refund:", adaRefund.ok ? "allowed" : adaRefund.error.code);

const current = orders.get("ORD-1042");
if (current?.status === "paid") {
  const shipped = shipOrder(must(authorize(bola, "order:ship")), current, "GIG-55120");
  must(orders.save(shipped.order));
  events.push(...shipped.events);
}

const refunder = must(authorize(ngozi, "payment:refund"));
const oil = must(refundPayment(refunder, payment, kobo(320000), "2026-09-26T09:00:00Z"));
events.push(...oil.events);
ledger.push(oil.transaction);
if (oil.payment.status === "captured") {
  const tooMuch = refundPayment(refunder, oil.payment, kobo(2000000), "2026-09-26T09:05:00Z");
  console.log("second refund:", tooMuch.ok ? "done" : tooMuch.error);
}

for (const event of events) console.log("event:", describe(event));

const balance = (account: string): number =>
  ledger.flatMap((t) => t.entries).filter((e) => e.account === account).reduce((sum, e) => sum + (e.side === "debit" ? e.amount : -e.amount), 0);
console.log("bank:", balance("bank"), "sales:", balance("sales"), "refunds:", balance("refunds"));
console.log("order", orders.get("ORD-1042")?.status, "at version", orders.get("ORD-1042")?.version);
```

Output of `npx tsx main.ts` and of the browser terminal

```ts
first confirmation: paid
duplicate confirmation: order is already paid
Ada tries to refund: forbidden
second refund: { code: 'exceeds-remaining', remaining: 1700000 }
event: ORD-1042 placed by USR-1 for 2020000 kobo
event: ORD-1042 paid with PAY-88
event: ORD-1042 shipped, tracking GIG-55120
event: 320000 kobo refunded on PAY-88 by USR-3
bank: 1700000 sales: -2020000 refunds: 320000
order shipped at version 3
```

This time the duplicate confirmation was caught by reading the current state, the everyday case; `race.ts` showed the rarer case where both requests read before either wrote, which only the version check catches. The ledger balances by construction: the bank holds ₦17,000 (₦20,200 in, ₦3,200 out), sales show ₦20,200 earned and refunds ₦3,200 given back, and the three balances sum to zero.

### Testing the model

Test the runtime rules with plain calls, and pin the illegal states with type tests inside a function that never runs, as in the previous lessons:

domain.test.ts

```ts
import { payOrder, placeOrder, refundPayment } from "./commerce.js";
import { transaction } from "./ledger.js";
import type { PaidOrder, PendingOrder } from "./orders.js";
import { capture } from "./payments.js";
import type { CapturedPayment, FailedPayment } from "./payments.js";
import { authorize } from "./users.js";
import type { Permit } from "./users.js";
import { kobo, orderId, paymentId, productId, quantity, userId } from "./values.js";

function check(label: string, actual: unknown, expected: unknown): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${same ? "PASS" : "FAIL"} ${label} -> ${JSON.stringify(actual)}`);
}
const attempt = (run: () => unknown): string => {
  try {
    return String(run());
  } catch (error) {
    return error instanceof Error ? error.name : "unknown";
  }
};

const ada = { id: userId("USR-1"), name: "Ada", roles: ["customer"] } as const;
const bayo = { id: userId("USR-9"), name: "Bayo", roles: ["customer"] } as const;
const admin = { id: userId("USR-5"), name: "Kemi", roles: ["admin"] } as const;
const place = authorize(ada, "order:place");
const bayoPays = authorize(bayo, "order:pay");
const adminRefunds = authorize(admin, "payment:refund");
if (!place.ok || !bayoPays.ok || !adminRefunds.ok) throw new Error("fixture");

const { order } = placeOrder(place.value, orderId("ORD-1"), [{ productId: productId("PRD-1"), name: "Salt", unitPrice: kobo(20000), quantity: quantity(3) }]);
const payment = capture({ id: paymentId("PAY-1"), orderId: order.id, amount: order.total, status: "initiated" }, "2026-09-24T10:00:00Z");

check("total from lines", order.total, 60000);
check("only the customer pays", payOrder(bayoPays.value, order, payment), { ok: false, error: { code: "not-your-order" } });
check("admin may refund", refundPayment(adminRefunds.value, payment, kobo(60000), "2026-09-25T10:00:00Z").ok, true);
check("full refund ends the payment", (() => { const r = refundPayment(adminRefunds.value, payment, kobo(60000), "t"); return r.ok && r.value.payment.status; })(), "refunded");
check("quantity 0 refused", attempt(() => quantity(0)), "RangeError");
check("unbalanced refused", attempt(() => transaction("x", [{ account: "bank", side: "debit", amount: kobo(1) }])), "RangeError");

function illegalStates(pending: PendingOrder, paid: PaidOrder, failed: FailedPayment, captured: CapturedPayment, pay: Permit<"order:pay">, placing: Permit<"order:place">): void {
  // @ts-expect-error: a paid order cannot be paid again
  payOrder(pay, paid, captured);
  // @ts-expect-error: a failed payment cannot be refunded
  refundPayment(pay, failed, kobo(1), "t");
  // @ts-expect-error: an order needs at least one line
  placeOrder(placing, orderId("ORD-2"), []);
  console.log(pending.status);
}
console.log("type tests compiled:", illegalStates.length === 6);
```

Output of `npx tsx domain.test.ts` and of the browser terminal

```ts
PASS total from lines -> 60000
PASS only the customer pays -> {"ok":false,"error":{"code":"not-your-order"}}
PASS admin may refund -> true
PASS full refund ends the payment -> "refunded"
PASS quantity 0 refused -> "RangeError"
PASS unbalanced refused -> "RangeError"
type tests compiled: true
```

Look closely at the second `@ts-expect-error`: it passes a pay permit *and* a failed payment, two mistakes on one line. The directive is satisfied by either error, so if a refactor made failed payments refundable, this test would still pass, silently. Keep one mistake per expected error; exercise 2 asks you to fix this test.

## Domain models in production

- **Persist states the way you model them.** Store a `status` column and the state-specific columns (`payment_id`, `paid_at`, `tracking_code`), and add database `CHECK` constraints that mirror the union, such as "`status = 'paid'` implies `payment_id IS NOT NULL`". Then even a bad script or migration cannot write an illegal row. [Modelling data for a shop](https://zudojs.oyinlola.site/learn/db-modeling) covers constraints.
- **Parse rows back into the union.** A row is a flat bag of nullable columns. The repository turns it into a `PendingOrder`, `PaidOrder` or … with the same kind of smart constructors as for requests, and reports a corrupt row loudly instead of producing a half-valid order (exercise 3).
- **Keep DTOs separate.** The JSON your API returns is a public contract; the domain types are internal and change with the business. Map between them at the edge ([Type-safe API layers](https://zudojs.oyinlola.site/learn/ts-api-layers)).
- **Version your events.** Once an event has been published, consumers depend on its shape. Add fields; do not rename or remove them; introduce `order.paid.v2` when the meaning changes.
- **Do not model everything.** Illegal-state modelling pays off where mistakes cost money or trust: orders, payments, permissions, ledgers. A product description or a newsletter preference does not need five interfaces.
- **Keep the domain pure.** The use cases above never read a clock, a database or an environment variable. Timestamps, ids and permits come in as arguments, so the same functions run in tests, in a request handler and in a queue worker.

## Practice

TRY IT YOURSELF

### Add a delivered state

Orders can now be confirmed as delivered. Add a `DeliveredOrder` state (from `ShippedOrder` only, with `deliveredAt` and `receivedBy`) and a `markDelivered` transition, in a new file of the shop project. Show that delivering a paid (not shipped) order does not compile, and that a shipped order can be delivered.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

A transition should accept exactly one starting state, the same rule `markShipped` and `markPaid` already follow. `markDelivered`'s parameter type is currently a union of two states.

HINT 2

Change the parameter type from `PaidOrder | ShippedOrder` to `ShippedOrder` alone. The cast can go too, once every field the interface promises really is on the spread `order`.

SOLUTION

delivered.ts

```ts
import { markPaid, markShipped, newOrder } from "./orders.js";
import type { ShippedOrder } from "./orders.js";
import { kobo, orderId, paymentId, productId, quantity, userId } from "./values.js";

export interface DeliveredOrder extends Omit<ShippedOrder, "status"> {
  readonly status: "delivered";
  readonly deliveredAt: string;
  readonly receivedBy: string;
}

export function markDelivered(order: ShippedOrder, deliveredAt: string, receivedBy: string): DeliveredOrder {
  return { ...order, status: "delivered", deliveredAt, receivedBy, version: order.version + 1 };
}

const pending = newOrder(orderId("ORD-5"), userId("USR-1"), [{ productId: productId("PRD-1"), name: "Salt", unitPrice: kobo(20000), quantity: quantity(1) }]);
const paid = markPaid(pending, paymentId("PAY-5"), "2026-09-24T10:00:00Z");

markDelivered(paid, "2026-09-27T15:00:00Z", "Ada");
const delivered = markDelivered(markShipped(paid, "GIG-7"), "2026-09-27T15:00:00Z", "Ada");
console.log(delivered.status, delivered.trackingCode, delivered.version);
```

What `npx tsc --noEmit` prints

```ts
delivered.ts:18:15 - error TS2741: Property 'trackingCode' is missing in type 'PaidOrder' but required in type 'ShippedOrder'.

18 markDelivered(paid, "2026-09-27T15:00:00Z", "Ada");
                 ~~~~

  orders.ts:31:12 - 'trackingCode' is declared here.
    31   readonly trackingCode: string;
                  ~~~~~~~~~~~~


Found 1 error in delivered.ts:18
```

`Omit<ShippedOrder, "status">` keeps every field of a shipped order (payment, tracking code) and replaces the discriminant. In the real model you would also add `DeliveredOrder` to the `Order` union and an `order.delivered` event; the compiler would then point at `describe`, whose switch no longer covers every event. Remove the illegal line and the file prints `delivered GIG-7 4`.

TRY IT YOURSELF

### One mistake per expected error

Fix the second type test in `domain.test.ts` so that it fails if failed payments ever become refundable. Why does the original version not do that?

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`refundPayment`'s first parameter is `Permit<"payment:refund">`. Give `refund` that exact type, instead of `Permit<"order:pay">`.

HINT 2

`function failedCannotBeRefunded(refund: Permit<"payment:refund">, failed: FailedPayment): void` — now the only thing wrong with the call is `failed`, so the directive can only be satisfied by that mistake.

SOLUTION

better-type-test.ts

```ts
import { refundPayment } from "./commerce.js";
import type { FailedPayment } from "./payments.js";
import type { Permit } from "./users.js";
import { kobo } from "./values.js";

function failedCannotBeRefunded(refund: Permit<"payment:refund">, failed: FailedPayment): void {
  // @ts-expect-error: a failed payment cannot be refunded
  refundPayment(refund, failed, kobo(1), "2026-09-26T09:00:00Z");
}

console.log("compiles only while failed payments are refused:", failedCannotBeRefunded.length);
```

Output of `npx tsx better-type-test.ts` and of the browser terminal

```ts
compiles only while failed payments are refused: 2
```

`@ts-expect-error` only checks that *some* error occurs on the next line. The original line had two (the wrong permit and the failed payment), so removing either one left the directive satisfied. With the right permit, the only remaining error is the one under test.

TRY IT YOURSELF

### Parse a database row

Orders come back from the database as flat rows: `{ id, customer_id, status, total_kobo, version, payment_id, paid_at, tracking_code, cancel_reason }`, where the state-specific columns may be `null`. Write `parsePaymentState(row)` that returns a `Result` with the order's status and its state-specific fields for the four states, and an error naming the problem for a corrupt row (a paid order with no payment id, or an unknown status). Leave the lines out to keep it short.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Switch on `row.status`. For `"paid"` and `"shipped"`, check `row.payment_id === null || row.paid_at === null` first, before building the value; a helper like `const bad = (problem: string) => ({ ok: false, error: \`${row.id}: ${problem}\` })` keeps the messages short.

HINT 2

An unrecognised `row.status` (like the typo `"shiped"`) falls through to a `default` case: `bad(\`unknown status ${JSON.stringify(row.status)}\`)`.

SOLUTION

rows.ts

```ts
type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

interface OrderRow {
  readonly id: string;
  readonly status: string;
  readonly payment_id: string | null;
  readonly paid_at: string | null;
  readonly tracking_code: string | null;
  readonly cancel_reason: string | null;
}

type OrderState =
  | { readonly status: "pending" }
  | { readonly status: "paid"; readonly paymentId: string; readonly paidAt: string }
  | { readonly status: "shipped"; readonly paymentId: string; readonly paidAt: string; readonly trackingCode: string }
  | { readonly status: "cancelled"; readonly reason: string };

function parsePaymentState(row: OrderRow): Result<OrderState, string> {
  const bad = (problem: string): Result<never, string> => ({ ok: false, error: `${row.id}: ${problem}` });
  switch (row.status) {
    case "pending":
      return { ok: true, value: { status: "pending" } };
    case "paid":
    case "shipped": {
      if (row.payment_id === null || row.paid_at === null) return bad(`${row.status} without payment details`);
      if (row.status === "paid") return { ok: true, value: { status: "paid", paymentId: row.payment_id, paidAt: row.paid_at } };
      if (row.tracking_code === null) return bad("shipped without a tracking code");
      return { ok: true, value: { status: "shipped", paymentId: row.payment_id, paidAt: row.paid_at, trackingCode: row.tracking_code } };
    }
    case "cancelled":
      return row.cancel_reason === null ? bad("cancelled without a reason") : { ok: true, value: { status: "cancelled", reason: row.cancel_reason } };
    default:
      return bad(`unknown status ${JSON.stringify(row.status)}`);
  }
}

const empty = { payment_id: null, paid_at: null, tracking_code: null, cancel_reason: null };
const rows: OrderRow[] = [
  { ...empty, id: "ORD-1", status: "pending" },
  { ...empty, id: "ORD-2", status: "paid", payment_id: "PAY-88", paid_at: "2026-09-24T10:00:00Z" },
  { ...empty, id: "ORD-3", status: "paid" },
  { ...empty, id: "ORD-4", status: "shiped", payment_id: "PAY-90", paid_at: "2026-09-24T11:00:00Z" },
];
for (const row of rows) {
  const parsed = parsePaymentState(row);
  console.log(parsed.ok ? parsed.value : parsed.error);
}
```

Output of `npx tsx rows.ts` and of the browser terminal

```json
{ status: 'pending' }
{ status: 'paid', paymentId: 'PAY-88', paidAt: '2026-09-24T10:00:00Z' }
ORD-3: paid without payment details
ORD-4: unknown status "shiped"
```

The row type is honest about what the database can hold (any string, any `null`), and the parser is the only place that turns it into the precise union. The typo `"shiped"` from the opening example, had it ever reached the database, is now reported instead of producing an order that no `switch` handles. A `CHECK` constraint on the table would have refused it in the first place.

## Recap

- Write the invariants down first. Types enforce which kinds of things may meet; smart constructors enforce facts about one value; runtime checks enforce facts about several values; the database enforces facts about time and other requests.
- Model each entity as one interface per state, with only that state's data, and transitions that accept exactly the states they may start from. There is then no function that pays a paid order or refunds an uncaptured payment.
- Use brands for ids, amounts and quantities, `NonEmpty` tuples for collections that must have items, price snapshots for data that must not change later, and computed totals instead of supplied ones.
- Require proof of authorization with an unforgeable `Permit<P>` that only `authorize` can create, and keep ownership checks at runtime.
- Return domain events and balanced ledger transactions from use cases, so they cannot be forgotten, and let a smart constructor guard "debits equal credits".
- Types cannot see time: two requests may hold the same pending order. Refuse stale writes with a version check, and persist and parse states so the database and the types agree.

Next: [A type-safe event system](https://zudojs.oyinlola.site/learn/ts-typed-events), which delivers events like these to the code that reacts to them.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
