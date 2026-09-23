/**
 * @zudojs/transactions — batch 5 regression tests: handle accessor,
 * rollback-only message, timeout signal and single `timed_out` event,
 * rollback of a committed transaction.
 */

import { describe, expect, it } from "vitest";
import {
  TRANSACTION_EVENTS,
  TransactionRollbackError,
  TransactionRollbackOnlyError,
  TransactionStateError,
  TransactionTimeoutError,
  createInMemoryAdapter,
  createTransactionContext,
  createTransactionManager,
  currentTransactionHandle,
  getTransactionHandle,
  type TransactionAdapter,
  type TransactionEvent,
} from "../src/index.js";

interface FakeClient {
  readonly name: string;
}

function clientAdapter(): TransactionAdapter {
  const base = createInMemoryAdapter();
  let next = 0;
  return {
    ...base,
    capabilities: base.capabilities,
    begin: async (): Promise<FakeClient> => ({ name: `tx-client-${++next}` }),
    commit: async () => undefined,
    rollback: async () => undefined,
    createSavepoint: async () => undefined,
    rollbackToSavepoint: async () => undefined,
    releaseSavepoint: async () => undefined,
  };
}

describe("adapter handle accessor", () => {
  it("exposes the handle adapter.begin() returned, for roots, participants and savepoints", async () => {
    const context = createTransactionContext();
    const tm = createTransactionManager({ adapter: clientAdapter(), context });

    expect(tm.getCurrentHandle()).toBeUndefined();
    expect(currentTransactionHandle(context)).toBeUndefined();

    await tm.run(async (root) => {
      const handle = getTransactionHandle<FakeClient>(root);
      expect(handle).toEqual({ name: "tx-client-1" });
      expect(tm.getCurrentHandle<FakeClient>()).toBe(handle);
      expect(currentTransactionHandle<FakeClient>(context)).toBe(handle);

      await tm.run(async (participant) => {
        expect(getTransactionHandle(participant)).toBe(handle);
      });
      await tm.run(
        async (savepoint) => {
          expect(getTransactionHandle(savepoint)).toBe(handle);
          expect(tm.getCurrentHandle()).toBe(handle);
        },
        { propagation: "nested" },
      );
      await tm.run(
        async () => {
          expect(tm.getCurrentHandle()).toBeUndefined();
        },
        { propagation: "not_supported" },
      );
    });
  });
});

describe("rollback-only commit refusal", () => {
  it("says the commit was refused, not that a rollback failed", async () => {
    const tm = createTransactionManager({ adapter: createInMemoryAdapter() });
    const transaction = await tm.begin();
    transaction.markRollbackOnly("validation failed");

    const error = await tm.commit(transaction).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TransactionRollbackOnlyError);
    expect(error).toBeInstanceOf(TransactionRollbackError);
    expect((error as Error).message).toMatch(/commit refused: transaction marked rollback-only/);
    expect((error as Error).message).not.toMatch(/rollback failed/);
    expect((error as TransactionRollbackOnlyError).getMetadata("originalError")).toBe(
      "validation failed",
    );
    expect(transaction.state).toBe("rolled_back");
  });
});

describe("timeouts", () => {
  it("aborts the signal, interrupts run() and emits timed_out once", async () => {
    const events: TransactionEvent[] = [];
    const tm = createTransactionManager({
      adapter: createInMemoryAdapter(),
      onEvent: (event) => events.push(event),
    });
    let observed: AbortSignal | undefined;

    const started = Date.now();
    const error = await tm
      .run(
        async (transaction) => {
          observed = transaction.signal;
          await new Promise((resolve) => setTimeout(resolve, 2_000));
        },
        { timeout: 20 },
      )
      .catch((caught: unknown) => caught);

    expect(Date.now() - started).toBeLessThan(1_000);
    expect(error).toBeInstanceOf(TransactionTimeoutError);
    expect(observed?.aborted).toBe(true);
    expect(observed?.reason).toBeInstanceOf(TransactionTimeoutError);
    expect(events.filter((e) => e.type === TRANSACTION_EVENTS.TIMED_OUT)).toHaveLength(1);
    expect(events.map((e) => e.type)).toContain(TRANSACTION_EVENTS.ROLLED_BACK);
  });

  it("emits timed_out once when a timed-out transaction is committed by hand", async () => {
    const events: TransactionEvent[] = [];
    const tm = createTransactionManager({
      adapter: createInMemoryAdapter(),
      onEvent: (event) => events.push(event),
    });
    const transaction = await tm.begin({ timeout: 10 });
    await new Promise((resolve) => setTimeout(resolve, 30));

    await expect(tm.commit(transaction)).rejects.toBeInstanceOf(TransactionTimeoutError);
    expect(events.filter((e) => e.type === TRANSACTION_EVENTS.TIMED_OUT)).toHaveLength(1);
  });

  it("never aborts the signal of a transaction without a timeout", async () => {
    const tm = createTransactionManager({ adapter: createInMemoryAdapter() });
    const signal = await tm.run(async (transaction) => transaction.signal);
    expect(signal.aborted).toBe(false);
  });
});

describe("rollback of a committed transaction", () => {
  it("throws a TransactionStateError instead of silently doing nothing", async () => {
    const tm = createTransactionManager({ adapter: createInMemoryAdapter() });
    const transaction = await tm.begin();
    await tm.commit(transaction);

    await expect(tm.rollback(transaction)).rejects.toBeInstanceOf(TransactionStateError);
    expect(transaction.state).toBe("committed");
  });

  it("still treats rolling back twice as a no-op", async () => {
    const tm = createTransactionManager({ adapter: createInMemoryAdapter() });
    const transaction = await tm.begin();
    await tm.rollback(transaction);
    await expect(tm.rollback(transaction)).resolves.toBeUndefined();
  });

  it("run() rethrows an after-commit hook failure without trying to roll back", async () => {
    const failure = new Error("hook failed");
    const tm = createTransactionManager({
      adapter: createInMemoryAdapter(),
      hooks: {
        afterCommit: async () => {
          throw failure;
        },
      },
    });

    await expect(tm.run(async () => "done")).rejects.toBe(failure);
  });
});
