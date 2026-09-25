---
title: "Utility types — ZudoJS Academy"
description: "Use and rebuild TypeScript's utility types, from Partial, Pick and Omit to Exclude, ReturnType, Awaited and ThisType, and learn where each one bites."
source: https://zudojs.oyinlola.site/learn/ts-utility-types
---

LEVEL 6 · LESSON 2 OF 22

Type operators Advanced

# Utility types

Use and rebuild TypeScript's utility types, from Partial, Pick and Omit to Exclude, ReturnType, Awaited and ThisType, and learn where each one bites.

- **55 min** to read and try
- **You need:** Type operators, Generics and Async TypeScript
- **You build:** The API types of a shop's user module, all derived from one User interface, plus your own tested copy of every built-in utility type

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Choose the right utility type for input, patch, public and lookup shapes
- Rebuild Partial, Required, Readonly, Pick, Omit and Record with mapped types
- Rebuild Exclude, Extract and NonNullable with conditional types, and explain distribution
- Rebuild ReturnType, Parameters, ConstructorParameters, InstanceType and Awaited with infer
- Avoid the traps: shallow modifiers, unchecked Omit keys, Omit on unions, overloads
- Type object-literal methods with ThisType

## A patch type that let a customer become an admin

A shop's user module lets customers edit their profile with a `PATCH /me` request. The developer reached for the obvious utility type: a patch is "a user where every field is optional", so `Partial<User>`:

patch.ts

```ts
interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: "customer" | "staff" | "admin";
  passwordHash: string;
}

function applyPatch(user: User, patch: Partial<User>): User {
  return { ...user, ...patch };
}

const ada: User = { id: "U-7", email: "ada@example.com", name: "Ada", role: "customer", passwordHash: "(hash)" };
const body = JSON.parse('{"name": "Ada Obi", "role": "admin", "id": "U-1"}') as Partial<User>;
console.log(applyPatch(ada, body));
```

Output of `npx tsx patch.ts` and of the browser terminal

```json
{
  id: 'U-1',
  email: 'ada@example.com',
  name: 'Ada Obi',
  role: 'admin',
  passwordHash: '(hash)'
}
```

The type checked out, and the result is a customer who is now an admin with someone else's id. The `as` on the JSON is its own problem ([Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation)), but even a perfectly validated `Partial<User>` would allow this, because the type *says* a patch may contain `role` and `id`. `Partial` did exactly what it promises. It was the wrong promise.

Utility types are generic types that build new types from old ones. They are the most common way to derive the many shapes of one entity (input, patch, public view, lookup table), and knowing precisely what each one does, and how it is built, is what keeps you from choosing the wrong one. This lesson goes through all of TypeScript's general-purpose utilities. For each one you will see a real use, the trap, and a simplified version you write yourself. [Advanced and utility types](https://zudojs.oyinlola.site/learn/ts-advanced#utility-types) gave the overview; [Type operators](https://zudojs.oyinlola.site/learn/ts-type-operators) gave you `keyof` and `T[K]`, which every utility is built from.

## Two tools that build every utility

All the utility types in this lesson are ordinary type aliases in TypeScript's standard library (the `lib.es5.d.ts` file that ships with the compiler), except `ThisType`, which is a marker the compiler recognises. They are made with two constructs, each covered in depth in its own lesson. You need only the basics here.

A **mapped type** loops over a union of keys and makes one property per key, like a `for…in` loop in the type world. `[K in keyof T]` is the loop, and the right side is the property's type:

```json
{ [K in keyof T]: T[K] }        a copy of T
{ [K in keyof T]?: T[K] }       every property optional
{ readonly [K in keyof T]: T[K] }   every property readonly
{ [K in keyof T]-?: T[K] }      "-?" removes optional
```

A **conditional type** chooses between two types, like the `? :` operator: `T extends U ? X : Y` is `X` when `T` is assignable to `U`, otherwise `Y`. Inside the condition, `infer R` captures a part of `T` in a new name. And when `T` is a type parameter and you pass it a union, the condition is applied to **each member separately** and the results are joined. This is called **distribution**, and several utilities depend on it.

[Mapped types](https://zudojs.oyinlola.site/learn/ts-mapped-types) and [Conditional types](https://zudojs.oyinlola.site/learn/ts-conditional-types) come next in this course and go much further. To check each rebuilt utility against the real one, the examples use the `Equal` and `Expect` helpers from [Type operators](https://zudojs.oyinlola.site/learn/ts-type-operators#typeof):

type-tests.ts

```ts
export type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export type Expect<T extends true> = T;
```

And one entity to transform throughout, a shop's user:

user.ts

```ts
export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: "customer" | "staff" | "admin";
  passwordHash: string;
  address: { city: string; street: string };
}
```

## Partial, Required and Readonly

These three change the **modifiers** of every property (whether it is optional, whether it is `readonly`) and keep the property types. They are one-line mapped types:

modifiers.ts

```ts
import type { Equal, Expect } from "./type-tests.js";
import type { User } from "./user.js";

type MyPartial<T> = { [K in keyof T]?: T[K] };
type MyRequired<T> = { [K in keyof T]-?: T[K] };
type MyReadonly<T> = { readonly [K in keyof T]: T[K] };

type M1 = Expect<Equal<MyPartial<User>, Partial<User>>>;
type M2 = Expect<Equal<MyRequired<User>, Required<User>>>;
type M3 = Expect<Equal<MyReadonly<User>, Readonly<User>>>;
type M4 = Expect<Equal<Required<User>["phone"], string>>;

interface SearchOptions {
  pageSize?: number;
  sort?: "newest" | "cheapest";
}

function withDefaults(options: SearchOptions): Required<SearchOptions> {
  return { pageSize: options.pageSize ?? 20, sort: options.sort ?? "newest" };
}

console.log(withDefaults({ sort: "cheapest" }));
```

Output of `npx tsx modifiers.ts` and of the browser terminal

```json
{ pageSize: 20, sort: 'cheapest' }
```

These are exactly the standard library's definitions. `M4` shows a detail of `-?`: it removes the `undefined` that `?` added, so a required `phone` is `string`. The everyday uses: `Partial` for options objects and "fill in later" drafts, `Required` for "options after defaults are applied" (so the code that receives them never checks for `undefined`), `Readonly` for values nobody should change.

### The trap: all three are shallow

The mapped type touches the properties of `T`, not the properties of objects inside `T`. And `Readonly` is a compile-time promise, not a runtime lock:

shallow.ts

```ts
import type { User } from "./user.js";

const frozen: Readonly<User> = {
  id: "U-7", email: "ada@example.com", name: "Ada", role: "customer",
  passwordHash: "(hash)", address: { city: "Lagos", street: "12 Allen Avenue" },
};

frozen.address.city = "Abuja";
console.log(frozen.address.city);

const draft: Partial<User> = { address: { city: "Kano", street: "" } };
console.log(Object.keys(draft));
```

Output of `npx tsx shallow.ts` and of the browser terminal

```ts
Abuja
[ 'address' ]
```

`frozen.name = "Grace"` would not compile, but `frozen.address.city = …` does: `address` itself is readonly (you cannot replace it), its `city` is not. Likewise a `Partial<User>` still requires *both* fields of an address when you give one. A deep version needs a recursive mapped type, which is an exercise in [Mapped types](https://zudojs.oyinlola.site/learn/ts-mapped-types). For a runtime guarantee, use `Object.freeze` (also shallow) or immutable data habits.

## Pick, Omit and Record

These choose *which* keys exist. `Pick<T, K>` keeps the listed keys, `Omit<T, K>` keeps all the others, and `Record<K, V>` makes a property of type `V` for every key in `K`:

keys.ts

```ts
import type { Equal, Expect } from "./type-tests.js";
import type { User } from "./user.js";

type MyPick<T, K extends keyof T> = { [P in K]: T[P] };
type MyRecord<K extends keyof any, V> = { [P in K]: V };
type MyExclude<T, U> = T extends U ? never : T;
type MyOmit<T, K extends keyof any> = MyPick<T, MyExclude<keyof T, K>>;

type P1 = Expect<Equal<MyPick<User, "id" | "email">, Pick<User, "id" | "email">>>;
type P2 = Expect<Equal<MyOmit<User, "passwordHash">, Omit<User, "passwordHash">>>;
type P3 = Expect<Equal<MyRecord<"lagos" | "abuja", number>, Record<"lagos" | "abuja", number>>>;

type ProfilePatch = Partial<Pick<User, "name" | "phone">>;
type PublicUser = Omit<User, "passwordHash">;
type RoleLabels = Record<User["role"], string>;

const patch: ProfilePatch = { phone: "08031234567" };
const labels: RoleLabels = { customer: "Customer", staff: "Staff", admin: "Administrator" };
console.log(patch, labels.admin);
```

Output of `npx tsx keys.ts` and of the browser terminal

```json
{ phone: '08031234567' } Administrator
```

- `MyPick` loops over `K` instead of `keyof T`, and `K extends keyof T` means you can only pick keys that exist.
- `MyOmit` is "pick the keys that are not excluded". `keyof any` is `string | number | symbol`: any possible key.
- `ProfilePatch` is the fix for the opening bug: a patch may only contain `name` and `phone`, each optional. Compose small utilities; the order matters (`Partial<Pick<…>>` picks first, then makes those optional).
- `Record<User["role"], string>` must have a label for every role, and gains a compile error the day someone adds a role.

### Trap 1: Omit does not check its keys

Look at the constraints again. `Pick` has `K extends keyof T`, but `Omit` has `K extends keyof any`. The library chose that on purpose (so `Omit` works with keys a generic `T` might not have), and the price is that a typo is silently accepted:

omit-typo.ts

```ts
import type { User } from "./user.js";

type PublicUser = Omit<User, "passwrodHash">;

const user: User = {
  id: "U-7", email: "ada@example.com", name: "Ada", role: "customer",
  passwordHash: "$2b$12$secret", address: { city: "Lagos", street: "12 Allen Avenue" },
};
const response: PublicUser = user;
console.log(JSON.stringify(response));
```

Output of `npx tsx omit-typo.ts` and of the browser terminal

```json
{"id":"U-7","email":"ada@example.com","name":"Ada","role":"customer","passwordHash":"$2b$12$secret","address":{"city":"Lagos","street":"12 Allen Avenue"}}
```

The misspelt key omitted nothing, so `PublicUser` still has `passwordHash`, and the hash went out in the response. A stricter version is one constraint away:

strict-omit.ts

```ts
import type { User } from "./user.js";

type StrictOmit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

type PublicUser = StrictOmit<User, "passwrodHash">;
```

What `npx tsc --noEmit` prints

```ts
strict-omit.ts:5:36 - error TS2344: Type '"passwrodHash"' does not satisfy the constraint 'keyof User'.

5 type PublicUser = StrictOmit<User, "passwrodHash">;
                                     ~~~~~~~~~~~~~~


Found 1 error in strict-omit.ts:5
```

Even with the right spelling, remember that a type does not remove data: `const response: PublicUser = user` compiles because a full user has every property a public user needs. Build the public object field by field, as in the [public user exercise](https://zudojs.oyinlola.site/learn/ts-advanced#practice).

### Trap 2: Omit and Pick on a union

Payments are a discriminated union. Omitting the id from "a payment" seems harmless:

omit-union.ts

```ts
type Payment =
  | { id: string; kind: "card"; last4: string; amountKobo: number }
  | { id: string; kind: "transfer"; bankCode: string; amountKobo: number };

type NewPayment = Omit<Payment, "id">;

const card: NewPayment = { kind: "card", last4: "4242", amountKobo: 500_000 };
```

What `npx tsc --noEmit` prints

```ts
omit-union.ts:7:42 - error TS2353: Object literal may only specify known properties, and 'last4' does not exist in type 'NewPayment'.

7 const card: NewPayment = { kind: "card", last4: "4242", amountKobo: 500_000 };
                                           ~~~~~


Found 1 error in omit-union.ts:7
```

`keyof Payment` is only the *shared* keys (from [Type operators](https://zudojs.oyinlola.site/learn/ts-type-operators#keyof)), so `Omit` produced one flat object, `{ kind: "card" | "transfer"; amountKobo: number }`. The union and its extra fields are gone. The fix uses distribution: a conditional type on a bare type parameter runs once per member, so each member is omitted separately:

distributive-omit.ts

```ts
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

type Payment =
  | { id: string; kind: "card"; last4: string; amountKobo: number }
  | { id: string; kind: "transfer"; bankCode: string; amountKobo: number };

type NewPayment = DistributiveOmit<Payment, "id">;

const drafts: NewPayment[] = [
  { kind: "card", last4: "4242", amountKobo: 500_000 },
  { kind: "transfer", bankCode: "058", amountKobo: 1_200_000 },
];
for (const draft of drafts) {
  console.log(draft.kind === "card" ? `card *${draft.last4}` : `transfer to ${draft.bankCode}`);
}
```

Output of `npx tsx distributive-omit.ts` and of the browser terminal

```ts
card *4242
transfer to 058
```

`T extends unknown` is always true; it is there only to trigger distribution. The result is a union of two omitted members, still discriminated by `kind`. `Pick` has the same limitation, and the same fix.

## Exclude, Extract and NonNullable

These three filter the *members of a union*. They are conditional types, and they work because of distribution: each member is tested on its own, members that become `never` disappear, and the rest are joined again.

filters.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

type MyExclude<T, U> = T extends U ? never : T;
type MyExtract<T, U> = T extends U ? T : never;
type MyNonNullable<T> = T extends null | undefined ? never : T;

type OrderStatus = "pending" | "paid" | "shipped" | "delivered" | "cancelled";
type Payment =
  | { kind: "card"; last4: string }
  | { kind: "transfer"; bankCode: string }
  | { kind: "wallet"; phone: string };

type F1 = Expect<Equal<MyExclude<OrderStatus, "cancelled" | "delivered">, Exclude<OrderStatus, "cancelled" | "delivered">>>;
type F2 = Expect<Equal<MyExtract<Payment, { kind: "card" | "wallet" }>, Extract<Payment, { kind: "card" | "wallet" }>>>;
type F3 = Expect<Equal<MyNonNullable<string | null | undefined>, NonNullable<string | null | undefined>>>;

type OpenStatus = Exclude<OrderStatus, "delivered" | "cancelled">;
type InstantPayment = Extract<Payment, { kind: "card" | "wallet" }>;

const open: OpenStatus[] = ["pending", "paid", "shipped"];
const instant: InstantPayment = { kind: "wallet", phone: "08031234567" };
console.log(open.length, instant.kind);
```

Output of `npx tsx filters.ts` and of the browser terminal

```ts
3 wallet
```

Step through `MyExclude<OrderStatus, "cancelled" | "delivered">`: `"pending" extends "cancelled" | "delivered"` is false, so it stays; `"cancelled"` extends it, so it becomes `never`; and so on. What is left is `"pending" | "paid" | "shipped"`. `Extract` is the opposite, and it matches by shape: `{ kind: "card"; last4: string }` is assignable to `{ kind: "card" | "wallet" }`, so the card member is kept. That makes `Extract<Payment, { kind: "card" }>` the standard way to name one member of a discriminated union, as [Narrowing](https://zudojs.oyinlola.site/learn/ts-narrowing#type-guards) did for its type guard.

The real `NonNullable<T>` is written `T & {}`. `{}` means "any value except `null` and `undefined`" (from [Special types](https://zudojs.oyinlola.site/learn/ts-special-types#object-types)), so intersecting with it removes exactly those two, and it also works on a type parameter whose members are not known yet. The conditional version gives the same results on concrete types.

### The trap: Exclude does not check its argument either

`Exclude<OrderStatus, "canceled">` (American spelling) compiles and excludes nothing, just like the `Omit` typo. When the union is yours, a checked wrapper costs one line: `type Without<T, U extends T> = Exclude<T, U>`.

## ReturnType, Parameters, ConstructorParameters and InstanceType

These four take a function or class *type* apart. Each is a conditional type that matches a function shape and uses `infer` to capture one part of it:

functions.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

type MyReturnType<F extends (...args: any) => any> = F extends (...args: any) => infer R ? R : never;
type MyParameters<F extends (...args: any) => any> = F extends (...args: infer P) => any ? P : never;
type MyConstructorParameters<C extends abstract new (...args: any) => any> = C extends abstract new (...args: infer P) => any ? P : never;
type MyInstanceType<C extends abstract new (...args: any) => any> = C extends abstract new (...args: any) => infer I ? I : never;

function quoteDelivery(zone: "lagos" | "abuja", weightKg: number, express = false) {
  return { zone, feeKobo: weightKg * (express ? 90_000 : 50_000), express };
}

class Invoice {
  constructor(readonly number: string, readonly totalKobo: number, readonly currency: "NGN" | "USD" = "NGN") {}
}

type R1 = Expect<Equal<MyReturnType<typeof quoteDelivery>, ReturnType<typeof quoteDelivery>>>;
type R2 = Expect<Equal<MyParameters<typeof quoteDelivery>, [zone: "lagos" | "abuja", weightKg: number, express?: boolean]>>;
type R3 = Expect<Equal<MyConstructorParameters<typeof Invoice>, ConstructorParameters<typeof Invoice>>>;
type R4 = Expect<Equal<MyInstanceType<typeof Invoice>, Invoice>>;

type Quote = ReturnType<typeof quoteDelivery>;
const quote: Quote = quoteDelivery("abuja", 3, true);
console.log(quote);
```

Output of `npx tsx functions.ts` and of the browser terminal

```json
{ zone: 'abuja', feeKobo: 270000, express: true }
```

- The constraint `(...args: any) => any` means "any function". It uses `any` on purpose: with `unknown` parameters, functions that take specific arguments would not fit, for the variance reasons in [The type system in depth](https://zudojs.oyinlola.site/learn/ts-type-system).
- `Parameters` gives a **labelled tuple**, including optional elements for parameters with defaults (`R2`), so you can spread it back into another function's parameter list.
- `typeof Invoice` is the class's constructor type (from [Type operators](https://zudojs.oyinlola.site/learn/ts-type-operators#typeof)). The `abstract` in the constraint lets abstract classes fit too.
- The built-in `ReturnType` and `InstanceType` fall back to `any` instead of `never`; with the constraint in place, that branch is never reached for valid input.

### Real uses: wrappers and factories

Wrapping a function without repeating its signature is the classic use of `Parameters` and `ReturnType`. `ConstructorParameters` and `InstanceType` do the same for classes:

wrappers.ts

```ts
function withTiming<F extends (...args: any[]) => any>(label: string, fn: F): (...args: Parameters<F>) => ReturnType<F> {
  return (...args) => {
    const result = fn(...args);
    console.log(`${label} called with ${JSON.stringify(args)}`);
    return result;
  };
}

function convert(kobo: number, rate: number): string {
  return `$${(kobo / 100 / rate).toFixed(2)}`;
}

const timedConvert = withTiming("convert", convert);
console.log(timedConvert(4_500_000, 1540.25));

function createAll<C extends new (...args: any[]) => any>(Class: C, rows: ConstructorParameters<C>[]): InstanceType<C>[] {
  return rows.map((row) => new Class(...row));
}

class Room {
  constructor(readonly name: string, readonly priceKobo: number) {}
}

const rooms = createAll(Room, [["Deluxe", 4_500_000], ["Standard", 2_500_000]]);
console.log(rooms.map((room) => room.name));
```

Output of `npx tsx wrappers.ts` and of the browser terminal

```ts
convert called with [4500000,1540.25]
$29.22
[ 'Deluxe', 'Standard' ]
```

`timedConvert` has the type `(kobo: number, rate: number) => string`, parameter names included, and `createAll(Room, [["Deluxe", "cheap"]])` would not compile, because each row must match `Room`'s constructor.

### The trap: overloads and generic functions

A function with several overload signatures has several shapes, but `infer` only sees the **last** one:

overloads.ts

```ts
function findBooking(id: string): { id: string; guest: string };
function findBooking(ids: string[]): { id: string; guest: string }[];
function findBooking(input: string | string[]) {
  return typeof input === "string" ? { id: input, guest: "Ada" } : input.map((id) => ({ id, guest: "Ada" }));
}

type Found = ReturnType<typeof findBooking>;
const one: Found = { id: "B-1", guest: "Ada" };
```

What `npx tsc --noEmit` prints

```ts
overloads.ts:8:22 - error TS2353: Object literal may only specify known properties, and 'id' does not exist in type '{ id: string; guest: string; }[]'.

8 const one: Found = { id: "B-1", guest: "Ada" };
                       ~~


Found 1 error in overloads.ts:8
```

`ReturnType` picked the array overload. Generic functions have a similar limit: their type parameters become `unknown` (or their constraint) in the result, because there is no call to infer them from. When you need the result type of one specific use, name that type directly instead of deriving it.

## Awaited

[Async TypeScript](https://zudojs.oyinlola.site/learn/ts-async#awaited) used `Awaited<T>` to describe what `await` gives. It is a recursive conditional type: if `T` is a thenable, unwrap its value and try again; otherwise stop. A simplified version:

awaited.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

type MyAwaited<T> = T extends PromiseLike<infer V> ? MyAwaited<V> : T;

async function loadWallet(id: string) {
  return { id, balanceKobo: 1_250_000 };
}

type A1 = Expect<Equal<MyAwaited<Promise<Promise<number>>>, number>>;
type A2 = Expect<Equal<MyAwaited<string | Promise<boolean>>, string | boolean>>;
type A3 = Expect<Equal<MyAwaited<ReturnType<typeof loadWallet>>, Awaited<ReturnType<typeof loadWallet>>>>;

type Wallet = Awaited<ReturnType<typeof loadWallet>>;
const wallet: Wallet = await loadWallet("W-3");
console.log(wallet.balanceKobo / 100);
```

Output of `npx tsx awaited.ts` and of the browser terminal

```ts
12500
```

A type alias may refer to itself inside a conditional type, which is how the unwrapping repeats until no promise is left. It distributes too (`A2`). The real `Awaited` is stricter than this version in two ways: it only unwraps objects whose `then` method's first parameter is a callable function, exactly as `await` does at runtime, and it leaves `null` and `undefined` alone. `Awaited<ReturnType<typeof fn>>` is the everyday combination.

## ThisType

The last utility is different: `interface ThisType<T> {}` is empty. It is a **marker**: when an object literal's contextual type includes `ThisType<T>`, the compiler uses `T` as the type of `this` inside that literal's methods. It exists for libraries that combine several objects into one, such as a store built from state plus actions. Without it, `this` in the actions only knows about the actions object:

store-untyped.ts

```ts
function defineStore<S extends object, A extends object>(definition: { state: S; actions: A }): S & A {
  return Object.assign({}, definition.state, definition.actions);
}

const wallet = defineStore({
  state: { owner: "Ada", balanceKobo: 0 },
  actions: {
    deposit(kobo: number) {
      this.balanceKobo += kobo;
    },
  },
});
```

What `npx tsc --noEmit` prints

```ts
store-untyped.ts:9:12 - error TS2339: Property 'balanceKobo' does not exist on type '{ deposit(kobo: number): void; }'.

9       this.balanceKobo += kobo;
             ~~~~~~~~~~~


Found 1 error in store-untyped.ts:9
```

Add `ThisType<S & A>` to the type of `actions`, and `this` becomes "the state and the actions together", which is what it really is when `wallet.deposit()` runs:

store.ts

```ts
function defineStore<S extends object, A extends object>(definition: { state: S; actions: A & ThisType<S & A> }): S & A {
  return Object.assign({}, definition.state, definition.actions);
}

const wallet = defineStore({
  state: { owner: "Ada", balanceKobo: 0 },
  actions: {
    deposit(kobo: number) {
      this.balanceKobo += kobo;
      return this.statement();
    },
    statement() {
      return `${this.owner}: ₦${(this.balanceKobo / 100).toLocaleString("en-NG")}`;
    },
  },
});

console.log(wallet.deposit(500_000));
console.log(wallet.deposit(1_250_000));
```

Output of `npx tsx store.ts` and of the browser terminal

```ts
Ada: ₦5,000
Ada: ₦17,500
```

`ThisType` needs `noImplicitThis`, which `strict` turns on. It only affects methods written in the object literal: a method that is detached and called on its own (`const d = wallet.deposit; d(5)`) still loses `this` at runtime, as [this](https://zudojs.oyinlola.site/learn/js-this) explains. You will mostly meet `ThisType` in the types of libraries, not write it.

## Build: the user module's types from one interface

REASON IT OUT

### Before you derive the types

The shop's user module needs types for: creating a user (sign-up), a customer editing their own profile, an admin editing a user, the public view sent to other users, and an audit event per change. Before you read the code, decide for each one:

- Which fields may the client send? Which must it never send (think about the opening bug)?
- Which fields does the server generate, and which does it never reveal?
- Where do you want the compiler to force an update when someone adds a field to `User`, and where would that be dangerous?
- What must happen at runtime that no type can do for you?

**Show the reasoning**

The server generates `id` and `createdAt` and never reveals `passwordHash`; sign-up sends a plain `password` instead. Customers may change only `name`, `phone` and `address`; admins may also change `role`. The safe direction for inputs is an **allow-list** (`Pick`): a new field on `User` is not accepted from clients until someone decides it should be. For outputs, `Omit` of the secret fields is convenient but risky (a new secret field would leak), so the public view is also a `Pick`. At runtime, types do nothing: the patch must be copied field by field from an allow-list of keys, and the public object built by hand.

user-types.ts

```ts
export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: "customer" | "staff" | "admin";
  passwordHash: string;
  address: { city: string; street: string };
  createdAt: string;
}

type ServerFields = "id" | "createdAt" | "passwordHash";

export type SignUpInput = Omit<User, ServerFields | "role"> & { password: string };
export const PROFILE_FIELDS = ["name", "phone", "address"] as const;
export type ProfilePatch = Partial<Pick<User, (typeof PROFILE_FIELDS)[number]>>;
export type AdminPatch = ProfilePatch & Partial<Pick<User, "role">>;
export type PublicUser = Readonly<Pick<User, "id" | "name" | "role">>;
export type UserEvent =
  | { type: "user.created"; user: PublicUser }
  | { type: "user.updated"; userId: string; fields: (keyof AdminPatch)[] }
  | { type: "user.deleted"; userId: string };
export type UpdatedEvent = Extract<UserEvent, { type: "user.updated" }>;
```

Every type is one line, and each one says what it means. `SignUpInput` uses `Omit` because the server fields are a fixed, known list; the intersection adds `password`. The patch types are allow-lists, and `ProfilePatch`'s keys come from a runtime array, so the code that copies fields can use the same list. Now the service, which uses the types and does the runtime half:

user-service.ts

```ts
import { PROFILE_FIELDS } from "./user-types.js";
import type { ProfilePatch, PublicUser, UpdatedEvent, User } from "./user-types.js";

export function toPublic(user: User): PublicUser {
  return { id: user.id, name: user.name, role: user.role };
}

export function applyProfilePatch(user: User, body: Record<string, unknown>): { user: User; event: UpdatedEvent } {
  const patch: ProfilePatch = {};
  const changed: (keyof ProfilePatch)[] = [];
  for (const field of PROFILE_FIELDS) {
    if (body[field] === undefined) continue;
    if (field === "address") {
      const address = body.address;
      if (typeof address === "object" && address !== null && "city" in address && "street" in address
        && typeof address.city === "string" && typeof address.street === "string") {
        patch.address = { city: address.city, street: address.street };
        changed.push(field);
      }
    } else if (typeof body[field] === "string") {
      patch[field] = body[field];
      changed.push(field);
    }
  }
  return { user: { ...user, ...patch }, event: { type: "user.updated", userId: user.id, fields: changed } };
}

export const userService = {
  async findById(id: string): Promise<User | undefined> {
    if (id !== "U-7") return undefined;
    return {
      id, email: "ada@example.com", name: "Ada", role: "customer", passwordHash: "(hash)",
      address: { city: "Lagos", street: "12 Allen Avenue" }, createdAt: "2026-01-15",
    };
  },
  toPublic,
};
```

The `for…of` over `PROFILE_FIELDS` is the runtime twin of `Pick`: nothing outside the list is even read. Inside the loop, `field` is `"name" | "phone" | "address"`; the `address` branch is split off because its value is an object, and for the other two `patch[field] = body[field]` is allowed once the value is known to be a string, since both remaining fields accept a string. Finally the attack from the start of the lesson, and the derived types of the service:

main.ts

```ts
import { applyProfilePatch, userService } from "./user-service.js";
import type { PublicUser } from "./user-types.js";

type FoundUser = NonNullable<Awaited<ReturnType<typeof userService.findById>>>;
type FindArgs = Parameters<typeof userService.findById>;

const args: FindArgs = ["U-7"];
const found: FoundUser | undefined = await userService.findById(...args);
if (found === undefined) throw new Error("user U-7 missing");

const attack = JSON.parse('{"name": "Ada Obi", "role": "admin", "id": "U-1", "phone": "08031234567"}') as Record<string, unknown>;
const { user, event } = applyProfilePatch(found, attack);
const view: PublicUser = userService.toPublic(user);

console.log(view);
console.log(event);
```

Output of `npx tsx main.ts` and of the browser terminal

```json
{ id: 'U-7', name: 'Ada Obi', role: 'customer' }
{ type: 'user.updated', userId: 'U-7', fields: [ 'name', 'phone' ] }
```

The name and phone changed; the `role` and `id` in the request were never read. The event lists exactly the changed fields, typed as `(keyof AdminPatch)[]`. And `FoundUser` shows how utilities compose: `ReturnType` gets `Promise<User | undefined>`, `Awaited` removes the promise, `NonNullable` removes `undefined`. Read such chains from the inside out.

## Testing your own utility types

Rebuilding a utility is only useful if you know it is right. The tests in this lesson compared each version with the built-in on one type. A utility you write for your own code has no built-in to compare with, so test it on the cases where utilities usually break: optional properties, readonly properties, unions, and the empty case:

utils.test.ts

```ts
import type { Equal, Expect } from "./type-tests.js";

type StrictOmit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

interface Row {
  readonly id: string;
  note?: string;
  kobo: number;
}
type Payment = { id: string; kind: "card"; last4: string } | { id: string; kind: "wallet"; phone: string };

type S1 = Expect<Equal<StrictOmit<Row, "kobo">, { readonly id: string; note?: string }>>;
type S2 = Expect<Equal<StrictOmit<Row, never>, Row>>;
// @ts-expect-error: unknown keys must be rejected
type S3 = StrictOmit<Row, "amount">;

type D1 = Expect<Equal<DistributiveOmit<Payment, "id">, { kind: "card"; last4: string } | { kind: "wallet"; phone: string }>>;
type D2 = Expect<Equal<DistributiveOmit<never, "id">, never>>;

console.log("utility type tests compiled");
```

Output of `npx tsx utils.test.ts` and of the browser terminal

```ts
utility type tests compiled
```

`S1` checks that modifiers survive (`Pick` keeps `readonly` and `?` because it is a *homomorphic* mapped type, a term [Mapped types](https://zudojs.oyinlola.site/learn/ts-mapped-types) explains). `S2` and `D2` are the empty cases: omitting nothing, and a union with no members, which distribution turns into `never`. `S3` is the reason `StrictOmit` exists, pinned with `@ts-expect-error`.

## Utility types in production

- **Allow-list inputs with `Pick`; be careful deny-listing with `Omit`.** A new field should not become writable or public by accident.
- **Prefer the built-ins.** Everyone knows `Partial` and `Pick`; your `MyPartial` is a thing to learn. Write your own only for gaps, such as `StrictOmit` and `DistributiveOmit`, and test them.
- **Name the result.** `type ProfilePatch = Partial<Pick<User, …>>` once, instead of repeating the expression at every use. Error messages also become readable.
- **Remember the traps:** modifiers are shallow; `Omit` and `Exclude` do not check keys; `Omit` and `Pick` flatten unions; `ReturnType` sees only the last overload.
- **Types never change data.** A `Pick` type does not remove fields from an object, and `Readonly` does not freeze it. Pair each type with the runtime code that makes it true.
- Libraries such as `type-fest` collect many more tested utilities (`SetOptional`, `PartialDeep`, …). Read their source once you have finished the next two lessons; it is a good way to learn.

## Practice

TRY IT YOURSELF

### Make some fields optional

Write `Optional<T, K extends keyof T>`: the same as `T`, but with only the keys `K` made optional. Use it for a booking where `notes` and `roomId` may be filled in later, and prove it with type tests.

**Show a solution**

optional.ts

```ts
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

interface Booking {
  id: string;
  guest: string;
  nights: number;
  roomId: string;
  notes: string;
}

type DraftBooking = Optional<Booking, "roomId" | "notes">;

type O1 = Expect<Equal<DraftBooking["roomId"], string | undefined>>;
type O2 = Expect<Equal<DraftBooking["guest"], string>>;

const draft: DraftBooking = { id: "B-12", guest: "Grace", nights: 2 };
console.log(draft, "roomId" in draft);
```

Output of `npx tsx optional.ts` and of the browser terminal

```json
{ id: 'B-12', guest: 'Grace', nights: 2 } false
```

Split the type in two: everything except `K` unchanged, and `K` picked and made optional; the intersection joins them. The type tests use indexed access, because an intersection is not `Equal` to the flattened object type even when it describes the same values. [Mapped types](https://zudojs.oyinlola.site/learn/ts-mapped-types) shows how to flatten it.

TRY IT YOURSELF

### Rebuild NonNullable and Extract, then use them

Without looking back, write `MyExtract` and `MyNonNullable`. Use them to get the refund events from the event union below, and to type a list of phone numbers with the missing ones removed.

**Show a solution**

rebuild.ts

```ts
type MyExtract<T, U> = T extends U ? T : never;
type MyNonNullable<T> = T extends null | undefined ? never : T;

type PaymentEvent =
  | { type: "payment.captured"; amountKobo: number }
  | { type: "payment.refunded"; amountKobo: number; reason: string }
  | { type: "payment.failed"; code: string };

type RefundEvent = MyExtract<PaymentEvent, { type: "payment.refunded" }>;

const events: PaymentEvent[] = [
  { type: "payment.captured", amountKobo: 500_000 },
  { type: "payment.refunded", amountKobo: 200_000, reason: "damaged item" },
  { type: "payment.failed", code: "card_declined" },
];

const refunds = events.filter((event): event is RefundEvent => event.type === "payment.refunded");
console.log(refunds.map((refund) => `${refund.amountKobo} (${refund.reason})`));

const phones: (string | null | undefined)[] = ["08031234567", null, "08129876543", undefined];
const present: MyNonNullable<(typeof phones)[number]>[] = phones.filter((phone) => phone != null);
console.log(present);
```

Output of `npx tsx rebuild.ts` and of the browser terminal

```json
[ '200000 (damaged item)' ]
[ '08031234567', '08129876543' ]
```

Both are distributive conditional types. The refund guard spells out its predicate with the extracted type, so `refund.reason` is allowed. `(typeof phones)[number]` is the element type from [Type operators](https://zudojs.oyinlola.site/learn/ts-type-operators#indexed-access), and `MyNonNullable` removes `null | undefined` from it.

TRY IT YOURSELF

### A typed memoize

Write `memoize<F extends (arg: string) => unknown>(fn: F): (arg: Parameters<F>[0]) => ReturnType<F>` that caches results by argument. Use it on a slow exchange-rate lookup and show that the second call does not run the lookup.

**Show a solution**

memoize.ts

```ts
function memoize<F extends (arg: string) => unknown>(fn: F): (arg: Parameters<F>[0]) => ReturnType<F> {
  const cache = new Map<string, ReturnType<F>>();
  return (arg) => {
    const hit = cache.get(arg);
    if (hit !== undefined || cache.has(arg)) return hit as ReturnType<F>;
    const result = fn(arg) as ReturnType<F>;
    cache.set(arg, result);
    return result;
  };
}

let lookups = 0;
function rateFor(currency: string): number {
  lookups += 1;
  return currency === "USD" ? 1540.25 : 1950.5;
}

const cachedRate = memoize(rateFor);
console.log(cachedRate("USD"), cachedRate("USD"), cachedRate("GBP"), "lookups:", lookups);
```

Output of `npx tsx memoize.ts` and of the browser terminal

```ts
1540.25 1540.25 1950.5 lookups: 2
```

`cachedRate` is typed `(arg: string) => number`, derived from `rateFor`. The two `as ReturnType<F>` are needed because inside a generic function TypeScript cannot relate `fn(arg)`, typed by the constraint as `unknown`, to the unresolved `ReturnType<F>`. That is a common, accepted spot for an assertion: the signature is what callers rely on, and it is correct. `cache.has` handles a cached `undefined` result.

## Recap

- `Partial`, `Required` and `Readonly` are mapped types that change modifiers. They are shallow, and `Readonly` is compile-time only.
- `Pick`, `Omit` and `Record` choose keys. `Omit` does not check its keys and flattens unions: use `StrictOmit` and `DistributiveOmit` where it matters, and prefer `Pick` allow-lists for inputs and public views.
- `Exclude`, `Extract` and `NonNullable` filter union members through distribution. `Extract<Union, { kind: "x" }>` names one member of a discriminated union.
- `ReturnType`, `Parameters`, `ConstructorParameters` and `InstanceType` take function and class types apart with `infer`; they see only the last overload.
- `Awaited` unwraps thenables recursively. `ThisType` is a marker that types `this` in object-literal methods.
- Types never change data: pair every derived type with the runtime code (allow-lists, field-by-field copies) that makes it true.

Next: [Mapped types](https://zudojs.oyinlola.site/learn/ts-mapped-types), the construct behind half of this lesson, in depth: modifiers, key remapping with `as`, filtering keys, and a type-safe configuration system.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
