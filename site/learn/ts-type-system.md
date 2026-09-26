---
title: "The type system in depth — ZudoJS Academy"
description: "Learn when one type fits another: structural typing, excess property checks, variance with in and out, computed types, and when a clever type costs too much."
source: https://zudojs.oyinlola.site/learn/ts-type-system
---

LEVEL 6 · LESSON 10 OF 22

The type system in depth Advanced

# The type system in depth

Learn when one type fits another: structural typing, excess property checks, variance with in and out, computed types, and when a clever type costs too much.

- **60 min** to read and try
- **You need:** Union types in depth, Conditional types, Advanced functions and Functional TypeScript
- **You build:** A variance-safe notification module for a shop, with a type test suite that pins every compatibility rule it relies on

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Predict whether one type is assignable to another using the structural rules for objects, functions and unions
- Explain when excess property checks run and when a typo slips through
- Classify a generic type as covariant, contravariant, invariant or bivariant, and write callbacks so they are checked
- Use in and out annotations and read the error when one contradicts the type
- Write a recursive conditional type that computes a useful answer, and test it
- Weigh a clever type's error messages, compile time, limits and edge cases against a simpler design

## The refund that accepted an order

A customer paid for order ORD-1042 partly with ₦5,000 of store credit and the rest by card. The order is later returned, and a support tool calls the refund function. This file compiles with no errors under `strict`:

problem.ts

```ts
interface Payment {
  id: string;
  amountKobo: number;
}

interface Order {
  id: string;
  amountKobo: number;
  customer: string;
}

function refundToCard(payment: Payment): string {
  return `refund ${payment.amountKobo} kobo to the card used for ${payment.id}`;
}

const order: Order = { id: "ORD-1042", amountKobo: 2138750, customer: "Ada" };
const cardPayment: Payment = { id: "PAY-88", amountKobo: 1638750 };

console.log(refundToCard(cardPayment));
console.log(refundToCard(order));
```

Output of `npx tsx problem.ts` and of the browser terminal

```ts
refund 1638750 kobo to the card used for PAY-88
refund 2138750 kobo to the card used for ORD-1042
```

The second call refunds the whole order total to the card, ₦5,000 more than the card was charged, against an id that is not a payment. The compiler did not object, because it never asked "is this a `Payment`?". It asked "does this *look like* a `Payment`?", and an order has an `id` string and an `amountKobo` number, so it does.

This lesson is about the rules behind that answer: when one type is **assignable** to another (can be used where the other is expected), why the rules are shaped the way they are, where they are deliberately loose, and how to write types that the rules check well. It ends with types that compute answers, and an honest look at when that is a bad idea. [Branded types](https://zudojs.oyinlola.site/learn/ts-branded-types), the next lesson, fixes this refund for good.

## Structural typing

Languages decide type compatibility in one of two ways:

- **Nominal typing** (Java, C#, Swift, Rust): a value has the type it was *declared* with. A `Payment` is only a `Payment` if it was created as one, even if another class has identical fields.
- **Structural typing** (TypeScript, Go interfaces, OCaml objects): a value has every type whose required members it has. Names do not matter; shapes do.

TypeScript is structural because JavaScript is. Objects in JavaScript are usually created with literals, not with classes; libraries pass plain objects to each other; and code has always been written in "duck typing" style: if it has a `then` method, treat it like a promise. A nominal type system would reject most existing JavaScript. You met the idea in [Interfaces, unions and literal types](https://zudojs.oyinlola.site/learn/ts-objects#interface-vs-type); here is its full consequence:

shapes.ts

```ts
interface Payment {
  readonly id: string;
  readonly amountKobo: number;
}

interface Refund {
  readonly id: string;
  readonly amountKobo: number;
}

class CardCharge {
  constructor(
    readonly id: string,
    readonly amountKobo: number,
    readonly last4: string,
  ) {}
}

const refund: Refund = { id: "RF-3", amountKobo: 50000 };
const asPayment: Payment = refund;
const charge: Payment = new CardCharge("CH-9", 120000, "4242");
const fromLiteral: CardCharge = { id: "CH-10", amountKobo: 1000, last4: "0005" };

console.log(asPayment.id, charge.id, fromLiteral instanceof CardCharge);
```

Output of `npx tsx shapes.ts` and of the browser terminal

```ts
RF-3 CH-9 false
```

Every assignment compiles. A `Refund` is a `Payment`, because the two interfaces have the same members. A `CardCharge` instance is a `Payment`, because it has the members and more. Even a plain object literal counts as a `CardCharge`, although it was never constructed by the class, which is why `instanceof` prints `false`. Classes are shapes too.

### Where TypeScript is nominal

There is one exception. A class with a `private`, `protected` or `#private` member is only compatible with instances of that same class (and its subclasses), because the compiler cannot see or compare the hidden member from outside:

nominal.ts

```ts
class PaymentId {
  #value: string;
  constructor(value: string) {
    this.#value = value;
  }
  toString(): string {
    return this.#value;
  }
}

class OrderId {
  #value: string;
  constructor(value: string) {
    this.#value = value;
  }
  toString(): string {
    return this.#value;
  }
}

function refundPayment(id: PaymentId): string {
  return `refunding ${id}`;
}

refundPayment(new OrderId("ORD-1042"));
refundPayment({ toString: () => "PAY-88" });
```

What `npx tsc --noEmit` prints

```ts
nominal.ts:25:15 - error TS2345: Argument of type 'OrderId' is not assignable to parameter of type 'PaymentId'.
  Property '#value' in type 'OrderId' refers to a different member that cannot be accessed from within type 'PaymentId'.

25 refundPayment(new OrderId("ORD-1042"));
                 ~~~~~~~~~~~~~~~~~~~~~~~

nominal.ts:26:15 - error TS2741: Property '#value' is missing in type '{ toString: () => string; }' but required in type 'PaymentId'.

26 refundPayment({ toString: () => "PAY-88" });
                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  nominal.ts:2:3 - '#value' is declared here.
    2   #value: string;
        ~~~~~~


Found 2 errors in the same file, starting at: nominal.ts:25
```

That is a real way to get nominal types, and it has a runtime cost: every id becomes an object. Next lesson's branded types get the same compile-time safety for plain strings and numbers, with no runtime cost at all.

Within structural typing, the usual fix for the refund bug is to give each shape a member that the other cannot have. A literal `kind` field does it: `{ kind: "payment"; … }` and `{ kind: "order"; … }` are no longer compatible, because `"payment"` and `"order"` are different types. That is exactly the discriminant of a discriminated union, and it is the reason [Union types in depth](https://zudojs.oyinlola.site/learn/ts-unions) could tell the members apart.

## The compatibility rules

Assignability is a relation between a **source** type (the value you have) and a **target** type (the place you put it). "`S` is assignable to `T`" is also read as "`S` is a **subtype** of `T`": an `S` can be used wherever a `T` is expected. The rules that matter every day:

| Source → target | Assignable when… | Example |
| --- | --- | --- |
| Object → object | The source has every required member of the target, each with an assignable type. Extra members are fine. | `PaidOrder` → `Order` |
| Optional member | The source may lack it; if present, its type must fit. | `{}` → `{ note?: string }` |
| Function → function | The source takes no more required parameters than the target provides, each target parameter is assignable to the source's parameter, and the source's return type is assignable to the target's. | `(o: Order) => void` → `(p: PaidOrder, i: number) => void` |
| Union → anything | Every member of the source union is assignable. | `"paid" \| "shipped"` → `string` |
| Anything → union | The source fits at least one member. | `"paid"` → `"paid" \| "shipped"` |
| `never` → anything; anything → `unknown` | Always | The bottom and top of the system ([Special types](https://zudojs.oyinlola.site/learn/ts-special-types)) |

[Advanced functions](https://zudojs.oyinlola.site/learn/ts-advanced-functions#compatibility) explained the function rows: callbacks may take fewer parameters, and a function returning a value fits a `void` function type. The object rule has a hole worth knowing:

rules.ts

```ts
interface Payment {
  readonly id: string;
  readonly amountKobo: number;
}

interface EditablePayment {
  id: string;
  amountKobo: number;
}

const captured: Payment = { id: "PAY-88", amountKobo: 1638750 };
const editable: EditablePayment = captured;
editable.amountKobo = 0;
console.log("captured payment now says", captured.amountKobo);
```

Output of `npx tsx rules.ts` and of the browser terminal

```ts
captured payment now says 0
```

**A readonly property fits a mutable one.** Unlike `readonly` arrays (which [Functional TypeScript](https://zudojs.oyinlola.site/learn/ts-functional#readonly) showed cannot be assigned to mutable arrays), `readonly` on a property does not affect assignability. The "captured" payment was zeroed through the mutable alias. This is a known, deliberate hole: checking it would have broken too much existing code. Treat `readonly` properties as intent, and freeze data that must not change.

### Weak types

A type whose properties are *all* optional, such as an options object, would accept almost anything under the object rule. So TypeScript adds a check: assigning to a **weak type** fails if the source shares no properties with it at all.

weak.ts

```ts
interface RefundOptions {
  reason?: string;
  notifyCustomer?: boolean;
}

function refund(paymentId: string, options: RefundOptions = {}): string {
  return `${paymentId}: ${options.reason ?? "no reason"}`;
}

const settings = { notify: true, amountKobo: 500000 };
refund("PAY-88", settings);
```

What `npx tsc --noEmit` prints

```ts
weak.ts:11:18 - error TS2559: Type '{ notify: boolean; amountKobo: number; }' has no properties in common with type 'RefundOptions'.

11 refund("PAY-88", settings);
                    ~~~~~~~~


Found 1 error in weak.ts:11
```

Without this rule, `settings` (which uses the wrong property names) would be accepted in silence, since every property of `RefundOptions` is optional.

## Excess property checks

Extra properties are allowed by the object rule. That is what let the order pass as a payment. But one kind of extra property is almost always a mistake: one you typed yourself, in an object literal, right where the target type is known. So TypeScript runs an extra check on **fresh** object literals, which are literals written directly where a type is expected: in an annotated variable, an argument, a return statement or a `satisfies` expression.

excess.ts

```ts
interface RefundRequest {
  paymentId: string;
  amountKobo: number;
  reason?: string;
}

function requestRefund(request: RefundRequest): string {
  return `${request.paymentId}: ${request.amountKobo} (${request.reason ?? "no reason given"})`;
}

requestRefund({ paymentId: "PAY-88", amountKobo: 500000, reasn: "damaged on delivery" });

function fromForm(): RefundRequest {
  return { paymentId: "PAY-90", amountKobo: 250000, notes: "customer called" };
}
```

What `npx tsc --noEmit` prints

```ts
excess.ts:11:58 - error TS2561: Object literal may only specify known properties, but 'reasn' does not exist in type 'RefundRequest'. Did you mean to write 'reason'?

11 requestRefund({ paymentId: "PAY-88", amountKobo: 500000, reasn: "damaged on delivery" });
                                                            ~~~~~

excess.ts:14:53 - error TS2353: Object literal may only specify known properties, and 'notes' does not exist in type 'RefundRequest'.

14   return { paymentId: "PAY-90", amountKobo: 250000, notes: "customer called" };
                                                       ~~~~~


Found 2 errors in the same file, starting at: excess.ts:11
```

Both typos are caught, and the first even gets a suggestion. Now the same mistake, one step removed:

not-fresh.ts

```ts
interface RefundRequest {
  paymentId: string;
  amountKobo: number;
  reason?: string;
}

function requestRefund(request: RefundRequest): string {
  return `${request.paymentId}: ${request.amountKobo} (${request.reason ?? "no reason given"})`;
}

const fromTheForm = { paymentId: "PAY-88", amountKobo: 500000, reasn: "damaged on delivery" };
console.log(requestRefund(fromTheForm));

const base = { paymentId: "PAY-91", amountKobo: 100000, reasn: "late" };
console.log(requestRefund({ ...base }));
```

Output of `npx tsx not-fresh.ts` and of the browser terminal

```ts
PAY-88: 500000 (no reason given)
PAY-91: 100000 (no reason given)
```

No errors, and the reason is silently lost. `fromTheForm` is not fresh when it reaches the call: it is a variable, so it might be used elsewhere, where the extra property could be intended. Properties that arrive through a spread are not checked either; only the ones written out in the literal are. Excess property checks are a typo detector for literals, not a rule that objects have exactly the listed properties. TypeScript has no "exact object" types.

### Unions weaken the check

For a union target, a property is only "excess" if *no* member of the union has it. Without a discriminant, a mixed-up object passes:

union-excess.ts

```ts
type PayoutMethod = { last4: string; expiry: string } | { bank: string; accountNumber: string };
const mixed: PayoutMethod = { last4: "4242", expiry: "12/28", bank: "GTBank" };

type TaggedPayout = { kind: "card"; last4: string; expiry: string } | { kind: "bank"; bank: string; accountNumber: string };
const caught: TaggedPayout = { kind: "card", last4: "4242", expiry: "12/28", bank: "GTBank" };
```

What `npx tsc --noEmit` prints

```ts
union-excess.ts:5:78 - error TS2353: Object literal may only specify known properties, and 'bank' does not exist in type '{ kind: "card"; last4: string; expiry: string; }'.

5 const caught: TaggedPayout = { kind: "card", last4: "4242", expiry: "12/28", bank: "GTBank" };
                                                                               ~~~~


Found 1 error in union-excess.ts:5
```

Only the second object is reported. `mixed` is a valid card payout with a stray `bank`, because `bank` exists on some member. With a `kind` discriminant, TypeScript picks the `card` member first and checks the literal against it alone. One more reason to discriminate your unions.

> EXCESS CHECKS ARE NOT SECURITY
>
> A request body is never a fresh literal: it comes from `JSON.parse`. If an attacker adds `"role": "admin"` to a sign-up request, no compile-time check can see it. Strip or reject unknown keys at runtime, in the validator ([Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation)).

## Variance

A `PaidOrder` (an order with a `paidAt`) is a subtype of `Order`. Is a list of paid orders a subtype of a list of orders? Is a function that handles orders a subtype of a function that handles paid orders? **Variance** is the name for how subtyping of a type argument carries over to the generic type built from it. For a generic type `F<T>`:

| Variance | Meaning | Typical shape |
| --- | --- | --- |
| **Covariant** | `F<PaidOrder>` fits `F<Order>`: same direction | `T` only comes *out*: return types, readonly arrays, `Promise<T>` |
| **Contravariant** | `F<Order>` fits `F<PaidOrder>`: opposite direction | `T` only goes *in*: function parameters, handlers |
| **Invariant** | Neither fits the other | `T` goes in and out: a mutable box, a channel |
| **Bivariant** | Both fit | Unsound; TypeScript uses it for method parameters |

### Covariance: things you read from

If you only read orders out of a list, a list of paid orders is fine: every paid order is an order. `readonly PaidOrder[]` is assignable to `readonly Order[]`, a `() => PaidOrder` to a `() => Order`, a `Promise<PaidOrder>` to a `Promise<Order>`.

TypeScript also treats *mutable* arrays as covariant, and that is unsound: a mutable array is read *and* written. Here is the bug it permits:

array-covariance.ts

```ts
interface Order {
  readonly id: string;
  readonly totalKobo: number;
}
interface PaidOrder extends Order {
  readonly paidAt: string;
}

const paidOrders: PaidOrder[] = [{ id: "ORD-1", totalKobo: 500000, paidAt: "2026-09-24T10:00:00Z" }];
const allOrders: Order[] = paidOrders;
allOrders.push({ id: "ORD-2", totalKobo: 320000 });

for (const order of paidOrders) {
  try {
    console.log(order.id, "paid on", order.paidAt.slice(0, 10));
  } catch (error) {
    console.log(order.id, String(error));
  }
}
```

Output of `npx tsx array-covariance.ts` and of the browser terminal

```ts
ORD-1 paid on 2026-09-24
ORD-2 TypeError: Cannot read properties of undefined (reading 'slice')
```

`allOrders` and `paidOrders` are the same array. Pushing an unpaid order through the wider view put it into the "paid" list, and the code that trusted `PaidOrder` crashed. The TypeScript team chose this on purpose: treating `T[]` as invariant would reject a great deal of correct code, such as passing a `string[]` to a function that takes `(string | number)[]` and only reads it. The defence is the one from Functional TypeScript: **type parameters that you only read as `readonly T[]`**. A readonly array has no `push`, so the covariance becomes sound.

### Contravariance: things you write to

A handler is the opposite of a list ([Advanced functions](https://zudojs.oyinlola.site/learn/ts-advanced-functions#compatibility) met this rule for callbacks). A function that can handle *any* order can certainly handle a paid one, so `(order: Order) => void` fits where `(order: PaidOrder) => void` is expected. The other direction is refused, because a handler that needs `paidAt` might be given an order without it:

contravariance.ts

```ts
interface Order {
  readonly id: string;
  readonly totalKobo: number;
}
interface PaidOrder extends Order {
  readonly paidAt: string;
}

type OrderHandler = (order: Order) => void;
type PaidOrderHandler = (order: PaidOrder) => void;

const auditAnyOrder: OrderHandler = (order) => console.log("audit", order.id);
const printPaidReceipt: PaidOrderHandler = (order) => console.log(order.id, order.paidAt);

const onPaid: PaidOrderHandler = auditAnyOrder;
const onAnyOrder: OrderHandler = printPaidReceipt;
```

What `npx tsc --noEmit` prints

```ts
contravariance.ts:16:7 - error TS2322: Type 'PaidOrderHandler' is not assignable to type 'OrderHandler'.
  Types of parameters 'order' and 'order' are incompatible.
    Property 'paidAt' is missing in type 'Order' but required in type 'PaidOrder'.

16 const onAnyOrder: OrderHandler = printPaidReceipt;
         ~~~~~~~~~~

  contravariance.ts:6:12 - 'paidAt' is declared here.
    6   readonly paidAt: string;
                 ~~~~~~


Found 1 error in contravariance.ts:16
```

This check is what the `strictFunctionTypes` flag (part of `strict`) turns on. Without it, function parameters are bivariant and the second assignment compiles.

### Method bivariance spreads to whole types

Advanced functions showed the exception to that rule: **method** parameters (written `save(item: T): void`) are still checked bivariantly, while function-typed **properties** (`save: (item: T) => void`) get the strict check. For a single callback, that lets one wrong handler through. For a generic type, the damage is larger, because the compiler works out a generic type's variance from how its members use `T`, and a method parameter counts as "either direction". A repository written with methods is therefore measured as covariant, like a read-only list:

method-repository.ts

```ts
interface Order {
  readonly id: string;
  readonly totalKobo: number;
}
interface PaidOrder extends Order {
  readonly paidAt: string;
}

interface Repository<T> {
  save(item: T): void;
  all(): readonly T[];
}

function memoryRepository<T>(): Repository<T> {
  const items: T[] = [];
  return { save: (item) => void items.push(item), all: () => items };
}

const paidOrders: Repository<PaidOrder> = memoryRepository();
paidOrders.save({ id: "ORD-1", totalKobo: 500000, paidAt: "2026-09-24T10:00:00Z" });

const allOrders: Repository<Order> = paidOrders;
allOrders.save({ id: "ORD-2", totalKobo: 320000 });

for (const order of paidOrders.all()) {
  try {
    console.log(order.id, "paid on", order.paidAt.slice(0, 10));
  } catch (error) {
    console.log(order.id, String(error));
  }
}
```

Output of `npx tsx method-repository.ts` and of the browser terminal

```ts
ORD-1 paid on 2026-09-24
ORD-2 TypeError: Cannot read properties of undefined (reading 'slice')
```

It is the mutable-array bug again, through a type you wrote yourself. Write the members as properties, and the compiler measures `T` correctly: it goes into `save` and comes out of `all`, so the type is **invariant**, and neither direction is allowed:

property-repository.ts

```ts
interface Order {
  readonly id: string;
  readonly totalKobo: number;
}
interface PaidOrder extends Order {
  readonly paidAt: string;
}

interface Repository<T> {
  readonly save: (item: T) => void;
  readonly all: () => readonly T[];
}

declare const paidOrders: Repository<PaidOrder>;
declare const allOrders: Repository<Order>;

const widened: Repository<Order> = paidOrders;
const narrowed: Repository<PaidOrder> = allOrders;
```

What `npx tsc --noEmit` prints

```ts
property-repository.ts:17:7 - error TS2322: Type 'Repository<PaidOrder>' is not assignable to type 'Repository<Order>'.
  Types of property 'save' are incompatible.
    Type '(item: PaidOrder) => void' is not assignable to type '(item: Order) => void'.
      Types of parameters 'item' and 'item' are incompatible.
        Property 'paidAt' is missing in type 'Order' but required in type 'PaidOrder'.

17 const widened: Repository<Order> = paidOrders;
         ~~~~~~~

  property-repository.ts:6:12 - 'paidAt' is declared here.
    6   readonly paidAt: string;
                 ~~~~~~

property-repository.ts:18:7 - error TS2322: Type 'Repository<Order>' is not assignable to type 'Repository<PaidOrder>'.
  The types returned by 'all()' are incompatible between these types.
    Type 'readonly Order[]' is not assignable to type 'readonly PaidOrder[]'.
      Property 'paidAt' is missing in type 'Order' but required in type 'PaidOrder'.

18 const narrowed: Repository<PaidOrder> = allOrders;
         ~~~~~~~~

  property-repository.ts:6:12 - 'paidAt' is declared here.
    6   readonly paidAt: string;
                 ~~~~~~


Found 2 errors in the same file, starting at: property-repository.ts:17
```

`declare const` announces a value without creating it: enough for the checker, and a handy way to ask "would this assignment compile?". The first assignment fails on `save` (you could store an unpaid order), the second on `all` (you could read an order without `paidAt`).

Why does TypeScript keep the hole? Because the standard library relies on it. `Array<T>` is written with methods such as `push(...items: T[])`; checked strictly, `Array<T>` would be invariant and `PaidOrder[]` could never be passed as `Order[]`, even to a function that only reads it. The rule for your own generic types: **write members that take a `T` as function-typed properties**, so the compiler measures the variance you actually have.

### Variance annotations: in and out

Since TypeScript 4.7 you can write the variance of a type parameter yourself: `out T` for covariant, `in T` for contravariant, `in out T` for invariant. Think of it as "`T` comes out of this type" and "`T` goes into this type". The compiler then checks the annotation against the structure:

annotations.ts

```ts
interface Order {
  readonly id: string;
  readonly totalKobo: number;
}

interface OrderFeed<out T> {
  readonly latest: () => T;
}

interface OrderSink<in T> {
  readonly accept: (value: T) => void;
}

interface Mailbox<in out T> {
  readonly take: () => T;
  readonly put: (value: T) => void;
}

interface Mislabelled<out T> {
  readonly accept: (value: T) => void;
}

const feed: OrderFeed<Order> = { latest: () => ({ id: "ORD-1", totalKobo: 5000 }) };
console.log(feed.latest().id);
```

What `npx tsc --noEmit` prints

```ts
annotations.ts:19:23 - error TS2636: Type 'Mislabelled<sub-T>' is not assignable to type 'Mislabelled<super-T>' as implied by variance annotation.
  Types of property 'accept' are incompatible.
    Type '(value: sub-T) => void' is not assignable to type '(value: super-T) => void'.
      Types of parameters 'value' and 'value' are incompatible.
        Type 'super-T' is not assignable to type 'sub-T'.

19 interface Mislabelled<out T> {
                         ~~~~~


Found 1 error in annotations.ts:19
```

The first three annotations match their structures and compile. `Mislabelled` claims `T` only comes out, but `T` goes in, and the error spells out the proof: the compiler tried a subtype (`sub-T`) against a supertype (`super-T`) and the parameter did not fit. Annotations are useful for three things:

- **Documentation that is checked.** A reader of a library's `interface Store<in out T>` knows at a glance that stores of different types never mix.
- **Catching accidental changes.** If someone adds a method that makes an `out` type parameter appear in an input position, the annotation fails immediately, instead of users' code failing later.
- **Speed in very large types.** Without annotations the compiler *measures* variance by trying marker types, which can be slow or even inaccurate for deeply recursive generic types. An annotation lets it skip the measurement.

Application code rarely needs them. Write them on the generic types that sit at the centre of a library, such as an event bus, a store or a repository.

## Types that compute

You have written recursive types ([Type aliases and interfaces](https://zudojs.oyinlola.site/learn/ts-aliases-interfaces#recursive)) and recursive conditional types ([Conditional types](https://zudojs.oyinlola.site/learn/ts-conditional-types#recursion)). Taken together, the type system is a small programming language that runs inside the compiler:

| Programming idea | At the type level |
| --- | --- |
| Values | Literal types, tuples, object types, unions (sets of values) |
| Functions and parameters | Generic type aliases: `type Next<S> = …` |
| `if` / `else` | Conditional types: `S extends X ? A : B` |
| Loops | Recursion, and distribution over a union |
| Local variables | `infer` |
| Running the program | Any use of the type, in every file, on every keystroke in the editor |

A recursive *object* type such as `interface Category { children: readonly Category[] }` costs almost nothing: it is a description, expanded lazily. A recursive *conditional* type is a computation, and it runs again for each new input. Here is a computation that answers a real question.

### Which order statuses can never be reached?

The order workflow in [Type operators](https://zudojs.oyinlola.site/learn/ts-type-operators#build) derived its types from a transition table, and noted that an unreachable status is a property of the whole graph, which no type checks. A type *can* check it, with a loop over the graph:

reachable.ts

```ts
const ORDER_FLOW = {
  pending: ["paid", "cancelled"],
  paid: ["shipped", "refunded"],
  shipped: ["delivered", "returned"],
  returned: ["refunded"],
  delivered: [],
  cancelled: [],
  refunded: [],
  archived: [],
} as const;

type Status = keyof typeof ORDER_FLOW;
type Next<S extends Status> = (typeof ORDER_FLOW)[S][number];

type Reachable<S extends Status, Seen extends Status = never> = S extends Seen
  ? never
  : S | Reachable<Next<S>, Seen | S>;

type Unreachable = Exclude<Status, Reachable<"pending">>;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type R1 = Expect<Equal<Reachable<"shipped">, "shipped" | "delivered" | "returned" | "refunded">>;
type R2 = Expect<Equal<Unreachable, "archived">>;

const orphan: Unreachable = "archived";
console.log(`"${orphan}" can never be reached from "pending"`);
```

Output of `npx tsx reachable.ts` and of the browser terminal

```ts
"archived" can never be reached from "pending"
```

Read `Reachable` as a recursive function with an accumulator:

- `S` is the status (or union of statuses) to visit; `Seen` collects the ones already visited, so a cycle such as `paid → refunded → paid` would stop instead of looping forever.
- `S extends Seen ? never : …` is distributive (`S` is a naked type parameter), so the check runs for each status separately: visited ones contribute nothing.
- For a new status, the result is the status itself plus everything reachable from its next statuses. `Next<"delivered">` is `never`, and a conditional type over `never` produces `never`: that is the base case.

It works, it is tested, and it found `"archived"`. Whether you *should* keep it is the subject of the next section.

### Paths into a settings object

A more common computation turns a nested object into the union of its dotted paths, for a typed `get("delivery.zones.lagos")`:

paths.ts

```ts
type Paths<T> = {
  [K in keyof T & string]: T[K] extends object ? `${K}.${Paths<T[K]>}` : K;
}[keyof T & string];

const settings = {
  currency: "NGN",
  delivery: { freeAboveKobo: 5000000, zones: { lagos: 100000, abuja: 150000 } },
  payments: { card: { enabled: true }, transfer: { enabled: true, bank: "GTBank" } },
};

type SettingPath = Paths<typeof settings>;

function readSetting(path: SettingPath): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], settings);
}

console.log(readSetting("delivery.zones.lagos"), readSetting("payments.transfer.bank"));
```

Output of `npx tsx paths.ts` and of the browser terminal

```ts
100000 GTBank
```

The mapped type builds an object whose value for each key is either the key itself (a leaf) or the key, a dot and every path of the child object; indexing with `[keyof T & string]` collects the values into one union. Seven paths come out, and a typo such as `"delivery.zone.lagos"` is a compile error. (The `as` inside `readSetting` is the usual price of walking an object by computed keys; [Mapped types](https://zudojs.oyinlola.site/learn/ts-mapped-types) builds a fully typed `get`.)

## When a clever type is a bad type

Both computations above are correct for the inputs shown. Types like these are also a common source of pain in real codebases, for four reasons, each demonstrated below with real compiler output.

### 1. Edge cases give quietly wrong answers

Give `Paths` the kinds of data real settings contain, an array, a nullable object and a self-reference, and watch what it does:

paths-edges.ts

```ts
type Paths<T> = {
  [K in keyof T & string]: T[K] extends object ? `${K}.${Paths<T[K]>}` : K;
}[keyof T & string];

interface Shop {
  zones: { name: string; feeKobo: number }[];
  manager: { name: string } | null;
}

const first: Paths<Shop> = "zones.0.name";
const manager: Paths<Shop> = "manager.name";
const everyPath: Record<Paths<Shop>, true> = { "zones.length": true, manager: true };

interface Category {
  name: string;
  parent: Category;
}
type CategoryPath = Paths<Category>;
```

What `npx tsc --noEmit` prints

```ts
paths-edges.ts:10:7 - error TS2322: Type '"zones.0.name"' is not assignable to type 'Paths<Shop>'.

10 const first: Paths<Shop> = "zones.0.name";
         ~~~~~

paths-edges.ts:11:7 - error TS2322: Type '"manager.name"' is not assignable to type 'Paths<Shop>'.

11 const manager: Paths<Shop> = "manager.name";
         ~~~~~~~

paths-edges.ts:18:21 - error TS2615: Type of property 'parent' circularly references itself in mapped type '{ [K in "name" | "parent"]: Category[K] extends object ? `${K}.${Paths<Category[K]>}` : K; }'.

18 type CategoryPath = Paths<Category>;
                       ~~~~~~~~~~~~~~~


Found 3 errors in the same file, starting at: paths-edges.ts:10
```

The `everyPath` line compiles, and a `Record` literal must list every key and no others, so it proves what `Paths<Shop>` really is: just `"zones.length" | "manager"`. For the array, the only path is `"zones.length"`: array indexes are numbers, not strings, and every array method is a function, which "extends object" and then yields no paths. The nullable `manager` is a union with `null`, which does not extend `object`, so it is treated as a leaf. And a type that refers to itself makes the whole definition circular (TS2615), with an error that points into the helper rather than at your data. Each of these can be fixed with more branches, and each branch makes the type harder to read and slower to evaluate.

### 2. Limits you hit in production

The compiler refuses to recurse too deeply (TS2589, from [Conditional types](https://zudojs.oyinlola.site/learn/ts-conditional-types#recursion)) and to build unions of more than 100,000 members (TS2590, from [Template literal types](https://zudojs.oyinlola.site/learn/ts-template-literals#expressions), where a five-digit PIN type broke). Both limits are reached by types that grow with the data: a `Paths` over a large settings object, a template literal type over every one-time code. When a type hits a limit, the answer is almost never a cleverer type. For one-time codes, for example, it is a plain `string`, a runtime check (`/^\d{6}$/`), and a branded type that records that the check passed: the next lesson.

### 3. Error messages nobody can read

[Functional TypeScript](https://zudojs.oyinlola.site/learn/ts-functional#composition) typed `pipe` with four overloads and noted that a single variadic version is possible. Here it is, next to the error it produces for the same mistake:

variadic-pipe.ts

```ts
type Step = (input: any) => unknown;

type Chain<Fns extends readonly Step[], Prev = never> = Fns extends readonly [infer First extends Step, ...infer Rest extends Step[]]
  ? [[Prev] extends [never] ? First : (input: Prev) => ReturnType<First>, ...Chain<Rest, ReturnType<First>>]
  : [];

type LastResult<Fns extends readonly Step[]> = Fns extends readonly [...Step[], infer L extends Step] ? ReturnType<L> : never;

function pipe<const Fns extends readonly Step[]>(...fns: Fns & Chain<Fns>): (input: Parameters<Fns[0]>[0]) => LastResult<Fns> {
  return (input) => fns.reduce<unknown>((value, fn) => fn(value), input) as LastResult<Fns>;
}

const minusVoucher = (kobo: number): number => Math.max(kobo - 200000, 0);
const addVat = (kobo: number): number => Math.round(kobo * 1.075);
const toNaira = (kobo: number): string => `₦${(kobo / 100).toFixed(2)}`;

const label = pipe(minusVoucher, toNaira, addVat);
```

What `npx tsc --noEmit` prints

```ts
variadic-pipe.ts:17:20 - error TS2345: Argument of type '[(kobo: number) => number, (kobo: number) => string, (kobo: number) => number]' is not assignable to parameter of type '[(kobo: number) => number, (kobo: number) => string, (kobo: number) => number] & [(kobo: number) => number, (input: number) => string, (input: string) => number]'.
  Type '[(kobo: number) => number, (kobo: number) => string, (kobo: number) => number]' is not assignable to type '[(kobo: number) => number, (input: number) => string, (input: string) => number]'.
    Type at position 2 in source is not compatible with type at position 2 in target.
      Type '(kobo: number) => number' is not assignable to type '(input: string) => number'.
        Types of parameters 'kobo' and 'input' are incompatible.
          Type 'string' is not assignable to type 'number'.

17 const label = pipe(minusVoucher, toNaira, addVat);
                      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


Found 1 error in variadic-pipe.ts:17
```

It does work: any number of steps, fully checked. But compare the two errors. The overloaded `pipe` said, in two lines, that a function returning `string` was used where one returning `number` was needed. This one prints the whole argument tuple twice inside an intersection, counts positions from zero, and needs an `any` and a cast inside to work at all. Everyone who mistypes a pipeline pays for this, every time, and most of them did not write the type.

### 4. Compile time

Types run on every check and every keystroke. The cost of a computed type grows with what it produces. Here is `Paths` measured on a generated settings interface with six keys on each of five levels (7,776 settings), and with eight keys (32,768 settings), against the same file with `type SettingPath = string`. The flag `--extendedDiagnostics` makes `tsc` print its statistics; [Compiler performance](https://zudojs.oyinlola.site/learn/ts-performance) explains them all.

Example output (TypeScript 7, one laptop; your numbers will differ)

```bash
$ npx tsc --noEmit --extendedDiagnostics   # 7,776 settings, SettingPath = string
Types:            1898
Instantiations:      0
Check time:     0.031s
$ npx tsc --noEmit --extendedDiagnostics   # 7,776 settings, SettingPath = Paths<Settings>
Types:           16354
Instantiations:  82741
Check time:     0.182s
$ npx tsc --noEmit --extendedDiagnostics   # 32,768 settings, SettingPath = Paths<Settings>
Types:           56984
Instantiations: 301465
Check time:     0.692s
```

One use of one type added about six times the check time, and it grows with the data. That is fine once. It is not fine when the type sits in a library used in hundreds of files, or when several such types feed each other.

### Deciding

REASON IT OUT

### Is this type worth it?

Before you write, or approve, a type that computes, answer these:

1. Who will read its error messages, and will they understand them?
2. Does the value come from outside (JSON, a form, a database)? Then a runtime check is needed anyway. What does the type add?
3. Could a test check the same property? For `Reachable`: a unit test that walks the graph.
4. How large can its inputs get, and how many files use it?
5. What does it do with arrays, `null`, optional properties, unions, `any` and recursive types?

**Show the reasoning**

1. Every user of the type reads its errors; only its author understands its internals. If the errors need the internals to make sense, the type fails its users. Named helper types and fewer layers make better messages.
2. For outside values, the runtime check is the real safety. A type that computes over literal strings only protects the handful of values written in the code, like the PIN. Put the effort into the check, and let a simple type record its result.
3. Often yes. A graph walk in a test is ten lines of JavaScript that anyone can debug with a breakpoint. `Reachable` earns its place only if the table changes often and you want the editor to flag a dead status the moment it appears. Both are reasonable; the test is the default.
4. Settings objects grow, route tables grow, permission lists grow. Measure with `--extendedDiagnostics` on realistic sizes, not on the example that motivated the type.
5. These are where computed types go quietly wrong, as `Paths` showed. If the type does not handle them, the type tests should document it.

A clever type is a good type when it sits at a library boundary, turns a large class of mistakes into compile errors, has readable errors, handles the edge cases, has type tests, and stays cheap on real inputs. `Awaited`, `ReturnType` and a four-overload `pipe` pass that test. Most one-off type puzzles in application code do not.

## Build: a variance-safe notification module

A shop sends notifications on events: an SMS when a payment is captured, an email when an order ships, and an audit log entry for everything. The notification module has three generic types, and each one has a variance you can now predict:

- A **handler** takes an event: `T` goes in, so it is contravariant. An audit handler for every `ShopEvent` may listen to the payments channel.
- An **event log** hands out past events: `T` comes out, so it is covariant. A log of payment events can be shown in a viewer for all events.
- A **channel** accepts events and passes them to handlers: `T` goes both ways, so it is invariant. A payments channel must never be treated as an all-events channel, or someone could publish a shipping event to the SMS handler.

Handlers are function-typed properties (not methods), and every type parameter carries its annotation, so the compiler checks all of this:

events.ts

```ts
export interface OrderPlaced {
  readonly type: "order.placed";
  readonly orderId: string;
  readonly totalKobo: number;
}
export interface PaymentCaptured {
  readonly type: "payment.captured";
  readonly orderId: string;
  readonly amountKobo: number;
  readonly phone: string;
}
export interface OrderShipped {
  readonly type: "order.shipped";
  readonly orderId: string;
  readonly email: string;
}
export type ShopEvent = OrderPlaced | PaymentCaptured | OrderShipped;

export type Handler<in E> = (event: E) => void;

export interface EventLog<out E> {
  readonly entries: () => readonly E[];
}

export interface Channel<in out E> extends EventLog<E> {
  readonly publish: (event: E) => void;
  readonly subscribe: (handler: Handler<E>) => () => void;
}

export function createChannel<E>(): Channel<E> {
  const handlers = new Set<Handler<E>>();
  const log: E[] = [];
  return {
    publish: (event) => {
      log.push(event);
      for (const handler of handlers) handler(event);
    },
    subscribe: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    entries: () => log.slice(),
  };
}
```

Notice `Channel<in out E>`: `E` appears in `publish`'s parameter (in), and in `entries`' result (out). It also appears in `subscribe`'s parameter, inside a `Handler<E>`. A parameter of a parameter flips twice, so that use is *out*: the channel hands events *to* the handler. The compiler follows the same reasoning, which is why the annotations compile. Now the handlers and the wiring:

main.ts

```ts
import { createChannel } from "./events.js";
import type { EventLog, Handler, PaymentCaptured, ShopEvent } from "./events.js";

const audit: Handler<ShopEvent> = (event) => console.log(`audit: ${event.type} ${event.orderId}`);
const sms: Handler<PaymentCaptured> = (event) => console.log(`sms to ${event.phone}: we received ₦${(event.amountKobo / 100).toFixed(2)}`);

const payments = createChannel<PaymentCaptured>();
const everything = createChannel<ShopEvent>();

payments.subscribe(sms);
payments.subscribe(audit);
everything.subscribe(audit);

payments.publish({ type: "payment.captured", orderId: "ORD-1042", amountKobo: 1638750, phone: "+2348030000000" });
everything.publish({ type: "order.shipped", orderId: "ORD-1042", email: "ada@example.com" });

function showLog(log: EventLog<ShopEvent>): void {
  console.log("log:", log.entries().map((event) => event.type).join(", "));
}
showLog(payments);
showLog(everything);
```

Output of `npx tsx main.ts` and of the browser terminal

```ts
sms to +2348030000000: we received ₦16387.50
audit: payment.captured ORD-1042
audit: order.shipped ORD-1042
log: payment.captured
log: order.shipped
```

`payments.subscribe(audit)` is contravariance at work: a handler for any `ShopEvent` accepted where a `Handler<PaymentCaptured>` was expected. `showLog(payments)` is covariance: a `Channel<PaymentCaptured>` is used as an `EventLog<ShopEvent>`, which only reads. Now the mistakes the types are there to stop:

mistakes.ts

```ts
import { createChannel } from "./events.js";
import type { Channel, Handler, PaymentCaptured, ShopEvent } from "./events.js";

const sms: Handler<PaymentCaptured> = (event) => console.log(`sms to ${event.phone}`);
const everything = createChannel<ShopEvent>();
const payments = createChannel<PaymentCaptured>();

everything.subscribe(sms);

const widened: Channel<ShopEvent> = payments;
```

What `npx tsc --noEmit` prints

```ts
mistakes.ts:8:22 - error TS2345: Argument of type 'Handler<PaymentCaptured>' is not assignable to parameter of type 'Handler<ShopEvent>'.
  Type 'ShopEvent' is not assignable to type 'PaymentCaptured'.
    Type 'OrderPlaced' is missing the following properties from type 'PaymentCaptured': amountKobo, phone

8 everything.subscribe(sms);
                       ~~~

mistakes.ts:10:7 - error TS2322: Type 'Channel<PaymentCaptured>' is not assignable to type 'Channel<ShopEvent>'.
  Types of property 'publish' are incompatible.
    Type '(event: PaymentCaptured) => void' is not assignable to type '(event: ShopEvent) => void'.
      Types of parameters 'event' and 'event' are incompatible.
        Type 'ShopEvent' is not assignable to type 'PaymentCaptured'.
          Type 'OrderPlaced' is missing the following properties from type 'PaymentCaptured': amountKobo, phone

10 const widened: Channel<ShopEvent> = payments;
         ~~~~~~~


Found 2 errors in the same file, starting at: mistakes.ts:8
```

The SMS handler cannot listen to every event, because a shipping event has no phone number. And the payments channel cannot be treated as a channel for all events: through `widened`, anyone could `publish` an `order.shipped` event straight into the SMS handler. That second error is the mutable-array bug from the variance section, caught this time, because the channel's `publish` is a property and its type parameter is invariant.

### Testing the compatibility rules

The whole design rests on assignability, so the tests should pin assignability. A small `Assignable<From, To>` helper wraps both types in a tuple (to stop the conditional type from distributing) and answers `true` or `false`:

events.test.ts

```ts
import type { Channel, EventLog, Handler, OrderShipped, PaymentCaptured, ShopEvent } from "./events.js";

type Assignable<From, To> = [From] extends [To] ? true : false;
type Expect<T extends true> = T;
type Not<T extends boolean> = T extends true ? false : true;

type H1 = Expect<Assignable<Handler<ShopEvent>, Handler<PaymentCaptured>>>;
type H2 = Expect<Not<Assignable<Handler<PaymentCaptured>, Handler<ShopEvent>>>>;
type L1 = Expect<Assignable<EventLog<PaymentCaptured>, EventLog<ShopEvent>>>;
type L2 = Expect<Not<Assignable<EventLog<ShopEvent>, EventLog<PaymentCaptured>>>>;
type C1 = Expect<Not<Assignable<Channel<PaymentCaptured>, Channel<ShopEvent>>>>;
type C2 = Expect<Not<Assignable<Channel<ShopEvent>, Channel<PaymentCaptured>>>>;
type C3 = Expect<Assignable<Channel<OrderShipped>, EventLog<ShopEvent>>>;

function neverCalled(shipped: OrderShipped): PaymentCaptured {
  // @ts-expect-error: a shipping event is not a payment
  return shipped;
}

console.log("compiled: 7 type tests and", neverCalled.length, "expected rejection");
```

Output of `npx tsx events.test.ts` and of the browser terminal

```ts
compiled: 7 type tests and 1 expected rejection
```

Each `type` line is a test the compiler runs: if a refactor turns a `Handler` into a method, or drops `readonly` from `entries`, or makes the channel covariant, one of these lines stops compiling. The `@ts-expect-error` sits inside a function that is never called: a type test must compile, but has nothing to do at runtime. [Testing TypeScript](https://zudojs.oyinlola.site/learn/ts-testing) shows the same checks with Vitest's `expectTypeOf`.

## The type system in production

- **Keep `strict` on.** It includes `strictFunctionTypes`, without which every callback parameter is bivariant. [tsconfig in depth](https://zudojs.oyinlola.site/learn/ts-tsconfig) lists the flags.
- **Callbacks as properties, data as readonly.** Write `readonly onPaid: (event: PaymentCaptured) => void`, not `onPaid(event): void`, in your own interfaces, and take arrays you only read as `readonly T[]`. Those two habits close the two biggest holes in variance checking.
- **Distinguish shapes that must not mix.** Two domain types with the same fields are interchangeable. Add a discriminant (`kind`) or a brand wherever a mix-up costs money, as in the refund at the start.
- **Do not rely on excess property checks.** They catch typos in literals. Unknown keys in data from outside must be removed or rejected at runtime.
- **Budget your cleverness.** Measure with `--extendedDiagnostics`, look at type errors from a user's point of view, and prefer a simple type plus a runtime check plus a test over a type that computes the answer. Library authors, whose types are used thousands of times, should add `in`/`out` annotations and type tests to their central generic types.

## Practice

TRY IT YOURSELF

### Predict the compiler

For each assignment, decide whether it compiles, and why. Then check your answers by pasting the file into your editor.

predict.ts

```ts
interface Product { readonly sku: string; readonly priceKobo: number }
interface DiscountedProduct extends Product { readonly discountKobo: number }

declare const products: DiscountedProduct[];
declare const readonlyProducts: readonly DiscountedProduct[];

const a: Product[] = products;
const b: DiscountedProduct[] = readonlyProducts;
const c: (p: Product) => string = (p: DiscountedProduct) => p.sku;
const d: (p: DiscountedProduct) => string = (p: Product) => p.sku;
const e: { sku: string } = { sku: "RICE-5", priceKobo: 850000 };
const f: () => void = () => 42;
```

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Arrays and function returns are usually forgiving (covariant); function *parameters* are checked the other way round (contravariant); and a *fresh* object literal is checked for extra properties, but a variable holding the same value is not.

HINT 2

Only `b`, `c` and `e` fail: a `readonly` array cannot become mutable, `c`'s function would need `discountKobo` it might not get, and `e`'s literal has a property `{ sku: string }` does not mention.

SOLUTION

predict-answers.ts

```ts
interface Product { readonly sku: string; readonly priceKobo: number }
interface DiscountedProduct extends Product { readonly discountKobo: number }

declare const products: DiscountedProduct[];
declare const readonlyProducts: readonly DiscountedProduct[];

const a: Product[] = products;
const b: DiscountedProduct[] = readonlyProducts;
const c: (p: Product) => string = (p: DiscountedProduct) => p.sku;
const d: (p: DiscountedProduct) => string = (p: Product) => p.sku;
const e: { sku: string } = { sku: "RICE-5", priceKobo: 850000 };
const f: () => void = () => 42;
```

What `npx tsc --noEmit` prints

```ts
predict-answers.ts:8:7 - error TS4104: The type 'readonly DiscountedProduct[]' is 'readonly' and cannot be assigned to the mutable type 'DiscountedProduct[]'.

8 const b: DiscountedProduct[] = readonlyProducts;
        ~

predict-answers.ts:9:7 - error TS2322: Type '(p: DiscountedProduct) => string' is not assignable to type '(p: Product) => string'.
  Types of parameters 'p' and 'p' are incompatible.
    Property 'discountKobo' is missing in type 'Product' but required in type 'DiscountedProduct'.

9 const c: (p: Product) => string = (p: DiscountedProduct) => p.sku;
        ~

  predict-answers.ts:2:56 - 'discountKobo' is declared here.
    2 interface DiscountedProduct extends Product { readonly discountKobo: number }
                                                             ~~~~~~~~~~~~

predict-answers.ts:11:45 - error TS2353: Object literal may only specify known properties, and 'priceKobo' does not exist in type '{ sku: string; }'.

11 const e: { sku: string } = { sku: "RICE-5", priceKobo: 850000 };
                                               ~~~~~~~~~


Found 3 errors in the same file, starting at: predict-answers.ts:8
```

- `a` compiles: mutable arrays are (unsoundly) covariant.
- `b` fails: a readonly array cannot become a mutable one.
- `c` fails: the function needs `discountKobo`, but the target type may call it with a plain product (contravariance, under `strictFunctionTypes`).
- `d` compiles: a function that handles any product can handle a discounted one.
- `e` fails: a fresh literal with an extra property. Assign the literal to a variable first and it would compile.
- `f` compiles: a function returning a value fits a `void` function type.

TRY IT YOURSELF

### Annotate the variance

Add `in`, `out` or `in out` to every type parameter below, so that each annotation compiles. Then predict which of the four assignments at the end compile.

annotate.ts

```ts
interface Order { readonly id: string }
interface PaidOrder extends Order { readonly paidAt: string }

interface Report<T> { readonly rows: () => readonly T[] }
interface Importer<T> { readonly accept: (row: T) => void }
interface PriceCache<K, V> {
  readonly get: (key: K) => V | undefined;
  readonly set: (key: K, value: V) => void;
}

declare const paidReport: Report<PaidOrder>;
declare const paidImporter: Importer<PaidOrder>;
declare const orderImporter: Importer<Order>;
declare const paidCache: PriceCache<string, PaidOrder>;

const a: Report<Order> = paidReport;
const b: Importer<Order> = paidImporter;
const c: Importer<PaidOrder> = orderImporter;
const d: PriceCache<string, Order> = paidCache;
```

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

A type only ever handed *out* (as a return value) is `out`. A type only ever taken *in* (as a parameter) is `in`. A type used both ways, like a cache's value, is `in out`.

HINT 2

`Report<out T>`, `Importer<in T>`, `PriceCache<in K, in out V>`. With those, `a` and `c` compile; `b` and `d` do not.

SOLUTION

annotate-answer.ts

```ts
interface Order { readonly id: string }
interface PaidOrder extends Order { readonly paidAt: string }

interface Report<out T> { readonly rows: () => readonly T[] }
interface Importer<in T> { readonly accept: (row: T) => void }
interface PriceCache<in K, in out V> {
  readonly get: (key: K) => V | undefined;
  readonly set: (key: K, value: V) => void;
}

declare const paidReport: Report<PaidOrder>;
declare const paidImporter: Importer<PaidOrder>;
declare const orderImporter: Importer<Order>;
declare const paidCache: PriceCache<string, PaidOrder>;

const a: Report<Order> = paidReport;
const b: Importer<Order> = paidImporter;
const c: Importer<PaidOrder> = orderImporter;
const d: PriceCache<string, Order> = paidCache;
```

What `npx tsc --noEmit` prints

```ts
annotate-answer.ts:17:7 - error TS2322: Type 'Importer<PaidOrder>' is not assignable to type 'Importer<Order>'.
  Property 'paidAt' is missing in type 'Order' but required in type 'PaidOrder'.

17 const b: Importer<Order> = paidImporter;
         ~

  annotate-answer.ts:2:46 - 'paidAt' is declared here.
    2 interface PaidOrder extends Order { readonly paidAt: string }
                                                   ~~~~~~

annotate-answer.ts:19:7 - error TS2322: Type 'PriceCache<string, PaidOrder>' is not assignable to type 'PriceCache<string, Order>'.
  Types of property 'set' are incompatible.
    Type '(key: string, value: PaidOrder) => void' is not assignable to type '(key: string, value: Order) => void'.
      Types of parameters 'value' and 'value' are incompatible.
        Property 'paidAt' is missing in type 'Order' but required in type 'PaidOrder'.

19 const d: PriceCache<string, Order> = paidCache;
         ~

  annotate-answer.ts:2:46 - 'paidAt' is declared here.
    2 interface PaidOrder extends Order { readonly paidAt: string }
                                                   ~~~~~~


Found 2 errors in the same file, starting at: annotate-answer.ts:17
```

- `Report` only hands rows out: `out T`, and `a` compiles (covariance).
- `Importer` only takes rows in: `in T`. `b` fails, because an importer of paid orders cannot accept every order; `c` compiles (contravariance).
- `PriceCache` only takes keys in (`in K`), but values go both in (`set`) and out (`get`): `in out V`, so `d` fails (invariance). Writing `out V` instead would itself be an error, TS2636.

TRY IT YOURSELF

### Replace a clever type with a test

The `Reachable` type found the unreachable `"archived"` status. Write the same check as a plain runtime function, `unreachable(flow, start)`, that walks the table and returns the statuses never visited. Which version would you keep in a shop's codebase, and why?

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Keep a `Set<string>` of statuses already seen, and a queue starting with `[start]`. While the queue is not empty, take one out, skip it if already seen, otherwise mark it seen and push its `flow[status]` onto the queue.

HINT 2

At the end, `Object.keys(flow).filter((status) => !seen.has(status))` is every status the walk never reached.

SOLUTION

unreachable.ts

```ts
const ORDER_FLOW = {
  pending: ["paid", "cancelled"],
  paid: ["shipped", "refunded"],
  shipped: ["delivered", "returned"],
  returned: ["refunded"],
  delivered: [],
  cancelled: [],
  refunded: [],
  archived: [],
} as const satisfies Record<string, readonly string[]>;

function unreachable(flow: Readonly<Record<string, readonly string[]>>, start: string): string[] {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const status = queue.shift();
    if (status === undefined || seen.has(status)) continue;
    seen.add(status);
    queue.push(...(flow[status] ?? []));
  }
  return Object.keys(flow).filter((status) => !seen.has(status));
}

console.log(unreachable(ORDER_FLOW, "pending"));
```

Output of `npx tsx unreachable.ts` and of the browser terminal

```json
[ 'archived' ]
```

This is a breadth-first search ([Graph search](https://zudojs.oyinlola.site/learn/dsa-graph-search)) with a `Set` of visited statuses, the runtime twin of the `Seen` accumulator. For most teams the test is the better choice: anyone can read and debug it, it costs nothing at compile time, it works on tables loaded from a database, and a unit test asserting `[]` fails the build just as reliably. The type version earns its place only when instant editor feedback on a frequently edited table is worth its complexity.

## Recap

- TypeScript is structural: a value fits every type whose required members it has. Classes with private or `#private` members are the nominal exception. Distinguish look-alike domain types with a discriminant or a brand.
- Assignability: extra members are fine; fewer function parameters are fine; returns are covariant; a readonly property fits a mutable one (a known hole); weak types need at least one shared property.
- Excess property checks catch unknown properties in fresh literals only. Variables, spreads and non-discriminated unions slip past, and data from outside is never checked.
- Variance: out-only types are covariant, in-only types contravariant, in-and-out types invariant. Mutable arrays are unsoundly covariant, and method parameters are bivariant. Use readonly arrays and function-typed properties. `in`/`out` annotations document and check variance.
- Recursive conditional types compute: they can find unreachable states or build dotted paths. Every use runs the computation.
- A clever type costs error clarity, compile time and hard limits, and often mishandles arrays, `null` and recursion. Prefer simple types, runtime checks and tests unless the type sits at a boundary and pays for itself.

Next: [Branded types](https://zudojs.oyinlola.site/learn/ts-branded-types), where a `PaymentId` finally stops accepting an order's id.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
