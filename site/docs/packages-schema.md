---
title: "@zudojs/schema — Schema Definition & Parsing Engine"
description: "Complete documentation for @zudojs/schema — type-safe schema definition, runtime validation, parsing, and transformation engine."
source: https://zudojs.oyinlola.site/docs/packages-schema
---

v1.0.1

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
// { name: "Ada", email: "ada@example.com", age: undefined }

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

Both accept `unknown`, so you can pass the raw result of `JSON.parse` straight in. This catches the thrown error from `parse()`.

```ts
import { schema } from "@zudojs/schema";
import { SchemaError } from "@zudojs/errors";

const AgeSchema = schema.number().int().min(0);
const fromTheWire: unknown = JSON.parse('"forty"');

try {
  AgeSchema.parse(fromTheWire);
} catch (error) {
  if (error instanceof SchemaError) {
    console.log(error.message, error.issues.length);
    // Validation failed 1
  }
}
```

> **Tip:** `SchemaError` lives in `@zudojs/errors`, not in this package. Import it from there.

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
| `schema.string()` | Strings. Max 255 characters unless you set `.max()`. | `min`, `max`, `length`, `regex`, `email`, `url`, `uuid`, `uuidv4`, `datetime`, `date`, `time`, `ipv4`, `ipv6`, `phone`, `hexColor`, `trim`, `toLowerCase`, `toUpperCase` |
| `schema.number()` | Numbers. `NaN` is rejected. | `min`, `max`, `gt`, `lt`, `int`, `positive`, `negative`, `finite`, `safe`, `multipleOf` |
| `schema.boolean()` | `true` or `false`. | `coerce()` also accepts `"true"`, `"false"`, `1`, `0` |
| `schema.literal(v)` | Exactly the value `v` (string, number, boolean or null). | none |
| `schema.enum([...])` | One of the listed strings or numbers. | `getValues()` |
| `schema.bigint()`, `schema.symbol()` | A bigint / a symbol. | none |
| `schema.null()`, `schema.undefined()` | Exactly `null` / exactly `undefined`. | none |
| `schema.any()`, `schema.unknown()` | Anything at all (typed `any` / `unknown`). | none |
| `schema.never()` | Nothing; every value fails. | none |

> **Watch out:** `schema.string().trim()` changes the output, not the check. `min(3)` is measured after trimming, so `"  ab  "` fails.

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
| `.partial()` / `.required()` | Make every key optional / make every key required again. |
| `.extend(other)` / `.merge(other)` | Add another object schema's keys (same thing; later keys win). |
| `.strip()` / `.strict()` / `.passthrough()` | Drop / reject / keep unknown keys. |
| `.shape` | The shape you passed in, for reading. |
| `schema.array(item)` | Methods: `.min()`, `.max()`, `.length()`, `.nonempty()`. Max 1000 items unless you set `.max()`. |
| `schema.tuple([a, b])` | Fixed-length array; position 0 must match `a`, position 1 must match `b`. |
| `schema.record(value)` | Object with any string keys, every value matching `value`. |
| `schema.map(key, value)`, `schema.set(item)` | A real `Map` / `Set` instance with checked entries. |

> **Tip:** Keys named `__proto__`, `constructor` and `prototype` are always rejected in input. This blocks prototype-pollution attacks without any work on your side.

## OPTIONAL, NULLABLE, DEFAULT

Three wrappers change what a schema accepts when the value is absent. *Optional* also accepts `undefined`. *Nullable* also accepts `null`. *Default* replaces `undefined` with a value you choose, then checks that value.

There are two ways to apply them. `string()`, `number()` and the `coerce` schemas have `.optional()`, `.nullable()` and `.default()` methods. Every other schema (objects, arrays, enums, literals, unions) does not, so you wrap it with `schema.optional(x)`, `schema.nullable(x)` or `schema.default(x, value)`.

Both forms are shown here. Missing keys get their default; an absent optional key is allowed.

```ts
import { schema } from "@zudojs/schema";

const SettingsSchema = schema.object({
  theme: schema.string().default("light"),                     // method form
  role: schema.default(schema.enum(["admin", "user"]), "user"), // wrapper form
  nickname: schema.string().optional(),
  avatar: schema.nullable(schema.string().url()),
  tags: schema.default(schema.array(schema.string()), []),
});

console.log(SettingsSchema.parse({ avatar: null }));
// { theme: "light", role: "user", nickname: undefined, avatar: null, tags: [] }
```

> **Watch out:** a default runs only for `undefined`. Passing `null` to a defaulted string schema is still an error; add `nullable` if you want both.

## REFINE AND TRANSFORM

Built-in rules cover types and sizes. For anything else, *refine* adds your own check: a function that gets the already-valid value and returns `true` or `false`, plus the message to report when it returns `false`.

*Transform* changes the output. Its function receives the valid value and returns something new, possibly of a different type. The schema's output type follows whatever you return.

Like the wrappers above, `.refine()` and `.transform()` are methods on `string()` and `number()`; for everything else use `schema.refine(x, check, message)` and `schema.transform(x, fn)`.

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

An *intersection* means "both of these"; two object schemas are merged into one result. A *lazy* schema wraps a function that returns the real schema, which lets a schema refer to itself for trees and nested comments.

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
| `schema.coerce.number()` | Numeric strings like `"42"`, `"3.14"`, `"-1e3"`. Rejects `""`, hex, and anything non-finite. | `int`, `min`, `max`, `positive`, `pipe(numberSchema)`, `optional`, `nullable`, `default`, `refine` |
| `schema.coerce.boolean()` | `"true"/"1"/"yes"/"on"` and `1` to true; `"false"/"0"/"no"/"off"/""` and `0` to false. Case and spaces ignored. | `optional`, `nullable`, `default` |
| `schema.coerce.string()` | Numbers, booleans, bigints and valid `Date`s (as ISO). Rejects objects and symbols. | `min`, `max`, `regex`, `pipe(stringSchema)`, `optional`, `nullable`, `default` |
| `schema.coerce.bigint()` | Safe integers and digit-only strings. | `optional`, `nullable` |

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
// { name: string; role: "admin" | "user"; age: number | undefined }

function greet(user: User): string {
  return `Hi ${user.name} (${user.role})`;
}
console.log(greet(UserSchema.parse({ name: "Ada", role: "admin" })));
// Hi Ada (admin)
```

> **Watch out:** without `as const` on an enum's list, TypeScript widens the values to `string` and the inferred type loses the union. Runtime checking is unaffected either way.

Two related helpers exist. `SchemaOutput<T>` is the same as `Infer<T>`. `SchemaInput<T>` gives the type *before* a transform runs, which is only different for transform schemas.

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
| `maxIssues` | Stop recording issues after this many. | unlimited |
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
| `unwrapSchemaResult(r)` | Returns `r.data` or throws a plain `Error` listing the messages. | Not a `SchemaError`. |
| `schemaSuccess(data)`, `schemaFailure(issues)` | Build a result by hand. | Useful in tests. |

### Types

| Name | What it does | Notes |
| --- | --- | --- |
| `Infer<S>`, `SchemaOutput<S>` | Output type of a schema. | Identical. |
| `SchemaInput<S>` | Input type (before transform). |  |
| `SchemaIssue` | One problem: `code`, `path`, `message`, optional `expected`, `received`, `input`, `details`. |  |
| `SchemaResult<T>`, `SchemaSuccess<T>`, `SchemaFailure` | What `safeParse` returns. |  |
| `SchemaParseOptions` | Second argument of `parse`/`safeParse`. | See [Parse options](#parse-options). |
| `SchemaMetadata`, `SchemaShape`, `SchemaPathSegment` | Metadata object; an object shape; one path element (`string \| number`). |  |

### Errors and constants

| Name | What it does | Notes |
| --- | --- | --- |
| `SchemaError` | Thrown by `parse()`; has `.issues` and `.hasIssues()`. | Import from `@zudojs/errors`. Status code 400. |
| `SchemaIssueCode` | Object of every issue code string. | Import from `@zudojs/constants`. |

The package also exports the low-level pieces used to write a custom `Schema` subclass: `createParseContext`, `childContext`, `addIssue`, `failValidation`, `rethrowUnexpected`, `enterComposite`, `leaveComposite`, `isMaxDepthExceeded`, `shouldAbortEarly`, `SchemaValidationSignal` and the individual schema classes. You will not need them for everyday use.

## COMMON MISTAKES

- **Calling `.optional()` on an object, array or enum schema.** TypeScript reports that the method does not exist. Wrap it instead: `schema.optional(schema.array(schema.string()))`.
- **Chaining `.transform()` after `.refine()`.** `.refine()` returns a base `Schema` with no chain methods. Use `schema.transform(refined, fn)`.
- **Using `schema.number()` for query-string values.** `"3"` is a string, so it fails with `invalid_type`. Use `schema.coerce.number()`.
- **Expecting extra keys to survive.** Objects strip unknown keys by default, so `parse()` returns a smaller object than you passed in. Call `.passthrough()` to keep them or `.strict()` to reject them.
- **Importing `SchemaError` from `@zudojs/schema`.** It is not exported there; import it from `@zudojs/errors`.
- **Forgetting the type annotation on a lazy schema.** TypeScript errors with "implicitly has type any". Declare it as `const Tree: Schema<TreeNode> = schema.lazy(...)`.

## RELATED PACKAGES

- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — home of `SchemaError` and the shared error base classes.
- [@zudojs/api](https://zudojs.oyinlola.site/docs/packages-api.md) — attach a schema to an operation's `input` so it is checked before your handler runs.
- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — where request bodies and query strings come from; parse them with a schema first.
- [@zudojs/openapi](https://zudojs.oyinlola.site/docs/packages-openapi.md) — turns schemas and their `describe()` metadata into API documentation.
- [@zudojs/constants](https://zudojs.oyinlola.site/docs/packages-constants.md) — `SchemaIssueCode` and the default size limits.

## COMPLETE EXPORT INDEX

Every name `@zudojs/schema` exports from its package root at v1.0.1 — **93** in total, generated from the package&rsquo;s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 93 exports**

Classes (35)

`AnySchema` `ArraySchema` `BigIntSchema` `BooleanSchema` `CoerceBigIntSchema` `CoerceBooleanSchema` `CoerceNumberSchema` `CoerceStringSchema` `DefaultSchema` `DiscriminatedUnionSchema` `EnumSchema` `IntersectionSchema` `LazySchema` `LiteralSchema` `MapSchema` `NeverSchema` `NullableModifierSchema` `NullSchema` `NumberSchema` `ObjectSchema` `OptionalModifierSchema` `OptionalSchema` `RecordSchema` `RefineSchema` `Schema` `SchemaValidationSignal` `SetSchema` `StringSchema` `SymbolSchema` `TransformModifierSchema` `TransformSchema` `TupleSchema` `UndefinedSchema` `UnionSchema` `UnknownSchema`

Functions (45)

`addIssue` `anySchema` `arraySchema` `bigintSchema` `booleanSchema` `childContext` `coerceBigIntSchema` `coerceBooleanSchema` `coerceNumberSchema` `coerceStringSchema` `createParseContext` `defaultSchema` `discriminatedUnionSchema` `enterComposite` `enumSchema` `failValidation` `intersectionSchema` `isMaxDepthExceeded` `isSchemaFailure` `isSchemaSuccess` `lazySchema` `leaveComposite` `literalSchema` `mapSchema` `neverSchema` `nullableSchema` `nullSchema` `numberSchema` `objectSchema` `optionalSchema` `recordSchema` `refineSchema` `rethrowUnexpected` `schemaFailure` `schemaSuccess` `setSchema` `shouldAbortEarly` `stringSchema` `symbolSchema` `transformSchema` `tupleSchema` `undefinedSchema` `unionSchema` `unknownSchema` `unwrapSchemaResult`

Interfaces (6)

`SchemaFailure` `SchemaIssue` `SchemaMetadata` `SchemaParseContext` `SchemaParseOptions` `SchemaSuccess`

Type aliases (6)

`Infer` `SchemaInput` `SchemaOutput` `SchemaPathSegment` `SchemaResult` `SchemaShape`

Constants (1)

`schema`
