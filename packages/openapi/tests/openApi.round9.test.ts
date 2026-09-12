/**
 * Audit round 9 regressions.
 *
 * Schema-conversion cases use the real `@zudojs/schema` classes (via the
 * sibling package's build output) rather than hand-written stand-ins: every
 * converter defect in this round was a runtime field the stand-ins guessed
 * right and the real classes spell differently.
 */
import { describe, expect, it } from "vitest";

import { schema as s } from "../../schema/dist/index.js";
import {
  convertSchema,
  createOpenAPIValidator,
  OpenAPIManager,
  OpenAPIRegistryImpl,
  renderOpenAPIUI,
  toOpenAPIYAML,
  type OpenAPIDocument,
  type OpenAPIOperation,
  type OpenAPIParameter,
} from "../src/index.js";

const info = { title: "Round 9", version: "1.0.0" };

function operation(parameters?: readonly OpenAPIParameter[]): OpenAPIOperation {
  return {
    ...(parameters ? { parameters } : {}),
    responses: { "200": { description: "OK" } },
  };
}

describe("OPENAPI-R9-01 coercion wrappers keep their constraints", () => {
  it("reads number constraints from the wrapped NumberSchema", () => {
    const { schema, warnings } = convertSchema(
      s.coerce.number().int().min(1).max(10),
    );
    expect(warnings).toEqual([]);
    expect(schema).toEqual({ type: "integer", minimum: 1, maximum: 10 });
  });

  it("reads string constraints from the wrapped StringSchema", () => {
    const { schema } = convertSchema(s.coerce.string().min(2).max(5));
    expect(schema).toEqual({ type: "string", minLength: 2, maxLength: 5 });
  });

  it("represents a bigint schema like its coercing counterpart", () => {
    expect(convertSchema(s.bigint())).toEqual({
      schema: { type: "string", format: "int64" },
      warnings: [],
    });
  });
});

describe("OPENAPI-R9-02 transform schemas resolve their source", () => {
  it("converts s.transform(schema, fn) to the source schema", () => {
    const { schema, warnings } = convertSchema(
      s.transform(s.string().min(1), (value: string) => value.length),
    );
    expect(warnings).toEqual([]);
    expect(schema).toEqual({ type: "string", minLength: 1 });
  });

  it("still accepts the standalone TransformSchema shape (`_base`)", () => {
    const { schema } = convertSchema({
      _type: "transform",
      _base: { _type: "boolean" },
    });
    expect(schema).toEqual({ type: "boolean" });
  });
});

describe("OPENAPI-R9-03 default factories are resolved, not emitted", () => {
  it("invokes a default factory once and emits its value", () => {
    const { schema } = convertSchema(s.string().default(() => "fallback"));
    expect(schema).toEqual({ type: "string", default: "fallback" });
    expect(JSON.parse(JSON.stringify(schema))).toHaveProperty(
      "default",
      "fallback",
    );
  });

  it("warns and omits the default when the factory throws", () => {
    const { schema, warnings } = convertSchema(
      s.string().default(() => {
        throw new Error("no default available");
      }),
    );
    expect(schema).toEqual({ type: "string" });
    expect(warnings).toEqual([
      expect.stringContaining("no default available"),
    ]);
  });
});

describe("OPENAPI-R9-04 required mirrors what the object parser accepts", () => {
  it("leaves defaulted, any and unknown fields out of `required`", () => {
    const shape = s.object({
      id: s.string(),
      role: s.string().default("user"),
      extra: s.any(),
      more: s.unknown(),
      note: s.string().optional(),
    });
    // The runtime accepts the object without `role`; the document must too.
    expect(shape.safeParse({ id: "1" }).success).toBe(true);

    const { schema } = convertSchema(shape);
    expect(schema.required).toEqual(["id"]);
    expect(schema.properties?.["role"]).toEqual({
      type: "string",
      default: "user",
    });
  });

  it("honours .required(), which forces every key back on", () => {
    const { schema } = convertSchema(
      s.object({ a: s.string().optional(), b: s.string().default("x") }).required(),
    );
    expect(schema.required).toEqual(["a", "b"]);
  });
});

describe("OPENAPI-R9-05 URL guard strips control characters before reading the scheme", () => {
  const NL = String.fromCharCode(10);
  const TAB = String.fromCharCode(9);

  it.each([
    ["java" + NL + "script:alert(1)"],
    ["java" + TAB + "script:alert(1)"],
    ["JAVA" + NL + "SCRIPT:alert(1)"],
    ["vb" + TAB + "script:msgbox(1)"],
  ])("rejects %j as a specUrl", (url) => {
    expect(() => renderOpenAPIUI({ specUrl: url })).toThrow(/javascript|vbscript/);
  });

  it("rejects a non-image data: URL as the assets base, which lands in <script src>", () => {
    expect(() =>
      renderOpenAPIUI({
        specUrl: "/openapi.json",
        assetsBaseUrl: "data:text/javascript,alert(1);//",
      }),
    ).toThrow(/data:/);
  });

  it("still renders image data URIs and ordinary URLs", () => {
    const html = renderOpenAPIUI({
      specUrl: "/openapi.json",
      favicon: "data:image/png;base64,iVBORw0KGgo=",
      assetsBaseUrl: "https://cdn.example/swagger",
    });
    expect(html).toContain('href="data:image/png;base64,iVBORw0KGgo="');
    expect(html).toContain('src="https://cdn.example/swagger/swagger-ui-bundle.js"');
  });
});

describe("OPENAPI-R9-06 route removal survives regeneration", () => {
  it("drops a removed route from the next document", () => {
    const manager = new OpenAPIManager({ info, cacheTtlMs: 0 });
    manager.addRoute({ method: "get", path: "/a", metadata: { openapi: operation() } });
    manager.addRoute({ method: "get", path: "/b", metadata: { openapi: operation() } });
    expect(Object.keys(manager.generate().paths)).toEqual(["/a", "/b"]);

    expect(manager.removeRoute("get", "/a")).toBe(true);
    expect(Object.keys(manager.generate().paths)).toEqual(["/b"]);
  });

  it("drops a route hidden after a first generate", () => {
    const manager = new OpenAPIManager({ info, cacheTtlMs: 0 });
    manager.addRoute({ method: "get", path: "/a", metadata: { openapi: operation() } });
    manager.generate();
    manager.setRoute({
      method: "get",
      path: "/a",
      metadata: { openapi: { ...operation(), hidden: true } },
    });
    expect(Object.keys(manager.generate().paths)).toEqual([]);
  });

  it("exposes removeRoute and clearRoutes on the registry, keeping components", () => {
    const registry = new OpenAPIRegistryImpl();
    registry.registerSchema("A", { type: "string" });
    registry.setRoute({ method: "get", path: "/a", operation: operation() });
    expect(registry.removeRoute("GET", "/a")).toBe(true);
    expect(registry.removeRoute("get", "/a")).toBe(false);
    registry.setRoute({ method: "get", path: "/a", operation: operation() });
    registry.clearRoutes();
    const document = registry.generate();
    expect(document.paths).toEqual({});
    expect(document.components?.schemas).toHaveProperty("A");
  });
});

describe("OPENAPI-R9-07 a custom branding logo reaches the documentation page", () => {
  const acme = {
    url: "https://acme.example/logo.svg",
    href: "https://acme.example",
    altText: "Acme",
  };

  it("renders the manager's custom logo in the page header", () => {
    const manager = new OpenAPIManager({ info, branding: acme });
    const body = manager.toUIResponse({ specUrl: "/openapi.json" }).body;
    expect(body).toContain('src="https://acme.example/logo.svg"');
    expect(body).toContain('href="https://acme.example"');
    expect(body).toContain('alt="Acme"');
  });

  it("keeps the page's own default wordmark for default branding", () => {
    const body = new OpenAPIManager({ info })
      .toUIResponse({ specUrl: "/openapi.json" }).body;
    expect(body).toContain('alt="Zudo"');
  });

  it("lets an explicit page logo win over the manager's", () => {
    const manager = new OpenAPIManager({ info, branding: acme });
    const body = manager.toUIResponse({ specUrl: "/openapi.json", logo: false }).body;
    expect(body).not.toContain("acme.example");
  });
});

describe("OPENAPI-R9-08 local $ref resolution ignores inherited properties", () => {
  const validator = createOpenAPIValidator();

  function withRef(ref: string): OpenAPIDocument {
    return {
      openapi: "3.1.0",
      info,
      paths: {
        "/a": {
          get: {
            responses: {
              "200": {
                description: "OK",
                content: { "application/json": { schema: { $ref: ref } } },
              },
            },
          },
        },
      },
      components: { schemas: { A: { type: "string" } } },
    };
  }

  it.each([
    "#/components/schemas/constructor",
    "#/components/schemas/toString",
    "#/components/schemas/__proto__",
  ])("reports %s as unresolved", (ref) => {
    const result = validator.validate(withRef(ref));
    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.message)).toContain(
      `Reference "${ref}" does not resolve within the document.`,
    );
  });

  it("still resolves a real component", () => {
    expect(validator.validate(withRef("#/components/schemas/A")).valid).toBe(true);
  });
});

describe("OPENAPI-R9-09 operation parameters may override path-item parameters", () => {
  const validator = createOpenAPIValidator();
  const id = { name: "id", in: "path" as const, required: true };

  it("accepts an operation-level override of a path-level parameter", () => {
    const result = validator.validate({
      openapi: "3.1.0",
      info,
      paths: {
        "/a/{id}": {
          parameters: [id],
          get: operation([{ ...id, description: "narrower" }]),
          delete: operation(),
        },
      },
    });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("still rejects a duplicate within one list", () => {
    const result = validator.validate({
      openapi: "3.1.0",
      info,
      paths: { "/a/{id}": { get: operation([id, id]) } },
    });
    expect(result.errors.map((issue) => issue.message)).toContain(
      'Duplicate parameter "id" in "path".',
    );
  });
});

describe("OPENAPI-R9-10 paths differing only in template names are rejected", () => {
  const validator = createOpenAPIValidator();

  it("reports /u/{id} and /u/{userId} as the same path", () => {
    const result = validator.validate({
      openapi: "3.1.0",
      info,
      paths: {
        "/u/{id}": { get: operation([{ name: "id", in: "path", required: true }]) },
        "/u/{userId}": {
          post: operation([{ name: "userId", in: "path", required: true }]),
        },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.message)).toContain(
      'Path "/u/{userId}" is identical to "/u/{id}" apart from its template parameter names; such paths must not both exist.',
    );
  });

  it("does not confuse distinct hierarchies", () => {
    const result = validator.validate({
      openapi: "3.1.0",
      info,
      paths: {
        "/u/{id}": { get: operation([{ name: "id", in: "path", required: true }]) },
        "/u/{id}/posts": { get: operation([{ name: "id", in: "path", required: true }]) },
      },
    });
    expect(result.valid).toBe(true);
  });
});

describe("OPENAPI-R9-11 YAML quotes every scalar a parser would retype", () => {
  const cases: readonly string[] = [
    "2024-01-01",
    "2001-12-14t21:59:43.10-05:00",
    ".inf",
    "-.Inf",
    ".NaN",
    "0x1F",
    "0o17",
    "017",
    "0b101",
    "1_000",
    "1_0.5",
    "=",
    "<<",
  ];

  it.each(cases)("quotes %j", (value) => {
    const yaml = toOpenAPIYAML({
      openapi: "3.1.0",
      info: { ...info, description: value },
      paths: {},
    });
    expect(yaml).toContain(`description: ${JSON.stringify(value)}`);
  });

  it("quotes control characters and leaves ordinary text bare", () => {
    const yaml = toOpenAPIYAML({
      openapi: "3.1.0",
      info: {
        ...info,
        description: "plain words",
        termsOfService: "bell" + String.fromCharCode(7),
      },
      paths: {},
    });
    expect(yaml).toContain("description: plain words");
    expect(yaml).toContain('termsOfService: "bell\\u0007"');
  });
});
