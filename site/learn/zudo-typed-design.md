---
title: "Type-safe application design — ZudoJS Academy"
description: "Design a billing module for the Task API where ids, money, states, DTOs, commands, queries, events, errors, config and DI are all checked by TypeScript."
source: https://zudojs.oyinlola.site/learn/zudo-typed-design
---

LEVEL 13 · LESSON 12 OF 12

Type-safe application design Core

# Type-safe application design

Design a billing module for the Task API where ids, money, states, DTOs, commands, queries, events, errors, config and DI are all checked by TypeScript.

- **60 min** to read and try
- **You need:** The whole ZudoJS application development course, and the typed events, CQRS and DI lessons of Advanced TypeScript
- **You build:** A typed billing module (users, products, orders, payments, notifications) with one contract file, typed buses over @zudojs/cqrs and @zudojs/events, a checked composition root and type tests

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Put every contract of a module (ids, money, DTOs, commands, queries, events, errors) in one place and derive the rest from it
- Model entity states as a discriminated union so illegal transitions do not compile
- Wrap @zudojs/cqrs and @zudojs/events so a request's name decides its payload and result type
- Let the container, config schemas and error tables be checked by the compiler
- Mark where compile-time types end and runtime checks must take over, and test both

## A checkout that compiled and was wrong four times

The Task API is getting paid plans. Users buy **products** (the Pro plan, extra storage, SMS packs), which creates an **order**; the payment provider calls back with a **payment**; the user gets a **notification**. The first version was written quickly, with `string` ids, `number` money and `string` statuses. It compiles without a single warning. Run it:

problem.ts

```ts
interface Order {
  id: string;
  userId: string;
  productId: string;
  total: number;
  status: string;
}

const prices: Record<string, number> = { "prd_pro-monthly": 5000, "prd_sms-pack": 1.1 };
const orders: Order[] = [];
const listeners: ((event: any) => void)[] = [];

function placeOrder(productId: string, userId: string): Order {
  const order = { id: `ord_${orders.length + 1}`, userId, productId, total: prices[productId]!, status: "pending" };
  orders.push(order);
  return order;
}

function recordPayment(order: Order, amount: number) {
  if (amount === order.total) order.status = "payed";
  for (const listener of listeners) listener({ orderId: order.id, total: order.total });
}

listeners.push((event) => console.log(`e-mail: payment of ₦${event.amount} received for ${event.orderId}`));

const mine = placeOrder("u-ada", "prd_pro-monthly");
console.log("order total:", mine.total, "for user", mine.userId);

const sms = placeOrder("prd_sms-pack", "u-ada");
sms.total = sms.total * 3;
recordPayment(sms, 3.3);
console.log("3 SMS packs cost", sms.total, "- the customer paid 3.3, status:", sms.status);

const good = placeOrder("prd_pro-monthly", "u-ada");
recordPayment(good, 5000);
console.log("paid orders on the dashboard:", orders.filter((o) => o.status === "paid").length);
```

Output of `npx tsx problem.ts` and of the browser terminal

```ts
order total: undefined for user prd_pro-monthly
e-mail: payment of ₦undefined received for ord_2
3 SMS packs cost 3.3000000000000003 - the customer paid 3.3, status: pending
e-mail: payment of ₦undefined received for ord_3
paid orders on the dashboard: 0
```

- **Swapped ids.** The first call passed the user id as the product id. Both are `string`, so TypeScript saw nothing wrong. The order has no price and belongs to a product.
- **Float money.** 3 × ₦1.10 is `3.3000000000000003` in floating point, so the customer who paid exactly ₦3.30 is refused.
- **A typo in a state.** `"payed"` is a perfectly good `string`. The dashboard counts `"paid"` orders and finds none.
- **An event contract nobody checked.** The publisher sends `total`, the listener reads `amount`, and customers get "payment of ₦undefined".

Each of these is a *contract* between two pieces of code that was never written down, so the compiler could not check it. In the Advanced TypeScript course you built each tool on its own: [branded types](https://zudojs.oyinlola.site/learn/ts-branded-types), [domain modelling](https://zudojs.oyinlola.site/learn/ts-domain-modeling), [typed events](https://zudojs.oyinlola.site/learn/ts-typed-events), [typed CQRS](https://zudojs.oyinlola.site/learn/ts-typed-cqrs) and [typed DI](https://zudojs.oyinlola.site/learn/ts-typed-di). This last lesson of the course puts them together in a ZudoJS application: a billing module for the Task API where every contract is written once and checked everywhere it is used, from the environment variables to the e-mail.

## Questions before any type

REASON IT OUT

### Which contracts does billing have?

List the places where one part of billing hands data to another. For each, answer: who creates the value, who trusts it, and who checks it?

- A route receives `{ "productId": "prd_pro-monthly" }`. When does that string become a product id your code can trust?
- An order is pending, paid or cancelled. Which fields exist in each state? Can a paid order be paid again?
- The payment provider's webhook says "₦5,000 paid for order `ord_…`". What must be checked before the order is marked paid? What if the webhook arrives twice?
- The notification code needs to know an order was paid. Should it be called by the payment code, or listen for something?
- The Pro plan price comes from the environment. What type is it when it arrives, and when does it become money?

**Show the reasoning**

A string from a request becomes a `ProductId` only after a parse function has checked it, and becomes a *product* only after the repository found it. The type `ProductId` then means "checked"; code that receives one never checks again.

Each state has its own fields: only a paid order has a `paymentId` and `paidAt`, only a cancelled one a `reason`. Paying is a transition from *pending* to *paid*, so the function that pays should only accept a pending order.

The webhook is outside input twice over: its signature proves who sent it (see [ZudoJS crypto](https://zudojs.oyinlola.site/learn/zudo-crypto#signed)), its body must be parsed, the order must exist and be pending, and the amount must match the order total exactly. A retry of the same payment must return the same result without paying twice.

Notifications should *listen* for an `order.paid` event, so payments do not depend on e-mail. The event's payload is then a contract between two modules, and needs a type as much as a function parameter does.

Environment values are always strings. A config schema turns `"500000"` into a number at start-up and fails loudly if it is missing; the product catalogue turns the number into `Kobo`.

Those answers give the module's contracts, and the design rule for this lesson: **write each contract once, as a type, and derive everything else from it**. Where the data comes from outside the program, pair the type with a runtime check that produces it:

| Contract | Written once in | Checked by the compiler | Checked at runtime by |
| --- | --- | --- | --- |
| Ids and money | `values.ts` (brands) | no swapped ids, no naira-for-kobo | parse functions, `kobo()` |
| Entity states | `model.ts` (unions) | only legal transitions; every state handled | (the data came through the model) |
| Request and response DTOs | `contracts.ts` (schemas) | handlers see the parsed type | `@zudojs/schema` |
| Commands, queries, events | `contracts.ts` (maps) | name decides payload and result | the buses (handler exists) |
| Errors | `contracts.ts` (codes) | every code has a status | error handler at the edge |
| Config | `app.ts` (schema) | `config.pro_plan_price` is a number | schema at start-up |
| Wiring | `ports.ts` (tokens) | factories get the right services | the container (registered?) |

## Values: ids and money

Start with the smallest contracts. Each id gets a **brand** ([branded ids](https://zudojs.oyinlola.site/learn/zudo-types-constants#brands)): `UserId`, `EmailAddress` and `Timestamp` come from `@zudojs/constants`, and billing adds its own with the same `Brand` type. Money is a branded whole number of **kobo** (₦1 = 100 kobo), so floats cannot sneak in. The only places that create these values are the functions in this file:

values.ts

```ts
import type { Brand, EmailAddress, Timestamp, UserId } from "@zudojs/constants";
import { ValidationError } from "@zudojs/errors";

export type { EmailAddress, Timestamp, UserId };
export type ProductId = Brand<string, "ProductId">;
export type OrderId = Brand<string, "OrderId">;
export type PaymentId = Brand<string, "PaymentId">;

/** Money in kobo (₦1 = 100 kobo): a whole number, never a float. */
export type Kobo = Brand<number, "Kobo">;

export function kobo(amount: number): Kobo {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new ValidationError(`Not an amount in kobo: ${amount}`);
  return amount as Kobo;
}

export function formatNaira(amount: Kobo): string {
  const naira = Math.floor(amount / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `₦${naira}.${String(amount % 100).padStart(2, "0")}`;
}

export function parseProductId(value: unknown): ProductId {
  if (typeof value !== "string" || !/^prd_[a-z0-9-]{3,40}$/.test(value)) throw new ValidationError("Not a product id");
  return value as ProductId;
}

export function parseOrderId(value: unknown): OrderId {
  if (typeof value !== "string" || !/^ord_[0-9a-f]{12}$/.test(value)) throw new ValidationError("Not an order id");
  return value as OrderId;
}
```

Every `as` in the module lives in this file, right after a check. Everywhere else, a `ProductId` can only come from `parseProductId` or from a stored product. The first bug from the checkout is now a compile error, and so is a float price:

swapped.ts

```ts
import type { Brand, UserId } from "@zudojs/constants";
import { createUserId } from "@zudojs/constants";

type ProductId = Brand<string, "ProductId">;
type Kobo = Brand<number, "Kobo">;

function placeOrder(userId: UserId, productId: ProductId): string {
  return `${userId} ordered ${productId}`;
}

const ada = createUserId("u-ada");
const pro = "prd_pro-monthly" as ProductId;
placeOrder(pro, ada);
const smsPack: Kobo = 1.1;
```

What `npx tsc --noEmit` prints

```ts
swapped.ts:13:12 - error TS2345: Argument of type 'ProductId' is not assignable to parameter of type 'UserId'.
  Type 'ProductId' is not assignable to type '{ readonly __brand: "UserId"; }'.
    Types of property '__brand' are incompatible.
      Type '"ProductId"' is not assignable to type '"UserId"'.

13 placeOrder(pro, ada);
              ~~~

swapped.ts:14:7 - error TS2322: Type 'number' is not assignable to type 'Kobo'.
  Type 'number' is not assignable to type '{ readonly __brand: "Kobo"; }'.

14 const smsPack: Kobo = 1.1;
         ~~~~~~~


Found 2 errors in the same file, starting at: swapped.ts:13
```

At runtime a branded value is still a plain string or number, with no cost. Checking at the boundary looks like this:

values-demo.ts

```ts
import { ValidationError } from "@zudojs/errors";
import { formatNaira, kobo, parseProductId } from "./values.js";

console.log(formatNaira(kobo(500_000)), formatNaira(kobo(110 * 3)), formatNaira(kobo(1_234_567_89)));
for (const attempt of [() => kobo(3.3), () => parseProductId("u-ada"), () => parseProductId("prd_pro-monthly")]) {
  try {
    console.log("ok:", attempt());
  } catch (error) {
    if (error instanceof ValidationError) console.log(error.statusCode, error.message);
  }
}
```

Output of `npx tsx values-demo.ts` and of the browser terminal

```ts
₦5,000.00 ₦3.30 ₦1,234,567.89
400 Not an amount in kobo: 3.3
400 Not a product id
ok: prd_pro-monthly
```

Three SMS packs are 330 kobo, exactly. `kobo(3.3)` is refused with a 400-level `ValidationError`, so a float that reaches the boundary is a client error, not a silent rounding problem.

## Entities: one type per state

An order is a **discriminated union** ([Unions](https://zudojs.oyinlola.site/learn/ts-unions)): three types that share a `status` field with a different literal value each. Fields exist only in the states where they make sense, and a transition is a function from one state's type to another's:

model.ts

```ts
import type { EmailAddress, Kobo, OrderId, PaymentId, ProductId, Timestamp, UserId } from "./values.js";

export interface User {
  readonly id: UserId;
  readonly email: EmailAddress;
  readonly name: string;
}

export interface Product {
  readonly id: ProductId;
  readonly name: string;
  readonly price: Kobo;
}

interface OrderBase {
  readonly id: OrderId;
  readonly userId: UserId;
  readonly productId: ProductId;
  readonly total: Kobo;
  readonly placedAt: Timestamp;
}
export interface PendingOrder extends OrderBase {
  readonly status: "pending";
}
export interface PaidOrder extends OrderBase {
  readonly status: "paid";
  readonly paymentId: PaymentId;
  readonly paidAt: Timestamp;
}
export interface CancelledOrder extends OrderBase {
  readonly status: "cancelled";
  readonly reason: string;
}
export type Order = PendingOrder | PaidOrder | CancelledOrder;

export interface Payment {
  readonly id: PaymentId;
  readonly orderId: OrderId;
  readonly amount: Kobo;
  readonly providerRef: string;
}

export type Notification =
  | { readonly channel: "email"; readonly to: EmailAddress; readonly subject: string }
  | { readonly channel: "in-app"; readonly userId: UserId; readonly text: string };

/** The only way to a PaidOrder: from a pending one, with a payment for it. */
export function markPaid(order: PendingOrder, payment: Payment, at: Timestamp): PaidOrder {
  return { ...order, status: "paid", paymentId: payment.id, paidAt: at };
}
```

The `"payed"` typo is now impossible: `status` can only be one of three literals. `markPaid` accepts only a `PendingOrder`, so code that holds an `Order` must check its status first, and code that forgets a state is caught when a new state is added. Here a `"refunded"` state was added to a copy of the union, and the compiler finds both places that were not updated:

refunded.ts

```ts
type Order =
  | { readonly status: "pending"; readonly total: number }
  | { readonly status: "paid"; readonly total: number; readonly paidAt: string }
  | { readonly status: "cancelled"; readonly total: number; readonly reason: string }
  | { readonly status: "refunded"; readonly total: number; readonly refundedAt: string };

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
}

function label(order: Order): string {
  switch (order.status) {
    case "pending": return "Waiting for payment";
    case "paid": return `Paid on ${order.paidAt}`;
    case "cancelled": return `Cancelled: ${order.reason}`;
    default: return assertNever(order);
  }
}

const badge: Record<Order["status"], string> = { pending: "grey", paid: "green", cancelled: "red" };
```

What `npx tsc --noEmit` prints

```ts
refunded.ts:16:33 - error TS2345: Argument of type '{ readonly status: "refunded"; readonly total: number; readonly refundedAt: string; }' is not assignable to parameter of type 'never'.

16     default: return assertNever(order);
                                   ~~~~~

refunded.ts:20:7 - error TS2741: Property 'refunded' is missing in type '{ pending: string; paid: string; cancelled: string; }' but required in type 'Record<"cancelled" | "paid" | "pending" | "refunded", string>'.

20 const badge: Record<Order["status"], string> = { pending: "grey", paid: "green", cancelled: "red" };
         ~~~~~


Found 2 errors in the same file, starting at: refunded.ts:16
```

Two techniques, two errors. The `switch` ends with `assertNever`, which only accepts `never`: once every state is handled, nothing is left. The `Record<Order["status"], string>` must have a key for every status. Adding a state to the union now produces a to-do list from the compiler, instead of a "pending" badge on a refunded order.

## One contract file

Now the contracts between the module and the rest of the world. They live in one file, so a reviewer can see every promise billing makes:

contracts.ts

```ts
import { BaseError, ErrorCategory } from "@zudojs/errors";
import { schema } from "@zudojs/schema";
import type { Infer } from "@zudojs/schema";
import type { Order, PaidOrder, PendingOrder } from "./model.js";
import type { Kobo, OrderId, PaymentId, ProductId, UserId } from "./values.js";

/* HTTP in: what a client may send. */
export const PlaceOrderBody = schema.object({ productId: schema.string().min(1).max(64) }).strict();
export type PlaceOrderBody = Infer<typeof PlaceOrderBody>;

export const PaymentWebhook = schema.object({
  event: schema.enum(["charge.success"] as const),
  data: schema.object({
    reference: schema.string().min(1).max(100),
    orderId: schema.string().max(64),
    amount: schema.number().int().min(1),
  }),
});
export type PaymentWebhook = Infer<typeof PaymentWebhook>;

/* HTTP out: what a client may see. */
export interface OrderResponse {
  readonly id: string;
  readonly status: Order["status"];
  readonly product: string;
  readonly total: string;
  readonly paidAt: string | null;
}

/* Commands, queries and events: one map each, the single source of truth. */
export type BillingCommands = {
  PlaceOrder: { request: { userId: UserId; productId: ProductId }; result: PendingOrder };
  RecordPayment: { request: { orderId: OrderId; amount: Kobo; providerRef: string }; result: PaidOrder };
};
export type BillingQueries = {
  GetOrder: { request: { userId: UserId; orderId: OrderId }; result: OrderResponse };
};
export type BillingEvents = {
  "order.placed": { orderId: OrderId; userId: UserId; total: Kobo };
  "order.paid": { orderId: OrderId; userId: UserId; paymentId: PaymentId; total: Kobo };
};

/* Errors: every expected failure has a code, and every code a status. */
export type BillingErrorCode = "PRODUCT_NOT_FOUND" | "ORDER_NOT_FOUND" | "ORDER_NOT_PENDING" | "AMOUNT_MISMATCH";

export const BILLING_STATUS = {
  PRODUCT_NOT_FOUND: 404,
  ORDER_NOT_FOUND: 404,
  ORDER_NOT_PENDING: 409,
  AMOUNT_MISMATCH: 422,
} as const satisfies Record<BillingErrorCode, number>;

export class BillingError extends BaseError {
  readonly reason: BillingErrorCode;

  constructor(reason: BillingErrorCode, message: string) {
    super(message, { code: `ERR_${reason}`, category: ErrorCategory.BUSINESS, statusCode: BILLING_STATUS[reason], expose: true });
    this.reason = reason;
  }
}
```

Four decisions to look at:

- **DTO types come from schemas.** `Infer<typeof PlaceOrderBody>` is the type of whatever `parse` returns, so the schema (runtime) and the type (compile time) cannot drift apart. The name is used twice on purpose: `PlaceOrderBody` the value is the schema, `PlaceOrderBody` the type is its output.
- **The request carries branded types, the DTO carries strings.** Between them sits the parse step in the route. A command handler never sees an unchecked id.
- **Maps are `type` aliases, not interfaces.** `@zudojs/cqrs`'s `CommandOf` and `@zudojs/events`' `EventUnion` require `Record<string, unknown>`, which an interface does not satisfy (it has no index signature), as the next example shows.
- **`as const satisfies Record<BillingErrorCode, number>`** checks that every code has a status (a missing one is an error) while keeping the exact literal types, so `BILLING_STATUS.AMOUNT_MISMATCH` is `422`, not just `number`.

interface-payload.ts

```ts
import type { CommandOf } from "@zudojs/cqrs";

interface RefundData {
  readonly orderId: string;
  readonly reason: string;
}

type RefundOrder = CommandOf<"RefundOrder", RefundData>;
type RefundOrderFixed = CommandOf<"RefundOrder", { readonly orderId: string; readonly reason: string }>;
```

What `npx tsc --noEmit` prints

```ts
interface-payload.ts:8:45 - error TS2344: Type 'RefundData' does not satisfy the constraint 'Record<string, unknown>'.
  Index signature for type 'string' is missing in type 'RefundData'.

8 type RefundOrder = CommandOf<"RefundOrder", RefundData>;
                                              ~~~~~~~~~~


Found 1 error in interface-payload.ts:8
```

An inline object type (or a `type` alias) is accepted, the interface is not. Keep payload and map types as aliases in contract files.

## Typed buses: the name decides the type

`@zudojs/cqrs` and `@zudojs/events` route by runtime strings, so their own signatures cannot connect a name to a payload or a result: `commands.execute<PlaceOrder, string>(…)` compiles whatever the handler returns, and `bus.on<Event<X>>("order.paid", …)` believes whatever `X` you claim. [Type-safe CQRS](https://zudojs.oyinlola.site/learn/ts-typed-cqrs#zudo) and [a type-safe event system](https://zudojs.oyinlola.site/learn/ts-typed-events#zudo) showed both claims going wrong, and built thin layers that take a map as a type parameter. Here are compact versions for billing:

typed-buses.ts

```ts
import { createCommandBus, createQueryBus } from "@zudojs/cqrs";
import type { CommandHandlerFunction } from "@zudojs/cqrs";
import { createEventBus } from "@zudojs/events";
import type { Event, EventBus } from "@zudojs/events";

export type Spec = Record<string, { request: object; result: unknown }>;
export type RequestOf<S extends Spec, K extends keyof S & string> = { readonly type: K } & S[K]["request"];
export type Handlers<S extends Spec> = {
  [K in keyof S & string]: (request: RequestOf<S, K>) => Promise<S[K]["result"]>;
};

export interface TypedBus<S extends Spec> {
  send<K extends keyof S & string>(type: K, request: S[K]["request"]): Promise<S[K]["result"]>;
}

type RawBus = ReturnType<typeof createCommandBus> | ReturnType<typeof createQueryBus>;

function typed<S extends Spec>(raw: RawBus, handlers: Handlers<S>): TypedBus<S> {
  for (const type of Object.keys(handlers) as (keyof S & string)[]) {
    raw.register(type, handlers[type] as CommandHandlerFunction<{ readonly type: string }, unknown>);
  }
  return { send: (type, request) => raw.execute({ ...request, type }) };
}

export const typedCommands = <S extends Spec>(handlers: Handlers<S>) => typed<S>(createCommandBus(), handlers);
export const typedQueries = <S extends Spec>(handlers: Handlers<S>) => typed<S>(createQueryBus(), handlers);

export interface TypedEvents<M extends object> {
  on<K extends keyof M & string>(type: K, handler: (event: Event<M[K]>) => void | Promise<void>): void;
  publish<K extends keyof M & string>(type: K, payload: M[K]): Promise<void>;
  readonly raw: EventBus;
}

export function typedEvents<M extends object>(raw: EventBus = createEventBus()): TypedEvents<M> {
  return {
    on(type, handler) {
      raw.on<Event<M[typeof type]>>(type, handler);
    },
    async publish(type, payload) {
      await raw.publishEvent({ type, payload });
    },
    raw,
  };
}
```

What each piece buys you:

- `Handlers<S>` is a mapped type with one required key per command. Forget a handler, misspell a name or return the wrong result, and the handler table does not compile. A missing handler, which the raw bus only reports at runtime with `CommandHandlerNotFoundError`, becomes a compile error.
- `send("PlaceOrder", …)` takes the request type from the map and returns the map's result type. The one claim left (`raw.execute` returning that type) is made in one place, next to the code that guarantees it.
- `on("order.paid", handler)` gives the handler `Event<BillingEvents["order.paid"]>`, so reading `event.payload.amount` is a compile error: that was bug four.
- The raw buses stay reachable (`raw`), so package middleware, wildcards and error reports still work.

## Ports, tokens and handlers

The handlers depend on **ports**: small interfaces for what they need (a product lookup, an order store, a clock), not on concrete classes. Each port gets a token from `@zudojs/container` ([tokens](https://zudojs.oyinlola.site/learn/zudo-container#tokens)), and `createToken<T>` carries the type, so resolving a token gives a typed service:

ports.ts

```ts
import { createToken } from "@zudojs/container";
import type { BillingCommands, BillingEvents, BillingQueries } from "./contracts.js";
import type { Notification, Order, Payment, Product, User } from "./model.js";
import type { TypedBus, TypedEvents } from "./typed-buses.js";
import type { OrderId, PaymentId, ProductId, Timestamp, UserId } from "./values.js";

export interface ProductRepository {
  findById(id: ProductId): Promise<Product | null>;
}
export interface OrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  save(order: Order): Promise<void>;
}
export interface PaymentRepository {
  findByProviderRef(providerRef: string): Promise<Payment | null>;
  save(payment: Payment): Promise<void>;
}
export interface UserDirectory {
  findById(id: UserId): Promise<User | null>;
}
export interface Notifier {
  send(notification: Notification): Promise<void>;
}
export interface Clock {
  now(): Timestamp;
}
export interface IdSource {
  orderId(): OrderId;
  paymentId(): PaymentId;
}

export const TOKENS = {
  products: createToken<ProductRepository>("ProductRepository"),
  orders: createToken<OrderRepository>("OrderRepository"),
  payments: createToken<PaymentRepository>("PaymentRepository"),
  users: createToken<UserDirectory>("UserDirectory"),
  notifier: createToken<Notifier>("Notifier"),
  clock: createToken<Clock>("Clock"),
  ids: createToken<IdSource>("IdSource"),
  events: createToken<TypedEvents<BillingEvents>>("BillingEvents"),
  commands: createToken<TypedBus<BillingCommands>>("BillingCommands"),
  queries: createToken<TypedBus<BillingQueries>>("BillingQueries"),
} as const;
```

The handlers. Their return type is `Handlers<BillingCommands>`, so each method's parameter and result are checked against the map without a single annotation inside:

handlers.ts

```ts
import { BillingError } from "./contracts.js";
import type { BillingCommands, BillingEvents, BillingQueries, OrderResponse } from "./contracts.js";
import { markPaid } from "./model.js";
import type { Order, Product } from "./model.js";
import type { Clock, IdSource, Notifier, OrderRepository, PaymentRepository, ProductRepository, UserDirectory } from "./ports.js";
import type { Handlers, TypedEvents } from "./typed-buses.js";
import { formatNaira } from "./values.js";

export function toOrderResponse(order: Order, product: Product): OrderResponse {
  return {
    id: order.id,
    status: order.status,
    product: product.name,
    total: formatNaira(order.total),
    paidAt: order.status === "paid" ? order.paidAt : null,
  };
}

interface CommandDeps {
  readonly products: ProductRepository;
  readonly orders: OrderRepository;
  readonly payments: PaymentRepository;
  readonly clock: Clock;
  readonly ids: IdSource;
  readonly events: TypedEvents<BillingEvents>;
}

export function commandHandlers(deps: CommandDeps): Handlers<BillingCommands> {
  return {
    async PlaceOrder({ userId, productId }) {
      const product = await deps.products.findById(productId);
      if (!product) throw new BillingError("PRODUCT_NOT_FOUND", `Product ${productId} not found`);
      const order = { id: deps.ids.orderId(), userId, productId, total: product.price, placedAt: deps.clock.now(), status: "pending" } as const;
      await deps.orders.save(order);
      await deps.events.publish("order.placed", { orderId: order.id, userId, total: order.total });
      return order;
    },

    async RecordPayment({ orderId, amount, providerRef }) {
      const order = await deps.orders.findById(orderId);
      if (!order) throw new BillingError("ORDER_NOT_FOUND", `Order ${orderId} not found`);
      const earlier = await deps.payments.findByProviderRef(providerRef);
      if (earlier && order.status === "paid" && order.paymentId === earlier.id) return order;
      if (order.status !== "pending") throw new BillingError("ORDER_NOT_PENDING", `Order ${orderId} is ${order.status}`);
      if (amount !== order.total) throw new BillingError("AMOUNT_MISMATCH", `Paid ${formatNaira(amount)}, expected ${formatNaira(order.total)}`);
      const payment = { id: deps.ids.paymentId(), orderId, amount, providerRef };
      await deps.payments.save(payment);
      const paid = markPaid(order, payment, deps.clock.now());
      await deps.orders.save(paid);
      await deps.events.publish("order.paid", { orderId, userId: order.userId, paymentId: payment.id, total: amount });
      return paid;
    },
  };
}

export function queryHandlers(deps: Pick<CommandDeps, "orders" | "products">): Handlers<BillingQueries> {
  return {
    async GetOrder({ userId, orderId }) {
      const order = await deps.orders.findById(orderId);
      if (!order || order.userId !== userId) throw new BillingError("ORDER_NOT_FOUND", `Order ${orderId} not found`);
      const product = await deps.products.findById(order.productId);
      if (!product) throw new Error(`Order ${orderId} points at a missing product`);
      return toOrderResponse(order, product);
    },
  };
}

export function subscribeNotifications(events: TypedEvents<BillingEvents>, users: UserDirectory, notifier: Notifier): void {
  events.on("order.paid", async (event) => {
    const user = await users.findById(event.payload.userId);
    if (!user) return;
    await notifier.send({ channel: "email", to: user.email, subject: `Payment received: ${formatNaira(event.payload.total)}` });
    await notifier.send({ channel: "in-app", userId: user.id, text: `Order ${event.payload.orderId} is paid. Thank you!` });
  });
}
```

Read `RecordPayment` as the webhook rules from the questions, in order. A repeated webhook for the same provider reference returns the paid order again. After `order.status !== "pending"` has thrown, TypeScript has **narrowed** `order` to `PendingOrder`, which is why `markPaid(order, …)` compiles only there. `GetOrder` answers "not found" for another user's order, so it does not reveal that the order exists. And a product missing for an existing order is not a `BillingError` at all: it is a bug, and a plain `Error` becomes a 500.

**Show memory.ts: in-memory implementations of the ports**

memory.ts

```ts
import type { Notification, Order, Payment, Product, User } from "./model.js";
import type { Notifier, OrderRepository, PaymentRepository, ProductRepository, UserDirectory } from "./ports.js";
import type { OrderId, ProductId, UserId } from "./values.js";

export class MemoryProducts implements ProductRepository {
  private readonly rows: ReadonlyMap<ProductId, Product>;
  constructor(products: readonly Product[]) {
    this.rows = new Map(products.map((p) => [p.id, p]));
  }
  async findById(id: ProductId) {
    return this.rows.get(id) ?? null;
  }
}

export class MemoryOrders implements OrderRepository {
  private readonly rows = new Map<OrderId, Order>();
  async findById(id: OrderId) {
    return this.rows.get(id) ?? null;
  }
  async save(order: Order) {
    this.rows.set(order.id, order);
  }
}

export class MemoryPayments implements PaymentRepository {
  private readonly rows: Payment[] = [];
  async findByProviderRef(providerRef: string) {
    return this.rows.find((p) => p.providerRef === providerRef) ?? null;
  }
  async save(payment: Payment) {
    this.rows.push(payment);
  }
}

export class MemoryUsers implements UserDirectory {
  constructor(private readonly users: readonly User[]) {}
  async findById(id: UserId) {
    return this.users.find((u) => u.id === id) ?? null;
  }
}

export class ConsoleNotifier implements Notifier {
  async send(notification: Notification) {
    const to = notification.channel === "email" ? notification.to : notification.userId;
    const text = notification.channel === "email" ? notification.subject : notification.text;
    console.log(`  [${notification.channel} to ${to}] ${text}`);
  }
}
```

In the real Task API, `OrderRepository` is implemented over PostgreSQL with [@zudojs/database](https://zudojs.oyinlola.site/learn/zudo-data-architecture#repositories), whose rows the repository maps to `Order` values (checking the `status` column against the three literals as it goes). The handlers do not change.

## Config and the composition root

One function builds the module: the **composition root** from [DI architecture](https://zudojs.oyinlola.site/learn/zudo-di-architecture#root). Its configuration is a schema, so its type is inferred, and every `registerFactory` call types the factory's parameters from the tokens in its `inject` list:

app.ts

```ts
import { createConfigManager, createEnvironmentConfigSource } from "@zudojs/config";
import { createEmailAddress, createTimestamp, createUserId } from "@zudojs/constants";
import { createContainer } from "@zudojs/container";
import { schema } from "@zudojs/schema";
import type { Infer } from "@zudojs/schema";
import type { BillingEvents } from "./contracts.js";
import { commandHandlers, queryHandlers, subscribeNotifications } from "./handlers.js";
import { ConsoleNotifier, MemoryOrders, MemoryPayments, MemoryProducts, MemoryUsers } from "./memory.js";
import { TOKENS } from "./ports.js";
import { typedCommands, typedEvents, typedQueries } from "./typed-buses.js";
import { kobo, parseProductId } from "./values.js";
import type { OrderId, PaymentId } from "./values.js";

export const BillingConfig = schema.object({
  currency: schema.enum(["NGN"] as const),
  pro_plan_price: schema.coerce.number().int().min(100),
  storage_addon_price: schema.coerce.number().int().min(100),
});
export type BillingConfig = Infer<typeof BillingConfig>;

export async function loadBillingConfig(env: Record<string, string>): Promise<BillingConfig> {
  const config = createConfigManager({ sources: [createEnvironmentConfigSource({ prefix: "BILLING_", env })] });
  await config.load();
  return BillingConfig.parse(config.toObject());
}

export function createBillingContainer(config: BillingConfig) {
  const container = createContainer();
  let orderNo = 0;
  let paymentNo = 0;

  container.registerValue(TOKENS.clock, { now: () => createTimestamp("2026-09-24T09:00:00.000Z") });
  container.registerValue(TOKENS.ids, {
    orderId: () => `ord_${String(++orderNo).padStart(12, "0")}` as OrderId,
    paymentId: () => `pay_${++paymentNo}` as PaymentId,
  });
  container.registerValue(TOKENS.products, new MemoryProducts([
    { id: parseProductId("prd_pro-monthly"), name: "Pro plan (monthly)", price: kobo(config.pro_plan_price) },
    { id: parseProductId("prd_storage-10gb"), name: "Extra storage 10 GB", price: kobo(config.storage_addon_price) },
  ]));
  container.registerValue(TOKENS.users, new MemoryUsers([
    { id: createUserId("u-ada"), email: createEmailAddress("ada@example.com"), name: "Ada" },
  ]));
  container.registerValue(TOKENS.orders, new MemoryOrders());
  container.registerValue(TOKENS.payments, new MemoryPayments());
  container.registerValue(TOKENS.notifier, new ConsoleNotifier());
  container.registerFactory(TOKENS.events, (users, notifier) => {
    const events = typedEvents<BillingEvents>();
    subscribeNotifications(events, users, notifier);
    return events;
  }, [TOKENS.users, TOKENS.notifier]);
  container.registerFactory(
    TOKENS.commands,
    (products, orders, payments, clock, ids, events) =>
      typedCommands(commandHandlers({ products, orders, payments, clock, ids, events })),
    [TOKENS.products, TOKENS.orders, TOKENS.payments, TOKENS.clock, TOKENS.ids, TOKENS.events],
  );
  container.registerFactory(TOKENS.queries, (orders, products) => typedQueries(queryHandlers({ orders, products })), [TOKENS.orders, TOKENS.products]);
  return container;
}
```

The fixed clock and counting ids make this lesson's output repeatable; in production the clock reads the real time and ids come from `generateToken` in [ZudoJS crypto](https://zudojs.oyinlola.site/learn/zudo-crypto#random). Only the two lines that register them change. Now a wiring mistake. In this small container the tokens in `inject` are in the wrong order:

miswired.ts

```ts
import { createContainer, createToken } from "@zudojs/container";

interface Clock { now(): string }
interface OrderStore { count(): number }
class Checkout {
  constructor(private readonly orders: OrderStore, private readonly clock: Clock) {}
  summary() { return `${this.orders.count()} orders at ${this.clock.now()}`; }
}

const CLOCK = createToken<Clock>("Clock");
const ORDERS = createToken<OrderStore>("OrderStore");
const CHECKOUT = createToken<Checkout>("Checkout");

const container = createContainer();
container.registerFactory(CHECKOUT, (orders, clock) => new Checkout(orders, clock), [CLOCK, ORDERS]);
```

What `npx tsc --noEmit` prints

```ts
miswired.ts:15:69 - error TS2741: Property 'count' is missing in type 'Clock' but required in type 'OrderStore'.

15 container.registerFactory(CHECKOUT, (orders, clock) => new Checkout(orders, clock), [CLOCK, ORDERS]);
                                                                       ~~~~~~

  miswired.ts:4:24 - 'count' is declared here.
    4 interface OrderStore { count(): number }
                             ~~~~~~~~~~~~~~~


Found 1 error in miswired.ts:15
```

The factory's first parameter was typed as a `Clock` from the first token, and a clock is not an order store. With `registerClass`, the same mistake would compile and fail at runtime ([typed DI](https://zudojs.oyinlola.site/learn/ts-typed-di#zudo) shows it), which is why this module only uses `registerFactory`.

Config is checked at start-up, and its type flows into the code that reads it. A price of `"5000.50"` in the environment stops the app before any customer pays the wrong amount:

config-demo.ts

```ts
import { isSchemaValidationError } from "@zudojs/schema";
import { loadBillingConfig } from "./app.js";

console.log(await loadBillingConfig({ BILLING_CURRENCY: "NGN", BILLING_PRO_PLAN_PRICE: "500000", BILLING_STORAGE_ADDON_PRICE: "200000" }));
try {
  await loadBillingConfig({ BILLING_CURRENCY: "USD", BILLING_PRO_PLAN_PRICE: "5000.50" });
} catch (error) {
  if (isSchemaValidationError(error)) {
    for (const issue of error.issues) console.log(`${issue.path.join(".")}: ${issue.message}`);
  }
}
```

Output of `npx tsx config-demo.ts` and of the browser terminal

```json
{
  currency: 'NGN',
  pro_plan_price: 500000,
  storage_addon_price: 200000
}
currency: Expected one of "NGN"
pro_plan_price: Expected integer, received 5000.5
storage_addon_price: Required field missing: storage_addon_price
```

## The whole flow

Resolve the buses and run the story from the start of the lesson: Ada orders the Pro plan, the provider's webhook arrives (twice), she looks at her order, and two things go wrong on purpose:

checkout.ts

```ts
import { createUserId } from "@zudojs/constants";
import { createBillingContainer, loadBillingConfig } from "./app.js";
import { BillingError } from "./contracts.js";
import { TOKENS } from "./ports.js";
import { kobo, parseProductId } from "./values.js";

const config = await loadBillingConfig({ BILLING_CURRENCY: "NGN", BILLING_PRO_PLAN_PRICE: "500000", BILLING_STORAGE_ADDON_PRICE: "200000" });
const container = createBillingContainer(config);
const commands = container.resolve(TOKENS.commands);
const queries = container.resolve(TOKENS.queries);
const ada = createUserId("u-ada");

const order = await commands.send("PlaceOrder", { userId: ada, productId: parseProductId("prd_pro-monthly") });
console.log("placed", order.id, order.status, order.total);

const paid = await commands.send("RecordPayment", { orderId: order.id, amount: kobo(500_000), providerRef: "PSK_1042" });
console.log("paid", paid.status, paid.paidAt);
const retry = await commands.send("RecordPayment", { orderId: order.id, amount: kobo(500_000), providerRef: "PSK_1042" });
console.log("webhook retry, same payment:", retry.paymentId === paid.paymentId);

console.log(await queries.send("GetOrder", { userId: ada, orderId: order.id }));

const storage = await commands.send("PlaceOrder", { userId: ada, productId: parseProductId("prd_storage-10gb") });
const attempts = [
  () => commands.send("PlaceOrder", { userId: ada, productId: parseProductId("prd_gold-yearly") }),
  () => commands.send("RecordPayment", { orderId: order.id, amount: kobo(500_000), providerRef: "PSK_2000" }),
  () => commands.send("RecordPayment", { orderId: storage.id, amount: kobo(20_000), providerRef: "PSK_2001" }),
  () => queries.send("GetOrder", { userId: createUserId("u-bola"), orderId: order.id }),
];
for (const attempt of attempts) {
  try {
    await attempt();
  } catch (error) {
    if (error instanceof BillingError) console.log(error.statusCode, error.reason, "-", error.message);
  }
}
```

Output of `npx tsx checkout.ts` and of the browser terminal

```ts
placed ord_000000000001 pending 500000
  [email to ada@example.com] Payment received: ₦5,000.00
  [in-app to u-ada] Order ord_000000000001 is paid. Thank you!
paid paid 2026-09-24T09:00:00.000Z
webhook retry, same payment: true
{
  id: 'ord_000000000001',
  status: 'paid',
  product: 'Pro plan (monthly)',
  total: '₦5,000.00',
  paidAt: '2026-09-24T09:00:00.000Z'
}
404 PRODUCT_NOT_FOUND - Product prd_gold-yearly not found
409 ORDER_NOT_PENDING - Order ord_000000000001 is paid
422 AMOUNT_MISMATCH - Paid ₦200.00, expected ₦2,000.00
404 ORDER_NOT_FOUND - Order ord_000000000001 not found
```

Every line is a typed value: `order` is a `PendingOrder`, `paid` a `PaidOrder` (so `paid.paidAt` exists), and the query result an `OrderResponse`. The notification arrived through the `order.paid` event, with the payload the map promised. The retry returned the same payment instead of charging twice. The failures each carry their code and status: a second, different payment for a paid order is a 409, an amount of ₦200 for a ₦2,000 order is a 422, and Bola cannot see Ada's order.

### The HTTP edge

The routes are where untyped JSON meets typed code, so they do three jobs: parse the body into a DTO, turn DTO strings into branded values, and turn every outcome into a typed response. `ApiResult` is a union, so a route cannot return a success without a body or an error without a code:

routes.ts

```ts
import { BaseError } from "@zudojs/errors";
import { PaymentWebhook, PlaceOrderBody } from "./contracts.js";
import type { BillingCommands, BillingQueries, OrderResponse } from "./contracts.js";
import type { TypedBus } from "./typed-buses.js";
import { kobo, parseOrderId, parseProductId } from "./values.js";
import type { UserId } from "./values.js";

export type ApiResult<T> =
  | { readonly ok: true; readonly status: 200 | 201; readonly body: T }
  | { readonly ok: false; readonly status: number; readonly body: { readonly error: { readonly code: string; readonly message: string } } };

function failure(error: unknown): ApiResult<never> {
  if (error instanceof BaseError && error.expose && error.statusCode < 500) {
    return { ok: false, status: error.statusCode, body: { error: { code: error.code, message: error.message } } };
  }
  return { ok: false, status: 500, body: { error: { code: "ERR_INTERNAL", message: "Something went wrong" } } };
}

export function billingRoutes(commands: TypedBus<BillingCommands>, queries: TypedBus<BillingQueries>) {
  return {
    async placeOrder(userId: UserId, body: unknown): Promise<ApiResult<OrderResponse>> {
      try {
        const input = PlaceOrderBody.parse(body);
        const order = await commands.send("PlaceOrder", { userId, productId: parseProductId(input.productId) });
        return { ok: true, status: 201, body: await queries.send("GetOrder", { userId, orderId: order.id }) };
      } catch (error) {
        return failure(error);
      }
    },

    /** Call only after the webhook's signature was verified. */
    async paymentWebhook(body: unknown): Promise<ApiResult<{ readonly received: true }>> {
      try {
        const event = PaymentWebhook.parse(body);
        await commands.send("RecordPayment", {
          orderId: parseOrderId(event.data.orderId),
          amount: kobo(event.data.amount),
          providerRef: event.data.reference,
        });
        return { ok: true, status: 200, body: { received: true } };
      } catch (error) {
        return failure(error);
      }
    },
  };
}
```

routes-demo.ts

```ts
import { createUserId } from "@zudojs/constants";
import { createBillingContainer, loadBillingConfig } from "./app.js";
import { TOKENS } from "./ports.js";
import { billingRoutes } from "./routes.js";

const config = await loadBillingConfig({ BILLING_CURRENCY: "NGN", BILLING_PRO_PLAN_PRICE: "500000", BILLING_STORAGE_ADDON_PRICE: "200000" });
const container = createBillingContainer(config);
const routes = billingRoutes(container.resolve(TOKENS.commands), container.resolve(TOKENS.queries));
const ada = createUserId("u-ada");

const show = (label: string, result: { status: number; body: unknown }) => console.log(label, result.status, JSON.stringify(result.body));

show("POST /orders", await routes.placeOrder(ada, { productId: "prd_storage-10gb" }));
show("POST /orders (extra key)", await routes.placeOrder(ada, { productId: "prd_storage-10gb", total: 1 }));
show("POST /orders (bad id)", await routes.placeOrder(ada, { productId: "../admin" }));
show("webhook", await routes.paymentWebhook({ event: "charge.success", data: { reference: "PSK_7", orderId: "ord_000000000001", amount: 200000 } }));
show("webhook (float)", await routes.paymentWebhook({ event: "charge.success", data: { reference: "PSK_8", orderId: "ord_000000000001", amount: 2000.5 } }));
```

Output of `npx tsx routes-demo.ts` and of the browser terminal

```ts
POST /orders 201 {"id":"ord_000000000001","status":"pending","product":"Extra storage 10 GB","total":"₦2,000.00","paidAt":null}
POST /orders (extra key) 400 {"error":{"code":"ERR_SCHEMA_VALIDATION","message":"Validation failed"}}
POST /orders (bad id) 400 {"error":{"code":"ERR_VALIDATION_FAILED","message":"Not a product id"}}
  [email to ada@example.com] Payment received: ₦2,000.00
  [in-app to u-ada] Order ord_000000000001 is paid. Thank you!
webhook 200 {"received":true}
webhook (float) 400 {"error":{"code":"ERR_SCHEMA_VALIDATION","message":"Validation failed"}}
```

A client who tried to set the `total` got a 400 from the strict schema. The bad product id was refused by `parseProductId` before any command ran. The webhook with a fractional amount never reached `kobo()`: the schema's `int()` caught it. Mounting these in `@zudojs/http` is two lines per route: read the body as in [Request bodies](https://zudojs.oyinlola.site/learn/zudo-http#body), call the function, and answer with `createResponseContext().setStatus(result.status).json(result.body)`.

## Testing the types

The compile errors in this lesson are features, and features need tests, or a refactor can remove them silently. A **type test** is a line that must *not* compile, marked `// @ts-expect-error`. If the line ever starts compiling, TypeScript reports the unused directive as an error, and your build fails. Put the calls in a function you never run; they only need to be type-checked:

billing.type-test.ts

```ts
import { createUserId } from "@zudojs/constants";
import type { BillingConfig } from "./app.js";
import type { BillingCommands, BillingEvents } from "./contracts.js";
import { markPaid } from "./model.js";
import type { PaidOrder, PendingOrder } from "./model.js";
import type { TypedBus, TypedEvents } from "./typed-buses.js";
import type { OrderId, PaymentId } from "./values.js";

function typeTests(commands: TypedBus<BillingCommands>, events: TypedEvents<BillingEvents>, config: BillingConfig, paid: PaidOrder) {
  const ada = createUserId("u-ada");
  // @ts-expect-error a user id is not a product id
  void commands.send("PlaceOrder", { userId: ada, productId: ada });
  // @ts-expect-error there is no RefundOrder command yet
  void commands.send("RefundOrder", { orderId: "ord_1" });
  // @ts-expect-error PlaceOrder returns a PendingOrder, not a PaidOrder
  const wrong: Promise<PaidOrder> = commands.send("PlaceOrder", { userId: ada, productId: "prd_x" as never });
  // @ts-expect-error amounts are Kobo, not plain numbers
  void commands.send("RecordPayment", { orderId: "ord_1" as OrderId, amount: 500_000, providerRef: "PSK_1" });
  // @ts-expect-error the order.paid payload needs a paymentId
  void events.publish("order.paid", { orderId: "ord_1" as OrderId, userId: ada, total: 1 as never });
  // @ts-expect-error a paid order cannot be paid again
  markPaid(paid, { id: "pay_1" as PaymentId, orderId: paid.id, amount: paid.total, providerRef: "x" }, paid.paidAt);
  // @ts-expect-error a typo in a config key
  void config.pro_plan_prise;
  const ok: Promise<PendingOrder> = commands.send("PlaceOrder", { userId: ada, productId: "prd_x" as never });
  return [wrong, ok];
}

console.log("type tests compiled:", typeof typeTests);
```

Output of `npx tsx billing.type-test.ts` and of the browser terminal

```ts
type tests compiled: function
```

This file is itself a test: it passed because every marked line fails to compile, for the reason in its comment. Run `tsc --noEmit` in CI and these seven guarantees can never quietly disappear. (The `as never` casts only fill in arguments the test is not about.)

Runtime tests cover the other half: the rules types cannot express. For billing, that is the amount check, the retry that must not pay twice, the "not your order" rule and the event that must reach the notifier, all of which the checkout run above shows. In Vitest, build a fresh container per test with `createBillingContainer`, and replace ports with fakes by registering other values for the same tokens, as in [DI architecture](https://zudojs.oyinlola.site/learn/zudo-di-architecture#testing).

## Where the types stop

Types are erased when the program runs. Everything that crosses into your process from outside arrives untyped, whatever the TypeScript says:

- **Every `as` is a claim.** This module has them in exactly two kinds of places: the parse functions in `values.ts` (after a check) and the typed buses (after registering the matching handler). Search for `as ` in a code review; each one needs a reason next to it.
- **JSON, rows, environment and messages** are `unknown` until a schema or a parse function has checked them. A repository that returns `row as Order` without checking `status` reopens the `"payed"` bug.
- **Events outlive code.** Once `order.paid` is published to a queue or stored, old payloads exist. Add fields as optional, never change the meaning of one, and when you must break the shape, publish a new name (`order.paid.v2`) alongside the old for a while.
- **Types do not see time or other requests.** "A payment is recorded once" needed the provider reference check; under concurrency it needs a unique index on `provider_ref`, as in [data architecture](https://zudojs.oyinlola.site/learn/zudo-data-architecture#consistency).

## Production concerns

- **Strict compiler settings.** `strict` is the minimum. `noUncheckedIndexedAccess` makes `prices[productId]` possibly `undefined`, which would have caught the first bug's missing price; `exactOptionalPropertyTypes` separates "not sent" from "sent as `undefined`". [The tsconfig lesson](https://zudojs.oyinlola.site/learn/ts-tsconfig) covers them.
- **Contracts are reviewed like APIs.** A change to `contracts.ts` changes what clients, other modules and stored events rely on. Many teams require a second reviewer for it.
- **Documentation from the same source.** The schemas that type your DTOs can also describe your API; [OpenAPI](https://zudojs.oyinlola.site/learn/zudo-openapi) generates the documentation from them, so docs cannot drift from the code either.
- **Compile time is part of the design.** Deeply recursive helper types slow the editor for everyone. The maps here are flat on purpose; [TypeScript performance](https://zudojs.oyinlola.site/learn/ts-performance) shows how to measure.

## Practice

TRY IT YOURSELF

### Cancel an order

Add a `CancelOrder` command: it takes a `userId`, an `orderId` and a `reason`, and returns a `CancelledOrder`. Only the owner may cancel, and only a pending order. Write a `cancel(order: PendingOrder, reason)` transition, extend a copy of the command map, and implement the handler with the same errors as the other handlers.

**Show a solution**

cancel-order.ts

```ts
import { createUserId } from "@zudojs/constants";
import { createBillingContainer, loadBillingConfig } from "./app.js";
import { BillingError } from "./contracts.js";
import type { BillingCommands } from "./contracts.js";
import type { CancelledOrder, PendingOrder } from "./model.js";
import { TOKENS } from "./ports.js";
import { typedCommands } from "./typed-buses.js";
import type { OrderId, UserId } from "./values.js";
import { parseProductId } from "./values.js";

function cancel(order: PendingOrder, reason: string): CancelledOrder {
  return { ...order, status: "cancelled", reason };
}

type MoreCommands = {
  CancelOrder: { request: { userId: UserId; orderId: OrderId; reason: string }; result: CancelledOrder };
};

const config = await loadBillingConfig({ BILLING_CURRENCY: "NGN", BILLING_PRO_PLAN_PRICE: "500000", BILLING_STORAGE_ADDON_PRICE: "200000" });
const container = createBillingContainer(config);
const orders = container.resolve(TOKENS.orders);
const billing = container.resolve(TOKENS.commands);

const more = typedCommands<MoreCommands>({
  async CancelOrder({ userId, orderId, reason }) {
    const order = await orders.findById(orderId);
    if (!order || order.userId !== userId) throw new BillingError("ORDER_NOT_FOUND", `Order ${orderId} not found`);
    if (order.status !== "pending") throw new BillingError("ORDER_NOT_PENDING", `Order ${orderId} is ${order.status}`);
    const cancelled = cancel(order, reason);
    await orders.save(cancelled);
    return cancelled;
  },
});

const ada = createUserId("u-ada");
const order: BillingCommands["PlaceOrder"]["result"] = await billing.send("PlaceOrder", { userId: ada, productId: parseProductId("prd_pro-monthly") });
const cancelled = await more.send("CancelOrder", { userId: ada, orderId: order.id, reason: "Chose the yearly plan" });
console.log(cancelled.status, cancelled.reason);
try {
  await more.send("CancelOrder", { userId: ada, orderId: order.id, reason: "again" });
} catch (error) {
  if (error instanceof BillingError) console.log(error.statusCode, error.message);
}
```

Output of `npx tsx cancel-order.ts` and of the browser terminal

```ts
cancelled Chose the yearly plan
409 Order ord_000000000001 is cancelled
```

In the module itself you would add `CancelOrder` to `BillingCommands`; the `Handlers<BillingCommands>` return type of `commandHandlers` then refuses to compile until the handler exists. The narrowing after `order.status !== "pending"` is what lets `cancel(order, …)` compile.

TRY IT YOURSELF

### A query for the account page

Add a `ListMyOrders` query that returns a user's orders as `OrderResponse`s, newest first. The in-memory store has no "find by user" method yet: add one to a port of your own (`OrderLister`), and implement it over a small array for the exercise.

**Show a solution**

list-orders.ts

```ts
import { createTimestamp, createUserId } from "@zudojs/constants";
import type { OrderResponse } from "./contracts.js";
import { toOrderResponse } from "./handlers.js";
import type { Order, Product } from "./model.js";
import { typedQueries } from "./typed-buses.js";
import type { OrderId, UserId } from "./values.js";
import { kobo, parseProductId } from "./values.js";

interface OrderLister {
  listByUser(userId: UserId): Promise<readonly Order[]>;
}

type AccountQueries = {
  ListMyOrders: { request: { userId: UserId }; result: readonly OrderResponse[] };
};

const pro: Product = { id: parseProductId("prd_pro-monthly"), name: "Pro plan (monthly)", price: kobo(500_000) };
const ada = createUserId("u-ada");
const rows: Order[] = [
  { id: "ord_000000000001" as OrderId, userId: ada, productId: pro.id, total: pro.price, placedAt: createTimestamp("2026-09-01T10:00:00.000Z"), status: "cancelled", reason: "Wrong plan" },
  { id: "ord_000000000002" as OrderId, userId: ada, productId: pro.id, total: pro.price, placedAt: createTimestamp("2026-09-02T10:00:00.000Z"), status: "pending" },
  { id: "ord_000000000003" as OrderId, userId: createUserId("u-bola"), productId: pro.id, total: pro.price, placedAt: createTimestamp("2026-09-03T10:00:00.000Z"), status: "pending" },
];
const lister: OrderLister = { listByUser: async (userId) => rows.filter((o) => o.userId === userId) };

const queries = typedQueries<AccountQueries>({
  async ListMyOrders({ userId }) {
    const mine = [...(await lister.listByUser(userId))].sort((a, b) => b.placedAt.localeCompare(a.placedAt));
    return mine.map((order) => toOrderResponse(order, pro));
  },
});

for (const order of await queries.send("ListMyOrders", { userId: ada })) console.log(order.id, order.status, order.total);
```

Output of `npx tsx list-orders.ts` and of the browser terminal

```ts
ord_000000000002 pending ₦5,000.00
ord_000000000001 cancelled ₦5,000.00
```

The result type `readonly OrderResponse[]` comes from the map, so the page code gets DTOs, never entities with internal fields. ISO timestamps sort correctly as text, which is one reason the `Timestamp` brand stores them in that format. In the real module, `listByUser` would be a paginated query service, as in [data architecture](https://zudojs.oyinlola.site/learn/zudo-data-architecture#boundaries).

TRY IT YOURSELF

### An SMS channel

Add an `"sms"` channel to `Notification` with a `phone` and a `text`, and write a `describe(notification)` function with an exhaustive `switch`. Show the three channels.

**Show a solution**

sms-channel.ts

```ts
type Notification =
  | { readonly channel: "email"; readonly to: string; readonly subject: string }
  | { readonly channel: "in-app"; readonly userId: string; readonly text: string }
  | { readonly channel: "sms"; readonly phone: string; readonly text: string };

function assertNever(value: never): never {
  throw new Error(`Unhandled notification: ${JSON.stringify(value)}`);
}

function describe(notification: Notification): string {
  switch (notification.channel) {
    case "email": return `e-mail to ${notification.to}: ${notification.subject}`;
    case "in-app": return `in-app for ${notification.userId}: ${notification.text}`;
    case "sms": return `SMS to ${notification.phone}: ${notification.text.slice(0, 160)}`;
    default: return assertNever(notification);
  }
}

const all: Notification[] = [
  { channel: "email", to: "ada@example.com", subject: "Payment received: ₦5,000.00" },
  { channel: "in-app", userId: "u-ada", text: "Pro features are on." },
  { channel: "sms", phone: "+2348012345678", text: "Your Task API Pro plan is active." },
];
for (const notification of all) console.log(describe(notification));
```

Output of `npx tsx sms-channel.ts` and of the browser terminal

```ts
e-mail to ada@example.com: Payment received: ₦5,000.00
in-app for u-ada: Pro features are on.
SMS to +2348012345678: Your Task API Pro plan is active.
```

Before the `case "sms"` line existed, `assertNever(notification)` did not compile, because an SMS notification could still reach it. That error is the reminder you want every time a new variant is added: `ConsoleNotifier` and every other `switch` over channels would get the same one.

## Summary

- A module's contracts (ids, money, states, DTOs, commands, queries, events, errors, config, wiring) are written once and derived everywhere else. Put the ones other code relies on in one contract file.
- Brands keep ids and kobo apart at no runtime cost; parse functions are the only places that create them. Entity states are discriminated unions, transitions take the exact state they start from, and `never` or a `Record` over the status makes every state handled.
- DTO types come from schemas with `Infer`. Command, query and event maps are `type` aliases; thin layers over `@zudojs/cqrs` and `@zudojs/events` let the name decide the payload and result, and turn a missing handler into a compile error.
- Error codes map to statuses with `as const satisfies Record<Code, number>`. Routes return a typed `ApiResult` union and expose only errors meant for clients.
- `createToken<T>` and `registerFactory` type the wiring; a config schema types the settings and checks them at start-up.
- `@ts-expect-error` type tests keep compile-time guarantees from disappearing. Everything from outside the process is still checked at runtime; every `as` needs a reason.

That completes **ZudoJS application development**: a Task API with users, roles, PostgreSQL, uploads, caching, cryptography and a typed billing module. The next course, [ZudoJS advanced systems](https://zudojs.oyinlola.site/learn/zudo-events), starts with events in depth, the mechanism billing used to send its notifications.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
