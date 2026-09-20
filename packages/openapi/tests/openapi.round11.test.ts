/**
 * Audit round 11 regressions (API-02, API-05).
 *
 * The API-05 cases run against the real `@zudojs/schema` build output, not a
 * hand-written stand-in: the converter duck-types that package's runtime
 * fields, so the only useful check is against the fields it actually sets.
 */
import { describe, expect, it } from "vitest";

import { schema as s } from "../../schema/dist/index.js";
import {
  OpenAPIManager,
  OpenAPIRouteError,
  OpenAPIRouteScannerImpl,
} from "../src/index.js";

const INFO = { title: "T", version: "1" };

describe("API-02 — the scanner dedupes on the OpenAPI template, not the source path", () => {
  it("rejects a second route whose path converts to the same template", () => {
    const scanner = new OpenAPIRouteScannerImpl();
    scanner.addRoute({
      method: "get",
      path: "/users/:id",
      metadata: { openapi: { operationId: "a" } },
    });

    expect(() =>
      scanner.addRoute({
        method: "get",
        path: "/users/{id}",
        metadata: { openapi: { operationId: "b" } },
      }),
    ).toThrow(OpenAPIRouteError);

    expect(scanner.size).toBe(1);
    expect(scanner.scan()[0]?.operation.operationId).toBe("a");
  });

  it("no operation silently disappears from the generated document", () => {
    const idParameter = {
      parameters: [{ name: "id", in: "path" as const, required: true }],
    };
    const manager = new OpenAPIManager({ info: INFO });
    manager.addRoute({
      method: "get",
      path: "/users/:id",
      metadata: { openapi: { operationId: "a", ...idParameter } },
    });

    expect(() =>
      manager.addRoute({
        method: "get",
        path: "/users/{id}",
        metadata: { openapi: { operationId: "b", ...idParameter } },
      }),
    ).toThrow(OpenAPIRouteError);

    const document = manager.generate(true);
    const paths = Object.keys(document.paths ?? {});
    expect(paths).toEqual(["/users/{id}"]);
    expect(
      (document.paths?.["/users/{id}"] as { get?: { operationId?: string } })
        ?.get?.operationId,
    ).toBe("a");
  });

  it("hasRoute and removeRoute accept either spelling", () => {
    const scanner = new OpenAPIRouteScannerImpl();
    scanner.addRoute({ method: "get", path: "/users/:id" });

    expect(scanner.hasRoute("get", "/users/{id}")).toBe(true);
    expect(scanner.hasRoute("get", "/users/:id")).toBe(true);
    expect(scanner.removeRoute("get", "/users/{id}")).toBe(true);
    expect(scanner.size).toBe(0);
  });

  it("different templates still coexist", () => {
    const scanner = new OpenAPIRouteScannerImpl();
    scanner.addRoute({ method: "get", path: "/users/:id" });
    scanner.addRoute({ method: "get", path: "/users/:id/posts" });
    scanner.addRoute({ method: "post", path: "/users/:id" });
    expect(scanner.size).toBe(3);
  });

  it("an unconvertible path still reports from scan(), as before", () => {
    const scanner = new OpenAPIRouteScannerImpl();
    scanner.addRoute({ method: "get", path: "/files/*" });
    expect(() => scanner.scan()).toThrow(OpenAPIRouteError);
  });
});

describe("API-05 — an object that strips documents the same however it was written", () => {
  const convert = (schema: unknown): Record<string, unknown> => {
    const manager = new OpenAPIManager({ info: INFO });
    manager.addSchema("S", schema);
    return manager.generate().components?.schemas?.["S"] as Record<
      string,
      unknown
    >;
  };

  it("the implicit default and an explicit .strip() agree", () => {
    const implicit = convert(s.object({ x: s.string() }));
    const explicit = convert(s.object({ x: s.string() }).strip());
    expect(explicit).toEqual(implicit);
  });

  it("strip does not document as `additionalProperties: false`", () => {
    // `additionalProperties: false` means "reject the payload"; strip
    // accepts it and discards the extra key. Documenting the reject would
    // make a generated client refuse what the service happily accepts.
    const stripped = s.object({ x: s.string() }).strip();
    expect(stripped.safeParse({ x: "1", y: 2 }).success).toBe(true);
    expect(convert(stripped)).not.toHaveProperty("additionalProperties");
    expect(convert(s.object({ x: s.string() }))).not.toHaveProperty(
      "additionalProperties",
    );
  });

  it("strict still documents as `additionalProperties: false`", () => {
    const strict = s.object({ x: s.string() }).strict();
    expect(strict.safeParse({ x: "1", y: 2 }).success).toBe(false);
    expect(convert(strict)["additionalProperties"]).toBe(false);
  });

  it("passthrough leaves additional properties unconstrained", () => {
    expect(
      convert(s.object({ x: s.string() }).passthrough()),
    ).not.toHaveProperty("additionalProperties");
  });
});
