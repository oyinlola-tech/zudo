/**
 * @zudojs/transactions — Round 12 regression tests.
 *
 * One describe block per academy finding.
 */

import { describe, it, expect, expectTypeOf } from "vitest";

import {
  createInMemoryAdapter,
  createTransactionContext,
  createTransactionManager,
  currentTransaction,
  currentTransactionHandle,
  type Transaction,
  type TransactionManager,
} from "../src/index.js";

const later = <T>(work: () => Promise<T>, ms = 5): Promise<T> =>
  new Promise((resolve, reject) => {
    setTimeout(() => work().then(resolve, reject), ms);
  });

/* ─── #90: no exported TransactionManager type ───────────────────────────── */

describe("#90 TransactionManager is a named exported type", () => {
  it("types the value createTransactionManager returns", async () => {
    const manager: TransactionManager = createTransactionManager({
      adapter: createInMemoryAdapter(),
    });
    expectTypeOf(createTransactionManager).returns.toEqualTypeOf<TransactionManager>();
    expectTypeOf<TransactionManager["run"]>().toBeFunction();
    expectTypeOf<TransactionManager["getCurrentHandle"]>().toBeFunction();
    await expect(manager.run(async (tx) => tx.kind)).resolves.toBe("root");
  });
});

/* ─── #127: work started from afterCommit joined the finished transaction ── */

describe("#127 post-commit work does not see the finished transaction", () => {
  it("a manager.run() started from an afterCommit timer opens a new root", async () => {
    const manager = createTransactionManager({ adapter: createInMemoryAdapter() });
    let observed: { kind: string; sameId: boolean } | undefined;
    let inside: { current: Transaction | undefined; handle: unknown } | undefined;

    const outerId = await manager.run(async (tx) => {
      tx.afterCommit(async () => {
        inside = { current: manager.getCurrent(), handle: manager.getCurrentHandle() };
        await later(() =>
          manager.run(async (t2) => {
            observed = { kind: t2.kind, sameId: t2.id === tx.id };
          }),
        );
      });
      return tx.id;
    });

    expect(inside).toEqual({ current: undefined, handle: undefined });
    expect(observed).toEqual({ kind: "root", sameId: false });
    expect(outerId).toMatch(/^txn_/);
  });

  it("the same holds for afterRollback callbacks and manager hooks", async () => {
    const seen: string[] = [];
    const manager = createTransactionManager({
      adapter: createInMemoryAdapter(),
      hooks: {
        afterCommit: async () => {
          seen.push(`hook:commit:${manager.getCurrent()?.kind ?? "none"}`);
        },
        afterRollback: async () => {
          seen.push(`hook:rollback:${manager.getCurrent()?.kind ?? "none"}`);
        },
      },
    });

    await manager.run(async () => undefined);
    await expect(
      manager.run(async (tx) => {
        tx.afterRollback(async () => {
          seen.push(`callback:rollback:${manager.getCurrent()?.kind ?? "none"}`);
        });
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");

    expect(seen).toEqual(["hook:commit:none", "callback:rollback:none", "hook:rollback:none"]);
  });

  it("a timer armed inside the body that fires after commit starts a new root", async () => {
    const manager = createTransactionManager({ adapter: createInMemoryAdapter() });
    let pending: Promise<string> | undefined;

    await manager.run(async () => {
      pending = later(() => manager.run(async (t2) => t2.kind), 10);
    });

    await expect(pending).resolves.toBe("root");
  });

  it("a finished transaction left in a custom context is not the current one", async () => {
    const context = createTransactionContext();
    const manager = createTransactionManager({
      adapter: createInMemoryAdapter(),
      context,
    });
    const finished = await manager.begin();
    await manager.commit(finished);

    await context.run(finished, async () => {
      expect(context.get()).toBe(finished);
      expect(currentTransaction(context)).toBeUndefined();
      expect(currentTransactionHandle(context)).toBeUndefined();
      expect(manager.getCurrent()).toBeUndefined();
      await expect(manager.run(async (tx) => tx.kind)).resolves.toBe("root");
      await expect(manager.begin({ propagation: "mandatory" })).rejects.toThrow(/mandatory/);
      const never = await manager.begin({ propagation: "never" });
      expect(never.kind).toBe("none");
    });
  });

  it("post-commit work of a requires_new transaction rejoins the enclosing one", async () => {
    const manager = createTransactionManager({ adapter: createInMemoryAdapter() });
    let joined: { kind: string; sameAsOuter: boolean } | undefined;

    await manager.run(async (outer) => {
      await manager.run(
        async (inner) => {
          inner.afterCommit(async () => {
            await manager.run(async (t3) => {
              joined = { kind: t3.kind, sameAsOuter: t3.id === outer.id };
            });
          });
        },
        { propagation: "requires_new" },
      );
      expect(outer.state).toBe("active");
    });

    expect(joined).toEqual({ kind: "participant", sameAsOuter: true });
  });
});
