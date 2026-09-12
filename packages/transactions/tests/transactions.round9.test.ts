/**
 * @zudojs/transactions — Round 9 regression tests.
 */

import { describe, it, expect } from "vitest";
import {
  createInMemoryAdapter,
  createTransactionContext,
  createTransactionManager,
  createTransactionRegistry,
  TransactionRollbackError,
  TransactionTimeoutError,
  TRANSACTION_EVENTS,
} from "../src/index.js";
import type {
  TransactionAdapter,
  TransactionEvent,
} from "../src/index.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** An adapter that records every savepoint call with the handle it received. */
function recordingAdapter(): {
  adapter: TransactionAdapter;
  calls: string[];
} {
  const calls: string[] = [];
  const connection = { name: "conn" };
  const adapter: TransactionAdapter = {
    capabilities: {
      savepoints: true,
      nestedTransactions: true,
      isolationLevels: ["read_committed"],
      readOnlyTransactions: true,
      timeouts: true,
    },
    async begin() {
      calls.push("BEGIN");
      return connection;
    },
    async commit(handle) {
      calls.push(`COMMIT(${handle === connection ? "conn" : "?"})`);
    },
    async rollback(handle) {
      calls.push(`ROLLBACK(${handle === connection ? "conn" : "?"})`);
    },
    async createSavepoint(handle, name) {
      calls.push(`SAVEPOINT(${handle === connection ? "conn" : "?"},${name})`);
    },
    async rollbackToSavepoint(handle, name) {
      calls.push(
        `ROLLBACK_TO(${handle === connection ? "conn" : "?"},${name})`,
      );
    },
    async releaseSavepoint(handle, name) {
      calls.push(`RELEASE(${handle === connection ? "conn" : "?"},${name})`);
    },
  };
  return { adapter, calls };
}

describe("TRANSACTIONS-R9-01: `nested` propagation works inside a participant scope", () => {
  it("opens a savepoint on the joined transaction's connection", async () => {
    const { adapter, calls } = recordingAdapter();
    const manager = createTransactionManager({
      adapter,
      context: createTransactionContext(),
    });

    const kind = await manager.run(async () =>
      manager.run(async () =>
        manager.run(async (t) => t.kind, { propagation: "nested" }),
      ),
    );

    expect(kind).toBe("savepoint");
    expect(calls[0]).toBe("BEGIN");
    expect(calls[1]).toMatch(/^SAVEPOINT\(conn,sp_txn_/);
    expect(calls[2]).toMatch(/^RELEASE\(conn,sp_txn_/);
    expect(calls[3]).toBe("COMMIT(conn)");
  });
});

describe("TRANSACTIONS-R9-02: a savepoint nested in a savepoint targets the connection", () => {
  it("creates, rolls back to and releases the inner savepoint on the connection", async () => {
    const { adapter, calls } = recordingAdapter();
    const manager = createTransactionManager({
      adapter,
      context: createTransactionContext(),
    });

    await manager.run(async () =>
      manager.run(
        async () => {
          await manager
            .run(
              async () => {
                throw new Error("inner fails");
              },
              { propagation: "nested" },
            )
            .catch(() => undefined);
        },
        { propagation: "nested" },
      ),
    );

    // Every savepoint operation names the connection, never a savepoint handle.
    for (const call of calls) {
      expect(call).not.toContain("(?");
    }
    expect(calls.filter((c) => c.startsWith("SAVEPOINT("))).toHaveLength(2);
    expect(calls.some((c) => c.startsWith("ROLLBACK_TO(conn,"))).toBe(true);
    expect(calls.at(-1)).toBe("COMMIT(conn)");
  });

  it("round-trips through the in-memory adapter", async () => {
    const manager = createTransactionManager({
      adapter: createInMemoryAdapter(),
      context: createTransactionContext(),
    });

    const kind = await manager.run(async () =>
      manager.run(
        async () =>
          manager.run(async (t) => t.kind, { propagation: "nested" }),
        { propagation: "nested" },
      ),
    );

    expect(kind).toBe("savepoint");
  });
});

describe("TRANSACTIONS-R9-03: begin() honours `timeout` and completion releases bookkeeping", () => {
  it("times out a hand-managed transaction", async () => {
    const events: TransactionEvent["type"][] = [];
    const manager = createTransactionManager({
      adapter: createInMemoryAdapter(),
      context: createTransactionContext(),
      onEvent: (e) => events.push(e.type),
    });

    const transaction = await manager.begin({ timeout: 10 });
    await sleep(30);

    expect(transaction.timedOut).toBe(true);
    expect(transaction.isRollbackOnly()).toBe(true);
    expect(events).toContain(TRANSACTION_EVENTS.TIMED_OUT);
    await expect(manager.commit(transaction)).rejects.toBeInstanceOf(
      TransactionTimeoutError,
    );
    expect(transaction.state).toBe("rolled_back");
  });

  it("removes a hand-managed transaction from the registry on commit and rollback", async () => {
    const registry = createTransactionRegistry();
    const manager = createTransactionManager({
      adapter: createInMemoryAdapter(),
      context: createTransactionContext(),
      registry,
    });

    const a = await manager.begin();
    const b = await manager.begin({ propagation: "requires_new" });
    expect(registry.getActive()).toHaveLength(2);

    await manager.commit(a);
    expect(registry.get(a.id)).toBeUndefined();

    await manager.rollback(b, "manual");
    expect(registry.getActive()).toHaveLength(0);
  });

  it("does not fire a timeout after the transaction has committed", async () => {
    const events: TransactionEvent["type"][] = [];
    const manager = createTransactionManager({
      adapter: createInMemoryAdapter(),
      context: createTransactionContext(),
      onEvent: (e) => events.push(e.type),
    });

    const transaction = await manager.begin({ timeout: 10 });
    await manager.commit(transaction);
    await sleep(30);

    expect(events).not.toContain(TRANSACTION_EVENTS.TIMED_OUT);
    expect(transaction.timedOut).toBe(false);
  });
});

describe("TRANSACTIONS-R9-04: after-commit callback failures are reported", () => {
  it("passes an AggregateError to hooks.onError while the commit stands", async () => {
    const seen: unknown[] = [];
    const manager = createTransactionManager({
      adapter: createInMemoryAdapter(),
      context: createTransactionContext(),
      hooks: {
        onError: async ({ error }) => {
          seen.push(error);
        },
      },
    });

    const result = await manager.run(async (t) => {
      t.afterCommit(async () => {
        throw new Error("webhook failed");
      });
      t.afterCommit(async () => {
        throw new Error("cache purge failed");
      });
      return "done";
    });

    expect(result).toBe("done");
    expect(seen).toHaveLength(1);
    const aggregate = seen[0] as AggregateError;
    expect(aggregate).toBeInstanceOf(AggregateError);
    expect(aggregate.errors.map((e) => (e as Error).message)).toEqual([
      "webhook failed",
      "cache purge failed",
    ]);
  });
});

describe("TRANSACTIONS-R9-05: retry does not replay work that joined an enclosing transaction", () => {
  it("makes a single attempt for a participant and surfaces the failure", async () => {
    const manager = createTransactionManager({
      adapter: createInMemoryAdapter(),
      context: createTransactionContext(),
    });
    let attempts = 0;

    await expect(
      manager.run(async (outer) => {
        await expect(
          manager.run(
            async () => {
              attempts += 1;
              throw new Error("flaky");
            },
            { retry: { attempts: 5 } },
          ),
        ).rejects.toThrow("flaky");

        expect(outer.isRollbackOnly()).toBe(true);
      }),
    ).rejects.toBeInstanceOf(TransactionRollbackError);

    expect(attempts).toBe(1);
  });

  it("still retries an owned transaction", async () => {
    const manager = createTransactionManager({
      adapter: createInMemoryAdapter(),
      context: createTransactionContext(),
    });
    let attempts = 0;

    const result = await manager.run(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("flaky");
        return attempts;
      },
      { retry: { attempts: 5 } },
    );

    expect(result).toBe(3);
  });
});
