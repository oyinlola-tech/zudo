import { describe, expect, it } from "vitest";

import type { DefineOperationOptions } from "../src/api/operation/operation.type.js";

import {
  defineOperation,
  resolveOperationTimeout,
} from "../src/api/operation/operation.type.js";

import {
  DEFAULT_OPERATION_TIMEOUT,
  MAX_OPERATION_NAME_LENGTH,
  MAX_OPERATION_TIMEOUT,
} from "../src/api/constants.js";

describe("defineOperation", () => {
  it("creates an operation with the given options", () => {
    const operation = defineOperation({
      name: "users.create",
      handler: async () => ({ id: "1" }),
    });

    expect(operation.name).toBe("users.create");
    expect(operation.handler).toBeDefined();
  });

  it("freezes the operation", () => {
    const operation = defineOperation({
      name: "users.create",
      handler: async () => ({ id: "1" }),
    });

    expect(() => {
      (operation as unknown as Record<string, unknown>).name = "hacked";
    }).toThrow();
  });

  it("preserves the input and output schemas it will validate against", () => {
    const inputSchema = { parse: () => ({}) };
    const outputSchema = { parse: () => ({}) };

    const operation = defineOperation({
      name: "users.create",
      input: inputSchema,
      output: outputSchema,
      handler: async () => ({ id: "1" }),
    });

    expect(operation.input).toBe(inputSchema);
    expect(operation.output).toBe(outputSchema);
  });

  it("preserves metadata and freezes it deeply", () => {
    const operation = defineOperation({
      name: "users.create",
      metadata: {
        tags: ["Users"],
        timeout: 5_000,
      },
      handler: async () => ({ id: "1" }),
    });

    expect(operation.metadata?.tags).toEqual(["Users"]);
    expect(operation.metadata?.timeout).toBe(5_000);

    expect(() => {
      (operation.metadata as unknown as Record<string, unknown>).timeout = 1;
    }).toThrow();
    expect(() => {
      (operation.metadata?.tags as string[]).push("Injected");
    }).toThrow();
    expect(operation.metadata?.tags).toEqual(["Users"]);
  });

  it("does not copy arbitrary extra properties onto the operation", () => {
    const options = {
      name: "users.create",
      handler: async () => ({ id: "1" }),
      policies: ["admin"],
    } as unknown as DefineOperationOptions;

    const operation = defineOperation(options);

    expect(
      (operation as unknown as Record<string, unknown>).policies,
    ).toBeUndefined();
  });

  describe("timeout", () => {
    it("defaults to DEFAULT_OPERATION_TIMEOUT", () => {
      const operation = defineOperation({
        name: "users.create",
        handler: async () => ({ id: "1" }),
      });

      expect(operation.timeout).toBe(DEFAULT_OPERATION_TIMEOUT);
    });

    it("falls back to metadata.timeout", () => {
      const operation = defineOperation({
        name: "users.create",
        metadata: { timeout: 1_000 },
        handler: async () => ({ id: "1" }),
      });

      expect(operation.timeout).toBe(1_000);
    });

    it("rejects a timeout that would disable the deadline", () => {
      for (const timeout of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
        expect(() =>
          defineOperation({
            name: "slow.op",
            timeout,
            handler: async () => "done",
          }),
        ).toThrow(RangeError);
      }
    });

    it("rejects a non-numeric timeout", () => {
      expect(() =>
        defineOperation({
          name: "slow.op",
          timeout: "30000" as unknown as number,
          handler: async () => "done",
        }),
      ).toThrow(TypeError);
    });

    it("rejects an absurdly large timeout", () => {
      expect(() =>
        defineOperation({
          name: "slow.op",
          timeout: MAX_OPERATION_TIMEOUT + 1,
          handler: async () => "done",
        }),
      ).toThrow(RangeError);
    });

    it("rejects an unusable metadata.timeout too", () => {
      expect(() =>
        defineOperation({
          name: "slow.op",
          metadata: { timeout: 0 },
          handler: async () => "done",
        }),
      ).toThrow(RangeError);
    });
  });

  describe("shape validation", () => {
    it("rejects an empty, over-long, or malformed name", () => {
      const handler = async () => "ok";

      expect(() => defineOperation({ name: "", handler })).toThrow(RangeError);
      expect(() =>
        defineOperation({
          name: "a".repeat(MAX_OPERATION_NAME_LENGTH + 1),
          handler,
        }),
      ).toThrow(RangeError);
      expect(() => defineOperation({ name: "has space", handler })).toThrow(
        RangeError,
      );
      expect(() =>
        defineOperation({ name: 42 as unknown as string, handler }),
      ).toThrow(TypeError);
    });

    it("rejects a missing or non-function handler", () => {
      expect(() =>
        defineOperation({
          name: "users.create",
          handler: undefined as unknown as () => Promise<string>,
        }),
      ).toThrow(TypeError);

      expect(() =>
        defineOperation({
          name: "users.create",
          handler: "nope" as unknown as () => Promise<string>,
        }),
      ).toThrow(TypeError);
    });
  });
});

describe("resolveOperationTimeout", () => {
  it("prefers timeout over metadata.timeout over the default", () => {
    expect(resolveOperationTimeout({ timeout: 10, metadata: { timeout: 20 } })).toBe(
      10,
    );
    expect(resolveOperationTimeout({ metadata: { timeout: 20 } })).toBe(20);
    expect(resolveOperationTimeout({})).toBe(DEFAULT_OPERATION_TIMEOUT);
  });

  it("substitutes the default for unusable hand-rolled values", () => {
    for (const timeout of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2.5]) {
      expect(resolveOperationTimeout({ timeout })).toBe(
        DEFAULT_OPERATION_TIMEOUT,
      );
    }
  });
});
