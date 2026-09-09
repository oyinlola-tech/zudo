/**
 * Regression coverage for the round-8 audit findings.
 *
 * Adversarial by design: a `$ref` pointing at `file:///etc/passwd`, a `$ref`
 * with a truncated percent-escape, a schema property literally named
 * `__proto__`, a path that would set a prototype instead of appearing in the
 * document, a constraint that silently changes meaning between 3.0 and 3.1.
 */

import { describe, it, expect } from "vitest";

import { convertSchema } from "../src/openApiSchema/schemaConverter.core.js";
import { OpenAPIValidatorImpl } from "../src/openApiValidation/openApiValidator.core.js";
import { OpenAPIRegistryImpl } from "../src/openApiRegistry/openApiRegistry.core.js";
import {
  toOpenAPIJSON,
  toOpenAPIYAML,
} from "../src/openApiSerialization/openApiSerializer.core.js";
import { renderOpenAPIUI } from "../src/openApiUi/openApiUi.core.js";
import type {
  OpenAPIDocument,
  OpenAPISchema,
} from "../src/openApiTypes/openApiTypes.core.js";

const validator = new OpenAPIValidatorImpl();

function document(overrides: Partial<OpenAPIDocument> = {}): OpenAPIDocument {
  return {
    openapi: "3.1.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {},
    ...overrides,
  } as OpenAPIDocument;
}

/** A minimal `@zudojs/schema`-shaped node. */
function schemaNode(
  type: string,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return { _type: type, ...fields };
}

// ─── OA-31 · External references ───────────────────────────────────────────

describe("$ref safety", () => {
  it("rejects a file:// reference outright", () => {
    const result = validator.validate(
      document({
        components: {
          schemas: { Leak: { $ref: "file:///etc/passwd" } as OpenAPISchema },
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.message.includes("file:"))).toBe(
      true,
    );
  });

  it("rejects every non-fetchable scheme, not just file", () => {
    for (const ref of [
      "ftp://internal/spec.yaml",
      "data:application/json,{}",
      "gopher://x/1",
      "jar:file:///tmp/a.jar!/b.json",
    ]) {
      const result = validator.validate(
        document({
          components: {
            schemas: { Ref: { $ref: ref } as OpenAPISchema },
          },
        }),
      );
      expect(result.valid, ref).toBe(false);
    }
  });

  it("warns rather than errors on an http(s) reference, since it is legal", () => {
    const result = validator.validate(
      document({
        components: {
          schemas: {
            Remote: {
              $ref: "https://example.com/schemas/User.json",
            } as OpenAPISchema,
          },
        },
      }),
    );
    expect(result.valid).toBe(true);
    expect(
      result.warnings.some((issue) =>
        issue.message.includes("points outside the document"),
      ),
    ).toBe(true);
  });

  it("warns on a relative external reference", () => {
    const result = validator.validate(
      document({
        components: {
          schemas: {
            Local: { $ref: "./common.yaml#/User" } as OpenAPISchema,
          },
        },
      }),
    );
    expect(
      result.warnings.some((issue) =>
        issue.message.includes("points outside the document"),
      ),
    ).toBe(true);
  });

  it("still resolves and accepts a valid local reference", () => {
    const result = validator.validate(
      document({
        components: {
          schemas: {
            User: { type: "object" },
            Alias: { $ref: "#/components/schemas/User" } as OpenAPISchema,
          },
        },
      }),
    );
    expect(result.valid).toBe(true);
  });

  it("reports, rather than throws on, a malformed percent-escape", () => {
    const run = (): ReturnType<typeof validator.validate> =>
      validator.validate(
        document({
          components: {
            schemas: {
              Bad: { $ref: "#/components/schemas/%" } as OpenAPISchema,
            },
          },
        }),
      );
    expect(run).not.toThrow();
    expect(run().valid).toBe(false);
  });

  it("terminates on a document whose refs form a cycle", () => {
    const result = validator.validate(
      document({
        components: {
          schemas: {
            A: { $ref: "#/components/schemas/B" } as OpenAPISchema,
            B: { $ref: "#/components/schemas/A" } as OpenAPISchema,
          },
        },
      }),
    );
    // Both targets exist, so this is a valid — if useless — document. What
    // matters is that validation returns at all.
    expect(result.valid).toBe(true);
  });
});

// ─── OA-32 · Security schemes that protect nothing ─────────────────────────

describe("security schemes", () => {
  it("warns about a scheme nothing requires", () => {
    const result = validator.validate(
      document({
        components: {
          securitySchemes: {
            bearerAuth: { type: "http", scheme: "bearer" },
          },
        },
      }),
    );
    expect(
      result.warnings.some((issue) =>
        issue.message.includes('"bearerAuth" is declared but no operation'),
      ),
    ).toBe(true);
  });

  it("stays quiet when a requirement actually names the scheme", () => {
    const result = validator.validate(
      document({
        security: [{ bearerAuth: [] }],
        components: {
          securitySchemes: {
            bearerAuth: { type: "http", scheme: "bearer" },
          },
        },
      }),
    );
    expect(
      result.warnings.some((issue) => issue.message.includes("bearerAuth")),
    ).toBe(false);
  });
});

// ─── OA-33 · Prototype-shaped names ────────────────────────────────────────

describe("structure-breaking names", () => {
  it("keeps a schema property literally named __proto__", () => {
    // Built with defineProperty: writing `__proto__:` in an object literal
    // sets the prototype rather than creating the key, which is the very
    // hazard under test.
    const shape: Record<string, unknown> = { id: schemaNode("string") };
    Object.defineProperty(shape, "__proto__", {
      value: schemaNode("string"),
      enumerable: true,
      writable: true,
      configurable: true,
    });

    const { schema } = convertSchema(
      schemaNode("object", { _config: { shape } }),
    );
    const properties = schema.properties ?? {};
    expect(Object.keys(properties).sort()).toEqual(["__proto__", "id"]);
    expect(JSON.parse(toOpenAPIJSON(document())).info.title).toBe("Test API");
    expect(JSON.stringify(schema)).toContain("__proto__");
  });

  it("keeps a route registered at the path __proto__", () => {
    const registry = new OpenAPIRegistryImpl("3.1.0");
    registry.setRoute({
      method: "get",
      path: "/__proto__",
      operation: { responses: { "200": { description: "OK" } } },
    });
    registry.setRoute({
      method: "get",
      path: "__proto__",
      operation: { responses: { "200": { description: "OK" } } },
    });
    const generated = registry.generate();
    expect(Object.keys(generated.paths).sort()).toEqual([
      "/__proto__",
      "__proto__",
    ]);
    expect(Object.getPrototypeOf(generated.paths)).toBe(Object.prototype);
  });

  it("emits a lower-case path item field even for an upper-case method", () => {
    const registry = new OpenAPIRegistryImpl("3.1.0");
    registry.setRoute({
      method: "GET" as "get",
      path: "/things",
      operation: { responses: { "200": { description: "OK" } } },
    });
    expect(Object.keys(registry.generate().paths["/things"] ?? {})).toEqual([
      "get",
    ]);
  });
});

// ─── OA-34 · Constraints that must survive translation ─────────────────────

describe("schema constraint fidelity", () => {
  it("spells an exclusive bound the way each version defines it", () => {
    const node = schemaNode("number", { _config: { gt: 5, lt: 10 } });

    const v31 = convertSchema(node, { version: "3.1.0" }).schema;
    expect(v31.exclusiveMinimum).toBe(5);
    expect(v31.exclusiveMaximum).toBe(10);

    // 3.0 defines the keyword as a boolean modifier on minimum/maximum. A
    // number there is the wrong type, so the bound is dropped or the document
    // is rejected.
    const v30 = convertSchema(node, { version: "3.0.3" }).schema;
    expect(v30.exclusiveMinimum).toBe(true);
    expect(v30.minimum).toBe(5);
    expect(v30.exclusiveMaximum).toBe(true);
    expect(v30.maximum).toBe(10);
  });

  it("keeps a positive() constraint in both versions", () => {
    const node = schemaNode("number", { _config: { positive: true } });
    expect(convertSchema(node, { version: "3.1.0" }).schema.exclusiveMinimum)
      .toBe(0);
    const v30 = convertSchema(node, { version: "3.0.3" }).schema;
    expect(v30.minimum).toBe(0);
    expect(v30.exclusiveMinimum).toBe(true);
  });

  it("carries maxLength and pattern through unchanged", () => {
    const { schema } = convertSchema(
      schemaNode("string", {
        _config: { min: 3, max: 64, pattern: /^[a-z]+$/ },
      }),
    );
    expect(schema.minLength).toBe(3);
    expect(schema.maxLength).toBe(64);
    expect(schema.pattern).toBe("^[a-z]+$");
  });

  it("warns when regex flags cannot be expressed rather than dropping them silently", () => {
    const { schema, warnings } = convertSchema(
      schemaNode("string", { _config: { pattern: /^abc$/i } }),
    );
    expect(schema.pattern).toBe("^abc$");
    expect(warnings.some((warning) => warning.includes("flags"))).toBe(true);
  });

  it("warns when a string format has no OpenAPI equivalent", () => {
    const { warnings } = convertSchema(
      schemaNode("string", { _config: { format: "emoji" } }),
    );
    expect(warnings.some((warning) => warning.includes("emoji"))).toBe(true);
  });

  it("does not emit 3.1-only keywords into a 3.0 document", () => {
    const tuple = schemaNode("tuple", {
      _schemas: [schemaNode("string"), schemaNode("number")],
    });
    const v30 = convertSchema(tuple, { version: "3.0.3" }).schema;
    expect(v30.prefixItems).toBeUndefined();
    expect(v30.minItems).toBe(2);
    expect(v30.maxItems).toBe(2);

    const literal = schemaNode("literal", { _expected: "yes" });
    expect(
      convertSchema(literal, { version: "3.0.3" }).schema.const,
    ).toBeUndefined();
    expect(convertSchema(literal, { version: "3.0.3" }).schema.enum).toEqual([
      "yes",
    ]);
    expect(convertSchema(literal, { version: "3.1.0" }).schema.const).toBe(
      "yes",
    );

    const nullSchema = schemaNode("null");
    expect(convertSchema(nullSchema, { version: "3.0.3" }).schema.type).toBe(
      undefined,
    );
    expect(convertSchema(nullSchema, { version: "3.0.3" }).schema.nullable)
      .toBe(true);
    expect(convertSchema(nullSchema, { version: "3.1.0" }).schema.type).toBe(
      "null",
    );
  });

  it("stops on a self-referential schema instead of hanging", () => {
    const node: Record<string, unknown> = { _type: "object", _config: {} };
    (node["_config"] as Record<string, unknown>)["shape"] = { self: node };
    const { warnings } = convertSchema(node);
    expect(warnings.some((warning) => warning.includes("Recursive"))).toBe(
      true,
    );
  });
});

// ─── OA-35 · Serialization of hostile text ─────────────────────────────────

describe("serialization safety", () => {
  it("quotes a description that would otherwise break the YAML structure", () => {
    const yaml = toOpenAPIYAML(
      document({
        info: {
          title: "Test API",
          version: "1.0.0",
          description:
            'x\npaths:\n  "/pwned":\n    get:\n      responses: {}\n#',
        },
      }),
    );
    // Exactly one `paths:` key at column 0 — the injected one stayed inside
    // the quoted scalar.
    expect(yaml.split("\n").filter((line) => line === "paths: {}").length).toBe(
      1,
    );
    expect(yaml).not.toMatch(/^\s+"\/pwned":/m);
    expect(yaml).toContain("\\n");
  });

  it("quotes keys and values that YAML would reinterpret", () => {
    const yaml = toOpenAPIYAML(
      document({
        info: { title: "yes", version: "1.0" },
      }),
    );
    expect(yaml).toContain('title: "yes"');
    expect(yaml).toContain('version: "1.0"');
  });

  it("distinguishes infinity from not-a-number", () => {
    const yaml = toOpenAPIYAML(
      document({
        components: {
          schemas: {
            Big: { type: "number", maximum: Infinity } as OpenAPISchema,
          },
        },
      }),
    );
    expect(yaml).toContain(".inf");
    expect(yaml).not.toContain(".nan");
  });

  it("refuses a document containing a cycle instead of hanging", () => {
    const cyclic: Record<string, unknown> = { openapi: "3.1.0", paths: {} };
    cyclic["info"] = { title: "a", version: "1", self: cyclic };
    expect(() => toOpenAPIYAML(cyclic as unknown as OpenAPIDocument)).toThrow(
      /cycle/,
    );
  });
});

// ─── OA-36 · Documentation page ────────────────────────────────────────────

describe("documentation page", () => {
  it("refuses custom CSS that would close the style block", () => {
    expect(() =>
      renderOpenAPIUI({
        specUrl: "/openapi.json",
        customCss: "body{}</style><script>fetch('//evil')</script>",
      }),
    ).toThrow(TypeError);
    expect(() =>
      renderOpenAPIUI({
        specUrl: "/openapi.json",
        customCss: "body{}</ style ><script>x</script>",
      }),
    ).toThrow(TypeError);
  });

  it("still accepts ordinary custom CSS", () => {
    const html = renderOpenAPIUI({
      specUrl: "/openapi.json",
      customCss: ".swagger-ui{--x:1}",
    });
    expect(html).toContain(".swagger-ui{--x:1}");
  });
});
