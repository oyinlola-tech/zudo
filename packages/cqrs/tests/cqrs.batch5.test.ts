/**
 * @zudojs/cqrs — batch 5: unwrapping a failed result throws.
 */

import { describe, it, expect } from "vitest";
import * as errors from "@zudojs/errors";

import {
  CommandFailedError,
  CqrsError,
  QueryFailedError,
  createCommand,
  createCommandResult,
  createFailedCommandResult,
  createFailedQueryResult,
  createQuery,
  createQueryResult,
  unwrapCommandResult,
  unwrapQueryResult,
} from "../src/index.js";

describe("unwrapCommandResult", () => {
  const command = createCommand("order.place", { id: "1" });

  it("returns the value of a successful result", () => {
    expect(unwrapCommandResult(createCommandResult({ id: "1" }, { command }))).toEqual({
      id: "1",
    });
  });

  it("throws CommandFailedError for a failed result, carrying the payload", () => {
    const payload = { reason: "out of stock" };
    const failed = createFailedCommandResult(payload, { command });

    let caught: unknown;
    try {
      unwrapCommandResult(failed);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CommandFailedError);
    expect(caught).toBeInstanceOf(CqrsError);
    expect(caught).toBeInstanceOf(errors.CommandFailedError);
    const error = caught as CommandFailedError;
    expect(error.commandType).toBe("order.place");
    expect(error.failure).toBe(payload);
    expect(error.cause).toBe(payload);
    expect(error.code).toBe(errors.ErrorCode.COMMAND_FAILED);
    expect(error.expose).toBe(false);
  });
});

describe("unwrapQueryResult (the counterpart) is consistent", () => {
  const query = createQuery("order.get", { id: "1" });

  it("returns the value of a successful result", () => {
    expect(unwrapQueryResult(createQueryResult(42, { query }))).toBe(42);
  });

  it("throws QueryFailedError for a failed result", () => {
    const cause = new Error("db down");
    const failed = createFailedQueryResult(cause, { query });
    expect(() => unwrapQueryResult(failed)).toThrow(QueryFailedError);
    try {
      unwrapQueryResult(failed);
    } catch (error) {
      expect((error as QueryFailedError).queryType).toBe("order.get");
      expect((error as QueryFailedError).failure).toBe(cause);
      expect((error as QueryFailedError).code).toBe(errors.ErrorCode.QUERY_FAILED);
    }
  });
});
