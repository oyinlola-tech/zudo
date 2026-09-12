# @zudojs/transactions

Transaction lifecycle and coordination with state machine, AsyncLocalStorage context propagation, savepoints, hooks, and adapter abstraction.

## Installation

```bash
npm install @zudojs/transactions
```

## Quick Start

```typescript
import { createTransactionManager } from "@zudojs/transactions";

const manager = createTransactionManager({ adapter: databaseAdapter });

// `run` opens a transaction, commits on success, rolls back on a throw.
const orderId = await manager.run(async (transaction) => {
  await insertOrder(transaction);
  await insertLineItems(transaction);
  return "o_1";
});

// A nested `run` joins the enclosing transaction rather than completing it.
await manager.run(async () => {
  await manager.run(async (participant) => {
    // participant.kind === "participant"; committing it is a no-op, and a
    // throw here marks the enclosing transaction rollback-only.
  });
});

// Retries replay the whole unit of work.
await manager.run(handler, {
  retry: {
    attempts: 3,
    backoff: "exponential",
    delay: 50,
    shouldRetry: (error) => isSerializationFailure(error),
  },
});
```

## Propagation

| Mode            | Transaction in progress      | None in progress         |
| --------------- | ---------------------------- | ------------------------ |
| `required`      | joins it as a participant    | opens a new one          |
| `requires_new`  | suspends it, opens a new one | opens a new one          |
| `nested`        | opens a savepoint on it      | opens a new one          |
| `supports`      | joins it as a participant    | runs non-transactionally |
| `not_supported` | suspends it                  | runs non-transactionally |
| `mandatory`     | joins it as a participant    | throws                   |
| `never`         | throws                       | runs non-transactionally |

## Lifecycle events

Pass `onEvent` to observe the lifecycle. Each event names a member of
`TRANSACTION_EVENTS` and carries the transaction id, a timestamp and the
elapsed duration:

```typescript
const manager = createTransactionManager({
  adapter,
  onEvent: (event) => metrics.increment(event.type, { id: event.transactionId }),
});
```

Emitted: `started`, `committing`, `committed`, `rolling_back`, `rolled_back`,
`failed` and `timed_out`. A throwing observer is ignored rather than failing
the transaction.

## Errors

| Condition                              | Error                          |
| -------------------------------------- | ------------------------------ |
| Transaction outlived its `timeout`      | `TransactionTimeoutError`      |
| Marked rollback-only, then committed    | `TransactionRollbackError`     |
| Adapter lacks the requested isolation   | `TransactionIsolationError`    |
| Adapter lacks another requested feature | `TransactionCapabilityError`   |
| Savepoint create/rollback/release fails | `SavepointError`               |
| Propagation precondition violated       | `TransactionPropagationError`  |
| Operation invalid for the current state | `TransactionStateError`        |
| Adapter refused the commit              | `TransactionCommitError`       |
| Adapter itself failed                   | `TransactionAdapterError`      |

## Features

- Transaction state machine with enforced transitions
- AsyncLocalStorage context propagation, with suspension
- Savepoints for nested transactions, released on commit
- Before/after hooks
- Adapter abstraction with capability enforcement
- Retry with fixed or exponential backoff
- Rollback-only and timeout semantics
- Lifecycle events for observability

## Safety Notes

- The rollback-only flag is read **before** the adapter is asked to commit, so
  a transaction marked rollback-only — including one that timed out — is rolled
  back and `commit()` rejects. A rollback can never be reported as a commit.
- Committing a transaction that is not active throws rather than silently
  doing nothing. Only an already-committed transaction is a no-op.
- A `nested` transaction rolls back to its savepoint, never to the connection.
  Savepoints are always created on the connection, including when the
  enclosing scope is itself a savepoint or a participant.
- `begin()` and `run()` both honour `timeout`; completing a transaction through
  `manager.commit()` / `manager.rollback()` releases its timer and registry entry.
- Failures thrown by `afterCommit` callbacks never undo the commit; they are
  reported to `hooks.onError` as an `AggregateError`.
- `retry` replays only attempts that opened their own transaction. An attempt
  that joined an enclosing transaction has marked it rollback-only and is not
  replayed.

## Use Cases

- Database transaction management
- Unit of Work pattern
- Audit logging with transaction context
