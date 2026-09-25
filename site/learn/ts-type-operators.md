---
title: "Type operators — ZudoJS Academy"
description: "Derive types from values and from other types with keyof, typeof and indexed access, learn their edge cases, and build an order workflow from one table."
source: https://zudojs.oyinlola.site/learn/ts-type-operators
---

LEVEL 6 · LESSON 1 OF 22

Type operators Advanced

# Type operators

Derive types from values and from other types with keyof, typeof and indexed access, learn their edge cases, and build an order workflow from one table.

- **50 min** to read and try
- **You need:** The TypeScript course, especially Generics, Advanced and utility types, and Async TypeScript
- **You build:** An order workflow for a shop whose statuses, labels, fees and allowed transitions are all derived from one runtime table

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Use typeof, keyof and indexed access to derive types instead of repeating them
- Predict keyof for unions, intersections, arrays, tuples and index signatures
- Turn as const data into unions with (typeof X)[number] and (typeof X)[keyof typeof X]
- Explain why obj[key] = value fails for a union key and why Object.keys returns string[]
- Build a typed state machine from a runtime table, and test the derived types

## One new status, four places to change

An online shop's order module keeps its order statuses in several places: a union type for the code, a list for the admin dropdown, and a table of labels for the customer's order page. The warehouse team asks for a new status, `"on_hold"`. A developer adds it to the dropdown list and ships:

statuses.ts

```ts
type OrderStatus = "pending" | "paid" | "shipped" | "delivered";

const DROPDOWN: string[] = ["pending", "paid", "shipped", "delivered", "on_hold"];

const LABELS: Record<OrderStatus, string> = {
  pending: "Awaiting payment",
  paid: "Paid",
  shipped: "On the way",
  delivered: "Delivered",
};

for (const status of DROPDOWN) {
  try {
    console.log(status, "->", LABELS[status as OrderStatus].toUpperCase());
  } catch (error) {
    console.log(status, "->", String(error));
  }
}
```

Output of `npx tsx statuses.ts` and of the browser terminal

```ts
pending -> AWAITING PAYMENT
paid -> PAID
shipped -> ON THE WAY
delivered -> DELIVERED
on_hold -> TypeError: Cannot read properties of undefined (reading 'toUpperCase')
```

The compiler checked everything it was shown, and the page still crashed. The dropdown's `string[]` annotation threw away the literal values, and the `as OrderStatus` told the compiler to stop asking. The real bug is older than either line: the list of statuses was written down **three times**, and nothing forced the three copies to agree.

The fix is to write the list once and *compute* everything else from it. TypeScript's **type operators** do the computing: `typeof` turns a value into a type, `keyof` turns an object type into the union of its keys, and **indexed access**, `T[K]`, looks up the type of a property. You met all three briefly in [Advanced and utility types](https://zudojs.oyinlola.site/learn/ts-advanced). This lesson goes through their exact rules and edge cases, which you need before the rest of this course builds [utility](https://zudojs.oyinlola.site/learn/ts-utility-types), [mapped](https://zudojs.oyinlola.site/learn/ts-mapped-types) and [conditional](https://zudojs.oyinlola.site/learn/ts-conditional-types) types on top of them.

## Values and types live in different worlds

Every name in a TypeScript file lives in the **value space** (things that exist when the program runs), the **type space** (things the compiler uses and then erases), or both. `const`, `let` and functions are values. `type` and `interface` are types. A `class` and an `enum` are both: a runtime object and a type with the same name. Using a name in the wrong world is an error:

spaces.ts

```ts
const SHIPPING_ZONES = ["lagos", "abuja", "port-harcourt"];
type OrderStatus = "pending" | "paid";

type Zone = SHIPPING_ZONES;
const defaultStatus = OrderStatus;
```

What `npx tsc --noEmit` prints

```ts
spaces.ts:4:13 - error TS2749: 'SHIPPING_ZONES' refers to a value, but is being used as a type here. Did you mean 'typeof SHIPPING_ZONES'?

4 type Zone = SHIPPING_ZONES;
              ~~~~~~~~~~~~~~

spaces.ts:5:23 - error TS2693: 'OrderStatus' only refers to a type, but is being used as a value here.

5 const defaultStatus = OrderStatus;
                        ~~~~~~~~~~~


Found 2 errors in the same file, starting at: spaces.ts:4
```

The type operators are the bridges and the tools inside the type world:

| Operator | Takes | Gives | Example |
| --- | --- | --- | --- |
| `typeof x` (in a type position) | a value's name | its type | `typeof SHIPPING_ZONES` is `string[]` |
| `keyof T` | a type | the union of its keys | `keyof { a: 1; b: 2 }` is `"a" \| "b"` |
| `T[K]` | a type and a key type | the property's type | `{ a: number }["a"]` is `number` |

All three run only in the compiler. None of them exists in the JavaScript that runs, which is why the runtime data (a list, a table) must still be written as a value, and the types derived from it.

## typeof: the type of a value

In an expression, `typeof x` is the JavaScript operator that returns a string such as `"number"`. In a type position (after `:`, in a `type` alias, inside `<>`) it is a **type query**: "the type the compiler has for this name". The type it returns is the *declared* type, with the same widening rules as [Type inference in depth](https://zudojs.oyinlola.site/learn/ts-inference#widening). To see the results, this course uses the two helpers you met in [Async TypeScript](https://zudojs.oyinlola.site/learn/ts-async#promise-type): `Equal<A, B>` is `true` only when two types are identical, and `Expect` refuses to compile unless it gets `true`.

type-tests.ts

```ts
export type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export type Expect<T extends true> = T;
```

typeof.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

const vatRate = 0.075;
let currency = "NGN";
const shop = { name: "Ada Stores", city: "Lagos", openingYear: 2019 };
const frozenShop = { name: "Ada Stores", city: "Lagos" } as const;

function priceWithVat(kobo: number): number {
  return Math.round(kobo * (1 + vatRate));
}

type T1 = Expect<Equal<typeof vatRate, 0.075>>;
type T2 = Expect<Equal<typeof currency, string>>;
type T3 = Expect<Equal<typeof shop, { name: string; city: string; openingYear: number }>>;
type T4 = Expect<Equal<typeof frozenShop, { readonly name: "Ada Stores"; readonly city: "Lagos" }>>;
type T5 = Expect<Equal<typeof priceWithVat, (kobo: number) => number>>;
type T6 = Expect<Equal<typeof shop.city, string>>;

console.log(priceWithVat(1_000_000), currency, shop.city);
```

Output of `npx tsx typeof.ts` and of the browser terminal

```ts
1075000 NGN Lagos
```

This file compiling is the proof that all six equalities hold:

- A `const` number keeps its literal type, `0.075`. A `let` widens to `string`, because it may be reassigned.
- Object properties are widened (`name: string`), because properties of a normal object can change. `as const` keeps the literals and adds `readonly`.
- A function's type is its signature. `typeof shop.city` follows a property path.

### typeof and classes

A class name in a type position means the *instance* type. `typeof` the class is the type of the class object itself, the constructor, with its static members. The two are easy to mix up when you store classes in a registry:

classes.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

class Invoice {
  static prefix = "INV";
  constructor(readonly number: number, readonly totalKobo: number) {}
  label(): string {
    return `${Invoice.prefix}-${String(this.number).padStart(4, "0")}`;
  }
}

type Instance = Invoice;
type Constructor = typeof Invoice;

type C1 = Expect<Equal<Constructor["prefix"], string>>;
type C2 = Expect<Equal<InstanceType<Constructor>, Invoice>>;

const factories: Record<string, Constructor> = { invoice: Invoice };
const created: Instance = new factories.invoice(42, 1_500_000);
console.log(created.label(), created.totalKobo);
```

Output of `npx tsx classes.ts` and of the browser terminal

```ts
INV-0042 1500000
```

`Record<string, Invoice>` would hold invoices; `Record<string, typeof Invoice>` holds the class, so you can call `new` on its values. `InstanceType` goes back from the constructor type to the instance type; [Utility types](https://zudojs.oyinlola.site/learn/ts-utility-types) shows how it is built.

### What typeof cannot take

A type query accepts a name, optionally followed by property accesses. It cannot run code, so a function call is a syntax error:

typeof-call.ts

```ts
function loadShop() {
  return { name: "Ada Stores", rating: 4.8 };
}

type Shop = typeof loadShop();
```

What `npx tsc --noEmit` prints

```ts
typeof-call.ts:5:28 - error TS1005: ';' expected.

5 type Shop = typeof loadShop();
                             ~

typeof-call.ts:5:29 - error TS1109: Expression expected.

5 type Shop = typeof loadShop();
                              ~


Found 2 errors in the same file, starting at: typeof-call.ts:5
```

To get what a function returns, take its type and ask for the return type: `ReturnType<typeof loadShop>`. Types never evaluate your code; they only describe it.

## keyof: the keys of a type

For an ordinary object type, `keyof` gives the union of the property names as string literal types, including optional properties and methods. The interesting cases are the others. Each line below is a checked fact:

keyof.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

interface Product {
  sku: string;
  name: string;
  priceKobo: number;
  discountKobo?: number;
  describe(): string;
}

interface Service {
  sku: string;
  name: string;
  hours: number;
}

type K1 = Expect<Equal<keyof Product, "sku" | "name" | "priceKobo" | "discountKobo" | "describe">>;
type K2 = Expect<Equal<keyof (Product | Service), "sku" | "name">>;
type K3 = Expect<Equal<keyof (Product & Service), keyof Product | "hours">>;
type K4 = Expect<Equal<keyof { [sku: string]: number }, string | number>>;
type K5 = Expect<Equal<keyof Record<"lagos" | "abuja", number>, "lagos" | "abuja">>;
type K6 = Expect<Equal<keyof { 0: "first"; 1: "second" }, 0 | 1>>;
type K7 = Expect<Equal<keyof {}, never>>;

console.log("all keyof facts hold");
```

Output of `npx tsx keyof.ts` and of the browser terminal

```ts
all keyof facts hold
```

Two of these deserve a second look, because they surprise almost everyone.

**A union has fewer keys, not more** (`K2`). A value of type `Product | Service` might be either, so the only keys you can safely read are those both have. An intersection, `Product & Service`, has every property of both, so its keys are the union of both key sets (`K3`). Keys and values move in opposite directions: that is the set logic from [Union types in depth](https://zudojs.oyinlola.site/learn/ts-unions#sets) seen from the other side.

**A string index signature has `string | number` keys** (`K4`). JavaScript turns number keys into strings, so `stock[42]` is the same as `stock["42"]`, and TypeScript allows numbers wherever a string index exists. Numeric literal keys stay numbers (`K6`). So `keyof T` is not always a set of strings.

### keyof includes more than strings

In a generic function, `K extends keyof T` may be a `string`, a `number` or a `symbol`. That matters as soon as you build a string from a key:

key-label.ts

```ts
function fieldLabel<T>(key: keyof T): string {
  return `field ${key}`;
}
```

What `npx tsc --noEmit` prints

```ts
key-label.ts:2:19 - error TS2731: Implicit conversion of a 'symbol' to a 'string' will fail at runtime. Consider wrapping this expression in 'String(...)'.

2   return `field ${key}`;
                    ~~~


Found 1 error in key-label.ts:2
```

A template literal would call `String()` on a symbol, which throws. Say which keys you mean: `keyof T & string` keeps only the string keys (an intersection of a key union with `string` drops the numbers and symbols). Or convert explicitly with `String(key)` when symbols really can occur.

### keyof on arrays and tuples

Arrays are objects too. `keyof` of an array type includes `number` (every index), `"length"`, and every method name (`"push"`, `"map"`, …). A tuple type adds its own position keys as strings, `"0"`, `"1"`, and so on. You rarely want `keyof` on an array; you want `T[number]`, the element type, which comes next.

## Indexed access: looking up a property's type

`T[K]` looks up the type of property `K` in `T`, exactly as `obj[key]` looks up a value. `K` must be a type, and it may be a union:

lookup.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

interface Order {
  id: string;
  status: "pending" | "paid" | "shipped";
  customer: { name: string; address: { city: string; state: string } };
  lines: { sku: string; quantity: number; priceKobo: number }[];
  couponCode?: string;
}

type I1 = Expect<Equal<Order["status"], "pending" | "paid" | "shipped">>;
type I2 = Expect<Equal<Order["id" | "status"], string>>;
type I3 = Expect<Equal<Order["customer"]["address"]["city"], string>>;
type I4 = Expect<Equal<Order["lines"][number], { sku: string; quantity: number; priceKobo: number }>>;
type I5 = Expect<Equal<Order["lines"][number]["quantity"], number>>;
type I6 = Expect<Equal<Order["couponCode"], string | undefined>>;

type OrderLine = Order["lines"][number];
function lineTotal(line: OrderLine): number {
  return line.quantity * line.priceKobo;
}
console.log(lineTotal({ sku: "TOTE-01", quantity: 3, priceKobo: 450_000 }));
```

Output of `npx tsx lookup.ts` and of the browser terminal

```ts
1350000
```

- `Order["id" | "status"]` is the union of both property types, `string | "pending" | …`, which simplifies to `string` because every status is already a string (`I2`).
- Lookups chain, like `obj.a.b` (`I3`).
- `[number]` on an array type gives the element type: "what you get when you index with any number" (`I4`). That is how `OrderLine` gets a name without anyone writing it twice.
- An optional property's type includes `undefined` (`I6`).

### Tuples: positions and length

On a tuple, a numeric literal picks one position, `[number]` gives the union of all positions, and `["length"]` is a literal number:

tuples.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

type StatementRow = [date: string, description: string, amountKobo: number];

type R1 = Expect<Equal<StatementRow[0], string>>;
type R2 = Expect<Equal<StatementRow[2], number>>;
type R3 = Expect<Equal<StatementRow[number], string | number>>;
type R4 = Expect<Equal<StatementRow["length"], 3>>;

const row: StatementRow = ["2026-09-24", "POS purchase", -1_250_000];
console.log(row[1], row.length);
```

Output of `npx tsx tuples.ts` and of the browser terminal

```ts
POS purchase 3
```

### Mistakes indexed access catches

Two errors come up constantly. Indexing with a key that does not exist is refused, just like reading a missing property. And the index must be a *type*, so a variable needs `typeof`:

lookup-errors.ts

```ts
interface Order {
  id: string;
  status: "pending" | "paid";
}

type Total = Order["total"];

const field = "status";
type FieldType = Order[field];
```

What `npx tsc --noEmit` prints

```ts
lookup-errors.ts:6:20 - error TS2339: Property 'total' does not exist on type 'Order'.

6 type Total = Order["total"];
                     ~~~~~~~

lookup-errors.ts:9:24 - error TS2538: Type 'field' cannot be used as an index type.

9 type FieldType = Order[field];
                         ~~~~~

lookup-errors.ts:9:24 - error TS2749: 'field' refers to a value, but is being used as a type here. Did you mean 'typeof field'?

9 type FieldType = Order[field];
                         ~~~~~


Found 3 errors in the same file, starting at: lookup-errors.ts:6
```

The last error even suggests the fix: `Order[typeof field]`. Because `field` is a `const`, its type is the literal `"status"`, so the lookup gives `"pending" | "paid"`.

## From data to unions: (typeof X)[number] and friends

Now the fix for the opening problem. Write the list of statuses once, as a value, with `as const` so the literals survive. Then derive the union from it:

statuses.ts

```ts
export const ORDER_STATUSES = ["pending", "paid", "shipped", "delivered", "on_hold"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const LABELS: Record<OrderStatus, string> = {
  pending: "Awaiting payment",
  paid: "Paid",
  shipped: "On the way",
  delivered: "Delivered",
  on_hold: "On hold",
};

for (const status of ORDER_STATUSES) {
  console.log(status, "->", LABELS[status].toUpperCase());
}
```

Output of `npx tsx statuses.ts` and of the browser terminal

```ts
pending -> AWAITING PAYMENT
paid -> PAID
shipped -> ON THE WAY
delivered -> DELIVERED
on_hold -> ON HOLD
```

Read the type from the inside out: `typeof ORDER_STATUSES` is `readonly ["pending", "paid", "shipped", "delivered", "on_hold"]`, and `[number]` asks for the type of any element: the union of the five literals. The parentheses are optional (`typeof ORDER_STATUSES[number]` parses the same way) but make the order obvious. Now the dropdown loops over the same list the type comes from, the `as` is gone, and `LABELS` is `Record<OrderStatus, string>`, which refuses to compile until `on_hold` has a label. One change, one place.

### Objects: keys and values

When the data is an object, `keyof typeof` gives its keys, and indexing with those keys gives the union of its values. This is the `as const` object pattern from [Enums and their alternatives](https://zudojs.oyinlola.site/learn/ts-enums#alternatives), now with every piece explained. (The type tests use the same helper file as before.)

type-tests.ts

```ts
export type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export type Expect<T extends true> = T;
```

fees.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

const DELIVERY_FEES = {
  lagos: 150_000,
  abuja: 250_000,
  "port-harcourt": 300_000,
} as const;

type Zone = keyof typeof DELIVERY_FEES;
type Fee = (typeof DELIVERY_FEES)[Zone];

type F1 = Expect<Equal<Zone, "lagos" | "abuja" | "port-harcourt">>;
type F2 = Expect<Equal<Fee, 150_000 | 250_000 | 300_000>>;

function deliveryFee(zone: Zone): number {
  return DELIVERY_FEES[zone];
}
console.log(deliveryFee("abuja"));
```

Output of `npx tsx fees.ts` and of the browser terminal

```ts
250000
```

### Checking the data without losing it: satisfies

Annotating the object would check it, but destroy what you want to derive:

annotated-fees.ts

```ts
const DELIVERY_FEES: Record<string, number> = {
  lagos: 150_000,
  abuja: 250_000,
};

type Zone = keyof typeof DELIVERY_FEES;
const zone: Zone = "timbuktu";
const fee: 150_000 = DELIVERY_FEES.lagos;
```

What `npx tsc --noEmit` prints

```ts
annotated-fees.ts:8:7 - error TS2322: Type 'number' is not assignable to type '150000'.

8 const fee: 150_000 = DELIVERY_FEES.lagos;
        ~~~


Found 1 error in annotated-fees.ts:8
```

Only one line fails, and that is the problem. With the annotation, `typeof DELIVERY_FEES` is just `Record<string, number>`: `Zone` became `string`, so `"timbuktu"` is a valid zone, and every fee is a plain `number` (possibly `undefined` if you turn on `noUncheckedIndexedAccess`). The annotation wins over the value: the type of a variable is what you declared, not what you assigned. `satisfies` checks the value against a type and keeps the value's own type, so you get both:

checked-fees.ts

```ts
const DELIVERY_FEES = {
  lagos: 150_000,
  abuja: 250_000,
  "port-harcourt": 300_000,
} as const satisfies Record<string, number>;

type Zone = keyof typeof DELIVERY_FEES;
const zones = Object.keys(DELIVERY_FEES);
const cheapest: Zone = "lagos";
console.log(zones, DELIVERY_FEES[cheapest]);
```

Output of `npx tsx checked-fees.ts` and of the browser terminal

```json
[ 'lagos', 'abuja', 'port-harcourt' ] 150000
```

### Why Object.keys returns string[]

Notice `zones` above: `Object.keys` returns `string[]`, not `Zone[]`, even for a literal object. That is deliberate. TypeScript's types say what an object has *at least*; a value may carry more properties than its type mentions:

extra-keys.ts

```ts
interface Stock {
  rice: number;
  beans: number;
}

function totalBags(stock: Stock): number {
  let total = 0;
  for (const key of Object.keys(stock)) {
    total += stock[key as keyof Stock];
  }
  return total;
}

const warehouse = { rice: 12, beans: 5, lastCountedBy: "Tunde" };
console.log(totalBags(warehouse));
```

Output of `npx tsx extra-keys.ts` and of the browser terminal

```ts
17Tunde
```

Passing `warehouse` is legal: it has everything a `Stock` needs. But `Object.keys` also returned `"lastCountedBy"`, and the `as keyof Stock` promised it could not. Twelve plus five plus a name made a string. If `Object.keys` were typed `(keyof T)[]`, every such loop would compile with the same bug. The safe patterns: loop over a known list of keys (the `as const` array), or read each named property. Use a `keyof` cast only on objects you created yourself, such as the `as const` table above.

## Lookups in generic functions

[Generics](https://zudojs.oyinlola.site/learn/ts-generics#constraints) introduced the classic pair `K extends keyof T` and `T[K]`. Reading works for any key. Writing is where the rules get strict. Here is a product editor that updates one field at a time:

update.ts

```ts
interface Product {
  name: string;
  priceKobo: number;
  inStock: boolean;
}

function updateField(product: Product, key: keyof Product, value: Product[keyof Product]): void {
  product[key] = value;
}
```

What `npx tsc --noEmit` prints

```ts
update.ts:8:3 - error TS2322: Type 'string | number | boolean' is not assignable to type 'never'.
  Type 'string' is not assignable to type 'never'.

8   product[key] = value;
    ~~~~~~~~~~~~


Found 1 error in update.ts:8
```

The error says `never`, and it is right. `key` is `"name" | "priceKobo" | "inStock"` and `value` is `string | number | boolean`, and the two are not connected: `updateField(tote, "priceKobo", "free")` would match the signature. When you write through a union of keys, TypeScript requires a value that fits *every* property it might land in: `string & number & boolean`, which is `never`. A type parameter connects the key to its value:

update.ts

```ts
interface Product {
  name: string;
  priceKobo: number;
  inStock: boolean;
}

function updateField<K extends keyof Product>(product: Product, key: K, value: Product[K]): void {
  product[key] = value;
}

const tote: Product = { name: "Ankara tote bag", priceKobo: 450_000, inStock: true };
updateField(tote, "priceKobo", 399_000);
updateField(tote, "inStock", false);
console.log(tote);
```

Output of `npx tsx update.ts` and of the browser terminal

```json
{ name: 'Ankara tote bag', priceKobo: 399000, inStock: false }
```

Now each call picks one `K`, and `value` must be `Product[K]` for that `K`: `updateField(tote, "priceKobo", "free")` fails, and inside the function the assignment is allowed because both sides are "the property `K` of `Product`". Reading follows the same rule in reverse: `product[key]` with a generic `K` has type `Product[K]`, precise at every call site.

### A union of tuples has unusable methods

The same "must fit every member" rule explains an error you will meet with `as const` tables. Indexing a table with a union key gives a union of tuple types, and calling a method on a union requires arguments that suit every member:

includes.ts

```ts
const NEXT = {
  pending: ["paid", "cancelled"],
  paid: ["shipped"],
  cancelled: [],
} as const;

type Status = keyof typeof NEXT;

function canMove(from: Status, to: Status): boolean {
  return NEXT[from].includes(to);
}
```

What `npx tsc --noEmit` prints

```ts
includes.ts:10:30 - error TS2345: Argument of type '"cancelled" | "paid" | "pending"' is not assignable to parameter of type 'never'.
  Type '"cancelled"' is not assignable to type 'never'.

10   return NEXT[from].includes(to);
                                ~~


Found 1 error in includes.ts:10
```

`NEXT[from]` is `readonly ["paid", "cancelled"] | readonly ["shipped"] | readonly []`. For the empty tuple, `includes` accepts only `never`. The fix is a widening assignment, which is safe and needs no `as`: `const next: readonly Status[] = NEXT[from];`, then `next.includes(to)`. The build below uses it.

## Build: an order workflow from one table

REASON IT OUT

### Before you design the workflow

Orders move through statuses: pending, paid, shipped, delivered, and a few side exits. You want one table from which the code gets every status, every label, the delivery fee per status and every allowed move. Before reading the code, think:

- Which parts are needed at runtime (to show a dropdown, to validate a request), and which only at compile time?
- How do you make sure a "next" status in the table is a real status, and that every status has an entry?
- A request says `{ "to": "delivered" }` for an order that is still pending. Can the compiler stop that? What stops it when the value comes from JSON?
- Can the table contain a status nobody can ever reach? How would you find out?

**Show the reasoning**

Labels, fees and the allowed moves are needed at runtime, so the table is a value; the types come from it. The status list is written once as an `as const` array, and the table is checked with `satisfies Record<OrderStatus, …>`, which demands an entry for every status and a valid status in every `next` list. For calls written in code, a generic `NextStatus<S>` type makes illegal moves a compile error. For moves that arrive as JSON, the compiler can do nothing: a type guard checks the string, and a runtime check consults the same table. Unreachable statuses are a property of the whole graph, which no type checks, so a test walks the graph.

order-flow.ts

```ts
export const ORDER_STATUSES = ["pending", "paid", "shipped", "delivered", "cancelled", "refunded"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

interface StatusRule {
  readonly label: string;
  readonly next: readonly OrderStatus[];
  readonly feeKobo: number;
}

export const ORDER_FLOW = {
  pending: { label: "Awaiting payment", next: ["paid", "cancelled"], feeKobo: 0 },
  paid: { label: "Paid", next: ["shipped", "refunded"], feeKobo: 0 },
  shipped: { label: "On the way", next: ["delivered"], feeKobo: 150_000 },
  delivered: { label: "Delivered", next: [], feeKobo: 0 },
  cancelled: { label: "Cancelled", next: [], feeKobo: 0 },
  refunded: { label: "Refunded", next: [], feeKobo: 0 },
} as const satisfies Record<OrderStatus, StatusRule>;

export type NextStatus<S extends OrderStatus> = (typeof ORDER_FLOW)[S]["next"][number];
export type StatusLabel = (typeof ORDER_FLOW)[OrderStatus]["label"];

export interface Order<S extends OrderStatus = OrderStatus> {
  readonly id: string;
  readonly status: S;
  readonly totalKobo: number;
}

export function isOrderStatus(value: string): value is OrderStatus {
  return Object.hasOwn(ORDER_FLOW, value);
}

export function canMove(from: OrderStatus, to: OrderStatus): boolean {
  const next: readonly OrderStatus[] = ORDER_FLOW[from].next;
  return next.includes(to);
}

export function advance<S extends OrderStatus, To extends NextStatus<S>>(order: Order<S>, to: To): Order<To> {
  return { ...order, status: to, totalKobo: order.totalKobo + ORDER_FLOW[to].feeKobo };
}
```

Every type in this file is derived:

- `OrderStatus` comes from the array. The table is checked against `Record<OrderStatus, StatusRule>`: a missing status, an extra one, or a typo in a `next` list fails to compile, and `as const` keeps the literal `next` tuples.
- `NextStatus<S>` chains three lookups: the table's type, the row for `S`, its `next` tuple, and `[number]` for any element. For `"pending"` it is `"paid" | "cancelled"`; for `"delivered"` it is `never`, so nothing can be passed.
- `StatusLabel` indexes the table with the whole union: every label, as literal types.
- `advance` has two type parameters. `S` is the order's current status; `To` is the status you pass, constrained to `NextStatus<S>`. Returning `Order<To>` rather than `Order<NextStatus<S>>` keeps the exact new status: after paying, the order is `Order<"paid">`, not "paid or cancelled".
- `isOrderStatus` uses `Object.hasOwn`, not `in`, so inherited names like `"toString"` are not accepted as statuses.

In code, an illegal move does not compile:

moves.ts

```ts
import { advance } from "./order-flow.js";
import type { Order } from "./order-flow.js";

const order: Order<"pending"> = { id: "ORD-1042", status: "pending", totalKobo: 1_250_000 };
const paid = advance(order, "paid");
const skipped = advance(order, "delivered");
const shipped = advance(paid, "shipped");
const undone = advance(advance(shipped, "delivered"), "pending");
```

What `npx tsc --noEmit` prints

```ts
moves.ts:6:32 - error TS2345: Argument of type '"delivered"' is not assignable to parameter of type '"cancelled" | "paid"'.

6 const skipped = advance(order, "delivered");
                                 ~~~~~~~~~~~

moves.ts:8:55 - error TS2345: Argument of type '"pending"' is not assignable to parameter of type 'never'.

8 const undone = advance(advance(shipped, "delivered"), "pending");
                                                        ~~~~~~~~~


Found 2 errors in the same file, starting at: moves.ts:6
```

The first move is fine, and `paid` is an `Order<"paid">`, so the next call knows where it stands. Skipping ahead fails, and so does leaving `"delivered"`, whose `NextStatus` is `never`. When moves come from outside, the same table is consulted at runtime:

handler.ts

```ts
import { ORDER_FLOW, ORDER_STATUSES, canMove, isOrderStatus } from "./order-flow.js";
import type { Order, OrderStatus } from "./order-flow.js";

function handleMove(order: Order, body: { to: string }): string {
  if (!isOrderStatus(body.to)) return `400 unknown status "${body.to}"`;
  if (!canMove(order.status, body.to)) {
    return `409 cannot move ${order.id} from ${order.status} to ${body.to}`;
  }
  const to: OrderStatus = body.to;
  return `200 ${order.id} is now "${ORDER_FLOW[to].label}"`;
}

const order: Order = { id: "ORD-1042", status: "pending", totalKobo: 1_250_000 };
console.log(handleMove(order, { to: "paid" }));
console.log(handleMove(order, { to: "delivered" }));
console.log(handleMove(order, { to: "toString" }));
console.log(handleMove(order, { to: "on_hold" }));

const dropdown = ORDER_STATUSES.map((status) => `${status}: ${ORDER_FLOW[status].label}`);
console.log(dropdown.join(" | "));
```

Output of `npx tsx handler.ts` and of the browser terminal

```ts
200 ORD-1042 is now "Paid"
409 cannot move ORD-1042 from pending to delivered
400 unknown status "toString"
400 unknown status "on_hold"
pending: Awaiting payment | paid: Paid | shipped: On the way | delivered: Delivered | cancelled: Cancelled | refunded: Refunded
```

The table serves the compiler (types for code), the server (checking JSON) and the admin page (the dropdown), from one definition. Adding `"on_hold"` now means adding it to the array, and then the compiler lists the one other place it is needed: its row in `ORDER_FLOW`.

## Common mistakes

| Mistake | What you get | Fix |
| --- | --- | --- |
| Forgetting `as const` on the source array | `(typeof X)[number]` is `string` | Add `as const` |
| Annotating the source object (`: Record<string, …>`) | `keyof typeof X` is `string`, values widened | Use `satisfies` instead of an annotation |
| `typeof` on a `let` | A widened type | Use `const`, or derive from the source value |
| `keyof (A \| B)` expecting all keys | Only the shared keys | Use `keyof A \| keyof B` if you really mean either |
| Writing `obj[key] = value` with a union key | "not assignable to type `never`" | Make the key a type parameter `K` and the value `T[K]` |
| `\`${key}\`` with `key: keyof T` | Error about symbols | `keyof T & string` |
| `Object.keys(obj) as (keyof T)[]` on outside data | Extra runtime keys the type does not know | Loop over a known key list |

## Testing derived types

Derived types change whenever their source changes, which is the point, and also the risk: a harmless-looking edit to the table can widen a type and silently switch off checks. Pin the important ones with type tests, and test the runtime half of the table with ordinary tests:

order-flow.test.ts

```ts
import { ORDER_FLOW, ORDER_STATUSES, advance } from "./order-flow.js";
import type { NextStatus, Order, OrderStatus } from "./order-flow.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type W1 = Expect<Equal<OrderStatus, "pending" | "paid" | "shipped" | "delivered" | "cancelled" | "refunded">>;
type W2 = Expect<Equal<NextStatus<"pending">, "paid" | "cancelled">>;
type W3 = Expect<Equal<NextStatus<"delivered">, never>>;

const pending: Order<"pending"> = { id: "ORD-1", status: "pending", totalKobo: 100 };
// @ts-expect-error: a pending order cannot be delivered directly
advance(pending, "delivered");

function reachable(from: OrderStatus): Set<OrderStatus> {
  const seen = new Set<OrderStatus>([from]);
  const queue: OrderStatus[] = [from];
  for (let status = queue.shift(); status !== undefined; status = queue.shift()) {
    for (const next of ORDER_FLOW[status].next) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

const fromPending = reachable("pending");
const unreachable = ORDER_STATUSES.filter((status) => !fromPending.has(status));
console.log(unreachable.length === 0 ? "PASS every status is reachable" : `FAIL unreachable: ${unreachable.join(", ")}`);
const deadEnds = ORDER_STATUSES.filter((status) => ORDER_FLOW[status].next.length === 0);
console.log("terminal statuses:", deadEnds.join(", "));
```

Output of `npx tsx order-flow.test.ts` and of the browser terminal

```ts
PASS every status is reachable
terminal statuses: delivered, cancelled, refunded
```

The type tests guard the derivations: if someone removes `as const`, `W2` stops compiling. The `@ts-expect-error` line guards a rule: if the table ever allowed `pending` to go straight to `delivered`, the directive would be unused and `tsc` would fail. The breadth-first walk from [Graphs](https://zudojs.oyinlola.site/learn/dsa-graphs) checks what no type can: that every status can actually be reached. (Here the `@ts-expect-error` call really runs; it is harmless because `advance` only builds a new object.)

## Type operators in production

- **Pick one source of truth, and make it a value when runtime needs the data.** Dropdowns, validation and documentation need values; derive the types from them. When nothing at runtime needs the list, a plain union type is simpler.
- **Name derived types.** `type OrderLine = Order["lines"][number]` once, then use `OrderLine`. A reader should not have to evaluate a lookup chain in their head at every use.
- **Prefer `satisfies` to annotations** on tables you derive from, and `as const` on lists.
- **Do not derive across boundaries you do not own.** Deriving your API response type from a third-party SDK's internals ties your contract to their refactors. Derive inside your own module; write explicit types at its edges.
- **Keep it readable.** If a derived type needs a comment to explain it, a test to pin it, and a teammate to decode it, consider writing the type out.

## Practice

TRY IT YOURSELF

### Currencies from one table

A shop sells in three currencies. Write one `as const` table with each currency's symbol and number of minor units per major unit (NGN 100, USD 100, JPY 1). Derive `Currency`, and write `format(minor: number, currency: Currency): string` so that `format(150050, "NGN")` gives `₦1500.50` and `format(1500, "JPY")` gives `¥1500`.

**Show a solution**

currency.ts

```ts
const CURRENCIES = {
  NGN: { symbol: "₦", minorUnits: 100 },
  USD: { symbol: "$", minorUnits: 100 },
  JPY: { symbol: "¥", minorUnits: 1 },
} as const satisfies Record<string, { symbol: string; minorUnits: number }>;

type Currency = keyof typeof CURRENCIES;

function format(minor: number, currency: Currency): string {
  const { symbol, minorUnits } = CURRENCIES[currency];
  const decimals = minorUnits === 1 ? 0 : 2;
  return `${symbol}${(minor / minorUnits).toFixed(decimals)}`;
}

console.log(format(150050, "NGN"), format(1999, "USD"), format(1500, "JPY"));
```

Output of `npx tsx currency.ts` and of the browser terminal

```ts
₦1500.50 $19.99 ¥1500
```

`satisfies` checks every row has a symbol and a number, `as const` keeps the keys literal, and `keyof typeof` gives `"NGN" | "USD" | "JPY"`. `format(100, "EUR")` does not compile until the table has a EUR row.

TRY IT YOURSELF

### Predict the keys

Before running it, predict each type, then make the file compile by filling in the second argument of every `Equal`.

predict.ts

```ts
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

interface Card { kind: "card"; last4: string; amountKobo: number }
interface Transfer { kind: "transfer"; bankCode: string; amountKobo: number }

type P1 = Expect<Equal<keyof (Card | Transfer), ???>>;
type P2 = Expect<Equal<(Card | Transfer)["kind"], ???>>;
type P3 = Expect<Equal<keyof { [reference: string]: Card }, ???>>;
type P4 = Expect<Equal<[Card, Transfer]["length"], ???>>;
```

**Show a solution**

predict.ts

```ts
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

interface Card { kind: "card"; last4: string; amountKobo: number }
interface Transfer { kind: "transfer"; bankCode: string; amountKobo: number }

type P1 = Expect<Equal<keyof (Card | Transfer), "kind" | "amountKobo">>;
type P2 = Expect<Equal<(Card | Transfer)["kind"], "card" | "transfer">>;
type P3 = Expect<Equal<keyof { [reference: string]: Card }, string | number>>;
type P4 = Expect<Equal<[Card, Transfer]["length"], 2>>;

console.log("predictions compiled");
```

Output of `npx tsx predict.ts` and of the browser terminal

```ts
predictions compiled
```

`keyof` of a union keeps only the shared keys, but indexing a union with a shared key gives the union of that property's types: that is how a discriminant's values are collected. A string index signature has `string | number` keys, and a tuple's `length` is a literal.

TRY IT YOURSELF

### A typed pluckAll

Write `pluckAll<T, K extends keyof T>(items: readonly T[], keys: readonly K[])` that returns, for each item, an object with only those keys. Use `Pick<T, K>` for the result type. Try it on products with `["name", "priceKobo"]`.

**Show a solution**

pluck-all.ts

```ts
function pluckAll<T, K extends keyof T>(items: readonly T[], keys: readonly K[]): Pick<T, K>[] {
  return items.map((item) => {
    const picked = {} as Pick<T, K>;
    for (const key of keys) picked[key] = item[key];
    return picked;
  });
}

const products = [
  { sku: "TOTE-01", name: "Ankara tote bag", priceKobo: 450_000, supplier: "Kano Textiles" },
  { sku: "MUG-07", name: "Enamel mug", priceKobo: 180_000, supplier: "Aba Crafts" },
];

const listing = pluckAll(products, ["name", "priceKobo"]);
console.log(listing);
```

Output of `npx tsx pluck-all.ts` and of the browser terminal

```json
[
  { name: 'Ankara tote bag', priceKobo: 450000 },
  { name: 'Enamel mug', priceKobo: 180000 }
]
```

`K` is inferred from the array literal as `"name" | "priceKobo"`, so `listing` is `Pick<…, "name" | "priceKobo">[]` and `listing[0].supplier` does not compile. The assignment `picked[key] = item[key]` is allowed because both sides are the property `K` of `T`, the generic write rule from this lesson. The `{} as Pick<T, K>` is the one assertion: the object is filled in by the loop that follows.

## Recap

- Names live in value space, type space, or both. `typeof` in a type position turns a value's name into its declared type; it follows property paths but cannot call functions.
- `keyof T` is the union of `T`'s keys. A union has only its shared keys, an intersection all of them, and a string index signature gives `string | number`. Keys may be numbers and symbols, so use `keyof T & string` for strings.
- `T[K]` looks up a property's type; a union key gives a union, lookups chain, `[number]` gives array elements, and tuples have literal positions and `length`.
- `(typeof LIST)[number]` and `(typeof TABLE)[keyof typeof TABLE]` turn `as const` data into unions. Check tables with `satisfies`, never with an annotation that widens them.
- Writing through a union key requires `never`; a type parameter `K` ties the key to its value. `Object.keys` returns `string[]` because values can carry extra keys.
- Derive from one source, name the derived types, and pin the important ones with type tests.

Next: [Utility types](https://zudojs.oyinlola.site/learn/ts-utility-types), where you use these operators to rebuild `Partial`, `Pick`, `Omit`, `ReturnType` and the rest of TypeScript's built-in type toolbox.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
