/**
 * toOpenAPIRouteDescriptors feeds @zudojs/openapi's
 * createOpenAPIDocumentFromRoutes with exactly what the fetch binding serves.
 */
import { describe, expect, it } from "vitest";

import { createOpenAPIDocumentFromRoutes } from "@zudojs/openapi";

import { schema } from "@zudojs/schema";

import {
  APIOperationRegistry,
  defineOperation,
  toOpenAPIRouteDescriptors,
} from "../src/index.js";

const User = schema.object({ id: schema.string(), name: schema.string() });

function registry(): APIOperationRegistry {
  const ops = new APIOperationRegistry();
  ops.register(
    defineOperation({
      name: "users.get",
      input: schema.object({ id: schema.string(), expand: schema.string().optional() }),
      output: User,
      metadata: { description: "Fetch a user", tags: ["Users"], http: { method: "GET", path: "/users/:id" } },
      handler: async (input: { id: string }) => ({ id: input.id, name: "Ann" }),
    }),
  );
  ops.register(
    defineOperation({
      name: "users.create",
      input: schema.object({ name: schema.string() }),
      output: User,
      metadata: { http: { method: "POST", path: "/users" } },
      handler: async (input: { name: string }) => ({ id: "u1", name: input.name }),
    }),
  );
  ops.register(
    defineOperation({
      name: "users.rename",
      input: schema.object({ id: schema.string(), name: schema.string() }),
      metadata: { deprecated: true, http: { method: "PATCH", path: "/users/:id" } },
      handler: async () => null,
    }),
  );
  ops.register(defineOperation({ name: "health.check", handler: async () => "ok" }));
  ops.freeze();
  return ops;
}

type Operation = {
  operationId?: string;
  parameters?: Array<{ name: string; in: string }>;
  requestBody?: { content: Record<string, { schema: { properties?: Record<string, unknown> } }> };
  responses: Record<string, { content?: Record<string, { schema: { properties?: Record<string, unknown> } }> }>;
  tags?: string[];
  deprecated?: boolean;
};

describe("toOpenAPIRouteDescriptors", () => {
  it("documents one operation per api operation with the served paths and methods", () => {
    const document = createOpenAPIDocumentFromRoutes(
      toOpenAPIRouteDescriptors(registry(), { basePath: "/api" }),
      { info: { title: "Users", version: "1.0.0" }, validate: true },
    );
    const paths = document.paths as Record<string, Record<string, Operation>>;

    const found = Object.entries(paths).flatMap(([path, item]) =>
      Object.entries(item).map(([method, op]) => `${method.toUpperCase()} ${path} ${op.operationId}`),
    );
    expect(found.sort()).toEqual([
      "GET /api/users/{id} users.get",
      "PATCH /api/users/{id} users.rename",
      "POST /api/health.check health.check",
      "POST /api/users users.create",
    ]);
  });

  it("splits path fields out of query and body input", () => {
    const document = createOpenAPIDocumentFromRoutes(toOpenAPIRouteDescriptors(registry()), {
      info: { title: "Users", version: "1.0.0" },
    });
    const paths = document.paths as Record<string, Record<string, Operation>>;

    const get = paths["/users/{id}"]!["get"]!;
    expect(get.parameters?.map((p) => `${p.in}:${p.name}`).sort()).toEqual(["path:id", "query:expand"]);
    expect(get.tags).toEqual(["Users"]);

    const rename = paths["/users/{id}"]!["patch"]!;
    expect(rename.deprecated).toBe(true);
    expect(Object.keys(rename.requestBody!.content["application/json"]!.schema.properties!)).toEqual(["name"]);
  });

  it("documents the success envelope and the error responses", () => {
    const [get] = toOpenAPIRouteDescriptors(registry());
    expect(Object.keys(get!.responses!).sort()).toEqual(["200", "404", "409", "422", "500", "504"]);

    const document = createOpenAPIDocumentFromRoutes([get!], { info: { title: "U", version: "1" } });
    const op = (document.paths as Record<string, Record<string, Operation>>)["/users/{id}"]!["get"]!;
    const ok = op.responses["200"]!.content!["application/json"]!.schema.properties!;
    const failed = op.responses["422"]!.content!["application/json"]!.schema.properties!;
    expect(Object.keys(ok).sort()).toEqual(["data", "ok"]);
    expect(Object.keys(failed).sort()).toEqual(["error", "ok"]);
  });
});
