---
title: "@zudojs/transactions — Transaction Lifecycle Documentation"
description: "@zudojs/transactions docs: transaction lifecycle, async context propagation, adapter abstraction, savepoints, hooks and rollback for ZudoJS."
source: https://zudojs.oyinlola.site/docs/packages-transactions
---

v1.2.0

# @zudojs/transactions

Run a group of database writes so that either all of them happen or none of them do, with nesting, savepoints, retries and hooks.

TRANSACTIONS COMMIT ROLLBACK SAVEPOINTS RETRY

## OVERVIEW

A *transaction* is a group of database changes that the database treats as one thing: either all of them happen, or none of them do. Take money off one account and add it to another — a transaction is what stops the first write from surviving on its own when the second one fails.

Two words describe how a transaction ends. **Commit** means "keep everything I did" — the changes become permanent and other people can see them. **Rollback** means "throw everything I did away" — the database goes back to how it looked before the transaction started.

The group of work you wrap in one transaction is called a *unit of work*. "Place an order" is a unit of work: insert the order row, insert the line items, decrease the stock count. All three, or none.

`@zudojs/transactions` does not talk to any database. You give it an *adapter* — a small object that knows how to say BEGIN, COMMIT and ROLLBACK to your particular database — and it handles everything above that: when to commit, when to roll back, what a transaction inside another transaction should do, retrying after a deadlock, and running your hooks. See [@zudojs/database](https://zudojs.oyinlola.site/docs/packages-database.md) for the database side.

When you need it

- One user action writes to several tables and a half-finished result would be wrong.
- Service functions call each other and you want one transaction across all of them, not one each.
- You want retries on deadlocks and serialization failures without writing the retry loop yourself.
- You want to run code only after a commit really succeeded (send the email, publish the event).

When you don't

- A single write. Your database already makes one statement all-or-nothing.
- Reads only. Wrapping a read in a transaction buys you nothing unless you need a specific isolation level.
- Work that spans two systems that cannot share a transaction, such as a database plus a payment provider. Use a saga or an outbox instead.
- Your database driver's own `transaction()` helper is enough and nothing nests.

## INSTALLATION

Install the package. It pulls in `@zudojs/errors` on its own, and it needs Node 24 or newer.

```bash
$ npm install @zudojs/transactions
```

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

## QUICK START

The package ships an in-memory adapter so you can try everything without a database. This opens a transaction, runs your code inside it, and commits when your code returns.

```ts
import {
  createTransactionManager,
  createInMemoryAdapter,
} from "@zudojs/transactions";

const manager = createTransactionManager({
  adapter: createInMemoryAdapter(),
});

const orderId = await manager.run(async (transaction) => {
  console.log(transaction.state); // "active"
  console.log(transaction.kind);  // "root"
  // your inserts and updates go here
  return "ord_1";
});

console.log(orderId); // "ord_1"
```

`run()` returns whatever your callback returns, so `orderId` is the string `"ord_1"`. If your callback throws instead, `run()` rolls the transaction back and rethrows your error — you never write a `try/catch` just to roll back.

> **Reach for `run()` first.** `begin()`, `commit()` and `rollback()` exist for the rare case where a transaction must outlive one function call. Everything else is easier and safer with `run()`.

## UNIT OF WORK

The callback you pass to `run()` is the unit of work. Put everything that must succeed together inside it, and nothing that must not be undone.

This is the whole shape of it: three writes, one transaction. If `decreaseStock` throws, the order row and the line items are rolled back too, and the caller sees the original error.

```ts
import {
  createTransactionManager,
  createInMemoryAdapter,
} from "@zudojs/transactions";

const manager = createTransactionManager({
  adapter: createInMemoryAdapter(),
});

async function insertOrder() { console.log("insert order"); }
async function insertLineItems() { console.log("insert line items"); }
async function decreaseStock() { throw new Error("out of stock"); }

try {
  await manager.run(async () => {
    await insertOrder();
    await insertLineItems();
    await decreaseStock();
  }, { name: "place-order" });
} catch (error) {
  console.log((error as Error).message); // "out of stock"
}
```

You should see `insert order`, `insert line items`, then `out of stock`. The two inserts were rolled back before the error reached your `catch`.

### Doing it by hand

When you need the transaction open across several calls, use `begin()` and finish it yourself. Every path must end in a commit or a rollback, or the database connection is left holding an open transaction.

```ts
const transaction = await manager.begin({ name: "manual" });

try {
  // your writes go here
  await manager.commit(transaction);
} catch (error) {
  await manager.rollback(transaction, error);
}

console.log(transaction.state); // "committed"
```

### The states a transaction moves through

`transaction.state` tells you where it is. The order is fixed, and an illegal jump throws a `TransactionStateError` rather than quietly doing nothing.

| State | What it means | Can move to |
| --- | --- | --- |
| `pending` | Created, but the adapter has not opened it yet. | `active`, `rolling_back`, `failed` |
| `active` | Open. This is where your writes happen. | `committing`, `rolling_back`, `failed` |
| `committing` | The commit is under way. | `committed`, `rolling_back`, `failed` |
| `committed` | Done and kept. Nothing follows. | — |
| `rolling_back` | The rollback is under way. | `rolled_back`, `failed` |
| `rolled_back` | Done and thrown away. Nothing follows. | — |
| `failed` | The adapter refused a commit or a rollback. Nothing follows. | — |

> **Watch out:** committing a transaction that was already rolled back throws `TransactionStateError`. Only a second commit of an already-committed transaction is a harmless no-op.

> **The other way round throws too (since v1.2.0):** `manager.rollback(transaction, reason)` on a transaction that is already `committed` throws `TransactionStateError`, matching `Transaction.rollback()`. Before v1.2.0 it silently did nothing, so a `catch` block that rolled back after a late failure looked as if it had undone the work. Rolling back an already rolled-back or failed transaction is still a harmless no-op, and `run()` no longer tries to roll back when an error (for example from an `afterCommit` hook) arrives after a successful commit.

## ADAPTERS

An *adapter* is the object that turns "begin a transaction" into something your database understands. The manager never touches a driver; it calls `adapter.begin()`, `adapter.commit(handle)` and `adapter.rollback(handle)`.

A *handle* is whatever your `begin()` returns — a client, a connection, an id. The manager stores it and hands it straight back to you on commit and rollback, without looking inside.

Application code can reach the handle too, so a repository can run its queries on "the connection of the current transaction". Since v1.2.0 `getTransactionHandle<T>(transaction)` returns the handle of a transaction you hold, and `currentTransactionHandle<T>()` or `manager.getCurrentHandle<T>()` the handle of whatever transaction is in scope. A participant resolves to the handle of the transaction it joined, a savepoint to its connection's handle, and a non-transactional scope (or no transaction at all) to `undefined`. Use the handle for work inside the transaction; commit and roll back through the manager, or you bypass its state machine, hooks and events.

```ts
import {
  createTransactionManager,
  createInMemoryAdapter,
  currentTransactionHandle,
  getTransactionHandle,
} from "@zudojs/transactions";

const manager = createTransactionManager({ adapter: createInMemoryAdapter() });

// A repository deep in the call stack finds the transaction's connection itself.
function connectionForQuery(): unknown {
  return currentTransactionHandle() ?? "the pool";
}

await manager.run(async (transaction) => {
  console.log(connectionForQuery() === getTransactionHandle(transaction)); // true
  console.log(manager.getCurrentHandle() === getTransactionHandle(transaction)); // true
});

console.log(connectionForQuery()); // "the pool"
```

`currentTransactionHandle()` reads the shared default context. If you gave the manager its own `context`, pass that context, or call `manager.getCurrentHandle()`. `getTransactionHandle` throws `TypeError` for an object this package did not create.

An adapter also declares its `capabilities`: whether it can do savepoints, nested transactions, read-only transactions, timeouts, and which isolation levels it accepts. Asking for something the adapter did not declare throws `TransactionIsolationError` (unsupported isolation level) or `TransactionCapabilityError` (any other capability) before any work starts.

This adapter records what it was asked to do instead of talking to a database, so you can see exactly which calls the manager makes.

```ts
import { createTransactionManager } from "@zudojs/transactions";
import type {
  TransactionAdapter,
  TransactionHandle,
} from "@zudojs/transactions";

const log: string[] = [];

const adapter: TransactionAdapter = {
  capabilities: {
    savepoints: true,
    nestedTransactions: true,
    isolationLevels: ["read_committed", "serializable"],
    readOnlyTransactions: true,
    timeouts: true,
  },
  async begin(): Promise<TransactionHandle> {
    log.push("BEGIN");
    return { connection: log.length };
  },
  async commit() { log.push("COMMIT"); },
  async rollback() { log.push("ROLLBACK"); },
  async createSavepoint(_handle, name) { log.push(`SAVEPOINT ${name}`); },
  async rollbackToSavepoint(_handle, name) { log.push(`ROLLBACK TO ${name}`); },
  async releaseSavepoint(_handle, name) { log.push(`RELEASE ${name}`); },
};

const manager = createTransactionManager({ adapter });

await manager.run(async () => "done");
console.log(log); // [ 'BEGIN', 'COMMIT' ]
```

A real adapter looks the same, with the `log.push` lines replaced by `client.query("BEGIN")` and friends. `createAdapter(implementation, capabilities)` is a small helper that takes an existing adapter and replaces its capability list with a frozen one.

### Isolation levels

An *isolation level* says how much of other, still-unfinished transactions' work yours is allowed to see. The four levels, from most permissive to strictest, are `read_uncommitted`, `read_committed`, `repeatable_read` and `serializable`.

You ask for one per transaction with `isolation`. The adapter above accepts two of the four, so this throws:

```ts
await manager.begin({ isolation: "repeatable_read" });
// TransactionIsolationError: Isolation level "repeatable_read" is not supported by the adapter
```

## NESTING AND PROPAGATION

Service functions call each other, and each of them may want a transaction. *Propagation* is the rule that decides what happens when one `run()` starts while another is already open.

The default is `required`: the inner call joins the transaction already in progress instead of opening a second one. What it receives is a *participant* — a handle that can read the transaction and mark it rollback-only, but can never commit it. The scope that opened the transaction is the only one that finishes it.

The manager finds the transaction in progress through Node's `AsyncLocalStorage`, so it travels down through every `await` without you passing anything around.

```ts
import {
  createTransactionManager,
  createInMemoryAdapter,
} from "@zudojs/transactions";

const manager = createTransactionManager({
  adapter: createInMemoryAdapter(),
});

await manager.run(async (outer) => {
  await manager.run(async (inner) => {
    console.log(inner.kind);            // "participant"
    console.log(inner.id === outer.id); // true
  });

  console.log(outer.state); // "active" — the inner run did not commit it
});
```

If the inner callback throws, the participant does not roll the whole thing back on the spot. It marks the enclosing transaction *rollback-only*, and the error travels up to whoever opened the transaction.

### The seven modes

Pass one as `propagation`. Both columns matter — what a mode does when a transaction is in progress, and what it does when none is.

| Mode | Transaction in progress | None in progress |
| --- | --- | --- |
| `required` (default) | Joins it as a participant. | Opens a new one. |
| `requires_new` | Suspends it and opens a separate one. | Opens a new one. |
| `nested` | Opens a savepoint inside it. | Opens a new one. |
| `supports` | Joins it as a participant. | Runs with no transaction. |
| `not_supported` | Suspends it and runs with no transaction. | Runs with no transaction. |
| `mandatory` | Joins it as a participant. | Throws `TransactionPropagationError`. |
| `never` | Throws `TransactionPropagationError`. | Runs with no transaction. |

"Runs with no transaction" gives you a handle whose `kind` is `"none"`: it moves through the same states so your code can treat it uniformly, but the adapter is never called. "Suspends" means the enclosing transaction is hidden for the duration, so anything nested inside sees nothing in progress.

> **Danger:** `requires_new` opens a second, independent transaction while the first is still open. It commits on its own and its writes survive even if the outer transaction later rolls back. On a single-connection driver it can also deadlock against the transaction it suspended.

## SAVEPOINTS

A *savepoint* is a bookmark inside a transaction. You can undo back to the bookmark without throwing away everything the transaction did before it.

That is what `propagation: "nested"` gives you. The inner scope gets a handle whose `kind` is `"savepoint"`. If it fails, the manager rolls back to that savepoint only; if it succeeds, the savepoint is released and its work stays part of the outer transaction.

Here an optional step fails and the outer transaction still commits.

```ts
import {
  createTransactionManager,
  createInMemoryAdapter,
} from "@zudojs/transactions";

const manager = createTransactionManager({
  adapter: createInMemoryAdapter(),
});

await manager.run(async (outer) => {
  try {
    await manager.run(
      async (child) => {
        console.log(child.kind);     // "savepoint"
        console.log(child.parentId === outer.id); // true
        throw new Error("coupon rejected");
      },
      { propagation: "nested" },
    );
  } catch (error) {
    console.log((error as Error).message); // "coupon rejected"
  }

  console.log(outer.isRollbackOnly()); // false — the outer work survived
});
```

Nested transactions need an adapter that declares `savepoints: true` and implements `createSavepoint`. Without both, `begin({ propagation: "nested" })` throws `TransactionPropagationError`. The in-memory adapter supports them.

## ROLLBACK-ONLY AND TIMEOUTS

Sometimes you know a transaction must not be kept, but you are not the code that will finish it — you are three functions deep. Mark it *rollback-only* and carry on; whoever tries to commit it gets a rollback instead.

The flag is checked before the adapter is asked to commit, so a rollback can never be reported to you as a commit. The commit rejects with `TransactionRollbackOnlyError` (new in v1.2.0), a `TransactionRollbackError` subclass whose message reads `Transaction "txn_…" commit refused: transaction marked rollback-only`. The reason you gave is in `error.metadata.originalError`. Before v1.2.0 this was a plain `TransactionRollbackError` with the misleading message "rollback failed"; `instanceof TransactionRollbackError` and the error code still match.

```ts
import {
  createTransactionManager,
  createInMemoryAdapter,
  TransactionRollbackOnlyError,
} from "@zudojs/transactions";

const manager = createTransactionManager({
  adapter: createInMemoryAdapter(),
});

const transaction = await manager.begin();
transaction.markRollbackOnly("stock check failed");

try {
  await manager.commit(transaction);
} catch (error) {
  console.log(error instanceof TransactionRollbackOnlyError); // true
  console.log((error as Error).message);
  // Transaction "txn_…" commit refused: transaction marked rollback-only
}

console.log(transaction.state); // "rolled_back"
```

### Timeouts

`timeout` is a number of milliseconds. When it passes, the transaction is marked rollback-only, `timedOut` becomes `true`, and `transaction.signal` (an `AbortSignal`, new in v1.2.0) aborts with a `TransactionTimeoutError` as its reason. `run()` stops waiting for the callback at that moment: it rolls back and rejects with the `TransactionTimeoutError` straight away.

```ts
import {
  createTransactionManager,
  createInMemoryAdapter,
  TransactionTimeoutError,
} from "@zudojs/transactions";

const manager = createTransactionManager({ adapter: createInMemoryAdapter() });

const started = Date.now();
try {
  await manager.run(async (transaction) => {
    // Hand the signal to cancellable work so it stops too.
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 300);
      transaction.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(transaction.signal.reason);
      });
    });
  }, { timeout: 20 });
} catch (error) {
  console.log(error instanceof TransactionTimeoutError, Date.now() - started < 100); // true true
}
```

JavaScript cannot cancel a promise, so a callback that ignores the signal keeps running in the background after `run()` has rejected; its eventual result or error is discarded. Any side effect it has outside the transaction (an HTTP call, a queue message, a file) still happens. Pass `transaction.signal` to `fetch`, your driver, or anything else that accepts one, or use the database's own statement timeout. A participant exposes the signal of the transaction it joined, and a savepoint's signal also aborts with its parent's. `raceSignal(work, signal)` is the helper `run()` uses: it settles with `work`, or rejects with `signal.reason` as soon as the signal aborts.

> **Watch out:** a timed-out transaction is rolled back and `commit()`/`run()` throw `TransactionTimeoutError` (`transaction.timedOut` is also true). Transactions opened with `begin()` time out too: their signal aborts and the later `commit()` rejects. The adapter must declare `timeouts: true` or the `timeout` option is rejected up front.

> **Changed in v1.2.0:** `transaction.timed_out` is emitted once per timeout, from the timer. It used to be emitted a second time when the commit of a timed-out transaction was refused. Before v1.2.0 there was also no signal, and `run()` waited for the callback to finish before rolling back.

## RETRIES

Some database failures are worth trying again: deadlocks and serialization failures happen because two transactions collided, and one of them usually succeeds on a second run.

A failed transaction cannot be resumed, only replayed, so a retry re-runs your whole callback in a brand new transaction. Write callbacks that are safe to run twice.

```ts
import {
  createTransactionManager,
  createInMemoryAdapter,
} from "@zudojs/transactions";

const manager = createTransactionManager({
  adapter: createInMemoryAdapter(),
});

let tries = 0;

const result = await manager.run(
  async () => {
    tries++;
    if (tries < 3) throw new Error("deadlock detected");
    return "ok";
  },
  {
    retry: {
      attempts: 3,
      delay: 50,
      backoff: "exponential",
      shouldRetry: (error) =>
        (error as Error).message.includes("deadlock"),
    },
  },
);

console.log(result, tries); // "ok" 3
```

`attempts` counts retries on top of the first try, so `attempts: 3` means up to four runs. `delay` is the wait in milliseconds; with `backoff: "exponential"` it doubles each time (50, 100, 200). Without `shouldRetry`, every failure of a transaction this `run()` opened is retried — including the constraint violations that will fail identically every time. An attempt that only joined an enclosing transaction is never replayed.

## HOOKS AND REGISTRY

A *hook* is a function the manager calls at a fixed moment in a transaction's life: `beforeBegin`, `afterBegin`, `beforeCommit`, `afterCommit`, `beforeRollback`, `afterRollback` and `onError`. Hooks belong to the manager and run for every transaction it owns.

`mergeHooks()` combines several sets into one, running them in the order you passed them. A *registry* is a list of the transactions currently open, useful for a health endpoint or a "what is stuck?" log.

```ts
import {
  createTransactionManager,
  createInMemoryAdapter,
  createTransactionRegistry,
  mergeHooks,
} from "@zudojs/transactions";
import type { TransactionHooks } from "@zudojs/transactions";

const logging: TransactionHooks = {
  async afterBegin({ transaction }) {
    console.log("begin", transaction.options.name);
  },
  async afterCommit({ transaction }) {
    console.log("commit", transaction.options.name);
  },
};

const auditing: TransactionHooks = {
  async onError({ error }) {
    console.error("transaction error", error);
  },
};

const registry = createTransactionRegistry();

const manager = createTransactionManager({
  adapter: createInMemoryAdapter(),
  hooks: mergeHooks(logging, auditing),
  registry,
});

await manager.run(async () => {
  console.log(registry.getActive().length); // 1
}, { name: "place-order" });

console.log(registry.getActive().length); // 0
```

You should see `begin place-order`, then `1`, then `commit place-order`, then `0`. Participants are not registered separately — the registry tracks the transactions the manager actually owns.

### Per-transaction callbacks

`afterCommit()` and `afterRollback()` on the transaction itself register callbacks for that one transaction. Use `afterCommit` for side effects that must not happen unless the data really landed, such as sending an email or publishing an event. Inside a `nested` block, releasing the savepoint is not a commit: its callbacks (and `hooks.afterCommit` for the savepoint) move to the enclosing transaction and run only when the outermost transaction commits, or for `afterRollback`, rolls back.

```ts
await manager.run(async (transaction) => {
  transaction.afterCommit(async () => {
    console.log("order confirmation sent");
  });
});
// prints "order confirmation sent" after the commit succeeds
```

## API REFERENCE

Everything below is exported from `@zudojs/transactions`. Most apps only need `createTransactionManager`, an adapter, and `manager.run()`.

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| `createTransactionManager({ adapter, context?, hooks?, registry?, onEvent? })` | Builds the manager you call from app code. | `adapter` is required; the context defaults to a shared `AsyncLocalStorage` one. `onEvent` receives a `TransactionEvent` for each lifecycle step. |
| `createInMemoryAdapter()` | Adapter that keeps handles in memory and emulates savepoints. | For tests and examples. Declares every capability. |
| `createAdapter(implementation, capabilities)` | Copies an adapter with a frozen capability list. | Handy when one driver is used at two capability levels. |
| `createTransactionContext()` | A fresh `AsyncLocalStorage`-backed context. | Pass as `context` to isolate a manager, as the tests do. |
| `getDefaultContext()` / `resetDefaultContext()` | Read or discard the shared default context. | `reset` is for tests. |
| `createTransactionRegistry()` | In-memory list of open transactions. | Pass as `registry`; read with `getActive()`. |
| `mergeHooks(...hookSets)` | Combines hook objects into one. | Earlier sets run first for each event. |
| `createTransaction(options?, parentId?, kind?)` | Builds a bare transaction in `pending` state. | The manager calls this for you. Direct use is rare. |
| `createParticipant(parent)` / `createNonTransactional(options?)` | The handles `required` and `not_supported` hand back. | Exposed for custom propagation logic. |
| `isTerminalState(state)` | `true` for `committed`, `rolled_back`, `failed`. | Works on a state string. |
| `isModifiable(transaction)` | `true` while the state is `active` or `pending`. | Takes a transaction, not a state. |
| `summarizeTransaction(transaction)` | One-line summary for logs. | e.g. `"Transaction txn_ab12, state=active, duration=42ms"`. |
| `canTransition(from, to)` / `isTerminal(state)` / `createTransitionFunction(get, set)` | The state machine rules, on their own. | For custom `Transaction` implementations. |
| `getTransactionHandle<T>(transaction)` / `currentTransactionHandle<T>(context?)` | The adapter handle behind a transaction, or behind the one in scope. | New in v1.2.0. `undefined` outside a transaction or in a non-transactional scope. |
| `raceSignal(work, signal)` | Settles with `work`, or rejects with `signal.reason` once `signal` aborts. | New in v1.2.0. The abandoned promise keeps running; its rejection is observed. |
| `asSavepointHandle(handle)` | Narrows a handle to `{ parent, savepoint }`, or `undefined`. | For adapters that inspect nested handles. |

### Manager methods

| Name | What it does | Notes |
| --- | --- | --- |
| `run<T>(callback, options?)` | Opens a transaction, runs the callback, commits or rolls back. | Returns whatever the callback returns. Honours `retry`. |
| `begin(options?)` | Opens a transaction and returns it. | You must commit or roll it back yourself. |
| `commit(transaction)` | Commits it, or rolls back if it is rollback-only. | No-op for participants and already-committed transactions; throws otherwise when not `active`. |
| `rollback(transaction, reason?)` | Rolls back, or marks the joined transaction rollback-only. | Throws `TransactionStateError` on a committed transaction (since v1.2.0); already rolled-back or failed ones are a no-op. |
| `getCurrent()` | The transaction in scope right now, or `undefined`. | Reads the async context. |
| `getCurrentHandle<T>()` | The adapter handle of the transaction in scope, or `undefined`. | New in v1.2.0. Uses this manager's context. |

### Transaction members

| Name | What it does | Notes |
| --- | --- | --- |
| `id`, `parentId`, `startedAt` | Identity and start time. | `id` looks like `txn_ab12…`; a participant shares the id it joined. |
| `kind` | `"root"`, `"participant"`, `"savepoint"` or `"none"`. | How the manager routes commit and rollback. |
| `state`, `timedOut` | Lifecycle state and whether the timeout fired. | See the state table above. |
| `signal` | An `AbortSignal` that aborts with a `TransactionTimeoutError` when the transaction times out. | New in v1.2.0. Never aborts without a `timeout`. Participants share the joined transaction's signal. |
| `options`, `metadata` | The options it was opened with; metadata as a map. | `metadata` hands back a copy, so writing to it changes nothing. |
| `markRollbackOnly(reason?)` / `isRollbackOnly()` | Forbid the commit / ask whether it was forbidden. | On a participant, both apply to the joined transaction. |
| `afterCommit(cb)` / `afterRollback(cb)` | Run a callback once this transaction ends that way. | The other list is discarded, so exactly one set runs. |
| `commit()` / `rollback(reason?)` | Move the transaction's own state. | Call `manager.commit()` instead — these do not touch the adapter. |

### Options

| Name | What it does | Notes |
| --- | --- | --- |
| `propagation` | What to do when a transaction is already open. | Default `"required"`. See the table above. |
| `isolation` | Isolation level to ask the adapter for. | Must appear in the adapter's `isolationLevels`. |
| `timeout` | Milliseconds before the transaction is marked rollback-only. | `0` or omitted means no timeout. Needs `timeouts: true`. |
| `readOnly` | Asks the adapter for a read-only transaction. | Needs `readOnlyTransactions: true`. |
| `name`, `metadata` | Labels for logs and hooks. | Never interpreted by the package. |
| `retry` | `{ attempts?, delay?, backoff?, shouldRetry? }`. | Only honoured by `run()`, not by `begin()`. |

### Errors

| Name | What it does | Notes |
| --- | --- | --- |
| `TransactionError` | Base class for every error here. | Owned by [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) and re-exported here (all 13 classes), so `instanceof` matches either import. |
| `TransactionStateError` | The transaction is in the wrong state for what you asked. | Thrown by commit, rollback and illegal transitions. |
| `TransactionRollbackError` | The commit turned into a rollback, or the rollback itself failed. | A driver failure during rollback is in `cause`. Accepts an optional `message` option. |
| `TransactionRollbackOnlyError` | A commit was refused because the transaction was marked rollback-only (by `markRollbackOnly` or a failing participant). | New in v1.2.0; extends `TransactionRollbackError`. Message: `commit refused: transaction marked rollback-only`. The reason is in `error.metadata.originalError`. |
| `TransactionCommitError` | The adapter refused the commit. | The driver error is in `cause`. |
| `TransactionAdapterError` | The adapter misbehaved. | The in-memory adapter throws it for a foreign handle or an unknown savepoint. A missing capability is `TransactionIsolationError` / `TransactionCapabilityError`. |
| `TransactionPropagationError` | A propagation rule was broken. | `mandatory` with nothing open, `never` with something open, an unknown mode. |
| `TransactionTimeoutError`, `TransactionIsolationError`, `TransactionCapabilityError`, `SavepointError` | A timed-out transaction (also `transaction.signal.reason`); an isolation level or other capability the adapter did not declare; a savepoint that could not be released or rolled back to. | Thrown by the manager. |
| `TransactionRequiredError`, `TransactionUnexpectedError` | Extra error classes you can throw from your own adapters and services. | The package itself never throws these. |

### Types and constants

| Name | What it does | Notes |
| --- | --- | --- |
| `Transaction`, `TransactionOptions`, `TransactionRetryOptions` | The handle you are given and the options you pass. | Type-only exports. |
| `TransactionState`, `TransactionPropagation`, `TransactionIsolationLevel` | The string unions used above. | Useful for typing your own wrappers. |
| `TransactionAdapter`, `TransactionAdapterCapabilities`, `TransactionHandle` | The adapter contract. | Implement the first; `TransactionHandle` is `unknown`. |
| `TransactionContext` | Contract for async propagation: `get`, `run`, `exit`. | A custom context must implement `exit`. |
| `TransactionHooks`, `TransactionHookContext`, `TransactionErrorContext` | Hook shapes. | Hooks receive `{ transaction }`, `onError` also `{ error }`. |
| `TransactionRegistry` | Contract for a registry. | Implement it to publish open transactions elsewhere. |
| `Savepoint`, `TransactionResult` | Shapes for savepoint objects and run results. | Declarations only — nothing in the package returns one. |
| `TRANSACTION_EVENTS`, `TransactionEvent`, `TransactionEventHandler` | Names and shapes for transaction lifecycle events. | Pass `onEvent` to `createTransactionManager` to receive them. A throwing handler is ignored. A timeout is reported once (see Timeouts). |

> Transaction internals (`_setHandle`, `_transition`, `_markTimedOut`) live behind a private symbol and are not reachable from the package's exports. Drive the state machine through the manager.

## COMMON MISTAKES

- **Committing the handle an inner `run()` gave you.** With the default `required` propagation that handle is a participant, so `manager.commit(inner)` does nothing and the outer transaction is still open. Let the scope that opened the transaction finish it.
- **Swallowing an inner failure and committing anyway.** A failing participant marks the enclosing transaction rollback-only, so the outer `commit()` rejects with `TransactionRollbackError` even though you caught the error. If a step is genuinely optional, run it with `propagation: "nested"` so only its savepoint is undone.
- **Sending the email inside the callback.** If the commit later fails, the mail is already gone. Register it with `transaction.afterCommit()` so it only runs once the data is really saved.
- **Retrying everything.** Without `shouldRetry`, a constraint violation is replayed until the attempts run out — slower, and the error is the same each time. Return `true` only for deadlocks and serialization failures.
- **Ignoring `transaction.signal`.** On a timeout `run()` rolls back and rejects at once, but a callback that does not watch the signal keeps running in the background and its side effects still happen. Pass `transaction.signal` to cancellable work.
- **Declaring capabilities the adapter does not have.** Claiming `savepoints: true` without implementing `createSavepoint` makes `propagation: "nested"` throw; claiming isolation levels the driver ignores means a `serializable` unit of work silently runs at the default. Declare only what you implement.
- **Reaching for `requires_new` to "just commit this bit".** It opens a second transaction on top of the first. On a single-connection driver the two can deadlock, and its writes survive the outer rollback. Use `nested` unless you truly want independent work.

## RELATED PACKAGES

- [@zudojs/database](https://zudojs.oyinlola.site/docs/packages-database.md) — the connection and query side. Your adapter's `begin`, `commit` and `rollback` are written against it.
- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the `BaseError` every transaction error extends, and the codes you match on.
- [@zudojs/cqrs](https://zudojs.oyinlola.site/docs/packages-cqrs.md) — command handlers are the natural place to wrap one unit of work per command.
- [@zudojs/events](https://zudojs.oyinlola.site/docs/packages-events.md) — publish from `afterCommit` so events only leave once the data is saved.
- [@zudojs/testing](https://zudojs.oyinlola.site/docs/packages-testing.md) — helpers for the tests where `createInMemoryAdapter()` stands in for a database.

## COMPLETE EXPORT INDEX

Every name `@zudojs/transactions` exports from its package root at v1.2.2 — **58** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 58 exports**

Classes (13)

`SavepointError` `TransactionAdapterError` `TransactionCapabilityError` `TransactionCommitError` `TransactionError` `TransactionIsolationError` `TransactionPropagationError` `TransactionRequiredError` `TransactionRollbackError` `TransactionRollbackOnlyError` `TransactionStateError` `TransactionTimeoutError` `TransactionUnexpectedError`

Functions (22)

`asSavepointHandle` `canTransition` `createAdapter` `createEmitter` `createInMemoryAdapter` `createNonTransactional` `createParticipant` `createTransaction` `createTransactionContext` `createTransactionManager` `createTransactionRegistry` `createTransitionFunction` `currentTransactionHandle` `getDefaultContext` `getTransactionHandle` `isModifiable` `isTerminal` `isTerminalState` `mergeHooks` `raceSignal` `resetDefaultContext` `summarizeTransaction`

Interfaces (14)

`SavepointHandle` `Transaction` `TransactionAdapter` `TransactionAdapterCapabilities` `TransactionContext` `TransactionErrorContext` `TransactionErrorOptions` `TransactionEvent` `TransactionHookContext` `TransactionHooks` `TransactionManagerOptions` `TransactionOptions` `TransactionRegistry` `TransactionRetryOptions`

Type aliases (8)

`TransactionEmitter` `TransactionEventHandler` `TransactionHandle` `TransactionIsolationLevel` `TransactionKind` `TransactionPropagation` `TransactionRetryPredicate` `TransactionState`

Constants (1)

`TRANSACTION_EVENTS`
