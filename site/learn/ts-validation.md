---
title: "Runtime validation — ZudoJS Academy"
description: "See why an annotation on parsed JSON checks nothing, then validate data at runtime with a schema you build, Zod, Valibot and JSON Schema, and infer types."
source: https://zudojs.oyinlola.site/learn/ts-validation
---

LEVEL 5 · LESSON 21 OF 23

Types meet the runtime Foundation

# Runtime validation

See why an annotation on parsed JSON checks nothing, then validate data at runtime with a schema you build, Zod, Valibot and JSON Schema, and infer types.

- **60 min** to read and try
- **You need:** TypeScript and JavaScript together, Generics and tsconfig in depth
- **You build:** A validated order endpoint, a 60-line schema library with type inference, and the same contract in Zod, Valibot and JSON Schema

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain why an annotation such as const body: User = JSON.parse(text) validates nothing
- Write a validator by hand, and see why hand-written validators drift from their types
- Build a small schema library whose types are inferred from the schema
- Validate the same contract with Zod, Valibot and JSON Schema, and read their issues
- Choose between them for a backend, a browser bundle or a cross-language API
- Handle coercion, unknown keys, refinements and size limits safely, and test a validator

## A type annotation that checks nothing

Here is a signup handler that compiles under the strictest [tsconfig](https://zudojs.oyinlola.site/learn/ts-tsconfig) in this course:

signup.ts

```ts
type NewUser = {
  email: string;
  name: string;
};

function createUser(input: NewUser) {
  return { id: 1, role: "customer", ...input, email: input.email.toLowerCase() };
}

function handleSignup(rawBody: string) {
  const body: NewUser = JSON.parse(rawBody);
  return createUser(body);
}

console.log(handleSignup('{"email": "Ada@Example.com", "name": "Ada"}'));
console.log(handleSignup('{"email": "bola@example.com", "name": "Bola", "role": "admin"}'));
try {
  console.log(handleSignup('{"email": 42}'));
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx signup.ts` and of the browser terminal

```json
{ id: 1, role: 'customer', email: 'ada@example.com', name: 'Ada' }
{ id: 1, role: 'admin', email: 'bola@example.com', name: 'Bola' }
TypeError: input.email.toLowerCase is not a function
```

Three requests, three different outcomes, and only the first is correct. The second client made itself an `admin`, because `...input` copied a field that the type does not even mention. The third crashed with a `TypeError`, on a line TypeScript promised was safe.

The reason is the one from [TypeScript and JavaScript together](https://zudojs.oyinlola.site/learn/ts-runtime#gap): `JSON.parse` returns `any`, and `const body: NewUser = …` is not a check. It is a *claim*, and the compiler accepts claims about `any` without question. When the code runs, the types are gone ([type erasure](https://zudojs.oyinlola.site/learn/ts-compiler#erasure)); only JavaScript is left, and JavaScript does whatever the data says.

So data from outside (request bodies, query strings, environment variables, files, other services' responses, even your own database after a migration) must be checked **at runtime**, by code that looks at the actual value. That is **runtime validation**. This lesson starts where the [hand-written validator](https://zudojs.oyinlola.site/learn/ts-runtime#validator) of the previous lesson stopped: why hand-written validators do not scale, how a schema can produce both the check and the type, and how Zod, Valibot and JSON Schema do it in practice.

## Compile-time safety and runtime safety

TypeScript and a validator protect different things, and a backend needs both:

|  | Compile-time (TypeScript) | Runtime (validation) |
| --- | --- | --- |
| Checks | Your code: that it uses values consistently with their declared types | The data: that an actual value has the shape and rules you require |
| When | Before the program runs, once | Every time data arrives |
| Knows about | Types you wrote or inferred | The real bytes a client sent |
| Cost | None at runtime | Some CPU per request |
| Can express | Shapes, unions, "might be undefined" | Also: "at least 3 characters", "a valid e-mail", "check-out after check-in", "at most 100 items" |

The two meet at the **boundary**, the place where outside data enters your program. The validator turns an `unknown` value into a typed value (or a list of problems); from there on, TypeScript keeps the rest of the program consistent with that type. A validator is how you *earn* the type that the annotation above only claimed.

REASON IT OUT

### What can a client actually send?

A shop's API accepts new orders: a customer e-mail, a list of items (a SKU and a quantity each), and an optional priority, "normal" or "express". Before writing any validation code, list what could arrive in the body instead of a perfect order.

- What can be wrong with the *shape*: the top-level value, missing fields, wrong types?
- What can be wrong with *values* whose type is right?
- What extra things might arrive, and why would they be dangerous?
- Which problems can only be seen by looking at two fields together?
- What should the client get back when there are several problems?

**Show the reasoning**

**Shape:** not JSON at all; JSON that is `null`, an array or a string instead of an object; a missing `items`; `items` as an object; `quantity` as the string `"2"` (common from HTML forms).

**Values:** an e-mail without `@`; an empty `items` list; quantity 0, −3, 2.5 or 1e9; a SKU with spaces or 10,000 characters; a priority of `"urgent"`; strings with leading or trailing spaces.

**Extras:** fields the server sets itself: `id`, `status: "paid"`, `totalKobo: 1`, `role`. Copying them in is **mass assignment**, the bug from the signup handler. Also `__proto__` keys, very deep nesting, or a 50 MB body meant to exhaust memory.

**Cross-field:** the same SKU twice; a delivery date before the order date; more items than are in stock (that one needs the database, so it is a business rule, not validation).

**Response:** every problem at once, each with a path (`items[0].quantity`) and a message, and a 400 or 422 status ([Designing a REST API](https://zudojs.oyinlola.site/learn/rest-design), in the backend course, covers how to choose). One problem at a time makes clients guess and retry.

## Validating by hand, and how it drifts

A hand-written validator takes `unknown`, checks every field, and builds a new object from the checked fields only ([TypeScript and JavaScript together](https://zudojs.oyinlola.site/learn/ts-runtime#validator) built one for tasks). It works. Its weakness is that the type and the checks are two separate pieces of code that must be kept in step by hand:

drift.ts

```ts
type Customer = {
  email: string;
  name: string;
  phone: string;
};

function parseCustomer(value: unknown): Customer {
  if (typeof value !== "object" || value === null) throw new Error("customer must be an object");
  const input = value as Record<string, unknown>;
  if (typeof input.email !== "string" || !input.email.includes("@")) throw new Error("email is invalid");
  if (typeof input.name !== "string" || input.name.trim() === "") throw new Error("name is required");
  return input as Customer;
}

const customer = parseCustomer(JSON.parse('{"email": "ada@example.com", "name": "Ada"}'));
try {
  console.log(customer.phone.startsWith("+234"));
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx drift.ts` and of the browser terminal

```ts
TypeError: Cannot read properties of undefined (reading 'startsWith')
```

Someone added `phone` to the type last month and forgot the validator. Nothing warned them: the final `input as Customer` is an assertion, and assertions are never checked ([Type assertions](https://zudojs.oyinlola.site/learn/ts-assertions)). The validator also returns the input object itself, so any extra field the client sent comes along. Both bugs come from the same root: **the type and the validator are written separately**, so they can disagree. The fix is to write the rules *once*, as data, and derive both the runtime check and the static type from them. That data is called a **schema**.

## Build: a schema library with type inference

Before using a library, build a small one. It is about 60 lines, and it shows exactly what Zod, Valibot and `@zudojs/schema` do inside. The idea:

- A schema is an object with a `parse(value, path)` method that returns either the checked value or a list of issues.
- The schema's TypeScript type carries the type of value it produces: `Schema<string>`, `Schema<number>`.
- Combinators build bigger schemas from smaller ones: `object({ … })`, `array(…)`. Their return types are computed from their arguments.
- A type `Infer<S>` reads the produced type back out of any schema.

mini-schema.ts

```ts
export type Issue = { path: string; message: string };
export type Result<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

export interface Schema<T> {
  parse(value: unknown, path?: string): Result<T>;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

const fail = (path: string, message: string): Result<never> => ({ ok: false, issues: [{ path: path || "(root)", message }] });
const describe = (value: unknown) => (value === null ? "null" : Array.isArray(value) ? "array" : typeof value);

export function string(rules: { min?: number; max?: number; pattern?: RegExp } = {}): Schema<string> {
  return {
    parse(value, path = "") {
      if (typeof value !== "string") return fail(path, `expected a string, got ${describe(value)}`);
      const text = value.trim();
      if (rules.min !== undefined && text.length < rules.min) return fail(path, `must be at least ${rules.min} characters`);
      if (rules.max !== undefined && text.length > rules.max) return fail(path, `must be at most ${rules.max} characters`);
      if (rules.pattern && !rules.pattern.test(text)) return fail(path, `must match ${rules.pattern}`);
      return { ok: true, value: text };
    },
  };
}

export function integer(rules: { min?: number; max?: number } = {}): Schema<number> {
  return {
    parse(value, path = "") {
      if (typeof value !== "number" || !Number.isInteger(value)) return fail(path, `expected a whole number, got ${describe(value)}`);
      if (rules.min !== undefined && value < rules.min) return fail(path, `must be at least ${rules.min}`);
      if (rules.max !== undefined && value > rules.max) return fail(path, `must be at most ${rules.max}`);
      return { ok: true, value };
    },
  };
}

export function oneOf<const T extends readonly string[]>(options: T): Schema<T[number]> {
  return {
    parse(value, path = "") {
      const match = options.find((option) => option === value);
      return match !== undefined ? { ok: true, value: match } : fail(path, `must be one of ${options.join(", ")}`);
    },
  };
}

export function array<T>(item: Schema<T>, rules: { min?: number; max?: number } = {}): Schema<T[]> {
  return {
    parse(value, path = "") {
      if (!Array.isArray(value)) return fail(path, `expected an array, got ${describe(value)}`);
      if (rules.min !== undefined && value.length < rules.min) return fail(path, `must have at least ${rules.min} item(s)`);
      if (rules.max !== undefined && value.length > rules.max) return fail(path, `must have at most ${rules.max} items`);
      const items: T[] = [];
      const issues: Issue[] = [];
      value.forEach((element, i) => {
        const result = item.parse(element, `${path}[${i}]`);
        if (result.ok) items.push(result.value);
        else issues.push(...result.issues);
      });
      return issues.length > 0 ? { ok: false, issues } : { ok: true, value: items };
    },
  };
}

export function object<Shape extends Record<string, Schema<unknown>>>(shape: Shape): Schema<{ [K in keyof Shape]: Infer<Shape[K]> }> {
  return {
    parse(value, path = "") {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return fail(path, `expected an object, got ${describe(value)}`);
      const input = value as Record<string, unknown>;
      const output: Record<string, unknown> = {};
      const issues: Issue[] = [];
      for (const key of Object.keys(shape)) {
        const result = shape[key].parse(input[key], path ? `${path}.${key}` : key);
        if (result.ok) output[key] = result.value;
        else issues.push(...result.issues);
      }
      return issues.length > 0 ? { ok: false, issues } : { ok: true, value: output as { [K in keyof Shape]: Infer<Shape[K]> } };
    },
  };
}

export function withDefault<T>(inner: Schema<T>, fallback: T): Schema<T> {
  return { parse: (value, path = "") => (value === undefined ? { ok: true, value: fallback } : inner.parse(value, path)) };
}
```

Two lines do the type-level work. `Infer<S>` uses `infer` to pull `T` out of `Schema<T>` ([conditional types](https://zudojs.oyinlola.site/learn/ts-conditional-types) go deeper). And `object`'s return type, `Schema<{ [K in keyof Shape]: Infer<Shape[K]> }>`, is a **mapped type**: for every key in the shape, the output has that key, with the type its schema produces. The one `as` inside `object` is justified: the loop has just checked every key of the shape. Now the order contract, written once:

order-schema.ts

```ts
import { array, integer, object, oneOf, string, withDefault, type Infer } from "./mini-schema.js";

export const NewOrderSchema = object({
  customerEmail: string({ max: 254, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/ }),
  items: array(object({ sku: string({ pattern: /^[A-Z]+-\d+$/ }), quantity: integer({ min: 1, max: 50 }) }), { min: 1, max: 100 }),
  priority: withDefault(oneOf(["normal", "express"]), "normal"),
});

export type NewOrder = Infer<typeof NewOrderSchema>;
```

order-demo.ts

```ts
import { NewOrderSchema } from "./order-schema.js";

const good = NewOrderSchema.parse({ customerEmail: " ada@example.com ", items: [{ sku: "RICE-5", quantity: 2 }], role: "admin" });
if (good.ok) console.log(good.value);

const bad = NewOrderSchema.parse({ customerEmail: "ada@", items: [{ sku: "rice", quantity: 0 }, { sku: "EGG-30" }], priority: "urgent" });
if (!bad.ok) console.log(bad.issues);
```

Output of `npx tsx order-demo.ts` and of the browser terminal

```json
{
  customerEmail: 'ada@example.com',
  items: [ { sku: 'RICE-5', quantity: 2 } ],
  priority: 'normal'
}
[
  {
    path: 'customerEmail',
    message: 'must match /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/'
  },
  { path: 'items[0].sku', message: 'must match /^[A-Z]+-\\d+$/' },
  { path: 'items[0].quantity', message: 'must be at least 1' },
  {
    path: 'items[1].quantity',
    message: 'expected a whole number, got undefined'
  },
  { path: 'priority', message: 'must be one of normal, express' }
]
```

Everything the hand-written validator struggled with comes for free. All five problems are reported at once, each with a path, including the missing quantity of the second item. The e-mail was trimmed, the default priority filled in, and `role: "admin"` was dropped, because `object` builds its output from the shape's keys only. And `NewOrder` was never written by hand. To prove the compiler really computed it, assign something wrong:

order-type.ts

```ts
import type { NewOrder } from "./order-schema.js";

const order: NewOrder = { customerEmail: "ada@example.com", items: [{ sku: "RICE-5", quantity: "2" }], priority: "urgent" };
```

What `npx tsc --noEmit` prints

```ts
order-type.ts:3:86 - error TS2322: Type 'string' is not assignable to type 'number'.

3 const order: NewOrder = { customerEmail: "ada@example.com", items: [{ sku: "RICE-5", quantity: "2" }], priority: "urgent" };
                                                                                       ~~~~~~~~

  order-schema.ts:5:67 - The expected type comes from property 'quantity' which is declared here on type '{ sku: string; quantity: number; }'
    5   items: array(object({ sku: string({ pattern: /^[A-Z]+-\d+$/ }), quantity: integer({ min: 1, max: 50 }) }), { min: 1, max: 100 }),
                                                                        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

order-type.ts:3:104 - error TS2322: Type '"urgent"' is not assignable to type '"express" | "normal"'.

3 const order: NewOrder = { customerEmail: "ada@example.com", items: [{ sku: "RICE-5", quantity: "2" }], priority: "urgent" };
                                                                                                         ~~~~~~~~

  order-schema.ts:6:3 - The expected type comes from property 'priority' which is declared here on type '{ customerEmail: string; items: { sku: string; quantity: number; }[]; priority: "express" | "normal"; }'
    6   priority: withDefault(oneOf(["normal", "express"]), "normal"),
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


Found 2 errors in the same file, starting at: order-type.ts:3
```

The type knows that `quantity` is a number and `priority` is `"normal" | "express"`, because the schema says so. Change the schema and the type changes with it; there is nothing left to drift. This technique, a runtime value whose TypeScript type describes what it produces, is called **schema type inference**, and every library below is built on it. The handler now looks like this:

handler.ts

```ts
import { NewOrderSchema, type NewOrder } from "./order-schema.js";

function placeOrder(order: NewOrder) {
  const units = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return { id: 2208, status: "pending", units, ...order };
}

function handleNewOrder(rawBody: string) {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "body is not valid JSON" } };
  }
  const result = NewOrderSchema.parse(body);
  if (!result.ok) return { status: 422, body: { error: "invalid order", issues: result.issues } };
  return { status: 201, body: placeOrder(result.value) };
}

console.log(JSON.stringify(handleNewOrder('{"customerEmail": "ada@example.com", "items": [{"sku": "RICE-5", "quantity": 2}], "status": "paid"}')));
console.log(JSON.stringify(handleNewOrder('{"customerEmail": "ada@example.com", "items": []}')));
```

Output of `npx tsx handler.ts` and of the browser terminal

```json
{"status":201,"body":{"id":2208,"status":"pending","units":2,"customerEmail":"ada@example.com","items":[{"sku":"RICE-5","quantity":2}],"priority":"normal"}}
{"status":422,"body":{"error":"invalid order","issues":[{"path":"items","message":"must have at least 1 item(s)"}]}}
```

The client's `"status": "paid"` never reached `placeOrder`: spreading `...order` is safe here because `order` is the validated copy, not the raw body. This is the idea sometimes summarised as **"parse, don't validate"**: instead of checking a value and then carrying on with the original, turn it into a new, typed value, and use only that.

A real library adds much more: optional keys, unions, transforms, custom messages, e-mail and URL formats, async checks, performance work. Let us look at three.

## Zod

**Zod** is the most widely used TypeScript validation library. Its API is a chain of methods on schema objects, much like the one you just built. The same order contract in Zod 4:

order-zod.tsNode.js only

```ts
import * as z from "zod";

const NewOrder = z.object({
  customerEmail: z.email(),
  items: z
    .array(z.object({ sku: z.string().regex(/^[A-Z]+-\d+$/), quantity: z.number().int().min(1).max(50) }))
    .min(1)
    .max(100),
  deliveryNote: z.string().trim().max(200).optional(),
  priority: z.enum(["normal", "express"]).default("normal"),
});

type NewOrder = z.infer<typeof NewOrder>;

const ok = NewOrder.safeParse({ customerEmail: "ada@example.com", items: [{ sku: "RICE-5", quantity: 2 }], role: "admin" });
if (ok.success) {
  const order: NewOrder = ok.data;
  console.log(order);
}

const bad = NewOrder.safeParse({ customerEmail: "ada@", items: [{ sku: "rice", quantity: 0 }], priority: "urgent" });
if (!bad.success) {
  for (const issue of bad.error.issues) console.log(`${issue.path.join(".")}: ${issue.message}`);
}
```

Output of `npx tsx order-zod.ts`

```json
{
  customerEmail: 'ada@example.com',
  items: [ { sku: 'RICE-5', quantity: 2 } ],
  priority: 'normal'
}
customerEmail: Invalid email address
items.0.sku: Invalid string: must match pattern /^[A-Z]+-\d+$/
items.0.quantity: Too small: expected number to be >=1
priority: Invalid option: expected one of "normal"|"express"
```

- `z.infer<typeof NewOrder>` is the `Infer` you wrote: the type comes from the schema.
- `safeParse` returns `{ success: true, data }` or `{ success: false, error }`, a discriminated union, so TypeScript knows `data` exists only after checking `success`. `parse` returns the data or throws a `ZodError`.
- Each issue has a `code`, a `path` (an array such as `["items", 0, "quantity"]`) and a `message`.
- Unknown keys like `role` are stripped by default. `z.strictObject({...})` rejects them with an `unrecognized_keys` issue instead, which is better when a typo in a field name should be reported, not silently ignored.

Zod has helpers for turning issues into responses: `z.flattenError(error)` groups messages by top-level field (good for forms), and `z.prettifyError(error)` makes a readable text block (good for logs and CLIs):

zod-errors.tsNode.js only

```ts
import * as z from "zod";

const Signup = z.object({
  email: z.email(),
  name: z.string().trim().min(2),
  age: z.number().int().min(18),
});

const result = Signup.safeParse({ email: "bola", name: " B ", age: 16.5 });
if (!result.success) {
  console.log(z.flattenError(result.error).fieldErrors);
  console.log(z.prettifyError(result.error));
}
```

Output of `npx tsx zod-errors.ts`

```json
{
  email: [ 'Invalid email address' ],
  name: [ 'Too small: expected string to have >=2 characters' ],
  age: [ 'Invalid input: expected int, received number' ]
}
✖ Invalid email address
  → at email
✖ Too small: expected string to have >=2 characters
  → at name
✖ Invalid input: expected int, received number
  → at age
```

### Coercion, transforms and refinements

Query strings, form fields and environment variables are always text. `z.coerce.number()` converts before checking. Converting is where the traps are, so look at what it does with edge cases:

zod-coerce.tsNode.js only

```ts
import * as z from "zod";

const ProductQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  inStock: z.stringbool().optional(),
});
console.log(ProductQuery.parse({ page: "3", inStock: "false" }));
console.log(ProductQuery.parse({}));

console.log(z.coerce.number().parse(""), z.coerce.boolean().parse("false"));
```

Output of `npx tsx zod-coerce.ts`

```json
{ page: 3, inStock: false }
{ page: 1 }
0 true
```

The last line is a warning. `z.coerce.number()` calls `Number(value)`, and `Number("")` is 0; `z.coerce.boolean()` calls `Boolean(value)`, and any non-empty string, including `"false"`, is `true`. For booleans from text, use `z.stringbool()`, which only accepts words like `"true"`/`"false"`/`"yes"`/`"no"`. For numbers, decide whether an empty field means "missing" and handle it before coercing.

`.transform` converts a checked value into another type (the output type changes with it), and `.refine` adds a rule of your own, including rules across several fields:

zod-refine.tsNode.js only

```ts
import * as z from "zod";

const NairaToKobo = z
  .string()
  .regex(/^₦?\d{1,3}(,\d{3})*(\.\d{2})?$/, "must look like ₦8,500.00")
  .transform((text) => {
    const [naira, kobo = "00"] = text.replace("₦", "").replaceAll(",", "").split(".");
    return Number(naira) * 100 + Number(kobo);
  });

const Booking = z
  .object({ room: z.string(), checkIn: z.iso.date(), checkOut: z.iso.date(), deposit: NairaToKobo })
  .refine((b) => b.checkOut > b.checkIn, { message: "checkOut must be after checkIn", path: ["checkOut"] });

type BookingInput = z.input<typeof Booking>;
type Booking = z.output<typeof Booking>;

const input: BookingInput = { room: "Ocean 4", checkIn: "2026-10-02", checkOut: "2026-10-05", deposit: "₦25,000.00" };
const booking: Booking = Booking.parse(input);
console.log(booking);

const wrong = Booking.safeParse({ ...input, checkOut: "2026-10-01", deposit: "25.000,00" });
if (!wrong.success) console.log(wrong.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
```

Output of `npx tsx zod-refine.ts`

```json
{
  room: 'Ocean 4',
  checkIn: '2026-10-02',
  checkOut: '2026-10-05',
  deposit: 2500000
}
[
  'deposit: must look like ₦8,500.00',
  'checkOut: checkOut must be after checkIn'
]
```

With a transform, the input type and the output type differ: `deposit` is a string going in and a number of kobo coming out. `z.input` and `z.output` name the two (`z.infer` is the output). Notice also that the refinement ran on the second input even though `deposit` had failed: a failed format check such as a regex does not stop parsing, so you get both issues at once. A field with the wrong *type* (a number for `room`) does stop it, and then the refinement is skipped, because it could not safely read the fields.

## Valibot

**Valibot** solves the same problem with a different design: instead of methods on schema objects, every check is a separate function, and you combine them with `pipe`. Here is the same contract in Valibot 1:

order-valibot.tsNode.js only

```ts
import * as v from "valibot";

const NewOrder = v.object({
  customerEmail: v.pipe(v.string(), v.email()),
  items: v.pipe(
    v.array(
      v.object({
        sku: v.pipe(v.string(), v.regex(/^[A-Z]+-\d+$/)),
        quantity: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)),
      }),
    ),
    v.minLength(1),
    v.maxLength(100),
  ),
  deliveryNote: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
  priority: v.optional(v.picklist(["normal", "express"]), "normal"),
});

type NewOrder = v.InferOutput<typeof NewOrder>;

const ok = v.safeParse(NewOrder, { customerEmail: "ada@example.com", items: [{ sku: "RICE-5", quantity: 2 }], role: "admin" });
if (ok.success) {
  const order: NewOrder = ok.output;
  console.log(order);
}

const bad = v.safeParse(NewOrder, { customerEmail: "ada@", items: [{ sku: "rice", quantity: 0 }], priority: "urgent" });
if (!bad.success) console.log(v.summarize(bad.issues));
```

Output of `npx tsx order-valibot.ts`

```json
{
  customerEmail: 'ada@example.com',
  items: [ { sku: 'RICE-5', quantity: 2 } ],
  priority: 'normal'
}
× Invalid email: Received "ada@"
  → at customerEmail
× Invalid format: Expected /^[A-Z]+-\d+$/ but received "rice"
  → at items.0.sku
× Invalid value: Expected >=1 but received 0
  → at items.0.quantity
× Invalid type: Expected ("normal" | "express") but received "urgent"
  → at priority
```

The same ideas under other names: `v.InferOutput` (and `v.InferInput`) instead of `z.infer`, `v.safeParse(schema, value)` returning `{ success, output, issues }`, `v.picklist` for a fixed set of strings, `v.optional(schema, default)` for defaults, `v.strictObject` to reject unknown keys, `v.summarize` and `v.flatten` for messages. Unknown keys are stripped here too. Notice the messages say what was received (`Received "ada@"`): convenient in logs, but think before echoing user input back in an API response.

### Why the function style exists: bundle size

In a browser app, every kilobyte of JavaScript must be downloaded and parsed on the user's phone. A bundler removes code nobody uses, a step called **tree shaking**, but it can only remove whole functions or modules, not unused methods on a class. Zod's methods live on its schema classes, so using `z.string()` brings in most of the string checks. Valibot's checks are separate functions, so a form that uses five of them ships only those five. For a backend this barely matters; for a signup form on a slow mobile connection it can. (Zod also offers a function-style build, `zod/mini`, for the same reason.)

## JSON Schema

Zod and Valibot schemas are TypeScript code. **JSON Schema** is a different kind of thing: a standard for writing a schema as a *JSON document*. Because it is just data, any language can read it. A Python service, a Go client, an API gateway and a documentation site can all use the same file, and OpenAPI ([OpenAPI documents](https://zudojs.oyinlola.site/learn/zudo-openapi)) describes request and response bodies with it. The order contract as JSON Schema:

new-order.schema.json

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://shop.example/schemas/new-order.json",
  "type": "object",
  "properties": {
    "customerEmail": { "type": "string", "format": "email" },
    "items": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "properties": {
          "sku": { "type": "string", "pattern": "^[A-Z]+-\\d+$" },
          "quantity": { "type": "integer", "minimum": 1 }
        },
        "required": ["sku", "quantity"],
        "additionalProperties": false
      }
    },
    "priority": { "enum": ["normal", "express"], "default": "normal" }
  },
  "required": ["customerEmail", "items"],
  "additionalProperties": false
}
```

A JSON Schema does nothing by itself; a **validator** reads it and checks values against it. The standard one for JavaScript is **Ajv**, which compiles a schema into a fast JavaScript function. It is not part of this course's browser terminal, so this example runs in Node.js only. In your own project, install it with `npm install ajv ajv-formats` (e-mail and other formats live in the second package):

validate-order.jsNode.js only

```ts
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schema = JSON.parse(readFileSync("./new-order.schema.json", "utf8"));
const ajv = new Ajv2020({ allErrors: true, useDefaults: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const good = { customerEmail: "ada@example.com", items: [{ sku: "RICE-5", quantity: 2 }] };
console.log(validate(good), good);

const bad = { customerEmail: "ada@", items: [{ sku: "rice", quantity: 0 }], priority: "urgent", role: "admin" };
console.log(validate(bad));
for (const error of validate.errors) {
  console.log(`${error.instancePath || "(root)"} ${error.message}`);
}
```

Output of `node validate-order.js`

```ts
true {
  customerEmail: 'ada@example.com',
  items: [ { sku: 'RICE-5', quantity: 2 } ],
  priority: 'normal'
}
false
(root) must NOT have additional properties
/customerEmail must match format "email"
/items/0/sku must match pattern "^[A-Z]+-\d+$"
/items/0/quantity must be >= 1
/priority must be equal to one of the allowed values
```

Three differences from the TypeScript libraries show up at once:

- **No type inference.** `validate(good)` returns a boolean; nothing turns the JSON document into a TypeScript type. You write the type separately (and it can drift), use a type guard (`ajv.compile<NewOrder>(schema)` gives you `value is NewOrder`), or generate types with a tool such as `json-schema-to-ts` or TypeBox.
- **It changes the input in place.** `useDefaults` wrote `priority: 'normal'` into `good` itself. Zod and Valibot return a new object.
- **Unknown keys are an error** here (`additionalProperties: false`) rather than silently removed; Ajv can also remove them with `removeAdditional`.

### Generating JSON Schema from Zod

You do not have to choose one or the other. Zod 4 can translate a schema into JSON Schema, so TypeScript code stays the single source of truth while other tools get the standard format:

to-json-schema.tsNode.js only

```ts
import * as z from "zod";

const OrderItem = z.object({
  sku: z.string().regex(/^[A-Z]+-\d+$/),
  quantity: z.number().int().min(1).max(50),
});

console.log(JSON.stringify(z.toJSONSchema(OrderItem), null, 2));
```

Output of `npx tsx to-json-schema.ts`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "sku": {
      "type": "string",
      "pattern": "^[A-Z]+-\\d+$"
    },
    "quantity": {
      "type": "integer",
      "minimum": 1,
      "maximum": 50
    }
  },
  "required": [
    "sku",
    "quantity"
  ],
  "additionalProperties": false
}
```

Read the translation critically: it says `"additionalProperties": false`, but the Zod schema *strips* unknown keys rather than rejecting them. A client that follows the JSON Schema is fine, but the two validators disagree about a request with extra fields. Translations are close, not identical; checks written in code, like `.refine` and `.transform`, cannot be expressed in JSON at all.

## Choosing a validator

|  | Hand-written | Zod | Valibot | JSON Schema + Ajv | `@zudojs/schema` |
| --- | --- | --- | --- | --- | --- |
| Type from the rules | No: written twice, can drift | Yes: `z.infer` | Yes: `v.InferOutput` | No (tools can generate it) | Yes: `Infer` |
| Style | Plain code | Method chains | Functions + `pipe` | JSON document | Method chains |
| Other languages can use it | No | Via `z.toJSONSchema` | Via an add-on package | Yes, it is the standard | No |
| Bundle size in a browser | Smallest | Larger (`zod/mini` is smaller) | Small, tree-shakes per check | Ajv is large; schemas can be precompiled | Part of ZudoJS |
| Transforms, custom rules | Anything | Yes | Yes | Limited to the standard's keywords | Yes |
| Fits best | One or two tiny shapes, no dependencies | Most TypeScript backends and apps | Browser forms where size matters | Contracts shared across languages, OpenAPI | ZudoJS applications |

ZudoJS has its own schema library, `@zudojs/schema`, built on the same idea: describe the data once, get the check and the type. It is what the framework's HTTP layer, configuration and OpenAPI generation use, so in a ZudoJS app you validate with it rather than adding a second library:

order-zudo.ts

```ts
import { schema, type Infer } from "@zudojs/schema";

const NewOrder = schema.object({
  customerEmail: schema.string().email(),
  items: schema.array(schema.object({ sku: schema.string().regex(/^[A-Z]+-\d+$/), quantity: schema.number().int().positive() })).min(1),
  priority: schema.default(schema.enum(["normal", "express"]), "normal"),
});
type NewOrder = Infer<typeof NewOrder>;

const result = NewOrder.safeParse({ customerEmail: "ada@", items: [{ sku: "rice", quantity: 0 }], priority: "urgent" });
if (!result.success) console.log(result.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));

const ok = NewOrder.safeParse({ customerEmail: "ada@example.com", items: [{ sku: "RICE-5", quantity: 2 }], role: "admin" });
if (ok.success) {
  const order: NewOrder = ok.data;
  console.log(order);
}
```

Output of `npx tsx order-zudo.ts` and of the browser terminal

```json
[
  'customerEmail: Invalid email format',
  'items.0.sku: String does not match pattern',
  'items.0.quantity: Expected positive number, received 0',
  'priority: Expected one of "normal", "express"'
]
{
  customerEmail: 'ada@example.com',
  items: [ { sku: 'RICE-5', quantity: 2 } ],
  priority: 'normal'
}
```

The shape of the API will look familiar by now. [Schemas and validation in depth](https://zudojs.oyinlola.site/learn/zudo-validation) uses it on every part of a request: route parameters, query strings with coercion, bodies, partial updates and responses.

## Validation in production

- **Validate once, at the boundary, and pass the typed result inward.** Services and repositories take `NewOrder`, never `unknown`, and never re-check.
- **Use the parsed output, never the raw input.** The output is the allow-listed copy. Spreading or saving the raw body brings mass assignment back.
- **Limit size before parsing.** A schema's `.max(100)` runs *after* `JSON.parse` has built the whole object in memory. Cap the request body size (1 MB is common) in the HTTP layer first, and put maximums on every string and array in the schema.
- **Be careful with coercion.** `Number("")` is 0 and `Boolean("false")` is `true`. Coerce only where the input really is text (query strings, form fields, environment variables), never in JSON bodies, where the client can send real numbers.
- **Validation is not authorisation.** A perfectly valid `{ "accountId": 7 }` may point at someone else's account. Check permissions after validating, with the typed value.
- **Return every issue, with paths, as a 422** (or 400), but do not echo large or sensitive input back; a message and a path are enough. Log the details on the server.
- **Validate data from other services and your own storage too** when it can change without your code changing: third-party APIs, message queues, JSON columns, files. A schema at those boundaries turns a mysterious crash deep in the code into a clear error at the edge.
- **Share schemas, not just types.** If the browser and the server both validate the same form, export the schema from one module and import it in both, so the rules cannot drift between them.

## Testing a validator

A validator is a function from `unknown` to a result, which makes it easy to test. Use a table of cases: every rule gets one input just inside the limit and one just outside, plus the shape errors (not an object, `null`, an array). Then, because the whole point is to survive *anything*, throw random data at it. **fast-check** generates thousands of random JSON values, and checks a property for each: the validator never throws, and everything it accepts really matches the type:

order-property.tsNode.js only

```ts
import fc from "fast-check";
import { NewOrderSchema } from "./order-schema.js";

let accepted = 0;
fc.assert(
  fc.property(fc.jsonValue(), (value) => {
    const result = NewOrderSchema.parse(value);
    if (!result.ok) return result.issues.length > 0;
    accepted++;
    return typeof result.value.customerEmail === "string" && result.value.items.length > 0;
  }),
  { numRuns: 2000, seed: 42 },
);
console.log(`2000 random JSON values: none crashed the validator, ${accepted} accepted`);

const almostValid = fc.record({
  customerEmail: fc.constantFrom("ada@example.com", "ada@", "", 42),
  items: fc.array(fc.record({ sku: fc.constantFrom("RICE-5", "rice", ""), quantity: fc.integer({ min: -2, max: 60 }) }), { maxLength: 3 }),
});
let valid = 0;
fc.assert(
  fc.property(almostValid, (value) => {
    const result = NewOrderSchema.parse(value);
    if (result.ok) {
      valid++;
      return result.value.items.every((item) => item.quantity >= 1 && item.quantity <= 50);
    }
    return true;
  }),
  { numRuns: 2000, seed: 42 },
);
console.log(`2000 near-miss orders: every accepted order has quantities from 1 to 50 (${valid} accepted)`);
```

Output of `npx tsx order-property.ts`

```ts
2000 random JSON values: none crashed the validator, 0 accepted
2000 near-miss orders: every accepted order has quantities from 1 to 50 (48 accepted)
```

Random JSON almost never looks like an order, so the first property mostly proves that nothing crashes the validator on garbage. The second generator builds **near misses**, values close to valid with bad fields mixed in, which is where the boundary bugs hide. If a property ever fails, fast-check shrinks the input to a minimal failing case, the same idea as the [shrinker in the debugging lesson](https://zudojs.oyinlola.site/learn/debug-method#isolate). [Testing strategies](https://zudojs.oyinlola.site/learn/testing-strategies) covers property-based testing properly.

## Practice

TRY IT YOURSELF

### Add a field without drift

Add an optional `couponCode` (uppercase letters and digits, 4 to 12 characters) to the mini library's `NewOrderSchema`. You need an `optional` combinator first. Show that `NewOrder` now includes `couponCode` with no other edit.

**Show a solution**

coupon.ts

```ts
import { object, string, integer, array, type Infer, type Schema } from "./mini-schema.js";

function optional<T>(inner: Schema<T>): Schema<T | undefined> {
  return { parse: (value, path = "") => (value === undefined ? { ok: true, value: undefined } : inner.parse(value, path)) };
}

const NewOrderSchema = object({
  customerEmail: string({ pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/ }),
  items: array(object({ sku: string({ pattern: /^[A-Z]+-\d+$/ }), quantity: integer({ min: 1 }) }), { min: 1 }),
  couponCode: optional(string({ min: 4, max: 12, pattern: /^[A-Z0-9]+$/ })),
});
type NewOrder = Infer<typeof NewOrderSchema>;

const order: NewOrder = { customerEmail: "ada@example.com", items: [{ sku: "RICE-5", quantity: 1 }], couponCode: undefined };
console.log(order.couponCode);
console.log(NewOrderSchema.parse({ customerEmail: "ada@example.com", items: [{ sku: "RICE-5", quantity: 1 }], couponCode: "WELCOME10" }));
console.log(NewOrderSchema.parse({ customerEmail: "ada@example.com", items: [{ sku: "RICE-5", quantity: 1 }], couponCode: "no" }));
```

Output of `npx tsx coupon.ts` and of the browser terminal

```ts
undefined
{
  ok: true,
  value: {
    customerEmail: 'ada@example.com',
    items: [ [Object] ],
    couponCode: 'WELCOME10'
  }
}
{
  ok: false,
  issues: [ { path: 'couponCode', message: 'must be at least 4 characters' } ]
}
```

The type gained `couponCode: string | undefined` automatically. (In this small library the key is still required in the *type*, with `undefined` allowed; real libraries make it an optional key, `couponCode?: string`, with a little more type-level work.)

TRY IT YOURSELF

### Query strings with Zod

Write a Zod schema for `GET /products?page=2&perPage=20&category=grains`: `page` defaults to 1 and `perPage` to 20, both whole numbers, `perPage` at most 100; `category` is optional, one of `grains`, `dairy`, `drinks`. Parse `Object.fromEntries(new URLSearchParams(query))` for three queries, including one with `perPage=500`.

**Show a solution**

product-query.tsNode.js only

```ts
import * as z from "zod";

const ProductQuery = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  category: z.enum(["grains", "dairy", "drinks"]).optional(),
});

for (const query of ["page=2&perPage=20&category=grains", "", "perPage=500&sort=price"]) {
  const result = ProductQuery.safeParse(Object.fromEntries(new URLSearchParams(query)));
  console.log(result.success ? result.data : result.error.issues.map((i) => i.message));
}
```

Output of `npx tsx product-query.ts`

```json
{ page: 2, perPage: 20, category: 'grains' }
{ page: 1, perPage: 20 }
[ 'Too big: expected number to be <=100', 'Unrecognized key: "sort"' ]
```

`z.coerce` is right here because query values are always text. `strictObject` reports the unknown `sort` parameter instead of silently ignoring it, so a client that misspells a filter finds out. Both problems in the last query are reported together.

TRY IT YOURSELF

### Same rules, three validators

A transfer request has `fromAccount` and `toAccount` (10-digit strings) and `amountKobo` (a whole number from 100 to 50,000,000), and the two accounts must differ. Write it in Valibot, using `v.forward` and `v.partialCheck` for the cross-field rule, and run it on a valid transfer and on a transfer to the same account.

**Show a solution**

transfer-valibot.tsNode.js only

```ts
import * as v from "valibot";

const AccountNumber = v.pipe(v.string(), v.regex(/^\d{10}$/, "must be 10 digits"));

const Transfer = v.pipe(
  v.object({
    fromAccount: AccountNumber,
    toAccount: AccountNumber,
    amountKobo: v.pipe(v.number(), v.integer(), v.minValue(100), v.maxValue(50_000_000)),
  }),
  v.forward(
    v.partialCheck([["fromAccount"], ["toAccount"]], (t) => t.fromAccount !== t.toAccount, "must differ from fromAccount"),
    ["toAccount"],
  ),
);

for (const input of [
  { fromAccount: "0123456789", toAccount: "9876543210", amountKobo: 500000 },
  { fromAccount: "0123456789", toAccount: "0123456789", amountKobo: 500000 },
]) {
  const result = v.safeParse(Transfer, input);
  console.log(result.success ? result.output : v.flatten(result.issues).nested);
}
```

Output of `npx tsx transfer-valibot.ts`

```json
{
  fromAccount: '0123456789',
  toAccount: '9876543210',
  amountKobo: 500000
}
{ toAccount: [ 'must differ from fromAccount' ] }
```

`partialCheck` runs as soon as the fields it names are valid, even if other fields have errors, and `forward` attaches the issue to `toAccount`, so a form can show it next to the right input. The type from `v.InferOutput<typeof Transfer>` is unaffected by the check.

## Summary

- `const body: User = JSON.parse(text)` is a claim, not a check. Types are erased; data from outside must be validated at runtime, at the boundary.
- TypeScript checks your code; a validator checks your data. The validator turns `unknown` into a typed value, and TypeScript takes it from there.
- Hand-written validators work but drift from their types. A schema written once can produce both the check and the type (`Infer`, `z.infer`, `v.InferOutput`).
- Parse, don't validate: use the returned, allow-listed copy, never the raw input, and report every issue with its path.
- Zod: method chains, the most common choice. Valibot: functions and `pipe`, smallest in the browser. JSON Schema with Ajv: a language-neutral document for shared contracts and OpenAPI, without type inference. `@zudojs/schema` in ZudoJS apps.
- Coerce only text inputs, and know that `Number("")` is 0 and `Boolean("false")` is true. Limit sizes before parsing. Validation is not authorisation.
- Test validators with a table of boundary cases and with random and near-miss inputs.

Next: [Typed error handling](https://zudojs.oyinlola.site/learn/ts-errors), where the failures that validation reports, and every other failure, get types of their own.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
