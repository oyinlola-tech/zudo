---
title: "@zudojs/types — Type Guards, Utility Types & Converters"
description: "Documentation for @zudojs/types — shared type guards (isPlainObject, isDate, isEmail), utility types (Maybe, DeepReadonly, Prettify) and type converters for the ZudoJS framework."
source: https://zudojs.oyinlola.site/docs/packages-types
---

v1.1.0

# @zudojs/types

Small checks that tell TypeScript what a value really is, utility types that reshape existing types, safe converters, and injectable Clock and Random primitives.

TYPE GUARDS UTILITY TYPES CONVERTERS CLOCK & RANDOM ZERO DEPENDENCIES

## OVERVIEW

TypeScript only knows the types you write down. The moment a value arrives from outside your program — a JSON body, an environment variable, a database row — its type is `unknown`, and TypeScript refuses to let you use it until you prove what it is.

`@zudojs/types` gives you three kinds of tool for that. *Type guards* are small functions that check a value at runtime and, when they pass, tell TypeScript the narrower type. *Utility types* reshape a type you already have, without you rewriting it. *Converters* turn a doubtful value into a string, number, boolean or array, falling back to a value you choose instead of guessing.

It also ships `Clock` and `Random`: two tiny interfaces that stand in for `Date.now()` and secure random generation, so a test can hand your code a fixed clock and a seeded generator instead of the real thing.

WHEN YOU NEED IT

- You hold an `unknown` value and need TypeScript to accept it as something concrete
- You want one shared definition of "is an email", "is a UUID", "is an ISO date" across packages
- You are reshaping a type: deep readonly, deep partial, make two keys required
- Your code calls `Date.now()` or generates tokens, and you want to test it deterministically

WHEN YOU DON'T

- You need to check a whole object shape at once with field-level error messages. Use [@zudojs/validation](https://zudojs.oyinlola.site/docs/packages-validation.md) or [@zudojs/schema](https://zudojs.oyinlola.site/docs/packages-schema.md)
- The value came from your own code and TypeScript already knows its type
- You need hashing, signing or encryption. Use [@zudojs/crypto](https://zudojs.oyinlola.site/docs/packages-crypto.md)

## INSTALLATION

Install the package. It has no dependencies of its own, so nothing else is pulled in.

```bash
$ npm install @zudojs/types
```

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

> **Tip:** the utility types are types only. Import them with `import type { Maybe } from "@zudojs/types"` so they disappear entirely from the compiled JavaScript.

## QUICK START

This example takes a value TypeScript knows nothing about, proves it is an email, and converts two strings that came out of a query string.

```ts
import { isEmail, toNumber, camelToSnake } from "@zudojs/types";

// Pretend this arrived in a request body. TypeScript knows nothing about it.
const input: unknown = "ada@example.com";

if (isEmail(input)) {
  // Inside this block, TypeScript now treats `input` as a string.
  console.log(input.toUpperCase());
}

console.log(toNumber("25", 20));
console.log(toNumber("", 20));
console.log(camelToSnake("createdAt"));
```

What you should see:

```ts
ADA@EXAMPLE.COM
25
20
created_at
```

The second `toNumber` call is the interesting one. An empty query parameter is not the number zero, so the converter refuses to guess and returns the fallback you passed.

## TYPE GUARDS

A *type guard* is a function that answers "is this value a X?" at runtime, and whose return type is written `value is X` instead of `boolean`. That last part is what makes it more than an ordinary check: when the function returns `true`, TypeScript narrows the value to `X` for the rest of that branch.

Without a guard you would write a check and then still have to cast, and a cast is just you telling the compiler to trust you. A guard does the check and earns the trust in one step.

This function turns an unknown request body into a typed object, or `null` if any field is wrong.

```ts
import {
  isPlainObject,
  isNonEmptyString,
  isEmail,
  isPositiveNumber,
} from "@zudojs/types";

interface SignUp {
  name: string;
  email: string;
  age: number;
}

function readSignUp(body: unknown): SignUp | null {
  if (!isPlainObject(body)) return null;

  const { name, email, age } = body;

  if (!isNonEmptyString(name)) return null;
  if (!isEmail(email)) return null;
  if (!isPositiveNumber(age)) return null;

  // Every field is narrowed by now, so this object type-checks.
  return { name, email, age };
}

console.log(readSignUp({ name: "Ada", email: "ada@example.com", age: 36 }));
console.log(readSignUp({ name: "Ada", email: "ada@", age: 36 }));
```

What you should see:

```json
{ name: 'Ada', email: 'ada@example.com', age: 36 }
null
```

### Checking an array, and filtering out nulls

`isArrayOfType` takes another guard and applies it to every element. `isDefined` is written so that passing it straight to `Array.prototype.filter` removes the `null` from the resulting type.

```ts
import { isArrayOfType, isDefined, isNonEmptyString } from "@zudojs/types";

const tags: unknown = ["auth", "logging"];

if (isArrayOfType(tags, isNonEmptyString)) {
  // tags is string[] here.
  console.log(tags.join(", "));
}

const maybeIds: (string | null)[] = ["a", null, "b"];
const ids: string[] = maybeIds.filter(isDefined);
console.log(ids);
```

Prints `auth, logging` and then `[ 'a', 'b' ]`. Without `isDefined`, the filtered array would still be typed `(string | null)[]`.

### Guards that come in pairs

Four of the guards have a stricter or looser sibling. Pick deliberately.

| Looser | Stricter | How they differ |
| --- | --- | --- |
| `isUuid` | `isUuidV4` | `isUuid` accepts versions 1–8 (UUIDv7 included) plus the nil and max UUIDs. `isUuidV4` accepts v4 only. |
| `isIsoDateString` | `isIsoDateTimeString` | The first accepts `"2024-01-31"` as well as a full timestamp. The second requires a time component. |
| `isThenable` | `isPromise` | `isThenable` means "safe to `await`" and narrows to `PromiseLike`. `isPromise` means a real `Promise`, so `.catch()` and `.finally()` exist. |
| `isNonNullObject` | `isPlainObject` | The first accepts arrays and class instances. The second accepts only object literals and null-prototype objects. |

> **Watch out:** `isPositiveNumber` and `isFiniteNumber` both reject `Infinity` and `NaN`. A count, a size or a price has no meaningful infinite value, so the guard treats it as bad input rather than a large number.

> **In plain words:** `isUrl` is a guard, not a fetcher. It returns `true` only for a parseable `http:` or `https:` URL — `"ftp://example.com"` is `false` — and never checks whether the address exists.

## UTILITY TYPES

A *utility type* is a type that takes another type as input and produces a new one. You write `DeepReadonly<AppConfig>` the way you would call a function, except it runs in the compiler and produces zero JavaScript.

They exist so one type stays the single source of truth. Instead of hand-writing a second "everything optional" copy of your config interface that drifts out of date, you derive it.

This example freezes a config type all the way down, and makes two optional keys required.

```ts
import type { DeepReadonly, RequireKeys, Maybe } from "@zudojs/types";

interface AppConfig {
  database: { host: string; port: number };
  features: string[];
}

const config: DeepReadonly<AppConfig> = {
  database: { host: "localhost", port: 5432 },
  features: ["auth"],
};

// config.database.port = 3306;
// Error TS2540: Cannot assign to 'port' because it is a read-only property.

interface Draft {
  id?: string;
  title?: string;
  body?: string;
}

// Same as Draft, but `id` and `title` must be present.
type Publishable = RequireKeys<Draft, "id" | "title">;

const post: Publishable = { id: "p1", title: "Hello" };

// Maybe<T> is shorthand for T | null | undefined.
const nickname: Maybe<string> = null;

console.log(config.database.host, post.title, nickname);
```

Prints `localhost Hello null`. The two commented lines are compile errors, not runtime ones — remove the comment and `tsc` refuses to build.

### Dot-notation paths

`NestedKeyOf` lists every path through an object type as a string, and `NestedValueOf` looks up the type at one of those paths. This is how you type a `get("app.debug")` helper without `any`.

```ts
import type { NestedKeyOf, NestedValueOf } from "@zudojs/types";

interface Settings {
  app: { name: string; debug: boolean };
  db: { host: string };
}

type SettingsPath = NestedKeyOf<Settings>;
// "app" | "app.name" | "app.debug" | "db" | "db.host"

type DebugFlag = NestedValueOf<Settings, "app.debug">;
// boolean

const path: SettingsPath = "app.debug";
const flag: DebugFlag = true;
console.log(path, flag);
```

Prints `app.debug true`. Typing `"app.dbug"` instead is a compile error, because that string is not in the union.

> **Tip:** `Prettify<T>` changes nothing about a type except how your editor shows it. Wrap an intersection like `A & B` in it and the tooltip becomes one flat list of properties instead of `A & B`.

## CONVERTERS

A converter takes a value of any type and returns the type you asked for. Where the value cannot honestly be converted, it returns a fallback you supply rather than producing a plausible-looking wrong answer.

That rule matters more than it sounds. `Number("")` is `0`, and a missing page-size parameter silently becoming zero is a bug you find in production. These converters refuse instead.

This example parses an untrusted JSON body and reads two fields out of it.

```ts
import { safeJsonParse, toNumber, toBoolean, toString } from "@zudojs/types";

const body = '{"limit":"25","verbose":"yes"}';
const parsed = safeJsonParse<Record<string, unknown>>(body, {});

console.log(toNumber(parsed.limit, 20));
console.log(toBoolean(parsed.verbose));
console.log(toNumber("0x10", 20));
console.log(toString(Symbol("x")));
console.log(safeJsonParse("{not json", { limit: 20 }));
```

What you should see:

```ts
25
true
20
Symbol(x)
{ limit: 20 }
```

`toBoolean` accepts `"true"`, `"1"`, `"yes"` and `"on"` as true, and `"false"`, `"0"`, `"no"`, `"off"` and `""` as false. Anything else returns the fallback, which defaults to `false`.

> **Danger:** "safe" in `safeJsonParse` means only that broken JSON returns your fallback instead of throwing. The type parameter is a cast, not a check — the parsed value is not validated against it. Validate anything from a trust boundary with [@zudojs/validation](https://zudojs.oyinlola.site/docs/packages-validation.md) or [@zudojs/schema](https://zudojs.oyinlola.site/docs/packages-schema.md).

### Maps and objects

`mapToObject` turns a `Map` into a plain object, and `objectToMap` goes the other way.

```ts
import { mapToObject, objectToMap, toArray } from "@zudojs/types";

const headers = new Map([
  ["content-type", "application/json"],
  ["x-request-id", "abc"],
]);

const asObject = mapToObject(headers);
console.log(Object.keys(asObject));
console.log(Object.getPrototypeOf(asObject));
console.log(objectToMap({ a: 1 }).get("a"));
console.log(toArray("one"), toArray(["one", "two"]));
```

What you should see:

```json
[ 'content-type', 'x-request-id' ]
null
1
[ 'one' ] [ 'one', 'two' ]
```

> **Watch out:** the object `mapToObject` returns has a *null prototype* — that is the `null` on the second line above. Your keys are all there, but inherited methods are not, so `asObject.hasOwnProperty(k)` throws. Use `Object.hasOwn(asObject, k)` instead. The reason is that a `__proto__` key coming from request data must not be able to replace the result's prototype.

## CASE CONVERSION

Databases usually name columns `created_at`, JavaScript names properties `createdAt`, and CSS names classes `primary-button`. These four functions translate between those conventions.

Each call below converts one identifier.

```ts
import {
  camelToSnake,
  snakeToCamel,
  camelToKebab,
  kebabToCamel,
} from "@zudojs/types";

console.log(camelToSnake("createdAt"));
console.log(camelToSnake("HelloWorld"));
console.log(camelToSnake("parseHTTPResponse"));
console.log(snakeToCamel("user_name"));
console.log(camelToKebab("primaryButton"));
console.log(kebabToCamel("get-user-data"));
```

What you should see:

```ts
created_at
hello_world
parse_http_response
userName
primary-button
getUserData
```

Note the second and third lines. A leading capital does not produce a leading underscore, and a run of capitals stays one word — `parseHTTPResponse` becomes `parse_http_response`, not `parse_h_t_t_p_response`.

## CLOCK AND RANDOM

Code that calls `Date.now()` or generates a random token directly is hard to test: every run gives a different answer. The fix is to accept the capability as a parameter instead of reaching for it.

`Clock` has one method, `now()`. `ClockSeconds` has `nowSeconds()`. `Random` has `uuid()`, `int(max)`, `string(length)` and `custom(length, alphabet)`. The package ships a real implementation of each — `systemClock`, `systemClockSeconds`, `systemRandom` — plus test doubles.

Here a session-token function takes both as defaulted parameters, so production code calls it with no arguments and a test passes doubles.

```ts
import {
  systemClock,
  systemRandom,
  FixedClock,
  SeededRandom,
} from "@zudojs/types";
import type { Clock, Random, PseudoRandom } from "@zudojs/types";

function makeSessionId(
  clock: Clock = systemClock,
  random: Random = systemRandom,
): string {
  return `session_${clock.now()}_${random.uuid()}`;
}

// Production: real time, cryptographically secure id.
console.log(makeSessionId());
// session_1757376000000_9f1c8b0e-4d2a-4c1b-9a77-6b3f0c2e51da

// A FixedClock starts where you put it and only moves when you say so.
const clock = new FixedClock(1700000000000);
clock.advance(5000);
console.log(clock.now());

// The same seed always produces the same sequence.
const seeded: PseudoRandom = new SeededRandom(42);
console.log(seeded.string(8));
console.log(new SeededRandom(42).string(8));
```

What you should see (line 1 changes every run, the rest never do):

```ts
session_1757376000000_9f1c8b0e-4d2a-4c1b-9a77-6b3f0c2e51da
1700000005000
kesVo50h
kesVo50h
```

`FixedClock` also has `set(time)` if you want to jump to an exact millisecond instead of advancing.

## BRANDED TYPES

TypeScript matches types by shape, not by name. Two interfaces with the same methods are interchangeable, even if they mean completely different things. That is usually convenient and occasionally dangerous.

A *branded* (or *nominal*) type adds one impossible-to-forge property — here a `unique symbol` that is never exported — purely so shape-matching stops working. Now only code that goes through the package's own factory can produce the type.

`Random` is branded. `PseudoRandom` has exactly the same four methods but no brand, so `SeededRandom` cannot be handed to anything asking for a `Random`. Without that, a test double whose output is fully predictable from its seed could be injected where unpredictability is the whole requirement, and every token would be guessable.

This is the error you get if you try, and it is a good error to get.

```ts
import { SeededRandom } from "@zudojs/types";
import type { Random, PseudoRandom } from "@zudojs/types";

const ok: PseudoRandom = new SeededRandom(1);
console.log(ok.deterministic);
// true

// const bad: Random = new SeededRandom(1);
// Error TS2741: Property '[SecureRandomBrand]' is missing in type
// 'SeededRandom' but required in type 'Random'.
```

To supply your own secure generator, build it with `defineSecureRandom`. That function is the only supported way to attach the brand, so the claim "this output is unpredictable" is something you opt into explicitly.

```ts
import { defineSecureRandom } from "@zudojs/types";
import type { Random } from "@zudojs/types";
import { randomInt, randomUUID } from "node:crypto";

const ALPHANUM =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function draw(length: number, alphabet: string): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet.charAt(randomInt(alphabet.length));
  }
  return out;
}

const nodeRandom: Random = defineSecureRandom({
  uuid: (): string => randomUUID(),
  int: (max: number): number => randomInt(max),
  string: (length: number): string => draw(length, ALPHANUM),
  custom: (length: number, alphabet: string): string =>
    draw(length, alphabet),
});

console.log(nodeRandom.string(8).length);
// 8
```

> **Danger:** only call `defineSecureRandom` for a generator backed by `node:crypto`, Web Crypto or a hardware source. Wrapping `Math.random()` in it compiles perfectly and quietly makes every token it produces predictable.

> **In plain words:** `systemRandom.int(max)` draws uniformly for every bound, not just powers of two — it re-draws rather than taking a remainder, so no value comes up more often than another. It throws a `RangeError` unless `max` is an integer from 1 to `Number.MAX_SAFE_INTEGER` (`MAX_RANDOM_INT_BOUND`); bounds above 232 draw 53 bits.

## API REFERENCE

Everything below is exported from `@zudojs/types`.

### Type guards

| Name | What it does | Notes |
| --- | --- | --- |
| `isPlainObject(value)` | True for an object literal or a null-prototype object | False for arrays, `null`, class instances, `Date` |
| `isNonNullObject(value)` | True for any non-null object | Arrays and class instances included |
| `isNonEmptyString(value)` | True for a string of length ≥ 1 | `" "` passes; it is not trimmed |
| `isFiniteNumber(value)` | True for a finite number | Rejects `NaN` and both infinities |
| `isPositiveNumber(value)` | True for a finite number greater than 0 | `0` and `Infinity` are false |
| `isInteger(value)` | True for a whole number | Negatives and `0` pass |
| `isDate(value)` | True for a valid `Date` instance | `new Date("nope")` is false |
| `isUrl(value)` | True for a parseable `http:`/`https:` URL string | Other protocols are false |
| `isEmail(value)` | True for an email address string | Same acceptance set as `ValidationPattern.EMAIL` in @zudojs/constants (max 254 chars). @zudojs/validation's `email` constraint uses the same pattern and bound. |
| `isUuid(value)` | True for a UUID of versions 1–8 | Nil and max UUIDs accepted |
| `isUuidV4(value)` | True for a v4 UUID only | Use when the version matters |
| `isIsoDateString(value)` | True for an ISO 8601 date, with or without a time | Validates the calendar date; accepts `+02:00` offsets |
| `isIsoDateTimeString(value)` | Same, but a time component is required | `"2024-01-01"` is false |
| `isArrayOfType(value, guard)` | True if every element passes `guard` | An empty array passes |
| `isDefined(value)` | True unless the value is `null` or `undefined` | `0`, `""` and `false` pass. Pass it to `.filter()` |
| `isFunction(value)` | True for any function | Classes included |
| `isPromise(value)` | True for a native `Promise` | Narrows to `Promise`, so `.catch()` is safe |
| `isThenable(value)` | True for anything with a `then` method | Narrows to `PromiseLike` — `await` only |

### Converters

| Name | What it does | Notes |
| --- | --- | --- |
| `safeJsonParse<T>(json, fallback)` | Parses JSON, returning `fallback` on failure | `T` is a cast, not a check. `__proto__`, `constructor` and `prototype` keys are dropped at every depth, by design |
| `toString(value, fallback?)` | Converts to a string | Always returns a string. Default fallback `""`; functions use it |
| `toNumber(value, fallback?)` | Converts to a finite number | Default fallback `NaN`. Refuses `""`, `"0x10"`, `"1e999"`, `Infinity` |
| `toBoolean(value, fallback?)` | Converts to a boolean | Default fallback `false`. `NaN` uses the fallback |
| `toArray(value)` | Wraps a non-array in an array | An existing array is returned unchanged |
| `mapToObject(map)` | Turns a `Map` into a plain object | Result has a null prototype; use `Object.hasOwn` |
| `objectToMap(obj)` | Turns an object into a `Map` | Own enumerable keys only |
| `snakeToCamel(str)` | `user_name` → `userName` |  |
| `camelToSnake(str)` | `createdAt` → `created_at` | Handles leading capitals and acronyms; Unicode-aware, keeps punctuation |
| `kebabToCamel(str)` | `get-user-data` → `getUserData` |  |
| `camelToKebab(str)` | `primaryButton` → `primary-button` | Handles leading capitals and acronyms; Unicode-aware, keeps punctuation |

### Runtime values and classes

| Name | What it does | Notes |
| --- | --- | --- |
| `systemClock` | A `Clock` backed by `Date.now()` | Milliseconds |
| `systemClockSeconds` | A `ClockSeconds` backed by `Date.now()` | Whole seconds |
| `systemRandom` | The secure `Random` implementation | Uses Web Crypto, falling back to `node:crypto` |
| `defineSecureRandom(impl)` | Brands your own implementation as a `Random` | The only way to produce a `Random` |
| `FixedClock` | Test `Clock`: `new FixedClock(ms)`, `now()`, `set(ms)`, `advance(deltaMs)` | Defaults to `0` |
| `SeededRandom` | Test `PseudoRandom`: `new SeededRandom(seed)` | Defaults to seed `1`. Backed by mulberry32 (sequences differ from earlier releases). Not assignable to `Random` |

### Interfaces

| Name | What it does | Notes |
| --- | --- | --- |
| `Clock` | `now(): number` | Milliseconds since the epoch |
| `ClockSeconds` | `nowSeconds(): number` | Seconds since the epoch |
| `Random` | `uuid()`, `int(max)`, `string(length)`, `custom(length, alphabet)` | Branded. Build one with `defineSecureRandom` |
| `PseudoRandom` | Same four methods plus `deterministic: true` | For test doubles only |

### Utility types

| Name | What it does | Notes |
| --- | --- | --- |
| `DeepReadonly<T>` | Makes every property readonly, at every depth | Handles arrays, `Map` and `Set` |
| `DeepPartial<T>` | Makes every property optional, at every depth | Good for patch payloads |
| `DeepRequired<T>` | Makes every property required, at every depth | Good for a config after defaults are applied |
| `Prettify<T>` | Flattens a type for display | No effect on behaviour, only on tooltips |
| `Nullable<T>` | `T \| null` |  |
| `Undefinable<T>` | `T \| undefined` |  |
| `Maybe<T>` | `T \| null \| undefined` | Pairs with `isDefined` |
| `MaybePromise<T>` | `T \| Promise<T>` | For a callback that may be sync or async |
| `StringKeysOf<T>` / `NumberKeysOf<T>` | Only the string / number keys of `T` |  |
| `RequireKeys<T, K>` | Makes the listed keys required | Everything else is unchanged |
| `OptionalKeys<T, K>` | Makes the listed keys optional | Everything else is unchanged |
| `PartialExcept<T, K>` | Everything optional except the listed keys |  |
| `RequiredExcept<T, K>` | Everything required except the listed keys |  |
| `PickByValue<T, V>` / `OmitByValue<T, V>` | Keeps or drops properties by their value type | e.g. all the `string` fields |
| `NestedKeyOf<T>` | Every dot-notation path through `T`, as a string union |  |
| `NestedValueOf<T, P>` | The type found at path `P` | `never` if the path does not exist |
| `AsyncReturnType<T>` | What an async function resolves to | The awaited type, not the `Promise` |

## COMMON MISTAKES

- **Trusting the type parameter of `safeJsonParse`.** Nothing checks the parsed value against it, so a missing field is `undefined` at runtime while TypeScript says it is a string. *Fix:* use it for trusted data, and validate untrusted data with @zudojs/validation or @zudojs/schema.
- **Calling `hasOwnProperty` on a `mapToObject` result.** The object has a null prototype, so the method does not exist and the call throws. *Fix:* `Object.hasOwn(obj, key)`, or `key in obj`.
- **Expecting `toNumber("")` to be `0`.** A blank string is a missing value, not a zero, so you get your fallback — and `NaN` if you did not pass one. *Fix:* always pass a fallback: `toNumber(query.limit, 20)`.
- **Using `isPromise` to check "can I await this?".** A plain thenable fails the check even though awaiting it works fine. *Fix:* use `isThenable` for awaiting; keep `isPromise` for when you need `.catch()` or `.finally()`.
- **Passing a `SeededRandom` where a `Random` is expected.** It will not compile, and that is the point — its output is predictable from the seed. *Fix:* type the parameter `PseudoRandom` in tests, or wrap a real crypto source with `defineSecureRandom`.
- **Reaching for `isUuidV4` by habit.** UUIDv7 identifiers, which sort by creation time and are increasingly common, fail it. *Fix:* use `isUuid` unless the version genuinely matters.

## RELATED PACKAGES

- [@zudojs/validation](https://zudojs.oyinlola.site/docs/packages-validation.md) — when one guard is not enough and you need a whole object checked with field-level errors.
- [@zudojs/schema](https://zudojs.oyinlola.site/docs/packages-schema.md) — Zudo's own schema builder, for the same job without a Zod dependency.
- [@zudojs/crypto](https://zudojs.oyinlola.site/docs/packages-crypto.md) — hashing, signing and encryption, when a random string is not what you actually need.
- [@zudojs/testing](https://zudojs.oyinlola.site/docs/packages-testing.md) — where `FixedClock` and `SeededRandom` usually end up being used.
- [@zudojs/serialization](https://zudojs.oyinlola.site/docs/packages-serialization.md) — converting values to and from JSON once you know they are safe.

## COMPLETE EXPORT INDEX

Every name `@zudojs/types` exports from its package root at v1.1.0 — **61** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 61 exports**

Classes (2)

`FixedClock` `SeededRandom`

Functions (30)

`camelToKebab` `camelToSnake` `defineSecureRandom` `isArrayOfType` `isDate` `isDefined` `isEmail` `isFiniteNumber` `isFunction` `isInteger` `isIsoDateString` `isIsoDateTimeString` `isNonEmptyString` `isNonNullObject` `isPlainObject` `isPositiveNumber` `isPromise` `isThenable` `isUrl` `isUuid` `isUuidV4` `kebabToCamel` `mapToObject` `objectToMap` `safeJsonParse` `snakeToCamel` `toArray` `toBoolean` `toNumber` `toString`

Interfaces (4)

`Clock` `ClockSeconds` `PseudoRandom` `Random`

Type aliases (20)

`AsyncReturnType` `DeepPartial` `DeepReadonly` `DeepRequired` `Maybe` `MaybePromise` `NestedKeyOf` `NestedValueOf` `Nullable` `NumberKeysOf` `OmitByValue` `OptionalKeyNames` `PartialExcept` `PartialKeys` `PickByValue` `Prettify` `RequiredExcept` `RequireKeys` `StringKeysOf` `Undefinable`

Constants (5)

`MAX_EMAIL_LENGTH` `MAX_RANDOM_INT_BOUND` `systemClock` `systemClockSeconds` `systemRandom`
