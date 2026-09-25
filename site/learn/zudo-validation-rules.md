---
title: "Validation rules with @zudojs/validation — ZudoJS Academy"
description: "Go beyond data shapes with @zudojs/validation: constraints, normalizers, composers, Zod, guards and errors, and treat request and response failures differently."
source: https://zudojs.oyinlola.site/learn/zudo-validation-rules
---

LEVEL 12 · LESSON 18 OF 19

Configuration, validation and errors Core

# Validation rules with @zudojs/validation

Go beyond data shapes with @zudojs/validation: constraints, normalizers, composers, Zod, guards and errors, and treat request and response failures differently.

- **55 min** to read and try
- **You need:** Schemas and validation in depth
- **You build:** Title rules for the Task API that stop near-duplicate and control-character titles, and response checks that treat a broken task as a server bug instead of a client error

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what @zudojs/validation adds next to @zudojs/schema and choose the right package for a check
- Check values with built-in and custom constraints and read the issues they produce
- Normalize text before validating and comparing it, and explain NFC, NFKC and case folding
- Compose validation steps into reusable rule sets, and use Zod schemas through validate, parse and validateAsync
- Guard untrusted and outgoing data with depth, size and circular-reference checks, and treat response validation failures as server errors

## The problem: valid data that is still wrong

The Task API's `NewTaskSchema` from [Schemas and validation in depth](https://zudojs.oyinlola.site/learn/zudo-validation) checks the *shape* of a new task: a title of 3 to 100 characters, a known priority. The service refuses a title that already exists. Now look at what gets through both:

why.ts

```ts
import { schema } from "@zudojs/schema";

const NewTaskSchema = schema.object({ title: schema.string().trim().min(3).max(100) });
const stored = new Set<string>();

function create(title: string): string {
  const data = NewTaskSchema.safeParse({ title });
  if (!data.success) return `refused (${data.issues[0]?.message})`;
  if (stored.has(data.data.title)) return "refused (duplicate)";
  stored.add(data.data.title);
  return `created ${JSON.stringify(data.data.title)}`;
}

for (const title of ["Buy milk", "Buy  milk", "BUY MILK", "Ｂｕｙ milk", "Buy milk\u0007", "🛒🛒"]) {
  console.log(create(title));
}
console.log("tasks stored:", stored.size);
```

Output of `npx tsx why.ts` and of the browser terminal

```ts
created "Buy milk"
created "Buy  milk"
created "BUY MILK"
created "Ｂｕｙ milk"
created "Buy milk\u0007"
created "🛒🛒"
tasks stored: 6
```

- Four spellings of "Buy milk" are now four tasks: two spaces, capitals, and "fullwidth" letters that some phone keyboards produce. To a person they are the same task.
- A title with an invisible control character (`\u0007`, the "bell") was stored. It will end up in e-mails, logs and CSV exports.
- Two emoji passed `min(3)`, because JavaScript counts an emoji as two "characters" (two UTF-16 code units).

None of these is a shape problem. They are **rules** about what a value means: which titles count as the same, which characters are allowed, how long a string is to a human. `@zudojs/validation` is the ZudoJS package for such rules. It also brings structural guards, which you have used since the last lesson, a Zod integration, and an error class for validation failures.

## @zudojs/schema or @zudojs/validation?

ZudoJS has two validation packages, and it is fair to ask why:

|  | `@zudojs/schema` | `@zudojs/validation` |
| --- | --- | --- |
| Main job | Describe the shape of data and infer its TypeScript type | Rules on values, normalization, composition, guards |
| Schemas | Its own engine, no dependencies (`schema.object`, `Infer`) | Zod (`z.object`, re-exported as `z`) |
| Failure | `SchemaError`, 400, `issues` | `ValidationError` and subclasses, 400, `issues` |
| In the Task API | Every DTO: bodies, parameters, queries, responses | Depth and size guards, and from this lesson, title rules |

The rule of thumb for this course: **schemas describe shapes, `@zudojs/validation` checks rules**. A DTO stays a `@zudojs/schema` schema. Rules that need more than a type, a length and a format, such as "no control characters", "same title ignoring case and spacing", "USSD transfers at most ₦20,000", are written as constraints and composed with `@zudojs/validation`, and run after the schema has produced a typed value. Its Zod schemas are the alternative for a project that already uses Zod; do not describe the same DTO in both.

The two error classes look alike but are not the same class, and one guard does not recognise the other's errors:

two-errors.ts

```ts
import { isSchemaValidationError, schema } from "@zudojs/schema";
import { isValidationError, parse, z } from "@zudojs/validation";

const errors: unknown[] = [];
try {
  schema.object({ title: schema.string() }).parse({});
} catch (error) {
  errors.push(error);
}
try {
  parse(z.object({ title: z.string() }), {});
} catch (error) {
  errors.push(error);
}

for (const error of errors) {
  const e = error as Error & { statusCode: number; code: string };
  console.log(e.name, e.statusCode, e.code, "| schema guard:", isSchemaValidationError(error), "| validation guard:", isValidationError(error));
}
```

Output of `npx tsx two-errors.ts` and of the browser terminal

```ts
SchemaError 400 ERR_SCHEMA_VALIDATION | schema guard: true | validation guard: false
SchemaValidationError 400 ERR_SCHEMA_VALIDATION | schema guard: false | validation guard: true
```

Both are exposed 400s with the same `code`, so a generic error handler answers both correctly. But code that checks `isSchemaValidationError` to read `issues`, as the Task API's error handler will in [the next lesson](https://zudojs.oyinlola.site/learn/zudo-errors), does not recognise errors from `@zudojs/validation`. Keep that in mind when you mix them; this lesson's Task API rules are written so that their error message carries the details.

## Constraints

A **constraint** is a small, named, reusable rule: a `validate` function, a `code` for programs and a `message` for people. `checkConstraint(constraint, value)` runs one; `checkConstraints(list, value, path)` runs several and collects every failure. Both return the result shape you know from `safeParse`: `{ success, data }` or `{ success, issues }`.

constraints.ts

```ts
import { checkConstraints, email, httpUrl, integer, between, lengthBetween, minLength, nonEmptyString, slug } from "@zudojs/validation";

const show = (label: string, result: { success: boolean; issues?: readonly { path: readonly (string | number)[]; message: string }[] }) =>
  console.log(label.padEnd(12), result.success ? "ok" : result.issues?.map((i) => `${i.path.join(".")}: ${i.message}`));

show("guests", checkConstraints([integer, between(1, 8)], 12, ["guests"]));
show("email", checkConstraints([email], "ada@example", ["email"]));
show("website", checkConstraints([httpUrl], "javascript:alert(1)", ["website"]));
show("room slug", checkConstraints([slug], "Ikoyi Suite", ["room"]));
show("name", checkConstraints([nonEmptyString, lengthBetween(2, 40)], "   ", ["name"]));
show("emoji", checkConstraints([minLength(3)], "🛒🛒", ["title"]));
```

Output of `npx tsx constraints.ts` and of the browser terminal

```ts
guests       [ 'guests: Value must be between 1 and 8.' ]
email        [ 'email: Value must be a valid email address.' ]
website      [ 'website: Value must be a valid HTTP or HTTPS URL.' ]
room slug    [
  'room: Value must be a slug: lowercase letters and digits, separated by single hyphens.'
]
name         [ 'name: Value must not be empty.' ]
emoji        [ 'title: Value must contain at least 3 characters.' ]
```

A few details matter:

- `checkConstraints` runs *every* constraint and reports every failure, so a form can show all problems at once. The `path` argument puts the field name on each issue.
- String lengths count **code points**, so an emoji is one character: `🛒🛒` is two, and fails `minLength(3)`. `@zudojs/schema`'s `min(3)` counts UTF-16 code units and let it through. When length means "what a person sees", use the constraint.
- `httpUrl` accepts only `http:` and `https:`. A `javascript:` "URL" in a profile link is a classic stored-XSS trick.
- The rejected value is **not** copied into the issue. Issues end up in error responses and logs, and the rejected value may be a password or a card number.

The package ships constraints for strings (`nonEmptyString`, `minLength`, `maxLength`, `lengthBetween`, `matches`, `email`, `uuid`, `httpUrl`, `ascii`, `digits`, `letters`, `slug`), numbers (`min`, `max`, `between`, `integer`, `positive`, `nonNegative`, `finiteNumber`, `even`, `odd`), dates (`isoDate`, `futureDate`, `pastDate`) and collections (`minItems`, `maxItems`, `exactItems`, `everyItem`, `someItem`, `oneOf`, `noneOf`).

### Your own constraints

`createConstraint(fn, { name, code, message, guard })` makes your own. The `guard` is a type guard that runs first: constraints are often handed values straight from a request, and a guard turns "wrong type" into a normal failure instead of a `TypeError` inside your function:

custom.ts

```ts
import { checkConstraint, checkConstraints, combineConstraints, createConstraint, integer, between, not, oneOf } from "@zudojs/validation";

const noControlCharacters = createConstraint<string>((value) => !/\p{Cc}/u.test(value), {
  name: "noControlCharacters",
  code: "control_character",
  message: "Must not contain control characters",
  guard: (value): value is string => typeof value === "string",
});

console.log(checkConstraint(noControlCharacters, "Buy milk\r\nBcc: everyone@example.com").issues);
console.log(checkConstraint(noControlCharacters, 42 as unknown as string).success);

const notReserved = not(oneOf(["admin", "root"]), { code: "reserved", message: "Choose another username" });
console.log(checkConstraint(notReserved, "admin").issues?.[0]?.message, checkConstraint(notReserved, "ada").success);
console.log(checkConstraint(not(oneOf(["admin", "root"])), "root").issues?.[0]?.message);

const guests = combineConstraints(integer, between(1, 8));
console.log(checkConstraint(guests, 2.5).issues?.[0]?.message);
console.log(checkConstraints([integer, between(1, 8)], 2.5).issues?.map((i) => i.message));
```

Output of `npx tsx custom.ts` and of the browser terminal

```json
[
  {
    path: [],
    code: 'control_character',
    message: 'Must not contain control characters'
  }
]
false
Choose another username true
Value must not satisfy one_of.
One or more validation constraints failed.
[ 'Value must be an integer.' ]
```

Two things to notice. `not` without options reports the internal name of the constraint it negates (`one_of`), which means nothing to a user, so give it your own message. And `combineConstraints` turns several constraints into one, but its failure message is generic: when the reason matters to the user, pass the list to `checkConstraints` instead.

## Normalize, then validate

Back to the four "Buy milk" tasks. Before you can decide whether two titles are the same, you must decide what "the same" means, and turn every title into that one form. That step is **normalization**.

REASON IT OUT

### When are two titles the same task?

Before reading on, decide which of these should count as the same title as `Buy milk`, and which differences are only in the *bytes*, not in what a person sees: `"Buy  milk"` (two spaces), `" Buy milk "`, `"BUY MILK"`, `"Ｂｕｙ milk"` (fullwidth letters), `"Buy&nbsp;milk"` (a non-breaking space), and `"Café"` typed as one character `é` or as `e` plus a combining accent. Should the *stored* title keep the capitals the user typed?

**Show the reasoning**

- Spaces: runs of spaces, non-breaking spaces and leading or trailing spaces carry no meaning in a title. Collapse and trim them, both for storing and for comparing.
- The two `Café` spellings render identically but are different code point sequences. Unicode **NFC** normalization turns both into the single-`é` form. Store titles in NFC.
- Fullwidth `Ｂｕｙ` is a "compatibility" variant of `Buy`. **NFKC** folds such variants (and ligatures like `ﬁ`) into their plain form. It changes what the user typed, so use it for comparing, not for storing.
- Case: `BUY MILK` is the same task, so compare case-insensitively, but keep the user's capitals when storing and displaying.

So you need two functions: a *clean* form to store (NFC, spaces collapsed, trimmed) and a *key* to compare (the clean form, compatibility-folded and case-folded).

normalize.ts

```ts
import { composeNormalizers, normalizeIdentifier, normalizeTrim, normalizeUnicode, normalizeWhitespace } from "@zudojs/validation";

const cleanTitle = composeNormalizers(normalizeUnicode, normalizeWhitespace, normalizeTrim);
const titleKey = (title: string) => normalizeIdentifier(cleanTitle(title));

for (const title of ["Buy milk", " Buy  milk ", "BUY MILK", "Ｂｕｙ milk", "Buy milk", "Café", "Café"]) {
  const clean = cleanTitle(title);
  console.log(JSON.stringify(title).padEnd(14), "length", String(title.length).padEnd(3), "clean:", JSON.stringify(clean).padEnd(12), "key:", titleKey(title));
}
```

Output of `npx tsx normalize.ts` and of the browser terminal

```ts
"Buy milk"     length 8   clean: "Buy milk"   key: buy milk
" Buy  milk "  length 11  clean: "Buy milk"   key: buy milk
"BUY MILK"     length 8   clean: "BUY MILK"   key: buy milk
"Ｂｕｙ milk"     length 8   clean: "Ｂｕｙ milk"   key: buy milk
"Buy milk"     length 8   clean: "Buy milk"   key: buy milk
"Café"        length 5   clean: "Café"       key: café
"Café"         length 4   clean: "Café"       key: café
```

All the "Buy milk" spellings share one key. The two `Café`s look identical but have different lengths, 5 and 4, because one spells `é` with two code points; NFC gives them the same clean form, and so the same key. `normalizeIdentifier` is trim, NFKC and case folding in one call, made for exactly this job: text that *identifies* something.

The package has more normalizers, each a plain `(value) => value` function you can compose:

normalizers.ts

```ts
import { createNormalizer, foldCase, normalizeEmail, normalizeUnicodeCompatibility, removeBom } from "@zudojs/validation";

console.log(normalizeEmail("Ada.Obi@Example.COM"));
console.log(foldCase("STRASSE") === foldCase("Straße"), "STRASSE".toLowerCase() === "Straße".toLowerCase());
console.log(normalizeUnicodeCompatibility("ﬁnance ①"));
console.log(JSON.stringify(removeBom("﻿name,amount")));

const trimCode = createNormalizer((code: string) => code.trim().toUpperCase(), { name: "voucher-code" });
console.log(trimCode.name, trimCode.normalize("  save-20 "));
```

Output of `npx tsx normalizers.ts` and of the browser terminal

```ts
Ada.Obi@example.com
true false
finance 1
"name,amount"
voucher-code SAVE-20
```

- `normalizeEmail` lower-cases only the domain. The part before `@` may legally be case-sensitive, and folding it could merge two mailboxes.
- `foldCase` is for comparison: German `ß` matches `SS`, which `toLowerCase` does not manage.
- `removeBom` strips the invisible byte-order mark some spreadsheet programs put at the start of a CSV file, which otherwise ends up glued to your first column name.

> NORMALIZE BEFORE YOU CHECK
>
> Always check the normalized value, never the raw one. If you check "no control characters" on the raw text and *then* normalize, the check approved something other than what you store. The same applies to uniqueness: compare keys, not raw strings.

## Composing rules

Real rules come in sets, and some only apply sometimes. A **validation step** is a function from a value to a result. `createValidationComposer(steps, options)` turns a list of steps into one reusable validator with `validate` (returns a result) and `assert` (throws):

compose.ts

```ts
import { between, constraintsStep, createValidationComposer, failure, integer, issue, success, when } from "@zudojs/validation";
import type { ValidationStep } from "@zudojs/validation";

interface Transfer {
  readonly amountKobo: number;
  readonly channel: "app" | "ussd";
}

const wholeKobo: ValidationStep<Transfer> = (transfer) => {
  const result = constraintsStep<number>([integer, between(100, 1_000_000_000)])(transfer.amountKobo);
  return result.success ? success(transfer) : failure(result.issues.map((i) => ({ ...i, path: ["amountKobo"] })));
};
const ussdCap = when<Transfer>(
  (transfer) => transfer.channel === "ussd",
  (transfer) =>
    transfer.amountKobo <= 2_000_000
      ? success(transfer)
      : failure([issue("USSD transfers are limited to ₦20,000", { path: ["amountKobo"], code: "ussd_cap" })]),
);

const firstProblem = createValidationComposer([wholeKobo, ussdCap], { name: "transfer-rules" });
const everyProblem = createValidationComposer([wholeKobo, ussdCap], { name: "transfer-rules", stopOnFirstError: false });

for (const transfer of [
  { amountKobo: 4_500_000, channel: "app" },
  { amountKobo: 4_500_000, channel: "ussd" },
  { amountKobo: 4_500_000.5, channel: "ussd" },
] as const) {
  const first = firstProblem.validate(transfer);
  const all = everyProblem.validate(transfer);
  console.log(transfer.channel, transfer.amountKobo, "->", first.success ? "ok" : first.issues.map((i) => i.code), "| all:", all.success ? "ok" : all.issues.map((i) => i.code));
}

try {
  firstProblem.assert({ amountKobo: 50, channel: "app" });
} catch (error) {
  console.log((error as Error).name, (error as Error & { statusCode: number }).statusCode, (error as Error).message);
}
```

Output of `npx tsx compose.ts` and of the browser terminal

```ts
app 4500000 -> ok | all: ok
ussd 4500000 -> [ 'ussd_cap' ] | all: [ 'ussd_cap' ]
ussd 4500000.5 -> [ 'invalid_integer' ] | all: [ 'invalid_integer', 'ussd_cap' ]
ConstraintValidationError 400 transfer-rules validation failed.
```

- `when(predicate, step)` runs a step only for matching values: the ₦20,000 cap applies to USSD only. `unless` is the opposite.
- By default a composer **stops at the first failure**, because steps usually build on each other. `stopOnFirstError: false` collects every problem, which suits independent checks, as in the last case.
- `assert` throws a `ConstraintValidationError`, a 400 named after the composer.

Steps also combine with `all`, `any`, `first` and `negate`, and adapt with `optional`, `nullable` and `mapValidated`:

combinators.ts

```ts
import { any, constraintStep, mapValidated, oneOf, optional, integer } from "@zudojs/validation";

const currency = any(constraintStep(oneOf(["NGN"])), constraintStep(oneOf(["GHS", "KES"])));
console.log(currency("KES").success, currency("USD").success);

const optionalTip = optional(constraintStep<number>(integer));
console.log(optionalTip(undefined).success, optionalTip(250.5).success);

const toNaira = mapValidated(constraintStep<number>(integer), (kobo) => `₦${(kobo / 100).toFixed(2)}`);
const shown = toNaira(1_250_050);
console.log(shown.success && shown.data);
```

Output of `npx tsx combinators.ts` and of the browser terminal

```ts
true false
true false
₦12500.50
```

### Named rules in a registry

When rules are shared by many modules, a `ValidationRegistry` stores them by name, so code asks for `"amount.kobo"` instead of importing a list of constraints:

registry.ts

```ts
import { between, createValidationRegistry, integer } from "@zudojs/validation";

const rules = createValidationRegistry();
rules.registerConstraints<number>("amount.kobo", [integer, between(100, 1_000_000_000)], {
  description: "Whole kobo from ₦1 to ₦10,000,000",
});

console.log(rules.names(), rules.get("amount.kobo")?.description);
console.log(rules.validate("amount.kobo", 4_500_000).success);
console.log(rules.validate("amount.kobo", "4500000").issues?.map((i) => i.code));
```

Output of `npx tsx registry.ts` and of the browser terminal

```json
[ 'amount.kobo' ] Whole kobo from ₦1 to ₦10,000,000
true
[ 'invalid_integer', 'value_out_of_range' ]
```

A string was refused with the codes of both constraints, not with a crash: the registry passes whatever it receives, and each constraint's guard reports a wrong type as an ordinary failure.

## Zod integration

If your project already uses **Zod**, the most widely used schema library for TypeScript, `@zudojs/validation` wraps it in the ZudoJS result and error shapes. It re-exports Zod as `z`, so you do not install a second copy:

zod.ts

```ts
import { createParser, isValid, parseOr, validate, z } from "@zudojs/validation";

const Booking = z.object({
  room: z.string().min(1),
  nights: z.number().int().min(1).max(30),
  email: z.string().email(),
});
type Booking = z.infer<typeof Booking>;

const result = validate(Booking, { room: "Ikoyi suite", nights: 1.5, email: "ada@example", notes: "late check-in" });
console.log(result.success ? result.data : result.issues.map((i) => `${i.path.join(".")} (${i.code}): ${i.message}`));

const ok = validate(Booking, { room: "Ikoyi suite", nights: 2, email: "ada@example.com", notes: "late check-in" });
console.log(ok.success && ok.data);

const parseBooking = createParser(Booking);
const booking: Booking = parseBooking({ room: "Lekki studio", nights: 3, email: "bayo@example.com" });
console.log(booking.nights, isValid(Booking, booking));

console.log(parseOr(z.coerce.number().int().min(1), "abc", 20), parseOr(z.coerce.number().int().min(1), "5", 20));
```

Output of `npx tsx zod.ts` and of the browser terminal

```json
[
  'nights (invalid_type): Invalid input: expected int, received number',
  'email (invalid_format): Invalid email address'
]
{ room: 'Ikoyi suite', nights: 2, email: 'ada@example.com' }
3 true
20 5
```

- `validate` returns the same `{ success, data | issues }` shape as everything else in the package, with Zod's issues mapped to `path`, `code` and `message`. `parse` and `createParser` throw a `SchemaValidationError`, a 400.
- Zod objects strip unknown keys by default: `notes` vanished, as with `@zudojs/schema`.
- `parseOr(schema, value, fallback)` suits query strings: a missing or broken `?limit=` becomes the default.

### Rules that need to wait

Some rules need a database or another service: "is this username free?". Zod supports asynchronous refinements, and `validateAsync` runs them. The synchronous `validate` cannot, and it does not fail gently:

zod-async.ts

```ts
import { validate, validateAsync, z } from "@zudojs/validation";

const taken = new Set(["ada", "chiamaka"]);
async function usernameIsFree(name: string): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, 5));
  return !taken.has(name.toLowerCase());
}

const Signup = z.object({ username: z.string().min(3).refine(usernameIsFree, "That username is taken") });

console.log(await validateAsync(Signup, { username: "Ada" }));
console.log((await validateAsync(Signup, { username: "bayo" })).success);
try {
  validate(Signup, { username: "bayo" });
} catch (error) {
  console.log("validate threw:", (error as Error).name, "-", (error as Error).message);
}
```

Output of `npx tsx zod-async.ts` and of the browser terminal

```json
{
  success: false,
  issues: [
    {
      path: [Array],
      code: 'custom',
      message: 'That username is taken'
    }
  ]
}
true
validate threw: Error - Encountered Promise during synchronous parse. Use .parseAsync() instead.
```

The synchronous call did not return a failure result: it threw a plain `Error`, which a server would answer with 500. Use `validateAsync` or `parseAsync` for any schema with an asynchronous rule. And keep such checks out of schemas for writes that must be unique: between the check and the insert another request can take the name. The database's unique index is the real guarantee; the check only gives a friendlier message.

## Validation errors

Failures that should stop a request are thrown as `ValidationError`s. The class extends the shared `ValidationError` of `@zudojs/errors`, so it is a 400 that is safe to show. `createValidationError(issues)` builds one from issues, and the error keeps them in a form that is easy to present:

errors.ts

```ts
import { createValidationError, issue, isValidationError } from "@zudojs/validation";

const error = createValidationError([
  issue("Password must be at least 12 characters", { path: ["password"], code: "too_short", received: "hunter2" }),
  issue("Enter a valid email address", { path: ["email"], code: "invalid_email" }),
]);

console.log(error.name, error.statusCode, error.expose, error.code);
console.log(error.message);
console.log(error.fieldErrors);
console.log(JSON.stringify(error.toJSON().issues[0]));
console.log(isValidationError(error));
```

Output of `npx tsx errors.ts` and of the browser terminal

```ts
ValidationError 400 true ERR_VALIDATION_FAILED
password: Password must be at least 12 characters; email: Enter a valid email address
[Object: null prototype] {
  password: 'Password must be at least 12 characters',
  email: 'Enter a valid email address'
}
{"path":["password"],"code":"too_short","message":"Password must be at least 12 characters","receivedType":"string(7)"}
true
```

- The `message` lists every issue with its path, so even a handler that only sends `message` tells the client what to fix.
- `fieldErrors` gives one message per top-level field, ready for a form.
- `toJSON()`, which loggers and error handlers use, **redacts** the received value: the password `hunter2` became `receivedType: "string(7)"`, its type and length. The issue objects in memory still have it, so never log `error.issues` raw.

## Structural guards

In [the last lesson](https://zudojs.oyinlola.site/learn/zudo-validation#guards) you used two guards on request bodies: `assertDepthWithinLimit` and `assertSizeWithinLimit`. There is a third, and all three deserve a closer look.

### Circular references

`JSON.parse` can never produce a cycle, so request bodies never contain one. Cycles appear in data *you* build: an order that points to its customer, whose `orders` list points back to the order. Such a graph cannot be serialized, and a naive recursive walk over it never ends:

circular.ts

```ts
import { assertNoCircularReference, hasCircularReference } from "@zudojs/validation";

const customer: { name: string; orders: unknown[] } = { name: "Chiamaka", orders: [] };
const order = { id: "ord-17", totalKobo: 4_500_000, customer };
customer.orders.push(order);

console.log(hasCircularReference(order));
try {
  assertNoCircularReference(order);
} catch (error) {
  const e = error as Error & { statusCode: number };
  console.log(e.name, e.statusCode, "-", e.message);
}
try {
  JSON.stringify(order);
} catch (error) {
  console.log((error as Error).name);
}

const address = { city: "Lagos" };
console.log(hasCircularReference({ billing: address, shipping: address }));
```

Output of `npx tsx circular.ts` and of the browser terminal

```ts
true
CircularReferenceError 500 - Circular reference detected at "root.customer.orders[0]"
TypeError
false
```

The guard names the exact path of the cycle, where `JSON.stringify` only says "circular structure". It is a **500**: a cycle in outgoing data is your bug, not the client's. The last line shows the difference between a cycle and a *shared* reference: the same address used twice is fine.

### Depth and size

depth-size.ts

```ts
import { assertSizeWithinLimit, estimateSerializedSize, getSerializationDepth } from "@zudojs/validation";

console.log(getSerializationDepth({ task: { tags: ["home"] } }), getSerializationDepth("text"));

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
for (const title of ["a".repeat(1000), "₦".repeat(1000), "任".repeat(1000)]) {
  const body = { title };
  console.log(title[0], "estimate:", estimateSerializedSize(body), "real UTF-8 bytes:", bytes(body));
}

try {
  assertSizeWithinLimit({ title: "₦".repeat(1000) }, 2_500);
  console.log("2,500-byte limit: passed");
} catch (error) {
  console.log((error as Error).message);
}
```

Output of `npx tsx depth-size.ts` and of the browser terminal

```ts
3 0
a estimate: 2013 real UTF-8 bytes: 1012
₦ estimate: 2013 real UTF-8 bytes: 3012
任 estimate: 2013 real UTF-8 bytes: 3012
2,500-byte limit: passed
```

The size estimate counts two bytes per UTF-16 code unit. For plain ASCII that is about double the real size, but `₦` and most non-Latin scripts take three bytes in UTF-8, and there the estimate is too *low*: the 3,012-byte body passed a 2,500-byte limit. Treat the guard as a cheap check on the parsed structure, and keep the HTTP server's body limit (10 MB by default, set lower for a JSON API) as the hard limit on real bytes.

## Request validation and response validation

You validate in two directions, and they differ in everything but the tools:

|  | Request validation | Response validation |
| --- | --- | --- |
| Data comes from | The client: untrusted, possibly hostile | Your own code and database: trusted, possibly buggy |
| A failure means | The client sent something wrong | You have a bug |
| Answer | 400 with details the client can act on | 500 with no details; log everything |
| Checks | Guards, schema, rules | Allow-list (drop internal fields), shape, no cycles |

The danger is using the request tools on responses unchanged. A schema or validation error is an exposed 400, so a broken stored record becomes a 400 that says `done` should have been a boolean: the client is blamed for your bug, and the answer describes your internal data:

response.ts

```ts
import { InternalServerError } from "@zudojs/errors";
import { validate, z } from "@zudojs/validation";

const TaskResponse = z.object({ id: z.number(), title: z.string(), done: z.boolean() });
const stored: unknown = { id: 7, title: "Buy milk", done: "yes", ownerId: 42 };

function sendNaive(task: unknown) {
  const result = validate(TaskResponse, task);
  if (!result.success) {
    return { status: 400, body: { error: "Validation failed", issues: result.issues.map((i) => `${i.path.join(".")}: ${i.message}`) } };
  }
  return { status: 200, body: result.data };
}

function sendSafely(task: unknown) {
  const result = validate(TaskResponse, task);
  if (!result.success) {
    throw new InternalServerError("A task failed its response schema", {
      metadata: { issues: result.issues.map((i) => `${i.path.join(".")}: ${i.code}`) },
    });
  }
  return { status: 200, body: result.data };
}

console.log(JSON.stringify(sendNaive(stored)));
try {
  sendSafely(stored);
} catch (error) {
  const e = error as InternalServerError;
  console.log(e.statusCode, e.expose, e.isOperational, "| for the log:", JSON.stringify(e.metadata));
}
console.log(JSON.stringify(sendSafely({ id: 8, title: "Walk the dog", done: false, ownerId: 42 })));
```

Output of `npx tsx response.ts` and of the browser terminal

```json
{"status":400,"body":{"error":"Validation failed","issues":["done: Invalid input: expected boolean, received string"]}}
500 false false | for the log: {"issues":["done: invalid_type"]}
{"status":200,"body":{"id":8,"title":"Walk the dog","done":false}}
```

The safe version turns a failed response check into an `InternalServerError`: a 500 that is not exposed and not "operational", so an error handler that reports bugs, like the one in the next lesson, logs it with the issues attached. The client sees a generic 500. When the data is fine, the same check is the allow-list: `ownerId` never leaves the server.

## Put it in the Task API

Two changes: title rules against near-duplicates and control characters, and response checks that treat a broken task as a server bug. The Task API is where [the last lesson](https://zudojs.oyinlola.site/learn/zudo-validation#task-api) left it. Its store, schemas and HTTP helpers do not change:

**Show the unchanged files**

src/repositories/tasks.store.ts

```ts
export type Priority = "low" | "normal" | "high";

export interface StoredTask {
  readonly id: number;
  readonly title: string;
  readonly done: boolean;
  readonly priority: Priority;
  readonly createdAt: string;
}

export class TaskStore {
  public readonly tasks = new Map<number, StoredTask>();
  public connected = false;
  private lastId = 0;

  public nextId(): number {
    this.lastId += 1;
    return this.lastId;
  }
}
```

src/dtos/tasks.dto.ts

```ts
import { schema } from "@zudojs/schema";
import type { Infer } from "@zudojs/schema";

const Title = schema.string().trim().min(3).max(100);
const Priority = schema.enum(["low", "normal", "high"] as const);

export const NewTaskSchema = schema.object({
  title: Title,
  done: schema.default(schema.boolean(), false),
  priority: schema.default(Priority, "normal"),
});
export type NewTask = Infer<typeof NewTaskSchema>;

export const UpdateTaskSchema = schema.refine(
  NewTaskSchema.partial().strict(),
  (changes) => Object.keys(changes).length > 0,
  "Send at least one field to change",
);
export type TaskChanges = Infer<typeof UpdateTaskSchema>;

export const TaskIdParams = schema.object({ id: schema.coerce.number().int().min(1) });

export const ListTasksQuery = schema.object({
  page: schema.coerce.number().int().min(1).default(1),
  limit: schema.coerce.number().int().min(1).max(50).default(20),
  done: schema.coerce.boolean().optional(),
  priority: schema.optional(Priority),
});
export type ListTasks = Infer<typeof ListTasksQuery>;

export const TaskResponse = schema.object({
  id: schema.number(),
  title: schema.string().max(100),
  done: schema.boolean(),
  priority: Priority,
  createdAt: schema.string().max(40),
});
```

src/utils/http.ts

```ts
import { HttpError, badRequest, createResponseContext } from "@zudojs/http";
import type { HttpResponseContext, HttpRouterContext } from "@zudojs/http";
import { assertDepthWithinLimit, assertSizeWithinLimit } from "@zudojs/validation";

/** A JSON response with `status`. */
export function json(status: number, data: unknown): HttpResponseContext {
  return createResponseContext({ status }).json(data);
}

/**
 * The request body parsed as JSON; `undefined` when there is none.
 * A body that is not sent as JSON is answered with 415, malformed JSON with 400,
 * JSON nested deeper than 10 levels with 400 and more than 64 KB of data with 413.
 */
export function readJsonBody(ctx: HttpRouterContext): unknown {
  const body: unknown = ctx.request.body;
  if (body === undefined || body === null) return undefined;
  const text =
    body instanceof Uint8Array
      ? new TextDecoder().decode(body)
      : typeof body === "string"
        ? body
        : undefined;
  if (text === undefined) return body;
  if (text.trim() === "") return undefined;
  const type = ctx.request.getHeader("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Send JSON with Content-Type: application/json");
  }
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    throw badRequest("The request body is not valid JSON.");
  }
  assertDepthWithinLimit(data, 10);
  assertSizeWithinLimit(data, 65_536);
  return data;
}
```

This page shows only the parts of `src/utils/http.ts` the routes use; your file keeps its other helpers. The generated project has an empty `src/validators/` folder, and the title rules belong there. Create `src/validators/tasks.rules.ts`:

src/validators/tasks.rules.tsNode.js only

```ts
import {
  checkConstraints,
  composeNormalizers,
  createConstraint,
  createValidationError,
  lengthBetween,
  normalizeIdentifier,
  normalizeTrim,
  normalizeUnicode,
  normalizeWhitespace,
} from "@zudojs/validation";

/** The form a title is stored in: NFC, single spaces, trimmed. */
export const cleanTitle = composeNormalizers(normalizeUnicode, normalizeWhitespace, normalizeTrim);

/** The form titles are compared in: two titles with the same key are the same task. */
export function titleKey(title: string): string {
  return normalizeIdentifier(cleanTitle(title));
}

const noControlCharacters = createConstraint<string>((value) => !/\p{Cc}/u.test(value), {
  name: "noControlCharacters",
  code: "control_character",
  message: "Title must not contain control characters",
});

const TITLE_RULES = [lengthBetween(3, 100), noControlCharacters];

/** Cleans a title and checks the rules a schema cannot express; throws a 400 ValidationError. */
export function checkTitle(raw: string): string {
  const title = cleanTitle(raw);
  const result = checkConstraints(TITLE_RULES, title, ["title"]);
  if (!result.success) {
    throw createValidationError(result.issues);
  }
  return title;
}
```

The order follows the warning above: clean first, then check the cleaned title, then store exactly what was checked. `normalizeWhitespace` already turns tabs and newlines into spaces, so the control-character rule only has the truly invisible ones left to refuse. `lengthBetween` counts what a person sees.

In `src/services/tasks.service.ts`, import the two functions, run `checkTitle` after the schema in `create` and `update`, and compare keys in `assertUniqueTitle`. A task may be renamed to a different spelling of its own title, so the check skips the task being updated:

src/services/tasks.service.tsNode.js only

```ts
import { ConflictError, NotFoundError } from "@zudojs/errors";
import type { Clock } from "@zudojs/types";
import { ListTasksQuery, NewTaskSchema } from "../dtos/tasks.dto.js";
import type { ListTasks, TaskChanges } from "../dtos/tasks.dto.js";
import type { StoredTask, TaskStore } from "../repositories/tasks.store.js";
import { checkTitle, titleKey } from "../validators/tasks.rules.js";

export class TaskService {
  public constructor(private readonly store: TaskStore, private readonly clock: Clock) {}

  public create(input: unknown): StoredTask {
    const data = NewTaskSchema.parse(input);
    const title = checkTitle(data.title);
    this.assertUniqueTitle(title);
    const task: StoredTask = { id: this.store.nextId(), ...data, title, createdAt: new Date(this.clock.now()).toISOString() };
    this.store.tasks.set(task.id, task);
    return task;
  }

  public list(query: ListTasks = ListTasksQuery.parse({})): StoredTask[] {
    const matching = [...this.store.tasks.values()].filter(
      (t) => (query.done === undefined || t.done === query.done) && (query.priority === undefined || t.priority === query.priority),
    );
    const start = (query.page - 1) * query.limit;
    return matching.slice(start, start + query.limit);
  }

  public get(id: number): StoredTask {
    const task = this.store.tasks.get(id);
    if (!task) {
      throw new NotFoundError(`Task ${id} not found`);
    }
    return task;
  }

  public update(id: number, changes: TaskChanges): StoredTask {
    const task = this.get(id);
    const title = changes.title === undefined ? task.title : checkTitle(changes.title);
    this.assertUniqueTitle(title, id);
    const updated: StoredTask = {
      ...task,
      title,
      done: changes.done ?? task.done,
      priority: changes.priority ?? task.priority,
    };
    this.store.tasks.set(id, updated);
    return updated;
  }

  private assertUniqueTitle(title: string, exceptId?: number): void {
    const key = titleKey(title);
    if ([...this.store.tasks.values()].some((t) => t.id !== exceptId && titleKey(t.title) === key)) {
      throw new ConflictError(`A task called "${title}" already exists`);
    }
  }
}
```

Last, the routes. `send` checks every outgoing task with `TaskResponse`, but a failure there is now a 500 with the issues kept for the log. In `src/routes/tasks.routes.ts`, replace the one-line `send` with this function; the routes themselves do not change:

src/routes/tasks.routes.tsNode.js only

```ts
import { InternalServerError } from "@zudojs/errors";
import type { HttpRouter } from "@zudojs/http";
import { ListTasksQuery, TaskIdParams, TaskResponse, UpdateTaskSchema } from "../dtos/tasks.dto.js";
import type { StoredTask } from "../repositories/tasks.store.js";
import type { TaskService } from "../services/tasks.service.js";
import { json, readJsonBody } from "../utils/http.js";

/** The allow-list for outgoing tasks. A task that fails it is our bug: 500, logged, never blamed on the client. */
function send(task: StoredTask) {
  const result = TaskResponse.safeParse(task);
  if (!result.success) {
    throw new InternalServerError("A stored task failed its response schema", {
      metadata: { taskId: task.id, issues: result.issues.map((i) => `${i.path.join(".")}: ${i.code}`) },
    });
  }
  return result.data;
}

export function registerTaskRoutes(router: HttpRouter, tasks: TaskService): void {
  router.get("/tasks", (ctx) => tasks.list(ListTasksQuery.parse(ctx.query)).map(send));

  router.get("/tasks/:id", (ctx) => send(tasks.get(TaskIdParams.parse(ctx.params).id)));

  router.post("/tasks", (ctx) => {
    const task = tasks.create(readJsonBody(ctx));
    return json(201, send(task)).setHeader("location", `/tasks/${task.id}`);
  });

  router.patch("/tasks/:id", (ctx) => {
    const { id } = TaskIdParams.parse(ctx.params);
    const changes = UpdateTaskSchema.parse(readJsonBody(ctx));
    return send(tasks.update(id, changes));
  });
}
```

The issues are logged as `path: code` only, without messages that might quote stored values. A check script exercises it against a real server. The last request plants a broken task straight into the store, the way a bad migration or a bug in another service would:

src/check-rules.tsNode.js only

```ts
import { createHttpServer, createNodeHttpAdapter, createRouter } from "@zudojs/http";
import { FixedClock } from "@zudojs/types";
import { TaskStore } from "./repositories/tasks.store.js";
import type { StoredTask } from "./repositories/tasks.store.js";
import { registerTaskRoutes } from "./routes/tasks.routes.js";
import { TaskService } from "./services/tasks.service.js";

const store = new TaskStore();
const service = new TaskService(store, new FixedClock(Date.parse("2026-09-25T09:00:00Z")));
const router = createRouter();
registerTaskRoutes(router, service);
const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
  handler: async (request) => (await router.dispatch(request)).response,
});
await server.start();
const base = `http://127.0.0.1:${server.address?.port}`;
const json = { "content-type": "application/json" };

for (const [method, path, body] of [
  ["POST", "/tasks", { title: "  Buy \t milk " }],
  ["POST", "/tasks", { title: "BUY  MILK" }],
  ["POST", "/tasks", { title: "Ｂｕｙ milk" }],
  ["POST", "/tasks", { title: "Pay rent\u0007" }],
  ["POST", "/tasks", { title: "🛒🛒" }],
  ["PATCH", "/tasks/1", { title: "Buy Milk" }],
] as const) {
  const response = await fetch(base + path, { method, headers: json, body: JSON.stringify(body) });
  console.log(method, JSON.stringify(body.title).padEnd(16), response.status, await response.text());
}

store.tasks.set(99, { id: 99, title: "Imported", done: "no", priority: "normal", createdAt: "2026-09-25" } as unknown as StoredTask);
const broken = await fetch(`${base}/tasks/99`);
console.log("GET /tasks/99", broken.status, await broken.text());
await server.stop();
```

Output of `npx tsx src/check-rules.ts`

```ts
POST "  Buy \t milk " 201 {"id":1,"title":"Buy milk","done":false,"priority":"normal","createdAt":"2026-09-25T09:00:00.000Z"}
POST "BUY  MILK"      409 {"error":"A task called \"BUY MILK\" already exists","code":"ERR_CONFLICT"}
POST "Ｂｕｙ milk"       409 {"error":"A task called \"Ｂｕｙ milk\" already exists","code":"ERR_CONFLICT"}
POST "Pay rent\u0007" 400 {"error":"title: Title must not contain control characters","code":"ERR_VALIDATION_FAILED"}
POST "🛒🛒"           400 {"error":"title: Value must contain between 3 and 100 characters.","code":"ERR_VALIDATION_FAILED"}
PATCH "Buy Milk"       200 {"id":1,"title":"Buy Milk","done":false,"priority":"normal","createdAt":"2026-09-25T09:00:00.000Z"}
GET /tasks/99 500 {"error":"Internal Server Error"}
```

Read the answers:

- The first title was stored clean: `Buy milk`, with the tab and the extra spaces gone.
- `BUY  MILK` and the fullwidth spelling are now conflicts, 409, because their keys match. Renaming task 1 to `Buy Milk` is allowed: it is the same task.
- The bell character and the two emoji were refused with 400, and the message says which rule failed. It is carried by the error's `message`, which every error handler sends.
- The planted task with `done: "no"` got a plain 500: the client learns nothing about your data. With the error handler from [the next lesson](https://zudojs.oyinlola.site/learn/zudo-errors), that 500 is logged together with `taskId` and the failing fields.

Terminal on your computer

```bash
$ npx tsc --noEmit
$ npx tsx src/check-rules.ts
```

It prints the same lines. Restart `npm run dev`, and the running Task API applies the same rules to every create and update.

## Practice

TRY IT YOURSELF

### Rules for a booking

Write a composer for hotel bookings `{ room, nights, guests, promoCode? }` using constraints: `nights` an integer from 1 to 30, `guests` from 1 to 4, and a promo code, when present, of 4 to 12 letters or digits. Report every problem at once, each with its field path.

**Show a solution**

booking-rules.ts

```ts
import { between, checkConstraints, createValidationComposer, failure, integer, lengthBetween, matches, success } from "@zudojs/validation";
import type { ValidationIssue, ValidationStep } from "@zudojs/validation";

interface Booking {
  readonly room: string;
  readonly nights: number;
  readonly guests: number;
  readonly promoCode?: string;
}

function field<K extends keyof Booking>(name: K, check: (value: Booking[K]) => readonly ValidationIssue[]): ValidationStep<Booking> {
  return (booking) => {
    const issues = check(booking[name]);
    return issues.length === 0 ? success(booking) : failure(issues);
  };
}

const bookingRules = createValidationComposer<Booking>(
  [
    field("nights", (nights) => checkConstraints([integer, between(1, 30)], nights, ["nights"]).issues ?? []),
    field("guests", (guests) => checkConstraints([integer, between(1, 4)], guests, ["guests"]).issues ?? []),
    field("promoCode", (code) =>
      code === undefined ? [] : (checkConstraints([lengthBetween(4, 12), matches(/^[A-Z0-9]+$/i, "Letters and digits only")], code, ["promoCode"]).issues ?? []),
    ),
  ],
  { name: "booking-rules", stopOnFirstError: false },
);

for (const booking of [
  { room: "Ikoyi suite", nights: 2, guests: 2 },
  { room: "Ikoyi suite", nights: 45, guests: 6, promoCode: "SAVE 20" },
]) {
  const result = bookingRules.validate(booking);
  console.log(result.success ? "ok" : result.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
}
```

Output of `npx tsx booking-rules.ts` and of the browser terminal

```ts
ok
[
  'nights: Value must be between 1 and 30.',
  'guests: Value must be between 1 and 4.',
  'promoCode: Letters and digits only'
]
```

`stopOnFirstError: false` is right here, because the three checks are independent: the guest can fix all of them in one go. The `field` helper keeps the path on every issue.

TRY IT YOURSELF

### A safe response helper

Write `respond(schema, value)` for a Zod response schema: on success return the parsed value; on failure throw an `InternalServerError` whose metadata lists each failing path and code, but no messages. Show it with a user record that has a numeric `email` field and an internal `passwordHash`.

**Show a solution**

respond.ts

```ts
import { InternalServerError } from "@zudojs/errors";
import { validate, z } from "@zudojs/validation";
import type { ValidationSchema } from "@zudojs/validation";

function respond<T>(schema: ValidationSchema<T>, value: unknown): T {
  const result = validate(schema, value);
  if (!result.success) {
    throw new InternalServerError("Response failed its schema", {
      metadata: { failures: result.issues.map((i) => `${i.path.join(".")}: ${i.code}`) },
    });
  }
  return result.data;
}

const UserResponse = z.object({ id: z.number(), name: z.string(), email: z.string() });

console.log(respond(UserResponse, { id: 1, name: "Ada", email: "ada@example.com", passwordHash: "$argon2id$..." }));
try {
  respond(UserResponse, { id: 2, name: "Bayo", email: 42, passwordHash: "$argon2id$..." });
} catch (error) {
  const e = error as InternalServerError;
  console.log(e.statusCode, e.expose, JSON.stringify(e.metadata));
}
```

Output of `npx tsx respond.ts` and of the browser terminal

```json
{ id: 1, name: 'Ada', email: 'ada@example.com' }
500 false {"failures":["email: invalid_type"]}
```

The good record lost its `passwordHash` on the way out, and the broken one became a 500 with just enough information for the log: which field, which kind of failure, and no stored values.

## Recap

- `@zudojs/schema` describes shapes; `@zudojs/validation` checks rules, normalizes, composes and guards. Both throw exposed 400s with `issues`, but `isSchemaValidationError` only recognises `@zudojs/schema`'s errors.
- Constraints are named rules with a code and a message. `checkConstraints` reports every failure and never copies the rejected value into an issue. String lengths count code points.
- Normalize before you check or compare: store a clean NFC form, compare an identifier key (NFKC plus case folding) for uniqueness.
- Composers turn steps into reusable validators; `when` makes a rule conditional; `stopOnFirstError: false` collects independent problems.
- With Zod: `validate`, `parse`, `createParser`, `parseOr`; asynchronous rules need `validateAsync`, because `validate` throws a plain error on them.
- `ValidationError` carries `issues`, `fieldErrors` and a message that lists them; `toJSON` redacts received values.
- Guards: circular references (outgoing data, a 500), depth (400) and a size estimate that can undercount non-ASCII text, so keep the server's byte limit.
- Request validation failures are the client's 400; response validation failures are your 500, logged, with no details sent.

The Task API now refuses bad input with precise messages, but its error bodies still differ from error to error. Next, [The ZudoJS error system](https://zudojs.oyinlola.site/learn/zudo-errors) gives every failure one safe, consistent shape.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
