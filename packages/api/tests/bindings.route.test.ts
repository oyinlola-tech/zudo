/**
 * describeApiRoutes: the structural route contract for @zudojs/http and
 * OpenAPI generation.
 */
import { describe, expect, it } from "vitest";

import {
  APIOperationRegistry,
  defineOperation,
  describeApiRoutes,
  resolveApiRoute,
  type APIHttpMethod,
} from "../src/index.js";

const InputSchema = { safeParse: (value: unknown) => ({ success: true, data: value }) };

describe("describeApiRoutes", () => {
  it("describes every operation with defaults and declared routes", () => {
    const registry = new APIOperationRegistry();
    registry.register(
      defineOperation({
        name: "users.get",
        input: InputSchema,
        metadata: {
          description: "Fetch a user",
          tags: ["Users"],
          http: { method: "GET", path: "/users/:id" },
        },
        handler: async () => null,
      }),
    );
    registry.register(defineOperation({ name: "users.create", handler: async () => null }));

    const routes = describeApiRoutes(registry, { basePath: "/api/" });

    expect(routes).toEqual([
      {
        operationId: "users.get",
        method: "GET",
        path: "/api/users/:id",
        pathParams: ["id"],
        inputSource: "query",
        input: InputSchema,
        description: "Fetch a user",
        tags: ["Users"],
        successStatus: 200,
      },
      {
        operationId: "users.create",
        method: "POST",
        path: "/api/users.create",
        pathParams: [],
        inputSource: "body",
        successStatus: 200,
      },
    ]);
    expect(Object.isFrozen(routes[0])).toBe(true);
  });

  it("rejects two operations bound to the same method and path shape", () => {
    const a = defineOperation({ name: "a", metadata: { http: { method: "GET", path: "/x/:id" } }, handler: async () => 1 });
    const b = defineOperation({ name: "b", metadata: { http: { method: "GET", path: "/x/:key" } }, handler: async () => 1 });
    expect(() => describeApiRoutes([a, b])).toThrow(/both bind GET/);
  });

  it("rejects a duplicated operation in a list", () => {
    const a = defineOperation({ name: "a", handler: async () => 1 });
    expect(() => describeApiRoutes([a, a])).toThrow(/more than once/);
  });

  it("validates metadata.http at definition time", () => {
    const define = (http: unknown) => () =>
      defineOperation({
        name: "x",
        metadata: { http: http as { method?: APIHttpMethod; path?: string } },
        handler: async () => 1,
      });
    expect(define({ method: "TRACE" })).toThrow(RangeError);
    expect(define({ path: "no-slash" })).toThrow(RangeError);
    expect(define({ path: "/a//b" })).toThrow(RangeError);
    expect(define({ path: "/a/:id/:id" })).toThrow(RangeError);
    expect(define({ path: "/a/:__proto__" })).toThrow(RangeError);
    expect(define({ path: "/a/:id" })).not.toThrow();
  });

  it("requires an explicit path when the name is not a usable path", () => {
    const op = defineOperation({ name: "a/:b", handler: async () => 1 });
    expect(() => resolveApiRoute(op)).toThrow(/declare metadata.http.path/);
  });
});
