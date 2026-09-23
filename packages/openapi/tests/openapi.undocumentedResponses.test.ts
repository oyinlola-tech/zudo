/**
 * A route that documents no responses is not given an invented `200`: it
 * gets a spec-valid `default` "Undocumented response" and a route warning.
 */
import { describe, expect, it } from "vitest";

import {
  OpenAPIManager,
  UNDOCUMENTED_RESPONSE_DESCRIPTION,
  buildOperationResponses,
  convertRouteToOpenAPI,
  createOpenAPIDocumentFromRoutes,
  createOpenAPIManagerFromRoutes,
  createOpenAPIValidator,
} from "../src/index.js";

const INFO = { title: "Test API", version: "1.0.0" };

describe("operations without documented responses", () => {
  it("emits a default response instead of 200 and warns", () => {
    const warnings: string[] = [];

    const { operation } = convertRouteToOpenAPI("delete", "/users/:id", undefined, {
      onWarning: (message) => warnings.push(message),
    });

    expect(operation.responses).toEqual({
      default: { description: UNDOCUMENTED_RESPONSE_DESCRIPTION },
    });
    expect(operation.responses).not.toHaveProperty("200");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("DELETE /users/:id");
    expect(warnings[0]).toContain("no responses are documented");
  });

  it("treats responses: {} the same way", () => {
    const warnings: string[] = [];

    const responses = buildOperationResponses({ responses: {} }, "GET /a", {
      onWarning: (message) => warnings.push(message),
    });

    expect(responses).toEqual({ default: { description: "Undocumented response" } });
    expect(warnings).toEqual([expect.stringContaining("GET /a")]);
  });

  it("documents a declared 204 alone, without warnings", () => {
    const warnings: string[] = [];
    const document = createOpenAPIDocumentFromRoutes(
      [{ method: "DELETE", path: "/users/:id", responses: { "204": { description: "Deleted" } } }],
      { info: INFO, validate: true, onRouteWarning: (m) => warnings.push(m) },
    );

    expect(Object.keys(document.paths["/users/{id}"]!.delete!.responses)).toEqual(["204"]);
    expect(warnings).toEqual([]);
  });

  it("produces a valid document and reports through onRouteWarning and routeWarnings()", () => {
    const warnings: string[] = [];
    const routes = [
      { method: "DELETE", path: "/users/:id" },
      { method: "GET", path: "/health", responses: {} },
    ];

    const document = createOpenAPIDocumentFromRoutes(routes, {
      info: INFO,
      validate: true,
      onRouteWarning: (message) => warnings.push(message),
    });

    expect(document.paths["/users/{id}"]!.delete!.responses).toEqual({
      default: { description: "Undocumented response" },
    });
    expect(createOpenAPIValidator().validate(document).valid).toBe(true);
    expect(warnings).toHaveLength(2);

    const manager = createOpenAPIManagerFromRoutes(routes, { info: INFO });
    manager.generate();
    expect(manager.routeWarnings()).toEqual(warnings);
  });

  it("still reports route warnings to onSchemaWarning in one batch", () => {
    const batches: [string, readonly string[]][] = [];
    const manager = new OpenAPIManager({
      info: INFO,
      onSchemaWarning: (name, warnings) => batches.push([name, warnings]),
    });
    manager.addRoute({ method: "post", path: "/jobs" });

    manager.generate(true);

    expect(batches).toEqual([["routes", [expect.stringContaining("POST /jobs")]]]);
  });
});
