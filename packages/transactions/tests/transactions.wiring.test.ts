/**
 * @zudojs/transactions — Round-9 regression tests.
 *
 * Each case covers something the package exported and documented but never
 * produced: lifecycle events, and the error classes that had a trigger
 * condition in the code but a more generic class thrown at it.
 */

import { describe, it, expect } from "vitest";
import {
  createTransactionManager,
  createTransactionContext,
  createInMemoryAdapter,
  TRANSACTION_EVENTS,
  SavepointError,
  TransactionCapabilityError,
  TransactionIsolationError,
  TransactionRollbackError,
  TransactionTimeoutError,
  isTerminalState,
} from "../src/index.js";
import type {
  TransactionAdapter,
  TransactionEvent,
  TransactionHandle,
} from "../src/index.js";

/** A manager plus the events it emitted. */
function makeObserved(adapter: TransactionAdapter = createInMemoryAdapter()) {
  const events: TransactionEvent[] = [];
  const manager = createTransactionManager({
    adapter,
    context: createTransactionContext(),
    onEvent: (event) => events.push(event),
  });
  return { manager, events, types: () => events.map((event) => event.type) };
}

describe("TXN-W1: lifecycle events are emitted", () => {
  it("emits started, committing and committed for a successful run", async () => {
    const { manager, types } = makeObserved();

    await manager.run(async () => "ok");

    expect(types()).toEqual([
      TRANSACTION_EVENTS.STARTED,
      TRANSACTION_EVENTS.COMMITTING,
      TRANSACTION_EVENTS.COMMITTED,
    ]);
  });

  it("emits rolling_back and rolled_back when the body throws", async () => {
    const { manager, types } = makeObserved();

    await expect(
      manager.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(types()).toEqual([
      TRANSACTION_EVENTS.STARTED,
      TRANSACTION_EVENTS.ROLLING_BACK,
      TRANSACTION_EVENTS.ROLLED_BACK,
    ]);
  });

  it("emits timed_out for a transaction that outlives its timeout", async () => {
    const { manager, types } = makeObserved();

    await expect(
      manager.run(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 40));
        },
        { timeout: 10 },
      ),
    ).rejects.toBeInstanceOf(TransactionTimeoutError);

    expect(types()).toContain(TRANSACTION_EVENTS.TIMED_OUT);
  });

  it("carries the transaction id and a duration on every event", async () => {
    const { manager, events } = makeObserved();

    const id = await manager.run(async (transaction) => transaction.id);

    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.transactionId).toBe(id);
      expect(typeof event.timestamp).toBe("number");
      expect(event.duration).toBeGreaterThanOrEqual(0);
    }
  });

  it("survives a throwing observer", async () => {
    const manager = createTransactionManager({
      adapter: createInMemoryAdapter(),
      context: createTransactionContext(),
      onEvent: () => {
        throw new Error("observer exploded");
      },
    });

    await expect(manager.run(async () => "ok")).resolves.toBe("ok");
  });

  it("emits nothing when no observer is supplied", async () => {
    const manager = createTransactionManager({
      adapter: createInMemoryAdapter(),
      context: createTransactionContext(),
    });

    await expect(manager.run(async () => "ok")).resolves.toBe("ok");
  });
});

describe("TXN-W2: capability mismatches raise their own errors", () => {
  it("raises TransactionIsolationError for an unsupported level", async () => {
    const base = createInMemoryAdapter();
    const limited: TransactionAdapter = {
      ...base,
      capabilities: { ...base.capabilities, isolationLevels: ["read_committed"] },
    };
    const { manager } = makeObserved(limited);

    await expect(
      manager.begin({ isolation: "serializable" }),
    ).rejects.toBeInstanceOf(TransactionIsolationError);
  });

  it("raises TransactionCapabilityError for read-only transactions", async () => {
    const base = createInMemoryAdapter();
    const limited: TransactionAdapter = {
      ...base,
      capabilities: { ...base.capabilities, readOnlyTransactions: false },
    };
    const { manager } = makeObserved(limited);

    await expect(manager.begin({ readOnly: true })).rejects.toBeInstanceOf(
      TransactionCapabilityError,
    );
  });

  it("raises TransactionCapabilityError when savepoints are missing", async () => {
    const base = createInMemoryAdapter();
    const limited: TransactionAdapter = {
      ...base,
      capabilities: { ...base.capabilities, savepoints: false },
    };
    const { manager } = makeObserved(limited);

    await expect(
      manager.run(async () => {
        await manager.run(async () => "inner", { propagation: "nested" });
      }),
    ).rejects.toBeInstanceOf(TransactionCapabilityError);
  });
});

describe("TXN-W3: savepoint failures raise SavepointError", () => {
  it("wraps a failing createSavepoint", async () => {
    const base = createInMemoryAdapter();
    const broken: TransactionAdapter = {
      ...base,
      async createSavepoint(): Promise<void> {
        throw new Error("driver refused SAVEPOINT");
      },
    };
    const { manager } = makeObserved(broken);

    await expect(
      manager.run(async () => {
        await manager.run(async () => "inner", { propagation: "nested" });
      }),
    ).rejects.toBeInstanceOf(SavepointError);
  });

  it("wraps a failing rollbackToSavepoint as the rollback cause", async () => {
    const base = createInMemoryAdapter();
    const broken: TransactionAdapter = {
      ...base,
      async rollbackToSavepoint(): Promise<void> {
        throw new Error("driver refused ROLLBACK TO");
      },
    };
    const manager = createTransactionManager({
      adapter: broken,
      context: createTransactionContext(),
    });

    let caught: unknown;
    await manager
      .run(async () => {
        const child = await manager.begin({ propagation: "nested" });
        await manager.rollback(child, "give up").catch((error: unknown) => {
          caught = error;
        });
      })
      .catch(() => undefined);

    // rollbackTransaction reports the failure as TransactionRollbackError,
    // but the adapter-level cause is now a SavepointError naming the
    // savepoint rather than a bare driver error.
    expect(caught).toBeInstanceOf(TransactionRollbackError);
    expect((caught as TransactionRollbackError).cause).toBeInstanceOf(
      SavepointError,
    );
  });
});

describe("TXN-W4: the two terminal-state predicates agree", () => {
  it("derives terminality from the state machine", () => {
    expect(isTerminalState("committed")).toBe(true);
    expect(isTerminalState("rolled_back")).toBe(true);
    expect(isTerminalState("failed")).toBe(true);
    expect(isTerminalState("active")).toBe(false);
    expect(isTerminalState("pending")).toBe(false);
    expect(isTerminalState("committing")).toBe(false);
    expect(isTerminalState("rolling_back")).toBe(false);
  });
});

describe("TXN-W5: the in-memory adapter still round-trips", () => {
  it("issues and retires handles", async () => {
    const adapter = createInMemoryAdapter();
    const handle: TransactionHandle = await adapter.begin();
    await adapter.createSavepoint?.(handle, "sp_1");
    await adapter.rollbackToSavepoint?.(handle, "sp_1");
    await adapter.releaseSavepoint?.(handle, "sp_1");
    await expect(adapter.commit(handle)).resolves.toBeUndefined();
  });
});
