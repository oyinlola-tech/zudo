---
title: "Template literal types — ZudoJS Academy"
description: "Build and take apart string types with template literal types, Uppercase and infer, then type routes, permissions and a compile-time safe event name system."
source: https://zudojs.oyinlola.site/learn/ts-template-literals
---

LEVEL 6 · LESSON 5 OF 22

Type operators Advanced

# Template literal types

Build and take apart string types with template literal types, Uppercase and infer, then type routes, permissions and a compile-time safe event name system.

- **50 min** to read and try
- **You need:** Conditional types and Mapped types
- **You build:** A typed event bus for a shop where every event name, wildcard subscription and payload is checked at compile time, and names arriving from a queue are checked at runtime

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Build string unions from other unions with template literal types, and predict their size
- Use Uppercase, Lowercase, Capitalize and Uncapitalize, and write runtime helpers that match them
- Take strings apart with infer: split names, extract route parameters, parse numbers
- Type route paths, permission strings and generated keys
- Build an event name system with typed wildcard subscriptions and a runtime check for outside names

## The SMS that never went out

An online shop publishes events when things happen to an order, and other parts of the code subscribe to them: the SMS service tells the customer their parcel has shipped, the audit log records everything. Event names are plain strings. One subscription has a typo:

bus.ts

```ts
type Handler = (payload: Record<string, unknown>) => void;
const handlers = new Map<string, Handler[]>();

function on(name: string, handler: Handler): void {
  handlers.set(name, [...(handlers.get(name) ?? []), handler]);
}

function emit(name: string, payload: Record<string, unknown>): number {
  const list = handlers.get(name) ?? [];
  for (const handler of list) handler(payload);
  return list.length;
}

on("order.shiped", (payload) => console.log(`SMS to customer: ${payload.orderId} has shipped`));
on("order.placed", (payload) => console.log(`audit: ${payload.orderId} placed`));

console.log(emit("order.placed", { orderId: "ORD-1042" }), "handler(s) ran");
console.log(emit("order.shipped", { orderId: "ORD-1042", courier: "GIG Logistics" }), "handler(s) ran");
```

Output of `npx tsx bus.ts` and of the browser terminal

```ts
audit: ORD-1042 placed
1 handler(s) ran
0 handler(s) ran
```

Nothing crashed. Nothing was logged as an error. The customer simply never got the SMS, and the only clue is a zero that nobody reads. Typed as `string`, `"order.shiped"` is as valid as any other name, so the compiler had nothing to object to.

You could write every event name into a union by hand. But event names have structure: an entity, a dot, an action. Routes have structure (`/shops/:shopId/orders/:orderId`), permissions have structure (`orders:refund`), environment variables have structure (`PAYSTACK_SECRET_KEY`). **Template literal types** let the compiler build strings from parts and take them apart again. [Advanced and utility types](https://zudojs.oyinlola.site/learn/ts-advanced#template-literals) showed the first step, combining two unions. This lesson covers the rest: placeholders, the string helpers, parsing with `infer`, the limits, and a complete event name system.

## Building string types

A template literal type has the syntax of a JavaScript template string, but it lives in the type world and its holes take *types*. With literal types in the holes you get a literal type; with unions you get every combination:

type-tests.ts

```ts
export type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export type Expect<T extends true> = T;
```

combine.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

type Entity = "order" | "payment" | "stock";
type Action = "created" | "updated" | "deleted";

type EventName = `${Entity}.${Action}`;
type Versioned = `${EventName}.v${1 | 2}`;
type Channel = `sms:${"+234" | "+233"}`;

type B1 = Expect<Equal<`order.${"paid"}`, "order.paid">>;
type B2 = Expect<Equal<Extract<EventName, `payment.${string}`>, "payment.created" | "payment.updated" | "payment.deleted">>;
type B3 = Expect<Equal<Channel, "sms:+234" | "sms:+233">>;

const names: EventName[] = ["order.created", "stock.deleted"];
const versioned: Versioned = "payment.updated.v2";
console.log(names.length, versioned);
```

Output of `npx tsx combine.ts` and of the browser terminal

```ts
2 payment.updated.v2
```

`EventName` has 3 × 3 = 9 members and `Versioned` has 9 × 2 = 18: a template with several union holes produces the **cross product**, one member per combination. `B2` shows the other direction: a template with a `string` hole, `\`payment.${string}\``, is not a list but a **pattern**, "any string that starts with `payment.`", and `Extract` uses it to filter a union.

### Placeholder types

A hole may hold `string`, `number`, `bigint`, `boolean`, `null` or `undefined`. The last three expand to their literal spellings. `number` is the tricky one:

placeholders.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

type P1 = Expect<Equal<`${boolean}`, "true" | "false">>;
type P2 = Expect<Equal<`${null}|${undefined}`, "null|undefined">>;

type AmountText = `${number}`;
const fromForm: AmountText[] = ["1500", "-0.5", "1e3", " 42", "0x1F"];

type OrderRef = `ORD-${number}`;
const ref: OrderRef = "ORD-1042";
console.log(fromForm.map(Number), ref);
```

Output of `npx tsx placeholders.ts` and of the browser terminal

```json
[ 1500, -0.5, 1000, 42, 31 ] ORD-1042
```

`\`${number}\`` does not mean "digits". It means "a string that JavaScript's `Number()` can read as a number": exponents, hex, leading spaces and signs all pass. That makes it a fine type for documenting a format, and a poor validator. A customer's amount field still needs a runtime check such as `/^\d+(\.\d{1,2})?$/`. And it does reject some strings you might expect it to accept:

placeholder-errors.ts

```ts
type AmountText = `${number}`;

const withSeparator: AmountText = "1_500";
const withCurrency: AmountText = "₦1500";
const ref: `ORD-${number}` = "ORD-";
```

What `npx tsc --noEmit` prints

```ts
placeholder-errors.ts:3:7 - error TS2322: Type '"1_500"' is not assignable to type '`${number}`'.

3 const withSeparator: AmountText = "1_500";
        ~~~~~~~~~~~~~

placeholder-errors.ts:4:7 - error TS2322: Type '"₦1500"' is not assignable to type '`${number}`'.

4 const withCurrency: AmountText = "₦1500";
        ~~~~~~~~~~~~

placeholder-errors.ts:5:7 - error TS2322: Type '"ORD-"' is not assignable to type '`ORD-${number}`'.

5 const ref: `ORD-${number}` = "ORD-";
        ~~~


Found 3 errors in the same file, starting at: placeholder-errors.ts:3
```

`1_500` is valid in source code but `Number("1_500")` is `NaN`, and `Number("")`, what is left of `"ORD-"`, does not count either.

## Uppercase, Lowercase, Capitalize, Uncapitalize

Four built-in types change the case of string types: `Uppercase`, `Lowercase`, `Capitalize` (first character upper) and `Uncapitalize` (first character lower). They are called **intrinsic** types because the compiler implements them directly; you could not write them with other type features. They distribute over unions, and they have no runtime existence, so a function that changes case at runtime must promise the matching type itself:

case.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

type Currency = "ngn" | "usd";
type I1 = Expect<Equal<Uppercase<Currency>, "NGN" | "USD">>;
type I2 = Expect<Equal<Capitalize<"order" | "payment">, "Order" | "Payment">>;
type I3 = Expect<Equal<Uncapitalize<"OrderPlaced">, "orderPlaced">>;
type I4 = Expect<Equal<`on${Capitalize<"paid" | "shipped">}`, "onPaid" | "onShipped">>;

function upper<S extends string>(text: S): Uppercase<S> {
  return text.toUpperCase() as Uppercase<S>;
}

function capitalize<S extends string>(text: S): Capitalize<S> {
  return (text.charAt(0).toUpperCase() + text.slice(1)) as Capitalize<S>;
}

const code = upper("ngn");
const handlerName = `on${capitalize("shipped")}` as const;
console.log(code, handlerName);
```

Output of `npx tsx case.ts` and of the browser terminal

```ts
NGN onShipped
```

`code` has the type `"NGN"`, not `string`, because `upper` says so; the `as` in its body is where you take responsibility for the runtime matching the type. Two cautions. The compiler's case mapping is the simple, locale-independent one, so it agrees with `toUpperCase()` but not with `toLocaleUpperCase("tr")`. And on a non-literal `string`, `Uppercase<string>` stays a pattern: "some string with no lowercase letters", which `"LAGOS"` fits and `"Lagos"` does not.

## Template strings in code: when you get a literal type

A template string *expression* in your code does not automatically get a template literal type. The rules follow the widening rules from [Type inference](https://zudojs.oyinlola.site/learn/ts-inference#widening):

expressions.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

function statusOf(delivered: boolean): "paid" | "shipped" {
  return delivered ? "shipped" : "paid";
}
const status = statusOf(true);

const plain = `order.${status}`;
const frozen = `order.${status}` as const;
const expected: `order.${string}` = `order.${status}`;

type X1 = Expect<Equal<typeof plain, string>>;
type X2 = Expect<Equal<typeof frozen, "order.paid" | "order.shipped">>;
type X3 = Expect<Equal<typeof expected, `order.${string}`>>;

function eventFor<const S extends string>(state: S) {
  return `order.${state}` as const;
}
type X4 = Expect<Equal<ReturnType<typeof eventFor<"refunded">>, "order.refunded">>;

console.log("template expressions compiled");
```

Output of `npx tsx expressions.ts` and of the browser terminal

```ts
template expressions compiled
```

- On its own, a template expression is `string` (`X1`), even when every hole is a literal.
- `as const` keeps the precise union (`X2`). So does an expected type written at the place of the expression (`X3`): the value is then checked against the pattern.
- Inside a generic function, `as const` produces a template literal type over the type parameter, so each call gets its own exact name (`X4`).

This is why the typo bus from the start stays untyped even after you write a union: if the names are built with `"order." + status` or an un-annotated template string, they are `string`, and any string is accepted. Build names where a template literal type is expected, or with `as const`.

### How big can a union get?

The cross product grows fast. A four-digit PIN is 10 × 10 × 10 × 10 = 10,000 strings, which the compiler handles. Five digits is 100,000, and that is where it stops:

explode.ts

```ts
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

type FourDigitPin = `${Digit}${Digit}${Digit}${Digit}`;
type FiveDigitPin = `${Digit}${Digit}${Digit}${Digit}${Digit}`;
```

What `npx tsc --noEmit` prints

```ts
explode.ts:4:21 - error TS2590: Expression produces a union type that is too complex to represent.

4 type FiveDigitPin = `${Digit}${Digit}${Digit}${Digit}${Digit}`;
                      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


Found 1 error in explode.ts:4
```

Long before this limit, large unions make the editor slow and error messages unreadable. Use unions for sets you would be willing to read, such as twenty event names. For shapes, such as "ORD- followed by a number", use a pattern with a `string` or `number` hole.

## Taking strings apart with infer

A template literal type in the `extends` clause of a conditional type is a **string pattern**, and `infer` can capture the pieces. This is the type-level twin of a regular expression with groups, but much simpler: each `infer` in the middle captures as little as possible, up to the first place where the text after it matches.

parse.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

type SplitName<S> = S extends `${infer Entity}.${infer Action}` ? [Entity, Action] : [S];

type S1 = Expect<Equal<SplitName<"order.paid">, ["order", "paid"]>>;
type S2 = Expect<Equal<SplitName<"order.item.added">, ["order", "item.added"]>>;
type S3 = Expect<Equal<SplitName<"heartbeat">, ["heartbeat"]>>;

type Split<S extends string, D extends string> =
  S extends `${infer Head}${D}${infer Tail}` ? [Head, ...Split<Tail, D>] : [S];
type S4 = Expect<Equal<Split<"lagos,abuja,kano", ",">, ["lagos", "abuja", "kano"]>>;

type TrimStart<S extends string> = S extends ` ${infer Rest}` ? TrimStart<Rest> : S;
type S5 = Expect<Equal<TrimStart<"   PSK_1042">, "PSK_1042">>;

type ParseAmount<S> = S extends `${infer Kobo extends number} kobo` ? Kobo : never;
type S6 = Expect<Equal<ParseAmount<"150000 kobo">, 150000>>;
type S7 = Expect<Equal<ParseAmount<"lots of kobo">, never>>;

console.log("string patterns compiled");
```

Output of `npx tsx parse.ts` and of the browser terminal

```ts
string patterns compiled
```

- `S2`: `Entity` stops at the *first* dot and `Action`, the last `infer`, takes the rest.
- `Split` recurses on the tail, exactly like the recursive types in [Conditional types](https://zudojs.oyinlola.site/learn/ts-conditional-types#recursion). Each step handles one piece; the base case is a string without the delimiter.
- `infer Kobo extends number` (`S6`) converts the captured text into a number literal type when it is a valid number, and fails the match otherwise (`S7`).

### Route parameters

Web frameworks describe routes as strings with named holes: `/shops/:shopId/orders/:orderId`. The handler receives the matched values as an object. Normally that object is typed `Record<string, string>`, and `params.orderID` (wrong case) compiles and is `undefined` at runtime. With a recursive pattern, the parameter names come from the path itself:

router.ts

```ts
export type ParamNames<Path extends string> =
  Path extends `${string}:${infer Param}/${infer Rest}` ? Param | ParamNames<`/${Rest}`>
  : Path extends `${string}:${infer Param}` ? Param
  : never;

export type Params<Path extends string> = { readonly [K in ParamNames<Path>]: string };

export function route<const Path extends string>(path: Path, handler: (params: Params<Path>) => string) {
  const pattern = path.split("/");
  return (url: string): string | null => {
    const parts = url.split("/");
    if (parts.length !== pattern.length) return null;
    const params: Record<string, string> = {};
    for (let i = 0; i < pattern.length; i++) {
      const segment = pattern[i];
      if (segment.startsWith(":")) params[segment.slice(1)] = decodeURIComponent(parts[i]);
      else if (segment !== parts[i]) return null;
    }
    return handler(params as Params<Path>);
  };
}
```

`ParamNames` finds the first `:`, captures the name up to the next `/`, and recurses on the rest; the second branch handles a parameter at the very end. The mapped type `Params` turns the names into an object type. The one cast connects the runtime loop to that computed type, the same pattern as in the conditional types build. Now the handler knows its parameters:

routes.ts

```ts
import { route } from "./router.js";

const getOrder = route("/shops/:shopId/orders/:orderId", (params) => {
  return `order ${params.orderId} in shop ${params.shopId}`;
});
const health = route("/health", () => "ok");

console.log(getOrder("/shops/ada-stores/orders/ORD-1042"));
console.log(getOrder("/shops/ada-stores/refunds/RF-7"));
console.log(health("/health"));
```

Output of `npx tsx routes.ts` and of the browser terminal

```ts
order ORD-1042 in shop ada-stores
null
ok
```

routes-wrong.ts

```ts
import { route } from "./router.js";

route("/shops/:shopId/orders/:orderId", (params) => `order ${params.orderID}`);
route("/health", (params) => params.shopId);
```

What `npx tsc --noEmit` prints

```ts
routes-wrong.ts:3:69 - error TS2551: Property 'orderID' does not exist on type 'Params<"/shops/:shopId/orders/:orderId">'. Did you mean 'orderId'?

3 route("/shops/:shopId/orders/:orderId", (params) => `order ${params.orderID}`);
                                                                      ~~~~~~~

routes-wrong.ts:4:37 - error TS2339: Property 'shopId' does not exist on type 'Params<"/health">'.

4 route("/health", (params) => params.shopId);
                                      ~~~~~~


Found 2 errors in the same file, starting at: routes-wrong.ts:3
```

The compiler even suggests the right spelling, and a route without parameters gets an empty params object. It still cannot know whether `ORD-1042` is a real order: the type checks the *names*, the handler must still check the *values*.

## Generating keys

Combined with key remapping from [Mapped types](https://zudojs.oyinlola.site/learn/ts-mapped-types), template literal types generate property names. Many codebases prefer handler objects with methods named after events, such as `onOrderPaid`. The method names can be computed from the event names, so they never drift:

handler-names.ts

```ts
interface OrderEvents {
  "order.placed": { orderId: string; totalKobo: number };
  "order.paid": { orderId: string; reference: string };
  "order.cancelled": { orderId: string; reason: string };
}

type HandlerName<N extends string> = N extends `${infer Entity}.${infer Action}` ? `on${Capitalize<Entity>}${Capitalize<Action>}` : never;

type OrderHandlers = {
  [N in keyof OrderEvents as HandlerName<N>]?: (payload: OrderEvents[N]) => void;
};

const notifications: OrderHandlers = {
  onOrderPaid: (payload) => console.log(`receipt for ${payload.orderId}, ref ${payload.reference}`),
  onOrderCancelled: (payload) => console.log(`refund started for ${payload.orderId}: ${payload.reason}`),
};

function dispatch<N extends keyof OrderEvents>(handlers: OrderHandlers, name: N, payload: OrderEvents[N]): void {
  const [entity, action] = name.split(".");
  const key = `on${entity[0].toUpperCase()}${entity.slice(1)}${action[0].toUpperCase()}${action.slice(1)}`;
  const handler = (handlers as Record<string, ((payload: OrderEvents[N]) => void) | undefined>)[key];
  handler?.(payload);
}

dispatch(notifications, "order.paid", { orderId: "ORD-1042", reference: "PSK_77" });
dispatch(notifications, "order.placed", { orderId: "ORD-1043", totalKobo: 900_000 });
dispatch(notifications, "order.cancelled", { orderId: "ORD-1044", reason: "out of stock" });
```

Output of `npx tsx handler-names.ts` and of the browser terminal

```ts
receipt for ORD-1042, ref PSK_77
refund started for ORD-1044: out of stock
```

Only two lines are printed: every handler is optional, and `order.placed` has none. Inside the `as` clause, `HandlerName<N>` turns `"order.paid"` into `"onOrderPaid"`, and the value type uses the *original* key `N` to find the payload, so `payload.reference` is known inside `onOrderPaid`. Misspell a method (`onOrderPayed`) and the object literal is rejected as having an unknown property. The runtime `dispatch` computes the same name with string methods; the two must agree, which is what the tests at the end of the lesson check.

## Permission strings

Role-based systems often write permissions as `resource:action` strings, with wildcards: `orders:*` means every action on orders, and `*` means everything. Template literal types describe both the exact permissions and the grants that may contain wildcards:

permissions.ts

```ts
type Resource = "orders" | "refunds" | "products";
type Action = "read" | "create" | "approve";

type Permission = `${Resource}:${Action}`;
type Grant = Permission | `${Resource}:*` | "*";

function can(grants: readonly Grant[], needed: Permission): boolean {
  const [resource] = needed.split(":");
  return grants.some((grant) => grant === "*" || grant === needed || grant === `${resource}:*`);
}

const cashier: Grant[] = ["orders:read", "orders:create", "refunds:read"];
const supervisor: Grant[] = ["orders:*", "refunds:*"];
const owner: Grant[] = ["*"];

for (const [role, grants] of [["cashier", cashier], ["supervisor", supervisor], ["owner", owner]] as const) {
  console.log(role.padEnd(10), can(grants, "refunds:approve"), can(grants, "products:create"));
}
```

Output of `npx tsx permissions.ts` and of the browser terminal

```ts
cashier    false false
supervisor true false
owner      true true
```

Wildcards are only allowed in grants, never in a check: `can(grants, "orders:*")` does not compile, because asking "may this user do anything to orders?" is almost always a bug. Typos in either place are caught too:

permission-typos.ts

```ts
type Resource = "orders" | "refunds" | "products";
type Action = "read" | "create" | "approve";
type Permission = `${Resource}:${Action}`;
type Grant = Permission | `${Resource}:*` | "*";

const auditor: Grant[] = ["order:read", "refunds:*"];
const needed: Permission = "refunds:*";
```

What `npx tsc --noEmit` prints

```ts
permission-typos.ts:6:27 - error TS2820: Type '"order:read"' is not assignable to type 'Grant'. Did you mean '"orders:read"'?

6 const auditor: Grant[] = ["order:read", "refunds:*"];
                            ~~~~~~~~~~~~

permission-typos.ts:7:7 - error TS2322: Type '"refunds:*"' is not assignable to type '"orders:approve" | "orders:create" | "orders:read" | "products:approve" | "products:create" | "products:read" | "refunds:approve" | "refunds:create" | "refunds:read"'.

7 const needed: Permission = "refunds:*";
        ~~~~~~


Found 2 errors in the same file, starting at: permission-typos.ts:6
```

In production, grants usually come from a database, where they are just strings. The type protects the code you write (checks, seed data, tests); a runtime guard must check every grant loaded from storage, exactly like event names from a queue in the build below.

## Build: a compile-time safe event name system

REASON IT OUT

### Before you design the event system

The shop has order, payment and stock events, each with its own payload. Subscribers may listen to one event, to every event of an entity (`order.*`), or to everything (`*`). Before reading the code, think:

- Where is the single source of truth for event names and payloads? What should a new event cost to add?
- A handler subscribed to `order.*` receives three different payloads. What type should its parameter have, and how does it tell them apart?
- The bus stores handlers for different events in one list. Can a handler for `order.paid` be stored as a handler for any event? What makes that safe?
- Events also arrive from a message queue as JSON. What can the compiler do about a name that arrives at runtime?

**Show the reasoning**

One interface maps each event name to its payload; names, patterns and payload types are all derived from it, so a new event is one new line. A wildcard handler receives a **discriminated union** of `{ name, payload }` objects, so checking `event.name` narrows `event.payload`. A handler that accepts only `order.paid` events cannot safely receive every event, so storing it in the shared list needs a cast; what makes it safe is that the bus only ever calls it with events that match its pattern, and a test checks the matcher. Names from the queue are just strings: the compiler cannot see them, so a runtime list of names and a type guard check them, and a type-level test makes sure that list is complete.

events.ts

```ts
export interface ShopEvents {
  "order.placed": { orderId: string; totalKobo: number };
  "order.paid": { orderId: string; reference: string };
  "order.shipped": { orderId: string; courier: string };
  "payment.failed": { reference: string; reason: string };
  "stock.low": { sku: string; left: number };
}

export type EventName = keyof ShopEvents;
export type Namespace<N extends string> = N extends `${infer NS}.${string}` ? NS : never;
export type EventPattern = EventName | `${Namespace<EventName>}.*` | "*";

export type Matching<P extends EventPattern> =
  P extends "*" ? EventName
  : P extends `${infer NS}.*` ? Extract<EventName, `${NS}.${string}`>
  : Extract<P, EventName>;

export type ShopEvent<N extends EventName = EventName> =
  N extends EventName ? { readonly name: N; readonly payload: ShopEvents[N] } : never;

type AnyHandler = (event: ShopEvent) => void;

export function matches(pattern: EventPattern, name: EventName): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith(".*")) return name.startsWith(pattern.slice(0, -1));
  return pattern === name;
}

export function createEventBus() {
  const subscriptions: { pattern: EventPattern; handler: AnyHandler }[] = [];
  return {
    on<P extends EventPattern>(pattern: P, handler: (event: ShopEvent<Matching<P>>) => void): void {
      subscriptions.push({ pattern, handler: handler as AnyHandler });
    },
    emit<N extends EventName>(name: N, payload: ShopEvents[N]): number {
      const event = { name, payload } as ShopEvent;
      const targets = subscriptions.filter((subscription) => matches(subscription.pattern, name));
      for (const subscription of targets) subscription.handler(event);
      return targets.length;
    },
  };
}
```

Read the types from the top:

- `ShopEvents` is the source of truth. `EventName` is its keys.
- `Namespace` takes the part before the first dot, and distributes over the union, so `Namespace<EventName>` is `"order" | "payment" | "stock"`. `EventPattern` adds `"order.*"`, `"payment.*"`, `"stock.*"` and `"*"`: nine valid patterns, all derived.
- `Matching<P>` turns a pattern back into the event names it covers, using a `\`${NS}.${string}\`` pattern with `Extract`.
- `ShopEvent<N>` distributes over `N`, so for several names it builds a union of objects, each pairing a name with *its* payload. That union is discriminated by `name`.
- The two casts are at the one place where handlers of different types meet in one list, and where the event object is built. `matches` is what keeps them honest.

Now the subscribers:

shop.ts

```ts
import { createEventBus } from "./events.js";

const bus = createEventBus();

bus.on("order.shipped", (event) => {
  console.log(`SMS: ${event.payload.orderId} is on its way with ${event.payload.courier}`);
});

bus.on("order.*", (event) => {
  if (event.name === "order.placed") console.log(`audit: ${event.name}, total ${event.payload.totalKobo} kobo`);
  else console.log(`audit: ${event.name} ${event.payload.orderId}`);
});

bus.on("*", (event) => console.log(`metrics: ${event.name}`));

console.log(bus.emit("order.placed", { orderId: "ORD-1042", totalKobo: 1_250_000 }), "handlers");
console.log(bus.emit("order.shipped", { orderId: "ORD-1042", courier: "GIG Logistics" }), "handlers");
console.log(bus.emit("stock.low", { sku: "TOTE-01", left: 2 }), "handlers");
```

Output of `npx tsx shop.ts` and of the browser terminal

```ts
audit: order.placed, total 1250000 kobo
metrics: order.placed
2 handlers
SMS: ORD-1042 is on its way with GIG Logistics
audit: order.shipped ORD-1042
metrics: order.shipped
3 handlers
metrics: stock.low
1 handlers
```

In the `order.*` handler, `event.payload.totalKobo` is only allowed after the `event.name === "order.placed"` check narrowed the union; every order payload has an `orderId`, so the `else` branch may read it without narrowing. Here is what the compiler now stops:

mistakes.ts

```ts
import { createEventBus } from "./events.js";

const bus = createEventBus();

bus.on("order.shiped", () => {});
bus.on("orders.*", () => {});
bus.emit("order.paid", { orderId: "ORD-1042" });
bus.on("order.*", (event) => console.log(event.payload.courier));
```

What `npx tsc --noEmit` prints

```ts
mistakes.ts:5:8 - error TS2345: Argument of type '"order.shiped"' is not assignable to parameter of type 'EventPattern'.

5 bus.on("order.shiped", () => {});
         ~~~~~~~~~~~~~~

mistakes.ts:6:8 - error TS2345: Argument of type '"orders.*"' is not assignable to parameter of type 'EventPattern'.

6 bus.on("orders.*", () => {});
         ~~~~~~~~~~

mistakes.ts:7:24 - error TS2741: Property 'reference' is missing in type '{ orderId: string; }' but required in type '{ orderId: string; reference: string; }'.

7 bus.emit("order.paid", { orderId: "ORD-1042" });
                         ~~~~~~~~~~~~~~~~~~~~~~~

  events.ts:3:36 - 'reference' is declared here.
    3   "order.paid": { orderId: string; reference: string };
                                         ~~~~~~~~~

mistakes.ts:8:56 - error TS2339: Property 'courier' does not exist on type '{ orderId: string; totalKobo: number; } | { orderId: string; reference: string; } | { orderId: string; courier: string; }'.
  Property 'courier' does not exist on type '{ orderId: string; totalKobo: number; }'.

8 bus.on("order.*", (event) => console.log(event.payload.courier));
                                                         ~~~~~~~


Found 4 errors in the same file, starting at: mistakes.ts:5
```

The typo from the start of the lesson, a wildcard for an entity that does not exist, a payload missing its `reference`, and a wildcard handler assuming every order event has a courier. All four were silent bugs with `string` names.

### Names built from other unions

Code often builds event names from data: an order moved to status `S` publishes `\`order.${S}\``. Template literal types can tell you, before anything runs, which of those names have no event:

coverage.ts

```ts
import type { EventName } from "./events.js";

type OrderStatus = "placed" | "paid" | "shipped" | "refunded";
type StatusEvent = `order.${OrderStatus}`;
type Missing = Exclude<StatusEvent, EventName>;

const missing: Missing[] = ["order.refunded"];
console.log("statuses without an event:", missing.join(", "));
```

Output of `npx tsx coverage.ts` and of the browser terminal

```ts
statuses without an event: order.refunded
```

`Missing` is computed as `"order.refunded"`, so the array literal compiles only with exactly that value. Add an `"order.refunded"` entry to `ShopEvents` and this file stops compiling, which is your reminder to delete the note. In a test file you would write `Expect<Equal<Missing, never>>` instead, to demand full coverage.

### Names from outside

Events from another service arrive through a queue as JSON. Their names are `string` and the compiler cannot help. A runtime list of names and a type guard do the check, and a type-level test proves the list is complete:

inbox.ts

```ts
import { createEventBus } from "./events.js";
import type { EventName } from "./events.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const EVENT_NAMES = ["order.placed", "order.paid", "order.shipped", "payment.failed", "stock.low"] as const satisfies readonly EventName[];
type Complete = Expect<Equal<(typeof EVENT_NAMES)[number], EventName>>;

function isEventName(value: string): value is EventName {
  return (EVENT_NAMES as readonly string[]).includes(value);
}

const bus = createEventBus();
bus.on("payment.*", (event) => console.log(`alert: payment ${event.payload.reference} failed: ${event.payload.reason}`));

const fromQueue = [
  '{"name":"payment.failed","payload":{"reference":"PSK_88","reason":"insufficient funds"}}',
  '{"name":"payment.refunded","payload":{"reference":"PSK_89"}}',
];

for (const message of fromQueue) {
  const { name, payload } = JSON.parse(message) as { name: string; payload: unknown };
  if (!isEventName(name)) {
    console.log(`dead-letter: unknown event "${name}"`);
    continue;
  }
  console.log(`accepted ${name}; payload still needs validation:`, typeof payload);
  if (name === "payment.failed") {
    bus.emit(name, payload as { reference: string; reason: string });
  }
}
```

Output of `npx tsx inbox.ts` and of the browser terminal

```ts
accepted payment.failed; payload still needs validation: object
alert: payment PSK_88 failed: insufficient funds
dead-letter: unknown event "payment.refunded"
```

`satisfies readonly EventName[]` rejects a misspelt name in the list, and `Complete` rejects a list that misses one, so the runtime list and the type can never disagree. The name is now checked, but the payload is still unchecked JSON: the `as` on the last line is only safe after a validator has checked its fields, which [Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation) covers. [Type-safe events](https://zudojs.oyinlola.site/learn/ts-typed-events) later in this course extends this bus with typed middleware and async handlers.

## Common mistakes

| Mistake | What you get | Fix |
| --- | --- | --- |
| Building names with `+` or an un-annotated template string | `string`; every name accepted | Build them where a template literal type is expected, or add `as const` |
| `"order.placed" \| string` as a parameter type | Just `string`: the literal is absorbed | Keep the union closed, or accept `EventName \| (string & {})` only if you must allow unknown names |
| Trusting `\`${number}\`` as validation | `" 42"`, `"0x1F"` and `"1e3"` pass | Validate the format at runtime |
| Unions of unions of unions | TS2590, slow editor | Use a pattern (`\`ORD-${number}\``) instead of listing |
| Expecting `infer` to split at the last delimiter | The first `infer` stops at the first match | Recurse, or put the fixed text at the end of the pattern |
| A case-changing function without a matching type | Returns `string`, loses the literal | Return `Uppercase<S>` and test that the runtime agrees |
| Typing outside strings (queue messages, database grants) as the union | A type that lies | Guard with a runtime list, pinned to the type by a test |

## Testing string types

Template literal types have two kinds of behaviour to test: what the types compute, and whether the runtime string code agrees with them. The handler-name convention is a good example, because it exists twice: once as `HandlerName<N>` and once as string code in `dispatch`. A test can pin one to the other in two steps: the compiler checks a table of expected names against the type, and the runtime checks the string code against the same table:

events.test.ts

```ts
import { matches } from "./events.js";
import type { EventName, EventPattern, Matching, Namespace } from "./events.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type T1 = Expect<Equal<Namespace<EventName>, "order" | "payment" | "stock">>;
type T2 = Expect<Equal<Matching<"order.*">, "order.placed" | "order.paid" | "order.shipped">>;
type T3 = Expect<Equal<Matching<"stock.low">, "stock.low">>;

// @ts-expect-error: patterns must name a real namespace
const bad: EventPattern = "refund.*";

type HandlerName<N extends string> = N extends `${infer E}.${infer A}` ? `on${Capitalize<E>}${Capitalize<A>}` : never;
const expected: { [N in EventName]: HandlerName<N> } = {
  "order.placed": "onOrderPlaced",
  "order.paid": "onOrderPaid",
  "order.shipped": "onOrderShipped",
  "payment.failed": "onPaymentFailed",
  "stock.low": "onStockLow",
};
const handlerName = (name: string) => "on" + name.replace(/(^|\.)(\w)/g, (_match, _dot, first: string) => first.toUpperCase());
for (const [name, want] of Object.entries(expected)) {
  console.log(handlerName(name) === want ? "PASS" : "FAIL", `${name} -> ${handlerName(name)}`);
}

const cases: [EventPattern, EventName, boolean][] = [
  ["*", "stock.low", true],
  ["order.*", "order.paid", true],
  ["order.*", "payment.failed", false],
  ["order.paid", "order.placed", false],
];
for (const [pattern, name, want] of cases) {
  console.log(matches(pattern, name) === want ? "PASS" : "FAIL", `${pattern} ~ ${name} = ${want}`);
}
```

Output of `npx tsx events.test.ts` and of the browser terminal

```ts
PASS order.placed -> onOrderPlaced
PASS order.paid -> onOrderPaid
PASS order.shipped -> onOrderShipped
PASS payment.failed -> onPaymentFailed
PASS stock.low -> onStockLow
PASS * ~ stock.low = true
PASS order.* ~ order.paid = true
PASS order.* ~ payment.failed = false
PASS order.paid ~ order.placed = false
```

The `expected` table is typed `{ [N in EventName]: HandlerName<N> }`, so it must list every event, and each value must be exactly the name the type computes; a wrong entry does not compile. The loop then proves the runtime function produces the same strings. The type tests pin what the types derive; the `@ts-expect-error` line fails the build if `EventPattern` ever becomes too loose (for example if someone widens it to `\`${string}.*\``); the runtime table checks `matches`, which the casts in `createEventBus` rely on. The `bad` constant is never used at runtime, and that is fine: it exists for the compiler.

## Template literal types in production

- **Keep the naming convention in one place.** Event names, routes and permissions each follow a grammar. Write it once as types, and once as runtime code, and test that they agree.
- **Prefer closed sets for things you control** (events you publish, routes you serve) and patterns for things you do not (order references, IDs from other systems).
- **Version names instead of changing payloads.** A consumer compiled against an old payload will misread a new one; `order.placed.v2` is a new event that both versions can handle side by side.
- **Watch the error messages.** A parameter typed as a 50-member union produces error messages listing all 50. Name the union (`EventPattern`) so errors say the name, as they did in the build.
- **The boundary is still runtime.** Everything that arrives as text (URLs, queue messages, database rows, environment variables) is `string` until a runtime check says otherwise.

## Practice

TRY IT YOURSELF

### Environment variable names

Config keys in code are camelCase (`paystackSecretKey`), and environment variables are SCREAMING_SNAKE_CASE (`PAYSTACK_SECRET_KEY`). [Mapped types](https://zudojs.oyinlola.site/learn/ts-mapped-types#remapping) used plain `Uppercase` and got `WALLET_BALANCEKOBO`; this time, put an underscore before each word. Write `EnvName<S>` that converts one to the other, one character at a time, and a runtime `envName` that does the same. Check both.

**Show a solution**

env-name.ts

```ts
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type EnvName<S extends string> =
  S extends `${infer C}${infer Rest}`
    ? `${C extends Lowercase<C> ? Uppercase<C> : `_${C}`}${EnvName<Rest>}`
    : "";

type E1 = Expect<Equal<EnvName<"paystackSecretKey">, "PAYSTACK_SECRET_KEY">>;
type E2 = Expect<Equal<EnvName<"port">, "PORT">>;
type E3 = Expect<Equal<EnvName<"smtp2Host">, "SMTP2_HOST">>;

function envName<S extends string>(key: S): EnvName<S> {
  return key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase() as EnvName<S>;
}

const name = envName("paystackSecretKey");
console.log(name, envName("smtp2Host"));
```

Output of `npx tsx env-name.ts` and of the browser terminal

```ts
PAYSTACK_SECRET_KEY SMTP2_HOST
```

`\`${infer C}${infer Rest}\`` takes exactly one character into `C`, because an `infer` followed directly by another captures as little as possible. A character that is unchanged by `Lowercase` is lowercase (or a digit) and is simply uppercased; any other gets an underscore first. The base case is the empty string.

TRY IT YOURSELF

### Parse a money string

Prices in a product feed look like `"1500.50 NGN"`. Write `ParseMoney<S>` that gives a tuple `[amount, currency]` with a number literal and one of `"NGN" | "USD"`, or `never` for anything else.

**Show a solution**

money.ts

```ts
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type Currency = "NGN" | "USD";
type ParseMoney<S> = S extends `${infer Amount extends number} ${infer C extends Currency}` ? [Amount, C] : never;

type M1 = Expect<Equal<ParseMoney<"1500.5 NGN">, [1500.5, "NGN"]>>;
type M2 = Expect<Equal<ParseMoney<"20 USD">, [20, "USD"]>>;
type M3 = Expect<Equal<ParseMoney<"20 EUR">, never>>;
type M4 = Expect<Equal<ParseMoney<"twenty USD">, never>>;

const sample: ParseMoney<"1500.5 NGN"> = [1500.5, "NGN"];
console.log(sample);
```

Output of `npx tsx money.ts` and of the browser terminal

```json
[ 1500.5, 'NGN' ]
```

Both captures are constrained, so the match only succeeds when the amount is a number and the currency is a known code. Note that the literal `"1500.50"` would parse to `1500.5`: the type follows JavaScript's number formatting, not the text.

TRY IT YOURSELF

### Typed query keys

A cache stores values under keys like `user:42`, `order:ORD-1042` and `cart:42:items`. Write a type `CacheKey` that accepts exactly those three shapes (numbers for user and cart IDs, `ORD-` plus a number for orders), and one small builder function per shape that returns the exact key. Show one call per shape and one key the type rejects.

**Show a solution**

cache-key.ts

```ts
type CacheKey = `user:${number}` | `order:ORD-${number}` | `cart:${number}:items`;

function userKey<const Id extends number>(id: Id) {
  return `user:${id}` as const;
}

function orderKey<const Ref extends `ORD-${number}`>(reference: Ref) {
  return `order:${reference}` as const;
}

function cartKey<const Id extends number>(id: Id) {
  return `cart:${id}:items` as const;
}

const keys: CacheKey[] = [userKey(42), orderKey("ORD-1042"), cartKey(42)];
// @ts-expect-error: carts are cached by numeric user id only
const wrong: CacheKey = "cart:ada:items";
console.log(keys);
```

Output of `npx tsx cache-key.ts` and of the browser terminal

```json
[ 'user:42', 'order:ORD-1042', 'cart:42:items' ]
```

Each builder returns an exact literal such as `"user:42"`, which fits the `CacheKey` pattern. The `@ts-expect-error` line proves that a key with a name instead of an id is rejected.

## Recap

- A template literal type builds strings from types. Unions in the holes produce every combination; a `string` or `number` hole makes a pattern.
- `\`${number}\`` means "readable by `Number()`", not "digits". Five holes of ten digits hit TS2590.
- `Uppercase`, `Lowercase`, `Capitalize` and `Uncapitalize` transform string types; runtime helpers must return the matching type with one honest cast.
- Template string expressions are `string` unless written with `as const` or where a template literal type is expected.
- In a conditional type, a template literal is a string pattern: `infer` splits names, extracts route parameters and parses numbers, and recursion handles lists.
- Route params, permission grants with wildcards and handler names can all be derived from one source.
- The event bus derives names, wildcard patterns and a discriminated union of events from one interface; names from outside go through a runtime guard whose list is pinned to the type by a test.

Next: [Advanced inference](https://zudojs.oyinlola.site/learn/ts-inference-deep), where you learn exactly how TypeScript infers type arguments, and when to reach for `satisfies`, `as` or `as const`.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
