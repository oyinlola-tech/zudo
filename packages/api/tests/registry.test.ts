import { describe, expect, it } from "vitest";

import { APIOperationRegistry } from "../src/api/registry/index.js";

import { defineOperation } from "../src/api/operation/operation.type.js";

import type { APIOperation } from "../src/api/operation/operation.type.js";

import {
  APIDuplicateOperationError,
  APIOperationNotFoundError,
  isAPIError,
} from "../src/api/errors/index.js";

const makeOperation = (name = "users.create") =>
  defineOperation({
    name,
    handler: async () => ({ id: "1" }),
  });

describe("APIOperationRegistry", () => {
  it("registers and retrieves operations", () => {
    const registry = new APIOperationRegistry();
    const operation = makeOperation();

    registry.register(operation);

    expect(registry.has("users.create")).toBe(true);
    expect(registry.get("users.create")).toBe(operation);
  });

  it("throws APIDuplicateOperationError on duplicate registration", () => {
    const registry = new APIOperationRegistry();
    const operation = makeOperation();

    registry.register(operation);

    let thrown: unknown;
    try {
      registry.register(operation);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(APIDuplicateOperationError);
    expect(isAPIError(thrown)).toBe(true);
    expect((thrown as APIDuplicateOperationError).statusCode).toBe(409);
    expect((thrown as APIDuplicateOperationError).message).toContain(
      "users.create",
    );
  });

  it("returns undefined for unknown operations", () => {
    const registry = new APIOperationRegistry();

    expect(registry.get("users.create")).toBeUndefined();
  });

  it("returns all registered operations", () => {
    const registry = new APIOperationRegistry();

    registry.register(makeOperation("users.create"));
    registry.register(makeOperation("users.get"));

    expect(registry.getAll()).toHaveLength(2);
  });

  it("finds operations by tag", () => {
    const registry = new APIOperationRegistry();
    const operation = defineOperation({
      name: "users.create",
      metadata: { tags: ["Users"] },
      handler: async () => ({ id: "1" }),
    });

    registry.register(operation);

    expect(registry.findByTag("Users")).toHaveLength(1);
    expect(registry.findByTag("Orders")).toHaveLength(0);
  });

  it("throws APIOperationNotFoundError from require()", () => {
    const registry = new APIOperationRegistry();

    let thrown: unknown;
    try {
      registry.require("users.create");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(APIOperationNotFoundError);
    expect(isAPIError(thrown)).toBe(true);
    expect((thrown as APIOperationNotFoundError).statusCode).toBe(404);
    expect((thrown as APIOperationNotFoundError).message).toContain(
      "users.create",
    );
  });

  it("unregisters operations", () => {
    const registry = new APIOperationRegistry();

    registry.register(makeOperation());
    expect(registry.has("users.create")).toBe(true);

    expect(registry.unregister("users.create")).toBe(true);
    expect(registry.has("users.create")).toBe(false);
  });

  it("prevents registration when frozen, with a non-exposed APIError", () => {
    const registry = new APIOperationRegistry();
    registry.freeze();

    expect(registry.isFrozen()).toBe(true);

    let thrown: unknown;
    try {
      registry.register(makeOperation());
    } catch (error) {
      thrown = error;
    }

    expect(isAPIError(thrown)).toBe(true);
    expect((thrown as Error).message).toContain("frozen registry");
    expect((thrown as { statusCode: number }).statusCode).toBe(500);
    expect((thrown as { expose: boolean }).expose).toBe(false);
  });

  it("prevents unregistration when frozen", () => {
    const registry = new APIOperationRegistry();
    registry.register(makeOperation());
    registry.freeze();

    let thrown: unknown;
    try {
      registry.unregister("users.create");
    } catch (error) {
      thrown = error;
    }

    expect(isAPIError(thrown)).toBe(true);
    expect((thrown as Error).message).toContain("frozen registry");
    expect(registry.has("users.create")).toBe(true);
  });

  it("rejects hand-rolled operations with an invalid shape", () => {
    const registry = new APIOperationRegistry();

    expect(() =>
      registry.register({
        name: "",
        handler: async () => "ok",
      } as APIOperation),
    ).toThrow(RangeError);

    expect(() =>
      registry.register({ name: "no.handler" } as unknown as APIOperation),
    ).toThrow(TypeError);
  });

  it("freezes registered operations deeply enough to protect metadata", () => {
    const registry = new APIOperationRegistry();
    // A hand-rolled operation, i.e. one that never went through
    // defineOperation's freezing.
    const operation: APIOperation = {
      name: "users.create",
      handler: async () => ({ id: "1" }),
      metadata: { tags: ["a"] },
    };

    registry.register(operation);

    const registered = registry.get("users.create")!;
    expect(() => {
      (registered.metadata?.tags as string[]).push("b");
    }).toThrow();
    expect(() => {
      (registered.metadata as unknown as Record<string, unknown>).timeout = 1;
    }).toThrow();
    expect(registered.metadata?.tags).toEqual(["a"]);
  });
});
