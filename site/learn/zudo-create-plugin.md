---
title: "Building a complete ZudoJS plugin — ZudoJS Academy"
description: "Build a production-grade receipts plugin with @zudojs/plugins: metadata, dependencies, lifecycle, scoped context, events, diagnostics and rollback."
source: https://zudojs.oyinlola.site/learn/zudo-create-plugin
---

LEVEL 18 · LESSON 3 OF 3

Framework engineering Advanced

# Building a complete ZudoJS plugin

Build a production-grade receipts plugin with @zudojs/plugins: metadata, dependencies, lifecycle, scoped context, events, diagnostics and rollback.

- **60 min** to read and try
- **You need:** Plugins, Creating a ZudoJS package, Events, and Testing a ZudoJS app
- **You build:** A receipts plugin that depends on a mailer plugin, reacts to payment events, reports its own health, drains on shutdown and is covered by Vitest tests, plus a failing plugin that triggers a full rollback

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Design a plugin's contract with its host: metadata, capabilities, dependencies and the services it needs from the context
- Implement all five lifecycle hooks so that each one does only its own job, and cleanup is registered next to what it cleans up
- Share a service between plugins through the container and react to host events without coupling
- Predict what the manager checks before any hook runs, and what it rolls back when a hook fails or hangs
- Report health beyond the manager's diagnostics and turn an unnamed startup failure into a PluginStartError
- Test a plugin's hooks in isolation and inside a real manager

## A feature three apps can switch on

ShopFlow wants an email receipt for every successful payment. So does the invoicing service. The bookings app does not: its customers get a booking confirmation instead. If receipts are written into ShopFlow, the invoicing team copies them, and you are back to the pasted-code problem of [the previous lesson](https://zudojs.oyinlola.site/learn/zudo-create-package). If receipts become a **plugin**, each app decides with one line whether it runs them.

You met plugins in [the plugins lesson](https://zudojs.oyinlola.site/learn/zudo-plugins): metadata, five hooks, a scoped context, rollback. That lesson showed each feature on its own, with small plugins. This one builds a plugin you could ship: `@mycompany/zudo-plugin-receipts`. It needs a mail service that another plugin provides, validates its settings before anything starts, listens to the host's payment events, sends mail without blocking payments, reports its own health, finishes the receipts in progress when the app shuts down, and cleans up everything it created. Then you add a plugin that fails and watch the manager undo the whole start-up.

> NOTE
>
> The plugin, the mailer and the host are files in one project; each example is a script that uses them. They use Node.js, so run them on your computer with `npx tsx <file>.ts`.

## Before you write a hook

REASON IT OUT

### What can go wrong for a receipts plugin?

Think these through first. What does the plugin need from the host, and what if the host does not offer it? The mail service belongs to another plugin: what if that plugin is missing, too old, or starts after receipts? An installation passes `{ form: "receipts@shopflow.ng" }` with a typo: when should that fail? One customer's mailbox bounces: should the payment fail, or the plugin, or neither? The app shuts down while three receipts are being sent. And the plugin after receipts fails to start: what must happen to the mail connection receipts' dependency already opened?

**Show the reasoning**

- **Needs from the host:** events (to hear about payments) and a container (to find the mailer). Check for them in `install`, the first hook, so a host that lacks them fails at start-up with a clear message, not at the first payment.
- **The mailer plugin:** declare it as a dependency with a version range. The manager then refuses to start without it, refuses an incompatible major, and always starts it first and stops it last.
- **Bad settings:** validate options in `install`. The start fails and rolls back; a typo never turns into receipts with no sender at 2 a.m.
- **A bounce:** neither the payment nor the plugin fails. Sending happens after the payment succeeded, off the request path; a failed receipt is logged and shown in the plugin's health.
- **Shutdown:** `stop` stops accepting new work and waits for the receipts in flight; the manager's hook timeout bounds that wait.
- **A later plugin fails:** the manager rolls back: it stops and disposes every plugin it started, in reverse order, so the mail connection is closed. That works only if every plugin registers its cleanup when it creates something.

## The parts of a complete plugin

Every concern from the reasoning maps to one part of the plugin API:

| Concern | Plugin API | Checked or run |
| --- | --- | --- |
| Who am I, which version | `metadata.name`, `version`, `description`, `keywords` | Registration; version ranges of other plugins |
| What I am allowed to use | `metadata.capabilities` | `register`, against the host's `allowedCapabilities` |
| What must run before me | `dependencies`, `optionalDependencies` | `start`, before any hook runs |
| Settings, host services | `install(context, options)` | Phase 1, for every plugin |
| Wiring to other plugins | `initialize(context)` | Phase 2, when every plugin is installed |
| Doing the work | `start(context)`, `context.events` | Phase 3 |
| Finishing work in progress | `stop(context)` | Shutdown and rollback, reverse order |
| Releasing resources | `context.onDispose`, `registerDisposable`, `dispose`, `context.signal` | After `stop`, newest first |
| Am I healthy? | `manager.diagnostics()`, plus your own `health()` | Whenever the host asks |

The split between `install`, `initialize` and `start` matters when plugins cooperate. The manager runs each phase for *all* plugins before the next phase begins. So in `install` a plugin registers what it offers, in `initialize` it can rely on everything every other plugin offers, and in `start` it begins work knowing the whole system is wired.

## The dependency: a mailer plugin

Receipts need a way to send mail, and several plugins will want one. So mail gets its own plugin, which offers a `Mailer` service to the others. The **contract** (the interface and the token under which it is shared) lives in its own file, which in real life is exported by the mailer package:

src/mailer/mailer.contract.ts

```ts
/** What the mailer plugin offers other plugins. Shared through the container under MAILER. */
export interface Mailer {
  send(message: { readonly to: string; readonly subject: string; readonly text: string }, signal?: AbortSignal): Promise<void>;
}

/**
 * The container token for the mailer. Symbol.for, not Symbol(): every copy of
 * this module gets the same token, as with the @zudojs/errors brand.
 */
export const MAILER = Symbol.for("@mycompany/zudo-plugin-mailer:Mailer");
```

The mailer plugin registers the service in `install`, so it exists before any plugin's `initialize` looks for it. It opens its connection in `start` and, in the same breath, registers how to close it:

src/mailer/mailer.plugin.ts

```ts
import type { Plugin } from "@zudojs/plugins";
import { MAILER } from "./mailer.contract.js";
import type { Mailer } from "./mailer.contract.js";

/** Where mail really goes: SMTP, an email API, or an array in tests. */
export interface MailTransport {
  open(): Promise<void>;
  deliver(to: string, subject: string, text: string): Promise<void>;
  close(): Promise<void>;
}

export function createMailerPlugin(transport: MailTransport, version = "2.1.0"): Plugin {
  return {
    metadata: { name: "@mycompany/zudo-plugin-mailer", version, capabilities: ["container"] },
    install(context) {
      const mailer: Mailer = {
        async send(message, signal) {
          signal?.throwIfAborted();
          await transport.deliver(message.to, message.subject, message.text);
        },
      };
      context.container?.register(MAILER, { useValue: mailer });
    },
    async start(context) {
      await transport.open();
      context.registerDisposable({ dispose: () => transport.close() });
    },
  };
}
```

Registering cleanup right after acquiring the resource is the most important habit in plugin code. If `start` opened the connection and `dispose` closed it, a plugin that failed between the two lines would leave the connection open; and a plugin that was never started would try to close a connection that was never opened. The disposables list only ever contains what really exists.

## The receipts plugin

First the settings. They come from outside (the `register` call and the host's configuration), so they are input like any request body, checked by one function:

src/receipts/receipts.options.ts

```ts
/** Settings an installation passes to the receipts plugin. */
export interface ReceiptsOptions {
  /** The From address of every receipt, e.g. "receipts@shopflow.ng". */
  readonly from: string;
  /** Log a summary every `summaryEveryMs` milliseconds. 0 turns it off. */
  readonly summaryEveryMs?: number;
}

/** Options are input from outside: check them before anything starts. */
export function parseReceiptsOptions(value: unknown): Required<ReceiptsOptions> {
  const input = (value ?? {}) as Partial<ReceiptsOptions>;
  const problems: string[] = [];
  if (typeof input.from !== "string" || !/^[^@\s]+@[^@\s]+$/.test(input.from)) problems.push("from must be an email address");
  const every = input.summaryEveryMs ?? 0;
  if (!Number.isInteger(every) || every < 0) problems.push("summaryEveryMs must be a whole number >= 0");
  if (problems.length > 0) throw new TypeError(`receipts: invalid options: ${problems.join("; ")}`);
  return { from: input.from!, summaryEveryMs: every };
}
```

Now the plugin. Read it hook by hook; each one does one job:

src/receipts/receipts.plugin.ts

```ts
import { createDegradedHealth, createHealthyHealth } from "@zudojs/plugins";
import type { Plugin, PluginContainer, PluginContext } from "@zudojs/plugins";
import { MAILER } from "../mailer/mailer.contract.js";
import type { Mailer } from "../mailer/mailer.contract.js";
import { parseReceiptsOptions } from "./receipts.options.js";
import type { ReceiptsOptions } from "./receipts.options.js";

/** The event this plugin reacts to. The host publishes it after a successful charge. */
export interface PaymentSucceeded {
  readonly reference: string;
  readonly email: string;
  readonly amountKobo: number;
}

/** The plugin object, plus a health check the host can call. */
export interface ReceiptsPlugin extends Plugin<Partial<ReceiptsOptions> | undefined> {
  health(): { readonly status: string; readonly details?: unknown };
}

type ResolvingContainer = PluginContainer & { resolve(token: unknown): unknown };
const canResolve = (c: PluginContainer | undefined): c is ResolvingContainer =>
  typeof (c as { resolve?: unknown } | undefined)?.resolve === "function";

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export function createReceiptsPlugin(): ReceiptsPlugin {
  let settings: Required<ReceiptsOptions> | undefined;
  let mailer: Mailer | undefined;
  let accepting = false;
  let sent = 0;
  let lastError: string | undefined;
  const inFlight = new Set<Promise<void>>();

  async function sendReceipt(context: PluginContext, payment: PaymentSucceeded): Promise<void> {
    const text = `Thank you. We received ${naira(payment.amountKobo)} for order ${payment.reference}.`;
    try {
      await mailer!.send({ to: payment.email, subject: `Receipt for ${payment.reference}`, text }, context.signal);
      sent++;
      lastError = undefined;
      await context.events?.emit("receipt.sent", { reference: payment.reference });
    } catch (error) {
      lastError = `${payment.reference}: ${error instanceof Error ? error.message : String(error)}`;
      context.logger?.warn("receipt not sent", { reference: payment.reference, reason: lastError });
    }
  }

  return {
    metadata: {
      name: "@mycompany/zudo-plugin-receipts",
      version: "1.0.0",
      description: "Emails a receipt for every successful payment.",
      keywords: ["zudojs-plugin", "payments", "email"],
      capabilities: ["events", "container"],
    },
    dependencies: [{ name: "@mycompany/zudo-plugin-mailer", version: "^2.0.0" }],
    optionalDependencies: [{ name: "@mycompany/zudo-plugin-audit", version: "^1.0.0" }],

    install(context, options) {
      settings = parseReceiptsOptions({ from: context.config?.get("receipts.from"), ...(options ?? {}) });
      if (!context.events) throw new Error("receipts: the host must provide events");
      if (!canResolve(context.container)) throw new Error("receipts: the host must provide a container that can resolve");
    },

    initialize(context) {
      mailer = (context.container as ResolvingContainer).resolve(MAILER) as Mailer;
    },

    start(context) {
      accepting = true;
      const onPayment = (payload: unknown) => {
        if (!accepting) return;
        const job = sendReceipt(context, payload as PaymentSucceeded).finally(() => inFlight.delete(job));
        inFlight.add(job);
      };
      context.events!.on("payment.succeeded", onPayment);
      context.onDispose(() => context.events!.off("payment.succeeded", onPayment));
      if (settings!.summaryEveryMs > 0) {
        const timer = setInterval(() => context.logger?.info("receipts summary", { sent }), settings!.summaryEveryMs);
        context.onDispose(() => clearInterval(timer));
      }
      context.logger?.info("receipts started", { from: settings!.from });
    },

    async stop(context) {
      accepting = false;
      const waiting = inFlight.size;
      await Promise.allSettled(inFlight);
      context.logger?.info("receipts stopped", { drained: waiting, sent });
    },

    health() {
      return lastError ? createDegradedHealth(`last receipt failed: ${lastError}`) : createHealthyHealth();
    },
  };
}
```

- **A factory, not an object.** `createReceiptsPlugin()` keeps all state in a closure, so every host and every test gets a fresh plugin. A disposed plugin can never be started again, so a retry needs a new one anyway.
- **`install`** merges the host's configuration (`receipts.from`) with the options passed to `register`, validates them, and checks that the host offers what the plugin needs. The context's `container` type only promises `register`, because plugins are meant to *offer* services; resolving one needs a container that can, so the plugin checks at run time instead of assuming.
- **`initialize`** resolves the mailer. It can, because every plugin's `install`, including the mailer's, has finished.
- **`start`** subscribes to `payment.succeeded` and registers the unsubscribe on the very next line. The handler does not `await` the mail: the host's publish returns at once, so a slow mail server never slows a payment. Each send is tracked in `inFlight`.
- **`stop`** refuses new work, then waits for the sends in flight. It does not release anything: that is disposal's job, and it happens next.
- **`health()`** is not part of the `Plugin` interface. The manager's diagnostics only know a plugin's lifecycle state; whether receipts are actually going out is something only the plugin knows, so it offers a method for the host to call.

## The host, and a first run

The host is ShopFlow. It creates the services it offers plugins (a logger, an event bus, a container and its configuration) and one context that carries them. A memory transport stands in for SMTP; it can be told to bounce one address:

src/host/host.ts

```ts
import { createContainer } from "@zudojs/container";
import { createEventBus } from "@zudojs/events";
import { createLogger, createTextLoggerFormatter } from "@zudojs/logger";
import { createPluginContext } from "@zudojs/plugins";
import type { MailTransport } from "../mailer/mailer.plugin.js";

/** Everything a ShopFlow host offers its plugins. */
export function createHost(settings: Record<string, unknown> = {}) {
  const logger = createLogger({
    name: "shopflow",
    formatter: createTextLoggerFormatter({ includeTimestamp: false }),
    transports: [(entry) => console.log(entry.formatted ?? entry.message)],
  });
  const events = createEventBus();
  const container = createContainer();
  const config = { get: (key: string) => settings[key] };
  const context = createPluginContext({ name: "shopflow", version: "3.2.0" }, { logger, events, container, config });
  return { logger, events, container, context };
}

/** A transport that keeps mail in memory, and can be told to fail for one address. */
export function createMemoryTransport(options: { readonly failFor?: string } = {}) {
  const outbox: string[] = [];
  const transport: MailTransport = {
    async open() {
      console.log("smtp: connected");
    },
    async deliver(to, subject) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (options.failFor && to === options.failFor) throw new Error("mailbox unavailable");
      outbox.push(`${to} <- ${subject}`);
    },
    async close() {
      console.log("smtp: connection closed");
    },
  };
  return { transport, outbox };
}
```

One detail of `createPluginContext` surprises people: its first argument, the host's own metadata (`shopflow` 3.2.0), never reaches a plugin. The manager gives each plugin its own view of the context, and in that view `context.plugin` is the *plugin's* metadata. Only the services (logger, events, container, config) are shared. A plugin that must know the host's version has to get it from `config`.

Now run the whole life of the plugin: start, two payments (the second bounces), a health check, a third payment, and a shutdown while its receipt is still being sent. The host also listens to the manager's own lifecycle events, published on the same bus:

run.tsNode.js only

```ts
import { PluginManager } from "@zudojs/plugins";
import { createHost, createMemoryTransport } from "./src/host/host.js";
import { createMailerPlugin } from "./src/mailer/mailer.plugin.js";
import { createReceiptsPlugin } from "./src/receipts/receipts.plugin.js";

const { events, context } = createHost({ "receipts.from": "receipts@shopflow.ng" });
events.on("plugin.started", (event) => {
  console.log("event: started", (event.payload as { plugin: { name: string } }).plugin.name);
});

const { transport, outbox } = createMemoryTransport({ failFor: "bounce@example.com" });
const receipts = createReceiptsPlugin();
const manager = new PluginManager({ allowedCapabilities: ["events", "container"], hookTimeout: 5_000 });
manager.register(receipts);
manager.register(createMailerPlugin(transport));
await manager.start(context);

const pay = (reference: string, email: string) =>
  events.publishEvent({ type: "payment.succeeded", payload: { reference, email, amountKobo: 1_250_000 } });

await pay("ORD-1001", "ada@example.com");
await pay("ORD-1002", "bounce@example.com");
console.log("two payments published");
await new Promise((resolve) => setTimeout(resolve, 50));
const report = manager.diagnostics();
console.log(`manager: ${report.healthy} of ${report.total} healthy | receipts says:`, receipts.health());

await pay("ORD-1003", "tunde@example.com");
console.log("ORD-1003 published, stopping while its receipt is in flight");
await manager.stop(context);
console.log(outbox);
```

Output of `npx tsx run.ts`

```ts
smtp: connected
event: started @mycompany/zudo-plugin-mailer
[INFO] [shopflow] receipts started from=receipts@shopflow.ng
event: started @mycompany/zudo-plugin-receipts
two payments published
[WARN] [shopflow] receipt not sent reference=ORD-1002 reason="ORD-1002: mailbox unavailable"
manager: 2 of 2 healthy | receipts says: {
  status: 'degraded',
  details: 'last receipt failed: ORD-1002: mailbox unavailable'
}
ORD-1003 published, stopping while its receipt is in flight
[INFO] [shopflow] receipts stopped drained=1 sent=2
smtp: connection closed
[
  'ada@example.com <- Receipt for ORD-1001',
  'tunde@example.com <- Receipt for ORD-1003'
]
```

Follow the order in the output:

- Receipts was registered first, but the mailer started first: it is a dependency. The lifecycle event `plugin:started` arrives as `plugin.started`, because the event bus normalizes `:` to `.` (you traced that in [Reading ZudoJS internals](https://zudojs.oyinlola.site/learn/zudo-internals#trace-events)). A host can subscribe to `plugin.*` to see every lifecycle event.
- "two payments published" appears before the bounce warning: publishing returned before any mail was sent, so receipts never slow the payment path.
- The manager says both plugins are healthy, because both are `started`. The plugin knows better: its last receipt bounced. A health endpoint should report both views.
- The third receipt was still being sent when `stop` began. `stop` waited for it (`drained=1`), so it reached the outbox. Then receipts was disposed before the mailer, and the SMTP connection closed last.

## What the manager refuses before any hook runs

Three mistakes an installation can make, and when each one is caught: a host that does not grant a capability, a mailer from an incompatible major version, and a typo in the options. The first is caught by `register`, the second by `start` before any hook runs, and the third by the plugin's own `install`:

checks.tsNode.js only

```ts
import { PluginManager } from "@zudojs/plugins";
import { createHost, createMemoryTransport } from "./src/host/host.js";
import { createMailerPlugin } from "./src/mailer/mailer.plugin.js";
import { createReceiptsPlugin } from "./src/receipts/receipts.plugin.js";

const { context } = createHost();
const { transport } = createMemoryTransport();

try {
  new PluginManager({ allowedCapabilities: ["events"] }).register(createReceiptsPlugin());
} catch (error) {
  console.log("1.", (error as Error).name, "-", (error as Error).message);
}

const tooNew = new PluginManager();
tooNew.register(createReceiptsPlugin(), { from: "receipts@shopflow.ng" });
tooNew.register(createMailerPlugin(transport, "3.0.0"));
try {
  await tooNew.start(context);
} catch (error) {
  console.log("2.", (error as Error).name, "-", (error as Error).message);
}

const typo = new PluginManager();
typo.register(createReceiptsPlugin(), { form: "receipts@shopflow.ng" });
typo.register(createMailerPlugin(transport));
try {
  await typo.start(context);
} catch (error) {
  console.log("3.", (error as Error).name, "-", (error as Error).message);
}
console.log("3. states:", typo.diagnostics().plugins.map((p) => `${p.plugin.name.slice(23)}=${p.state}`).join(" "));
```

Output of `npx tsx checks.ts`

```ts
1. PluginRegistrationError - Plugin "@mycompany/zudo-plugin-receipts" requests capabilities that are not granted: container.
2. PluginDependencyVersionError - Plugin "@mycompany/zudo-plugin-receipts" requires "@mycompany/zudo-plugin-mailer@^2.0.0", but version 3.0.0 is registered. Register a "@mycompany/zudo-plugin-mailer" that satisfies ^2.0.0, relax the constraint on "@mycompany/zudo-plugin-receipts", or construct the manager with { checkVersions: false }.
3. TypeError - receipts: invalid options: from must be an email address
3. states: receipts=disposed mailer=disposed
```

- **Capabilities** are compared at `register`: the host grants `events` only, receipts asks for `container` too. Remember from [the plugins lesson](https://zudojs.oyinlola.site/learn/zudo-plugins#task-api) that this is a declaration check, not a sandbox.
- **The version range** `^2.0.0` refuses mailer 3.0.0 before any plugin was installed: nothing to roll back. The error class, `PluginDependencyVersionError`, extends `PluginDependencyError`, so a handler for missing plugins still catches it.
- **The typo** `form` reached `install` unnoticed by TypeScript: the second argument of `register` is typed `unknown`, whatever the plugin declares. Only the plugin's own validation caught it. The mailer had already been installed, so the manager disposed it: both end `disposed`. (The `smtp` lines are missing because the mailer never reached `start`, where the connection opens.)

> TIP
>
> Because `register` does not check options against the plugin's type, a plugin package can offer a typed helper instead: for example `createReceiptsPlugin(options)` that keeps the options in the closure. Then the compiler checks them in the host's code, and `install` still validates them at run time.

## Optional dependencies and plugins that talk through events

Some teams want an audit trail of every receipt. An audit plugin should not need changes to receipts, and receipts should not need the audit plugin. The two meet on the event bus: receipts publishes `receipt.sent`, and the audit plugin, if installed, listens. Receipts lists it under `optionalDependencies` for one reason only: when it *is* installed, it must start first, so it is listening before the first receipt goes out.

optional.tsNode.js only

```ts
import { PluginManager } from "@zudojs/plugins";
import type { Plugin } from "@zudojs/plugins";
import { createHost, createMemoryTransport } from "./src/host/host.js";
import { createMailerPlugin } from "./src/mailer/mailer.plugin.js";
import { createReceiptsPlugin } from "./src/receipts/receipts.plugin.js";

function createAuditPlugin(): Plugin {
  return {
    metadata: { name: "@mycompany/zudo-plugin-audit", version: "1.4.0", capabilities: ["events"] },
    start(context) {
      const record = (payload: unknown) => context.logger?.info("audit", payload as Record<string, unknown>);
      context.events?.on("receipt.sent", record);
      context.onDispose(() => context.events?.off("receipt.sent", record));
    },
  };
}

const { events, context } = createHost({ "receipts.from": "receipts@shopflow.ng" });
const order: string[] = [];
events.on("plugin.started", (event) => order.push((event.payload as { plugin: { name: string } }).plugin.name.slice(23)));

const manager = new PluginManager();
manager.register(createReceiptsPlugin());
manager.register(createMailerPlugin(createMemoryTransport().transport));
manager.register(createAuditPlugin());
await manager.start(context);
console.log("start order:", order.join(" -> "));

await events.publishEvent({ type: "payment.succeeded", payload: { reference: "ORD-2001", email: "ada@example.com", amountKobo: 500_000 } });
await new Promise((resolve) => setTimeout(resolve, 30));
await manager.stop(context);
```

Output of `npx tsx optional.ts`

```ts
smtp: connected
[INFO] [shopflow] receipts started from=receipts@shopflow.ng
start order: mailer -> audit -> receipts
[INFO] [shopflow] audit reference=ORD-2001
[INFO] [shopflow] receipts stopped drained=0 sent=1
smtp: connection closed
```

The manager put audit before receipts because of the optional dependency, and the audit line appeared without receipts knowing who listened. Without the audit plugin, the same receipts plugin starts exactly as in the first run. That is the shape to aim for between plugins: hard dependencies for services you call, events for things others may want to know.

## A failing plugin and the rollback

The invoicing team adds an SMS alerts plugin that depends on receipts. Its API key is wrong, so its `start` throws. By then the mailer and receipts are running: the connection is open and receipts is subscribed to payments. Watch the manager undo all of it:

rollback.tsNode.js only

```ts
import { PluginManager } from "@zudojs/plugins";
import type { Plugin } from "@zudojs/plugins";
import { createHost, createMemoryTransport } from "./src/host/host.js";
import { createMailerPlugin } from "./src/mailer/mailer.plugin.js";
import { createReceiptsPlugin } from "./src/receipts/receipts.plugin.js";

function createSmsAlertsPlugin(): Plugin {
  return {
    metadata: { name: "@mycompany/zudo-plugin-sms-alerts", version: "0.3.0", capabilities: ["events"] },
    dependencies: [{ name: "@mycompany/zudo-plugin-receipts", version: "^1.0.0" }],
    async start() {
      throw new Error("SMS gateway rejected the API key");
    },
  };
}

const { events, context } = createHost({ "receipts.from": "receipts@shopflow.ng" });
events.on("plugin.*", (event) => {
  const { plugin, state } = event.payload as { plugin: { name: string }; state: string };
  if (["started", "failed", "stopped", "disposed"].includes(state)) console.log(`event: ${plugin.name.slice(23)} ${state}`);
});

const manager = new PluginManager({ allowedCapabilities: ["events", "container"] });
manager.register(createSmsAlertsPlugin());
manager.register(createReceiptsPlugin());
manager.register(createMailerPlugin(createMemoryTransport().transport));
try {
  await manager.start(context);
} catch (error) {
  console.log("start failed:", (error as Error).message);
}

const report = manager.diagnostics();
console.log(`healthy ${report.healthy}, degraded ${report.degraded}, unhealthy ${report.unhealthy}`);
for (const entry of report.plugins) console.log(" ", entry.plugin.name.slice(23), entry.state, entry.health.status, entry.health.details ?? "");

const after = await events.publishEvent({ type: "payment.succeeded", payload: { reference: "ORD-9", email: "ada@example.com", amountKobo: 100 } });
console.log("handlers still subscribed to payments:", after.handlerCount);
```

Output of `npx tsx rollback.ts`

```ts
smtp: connected
event: mailer started
[INFO] [shopflow] receipts started from=receipts@shopflow.ng
event: receipts started
event: sms-alerts failed
[INFO] [shopflow] receipts stopped drained=0 sent=0
event: receipts stopped
event: mailer stopped
event: sms-alerts disposed
event: receipts disposed
smtp: connection closed
event: mailer disposed
start failed: SMS gateway rejected the API key
healthy 0, degraded 2, unhealthy 1
  sms-alerts disposed unhealthy SMS gateway rejected the API key
  receipts disposed degraded
  mailer disposed degraded
handlers still subscribed to payments: 0
```

Read the output as the rollback's checklist:

1. SMS alerts failed in `start`. Receipts was `started`, so it was stopped (its drain found nothing in flight), then the mailer.
2. Every plugin that still held anything was disposed, dependents first: the SMS plugin, receipts (whose disposables unsubscribed it from payments), then the mailer (whose disposable closed the connection).
3. `diagnostics()` names the culprit and its error. The other two are `disposed`, reported as `degraded`.
4. No handler is left on `payment.succeeded`. Without the `onDispose` line in receipts' `start`, a disposed plugin would still be sending mail through a closed connection.

### Which plugin failed?

Notice what the `catch` received: the plugin's own `Error`, unwrapped. It does not say which plugin threw it. `@zudojs/plugins` exports `PluginStartError` and `PluginInitializationError`, but the published manager never throws them. A host that logs "SMS gateway rejected the API key" at start-up leaves the operator to guess which of twelve plugins has an SMS gateway. Wrap it yourself, using the diagnostics:

named-failure.tsNode.js only

```ts
import { PluginManager, PluginStartError } from "@zudojs/plugins";
import type { PluginContext } from "@zudojs/plugins";
import { createHost } from "./src/host/host.js";

/** Starts the plugins; when one fails, throws a PluginStartError that names it. */
async function startPlugins(manager: PluginManager, context: PluginContext): Promise<void> {
  try {
    await manager.start(context);
  } catch (error) {
    const failed = manager.diagnostics().plugins.find((p) => p.failed);
    if (!failed) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    throw new PluginStartError(`Plugin "${failed.plugin.name}" failed to start: ${reason}`, failed.plugin.name, { cause: error });
  }
}

const { context } = createHost();
const manager = new PluginManager();
manager.register({
  metadata: { name: "@mycompany/zudo-plugin-fx-rates", version: "1.0.0" },
  start: () => {
    throw new Error("rates API returned 401");
  },
});

try {
  await startPlugins(manager, context);
} catch (error) {
  if (error instanceof PluginStartError) {
    console.log(String(error));
    console.log("plugin:", error.pluginName, "| status:", error.statusCode, "| cause:", (error.cause as Error).message);
  }
}
```

Output of `npx tsx named-failure.ts`

```ts
PluginStartError [ERR_PLUGIN_START]: Plugin "@mycompany/zudo-plugin-fx-rates" failed to start: rates API returned 401
plugin: @mycompany/zudo-plugin-fx-rates | status: 500 | cause: rates API returned 401
```

Now the log line names the plugin, the error has the stable code `ERR_PLUGIN_START`, and the original error is kept as the cause. Put `startPlugins` in the host once, and every plugin failure is reported the same way.

> A ROLLED-BACK MANAGER CANNOT START AGAIN
>
> After a rollback every plugin is `disposed`, and a second `manager.start` throws `PluginStateError`. To retry (for example, without the failing plugin), create a new manager and new plugin objects from the factories. That is one more reason plugins are factories.

## A plugin that never answers

A failing plugin is the easy case. Worse is a plugin whose `start` waits for a service that never answers, such as a rates API behind a firewall that drops packets. Without a limit, the whole application waits with it. `hookTimeout` is meant to fail any hook that takes longer, and the failure should roll back like any other. Try it the way many hosts start: plugins first, before the HTTP server listens.

hang.mjs

```ts
import { createPluginContext, PluginManager } from "@zudojs/plugins";

const manager = new PluginManager({ hookTimeout: 200 });
manager.register({
  metadata: { name: "mailer" },
  start: (context) => context.onDispose(() => console.log("mailer: connection closed")),
});
manager.register({
  metadata: { name: "fx-rates" },
  dependencies: [{ name: "mailer" }],
  start: () => new Promise(() => {}),
});

try {
  await manager.start(createPluginContext({ name: "shopflow" }));
} catch (error) {
  console.log("caught:", error.name);
}
console.log("start-up finished");
```

Run it the way production runs compiled code, with plain `node`, and look at everything the process reports:

run-hang.tsNode.js only

```ts
import { spawnSync } from "node:child_process";

const run = spawnSync(process.execPath, ["hang.mjs"], { encoding: "utf8" });
console.log("exit code:", run.status);
console.log("stdout:", JSON.stringify(run.stdout.trim()));
console.log("stderr:", run.stderr.trim().split("\n")[0]);
```

Output of `npx tsx run-hang.ts`

```ts
exit code: 13
stdout: ""
stderr: Warning: Detected unsettled top-level await at /home/you/project/hang.mjs:15
```

No `PluginTimeoutError`, no rollback, no "connection closed", not even "start-up finished": Node simply exited with code 13 while `start` was still waiting. The reason is in the manager's `dist` code: the timeout timer is created with `timer.unref()`, which tells Node "do not stay alive just for this timer". The hanging promise holds nothing either, so Node saw no more work and quit. In a server that is already listening, the open socket keeps the process alive and the timeout fires. During start-up, before anything listens, nothing does.

So the host keeps the process alive itself while plugins start. One interval, cleared in `finally`, is enough:

hang-guarded.tsNode.js only

```ts
import { PluginManager } from "@zudojs/plugins";
import { createHost, createMemoryTransport } from "./src/host/host.js";
import { createMailerPlugin } from "./src/mailer/mailer.plugin.js";

const { context } = createHost();
const manager = new PluginManager({ hookTimeout: 200 });
manager.register(createMailerPlugin(createMemoryTransport().transport));
manager.register({
  metadata: { name: "@mycompany/zudo-plugin-fx-rates", version: "1.0.0" },
  dependencies: [{ name: "@mycompany/zudo-plugin-mailer" }],
  start: () => new Promise<void>(() => {}),
});

const keepAlive = setInterval(() => {}, 60_000);
try {
  await manager.start(context);
} catch (error) {
  const timeout = error as Error & { getMetadata(key: string): unknown };
  console.log(timeout.name, "-", timeout.message, "| phase:", timeout.getMetadata("phase"));
} finally {
  clearInterval(keepAlive);
}
console.log(manager.diagnostics().plugins.map((p) => `${p.plugin.name.slice(23)}: ${p.health.status}`).join(", "));
```

Output of `npx tsx hang-guarded.ts`

```ts
smtp: connected
smtp: connection closed
PluginTimeoutError - Plugin "@mycompany/zudo-plugin-fx-rates" timed out after 200ms. | phase: starting
mailer: degraded, fx-rates: unhealthy
```

Now the timeout fires, the mailer is stopped and its connection closed, and the diagnostics blame the right plugin. Put the guard in the host's `startPlugins` helper from the previous section, so every start-up has it. Choose the timeout from the slowest honest start-up of your plugins (a database migration may need a minute; a mailer needs seconds), and remember it bounds `stop` too, which is what limits the receipts plugin's drain on shutdown.

> TEST START-UP THE WAY PRODUCTION RUNS IT
>
> This failure only appears when nothing else holds the event loop, which is exactly the situation in a fresh process at start-up, and rarely the situation in a test runner or a development server. A start-up test that runs your real entry file in a child process, with a plugin that hangs, is the only reliable way to know that your timeout works.

## Testing the plugin

Two kinds of tests. **Unit tests** call the hooks directly with a context you control. `createOwnedPluginContext` returns the context together with its disposables list and its abort function, which is exactly what a test needs to play the manager's part. **Integration tests** run the plugin in a real `PluginManager` with its real dependency, and check the promises from the reasoning section: ordering, rollback, cleanup.

The same Vitest helper as in [Creating a ZudoJS package](https://zudojs.oyinlola.site/learn/zudo-create-package#tests) prints one line per test:

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

tests/receipts.plugin.test.ts

```ts
import { describe, expect, it } from "vitest";
import { PluginManager, createOwnedPluginContext } from "@zudojs/plugins";
import type { PluginEvents } from "@zudojs/plugins";
import { MAILER } from "../src/mailer/mailer.contract.js";
import type { Mailer } from "../src/mailer/mailer.contract.js";
import { createHost, createMemoryTransport } from "../src/host/host.js";
import { createMailerPlugin } from "../src/mailer/mailer.plugin.js";
import { createReceiptsPlugin } from "../src/receipts/receipts.plugin.js";

function fakeEvents() {
  const handlers = new Map<string, (payload: unknown) => void>();
  const events: PluginEvents = {
    on: (name, handler) => void handlers.set(name, handler),
    off: (name) => void handlers.delete(name),
    emit: () => undefined,
  };
  return { events, handlers };
}

describe("receipts plugin, hooks in isolation", () => {
  it("subscribes on start and unsubscribes when disposed", async () => {
    const sentTo: string[] = [];
    const mailer: Mailer = { send: async (message) => void sentTo.push(message.to) };
    const container = { register: () => undefined, resolve: (token: unknown) => (token === MAILER ? mailer : undefined) };
    const { events, handlers } = fakeEvents();
    const owned = createOwnedPluginContext({ name: "receipts" }, { events, container });
    const plugin = createReceiptsPlugin();

    await plugin.install?.(owned.context, { from: "receipts@shopflow.ng" });
    await plugin.initialize?.(owned.context);
    await plugin.start?.(owned.context);
    handlers.get("payment.succeeded")!({ reference: "ORD-1", email: "ada@example.com", amountKobo: 100 });
    await plugin.stop?.(owned.context);
    expect(sentTo).toEqual(["ada@example.com"]);

    for (const disposable of owned.disposables.reverse()) await disposable.dispose();
    expect(handlers.has("payment.succeeded")).toBe(false);
  });

  it("refuses a host without events", async () => {
    const owned = createOwnedPluginContext({ name: "receipts" });
    expect(() => createReceiptsPlugin().install?.(owned.context, { from: "receipts@shopflow.ng" })).toThrow("must provide events");
  });
});

describe("receipts plugin, inside a manager", () => {
  it("closes the mail connection when a later plugin fails", async () => {
    const { context } = createHost({ "receipts.from": "receipts@shopflow.ng" });
    const log: string[] = [];
    const { transport } = createMemoryTransport();
    const manager = new PluginManager();
    manager.register(createMailerPlugin({ ...transport, close: async () => void log.push("closed") }));
    manager.register(createReceiptsPlugin());
    manager.register({
      metadata: { name: "broken" },
      dependencies: [{ name: "@mycompany/zudo-plugin-receipts" }],
      start: () => Promise.reject(new Error("boom")),
    });
    await expect(manager.start(context)).rejects.toThrow("boom");
    expect(log).toEqual(["closed"]);
    expect(manager.diagnostics().plugins.every((p) => p.state === "disposed")).toBe(true);
  });
});
```

test-plugin.tsNode.js only

```ts
import { runTests } from "./vitest-run.js";

await runTests("tests/receipts.plugin.test.ts");
```

Output of `npx tsx test-plugin.ts`

```ts
✓ receipts plugin, hooks in isolation > subscribes on start and unsubscribes when disposed
✓ receipts plugin, hooks in isolation > refuses a host without events
✓ receipts plugin, inside a manager > closes the mail connection when a later plugin fails
```

The first test plays the manager by hand: it calls the hooks in order and then runs the disposables newest first, as the manager does. That makes the cleanup contract testable without a manager. The last test protects the promise that matters most in production: a failure anywhere later in the start-up never leaves the mail connection open. (The memory transport prints its "connected" line to the test's output, which the helper does not show.)

## Shipping the plugin

Package the plugin exactly like `@mycompany/zudo-payments`: `src` compiled to `dist`, an `exports` map, changesets. Three plugin-specific points go into its manifest:

package.json

```json
{
  "name": "@mycompany/zudo-plugin-receipts",
  "version": "1.0.0",
  "description": "Emails a receipt for every successful payment. A ZudoJS plugin.",
  "license": "MIT",
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "files": ["dist"],
  "keywords": ["zudojs", "zudojs-plugin", "payments", "email"],
  "peerDependencies": {
    "@zudojs/plugins": "^1.3.0",
    "@mycompany/zudo-plugin-mailer": "^2.0.0"
  },
  "devDependencies": {
    "@zudojs/plugins": "^1.3.3",
    "@mycompany/zudo-plugin-mailer": "^2.1.0",
    "@zudojs/container": "^1.2.3",
    "@zudojs/events": "^1.3.3",
    "typescript": "^7.0.2",
    "vitest": "^5.0.1"
  }
}
```

- **`@zudojs/plugins` is a peer dependency**, for the reason the plugins lesson gave: the host's copy runs the lifecycle, and your plugin must use its types and helpers.
- **The mailer is a peer dependency too.** The version range appears twice, and must agree: in `peerDependencies`, so npm installs a compatible mailer package; and in the plugin's `dependencies`, so the manager checks the registered *plugin*. The first is about files on disk, the second about what the host actually registered.
- **Capabilities are part of the public API.** A host allow-lists them; adding a capability in a new version makes `register` fail for every host that did not grant it. Treat a new capability as a major change, and list the capabilities in your README.

### In production

- **Trust:** a plugin runs with all the power of the process. Review third-party plugins like any dependency, pin their versions, and grant only the capabilities they need.
- **Idempotency:** in-process events arrive once. If the host later moves `payment.succeeded` to a queue, the same payment can arrive twice; keep a record of sent receipts by `reference` and skip duplicates.
- **Observability:** log the lifecycle events (`plugin.*`) at start-up and shutdown, and expose both `manager.diagnostics()` and each plugin's own `health()` on your health endpoint.
- **Bounded work:** set `hookTimeout`, keep `start` fast (open connections, subscribe, schedule; no long jobs), and make `stop` finish or give up within the timeout.
- **Secrets:** read keys through `context.config` from the environment, never from plugin options committed to the repository, and never log them.

## Practice

TRY IT YOURSELF

### Degrade only after repeated failures

One bounced mailbox is the customer's problem, not the mail system's. Change the health rule: `degraded` only after three failures in a row, reset by any success. Show it with a small stand-in for the plugin's counters.

**Show a solution**

health-rule.tsNode.js only

```ts
import { createDegradedHealth, createHealthyHealth } from "@zudojs/plugins";

function createHealthTracker(limit = 3) {
  let failuresInARow = 0;
  return {
    success: () => void (failuresInARow = 0),
    failure: () => void failuresInARow++,
    health: () => (failuresInARow >= limit ? createDegradedHealth(`${failuresInARow} receipts failed in a row`) : createHealthyHealth()),
  };
}

const tracker = createHealthTracker();
const outcomes = ["fail", "fail", "ok", "fail", "fail", "fail"];
for (const outcome of outcomes) {
  if (outcome === "ok") tracker.success();
  else tracker.failure();
  console.log(outcome.padEnd(4), JSON.stringify(tracker.health()));
}
```

Output of `npx tsx health-rule.ts`

```ts
fail {"status":"healthy"}
fail {"status":"healthy"}
ok   {"status":"healthy"}
fail {"status":"healthy"}
fail {"status":"healthy"}
fail {"status":"degraded","details":"3 receipts failed in a row"}
```

In the plugin, call `success()` where `sent++` is and `failure()` in the `catch`, and return `tracker.health()`. A rule based on consecutive failures separates "one address is bad" from "the mail system is down".

TRY IT YOURSELF

### Predict the orders

Plugins: `api` depends on `receipts`; `receipts` depends on `mailer` and optionally on `audit`; `audit` is registered. They are registered as `api`, `audit`, `receipts`, `mailer`. Predict the start order, the stop order, and what happens to each if `api`'s `start` throws. Then check with plugins that only log.

**Show a solution**

orders.tsNode.js only

```ts
import { createPluginContext, PluginManager } from "@zudojs/plugins";
import type { PluginDependency } from "@zudojs/plugins";

function plugin(name: string, dependencies: PluginDependency[] = [], optional: PluginDependency[] = [], fails = false) {
  return {
    metadata: { name },
    dependencies,
    optionalDependencies: optional,
    start: () => {
      if (fails) throw new Error(`${name} failed`);
      console.log("start", name);
    },
    stop: () => console.log("stop ", name),
    dispose: () => console.log("dispose", name),
  };
}

const manager = new PluginManager();
manager.register(plugin("api", [{ name: "receipts" }], [], true));
manager.register(plugin("audit"));
manager.register(plugin("receipts", [{ name: "mailer" }], [{ name: "audit" }]));
manager.register(plugin("mailer"));
await manager.start(createPluginContext({ name: "shopflow" })).catch((error: Error) => console.log(error.message));
```

Output of `npx tsx orders.ts`

```ts
start mailer
start audit
start receipts
stop  receipts
stop  audit
stop  mailer
dispose api
dispose receipts
dispose audit
dispose mailer
api failed
```

Start: `mailer`, `audit`, `receipts`, then `api`, which fails. Every plugin starts after everything it depends on, optional ones included when present. The rollback stops the started plugins in reverse order (`receipts`, `audit`, `mailer`) and then disposes all four in reverse start order, the failed `api` first. A normal shutdown would use the same reverse order.

## Recap

- A complete plugin is a factory returning metadata (name, version, capabilities), dependencies with version ranges, and hooks that each do one job: `install` validates and offers, `initialize` wires, `start` works, `stop` finishes, disposal releases.
- Register cleanup with `onDispose` or `registerDisposable` on the line after you create the thing it cleans up. Rollback and shutdown then release exactly what exists.
- Share services between plugins through the container under a `Symbol.for` token; tell others what happened through events. Optional dependencies only order plugins that are present.
- The manager checks capabilities at `register`, dependencies and versions before any hook, and rolls back everything on a failed or timed-out hook. It does not check `register` options against the plugin's type, and it rethrows a hook's error without naming the plugin: validate options in `install`, and wrap failures in `PluginStartError` using the diagnostics.
- Diagnostics reflect lifecycle state only; give plugins their own `health()`.
- Test hooks in isolation with `createOwnedPluginContext`, and the rollback promises inside a real manager.

You can now read ZudoJS, extend it with packages and plugins, and prove each piece works. Next: [the real-world projects](https://zudojs.oyinlola.site/learn/usecase-rest-api), starting with a users, products and orders API built from everything in the course.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
