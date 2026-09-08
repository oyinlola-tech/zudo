import { describe, it, expect } from "vitest";
import {
  createTransactionManager,
  createInMemoryAdapter,
  createTransactionContext,
  createTransactionRegistry,
  mergeHooks,
  isTerminalState,
  isModifiable,
  summarizeTransaction,
  TRANSACTION_EVENTS,
} from "../src/index.js";
import type { TransactionHooks } from "../src/index.js";

function createManager() {
  const adapter = createInMemoryAdapter();
  const context = createTransactionContext();
  return createTransactionManager({ adapter, context });
}

describe("TransactionManager", () => {
  describe("basic lifecycle", () => {
    it("should begin a transaction", async () => {
      const manager = createManager();

      const txn = await manager.begin();

      expect(txn.id).toMatch(/^txn_/);
      expect(txn.state).toBe("active");
      expect(txn.startedAt).toBeGreaterThan(0);
    });

    it("should commit a transaction", async () => {
      const manager = createManager();

      const txn = await manager.begin();
      await manager.commit(txn);

      expect(txn.state).toBe("committed");
    });

    it("should rollback a transaction", async () => {
      const manager = createManager();

      const txn = await manager.begin();
      await manager.rollback(txn);

      expect(txn.state).toBe("rolled_back");
    });

    it("should run a callback with auto-commit", async () => {
      const manager = createManager();

      const result = await manager.run(async (txn) => {
        expect(txn.state).toBe("active");
        return 42;
      });

      expect(result).toBe(42);
    });

    it("should auto-rollback on callback error", async () => {
      const manager = createManager();

      await expect(
        manager.run(async () => {
          throw new Error("test error");
        }),
      ).rejects.toThrow("test error");
    });
  });

  describe("transaction options", () => {
    it("should accept isolation level", async () => {
      const manager = createManager();

      const txn = await manager.begin({ isolation: "serializable" });

      expect(txn.options.isolation).toBe("serializable");
    });

    it("should accept read-only flag", async () => {
      const manager = createManager();

      const txn = await manager.begin({ readOnly: true });

      expect(txn.options.readOnly).toBe(true);
    });

    it("should accept name", async () => {
      const manager = createManager();

      const txn = await manager.begin({ name: "my-txn" });

      expect(txn.options.name).toBe("my-txn");
    });

    it("should accept metadata", async () => {
      const manager = createManager();

      const txn = await manager.begin({ metadata: { userId: "123" } });

      expect(txn.metadata.get("userId")).toBe("123");
    });
  });

  describe("getCurrent", () => {
    it("should return undefined outside a transaction", () => {
      const manager = createManager();

      expect(manager.getCurrent()).toBeUndefined();
    });

    it("should return the current transaction inside run", async () => {
      const manager = createManager();

      await manager.run(async (txn) => {
        expect(manager.getCurrent()).toBe(txn);
      });
    });
  });

  describe("hooks", () => {
    it("should call lifecycle hooks", async () => {
      const calls: string[] = [];

      const hooks: TransactionHooks = {
        beforeBegin: async () => {
          calls.push("beforeBegin");
        },
        afterBegin: async () => {
          calls.push("afterBegin");
        },
        beforeCommit: async () => {
          calls.push("beforeCommit");
        },
        afterCommit: async () => {
          calls.push("afterCommit");
        },
      };

      const adapter = createInMemoryAdapter();
      const context = createTransactionContext();
      const manager = createTransactionManager({ adapter, context, hooks });
      const txn = await manager.begin();
      await manager.commit(txn);

      expect(calls).toEqual([
        "beforeBegin",
        "afterBegin",
        "beforeCommit",
        "afterCommit",
      ]);
    });

    it("should call rollback hooks", async () => {
      const calls: string[] = [];

      const hooks: TransactionHooks = {
        beforeRollback: async () => {
          calls.push("beforeRollback");
        },
        afterRollback: async () => {
          calls.push("afterRollback");
        },
      };

      const adapter = createInMemoryAdapter();
      const context = createTransactionContext();
      const manager = createTransactionManager({ adapter, context, hooks });
      const txn = await manager.begin();
      await manager.rollback(txn);

      expect(calls).toEqual(["beforeRollback", "afterRollback"]);
    });
  });

  describe("afterCommit / afterRollback callbacks", () => {
    it("should run afterCommit callbacks", async () => {
      const manager = createManager();
      let callbackRan = false;

      const txn = await manager.begin();
      txn.afterCommit(async () => {
        callbackRan = true;
      });
      await manager.commit(txn);

      expect(callbackRan).toBe(true);
    });

    it("should run afterRollback callbacks", async () => {
      const manager = createManager();
      let callbackRan = false;

      const txn = await manager.begin();
      txn.afterRollback(async () => {
        callbackRan = true;
      });
      await manager.rollback(txn);

      expect(callbackRan).toBe(true);
    });
  });

  describe("rollback-only", () => {
    it("should mark transaction as rollback-only", async () => {
      const manager = createManager();

      const txn = await manager.begin();
      txn.markRollbackOnly("reason");

      expect(txn.isRollbackOnly()).toBe(true);
    });

    it("should roll back and refuse the commit when marked rollback-only", async () => {
      const manager = createManager();

      const txn = await manager.begin();
      txn.markRollbackOnly("reason");

      await expect(manager.commit(txn)).rejects.toThrow(
        /rollback|marked rollback-only/i,
      );
      expect(txn.state).toBe("rolled_back");
    });
  });

  describe("transaction state", () => {
    it("should start in active state after begin", async () => {
      const manager = createManager();

      const txn = await manager.begin();

      expect(txn.state).toBe("active");
    });

    it("should transition to committed after commit", async () => {
      const manager = createManager();

      const txn = await manager.begin();
      await manager.commit(txn);

      expect(txn.state).toBe("committed");
    });

    it("should transition to rolled_back after rollback", async () => {
      const manager = createManager();

      const txn = await manager.begin();
      await manager.rollback(txn);

      expect(txn.state).toBe("rolled_back");
    });
  });
});

describe("createInMemoryAdapter", () => {
  it("should create an adapter with correct capabilities", () => {
    const adapter = createInMemoryAdapter();

    expect(adapter.capabilities.savepoints).toBe(true);
    expect(adapter.capabilities.nestedTransactions).toBe(true);
    expect(adapter.capabilities.isolationLevels).toContain("serializable");
    expect(adapter.capabilities.readOnlyTransactions).toBe(true);
    expect(adapter.capabilities.timeouts).toBe(true);
  });

  it("should handle begin/commit/rollback cycle", async () => {
    const adapter = createInMemoryAdapter();

    const handle = await adapter.begin();
    expect(handle).toBeDefined();

    await adapter.commit(handle);
  });
});

describe("TransactionRegistry", () => {
  it("should register and retrieve transactions", async () => {
    const registry = createTransactionRegistry();
    const manager = createManager();

    const txn = await manager.begin();
    registry.register(txn);

    expect(registry.get(txn.id)).toBe(txn);
    expect(registry.getActive()).toContain(txn);
  });

  it("should unregister transactions", async () => {
    const registry = createTransactionRegistry();
    const manager = createManager();

    const txn = await manager.begin();
    registry.register(txn);
    registry.unregister(txn.id);

    expect(registry.get(txn.id)).toBeUndefined();
  });
});

describe("mergeHooks", () => {
  it("should merge multiple hook sets", async () => {
    const calls: string[] = [];

    const hooks1: TransactionHooks = {
      beforeBegin: async () => {
        calls.push("hooks1.beforeBegin");
      },
    };

    const hooks2: TransactionHooks = {
      beforeBegin: async () => {
        calls.push("hooks2.beforeBegin");
      },
    };

    const merged = mergeHooks(hooks1, hooks2);
    await merged.beforeBegin?.({} as never);

    expect(calls).toEqual(["hooks1.beforeBegin", "hooks2.beforeBegin"]);
  });
});

describe("utility functions", () => {
  it("isTerminalState should return true for terminal states", () => {
    expect(isTerminalState("committed")).toBe(true);
    expect(isTerminalState("rolled_back")).toBe(true);
    expect(isTerminalState("failed")).toBe(true);
  });

  it("isTerminalState should return false for non-terminal states", () => {
    expect(isTerminalState("pending")).toBe(false);
    expect(isTerminalState("active")).toBe(false);
    expect(isTerminalState("committing")).toBe(false);
    expect(isTerminalState("rolling_back")).toBe(false);
  });

  it("isModifiable should return true for active transactions", async () => {
    const manager = createManager();
    const txn = await manager.begin();
    expect(isModifiable(txn)).toBe(true);
    await manager.rollback(txn);
  });

  it("isModifiable should return false for terminal transactions", async () => {
    const manager = createManager();
    const txn = await manager.begin();
    await manager.commit(txn);
    expect(isModifiable(txn)).toBe(false);
  });

  it("summarizeTransaction should return a string", async () => {
    const manager = createManager();
    const txn = await manager.begin();
    const summary = summarizeTransaction(txn);
    expect(typeof summary).toBe("string");
    expect(summary).toContain(txn.id);
    await manager.rollback(txn);
  });
});

describe("TRANSACTION_EVENTS", () => {
  it("should have all event types", () => {
    expect(TRANSACTION_EVENTS.STARTED).toBe("transaction.started");
    expect(TRANSACTION_EVENTS.COMMITTING).toBe("transaction.committing");
    expect(TRANSACTION_EVENTS.COMMITTED).toBe("transaction.committed");
    expect(TRANSACTION_EVENTS.ROLLING_BACK).toBe("transaction.rolling_back");
    expect(TRANSACTION_EVENTS.ROLLED_BACK).toBe("transaction.rolled_back");
    expect(TRANSACTION_EVENTS.FAILED).toBe("transaction.failed");
    expect(TRANSACTION_EVENTS.TIMED_OUT).toBe("transaction.timed_out");
  });
});
