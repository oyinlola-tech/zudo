import { describe, it, expect } from "vitest";
import {
  createTransaction,
  createTransactionManager,
  createTransactionContext,
  createInMemoryAdapter,
  TransactionStateError,
  TransactionRollbackError,
} from "../src/index.js";
import type { Transaction } from "../src/index.js";

/**
 * Obtain an active transaction the supported way.
 *
 * The manager owns state transitions; the transaction's own transition hook is
 * not reachable from outside the package, which is deliberate.
 */
async function activeTransaction(): Promise<Transaction> {
  const manager = createTransactionManager({
    adapter: createInMemoryAdapter(),
    context: createTransactionContext(),
  });
  return manager.begin();
}

describe("createTransaction", () => {
  it("creates a transaction in the pending state with a unique id", () => {
    const txn = createTransaction();
    expect(txn.id).toMatch(/^txn_[a-f0-9]+$/);
    expect(txn.state).toBe("pending");
    expect(txn.parentId).toBeUndefined();
  });

  it("captures parent id when provided", () => {
    const parent = createTransaction();
    const child = createTransaction({}, parent.id);
    expect(child.parentId).toBe(parent.id);
  });

  it("transitions pending -> active when the manager starts it", async () => {
    const txn = await activeTransaction();
    expect(txn.state).toBe("active");
  });

  it("keeps its internals unreachable from the public API", () => {
    const txn = createTransaction();
    expect(
      (txn as unknown as { _transition?: unknown })._transition,
    ).toBeUndefined();
    expect(Object.keys(txn)).not.toContain("_transition");
  });

  it("commits successfully and fires afterCommit callbacks", async () => {
    const txn = await activeTransaction();
    const calls: string[] = [];
    txn.afterCommit(async () => {
      calls.push("commit-1");
    });
    txn.afterCommit(async () => {
      calls.push("commit-2");
    });
    await txn.commit();
    expect(txn.state).toBe("committed");
    expect(calls).toEqual(["commit-1", "commit-2"]);
  });

  it("rejects commit from non-active state", async () => {
    const txn = createTransaction();
    // state is pending, not active
    await expect(txn.commit()).rejects.toBeInstanceOf(TransactionStateError);
  });

  it("refuses to commit when marked rollback-only", async () => {
    const txn = await activeTransaction();
    txn.markRollbackOnly("explicit reason");
    expect(txn.isRollbackOnly()).toBe(true);

    await expect(txn.commit()).rejects.toBeInstanceOf(TransactionRollbackError);
    expect(txn.state).toBe("active");

    await txn.rollback("explicit reason");
    expect(txn.state).toBe("rolled_back");
  });

  it("rolls back and fires afterRollback callbacks", async () => {
    const txn = await activeTransaction();
    const calls: string[] = [];
    txn.afterRollback(async () => {
      calls.push("rb-1");
    });
    await txn.rollback("test");
    expect(txn.state).toBe("rolled_back");
    expect(calls).toEqual(["rb-1"]);
  });

  it("rollback is idempotent after success", async () => {
    const txn = await activeTransaction();
    await txn.rollback();
    expect(txn.state).toBe("rolled_back");
    // second rollback is a no-op
    await txn.rollback();
    expect(txn.state).toBe("rolled_back");
  });

  it("commits even when an afterCommit callback throws", async () => {
    const txn = await activeTransaction();
    txn.afterCommit(async () => {
      throw new Error("hook failed");
    });
    await txn.commit();
    expect(txn.state).toBe("committed");
  });

  it("exposes metadata via Map", () => {
    const txn = createTransaction({ metadata: { userId: "u_1" } });
    expect(txn.metadata.get("userId")).toBe("u_1");
  });

  it("freezes options to prevent mutation", () => {
    const txn = createTransaction({ metadata: { x: 1 } });
    expect(Object.isFrozen(txn.options)).toBe(true);
  });
});
