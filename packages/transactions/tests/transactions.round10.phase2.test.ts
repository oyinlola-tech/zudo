/**
 * Round 10 phase 2 regressions for @zudojs/transactions (INF-16).
 */

import { describe, expect, it } from "vitest";
import * as shared from "@zudojs/errors";

import * as local from "../src/index.js";

const NAMES = [
  "TransactionError",
  "TransactionStateError",
  "TransactionTimeoutError",
  "TransactionCommitError",
  "TransactionRollbackError",
  "TransactionAdapterError",
  "TransactionPropagationError",
  "TransactionIsolationError",
  "SavepointError",
  "TransactionRequiredError",
  "TransactionUnexpectedError",
  "TransactionCapabilityError",
] as const;

describe("INF-16", () => {
  it("every transaction error class is the @zudojs/errors class", () => {
    for (const name of NAMES) expect(local[name]).toBe(shared[name]);
  });

  it("keeps names, codes and the subclass chain", () => {
    const timeout = new local.TransactionTimeoutError("tx-1", 50);
    expect(timeout).toBeInstanceOf(shared.TransactionError);
    expect(timeout).toBeInstanceOf(shared.BaseError);
    expect(timeout.name).toBe("TransactionTimeoutError");
    expect(timeout.code).toBe(shared.ErrorCode.TIMEOUT);
    const state = new shared.TransactionStateError("committed", "commit");
    expect(state).toBeInstanceOf(local.TransactionStateError);
    expect(state.code).toBe(shared.ErrorCode.LIFECYCLE_STATE);
    const capability = new local.TransactionCapabilityError("savepoints");
    expect(capability.code).toBe(shared.ErrorCode.NOT_IMPLEMENTED);
  });

  it("errors thrown by the manager match the shared classes", async () => {
    const manager = local.createTransactionManager({
      adapter: local.createInMemoryAdapter(),
    });
    await expect(
      manager.run(async () => undefined, { propagation: "mandatory" }),
    ).rejects.toBeInstanceOf(shared.TransactionPropagationError);
  });
});
