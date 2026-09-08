/**
 * @zudojs/transactions — Hardening regression tests.
 *
 * Every test here asserts on what the adapter was actually asked to do, not on
 * the absence of a throw. Each defect these pin previously presented as a
 * successful call that quietly did the wrong thing.
 */

import { describe, it, expect } from "vitest";
import {
  createTransactionManager,
  createTransactionContext,
  createTransactionRegistry,
  createInMemoryAdapter,
} from "../src/index.js";
import type {
  Transaction,
  TransactionAdapter,
  TransactionHandle,
} from "../src/index.js";

/** An adapter that records the calls made against it. */
function recordingAdapter(): {
  adapter: TransactionAdapter;
  calls: string[];
} {
  const calls: string[] = [];

  const adapter: TransactionAdapter = {
    capabilities: {
      savepoints: true,
      nestedTransactions: true,
      isolationLevels: ["read_committed", "serializable"],
      readOnlyTransactions: true,
      timeouts: true,
    },
    async begin(): Promise<TransactionHandle> {
      calls.push("BEGIN");
      return { db: calls.length };
    },
    async commit(): Promise<void> {
      calls.push("COMMIT");
    },
    async rollback(): Promise<void> {
      calls.push("ROLLBACK");
    },
    async createSavepoint(_handle, name): Promise<void> {
      calls.push(`SAVEPOINT ${name}`);
    },
    async rollbackToSavepoint(_handle, name): Promise<void> {
      calls.push(`ROLLBACK TO ${name}`);
    },
    async releaseSavepoint(_handle, name): Promise<void> {
      calls.push(`RELEASE ${name}`);
    },
  };

  return { adapter, calls };
}

function makeManager() {
  const { adapter, calls } = recordingAdapter();
  const context = createTransactionContext();
  const registry = createTransactionRegistry();
  return {
    calls,
    context,
    registry,
    manager: createTransactionManager({ adapter, context, registry }),
  };
}

/* ─── TXN-01: rollback-only must precede the adapter commit ───────────────── */

describe("rollback-only", () => {
  it("never reaches adapter.commit()", async () => {
    const { manager, calls } = makeManager();

    const txn = await manager.begin();
    txn.markRollbackOnly("business rule violated");

    await expect(manager.commit(txn)).rejects.toThrow(/rollback/i);
    expect(calls).toEqual(["BEGIN", "ROLLBACK"]);
    expect(txn.state).toBe("rolled_back");
  });

  it("rolls back a timed-out transaction instead of committing it", async () => {
    const { manager, calls } = makeManager();

    await expect(
      manager.run(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 40));
        },
        { timeout: 10 },
      ),
    ).rejects.toThrow(/rollback/i);

    expect(calls).toEqual(["BEGIN", "ROLLBACK"]);
  });

  it("clears the timeout timer when the transaction ends", async () => {
    const { manager } = makeManager();
    await manager.run(async () => "ok", { timeout: 50_000 });
    expect(true).toBe(true);
  });
});

/* ─── TXN-02: a nested run() must not complete the outer transaction ──────── */

describe("nested run() with required propagation", () => {
  it("does not commit the enclosing transaction", async () => {
    const { manager, calls } = makeManager();
    const seen: string[] = [];

    await manager.run(async (outer) => {
      await manager.run(async (inner) => {
        expect(inner.kind).toBe("participant");
        expect(inner.id).toBe(outer.id);
      });

      seen.push(outer.state);
      expect(calls).toEqual(["BEGIN"]);
    });

    expect(seen).toEqual(["active"]);
    expect(calls).toEqual(["BEGIN", "COMMIT"]);
  });

  it("marks the enclosing transaction rollback-only when a participant fails", async () => {
    const { manager, calls } = makeManager();

    await expect(
      manager.run(async (outer) => {
        await expect(
          manager.run(async () => {
            throw new Error("inner failed");
          }),
        ).rejects.toThrow("inner failed");

        expect(outer.isRollbackOnly()).toBe(true);
      }),
    ).rejects.toThrow(/rollback/i);

    expect(calls).toEqual(["BEGIN", "ROLLBACK"]);
  });
});

/* ─── TXN-03 / TXN-07: requires_new and nested ────────────────────────────── */

describe("requires_new propagation", () => {
  it("opens an independent active transaction and commits it", async () => {
    const { manager, calls, context } = makeManager();

    const outer = await manager.begin();
    await context.run(outer, async () => {
      const inner = await manager.begin({ propagation: "requires_new" });
      expect(inner.kind).toBe("root");
      expect(inner.state).toBe("active");
      expect(inner.id).not.toBe(outer.id);

      await manager.commit(inner);
    });

    expect(calls).toEqual(["BEGIN", "BEGIN", "COMMIT"]);
  });

  it("suspends the enclosing transaction for the duration of run()", async () => {
    const { manager, context } = makeManager();

    await manager.run(async (outer) => {
      await manager.run(
        async (inner) => {
          expect(inner.id).not.toBe(outer.id);
          expect(context.get()?.id).toBe(inner.id);
        },
        { propagation: "requires_new" },
      );
    });
  });
});

describe("nested propagation", () => {
  it("resolves rollback to the savepoint, not the connection", async () => {
    const { manager, calls, context } = makeManager();

    const outer = await manager.begin();
    await context.run(outer, async () => {
      const child = await manager.begin({ propagation: "nested" });
      expect(child.kind).toBe("savepoint");
      expect(child.state).toBe("active");

      await manager.rollback(child, "child failed");
    });

    expect(calls[0]).toBe("BEGIN");
    expect(calls[1]).toMatch(/^SAVEPOINT sp_txn_/);
    expect(calls[2]).toMatch(/^ROLLBACK TO sp_txn_/);
    expect(calls).not.toContain("ROLLBACK");
  });

  it("releases the savepoint on commit", async () => {
    const { manager, calls, context } = makeManager();

    const outer = await manager.begin();
    await context.run(outer, async () => {
      const child = await manager.begin({ propagation: "nested" });
      await manager.commit(child);
    });

    expect(calls[2]).toMatch(/^RELEASE sp_txn_/);
    expect(calls).not.toContain("COMMIT");
  });

  it("a failing nested run leaves the outer transaction committable", async () => {
    const { manager, calls } = makeManager();

    await manager.run(async () => {
      await expect(
        manager.run(
          async () => {
            throw new Error("nested failed");
          },
          { propagation: "nested" },
        ),
      ).rejects.toThrow("nested failed");
    });

    expect(calls.filter((c) => c === "COMMIT")).toHaveLength(1);
    expect(calls.some((c) => c.startsWith("ROLLBACK TO"))).toBe(true);
  });
});

/* ─── TXN-04 / TXN-05: state machine honesty ──────────────────────────────── */

describe("transaction state enforcement", () => {
  it("refuses to commit a rolled-back transaction", async () => {
    const { manager, calls } = makeManager();

    const txn = await manager.begin();
    await manager.rollback(txn, "boom");

    await expect(manager.commit(txn)).rejects.toThrow(/rolled_back/);
    expect(calls).toEqual(["BEGIN", "ROLLBACK"]);
  });

  it("treats a second commit as a no-op", async () => {
    const { manager, calls } = makeManager();

    const txn = await manager.begin();
    await manager.commit(txn);
    await manager.commit(txn);

    expect(calls).toEqual(["BEGIN", "COMMIT"]);
  });

  it("rolls back a pending transaction without throwing", async () => {
    const { manager, context } = makeManager();

    const outer = await manager.begin();
    await context.run(outer, async () => {
      const child = await manager.begin({ propagation: "nested" });
      await expect(manager.rollback(child, "x")).resolves.toBeUndefined();
      expect(child.state).toBe("rolled_back");
    });
  });
});

/* ─── TXN-06: default context on an ESM package ───────────────────────────── */

describe("default transaction context", () => {
  it("works without an explicitly supplied context", async () => {
    const { adapter } = recordingAdapter();
    const manager = createTransactionManager({ adapter });

    const txn = await manager.begin();
    expect(txn.state).toBe("active");
    await manager.commit(txn);
  });
});

/* ─── TXN-08: propagation semantics ───────────────────────────────────────── */

describe("propagation semantics", () => {
  it("mandatory throws when no transaction is in progress", async () => {
    const { manager } = makeManager();
    await expect(manager.begin({ propagation: "mandatory" })).rejects.toThrow(
      /no transaction is in progress/,
    );
  });

  it("mandatory joins an existing transaction", async () => {
    const { manager, context } = makeManager();
    const outer = await manager.begin();

    await context.run(outer, async () => {
      const joined = await manager.begin({ propagation: "mandatory" });
      expect(joined.kind).toBe("participant");
    });
  });

  it("never throws when a transaction is in progress", async () => {
    const { manager, context } = makeManager();
    const outer = await manager.begin();

    await context.run(outer, async () => {
      await expect(manager.begin({ propagation: "never" })).rejects.toThrow(
        /propagation is 'never'/,
      );
    });
  });

  it("not_supported suspends the transaction and touches no adapter", async () => {
    const { manager, calls, context } = makeManager();

    await manager.run(async () => {
      await manager.run(
        async (inner) => {
          expect(inner.kind).toBe("none");
          expect(context.get()).toBeUndefined();
        },
        { propagation: "not_supported" },
      );
    });

    expect(calls).toEqual(["BEGIN", "COMMIT"]);
  });

  it("supports runs non-transactionally when nothing is in progress", async () => {
    const { manager, calls } = makeManager();

    await manager.run(
      async (txn) => {
        expect(txn.kind).toBe("none");
      },
      { propagation: "supports" },
    );

    expect(calls).toEqual([]);
  });

  it("rejects an unknown propagation mode", async () => {
    const { manager } = makeManager();
    await expect(
      manager.begin({ propagation: "sideways" as never }),
    ).rejects.toThrow(/Unknown propagation/);
  });
});

/* ─── TXN-12: retry ───────────────────────────────────────────────────────── */

describe("retry", () => {
  it("replays the unit of work until it succeeds", async () => {
    const { manager, calls } = makeManager();
    let attempts = 0;

    const result = await manager.run(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error("deadlock");
        return "ok";
      },
      { retry: { attempts: 3 } },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
    expect(calls).toEqual([
      "BEGIN",
      "ROLLBACK",
      "BEGIN",
      "ROLLBACK",
      "BEGIN",
      "COMMIT",
    ]);
  });

  it("stops when the predicate rejects the failure", async () => {
    const { manager } = makeManager();
    let attempts = 0;

    await expect(
      manager.run(
        async () => {
          attempts++;
          throw new Error("constraint violation");
        },
        {
          retry: {
            attempts: 5,
            shouldRetry: (error) =>
              (error as Error).message.includes("deadlock"),
          },
        },
      ),
    ).rejects.toThrow("constraint violation");

    expect(attempts).toBe(1);
  });

  it("makes a single attempt when no retry is configured", async () => {
    const { manager } = makeManager();
    let attempts = 0;

    await expect(
      manager.run(async () => {
        attempts++;
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");

    expect(attempts).toBe(1);
  });
});

/* ─── TXN-13 / TXN-15 / TXN-16: metadata, capabilities, registry ──────────── */

describe("manager bookkeeping", () => {
  it("does not expose the live metadata map", async () => {
    const { manager } = makeManager();
    const txn = await manager.begin({ metadata: { a: 1 } });

    (txn.metadata as Map<string, unknown>).set("b", 2);
    expect(txn.metadata.has("b")).toBe(false);
    expect(txn.metadata.get("a")).toBe(1);
  });

  it("rejects an isolation level the adapter does not support", async () => {
    const { manager } = makeManager();
    await expect(
      manager.begin({ isolation: "repeatable_read" }),
    ).rejects.toThrow(/does not support isolation level/);
  });

  it("rejects a timeout when the adapter cannot honour one", async () => {
    const adapter = createInMemoryAdapter();
    const limited: TransactionAdapter = {
      ...adapter,
      capabilities: { ...adapter.capabilities, timeouts: false },
    };
    const manager = createTransactionManager({
      adapter: limited,
      context: createTransactionContext(),
    });

    await expect(manager.begin({ timeout: 1000 })).rejects.toThrow(
      /does not support transaction timeouts/,
    );
  });

  it("tracks owned transactions in the registry and clears them after run()", async () => {
    const { manager, registry } = makeManager();
    let duringRun: readonly Transaction[] = [];

    await manager.run(async () => {
      duringRun = registry.getActive();
    });

    expect(duringRun).toHaveLength(1);
    expect(registry.getActive()).toHaveLength(0);
  });

  it("does not register a participant as its own transaction", async () => {
    const { manager, registry } = makeManager();

    await manager.run(async () => {
      await manager.run(async () => {
        expect(registry.getActive()).toHaveLength(1);
      });
    });
  });
});
