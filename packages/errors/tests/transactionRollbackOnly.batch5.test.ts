import { describe, expect, it } from "vitest";

import {
  ErrorCode,
  TransactionRollbackError,
  TransactionRollbackOnlyError,
} from "../src/index.js";

describe("TransactionRollbackOnlyError", () => {
  it("names a refused commit and stays a TransactionRollbackError", () => {
    const error = new TransactionRollbackOnlyError("txn_1", new Error("invalid order"));

    expect(error).toBeInstanceOf(TransactionRollbackError);
    expect(error.name).toBe("TransactionRollbackOnlyError");
    expect(error.message).toBe(
      'Transaction "txn_1" commit refused: transaction marked rollback-only',
    );
    expect(error.code).toBe(ErrorCode.DATABASE_TRANSACTION);
    expect(error.getMetadata("originalError")).toBe("invalid order");
  });

  it("defaults the reason", () => {
    expect(new TransactionRollbackOnlyError("t").getMetadata("originalError")).toBe(
      "marked rollback-only",
    );
  });

  it("keeps TransactionRollbackError's message and accepts an override", () => {
    expect(new TransactionRollbackError("t").message).toBe('Transaction "t" rollback failed');
    expect(new TransactionRollbackError("t", { message: "custom" }).message).toBe("custom");
  });
});
