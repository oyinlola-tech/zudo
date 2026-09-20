---
title: "@zudojs/validation — Schema Validation Documentation"
description: "Complete documentation for @zudojs/validation — schema validation with Zod, constraints, parsers, composers, normalizers, transformers, and registries."
source: https://zudojs.oyinlola.site/docs/packages-validation
---

v1.0.2

# @zudojs/validation

Check untrusted input against Zod schemas and reusable constraints, and get back one result shape you can read field by field.

VALIDATION ZOD SCHEMAS CONSTRAINTS TRANSFORMS

## OVERVIEW

*Validation* means checking that a value you did not create has the shape and contents you expect before your code uses it. A form submission, a JSON request body, a config file and a row from a CSV are all values you did not create.

`@zudojs/validation` gives you three tools for that. A *schema* describes the shape of a whole value ("an object with a string `name` and a positive number `age`"). A *constraint* is one small reusable rule ("is an email", "at least 3 characters"). A *pipeline* chains schemas and constraints into one check. All three return the same `ValidationResult`, so you handle failures the same way everywhere.

It also ships guards for hostile input. A payload nested 20,000 levels deep, or a 50 MB object, can crash a server before validation even starts. The depth, size and circular-reference guards reject those early and cheaply.

WHEN YOU NEED IT

- Any input that crosses a trust boundary: HTTP bodies, query strings, webhooks, files
- You already use Zod and want field-level errors that map to an HTTP 400
- You want to reuse one rule ("adult age", "slug") across many schemas
- You accept JSON from strangers and need depth and size limits

WHEN YOU DON'T

- The value was produced by your own code and TypeScript already guarantees its type
- You want Zudo's own schema builder without Zod. Use [@zudojs/schema](https://zudojs.oyinlola.site/docs/packages-schema.md) instead
- You only need to convert data (JSON, dates, bytes). See [@zudojs/serialization](https://zudojs.oyinlola.site/docs/packages-serialization.md)

## VALIDATION VS @ZUDOJS/SCHEMA

Zudo has two packages that check data, and they do not share schemas. Pick one per project boundary.

- **@zudojs/validation** (this page) is built on [Zod](https://zod.dev). You write schemas with `z.object(...)`, and the package adds constraints, pipelines, normalizers, a registry and structural guards around them. Its `validate()` and `parse()` accept a `ZodType` only.
- [**@zudojs/schema**](https://zudojs.oyinlola.site/docs/packages-schema.md) is Zudo's own schema engine with no Zod dependency. You write `schema.object(...)` and call `.safeParse()` on the schema itself.

> **Rule of thumb:** already using Zod, or you want reusable constraints and payload guards? Use this package. Want zero extra dependencies and a smaller API? Use @zudojs/schema.

## INSTALLATION

Install the package. It pulls in `zod` (v4) and `@zudojs/errors` as regular dependencies, so you do not install those separately.

```bash
$ npm install @zudojs/validation
```

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

> **Tip:** import `z` from `@zudojs/validation` instead of from `zod`. It is the same object, and it guarantees your schemas and this package use one copy of Zod.

## QUICK START

This example describes a sign-up payload, validates two inputs, and prints the outcome of each.

```ts
import { z, validate } from "@zudojs/validation";

// 1. Describe the shape you expect.
const SignUp = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
});

// 2. Check a good value.
const ok = validate(SignUp, { name: "Ada", age: 36 });
console.log(ok.success, ok.success ? ok.data : ok.issues);
// true { name: "Ada", age: 36 }

// 3. Check a bad value.
const bad = validate(SignUp, { name: "", age: "36" });
console.log(bad.success, bad.success ? bad.data : bad.issues);
// false [
//   { path: ["name"], code: "too_small",    message: "Too small: expected string to have >=1 characters" },
//   { path: ["age"],  code: "invalid_type", message: "Invalid input: expected number, received string", expected: "number" }
// ]
```

`validate()` never throws. It returns an object whose `success` field tells you which of two shapes you got. The next section explains how to read it.

## READING A RESULT

Every check in this package returns a `ValidationResult<T>`. It is one of two plain objects, and the `success` field tells them apart. TypeScript uses that field to narrow the type, so inside `if (result.success)` the `data` field is typed as `T`.

```ts
interface ValidationSuccess<T> { success: true;  data: T; issues?: ValidationIssue[] }
interface ValidationFailure    { success: false; issues: ValidationIssue[] }   // always at least one issue

interface ValidationIssue {
  path: (string | number)[];  // where: ["address", "zip"] or [2] for an array index
  code: string;                // machine-readable, e.g. "invalid_type" or "min_length"
  message: string;             // human-readable
  expected?: unknown;          // set for type mismatches
  received?: unknown;
}
```

Two helpers turn an issue list into something you can show a user. `formatIssues` makes one line; `toFieldErrors` makes a map of field name to first message, which is what a form wants.

```ts
import { z, validate, formatIssues, toFieldErrors } from "@zudojs/validation";

const SignUp = z.object({ name: z.string().min(1), age: z.number().int().positive() });
const result = validate(SignUp, { name: "", age: "36" });

if (!result.success) {
  console.log(formatIssues(result.issues));
  // name: Too small: expected string to have >=1 characters; age: Invalid input: expected number, received string

  console.log(toFieldErrors(result.issues));
  // { name: "Too small: expected string to have >=1 characters",
  //   age:  "Invalid input: expected number, received string" }
}
```

> **In plain words:** a result is a box. Look at `success` first. If it is `true`, take `data` out of the box. If it is `false`, read `issues` to learn what went wrong and where.

Other result helpers: `isValidationSuccess(r)` and `isValidationFailure(r)` are type guards; `unwrapValidation(r)` returns `data` or throws a `ValidationResultError`; `map(r, fn)` transforms `data` only on success; `combine([r1, r2])` merges several results into one, collecting every issue.

## HANDLING FAILURES

You can handle a failure in two styles. The *result style* uses `validate()` and an `if`, as above. The *throwing style* uses `parse()`, which returns the typed data directly and throws a `SchemaValidationError` when the value is bad. Use throwing when a bad value means the current operation cannot continue anyway.

This example parses in throwing style and catches the error. The error carries the same issues, plus helpers.

```ts
import { z, parse, isValidationError } from "@zudojs/validation";

const SignUp = z.object({ name: z.string().min(1), age: z.number().int().positive() });

try {
  const user = parse(SignUp, { name: "", age: "36" }); // user is typed { name: string; age: number }
  console.log(user);
} catch (error) {
  if (isValidationError(error)) {
    console.log(error.name);            // "SchemaValidationError"
    console.log(error.statusCode);      // 400
    console.log(error.validationCode);  // "VALIDATION_SCHEMA_FAILED"
    console.log(error.fieldErrors);     // { name: "Too small: expected string to have >=1 characters", age: "Invalid input: expected number, received string" }
    console.log(error.formattedIssues); // "name: Too small: expected string to have >=1 characters; age: Invalid input: expected number, received string"
  } else {
    throw error; // not ours: let it propagate
  }
}
```

All validation errors extend `ValidationError`, which extends the `ValidationError` of [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) (a `BaseError`). That means they already carry `statusCode: 400`, `expose: true` and a `toJSON()` that includes `issues`, so an HTTP layer can serialize them without extra code.

| Error class | Thrown by | validationCode |
| --- | --- | --- |
| `ValidationError` | Base class. Build one yourself with `createValidationError(issues)` | `VALIDATION_UNKNOWN` unless you pass a code |
| `SchemaValidationError` | `parse`, `parseAsync`, `assertValid`, parser `.parse()` | `VALIDATION_SCHEMA_FAILED` |
| `ConstraintValidationError` | composer `.assert()`, normalizer and transformer `.normalize()` / `.transform()` | `VALIDATION_CONSTRAINT_FAILED` |
| `RequiredValidationError`, `InvalidTypeValidationError`, `InvalidFormatValidationError`, `InvalidValueValidationError` | Never thrown by the package. Available for your own code | `VALIDATION_REQUIRED`, `_INVALID_TYPE`, `_INVALID_FORMAT`, `_INVALID_VALUE` |
| `ValidationResultError` | `unwrapValidation` on a failed result | none (extends `@zudojs/errors`' `ValidationError` directly, not this package's `ValidationError`) |

> **Watch out:** `isValidationError()` returns `false` for `ValidationResultError`, because that class extends `@zudojs/errors`' `ValidationError`, not this package's. Checking `instanceof` the `@zudojs/errors` class matches both. If you use `unwrapValidation`, catch `ValidationResultError` by name.

## CONSTRAINTS

A *constraint* is one named rule for one value: a function that returns `true` or `false`, plus a `code` and `message` to report when it fails. Constraints exist so you can define a rule once ("must be an adult") and reuse it in many places without a full schema.

This example runs two built-in constraints against a string, then builds a custom one with `createConstraint`.

```ts
import { checkConstraints, createConstraint, minLength, email, integer } from "@zudojs/validation";

// Every constraint runs; every failure is reported.
console.log(checkConstraints([minLength(3), email], "ad"));
// { success: false, issues: [
//   { path: [], code: "min_length",    message: "Value must contain at least 3 characters." },
//   { path: [], code: "invalid_email", message: "Value must be a valid email address." } ] }

// A custom rule. The guard rejects wrong-typed input instead of crashing.
const adult = createConstraint<number>((value) => value >= 18, {
  name: "adult",
  code: "too_young",
  message: "You must be at least 18.",
  guard: (value): value is number => typeof value === "number",
});

console.log(checkConstraints([integer, adult], 15));
// { success: false, issues: [{ path: [], code: "too_young", message: "You must be at least 18." }] }

console.log(checkConstraints([integer, adult], 21).success); // true
```

Built-in constraints. Those written as `name(arg)` are functions you call; the rest are ready-made values.

| Group | Constraints |
| --- | --- |
| Any value | `required` (not null or undefined) |
| Strings | `nonEmptyString`, `minLength(n)`, `maxLength(n)`, `lengthBetween(min, max)`, `matches(regex, message?)`, `email` (max 254 characters; same accept set as `ValidationPattern.EMAIL` and `isEmail`), `uuid`, `httpUrl`, `ascii`, `digits`, `letters`, `slug` |
| Numbers | `min(n)`, `max(n)`, `between(min, max)`, `finiteNumber`, `integer`, `positive`, `nonNegative`, `even`, `odd` |
| Dates | `isoDate` (a string such as `"2024-02-29"`), `futureDate`, `pastDate` (both take a `Date`) |
| Arrays | `minItems(n)`, `maxItems(n)`, `exactItems(n)`, `everyItem(constraint)`, `someItem(constraint)` |
| Membership | `oneOf([...values])`, `noneOf([...values])` |
| Combining | `combineConstraints(a, b)` (all must pass, one issue), `not(constraint)` (fails closed: wrong-typed input or a throwing inner constraint fails) |

> **Common mistake:** a constraint issue has an empty `path` because a constraint only sees one value. When you check a field of an object, pass the path yourself: `checkConstraints([email], input.email, ["email"])`. Otherwise `toFieldErrors` has nothing to group by.

## PIPELINES (COMPOSER)

A *pipeline* runs several checks in order on one value. Each check is a *step*: a function that takes a value and returns a `ValidationResult`. You turn a schema into a step with `schemaStep()` and constraints into a step with `constraintsStep()`, then hand the list to `createValidationComposer()`.

This pipeline first checks that the value is a number, then that it is a positive integer. It stops at the first failing step, so the constraints never see a non-number.

```ts
import {
  z, createValidationComposer, schemaStep, constraintsStep, integer, positive,
} from "@zudojs/validation";

const quantity = createValidationComposer<number>(
  [schemaStep(z.number()), constraintsStep([integer, positive])],
  { name: "Quantity" },
);

console.log(quantity.validate(3));
// { success: true, data: 3, issues: [] }

console.log(quantity.validate(-2));
// { success: false, issues: [{ path: [], code: "invalid_positive", message: "Value must be greater than zero." }] }

try {
  quantity.assert(-2); // same check, throwing style
} catch (error) {
  console.log((error as Error).name, (error as Error).message);
  // ConstraintValidationError Quantity validation failed.
}
```

Steps are plain functions, so you can shape them before putting them in a pipeline:

- `all(a, b)` runs every step and reports all issues; `any(a, b)` passes if one passes; `first(a, b)` like `any` but reports only the last failure; `negate(a)` flips it.
- `optional(a)`, `nullable(a)`, `optionalNullable(a)` let `undefined` / `null` through without running `a`.
- `when(predicate, a)` and `unless(predicate, a)` run `a` conditionally; `tap(a)` runs `a` but keeps the original value; `mapValidated(a, fn)` changes the value after `a` passes; `append(composer, step)` adds a step to an existing pipeline.
- `composeSchemas(s1, s2)` pipes Zod schemas of the same type into one schema.

> **Common mistake:** passing `{ stopOnFirstError: false }` to a pipeline whose later steps depend on earlier ones. A failed schema step returns the raw value, and the constraint step then runs on the wrong type. Only turn it off for independent checks where collecting every issue is the point.

## PARSERS

A *parser* is a schema bundled with the three ways to use it: `parse()` (throws), `safeParse()` (returns a result) and `isValid()` (returns a boolean). Create one when the same schema is used in several places so callers do not need to import the schema.

This example builds a parser, then uses the fallback helpers `parseOr` and `parseMany` on the same schema.

```ts
import { z, createValidationParser, parseOr, parseMany } from "@zudojs/validation";

const SignUp = z.object({ name: z.string().min(1), age: z.number().int().positive() });
const signUp = createValidationParser(SignUp, { name: "SignUp" });

console.log(signUp.isValid({ name: "Ada", age: 36 }));  // true
console.log(signUp.isValid({}));                         // false
console.log(signUp.safeParse({}).success);              // false
const user = signUp.parse({ name: "Ada", age: 36 });    // throws SchemaValidationError on bad input

// Fall back to a default instead of failing.
console.log(parseOr(z.number(), "oops", 0));            // 0

// Validate a list; the index becomes the issue path.
console.log(parseMany(z.number(), [1, "two", 3]));
// { success: false, issues: [{ path: [1], code: "invalid_type", message: "Invalid input: expected number, received string", expected: "number" }] }
```

Related helpers: `createAsyncValidationParser` for schemas with async refinements, `parseOrElse(schema, value, fn)` to compute the fallback from the error, `parseRecord(schema, obj)` to validate every value of an object (it rejects `__proto__` keys), and `parseOptional` / `parseNullable` / `parseOptionalNullable` to let `undefined` or `null` pass.

## NORMALIZE AND TRANSFORM

*Normalizing* means cleaning a value **before** validation so that harmless differences (extra spaces, uppercase domain) do not cause failures. *Transforming* means converting a value **after** validation into the shape your code wants. Both wrap a plain function and turn any exception it throws into a validation failure instead of a crash.

This example cleans an email address, then validates a string and upper-cases it in one call.

```ts
import {
  z, createNormalizer, composeNormalizers, normalizeWhitespace, normalizeEmail, validateAndTransform,
} from "@zudojs/validation";

const cleanEmail = createNormalizer(
  composeNormalizers(normalizeWhitespace, normalizeEmail),
  { name: "EmailNormalizer" },
);
console.log(cleanEmail.normalize("  Ada.Lovelace@Example.COM "));
// "Ada.Lovelace@example.com"   (only the domain is lower-cased; the local part is case-sensitive)

const shout = validateAndTransform(z.string(), "hello", (s) => s.toUpperCase());
console.log(shout);
// { success: true, data: "HELLO", issues: [] }

console.log(validateAndTransform(z.string(), 5, (s) => s.toUpperCase()).success);
// false   (the transform never runs on invalid input)
```

Built-in string normalizers: `normalizeTrim`, `normalizeWhitespace`, `normalizeLowercase`, `normalizeUppercase`, `normalizeUnicode` (NFC), `normalizeUnicodeCompatibility` (NFKC), `foldCase`, `normalizeEmail`, `normalizeUrl`, `normalizeIdentifier`, `normalizeQuotes`, `removeBom`, and `normalizeArray(values, fn)` for lists. A normalizer object also has `safeNormalize()`, which returns a result instead of throwing.

Transformer helpers: `createValidationTransformer(fn)` gives you `transform()` and `safeTransform()`; `composeTransforms(a, b)` chains two; `withTransformer(schema, fn)` returns a new Zod schema that applies `fn` to parsed data. Async versions exist for each: `createAsyncNormalizer`, `createAsyncValidationTransformer`, `validateAndTransformAsync`.

> **Tip:** use `normalizeIdentifier` (not `normalizeLowercase`) for usernames and keys. It applies NFKC and a case fold, so two spellings that look identical do not become two different accounts.

## REGISTRY AND FACTORY

A *registry* is a named collection of rules. You register a schema or a list of constraints under a string name once, then validate by name anywhere. This is useful when the rule name comes from data, for example a field type in a form definition.

This example registers two rules and validates against each by name. A rule with both `schema` and `constraints` runs both: the schema first, then the constraints on its output.

```ts
import { z, createValidationRegistry, integer, positive } from "@zudojs/validation";

const registry = createValidationRegistry();
registry.registerSchema("user", z.object({ name: z.string().min(1) }), { description: "Sign-up payload" });
registry.registerConstraints("quantity", [integer, positive]);

console.log(registry.names());                              // ["user", "quantity"]
console.log(registry.validate("quantity", 0).success);        // false
console.log(registry.validate("user", { name: "Ada" }).success); // true
console.log(registry.has("missing"));                        // false
```

Registering a name twice throws unless you pass `{ overwrite: true }`. Other methods: `register(rule)`, `get(name)`, `require(name)` (throws if absent), `unregister(name)`, `entries()`, `size`, `clear()`, `clone()`, `extend(otherRegistry)`, and `readonly()` which returns a view that can look up and validate but not change anything.

A `ValidationFactory` is a convenience object that bundles a registry with short methods for everything on this page: `factory.parser(schema)`, `factory.composer(steps)`, `factory.constraint(fn, options)`, `factory.validate(schema, value)`, `factory.registerSchema(name, schema)`, `factory.validateRegistered(name, value)` and so on. Create one with `createValidationFactory()`.

> **Watch out:** there is no global default factory or registry. Create one per application and pass it around. To give a module its own factory that shares the parent's rules, call `createScopedValidationFactory(parent)`.

## STRUCTURAL GUARDS

A schema checks *what* a value contains. A structural guard checks whether the value is safe to walk at all. Deeply nested JSON can overflow the call stack, a huge object can exhaust memory, and an object that refers to itself can loop forever in a serializer. Run these guards on raw input before schema validation.

Each guard stops the moment its limit is passed, so a hostile payload costs you the limit, not the payload's full size. The size guard measures an object's `toJSON()` output when it has one; the cycle and depth guards walk shared subtrees once.

```ts
import {
  assertDepthWithinLimit, assertSizeWithinLimit, hasCircularReference, getSerializationDepth,
} from "@zudojs/validation";

const deep = JSON.parse("[".repeat(100) + "]".repeat(100)); // 100 nested arrays
try {
  assertDepthWithinLimit(deep, 32);
} catch (error) {
  console.log((error as Error).message); // "Maximum serialization depth exceeded: 33 > 32"
}

try {
  assertSizeWithinLimit({ big: "x".repeat(10_000) }, 1_000);
} catch (error) {
  console.log((error as Error).message); // "Serialized payload too large: 20011 bytes (max: 1000)"
}

const loop: { name: string; self?: unknown } = { name: "a" };
loop.self = loop;
console.log(hasCircularReference(loop));            // true
console.log(getSerializationDepth({ a: { b: [1] } })); // 3
```

| Function | What it does | Throws |
| --- | --- | --- |
| `assertDepthWithinLimit(value, maxDepth)` | Rejects nesting deeper than `maxDepth` | `SerializationDepthError` (400) |
| `assertSizeWithinLimit(value, maxBytes)` | Rejects an estimated JSON size above `maxBytes` | `SerializationPayloadTooLargeError` (413) |
| `assertNoCircularReference(value, path?, maxDepth?)` | Rejects a value that contains itself | `CircularReferenceError` (500) |
| `hasCircularReference(value)` | Same check, returns `boolean` | never |
| `getSerializationDepth(value, limit?)` | Measures nesting depth (0 for a primitive), capped at `limit` | never |
| `estimateSerializedSize(value, maxBytes?)` | Estimates JSON byte size without building the string | never |

The three error classes come from [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md). `MAX_MEASURABLE_DEPTH` (512) is the ceiling the measuring functions use when you give no limit. The same object appearing twice as siblings is a shared reference, not a cycle, and is allowed.

## API REFERENCE

Everything below is exported from `@zudojs/validation`. Constraints, normalizers and pipeline helpers are listed in their sections above.

### Schema functions

| Name | What it does | Notes |
| --- | --- | --- |
| `z` | The Zod namespace, re-exported | Use this instead of importing `zod` yourself |
| `validate(schema, value, options?)` | Returns a `ValidationResult<T>` | `options.pathPrefix` prepends segments to every issue path |
| `parse(schema, value, options?)` | Returns `T` or throws `SchemaValidationError` |  |
| `validateAsync`, `parseAsync` | Same, for schemas with async refinements | Return promises |
| `isValid(schema, value)` | Returns `boolean`; narrows `value` to `T` |  |
| `assertValid(result)` | Throws `SchemaValidationError` if the result failed | Narrows `result` to success afterwards |
| `createValidator`, `createParser`, `createAsyncValidator`, `createAsyncParser` | Bind a schema and return a one-argument function | Lighter than a parser object |
| `mapZodIssues(zodError, pathPrefix?)` | Converts a raw `ZodError` to `ValidationIssue[]` | Only needed if you call Zod directly |

### Result helpers

| Name | What it does | Notes |
| --- | --- | --- |
| `success(data)`, `failure(issues)` | Build a result by hand | `failure([])` throws; a failure needs one issue |
| `issue(message, options?)` | Build one `ValidationIssue` | `options`: `path`, `code`, `expected`, `received` |
| `isValidationSuccess`, `isValidationFailure` | Type guards on a result |  |
| `formatIssues(issues)` | One string: `"path: message; path: message"` |  |
| `toFieldErrors(issues)` | Map of top-level field to first message | Issues with an empty path are skipped |
| `unwrapValidation(result)` | Returns `data` or throws `ValidationResultError` |  |
| `map(result, fn)`, `combine(results)` | Transform success data / merge several results | `combine` collects every issue |

### Classes and factories

| Name | What it does | Notes |
| --- | --- | --- |
| `createConstraint(fn, options?)`, `checkConstraint`, `checkConstraints` | Build and run constraints | `checkConstraints(list, value, path?)` runs all and reports all |
| `createValidationComposer(steps, options?)` | Build a pipeline with `validate()` and `assert()` | `options`: `name`, `stopOnFirstError` (default `true`) |
| `schemaStep`, `constraintStep`, `constraintsStep` | Turn a schema or constraints into a pipeline step |  |
| `createValidationParser(schema, options?)` | Object with `parse`, `safeParse`, `isValid` | `createAsyncValidationParser` for async |
| `createNormalizer(fn, options?)` | Object with `normalize`, `safeNormalize` | `options`: `name`, `errorMessage` |
| `createValidationTransformer(fn, options?)` | Object with `transform`, `safeTransform` | `options`: `name`, `transformErrorMessage` |
| `ValidationRegistry`, `createValidationRegistry()`, `createRegistryFromRules(rules)` | Named rule storage | `ReadonlyValidationRegistry` via `.readonly()` |
| `ValidationFactory`, `createValidationFactory(options?)`, `createScopedValidationFactory(parent)` | One object that builds everything above and owns a registry | `options.registry` to supply your own |

### Errors and types

| Name | What it does | Notes |
| --- | --- | --- |
| `ValidationError` and subclasses | See [Handling failures](#handling-failures) | All have `issues`, `fieldErrors`, `formattedIssues`, `validationCode` |
| `ValidationErrorCode` | Enum of `validationCode` values | `INVALID_INPUT`, `REQUIRED`, `INVALID_TYPE`, `INVALID_FORMAT`, `INVALID_VALUE`, `CONSTRAINT_FAILED`, `SCHEMA_FAILED`, `UNKNOWN` |
| `isValidationError(e)`, `hasValidationErrorCode(e, code)`, `toValidationError(e)`, `createValidationError(issues)` | Inspect or build validation errors | `toValidationError` wraps any thrown value |
| `ValidationResult`, `ValidationSuccess`, `ValidationFailure`, `ValidationIssue` | Result types |  |
| `ValidationSchema<T>`, `ParseOptions` | Alias for `ZodType<T>`; options for `validate`/`parse` |  |
| `ValidationConstraint`, `ConstraintOptions`, `ValidationStep`, `ValidationComposer`, `ValidationParser`, `ValidationNormalizer`, `ValidationTransformer`, `ValidationRule` | Types of the objects each factory returns |  |

## COMMON MISTAKES

- **Reading `result.data` without checking `success`** → TypeScript types `data` as `unknown`, and on a failure it is `undefined` at runtime → Always branch on `if (result.success)` first, or use `parse()` when you want a throw.
- **Passing a `@zudojs/schema` schema to `validate()`** → a type error, and a crash on invalid input because `validate` expects a Zod schema → Use `z.object(...)` from this package, or call `.safeParse()` on the @zudojs/schema schema directly.
- **Writing a custom constraint without a `guard`** → wrong-typed input reaches your function; a throw inside it is caught and reported as a plain failure, but a non-throwing check such as `value >= 18` silently compares a string → Pass `guard` in `createConstraint` options so non-numbers fail cleanly.
- **Expecting the rejected value inside an issue** → constraint issues never include the value, on purpose: errors are exposed with a 400 and would echo passwords and tokens → Log the value yourself where it is safe to do so.
- **Validating first, guarding second** → a 20,000-level payload crashes the process before the schema runs → Call `assertDepthWithinLimit` and `assertSizeWithinLimit` on the raw body before `validate()`.
- **Sharing one registry across modules and calling `clear()`** → another module's rules vanish silently → Give each module `createScopedValidationFactory(parent)` and never clear a shared registry.

## RELATED PACKAGES

- [@zudojs/schema](https://zudojs.oyinlola.site/docs/packages-schema.md) — Zudo's own schema builder, when you do not want a Zod dependency.
- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the `BaseError` every validation error extends, plus the depth, size and circular-reference errors.
- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — where request bodies come from; validate them at the handler boundary.
- [@zudojs/config](https://zudojs.oyinlola.site/docs/packages-config.md) — configuration loading, another place a schema check pays off at startup.
- [@zudojs/serialization](https://zudojs.oyinlola.site/docs/packages-serialization.md) — converting values to and from JSON once they are known to be safe.

## COMPLETE EXPORT INDEX

Every name `@zudojs/validation` exports from its package root at v1.0.3 — **178** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 178 exports**

Classes (12)

`ConstraintValidationError` `InvalidFormatValidationError` `InvalidTypeValidationError` `InvalidValueValidationError` `ReadonlyValidationRegistry` `RequiredValidationError` `SchemaValidationError` `TraversalLimitError` `ValidationError` `ValidationFactory` `ValidationRegistry` `ValidationResultError`

Functions (115)

`all` `any` `append` `assertDepthWithinLimit` `assertNoCircularReference` `assertNonNegativeInteger` `assertSizeWithinLimit` `assertValid` `between` `checkConstraint` `checkConstraints` `combine` `combineConstraints` `composeManyTransforms` `composeNormalizers` `composeSchemas` `composeTransforms` `conditionalNormalizer` `constraintsStep` `constraintStep` `createAsyncNormalizer` `createAsyncParser` `createAsyncValidationParser` `createAsyncValidationTransformer` `createAsyncValidator` `createConstraint` `createNormalizer` `createParser` `createRegistryFromRules` `createScopedValidationFactory` `createValidationComposer` `createValidationError` `createValidationFactory` `createValidationParser` `createValidationRegistry` `createValidationTransformer` `createValidator` `estimateSerializedSize` `everyItem` `exactItems` `failure` `first` `foldCase` `formatIssues` `getSerializationDepth` `hasCircularReference` `hasValidationErrorCode` `issue` `isValid` `isValidationError` `isValidationFailure` `isValidationSuccess` `lengthBetween` `map` `mapValidated` `mapZodIssues` `matches` `max` `maxItems` `maxLength` `min` `minItems` `minLength` `negate` `noneOf` `normalizeArray` `normalizeArrayAsync` `normalizeEmail` `normalizeIdentifier` `normalizeLowercase` `normalizeNullableString` `normalizeOptionalNullableString` `normalizeOptionalString` `normalizeQuotes` `normalizeTrim` `normalizeUnicode` `normalizeUnicodeCompatibility` `normalizeUppercase` `normalizeUrl` `normalizeWhitespace` `not` `nullable` `oneOf` `optional` `optionalNullable` `parse` `parseAsync` `parseMany` `parseManyAsync` `parseNullable` `parseOptional` `parseOptionalNullable` `parseOr` `parseOrElse` `parseRecord` `removeBom` `schemaStep` `someItem` `success` `tap` `tapValidated` `toFieldErrors` `toValidationError` `transformArray` `transformArrayAsync` `traverse` `unless` `unwrapSchema` `unwrapValidation` `validate` `validateAndTransform` `validateAndTransformAsync` `validateAsync` `when` `withTransformer`

Interfaces (23)

`AsyncValidationNormalizer` `AsyncValidationParser` `AsyncValidationTransformer` `ConstraintOptions` `NormalizerOptions` `ParseOptions` `ParserOptions` `TransformerOptions` `TraversalReport` `TraversalVisitor` `ValidationComposer` `ValidationComposerOptions` `ValidationConstraint` `ValidationErrorOptions` `ValidationFactoryOptions` `ValidationFailure` `ValidationIssue` `ValidationNormalizer` `ValidationParser` `ValidationRule` `ValidationRuleOptions` `ValidationSuccess` `ValidationTransformer`

Type aliases (8)

`AsyncNormalizer` `AsyncValidationTransform` `Normalizer` `TraversalHalt` `ValidationResult` `ValidationSchema` `ValidationStep` `ValidationTransform`

Constants (19)

`ascii` `digits` `email` `even` `finiteNumber` `futureDate` `httpUrl` `integer` `isoDate` `letters` `MAX_MEASURABLE_DEPTH` `nonEmptyString` `nonNegative` `odd` `pastDate` `positive` `required` `slug` `uuid`

Enums (1)

`ValidationErrorCode`
