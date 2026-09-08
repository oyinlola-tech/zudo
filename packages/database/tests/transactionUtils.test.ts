import { describe, it, expect } from "vitest";
import {
  DatabaseClient,
  TransactionManager,
  createTransactionContext,
  createTransactionId,
  getTransactionContextFromError,
  isTransactionActive,
  isTransactionCommitted,
  isTransactionFailed,
  noopDatabaseLogger,
  type TransactionContext,
} from "../src/index.js";
import { createStubPrisma } from "./helpers/stubPrisma.js";

/**
 * Drives a managed transaction with a stub Prisma client and returns the
 * contexts the real API hands out, so the predicates below are tested
 * against reachable states rather than hand-built objects.
 */
async function runManaged(fail: boolean): Promise<{
  readonly active: TransactionContext;
  readonly final: TransactionContext;
}> {
  const client = new DatabaseClient({
    prisma: createStubPrisma(),
    logger: noopDatabaseLogger,
  });
  const manager = new TransactionManager(client);
  let active: TransactionContext | undefined;
  try {
    const outcome = await manager.run(async (_tx, context) => {
      active = context;
      if (fail) throw new Error("boom");
      return 1;
    });
    return { active: active!, final: outcome.context };
  } catch (error) {
    return { active: active!, final: getTransactionContextFromError(error)! };
  }
}

describe("Transaction utilities", () => {
  describe("createTransactionId", () => {
    it("should create a unique transaction ID", () => {
      const id1 = createTransactionId();
      const id2 = createTransactionId();
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });
  });

  describe("createTransactionContext", () => {
    it("should create a transaction context", () => {
      const context = createTransactionContext();
      expect(context).toBeDefined();
      expect(context.transactionId).toBeDefined();
      expect(context.status).toBe("idle");
      expect(context.startedAt).toBeInstanceOf(Date);
    });

    it("should accept options", () => {
      const context = createTransactionContext({
        isolationLevel: "Serializable",
        metadata: { userId: "123" },
      });
      expect(context.isolationLevel).toBe("Serializable");
      expect(context.metadata?.userId).toBe("123");
    });
  });

  describe("isTransactionActive", () => {
    it("should return true for the context handed to the callback", async () => {
      const { active } = await runManaged(false);
      expect(active.status).toBe("active");
      expect(isTransactionActive(active)).toBe(true);
    });

    it("should return false for idle status", () => {
      const context = createTransactionContext();
      expect(isTransactionActive(context)).toBe(false);
    });
  });

  describe("isTransactionCommitted", () => {
    it("should return true for the context returned by run()", async () => {
      const { active, final } = await runManaged(false);
      expect(final.status).toBe("committed");
      expect(final.transactionId).toBe(active.transactionId);
      expect(isTransactionCommitted(final)).toBe(true);
      expect(isTransactionCommitted(active)).toBe(false);
    });

    it("should return false for active transactions", () => {
      const context = createTransactionContext();
      expect(isTransactionCommitted(context)).toBe(false);
    });
  });

  describe("isTransactionFailed", () => {
    it("should return true for the context attached to a failed transaction", async () => {
      const { active, final } = await runManaged(true);
      expect(final.status).toBe("failed");
      expect(final.transactionId).toBe(active.transactionId);
      expect(isTransactionFailed(final)).toBe(true);
      expect(isTransactionFailed(active)).toBe(false);
    });

    it("should return false for active transactions", () => {
      const context = createTransactionContext();
      expect(isTransactionFailed(context)).toBe(false);
    });
  });
});
