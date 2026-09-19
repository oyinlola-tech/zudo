/**
 * @zudojs/transactions — Round 10 regression tests.
 */

import { describe, it, expect } from "vitest";
import { createInMemoryAdapter, createTransactionManager } from "../src/index.js";

/* ─── INF-04: afterCommit on a savepoint ran before the outer commit ─────── */

describe("INF-04", () => {
  it("discards a savepoint's afterCommit when the outer transaction rolls back", async () => {
    const log: string[] = [];
    const tm = createTransactionManager({
      adapter: createInMemoryAdapter(),
      hooks: {
        afterCommit: async ({ transaction }) => {
          log.push(`hook:${transaction.kind}`);
        },
      },
    });

    await expect(
      tm.run(async () => {
        await tm.run(
          async (inner) => {
            inner.afterCommit(async () => {
              log.push("email sent");
            });
          },
          { propagation: "nested" },
        );
        throw new Error("outer fails after nested work");
      }),
    ).rejects.toThrow("outer fails");

    expect(log).toEqual([]);
  });

  it("runs a savepoint's afterCommit once the outermost transaction commits", async () => {
    const log: string[] = [];
    const tm = createTransactionManager({
      adapter: createInMemoryAdapter(),
      hooks: {
        afterCommit: async ({ transaction }) => {
          log.push(`hook:${transaction.kind}`);
        },
      },
    });

    await tm.run(async () => {
      await tm.run(
        async (inner) => {
          inner.afterCommit(async () => {
            log.push("inner");
          });
          await tm.run(
            async (deepest) => {
              deepest.afterCommit(async () => {
                log.push("deepest");
              });
            },
            { propagation: "nested" },
          );
          expect(log).toEqual([]);
        },
        { propagation: "nested" },
      );
      expect(log).toEqual([]);
    });

    expect(log).toEqual([
      "inner",
      "deepest",
      "hook:savepoint",
      "hook:savepoint",
      "hook:root",
    ]);
  });

  it("runs a released savepoint's afterRollback when the outer rolls back", async () => {
    const log: string[] = [];
    const tm = createTransactionManager({ adapter: createInMemoryAdapter() });

    await expect(
      tm.run(async () => {
        await tm.run(
          async (inner) => {
            inner.afterRollback(async () => {
              log.push("compensate");
            });
          },
          { propagation: "nested" },
        );
        expect(log).toEqual([]);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(log).toEqual(["compensate"]);
  });
});
