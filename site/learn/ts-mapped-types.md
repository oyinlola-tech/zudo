---
title: "Mapped types — ZudoJS Academy"
description: "Loop over keys at the type level: change modifiers, remap keys with as, filter and recurse into nested objects, then build a type-safe config system."
source: https://zudojs.oyinlola.site/learn/ts-mapped-types
---

LEVEL 6 · LESSON 3 OF 22

Type operators Advanced

# Mapped types

Loop over keys at the type level: change modifiers, remap keys with as, filter and recurse into nested objects, then build a type-safe config system.

- **55 min** to read and try
- **You need:** Type operators and Utility types
- **You build:** A type-safe configuration loader for a payments service, where one schema drives the config type, the environment variable names, parsing, defaults and a deeply readonly result

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Write mapped types over keyof T and over any union of keys, and know which ones keep modifiers
- Add and remove readonly and ? with + and -
- Rename keys with as and template literal types, and remove keys by mapping them to never
- Map over a union of objects to build lookup types such as an event map
- Write recursive mapped types such as DeepReadonly, and know where they break
- Build and test a configuration system whose types are computed from one schema

## A config value that was never loaded

A payments service reads its settings from environment variables at startup. The first version keeps three things side by side: a `Config` interface, a list of which variable feeds which field, and a loader. Later someone adds a webhook secret to the interface and forgets the list:

config.ts

```ts
interface Config {
  port: number;
  paystackSecretKey: string;
  webhookSecret: string;
}

const ENV_NAMES: Record<string, string> = {
  port: "PORT",
  paystackSecretKey: "PAYSTACK_SECRET_KEY",
};

function loadConfig(env: Record<string, string | undefined>): Config {
  const config: Record<string, unknown> = {};
  for (const [field, name] of Object.entries(ENV_NAMES)) {
    const raw = env[name];
    config[field] = field === "port" ? Number(raw) : raw;
  }
  return config as unknown as Config;
}

const config = loadConfig({ PORT: "8080", PAYSTACK_SECRET_KEY: "sk_test_123", WEBHOOK_SECRET: "whsec_456" });
console.log(config.port + 1);
console.log(`verifying webhook with secret "${config.webhookSecret}"`);
```

Output of `npx tsx config.ts` and of the browser terminal

```ts
8081
verifying webhook with secret "undefined"
```

The variable was set, the interface had the field, and the service still verified webhooks against the string `"undefined"`. Nothing connected the interface to the list, and the double assertion at the end told the compiler to trust whatever came out. Three hand-written descriptions of the same configuration had drifted apart.

You will fix this by writing the configuration *once*, as a schema, and computing everything else from it: the `Config` type, the list of variable names, the parsing. The tool that computes one object type from another is the **mapped type**. You met it in [Utility types](https://zudojs.oyinlola.site/learn/ts-utility-types#tools), where `Partial`, `Readonly`, `Pick` and `Record` turned out to be one-line mapped types. This lesson covers everything else they can do.

## The anatomy of a mapped type

A mapped type is a loop over a union of keys. For each key it makes one property:

```json
{ [K in Keys]: ValueType }
    │    │        └─ the property's type; may use K
    │    └─ any union of string, number or symbol literal types
    └─ a name for the current key, like a loop variable
```

The three parts of a mapped type

The keys do not have to come from another object. Any union of key types works, and the value type can use the key:

type-tests.ts

```ts
export type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export type Expect<T extends true> = T;
```

anatomy.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

type Currency = "NGN" | "USD" | "GBP";

type Balances = { [C in Currency]: number };
type RateLabels = { [C in Currency]: `1 ${C} in NGN` };

type A1 = Expect<Equal<Balances, { NGN: number; USD: number; GBP: number }>>;
type A2 = Expect<Equal<RateLabels["USD"], "1 USD in NGN">>;

const balances: Balances = { NGN: 4_500_000, USD: 12_000, GBP: 0 };
const label: RateLabels["GBP"] = "1 GBP in NGN";
console.log(balances.USD, label);
```

Output of `npx tsx anatomy.ts` and of the browser terminal

```ts
12000 1 GBP in NGN
```

`Balances` is exactly `Record<Currency, number>`, which is how `Record` is defined. `RateLabels` uses the key inside the value: a template literal type (the subject of [Template literal types](https://zudojs.oyinlola.site/learn/ts-template-literals)) that builds a different string type per currency.

### Homomorphic mapped types keep modifiers

When the keys are `keyof T` for some type `T`, the mapped type is called **homomorphic** ("same shape"): it maps an existing type property by property. Homomorphic mapped types get three special behaviours that a mapped type over an arbitrary union does not:

homomorphic.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

interface Row {
  readonly id: string;
  note?: string;
  kobo: number;
}

type Copy<T> = { [K in keyof T]: T[K] };
type CopyStringKeys<T> = { [K in Extract<keyof T, string>]: T[K] };

type H1 = Expect<Equal<Copy<Row>, { readonly id: string; note?: string; kobo: number }>>;
type H2 = Expect<Equal<CopyStringKeys<Row>, { id: string; note: string | undefined; kobo: number }>>;
type H3 = Expect<Equal<Copy<[string, number]>, [string, number]>>;
type H4 = Expect<Equal<Partial<[string, number]>, [string?, number?]>>;
type H5 = Expect<Equal<Copy<string>, string>>;

console.log("homomorphic facts hold");
```

Output of `npx tsx homomorphic.ts` and of the browser terminal

```ts
homomorphic facts hold
```

1. **Modifiers are copied** (`H1`). `readonly id` stays readonly and `note?` stays optional. Loop over a different union of the same keys (`H2`) and they are lost: `note` becomes a required property of type `string | undefined`.
2. **Arrays and tuples stay arrays and tuples** (`H3`, `H4`), mapped element by element, instead of becoming objects with `length` and `push` properties. That is why `Partial<[string, number]>` is a tuple of optional elements.
3. **Primitives pass through** (`H5`): mapping over `string` gives `string`, which makes recursive mapped types simpler, as you will see.

So when you write your own mapped types over an object, start from `[K in keyof T]`, and use `as` (below) to change or filter keys, which keeps the mapped type homomorphic.

## Adding and removing modifiers

Inside the brackets you can add or remove the two modifiers. `readonly` and `?` mean `+readonly` and `+?`; a minus sign removes them:

modifiers.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

interface Product {
  readonly sku: string;
  readonly name: string;
  priceKobo: number;
  discountKobo?: number;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type Draft<T> = { -readonly [K in keyof T]+?: T[K] };
type Complete<T> = { +readonly [K in keyof T]-?: T[K] };

type M1 = Expect<Equal<Mutable<Product>, { sku: string; name: string; priceKobo: number; discountKobo?: number }>>;
type M2 = Expect<Equal<Draft<Product>, { sku?: string; name?: string; priceKobo?: number; discountKobo?: number }>>;
type M3 = Expect<Equal<Complete<Product>["discountKobo"], number>>;

const draft: Draft<Product> = {};
draft.name = "Ankara tote bag";
draft.priceKobo = 450_000;
console.log(draft);
```

Output of `npx tsx modifiers.ts` and of the browser terminal

```json
{ name: 'Ankara tote bag', priceKobo: 450000 }
```

A `Draft<Product>` is what a product form holds while someone types: every field may be missing, and every field can change, including `sku`, which is readonly on a saved product. There is no built-in `Mutable`, because removing `readonly` is usually a smell; it is justified for builders and drafts like this one, which become a real, readonly `Product` after validation.

## Transforming each value

The value side of a mapped type can be any type expression that uses `T[K]`. That turns one interface into a family of related types, each following it automatically:

form.ts

```ts
interface Transfer {
  toAccount: string;
  bankCode: string;
  amountKobo: number;
  narration: string;
}

type FieldErrors<T> = { [K in keyof T]?: string };
type Validators<T> = { [K in keyof T]: (value: T[K]) => string | undefined };
type Touched<T> = { [K in keyof T]: boolean };

const validators: Validators<Transfer> = {
  toAccount: (value) => (/^\d{10}$/.test(value) ? undefined : "account numbers have 10 digits"),
  bankCode: (value) => (value.length === 3 ? undefined : "bank codes have 3 digits"),
  amountKobo: (value) => (value >= 10_000 ? undefined : "minimum transfer is ₦100"),
  narration: (value) => (value.length <= 30 ? undefined : "narration is at most 30 characters"),
};

function validate(transfer: Transfer): FieldErrors<Transfer> {
  const errors: FieldErrors<Transfer> = {};
  for (const key of Object.keys(validators) as (keyof Transfer)[]) {
    const check = validators[key] as (value: Transfer[typeof key]) => string | undefined;
    const message = check(transfer[key]);
    if (message !== undefined) errors[key] = message;
  }
  return errors;
}

const touched: Touched<Transfer> = { toAccount: true, bankCode: true, amountKobo: true, narration: false };
const errors = validate({ toAccount: "01234", bankCode: "058", amountKobo: 5_000, narration: "Rent" });
console.log(errors, touched.narration);
```

Output of `npx tsx form.ts` and of the browser terminal

```json
{
  toAccount: 'account numbers have 10 digits',
  amountKobo: 'minimum transfer is ₦100'
} false
```

`Validators<Transfer>` gives each validator the right parameter type: `value` is a `string` in `toAccount` and a `number` in `amountKobo`, inferred from the mapped type. Add a field to `Transfer`, and `validators` fails to compile until it has a validator for it.

The loop needs two assertions. `Object.keys` returns `string[]` (the reason is in [Type operators](https://zudojs.oyinlola.site/learn/ts-type-operators#values-to-unions)); the cast is safe here because `validators` is an object this module built with exactly those keys. The second is subtler: `validators[key]` with `key` of a union type is a *union of functions*, and calling a union of functions requires an argument that fits all of them. TypeScript cannot see that the key used to pick the function is the same key used to pick the value. This "correlated union" limit is common with mapped types; the practical answer is a local, commented assertion, or a generic helper that takes `K extends keyof T`, as in [Type operators](https://zudojs.oyinlola.site/learn/ts-type-operators#generic-lookups).

## Renaming keys with as

A mapped type can compute a *new name* for each key with an `as` clause: `[K in keyof T as NewName]`. Combined with template literal types, this generates whole APIs from a data type. `Capitalize` and `Uppercase` are built-in types that transform string literal types:

type-tests.ts

```ts
export type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export type Expect<T extends true> = T;
```

remap.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

interface Wallet {
  balanceKobo: number;
  currency: "NGN" | "USD";
  frozen: boolean;
}

type Getters<T> = { [K in keyof T as `get${Capitalize<K & string>}`]: () => T[K] };
type EnvNames<T> = { [K in keyof T as `WALLET_${Uppercase<K & string>}`]: string };

type R1 = Expect<Equal<keyof Getters<Wallet>, "getBalanceKobo" | "getCurrency" | "getFrozen">>;
type R2 = Expect<Equal<Getters<Wallet>["getCurrency"], () => "NGN" | "USD">>;
type R3 = Expect<Equal<keyof EnvNames<Wallet>, "WALLET_BALANCEKOBO" | "WALLET_CURRENCY" | "WALLET_FROZEN">>;

function getters<T extends object>(source: T): Getters<T> {
  const result: Record<string, () => unknown> = {};
  for (const key of Object.keys(source) as (keyof T & string)[]) {
    result[`get${key[0]!.toUpperCase()}${key.slice(1)}`] = () => source[key];
  }
  return result as Getters<T>;
}

const wallet = getters<Wallet>({ balanceKobo: 250_000, currency: "NGN", frozen: false });
console.log(wallet.getBalanceKobo(), wallet.getCurrency(), wallet.getFrozen());
```

Output of `npx tsx remap.ts` and of the browser terminal

```ts
250000 NGN false
```

- `K & string` is needed because keys can also be numbers and symbols, which a template literal type cannot always accept (the same reason as in [Type operators](https://zudojs.oyinlola.site/learn/ts-type-operators#keyof)).
- The runtime `getters` function builds names with the same rule as the type. The type cannot check the runtime string building, so the function ends in one assertion, and the rule must be kept in sync by hand: a good thing to cover with a test.
- The `as` clause keeps the mapped type homomorphic, so modifiers survive the renaming.

## Filtering keys

If the `as` clause produces `never` for a key, that property is dropped. With a conditional type in the `as` clause, you can filter keys by their name or by their value type. (Conditional types get their own lesson, [Conditional types](https://zudojs.oyinlola.site/learn/ts-conditional-types); here you only need `X extends Y ? A : B`.)

filter.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

interface Invoice {
  readonly number: string;
  customer: string;
  subtotalKobo: number;
  vatKobo: number;
  discountKobo?: number;
  paid: boolean;
  total(): number;
}

type DataOnly<T> = { [K in keyof T as T[K] extends (...args: any[]) => any ? never : K]: T[K] };
type KeysOfType<T, V> = keyof { [K in keyof T as T[K] extends V ? K : never]: T[K] };
type WithoutPrefix<T, P extends string> = { [K in keyof T as K extends `${P}${string}` ? never : K]: T[K] };

type F1 = Expect<Equal<keyof DataOnly<Invoice>, "number" | "customer" | "subtotalKobo" | "vatKobo" | "discountKobo" | "paid">>;
type F2 = Expect<Equal<KeysOfType<Invoice, number>, "subtotalKobo" | "vatKobo">>;
type F3 = Expect<Equal<KeysOfType<Invoice, number | undefined>, "subtotalKobo" | "vatKobo" | "discountKobo">>;
type F4 = Expect<Equal<keyof WithoutPrefix<Invoice, "sub">, Exclude<keyof Invoice, "subtotalKobo">>>;

function sumFields<T>(item: T, keys: readonly KeysOfType<T, number>[]): number {
  let total = 0;
  for (const key of keys) total += item[key] as number;
  return total;
}

const invoice: DataOnly<Invoice> = { number: "INV-0042", customer: "Ada Stores", subtotalKobo: 1_000_000, vatKobo: 75_000, paid: false };
console.log(sumFields(invoice, ["subtotalKobo", "vatKobo"]));
```

Output of `npx tsx filter.ts` and of the browser terminal

```ts
1075000
```

- `DataOnly` drops methods: a good type for data you serialize, since methods do not survive JSON.
- `KeysOfType` filters by value type, then takes `keyof` of the result. `F3` shows why the value type matters exactly: an optional `discountKobo` has type `number | undefined`, which is not assignable to `number`.
- `WithoutPrefix` filters by name with a template literal pattern. Removing keys by name with `as Exclude<K, …>` this way is also how you write an `Omit` that stays homomorphic.
- In `sumFields` the `as number` is needed because TypeScript cannot follow the filter back from the key to the value inside a generic function; callers, who are what matters, get full checking: `sumFields(invoice, ["customer"])` does not compile.

### Mapping over a union of objects

The thing after `in` does not have to be a union of keys. It can be a union of object types, as long as the `as` clause turns each one into a key. That builds a lookup type from a discriminated union, one of the most useful patterns in typed event and message systems:

events.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

type PaymentEvent =
  | { type: "payment.captured"; paymentId: string; amountKobo: number }
  | { type: "payment.refunded"; paymentId: string; amountKobo: number; reason: string }
  | { type: "payment.failed"; paymentId: string; code: string };

type EventMap = { [E in PaymentEvent as E["type"]]: E };
type Handlers = { [K in keyof EventMap]: (event: EventMap[K]) => string };

type E1 = Expect<Equal<EventMap["payment.failed"], { type: "payment.failed"; paymentId: string; code: string }>>;

const handlers: Handlers = {
  "payment.captured": (event) => `credit merchant ₦${event.amountKobo / 100}`,
  "payment.refunded": (event) => `refund ${event.paymentId}: ${event.reason}`,
  "payment.failed": (event) => `notify customer: ${event.code}`,
};

function dispatch<K extends keyof EventMap>(event: EventMap[K] & { type: K }): string {
  const handler: (event: EventMap[K]) => string = handlers[event.type];
  return handler(event);
}

console.log(dispatch({ type: "payment.refunded", paymentId: "PAY-9", amountKobo: 200_000, reason: "damaged item" }));
console.log(dispatch({ type: "payment.failed", paymentId: "PAY-10", code: "card_declined" }));
```

Output of `npx tsx events.ts` and of the browser terminal

```ts
refund PAY-9: damaged item
notify customer: card_declined
```

`EventMap` turns the union into an object keyed by `type`, and `Handlers` demands one handler per event with the right parameter type, inferred in each arrow function. Adding a fourth event makes `handlers` fail to compile until it has a handler. The generic `dispatch` keeps the correlation that the `validate` loop earlier lost. This is the core of the typed event bus in [A type-safe event system](https://zudojs.oyinlola.site/learn/ts-typed-events).

## Nested and recursive mapped types

[Utility types](https://zudojs.oyinlola.site/learn/ts-utility-types#modifiers) showed that `Readonly` and `Partial` are shallow. A mapped type that refers to itself goes all the way down:

deep.ts

```ts
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type DeepReadonly<T> = T extends (...args: any[]) => any ? T
  : T extends Date ? T
  : { readonly [K in keyof T]: DeepReadonly<T[K]> };

interface Order {
  id: string;
  customer: { name: string; address: { city: string } };
  lines: { sku: string; quantity: number }[];
  placedAt: Date;
}

type D1 = Expect<Equal<DeepReadonly<Order>["customer"]["address"], { readonly city: string }>>;
type D2 = Expect<Equal<DeepReadonly<Order>["lines"], readonly { readonly sku: string; readonly quantity: number }[]>>;
type D3 = Expect<Equal<DeepReadonly<Order>["placedAt"], Date>>;

const order: DeepReadonly<Order> = {
  id: "ORD-7",
  customer: { name: "Ada", address: { city: "Lagos" } },
  lines: [{ sku: "TOTE-01", quantity: 2 }],
  placedAt: new Date("2026-09-24T10:00:00Z"),
};
console.log(order.customer.address.city, order.lines.length, order.placedAt.getUTCFullYear());
```

Output of `npx tsx deep.ts` and of the browser terminal

```ts
Lagos 1 2026
```

How the recursion ends, and why each branch is there:

- **Primitives:** a homomorphic mapped type over `string` or `number` returns it unchanged, so no special case is needed.
- **Arrays:** homomorphic mapping keeps arrays as arrays and adds `readonly`, so `lines` becomes a readonly array of readonly lines (`D2`).
- **Functions:** mapping a function type over its keys would turn it into an object with no call signature, so functions are returned as they are.
- **Class instances such as `Date`:** mapping would turn a `Date` into a plain object type listing its dozens of methods, which is unreadable in editors and error messages. Worse, a mapped type only copies public properties: map a class with a private field (`#kobo`) and the result is no longer assignable to the class, so it cannot be passed to a function that takes one. Stop at the classes you use (`Date`, `Map`, `Set`, your own) and leave them alone.

The same recursion with `?` instead of `readonly` gives `DeepPartial`, the type of "override any nested setting", which the build below uses. Deep recursion has costs: large types slow the compiler down and make error messages long, and past a nesting limit TypeScript gives up with "Type instantiation is excessively deep". [Compiler performance](https://zudojs.oyinlola.site/learn/ts-performance) covers this; for configuration and domain objects a few levels deep, it is not a problem.

### Prettify: flattening for readable types

Intersections such as `Omit<T, K> & Partial<Pick<T, K>>` describe the right values but show up in editors and errors as the intersection, not the resulting object, and they are not `Equal` to the flat object type. An identity mapped type flattens them:

prettify.ts

```ts
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type Prettify<T> = { [K in keyof T]: T[K] } & {};
type Optional<T, K extends keyof T> = Prettify<Omit<T, K> & Partial<Pick<T, K>>>;

interface Booking {
  id: string;
  guest: string;
  roomId: string;
}

type P1 = Expect<Equal<Optional<Booking, "roomId">, { id: string; guest: string; roomId?: string }>>;

const draft: Optional<Booking, "roomId"> = { id: "B-12", guest: "Grace" };
console.log(draft);
```

Output of `npx tsx prettify.ts` and of the browser terminal

```json
{ id: 'B-12', guest: 'Grace' }
```

The mapped type visits every key of the intersection and produces one object type. The `& {}` is a widely used trick that nudges editors to show the expanded result. `Prettify` changes nothing about which values are allowed; it only changes how the type is displayed and compared.

## Build: a type-safe configuration system

REASON IT OUT

### Before you design the config system

The payments service needs a port, a database URL, a Paystack secret key and timeout, and a feature flag, all from environment variables. Before you read the code, think through:

- What is the single source of truth, and what must be derived from it (types, variable names, docs)?
- Environment variables are always strings, or missing. What can go wrong turning `"5000"`, `"five thousand"`, `""` or nothing into a number?
- Which settings may have defaults, and which must stop the service from starting when missing?
- Where must a secret never appear?
- Should the rest of the code be able to change a config value after startup?

**Show the reasoning**

The schema is the source of truth: for each setting, its variable name, a parser, an optional default and whether it is secret. The `Config` type, the list of variable names and the documentation are derived from it. Parsers must reject bad input loudly (`Number("five thousand")` is `NaN`, and `Number("")` is `0`, both wrong), and an empty string should count as missing. A setting without a default is required, and the loader should report *every* problem at once, then refuse to start: finding config errors one restart at a time is slow and painful. Secrets never go into logs or error messages. And config should be deeply readonly, in the type and at runtime, so no code can change it behind everyone's back.

First the building blocks: a `Setting<T, E>` for one variable, a `setting` helper that infers both, and the parsers:

schema.ts

```ts
export interface Setting<T, E extends string = string> {
  readonly env: E;
  readonly parse: (raw: string) => T;
  readonly default?: T;
  readonly secret?: boolean;
}

export type ConfigSchema = { readonly [key: string]: Setting<unknown> | ConfigSchema };

export function setting<T, const E extends string>(definition: {
  env: E;
  parse: (raw: string) => T;
  default?: NoInfer<T>;
  secret?: boolean;
}): Setting<T, E> {
  return definition;
}

export const integer = (raw: string): number => {
  const value = Number(raw);
  if (!/^-?\d+$/.test(raw.trim()) || !Number.isSafeInteger(value)) throw new Error(`"${raw}" is not a whole number`);
  return value;
};

export const text = (raw: string): string => raw;

export const flag = (raw: string): boolean => {
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(`"${raw}" is not true/false`);
};

export const url = (raw: string): string => {
  if (!URL.canParse(raw)) throw new Error("is not a valid URL");
  return raw;
};
```

`const E extends string` keeps the variable name as a literal type (`"PORT"`, not `string`) without `as const`, and `NoInfer<T>` makes `T` come from the parser only, so a default of the wrong type is an error instead of silently widening `T`. Now the types computed from a schema:

types.ts

```ts
import type { ConfigSchema, Setting } from "./schema.js";

export type ConfigOf<S extends ConfigSchema> = {
  readonly [K in keyof S]: S[K] extends Setting<infer T> ? T : S[K] extends ConfigSchema ? ConfigOf<S[K]> : never;
};

export type EnvVarName<S extends ConfigSchema> = {
  [K in keyof S]: S[K] extends Setting<unknown, infer E> ? E : S[K] extends ConfigSchema ? EnvVarName<S[K]> : never;
}[keyof S];
```

- `ConfigOf` is a recursive mapped type. For each key, a setting becomes its parsed type `T` (captured with `infer`), and a nested group becomes another `ConfigOf`. Every level is `readonly`.
- `EnvVarName` uses a classic pattern: build a mapped type whose *values* are what you want, then index it with `[keyof S]` to collect those values into a union. Nested groups contribute their own unions.

Next the loader. It walks the schema, reads each variable, applies defaults, parses, collects every error, and freezes the result:

load.ts

```ts
import type { ConfigSchema, Setting } from "./schema.js";
import type { ConfigOf, EnvVarName } from "./types.js";

export type Env = Readonly<Record<string, string | undefined>>;
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

function isSetting(node: Setting<unknown> | ConfigSchema): node is Setting<unknown> {
  return typeof node.parse === "function" && typeof node.env === "string";
}

export function loadConfig<S extends ConfigSchema>(schema: S, env: Env): Result<ConfigOf<S>, string[]> {
  const errors: string[] = [];
  function walk(node: ConfigSchema, path: string): Readonly<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node)) {
      const where = path === "" ? key : `${path}.${key}`;
      if (!isSetting(child)) {
        out[key] = walk(child, where);
        continue;
      }
      const raw = env[child.env];
      if (raw === undefined || raw.trim() === "") {
        if (child.default === undefined) errors.push(`${child.env} is required (${where})`);
        else out[key] = child.default;
        continue;
      }
      try {
        out[key] = child.parse(raw);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        errors.push(child.secret ? `${child.env} is invalid` : `${child.env} ${reason}`);
      }
    }
    return Object.freeze(out);
  }
  const config = walk(schema, "");
  return errors.length > 0 ? { ok: false, error: errors } : { ok: true, value: config as ConfigOf<S> };
}

export function envVarNames<S extends ConfigSchema>(schema: S): EnvVarName<S>[] {
  const names: string[] = [];
  for (const child of Object.values(schema)) {
    if (isSetting(child)) names.push(child.env);
    else names.push(...envVarNames(child));
  }
  return names as EnvVarName<S>[];
}
```

The loader contains the system's two assertions, and both are justified by the code around them: `walk` produces exactly the shape `ConfigOf<S>` describes, one property per schema key, but TypeScript cannot follow a runtime recursion through a recursive type, so it must be told. Keeping such assertions in one small, tested function is the standard way to connect runtime code to computed types. A secret's parse error never includes the raw value. Finally, the service's schema and its startup:

main.ts

```ts
import { flag, integer, setting, text, url } from "./schema.js";
import { envVarNames, loadConfig } from "./load.js";
import type { Env } from "./load.js";

export const schema = {
  port: setting({ env: "PORT", parse: integer, default: 3000 }),
  databaseUrl: setting({ env: "DATABASE_URL", parse: url }),
  paystack: {
    secretKey: setting({ env: "PAYSTACK_SECRET_KEY", parse: text, secret: true }),
    timeoutMs: setting({ env: "PAYSTACK_TIMEOUT_MS", parse: integer, default: 5000 }),
  },
  features: {
    newCheckout: setting({ env: "FEATURE_NEW_CHECKOUT", parse: flag, default: false }),
  },
};

const brokenEnv: Env = { PORT: "80.5", PAYSTACK_TIMEOUT_MS: "", FEATURE_NEW_CHECKOUT: "yes" };
const broken = loadConfig(schema, brokenEnv);
if (!broken.ok) console.log("refusing to start:\n  " + broken.error.join("\n  "));

const env: Env = {
  PORT: "8080",
  DATABASE_URL: "postgres://payments@db.internal:5432/payments",
  PAYSTACK_SECRET_KEY: "sk_test_example_key",
  FEATURE_NEW_CHECKOUT: "true",
};
const loaded = loadConfig(schema, env);
if (!loaded.ok) throw new Error(loaded.error.join("; "));
const config = loaded.value;

console.log(config.port + 1, config.paystack.timeoutMs, config.features.newCheckout);
console.log(Object.isFrozen(config), Object.isFrozen(config.paystack));
console.log(envVarNames(schema).join(", "));
```

Output of `npx tsx main.ts` and of the browser terminal

```ts
refusing to start:
  PORT "80.5" is not a whole number
  DATABASE_URL is required (databaseUrl)
  PAYSTACK_SECRET_KEY is required (paystack.secretKey)
  FEATURE_NEW_CHECKOUT "yes" is not true/false
8081 5000 true
true true
PORT, DATABASE_URL, PAYSTACK_SECRET_KEY, PAYSTACK_TIMEOUT_MS, FEATURE_NEW_CHECKOUT
```

The broken environment produced four precise messages in one go: the missing database URL and Paystack key, the port that is not a whole number, and the flag that is neither true nor false. The empty `PAYSTACK_TIMEOUT_MS` counted as missing and got its default. With a good environment, `config.port + 1` is arithmetic on a real number, `config.paystack.timeoutMs` is typed `number` without anyone writing a `Config` interface, and the whole object is frozen. The variable list for your deployment docs comes from the same schema.

And the compiler now catches the mistakes from the start of the lesson:

misuse.ts

```ts
import { integer, setting } from "./schema.js";
import { schema } from "./main.js";
import type { ConfigOf } from "./types.js";

declare const config: ConfigOf<typeof schema>;

console.log(config.webhookSecret);
config.paystack.timeoutMs = 0;
const retries = setting({ env: "PAYSTACK_RETRIES", parse: integer, default: "3" });
```

What `npx tsc --noEmit` prints

```ts
misuse.ts:7:20 - error TS2339: Property 'webhookSecret' does not exist on type 'ConfigOf<{ port: Setting<number, "PORT">; databaseUrl: Setting<string, "DATABASE_URL">; paystack: { secretKey: Setting<string, "PAYSTACK_SECRET_KEY">; timeoutMs: Setting<...>; }; features: { ...; }; }>'.

7 console.log(config.webhookSecret);
                     ~~~~~~~~~~~~~

misuse.ts:8:17 - error TS2540: Cannot assign to 'timeoutMs' because it is a read-only property.

8 config.paystack.timeoutMs = 0;
                  ~~~~~~~~~

misuse.ts:9:68 - error TS2322: Type 'string' is not assignable to type 'number'.

9 const retries = setting({ env: "PAYSTACK_RETRIES", parse: integer, default: "3" });
                                                                     ~~~~~~~

  schema.ts:13:3 - The expected type comes from property 'default' which is declared here on type '{ env: "PAYSTACK_RETRIES"; parse: (raw: string) => number; default?: number | undefined; secret?: boolean | undefined; }'
    13   default?: NoInfer<T>;
         ~~~~~~~


Found 3 errors in the same file, starting at: misuse.ts:7
```

A field that is not in the schema does not exist on `config`; nested values are readonly; and a default that does not match the parser is refused. To add the webhook secret properly you add *one* line to the schema, and the type, the loader, the required-variable check and the variable list all follow.

> IN ZUDOJS
>
> The same idea, a schema that drives both the types and the runtime checks of configuration, is what `@zudojs/config` provides with layered sources and redaction of sensitive values. [Configuration in ZudoJS](https://zudojs.oyinlola.site/learn/zudo-config) shows it.

## Testing mapped types

A computed type is code, and code needs tests. Pin what the schema produces with type tests, and test the loader's runtime behaviour, including the rules the types cannot see:

config.test.ts

```ts
import { integer, setting, text } from "./schema.js";
import { envVarNames, loadConfig } from "./load.js";
import type { ConfigOf, EnvVarName } from "./types.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const schema = {
  port: setting({ env: "PORT", parse: integer, default: 3000 }),
  mail: { from: setting({ env: "MAIL_FROM", parse: text }) },
};

type T1 = Expect<Equal<ConfigOf<typeof schema>, { readonly port: number; readonly mail: { readonly from: string } }>>;
type T2 = Expect<Equal<EnvVarName<typeof schema>, "PORT" | "MAIL_FROM">>;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
}

check("defaults fill missing values", loadConfig(schema, { MAIL_FROM: "shop@example.com" }), {
  ok: true,
  value: { port: 3000, mail: { from: "shop@example.com" } },
});
check("whitespace counts as missing", loadConfig(schema, { MAIL_FROM: "  " }), {
  ok: false,
  error: ["MAIL_FROM is required (mail.from)"],
});
check("bad numbers are rejected", loadConfig(schema, { PORT: "3000abc", MAIL_FROM: "a@b.c" }), {
  ok: false,
  error: ['PORT "3000abc" is not a whole number'],
});
check("variable names", envVarNames(schema), ["PORT", "MAIL_FROM"]);
```

Output of `npx tsx config.test.ts` and of the browser terminal

```ts
PASS defaults fill missing values
PASS whitespace counts as missing
PASS bad numbers are rejected
PASS variable names
```

The type tests fail to compile if someone changes `ConfigOf` so that, say, nested groups stop being readonly. The runtime tests cover what no type can know: that whitespace counts as missing, that `"3000abc"` is refused (plain `parseInt` would have accepted it as 3000), and that the runtime variable list matches the type-level one.

## Mapped types in production

- **Derive, but keep one readable source.** The schema in the build is plain data anyone can read. The clever types live in one small file with tests.
- **Prefer homomorphic mapped types** (`[K in keyof T]`, with `as` for renaming and filtering). They keep modifiers, arrays and tuples intact.
- **Stop recursion at class instances** such as `Date` and `Map`, and at functions.
- **Expect assertions at the runtime boundary.** Code that builds a value with `Object.keys`, string building or recursion cannot be proven to match a computed type. Keep those assertions in one place, next to the code they describe, and test them.
- **Watch the error messages.** If a teammate cannot read the error your type produces, flatten it with `Prettify`, name the intermediate types, or simplify.
- **Validate configuration at startup, all at once, and fail fast.** A service that starts with half its config fails later, in a worse place.

## Practice

TRY IT YOURSELF

### Setters from a type

Write `Setters<T>` that turns `{ name: string; priceKobo: number }` into `{ setName(value: string): void; setPriceKobo(value: number): void }`, and a runtime `createSetters` that updates a target object. Test the type with `Equal`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Loop with `for (const key of Object.keys(target) as (keyof T & string)[])`, and build each setter's name the same way the getter example does: `\`set${key[0]!.toUpperCase()}${key.slice(1)}\``.

HINT 2

Each setter is `(value) => { target[key] = value as T[typeof key]; }`. Store it in a `Record<string, (value: unknown) => void>` and return it `as Setters<T>` at the end; that one cast is where the string-building meets the type.

SOLUTION

setters.ts

```ts
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type Setters<T> = { [K in keyof T as `set${Capitalize<K & string>}`]: (value: T[K]) => void };

interface Product {
  name: string;
  priceKobo: number;
}

type S1 = Expect<Equal<Setters<Product>, { setName: (value: string) => void; setPriceKobo: (value: number) => void }>>;

function createSetters<T extends object>(target: T): Setters<T> {
  const setters: Record<string, (value: unknown) => void> = {};
  for (const key of Object.keys(target) as (keyof T & string)[]) {
    setters[`set${key[0]!.toUpperCase()}${key.slice(1)}`] = (value) => {
      target[key] = value as T[typeof key];
    };
  }
  return setters as Setters<T>;
}

const tote: Product = { name: "Tote bag", priceKobo: 450_000 };
const edit = createSetters(tote);
edit.setName("Ankara tote bag");
edit.setPriceKobo(399_000);
console.log(tote);
```

Output of `npx tsx setters.ts` and of the browser terminal

```json
{ name: 'Ankara tote bag', priceKobo: 399000 }
```

The key is renamed with a template literal and `Capitalize`, and the value type uses the original key, `T[K]`, so each setter takes the right type. The runtime needs two assertions for the same reason as the `getters` function: the string building is invisible to the type system.

TRY IT YOURSELF

### Pick the money fields

Using `KeysOfType`, write `moneyFields<T>(item: T, keys: readonly KeysOfType<T, number>[]): Record<string, string>` that formats each chosen numeric field as naira. Show that passing a string field does not compile, with `@ts-expect-error`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Loop over `keys` with a plain `for` loop, building an `out: Record<string, string>` as you go, the same way `enabledFlags` loops over its keys.

HINT 2

`out[String(key)] = \`₦${((item[key] as number) / 100).toLocaleString("en-NG")}\`;` then return `out`.

SOLUTION

money.ts

```ts
type KeysOfType<T, V> = keyof { [K in keyof T as T[K] extends V ? K : never]: T[K] };

function moneyFields<T>(item: T, keys: readonly KeysOfType<T, number>[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) out[String(key)] = `₦${((item[key] as number) / 100).toLocaleString("en-NG")}`;
  return out;
}

const invoice = { number: "INV-0042", subtotalKobo: 1_000_000, vatKobo: 75_000, customer: "Ada Stores" };
console.log(moneyFields(invoice, ["subtotalKobo", "vatKobo"]));

// @ts-expect-error: customer is a string field
moneyFields(invoice, ["customer"]);
```

Output of `npx tsx money.ts` and of the browser terminal

```json
{ subtotalKobo: '₦10,000', vatKobo: '₦750' }
```

`KeysOfType<typeof invoice, number>` is `"subtotalKobo" | "vatKobo"`, so only those can be passed. The `@ts-expect-error` line proves the filter works; it also runs, harmlessly, formatting a string as `NaN` into a result nobody reads.

TRY IT YOURSELF

### Deep overrides for tests

Write `DeepPartial<T>` and `withOverrides<T>(base: T, overrides: DeepPartial<T>): T` that merges nested plain objects, so a test can change one nested config value. Use it to change only `paystack.timeoutMs`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

If `overrides` is `undefined`, return `base` unchanged. If either side is not a plain object (use `isPlainObject`), the override simply replaces the base.

HINT 2

Otherwise, copy `base` with `{ ...base }`, then for each `[key, value]` of `Object.entries(overrides)`, set `result[key] = merge(base[key], value)` — the recursive call is what makes it *deep*.

SOLUTION

overrides.ts

```ts
type DeepPartial<T> = T extends (...args: any[]) => any ? T : { [K in keyof T]?: DeepPartial<T[K]> };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function merge(base: unknown, overrides: unknown): unknown {
  if (overrides === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(overrides)) return overrides;
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) result[key] = merge(base[key], value);
  return result;
}

function withOverrides<T>(base: T, overrides: DeepPartial<T>): T {
  return merge(base, overrides) as T;
}

const config = {
  port: 8080,
  paystack: { secretKey: "sk_test_123", timeoutMs: 5000 },
  features: { newCheckout: false },
};

const testConfig = withOverrides(config, { paystack: { timeoutMs: 50 } });
console.log(testConfig.paystack, config.paystack.timeoutMs);
```

Output of `npx tsx overrides.ts` and of the browser terminal

```json
{ secretKey: 'sk_test_123', timeoutMs: 50 } 5000
```

`DeepPartial` makes every level optional, so the override names just the one value. The merge recurses only into plain objects: arrays, dates and class instances are replaced as a whole, which is what you want for config. The original is not modified. The recursion itself is written on `unknown` values, and the typed wrapper adds the signature with one assertion: the same split between a small untyped runtime core and a typed surface as in the loader.

## Recap

- A mapped type, `{ [K in Keys]: Value }`, makes one property per member of a key union; the value may use `K`.
- Homomorphic mapped types (`[K in keyof T]`) keep `readonly` and `?`, keep arrays and tuples, and pass primitives through. `+` and `-` add and remove modifiers.
- `as` renames keys (often with template literal types and `Capitalize`); mapping a key to `never` removes it, which filters by name or by value type. Mapping over a union of objects with `as E["type"]` builds lookup types such as event maps.
- Recursive mapped types such as `DeepReadonly` must stop at functions and class instances. `Prettify` flattens intersections for display and comparison.
- A schema plus computed types (`ConfigOf`, `EnvVarName`) removes drift between the config type, the variable names and the loader. The runtime side needs a few justified assertions and good tests.

Next: [Conditional types](https://zudojs.oyinlola.site/learn/ts-conditional-types), the other half of type-level programming: `extends ? :`, `infer`, distribution and recursion, several of which you have already used here.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
