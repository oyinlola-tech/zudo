/**
 * Executable version of the README "Usage" block.
 *
 * The README example is the package's front door; this test runs the same
 * code against the real exports so it cannot drift out of date. Keep the
 * two in sync — if this file changes shape, update `README.md` with it.
 */
import { describe, expect, it } from "vitest";

import {
  APIExecutor,
  APIOperationRegistry,
  APIOperationNotFoundError,
  APIValidationError,
  createAPIContext,
  createContextKey,
  defineOperation,
  normalizeRequestId,
  type APIInterceptor,
} from "../src/index.js";

interface User {
  readonly id: string;
  readonly name: string;
}

// Stand-ins for the README's `GetUserSchema` / `UserSchema` / `db`.
const GetUserSchema = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value: unknown) => {
      const input = value as { id?: unknown };
      return typeof input?.id === "string"
        ? { value: { id: input.id } }
        : { issues: [{ message: "id must be a string", path: ["id"] }] };
    },
  },
};

const UserSchema = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value: unknown) => {
      const user = value as Partial<User>;
      return typeof user?.id === "string" && typeof user?.name === "string"
        ? { value: { id: user.id, name: user.name } }
        : { issues: [{ message: "invalid user", path: ["user"] }] };
    },
  },
};

const db = {
  findUser: async (id: string, _signal?: AbortSignal): Promise<User> => ({
    id,
    name: "Alice",
  }),
};

describe("README usage example", () => {
  const getUser = defineOperation<{ id: string }, User>({
    name: "users.get",
    input: GetUserSchema,
    output: UserSchema,
    timeout: 5_000,
    metadata: { tags: ["Users"] },
    handler: async (input, context) => db.findUser(input.id, context.signal),
  });

  const buildRegistry = () => {
    const registry = new APIOperationRegistry();
    registry.register(getUser);
    registry.freeze();
    return registry;
  };

  it("runs end to end", async () => {
    const registry = buildRegistry();
    const executor = new APIExecutor();
    const context = createAPIContext(normalizeRequestId(undefined), {
      locale: "en",
    });

    const result = await executor.execute(
      registry.require("users.get"),
      { id: "u_1" },
      context,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ id: "u_1", name: "Alice" });
    }
  });

  it("maps a failure the way the README's responder does", async () => {
    const executor = new APIExecutor();
    const context = createAPIContext("req-1", { locale: "en" });

    const result = await executor.execute(
      getUser,
      { id: 42 as unknown as string },
      context,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.statusCode).toBe(422);
      expect(result.error.expose).toBe(true);
      expect((result.error as APIValidationError).issues).toEqual([
        "id: invalid",
      ]);
    }
  });

  it("throws APIOperationNotFoundError for an unknown name", () => {
    const registry = buildRegistry();

    expect(() => registry.require("users.missing")).toThrow(
      APIOperationNotFoundError,
    );
  });

  it("runs the README's interceptor example", async () => {
    const seen: Array<{ name: string; ok: boolean }> = [];

    const timing: APIInterceptor = {
      async intercept(context, next) {
        context.input = { id: "sanitized" } as typeof context.input;
        const result = await next();
        expect(context.result).toBe(result);
        seen.push({ name: context.operation.name, ok: result.ok });
        return result;
      },
    };

    const executor = new APIExecutor({ interceptors: [timing] });
    const context = createAPIContext("req-2", { locale: "en" });

    const result = await executor.execute(getUser, { id: "u_1" }, context);

    expect(seen).toEqual([{ name: "users.get", ok: true }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe("sanitized");
    }
  });

  it("runs the README's context example", () => {
    const FeatureFlagsKey = createContextKey<readonly string[]>("featureFlags");
    const context = createAPIContext("req-3", {});

    context.set(FeatureFlagsKey, ["beta"]);

    expect(context.get(FeatureFlagsKey)).toEqual(["beta"]);
    expect(context.metadata.get("featureFlags")).toEqual(["beta"]);
  });
});
