---
title: "Type inference in depth — ZudoJS Academy"
description: "See how TypeScript works out the types you never wrote (literals, widening, contextual typing, inferred returns) and decide where an annotation pays off."
source: https://zudojs.oyinlola.site/learn/ts-inference
---

LEVEL 5 · LESSON 4 OF 23

Everyday types Foundation

# Type inference in depth

See how TypeScript works out the types you never wrote (literals, widening, contextual typing, inferred returns) and decide where an annotation pays off.

- **40 min** to read and try
- **You need:** Basic types
- **You build:** An order-pricing module where every annotation is there for a reason, and every inferred type is one you can predict

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Predict the type TypeScript infers for a variable, object, array or function
- Explain widening and stop it with const, as const or an annotation
- Use contextual typing, and notice when a callback loses it
- Decide which values to annotate and which to leave to inference
- Choose string over String, and explain the difference at runtime

## The order the compiler refused

A shop has a small order module. An order's status is one of three words, and `ship` only accepts orders with one of them. You build an order and pass it in:

ship.ts

```ts
type OrderStatus = "pending" | "paid" | "shipped";

function ship(order: { id: number; status: OrderStatus }): string {
  return `order #${order.id} was ${order.status}, now shipped`;
}

const order = { id: 1042, status: "paid" };
console.log(ship(order));
```

What `npx tsc --noEmit` prints

```ts
ship.ts:8:18 - error TS2345: Argument of type '{ id: number; status: string; }' is not assignable to parameter of type '{ id: number; status: OrderStatus; }'.
  Types of property 'status' are incompatible.
    Type 'string' is not assignable to type 'OrderStatus'.

8 console.log(ship(order));
                   ~~~~~


Found 1 error in ship.ts:8
```

That is odd. The status *is* `"paid"`, which is allowed. And if you write the same object straight into the call, it compiles:

ship.ts

```ts
type OrderStatus = "pending" | "paid" | "shipped";

function ship(order: { id: number; status: OrderStatus }): string {
  return `order #${order.id} was ${order.status}, now shipped`;
}

console.log(ship({ id: 1042, status: "paid" }));
```

Output of `npx tsx ship.ts` and of the browser terminal

```ts
order #1042 was paid, now shipped
```

Same value, different result. The difference is not in the value but in how TypeScript worked out its *type*. In the first version, `status` was given the type `string`, which is wider than `OrderStatus`. In the second, it was given `"paid"`. This lesson explains the rules that decide that, so this kind of error stops being a surprise. You met inference briefly in [Why TypeScript exists](https://zudojs.oyinlola.site/learn/ts-setup#inference) and [Basic types](https://zudojs.oyinlola.site/learn/ts-types); here you learn how it really works.

## Inferred and annotated types

**Type inference** is TypeScript working out a type from the code around it, usually from the value you assign. An **annotation** is a type you write yourself, after a colon. When a variable has an annotation, that is its **declared type**, and it wins:

- With an annotation, TypeScript *checks* the value against it, and from then on the variable has the annotated type, even if the value was more specific.
- Without one, TypeScript *describes* the value, and the description becomes the type.

### Seeing an inferred type

In an editor, hold the mouse over a name and it shows the type. Without an editor, there is a trick worth knowing: assign the value to a variable of type `never`. Nothing can be assigned to `never`, so the compiler refuses, and its error message names the type it inferred. Here it reveals four types at once:

probe.ts

```ts
const currency = "NGN";
let fee = 50;
const declaredFee: number = 50;
const order = { id: 1042, status: "paid" };

const probe1: never = currency;
const probe2: never = fee;
const probe3: never = declaredFee;
const probe4: never = order;
```

What `npx tsc --noEmit` prints

```ts
probe.ts:6:7 - error TS2322: Type '"NGN"' is not assignable to type 'never'.

6 const probe1: never = currency;
        ~~~~~~

probe.ts:7:7 - error TS2322: Type 'number' is not assignable to type 'never'.

7 const probe2: never = fee;
        ~~~~~~

probe.ts:8:7 - error TS2322: Type 'number' is not assignable to type 'never'.

8 const probe3: never = declaredFee;
        ~~~~~~

probe.ts:9:7 - error TS2322: Type '{ id: number; status: string; }' is not assignable to type 'never'.

9 const probe4: never = order;
        ~~~~~~


Found 4 errors in the same file, starting at: probe.ts:6
```

- `currency` is a `const` holding a string, so its type is the **literal type** `"NGN"`: a type with exactly one value. A `const` can never change, so the most precise type is safe.
- `fee` is a `let`. It may be changed later, so TypeScript gives it the general type `number`.
- `declaredFee` holds the same `50` as a `const` would, but its annotation says `number`, and the annotation wins.
- `order` is a `const`, but its *properties* are not: you can still write `order.status = "refunded"`. So `status` becomes `string`. That is the answer to the opening problem.

> TIP
>
> Use the `never` probe while you learn, then delete it. The error text is the compiler's own description of your value, which is more reliable than any guess.

## Literal types and widening

Turning a literal type such as `"paid"` into the general type `string` is called **widening**. TypeScript widens whenever a value might change later:

| Code | Inferred type | Why |
| --- | --- | --- |
| `const c = "NGN"` | `"NGN"` | A `const` binding never changes |
| `let c = "NGN"` | `string` | It may be reassigned |
| `const o = { status: "paid" }` | `{ status: string }` | Properties can be reassigned |
| `const a = ["NGN", "USD"]` | `string[]` | Elements can be replaced and pushed |
| `let n = null` or `let n;` | Follows each assignment | Nothing to infer from (see below) |

Widening is usually what you want: a `let total = 0` that could only ever hold `0` would be useless. It goes wrong when the *exact* value matters, as with a status. There are three ways to keep it.

### 1. Annotate with the type you mean

Give the object a named type. The annotation is checked against the value, and `status` then has type `OrderStatus`:

fix.ts

```ts
type OrderStatus = "pending" | "paid" | "shipped";

interface Order {
  id: number;
  status: OrderStatus;
}

function ship(order: Order): string {
  return `order #${order.id} was ${order.status}, now shipped`;
}

const order: Order = { id: 1042, status: "paid" };
console.log(ship(order));

order.status = "shipped";
console.log(order.status);
```

Output of `npx tsx fix.ts` and of the browser terminal

```ts
order #1042 was paid, now shipped
shipped
```

This is the usual fix, and the best one when the type has a name in your domain. It also keeps `status` changeable, but only to valid values.

### 2. as const: freeze the value's type

Writing `as const` after a value is a **const assertion**. It stops widening at every level, and makes every property and array `readonly`:

as-const.ts

```ts
const order = { id: 1042, status: "paid" } as const;
const currencies = ["NGN", "USD"] as const;

const probe1: never = order;
const probe2: never = currencies;

order.status = "shipped";
currencies.push("GBP");
```

What `npx tsc --noEmit` prints

```ts
as-const.ts:4:7 - error TS2322: Type '{ readonly id: 1042; readonly status: "paid"; }' is not assignable to type 'never'.

4 const probe1: never = order;
        ~~~~~~

as-const.ts:5:7 - error TS2322: Type 'readonly ["NGN", "USD"]' is not assignable to type 'never'.

5 const probe2: never = currencies;
        ~~~~~~

as-const.ts:7:7 - error TS2540: Cannot assign to 'status' because it is a read-only property.

7 order.status = "shipped";
        ~~~~~~

as-const.ts:8:12 - error TS2339: Property 'push' does not exist on type 'readonly ["NGN", "USD"]'.

8 currencies.push("GBP");
             ~~~~


Found 4 errors in the same file, starting at: as-const.ts:4
```

`currencies` became a **readonly tuple** of two exact strings, and `order` an object whose properties are fixed. Use `as const` for values that really never change: lists of currencies, roles, config defaults. Do not use it for an order whose status is supposed to move on. `as const` is not a type assertion that lies (like `as Order`, which you meet in [Type assertions](https://zudojs.oyinlola.site/learn/ts-assertions)); it only stops widening.

### 3. Let the expected type guide the literal

The inline call `ship({ id: 1042, status: "paid" })` compiled because the object was written in a place where TypeScript already knew what it should be: a parameter of type `{ id: number; status: OrderStatus }`. That is **contextual typing**, and it gets its own section below.

### null, and variables without a value

Two more cases catch people. A `let` that starts as `null`, or starts with no value at all, has nothing useful to infer from. TypeScript then lets its type **evolve**: after each assignment, the variable has the type of what was last assigned. That works in straight-line code, but a function that reads the variable later cannot know which assignment happened, so there it becomes `any`:

nulls.ts

```ts
let approvedBy = null;

let total;
total = 2500;
total = "2,500";
const probe: never = total;

function report(): string {
  return `approved by ${approvedBy}, total ${total}`;
}
```

What `npx tsc --noEmit` prints

```ts
nulls.ts:1:5 - error TS7034: Variable 'approvedBy' implicitly has type 'any' in some locations where its type cannot be determined.

1 let approvedBy = null;
      ~~~~~~~~~~

nulls.ts:3:5 - error TS7034: Variable 'total' implicitly has type 'any' in some locations where its type cannot be determined.

3 let total;
      ~~~~~

nulls.ts:6:7 - error TS2322: Type 'string' is not assignable to type 'never'.

6 const probe: never = total;
        ~~~~~

nulls.ts:9:25 - error TS7005: Variable 'approvedBy' implicitly has an 'any' type.

9   return `approved by ${approvedBy}, total ${total}`;
                          ~~~~~~~~~~

nulls.ts:9:46 - error TS7005: Variable 'total' implicitly has an 'any' type.

9   return `approved by ${approvedBy}, total ${total}`;
                                               ~~~~~


Found 5 errors in the same file, starting at: nulls.ts:1
```

The probe shows that `total` quietly became a string after holding a number. And inside `report`, both variables are `any`, which `strict` reports (TS7034 and TS7005). Annotate both, so the declaration says what the variable may hold:

nulls.ts

```ts
let approvedBy: string | null = null;
approvedBy = "Ada";

let total: number;
total = 2500;
console.log(approvedBy, total);
```

Output of `npx tsx nulls.ts` and of the browser terminal

```ts
Ada 2500
```

Now `total = "2,500"` would be an error, and `approvedBy` says what it may hold: a name, or nothing yet.

## Arrays, conditionals and mixed values

When an expression has several possible values, TypeScript combines their types. For an array, it looks at every element and builds the **best common type**: a type that fits them all, which is often a union. For a conditional expression (`a ? b : c`), the type is the union of both branches:

mixed.ts

```ts
const amounts = [2500, 700, 12000];
const lines = [2500, "delivery"];
const fee = Math.random() > 0.5 ? 10 : "free";
const pending = [];
pending.push({ id: 1, amount: 2500 });

const probe1: never = amounts;
const probe2: never = lines;
const probe3: never = fee;
const probe4: never = pending;
```

What `npx tsc --noEmit` prints

```ts
mixed.ts:7:7 - error TS2322: Type 'number[]' is not assignable to type 'never'.

7 const probe1: never = amounts;
        ~~~~~~

mixed.ts:8:7 - error TS2322: Type '(string | number)[]' is not assignable to type 'never'.

8 const probe2: never = lines;
        ~~~~~~

mixed.ts:9:7 - error TS2322: Type '"free" | 10' is not assignable to type 'never'.
  Type '"free"' is not assignable to type 'never'.

9 const probe3: never = fee;
        ~~~~~~

mixed.ts:10:7 - error TS2322: Type '{ id: number; amount: number; }[]' is not assignable to type 'never'.

10 const probe4: never = pending;
         ~~~~~~


Found 4 errors in the same file, starting at: mixed.ts:7
```

- `amounts`: all numbers, so `number[]`, widened as usual.
- `lines`: a mix, so `(string | number)[]`. Every element must now be checked before use. If you meant a fixed pair, use a tuple type ([Tuples](https://zudojs.oyinlola.site/learn/ts-tuples)).
- `fee`: a union of both branches, and the literals are kept because the variable is a `const`. (TypeScript 7 may list the members of a union in a different order from the one you wrote; the order has no meaning.)
- `pending`: an empty array starts as an "evolving" array, and its type grows with each `push`. Inside one function that works, but the type of a list should not depend on the first thing someone pushes. Write `const pending: Transfer[] = []`.

Objects returned from different branches are combined too, and the result can look strange:

shapes.ts

```ts
function check(balance: number, amount: number) {
  return balance >= amount ? { ok: true, left: balance - amount } : { ok: false, reason: "insufficient funds" };
}

const probe: never = check;
```

What `npx tsc --noEmit` prints

```ts
shapes.ts:5:7 - error TS2322: Type '(balance: number, amount: number) => { ok: boolean; left: number; reason?: undefined; } | { left?: undefined; ok: boolean; reason: string; }' is not assignable to type 'never'.

5 const probe: never = check;
        ~~~~~


Found 1 error in shapes.ts:5
```

TypeScript made both shapes the same by adding `left?: undefined` and `reason?: undefined`, and widened `true` and `false` to `boolean`. That type is hard to read and does not let callers tell the two cases apart by `ok`. When a function's result has cases, name them yourself as a union, as you will do in [Union types in depth](https://zudojs.oyinlola.site/learn/ts-unions).

## Contextual typing: types that flow inward

So far the type flowed from the value to the variable. **Contextual typing** is the other direction: the place where an expression is written already has an expected type, and TypeScript uses it to type the expression. [Typing functions](https://zudojs.oyinlola.site/learn/ts-functions#function-types), the next lesson, relies on it for callbacks. It happens in many places:

context.ts

```ts
type OrderStatus = "pending" | "paid" | "shipped";

interface Order {
  id: number;
  status: OrderStatus;
  total: number;
}

const orders: Order[] = [
  { id: 1, status: "paid", total: 12000 },
  { id: 2, status: "pending", total: 4500 },
];

const paidTotal = orders.filter((o) => o.status === "paid").reduce((sum, o) => sum + o.total, 0);

const labels: Record<OrderStatus, (id: number) => string> = {
  pending: (id) => `#${id} waiting for payment`,
  paid: (id) => `#${id} ready to ship`,
  shipped: (id) => `#${id} on its way`,
};

console.log(paidTotal);
console.log(orders.map((o) => labels[o.status](o.id)));
```

Output of `npx tsx context.ts` and of the browser terminal

```ts
12000
[ '#1 ready to ship', '#2 waiting for payment' ]
```

Not one callback parameter is annotated, and all are checked:

- The array elements are object literals written where an `Order` is expected, so `"paid"` stays a literal and is checked against `OrderStatus`. That is why the inline `ship` call at the top worked.
- `(o) => …` inside `filter`, `reduce` and `map` get `o: Order` from the array's type, and `sum` gets `number` from the starting value `0`.
- Each handler in `labels` gets `id: number` from the `Record` type. And `Record<OrderStatus, …>` requires one handler per status: forget `shipped` and it is an error.

### Where the context gets lost

Context only reaches an expression written *in* the place that has the expected type. Move a callback out into its own variable, and it has no context any more:

lost.ts

```ts
interface Order {
  id: number;
  total: number;
}

const orders: Order[] = [{ id: 1, total: 12000 }];

const isLarge = (o) => o.total > 10000;
console.log(orders.filter(isLarge));
```

What `npx tsc --noEmit` prints

```ts
lost.ts:8:18 - error TS7006: Parameter 'o' implicitly has an 'any' type.

8 const isLarge = (o) => o.total > 10000;
                   ~


Found 1 error in lost.ts:8
```

When `isLarge` is declared, TypeScript does not yet know it will be passed to `filter`. You have two good fixes: annotate the parameter, `(o: Order) => …`, or give the variable a function type, `const isLarge: (o: Order) => boolean = (o) => …`, which provides the context again.

## Inferred return types

TypeScript infers a function's return type from its `return` statements. That is convenient, and it is also where inference can hide a bug. Here are two versions of a discount function; both forget orders under ₦5,000:

discount.ts

```ts
function discountInferred(total: number) {
  if (total >= 50000) return 0.1;
  if (total >= 5000) return 0.05;
}

function discountAnnotated(total: number): number {
  if (total >= 50000) return 0.1;
  if (total >= 5000) return 0.05;
}

const price = 3000;
const toPay = price - price * discountInferred(price);
```

What `npx tsc --noEmit` prints

```ts
discount.ts:6:44 - error TS2366: Function lacks ending return statement and return type does not include 'undefined'.

6 function discountAnnotated(total: number): number {
                                             ~~~~~~

discount.ts:12:31 - error TS2532: Object is possibly 'undefined'.

12 const toPay = price - price * discountInferred(price);
                                 ~~~~~~~~~~~~~~~~~~~~~~~


Found 2 errors in the same file, starting at: discount.ts:6
```

Read where each error points:

- `discountInferred` compiled. Its inferred return type silently became `0.1 | 0.05 | undefined` (a return type keeps a union of literals as they are), and the error appears at the **caller**, on the last line. In a real project, that caller may be in another file, written by someone else, who has no idea why `undefined` is possible.
- `discountAnnotated` is reported **inside the function**, at the return type (TS2366, which [Typing functions](https://zudojs.oyinlola.site/learn/ts-functions#params-returns) meets again). The annotation is a promise, and the compiler held the function to it.

An inferred return type also changes whenever the body changes. If a teammate adds `return "free"` for VIP customers, the inferred type becomes `"free" | 0.1 | 0.05 | undefined`, and every caller in the project might break, or worse, keep compiling while doing the wrong thing. For an exported function, the return type is part of your public API; write it down so it changes only when you mean it to.

## When an annotation makes things worse

Annotations are not automatically safer. An annotation that is wider than the value throws information away. A common case is a lookup table typed as `Record<string, number>`:

fees.ts

```ts
const fees: Record<string, number> = { transfer: 10, withdrawal: 25 };

const charged = fees.tranfer;
console.log(charged, 5000 + charged);
```

Output of `npx tsx fees.ts` and of the browser terminal

```ts
undefined NaN
```

No error, and a `NaN` in your accounts. `Record<string, number>` says "any string key gives a number", so the typo `tranfer` is a perfectly good key as far as the compiler knows. Two better options:

- **No annotation.** `const fees = { transfer: 10, withdrawal: 25 }` is inferred with exactly those two keys, so `fees.tranfer` is an error.
- **`satisfies`.** Checks the value against a type *without* replacing the inferred type. You get both: the check that every fee is a number, and the exact keys.

fees.ts

```ts
const fees = { transfer: 10, withdrawal: "25" } satisfies Record<string, number>;

const charged = fees.tranfer;
```

What `npx tsc --noEmit` prints

```ts
fees.ts:1:30 - error TS2322: Type 'string' is not assignable to type 'number'.

1 const fees = { transfer: 10, withdrawal: "25" } satisfies Record<string, number>;
                               ~~~~~~~~~~

fees.ts:3:22 - error TS2551: Property 'tranfer' does not exist on type '{ transfer: number; withdrawal: string; }'. Did you mean 'transfer'?

3 const charged = fees.tranfer;
                       ~~~~~~~

  fees.ts:1:16 - 'transfer' is declared here.
    1 const fees = { transfer: 10, withdrawal: "25" } satisfies Record<string, number>;
                     ~~~~~~~~~~~~


Found 2 errors in the same file, starting at: fees.ts:1
```

Both mistakes are caught: the fee written as text, and the misspelt key. [Advanced inference](https://zudojs.oyinlola.site/learn/ts-inference-deep) compares `satisfies`, annotations and `as` in depth.

## Deciding what to annotate

REASON IT OUT

### Annotate or infer?

You are writing `pricing.ts` for the shop. Before you read the answer, decide for each of these whether you would write a type, and why:

1. The parameters of the exported `priceOrder(items, coupon)`.
2. Its return value, a `{ subtotal, discount, total }` object.
3. `const VAT_RATE = 0.075` at the top of the file.
4. `const lines = []`, filled in a loop later.
5. The callback in `items.map((item) => item.price * item.quantity)`.
6. A table of coupon codes to percentages, used as `coupons[code]`.

**Show the reasoning**

1. **Annotate.** Parameters have no value to infer from (without context, TypeScript reports TS7006). They are also the contract with every caller.
2. **Annotate**, with a named interface such as `OrderPrice`. It is exported, so its type is public API. The annotation catches a missing field inside the function, and a later change to the body cannot silently change what callers receive.
3. **Infer.** The value says it all. The inferred type is the literal `0.075`, which is even more precise than `number`.
4. **Annotate**: `const lines: InvoiceLine[] = []`. An empty array gives inference nothing to work with.
5. **Infer.** Contextual typing gives `item` the element type of `items`. An annotation would only repeat it.
6. **It depends on the question you ask.** For a fixed set of codes known at compile time, infer (or use `satisfies`) so typos are caught. For codes loaded from a database at runtime, the keys really are any string: annotate `Record<string, number>`, and handle the missing case, because `coupons[code]` may be `undefined` even though the type says `number`.

The rule of thumb from the answers: **annotate at boundaries, infer inside.** Boundaries are where your code meets other code or other people: function parameters, exported functions' return types, public class members, and empty containers. Inside a function body, let inference do the work.

| Situation | Annotate? | Reason |
| --- | --- | --- |
| Function parameters | Yes | Nothing to infer from; it is the contract |
| Return type of an exported function | Yes | Errors stay inside the function; the API cannot change by accident |
| Return type of a small local helper | Optional | Inference is fine when every caller is on the same screen |
| `const` with a value | No | Inference is exact |
| `let` starting with `null`, or with no value | Yes | Otherwise the type changes with each assignment, and is `any` inside functions |
| Empty array or `new Map()` | Yes | Nothing to infer from |
| Object that must match a domain type | Yes (or `satisfies`) | Stops widening, catches missing and extra properties |
| Callback passed inline | No | Contextual typing does it |

Here is the pricing module written that way. Count the annotations: every one is at a boundary.

pricing.ts

```ts
export interface OrderItem {
  name: string;
  price: number;
  quantity: number;
}

export interface OrderPrice {
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
}

const VAT_RATE = 0.075;
const coupons = { WELCOME10: 0.1, STAFF25: 0.25 } satisfies Record<string, number>;
type CouponCode = keyof typeof coupons;

export function priceOrder(items: readonly OrderItem[], coupon?: CouponCode): OrderPrice {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = coupon === undefined ? 0 : Math.round(subtotal * coupons[coupon]);
  const vat = Math.round((subtotal - discount) * VAT_RATE);
  return { subtotal, discount, vat, total: subtotal - discount + vat };
}

const basket: OrderItem[] = [
  { name: "Rice 5kg", price: 9500, quantity: 1 },
  { name: "Palm oil 1L", price: 2800, quantity: 2 },
];

console.log(priceOrder(basket));
console.log(priceOrder(basket, "WELCOME10"));
```

Output of `npx tsx pricing.ts` and of the browser terminal

```json
{ subtotal: 15100, discount: 0, vat: 1133, total: 16233 }
{ subtotal: 15100, discount: 1510, vat: 1019, total: 14609 }
```

`keyof typeof coupons` turns the table's keys into the union `"WELCOME10" | "STAFF25"`, so `priceOrder(basket, "WELCOM10")` would not compile ([Advanced and utility types](https://zudojs.oyinlola.site/learn/ts-advanced#keyof-typeof) explains `keyof` and `typeof`, and [Type operators](https://zudojs.oyinlola.site/learn/ts-type-operators#values-to-unions) shows more ways to turn data into unions). That only works because `coupons` was *not* annotated with `Record<string, number>`.

## string, not String

You were told in [Basic types](https://zudojs.oyinlola.site/learn/ts-types#primitives) to write `string`, not `String`. Here is why. JavaScript has **primitive** strings, numbers and booleans, and also **wrapper objects** for each, made with `new String(…)`, `new Number(…)` and `new Boolean(…)`. The wrappers behave differently in ways that cause real bugs:

wrappers.js

```ts
const code = "NGN";
const wrapped = new String("NGN");

console.log(typeof code, typeof wrapped);
console.log(code === "NGN", wrapped === "NGN");
console.log(new String("NGN") === new String("NGN"));

const blocked = new Boolean(false);
if (blocked) console.log("account treated as blocked!");
```

Output of `node wrappers.js` and of the browser terminal

```ts
string object
true false
false
account treated as blocked!
```

A wrapper is an object, so `===` compares identity, not text, and every object is truthy, even a `Boolean` that holds `false`. In TypeScript, the lowercase `string` is the primitive type, and the capitalised `String` is the type of the wrapper object (and also of anything that has the string methods, which includes primitives). So the two are not the same:

wrappers.ts

```ts
function formatCode(code: String): string {
  return code.toUpperCase();
}

const fromForm = new String("ngn");
const cleaned: string = fromForm;
console.log(formatCode("usd"), cleaned);
```

What `npx tsc --noEmit` prints

```ts
wrappers.ts:6:7 - error TS2322: Type 'String' is not assignable to type 'string'.
  'string' is a primitive, but 'String' is a wrapper object. Prefer using 'string' when possible.

6 const cleaned: string = fromForm;
        ~~~~~~~


Found 1 error in wrappers.ts:6
```

A `String` parameter accepts both primitives and wrapper objects, so wrapper objects can flow into your code unnoticed. A `string` parameter accepts only real strings, and the compiler even explains the difference. The rule has no exceptions in everyday code: `string`, `number`, `boolean`, `bigint`, `symbol`, always lowercase. The same goes for `Object`, which [Special types: any, unknown, never and friends](https://zudojs.oyinlola.site/learn/ts-special-types) covers next to `object` and `{}`.

## Testing inferred types

Inferred types change when code changes. When a type matters, for example that an order's status stays a union and does not quietly widen to `string`, you can pin it down with a type test. You met `// @ts-expect-error` in [What the TypeScript compiler does](https://zudojs.oyinlola.site/learn/ts-compiler#testing); here it guards inference:

order.types.ts

```ts
type OrderStatus = "pending" | "paid" | "shipped";

interface Order {
  id: number;
  status: OrderStatus;
}

function createOrder(id: number) {
  return { id, status: "pending" as OrderStatus };
}

const order = createOrder(1);

const statusIsNarrow: OrderStatus = order.status;
const fitsOrder: Order = order;

// @ts-expect-error: "refunded" is not a status
order.status = "refunded";

console.log(statusIsNarrow, fitsOrder.id);
```

Output of `npx tsx order.types.ts` and of the browser terminal

```ts
pending 1
```

If someone later removes `as OrderStatus` from `createOrder`, the status widens to `string`. Then `statusIsNarrow` fails to compile, and the `@ts-expect-error` becomes unused and fails too. `npm run check` catches the change before anyone ships it. (Here `as OrderStatus` is safe because `"pending"` really is a status; it would be cleaner still to annotate the return type as `Order`, which is the lesson of the previous section.)

## In production code

- **Annotate every exported function's parameters and return type.** The `isolatedDeclarations` setting in `tsconfig.json` enforces this, so that tools can write `.d.ts` files for each file without running the whole checker. Large monorepos turn it on for faster builds.
- **Name your domain types** (`Order`, `OrderStatus`) and annotate objects that must match them, instead of relying on a literal staying narrow.
- **Do not annotate what inference already says exactly.** `const total: number = subtotal + vat` adds noise and can hide a more precise type.
- **Be careful with `Record<string, …>`** for data whose keys you know. It turns typos into `undefined` at runtime.
- **Inference never looks at runtime data.** The type of `JSON.parse(body)` is `any` however carefully you annotate around it. Validation is a separate job ([Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation)).

## Practice

TRY IT YOURSELF

### Make the config compile

This payment config does not compile when it is passed to `connect`. Explain why, then fix it in two different ways: once with an annotation, once without one.

config.ts

```ts
type Provider = "paystack" | "flutterwave";

interface GatewayConfig {
  provider: Provider;
  timeoutMs: number;
}

function connect(config: GatewayConfig): string {
  return `${config.provider} (${config.timeoutMs}ms)`;
}

const config = { provider: "paystack", timeoutMs: 5000 };
console.log(connect(config));
```

What `npx tsc --noEmit` prints

```ts
config.ts:13:21 - error TS2345: Argument of type '{ provider: string; timeoutMs: number; }' is not assignable to parameter of type 'GatewayConfig'.
  Types of property 'provider' are incompatible.
    Type 'string' is not assignable to type 'Provider'.

13 console.log(connect(config));
                       ~~~~~~


Found 1 error in config.ts:13
```

**Show a solution**

`config` is inferred on its own line, before TypeScript knows it will go to `connect`, so `provider` widens to `string`. Fix it by annotating, or by keeping the literal with `as const`:

config.ts

```ts
type Provider = "paystack" | "flutterwave";

interface GatewayConfig {
  provider: Provider;
  timeoutMs: number;
}

function connect(config: GatewayConfig): string {
  return `${config.provider} (${config.timeoutMs}ms)`;
}

const annotated: GatewayConfig = { provider: "paystack", timeoutMs: 5000 };
const frozen = { provider: "flutterwave", timeoutMs: 8000 } as const;

console.log(connect(annotated));
console.log(connect(frozen));
```

Output of `npx tsx config.ts` and of the browser terminal

```ts
paystack (5000ms)
flutterwave (8000ms)
```

The annotation is the better default: the object is checked where it is written, including missing and misspelt properties. `as const` suits a value that never changes, and also makes it `readonly`.

TRY IT YOURSELF

### Move the error to where the bug is

This compiles, but prints something wrong. Find the bug, then add the one annotation that makes the compiler point at it, and fix it.

shipping.ts

```ts
function shippingFee(state: string, weightKg: number) {
  if (state === "Lagos") return weightKg <= 5 ? 1500 : 3000;
  if (state === "Abuja") return weightKg <= 5 ? 2500 : 4500;
}

const fee = shippingFee("Kano", 3);
console.log(`Shipping: ₦${fee}`);
```

Output of `npx tsx shipping.ts` and of the browser terminal

```ts
Shipping: ₦undefined
```

**Show a solution**

For every state except Lagos and Abuja the function falls off the end, so its inferred return type is `1500 | 2500 | 3000 | 4500 | undefined`, and the template string happily prints `undefined`. Annotate the return type as `number` and TS2366 appears inside `shippingFee`. Then add the missing case:

shipping.ts

```ts
function shippingFee(state: string, weightKg: number): number {
  if (state === "Lagos") return weightKg <= 5 ? 1500 : 3000;
  if (state === "Abuja") return weightKg <= 5 ? 2500 : 4500;
  return weightKg <= 5 ? 3500 : 6000;
}

const fee = shippingFee("Kano", 3);
console.log(`Shipping: ₦${fee}`);
```

Output of `npx tsx shipping.ts` and of the browser terminal

```ts
Shipping: ₦3500
```

TRY IT YOURSELF

### Handlers without annotations

Write a `notifiers` object with one function per channel, `"sms"`, `"email"` and `"push"`, each taking `(to: string, message: string)` and returning a string. Type the object once, so that none of the three functions needs a parameter annotation, and so that forgetting a channel is an error.

**Show a solution**

notify.ts

```ts
type Channel = "sms" | "email" | "push";

const notifiers: Record<Channel, (to: string, message: string) => string> = {
  sms: (to, message) => `SMS to ${to}: ${message.slice(0, 20)}`,
  email: (to, message) => `Email to ${to}: ${message}`,
  push: (to, message) => `Push to device ${to}: ${message}`,
};

const channels: Channel[] = ["sms", "email"];
for (const channel of channels) {
  console.log(notifiers[channel]("Ada", "Your transfer of ₦25,000 was successful"));
}
```

Output of `npx tsx notify.ts` and of the browser terminal

```ts
SMS to Ada: Your transfer of ₦25
Email to Ada: Your transfer of ₦25,000 was successful
```

The `Record<Channel, …>` annotation gives every function its parameter types through contextual typing, and requires exactly one entry per channel. Here `Record` is the right choice, unlike the fee table earlier, because the keys are a fixed union, not `string`.

## Recap

- Inference describes a value; an annotation declares a type, checks the value against it, and wins. Use a `never` probe or your editor to see an inferred type.
- `const` primitives keep literal types. `let` variables, object properties and array elements widen, because they can change.
- Stop widening with an annotation of a named type (usually best), with `as const` (for values that never change), or by writing the value where an expected type exists.
- Contextual typing gives inline callbacks and object literals their types. A callback moved into its own variable loses that context.
- Inferred return types move errors to callers and change with the body. Annotate exported functions' return types.
- Annotate at boundaries (parameters, exports, empty containers, `null` starts), infer inside. An annotation that is too wide, like `Record<string, number>`, throws information away; `satisfies` checks without widening.
- Write `string`, `number` and `boolean`, never the wrapper types `String`, `Number` and `Boolean`.

Next: [Typing functions](https://zudojs.oyinlola.site/learn/ts-functions), where parameters, return types and callbacks get the full treatment.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
