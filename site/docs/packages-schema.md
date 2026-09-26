---
title: "@zudojs/schema — Schema Definition & Parsing Engine"
description: "Complete documentation for @zudojs/schema — type-safe schema definition, runtime validation, parsing, and transformation engine."
source: https://zudojs.oyinlola.site/docs/packages-schema
---

v1.2.0

# @zudojs/schema

Describe the shape of your data once, then use that description to check incoming values, clean them up, and get matching TypeScript types.

SCHEMA VALIDATION PARSING TYPE-SAFE TRANSFORM

## OVERVIEW

Data that arrives from outside your program is untrusted. A request body, a query string, a JSON file, an environment variable: any of them can be missing a field, hold the wrong type, or contain nonsense. Your code has to check all of it before using it.

A *schema* is a description of what a value is allowed to look like. "An object with a `name` that is a string of at least two characters, and an `email` that looks like an email address." You write that description once with `@zudojs/schema`, and the package turns it into three things: a runtime check, a cleaned-up copy of the value, and a TypeScript type.

When a value does not match, you do not get a vague "invalid input". You get a list of *issues*, each one saying which field failed, why, and what was expected.

When you need it

- Checking request bodies, query strings, or form data.
- Reading config or JSON files you did not write.
- Turning strings from a URL into numbers and booleans.
- Keeping one source of truth for a type and its runtime check.

When you don't

- Values your own code built and already typed.
- A single `typeof x === "string"` check.
- Async checks like "does this user exist in the database" (schemas are synchronous).

## INSTALLATION

Install the package. It pulls in its own runtime dependencies (`@zudojs/errors`, `@zudojs/constants`, `@zudojs/types`) automatically.

```bash
$ npm install @zudojs/schema
```

> **Note:** These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

## QUICK START

This defines a user schema, checks a good value, then checks a bad one and prints what went wrong.

```ts
import { schema } from "@zudojs/schema";

const UserSchema = schema.object({
  name: schema.string().min(2),
  email: schema.string().email(),
  age: schema.number().int().min(0).optional(),
});

// A good value: parse() returns a typed copy.
const user = UserSchema.parse({ name: "Ada", email: "ada@example.com" });
console.log(user);
// { name: "Ada", email: "ada@example.com" }   (age was left out, so it stays out)

// A bad value: safeParse() reports issues instead of throwing.
const result = UserSchema.safeParse({ name: "A", email: "nope" });
if (!result.success) {
  for (const issue of result.issues) {
    console.log(issue.path.join("."), issue.code, issue.message);
  }
}
// name too_small String must be at least 2 characters
// email invalid_format Invalid email format
```

You should see the parsed user printed first, then two lines describing the two problems with the second value.

## PARSE VS VALIDATE

*Validating* answers a yes/no question: does this value match the schema? *Parsing* goes one step further: it validates, and then hands you a new value that is guaranteed to match. That new value may differ from the input. Unknown object keys are dropped, `.trim()` removes whitespace, defaults are filled in.

Every schema has two methods that do this. They run the same checks; they differ only in how they report failure.

- `parse(input)` returns the parsed value, or **throws** a `SchemaError`. Use it when a bad value means "stop here".
- `safeParse(input)` never throws. It returns `{ success: true, data }` or `{ success: false, issues }`. Use it when you want to show the errors to someone.

Both accept `unknown`, so you can pass the raw result of `JSON.parse` straight in. This catches the thrown error from `parse()` and reads its issues.

```ts
import { schema, isSchemaValidationError } from "@zudojs/schema";

const AgeSchema = schema.number().int().min(0);
const fromTheWire: unknown = JSON.parse('"forty"');

try {
  AgeSchema.parse(fromTheWire);
} catch (error) {
  if (isSchemaValidationError(error)) {
    // error.issues is readonly SchemaIssue[] here: no cast needed.
    for (const issue of error.issues) {
      console.log(issue.code, issue.message);
    }
    // invalid_type Expected number, received string
  } else {
    throw error; // not a validation failure: a real bug
  }
}
```

`parse()` throws a `SchemaError<SchemaIssue>`. `isSchemaValidationError(error)` is a *type guard*: a function whose `true` answer tells TypeScript what the value is. After it, `error.issues` is typed `readonly SchemaIssue[]`, and the guard has also checked at runtime that every issue has a `code`, `path` and `message`. Anything else, such as a `TypeError` from your own code, fails the guard, so you can rethrow it.

> **Tip:** `SchemaError` itself lives in `@zudojs/errors`, which cannot know this package's issue type, so `error instanceof SchemaError` alone leaves `error.issues` as `unknown[]`. Use the guard instead of writing `error.issues as SchemaIssue[]`.

## READING A VALIDATION ISSUE

An *issue* is one plain object describing one problem. A failed `safeParse` gives you an array of them in `result.issues`; a thrown `SchemaError` carries the same array in `error.issues`.

Here is the single issue produced by checking a nested email field.

```ts
import { schema } from "@zudojs/schema";

const ProfileSchema = schema.object({
  user: schema.object({ email: schema.string().email() }),
});

const result = ProfileSchema.safeParse({ user: { email: "not-an-email" } });
if (!result.success) console.log(result.issues[0]);
// {
//   code: "invalid_format",
//   path: ["user", "email"],
//   message: "Invalid email format",
//   expected: "email"
// }
```

| Field | What it tells you |
| --- | --- |
| `code` | A short machine-readable reason, always present. Examples: `invalid_type`, `required`, `too_small`, `too_large`, `invalid_format`, `invalid_enum`, `unknown_keys`, `custom` (a refine failed), `coercion_failed`. |
| `path` | Where the problem is. An array of keys and array indexes, starting from the top of the value. `[]` means the whole value. `["tags", 1]` means the second item of `tags`. |
| `message` | A human-readable sentence you can show as-is. |
| `expected`, `received` | Optional. What the schema wanted and what it got, as strings. |
| `details` | Optional extra data. A failed union puts each branch's issues here. |

> **In plain words:** read `path` to find the field, `code` to decide how to handle it in code, and `message` to tell a person.

Messages are written to be shown to people, so counts read naturally: `schema.string().min(1)` reports "String must be at least 1 character" and `schema.array(item).min(1)` reports "Array must have at least 1 item", while larger counts use the plural ("at least 2 characters"). Match on `code`, never on the message text.

## BUILDING BLOCKS

Everything starts from the `schema` object. Each function on it builds a schema for one kind of value, and most return an object with extra methods that tighten the rule. Calling one of those methods returns a *new* schema; the original is never changed.

The two schemas you will use most are `string()` and `number()`.

```ts
import { schema } from "@zudojs/schema";

const Username = schema.string().trim().toLowerCase().min(3).max(20);
console.log(Username.parse("  Ada  "));   // "ada"

const Percent = schema.number().int().min(0).max(100);
console.log(Percent.safeParse(101).success); // false

const Role = schema.enum(["admin", "user"]);
console.log(Role.parse("admin"));         // "admin"
```

| Schema | Accepts | Rule methods |
| --- | --- | --- |
| `schema.string()` | Strings. Max 255 characters unless you set `.max()`. | `min`, `max`, `length`, `regex`, `email`, `url(options?)`, `uuid`, `uuidv4`, `datetime`, `date`, `time`, `ipv4`, `ipv6`, `phone`, `hexColor`, `trim`, `toLowerCase`, `toUpperCase` |
| `schema.number()` | Numbers. `NaN` is rejected. | `min`, `max`, `gt`, `lt`, `int`, `positive`, `negative`, `finite`, `safe`, `multipleOf` |
| `schema.boolean()` | `true` or `false`. | `coerce()` also accepts `"true"`, `"false"`, `1`, `0` |
| `schema.literal(v)` | Exactly the value `v` (string, number, boolean or null). | none |
| `schema.enum([...])` | One of the listed strings or numbers. | `getValues()` |
| `schema.bigint()`, `schema.symbol()` | A bigint / a symbol. | none |
| `schema.null()`, `schema.undefined()` | Exactly `null` / exactly `undefined`. | none |
| `schema.any()`, `schema.unknown()` | Anything at all (typed `any` / `unknown`). | none |
| `schema.never()` | Nothing; every value fails. | none |

Every schema in this table also has the chainable `.optional()`, `.nullable()`, `.default()`, `.refine()` and `.transform()` methods, so `schema.boolean().optional()` works just like `schema.string().optional()`. Before 1.2.0 only `string()`, `number()` and the coerce schemas had them.

> **Watch out:** `schema.string().trim()` changes the output, not the check. `min(3)` is measured after trimming, so `"  ab  "` fails.

### URLs and dates

`.url()` accepts only absolute `http:` and `https:` URLs by default. That is deliberate: a link a user submits should never be a `javascript:` or `data:` URL. For other kinds of URL, such as a database connection string in `DATABASE_URL`, list the schemes (protocols) you allow, or pass `"any"` to accept any scheme the standard `URL` parser understands.

```ts
import { schema } from "@zudojs/schema";

const Website = schema.string().url();
console.log(Website.safeParse("https://example.com").success);  // true
console.log(Website.safeParse("javascript:alert(1)").success); // false

const DatabaseUrl = schema.string().url({ protocols: ["postgres", "postgresql"] });
console.log(DatabaseUrl.parse("postgres://app:secret@db:5432/app"));
// postgres://app:secret@db:5432/app
console.log(DatabaseUrl.safeParse("https://example.com").success); // false: not in the list

const AnyUrl = schema.string().url({ protocols: "any" });
console.log(AnyUrl.safeParse("redis://cache:6379").success); // true
console.log(AnyUrl.safeParse("not a url").success);          // false
```

`.date()` (`YYYY-MM-DD`), `.datetime()` (`YYYY-MM-DDTHH:mm:ss` with optional fractions and a `Z` or `±hh:mm` offset) and `.time()` (`HH:mm:ss`) check that the value is a real one, not just that it has the right shape: the month is 01-12, the day exists in that month (29 February only in leap years), hours are 00-23, minutes and seconds 00-59, and an offset is at most 23:59.

```ts
const Day = schema.string().date();
console.log(Day.safeParse("2026-02-28").success); // true
console.log(Day.safeParse("2026-02-30").success); // false: February has no 30th
console.log(Day.safeParse("2028-02-29").success); // true: 2028 is a leap year

const At = schema.string().datetime();
console.log(At.safeParse("2026-09-23T10:15:00+01:00").success); // true
console.log(At.safeParse("2026-02-30T25:61:00Z").success);      // false
```

> **Changed in 1.2.0:** values such as `"2026-02-30"`, `"2026-13-45"` and `"2026-02-30T25:61:00Z"` used to pass because only the digit pattern was checked; they now fail with `invalid_format`. `.url()` used to refuse every non-web URL with no way out, so a `postgres://` `DATABASE_URL` could not be validated; the `protocols` option is new, and the http/https default is unchanged.

## OBJECTS AND ARRAYS

`schema.object({ ... })` takes a *shape*: a plain object whose values are schemas. Every key in the shape is required unless its schema is optional or has a default. `schema.array(item)` checks every element against one item schema.

By default an object schema **strips** keys it does not know about. Call `.strict()` to reject them, or `.passthrough()` to keep them.

This builds a post with a list of tags, then derives smaller schemas from it.

```ts
import { schema } from "@zudojs/schema";

const PostSchema = schema.object({
  id: schema.string().uuid(),
  title: schema.string().min(1),
  tags: schema.array(schema.string()).max(5),
});

console.log(PostSchema.parse({
  id: "550e8400-e29b-41d4-a716-446655440000",
  title: "Hello",
  tags: ["intro"],
  extra: true,          // unknown key: dropped
}));
// { id: "550e8400-e29b-41d4-a716-446655440000", title: "Hello", tags: ["intro"] }

// Derived schemas
const NewPost   = PostSchema.omit(["id"]);       // no id yet
const PostPatch = PostSchema.partial();          // every key optional
const Titled    = PostSchema.pick(["title"]);    // only title
const Strict    = PostSchema.strict();           // extra keys now fail

console.log(Strict.safeParse({
  id: "550e8400-e29b-41d4-a716-446655440000", title: "Hi", tags: [], extra: 1,
}).success);
// false
```

| Method | What it does |
| --- | --- |
| `.pick(keys)` / `.omit(keys)` | New object schema with only / without those keys. |
| `.partial()` / `.required()` | Make every key optional / make every key required again. `.partial()` does not fill in defaults for keys that are left out (see below). |
| `.extend(other)` / `.merge(other)` | Add another object schema's keys (same thing; later keys win). |
| `.strip()` / `.strict()` / `.passthrough()` | Drop / reject / keep unknown keys. |
| `.shape` | The shape you passed in, for reading. |
| `.maxKeys(n)` | Allow up to `n` keys (default 100, `SCHEMA_DEFAULT_MAX_OBJECT_KEYS`); carried through `.pick/.omit/.partial/.extend/.merge`. |
| `schema.array(item)` | Methods: `.min()`, `.max()`, `.length()`, `.nonempty()`. Max 1000 items unless you set `.max()`. |
| `schema.tuple([a, b])` | Fixed-length array; position 0 must match `a`, position 1 must match `b`. |
| `schema.record(value)` | Object with any string keys, every value matching `value`. At most 100 keys by default (`SCHEMA_DEFAULT_MAX_OBJECT_KEYS`); raise with `.maxKeys(n)`. |
| `schema.map(key, value)`, `schema.set(item)` | A real `Map` / `Set` instance with checked entries. |

> **Tip:** Keys named `__proto__`, `constructor` and `prototype` are always rejected in input. This blocks prototype-pollution attacks without any work on your side.

### Update schemas with `partial()`

A common pattern is one schema for creating a record and `.partial()` of it for updating one, where the caller sends only the fields that change. `.partial()` keeps checking the fields that are present but leaves the missing ones missing, even when they have a `.default()`. Otherwise every update would quietly reset those fields to their defaults.

```ts
import { schema } from "@zudojs/schema";

const ProfileSchema = schema.object({
  name: schema.string().min(1),
  theme: schema.string().default("light"),
  newsletter: schema.boolean().default(false),
});

console.log(ProfileSchema.parse({ name: "Ada" }));
// { name: "Ada", theme: "light", newsletter: false }   (create: defaults filled in)

const ProfileUpdate = ProfileSchema.partial();
console.log(ProfileUpdate.parse({ theme: "dark" }));
// { theme: "dark" }   (update: only what was sent)
console.log(ProfileUpdate.safeParse({ name: "" }).success);
// false: a present value is still checked
```

> **Changed in 1.2.0:** `.partial()` used to apply defaults, so `{ theme: "dark" }` came back as `{ theme: "dark", newsletter: false }` and saving it overwrote the stored `newsletter` value.

## OPTIONAL, NULLABLE, DEFAULT

Three wrappers change what a schema accepts when the value is absent. *Optional* also accepts `undefined`. *Nullable* also accepts `null`. *Default* replaces `undefined` with a value you choose, then checks that value.

There are two ways to apply them. Every primitive schema (`string()`, `number()`, `boolean()`, `bigint()`, `symbol()`, `literal()`, `enum()`, `null()`, `undefined()`, `any()`, `unknown()`, `never()`) and every `coerce` schema has `.optional()`, `.nullable()` and `.default()` methods. Structures (objects, arrays, tuples, records, maps, sets) and combinations (unions, intersections, lazy schemas) do not, so you wrap them with `schema.optional(x)`, `schema.nullable(x)` or `schema.default(x, value)`.

Both forms are shown here. Missing keys get their default. An optional key that is missing from the input is also missing from the result: it is not added with the value `undefined`.

```ts
import { schema } from "@zudojs/schema";

const SettingsSchema = schema.object({
  theme: schema.string().default("light"),                    // method form
  role: schema.enum(["admin", "user"]).default("user"),        // method form
  nickname: schema.string().optional(),
  avatar: schema.string().url().nullable(),
  tags: schema.default(schema.array(schema.string()), []), // wrapper form (arrays have no .default())
});

console.log(SettingsSchema.parse({ avatar: null }));
// { theme: "light", role: "user", avatar: null, tags: [] }

console.log(SettingsSchema.parse({ avatar: null, nickname: undefined }));
// { theme: "light", role: "user", nickname: undefined, avatar: null, tags: [] }
```

The second call sends `nickname` explicitly as `undefined`, so the key is kept. This matters when you save the result: a key that is not there leaves the stored column alone, while a key set to `undefined` may be written as `NULL`. Before 1.2.0 every missing optional key came back as `undefined`.

> **Watch out:** a default runs only for `undefined`. Passing `null` to a defaulted string schema is still an error; add `nullable` if you want both.

## REFINE AND TRANSFORM

Built-in rules cover types and sizes. For anything else, *refine* adds your own check: a function that gets the already-valid value and returns `true` or `false`, plus the message to report when it returns `false`. Refine and transform callbacks run only when the inner schema accepted the value.

*Transform* changes the output. Its function receives the valid value and returns something new, possibly of a different type. The schema's output type follows whatever you return.

Like the wrappers above, `.refine()` and `.transform()` are methods on every primitive and coerce schema (`schema.boolean().transform(...)` works too); for objects, arrays and other structures use `schema.refine(x, check, message)` and `schema.transform(x, fn)`.

```ts
import { schema } from "@zudojs/schema";

// Refine: a string that must start with "USR_"
const UserId = schema.string().refine((v) => v.startsWith("USR_"), "Must start with USR_");
console.log(UserId.safeParse("abc"));
// { success: false, issues: [{ code: "custom", path: [], message: "Must start with USR_" }] }

// Transform: a string becomes its length
const Length = schema.string().transform((v) => v.length);
console.log(Length.parse("hello")); // 5

// Refine on an object: two fields must agree
const Range = schema.refine(
  schema.object({ from: schema.number(), to: schema.number() }),
  (r) => r.from <= r.to,
  "from must not be greater than to",
);
console.log(Range.safeParse({ from: 5, to: 1 }).success); // false
```

> **Watch out:** `.refine()` returns a plain `Schema`, so you cannot chain `.transform()` after it. Wrap instead: `schema.transform(UserId, fn)`. A transform that throws is reported as a `transform_failed` issue.

## COMBINING SCHEMAS

A *union* means "one of these". The value is tried against each member in order and the first match wins. A *discriminated union* is a union of objects that all carry a tag field (the discriminator); the tag picks the member directly, which is faster and gives clearer errors.

An *intersection* means "both of these"; two object schemas are merged into one result (nested objects are merged deeply). A *lazy* schema wraps a function that returns the real schema, which lets a schema refer to itself for trees and nested comments.

This shows all four. The lazy tree needs an explicit type annotation because TypeScript cannot infer a self-referencing type.

```ts
import { schema, type Schema } from "@zudojs/schema";

const Id = schema.union([schema.string(), schema.number()]);
console.log(Id.parse(42), Id.parse("abc")); // 42 "abc"

const Shape = schema.discriminatedUnion("kind", [
  schema.object({ kind: schema.literal("circle"), radius: schema.number() }),
  schema.object({ kind: schema.literal("square"), side: schema.number() }),
]);
console.log(Shape.parse({ kind: "circle", radius: 2 })); // { kind: "circle", radius: 2 }
console.log(Shape.variants);                                // ["circle", "square"]

const Timestamps = schema.object({ createdAt: schema.string().datetime() });
const Named = schema.object({ name: schema.string() });
const Both = schema.intersection(Named, Timestamps);
console.log(Both.parse({ name: "a", createdAt: "2026-01-01T00:00:00Z" }));
// { name: "a", createdAt: "2026-01-01T00:00:00Z" }

type TreeNode = { name: string; children: TreeNode[] };
const Tree: Schema<TreeNode> = schema.lazy(() =>
  schema.object({ name: schema.string(), children: schema.array(Tree) }),
);
console.log(Tree.parse({ name: "root", children: [{ name: "leaf", children: [] }] }).children.length);
// 1
```

> **Note:** every member of a discriminated union must declare the tag with `schema.literal(...)` or `schema.enum([...])`, and no two members may share a tag value. Otherwise building the schema throws.

## COERCION

Query strings and form fields always arrive as text. `"3"` is not the number 3, so `schema.number()` rejects it. The `schema.coerce` schemas convert first, then check. They are deliberately strict: an empty string is not zero, and `"1e999"` is not a number.

This parses page settings from a URL query.

```ts
import { schema } from "@zudojs/schema";

const QuerySchema = schema.object({
  page: schema.coerce.number().int().min(1).default(1),
  limit: schema.coerce.number().int().max(100).default(20),
  active: schema.coerce.boolean().default(true),
});

console.log(QuerySchema.parse({ page: "3", active: "no" }));
// { page: 3, limit: 20, active: false }
```

| Schema | Converts | Extra methods |
| --- | --- | --- |
| `schema.coerce.number()` | Numeric strings like `"42"`, `"3.14"`, `"-1e3"`. Rejects `""`, hex, and anything non-finite. | `int`, `min`, `max`, `positive`, `pipe(numberSchema)`, `optional`, `nullable`, `default`, `refine`, `transform` |
| `schema.coerce.boolean()` | `"true"/"1"/"yes"/"on"` and `1` to true; `"false"/"0"/"no"/"off"/""` and `0` to false. Case and spaces ignored. | `optional`, `nullable`, `default`, `refine`, `transform` |
| `schema.coerce.string()` | Numbers, booleans, bigints and valid `Date`s (as ISO). Rejects objects and symbols. | `min`, `max`, `regex`, `pipe(stringSchema)`, `optional`, `nullable`, `default`, `refine`, `transform` |
| `schema.coerce.bigint()` | Safe integers and digit-only strings (at most 4096 digits, `SerializationLimits.MAX_BIGINT_DIGITS`). | `optional`, `nullable`, `default`, `refine`, `transform` |

## TYPE INFERENCE

You never write a TypeScript type by hand for a schema. `Infer<typeof MySchema>` reads the output type straight from it, so the type and the runtime check can never drift apart.

This derives a type and uses it for a function parameter.

```ts
import { schema, type Infer } from "@zudojs/schema";

const UserSchema = schema.object({
  name: schema.string(),
  role: schema.enum(["admin", "user"] as const),
  age: schema.number().optional(),
});

type User = Infer<typeof UserSchema>;
// { name: string; role: "admin" | "user"; age?: number | undefined }

function greet(user: User): string {
  return `Hi ${user.name} (${user.role})`;
}
console.log(greet(UserSchema.parse({ name: "Ada", role: "admin" })));
// Hi Ada (admin)
```

> **Watch out:** without `as const` on an enum's list, TypeScript widens the values to `string` and the inferred type loses the union. Runtime checking is unaffected either way.

An optional field becomes an optional property (`age?:`), because a parsed object leaves out an optional key that the input left out. That also makes the inferred type correct under TypeScript's `exactOptionalPropertyTypes` setting. The type that does this is exported as `ObjectShapeOutput<Shape>`.

Two related helpers exist. `SchemaOutput<T>` is the same as `Infer<T>`. `SchemaInput<T>` gives the type *before* a transform runs, which is only different for transform schemas.

```ts
import { schema, type Infer, type SchemaInput, type Schema } from "@zudojs/schema";

const Price = schema.string().transform((v) => Number(v));

type PriceIn  = SchemaInput<typeof Price>; // string (what you pass to parse)
type PriceOut = Infer<typeof Price>;       // number (what parse returns)

const Order = schema.object({ price: Price });
type OrderOut = Infer<typeof Order>;       // { price: number }

// Annotating a transform: give both types, output first
const Annotated: Schema<number, string> = Price;
```

> **Changed in 1.2.0:** `SchemaInput` of a transform used to give the output type. A transform schema is now a `Schema<TOut, TIn>`, so if you annotated one as `Schema<number>`, TypeScript now reports an error; write `Schema<number, string>` (or `Schema<number, unknown>`). Objects, tuples and unions read only the output type of their members, so `Infer` of a transformed field is unchanged. Also new: an optional key is now `age?: number | undefined` rather than `age: number | undefined`.

## PARSE OPTIONS

Both `parse` and `safeParse` take an optional second argument. This stops at the first issue instead of collecting all of them.

```ts
import { schema } from "@zudojs/schema";

const S = schema.object({ name: schema.string(), age: schema.number() });
const result = S.safeParse({ name: 1, age: "x" }, { abortEarly: true });
if (!result.success) console.log(result.issues.length); // 1
```

| Option | What it does | Default |
| --- | --- | --- |
| `abortEarly` | Stop after the first issue. | `false` |
| `maxDepth` | Fail with `max_depth_exceeded` when nesting goes deeper than this. Circular input always fails with `circular_reference`. | `100` |
| `maxIssues` | Cap on recorded issues; the first issue is always kept and extra issues still fail the parse (use `countIssues`, not `issues.length`, in custom schemas). | unlimited |
| `path` | Prefix for every issue path (useful when you validate one part of a bigger value). | `[]` |

## API REFERENCE

Everything below is importable from `@zudojs/schema`. Each `schema.x()` also has a standalone twin named `xSchema()` (for example `stringSchema()`, `objectSchema()`, `coerceNumberSchema()`); they are the same functions.

### The `schema` namespace

| Name | What it does | Notes |
| --- | --- | --- |
| `string, number, boolean, bigint, symbol` | One primitive value. | See [Building blocks](#building-blocks) for rule methods. |
| `null, undefined, any, unknown, never` | Sentinel values. |  |
| `literal(v), enum(values)` | Exactly one value / one of a list. |  |
| `object, array, tuple, record, map, set` | Structures. | See [Objects and arrays](#objects-and-arrays). |
| `union, discriminatedUnion, intersection, lazy` | Combine schemas. | `union([])` throws. |
| `optional(s), nullable(s), default(s, v)` | Wrappers for absent values. | Work on any schema. |
| `refine(s, check, msg), transform(s, fn)` | Custom check / change output. | Work on any schema. |
| `coerce.string, .number, .boolean, .bigint` | Convert text before checking. |  |

### Every schema (class `Schema`)

| Name | What it does | Notes |
| --- | --- | --- |
| `parse(input, options?)` | Returns the parsed value or throws `SchemaError`. | `input` is `unknown`. |
| `safeParse(input, options?)` | Returns `SchemaResult`; never throws for invalid input. | A refine or transform callback that throws is reported as a `refine_failed` / `transform_failed` issue; only a defect elsewhere in parsing propagates. |
| `describe(text), title(text), example(v), deprecated()` | Attach documentation metadata. | Mutate and return the same schema. |
| `getMetadata()` | Read the metadata back. | Returns `SchemaMetadata \| undefined`. |
| `_type` | Name of the schema kind, e.g. `"string"`. | For debugging. |

### Result helpers

| Name | What it does | Notes |
| --- | --- | --- |
| `isSchemaSuccess(r)`, `isSchemaFailure(r)` | Type guards for a `SchemaResult`. | Same as checking `r.success`. |
| `unwrapSchemaResult(r)` | Returns `r.data` or throws a `SchemaError<SchemaIssue>` carrying the issues. | Its message lists the issue messages; read `error.issues` for the details. |
| `isSchemaValidationError(error)` | Type guard for a caught value: `true` when it is a `SchemaError` whose issues all have the `SchemaIssue` shape. | Narrows `error.issues` to `readonly SchemaIssue[]` without a cast. Works for errors from `parse()` and `unwrapSchemaResult()`. |
| `schemaSuccess(data)`, `schemaFailure(issues)` | Build a result by hand. | Useful in tests. |

### Types

| Name | What it does | Notes |
| --- | --- | --- |
| `Infer<S>`, `SchemaOutput<S>` | Output type of a schema. | Identical. |
| `SchemaInput<S>` | Input type (before transform). | For `string().transform(fn)` this is `string`. |
| `ObjectShapeOutput<Shape>` | Parsed type of an object shape. | Keys that can be `undefined` become optional properties. |
| `StringUrlOptions` | Argument of `string().url(options)`. | `protocols`: a list of schemes, or `"any"`. Default: http and https. See [URLs and dates](#urls-and-dates). |
| `SchemaIssue` | One problem: `code`, `path`, `message`, optional `expected`, `received`, `input`, `details`. |  |
| `SchemaResult<T>`, `SchemaSuccess<T>`, `SchemaFailure` | What `safeParse` returns. |  |
| `SchemaParseOptions` | Second argument of `parse`/`safeParse`. | See [Parse options](#parse-options). |
| `SchemaMetadata`, `SchemaShape`, `SchemaPathSegment` | Metadata object; an object shape; one path element (`string \| number`). |  |

### Errors and constants

| Name | What it does | Notes |
| --- | --- | --- |
| `SchemaError` | Thrown by `parse()` and `unwrapSchemaResult()` as `SchemaError<SchemaIssue>`; has `.issues` and `.hasIssues()`. | Import from `@zudojs/errors`. Status code 400. Narrow a caught value with `isSchemaValidationError`. |
| `SchemaIssueCode` | Object of every issue code string. | Import from `@zudojs/constants`. |

The package also exports the low-level pieces used to write a custom `Schema` subclass: `createParseContext`, `childContext`, `addIssue`, `failValidation`, `rethrowUnexpected`, `enterComposite`, `leaveComposite`, `isMaxDepthExceeded`, `shouldAbortEarly`, `countIssues`, `SchemaValidationSignal` (an internal control-flow signal; intentionally not a `@zudojs/errors` class), `ModifiableSchema` (the base class that gives a schema `.optional()`, `.nullable()`, `.default()`, `.refine()` and `.transform()`) and the individual schema classes. You will not need them for everyday use.

## COMMON MISTAKES

- **Calling `.optional()` on an object, array or union schema.** TypeScript reports that the method does not exist. Wrap it instead: `schema.optional(schema.array(schema.string()))`. (Primitives, including `boolean()`, `enum()` and `literal()`, do have the method.)
- **Chaining `.transform()` after `.refine()`.** `.refine()` returns a base `Schema` with no chain methods. Use `schema.transform(refined, fn)`.
- **Using `schema.number()` for query-string values.** `"3"` is a string, so it fails with `invalid_type`. Use `schema.coerce.number()`.
- **Expecting extra keys to survive.** Objects strip unknown keys by default, so `parse()` returns a smaller object than you passed in. Call `.passthrough()` to keep them or `.strict()` to reject them.
- **Importing `SchemaError` from `@zudojs/schema`.** It is not exported there; import it from `@zudojs/errors`.
- **Casting `error.issues as SchemaIssue[]`.** A cast checks nothing and hides the case where the caught value is some other error. Use `if (isSchemaValidationError(error))`, which narrows the type and checks the issues at runtime.
- **Using `.partial()` to build a create schema.** `.partial()` does not fill in defaults, so a record created from it lacks every defaulted field the caller left out. Use the full schema for creating and `.partial()` for updating.
- **Forgetting the type annotation on a lazy schema.** TypeScript errors with "implicitly has type any". Declare it as `const Tree: Schema<TreeNode> = schema.lazy(...)`.

## RELATED PACKAGES

- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — home of `SchemaError` and the shared error base classes.
- [@zudojs/api](https://zudojs.oyinlola.site/docs/packages-api.md) — attach a schema to an operation's `input` so it is checked before your handler runs.
- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — where request bodies and query strings come from; parse them with a schema first.
- [@zudojs/openapi](https://zudojs.oyinlola.site/docs/packages-openapi.md) — turns schemas and their `describe()` metadata into API documentation.
- [@zudojs/constants](https://zudojs.oyinlola.site/docs/packages-constants.md) — `SchemaIssueCode` and the default size limits.

## COMPLETE EXPORT INDEX

Every name `@zudojs/schema` exports from its package root at v1.3.0 — **98** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 98 exports**

Classes (36)

`AnySchema` `ArraySchema` `BigIntSchema` `BooleanSchema` `CoerceBigIntSchema` `CoerceBooleanSchema` `CoerceNumberSchema` `CoerceStringSchema` `DefaultSchema` `DiscriminatedUnionSchema` `EnumSchema` `IntersectionSchema` `LazySchema` `LiteralSchema` `MapSchema` `ModifiableSchema` `NeverSchema` `NullableModifierSchema` `NullSchema` `NumberSchema` `ObjectSchema` `OptionalModifierSchema` `OptionalSchema` `RecordSchema` `RefineSchema` `Schema` `SchemaValidationSignal` `SetSchema` `StringSchema` `SymbolSchema` `TransformModifierSchema` `TransformSchema` `TupleSchema` `UndefinedSchema` `UnionSchema` `UnknownSchema`

Functions (47)

`addIssue` `anySchema` `arraySchema` `bigintSchema` `booleanSchema` `childContext` `coerceBigIntSchema` `coerceBooleanSchema` `coerceNumberSchema` `coerceStringSchema` `countIssues` `createParseContext` `defaultSchema` `discriminatedUnionSchema` `enterComposite` `enumSchema` `failValidation` `intersectionSchema` `isMaxDepthExceeded` `isSchemaFailure` `isSchemaSuccess` `isSchemaValidationError` `lazySchema` `leaveComposite` `literalSchema` `mapSchema` `neverSchema` `nullableSchema` `nullSchema` `numberSchema` `objectSchema` `optionalSchema` `recordSchema` `refineSchema` `rethrowUnexpected` `schemaFailure` `schemaSuccess` `setSchema` `shouldAbortEarly` `stringSchema` `symbolSchema` `transformSchema` `tupleSchema` `undefinedSchema` `unionSchema` `unknownSchema` `unwrapSchemaResult`

Interfaces (7)

`SchemaFailure` `SchemaIssue` `SchemaMetadata` `SchemaParseContext` `SchemaParseOptions` `SchemaSuccess` `StringUrlOptions`

Type aliases (7)

`Infer` `ObjectShapeOutput` `SchemaInput` `SchemaOutput` `SchemaPathSegment` `SchemaResult` `SchemaShape`

Constants (1)

`schema`
