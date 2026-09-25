---
title: "Types are not security — ZudoJS Academy"
description: "See why a type cannot decide who may do what: a refund endpoint with runtime validation, server-side authorization, branded ids and unloggable secrets."
source: https://zudojs.oyinlola.site/learn/ts-security
---

LEVEL 10 · LESSON 6 OF 6

Cryptography and trust Core

# Types are not security

See why a type cannot decide who may do what: a refund endpoint with runtime validation, server-side authorization, branded ids and unloggable secrets.

- **55 min** to read and try
- **You need:** Runtime validation, Branded types, and Browser attacks and defences
- **You build:** A refund endpoint for a shop that validates every request with Zod, decides access from the server-side session, keeps its payment key in an unloggable Secret type, and proves each rule with tests

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what compile-time types, runtime validation and security controls each protect, and what each cannot
- Replace a type assertion on request data with a strict runtime schema that rejects wrong shapes and unknown fields
- Take identity from the server-side session and write an explicit, deny-by-default authorization check
- Use branded types so only validated and authorized values reach the code that acts on them
- Wrap secrets in a type that cannot be printed, logged or serialized by accident
- Test the rules with wrong-shaped input, hostile-looking bodies and a property-based test

## A refund approved by its own request

Your shop has a small admin API. Support staff use it to approve refunds: a customer's parcel arrived broken, support checks the photos, and approves ₦45,000 back to the customer's card. A new endpoint was written in a hurry, in TypeScript, and it compiles without a single error:

```ts
interface User { id: string; role: "customer" | "support" | "manager" }
interface RefundBody { user: User; orderId: string; amountKobo: number }

function handleRefund(request: { body: unknown }) {
  const body = request.body as RefundBody;
  if (body.user.role === "manager") {
    return approveRefund(body.orderId, body.amountKobo);
  }
  return { status: 403 };
}
```

Every line has a type. The editor autocompletes `body.user.role`. The compiler even checks that `"manager"` is one of the allowed roles. And the endpoint is badly broken, in three separate ways:

1. **`as RefundBody` checks nothing.** A type assertion is a promise you make to the compiler: "trust me, this value has this shape". The compiler believes you and removes the type when it produces JavaScript. At runtime `request.body` is whatever arrived over the network. `amountKobo` could be a string, a negative number or ten digits long.
2. **The role comes from the request body.** The client writes the body. A user's role is a fact your server knows (from its own session store or database), not something the caller gets to state. Here the *authorization decision*, "may this person approve refunds?", is made on data the caller controls. Any customer who can send a request can write any role they like.
3. **Nothing checks the order.** Does it exist? How much was paid? Has part of it been refunded already? Is the person approving the refund also the person who placed the order?

TypeScript could not warn about any of this, because none of it is a type error. This lesson is about the three different layers that people often mix up:

- **Types protect developers.** They catch mistakes in your own code while you write it: a misspelled field, a string passed where a number belongs, a missing case.
- **Runtime validation protects the application.** It checks that data from outside really has the shape and ranges your code assumes, before the code uses it.
- **Security controls protect the system.** Authentication, authorization, secret handling, rate limits and audit logs decide who may do what, and keep a record.

You already know the first two from [TypeScript and JavaScript together](https://zudojs.oyinlola.site/learn/ts-runtime), [Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation) and [Branded types](https://zudojs.oyinlola.site/learn/ts-branded-types). Here you combine all three into one endpoint, and learn where each one stops. You will not run the broken version: the rest of the lesson builds the correct one, step by step, and tests it.

## Three layers, three jobs

Start with what a type really is at runtime: nothing. TypeScript removes all types when it compiles to JavaScript (this is called **type erasure**). Here is a payment parsed from JSON and asserted to be a `Payment`. The assertion changes the compiler's opinion, not the value:

erased.tsNode.js only

```ts
interface Payment {
  orderId: string;
  amountKobo: number;
}

const payment = JSON.parse('{"orderId":"ORD-1042","amountKobo":"4500000"}') as Payment;

console.log(typeof payment.amountKobo);
console.log(payment.amountKobo + 500_000);
```

Output of `npx tsx erased.ts`

```ts
string
4500000500000
```

The compiler was sure `amountKobo` is a number, so it allowed `+`. At runtime it was a string, and `+` glued the digits together. No error, no warning: a wrong amount that looks like a right one. That is the typical failure when types are trusted at a boundary.

Types are still extremely useful, for *your own* code. Once a value is known to be correct, the compiler makes sure every function that uses it does so correctly. Here the arguments are swapped, and the compiler refuses to build:

swapped.ts

```ts
function refund(orderId: string, amountKobo: number): string {
  return `refund ${amountKobo} kobo on ${orderId}`;
}

console.log(refund(4_500_000, "ORD-1042"));
```

What `npx tsc --noEmit` prints

```ts
swapped.ts:5:20 - error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.

5 console.log(refund(4_500_000, "ORD-1042"));
                     ~~~~~~~~~


Found 1 error in swapped.ts:5
```

So each layer has its own job, its own moment, and its own blind spot:

| Layer | Runs | Protects against | Cannot see |
| --- | --- | --- | --- |
| Types (TypeScript) | At compile time, on your source code | Your own mistakes: wrong argument order, a missing field, a forgotten case | Anything that arrives at runtime: requests, files, database rows, environment variables |
| Runtime validation (Zod, Valibot, JSON Schema) | On every request, before your code uses the data | Wrong shapes, wrong types, out-of-range values, unexpected fields, oversized input | Whether a perfectly well-formed request is *allowed* |
| Security controls (authentication, authorization, secrets, limits, logs) | On every request, with the server's own knowledge | Wrong people doing things, leaked keys, abuse, actions nobody can trace | Bugs in the code they protect |

A well-formed request from the wrong person passes validation. A request from the right person with a string amount passes authorization. You need all three, in order: **authenticate** (who is calling?), **validate** (is the request well-formed?), **authorize** (may this caller do this to this object?), then act.

> CODE REVIEW
>
> Search the diff for `as` applied to anything that came from outside: `req.body as`, `JSON.parse(…) as`, `await res.json() as`, `row as`. Each one is a place where a check should be and is not.

REASON IT OUT

### Before you write the handler: what can you trust?

A refund request reaches your server. It has headers (including a session token) and a JSON body with an order id, an amount and a reason. Before looking at any code, decide:

- Which of these values did the *caller* write, and which does the *server* know on its own?
- Where should the caller's identity and role come from?
- The body is supposed to be an object. What else could it be? What if it has extra fields that the code does not expect, such as `role` or `approved`?
- The amount is well-formed and the caller is support staff. What else must be true before money moves?
- What should the caller learn when a check fails? What should the log record?

**Show the reasoning**

The caller wrote **everything** in the request: the headers, the token, the whole body. The only thing the server knows by itself is what it stored: the session behind the token, the user's role, the order and its payments. So the token is used only as a key to look up the server's own session record, and the role comes from that record. A role in the body is ignored, or better, rejected as an unknown field.

The body could be anything JSON allows: an array, a string, `null`, a number, an object with the wrong types, a very long string, extra keys. A strict schema accepts exactly one shape and rejects the rest, including unknown keys, so a field nobody planned for can never slip into later code.

A valid amount from support staff is still not enough. The order must exist; the amount must not exceed what was paid minus what was already refunded; the approver must not be the customer who placed the order (a rule called **separation of duties**); and support staff may have a limit. These rules use the server's data, not the request's.

The caller learns the status code and a short reason, never internal details. The log records who did what to which order, and the decision, but never the token, keys or card data.

## Runtime validation at the boundary

A **trust boundary** is any place where data enters your code from something you do not control: an HTTP request, a message queue, a file upload, a webhook, even your own database (a row written by an older version of the code may not match today's types). At every boundary the value's type is `unknown`, and a schema turns it into a typed value or a list of problems.

The refund service keeps its schemas in one file. Everything is **strict**: `z.strictObject` rejects keys it does not know, instead of silently dropping them. Every string and number has limits, so no field can be empty, negative or enormous:

schemas.ts

```ts
import * as z from "zod";

export const UserId = z.string().regex(/^usr_[a-z0-9]{3,20}$/).brand<"UserId">();
export type UserId = z.infer<typeof UserId>;

export const OrderId = z.string().regex(/^ORD-\d{4,10}$/, "must look like ORD-1042").brand<"OrderId">();
export type OrderId = z.infer<typeof OrderId>;

// Whole kobo, more than zero, at most ₦1,000,000.
export const Kobo = z.number().int().positive().max(100_000_000).brand<"Kobo">();
export type Kobo = z.infer<typeof Kobo>;

export const RefundRequest = z.strictObject({
  orderId: OrderId,
  amountKobo: Kobo,
  reason: z.string().trim().min(3).max(500),
});
export type RefundRequest = z.infer<typeof RefundRequest>;
```

Now test the schema the way you would test any security rule: with the one shape it must accept and every wrong shape you can think of. Each input below is something a client could send. Only the first is well-formed:

validate.tsNode.js only

```ts
import { RefundRequest } from "./schemas.js";

const bodies: Array<[string, unknown]> = [
  ["well-formed", { orderId: "ORD-1042", amountKobo: 4_500_000, reason: "Parcel arrived broken" }],
  ["amount as text", { orderId: "ORD-1042", amountKobo: "4500000", reason: "Parcel arrived broken" }],
  ["negative amount", { orderId: "ORD-1042", amountKobo: -500, reason: "Parcel arrived broken" }],
  ["fraction of a kobo", { orderId: "ORD-1042", amountKobo: 12.5, reason: "Parcel arrived broken" }],
  ["extra role field", { orderId: "ORD-1042", amountKobo: 4_500_000, reason: "Broken", role: "manager" }],
  ["missing reason", { orderId: "ORD-1042", amountKobo: 4_500_000 }],
  ["reason too long", { orderId: "ORD-1042", amountKobo: 4_500_000, reason: "x".repeat(501) }],
  ["array", [{ orderId: "ORD-1042" }]],
  ["null", null],
];

for (const [label, body] of bodies) {
  const result = RefundRequest.safeParse(body);
  const verdict = result.success
    ? "accepted"
    : result.error.issues.map((issue) => `${issue.path.join(".") || "(body)"} ${issue.code}`).join(", ");
  console.log(label.padEnd(20), verdict);
}
```

Output of `npx tsx validate.ts`

```ts
well-formed          accepted
amount as text       amountKobo invalid_type
negative amount      amountKobo too_small
fraction of a kobo   amountKobo invalid_type
extra role field     (body) unrecognized_keys
missing reason       reason invalid_type
reason too long      reason too_big
array                (body) invalid_type
null                 (body) invalid_type
```

Read the results as a checklist of what the endpoint will never see again:

- A text amount is refused (`invalid_type`), not quietly converted. Converting `"4500000"` would be harmless; converting `""` or `"1e9"` would not, so a strict boundary asks the client to send the right type.
- The `role` field is rejected with `unrecognized_keys`. With a plain `z.object` it would be stripped, which is also safe for this handler. Rejecting is better: a client that sends `role` is either confused or probing, and either way you want to know. It also protects against **mass assignment**, the bug where extra request fields are copied straight into a database row (`{ ...body }`) and set columns the client should never touch.
- Limits (`max(500)`, `max(100_000_000)`) bound how much work and storage a single request can cost. Pair them with a request body size limit, checked *before* `JSON.parse` runs (see [Request limits](https://zudojs.oyinlola.site/learn/zudo-security#limits)).

What the schema returns is a **new object** built from the checked fields, not the original. Code after the boundary never touches the raw body again, so nothing the client added can reach it. This habit is often summed up as **parse, don't validate**: do not just answer "is it OK?" and keep using the original, turn it into a value of a more precise type.

> CODE REVIEW
>
> Every handler parameter that comes from a request should be typed `unknown` until a schema has parsed it. Object schemas at a boundary should be strict, with a maximum on every string, number and array.

## Branded types: validated values only

The schemas above end in `.brand<"OrderId">()`. A **brand** (from [Branded types](https://zudojs.oyinlola.site/learn/ts-branded-types)) is an invisible tag that exists only in the type system. The only way to get an `OrderId` is to run the schema, so a function that takes an `OrderId` can rely on it having been validated. A plain string will not do, even a correct-looking one:

brand-check.ts

```ts
import { OrderId, type OrderId as OrderIdType } from "./schemas.js";

function loadOrder(id: OrderIdType): string {
  return `SELECT … WHERE id = ${JSON.stringify(id)}`;
}

const fromUrl = "ORD-1042";
loadOrder(fromUrl);
loadOrder(OrderId.parse(fromUrl));
```

What `npx tsc --noEmit` prints

```ts
brand-check.ts:8:11 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'string & $brand<"OrderId">'.
  Type 'string' is not assignable to type '$brand<"OrderId">'.

8 loadOrder(fromUrl);
            ~~~~~~~


Found 1 error in brand-check.ts:8
```

The second call compiles because `OrderId.parse` returns an `OrderId`. The compiler now enforces "validate before use" for you: a new developer who forgets to parse the id gets an error, not a bug. This is the one place where types really do help security: not by checking data, but by making it impossible to *skip* the check that does.

A brand is only as good as the places that create it. If someone writes `"ORD-1042" as OrderId`, the brand is a lie again. Keep the `as` casts that create brands inside the schema file, and treat any other one as a review finding.

> CODE REVIEW
>
> Functions that act on sensitive data (money, ids, permissions) should take branded types, not `string` and `number`. Any `as SomeBrand` outside the module that owns the brand is a finding.

## Authorization: decided by the server, denied by default

**Authentication** answers "who is calling?". **Authorization** answers "may this caller do this action to this object?". The broken handler failed at both: it read the identity from the body, and it had one rule (the role) where several were needed.

### Where identity comes from

After login (see [Authentication](https://zudojs.oyinlola.site/learn/sec-authentication)), the client holds a session token. The server keeps a record for each token: the user id and the roles, loaded from its own database. The handler looks the token up and gets an **actor**: the authenticated user the request acts for. Nothing in the body can change it.

### Authorization models

There are three common ways to express the rules. Real systems usually combine them:

| Model | The rule looks at | Example |
| --- | --- | --- |
| **RBAC** (role-based) | The actor's roles | Only support staff and managers approve refunds. |
| **ABAC** (attribute-based) | Attributes of the actor, the object and the request | Support staff may approve up to ₦50,000; the amount must not exceed what is left to refund. |
| **Ownership / relationships** | How the actor relates to the object | Nobody approves a refund on an order they placed themselves. |

Whatever the model, write the rules as one explicit function that returns a decision with a reason, and make **deny** the answer whenever no rule says "allow". A missing `if` then fails closed (refuses) instead of open (allows).

access.ts

```ts
import type { Kobo, OrderId, UserId } from "./schemas.js";

export type Role = "customer" | "support" | "manager";

export interface Actor {
  readonly userId: UserId;
  readonly role: Role;
}

export interface Order {
  readonly id: OrderId;
  readonly customerId: UserId;
  readonly paidKobo: number;
  readonly refundedKobo: number;
}

export type Decision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly status: 403 | 422; readonly reason: string };

const SUPPORT_LIMIT_KOBO = 5_000_000; // ₦50,000

export function decideRefund(actor: Actor, order: Order, amount: Kobo): Decision {
  if (actor.role !== "support" && actor.role !== "manager") {
    return { allowed: false, status: 403, reason: "only support staff and managers approve refunds" };
  }
  if (order.customerId === actor.userId) {
    return { allowed: false, status: 403, reason: "you cannot approve a refund on your own order" };
  }
  if (amount > order.paidKobo - order.refundedKobo) {
    return { allowed: false, status: 422, reason: "amount is more than what is left to refund" };
  }
  if (actor.role === "support" && amount > SUPPORT_LIMIT_KOBO) {
    return { allowed: false, status: 403, reason: "support staff approve up to ₦50,000" };
  }
  if (actor.role === "support" || actor.role === "manager") return { allowed: true };
  return { allowed: false, status: 403, reason: "no rule allows this" };
}
```

The last two lines look redundant: the first check already refused everyone else. They are there on purpose. If someone later adds a `"finance"` role to `Role` and edits the first check carelessly, the function still ends in "deny". Test every rule, including the default:

decide.tsNode.js only

```ts
import { decideRefund, type Actor, type Order } from "./access.js";
import { Kobo, OrderId, UserId } from "./schemas.js";

const order: Order = {
  id: OrderId.parse("ORD-1042"),
  customerId: UserId.parse("usr_chidi"),
  paidKobo: 9_000_000,
  refundedKobo: 2_000_000,
};
const actor = (id: string, role: Actor["role"]): Actor => ({ userId: UserId.parse(id), role });

const cases: Array<[string, Actor, number]> = [
  ["customer", actor("usr_bola", "customer"), 1_000_000],
  ["support, own order", actor("usr_chidi", "support"), 1_000_000],
  ["support, ₦45,000", actor("usr_ada", "support"), 4_500_000],
  ["support, ₦60,000", actor("usr_ada", "support"), 6_000_000],
  ["manager, ₦60,000", actor("usr_emeka", "manager"), 6_000_000],
  ["manager, ₦80,000", actor("usr_emeka", "manager"), 8_000_000],
];

for (const [label, who, amount] of cases) {
  const decision = decideRefund(who, order, Kobo.parse(amount));
  console.log(label.padEnd(20), decision.allowed ? "allowed" : `${decision.status} ${decision.reason}`);
}
```

Output of `npx tsx decide.ts`

```ts
customer             403 only support staff and managers approve refunds
support, own order   403 you cannot approve a refund on your own order
support, ₦45,000     allowed
support, ₦60,000     403 support staff approve up to ₦50,000
manager, ₦60,000     allowed
manager, ₦80,000     422 amount is more than what is left to refund
```

The order was paid ₦90,000 and ₦20,000 is already refunded, so ₦70,000 is left. The manager may approve ₦60,000 but not ₦80,000; the second is a business rule (`422`, "unprocessable"), not a permission problem (`403`, "forbidden"), and the status says so.

### Make "authorized" a type too

One risk remains: a later change that calls the payment code directly and forgets `decideRefund`. Use a brand again. The only function that can create an `ApprovedRefund` is the one that asks `decideRefund`; the function that moves money accepts nothing else:

approval.ts

```ts
import { decideRefund, type Actor, type Decision, type Order } from "./access.js";
import type { RefundRequest, UserId } from "./schemas.js";

declare const approved: unique symbol;

export type ApprovedRefund = RefundRequest & {
  readonly approvedBy: UserId;
  readonly [approved]: true;
};

export function approve(actor: Actor, order: Order, request: RefundRequest): ApprovedRefund | Exclude<Decision, { allowed: true }> {
  const decision = decideRefund(actor, order, request.amountKobo);
  if (!decision.allowed) return decision;
  return { ...request, approvedBy: actor.userId } as ApprovedRefund;
}
```

`declare const approved: unique symbol` creates a symbol type that exists only for the compiler, so no other file can write the `[approved]` key. Now a payment function that asks for an `ApprovedRefund` cannot receive a request that skipped the check:

skip-check.ts

```ts
import type { ApprovedRefund } from "./approval.js";
import { RefundRequest } from "./schemas.js";

function sendToGateway(refund: ApprovedRefund): void {
  console.log(`refunding ${refund.amountKobo} on ${refund.orderId}`);
}

const request = RefundRequest.parse({ orderId: "ORD-1042", amountKobo: 4_500_000, reason: "Parcel arrived broken" });
sendToGateway(request);
```

What `npx tsc --noEmit` prints

```ts
skip-check.ts:9:15 - error TS2345: Argument of type '{ orderId: string & $brand<"OrderId">; amountKobo: number & $brand<"Kobo">; reason: string; }' is not assignable to parameter of type 'ApprovedRefund'.
  Type '{ orderId: string & $brand<"OrderId">; amountKobo: number & $brand<"Kobo">; reason: string; }' is missing the following properties from type '{ readonly approvedBy: string & $brand<"UserId">; readonly [approved]: true; }': approvedBy, [approved]

9 sendToGateway(request);
                ~~~~~~~


Found 1 error in skip-check.ts:9
```

> CODE REVIEW
>
> For every new endpoint, ask: where does the actor come from (it must be the session, never the request), which function makes the authorization decision, and does that function end in "deny"? Look for role or user-id fields in request schemas: they are almost always a bug.

## Secrets that cannot be logged by accident

The refund service calls a payment gateway with an API key. That key is a **secret**: anyone who has it can move your money. The most common way secrets leak is not an attack; it is a log line. Someone logs the configuration object while debugging, an error message includes a URL with the key in it, or an exception tracker captures the local variables. Those logs are then copied to places with far weaker protection than your server.

A `string` type cannot help: to the compiler, a key is text like any other. So give secrets their own type, a class that holds the value in a private field and answers "[redacted]" to every way of printing it. The real value is only available through a method with a name you can search for:

secret.ts

```ts
import { inspect } from "node:util";

export class Secret<T = string> {
  readonly #value: T;

  constructor(value: T) {
    this.#value = value;
  }

  /** The only way to read the value. Call it at the point of use, never earlier. */
  reveal(): T {
    return this.#value;
  }

  toString(): string {
    return "[redacted]";
  }

  toJSON(): string {
    return "[redacted]";
  }

  [inspect.custom](): string {
    return "Secret([redacted])";
  }
}
```

- `#value` is a JavaScript **private field**: not a property, so `Object.keys`, spreading and `JSON.stringify` cannot see it.
- `toString` covers template strings and string concatenation; `toJSON` covers `JSON.stringify`, which structured loggers use.
- `inspect.custom` is the symbol Node.js's `console.log` and `util.inspect` call to print an object.

Now try every accidental way of printing a configuration that contains the key:

secret-leaks.tsNode.js only

```ts
import { Secret } from "./secret.js";

const config = {
  gatewayUrl: "https://payments.example/v1",
  gatewayKey: new Secret("sk_live_example_not_a_real_key_000000"),
};

console.log(config);
console.log(`key is ${config.gatewayKey}`);
console.log(JSON.stringify(config));
console.log("spread:", { ...config.gatewayKey });
console.log(new Error("gateway refused key " + config.gatewayKey).message);
console.log(Object.keys(config.gatewayKey).length);
console.log("usable where needed:", config.gatewayKey.reveal().startsWith("sk_live_"));
```

Output of `npx tsx secret-leaks.ts`

```json
{
  gatewayUrl: 'https://payments.example/v1',
  gatewayKey: Secret([redacted])
}
key is [redacted]
{"gatewayUrl":"https://payments.example/v1","gatewayKey":"[redacted]"}
spread: {}
gateway refused key [redacted]
0
usable where needed: true
```

Every accidental path prints `[redacted]`; only the deliberate `reveal()` gets the value. The type system adds a second guard. A function that needs the raw key (such as an HTTP client setting a header) takes a `string`, and a `Secret` is not a string, so it cannot be passed by mistake:

secret-type.ts

```ts
import { Secret } from "./secret.js";

function authorizationHeader(key: string): string {
  return `Bearer ${key}`;
}

const key = new Secret("sk_live_example_not_a_real_key_000000");
authorizationHeader(key);
authorizationHeader(key.reveal());
```

What `npx tsc --noEmit` prints

```ts
secret-type.ts:8:21 - error TS2345: Argument of type 'Secret<string>' is not assignable to parameter of type 'string'.

8 authorizationHeader(key);
                      ~~~


Found 1 error in secret-type.ts:8
```

### Loading secrets at startup

Secrets come from the environment or a secret store, never from source code ([Cryptography for developers](https://zudojs.oyinlola.site/learn/sec-crypto#secrets) covers where they live and how to rotate them). Validate them like any other input, at startup, and wrap them immediately. A missing or malformed key then stops the service before it takes a single request, and the error names the variable without printing its value:

env.ts

```ts
import * as z from "zod";
import { Secret } from "./secret.js";

const Env = z.object({
  GATEWAY_URL: z.url({ protocol: /^https$/ }),
  GATEWAY_KEY: z.string().min(32).transform((value) => new Secret(value)),
});

export type Env = z.infer<typeof Env>;

export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = Env.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`invalid configuration: ${problems.join("; ")}`);
  }
  return result.data;
}
```

env-check.tsNode.js only

```ts
import { loadEnv } from "./env.js";

const good = loadEnv({ GATEWAY_URL: "https://payments.example/v1", GATEWAY_KEY: "sk_live_" + "a".repeat(32) });
console.log(good);

try {
  loadEnv({ GATEWAY_URL: "http://payments.example/v1", GATEWAY_KEY: "sk_live_short" });
} catch (error) {
  console.log((error as Error).message);
  console.log("value in message:", (error as Error).message.includes("sk_live_short"));
}
```

Output of `npx tsx env-check.ts`

```json
{
  GATEWAY_URL: 'https://payments.example/v1',
  GATEWAY_KEY: Secret([redacted])
}
invalid configuration: GATEWAY_URL: Invalid URL; GATEWAY_KEY: Too small: expected string to have >=32 characters
value in message: false
```

In the real service you call `loadEnv(process.env)` once, at startup. Plain `http` is refused for the gateway, because the key would travel unencrypted.

> CODE REVIEW
>
> Secrets are typed `Secret` from the moment they are loaded, `reveal()` appears only where the value is sent, and no log, error message or response includes a configuration object built from raw strings.

## Build: the refund endpoint

Now put the layers together, in the order from the start of the lesson: authenticate, validate, load, authorize, act, record. The handler takes its dependencies as parameters (sessions, orders, the gateway, the audit log), which is what makes it easy to test. It is written against plain request and response objects so you can see every step; in a real application a framework such as [@zudojs/http](https://zudojs.oyinlola.site/learn/zudo-http) supplies them.

refunds.ts

```ts
import type { Actor, Order } from "./access.js";
import { approve, type ApprovedRefund } from "./approval.js";
import { RefundRequest, type OrderId } from "./schemas.js";

export interface HttpRequest {
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
}
export interface HttpResponse {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}
export interface RefundDeps {
  readonly sessions: ReadonlyMap<string, Actor>;
  readonly orders: ReadonlyMap<OrderId, Order>;
  readonly gateway: (refund: ApprovedRefund) => Promise<void>;
  readonly audit: (entry: Readonly<Record<string, unknown>>) => void;
}

export async function handleRefund(request: HttpRequest, deps: RefundDeps): Promise<HttpResponse> {
  const token = request.headers.authorization?.match(/^Bearer ([\w-]{1,200})$/)?.[1];
  const actor = token === undefined ? undefined : deps.sessions.get(token);
  if (actor === undefined) return { status: 401, body: { error: "log in first" } };

  const parsed = RefundRequest.safeParse(request.body);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".") || "(body)");
    return { status: 400, body: { error: "invalid refund request", fields } };
  }

  const order = deps.orders.get(parsed.data.orderId);
  if (order === undefined) return { status: 404, body: { error: "no such order" } };

  const result = approve(actor, order, parsed.data);
  const entry = { actor: actor.userId, order: order.id, amountKobo: parsed.data.amountKobo };
  if ("allowed" in result) {
    deps.audit({ ...entry, decision: "denied", reason: result.reason });
    return { status: result.status, body: { error: result.reason } };
  }

  await deps.gateway(result);
  deps.audit({ ...entry, decision: "approved" });
  return { status: 200, body: { refunded: result.amountKobo, orderId: result.orderId } };
}
```

A few details worth noticing:

- The token must match a strict pattern before it is used as a map key, so a malformed header is simply "not logged in".
- The `400` response names the fields that failed, not the values that were sent. Echoing input back is how responses turn into reflected XSS ([Browser attacks and defences](https://zudojs.oyinlola.site/learn/sec-web#xss)).
- A missing order returns `404` before authorization. For objects whose *existence* is sensitive (another customer's order, seen by a customer), return `404` for "not allowed" too, so the answer does not reveal what exists.
- Denials are recorded as well as approvals. A burst of denied refunds from one account is exactly what a security team wants to see.

Now the tests. They use fake sessions, orders and gateway, and include the hostile-looking requests: a customer whose body claims to be a manager, and a support agent approving their own order:

refund-tests.tsNode.js only

```ts
import type { Actor, Order } from "./access.js";
import type { ApprovedRefund } from "./approval.js";
import { handleRefund, type HttpRequest } from "./refunds.js";
import { OrderId, UserId } from "./schemas.js";

const sessions = new Map<string, Actor>([
  ["tok-bola", { userId: UserId.parse("usr_bola"), role: "customer" }],
  ["tok-ada", { userId: UserId.parse("usr_ada"), role: "support" }],
  ["tok-chidi", { userId: UserId.parse("usr_chidi"), role: "support" }],
]);
const order: Order = { id: OrderId.parse("ORD-1042"), customerId: UserId.parse("usr_chidi"), paidKobo: 9_000_000, refundedKobo: 0 };
const sent: ApprovedRefund[] = [];
const auditLog: string[] = [];
const deps = {
  sessions,
  orders: new Map([[order.id, order]]),
  gateway: async (refund: ApprovedRefund) => void sent.push(refund),
  audit: (entry: object) => void auditLog.push(JSON.stringify(entry)),
};

const refund = { orderId: "ORD-1042", amountKobo: 4_500_000, reason: "Parcel arrived broken" };
const as = (token: string | undefined, body: unknown): HttpRequest => ({
  headers: { authorization: token && `Bearer ${token}` },
  body,
});

const cases: Array<[string, HttpRequest, number]> = [
  ["no session", as(undefined, refund), 401],
  ["customer claims manager", as("tok-bola", { ...refund, role: "manager" }), 400],
  ["customer, clean body", as("tok-bola", refund), 403],
  ["amount as text", as("tok-ada", { ...refund, amountKobo: "4500000" }), 400],
  ["unknown order", as("tok-ada", { ...refund, orderId: "ORD-9999" }), 404],
  ["support, own order", as("tok-chidi", refund), 403],
  ["support, ₦45,000", as("tok-ada", refund), 200],
];

for (const [label, request, expected] of cases) {
  const response = await handleRefund(request, deps);
  const mark = response.status === expected ? "PASS" : "FAIL";
  console.log(mark, label.padEnd(24), response.status, JSON.stringify(response.body));
}
console.log("refunds sent to the gateway:", sent.length);
console.log(auditLog.at(-1));
```

Output of `npx tsx refund-tests.ts`

```ts
PASS no session               401 {"error":"log in first"}
PASS customer claims manager  400 {"error":"invalid refund request","fields":["(body)"]}
PASS customer, clean body     403 {"error":"only support staff and managers approve refunds"}
PASS amount as text           400 {"error":"invalid refund request","fields":["amountKobo"]}
PASS unknown order            404 {"error":"no such order"}
PASS support, own order       403 {"error":"you cannot approve a refund on your own order"}
PASS support, ₦45,000         200 {"refunded":4500000,"orderId":"ORD-1042"}
refunds sent to the gateway: 1
{"actor":"usr_ada","order":"ORD-1042","amountKobo":4500000,"decision":"approved"}
```

Every rule from the reasoning block is now a test that passes. The customer who wrote `role: "manager"` into the body got `400` from the schema before any authorization code ran; even with a non-strict schema, the role would have come from the session and the answer would have been `403`. Exactly one refund reached the gateway.

> CODE REVIEW
>
> Read a handler top to bottom and check the order: identity from the session, then the schema, then loading, then one authorization function, then the action. Each early return should have a test.

## Testing with inputs you did not think of

The table above tests the inputs *you* imagined. A **property-based test** states a rule that must hold for every input, then lets a library generate hundreds of random inputs to try to break it. The [fast-check](https://fast-check.dev/) library can generate any JSON value: nested objects, arrays, odd strings, huge numbers, keys like `__proto__`.

The property here: *whatever body a customer sends, the handler never throws, never answers 200, and never calls the gateway.*

refund-property.tsNode.js only

```ts
import fc from "fast-check";
import type { Actor } from "./access.js";
import { handleRefund } from "./refunds.js";
import { UserId } from "./schemas.js";

const customer: Actor = { userId: UserId.parse("usr_bola"), role: "customer" };
let gatewayCalls = 0;
const deps = {
  sessions: new Map([["tok-bola", customer]]),
  orders: new Map(),
  gateway: async () => void gatewayCalls++,
  audit: () => {},
};

const anyBody = fc.oneof(
  fc.jsonValue(),
  fc.record({ orderId: fc.string(), amountKobo: fc.anything(), reason: fc.string(), role: fc.constant("manager") }),
);

await fc.assert(
  fc.asyncProperty(anyBody, async (body) => {
    const response = await handleRefund({ headers: { authorization: "Bearer tok-bola" }, body }, deps);
    return response.status !== 200;
  }),
  { numRuns: 500, seed: 20260924 },
);
console.log("500 random bodies: none approved, gateway calls:", gatewayCalls);
```

Output of `npx tsx refund-property.ts`

```ts
500 random bodies: none approved, gateway calls: 0
```

If a run fails, fast-check prints the input that broke the rule, **shrunk** to the smallest version that still fails, and the seed to replay it. A fixed `seed` keeps the example repeatable; in a test suite you usually let it vary, so every run explores new inputs.

> CODE REVIEW
>
> Security rules ("never approves", "never throws", "never returns another user's data") are good candidates for property tests. Ask for one when a pull request changes validation or authorization.

## What validation does not do

A value that passes the schema is *well-formed*. It is not automatically *safe to use everywhere*. The refund `reason` can be any text of 3 to 500 characters, including characters that mean something in HTML, SQL or a shell. Safety depends on where the value goes next:

- Into a web page: encode for HTML when you output it ([Browser attacks and defences](https://zudojs.oyinlola.site/learn/sec-web#xss)).
- Into SQL, a program's arguments, a file path or an outbound URL: use parameters, argument arrays, confined paths and allow-lists ([Writing injection-safe code](https://zudojs.oyinlola.site/learn/sec-injection)).
- Into a regular expression engine or a deep merge: bound the length and ignore dangerous keys (also in [Writing injection-safe code](https://zudojs.oyinlola.site/learn/sec-injection)).

Some other gaps to keep in mind:

- **`any` leaks in quietly.** `JSON.parse`, `response.json()` and many libraries return `any`, which switches type checking off for everything it touches. Assign their results to `unknown` and parse. Keep `strict` on in [tsconfig](https://zudojs.oyinlola.site/learn/ts-tsconfig) (it makes `catch` variables `unknown` too), and let a linter flag `any` and unchecked casts.
- **Responses are a boundary too.** Returning a whole database row can leak fields such as password hashes or internal notes. Build responses from an explicit output type or schema ([Type-safe API layers](https://zudojs.oyinlola.site/learn/ts-api-layers) uses DTOs for this).
- **Check and use at the same time.** If you check the remaining refundable amount, then later write the refund, two approvals in parallel can both pass the check. The final guard belongs in the database: a transaction or a constraint ([Transactions](https://zudojs.oyinlola.site/learn/zudo-transactions)).
- **Your own dependencies can lie.** A type definition for a library describes what its authors intended. Validate data from other services exactly like data from users.

> CODE REVIEW
>
> For each validated field, ask where it goes next and whether that destination has its own defence. A schema is never the whole answer to "is this safe?".

## A code-review checklist

The checks from every section, in one place:

| Look for | Ask |
| --- | --- |
| `as` on outside data, `any` | Is there a schema instead? Is the value `unknown` until parsed? |
| Request schemas | Strict objects? A limit on every string, number and array? No `role`, `userId`, `isAdmin` or `price` fields the server should decide itself? |
| Identity | Does the actor come from the server-side session or a verified token, never the body or query? |
| Authorization | Is there one function that decides, with a reason, ending in deny? Does it check the object (ownership, amounts), not only the role? |
| Brands | Do sensitive functions take branded, validated types? Is every `as Brand` inside the module that owns it? |
| Secrets | Typed as `Secret` from load time? Validated at startup? Never logged, returned or put in error messages? |
| Responses and logs | Built from explicit fields? No echo of raw input, no tokens, no internal errors? |
| Tests | One per early return, hostile-looking bodies included, and a property test for the rules that must always hold? |

## In production

- **Use shared, tested building blocks.** In a ZudoJS application, [@zudojs/schema](https://zudojs.oyinlola.site/learn/zudo-validation) validates at the route, [@zudojs/permissions](https://zudojs.oyinlola.site/learn/zudo-permissions) expresses RBAC and ABAC rules with deny by default and an explain mode, and [@zudojs/constants](https://zudojs.oyinlola.site/learn/zudo-types-constants) provides branded ids. The hand-written versions here show what those packages do for you.
- **Authorize in the service layer, not only in routes.** The same action is often reachable from an HTTP route, a queue consumer and an admin script. If the check lives in one route, the other two skip it.
- **Log decisions, not data.** Record actor, action, object, decision and reason. Leave out tokens, keys, card numbers and full request bodies. Redaction in the logger (see [Logging](https://zudojs.oyinlola.site/learn/zudo-logging)) is a safety net for the day someone logs the wrong object anyway.
- **Keep secrets out of reach.** Load them from a secret store, give each service only the secrets it needs, and rotate them. A `Secret` type prevents accidents in your code; it does nothing against someone who can read the process's memory or environment.
- **Fail closed.** If the session store, the permission service or the configuration is unavailable, refuse the request. An authorization check that returns "allow" on error is a check an attacker can switch off by overloading it.

## Practice

TRY IT YOURSELF

### Add a finance role

The finance team may approve refunds of any size, but only after the order is at least 7 days old (fraud checks take a week). Add `"finance"` to `Role`, add `paidAt` (a `Date`) to `Order`, and pass `now` to `decideRefund`. Which existing line would have kept the system safe if you had added the role to the type but forgotten the rule?

**Show a solution**

The new rule, written as its own check before the final "allow":

```ts
if (actor.role === "finance") {
  const ageMs = now.getTime() - order.paidAt.getTime();
  if (ageMs < 7 * 24 * 60 * 60 * 1000) {
    return { allowed: false, status: 403, reason: "finance approves refunds after 7 days" };
  }
  return { allowed: true };
}
```

The first check must also let `"finance"` through, or the new rule is never reached. If you had only added `"finance"` to the `Role` type, the first check (`role !== "support" && role !== "manager"`) would have refused finance users, and the final line would have denied them anyway: the system fails closed. The opposite style, `if (role === "customer") deny; else allow`, would have silently allowed every new role. Add tests for a 6-day-old and an 8-day-old order.

TRY IT YOURSELF

### A schema for changing a user's email

Write a strict Zod schema for `PATCH /me/email`, whose body has `email` and `currentPassword`. The email must be valid and at most 254 characters, stored in lower case. The password must be 8 to 200 characters. Show that a body with an extra `userId` field and a body with a 300-character email are both refused, and that the error does not contain the password.

**Show a solution**

change-email.tsNode.js only

```ts
import * as z from "zod";

const ChangeEmail = z.strictObject({
  email: z.string().max(254).pipe(z.email()).transform((email) => email.toLowerCase()),
  currentPassword: z.string().min(8).max(200),
});

console.log(ChangeEmail.parse({ email: "Ada@Example.com", currentPassword: "correct horse battery" }));

for (const body of [
  { email: "ada@example.com", currentPassword: "correct horse battery", userId: "usr_emeka" },
  { email: "a".repeat(290) + "@example.com", currentPassword: "correct horse battery" },
]) {
  const result = ChangeEmail.safeParse(body);
  if (!result.success) {
    const text = JSON.stringify(result.error.issues);
    console.log(result.error.issues.map((issue) => issue.code), "password in error:", text.includes("correct horse"));
  }
}
```

Output of `npx tsx change-email.ts`

```json
{ email: 'ada@example.com', currentPassword: 'correct horse battery' }
[ 'unrecognized_keys' ] password in error: false
[ 'too_big' ] password in error: false
```

The user whose email changes is the actor from the session, so the body has no `userId`; the strict schema turns an attempt to name another user into a `400`. Checking `max(254)` before the email format keeps the format check from running on huge strings. And the handler must still verify `currentPassword` against the stored hash: validation says it is a sensible string, not that it is correct.

TRY IT YOURSELF

### Redact nested secrets in a log line

A colleague's logger calls `JSON.stringify` on whatever it is given. Show that an object containing a `Secret` two levels deep, inside an array, is still logged as `[redacted]`, and explain why no special code in the logger was needed.

**Show a solution**

nested-secret.tsNode.js only

```ts
import { Secret } from "./secret.js";

const event = {
  service: "refunds",
  gateways: [{ name: "primary", key: new Secret("sk_live_example_not_a_real_key_000000") }],
};
console.log(JSON.stringify(event));
```

Output of `npx tsx nested-secret.ts`

```json
{"service":"refunds","gateways":[{"name":"primary","key":"[redacted]"}]}
```

`JSON.stringify` calls `toJSON()` on every object it meets, at any depth, and uses the result in place of the object. The secret redacts itself wherever it ends up; the logger does not need to know about it. That is the advantage of putting the protection on the value rather than in every place that might print it.

## Summary

- Types protect developers at compile time and disappear at runtime. A type assertion on outside data (`body as User`) checks nothing.
- Runtime validation protects the application: at every trust boundary, parse `unknown` data with a strict schema that has limits, and use only the parsed result.
- Security controls protect the system. Identity comes from the server's session, never the request. Authorization is one explicit function that checks the actor, the object and the amount, and ends in deny.
- Branded types turn "validate first" and "authorize first" into compiler errors, as long as brands are only created by the code that checks.
- A `Secret` type with a private field, `toString`, `toJSON` and `inspect.custom` keeps keys out of logs and error messages; load and validate secrets at startup.
- Well-formed is not the same as safe: each destination (HTML, SQL, shell, file system, URLs) still needs its own defence.

This is the last lesson of the security course. Next, the course on software design starts with [Design principles](https://zudojs.oyinlola.site/learn/design-principles), where separating concerns, like the layers in this lesson, becomes the main tool.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
