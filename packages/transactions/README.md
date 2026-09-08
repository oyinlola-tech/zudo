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

## Features

- Transaction state machine with enforced transitions
- AsyncLocalStorage context propagation, with suspension
- Savepoints for nested transactions, released on commit
- Before/after hooks
- Adapter abstraction with capability enforcement
- Retry with fixed or exponential backoff
- Rollback-only and timeout semantics

## Safety Notes

- The rollback-only flag is read **before** the adapter is asked to commit, so
  a transaction marked rollback-only — including one that timed out — is rolled
  back and `commit()` rejects. A rollback can never be reported as a commit.
- Committing a transaction that is not active throws rather than silently
  doing nothing. Only an already-committed transaction is a no-op.
- A `nested` transaction rolls back to its savepoint, never to the connection.

## Use Cases

- Database transaction management
- Unit of Work pattern
- Audit logging with transaction context
