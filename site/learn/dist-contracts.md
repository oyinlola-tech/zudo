---
title: "Contracts between services — ZudoJS Academy"
description: "Version service contracts so independent deploys stay compatible: evolve schemas safely and catch breaks with consumer-driven contract tests."
source: https://zudojs.oyinlola.site/learn/dist-contracts
---

LEVEL 16 · LESSON 2 OF 4

Distributed systems Advanced

# Contracts between services

Version service contracts so independent deploys stay compatible: evolve schemas safely and catch breaks with consumer-driven contract tests.

- **55 min** to read and try
- **You need:** Distributed systems fundamentals, API contracts, Serialization and Calling services with RPC
- **You build:** A shared contracts module for ShopFlow, a versioned message envelope with upcasting and parking, and consumer-driven contract tests between an orders service and its consumers

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain why two versions of a service always run side by side, and what that means for every schema
- Tell backward from forward compatibility and choose a deploy order that keeps both
- Wrap messages in a versioned envelope with @zudojs/serialization, upcast old versions and park newer ones
- Write tolerant readers that survive new fields, new enum values and new types
- Write consumer-driven contract tests and verify them against the real provider in its own test suite

## The deploy that charged ₦NaN

ShopFlow's orders team ships a small improvement at 14:02. Orders can now be paid in Ghanaian cedi as well as naira, so the `order.placed` event no longer carries a bare `totalKobo` number. It carries a `total` object with an amount in **minor units** (kobo for naira, pesewas for cedi) and a currency. The orders team's tests pass. Their service works.

The payments service, owned by another team, listens for `order.placed` and charges the customer. Nobody changed it. Here are both services in one file, talking through an event bus, before and after the deploy:

the-bug.js

```ts
import { createEventBus } from "@zudojs/events";

const bus = createEventBus();
const naira = (kobo) => `₦${(kobo / 100).toFixed(2)}`;

// payments service, unchanged for months
bus.on("order.placed", (event) => {
  console.log(`payments: charging ${naira(event.payload.totalKobo)} for ${event.payload.orderId}`);
});

// orders service, 14:01 (version 1)
await bus.publishEvent({ type: "order.placed", payload: { orderId: "ord_1", customerId: "cus_ada", totalKobo: 250000 } });

// orders service, 14:02 (version 2)
await bus.publishEvent({
  type: "order.placed",
  payload: { orderId: "ord_2", customerId: "cus_kofi", total: { amountMinor: 480000, currency: "NGN" } },
});
```

Output of `node the-bug.js` and of the browser terminal

```ts
payments: charging ₦2500.00 for ord_1
payments: charging ₦NaN for ord_2
```

Nothing crashed. `event.payload.totalKobo` was `undefined`, `undefined / 100` is `NaN`, and a real payment provider would have rejected the charge, or worse, a lenient one would have accepted a zero. Every order placed after 14:02 is stuck unpaid until someone notices.

Inside one program, the compiler would have caught this: rename a property and every reader turns red. Between two services there is no compiler. There are two codebases, two deploy pipelines, and a message on a wire in between. What holds them together is a **contract**: an agreement about the shape and meaning of the data one side sends and the other side reads. This lesson is about writing contracts down, changing them without breaking anyone, and testing them so the ₦NaN is found in CI, not in production.

[API contracts](https://zudojs.oyinlola.site/learn/api-contracts) taught OpenAPI, JSON Schema validation, a breaking-change checker and a first look at event upcasting, for one API. Here you work across services: several teams, several versions running at once, and messages that outlive the code that wrote them.

## Three kinds of contract, and who owns each

Services exchange three kinds of data, and each kind has a different owner. The **owner** is the team that decides the schema; everyone else adapts.

| Kind | Example | Who writes it | Who reads it | Who owns the schema |
| --- | --- | --- | --- | --- |
| API (request and response) | `orders.get` over RPC, `GET /orders/:id` | Caller writes the request, provider writes the response | The other side | The provider. It publishes the API; callers adapt to it. |
| Event: "this happened" | `order.placed`, `payment.captured` | One producer | Any number of subscribers, some unknown to the producer | The producer. An event describes the producer's own facts. |
| Message or command: "please do this" | `payments.charge`, `email.send` on a queue | Many senders | One handler | The handler. It says what it accepts, like an API. |

Two properties make events the hardest of the three:

- **Unknown readers.** An API provider sees its callers in its logs. An event producer does not know who subscribed last month.
- **Long life.** An HTTP response lives for milliseconds. An event sits in a queue during an outage, in a dead-letter list for days, and in an event store for years. A reader must handle every version that can still exist anywhere.

### The shared contracts module

The contract itself should be code, not a wiki page. Most teams keep it in a small **contracts package** (in a monorepo, a folder such as `contracts/`) that both sides import. It holds exactly four things: the schemas, the types inferred from them, the version numbers, and example payloads. Here is ShopFlow's, using `@zudojs/schema` from [the validation lesson](https://zudojs.oyinlola.site/learn/zudo-validation):

contracts.ts

```ts
import { schema } from "@zudojs/schema";
import type { Infer } from "@zudojs/schema";

/* order.placed, owned by the orders service. Never edit a released version: add a new one. */
export const OrderPlacedV1 = schema.object({
  orderId: schema.string(),
  customerId: schema.string(),
  totalKobo: schema.number().int().positive(),
});

export const OrderPlacedV2 = schema.object({
  orderId: schema.string(),
  customerId: schema.string(),
  total: schema.object({
    amountMinor: schema.number().int().positive(),
    currency: schema.enum(["NGN", "GHS"]),
  }),
  couponCode: schema.string().optional(),
});

export type OrderPlacedV1 = Infer<typeof OrderPlacedV1>;
export type OrderPlacedV2 = Infer<typeof OrderPlacedV2>;

export const ORDER_PLACED = { type: "order.placed", latest: 2 } as const;

/* Turns any older version into the latest one, one step at a time. */
const upcasters: Record<number, (body: unknown) => unknown> = {
  1: (body) => {
    const v1 = OrderPlacedV1.parse(body);
    return { orderId: v1.orderId, customerId: v1.customerId, total: { amountMinor: v1.totalKobo, currency: "NGN" } };
  },
};

export function upcastOrderPlaced(version: number, body: unknown): unknown {
  let current = body;
  for (let v = version; v < ORDER_PLACED.latest; v++) {
    const step = upcasters[v];
    if (!step) throw new Error(`no upcaster for order.placed v${v}`);
    current = step(current);
  }
  return current;
}

/* Example payloads, one per version. Tests on both sides read these. */
export const fixtures = {
  v1: { orderId: "ord_1", customerId: "cus_ada", totalKobo: 250000 },
  v2: { orderId: "ord_2", customerId: "cus_kofi", total: { amountMinor: 480000, currency: "GHS" } },
};
```

What does *not* go in the contracts package: domain logic, entity classes, database models, helpers. The moment the package contains behaviour, every service must upgrade it in lock-step to get a bug fix, and you have rebuilt a monolith with extra network hops. A contract is data about data.

> A SHARED TYPE IS NOT A CHECK
>
> Importing `OrderPlacedV2` as a TypeScript type in both services does not make them agree at runtime. The payments service may be running last week's build of the contracts package. Always *parse* incoming data with the schema at the boundary, as [the RPC lesson](https://zudojs.oyinlola.site/learn/zudo-rpc#client) warned: the type is what you hope arrives, the schema checks what did.

## Compatibility is about time

Why did the ₦NaN bug happen even though both teams tested? Because a distributed system is never on one version. During a **rolling deploy**, the platform replaces instances one at a time: for a few minutes, some orders instances run version 1 and others version 2. The payments team deploys on a different day altogether. And messages written by version 1 are still in the queue after version 1 is gone.

```ts
time ─────────────────────────────────────────────────────────────▶

orders      [ v1 v1 v1 ]  [ v1 v2 v2 ]  [ v2 v2 v2 ]   rollback? [ v1 v1 v1 ]
                               ▲ both versions publishing at once
queue        v1 v1 v1 v1  v1 v2 v1 v2   v2 v2 v2 v2    v2 v2 still waiting
                                                         ▲ v1 code must read v2
payments    [ v1 v1 ]     [ v1 v1 ]     [ v1 v2 ]      [ v2 v2 ]
```

Every box is a running instance. At almost every moment, some reader is older or newer than some writer.

Two words describe the two directions:

- **Backward compatible**: new code can read data written by old code. Payments v2 can read the v1 events still in the queue.
- **Forward compatible**: old code can read data written by new code. Payments v1 can read events from orders v2. This is the one people forget, and it is the one the ₦NaN bug broke. You also need it for rollbacks: if orders v2 misbehaves and you roll back to v1, the v2 messages it already wrote are still waiting.

You can see both directions at once by running every reader against every writer:

matrix.js

```ts
const writers = {
  "orders v1": () => ({ orderId: "ord_1", totalKobo: 250000 }),
  "orders v2": () => ({ orderId: "ord_2", total: { amountMinor: 480000, currency: "NGN" } }),
};

const readers = {
  "payments v1": (body) => {
    if (!Number.isInteger(body.totalKobo)) throw new Error("totalKobo missing");
    return body.totalKobo;
  },
  "payments v2": (body) => {
    const amount = body.total?.amountMinor ?? body.totalKobo;
    if (!Number.isInteger(amount)) throw new Error("no amount");
    return amount;
  },
};

console.log("".padEnd(14) + Object.keys(writers).map((w) => w.padEnd(26)).join(""));
for (const [reader, read] of Object.entries(readers)) {
  const cells = Object.values(writers).map((write) => {
    try {
      return `ok (${read(write())})`.padEnd(26);
    } catch (error) {
      return `BROKEN: ${error.message}`.padEnd(26);
    }
  });
  console.log(reader.padEnd(14) + cells.join(""));
}
```

Output of `node matrix.js` and of the browser terminal

```ts
              orders v1                 orders v2
payments v1   ok (250000)               BROKEN: totalKobo missing
payments v2   ok (250000)               ok (480000)
```

Read the matrix as a deploy plan. The bottom-right cell is the goal. The top-right cell is the ₦NaN bug: an old reader meeting a new writer. It is safe to deploy orders v2 only when no payments v1 instance is left, so the order is:

1. **Readers first.** Deploy payments v2, which understands both shapes. Nothing writes v2 yet, so nothing changes.
2. **Then writers.** Deploy orders v2. Every reader in production already understands it.
3. **Clean up later.** Remove v1 support from payments only when no v1 message can exist anywhere: queues drained, dead-letter lists empty, retention expired.

The same rule, applied to a database column, is the expand-migrate-contract pattern from [API contracts](https://zudojs.oyinlola.site/learn/api-contracts#evolution). Between services, it is stretched over several teams and several days, so it needs to be written down in the contract, not remembered.

## Tolerant readers

Most changes do not need a new version at all, provided every reader follows one rule, often called the **tolerant reader** rule: read only the fields you need, and ignore everything else. It is Postel's law applied to data: be strict in what you send, liberal in what you accept.

### Unknown fields

Orders v2.1 adds an optional `couponCode`. A reader with a *strict* schema, one that rejects unknown keys, breaks on every new event. A reader with the default `strip` behaviour of `@zudojs/schema` keeps working:

unknown-fields.ts

```ts
import { OrderPlacedV1 } from "./contracts.js";

const fromNewerProducer = { orderId: "ord_3", customerId: "cus_ada", totalKobo: 90000, couponCode: "SALE10" };

const strict = OrderPlacedV1.strict().safeParse(fromNewerProducer);
console.log("strict reader:", strict.success ? "ok" : strict.issues.map((issue) => issue.message));

const tolerant = OrderPlacedV1.safeParse(fromNewerProducer);
console.log("tolerant reader:", tolerant.success ? tolerant.data : tolerant.issues);
```

Output of `npx tsx unknown-fields.ts` and of the browser terminal

```ts
strict reader: [ 'Unknown key: couponCode' ]
tolerant reader: { orderId: 'ord_3', customerId: 'cus_ada', totalKobo: 90000 }
```

Strict schemas belong where *you* are the one being lenient to nobody: requests from the public internet, where an unknown field is more likely an attack or a typo than a newer version. Between your own services, readers of events and responses should tolerate unknown fields.

### The write-back trap

Stripping has one dangerous case. When a service reads a record, changes one thing and writes the *whole* record back, anything it stripped is deleted. During a rolling deploy, orders v2 stores a `giftMessage` on an order document; an orders v1 instance then handles "change the delivery address":

write-back.ts

```ts
import { schema } from "@zudojs/schema";

const store = new Map<string, string>();
store.set("ord_7", JSON.stringify({ id: "ord_7", address: "12 Allen Avenue, Ikeja", giftMessage: "Happy birthday, Tolu!" }));

const OrderDocV1 = schema.object({ id: schema.string(), address: schema.string() });

function changeAddress(reader: typeof OrderDocV1, id: string, address: string): void {
  const order = reader.parse(JSON.parse(store.get(id)!));
  store.set(id, JSON.stringify({ ...order, address }));
}

changeAddress(OrderDocV1, "ord_7", "4 Broad Street, Lagos Island");
console.log("strip:      ", store.get("ord_7"));

store.set("ord_7", JSON.stringify({ id: "ord_7", address: "12 Allen Avenue, Ikeja", giftMessage: "Happy birthday, Tolu!" }));
changeAddress(OrderDocV1.passthrough(), "ord_7", "4 Broad Street, Lagos Island");
console.log("passthrough:", store.get("ord_7"));
```

Output of `npx tsx write-back.ts` and of the browser terminal

```ts
strip:       {"id":"ord_7","address":"4 Broad Street, Lagos Island"}
passthrough: {"id":"ord_7","address":"4 Broad Street, Lagos Island","giftMessage":"Happy birthday, Tolu!"}
```

The customer's gift message vanished, silently, because an old instance did an ordinary update. The fix is `passthrough()` for data you write back, or, better, updating only the fields you own (`UPDATE orders SET address = $1`) instead of rewriting the whole document. The same trap exists for clients: an old mobile app that does `GET`, edits, then `PUT`s the whole resource deletes every field it did not know about. That is one reason `PATCH` exists.

### New enum values

Adding a value to an enum looks harmless and is not. Payments v1 knows the methods `card` and `transfer`; checkout starts offering `ussd`. An enum schema rejects the whole message. A tolerant reader maps anything unknown to an explicit `"unknown"` and decides what that means:

enums.ts

```ts
import { schema } from "@zudojs/schema";

const KNOWN = ["card", "transfer"] as const;
type Method = (typeof KNOWN)[number] | "unknown";

const StrictMethod = schema.enum(KNOWN);
const TolerantMethod = schema.string().transform((value): Method =>
  (KNOWN as readonly string[]).includes(value) ? (value as Method) : "unknown",
);

function route(method: Method): string {
  switch (method) {
    case "card": return "charge through the card gateway";
    case "transfer": return "wait for the bank transfer";
    case "unknown": return "hold for manual review, alert the payments team";
  }
}

for (const method of ["card", "ussd"]) {
  const strict = StrictMethod.safeParse(method);
  console.log(`${method.padEnd(5)} strict: ${strict.success ? "ok" : "REJECTED"} | tolerant: ${route(TolerantMethod.parse(method))}`);
}
```

Output of `npx tsx enums.ts` and of the browser terminal

```ts
card  strict: ok | tolerant: charge through the card gateway
ussd  strict: REJECTED | tolerant: hold for manual review, alert the payments team
```

"Unknown" must be a real, handled case, not a silent default. Treating an unknown payment method as `card` would be worse than rejecting it. The rule for producers follows: **adding an enum value is a change readers must be ready for**, so readers first, then writers, exactly like a new version.

## Versioning a message

Some changes cannot be made tolerant. Changing `totalKobo` into a `total` object, changing a field's meaning, or making an optional field required all need a new **schema version**: a number that tells the reader which shape to expect.

REASON IT OUT

### Before you change order.placed

You are about to release `order.placed` v2. Answer these before writing code:

1. Who reads `order.placed`, and do you know all of them?
2. Where can a v1 event still exist after orders v2 is fully deployed?
3. If orders v2 is rolled back, what happens to the v2 events it already wrote?
4. A reader receives v3, which does not exist yet in its build. Should it drop the message, fail it, or something else?
5. The version number: which part of the message carries it, and can a reader trust it?

**Show the reasoning**

1. Payments, notifications and analytics today, and possibly others: anyone with access to the topic. You cannot ask them all to upgrade on your schedule, so v1 must keep flowing, or be translatable, until each has moved.
2. In the queue (messages published a second before the deploy), in the dead-letter list (failed messages waiting for a replay), in the event store and in backups. So readers need an **upcaster** that turns v1 into v2, for as long as the longest of those retentions.
3. Orders v1 does not read its own events, but the *readers* were upgraded first, so they already understand v2. Rolling back a writer is safe. Rolling back a *reader* to a build that cannot read v2 is not; that is why reader deploys must be forward compatible, or at least able to park what they cannot read.
4. Never drop it and never guess. A message from the future means a producer is ahead of this reader. **Park** it: keep it somewhere it can be replayed after the reader is upgraded, and alert. Dropping loses a real order; failing it into a retry loop just burns CPU until someone notices.
5. In the envelope, next to the message type, not inside the payload's fields, so a reader can decide what to do before parsing the body. It is written by your own producers, so it is trusted for routing, but the body must still be validated against the schema of that version: a bug can label a v1 body as v2.

### Two version numbers, not one

A message that crosses a service boundary has two layers, and each has its own version:

- The **wire format**: how the payload's bytes are encoded. `@zudojs/serialization` puts this in the `metadata.version` of its envelope, as you saw in [the serialization lesson](https://zudojs.oyinlola.site/learn/zudo-serialization#envelopes). It describes the tagging format, `{"$type":"BigInt","$value":"1"}` and friends, and it belongs to the package.
- The **schema version**: what the payload means. `order.placed` v1 or v2. It belongs to the owner of the contract.

Keep them apart. ShopFlow's message is an outer object with the facts every reader needs first (id, type, schema version, producer), and a serialization envelope inside it for the body:

messages.ts

```ts
import { SERIALIZATION_SCHEMA_VERSION } from "@zudojs/constants";
import { isSchemaValidationError } from "@zudojs/schema";
import { createSerializer, deserializeFromEnvelope, serializeToEnvelope } from "@zudojs/serialization";
import type { SerializedEnvelope } from "@zudojs/serialization";
import { ORDER_PLACED, OrderPlacedV2, upcastOrderPlaced } from "./contracts.js";

export interface Message {
  readonly id: string;
  readonly type: string;
  readonly schemaVersion: number;
  readonly producer: string;
  readonly body: SerializedEnvelope;
}

export type Outcome =
  | { readonly status: "handled"; readonly order: OrderPlacedV2 }
  | { readonly status: "parked" | "dead-letter"; readonly reason: string };

const serializer = createSerializer("json", { preserveTypes: true });

export function wrap(id: string, schemaVersion: number, producer: string, payload: unknown): Message {
  const body = serializeToEnvelope(payload, serializer, "json", { preserveTypes: true });
  return { id, type: ORDER_PLACED.type, schemaVersion, producer, body };
}

export function readOrderPlaced(message: Message): Outcome {
  if (message.type !== ORDER_PLACED.type) return { status: "dead-letter", reason: `not an ${ORDER_PLACED.type}` };
  if (message.schemaVersion > ORDER_PLACED.latest) {
    return { status: "parked", reason: `schema v${message.schemaVersion} is newer than this build (v${ORDER_PLACED.latest})` };
  }
  if ((message.body.metadata.version ?? 1) > SERIALIZATION_SCHEMA_VERSION) {
    return { status: "parked", reason: `wire format v${message.body.metadata.version} is newer than this build` };
  }
  try {
    const raw = deserializeFromEnvelope(message.body, serializer, "json", { preserveTypes: true, strict: true, maxSize: 64_000 });
    return { status: "handled", order: OrderPlacedV2.parse(upcastOrderPlaced(message.schemaVersion, raw)) };
  } catch (error) {
    return { status: "dead-letter", reason: describe(error) };
  }
}

/* A schema error lists its issues; the first one says what was wrong and where. */
export function describe(error: unknown): string {
  if (isSchemaValidationError(error)) {
    const issue = error.issues[0]!;
    return `${issue.path.join(".") || "body"}: ${issue.message}`;
  }
  return `${(error as Error).name}: ${(error as Error).message}`;
}
```

Now feed the reader everything that can realistically arrive: an old v1 event from the queue, a current v2 one, a v3 from a producer that deployed too early, a body with a newer wire format, and a v2 label on a body that is really v1 (a producer bug):

read-messages.ts

```ts
import { fixtures } from "./contracts.js";
import { readOrderPlaced, wrap } from "./messages.js";
import type { Message } from "./messages.js";

const fromTheFuture: Message = {
  ...wrap("msg-4", 2, "orders@2.3.0", fixtures.v2),
  body: { metadata: { format: "json", version: 2 }, data: "{}" },
};

const inbox: Message[] = [
  wrap("msg-1", 1, "orders@1.9.0", fixtures.v1),
  wrap("msg-2", 2, "orders@2.0.0", fixtures.v2),
  wrap("msg-3", 3, "orders@3.0.0-beta", { orderId: "ord_9" }),
  fromTheFuture,
  wrap("msg-5", 2, "orders@2.0.1", fixtures.v1),
];

for (const message of inbox) {
  const outcome = readOrderPlaced(message);
  if (outcome.status === "handled") {
    const { orderId, total } = outcome.order;
    console.log(`${message.id} v${message.schemaVersion}: handled ${orderId}, ${total.amountMinor} ${total.currency} minor units`);
  } else {
    console.log(`${message.id} v${message.schemaVersion}: ${outcome.status} (${outcome.reason.split("\n")[0]})`);
  }
}
```

Output of `npx tsx read-messages.ts` and of the browser terminal

```ts
msg-1 v1: handled ord_1, 250000 NGN minor units
msg-2 v2: handled ord_2, 480000 GHS minor units
msg-3 v3: parked (schema v3 is newer than this build (v2))
msg-4 v2: parked (wire format v2 is newer than this build)
msg-5 v2: dead-letter (total: Required field missing: total)
```

Each outcome is a decision you should be able to defend:

- **msg-1** was written by orders 1.9.0 before the upgrade. The upcaster turned it into v2, with `NGN` as the currency every v1 order implicitly had, and the handler has one code path.
- **msg-3** and **msg-4** come from the future. They are **parked**, not lost: in a queue that means moving them to a separate "parked" list that is replayed after the reader is upgraded. They are different futures (a newer schema, a newer wire format), and both are refused before the body is parsed, so an old reader never misreads new bytes.
- **msg-5** claims v2 but carries a v1 body. The schema caught it, so it went to the dead-letter list, where a human looks at it. The version number routes the message; the schema is still the judge.

Notice what the message carries besides the version: an `id`, so consumers can ignore duplicates (you will build that in [Transactions across services](https://zudojs.oyinlola.site/learn/dist-transactions)), and a `producer` with its build version, so when msg-5 lands in the dead-letter list you know which release to blame.

### New types are breaking changes too

`preserveTypes` lets a producer send a `Date`, a `BigInt` or your own classes. That is also a contract: if orders v3 registers a `Money` transformer and starts sending `Money` objects, what does an older reader see?

new-type.ts

```ts
import { createSerializer, JSONSerializer } from "@zudojs/serialization";
import type { TypeTransformer } from "@zudojs/serialization";

class Money {
  constructor(readonly kobo: bigint, readonly currency: string) {}
}

const MoneyTransformer: TypeTransformer<Money> = {
  type: "Money",
  canSerialize: (value): value is Money => value instanceof Money,
  serialize: (money) => ({ kobo: money.kobo.toString(), currency: money.currency }),
  deserialize: (tagged) => {
    const value = (tagged as { $value: { kobo: string; currency: string } }).$value;
    return new Money(BigInt(value.kobo), value.currency);
  },
};

const ordersV3 = new JSONSerializer({ defaults: { preserveTypes: true } });
ordersV3.registerTransformer(MoneyTransformer);
const text = ordersV3.serialize({ orderId: "ord_4", total: new Money(250000n, "NGN") });

const paymentsV2 = createSerializer("json", { preserveTypes: true });
console.log("lenient:", paymentsV2.deserialize<{ total: unknown }>(text).total);
try {
  paymentsV2.deserialize(text, { preserveTypes: true, strict: true });
} catch (error) {
  console.log("strict: ", (error as Error).name, "-", (error as Error).message);
}
```

Output of `npx tsx new-type.ts` and of the browser terminal

```ts
lenient: { '$type': 'Money', '$value': { kobo: '250000', currency: 'NGN' } }
strict:  InvalidSerializedDataError - Unknown serialization type tag: "Money". Register a transformer for it, or deserialize without strict mode.
```

Without `strict`, the old reader gets the raw tagged object where it expected something else, and the mistake surfaces later, somewhere far from the cause. With `strict`, it fails immediately with a message that names the missing transformer. Use `strict` for messages between services, and treat "we now send a new tagged type" exactly like a new schema version: readers register the transformer first, writers start sending it afterwards.

## Consumer-driven contract tests

Schemas say what *may* be sent. They do not say what each consumer actually *depends on*. The orders team cannot tell from a schema whether removing `lines` from `orders.get` breaks anyone. **Consumer-driven contract testing** answers that: each consumer writes down the interactions it relies on, and the provider runs all of those expectations in its own test suite, against its real code, before every release.

[API contracts](https://zudojs.oyinlola.site/learn/api-contracts#contract-tests) showed the idea against one handler. Here it runs between two services, the way tools such as Pact do it, in three steps:

1. **Consumer test.** Payments writes its expectations, then tests its own code against a fake orders service built only from those expectations. If payments' code needs a field it did not declare, this test fails.
2. **Publish.** The expectations are saved as a JSON file (a **pact**) and shared, usually through a broker or a repository folder.
3. **Provider verification.** Orders loads every consumer's pact and replays each interaction against its real service. Each interaction names a **provider state** ("order ord_1 exists with two lamps"), which the provider sets up before replaying it.

### The two services

The orders service exposes `orders.get` over `@zudojs/rpc`, from [Calling services with RPC](https://zudojs.oyinlola.site/learn/zudo-rpc). How an order is turned into a response is passed in as a `present` function, so you can try candidate releases later:

orders-service.ts

```ts
import { NotFoundError } from "@zudojs/errors";
import { createRPCProcedure, RPCServer } from "@zudojs/rpc";
import { schema } from "@zudojs/schema";

export interface Order {
  readonly id: string;
  readonly customerId: string;
  readonly status: "pending" | "paid";
  readonly lines: readonly { readonly sku: string; readonly quantity: number; readonly unitKobo: number }[];
}

export type Presenter = (order: Order) => Record<string, unknown>;

const totalKobo = (order: Order) => order.lines.reduce((sum, line) => sum + line.quantity * line.unitKobo, 0);

export const presentCurrent: Presenter = (order) => ({
  id: order.id,
  status: order.status,
  totalKobo: totalKobo(order),
  currency: "NGN",
  lines: order.lines.map(({ sku, quantity }) => ({ sku, quantity })),
});

export function createOrdersService(present: Presenter = presentCurrent) {
  const orders = new Map<string, Order>();
  const server = new RPCServer();
  server.register(createRPCProcedure("orders.get", async (input: { orderId: string }) => {
    const order = orders.get(input.orderId);
    if (!order) throw new NotFoundError(`Order ${input.orderId} not found`);
    return present(order);
  }, { input: schema.object({ orderId: schema.string() }), idempotent: true }));
  return { server, orders };
}
```

The contract-test helpers are small. An expectation maps each field the consumer reads to a **matcher**: `like(example)` means "any value of the same type as this example", `exact(value)` means "exactly this value". Matchers are plain objects, so a pact can be saved as JSON:

pact.ts

```ts
export type Matcher = { readonly $match: "type"; readonly example: unknown } | { readonly $match: "exact"; readonly value: unknown };
export type Expectation = Matcher | { readonly [field: string]: Expectation };

export interface Interaction {
  readonly consumer: string;
  readonly description: string;
  readonly given: string;
  readonly procedure: string;
  readonly input: unknown;
  readonly expects: { readonly [field: string]: Expectation };
}

export const like = (example: unknown): Matcher => ({ $match: "type", example });
export const exact = (value: unknown): Matcher => ({ $match: "exact", value });

const isMatcher = (e: Expectation): e is Matcher => "$match" in e;
const kind = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);

/* Every problem between what a consumer expects and what it got. */
export function check(expects: { readonly [field: string]: Expectation }, actual: unknown, path = "$"): string[] {
  const problems: string[] = [];
  for (const [field, expectation] of Object.entries(expects)) {
    const value = (actual as Record<string, unknown> | null)?.[field];
    const at = `${path}.${field}`;
    if (value === undefined) problems.push(`${at} is missing`);
    else if (!isMatcher(expectation)) problems.push(...check(expectation, value, at));
    else if (expectation.$match === "type" && kind(value) !== kind(expectation.example)) {
      problems.push(`${at} should be ${kind(expectation.example)}, is ${kind(value)}`);
    } else if (expectation.$match === "exact" && JSON.stringify(value) !== JSON.stringify(expectation.value)) {
      problems.push(`${at} should be ${JSON.stringify(expectation.value)}, is ${JSON.stringify(value)}`);
    }
  }
  return problems;
}

/* The response a fake provider returns: built from the expectations only. */
export function exampleFrom(expects: { readonly [field: string]: Expectation }): Record<string, unknown> {
  return Object.fromEntries(Object.entries(expects).map(([field, e]) => [
    field,
    isMatcher(e) ? (e.$match === "type" ? e.example : e.value) : exampleFrom(e),
  ]));
}
```

### Step 1: the consumer test

Payments' real code asks orders for the order and decides how much to charge. The test runs that code against a fake orders server that answers with nothing but the example built from the pact. Anything payments reads that is not in its expectations comes back `undefined`, and the test fails:

payments.ts

```ts
import type { RPCClient } from "@zudojs/rpc";

export async function amountToCharge(orders: RPCClient, orderId: string): Promise<string> {
  const order = await orders.call<{ orderId: string }, { status: string; totalKobo: number; currency: string }>("orders.get", { orderId });
  if (order.status !== "pending") return `nothing to charge, order is ${order.status}`;
  if (!Number.isInteger(order.totalKobo) || order.currency !== "NGN") throw new Error("cannot price this order");
  return `charge ₦${(order.totalKobo / 100).toFixed(2)}`;
}
```

consumer-test.tsNode.js only

```ts
import { createRPCMemoryTransport, createRPCProcedure, RPCClient, RPCServer } from "@zudojs/rpc";
import { exact, exampleFrom, like } from "./pact.js";
import type { Interaction } from "./pact.js";
import { amountToCharge } from "./payments.js";

const interaction: Interaction = {
  consumer: "payments",
  description: "get a pending order to charge it",
  given: "order ord_1 is pending with 2 lamps at ₦1,250",
  procedure: "orders.get",
  input: { orderId: "ord_1" },
  expects: { status: exact("pending"), totalKobo: exact(250000), currency: like("NGN") },
};

const fakeOrders = new RPCServer();
fakeOrders.register(createRPCProcedure(interaction.procedure, async () => exampleFrom(interaction.expects)));
const client = new RPCClient(createRPCMemoryTransport(fakeOrders));

console.log("payments against the pact:", await amountToCharge(client, "ord_1"));
console.log("pact file:", JSON.stringify({ consumer: "payments", provider: "orders", interactions: [interaction] }).length, "bytes");
```

Output of `npx tsx consumer-test.ts`

```ts
payments against the pact: charge ₦2500.00
pact file: 391 bytes
```

The consumer test proves two things: payments' code works with the response it described, and it reads nothing it did not describe. `exact(250000)` is deliberate: in the state "2 lamps at ₦1,250", the total must be exactly 250,000 kobo. Use `exact` only where a value follows from the provider state like that, and `like` everywhere else, or every harmless data change will break the pact.

### Step 2 and 3: verify every pact against the real provider

The pacts from all consumers land in the orders repository. Notifications reads only `id` and `status`; inventory reads the `lines`. The provider's verification sets up each provider state, calls its real service through the in-process transport, and checks the answer. Run it against the current release and against three candidate releases:

provider-verify.tsNode.js only

```ts
import { createRPCMemoryTransport, RPCClient } from "@zudojs/rpc";
import { createOrdersService, presentCurrent } from "./orders-service.js";
import type { Order, Presenter } from "./orders-service.js";
import { check, exact, like } from "./pact.js";
import type { Interaction } from "./pact.js";

const pacts: Interaction[] = [
  { consumer: "payments", description: "get a pending order to charge it", given: "order ord_1 is pending with 2 lamps at ₦1,250",
    procedure: "orders.get", input: { orderId: "ord_1" },
    expects: { status: exact("pending"), totalKobo: exact(250000), currency: like("NGN") } },
  { consumer: "notifications", description: "get an order for the receipt e-mail", given: "order ord_1 is pending with 2 lamps at ₦1,250",
    procedure: "orders.get", input: { orderId: "ord_1" },
    expects: { id: like("ord_1"), status: like("pending") } },
  { consumer: "inventory", description: "get the lines to reserve stock", given: "order ord_1 is pending with 2 lamps at ₦1,250",
    procedure: "orders.get", input: { orderId: "ord_1" },
    expects: { lines: like([{ sku: "lamp", quantity: 2 }]) } },
];

const states: Record<string, (orders: Map<string, Order>) => void> = {
  "order ord_1 is pending with 2 lamps at ₦1,250": (orders) =>
    orders.set("ord_1", { id: "ord_1", customerId: "cus_ada", status: "pending", lines: [{ sku: "lamp", quantity: 2, unitKobo: 125000 }] }),
};

async function verify(release: string, present: Presenter): Promise<void> {
  console.log(release);
  for (const pact of pacts) {
    const { server, orders } = createOrdersService(present);
    states[pact.given]!(orders);
    const client = new RPCClient(createRPCMemoryTransport(server));
    const problems = check(pact.expects, await client.call(pact.procedure, pact.input));
    console.log(`  ${pact.consumer.padEnd(14)} ${problems.length ? "FAIL " + problems.join("; ") : "ok"}`);
  }
}

await verify("current release", presentCurrent);
await verify("candidate A: rename totalKobo to amountKobo", (o) => {
  const { totalKobo, ...rest } = presentCurrent(o);
  return { ...rest, amountKobo: totalKobo };
});
await verify("candidate B: totals in naira (same field, same type)", (o) => ({ ...presentCurrent(o), totalKobo: (presentCurrent(o).totalKobo as number) / 100 }));
await verify("candidate C: add discountKobo", (o) => ({ ...presentCurrent(o), discountKobo: 0 }));
```

Output of `npx tsx provider-verify.ts`

```ts
current release
  payments       ok
  notifications  ok
  inventory      ok
candidate A: rename totalKobo to amountKobo
  payments       FAIL $.totalKobo is missing
  notifications  ok
  inventory      ok
candidate B: totals in naira (same field, same type)
  payments       FAIL $.totalKobo should be 250000, is 2500
  notifications  ok
  inventory      ok
candidate C: add discountKobo
  payments       ok
  notifications  ok
  inventory      ok
```

This is the report the orders team needed at 14:01:

- **Candidate A** renames a field. Only payments breaks; notifications and inventory never read it. The team now knows exactly whom to talk to, and that the rename needs the expand-then-contract dance.
- **Candidate B** is the nastiest kind of change: same name, same type, different meaning. A schema check passes (`2500` is a positive integer), a type matcher would pass too. Only the `exact` value tied to a provider state catches it. Semantic changes are why contract tests use real examples, not just types.
- **Candidate C** adds a field. Nobody breaks, because every consumer is a tolerant reader and the check only looks at declared fields.

The same verification works for events: the consumer's expectation names the event type and schema version instead of a procedure, and the provider verifies it by calling the real function that builds the event body. The orders service would have caught the ₦NaN bug that way.

### Can I deploy?

Verification results are only useful if deploys consult them. The last piece is a question asked by the deploy pipeline: "is the version I am about to release verified against every consumer version that is *currently in production*?" Pact calls this `can-i-deploy`:

can-i-deploy.js

```ts
const verified = new Set([
  "orders@2.4.0|payments@1.8.0",
  "orders@2.4.0|notifications@3.1.0",
  "orders@2.4.0|inventory@0.9.2",
  "orders@2.5.0|payments@1.9.0",
  "orders@2.5.0|notifications@3.1.0",
  "orders@2.5.0|inventory@0.9.2",
]);

const production = { payments: "1.8.0", notifications: "3.1.0", inventory: "0.9.2" };

function canIDeploy(candidate) {
  const missing = Object.entries(production)
    .map(([consumer, version]) => `${consumer}@${version}`)
    .filter((consumer) => !verified.has(`${candidate}|${consumer}`));
  return missing.length === 0 ? `${candidate}: yes` : `${candidate}: no, not verified with ${missing.join(", ")}`;
}

console.log(canIDeploy("orders@2.4.0"));
console.log(canIDeploy("orders@2.5.0"));
```

Output of `node can-i-deploy.js` and of the browser terminal

```ts
orders@2.4.0: yes
orders@2.5.0: no, not verified with payments@1.8.0
```

Orders 2.5.0 was verified against payments 1.9.0, but production still runs payments 1.8.0. Until payments deploys, orders must wait. This is the "readers first" rule from the compatibility matrix, enforced by a machine instead of a meeting.

## Testing compatibility in both directions

Contract tests protect consumers you know. Two more tests, both cheap, protect you against the ones you do not, and against yourself:

- **Backward:** the current reader must read a stored example of *every* version that can still exist. The `fixtures` in the contracts module are those examples; add one per version and never delete it while that version can exist.
- **Forward:** the *previous* release's reader must read what the current writer produces, or park it. Keep the previous reader's schema in the test suite for exactly this.

compat-test.ts

```ts
import { schema } from "@zudojs/schema";
import { fixtures, ORDER_PLACED, OrderPlacedV2, upcastOrderPlaced } from "./contracts.js";
import { describe } from "./messages.js";

const results: string[] = [];
function test(name: string, run: () => void): void {
  try {
    run();
    results.push(`PASS ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${describe(error)}`);
  }
}

test("backward: the v2 reader reads every stored version", () => {
  for (const [version, body] of Object.entries(fixtures)) OrderPlacedV2.parse(upcastOrderPlaced(Number(version.slice(1)), body));
});

// The reader of the previous release, kept on purpose.
const previousReader = OrderPlacedV2;
const nextWriterOutput = { ...fixtures.v2, couponCode: "SALE10", channel: "mobile" };
test("forward: the previous reader reads the next writer's output", () => {
  previousReader.parse(nextWriterOutput);
});

const strictPreviousReader = OrderPlacedV2.strict();
test("forward: a strict previous reader reads the next writer's output", () => {
  strictPreviousReader.parse(nextWriterOutput);
});

test("the latest version has a fixture", () => {
  if (!(`v${ORDER_PLACED.latest}` in fixtures)) throw new Error(`add fixtures.v${ORDER_PLACED.latest}`);
});

const OrderPlacedV3Draft = OrderPlacedV2.extend(schema.object({ channel: schema.string() }));
test("the v3 draft reads the v2 fixture", () => {
  OrderPlacedV3Draft.parse(fixtures.v2);
});

console.log(results.join("\n"));
```

Output of `npx tsx compat-test.ts` and of the browser terminal

```ts
PASS backward: the v2 reader reads every stored version
PASS forward: the previous reader reads the next writer's output
FAIL forward: a strict previous reader reads the next writer's output: body: Unknown key: channel
PASS the latest version has a fixture
FAIL the v3 draft reads the v2 fixture: channel: Required field missing: channel
```

The last two failures are the point: the tests found a strict reader that would break on a harmless new field, and a draft v3 that made `channel` required, which no stored v2 event has. The draft needs `channel` to be optional, or a v2-to-v3 upcaster that fills it in (for example with `"web"`). Both are the kinds of mistake that otherwise surface during a deploy, at the worst moment.

## Production concerns

- **Never reuse a version number.** Once `order.placed` v2 has been published anywhere, its shape is frozen. A fix is v3. A registry, even a folder of JSON Schemas in the contracts repository, makes this visible.
- **Measure versions in flight.** Count messages by `type` and `schemaVersion` in your metrics (see [observability](https://zudojs.oyinlola.site/learn/zudo-observability)). "v1 traffic has been zero for 30 days and retention is 14 days" is the evidence that lets you delete an upcaster. Guessing is how you break a replay six months later.
- **Alert on parked and dead-lettered messages.** A parked message means a producer is ahead of a consumer. A dead-lettered one means a bug. Both need a human soon, and both must be replayable after the fix.
- **Version the contracts package with semantic versioning.** A new optional field is a minor release; a new schema version is also a minor release (old versions stay); removing an old version is a major one, and only after the metrics say it is unused.
- **Run contract checks in CI on both sides.** The consumer's pipeline publishes pacts; the provider's pipeline verifies them; the deploy pipeline runs can-i-deploy. A pact that is written but never verified is worse than none, because it looks like protection.
- **Do not share databases.** A table read by two services is a contract with no version, no owner and no tests. Publish an event or offer an API instead, as [Microservices](https://zudojs.oyinlola.site/learn/zudo-microservices#boundaries) explained.
- **Limit what you parse.** Messages come from other programs, so pass `maxSize` and `strict` when you deserialize, validate with the schema, and never let a message's content choose code paths beyond its declared type and version.

## Practice

TRY IT YOURSELF

### Add order.placed v3

Orders wants to add a required `channel` field (`"web"`, `"mobile"` or `"pos"`). Every order placed before the change came from the web. Write an upcaster chain that turns v1 and v2 bodies into v3, and show that both old fixtures and a real v3 body come out in the same shape.

**Show a solution**

upcast-v3.ts

```ts
import { schema } from "@zudojs/schema";

const OrderPlacedV3 = schema.object({
  orderId: schema.string(),
  total: schema.object({ amountMinor: schema.number().int().positive(), currency: schema.enum(["NGN", "GHS"]) }),
  channel: schema.enum(["web", "mobile", "pos"]),
});

type Body = Record<string, unknown>;
const upcasters: Record<number, (body: Body) => Body> = {
  1: (body) => ({ ...body, total: { amountMinor: body.totalKobo, currency: "NGN" }, totalKobo: undefined }),
  2: (body) => ({ ...body, channel: "web" }),
};

function readV3(version: number, body: Body) {
  let current = body;
  for (let v = version; v < 3; v++) current = upcasters[v]!(current);
  return OrderPlacedV3.parse(current);
}

console.log(readV3(1, { orderId: "ord_1", totalKobo: 250000 }));
console.log(readV3(2, { orderId: "ord_2", total: { amountMinor: 480000, currency: "GHS" } }));
console.log(readV3(3, { orderId: "ord_3", total: { amountMinor: 90000, currency: "NGN" }, channel: "pos" }));
```

Output of `npx tsx upcast-v3.ts` and of the browser terminal

```json
{
  orderId: 'ord_1',
  total: { amountMinor: 250000, currency: 'NGN' },
  channel: 'web'
}
{
  orderId: 'ord_2',
  total: { amountMinor: 480000, currency: 'GHS' },
  channel: 'web'
}
{
  orderId: 'ord_3',
  total: { amountMinor: 90000, currency: 'NGN' },
  channel: 'pos'
}
```

Each upcaster knows only one step, so v1 goes through both. The v1 step sets `totalKobo` to `undefined` and the default `strip` behaviour removes it along with anything else unknown. Remember the order of deploys: readers with `readV3` first, then the orders release that writes v3.

TRY IT YOURSELF

### Make a reader tolerant

This notifications reader breaks on every harmless change the orders team makes. Rewrite it so it accepts unknown fields, handles a new status by sending a generic e-mail instead of failing, and still rejects a body without an `orderId`.

brittle.ts

```ts
import { schema } from "@zudojs/schema";

const OrderStatusChanged = schema.object({
  orderId: schema.string(),
  status: schema.enum(["paid", "shipped"]),
}).strict();

for (const body of [{ orderId: "ord_1", status: "paid" }, { orderId: "ord_1", status: "refunded" }, { orderId: "ord_1", status: "paid", courier: "GIG" }]) {
  console.log(OrderStatusChanged.safeParse(body).success);
}
```

Output of `npx tsx brittle.ts` and of the browser terminal

```ts
true
false
false
```

**Show a solution**

tolerant-notifications.ts

```ts
import { schema } from "@zudojs/schema";

const OrderStatusChanged = schema.object({
  orderId: schema.string(),
  status: schema.string().transform((value) => (value === "paid" || value === "shipped" ? value : ("other" as const))),
});

const templates = { paid: "Payment received", shipped: "Your order is on its way", other: "Your order was updated" };

for (const body of [{ orderId: "ord_1", status: "paid" }, { orderId: "ord_1", status: "refunded" }, { orderId: "ord_1", status: "paid", courier: "GIG" }, { status: "paid" }]) {
  const result = OrderStatusChanged.safeParse(body);
  console.log(result.success ? `${result.data.orderId}: ${templates[result.data.status]}` : "rejected: " + result.issues[0]!.message);
}
```

Output of `npx tsx tolerant-notifications.ts` and of the browser terminal

```ts
ord_1: Payment received
ord_1: Your order was updated
ord_1: Payment received
rejected: Required field missing: orderId
```

Removing `.strict()` lets unknown fields through, and the transform maps unknown statuses to `other`, which has a real template. `orderId` is still required, because a notification without an order cannot be sent: tolerance means ignoring what you do not need, not accepting a body that lacks what you do need.

TRY IT YOURSELF

### Who breaks?

Using the provider verification from this lesson, add a fourth candidate that changes `lines` from `[{ sku, quantity }]` to `[{ sku, qty }]`. Before running it, predict which consumers fail. Then explain why the inventory pact with `like([{ sku: "lamp", quantity: 2 }])` does *not* catch it, and change the pact so it does.

**Show a solution**

Prediction: only inventory should fail, since it is the only consumer that reads `lines`. But with this lesson's `check`, it passes: `like([…])` only checks that `lines` is an array, not what is inside. That is a real gap, and real tools handle it with an "each like" matcher that checks every element against the example's shape. The quick fix here is to describe the element explicitly, for example `expects: { lines: { 0: { sku: like("lamp"), quantity: exact(2) } } }`: the nested expectation walks into `lines[0]` and reports `$.lines.0.quantity is missing` for the candidate. A contract test is only as precise as its matchers, so test your test: run it once against a response you know is broken and check that it fails.

## Summary

- Services are held together by contracts: APIs (owned by the provider), events (owned by the producer) and commands (owned by the handler). Keep schemas, inferred types, version numbers and fixtures in a small contracts module with no behaviour, and parse at every boundary.
- Several versions always run at once: during rolling deploys, across teams, and in queues and stores. You need backward compatibility (new reads old) and forward compatibility (old reads new). Deploy readers first, then writers, and remove old versions only when metrics show none left.
- Tolerant readers ignore unknown fields and map unknown enum values to a handled case. Beware the write-back trap: stripping and rewriting a whole record deletes what you did not know.
- Breaking changes get a new schema version in the message envelope, separate from `@zudojs/serialization`'s wire-format version. Upcast old versions on read, park messages from the future, dead-letter bodies that fail their schema, and treat new tagged types as breaking.
- Consumer-driven contract tests record what each consumer relies on, verify it against the real provider with provider states, and name the consumer that breaks. `exact` values tied to a state catch semantic changes that schemas miss. can-i-deploy turns "readers first" into a pipeline rule.

Next, in [Failure engineering](https://zudojs.oyinlola.site/learn/dist-reliability), you break ShopFlow on purpose, one dependency at a time, and build the timeouts, retries, circuit breakers and fallbacks that keep it serving.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
