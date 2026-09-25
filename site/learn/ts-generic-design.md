---
title: "Designing generic APIs — ZudoJS Academy"
description: "Design generic APIs that are easy to call and hard to misuse, and build Repository, Result, Page, ApiResponse, Cache and a typed event emitter."
source: https://zudojs.oyinlola.site/learn/ts-generic-design
---

LEVEL 5 · LESSON 15 OF 23

Generics and type operators Foundation

# Designing generic APIs

Design generic APIs that are easy to call and hard to misuse, and build Repository, Result, Page, ApiResponse, Cache and a typed event emitter.

- **55 min** to read and try
- **You need:** Generics, and Tuples
- **You build:** A small typed banking toolkit - Repository, Result helpers, cursor pages, API responses, a TTL cache and a typed event emitter - composed into a transfer service

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Decide whether a type parameter earns its place, and spot return-only generics that hide an assertion
- Design signatures that infer well, using parameter order and NoInfer
- Use keyof and indexed access constraints to make wrong calls unwritable
- Give type parameters sensible constraints and defaults
- Build and compose Repository, Result, Page, ApiResponse, Cache and typed event types
- Test generic code at runtime and at the type level

## Three repositories, three contracts

A banking backend grew one feature at a time. Each team wrote its own data access class, and each one answers "not found" differently:

drift.ts

```ts
class TaskRepository {
  private rows = [{ id: "T1", title: "Verify BVN" }];
  find(id: string) {
    return this.rows.find((row) => row.id === id);
  }
}

class UserRepository {
  private rows = [{ id: "U1", name: "Ada" }];
  get(id: string) {
    return this.rows.find((row) => row.id === id) ?? null;
  }
}

class AccountRepository {
  private rows = [{ id: "ACC-1", kobo: 500000 }];
  findById(id: string) {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error(`account ${id} not found`);
    return row;
  }
}

console.log(new TaskRepository().find("T9"));
console.log(new UserRepository().get("U9"));
try {
  new AccountRepository().findById("ACC-9");
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx drift.ts` and of the browser terminal

```ts
undefined
null
Error: account ACC-9 not found
```

Three method names, three answers for a missing row: `undefined`, `null` and an exception. Every caller has to remember which is which, and code that moves between them breaks in quiet ways. The fix is one *generic* contract, written once, that every entity uses. You already know the syntax from [Generics](https://zudojs.oyinlola.site/learn/ts-generics). This lesson is about **design**: which type parameters to have, where to put them, what to constrain, what to default, and how the pieces fit together into an API that is hard to misuse. By the end you will have built the generic toolkit most TypeScript backends grow, and composed it into a transfer service.

## Type parameters must earn their place

A type parameter exists to **connect** types: an input to an output, one argument to another, a method to the class it belongs to. A useful rule of thumb: *a type parameter should appear at least twice*. When it appears once, it connects nothing, and a plain type says the same thing more simply:

once.ts

```ts
function logAmountsGeneric<T extends number>(amounts: readonly T[]): void {
  console.log(amounts.join(", "));
}

function logAmounts(amounts: readonly number[]): void {
  console.log(amounts.join(", "));
}

logAmountsGeneric([5000, 1200]);
logAmounts([5000, 1200]);
```

Output of `npx tsx once.ts` and of the browser terminal

```ts
5000, 1200
5000, 1200
```

Both do the same thing; the second is easier to read. Compare `first<T>(items: readonly T[]): T | undefined` from the Generics lesson: there `T` appears in the input and the output, and that link is the whole point.

### Return-only generics are assertions in disguise

The dangerous case is a type parameter that appears *only* in the return type. Nothing can infer it, so the caller simply writes it, and gets back whatever they asked for:

return-only.ts

```ts
function parseJson<T>(text: string): T {
  return JSON.parse(text);
}

interface Account {
  id: string;
  kobo: number;
}

const account = parseJson<Account>('{"id": "ACC-1", "balance": "5000"}');
console.log(account.kobo, typeof account.kobo);
try {
  console.log(account.kobo.toFixed(2));
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx return-only.ts` and of the browser terminal

```ts
undefined undefined
TypeError: Cannot read properties of undefined (reading 'toFixed')
```

`parseJson<Account>(…)` looks like a checked call, but it is exactly `JSON.parse(…) as Account`, the unchecked assertion from [Type assertions](https://zudojs.oyinlola.site/learn/ts-assertions), wearing a generic's clothes. The honest signature is `parseJson(text: string): unknown`, followed by a guard or a validator. You will meet return-only generics in real libraries too (for example, the `get<TValue>(key)` method of `@zudojs/cache`'s adapter contract). They are convenient, but treat what they return like data from outside: the type is a promise you made, not one anyone checked.

## Design for inference

A good generic API is called without angle brackets. TypeScript infers type parameters from the arguments, so put each type parameter where a value will reveal it, and let callers write ordinary code.

### Choose the inference site with NoInfer

Sometimes a type parameter appears in two arguments, and only one of them should decide it. A function that picks a customer's currency from the allowed list, with a fallback:

no-infer.ts

```ts
function chooseLoose<C extends string>(allowed: readonly C[], wanted: string, fallback: C): C {
  return allowed.find((c) => c === wanted) ?? fallback;
}

console.log(chooseLoose(["NGN", "USD"], "EUR", "GBP"));
```

Output of `npx tsx no-infer.ts` and of the browser terminal

```ts
GBP
```

That compiles, and returns `"GBP"`, which is not in the allowed list. TypeScript inferred `C` from *both* `allowed` and `fallback`, so `C` became `"NGN" | "USD" | "GBP"`. Wrapping the second use in `NoInfer<C>` (TypeScript 5.4) tells the compiler "do not infer `C` from here, only check against it":

no-infer.ts

```ts
function choose<C extends string>(allowed: readonly C[], wanted: string, fallback: NoInfer<C>): C {
  return allowed.find((c) => c === wanted) ?? fallback;
}

console.log(choose(["NGN", "USD"], "EUR", "GBP"));
```

What `npx tsc --noEmit` prints

```ts
no-infer.ts:5:43 - error TS2345: Argument of type '"GBP"' is not assignable to parameter of type '"NGN" | "USD"'.

5 console.log(choose(["NGN", "USD"], "EUR", "GBP"));
                                            ~~~~~


Found 1 error in no-infer.ts:5
```

Now `allowed` alone decides `C`, and the bad fallback is caught at the call site. The same trick fits any "default value" parameter: a `Result`'s `unwrapOr(result, fallback)`, a select box's initial value, a cache's placeholder.

### Other inference habits

- **Infer from values, not from callbacks.** In `groupBy(items, keyOf)`, `T` comes from `items`, and the callback's parameter is then typed from `T`. Putting the array first also gives the callback good autocompletion.
- **Constrain with `extends`, not by annotating the value.** `<C extends string>` keeps the literal types `"NGN" | "USD"`; a parameter typed `string[]` would lose them.
- **When nothing can be inferred, ask for it explicitly.** `new Map<string, number>()` and `createState<string | null>(null)` are fine; they are the caller stating a fact.

## Constraints and defaults

A **constraint** (`T extends Shape`) lists what your code needs from `T`, and nothing more. Too loose, and the implementation cannot do its job; too tight, and callers with perfectly good types are turned away. A classic example of "too tight": requiring an index signature from an event map.

too-tight.ts

```ts
class StrictEmitter<Events extends Record<string, unknown>> {
  emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    console.log(String(name), payload);
  }
}

interface BankEvents {
  "transfer.completed": { kobo: number };
}

const events = new StrictEmitter<BankEvents>();
```

What `npx tsc --noEmit` prints

```ts
too-tight.ts:11:34 - error TS2344: Type 'BankEvents' does not satisfy the constraint 'Record<string, unknown>'.
  Index signature for type 'string' is missing in type 'BankEvents'.

11 const events = new StrictEmitter<BankEvents>();
                                    ~~~~~~~~~~


Found 1 error in too-tight.ts:11
```

`Record<string, unknown>` means "an object that can have *any* string key", and an interface only promises its listed keys. The class never needed arbitrary keys, only `keyof Events`. Loosening the constraint to `Events extends object` accepts interfaces and type aliases alike; the typed emitter later in this lesson does exactly that.

### Defaults

A **default** (`Id = string`) is used when the caller does not pass that type argument and nothing can be inferred. Defaults make the common case short and the unusual case possible. Parameters with defaults must come after the ones without. Here is how the published `@zudojs/database` package declares its repository contract:

```ts
interface Repository<TEntity, TId = string, TCreateInput = Partial<TEntity>,
                     TUpdateInput = Partial<TEntity>, TFilter = unknown> { … }
```

Five type parameters, but most code writes `Repository<Account>` and gets string ids and partial inputs. Only a repository with numeric ids or a custom filter type spells out more. Notice how the defaults refer to earlier parameters: `Partial<TEntity>` uses `TEntity`. That is allowed, because by then it is known.

## Repository<T, Id>

REASON IT OUT

### Before you design the repository

You are writing the one repository contract every entity will use. Before the code, decide:

- What does `findById` return for a missing row: `null`, `undefined`, or does it throw? Who is best placed to decide what "missing" means?
- Ids are strings for accounts (`"ACC-001"`) but numbers for branches. How does one contract allow both, without allowing `boolean` ids?
- What may a caller pass to `create` and `update`? Can a caller change an id, or choose one?
- How do you allow "find accounts where `frozen` is `true`" without allowing `frozen` to be compared with a string?

**Show the reasoning**

A lookup that finds nothing is a normal outcome, not an exception, so `findById` returns `T | undefined` (the same as `Map.get` and `Array.find`) and the caller, who knows whether missing is an error, decides. The id type is a second type parameter, constrained to `string | number`, with `string` as the default. `create` takes `Omit<T, "id">`, so ids are always generated by the repository, and `update` takes `Partial<Omit<T, "id">>`, so ids can never be changed. Queries use a `keyof` constraint: `findBy<K extends keyof T>(key: K, value: T[K])` ties the value's type to the chosen field.

The contract is an interface, so the rest of the code depends on it rather than on one implementation. The in-memory class implements it; a PostgreSQL version would implement the same interface:

repository.ts

```ts
export interface Repository<T extends { id: Id }, Id extends string | number = string> {
  findById(id: Id): Promise<T | undefined>;
  findBy<K extends keyof T>(key: K, value: T[K]): Promise<T[]>;
  create(input: Omit<T, "id">): Promise<T>;
  update(id: Id, patch: Partial<Omit<T, "id">>): Promise<T | undefined>;
}

export class MemoryRepository<T extends { id: Id }, Id extends string | number = string>
  implements Repository<T, Id>
{
  private readonly rows = new Map<Id, T>();

  constructor(private readonly nextId: () => Id) {}

  async findById(id: Id): Promise<T | undefined> {
    return this.rows.get(id);
  }

  async findBy<K extends keyof T>(key: K, value: T[K]): Promise<T[]> {
    return [...this.rows.values()].filter((row) => row[key] === value);
  }

  async create(input: Omit<T, "id">): Promise<T> {
    const row = { ...input, id: this.nextId() } as T;
    this.rows.set(row.id, row);
    return row;
  }

  async update(id: Id, patch: Partial<Omit<T, "id">>): Promise<T | undefined> {
    const current = this.rows.get(id);
    if (current === undefined) return undefined;
    const next = { ...current, ...patch, id };
    this.rows.set(id, next);
    return next;
  }
}
```

- `T extends { id: Id }` refers to `Id`, declared after it. Type parameters in one list can refer to each other in constraints.
- The one `as T` in `create` is a justified assertion: `Omit<T, "id">` plus an `id` is a `T` for every real entity, but TypeScript cannot prove it for an unknown generic `T`. It is the "proof the compiler cannot follow" case from [Type assertions](https://zudojs.oyinlola.site/learn/ts-assertions#justified), sitting in one place, under test.
- In `update`, `id` is spread *last*. The type already forbids an `id` in the patch, but a caller that got its patch from JSON could still smuggle one in at runtime; the order makes sure it never wins.

Using it for two entities with different id types:

repository-demo.ts

```ts
import { MemoryRepository } from "./repository.js";

interface Account {
  id: string;
  owner: string;
  kobo: number;
  frozen: boolean;
}

interface Branch {
  id: number;
  city: string;
}

let accountSeq = 0;
const accounts = new MemoryRepository<Account>(() => `ACC-${String(++accountSeq).padStart(3, "0")}`);
let branchSeq = 100;
const branches = new MemoryRepository<Branch, number>(() => ++branchSeq);

const ada = await accounts.create({ owner: "Ada", kobo: 500000, frozen: false });
await accounts.create({ owner: "Tunde", kobo: 0, frozen: true });
await branches.create({ city: "Lagos" });

console.log(ada.id, (await accounts.findBy("frozen", true)).map((account) => account.owner));
console.log(await accounts.update(ada.id, { kobo: 450000 }));
console.log(await branches.findById(101), await accounts.findById("ACC-404"));
```

Output of `npx tsx repository-demo.ts` and of the browser terminal

```ts
ACC-001 [ 'Tunde' ]
{ owner: 'Ada', kobo: 450000, frozen: false, id: 'ACC-001' }
{ city: 'Lagos', id: 101 } undefined
```

And the calls the design makes unwritable:

repository-misuse.ts

```ts
import { MemoryRepository } from "./repository.js";

interface Account {
  id: string;
  owner: string;
  kobo: number;
  frozen: boolean;
}

const accounts = new MemoryRepository<Account>(() => "ACC-001");

await accounts.findBy("frozen", "yes");
await accounts.update("ACC-001", { id: "ACC-999" });
await accounts.create({ id: "ACC-777", owner: "Eve", kobo: 0, frozen: false });
```

What `npx tsc --noEmit` prints

```ts
repository-misuse.ts:12:33 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'boolean'.

12 await accounts.findBy("frozen", "yes");
                                   ~~~~~

repository-misuse.ts:13:36 - error TS2353: Object literal may only specify known properties, and 'id' does not exist in type 'Partial<Omit<Account, "id">>'.

13 await accounts.update("ACC-001", { id: "ACC-999" });
                                      ~~

repository-misuse.ts:14:25 - error TS2353: Object literal may only specify known properties, and 'id' does not exist in type 'Omit<Account, "id">'.

14 await accounts.create({ id: "ACC-777", owner: "Eve", kobo: 0, frozen: false });
                           ~~


Found 3 errors in the same file, starting at: repository-misuse.ts:12
```

## Result<T, E> with helpers

[Generics](https://zudojs.oyinlola.site/learn/ts-generics#result) introduced `Result<T, E>`. Its real power shows when `E` is a union of error codes and small generic helpers combine results, so each step's possible failures add up in the type automatically:

result.ts

```ts
export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<const E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

export function andThen<T, U, E, F>(result: Result<T, E>, fn: (value: T) => Result<U, F>): Result<U, E | F> {
  return result.ok ? fn(result.value) : result;
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: NoInfer<T>): T {
  return result.ok ? result.value : fallback;
}
```

- `err<const E>` uses a const type parameter (from [Tuples](https://zudojs.oyinlola.site/learn/ts-tuples#inference)) so `err("insufficient-funds")` keeps the literal error code instead of widening it to `string`.
- `map` transforms the value and passes errors through untouched. `andThen` runs a next step that can fail too, and its error type is `E | F`: the union of both steps' failures.
- In the failure branches, `return result` is allowed because a failed `Result<T, E>` is also a failed `Result<U, E>`: it has no value, so `T` does not matter.

result-demo.ts

```ts
import { andThen, err, map, ok, unwrapOr } from "./result.js";
import type { Result } from "./result.js";

interface Account {
  id: string;
  kobo: number;
}

const accounts = new Map<string, Account>([
  ["ACC-1", { id: "ACC-1", kobo: 500000 }],
  ["ACC-2", { id: "ACC-2", kobo: 1000 }],
]);

function checkAmount(kobo: number) {
  return Number.isInteger(kobo) && kobo > 0 ? ok(kobo) : err("invalid-amount");
}

function findAccount(id: string) {
  const account = accounts.get(id);
  return account ? ok(account) : err("account-not-found");
}

function debit(account: Account, kobo: number) {
  return account.kobo >= kobo ? ok({ ...account, kobo: account.kobo - kobo }) : err("insufficient-funds");
}

type WithdrawError = "invalid-amount" | "account-not-found" | "insufficient-funds";

function withdraw(id: string, kobo: number): Result<number, WithdrawError> {
  const debited = andThen(checkAmount(kobo), (amount) => andThen(findAccount(id), (account) => debit(account, amount)));
  return map(debited, (account) => account.kobo);
}

const attempts: [string, number][] = [["ACC-1", 250000], ["ACC-2", 5000], ["ACC-9", 100], ["ACC-1", -5]];
for (const [id, kobo] of attempts) {
  const result = withdraw(id, kobo);
  console.log(result.ok ? `${id}: new balance ${result.value}` : `${id}: ${result.error}`);
}
console.log(unwrapOr(withdraw("ACC-9", 100), 0));
```

Output of `npx tsx result-demo.ts` and of the browser terminal

```ts
ACC-1: new balance 250000
ACC-2: insufficient-funds
ACC-9: account-not-found
ACC-1: invalid-amount
0
```

None of the three steps has a written return type, yet `withdraw` compiles against `Result<number, WithdrawError>`: the helpers collected `"invalid-amount" | "account-not-found" | "insufficient-funds"` on their own. Remove one of the codes from `WithdrawError` and `tsc` points at `withdraw`. That is the design goal: the types track the failures so people do not have to.

## Page<T> and ApiResponse<T>

### Cursor pages

The `Page<T>` in the Generics lesson used page numbers. Real APIs that list transactions usually use a **cursor** instead: the id of the last item the client has seen. New transactions arriving between two requests then do not shift the pages. The generic part is the same: the page shape does not care what it holds.

page.ts

```ts
export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export function paginate<T extends { id: string }>(all: readonly T[], limit: number, after: string | null = null): Page<T> {
  const index = after === null ? -1 : all.findIndex((item) => item.id === after);
  if (after !== null && index === -1) throw new RangeError(`unknown cursor ${after}`);
  const items = all.slice(index + 1, index + 1 + limit);
  const last = items.at(-1);
  const more = index + 1 + limit < all.length;
  return { items, nextCursor: more && last !== undefined ? last.id : null };
}

export function mapPage<T, U>(page: Page<T>, fn: (item: T) => U): Page<U> {
  return { ...page, items: page.items.map(fn) };
}
```

`mapPage<T, U>` is a small but important design move: it changes what a page holds (full accounts to public summaries) while keeping everything else, so no endpoint can forget to copy `nextCursor`.

### One response shape for every endpoint

Clients are simpler when every endpoint answers in the same envelope: a `status` discriminant, then either `data` or an `error` with a code and a message. The data type varies per endpoint, and the error code can be narrowed per endpoint too:

api.ts

```ts
import type { Result } from "./result.js";

export type ApiResponse<T, E extends string = string> =
  | { readonly status: "success"; readonly data: T }
  | { readonly status: "error"; readonly error: { readonly code: E; readonly message: string } };

export function toResponse<T, E extends string>(result: Result<T, E>, messages: Record<E, string>): ApiResponse<T, E> {
  if (result.ok) return { status: "success", data: result.value };
  return { status: "error", error: { code: result.error, message: messages[result.error] } };
}
```

The `messages: Record<E, string>` parameter is the keyof-style design trick again: the object must have a message for *every* error code in `E`. Add a new failure to a service and every endpoint that turns it into a response stops compiling until someone writes the message.

api-demo.ts

```ts
import { mapPage, paginate } from "./page.js";
import { toResponse } from "./api.js";
import { err, ok } from "./result.js";
import type { Result } from "./result.js";

interface Account {
  id: string;
  owner: string;
  kobo: number;
  frozen: boolean;
}

const all: Account[] = [
  { id: "ACC-001", owner: "Ada", kobo: 500000, frozen: false },
  { id: "ACC-002", owner: "Tunde", kobo: 0, frozen: true },
  { id: "ACC-003", owner: "Ngozi", kobo: 120000, frozen: false },
];

const first = paginate(all, 2);
const summaries = mapPage(first, (account) => ({ id: account.id, owner: account.owner }));
console.log(summaries);
console.log(paginate(all, 2, first.nextCursor).items.map((account) => account.id));

type LookupError = "not-found" | "frozen";
const messages: Record<LookupError, string> = { "not-found": "No such account", frozen: "This account is frozen" };

function lookup(id: string): Result<Account, LookupError> {
  const account = all.find((a) => a.id === id);
  if (account === undefined) return err("not-found");
  return account.frozen ? err("frozen") : ok(account);
}

for (const id of ["ACC-003", "ACC-002", "ACC-404"]) {
  console.log(JSON.stringify(toResponse(lookup(id), messages)));
}
```

Output of `npx tsx api-demo.ts` and of the browser terminal

```json
{
  items: [
    { id: 'ACC-001', owner: 'Ada' },
    { id: 'ACC-002', owner: 'Tunde' }
  ],
  nextCursor: 'ACC-002'
}
[ 'ACC-003' ]
{"status":"success","data":{"id":"ACC-003","owner":"Ngozi","kobo":120000,"frozen":false}}
{"status":"error","error":{"code":"frozen","message":"This account is frozen"}}
{"status":"error","error":{"code":"not-found","message":"No such account"}}
```

Leave a code out of the messages and the compiler refuses:

api-missing.ts

```ts
import { toResponse } from "./api.js";
import { err } from "./result.js";
import type { Result } from "./result.js";

type LookupError = "not-found" | "frozen";
const result: Result<string, LookupError> = err("frozen");

console.log(toResponse(result, { "not-found": "No such account" }));
```

What `npx tsc --noEmit` prints

```ts
api-missing.ts:8:32 - error TS2741: Property 'frozen' is missing in type '{ "not-found": string; }' but required in type 'Record<LookupError, string>'.

8 console.log(toResponse(result, { "not-found": "No such account" }));
                                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


Found 1 error in api-missing.ts:8
```

## Cache<K, V>

Exchange rates, account summaries and permission sets are read far more often than they change, so backends cache them. A cache has two type parameters that are genuinely independent: the key and the value. The interface is tiny; the design decisions are in the constraint and in the clock:

cache.ts

```ts
export interface Cache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  getOrLoad(key: K, load: (key: K) => Promise<V>): Promise<V>;
}

export class TtlCache<K, V extends {} | null> implements Cache<K, V> {
  private readonly entries = new Map<K, { value: V; expiresAt: number }>();
  hits = 0;
  misses = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V): void {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  async getOrLoad(key: K, load: (key: K) => Promise<V>): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) {
      this.hits++;
      return cached;
    }
    this.misses++;
    const value = await load(key);
    this.set(key, value);
    return value;
  }
}
```

- `V extends {} | null` forbids `undefined` as a cached value. `{}` is the type of every value except `null` and `undefined`, so the constraint allows everything else. Without it, a cached `undefined` would be indistinguishable from a miss, and `getOrLoad` would call the loader every time. The constraint turns that subtle bug into a compile error.
- The clock is injected (`now`, defaulting to `Date.now`), so tests can move time forward without waiting; [Classes in TypeScript](https://zudojs.oyinlola.site/learn/ts-classes#fakes) uses the same idea for its fixed clock.
- `K` has no constraint because `Map` accepts any key. But object keys are compared by identity, not content: two equal `{ from: "USD", to: "NGN" }` objects are two different keys. For composite keys, build a string such as `"USD/NGN"`.

cache-demo.ts

```ts
import { TtlCache } from "./cache.js";

let clock = 0;
const rates = new TtlCache<string, number>(60_000, () => clock);

let calls = 0;
async function fetchRate(pair: string): Promise<number> {
  calls++;
  return pair === "USD/NGN" ? 1550 : 2050;
}

console.log(await rates.getOrLoad("USD/NGN", fetchRate));
console.log(await rates.getOrLoad("USD/NGN", fetchRate));
clock += 61_000;
console.log(await rates.getOrLoad("USD/NGN", fetchRate));
console.log(await rates.getOrLoad("GBP/NGN", fetchRate));
console.log({ calls, hits: rates.hits, misses: rates.misses });
```

Output of `npx tsx cache-demo.ts` and of the browser terminal

```ts
1550
1550
1550
2050
{ calls: 3, hits: 1, misses: 3 }
```

The second call is a hit. After the fake clock moves past 60 seconds, the entry has expired and the rate is fetched again. And the constraint at work:

cache-undefined.ts

```ts
import { TtlCache } from "./cache.js";

const profiles = new TtlCache<string, { name: string } | undefined>(30_000);
```

What `npx tsc --noEmit` prints

```ts
cache-undefined.ts:3:39 - error TS2344: Type '{ name: string; } | undefined' does not satisfy the constraint '{} | null'.
  Type 'undefined' is not assignable to type '{} | null'.

3 const profiles = new TtlCache<string, { name: string } | undefined>(30_000);
                                        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~


Found 1 error in cache-undefined.ts:3
```

## Typed events

When a transfer completes, several parts of the system care: notifications, the fraud checker, the audit log. An **event emitter** lets them subscribe without the transfer code knowing about them. The generic design problem is to make every event name and every payload checked. The key is an **event map**: one type that lists each event name with its payload type, used with `keyof` and indexed access:

events.ts

```ts
export class TypedEmitter<Events extends object> {
  private readonly listeners: { [K in keyof Events]?: Array<(payload: Events[K]) => void> } = {};

  on<K extends keyof Events>(name: K, listener: (payload: Events[K]) => void): () => void {
    const list = (this.listeners[name] ??= []);
    list.push(listener);
    return () => {
      const index = list.indexOf(listener);
      if (index >= 0) list.splice(index, 1);
    };
  }

  emit<K extends keyof Events>(name: K, payload: Events[K]): number {
    const list = this.listeners[name] ?? [];
    for (const listener of [...list]) listener(payload);
    return list.length;
  }
}
```

- `K extends keyof Events` limits names to the events in the map, and `Events[K]` picks the payload type for exactly that name. `on` and `emit` each have their own `K`, inferred from the name you pass.
- `{ [K in keyof Events]?: … }` is a **mapped type**: one optional property per event name, each holding listeners for that event's payload. [Advanced and utility types](https://zudojs.oyinlola.site/learn/ts-advanced#mapped) explains mapped types fully.
- `on` returns an unsubscribe function, so listeners can be removed without keeping a reference to the emitter's internals. `emit` loops over a copy, so a listener that unsubscribes itself does not skip the next one.

events-demo.ts

```ts
import { TypedEmitter } from "./events.js";

interface BankEvents {
  "transfer.completed": { from: string; to: string; kobo: number };
  "account.frozen": { accountId: string; reason: string };
}

const events = new TypedEmitter<BankEvents>();

const stop = events.on("transfer.completed", (event) => {
  console.log(`notify ${event.to}: you received ₦${event.kobo / 100}`);
});
events.on("account.frozen", (event) => console.log(`compliance: ${event.accountId} frozen (${event.reason})`));

console.log(events.emit("transfer.completed", { from: "ACC-001", to: "ACC-002", kobo: 250000 }));
stop();
console.log(events.emit("transfer.completed", { from: "ACC-001", to: "ACC-003", kobo: 1000 }));
events.emit("account.frozen", { accountId: "ACC-002", reason: "KYC expired" });
```

Output of `npx tsx events-demo.ts` and of the browser terminal

```ts
notify ACC-002: you received ₦2500
1
0
compliance: ACC-002 frozen (KYC expired)
```

events-misuse.ts

```ts
import { TypedEmitter } from "./events.js";

interface BankEvents {
  "transfer.completed": { from: string; to: string; kobo: number };
}

const events = new TypedEmitter<BankEvents>();
events.emit("transfer.complete", { from: "ACC-001", to: "ACC-002", kobo: 250000 });
events.emit("transfer.completed", { from: "ACC-001", to: "ACC-002", kobo: "2500" });
```

What `npx tsc --noEmit` prints

```ts
events-misuse.ts:8:13 - error TS2345: Argument of type '"transfer.complete"' is not assignable to parameter of type '"transfer.completed"'.

8 events.emit("transfer.complete", { from: "ACC-001", to: "ACC-002", kobo: 250000 });
              ~~~~~~~~~~~~~~~~~~~

events-misuse.ts:9:69 - error TS2322: Type 'string' is not assignable to type 'number'.

9 events.emit("transfer.completed", { from: "ACC-001", to: "ACC-002", kobo: "2500" });
                                                                      ~~~~

  events-misuse.ts:4:53 - The expected type comes from property 'kobo' which is declared here on type '{ from: string; to: string; kobo: number; }'
    4   "transfer.completed": { from: string; to: string; kobo: number };
                                                          ~~~~


Found 2 errors in the same file, starting at: events-misuse.ts:8
```

A misspelled event name and a payload of the wrong shape are both compile errors. [A type-safe event system](https://zudojs.oyinlola.site/learn/ts-typed-events) in the Advanced TypeScript course takes this further (wildcards, async listeners, error isolation), and [the ZudoJS events lesson](https://zudojs.oyinlola.site/learn/zudo-events) shows the production version.

## Build: a transfer service from the pieces

Now compose the toolkit. The service depends on the `Repository` interface (not the memory class), returns a `Result` with a closed set of error codes, announces success with a typed event, and the endpoint turns the result into an `ApiResponse`:

transfer.ts

```ts
import { MemoryRepository } from "./repository.js";
import type { Repository } from "./repository.js";
import { TypedEmitter } from "./events.js";
import { err, ok } from "./result.js";
import type { Result } from "./result.js";
import { toResponse } from "./api.js";

interface Account {
  id: string;
  owner: string;
  kobo: number;
  frozen: boolean;
}

interface BankEvents {
  "transfer.completed": { from: string; to: string; kobo: number };
}

type TransferError = "invalid-amount" | "same-account" | "account-not-found" | "account-frozen" | "insufficient-funds";

class TransferService {
  constructor(
    private readonly accounts: Repository<Account>,
    private readonly events: TypedEmitter<BankEvents>,
  ) {}

  private async usable(id: string): Promise<Result<Account, "account-not-found" | "account-frozen">> {
    const account = await this.accounts.findById(id);
    if (account === undefined) return err("account-not-found");
    return account.frozen ? err("account-frozen") : ok(account);
  }

  async transfer(fromId: string, toId: string, kobo: number): Promise<Result<{ balance: number }, TransferError>> {
    if (!Number.isInteger(kobo) || kobo <= 0) return err("invalid-amount");
    if (fromId === toId) return err("same-account");
    const from = await this.usable(fromId);
    if (!from.ok) return from;
    const to = await this.usable(toId);
    if (!to.ok) return to;
    if (from.value.kobo < kobo) return err("insufficient-funds");
    await this.accounts.update(fromId, { kobo: from.value.kobo - kobo });
    await this.accounts.update(toId, { kobo: to.value.kobo + kobo });
    this.events.emit("transfer.completed", { from: fromId, to: toId, kobo });
    return ok({ balance: from.value.kobo - kobo });
  }
}

const messages: Record<TransferError, string> = {
  "invalid-amount": "Amount must be a positive whole number of kobo",
  "same-account": "You cannot transfer to the same account",
  "account-not-found": "Account not found",
  "account-frozen": "One of the accounts is frozen",
  "insufficient-funds": "Insufficient funds",
};

let seq = 0;
const accounts = new MemoryRepository<Account>(() => `ACC-${String(++seq).padStart(3, "0")}`);
await accounts.create({ owner: "Ada", kobo: 500000, frozen: false });
await accounts.create({ owner: "Tunde", kobo: 1000, frozen: false });
await accounts.create({ owner: "Eve", kobo: 0, frozen: true });

const events = new TypedEmitter<BankEvents>();
events.on("transfer.completed", (e) => console.log(`[event] ${e.from} -> ${e.to} ${e.kobo}`));
const service = new TransferService(accounts, events);

const requests: [string, string, number][] = [
  ["ACC-001", "ACC-002", 250000],
  ["ACC-002", "ACC-001", 999999],
  ["ACC-001", "ACC-003", 100],
  ["ACC-001", "ACC-001", 100],
  ["ACC-001", "ACC-404", 100],
  ["ACC-001", "ACC-002", 10.5],
];

for (const [from, to, kobo] of requests) {
  console.log(JSON.stringify(toResponse(await service.transfer(from, to, kobo), messages)));
}
console.log((await accounts.findById("ACC-002"))?.kobo);
```

Output of `npx tsx transfer.ts` and of the browser terminal

```json
[event] ACC-001 -> ACC-002 250000
{"status":"success","data":{"balance":250000}}
{"status":"error","error":{"code":"insufficient-funds","message":"Insufficient funds"}}
{"status":"error","error":{"code":"account-frozen","message":"One of the accounts is frozen"}}
{"status":"error","error":{"code":"same-account","message":"You cannot transfer to the same account"}}
{"status":"error","error":{"code":"account-not-found","message":"Account not found"}}
{"status":"error","error":{"code":"invalid-amount","message":"Amount must be a positive whole number of kobo"}}
251000
```

Every piece did one job. `if (!from.ok) return from;` works because a failed `Result<Account, "account-not-found" | "account-frozen">` is also a failed `Result<{ balance: number }, TransferError>`: its error codes are a subset of `TransferError`, and it has no value. The `messages` record must cover all five codes. The service never mentions `MemoryRepository`, so a database-backed repository can replace it without touching this class, and a test can pass a fake.

> WHAT IS STILL MISSING
>
> The two `update` calls are not atomic: if the second one fails, money has left one account and arrived nowhere. Real transfers run inside a database transaction, which [the transactions lesson](https://zudojs.oyinlola.site/learn/zudo-transactions) covers. Generic types make the pieces fit; they cannot make two writes happen together.

## Testing generic code

Generic code needs two kinds of tests.

- **Runtime tests with at least two different type arguments.** A repository tested only with string ids can hide a bug that only numbers trigger (such as a `Map` lookup with `"101"` instead of `101`). The demo above used `Account` and `Branch` for exactly that reason.
- **Type-level tests** that prove wrong calls do not compile. A `// @ts-expect-error` comment tells `tsc` "the next line must have an error". If it does, the error is silenced; if it does not, `tsc` reports an unused directive. So a file full of them compiles only while your API keeps refusing what it should refuse.

design.type-test.ts

```ts
import { MemoryRepository } from "./repository.js";
import { TtlCache } from "./cache.js";
import { TypedEmitter } from "./events.js";
import { toResponse } from "./api.js";
import { err } from "./result.js";

interface Account {
  id: string;
  kobo: number;
  frozen: boolean;
}

const accounts = new MemoryRepository<Account>(() => "ACC-001");
// @ts-expect-error: a boolean field cannot be compared with a string
void accounts.findBy("frozen", "yes");
// @ts-expect-error: ids cannot be changed through update
void accounts.update("ACC-001", { id: "ACC-2" });
// @ts-expect-error: undefined cannot be cached, it would look like a miss
new TtlCache<string, number | undefined>(1000);

const events = new TypedEmitter<{ "transfer.completed": { kobo: number } }>();
// @ts-expect-error: unknown event name
events.emit("transfer.done", { kobo: 1 });
// @ts-expect-error: every error code needs a message
toResponse(err("frozen" as "frozen" | "not-found"), { frozen: "Frozen" });

console.log("type tests compiled");
```

Output of `npx tsx design.type-test.ts` and of the browser terminal

```ts
type tests compiled
```

This file is checked by `tsc` like any other, so it runs in CI with no extra tool. Vitest adds `expectTypeOf` for positive type assertions too, covered in [Testing TypeScript](https://zudojs.oyinlola.site/learn/ts-testing).

## Generic APIs in production

- **Few type parameters, good defaults.** Most calls should need zero explicit type arguments. When a type needs five parameters, give four of them defaults, as `@zudojs/database` does.
- **Depend on interfaces.** Services take `Repository<Account>` and `Cache<K, V>`, not the concrete classes, so storage can change and tests can use fakes.
- **No return-only generics at boundaries.** `fetchJson<T>()` is `as T`. Return `unknown` and validate, or accept a validator and infer `T` from it.
- **Make error codes a closed union** and map them with `Record<E, …>`, so a new failure cannot reach clients without a message and a status.
- **Watch the runtime behind the types.** A cache needs expiry, a size limit and protection against many simultaneous misses for the same key (often by caching the *promise*); an emitter needs error isolation so one failing listener does not stop the others. Types describe these objects; they do not implement them.
- **Readable names for readable APIs.** `T` is fine for one parameter. With several, `TEntity`, `TId`, `Events` say more than `T`, `U`, `V`.

## Practice

TRY IT YOURSELF

### Replace a return-only generic with keyof

This settings reader returns whatever type the caller asks for. Redesign it with a `Settings` interface so the key decides the type, and a wrong key or a wrong expectation is a compile error.

settings.ts

```ts
const store: Record<string, unknown> = { dailyLimitKobo: 50000000, currency: "NGN", smsAlerts: true };

function getSetting<T>(key: string): T {
  return store[key] as T;
}

const limit = getSetting<string>("dailyLimitKobo");
try {
  console.log(limit.toUpperCase());
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx settings.ts` and of the browser terminal

```ts
TypeError: limit.toUpperCase is not a function
```

**Show a solution**

settings.ts

```ts
interface Settings {
  dailyLimitKobo: number;
  currency: "NGN" | "USD";
  smsAlerts: boolean;
}

const store: Settings = { dailyLimitKobo: 50000000, currency: "NGN", smsAlerts: true };

function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  return store[key];
}

const limit = getSetting("dailyLimitKobo");
const currency = getSetting("currency");
console.log(limit / 100, currency.toLowerCase(), getSetting("smsAlerts"));
```

Output of `npx tsx settings.ts` and of the browser terminal

```ts
500000 ngn true
```

Now `K` is inferred from the key you pass, and `Settings[K]` gives the matching type: `number` for the limit, `"NGN" | "USD"` for the currency. The caller cannot choose a type; the key decides. `getSetting("dailyLimit")` is a compile error, and no assertion is left.

TRY IT YOURSELF

### Add once() to the emitter

Add a method `once<K extends keyof Events>(name: K, listener: (payload: Events[K]) => void): void` to `TypedEmitter` that runs the listener for the first event only. Build it on top of `on`.

**Show a solution**

once.ts

```ts
class TypedEmitter<Events extends object> {
  private readonly listeners: { [K in keyof Events]?: Array<(payload: Events[K]) => void> } = {};

  on<K extends keyof Events>(name: K, listener: (payload: Events[K]) => void): () => void {
    const list = (this.listeners[name] ??= []);
    list.push(listener);
    return () => {
      const index = list.indexOf(listener);
      if (index >= 0) list.splice(index, 1);
    };
  }

  once<K extends keyof Events>(name: K, listener: (payload: Events[K]) => void): void {
    const stop = this.on(name, (payload) => {
      stop();
      listener(payload);
    });
  }

  emit<K extends keyof Events>(name: K, payload: Events[K]): number {
    const list = this.listeners[name] ?? [];
    for (const listener of [...list]) listener(payload);
    return list.length;
  }
}

const events = new TypedEmitter<{ "account.opened": { owner: string } }>();
events.once("account.opened", (e) => console.log(`welcome e-mail to ${e.owner}`));
events.emit("account.opened", { owner: "Ada" });
events.emit("account.opened", { owner: "Tunde" });
```

Output of `npx tsx once.ts` and of the browser terminal

```ts
welcome e-mail to Ada
```

The wrapper listener unsubscribes itself before calling yours. Because `emit` loops over a copy of the list, removing a listener during the loop is safe. `once` has its own `K`, so its payload type is checked exactly like `on`'s.

TRY IT YOURSELF

### Combine a list of Results

Write `all<T, E>(results: readonly Result<T, E>[]): Result<T[], E>` that returns every value when all succeeded, or the *first* error. Use it to validate a batch of transfer amounts.

**Show a solution**

all.ts

```ts
type Result<T, E = string> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

function all<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) return result;
    values.push(result.value);
  }
  return { ok: true, value: values };
}

function checkAmount(kobo: number): Result<number, "invalid-amount"> {
  return Number.isInteger(kobo) && kobo > 0 ? { ok: true, value: kobo } : { ok: false, error: "invalid-amount" };
}

console.log(all([5000, 1200, 700].map(checkAmount)));
console.log(all([5000, -1, 0].map(checkAmount)));
```

Output of `npx tsx all.ts` and of the browser terminal

```json
{ ok: true, value: [ 5000, 1200, 700 ] }
{ ok: false, error: 'invalid-amount' }
```

The loop stops at the first failure and returns it unchanged, which type-checks for the same reason as in `map`: a failed result carries no value. The value type changes from `T` to `T[]`, and `E` passes through.

## Recap

- A type parameter should connect things and appear at least twice. A return-only generic is an unchecked assertion; return `unknown` and validate instead.
- Design for inference: put type parameters where values reveal them, and use `NoInfer<T>` for arguments that should only be checked, like fallbacks.
- Constraints say what you need and no more (`Events extends object`, not `Record<string, unknown>`); defaults keep common uses short.
- `K extends keyof T` with `T[K]` ties a value to a chosen key: repository queries, settings, event payloads. `Record<E, …>` forces one entry per error code.
- `Repository<T, Id>`, `Result<T, E>` with `map`/`andThen`, `Page<T>` with `mapPage`, `ApiResponse<T, E>`, `Cache<K, V>` and a typed emitter compose into services whose failures are tracked by the compiler.
- Test generic code with several type arguments at runtime, and with `// @ts-expect-error` lines at the type level.

Next: [Advanced and utility types](https://zudojs.oyinlola.site/learn/ts-advanced), where `keyof`, mapped types like the emitter's listener table, and utility types such as `Omit` and `Partial` get their full treatment.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
