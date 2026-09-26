---
title: "Creating a ZudoJS package — ZudoJS Academy"
description: "Build @mycompany/zudo-payments as a real npm package: public/internal API, ZudoJS errors, a provider adapter, Vitest tests, checked docs and changesets."
source: https://zudojs.oyinlola.site/learn/zudo-create-package
---

LEVEL 18 · LESSON 2 OF 3

Framework engineering Advanced

# Creating a ZudoJS package

Build @mycompany/zudo-payments as a real npm package: public/internal API, ZudoJS errors, a provider adapter, Vitest tests, checked docs and changesets.

- **60 min** to read and try
- **You need:** Reading ZudoJS internals, Publishing TypeScript packages, the ZudoJS error system, Adapters, and Testing a ZudoJS app
- **You build:** The @mycompany/zudo-payments package: a payment service with idempotent charges, four ZudoJS error classes, a Paystack adapter tested without the network, a testing entry point, checked documentation and a release flow with changesets

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Lay out a package the way the @zudojs packages are laid out, with a barrel per entry point and internal code that cannot be imported
- Choose between dependencies and peerDependencies for @zudojs packages and explain what goes wrong with the wrong choice
- Define errors that extend @zudojs/errors, with stable codes and safe public output
- Write a provider adapter on the @zudojs/adapters contract and test it with an injected fetch
- Test, document and check a package, then version it with changesets and verify the tarball before publishing

## Three services, three copies of the payment code

Your company runs three ZudoJS services that take money: the shop, the bookings app and the invoicing service. Each one charges saved cards through Paystack, and each has its own copy of the charging code, pasted from the first. Last month the shop fixed a serious bug: when a customer double-clicked "Pay", the request arrived twice and the card was charged twice. The fix never reached the other two services, because nobody remembered the copies existed.

The cure is to write the code once, as a **package** that all three services install: `@mycompany/zudo-payments`. A fix is then one release and three version bumps. But a package is a stronger promise than a folder of shared code. Other teams will import it, so its public API must be deliberate; it must fit into ZudoJS apps (their errors, their adapters, their copy of `@zudojs/errors`); and every release must say honestly whether it can break them.

In [Reading ZudoJS internals](https://zudojs.oyinlola.site/learn/zudo-internals) you took the published `@zudojs` packages apart. In this lesson you build one of your own with the same structure, then test it, document it, version it and check exactly what would be published. Every file is shown, and every command runs.

> NOTE
>
> The examples form one project that is built and imported like a real package, so they run in Node.js only. On your computer, create an empty folder, run `npm init -y`, install the dev dependencies listed in `package.json` below, and add the files as you read.

## Before you write package.json

REASON IT OUT

### What does a payment package promise, and to whom?

Think about these before looking at any file. The package will run inside apps that already have `@zudojs/errors` installed: should it bring its own copy? Which of its functions may other teams import, and which are yours to change at will? A customer double-clicks "Pay": what must happen on the second request, and what if it arrives while the first is still waiting for Paystack? What can fail during a charge, and which failures may the customer see? How do you test charging without charging anyone? And when you change something next month, how do the three services know whether upgrading is safe?

**Show the reasoning**

- **No own copy of `@zudojs/errors`.** A second copy means a second `BaseError` class, and the app's `instanceof` checks fail. It must be a *peer dependency*: "the app provides it".
- **Public API:** only what the entry file exports, enforced by the `exports` map. Everything else lives in files that cannot be imported, so you can change them in any release.
- **Double requests:** the order reference is the idempotency key. A second request for a completed reference gets the first payment back; one that arrives during the first charge waits for the same result. The same reference with a different amount is a mistake, and must fail loudly.
- **Failures:** invalid input (the client can fix it, 400), a declined card (a normal outcome the customer must see, 402), a reused reference (409), and the provider failing or unreachable (502, whose details are for your logs, not the customer).
- **Testing:** the provider sits behind an interface (an adapter), so tests use a fake. The real adapter takes `fetch` as an option, so even it can be tested with a fake network.
- **Upgrades:** semantic versioning, with changesets recording why each version exists. Error codes and exports are part of the promise.

## The layout and the manifest

Follow the shape of the `@zudojs` packages you read: source in `src`, one folder per concern, dot-notation file names, a barrel file per entry point, compiled output in `dist`.

```ts
zudo-payments/
  package.json            name, exports map, peer dependencies, scripts
  tsconfig.json           type checking for everything (no output)
  tsconfig.build.json     compiles src/ into dist/
  README.md  LICENSE
  docs/errors.md          one page per topic, checked in CI
  src/
    index.ts              barrel: the public API        -> "@mycompany/zudo-payments"
    testing/index.ts      barrel: test helpers          -> "@mycompany/zudo-payments/testing"
    payment/              payment.type.ts  payment.service.ts
    errors/               payment.error.ts
    provider/             provider.type.ts  paystack.provider.ts
    internal/             money.ts          (never exported)
  tests/                  *.test.ts, run by Vitest, never published
```

The package's files. Only src becomes dist, and only dist, README, LICENSE and package.json are published.

The manifest carries most of the decisions:

package.json

```json
{
  "name": "@mycompany/zudo-payments",
  "version": "0.1.0",
  "description": "Card payments for ZudoJS apps: a payment service, provider adapters and ZudoJS errors.",
  "license": "MIT",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./testing": {
      "types": "./dist/testing/index.d.ts",
      "import": "./dist/testing/index.js"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist"],
  "sideEffects": false,
  "engines": { "node": ">=24" },
  "keywords": ["zudojs", "payments", "adapter"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "prepublishOnly": "npm run typecheck && npm test && npm run build"
  },
  "peerDependencies": {
    "@zudojs/adapters": "^1.2.0",
    "@zudojs/errors": "^1.3.0"
  },
  "devDependencies": {
    "@zudojs/adapters": "^1.2.3",
    "@zudojs/errors": "^1.3.2",
    "@types/node": "^24.0.0",
    "typescript": "^7.0.2",
    "vitest": "^5.0.1"
  }
}
```

- **`exports`** opens exactly two doors: the main API and a `./testing` entry for the fake provider. Test helpers get their own entry so that production code does not import them by accident. Unlike most `@zudojs` packages, it also exports `./package.json`, so tools can read the version (you met that gap in the last lesson). Inside each entry, `types` comes first, as [Publishing TypeScript packages](https://zudojs.oyinlola.site/learn/ts-publishing#package-json) explains.
- **`peerDependencies`** for both `@zudojs` packages, with a caret range. The app's copy is used, so there is one `BaseError` class in the whole process. The same packages are in `devDependencies`, so you can build and test. A plain `dependencies` entry would let npm install a private copy whenever the versions disagree, which is exactly the duplicate problem the exact pins of the `@zudojs` packages can cause.
- **`files`** is an allow-list: only `dist` (plus the README, LICENSE and `package.json`, which npm always adds).
- **`prepublishOnly`** runs before `npm publish`: nothing is uploaded unless it type-checks, passes its tests and builds.
- **`sideEffects: false`** tells bundlers that importing a file does nothing by itself, so unused exports can be removed.

Two TypeScript configurations: one that checks everything, including tests and scripts, and one that compiles only `src` into `dist` with declarations:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "types": ["node"]
  },
  "exclude": ["dist", "node_modules"]
}
```

tsconfig.build.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true
  },
  "include": ["src"]
}
```

## Types: the contract

Start with the types, because every other file and every user of the package depends on them. Amounts are integers in **kobo** (₦1 = 100 kobo), the unit Paystack uses too, so no floating-point rounding can creep in (see [Mathematical reasoning](https://zudojs.oyinlola.site/learn/logic-math)).

src/payment/payment.type.ts

```ts
/** A request to charge a customer's saved card. Amounts are integers in kobo (₦1 = 100 kobo). */
export interface ChargeRequest {
  /** Your unique reference for this charge, usually the order number. Also the idempotency key. */
  readonly reference: string;
  readonly email: string;
  readonly amountKobo: number;
  /** The provider's token for a card the customer saved earlier. */
  readonly authorizationCode: string;
}

/** A successful charge. */
export interface Payment {
  readonly reference: string;
  readonly amountKobo: number;
  readonly provider: string;
  readonly providerReference: string;
}

/** What a provider adapter reports back for one charge attempt. */
export interface ProviderChargeResult {
  readonly status: "success" | "failed";
  readonly providerReference: string;
  readonly reason?: string;
}
```

Every property is `readonly` and every public type has a JSDoc comment: the comments travel into the `.d.ts` files and show up in your users' editors. Treat the types as API. Renaming `amountKobo` later is a breaking change even if no function changes.

## Errors that belong to ZudoJS

Inside the ZudoJS repository, every error class lives in `@zudojs/errors`. Your package cannot add classes to someone else's package, so it does what `@zudojs/container` does for its local errors: it *extends* the right base class from `@zudojs/errors`. Then every ZudoJS error handler already knows how to answer them.

src/errors/payment.error.ts

```ts
import { ConflictError, DomainError, ExternalServiceError, ValidationError, isBaseError } from "@zudojs/errors";
import type { BaseError, ValidationIssue } from "@zudojs/errors";

/** Stable codes clients can rely on. Never change one; add a new one instead. */
export const PaymentErrorCode = {
  INVALID: "ERR_PAYMENT_INVALID",
  DECLINED: "ERR_PAYMENT_DECLINED",
  CONFLICT: "ERR_PAYMENT_CONFLICT",
  PROVIDER: "ERR_PAYMENT_PROVIDER",
} as const;

/** The charge request itself is wrong: 400, safe to show. */
export class InvalidPaymentError extends ValidationError {
  constructor(issues: readonly ValidationIssue[]) {
    super("The payment request is invalid.", { code: PaymentErrorCode.INVALID, issues });
  }
}

/** The card was declined: a normal business outcome, 402, safe to show. */
export class PaymentDeclinedError extends DomainError {
  constructor(reference: string, reason: string) {
    super(`Payment ${reference} was declined: ${reason}`, {
      code: PaymentErrorCode.DECLINED,
      statusCode: 402,
      metadata: { reference, reason },
    });
  }
}

/** The same reference was reused for a different amount: 409. */
export class PaymentConflictError extends ConflictError {
  constructor(reference: string) {
    super(`Reference ${reference} was already used for a different payment.`, {
      code: PaymentErrorCode.CONFLICT,
      metadata: { reference },
    });
  }
}

/** The provider failed or could not be reached: 502, details hidden from clients. */
export class PaymentProviderError extends ExternalServiceError {
  constructor(provider: string, reference: string, cause: unknown) {
    super(`Provider ${provider} failed for payment ${reference}.`, {
      code: PaymentErrorCode.PROVIDER,
      service: provider,
      operation: "charge",
      statusCode: 502,
      metadata: { reference },
      cause,
    });
  }
}

/** True for any error from this package, even one created by another copy of it. */
export function isPaymentError(value: unknown): value is BaseError {
  return isBaseError(value) && value.code.startsWith("ERR_PAYMENT_");
}
```

Each class picks the base whose meaning fits, and inherits its category, severity and `expose` default. Only the code and, where the base's default is wrong, the status are set. `isPaymentError` uses `isBaseError` and the code prefix rather than `instanceof`, so it still works if an app somehow ends up with two copies of your package. Here is what a client and a log would see:

errors-demo.tsNode.js only

```ts
import { serializePublicError } from "@zudojs/errors";
import { PaymentDeclinedError, PaymentProviderError, isPaymentError } from "./src/errors/payment.error.js";

const declined = new PaymentDeclinedError("ORD-1001", "Insufficient Funds");
const down = new PaymentProviderError("paystack", "ORD-1002", new Error("ECONNRESET"));

console.log(serializePublicError(declined));
console.log(serializePublicError(declined, { publicMetadataKeys: ["reason"] }));
console.log(serializePublicError(down));
console.log(String(down), "| cause for the log:", (down.cause as Error).message);
console.log(isPaymentError(down), isPaymentError(new Error("other")));
```

Output of `npx tsx errors-demo.ts`

```json
{
  code: 'ERR_PAYMENT_DECLINED',
  message: 'Payment ORD-1001 was declined: Insufficient Funds',
  category: 'business',
  statusCode: 402
}
{
  code: 'ERR_PAYMENT_DECLINED',
  message: 'Payment ORD-1001 was declined: Insufficient Funds',
  category: 'business',
  statusCode: 402,
  metadata: { reason: 'Insufficient Funds' }
}
{
  code: 'ERR_PAYMENT_PROVIDER',
  message: 'An unexpected error occurred.',
  category: 'external_service',
  statusCode: 502
}
PaymentProviderError [ERR_PAYMENT_PROVIDER]: Provider paystack failed for payment ORD-1002. | cause for the log: ECONNRESET
true false
```

Since `@zudojs/errors` 1.3, `expose: true` only says the *message* is safe for a client; metadata is left out by default even on an exposed error, because plenty of exposed errors carry decline codes, upstream ids or other internal state alongside the message. The bare `serializePublicError(declined)` call above shows that: no `reason`, even though `PaymentDeclinedError` is a 402 the customer must act on. Your host app opts a field in by name, with `publicMetadataKeys`, at the point it serializes the error, not inside your package: `serializePublicError(declined, { publicMetadataKeys: ["reason"] })` reveals `reason` and nothing else, not even `reference` (which is already in the message anyway). The alternative, `exposeMetadata: true`, reveals every metadata key on every exposed error, which is usually more than you want to promise. Document which keys are safe to allow-list per error code in your README, exactly like the codes and statuses table already there.

The provider failure is reduced to a generic message: "ECONNRESET" and the provider's name mean nothing to a customer and tell an attacker about your infrastructure. The full detail stays on the error for your logs, via `.cause`, regardless of any serializer options. The [error system lesson](https://zudojs.oyinlola.site/learn/zudo-errors#serialize) explains both views. One more gap to know: `serializePublicError` leaves out a `ValidationError`'s `issues` unless you ask for them the same way, so an app's error handler adds them to the response itself, as the Task API's handler in that lesson does. Say so in your README, because the issues are the useful part of `ERR_PAYMENT_INVALID`.

## The provider adapter

The service must not know about Paystack's URLs or JSON. It talks to a **provider adapter**: an object with a fixed interface that translates between your types and one provider's API. The interface extends the `Adapter` contract from `@zudojs/adapters` (see [Adapters](https://zudojs.oyinlola.site/learn/zudo-adapters)), so a host can register payment providers in an `AdapterRegistry` next to its other adapters:

src/provider/provider.type.ts

```ts
import type { Adapter } from "@zudojs/adapters";
import type { ChargeRequest, ProviderChargeResult } from "../payment/payment.type.js";

/** The contract every payment provider adapter implements. */
export interface PaymentProvider extends Adapter {
  charge(request: ChargeRequest, options?: { readonly signal?: AbortSignal }): Promise<ProviderChargeResult>;
}
```

The Paystack adapter calls the `charge_authorization` endpoint, which charges a card the customer saved earlier. Two design choices make it testable and safe: `fetch` is an option (tests pass a fake), and every call has a timeout, so a provider that hangs cannot hold a request open forever.

src/provider/paystack.provider.ts

```ts
import type { ChargeRequest, ProviderChargeResult } from "../payment/payment.type.js";
import type { PaymentProvider } from "./provider.type.js";

export interface PaystackProviderOptions {
  /** Your secret key. Read it from an environment variable, never from code. */
  readonly secretKey: string;
  readonly baseUrl?: string;
  /** Injected so tests can run without the network. Defaults to the global fetch. */
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

interface PaystackChargeResponse {
  readonly status: boolean;
  readonly message: string;
  readonly data?: { readonly status: string; readonly reference: string; readonly gateway_response?: string };
}

/** Charges saved cards through Paystack's charge_authorization endpoint. */
export function createPaystackProvider(options: PaystackProviderOptions): PaymentProvider {
  if (!options.secretKey) throw new TypeError("createPaystackProvider: secretKey is required");
  const send = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ?? "https://api.paystack.co";
  return {
    name: "paystack",
    version: "0.1.0",
    capabilities: { http: true, abortSignal: true },
    async charge(request: ChargeRequest, call = {}): Promise<ProviderChargeResult> {
      const timeout = AbortSignal.timeout(options.timeoutMs ?? 15_000);
      const response = await send(`${baseUrl}/transaction/charge_authorization`, {
        method: "POST",
        headers: { authorization: `Bearer ${options.secretKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          reference: request.reference,
          email: request.email,
          amount: request.amountKobo,
          authorization_code: request.authorizationCode,
        }),
        signal: call.signal ? AbortSignal.any([call.signal, timeout]) : timeout,
      });
      if (!response.ok) throw new Error(`Paystack answered HTTP ${response.status}`);
      const body = (await response.json()) as PaystackChargeResponse;
      if (!body.status || !body.data) throw new Error(`Paystack refused the request: ${body.message}`);
      return {
        status: body.data.status === "success" ? "success" : "failed",
        providerReference: body.data.reference,
        ...(body.data.status === "success" ? {} : { reason: body.data.gateway_response ?? body.data.status }),
      };
    },
  };
}
```

The adapter throws plain `Error`s. Deciding what a failure *means* (a 502 with a hidden cause) is the service's job, in one place, for every provider. The adapter also passes `request.reference` to Paystack, which refuses a second transaction with the same reference: a second line of defence behind the service's own idempotency.

> CHECK THE PROVIDER'S CURRENT API
>
> The adapter maps only the fields it uses, from Paystack's documented response shape. Providers change their APIs; check the current reference before you ship an adapter, and keep the mapping in this one file so a change touches one place.

## The service, and code that stays internal

The service validates the request, applies idempotency, calls the adapter and turns every outcome into a `Payment` or one of the four errors. Its money helpers live in `src/internal`, a folder that no entry point re-exports:

src/internal/money.ts

```ts
/** Internal: not exported from the package entry points. */
const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

export function formatKobo(amountKobo: number): string {
  return naira.format(amountKobo / 100);
}

export function isWholeKobo(amountKobo: number): boolean {
  return Number.isSafeInteger(amountKobo) && amountKobo > 0;
}
```

src/payment/payment.service.ts

```ts
import type { ValidationIssue } from "@zudojs/errors";
import { InvalidPaymentError, PaymentConflictError, PaymentDeclinedError, PaymentProviderError } from "../errors/payment.error.js";
import { isWholeKobo } from "../internal/money.js";
import type { PaymentProvider } from "../provider/provider.type.js";
import type { ChargeRequest, Payment } from "./payment.type.js";

export interface PaymentServiceOptions {
  readonly provider: PaymentProvider;
  /** Largest single charge in kobo. Default ₦5,000,000. */
  readonly maxAmountKobo?: number;
}

export interface PaymentService {
  /** Charges once per reference: repeating a reference returns the first payment. */
  charge(request: ChargeRequest): Promise<Payment>;
  find(reference: string): Payment | undefined;
}

export function createPaymentService(options: PaymentServiceOptions): PaymentService {
  const { provider } = options;
  const maxAmountKobo = options.maxAmountKobo ?? 500_000_000;
  const completed = new Map<string, Payment>();
  const inFlight = new Map<string, { amountKobo: number; promise: Promise<Payment> }>();

  function validate(request: ChargeRequest): void {
    const issues: ValidationIssue[] = [];
    if (!request.reference.trim()) issues.push({ field: "reference", message: "is required" });
    if (!request.email.includes("@")) issues.push({ field: "email", message: "must be an email address" });
    if (!isWholeKobo(request.amountKobo)) issues.push({ field: "amountKobo", message: "must be a positive whole number of kobo" });
    else if (request.amountKobo > maxAmountKobo) issues.push({ field: "amountKobo", message: `must be at most ${maxAmountKobo}` });
    if (issues.length > 0) throw new InvalidPaymentError(issues);
  }

  async function attempt(request: ChargeRequest): Promise<Payment> {
    let result;
    try {
      result = await provider.charge(request);
    } catch (error) {
      throw new PaymentProviderError(provider.name, request.reference, error);
    }
    if (result.status === "failed") throw new PaymentDeclinedError(request.reference, result.reason ?? "declined");
    const payment: Payment = Object.freeze({
      reference: request.reference,
      amountKobo: request.amountKobo,
      provider: provider.name,
      providerReference: result.providerReference,
    });
    completed.set(request.reference, payment);
    return payment;
  }

  return {
    async charge(request) {
      validate(request);
      const earlier = completed.get(request.reference) ?? inFlight.get(request.reference);
      if (earlier) {
        if (earlier.amountKobo !== request.amountKobo) throw new PaymentConflictError(request.reference);
        return "promise" in earlier ? earlier.promise : earlier;
      }
      const promise = attempt(request).finally(() => inFlight.delete(request.reference));
      inFlight.set(request.reference, { amountKobo: request.amountKobo, promise });
      return promise;
    },
    find: (reference) => completed.get(reference),
  };
}
```

The idempotency logic is the in-flight pattern you traced in `getOrSet`, plus a map of completed payments. A declined or failed charge is never stored, so the customer can retry with another card. The maps live in memory, which is enough for one process; with several servers, the completed payments belong in the database, keyed by a unique `reference` column, as [Idempotency](https://zudojs.oyinlola.site/learn/api-idempotency) shows.

> A TIMEOUT IS NOT A FAILED CHARGE
>
> When the provider does not answer in time, the card may or may not have been charged: the outcome is unknown ([Adapters](https://zudojs.oyinlola.site/learn/zudo-adapters#timeouts) walks through it). Version 0.1.0 reports it as `ERR_PAYMENT_PROVIDER` and stores nothing, and a retry with the same reference is refused by Paystack as a duplicate. The honest fix is to ask the provider what happened to that reference before retrying. That needs a new method on the provider contract, and the versioning section shows why adding it is a bigger change than it looks.

## The public API, built and imported by name

The barrel decides what is public. It uses named re-exports only, like `@zudojs/adapters`, never `export *`, so adding a helper to a file can never publish it by accident. Types are re-exported with `export type`, which `verbatimModuleSyntax` requires and which disappears from the JavaScript:

src/index.ts

```ts
/**
 * @mycompany/zudo-payments
 *
 * Card payments for ZudoJS applications. Public API only: anything not
 * exported here is internal and may change in any release.
 */
export { createPaymentService } from "./payment/payment.service.js";
export type { PaymentService, PaymentServiceOptions } from "./payment/payment.service.js";
export type { ChargeRequest, Payment, ProviderChargeResult } from "./payment/payment.type.js";
export type { PaymentProvider } from "./provider/provider.type.js";
export { createPaystackProvider } from "./provider/paystack.provider.js";
export type { PaystackProviderOptions } from "./provider/paystack.provider.js";
export {
  InvalidPaymentError,
  PaymentConflictError,
  PaymentDeclinedError,
  PaymentErrorCode,
  PaymentProviderError,
  isPaymentError,
} from "./errors/payment.error.js";
```

The second entry point gives apps a fake provider for their own tests:

src/testing/index.ts

```ts
/**
 * @mycompany/zudo-payments/testing
 *
 * A fake provider for your tests. Import it from "@mycompany/zudo-payments/testing".
 */
import type { ChargeRequest, ProviderChargeResult } from "../payment/payment.type.js";
import type { PaymentProvider } from "../provider/provider.type.js";

export interface FakeProvider extends PaymentProvider {
  /** Every charge request received, in order. */
  readonly requests: readonly ChargeRequest[];
}

/**
 * Approves every charge, except card tokens listed in `decline` (declined)
 * and `fail` (the provider throws, as when it is down).
 */
export function createFakeProvider(rules: { readonly decline?: readonly string[]; readonly fail?: readonly string[] } = {}): FakeProvider {
  const requests: ChargeRequest[] = [];
  return {
    name: "fake",
    capabilities: {},
    requests,
    async charge(request): Promise<ProviderChargeResult> {
      requests.push(request);
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (rules.fail?.includes(request.authorizationCode)) throw new Error("connection reset");
      const providerReference = `fake_${requests.length}`;
      if (rules.decline?.includes(request.authorizationCode)) return { status: "failed", providerReference, reason: "Insufficient Funds" };
      return { status: "success", providerReference };
    },
  };
}
```

Now build it, exactly as `npm run build` would:

build.tsNode.js only

```ts
import { execFileSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
execFileSync("node_modules/.bin/tsc", ["-p", "tsconfig.build.json"], { stdio: "inherit" });

const files = readdirSync("dist", { recursive: true }).map(String).filter((f) => f.includes("."));
console.log(files.sort().join("\n"));
```

Output of `npx tsx build.ts`

```ts
errors/payment.error.d.ts
errors/payment.error.js
index.d.ts
index.js
internal/money.d.ts
internal/money.js
payment/payment.service.d.ts
payment/payment.service.js
payment/payment.type.d.ts
payment/payment.type.js
provider/paystack.provider.d.ts
provider/paystack.provider.js
provider/provider.type.d.ts
provider/provider.type.js
testing/index.d.ts
testing/index.js
```

`dist/internal/money.js` exists: the service needs it at run time. It is not reachable from outside, because no entry of the `exports` map leads to it. The declarations of the main entry are the API your users' editors show:

show-types.tsNode.js only

```ts
import { readFileSync } from "node:fs";

console.log(readFileSync("dist/index.d.ts", "utf8"));
```

Output of `npx tsx show-types.ts`

```ts
/**
 * @mycompany/zudo-payments
 *
 * Card payments for ZudoJS applications. Public API only: anything not
 * exported here is internal and may change in any release.
 */
export { createPaymentService } from "./payment/payment.service.js";
export type { PaymentService, PaymentServiceOptions } from "./payment/payment.service.js";
export type { ChargeRequest, Payment, ProviderChargeResult } from "./payment/payment.type.js";
export type { PaymentProvider } from "./provider/provider.type.js";
export { createPaystackProvider } from "./provider/paystack.provider.js";
export type { PaystackProviderOptions } from "./provider/paystack.provider.js";
export { InvalidPaymentError, PaymentConflictError, PaymentDeclinedError, PaymentErrorCode, PaymentProviderError, isPaymentError, } from "./errors/payment.error.js";
```

Now use the package the way an app does, by its name. Node lets a package import *itself* by name when it has an `exports` map, so this script at the root of the package goes through exactly the same door as an app in another folder:

use-package.tsNode.js only

```ts
import { createPaymentService, isPaymentError } from "@mycompany/zudo-payments";
import { createFakeProvider } from "@mycompany/zudo-payments/testing";

const provider = createFakeProvider({ decline: ["AUTH_broke"], fail: ["AUTH_down"] });
const payments = createPaymentService({ provider });

const order = { reference: "ORD-1001", email: "ada@example.com", amountKobo: 1_250_000, authorizationCode: "AUTH_ok" };
const [first, doubleClick] = await Promise.all([payments.charge(order), payments.charge(order)]);
console.log(first.providerReference, "same payment:", first === doubleClick, "provider calls:", provider.requests.length);

const attempts = [
  { ...order, amountKobo: 999 },
  { ...order, reference: "ORD-1002", authorizationCode: "AUTH_broke" },
  { ...order, reference: "ORD-1003", authorizationCode: "AUTH_down" },
  { ...order, reference: "ORD-1004", amountKobo: 12.5, email: "ada" },
];
for (const attempt of attempts) {
  try {
    await payments.charge(attempt);
  } catch (error) {
    if (!isPaymentError(error)) throw error;
    console.log(error.code, error.statusCode, error.message);
  }
}
```

Output of `npx tsx use-package.ts`

```ts
fake_1 same payment: true provider calls: 1
ERR_PAYMENT_CONFLICT 409 Reference ORD-1001 was already used for a different payment.
ERR_PAYMENT_DECLINED 402 Payment ORD-1002 was declined: Insufficient Funds
ERR_PAYMENT_PROVIDER 502 Provider fake failed for payment ORD-1003.
ERR_PAYMENT_INVALID 400 The payment request is invalid.
```

The double click cost one provider call, and every failure arrives as a ZudoJS error with its own code and status. And the internal folder really is internal:

internal-blocked.tsNode.js only

```ts
const main = await import("@mycompany/zudo-payments");
const testing = await import("@mycompany/zudo-payments/testing");
console.log("main:", Object.keys(main).sort().join(", "));
console.log("testing:", Object.keys(testing).join(", "));

for (const specifier of ["@mycompany/zudo-payments/internal/money", "@mycompany/zudo-payments/dist/internal/money.js"]) {
  try {
    await import(specifier);
  } catch (error) {
    console.log(specifier, "->", (error as NodeJS.ErrnoException).code);
  }
}
```

Output of `npx tsx internal-blocked.ts`

```ts
main: InvalidPaymentError, PaymentConflictError, PaymentDeclinedError, PaymentErrorCode, PaymentProviderError, createPaymentService, createPaystackProvider, isPaymentError
testing: createFakeProvider
@mycompany/zudo-payments/internal/money -> ERR_PACKAGE_PATH_NOT_EXPORTED
@mycompany/zudo-payments/dist/internal/money.js -> ERR_PACKAGE_PATH_NOT_EXPORTED
```

The types protect the API too. An app that passes naira as a string is stopped by the compiler, with your field name in the message:

wrong-amount.tsNode.js only

```ts
import { createPaymentService } from "@mycompany/zudo-payments";
import { createFakeProvider } from "@mycompany/zudo-payments/testing";

const payments = createPaymentService({ provider: createFakeProvider() });
await payments.charge({ reference: "ORD-7", email: "ada@example.com", amountKobo: "₦2,500", authorizationCode: "AUTH_ok" });
```

What `npx tsc --noEmit` prints

```ts
wrong-amount.ts:5:71 - error TS2322: Type 'string' is not assignable to type 'number'.

5 await payments.charge({ reference: "ORD-7", email: "ada@example.com", amountKobo: "₦2,500", authorizationCode: "AUTH_ok" });
                                                                        ~~~~~~~~~~

  dist/payment/payment.type.d.ts:6:14 - The expected type comes from property 'amountKobo' which is declared here on type 'ChargeRequest'
    6     readonly amountKobo: number;
                   ~~~~~~~~~~


Found 1 error in wrong-amount.ts:5
```

## In a ZudoJS host

An app installs the package, reads the secret key from the environment and registers the adapter in its `AdapterRegistry`. Here the "network" is a fake `fetch` that answers like Paystack, so you can see the whole path without charging a card:

host.tsNode.js only

```ts
import { AdapterRegistry } from "@zudojs/adapters";
import { createPaymentService, createPaystackProvider } from "@mycompany/zudo-payments";
import type { PaymentProvider } from "@mycompany/zudo-payments";

const paystackLike: typeof fetch = async (url, init) => {
  const body = JSON.parse(String(init?.body));
  console.log("POST", String(url).replace("https://api.paystack.co", ""), "amount", body.amount);
  const data = { status: "success", reference: `ps_${body.reference}` };
  return Response.json({ status: true, message: "Charge attempted", data });
};

const secretKey = process.env["PAYSTACK_SECRET_KEY"] ?? "sk_test_local_only";
const registry = new AdapterRegistry();
registry.register(createPaystackProvider({ secretKey, fetch: paystackLike }));

const provider = registry.requireCapability<PaymentProvider>("paystack", "http");
const payments = createPaymentService({ provider });
const payment = await payments.charge({
  reference: "INV-2026-044",
  email: "accounts@acme.ng",
  amountKobo: 7_500_000,
  authorizationCode: "AUTH_8dfhjjdt",
});
console.log(payment);
```

Output of `npx tsx host.ts`

```ts
POST /transaction/charge_authorization amount 7500000
{
  reference: 'INV-2026-044',
  amountKobo: 7500000,
  provider: 'paystack',
  providerReference: 'ps_INV-2026-044'
}
```

`requireCapability` refuses an adapter that does not declare `http`, so a misconfigured registry fails at start-up instead of at the first payment. The secret comes from an environment variable; the fallback is a test key for this demonstration only.

## Tests with Vitest

Package tests import from `src`, run before every publish (`prepublishOnly`) and are never published. On your computer you run `npx vitest run`. To show real results here, a small helper runs one file through Vitest's programming interface and prints a line per test, the same helper as in [Testing a whole ZudoJS app](https://zudojs.oyinlola.site/learn/zudo-testing-apps):

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

The service tests use the package's own fake provider, and each test pins one promise from the reasoning at the start:

tests/payment.service.test.ts

```ts
import { describe, expect, it } from "vitest";
import { InvalidPaymentError, PaymentDeclinedError, PaymentProviderError, createPaymentService } from "../src/index.js";
import { createFakeProvider } from "../src/testing/index.js";

const order = { reference: "ORD-1", email: "ada@example.com", amountKobo: 250_000, authorizationCode: "AUTH_ok" };

describe("createPaymentService", () => {
  it("charges once when the same reference arrives twice at the same time", async () => {
    const provider = createFakeProvider();
    const payments = createPaymentService({ provider });
    const [first, second] = await Promise.all([payments.charge(order), payments.charge(order)]);
    expect(second).toBe(first);
    expect(provider.requests).toHaveLength(1);
  });

  it("lists every invalid field", async () => {
    const payments = createPaymentService({ provider: createFakeProvider() });
    const error = await payments.charge({ ...order, amountKobo: 0.5, email: "ada" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidPaymentError);
    expect((error as InvalidPaymentError).issues.map((i) => i.field)).toEqual(["email", "amountKobo"]);
  });

  it("turns a declined card into a 402 the client may see", async () => {
    const payments = createPaymentService({ provider: createFakeProvider({ decline: ["AUTH_ok"] }) });
    await expect(payments.charge(order)).rejects.toMatchObject({ statusCode: 402, expose: true });
    await expect(payments.charge(order)).rejects.toBeInstanceOf(PaymentDeclinedError);
  });

  it("hides provider failures but keeps the cause for the logs", async () => {
    const payments = createPaymentService({ provider: createFakeProvider({ fail: ["AUTH_ok"] }) });
    const error = (await payments.charge(order).catch((e: unknown) => e)) as PaymentProviderError;
    expect(error).toBeInstanceOf(PaymentProviderError);
    expect(error.expose).toBe(false);
    expect((error.cause as Error).message).toBe("connection reset");
    expect(payments.find(order.reference)).toBeUndefined();
  });
});
```

test-service.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";

await runTests("tests/payment.service.test.ts");
```

Output of `npx tsx test-service.ts`

```ts
✓ createPaymentService > charges once when the same reference arrives twice at the same time
✓ createPaymentService > lists every invalid field
✓ createPaymentService > turns a declined card into a 402 the client may see
✓ createPaymentService > hides provider failures but keeps the cause for the logs
```

The adapter tests never touch the network. A fake `fetch` records each `Request` and answers with a canned `Response`, so the test can check what would have been sent, including the secret key header:

tests/paystack.provider.test.ts

```ts
import { describe, expect, it } from "vitest";
import { createPaystackProvider } from "../src/index.js";

const request = { reference: "ORD-9", email: "ada@example.com", amountKobo: 150_000, authorizationCode: "AUTH_abc" };

function fakeFetch(status: number, body: unknown, seen: Request[] = []): typeof fetch {
  return async (input, init) => {
    seen.push(new Request(input, init));
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
}

describe("createPaystackProvider", () => {
  it("sends the amount in kobo with the secret key", async () => {
    const seen: Request[] = [];
    const ok = { status: true, message: "Charge attempted", data: { status: "success", reference: "ps_1" } };
    const provider = createPaystackProvider({ secretKey: "sk_test_x", fetch: fakeFetch(200, ok, seen) });
    expect(await provider.charge(request)).toEqual({ status: "success", providerReference: "ps_1" });
    expect(seen[0]!.headers.get("authorization")).toBe("Bearer sk_test_x");
    expect(await seen[0]!.json()).toMatchObject({ amount: 150_000, authorization_code: "AUTH_abc" });
  });

  it("maps a failed charge to a reason", async () => {
    const failed = { status: true, message: "Charge attempted", data: { status: "failed", reference: "ps_2", gateway_response: "Insufficient Funds" } };
    const provider = createPaystackProvider({ secretKey: "sk_test_x", fetch: fakeFetch(200, failed) });
    expect(await provider.charge(request)).toMatchObject({ status: "failed", reason: "Insufficient Funds" });
  });

  it("throws on a server error", async () => {
    const provider = createPaystackProvider({ secretKey: "sk_test_x", fetch: fakeFetch(500, {}) });
    await expect(provider.charge(request)).rejects.toThrow("HTTP 500");
  });
});
```

test-paystack.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";

await runTests("tests/paystack.provider.test.ts");
```

Output of `npx tsx test-paystack.ts`

```ts
✓ createPaystackProvider > sends the amount in kobo with the secret key
✓ createPaystackProvider > maps a failed charge to a reason
✓ createPaystackProvider > throws on a server error
```

What is *not* tested here is Paystack itself. That needs a test key and the real sandbox, in a separate, slower suite that runs before a release ([Testing strategies](https://zudojs.oyinlola.site/learn/testing-strategies) calls this a contract test). The fast suite proves your code; the sandbox suite proves your assumptions about theirs.

## Documentation, checked like code

The README is the package's front page on npm and the first thing another team reads. It answers, in this order: what it is, how to install it (including the peer dependencies), a quick start, the errors and their codes, and the versioning policy. Longer topics get their own pages under `docs/`:

README.md

```ts
# @mycompany/zudo-payments

Card payments for ZudoJS applications: idempotent charges, ZudoJS errors and provider adapters.

## Install

    npm install @mycompany/zudo-payments @zudojs/errors @zudojs/adapters

`@zudojs/errors` and `@zudojs/adapters` are peer dependencies: your app provides them,
so there is one copy of every ZudoJS error class.

## Quick start

    import { createPaymentService, createPaystackProvider } from "@mycompany/zudo-payments";

    const provider = createPaystackProvider({ secretKey: process.env.PAYSTACK_SECRET_KEY });
    const payments = createPaymentService({ provider });
    await payments.charge({ reference: "ORD-1001", email, amountKobo: 1_250_000, authorizationCode });

Amounts are integers in kobo. The `reference` is the idempotency key: charging it again
returns the first payment instead of charging twice.

## Errors

Every error extends a class from `@zudojs/errors`. See [errors](./docs/errors.md) for codes
and statuses, and [refunds](./docs/refunds.md) for reversing a charge.

## Testing

Import `createFakeProvider` from `@mycompany/zudo-payments/testing`.

## Versioning

Semantic versioning. Error codes and everything exported from the two entry points are public API.
```

LICENSE

```ts
MIT License

Copyright (c) 2026 MyCompany Ltd

Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
```

docs/errors.md

```ts
---
title: Errors
tags: [payments, errors]
---
# Errors

| Code | Class | Status | Shown to clients | Safe `publicMetadataKeys` |
| --- | --- | --- | --- | --- |
| ERR_PAYMENT_INVALID | InvalidPaymentError | 400 | yes, with issues | — (pass the error's own `issues` instead) |
| ERR_PAYMENT_DECLINED | PaymentDeclinedError | 402 | yes, with the reason | `["reason"]` |
| ERR_PAYMENT_CONFLICT | PaymentConflictError | 409 | yes | none needed: the reference is already in the message |
| ERR_PAYMENT_PROVIDER | PaymentProviderError | 502 | no, generic message | none: never allow-list this one |

Pass the listed keys to `serializePublicError(error, { publicMetadataKeys: [...] })`
in your own error handler. `@zudojs/errors` never exposes metadata on its own.

Back to the [README](../README.md).
```

Documentation rots quietly: a page is renamed and the links to it break. `@zudojs/docs` can check a set of markdown pages the way a compiler checks code. Its document ids are dot-separated, so `docs/errors.md` becomes `docs.errors`, and relative links are resolved the same way:

check-docs.tsNode.js only

```ts
import { readFileSync } from "node:fs";
import { createMarkdownDocument, documentIdFromPath, parseFrontmatter, validateAll } from "@zudojs/docs";

const pages = ["README.md", "docs/errors.md"].map((path) => {
  const { metadata, content } = parseFrontmatter(readFileSync(path, "utf8"));
  const title = typeof metadata["title"] === "string" ? metadata["title"] : path;
  return createMarkdownDocument(documentIdFromPath(path), title, content);
});
console.log("pages:", pages.map((p) => `${p.id} (${p.title})`).join(", "));

const result = validateAll(pages);
for (const issue of result.issues) console.log(issue.severity, issue.code, "-", issue.message);
console.log("valid:", result.valid);
if (result.issues.length > 0) process.exitCode = 1;
```

Output of `npx tsx check-docs.ts`

```ts
pages: README (README.md), docs.errors (Errors)
warning BROKEN_LINK - Document "README" links to "./docs/refunds.md" which is not registered.
valid: true
```

The README links to a refunds page that does not exist yet. `@zudojs/docs` reports that as a *warning*, and warnings do not make `valid` false. Only errors do, such as a `javascript:` link. So the script sets the exit code on any issue: in CI, a broken link should fail the build. Either write `docs/refunds.md` or remove the link before you publish.

> A LINK WITH PARENTHESES ESCAPES THE UNSAFE-LINK CHECK
>
> In the published `@zudojs/docs`, `[x](javascript:void)` is reported as `UNSAFE_LINK`, but `[x](javascript:alert(1))` is not reported at all: the scanner does not handle parentheses inside a link target, although markdown allows them. Do not rely on `validateLinks` alone for documentation written by untrusted people; render it with a markdown library that sanitises links.

## Versions and changesets

Three services install your package. Each upgrade must tell them one thing: can this break me? **Semantic versioning** answers with the version number `MAJOR.MINOR.PATCH`. For this package, the rules become concrete:

| Change | Bump | Why |
| --- | --- | --- |
| Fix: amounts like `12.5` were accepted | patch | Behaviour now matches the documentation. |
| Add `createFlutterwaveProvider` | minor | New export; nothing existing changes. |
| Add an optional `currency` field to `ChargeRequest` | minor | Old calls still compile and behave the same. |
| Rename `ERR_PAYMENT_DECLINED` | major | Clients compare codes; theirs would stop matching. |
| Remove an export, or make an optional field required | major | Existing code stops compiling. |
| Raise the peer range to `@zudojs/errors@^2`, or `engines` to Node 26 | major | Existing installations can no longer satisfy it. |
| Add a required `verify(reference)` method to `PaymentProvider` | major | Callers are unaffected, but anyone who *implemented* the interface (their own provider) no longer compiles. Add it as optional in a minor instead, and make it required in the next major. |

Before 1.0.0, npm's caret treats the minor number as major: `^0.1.0` accepts 0.1.5 but not 0.2.0. So in 0.x, breaking changes bump the minor. Publish 1.0.0 when the three services depend on the API in production; from then on the table applies strictly.

### Changesets

Choosing the bump at release time is guesswork: who remembers what changed three weeks ago, and whether it broke anything? **Changesets**, the tool the ZudoJS packages are released with, moves the decision to the pull request that makes the change. The author adds a small markdown file that names the package, the bump and a sentence for the changelog. At release time, the tool adds them up. Configure it once, with `.changeset/config.json`:

.changeset/config.json

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "access": "public",
  "baseBranch": "main"
}
```

Then, in each pull request, record the change. `--minor` and `-m` skip the interactive questions (these outputs are from a real run with `@changesets/cli` 3.0.3; the file names are random):

Terminal on your computer (npm install -D @changesets/cli)

```bash
$ npx changeset add --minor @mycompany/zudo-payments -m "Add createPaystackProvider for charging saved cards through Paystack."
🦋 changeset v3.0.3

Summary of changesets:
minor:  @mycompany/zudo-payments

Changeset added - you can now commit it!
If you want to modify or expand on the changeset summary, you can find it here:
.changeset/slimy-dragons-start.md

$ cat .changeset/slimy-dragons-start.md
---
"@mycompany/zudo-payments": minor
---

Add createPaystackProvider for charging saved cards through Paystack.

$ npx changeset add --patch @mycompany/zudo-payments -m "Reject amounts that are not whole kobo with ERR_PAYMENT_INVALID."
…
$ npx changeset status
🦋 changeset v3.0.3

Packages to be bumped:
- minor
  - @mycompany/zudo-payments
```

Two changesets, one minor and one patch: the release is a minor. When you are ready to release, `changeset version` consumes the files, bumps `package.json` and writes the changelog:

Terminal on your computer

```bash
$ npx changeset version
🦋 changeset v3.0.3

All files have been updated. Review them and commit at your leisure

$ grep '"version"' package.json
  "version": "0.2.0",

$ cat CHANGELOG.md
# @mycompany/zudo-payments

## 0.2.0

### Minor Changes

- d6da97e: Add createPaystackProvider for charging saved cards through Paystack.

### Patch Changes

- d6da97e: Reject amounts that are not whole kobo with ERR_PAYMENT_INVALID.
```

The `d6da97e` is the commit that added each changeset. Review the diff, commit it, and publish. In CI, a check that every pull request touching `src/` contains a changeset (`changeset status --since=main` fails otherwise) keeps the habit honest.

## Check the tarball, then publish

What you publish is the tarball, not your folder. `npm pack --dry-run` builds the list without writing anything; with `--json` a script can check it:

pack.tsNode.js only

```ts
import { execFileSync } from "node:child_process";

const [pack] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" }));
console.log(pack.id, "->", pack.filename);
for (const file of pack.files) console.log(String(file.size).padStart(6), file.path);
console.log(`${pack.entryCount} files, ${pack.unpackedSize} bytes unpacked`);

const leaked = pack.files.filter((f: { path: string }) => /^(src|tests|docs)\/|\.env|tsconfig/.test(f.path));
console.log("source, tests, docs or secrets in the tarball:", leaked.length === 0 ? "none" : leaked);
```

Output of `npx tsx pack.ts`

```ts
@mycompany/zudo-payments@0.1.0 -> mycompany-zudo-payments-0.1.0.tgz
   693 LICENSE
  1226 README.md
  1418 dist/errors/payment.error.d.ts
  2025 dist/errors/payment.error.js
   814 dist/index.d.ts
   480 dist/index.js
   130 dist/internal/money.d.ts
   340 dist/internal/money.js
   640 dist/payment/payment.service.d.ts
  2484 dist/payment/payment.service.js
   857 dist/payment/payment.type.d.ts
    11 dist/payment/payment.type.js
   582 dist/provider/paystack.provider.d.ts
  1780 dist/provider/paystack.provider.js
   377 dist/provider/provider.type.d.ts
    11 dist/provider/provider.type.js
   719 dist/testing/index.d.ts
   856 dist/testing/index.js
  1058 package.json
19 files, 16501 bytes unpacked
source, tests, docs or secrets in the tarball: none
```

Compiled code, declarations, README, LICENSE and manifest; no sources, tests, `.env` or configuration. Note that `docs/` is not published: the README links to it, so link to the pages in your repository (or your documentation site) by full URL before 1.0.0, or add `docs` to `files`. Then publish, with the steps from [Publishing TypeScript packages](https://zudojs.oyinlola.site/learn/ts-publishing#releasing):

Terminal on your computer

```bash
$ npm publish --access public --provenance
```

`prepublishOnly` type-checks, tests and builds first. `--access public` is needed once for a scoped package, and `--provenance` (from CI) links the tarball to the commit that built it. For a private company package, publish to your company's registry instead (GitHub Packages or a private npm organisation) and point the `@mycompany` scope at it in `.npmrc`.

### In production

- **Peer range policy:** support the `@zudojs` major your apps use (`^1.3.0`), and test against the lowest and the highest version in that range in CI. Raising the lower bound is a minor change only if every app already has it; otherwise treat it as major.
- **Never log secrets:** the adapter holds the secret key in a closure and never puts it in an error or metadata. The Vitest test that checks the header uses a fake key.
- **Idempotency across servers:** the in-memory maps protect one process. Before you run more than one instance, store completed payments in a table with a unique `reference`, and let the provider's duplicate-reference check be the last line.
- **Deprecate before removing:** mark an export `@deprecated` in its JSDoc for at least one minor release (editors strike it through), and remove it in the next major.
- **Keep the public surface small:** every export is a promise you must keep until the next major. It is easy to add an export later and expensive to take one away.

## Practice

TRY IT YOURSELF

### Test the amount limit

`maxAmountKobo` is documented but untested. Add a Vitest test: with `maxAmountKobo: 100_000`, a charge of 100,001 kobo fails with `ERR_PAYMENT_INVALID` and an issue on `amountKobo`, and exactly 100,000 kobo succeeds.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Two assertions: `await expect(payments.charge({ ...base, reference: "A", amountKobo: 100_001 })).rejects.toMatchObject({ code, issues })`, then the mirror `.resolves.toMatchObject(...)` for exactly 100,000 kobo.

HINT 2

`await expect(payments.charge({ ...base, reference: "A", amountKobo: 100_001 })).rejects.toMatchObject({ code: PaymentErrorCode.INVALID, issues: [{ field: "amountKobo", message: "must be at most 100000" }] }); await expect(payments.charge({ ...base, reference: "B", amountKobo: 100_000 })).resolves.toMatchObject({ amountKobo: 100_000 });`

SOLUTION

tests/limit.test.ts

```ts
import { expect, it } from "vitest";
import { PaymentErrorCode, createPaymentService } from "../src/index.js";
import { createFakeProvider } from "../src/testing/index.js";

const base = { email: "ada@example.com", authorizationCode: "AUTH_ok" };

it("enforces maxAmountKobo at the boundary", async () => {
  const payments = createPaymentService({ provider: createFakeProvider(), maxAmountKobo: 100_000 });
  await expect(payments.charge({ ...base, reference: "A", amountKobo: 100_001 })).rejects.toMatchObject({
    code: PaymentErrorCode.INVALID,
    issues: [{ field: "amountKobo", message: "must be at most 100000" }],
  });
  await expect(payments.charge({ ...base, reference: "B", amountKobo: 100_000 })).resolves.toMatchObject({ amountKobo: 100_000 });
});
```

test-limit.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";

await runTests("tests/limit.test.ts");
```

Output of `npx tsx test-limit.ts`

```ts
✓ enforces maxAmountKobo at the boundary
```

Test both sides of a boundary: the largest allowed value and the smallest refused one. An off-by-one (`>=` instead of `>`) fails exactly one of the two.

TRY IT YOURSELF

### Which version?

The package is at 1.4.2. Give the next version for each release, on its own: (a) the Paystack adapter now retries once on HTTP 503; (b) `PaymentDeclinedError` gets a new `retryable` property; (c) the default `maxAmountKobo` drops from ₦5,000,000 to ₦1,000,000; (d) `createFakeProvider` moves from `/testing` to the main entry, and `/testing` is removed.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

For each change, ask: does existing, correctly-typed calling code stop compiling, or start behaving differently, without any change on its own part? That question is the line between minor and major.

HINT 2

The versioning table earlier in this lesson already covers the closest match for three of these four: a new field, a changed default, and removing or moving an export. Find the matching row before you decide (a), the one case not already in the table.

SOLUTION

- (a) **1.4.3** or **1.5.0**. Retrying a failed call is a behaviour change callers do not have to adapt to; most teams call it a patch. If you document it as a feature ("adapters now retry"), a minor is fine.
- (b) **1.5.0**: a new property is an addition.
- (c) **2.0.0**: a charge of ₦2,000,000 that worked yesterday now fails. A changed default is a breaking change even though no signature changed.
- (d) **2.0.0**: removing an entry point breaks every import of it. To soften it, first add the export to the main entry in a minor, deprecate `/testing`, and remove it in the next major.

TRY IT YOURSELF

### A provider that hangs

The adapter aborts a call after `timeoutMs`. Prove it: give the provider a fake `fetch` that never answers until its signal aborts, set `timeoutMs: 50`, and show that the service turns the timeout into `ERR_PAYMENT_PROVIDER` with the `TimeoutError` as its cause.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Add an `abort` listener on `init.signal` inside the promise executor, and reject with the signal's own reason when it fires. Do not resolve or reject any other way.

HINT 2

`init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));` — and remove the placeholder `reject(new Error("not implemented"))` below it.

SOLUTION

timeout.tsNode.js only

```ts
import { createPaymentService, createPaystackProvider, isPaymentError } from "@mycompany/zudo-payments";

const hangs: typeof fetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
  });

const provider = createPaystackProvider({ secretKey: "sk_test_x", fetch: hangs, timeoutMs: 50 });
const payments = createPaymentService({ provider });
const keepAlive = setInterval(() => {}, 1_000);
try {
  await payments.charge({ reference: "ORD-5", email: "ada@example.com", amountKobo: 50_000, authorizationCode: "AUTH_ok" });
} catch (error) {
  if (isPaymentError(error)) console.log(error.code, error.statusCode, "cause:", (error.cause as Error).name);
} finally {
  clearInterval(keepAlive);
}
```

Output of `npx tsx timeout.ts`

```ts
ERR_PAYMENT_PROVIDER 502 cause: TimeoutError
```

A real `fetch` behaves like this fake: it rejects with the signal's reason when the signal aborts. The `keepAlive` interval is there because the timer behind `AbortSignal.timeout` does not keep Node running on its own: with a real request, the open socket does; with a fake that only waits, plain `node` would exit with "unsettled top-level await" before the timeout fires. Without the timeout, this charge would wait forever and hold the customer's request open. Print `error.name`, not the message, when you compare timeouts: the message text differs between runtimes.

## Recap

- A package is a promise: its `exports` map, its barrel files and its types are the public API. Internal code lives where no entry point leads.
- `@zudojs` packages your package builds on are `peerDependencies` (plus `devDependencies`), so the app keeps one copy of every error class.
- Errors extend the fitting class from `@zudojs/errors` with stable codes; recognise them with `isBaseError` and the code prefix.
- External services sit behind an adapter on the `@zudojs/adapters` contract, with injected `fetch` and a timeout, so everything is testable without the network.
- Vitest tests pin each promise; `@zudojs/docs` checks the documentation; changesets record the version bump in the pull request that causes it.
- Check the tarball with `npm pack --dry-run` before every publish.

Next: [Building a complete ZudoJS plugin](https://zudojs.oyinlola.site/learn/zudo-create-plugin), which packages a feature for other apps to switch on, with lifecycle, dependencies and rollback.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
