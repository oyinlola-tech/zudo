---
title: "Use case: a microservice platform — ZudoJS Academy"
description: "Split Oja Market into six services that call each other over RPC, announce events through an outbox, retry through queues, and share one trace per request."
source: https://zudojs.oyinlola.site/learn/usecase-microservices
---

LEVEL 19 · LESSON 6 OF 10

Real-world use cases Production

# Use case: a microservice platform

Split Oja Market into six services that call each other over RPC, announce events through an outbox, retry through queues, and share one trace per request.

- **60 min** to read and try
- **You need:** The lessons on microservices, RPC, serialization, adapters, events, queues and observability, plus the two previous use cases
- **You build:** Oja Market as six in-process services (gateway, auth, users, orders, payments, notifications) with service tokens, RPC with timeouts, versioned event envelopes, an outbox, retry queues, a payment adapter, one trace across every service, and a Vitest suite that takes services down

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Draw service boundaries from a brief and choose, for each arrow, a synchronous call or an asynchronous event
- Build services that trust only verified callers and validate every input
- Keep one trace across RPC calls, a retry queue, an outbox and an event consumer
- Publish events through an outbox inside versioned envelopes, and consume them idempotently
- Keep taking orders when payments or e-mail is down, and tell the customer the truth
- Test a distributed system by taking its services down on purpose

## The brief: one shop, six teams

**Oja Market**, the Lagos grocery from [the REST API use case](https://zudojs.oyinlola.site/learn/usecase-rest-api), has grown. Five teams now work on one codebase, and every release waits for all of them. Worse, when the card processor had an outage last month, the whole shop went down: checkout waited for payments, the product pages shared the same server pool, and the e-mail sender crashed the process twice. The engineering lead writes the brief:

Split the shop into services that can be released and can fail independently: a *gateway* (the only public entry), *auth*, *users*, *orders*, *payments* and *notifications*. A customer must be charged at most once per cart, even when they press "Pay" twice. When payments is down, keep taking orders and charge them when it is back. When e-mail is down, nobody should notice except that receipts arrive late. Only our own services may call each other. And when a customer complains, we need to see one request across every service.

[The microservices lesson](https://zudojs.oyinlola.site/learn/zudo-microservices) warned that you pay for every one of these benefits from the first day, and suggested a modular monolith first. Oja Market made that trade on purpose, so this lesson builds the result properly. It links to the lessons behind each tool instead of re-teaching them: [RPC](https://zudojs.oyinlola.site/learn/zudo-rpc), [serialization](https://zudojs.oyinlola.site/learn/zudo-serialization), [adapters](https://zudojs.oyinlola.site/learn/zudo-adapters), [events](https://zudojs.oyinlola.site/learn/zudo-events), [queues](https://zudojs.oyinlola.site/learn/zudo-queue) and [observability](https://zudojs.oyinlola.site/learn/zudo-observability), plus the outbox from [transactions across services](https://zudojs.oyinlola.site/learn/dist-transactions#outbox).

All six services run in one Node.js process so you can run the lesson on a laptop, but each one has its **own HTTP port**, its own state and, where it needs one, its own PostgreSQL (PGlite). They only reach each other over the network. Run the examples with `npx tsx <file>.ts`.

```ts
 customer ──HTTP──► gateway ──RPC──► auth          (who is this?)
                       │
                       └──RPC──► orders ──RPC──► users      (e-mail address)
                                   │    ──RPC──► payments ──adapter──► card processor
                                   │    ◄─ retry queue ─┘   (when payments is down)
                                   │
                                   └─ outbox ─► broker: order.paid ─► notifications ─ queue ─► mail
```

Solid arrows are synchronous calls that someone waits for. The outbox, the broker and the queues are asynchronous: nobody waits.

## Boundaries and arrows

REASON IT OUT

### For each arrow: call, or event?

Go through the diagram arrow by arrow before any code. For each one: does the caller need the answer before it can reply to the customer? What happens to the customer if the callee is down? Which service owns which data, and may another service read it directly? And which calls are unsafe to repeat?

**Show the reasoning**

| Arrow | Style | Why | If the callee is down |
| --- | --- | --- | --- |
| gateway → auth | RPC | No request may pass without a known user. | 401/503: nothing can be done anonymously. |
| gateway → orders | RPC | The customer waits for "order received". | 503 with a clear message. |
| orders → users | RPC | The order needs the customer's e-mail now, for the receipt later. | The order fails fast; a copy of the address in orders would remove this dependency. |
| orders → payments | RPC, then a retry queue | The customer would like to know "paid", but can live with "payment pending". | The order is kept as `pending_payment` and charged later. |
| orders → notifications | Event through an outbox | Nobody waits for a receipt. | Receipts arrive late; orders never notice. |

**Ownership:** auth owns credentials, users owns profiles, orders owns orders, payments owns charges, notifications owns e-mails. Nobody reads another service's database; they ask its API or listen to its events. **Unsafe to repeat:** "charge" and "place order", so both carry an idempotency key from the customer's cart all the way to the card processor.

Two decisions follow from the table. Every synchronous arrow gets a timeout, so a slow service cannot hold the others' connections. And only one arrow is allowed to block a sale for more than a moment, the one to auth: without it, nothing is safe.

## Shared plumbing: tokens, timeouts and traces

Every service is an `RPCServer` behind `createRPCFetchHandler`, mounted on its own HTTP server, as in [the RPC lesson](https://zudojs.oyinlola.site/learn/zudo-rpc#http). Three concerns repeat in every service, so they live in one small module:

- **Who may call.** Internal services are not public, but "not public" is not a security control: a bug in the gateway, or an attacker inside the network, could call payments directly. Every RPC request must carry the **service token**, compared in constant time. (Production uses one credential per service, or mutual TLS, so a leaked token names its owner.)
- **How long to wait, and what to say when nobody answers.** Every client has a timeout: 2 seconds by default, 1 second for payments. A call that timed out or could not connect is rethrown as `RPCUnavailableError`. Without that, orders would pass a dead users service on to the gateway as an ordinary exception, which the RPC server hides as `RPC_INTERNAL_ERROR`, and the customer would get a 500 instead of an honest 503.
- **Which trace this is.** The client wraps each call in a CLIENT span and sends the W3C `traceparent` of that span in the RPC metadata; the server's tracing middleware continues the trace from it. That is the `traceparent` header from [the observability lesson](https://zudojs.oyinlola.site/learn/zudo-observability#services), carried in the frame instead of an HTTP header.

demo-env.ts

```ts
/* DEMO ONLY: invents the secrets for this run. Real services read them from the environment. */
import { randomBytes } from "node:crypto";

process.env.JWT_ACCESS_SECRET ??= randomBytes(32).toString("base64url");
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString("base64url");
process.env.INTERNAL_TOKEN ??= randomBytes(32).toString("base64url");
```

rpc-kit.ts

```ts
import { timingSafeEqualString } from "@zudojs/crypto";
import { createHttpServer, createNodeHttpAdapter, createRouter, mountFetchHandler } from "@zudojs/http";
import { formatTraceparent, getCurrentContext, parseTraceparent, SpanKind, withSpan } from "@zudojs/observability";
import type { Observability } from "@zudojs/observability";
import {
  createRPCFetchHandler, createRPCHttpTransport, RPCAuthenticationError, RPCClient, RPCMiddlewareStack, RPCServer,
  RPCTimeoutError, RPCTransportError, RPCUnavailableError,
} from "@zudojs/rpc";
import type { RPCMiddleware } from "@zudojs/rpc";

/** The shared service token, read once when a service or client starts. */
const internalToken = (): string => process.env.INTERNAL_TOKEN ?? "";

/** The W3C traceparent of the span that is active right now, if any. */
export function currentTraceparent(): string | undefined {
  const context = getCurrentContext();
  return context ? formatTraceparent(context) : undefined;
}

/** Starts one service: an RPC server on its own HTTP port, with a service token check and tracing. */
export async function startRpcService(obs: Observability, register: (server: RPCServer) => void, port = 0) {
  const tracing: RPCMiddleware = (context, next) =>
    withSpan(obs.tracer, context.request.procedure, () => next(), {
      kind: SpanKind.SERVER,
      parent: parseTraceparent(String(context.metadata.traceparent ?? "")),
    });
  const rpc = new RPCServer(undefined, new RPCMiddlewareStack([tracing]));
  register(rpc);
  const expected = `Bearer ${internalToken()}`;
  const handler = createRPCFetchHandler(rpc, {
    auth: (request) => {
      if (!timingSafeEqualString(request.headers.get("authorization") ?? "", expected)) {
        throw new RPCAuthenticationError("A valid service token is required.");
      }
      return { caller: request.headers.get("x-caller") ?? "unknown" };
    },
  });
  const router = createRouter();
  mountFetchHandler(router, "/rpc", handler);
  const server = createHttpServer({
    adapter: createNodeHttpAdapter({ host: "127.0.0.1", port }),
    handler: async (request) => (await router.dispatch(request)).response,
  });
  await server.start();
  const actualPort = server.address?.port ?? 0;
  return { url: `http://127.0.0.1:${actualPort}/rpc`, port: actualPort, stop: () => server.stop() };
}

/** How one service calls another: service token, a timeout, and the current trace in the metadata. */
export function serviceClient(caller: string, url: string, obs: Observability, options: { timeout?: number; token?: string } = {}) {
  const client = new RPCClient(createRPCHttpTransport({
    url,
    headers: { authorization: `Bearer ${options.token ?? internalToken()}`, "x-caller": caller },
  }), { timeout: options.timeout ?? 2_000 });
  return {
    call<I, O>(procedure: string, input: I): Promise<O> {
      return withSpan(obs.tracer, `call ${procedure}`, async () => {
        try {
          return await client.call<I, O>(procedure, input, { metadata: { traceparent: currentTraceparent() } });
        } catch (error) {
          /* Report "a dependency did not answer" upstream as unavailable, not as an internal error. */
          if (isUnavailable(error)) throw new RPCUnavailableError(`${procedure} did not answer.`);
          throw error;
        }
      }, { kind: SpanKind.CLIENT });
    },
  };
}

/** Errors that say "the other service did not answer": worth trying again later. */
export function isUnavailable(error: unknown): boolean {
  return error instanceof RPCUnavailableError || error instanceof RPCTimeoutError || error instanceof RPCTransportError;
}
```

Metadata is written by the caller, so it is untrusted, as the RPC lesson stressed. That is fine for a trace id: the worst a forged `traceparent` can do is put a span in the wrong trace, and `parseTraceparent` rejects malformed ones. It is not fine for identity: the user id always travels in the validated *input*, from a service that verified it, and the caller's own identity comes from the token check.

Each service creates its own observability instance, named after the service, and all of them export spans to one collector, as real services export to one tracing backend. `printTrace` draws one trace as a tree:

telemetry.ts

```ts
import { createObservability } from "@zudojs/observability";
import type { Observability, ReadableSpan, SpanExporter } from "@zudojs/observability";

/** Every service exports its spans here, like services exporting to one tracing backend. */
export const spans: ReadableSpan[] = [];
const collector: SpanExporter = {
  async export(batch) { spans.push(...batch); },
  async shutdown() {},
};
const all: Observability[] = [];

export function observabilityFor(serviceName: string): Observability {
  const obs = createObservability({ serviceName, useConsoleExporters: false, spanExporter: collector });
  all.push(obs);
  return obs;
}

/** Makes every service hand its finished spans to the collector. */
export async function flushTelemetry(): Promise<void> {
  for (const obs of all) await obs.flush();
}

/** Flushes every service's spans, then prints one trace as a tree: span [service], and errors. */
export async function printTrace(traceId: string): Promise<void> {
  await flushTelemetry();
  const inTrace = spans.filter((span) => span.context.traceId === traceId)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const print = (span: ReadableSpan, depth: number): void => {
    const error = span.status === "ERROR" ? `  ERROR ${span.statusMessage}` : "";
    console.log(`${"  ".repeat(depth)}${span.name} [${String(span.resource["service.name"])}]${error}`);
    for (const child of inTrace.filter((s) => s.context.parentSpanId === span.context.spanId)) print(child, depth + 1);
  };
  for (const root of inTrace.filter((s) => !inTrace.some((p) => p.context.spanId === s.context.parentSpanId))) print(root, 0);
}

export async function shutdownTelemetry(): Promise<void> {
  for (const obs of all.splice(0)) await obs.shutdown();
}
```

One more helper, from the previous use case: `waitFor` polls for a condition instead of guessing a delay.

wait.ts

```ts
/** Polls until `check` is true, so demos wait for results instead of guessing a delay. */
export async function waitFor(check: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
```

## Auth, users and payments

The three simplest services each own one kind of data and expose a few procedures with input schemas. **Auth** logs users in and verifies access tokens with [@zudojs/auth](https://zudojs.oyinlola.site/learn/zudo-auth); it is the only service that knows the JWT secret. **Users** owns profiles.

auth.service.ts

```ts
import { createTokenPair, hashPassword, toUserId, verifyAccessToken, verifyPassword } from "@zudojs/auth";
import type { TokenConfig } from "@zudojs/auth";
import { createRPCProcedure, RPCAuthenticationError } from "@zudojs/rpc";
import { schema } from "@zudojs/schema";
import { startRpcService } from "./rpc-kit.js";
import { observabilityFor } from "./telemetry.js";

const LoginInput = schema.object({ email: schema.string().trim().toLowerCase().max(254), password: schema.string().max(1024) });
const TokenInput = schema.object({ token: schema.string().max(4096) });

/** Owns credentials and tokens. Knows nothing about orders. */
export async function startAuthService() {
  const obs = observabilityFor("auth");
  const tokens: TokenConfig = {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? "",
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? "",
    accessTtl: 15 * 60,
    issuer: "oja-auth",
    audience: "oja",
  };
  const credentials = new Map([["ada@example.ng", { userId: "u-ada", hash: await hashPassword("correct horse battery staple") }]]);

  const service = await startRpcService(obs, (rpc) => {
    rpc.register(createRPCProcedure("auth.login", async (input: { email: string; password: string }) => {
      const found = credentials.get(input.email);
      if (!found || !(await verifyPassword(input.password, found.hash))) throw new RPCAuthenticationError("Invalid credentials");
      return { accessToken: createTokenPair(toUserId(found.userId), tokens).accessToken };
    }, { input: LoginInput }));
    rpc.register(createRPCProcedure("auth.verify", async (input: { token: string }) => {
      const result = verifyAccessToken(input.token, tokens);
      if (!result.valid || !result.payload) throw new RPCAuthenticationError("Invalid or expired token");
      return { userId: result.payload.sub };
    }, { input: TokenInput, idempotent: true }));
  });
  return { ...service, obs };
}
```

users.service.ts

```ts
import { NotFoundError } from "@zudojs/errors";
import { createRPCProcedure } from "@zudojs/rpc";
import { schema } from "@zudojs/schema";
import { startRpcService } from "./rpc-kit.js";
import { observabilityFor } from "./telemetry.js";

const UserInput = schema.object({ userId: schema.string().max(64) });

/** Owns profiles: names and e-mail addresses. */
export async function startUsersService() {
  const obs = observabilityFor("users");
  const profiles = new Map([["u-ada", { userId: "u-ada", name: "Ada Obi", email: "ada@example.ng" }]]);
  const service = await startRpcService(obs, (rpc) => {
    rpc.register(createRPCProcedure("users.get", async (input: { userId: string }) => {
      const profile = profiles.get(input.userId);
      if (!profile) throw new NotFoundError(`User ${input.userId} not found`);
      return profile;
    }, { input: UserInput, idempotent: true }));
  });
  return { ...service, obs };
}
```

Try users on its own port, the way orders will call it, and the way an intruder would:

rpc-smoke.tsNode.js only

```ts
import "./demo-env.js";
import { isRPCError } from "@zudojs/rpc";
import { serviceClient } from "./rpc-kit.js";
import { observabilityFor, shutdownTelemetry } from "./telemetry.js";
import { startUsersService } from "./users.service.js";

const users = await startUsersService();
const obs = observabilityFor("orders");
const orders = serviceClient("orders", users.url, obs);
console.log(await orders.call("users.get", { userId: "u-ada" }));

const intruder = serviceClient("intruder", users.url, obs, { token: "guessed-token" });
const attempts: [string, () => Promise<unknown>][] = [
  ["unknown user", () => orders.call("users.get", { userId: "u-nobody" })],
  ["bad input", () => orders.call("users.get", { userId: 42 })],
  ["wrong token", () => intruder.call("users.get", { userId: "u-ada" })],
];
for (const [label, attempt] of attempts) {
  try {
    await attempt();
  } catch (error) {
    if (isRPCError(error)) console.log(label.padEnd(13), error.code, "-", error.message);
  }
}
await users.stop();
await shutdownTelemetry();
```

Output of `npx tsx rpc-smoke.ts`

```json
{ userId: 'u-ada', name: 'Ada Obi', email: 'ada@example.ng' }
unknown user  RPC_NOT_FOUND - User u-nobody not found
bad input     RPC_VALIDATION_ERROR - Invalid input for procedure "users.get".
wrong token   RPC_UNAUTHENTICATED - A valid service token is required.
```

An unknown user comes back as `RPC_NOT_FOUND` with the message of the `NotFoundError`, because that error is meant for callers. A payload of the wrong type never reaches the handler. And a caller with a guessed token is refused before any procedure runs.

**Payments** talks to a card processor through a `PaymentAdapter`, the contract from [the adapters lesson](https://zudojs.oyinlola.site/learn/zudo-adapters), registered in an `AdapterRegistry`. The sandbox adapter here stands in for the real processor and, like the real one, treats the reference as an idempotency key. The service also records every charge in its own database, keyed by the reference, so a repeated request is answered from its own records even after a restart:

payments.service.ts

```ts
import { PGlite } from "@electric-sql/pglite";
import { AdapterRegistry, createHealthyHealth } from "@zudojs/adapters";
import type { LifecycleAdapter } from "@zudojs/adapters";
import { createRPCProcedure } from "@zudojs/rpc";
import { schema } from "@zudojs/schema";
import { startRpcService } from "./rpc-kit.js";
import { observabilityFor } from "./telemetry.js";

export interface ChargeRequest { readonly reference: string; readonly amountKobo: number; readonly cardToken: string }
export type ChargeResult =
  | { readonly status: "succeeded"; readonly chargeId: string }
  | { readonly status: "declined"; readonly reason: string };

/** The provider contract, as in the adapters lesson. The sandbox stands in for a real card processor. */
export interface PaymentAdapter extends LifecycleAdapter {
  charge(request: ChargeRequest): Promise<ChargeResult>;
}
export class SandboxPayments implements PaymentAdapter {
  readonly name = "sandbox-payments";
  readonly capabilities = {};
  readonly charges = new Map<string, ChargeResult>();
  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const previous = this.charges.get(request.reference);
    if (previous) return previous;
    const result: ChargeResult = request.cardToken === "tok_declined"
      ? { status: "declined", reason: "insufficient funds" }
      : { status: "succeeded", chargeId: `ch_${this.charges.size + 1}` };
    this.charges.set(request.reference, result);
    return result;
  }
  health() { return createHealthyHealth(); }
}

export async function createPaymentsDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`create table charges (
    reference   text primary key,
    amount_kobo integer not null check (amount_kobo > 0),
    status      text not null,
    charge_id   text
  )`);
  return db;
}

const ChargeInput = schema.object({
  reference: schema.string().max(64),
  amountKobo: schema.number().int().min(1),
  cardToken: schema.string().max(64),
});

/** Owns charges. Its database outlives the process, so a restart keeps every charge. */
export async function startPaymentsService(options: { db: PGlite; provider: PaymentAdapter; port?: number }) {
  const obs = observabilityFor("payments");
  const adapters = new AdapterRegistry();
  adapters.register(options.provider);
  await adapters.initializeAll();

  const service = await startRpcService(obs, (rpc) => {
    rpc.register(createRPCProcedure("payments.charge", async (input: ChargeRequest) => {
      const saved = await options.db.query<{ status: string; charge_id: string | null }>(
        "select status, charge_id from charges where reference = $1", [input.reference]);
      if (saved.rows[0]) return { status: saved.rows[0].status, chargeId: saved.rows[0].charge_id, replayed: true };
      const result = await adapters.require<PaymentAdapter>("sandbox-payments").charge(input);
      const chargeId = result.status === "succeeded" ? result.chargeId : null;
      await options.db.query("insert into charges (reference, amount_kobo, status, charge_id) values ($1, $2, $3, $4)",
        [input.reference, input.amountKobo, result.status, chargeId]);
      return { status: result.status, chargeId, replayed: false };
    }, { input: ChargeInput, idempotent: true }));
  }, options.port);
  return { ...service, obs };
}
```

Call it the way orders will: the same charge twice, then while the service is down, then after a restart with the same database:

payments-demo.tsNode.js only

```ts
import "./demo-env.js";
import { createPaymentsDatabase, SandboxPayments, startPaymentsService } from "./payments.service.js";
import { serviceClient } from "./rpc-kit.js";
import { observabilityFor, shutdownTelemetry } from "./telemetry.js";

const db = await createPaymentsDatabase();
const provider = new SandboxPayments();
let payments = await startPaymentsService({ db, provider });
const orders = serviceClient("orders", payments.url, observabilityFor("orders"));
const charge = { reference: "order-41", amountKobo: 2_850_000, cardToken: "tok_visa" };

console.log(await orders.call("payments.charge", charge));
console.log(await orders.call("payments.charge", charge));

await payments.stop();
try {
  await orders.call("payments.charge", charge);
} catch (error) {
  console.log("while it is down:", (error as Error).name, "-", (error as Error).message);
}
payments = await startPaymentsService({ db, provider, port: payments.port });
console.log("after a restart:", await orders.call("payments.charge", charge));
console.log("charges at the card processor:", provider.charges.size);
await payments.stop();
await db.close();
await shutdownTelemetry();
```

Output of `npx tsx payments-demo.ts`

```json
{ status: 'succeeded', chargeId: 'ch_1', replayed: false }
{ status: 'succeeded', chargeId: 'ch_1', replayed: true }
while it is down: RPCUnavailableError - payments.charge did not answer.
after a restart: { status: 'succeeded', chargeId: 'ch_1', replayed: true }
charges at the card processor: 1
```

The second call was answered from the service's own records (`replayed: true`). While the service was down, the caller got `RPCUnavailableError` after its timeout, a signal it can act on. After the restart the charge was still known, because the records live in the database and not in the process. The card processor saw one charge.

## Events and their contracts

Orders announces a paid order with an `order.paid` event. Between services, an event is *text* on a broker (RabbitMQ, Kafka, NATS), not an object in memory, and the service that reads it may be a year newer or older than the one that wrote it.

REASON IT OUT

### What may a consumer trust about an event?

Notifications receives `order.paid`. Can it trust that the body is valid JSON? That the `paidAt` field is a `Date`? That it will receive each event only once? That the event has the shape it was written for? What should it do with an event it cannot read: throw, retry, or set it aside?

**Show the reasoning**

None of it. The body is text from another program, so it is parsed and checked like any request body. A plain JSON `Date` arrives as a string, so the payload travels in a **serialization envelope** from [@zudojs/serialization](https://zudojs.oyinlola.site/learn/zudo-serialization#envelopes), which keeps types and records a format version; the payload itself also carries a version field, `v`, that the consumer checks. The outbox delivers **at least once**, so duplicates are normal and the consumer must be idempotent. An event that cannot be read will not become readable by retrying it, so it is set aside for a person (here, a `rejected` list; in production, a dead-letter queue), and the consumer moves on.

broker.ts

```ts
import { createEventBus } from "@zudojs/events";
import { createSerializer, deserializeFromEnvelope, serializeToEnvelope } from "@zudojs/serialization";
import type { SerializedEnvelope } from "@zudojs/serialization";

const serializer = createSerializer("json", { preserveTypes: true });

/** Turns an event payload into the text that is stored and sent: a versioned serialization envelope. */
export function encodeEvent(payload: object): string {
  return JSON.stringify(serializeToEnvelope(payload, serializer));
}
/** The other direction. Throws on a malformed body or an envelope from a newer schema. */
export function decodeEvent<T>(body: string): T {
  return deserializeFromEnvelope<T>(JSON.parse(body) as SerializedEnvelope, serializer, "json");
}

export interface BrokerMessage {
  readonly body: string;
  readonly traceparent?: string;
}

/** Stands in for RabbitMQ, Kafka or NATS: text in, text out, every subscriber of a topic gets a copy. */
export function createBroker() {
  const bus = createEventBus();
  return {
    /** Delivers to every subscriber and returns how many of them failed. */
    async publish(topic: string, message: BrokerMessage): Promise<number> {
      return (await bus.publishEvent({ type: topic, payload: message })).failed;
    },
    subscribe(topic: string, handler: (message: BrokerMessage) => Promise<void>): void {
      bus.on(topic, (event) => handler(event.payload as BrokerMessage));
    },
  };
}
export type Broker = ReturnType<typeof createBroker>;
```

The broker here is an in-process event bus that only ever carries `{ body, traceparent }`: a string and a header, like a real broker. Everything a consumer needs must be inside those two.

## Orders: the conductor

Orders does the most work, and every step is designed to survive being run twice or being interrupted:

1. `orders.place` looks up the cart's `orderKey` (the customer's idempotency key) first, and `unique (user_id, order_key)` backs that up for two submissions at the same instant.
2. It prices the cart from its own price list (a price from the client would be a gift), fetches the customer's e-mail from users, and saves the order as `pending`.
3. It calls payments with the reference `order-<id>`. If payments does not answer (`isUnavailable`: unavailable, timed out or unreachable), the order becomes `pending_payment` and a job goes into a **retry queue** with exponential backoff, carrying the current `traceparent` so the retry joins the same trace.
4. When the charge succeeds, the order becomes `paid` and the `order.paid` event is written to the **outbox**, in the same transaction. A scheduled relay publishes outbox rows to the broker and marks them published.

orders.service.ts

```ts
import { PGlite } from "@electric-sql/pglite";
import { NotFoundError, ValidationError } from "@zudojs/errors";
import { parseTraceparent, SpanKind, withSpan } from "@zudojs/observability";
import { createExponentialBackoff, createInMemoryQueue, createQueueName } from "@zudojs/queue";
import { createRPCProcedure } from "@zudojs/rpc";
import { Scheduler } from "@zudojs/scheduler";
import { schema } from "@zudojs/schema";
import { encodeEvent } from "./broker.js";
import type { Broker } from "./broker.js";
import { currentTraceparent, isUnavailable, serviceClient, startRpcService } from "./rpc-kit.js";
import { observabilityFor } from "./telemetry.js";

export interface OrderView { readonly id: number; readonly status: string; readonly totalKobo: number }
/** Version 1 of the order.paid event. Consumers check `v` before trusting the rest. */
export interface OrderPaidV1 {
  readonly v: 1;
  readonly orderId: number;
  readonly email: string;
  readonly totalKobo: number;
  readonly paidAt: Date;
}

const PRICES: Record<string, number> = { "rice-5kg": 1_250_000, "palm-oil-1l": 350_000 };
const PlaceInput = schema.object({
  userId: schema.string().max(64),
  orderKey: schema.string().min(8).max(64),
  cardToken: schema.string().max(64),
  items: schema.array(schema.object({ sku: schema.string().max(40), quantity: schema.number().int().min(1).max(50) })).min(1).max(20),
});
type PlaceOrder = { userId: string; orderKey: string; cardToken: string; items: { sku: string; quantity: number }[] };
const GetInput = schema.object({ userId: schema.string().max(64), orderId: schema.number().int().min(1) });

export async function createOrdersDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create table orders (
      id             serial primary key,
      user_id        text not null,
      order_key      text not null,
      customer_email text not null,
      card_token     text not null,
      total_kobo     integer not null check (total_kobo > 0),
      status         text not null check (status in ('pending', 'pending_payment', 'paid', 'declined')),
      unique (user_id, order_key)
    );
    create table outbox (id serial primary key, topic text not null, body text not null, traceparent text, published_at timestamptz);
  `);
  return db;
}

/** Owns orders. Calls users and payments over RPC; announces paid orders through the broker. */
export async function startOrdersService(options: { db: PGlite; broker: Broker; usersUrl: string; paymentsUrl: string }) {
  const { db, broker } = options;
  const obs = observabilityFor("orders");
  const users = serviceClient("orders", options.usersUrl, obs);
  const payments = serviceClient("orders", options.paymentsUrl, obs, { timeout: 1_000 });
  const view = async (id: number): Promise<OrderView> =>
    (await db.query<OrderView>(`select id, status, total_kobo as "totalKobo" from orders where id = $1`, [id])).rows[0]!;

  async function charge(orderId: number): Promise<void> {
    const { rows } = await db.query<{ status: string; total_kobo: number; card_token: string; customer_email: string }>(
      "select status, total_kobo, card_token, customer_email from orders where id = $1", [orderId]);
    const order = rows[0];
    if (!order || (order.status !== "pending" && order.status !== "pending_payment")) return;
    const result = await payments.call<object, { status: string; chargeId: string | null }>("payments.charge",
      { reference: `order-${orderId}`, amountKobo: order.total_kobo, cardToken: order.card_token });
    if (result.status !== "succeeded") {
      await db.query("update orders set status = 'declined' where id = $1", [orderId]);
      return;
    }
    const event: OrderPaidV1 = { v: 1, orderId, email: order.customer_email, totalKobo: order.total_kobo, paidAt: new Date() };
    await db.transaction(async (tx) => {
      await tx.query("update orders set status = 'paid' where id = $1", [orderId]);
      await tx.query("insert into outbox (topic, body, traceparent) values ('order.paid', $1, $2)", [encodeEvent(event), currentTraceparent()]);
    });
  }

  const retries = createInMemoryQueue<{ orderId: number; traceparent?: string }>(createQueueName("payment-retries"), {
    defaultJobOptions: { attempts: 8, backoff: createExponentialBackoff(200, { jitter: "none", maxDelay: 5_000 }) },
  });
  retries.process("charge", (job) => withSpan(obs.tracer, "retry payment", () => charge(job.data.orderId),
    { parent: parseTraceparent(job.data.traceparent ?? "") }));

  /** The outbox relay: publishes committed events, in order, at least once. */
  async function relay(): Promise<number> {
    const { rows } = await db.query<{ id: number; topic: string; body: string; traceparent: string | null }>(
      "select id, topic, body, traceparent from outbox where published_at is null order by id limit 50");
    for (const row of rows) {
      await withSpan(obs.tracer, `publish ${row.topic}`, () => broker.publish(row.topic, { body: row.body, traceparent: currentTraceparent() }),
        { kind: SpanKind.PRODUCER, parent: parseTraceparent(row.traceparent ?? "") });
      await db.query("update outbox set published_at = now() where id = $1", [row.id]);
    }
    return rows.length;
  }
  const scheduler = new Scheduler();
  scheduler.define({ id: "relay", name: "Publish the outbox", handler: async () => { await relay(); } });
  scheduler.every("20ms", "relay", { overlap: "skip" });
  scheduler.start();

  const service = await startRpcService(obs, (rpc) => {
    rpc.register(createRPCProcedure("orders.place", async (input: PlaceOrder) => {
      const existing = await db.query<{ id: number }>("select id from orders where user_id = $1 and order_key = $2", [input.userId, input.orderKey]);
      if (existing.rows[0]) return view(existing.rows[0].id);
      let total = 0;
      for (const item of input.items) {
        const price = PRICES[item.sku];
        if (price === undefined) throw new ValidationError(`Unknown product ${item.sku}`);
        total += price * item.quantity;
      }
      const user = await users.call<{ userId: string }, { email: string }>("users.get", { userId: input.userId });
      const { rows } = await db.query<{ id: number }>(
        `insert into orders (user_id, order_key, customer_email, card_token, total_kobo, status)
         values ($1, $2, $3, $4, $5, 'pending') on conflict (user_id, order_key) do nothing returning id`,
        [input.userId, input.orderKey, user.email, input.cardToken, total]);
      if (!rows[0]) return view((await db.query<{ id: number }>(
        "select id from orders where user_id = $1 and order_key = $2", [input.userId, input.orderKey])).rows[0]!.id);
      const orderId = rows[0].id;
      try {
        await charge(orderId);
      } catch (error) {
        if (!isUnavailable(error)) throw error;
        await db.query("update orders set status = 'pending_payment' where id = $1", [orderId]);
        await retries.add("charge", { orderId, traceparent: currentTraceparent() }, { deduplicationKey: `order-${orderId}` });
      }
      return view(orderId);
    }, { input: PlaceInput }));
    rpc.register(createRPCProcedure("orders.get", async (input: { userId: string; orderId: number }) => {
      const { rows } = await db.query<{ id: number }>("select id from orders where id = $1 and user_id = $2", [input.orderId, input.userId]);
      if (!rows[0]) throw new NotFoundError(`Order ${input.orderId} not found`);
      return view(rows[0].id);
    }, { input: GetInput, idempotent: true }));
  });

  return {
    ...service,
    obs,
    retries,
    async stop(): Promise<void> {
      await scheduler.stop();
      await retries.close();
      await service.stop();
    },
  };
}
```

Why an outbox, instead of publishing right after the update? Because the process can die between the two, and then the order is paid and nobody hears about it: no receipt, ever. With the outbox, the event is committed with the order, and the relay keeps trying until it is published. The price is that the relay can publish a row twice (it crashed after publishing, before marking), which is why consumers must be idempotent.

> THE TYPE ARGUMENTS ARE NOT CHECKED
>
> In `payments.call<object, { status: string; chargeId: string | null }>(…)`, the second type is only what orders *believes* payments returns. Nothing checks it at runtime, exactly like `client.call<I, O>` in [the RPC lesson](https://zudojs.oyinlola.site/learn/zudo-rpc#client) and `bus.on<T>` in the events lesson. When two teams release independently, validate answers you depend on with a schema, as you validate requests.

## Notifications: a service with no API

Notifications has no RPC procedures at all: nobody can ask it to do anything, it only reacts to `order.paid`. The consumer decodes the envelope, checks the version, and adds a receipt job to its own queue with `deduplicationKey: receipt-<orderId>`, so a duplicate event while the first receipt is still queued is dropped. The mail adapter also dedupes by key, which covers a duplicate that arrives after the first receipt was sent. The job retries a failing mail provider with backoff.

notifications.service.ts

```ts
import { AdapterConnectionError, createHealthyHealth } from "@zudojs/adapters";
import { JobDuplicateError } from "@zudojs/errors";
import type { LifecycleAdapter } from "@zudojs/adapters";
import { parseTraceparent, SpanKind, withSpan } from "@zudojs/observability";
import { createExponentialBackoff, createInMemoryQueue, createQueueName } from "@zudojs/queue";
import { decodeEvent } from "./broker.js";
import type { Broker } from "./broker.js";
import type { OrderPaidV1 } from "./orders.service.js";
import { currentTraceparent } from "./rpc-kit.js";
import { observabilityFor } from "./telemetry.js";

export interface Mail { readonly key: string; readonly to: string; readonly subject: string }
export interface MailAdapter extends LifecycleAdapter {
  send(mail: Mail): Promise<void>;
}
/** A sandbox mail provider: remembers what it delivered, dedupes by key, can be told to fail. */
export class SandboxMail implements MailAdapter {
  readonly name = "sandbox-mail";
  readonly capabilities = {};
  readonly inbox: Mail[] = [];
  failNext = 0;
  async send(mail: Mail): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new AdapterConnectionError(this.name, new Error("SMTP connection refused"));
    }
    if (!this.inbox.some((sent) => sent.key === mail.key)) this.inbox.push(mail);
  }
  health() { return createHealthyHealth(); }
}

type Receipt = OrderPaidV1 & { readonly traceparent?: string };

/** Owns e-mails. It has no RPC API at all: it only reacts to events. */
export function startNotificationsService(options: { broker: Broker; mail: MailAdapter }) {
  const obs = observabilityFor("notifications");
  const rejected: string[] = [];
  const receipts = createInMemoryQueue<Receipt>(createQueueName("receipts"), {
    defaultJobOptions: { attempts: 6, backoff: createExponentialBackoff(50, { jitter: "none", maxDelay: 400 }) },
  });
  receipts.process("receipt", (job) => withSpan(obs.tracer, "send receipt", () => options.mail.send({
    key: `receipt-${job.data.orderId}`,
    to: job.data.email,
    subject: `Receipt for order ${job.data.orderId}: ${job.data.totalKobo / 100} naira`,
  }), { parent: parseTraceparent(job.data.traceparent ?? "") }));

  options.broker.subscribe("order.paid", (message) => withSpan(obs.tracer, "consume order.paid", async () => {
    let event: OrderPaidV1;
    try {
      event = decodeEvent<OrderPaidV1>(message.body);
      if (event.v !== 1 || !(event.paidAt instanceof Date)) throw new Error(`unsupported order.paid version ${String(event.v)}`);
    } catch (error) {
      rejected.push((error as Error).message);
      return;
    }
    try {
      await receipts.add("receipt", { ...event, traceparent: currentTraceparent() }, { deduplicationKey: `receipt-${event.orderId}` });
    } catch (error) {
      if (!(error instanceof JobDuplicateError)) throw error;
    }
  }, { kind: SpanKind.CONSUMER, parent: parseTraceparent(message.traceparent ?? "") }));

  return { obs, receipts, rejected, stop: () => receipts.close() };
}
```

`JobDuplicateError` comes from @zudojs/errors, where all ZudoJS errors live; @zudojs/queue throws it but does not re-export it. Here is the consumer under stress: the mail provider fails twice, the same event is delivered twice, a newer producer sends version 2, and something sends a broken body:

events-demo.tsNode.js only

```ts
import { createBroker, encodeEvent } from "./broker.js";
import { startNotificationsService, SandboxMail } from "./notifications.service.js";
import { shutdownTelemetry } from "./telemetry.js";
import { waitFor } from "./wait.js";

const broker = createBroker();
const mail = new SandboxMail();
const notifications = startNotificationsService({ broker, mail });
mail.failNext = 2;

const paid = { v: 1, orderId: 7, email: "ada@example.ng", totalKobo: 2_850_000, paidAt: new Date("2026-10-05T09:00:00Z") };
const body = encodeEvent(paid);
console.log(body);

for (let delivery = 1; delivery <= 2; delivery++) {
  const result = await broker.publish("order.paid", { body });
  console.log(`delivery ${delivery}: handler failures`, result);
}
await broker.publish("order.paid", { body: encodeEvent({ ...paid, v: 2, orderId: 8 }) });
await broker.publish("order.paid", { body: "{ not json" });

await waitFor(async () => mail.inbox.length === 1 && (await notifications.receipts.getStats()).waiting === 0);
console.log("inbox:", mail.inbox.map((sent) => `${sent.key} to ${sent.to}`));
console.log("retries:", (await notifications.receipts.getStats()).retried);
console.log("rejected:", notifications.rejected.map((reason) => reason.slice(0, 40)));
await notifications.stop();
await shutdownTelemetry();
```

Output of `npx tsx events-demo.ts`

```json
{"metadata":{"format":"json","version":1,"contentType":"application/json","encoding":"utf-8"},"data":"{\"v\":1,\"orderId\":7,\"email\":\"ada@example.ng\",\"totalKobo\":2850000,\"paidAt\":{\"$type\":\"Date\",\"$value\":\"2026-10-05T09:00:00.000Z\"}}"}
delivery 1: handler failures 0
delivery 2: handler failures 0
inbox: [ 'receipt-7 to ada@example.ng' ]
retries: 2
rejected: [
  'unsupported order.paid version 2',
  "Expected property name or '}' in JSON at"
]
```

The envelope keeps `paidAt` as a `Date` and records `version: 1` of the envelope format. Both deliveries of order 7 were handled without errors, and the customer got one receipt, after two retries. The version 2 event and the broken body were set aside with a reason, not retried and not allowed to crash the consumer. When orders starts publishing version 2, notifications must learn to read it *first*: consumers are upgraded before producers.

## The gateway, and one request through everything

The gateway is the only service with a public port. For each route it starts a SERVER span, verifies the bearer token with auth, forwards the work to orders, returns the trace id in an `x-trace-id` header (support asks the customer for it), and turns RPC errors into HTTP answers: unauthenticated into 401, not found into 404, validation into 400, and "a service did not answer" into 503. Anything else is an internal error and becomes a 500 without details. The order's state picks the status: `201` paid, `202` accepted but payment pending, `402` declined.

gateway.ts

```ts
import { badRequest, createHttpServer, createNodeHttpAdapter, createResponseContext, createRouter, notFound, serviceUnavailable, unauthorized } from "@zudojs/http";
import type { HttpRouterContext } from "@zudojs/http";
import { getCurrentContext, SpanKind, withSpan } from "@zudojs/observability";
import type { Observability } from "@zudojs/observability";
import { isRPCError, RPCAuthenticationError } from "@zudojs/rpc";
import type { OrderView } from "./orders.service.js";
import { isUnavailable, serviceClient } from "./rpc-kit.js";
import { observabilityFor } from "./telemetry.js";

type Handler = (ctx: HttpRouterContext) => Promise<{ status: number; body: unknown }>;

/** Every public route: a SERVER span, the trace id in the response, and RPC errors turned into HTTP answers. */
function route(obs: Observability, name: string, handler: Handler) {
  return (ctx: HttpRouterContext) => withSpan(obs.tracer, name, async () => {
    const traceId = getCurrentContext()?.traceId ?? "";
    try {
      const { status, body } = await handler(ctx);
      return createResponseContext().setStatus(status).setHeader("x-trace-id", traceId).json(body);
    } catch (error) {
      if (error instanceof RPCAuthenticationError) throw unauthorized(error.message);
      if (isRPCError(error) && error.code === "RPC_NOT_FOUND") throw notFound("Not found");
      if (isRPCError(error) && error.code === "RPC_VALIDATION_ERROR") throw badRequest(error.message);
      if (isUnavailable(error)) throw serviceUnavailable("A service is not answering. Please try again shortly.");
      throw error;
    }
  }, { kind: SpanKind.SERVER });
}

function readJson(ctx: HttpRouterContext): Record<string, unknown> {
  try {
    return JSON.parse(new TextDecoder().decode(ctx.request.body as Uint8Array)) as Record<string, unknown>;
  } catch {
    throw badRequest("Body must be JSON");
  }
}

/** The only service the internet can reach. It checks who is calling and forwards the work. */
export async function startGateway(options: { authUrl: string; ordersUrl: string }) {
  const obs = observabilityFor("gateway");
  const auth = serviceClient("gateway", options.authUrl, obs);
  const orders = serviceClient("gateway", options.ordersUrl, obs);
  const userOf = async (ctx: HttpRouterContext): Promise<string> => {
    const token = ctx.request.getHeader("authorization")?.replace(/^Bearer /, "") ?? "";
    return (await auth.call<{ token: string }, { userId: string }>("auth.verify", { token })).userId;
  };

  const router = createRouter();
  router.post("/login", route(obs, "POST /login", async (ctx) => ({
    status: 200,
    body: await auth.call("auth.login", readJson(ctx)),
  })));
  router.post("/orders", route(obs, "POST /orders", async (ctx) => {
    const userId = await userOf(ctx);
    const orderKey = ctx.request.getHeader("idempotency-key");
    if (!orderKey) throw badRequest("Idempotency-Key header required");
    const body = readJson(ctx);
    const order = await orders.call<object, OrderView>("orders.place", { userId, orderKey, items: body.items, cardToken: body.cardToken });
    return { status: order.status === "paid" ? 201 : order.status === "pending_payment" ? 202 : 402, body: order };
  }));
  router.get("/orders/:id", route(obs, "GET /orders/:id", async (ctx) => ({
    status: 200,
    body: await orders.call("orders.get", { userId: await userOf(ctx), orderId: Number(ctx.params.id) }),
  })));

  const server = createHttpServer({
    adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
    handler: async (request) => (await router.dispatch(request)).response,
  });
  await server.start();
  return { url: `http://127.0.0.1:${server.address?.port}`, obs, stop: () => server.stop() };
}
```

`startPlatform` starts all six, each on its own port, and lets a test stop and restart payments on the same port with the same database, like a crashed and restarted service:

platform.ts

```ts
import { startAuthService } from "./auth.service.js";
import { createBroker } from "./broker.js";
import { startGateway } from "./gateway.js";
import { startNotificationsService, SandboxMail } from "./notifications.service.js";
import { createOrdersDatabase, startOrdersService } from "./orders.service.js";
import { createPaymentsDatabase, SandboxPayments, startPaymentsService } from "./payments.service.js";
import { shutdownTelemetry } from "./telemetry.js";
import { startUsersService } from "./users.service.js";

/** Starts the six services in one process, each on its own port, as they would run on six machines. */
export async function startPlatform() {
  const broker = createBroker();
  const paymentsDb = await createPaymentsDatabase();
  const provider = new SandboxPayments();
  const auth = await startAuthService();
  const users = await startUsersService();
  let payments = await startPaymentsService({ db: paymentsDb, provider });
  const paymentsPort = payments.port;
  const ordersDb = await createOrdersDatabase();
  const orders = await startOrdersService({ db: ordersDb, broker, usersUrl: users.url, paymentsUrl: payments.url });
  const mail = new SandboxMail();
  const notifications = startNotificationsService({ broker, mail });
  const gateway = await startGateway({ authUrl: auth.url, ordersUrl: orders.url });

  return {
    gateway, orders, ordersDb, notifications, mail, provider,
    /** Crashes the payments service: its port stops answering. */
    stopPayments: () => payments.stop(),
    /** Starts payments again on the same port, with the same database. */
    async startPayments(): Promise<void> {
      payments = await startPaymentsService({ db: paymentsDb, provider, port: paymentsPort });
    },
    async stop(): Promise<void> {
      await gateway.stop();
      await notifications.stop();
      await orders.stop();
      await payments.stop().catch(() => {});
      await users.stop();
      await auth.stop();
      await ordersDb.close();
      await paymentsDb.close();
      await shutdownTelemetry();
    },
  };
}
```

Ada logs in, orders two bags of rice and a bottle of palm oil, and, because the page was slow, presses "Pay" a second time with the same cart:

story.tsNode.js only

```ts
import "./demo-env.js";
import { startPlatform } from "./platform.js";
import { printTrace } from "./telemetry.js";

const platform = await startPlatform();
const api = platform.gateway.url;

const login = await fetch(`${api}/login`, { method: "POST", body: JSON.stringify({ email: "ada@example.ng", password: "correct horse battery staple" }) });
const { accessToken } = (await login.json()) as { accessToken: string };
const headers = { authorization: `Bearer ${accessToken}`, "idempotency-key": "cart-7f3a9c21" };
const cart = { items: [{ sku: "rice-5kg", quantity: 2 }, { sku: "palm-oil-1l", quantity: 1 }], cardToken: "tok_visa" };

const placed = await fetch(`${api}/orders`, { method: "POST", headers, body: JSON.stringify(cart) });
console.log("POST /orders", placed.status, await placed.text());
const again = await fetch(`${api}/orders`, { method: "POST", headers, body: JSON.stringify(cart) });
console.log("POST /orders again", again.status, await again.text());

while (platform.mail.inbox.length === 0) await new Promise((resolve) => setTimeout(resolve, 10));
console.log("inbox:", platform.mail.inbox);
console.log("charges at the provider:", platform.provider.charges.size);
console.log("trace:");
await printTrace(placed.headers.get("x-trace-id") ?? "");
await platform.stop();
```

Output of `npx tsx story.ts`

```ts
POST /orders 201 {"id":1,"status":"paid","totalKobo":2850000}
POST /orders again 201 {"id":1,"status":"paid","totalKobo":2850000}
inbox: [
  {
    key: 'receipt-1',
    to: 'ada@example.ng',
    subject: 'Receipt for order 1: 28500 naira'
  }
]
charges at the provider: 1
trace:
POST /orders [gateway]
  call auth.verify [gateway]
    auth.verify [auth]
  call orders.place [gateway]
    orders.place [orders]
      call users.get [orders]
        users.get [users]
      call payments.charge [orders]
        payments.charge [payments]
      publish order.paid [orders]
        consume order.paid [notifications]
          send receipt [notifications]
```

The second submission returned the same order, and the card processor made one charge. The receipt arrived by e-mail a moment after the answer. And the trace shows the whole journey: the gateway verified the token with auth and called orders; orders fetched the e-mail from users and charged through payments; the relay published `order.paid`, which notifications consumed and turned into a receipt. Six services and a broker, one trace, because every hop carried the `traceparent`: RPC in its metadata, the outbox in a column, the broker in a header.

The gateway is also where mistakes meet the customer, so check what each one looks like from outside:

gateway-errors.tsNode.js only

```ts
import "./demo-env.js";
import { startPlatform } from "./platform.js";

const platform = await startPlatform();
const api = platform.gateway.url;
const login = await fetch(`${api}/login`, { method: "POST", body: JSON.stringify({ email: "ada@example.ng", password: "correct horse battery staple" }) });
const { accessToken } = (await login.json()) as { accessToken: string };
const auth = { authorization: `Bearer ${accessToken}` };

const calls: [string, string, RequestInit][] = [
  ["wrong password", "/login", { method: "POST", body: JSON.stringify({ email: "ada@example.ng", password: "guess" }) }],
  ["forged token", "/orders/1", { headers: { authorization: "Bearer eyJhbGciOiJub25lIn0.e30." } }],
  ["no idempotency key", "/orders", { method: "POST", headers: auth, body: "{}" }],
  ["unknown product", "/orders", { method: "POST", headers: { ...auth, "idempotency-key": "cart-abcdef12" },
    body: JSON.stringify({ items: [{ sku: "caviar", quantity: 1 }], cardToken: "tok_visa" }) }],
  ["someone else's order", "/orders/99", { headers: auth }],
];
for (const [label, path, init] of calls) {
  const res = await fetch(api + path, init);
  console.log(label.padEnd(21), res.status, await res.text());
}
await platform.stop();
```

Output of `npx tsx gateway-errors.ts`

```ts
wrong password        401 {"error":"Invalid credentials","code":"UNAUTHORIZED"}
forged token          401 {"error":"Invalid or expired token","code":"UNAUTHORIZED"}
no idempotency key    400 {"error":"Idempotency-Key header required","code":"BAD_REQUEST"}
unknown product       400 {"error":"Unknown product caviar","code":"BAD_REQUEST"}
someone else's order  404 {"error":"Not found","code":"NOT_FOUND"}
```

Each failure has the right status and a message that helps without revealing anything: auth's messages for a bad password and a forged token, the validation message from orders for an unknown product, and a plain 404 for an order that belongs to someone else, the same as one that does not exist.

## Payments goes down

REASON IT OUT

### What should the customer see when payments is down?

The customer presses "Pay" and payments does not answer within its timeout. Options: show an error and lose the sale; retry inside the request until it works; or accept the order and charge later. Which one, and what must be true for it to be safe? What must the customer be told? What if payments actually charged the card before it stopped answering?

**Show the reasoning**

Accept the order and charge later, and say so honestly: `202` with `status: "pending_payment"`, not a `201` that pretends it is paid. Retrying inside the request only makes the customer wait longer for the same outage. Charging later is safe because the charge carries the reference `order-<id>`: if payments did charge before it stopped answering, the retry is answered from its records, not charged again. The unknown outcome from [the adapters lesson](https://zudojs.oyinlola.site/learn/zudo-adapters#timeouts) becomes a known one later. For a shop that ships after payment, "pending" is fine; a ticket for a concert that sells out in a minute might need the opposite choice.

outage.tsNode.js only

```ts
import "./demo-env.js";
import { startPlatform } from "./platform.js";
import { printTrace } from "./telemetry.js";

const platform = await startPlatform();
const api = platform.gateway.url;
const login = await fetch(`${api}/login`, { method: "POST", body: JSON.stringify({ email: "ada@example.ng", password: "correct horse battery staple" }) });
const { accessToken } = (await login.json()) as { accessToken: string };
const auth = { authorization: `Bearer ${accessToken}` };
const cart = JSON.stringify({ items: [{ sku: "rice-5kg", quantity: 1 }], cardToken: "tok_visa" });

await platform.stopPayments();
console.log("payments is down");
const placed = await fetch(`${api}/orders`, { method: "POST", headers: { ...auth, "idempotency-key": "cart-0b1d2e3f" }, body: cart });
console.log("POST /orders", placed.status, await placed.text());
const read = await fetch(`${api}/orders/1`, { headers: auth });
console.log("GET /orders/1", read.status, await read.text());
while ((await platform.orders.retries.getStats()).retried === 0) await new Promise((resolve) => setTimeout(resolve, 10));
console.log("first retry failed too; e-mails so far:", platform.mail.inbox.length);

await platform.startPayments();
console.log("payments is back");
while (platform.mail.inbox.length === 0) await new Promise((resolve) => setTimeout(resolve, 10));
const after = await fetch(`${api}/orders/1`, { headers: auth });
console.log("GET /orders/1", after.status, await after.text());
console.log("charges:", platform.provider.charges.size, "e-mails:", platform.mail.inbox.length);
console.log("trace:");
await printTrace(placed.headers.get("x-trace-id") ?? "");
await platform.stop();
```

Output of `npx tsx outage.ts`

```ts
payments is down
POST /orders 202 {"id":1,"status":"pending_payment","totalKobo":1250000}
GET /orders/1 200 {"id":1,"status":"pending_payment","totalKobo":1250000}
first retry failed too; e-mails so far: 0
payments is back
GET /orders/1 200 {"id":1,"status":"paid","totalKobo":1250000}
charges: 1 e-mails: 1
trace:
POST /orders [gateway]
  call auth.verify [gateway]
    auth.verify [auth]
  call orders.place [gateway]
    orders.place [orders]
      call users.get [orders]
        users.get [users]
      call payments.charge [orders]  ERROR payments.charge did not answer.
      retry payment [orders]  ERROR payments.charge did not answer.
        call payments.charge [orders]  ERROR payments.charge did not answer.
      retry payment [orders]
        call payments.charge [orders]
          payments.charge [payments]
        publish order.paid [orders]
          consume order.paid [notifications]
            send receipt [notifications]
```

While payments was down, the order was accepted with `202` and could be read back as `pending_payment`; the first retry failed too. When payments came back on the same port, the next retry charged the card once, and the receipt followed. The trace tells the whole story, and this is where tracing earns its keep: the failed call inside the request, a failed retry, then the successful retry, and the outbox, broker and notifications continuing from *that* retry, all under the trace id the customer was given.

## The test suite

The suite runs one platform and attacks it the way production will: bad logins, double submissions, a dead payments service, a failing mail provider and a declined card. It uses the `vitest-run.ts` helper from [Testing ZudoJS applications](https://zudojs.oyinlola.site/learn/zudo-testing-apps#setup); on your computer, run `npx vitest run`.

vitest.config.ts

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["tests/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 60_000 } });
```

vitest-run.ts

```ts
import { startVitest } from "vitest/node";

/** Runs test files with Vitest and prints one line per test. */
export async function runTests(...files: string[]): Promise<void> {
  const vitest = await startVitest("test", files, { watch: false, reporters: [] });
  for (const file of vitest.state.getTestModules()) {
    for (const error of file.errors()) console.log(`× ${file.relativeModuleId}: ${error.message}`);
    for (const test of file.children.allTests()) {
      const { state, errors = [] } = test.result();
      console.log(`${state === "passed" ? "✓" : "×"} ${test.fullName}`);
      for (const error of errors) console.log(`    ${error.message}`);
    }
  }
  await vitest.close();
}
```

tests/platform.test.ts

```ts
import "../demo-env.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPlatform } from "../platform.js";
import { flushTelemetry, spans } from "../telemetry.js";
import { waitFor } from "../wait.js";

let platform: Awaited<ReturnType<typeof startPlatform>>;
let token = "";
beforeAll(async () => {
  platform = await startPlatform();
  const login = await fetch(`${platform.gateway.url}/login`, {
    method: "POST", body: JSON.stringify({ email: "ada@example.ng", password: "correct horse battery staple" }),
  });
  token = ((await login.json()) as { accessToken: string }).accessToken;
});
afterAll(() => platform.stop());

const order = (key: string, cardToken = "tok_visa") => fetch(`${platform.gateway.url}/orders`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "idempotency-key": key },
  body: JSON.stringify({ items: [{ sku: "rice-5kg", quantity: 1 }], cardToken }),
});
const receiptFor = (orderId: number) => platform.mail.inbox.filter((mail) => mail.key === `receipt-${orderId}`);

describe("the shop platform", () => {
  it("refuses a request without a valid login at the gateway", async () => {
    const res = await fetch(`${platform.gateway.url}/orders`, { method: "POST", headers: { "idempotency-key": "cart-00000000" }, body: "{}" });
    expect(res.status).toBe(401);
  });

  it("places, charges and confirms an order in one trace across all six services", async () => {
    const res = await order("cart-11111111");
    const body = (await res.json()) as { id: number };
    expect(res.status).toBe(201);
    await waitFor(async () => receiptFor(body.id).length === 1);
    await flushTelemetry();
    const trace = spans.filter((span) => span.context.traceId === res.headers.get("x-trace-id"));
    expect(new Set(trace.map((span) => span.resource["service.name"]))).toEqual(
      new Set(["gateway", "auth", "orders", "users", "payments", "notifications"]));
  });

  it("charges once however often the same cart is submitted", async () => {
    const before = platform.provider.charges.size;
    const answers = await Promise.all([order("cart-22222222"), order("cart-22222222")]);
    const ids = await Promise.all(answers.map(async (res) => ((await res.json()) as { id: number }).id));
    expect(ids[0]).toBe(ids[1]);
    expect(platform.provider.charges.size - before).toBe(1);
  });

  it("accepts orders while payments is down, and charges them when it is back", async () => {
    await platform.stopPayments();
    const res = await order("cart-33333333");
    const body = (await res.json()) as { id: number; status: string };
    expect([res.status, body.status]).toEqual([202, "pending_payment"]);
    await platform.startPayments();
    await waitFor(async () => receiptFor(body.id).length === 1, 20_000);
  });

  it("keeps selling when the mail provider fails, and sends the receipt later", async () => {
    platform.mail.failNext = 3;
    const res = await order("cart-44444444");
    const body = (await res.json()) as { id: number };
    expect(res.status).toBe(201);
    await waitFor(async () => receiptFor(body.id).length === 1);
  });

  it("answers a declined card with 402 and sends no receipt", async () => {
    const res = await order("cart-55555555", "tok_declined");
    const body = (await res.json()) as { id: number; status: string };
    expect([res.status, body.status]).toEqual([402, "declined"]);
    expect(receiptFor(body.id)).toEqual([]);
  });
});
```

run-tests.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";
await runTests("tests/platform.test.ts");
```

Output of `npx tsx run-tests.ts`

```ts
✓ the shop platform > refuses a request without a valid login at the gateway
✓ the shop platform > places, charges and confirms an order in one trace across all six services
✓ the shop platform > charges once however often the same cart is submitted
✓ the shop platform > accepts orders while payments is down, and charges them when it is back
✓ the shop platform > keeps selling when the mail provider fails, and sends the receipt later
✓ the shop platform > answers a declined card with 402 and sends no receipt
```

- **The trace test** checks the set of services in one trace. If anyone adds a hop that forgets to pass the `traceparent`, the trace breaks in two and this test names the service that went missing.
- **The double submission** is sent with `Promise.all`, at the same instant, and the test counts charges at the card processor, which is what the customer's bank sees.
- **The outage tests** really stop a service and really restart it, and wait for the receipt, the last step of the chain, instead of checking an internal flag.

These tests are slower than unit tests, and there should be few of them: each service also has its own fast tests, and a **contract test** per procedure and event ([contracts between services](https://zudojs.oyinlola.site/learn/dist-contracts)) catches most breaking changes before any of this runs.

## Production concerns

- **Real brokers and queues.** The in-process bus and queues stand in for a broker and a queue server. The outbox relay, the idempotent consumers and the dedupe keys stay exactly the same when you swap them; that is why the code only ever puts text on the broker.
- **Service identity.** One shared token is the minimum. Prefer a credential per service (so payments can refuse anyone but orders), rotated regularly, or mutual TLS from a service mesh.
- **Timeouts form a budget.** The gateway's timeout for orders must be longer than orders' own calls to users and payments added up, or the gateway gives up while orders is still working and the customer retries into a race. Better still, pass a deadline down with the request ([failure engineering](https://zudojs.oyinlola.site/learn/dist-reliability#timeouts)).
- **Circuit breakers and bulkheads.** When payments is down, every order still waits a full second for its timeout. A circuit breaker ([failure engineering](https://zudojs.oyinlola.site/learn/dist-reliability#breaker)) fails fast after a few timeouts and goes straight to the retry queue.
- **Sampling.** Recording every span of every request is expensive at scale. Sample at the gateway (the first service decides, the others follow the `traceparent` flag), and always keep traces with errors.
- **Data copies.** Orders calls users for every order. Many teams instead keep a copy of what they need (the e-mail address), updated by `user.updated` events, so a users outage does not stop sales. That trades a dependency for eventual consistency.
- **Version everything that crosses a boundary.** Procedures, event payloads and envelopes. Add fields freely; never change the meaning of an existing one; upgrade consumers before producers.

## Practice

TRY IT YOURSELF

### A loyalty service

Marketing wants a loyalty service: one point per ₦1,000 on every paid order. It must not have an API that orders calls; it listens to `order.paid`. Write its consumer so that duplicate deliveries do not award points twice. Deliver order 7 (₦28,500) three times and order 8 (₦3,500) once, and print the points.

**Show a solution**

ex-loyalty.tsNode.js only

```ts
import { createBroker, decodeEvent, encodeEvent } from "./broker.js";
import type { OrderPaidV1 } from "./orders.service.js";

const broker = createBroker();
const points = new Map<string, number>();
const credited = new Set<number>();

broker.subscribe("order.paid", async (message) => {
  const event = decodeEvent<OrderPaidV1>(message.body);
  if (event.v !== 1 || credited.has(event.orderId)) return;
  credited.add(event.orderId);
  points.set(event.email, (points.get(event.email) ?? 0) + Math.floor(event.totalKobo / 100_000));
});

const paid: OrderPaidV1 = { v: 1, orderId: 7, email: "ada@example.ng", totalKobo: 2_850_000, paidAt: new Date("2026-10-05T09:00:00Z") };
for (let delivery = 1; delivery <= 3; delivery++) await broker.publish("order.paid", { body: encodeEvent(paid) });
await broker.publish("order.paid", { body: encodeEvent({ ...paid, orderId: 8, totalKobo: 350_000 }) });
console.log(points);
```

Output of `npx tsx ex-loyalty.ts`

```ts
Map(1) { 'ada@example.ng' => 31 }
```

31 points: 28 for order 7, awarded once although it arrived three times, and 3 for order 8. Orders did not change at all: adding a consumer to an event is how a microservice platform grows without new arrows into the busiest service. In a real service, `credited` is a table with a unique `order_id`, written in the same transaction as the points.

TRY IT YOURSELF

### Users is down

With the code as it is, what does `POST /orders` answer while the users service is down, and is anything left behind in the orders database? Suggest two different ways to keep taking orders during a users outage, and the price of each.

**Show a solution**

Orders calls `users.get` before inserting anything. The call cannot connect, `serviceClient` rethrows that as `RPCUnavailableError`, orders passes it on to the gateway with its code, and the gateway answers `503 Service Unavailable` (the HTTP package does not send the text of 5xx errors to clients). No order row is written: nothing to clean up, but also no sale. Option 1: keep a local copy of each customer's e-mail in orders, filled from `user.registered` and `user.updated` events. Orders then never calls users while placing an order; the price is a copy that can be seconds out of date, and another event consumer to run. Option 2: save the order without the e-mail and let notifications look the address up when it sends the receipt, retrying with backoff if users is still down. The price is that the receipt waits for users, and notifications gains a dependency.

TRY IT YOURSELF

### Read the outage trace

In the outage trace, why is `publish order.paid` a child of the second `retry payment` span, and not of `orders.place`? What would the trace look like if the retry job did not carry the `traceparent`?

**Show a solution**

The outbox row stores the `traceparent` that was current when the row was written, and the row was written inside the retry that charged the card; the relay continues the trace from that stored value. Without the `traceparent` in the job, each retry would start a new trace of its own: the customer's trace would end at a failed call, and the successful charge, the event and the receipt would sit in an unrelated trace that nobody would find from the trace id support was given.

## Summary

- Draw the arrows first. Use a synchronous call only where someone must wait for the answer; everything else is an event or a job.
- Every service owns its data and verifies its callers: a service token on every RPC request, schemas on every input, identity from verified sources and never from metadata.
- Every call has a timeout. When a dependency the customer can do without is down, accept the work, say so honestly (`202`, `pending_payment`) and finish it later from a retry queue.
- Idempotency keys flow from the customer's cart to the card processor, so double submissions and retries charge once.
- Events go through an outbox, as versioned envelopes, and consumers are idempotent and set aside what they cannot read.
- Carry the `traceparent` across every hop, including queues and the outbox, so one request is one trace across all services.
- Test the platform by stopping services on purpose, and check what the customer would see: charges, statuses and e-mails.

Next, [A whole project through the CLI](https://zudojs.oyinlola.site/learn/zudo-cli-project) builds a project from the first command to deployment with the ZudoJS CLI.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
