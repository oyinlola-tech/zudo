---
title: "Adapters with @zudojs/adapters — ZudoJS Academy"
description: "Put a payment provider behind an adapter with @zudojs/adapters, then swap a fake for a real HTTP provider without touching checkout."
source: https://zudojs.oyinlola.site/learn/zudo-adapters
---

LEVEL 14 · LESSON 18 OF 18

Platform Advanced

# Adapters with @zudojs/adapters

Put a payment provider behind an adapter with @zudojs/adapters, then swap a fake for a real HTTP provider without touching checkout.

- **55 min** to read and try
- **You need:** The lessons on errors, HTTP, testing and the Task API, and ideally Microservices for timeouts and idempotency keys
- **You build:** A PaymentAdapter contract with a fake and an HTTP provider adapter, swapped by configuration, with health checks, timeouts, graceful disposal and one contract test suite for both

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Define a provider-neutral contract that business logic depends on
- Implement a fake and a real HTTP adapter and swap them by configuration
- Initialize, health-check, stop and dispose adapters through AdapterRegistry
- Turn provider failures into timeout, connection, operation and configuration errors
- Test every implementation with one contract suite

## Checkout written against one provider

ShopFlow takes card payments through a provider, a company whose API charges the card. The first version of checkout called the provider's SDK directly and read its answer as it came back. A year later the business negotiates a cheaper provider. Its API does the same job, with a different shape:

coupled.js

```ts
// Checkout written straight against provider A's SDK response
function checkoutWithA(response) {
  if (response.status === "success") return `paid ₦${(response.amount_kobo / 100).toLocaleString("en-NG")}`;
  return `declined: ${response.gateway_response}`;
}

// Provider A's answer, and provider B's answer for the same successful payment
const fromA = { status: "success", amount_kobo: 2_042_500, gateway_response: "Approved" };
const fromB = { state: "CAPTURED", amount: { value: 20_425, currency: "NGN" }, reason: null };

console.log("provider A:", checkoutWithA(fromA));
console.log("provider B:", checkoutWithA(fromB));
```

Output of `node coupled.js` and of the browser terminal

```ts
provider A: paid ₦20,425
provider B: declined: undefined
```

The payment succeeded, and checkout calls it declined, because it looks for `status: "success"` and B says `state: "CAPTURED"`. Now imagine that code in twenty places: checkout, refunds, reports, the admin panel, the tests. Switching provider means editing all of them, and the tests all need the provider's sandbox, so they are slow and fail when the sandbox is down.

The general solution is the **adapter pattern**, also called *ports and adapters*. Your code defines the interface it needs, in its own words (the **port**, or contract). For each outside system you write a small class that implements that interface by talking to the system (the **adapter**). Business logic knows only the contract. Swapping providers means writing one new adapter and changing one line of configuration.

`@zudojs/adapters` gives adapters a shared shape: a name, a version, declared capabilities, a lifecycle (`initialize`, `start`, `stop`, `dispose`), a `health` check, a registry that manages them together, and one family of errors in `@zudojs/errors`. It also defines contracts for platform adapters (HTTP servers, queues, storage, WebSockets); this lesson uses the base contract for a business adapter of your own.

Terminal on your computer

```bash
$ npm install @zudojs/adapters
```

## The contract

Start from what checkout needs, not from what any provider offers: charge an amount to a card for an order, get back "succeeded" or "declined", and refund a charge. Amounts are in kobo, whole numbers, as in [the lesson on money maths](https://zudojs.oyinlola.site/learn/logic-math):

payments.ts

```ts
import type { LifecycleAdapter } from "@zudojs/adapters";

export interface ChargeRequest {
  /** Our order reference. The provider must treat it as an idempotency key. */
  readonly reference: string;
  readonly amountKobo: number;
  readonly cardToken: string;
  readonly email: string;
}

export type ChargeResult =
  | { readonly status: "succeeded"; readonly chargeId: string; readonly amountKobo: number }
  | { readonly status: "declined"; readonly reason: string };

/** What the shop needs from any payment provider. Nothing here is provider-specific. */
export interface PaymentAdapter extends LifecycleAdapter {
  readonly features: { readonly refunds: boolean };
  charge(request: ChargeRequest, options?: { readonly signal?: AbortSignal }): Promise<ChargeResult>;
  refund(chargeId: string): Promise<void>;
}
```

`PaymentAdapter` extends `LifecycleAdapter` from the package. That gives every payment adapter these members:

| Member | Purpose |
| --- | --- |
| `name`, `version`, `metadata` | Identify the adapter in logs, health reports and the registry |
| `capabilities` | What the adapter's *platform* can do: `http`, `abortSignal`, `gracefulShutdown`, `backgroundTasks`, `streaming` and a few more |
| `initialize()` | Prepare: read configuration, check the connection. No work yet |
| `start()` / `stop()` | Begin and end active work; `stop` does not release resources |
| `dispose()` | Release everything: connections, timers, handles |
| `health()` | Report `healthy`, `degraded` or `unhealthy` |
| `configure(options)` | Optional: accept new settings at runtime |

All the lifecycle methods are optional: a fake has nothing to connect to. The two payment methods are yours. `ChargeRequest.reference` is the order's id and doubles as the **idempotency key**: sending the same reference twice must never charge twice. That promise is part of the contract, and every adapter must keep it.

### Capabilities are about the platform

Not every provider can refund through its API. It is tempting to write that into `capabilities`: since `AdapterCapabilities` keeps a fixed list of well-known platform keys (`KnownAdapterCapabilities`: `http`, `streaming`, `gracefulShutdown`, `abortSignal` and a few more) but also accepts any other name, a business capability such as `refunds` type-checks fine:

capabilities.tsNode.js only

```ts
import { AdapterRegistry, createMockAdapter } from "@zudojs/adapters";
import type { AdapterCapabilities } from "@zudojs/adapters";

export const kobopayCapabilities: AdapterCapabilities = { http: true, abortSignal: true, refunds: false };

const adapters = new AdapterRegistry();
adapters.register(createMockAdapter({ name: "kobopay", capabilities: kobopayCapabilities }));
adapters.register(createMockAdapter({ name: "some-other-adapter", capabilities: { refunds: true } }));
console.log(adapters.findByCapability("refunds").map((adapter) => adapter.name));
```

Output of `npx tsx capabilities.ts`

```json
[ 'some-other-adapter' ]
```

That is the trap: `refunds` is just a string key, so `findByCapability("refunds")` returns every adapter that happens to declare it true, whatever they meant by it. Here that is `some-other-adapter`, which has nothing to do with payments. Capabilities describe what the adapter's *runtime* supports: can it be cancelled with an `AbortSignal`, does it shut down gracefully, does it run on an edge runtime — questions any code in the registry can ask of any adapter. What the *provider's business API* supports is a different, narrower question that only makes sense for payment providers, so it goes into your own contract instead: the `features` field in `PaymentAdapter`, which only a caller holding a `PaymentAdapter` can read, with the compiler checking the field name.

## A fake provider and the business logic

The first adapter is a fake. It keeps charges in a `Map`, declines the test card `tok_declined`, keeps the idempotency promise, supports refunds, and is always healthy. It is enough to build and test all of checkout before you have signed a contract with any provider:

fake-payments.ts

```ts
import { createHealthyHealth } from "@zudojs/adapters";
import type { ChargeRequest, ChargeResult, PaymentAdapter } from "./payments.js";

/** An in-memory provider for development and tests. Card "tok_declined" is declined. */
export class FakePaymentAdapter implements PaymentAdapter {
  readonly name = "fake-payments";
  readonly version = "1.0.0";
  readonly capabilities = { abortSignal: true };
  readonly features = { refunds: true };
  readonly charges = new Map<string, ChargeResult>();
  readonly refunded = new Set<string>();

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const previous = this.charges.get(request.reference);
    if (previous !== undefined) return previous;
    const result: ChargeResult = request.cardToken === "tok_declined"
      ? { status: "declined", reason: "insufficient funds" }
      : { status: "succeeded", chargeId: `fake_ch_${this.charges.size + 1}`, amountKobo: request.amountKobo };
    this.charges.set(request.reference, result);
    return result;
  }

  async refund(chargeId: string): Promise<void> {
    this.refunded.add(chargeId);
  }

  health() {
    return createHealthyHealth();
  }
}
```

Checkout depends on `PaymentAdapter` only. It turns the adapter's answer into what the shop shows the customer. One outcome is new: `unknown`, for a charge that timed out. You will see why later in this lesson.

checkout.ts

```ts
import { AdapterTimeoutError } from "@zudojs/adapters";
import type { PaymentAdapter } from "./payments.js";

export interface Order {
  readonly id: string;
  readonly totalKobo: number;
  readonly email: string;
}
export type PaymentOutcome =
  | { readonly orderId: string; readonly state: "paid"; readonly chargeId: string }
  | { readonly orderId: string; readonly state: "declined"; readonly message: string }
  | { readonly orderId: string; readonly state: "unknown"; readonly message: string };

/** Business logic: it knows PaymentAdapter, and no provider at all. */
export function createCheckout(payments: PaymentAdapter) {
  return {
    async pay(order: Order, cardToken: string): Promise<PaymentOutcome> {
      try {
        const result = await payments.charge({
          reference: `order-${order.id}`, amountKobo: order.totalKobo, cardToken, email: order.email,
        });
        if (result.status === "declined") return { orderId: order.id, state: "declined", message: result.reason };
        if (result.amountKobo !== order.totalKobo) throw new Error(`Charged ${result.amountKobo}, expected ${order.totalKobo}`);
        return { orderId: order.id, state: "paid", chargeId: result.chargeId };
      } catch (error) {
        if (error instanceof AdapterTimeoutError) {
          return { orderId: order.id, state: "unknown", message: "No answer from the provider yet; we will confirm by email." };
        }
        throw error;
      }
    },
  };
}
```

fake-checkout.tsNode.js only

```ts
import { createCheckout } from "./checkout.js";
import { FakePaymentAdapter } from "./fake-payments.js";

const payments = new FakePaymentAdapter();
const checkout = createCheckout(payments);
const order = { id: "1001", totalKobo: 2_042_500, email: "ada@example.com" };

console.log(await checkout.pay(order, "tok_visa"));
console.log(await checkout.pay(order, "tok_visa"));
console.log(await checkout.pay({ ...order, id: "1002" }, "tok_declined"));
console.log("charges recorded:", payments.charges.size);
```

Output of `npx tsx fake-checkout.ts`

```json
{ orderId: '1001', state: 'paid', chargeId: 'fake_ch_1' }
{ orderId: '1001', state: 'paid', chargeId: 'fake_ch_1' }
{ orderId: '1002', state: 'declined', message: 'insufficient funds' }
charges recorded: 2
```

Paying order 1001 twice returned the same charge, and only two charges exist: the double click did not charge Ada twice. Checkout also checks that the provider charged the amount it asked for, because a provider bug or a currency mix-up must never pass silently.

## The adapter registry

An app usually has several adapters: payments, SMS, e-mail, storage. An `AdapterRegistry` holds them by name, so the app can start, check and stop them together. `createMockAdapter` makes a small adapter for the demo; you will use it again for tests:

registry.tsNode.js only

```ts
import { AdapterRegistry, createMockAdapter, isAdapterError } from "@zudojs/adapters";
import { FakePaymentAdapter } from "./fake-payments.js";
import type { PaymentAdapter } from "./payments.js";

const adapters = new AdapterRegistry();
adapters.register(new FakePaymentAdapter());
adapters.register(createMockAdapter({ name: "SMS", capabilities: { backgroundTasks: true } }));
console.log(adapters.getNames(), adapters.size);

const payments = adapters.require<PaymentAdapter>(" Fake-Payments ");
console.log(payments.name, payments.features);
console.log(adapters.supports("fake-payments", "abortSignal"), adapters.supports("sms", "abortSignal"));
console.log(adapters.findByCapability("backgroundTasks").map((adapter) => adapter.name));

const mistakes = [
  () => adapters.register(new FakePaymentAdapter()),
  () => adapters.require("kobopay"),
  () => adapters.requireCapability("sms", "abortSignal"),
  () => adapters.register(createMockAdapter({ name: "  " })),
];
for (const mistake of mistakes) {
  try {
    mistake();
  } catch (error) {
    if (isAdapterError(error)) console.log(`${error.name}: ${error.message}`);
  }
}
```

Output of `npx tsx registry.ts`

```json
[ 'fake-payments', 'sms' ] 2
fake-payments { refunds: true }
true false
[ 'SMS' ]
AdapterAlreadyRegisteredError: Adapter "fake-payments" is already registered.
AdapterNotFoundError: Adapter "kobopay" is not registered.
AdapterCapabilityMissingError: Adapter "sms" is missing required capability "abortSignal".
AdapterConfigurationError: Adapter "  " configuration failed.
```

- Names are trimmed and lower-cased, so `" Fake-Payments "` finds `fake-payments`. `getNames()` shows the normalized names; `findByCapability` returns the adapter objects as they were built, so the SMS adapter still says `SMS`.
- `require<PaymentAdapter>(name)` returns the adapter with your type, or throws `AdapterNotFoundError`. `get` returns `undefined` instead.
- `supports` answers yes or no; `requireCapability` throws `AdapterCapabilityMissingError`. Use the second where the app cannot work without the capability, for example a streaming route that needs `streaming`.
- A duplicate name and a blank name are refused. Two adapters called "payments" would make `require` ambiguous.

## A real provider over HTTP

Now the real thing. This lesson cannot charge real cards, so the provider, "KoboPay", runs inside the program: a real HTTP server on a free port, with its own API. Its API looks like a typical payment provider: an API key in the `Authorization` header, an `Idempotency-Key` header, amounts in kobo, snake_case fields and `"failed"` instead of "declined". It also has switches to make it slow or failing, which you will use to break things on purpose:

kobopay-server.ts

```ts
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A pretend payment provider, "KoboPay", running in this process. Its API has its own
 * shape: snake_case fields, "failed" instead of "declined", an Idempotency-Key header.
 */
export async function startKoboPay(secretKey: string) {
  const charges = new Map<string, object>();
  const controls = { latencyMs: 0, failNext: 0, chargeCalls: 0 };
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const server = createServer(async (req, res) => {
    const send = (status: number, body: object) =>
      res.writeHead(status, { "content-type": "application/json", connection: "close" }).end(JSON.stringify(body));
    let raw = "";
    for await (const chunk of req) raw += chunk;
    await wait(controls.latencyMs);
    if (req.headers.authorization !== `Bearer ${secretKey}`) return send(401, { error: "invalid_api_key" });
    if (req.url === "/v1/health") return send(200, { ok: true });
    if (req.method !== "POST" || req.url !== "/v1/charges") return send(404, { error: "not_found" });
    if (controls.failNext > 0) {
      controls.failNext -= 1;
      return send(503, { error: "temporarily_unavailable" });
    }
    const key = String(req.headers["idempotency-key"] ?? "");
    const previous = charges.get(key);
    if (previous !== undefined) return send(200, previous);
    controls.chargeCalls += 1;
    const input = JSON.parse(raw) as { amount: number; currency: string; source: string };
    const charge = input.source === "tok_declined"
      ? { id: `ch_${charges.size + 1}`, status: "failed", amount: input.amount, failure_message: "insufficient_funds" }
      : { id: `ch_${charges.size + 1}`, status: "succeeded", amount: input.amount, failure_message: null };
    charges.set(key, charge);
    send(200, charge);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    controls,
    async stop(): Promise<void> {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
```

Here is a raw call to its API, so you can see the shape the adapter must translate:

raw-api.tsNode.js only

```ts
import { startKoboPay } from "./kobopay-server.js";

const kobopay = await startKoboPay("sk_test_123");
const response = await fetch(`${kobopay.url}/v1/charges`, {
  method: "POST",
  headers: { authorization: "Bearer sk_test_123", "idempotency-key": "order-1001", "content-type": "application/json" },
  body: JSON.stringify({ amount: 2_042_500, currency: "NGN", source: "tok_declined", email: "ada@example.com" }),
});
console.log(response.status, await response.json());
await kobopay.stop();
```

Output of `npx tsx raw-api.ts`

```ts
200 {
  id: 'ch_1',
  status: 'failed',
  amount: 2042500,
  failure_message: 'insufficient_funds'
}
```

The adapter is the only code in ShopFlow that knows this shape. It translates in both directions, and it turns every way the call can fail into an adapter error:

kobopay-adapter.ts

```ts
import {
  AdapterConfigurationError, AdapterConnectionError, AdapterInitializationError, AdapterNotSupportedError,
  AdapterOperationError, AdapterTimeoutError, createDegradedHealth, createHealthyHealth, createUnhealthyHealth,
} from "@zudojs/adapters";
import type { AdapterHealth } from "@zudojs/adapters";
import type { ChargeRequest, ChargeResult, PaymentAdapter } from "./payments.js";

export interface KoboPayOptions {
  readonly baseUrl: string | undefined;
  readonly secretKey: string | undefined;
  readonly timeoutMs: number;
  /** A health check slower than this reports "degraded". */
  readonly slowMs?: number;
}
interface KoboPayCharge { id: string; status: "succeeded" | "failed"; amount: number; failure_message: string | null }

/** Translates between the shop's PaymentAdapter contract and KoboPay's HTTP API. */
export class KoboPayAdapter implements PaymentAdapter {
  readonly name = "kobopay";
  readonly version = "1.0.0";
  readonly capabilities = { http: true, abortSignal: true, gracefulShutdown: true };
  readonly metadata = { name: "kobopay", version: "1.0.0", description: "KoboPay card payments" };
  readonly features = { refunds: false };
  private state: "created" | "ready" | "stopped" | "disposed" = "created";
  private readonly inFlight = new Map<AbortController, Promise<unknown>>();

  constructor(private readonly options: KoboPayOptions) {}

  async initialize(): Promise<void> {
    const { baseUrl, secretKey } = this.options;
    if (!baseUrl || !secretKey) throw new AdapterConfigurationError(this.name, new Error("KOBOPAY_URL and KOBOPAY_SECRET are required"));
    const health = await this.health();
    if (health.status === "unhealthy") throw new AdapterInitializationError(this.name, new Error(health.message));
    this.state = "ready";
  }

  async charge(request: ChargeRequest, options: { signal?: AbortSignal } = {}): Promise<ChargeResult> {
    if (this.state !== "ready") throw new AdapterOperationError(this.name, "charge", new Error(`adapter is ${this.state}`));
    const body = { amount: request.amountKobo, currency: "NGN", source: request.cardToken, email: request.email };
    const response = await this.call("charge", "/v1/charges", { method: "POST", body: JSON.stringify(body),
      headers: { "idempotency-key": request.reference, "content-type": "application/json" } }, options.signal);
    const charge = (await response.json()) as KoboPayCharge;
    return charge.status === "succeeded"
      ? { status: "succeeded", chargeId: charge.id, amountKobo: charge.amount }
      : { status: "declined", reason: (charge.failure_message ?? "declined").replaceAll("_", " ") };
  }

  async refund(): Promise<void> {
    throw new AdapterNotSupportedError(this.name, "refund");
  }

  async health(): Promise<AdapterHealth> {
    const started = Date.now();
    try {
      await this.call("health", "/v1/health", {});
    } catch (error) {
      return createUnhealthyHealth(error instanceof Error && error.cause instanceof Error ? error.cause.message : String(error));
    }
    const slow = Date.now() - started > (this.options.slowMs ?? 1_000);
    return slow ? createDegradedHealth("KoboPay answers slowly") : createHealthyHealth();
  }

  /** Refuses new charges and waits for the ones in flight; each has a timeout, so this ends. */
  async stop(): Promise<void> {
    if (this.state === "ready") this.state = "stopped";
    await Promise.all(this.inFlight.values());
  }

  /** Aborts anything still running and releases the adapter for good. */
  dispose(): void {
    for (const controller of this.inFlight.keys()) controller.abort(new Error("adapter disposed"));
    this.state = "disposed";
  }

  private async call(operation: string, path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    const controller = new AbortController();
    const timeout = AbortSignal.timeout(this.options.timeoutMs);
    const request = fetch(this.options.baseUrl + path, {
      ...init,
      signal: AbortSignal.any([controller.signal, timeout, ...(signal ? [signal] : [])]),
      headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${this.options.secretKey}` },
    });
    this.inFlight.set(controller, request.catch(() => undefined));
    let response: Response;
    try {
      response = await request;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (timeout.aborted) throw new AdapterTimeoutError(this.name, operation, this.options.timeoutMs, error);
      if (controller.signal.aborted) throw new AdapterOperationError(this.name, operation, controller.signal.reason);
      throw new AdapterConnectionError(this.name, error instanceof Error && error.cause ? error.cause : error);
    } finally {
      this.inFlight.delete(controller);
    }
    if (!response.ok) throw new AdapterOperationError(this.name, operation, new Error(`KoboPay answered ${response.status}`));
    return response;
  }
}
```

Read it from the bottom. `call` is the single place where the network is touched:

- Every request gets a **timeout** (`AbortSignal.timeout`) and a private `AbortController`, combined with the caller's signal by `AbortSignal.any`. Whichever fires first cancels the request.
- The failures are sorted into the package's error classes: a timeout becomes `AdapterTimeoutError`, a refused or broken connection `AdapterConnectionError`, a cancellation by `dispose` or an error status from KoboPay `AdapterOperationError`. The original problem is kept as the error's `cause`.
- `charge` translates: `amountKobo` to `amount`, `reference` to the `Idempotency-Key` header, and back from `"failed"` and `"insufficient_funds"` to `declined` and "insufficient funds".
- `refund` throws `AdapterNotSupportedError`, and `features.refunds` says so in advance.
- `initialize` refuses missing settings with `AdapterConfigurationError` and checks that KoboPay answers, so a wrong key stops the app at startup, not at the first customer's checkout.
- `stop` refuses new charges and waits for the ones in flight. `dispose` aborts whatever is still running.

> NOTE
>
> The secret key comes in through the constructor, and the constructor's caller reads it from the environment. The adapter never reads `process.env` itself, never logs the key, and never puts card data in an error message. Payment data is regulated; keep it out of logs and errors entirely.

## Swapping providers without touching checkout

One function decides which adapter the shop uses. It reads configuration, builds the adapter, registers it, and runs `initializeAll` and `startAll`:

payments-setup.ts

```ts
import { AdapterConfigurationError, AdapterRegistry } from "@zudojs/adapters";
import { FakePaymentAdapter } from "./fake-payments.js";
import { KoboPayAdapter } from "./kobopay-adapter.js";
import type { PaymentAdapter } from "./payments.js";

type Env = Readonly<Record<string, string | undefined>>;

/** The only place that knows which provider the shop uses. */
export async function setUpPayments(env: Env): Promise<{ payments: PaymentAdapter; adapters: AdapterRegistry }> {
  const provider = env["PAYMENTS_PROVIDER"] ?? "fake";
  let payments: PaymentAdapter;
  if (provider === "fake") payments = new FakePaymentAdapter();
  else if (provider === "kobopay") {
    payments = new KoboPayAdapter({
      baseUrl: env["KOBOPAY_URL"], secretKey: env["KOBOPAY_SECRET"], timeoutMs: Number(env["KOBOPAY_TIMEOUT_MS"] ?? 5_000),
    });
  } else throw new AdapterConfigurationError(provider, new Error(`Unknown PAYMENTS_PROVIDER "${provider}"`));

  const adapters = new AdapterRegistry();
  adapters.register(payments);
  await adapters.initializeAll();
  await adapters.startAll();
  return { payments, adapters };
}
```

Run the same checkout scenario with both configurations:

swap.tsNode.js only

```ts
import { createCheckout } from "./checkout.js";
import { startKoboPay } from "./kobopay-server.js";
import { setUpPayments } from "./payments-setup.js";

const kobopay = await startKoboPay("sk_test_123");
const environments = [
  { PAYMENTS_PROVIDER: "fake" },
  { PAYMENTS_PROVIDER: "kobopay", KOBOPAY_URL: kobopay.url, KOBOPAY_SECRET: "sk_test_123", KOBOPAY_TIMEOUT_MS: "2000" },
];

for (const env of environments) {
  const { payments, adapters } = await setUpPayments(env);
  const checkout = createCheckout(payments);
  const order = { id: "1001", totalKobo: 2_042_500, email: "ada@example.com" };
  console.log(`--- ${payments.name}`);
  console.log(await checkout.pay(order, "tok_visa"));
  console.log(await checkout.pay(order, "tok_visa"));
  console.log(await checkout.pay({ ...order, id: "1002" }, "tok_declined"));
  await adapters.disposeAll();
}
console.log("KoboPay created", kobopay.controls.chargeCalls, "charges");
await kobopay.stop();
```

Output of `npx tsx swap.ts`

```ts
--- fake-payments
{ orderId: '1001', state: 'paid', chargeId: 'fake_ch_1' }
{ orderId: '1001', state: 'paid', chargeId: 'fake_ch_1' }
{ orderId: '1002', state: 'declined', message: 'insufficient funds' }
--- kobopay
{ orderId: '1001', state: 'paid', chargeId: 'ch_1' }
{ orderId: '1001', state: 'paid', chargeId: 'ch_1' }
{ orderId: '1002', state: 'declined', message: 'insufficient funds' }
KoboPay created 2 charges
```

Same three outcomes, with only the charge ids differing. `checkout.ts` was not changed and does not even know KoboPay exists. The duplicate payment for order 1001 reached KoboPay with the same `Idempotency-Key`, so KoboPay made two charges for three payments, exactly like the fake. Moving to a third provider later means one new adapter class and one more `else if` in `setUpPayments`.

### When setup fails

Configuration mistakes should stop the app at startup with a clear message. Three common ones:

init-failures.tsNode.js only

```ts
import { isAdapterError } from "@zudojs/adapters";
import { startKoboPay } from "./kobopay-server.js";
import { setUpPayments } from "./payments-setup.js";

const kobopay = await startKoboPay("sk_test_123");
const attempts = [
  { PAYMENTS_PROVIDER: "stripe-ish" },
  { PAYMENTS_PROVIDER: "kobopay", KOBOPAY_URL: kobopay.url },
  { PAYMENTS_PROVIDER: "kobopay", KOBOPAY_URL: kobopay.url, KOBOPAY_SECRET: "sk_live_wrong" },
];
for (const env of attempts) {
  try {
    await setUpPayments(env);
  } catch (error) {
    const errors = error instanceof AggregateError ? error.errors : [error];
    if (error instanceof AggregateError) console.log(`AggregateError: ${error.message}`);
    for (const inner of errors) {
      if (isAdapterError(inner)) console.log(`  ${inner.name} (${inner.code}): ${inner.message} <- ${(inner.cause as Error).message}`);
    }
  }
}
await kobopay.stop();
```

Output of `npx tsx init-failures.ts`

```ts
  AdapterConfigurationError (ERR_ADAPTER_CONFIGURATION_FAILED): Adapter "stripe-ish" configuration failed. <- Unknown PAYMENTS_PROVIDER "stripe-ish"
AggregateError: One or more adapters failed to initialize.
  AdapterConfigurationError (ERR_ADAPTER_CONFIGURATION_FAILED): Adapter "kobopay" configuration failed. <- KOBOPAY_URL and KOBOPAY_SECRET are required
AggregateError: One or more adapters failed to initialize.
  AdapterInitializationError (ERR_ADAPTER_INITIALIZATION_FAILED): Adapter "kobopay" failed to initialize. <- KoboPay answered 401
```

`initializeAll` tries *every* adapter and then throws one `AggregateError` with all the failures in `errors`, so you see every broken adapter at once instead of fixing them one restart at a time. Each inner error says which adapter failed, and its `cause` says why. Notice the wrong key: KoboPay answered 401 to the health check in `initialize`, so the app never started with a key that would have failed every payment.

## Timeouts and the unknown outcome

A network call has a third outcome besides success and failure: no answer. Think it through before looking at the code.

REASON IT OUT

### The charge timed out. Did the customer pay?

Checkout sent the charge to KoboPay and gave up after the timeout. What do you know at this point? Can you tell the customer "payment failed"? Can you simply try again? What must be true for a retry to be safe?

**Show the reasoning**

You know almost nothing. The request may never have reached KoboPay, or KoboPay may have charged the card and the answer got lost, or it may still be working on it. So:

- Saying "payment failed" is wrong if the card was charged: the customer pays again and is charged twice.
- Saying "paid" is wrong if it was not.
- A retry is safe **only** if it carries the same idempotency key, so KoboPay recognises it and returns the first result instead of charging again. That is why `reference` is part of the contract.

The honest answer to the customer is "we don't know yet; we'll confirm". The system then finds out, by retrying with the same key later, or by asking the provider for the charge by reference, or through the provider's webhook (a request the provider sends you when a charge completes).

Now make KoboPay slower than the adapter's 800 ms timeout. It still charges the card, after 2 seconds, but the answer arrives too late. Then, as a reconciliation job would do, pay the same order again once KoboPay is fast:

timeout.tsNode.js only

```ts
import { createCheckout } from "./checkout.js";
import { startKoboPay } from "./kobopay-server.js";
import { setUpPayments } from "./payments-setup.js";

const kobopay = await startKoboPay("sk_test_123");
const { payments, adapters } = await setUpPayments({
  PAYMENTS_PROVIDER: "kobopay", KOBOPAY_URL: kobopay.url, KOBOPAY_SECRET: "sk_test_123", KOBOPAY_TIMEOUT_MS: "800",
});
const checkout = createCheckout(payments);
const order = { id: "1001", totalKobo: 2_042_500, email: "ada@example.com" };

kobopay.controls.latencyMs = 2_000;
console.log(await checkout.pay(order, "tok_visa"));

await new Promise((resolve) => setTimeout(resolve, 2_100));
kobopay.controls.latencyMs = 0;
console.log(await checkout.pay(order, "tok_visa"));
console.log("charges KoboPay made:", kobopay.controls.chargeCalls);

await adapters.disposeAll();
await kobopay.stop();
```

Output of `npx tsx timeout.ts`

```json
{
  orderId: '1001',
  state: 'unknown',
  message: 'No answer from the provider yet; we will confirm by email.'
}
{ orderId: '1001', state: 'paid', chargeId: 'ch_1' }
charges KoboPay made: 1
```

Checkout caught `AdapterTimeoutError` and answered `unknown`. The second attempt carried the same reference, KoboPay returned the charge it had already made, and the shop learned the order was paid. KoboPay charged once. Without the idempotency key, that retry would have charged Ada twice.

> RETRY ONLY WHAT IS SAFE TO REPEAT
>
> A timeout on a `GET` can be retried freely. A timeout on anything that moves money, sends a message or creates something may only be retried with an idempotency key the other side honours. [The microservices lesson](https://zudojs.oyinlola.site/learn/zudo-microservices#failures) covers retries with backoff and circuit breakers for the calls where retrying is safe.

## Health checks

`registry.healthAll(options)` asks every adapter that has a `health` method and combines the answers: the overall status is the worst one. A check that throws, times out or is aborted counts as `unhealthy` instead of breaking the report. Two options matter: `timeout` caps each check, and `retry: { attempts, delay }` re-runs a check while it reports `unhealthy`. Here the SMS gateway needs three tries to warm up, and KoboPay is made slow and then switched off:

health.tsNode.js only

```ts
import { AdapterRegistry, createMockAdapter, createHealthyHealth, createUnhealthyHealth } from "@zudojs/adapters";
import { KoboPayAdapter } from "./kobopay-adapter.js";
import { startKoboPay } from "./kobopay-server.js";

const kobopay = await startKoboPay("sk_test_123");
const payments = new KoboPayAdapter({ baseUrl: kobopay.url, secretKey: "sk_test_123", timeoutMs: 5_000, slowMs: 800 });
let smsChecks = 0;
const sms = createMockAdapter({
  name: "sms",
  health: () => (++smsChecks < 3 ? createUnhealthyHealth("gateway warming up") : createHealthyHealth()),
});

const adapters = new AdapterRegistry();
adapters.register(payments);
adapters.register(sms);
await adapters.initializeAll();

const show = (label: string, report: Awaited<ReturnType<AdapterRegistry["healthAll"]>>) =>
  console.log(label.padEnd(18), report.status.padEnd(9), Object.entries(report.adapters).sort(([a], [b]) => a.localeCompare(b))
    .map(([name, health]) => `${name}=${health.status}${health.message ? ` (${health.message})` : ""}`).join(", "));

show("first check", await adapters.healthAll());
show("with 3 attempts", await adapters.healthAll({ retry: { attempts: 3, delay: 10 } }));
kobopay.controls.latencyMs = 1_500;
show("KoboPay slow", await adapters.healthAll());
show("300 ms time limit", await adapters.healthAll({ timeout: 300 }));
kobopay.controls.latencyMs = 0;
await kobopay.stop();
show("KoboPay down", await adapters.healthAll());
await adapters.disposeAll();
```

Output of `npx tsx health.ts`

```ts
first check        unhealthy kobopay=healthy, sms=unhealthy (gateway warming up)
with 3 attempts    healthy   kobopay=healthy, sms=healthy
KoboPay slow       degraded  kobopay=degraded (KoboPay answers slowly), sms=healthy
300 ms time limit  unhealthy kobopay=unhealthy (Health check timed out after 300 ms.), sms=healthy
KoboPay down       unhealthy kobopay=unhealthy (connect ECONNREFUSED 127.0.0.1:42105), sms=healthy
```

- The first report is unhealthy because of SMS alone; the whole app is only as healthy as its worst adapter.
- With `attempts: 3` (three tries in total, not three extra), SMS recovered on its third check.
- A 1.5-second answer is slower than the adapter's `slowMs` of 800, so KoboPay reports itself `degraded`: working, but worth an alert.
- With `timeout: 300` the registry stops waiting and reports "Health check timed out after 300 ms." A health endpoint must answer quickly, even when a provider hangs.
- With KoboPay stopped, the connection is refused, and the health check says so (the port number is different on every run).

Two rules for health checks of paid APIs: never do real work in them (checking health must not charge a card), and do not call them on every request, because some providers rate-limit or bill per call. A readiness endpoint that the load balancer polls every few seconds is the right place.

## Stopping and disposing

When the app shuts down, `registry.disposeAll()` calls `stop`, then `dispose`, on every adapter, empties the registry, and reports failures together. Three adapters that log each step, and one whose `stop` fails:

lifecycle.tsNode.js only

```ts
import { AdapterRegistry, createMockAdapter } from "@zudojs/adapters";

function logged(name: string, failOnStop = false) {
  return createMockAdapter({
    name,
    initialize: () => console.log(`${name}: initialize`),
    start: () => console.log(`${name}: start`),
    stop: () => {
      console.log(`${name}: stop`);
      if (failOnStop) throw new Error("connection pool is busy");
    },
    dispose: () => console.log(`${name}: dispose`),
  });
}

const adapters = new AdapterRegistry();
adapters.register(logged("database"));
adapters.register(logged("payments", true));
adapters.register(logged("sms"));

await adapters.initializeAll();
await adapters.startAll();
try {
  await adapters.disposeAll();
} catch (error) {
  if (error instanceof AggregateError) console.log(`${error.message} ${error.errors.map((e: Error) => e.message)}`);
}
console.log("left in the registry:", adapters.size);
```

Output of `npx tsx lifecycle.ts`

```ts
database: initialize
payments: initialize
sms: initialize
database: start
payments: start
sms: start
sms: stop
sms: dispose
payments: stop
payments: dispose
database: stop
database: dispose
One or more adapters failed to dispose. connection pool is busy
left in the registry: 0
```

Two things to notice. `payments` failed to stop and was still disposed, because leaving its connections open would be worse; the failure is reported in the `AggregateError` at the end. And the order: the registry initializes and starts in registration order, then **stops and disposes in reverse**, the mirror image, the same rule a cleanup manager or [@zudojs/lifecycle](https://zudojs.oyinlola.site/learn/zudo-lifecycle) uses — the last adapter up is the first one down, so an adapter never gets asked to stop while something that started after it, and may depend on it, is still running. If one adapter uses another (a payments adapter on top of an HTTP client adapter), register the one it depends on first, so it starts first and stops last; for anything more than that, manage the two with the lifecycle package, which understands dependencies explicitly.

Now a graceful shutdown with a charge in flight. KoboPay takes a second to answer, and the app is told to stop 100 ms after the charge started:

dispose.tsNode.js only

```ts
import { isAdapterError } from "@zudojs/adapters";
import { startKoboPay } from "./kobopay-server.js";
import { setUpPayments } from "./payments-setup.js";

const kobopay = await startKoboPay("sk_test_123");
const { payments, adapters } = await setUpPayments({
  PAYMENTS_PROVIDER: "kobopay", KOBOPAY_URL: kobopay.url, KOBOPAY_SECRET: "sk_test_123",
});
const request = { reference: "order-1003", amountKobo: 950_000, cardToken: "tok_visa", email: "bola@example.com" };

kobopay.controls.latencyMs = 1_000;
const inFlight = payments.charge(request);
await new Promise((resolve) => setTimeout(resolve, 100));
console.log("shutting down");
await adapters.disposeAll();
console.log("charge in flight:", await inFlight);

try {
  await payments.charge(request);
} catch (error) {
  if (isAdapterError(error)) console.log(`charge after dispose: ${error.name} <- ${(error.cause as Error).message}`);
}
console.log("registered adapters:", adapters.size);
await kobopay.stop();
```

Output of `npx tsx dispose.ts`

```ts
shutting down
charge in flight: { status: 'succeeded', chargeId: 'ch_1', amountKobo: 950000 }
charge after dispose: AdapterOperationError <- adapter is disposed
registered adapters: 0
```

`stop` refused new work and waited for the charge in flight, which completed normally: the customer's payment was not cut off halfway. Only then did `dispose` run. Any later call is refused with a clear error. The waiting cannot hang forever, because every call has its own timeout.

## Testing adapters

An adapter is only swappable if every implementation keeps the same promises. As with repositories in [Testing a ZudoJS application](https://zudojs.oyinlola.site/learn/zudo-testing-apps#repository), write the promises once as a **contract test** and run it against every adapter. The KoboPay run uses the in-process server, so it is fast and needs no network:

payments.contract.test.tsNode.js only

```ts
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { AdapterNotSupportedError } from "@zudojs/adapters";
import { FakePaymentAdapter } from "./fake-payments.js";
import { KoboPayAdapter } from "./kobopay-adapter.js";
import { startKoboPay } from "./kobopay-server.js";
import type { PaymentAdapter } from "./payments.js";

const kobopay = await startKoboPay("sk_test_123");
after(() => kobopay.stop());

const implementations: Record<string, () => PaymentAdapter> = {
  fake: () => new FakePaymentAdapter(),
  kobopay: () => new KoboPayAdapter({ baseUrl: kobopay.url, secretKey: "sk_test_123", timeoutMs: 5_000 }),
};

for (const [name, make] of Object.entries(implementations)) {
  describe(`${name} (PaymentAdapter contract)`, () => {
    const payments = make();
    const request = (reference: string, cardToken = "tok_visa") =>
      ({ reference: `${name}-${reference}`, amountKobo: 250_050, cardToken, email: "ada@example.com" });
    after(async () => {
      await payments.stop?.();
      await payments.dispose?.();
    });

    it("starts and reports healthy", async () => {
      await payments.initialize?.();
      assert.equal((await payments.health?.())?.status, "healthy");
    });

    it("charges the exact amount", async () => {
      const result = await payments.charge(request("a"));
      assert.equal(result.status === "succeeded" && result.amountKobo, 250_050);
    });

    it("declines with a readable reason", async () => {
      assert.deepEqual(await payments.charge(request("b", "tok_declined")), { status: "declined", reason: "insufficient funds" });
    });

    it("charges one reference only once", async () => {
      const first = await payments.charge(request("c"));
      assert.deepEqual(await payments.charge(request("c")), first);
    });

    it("refunds, or says clearly that it cannot", async () => {
      const charge = await payments.charge(request("d"));
      const refund = payments.refund(charge.status === "succeeded" ? charge.chargeId : "none");
      if (payments.features.refunds) await refund;
      else await assert.rejects(refund, AdapterNotSupportedError);
    });
  });
}
```

Output of `npx tsx payments.contract.test.ts`

```ts
▶ fake (PaymentAdapter contract)
  ✔ starts and reports healthy (1.017349ms)
  ✔ charges the exact amount (0.259001ms)
  ✔ declines with a readable reason (0.89257ms)
  ✔ charges one reference only once (0.175589ms)
  ✔ refunds, or says clearly that it cannot (0.210054ms)
✔ fake (PaymentAdapter contract) (4.26783ms)
▶ kobopay (PaymentAdapter contract)
  ✔ starts and reports healthy (45.89312ms)
  ✔ charges the exact amount (10.895618ms)
  ✔ declines with a readable reason (8.81211ms)
  ✔ charges one reference only once (15.386103ms)
  ✔ refunds, or says clearly that it cannot (9.325997ms)
✔ kobopay (PaymentAdapter contract) (92.106189ms)
ℹ tests 10
ℹ suites 2
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 230.868559
```

Ten tests, five promises, two implementations. The refund test shows how a contract handles optional features: an adapter either refunds, or refuses with `AdapterNotSupportedError`, never something in between. When you add a third provider, add one line to `implementations`. Against a provider's real sandbox, run the same suite in a separate, scheduled job: slow and network-dependent tests do not belong in every commit.

Code that works *with the registry*, rather than with one adapter, is tested with the package's mocks. `createMockAdapterRegistry` builds a registry from mock adapters in one call. Here is a readiness endpoint, tested in three situations:

readiness.tsNode.js only

```ts
import { createMockAdapter, createMockAdapterRegistry, createUnhealthyHealth, createDegradedHealth, createHealthyHealth } from "@zudojs/adapters";
import type { AdapterRegistry } from "@zudojs/adapters";

/** GET /ready: 503 only when an adapter is unhealthy; degraded still takes traffic. */
async function readiness(adapters: AdapterRegistry): Promise<{ status: number; body: Record<string, string> }> {
  const report = await adapters.healthAll({ timeout: 1_000 });
  const names = Object.keys(report.adapters).sort();
  const body = Object.fromEntries(names.map((name) => [name, report.adapters[name]!.status]));
  return { status: report.status === "unhealthy" ? 503 : 200, body };
}

const cases = {
  "all fine": [createHealthyHealth()],
  "payments slow": [createDegradedHealth("slow")],
  "payments down": [createUnhealthyHealth("ECONNREFUSED")],
};
for (const [label, [health]] of Object.entries(cases)) {
  const { registry } = createMockAdapterRegistry([
    createMockAdapter({ name: "payments", health: () => health! }),
    createMockAdapter({ name: "sms", health: () => createHealthyHealth() }),
  ]);
  const answer = await readiness(registry);
  console.log(label.padEnd(14), answer.status, answer.body);
}
```

Output of `npx tsx readiness.ts`

```ts
all fine       200 { payments: 'healthy', sms: 'healthy' }
payments slow  200 { payments: 'degraded', sms: 'healthy' }
payments down  503 { payments: 'unhealthy', sms: 'healthy' }
```

A slow provider keeps the app in service (200) while a dead one takes it out (503). That policy is a decision worth pinning with a test, so nobody changes it by accident.

### Production concerns

- **Timeouts shorter than your own.** The adapter's timeout must be shorter than the HTTP request's timeout, or the customer's browser gives up before your code decides anything.
- **Idempotency keys everywhere money moves**, and a reconciliation job for every `unknown` outcome. Most providers also send webhooks; verify their signature before trusting them.
- **Configuration is validated at startup**, in `initialize`, and secrets come from the environment through the composition root.
- **Errors keep their cause, not their secrets.** Log the `cause` for debugging; answer the customer with your own message. Almost every adapter error has `expose: false` and status 500 (`AdapterNotSupportedError` is 501), so an error handler that respects `expose` hides their details automatically.
- **Measure every call.** Wrap the adapter (see the first exercise) to record timings and failures per provider, and alert on `degraded`.

## Practice

TRY IT YOURSELF

### A logging wrapper

Write `withLogging(inner, log)`: it returns a `PaymentAdapter` that forwards every member to `inner` and logs each charge's reference, amount and outcome. Register the wrapped adapter and run two payments through the unchanged checkout. This is the *decorator* pattern: it only works because checkout depends on the contract.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Inside `charge`, wrap the call in `try`/`catch`: `const result = await inner.charge(request, options);` then `log(...)` with `request.reference`, `request.amountKobo` and `result.status`, then `return result;`.

HINT 2

In `catch`, log the failure with the error's name — `log(\`charge ${request.reference} failed: ${(error as Error).name}\`)` — and re-throw with `throw error;`. A decorator that swallows the error would hide it from checkout.

SOLUTION

decorator.tsNode.js only

```ts
import { AdapterRegistry } from "@zudojs/adapters";
import { createCheckout } from "./checkout.js";
import { FakePaymentAdapter } from "./fake-payments.js";
import type { ChargeRequest, PaymentAdapter } from "./payments.js";

function withLogging(inner: PaymentAdapter, log: (line: string) => void): PaymentAdapter {
  return {
    name: inner.name,
    version: inner.version,
    capabilities: inner.capabilities,
    features: inner.features,
    initialize: () => inner.initialize?.(),
    stop: () => inner.stop?.(),
    dispose: () => inner.dispose?.(),
    health: async () => (await inner.health?.()) ?? { status: "healthy", timestamp: Date.now() },
    async charge(request: ChargeRequest, options) {
      try {
        const result = await inner.charge(request, options);
        log(`charge ${request.reference} ${request.amountKobo} kobo -> ${result.status}`);
        return result;
      } catch (error) {
        log(`charge ${request.reference} failed: ${(error as Error).name}`);
        throw error;
      }
    },
    refund: (chargeId) => inner.refund(chargeId),
  };
}

const payments = withLogging(new FakePaymentAdapter(), (line) => console.log(`[payments] ${line}`));
const adapters = new AdapterRegistry();
adapters.register(payments);
const checkout = createCheckout(adapters.require<PaymentAdapter>("fake-payments"));
await checkout.pay({ id: "1001", totalKobo: 2_042_500, email: "ada@example.com" }, "tok_visa");
await checkout.pay({ id: "1002", totalKobo: 950_000, email: "bola@example.com" }, "tok_declined");
```

Output of `npx tsx decorator.ts`

```json
[payments] charge order-1001 2042500 kobo -> succeeded
[payments] charge order-1002 950000 kobo -> declined
```

The same wrapper works around KoboPay or any future adapter. Put timing, metrics or a circuit breaker in wrappers like this one, and each adapter stays a plain translator.

TRY IT YOURSELF

### Cancel an order

Write `cancelOrder(payments, chargeId)`. When the adapter supports refunds, refund and return `refunded <id>`. When it does not, return a note that a person must refund it in the provider's dashboard, without calling `refund` at all. Try it with the fake and with KoboPay.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Guard at the top: `if (!payments.features.refunds) return \`refund ${chargeId} by hand in the ${payments.name} dashboard\`;` — return early, before anything calls `refund`.

HINT 2

After the guard, the rest is the two lines you started with: `await payments.refund(chargeId); return \`refunded ${chargeId}\`;`. Calling `KoboPayAdapter.refund` would throw `AdapterNotSupportedError`, which is exactly why the guard must run first.

SOLUTION

cancel.tsNode.js only

```ts
import { FakePaymentAdapter } from "./fake-payments.js";
import { KoboPayAdapter } from "./kobopay-adapter.js";
import type { PaymentAdapter } from "./payments.js";

async function cancelOrder(payments: PaymentAdapter, chargeId: string): Promise<string> {
  if (!payments.features.refunds) return `refund ${chargeId} by hand in the ${payments.name} dashboard`;
  await payments.refund(chargeId);
  return `refunded ${chargeId}`;
}

const kobopay = new KoboPayAdapter({ baseUrl: "http://127.0.0.1:1", secretKey: "sk_test_123", timeoutMs: 1_000 });
console.log(await cancelOrder(new FakePaymentAdapter(), "fake_ch_1"));
console.log(await cancelOrder(kobopay, "ch_7"));
```

Output of `npx tsx cancel.ts`

```ts
refunded fake_ch_1
refund ch_7 by hand in the kobopay dashboard
```

Checking `features.refunds` first turns a missing feature into a normal business path instead of an error. The KoboPay adapter was never initialized here and its URL points nowhere; that is fine, because `cancelOrder` never calls the network for it. In a real shop the note would become a task in the back office.

TRY IT YOURSELF

### Which error?

Name the error class for each situation: (1) `KOBOPAY_SECRET` is missing at startup; (2) the provider's DNS name does not resolve; (3) the provider answered `500`; (4) no answer within the timeout; (5) someone asks the KoboPay adapter for a refund; (6) the app asks the registry for an adapter called `paypal`; (7) a route needs the `streaming` capability and the adapter lacks it.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Re-read `KoboPayAdapter.call` and `initialize`: each branch there throws one specific class for one specific cause, in the order it checks them (a caller-supplied signal, then the timeout, then the private controller, then anything else).

HINT 2

(1), (6) and (7) never touch the network at all — they are refused before any request is made, by `initialize` or by the registry itself. The other four all come from inside `call`, once a request was actually attempted.

SOLUTION

1. `AdapterConfigurationError`, thrown by `initialize` (and reported inside the `AggregateError` from `initializeAll`).
2. `AdapterConnectionError`: the request never reached the provider. (During `initialize` it is wrapped in `AdapterInitializationError`.)
3. `AdapterOperationError`, with the status in its `cause`.
4. `AdapterTimeoutError`, with the limit in its `timeout` property. The outcome is unknown, not failed.
5. `AdapterNotSupportedError` (status 501).
6. `AdapterNotFoundError`, from `registry.require`.
7. `AdapterCapabilityMissingError`, from `registry.requireCapability`.

Every one of them is an `AdapterError`, so `isAdapterError(error)` catches them all in one place, such as an error handler that logs the adapter name.

## Recap

- Business logic depends on a contract in its own words (`PaymentAdapter`); each provider gets an adapter that translates. Swapping providers is one new class and one configuration value.
- `LifecycleAdapter` gives every adapter a name, capabilities, `initialize`/`start`/`stop`/`dispose` and `health`. Capabilities describe the platform; business features belong in your contract.
- `AdapterRegistry` finds adapters by case-insensitive name or capability, and runs the lifecycle for all of them, collecting failures in an `AggregateError`. It initializes and starts in registration order, then stops and disposes in reverse.
- Adapters turn failures into `AdapterConfigurationError`, `AdapterInitializationError`, `AdapterConnectionError`, `AdapterOperationError`, `AdapterTimeoutError` and `AdapterNotSupportedError`. A timed-out charge is an unknown outcome; retry it only with the same idempotency key.
- `healthAll` combines health with a time limit and retries. One contract test suite keeps the fake and the real adapter interchangeable.

This completes the ZudoJS advanced systems course. Next, you put auth, users, products, orders, payments and notifications together in [one well-structured monolith](https://zudojs.oyinlola.site/learn/zudo-monolith).

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
