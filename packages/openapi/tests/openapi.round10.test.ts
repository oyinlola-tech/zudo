/**
 * Audit round 10 regressions (edge/OPENAPI-01..03).
 *
 * Schema cases use the real `@zudojs/schema` classes and the real
 * `@zudojs/constants` values (sibling build output), so a drift between the
 * parser's implicit ceilings and the emitted contract fails here.
 */
import { describe, expect, it } from "vitest";

import {
  SCHEMA_DEFAULT_MAX_ARRAY_LENGTH,
  SCHEMA_DEFAULT_MAX_STRING_LENGTH,
} from "../../constants/dist/index.js";
import { schema as s } from "../../schema/dist/index.js";
import {
  buildOpenAPIUIContentSecurityPolicy,
  OpenAPIManager,
  renderOpenAPIUI,
  ZUDO_SITE_URL,
} from "../src/index.js";
import {
  SCHEMA_IMPLICIT_MAX_ARRAY_LENGTH,
  SCHEMA_IMPLICIT_MAX_STRING_LENGTH,
} from "../src/openApiConstants/index.js";

const INFO = { title: "T", version: "1" };

describe("OPENAPI-01", () => {
  it("mirrors the parser's implicit ceilings exactly", () => {
    expect(SCHEMA_IMPLICIT_MAX_STRING_LENGTH).toBe(SCHEMA_DEFAULT_MAX_STRING_LENGTH);
    expect(SCHEMA_IMPLICIT_MAX_ARRAY_LENGTH).toBe(SCHEMA_DEFAULT_MAX_ARRAY_LENGTH);
  });

  it("emits the effective maxLength/maxItems the server enforces", () => {
    const shape = s.object({ name: s.string(), tags: s.array(s.string()) });
    const m = new OpenAPIManager({ info: INFO });
    m.addSchema("S", shape);
    const out = m.generate().components?.schemas?.["S"] as {
      properties: Record<string, { maxLength?: number; maxItems?: number }>;
    };
    const name = out.properties["name"]!;
    const tags = out.properties["tags"]!;
    expect(name.maxLength).toBe(SCHEMA_DEFAULT_MAX_STRING_LENGTH);
    expect(tags.maxItems).toBe(SCHEMA_DEFAULT_MAX_ARRAY_LENGTH);

    const base = { name: "x", tags: [] as string[] };
    const over = "x".repeat(name.maxLength! + 1);
    expect(shape.safeParse({ ...base, name: over }).success).toBe(false);
    expect(shape.safeParse({ ...base, name: over.slice(1) }).success).toBe(true);
  });

  it("keeps an explicit max over the implicit one", () => {
    const m = new OpenAPIManager({ info: INFO });
    m.addSchema("S", s.object({ big: s.string().max(5000) }));
    const out = m.generate().components?.schemas?.["S"] as {
      properties: Record<string, { maxLength?: number }>;
    };
    expect(out.properties["big"]?.maxLength).toBe(5000);
  });
});

describe("OPENAPI-02", () => {
  it("loads pinned, integrity-checked Swagger UI assets by default", () => {
    const html = renderOpenAPIUI({ specUrl: "/openapi.json" });
    expect(html).not.toMatch(/swagger-ui-dist@5[/"]/);
    expect(html).toMatch(
      /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/swagger-ui-dist@\d+\.\d+\.\d+\/swagger-ui-bundle\.js" integrity="sha384-[A-Za-z0-9+/=]+" crossorigin="anonymous">/,
    );
    expect(html).toMatch(/swagger-ui\.css" integrity="sha384-/);
  });

  it("loads a pinned, integrity-checked ReDoc bundle by default", () => {
    const html = renderOpenAPIUI({ specUrl: "/o.json", renderer: "redoc" });
    expect(html).not.toContain("redoc/latest");
    expect(html).toMatch(/redoc@\d+\.\d+\.\d+\/bundles\/redoc\.standalone\.js" integrity="sha384-/);
  });

  it("drops the default hash for self-hosted assets and rejects malformed SRI", () => {
    const self = renderOpenAPIUI({ specUrl: "/o.json", assetsBaseUrl: "/vendor/swagger" });
    expect(self).not.toContain("integrity=");
    expect(() =>
      renderOpenAPIUI({ specUrl: "/o.json", assetIntegrity: { script: 'x" onload="alert(1)' } }),
    ).toThrow(TypeError);
  });

  it("toUIResponse sends a restrictive CSP that allows only the page's own inline script", () => {
    const m = new OpenAPIManager({ info: INFO });
    m.addServer({ url: "https://api.example.com/v1" });
    const res = m.toUIResponse({ specUrl: "/openapi.json" });
    const csp = res.headers["content-security-policy"] ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toMatch(/script-src https:\/\/cdn\.jsdelivr\.net 'sha256-[A-Za-z0-9+/=]+'/);
    expect(csp).not.toContain("'unsafe-inline' 'sha256");
    expect(csp).toContain("connect-src 'self' https://api.example.com");
    expect(csp).toContain("object-src 'none'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(csp).toBe(
      buildOpenAPIUIContentSecurityPolicy({ specUrl: "/openapi.json" }, [
        "https://api.example.com/v1",
      ]),
    );
  });

  it("lets the caller replace or disable the policy", () => {
    const m = new OpenAPIManager({ info: INFO });
    const off = m.toUIResponse({ specUrl: "/o", contentSecurityPolicy: false });
    expect(off.headers["content-security-policy"]).toBeUndefined();
    const own = m.toUIResponse({ specUrl: "/o", contentSecurityPolicy: "default-src 'self'" });
    expect(own.headers["content-security-policy"]).toBe("default-src 'self'");
  });
});

describe("OPENAPI-03", () => {
  it("links the brand to the project's live domain", () => {
    expect(ZUDO_SITE_URL).toBe("https://zudojs.oyinlola.site");
    const m = new OpenAPIManager({ info: INFO });
    expect(m.generate().info["x-logo"]?.href).toBe("https://zudojs.oyinlola.site");
    const html = renderOpenAPIUI({ specUrl: "/o.json" });
    expect(html).not.toContain("zudo.dev");
  });
});
