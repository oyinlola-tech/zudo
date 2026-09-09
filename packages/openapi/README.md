# @zudojs/openapi

OpenAPI 3.0 and 3.1 specification generation, validation, and serialization for Zudojs applications.

## Installation

```bash
npm install @zudojs/openapi
```

## Quick Start

`OpenAPIManager` coordinates route collection, schema conversion, document
assembly, validation and serving.

```typescript
import { OpenAPIManager } from "@zudojs/openapi";

const manager = new OpenAPIManager({
  version: "3.1.0",
  info: { title: "Orders API", version: "1.2.0" },
  servers: [{ url: "https://api.example.com" }],
});

manager.addRoute({
  method: "get",
  path: "/users/:id",
  metadata: {
    openapi: {
      operationId: "users.get",
      summary: "Get a user",
      tags: ["users"],
      parameters: [{ name: "id", in: "path", schema: { type: "string" } }],
      responses: {
        "200": { description: "User found" },
        "404": { description: "No such user" },
      },
    },
  },
});

const document = manager.generate(true); // true = validate while generating
const json = manager.toJSON();
const yaml = manager.toYAML();
```

Every documented response reaches the document — `4xx`, `5xx` and `default`
included. `:id` becomes `{id}`, and a path parameter is marked required
because the specification requires it.

Generation is idempotent: call `generate()` as often as you like.

## Serving the document

```typescript
const response = manager.toResponse({ format: "json" });
// { status: 200, headers: { "content-type", "cache-control" }, body }
```

`{ status, headers, body }` is framework-agnostic; hand it to whichever HTTP
adapter you use.

## Serving a documentation page

`toUIResponse` returns the same `{ status, headers, body }` shape carrying a
complete HTML page that reads the specification from `specUrl`. Pair it with
`toResponse`, which serves the specification itself:

```typescript
app.get("/openapi.json", () => manager.toResponse());
app.get("/docs", () => manager.toUIResponse({ specUrl: "/openapi.json" }));
```

Swagger UI is rendered by default; pass `renderer: "redoc"` for ReDoc.

```typescript
manager.toUIResponse({ specUrl: "/openapi.json", renderer: "redoc" });
```

`renderOpenAPIUI(options)` returns the HTML string on its own, without a
manager. Both accept the same options:

| Option           | Meaning                                            | Default            |
| ---------------- | -------------------------------------------------- | ------------------ |
| `specUrl`        | Where the page fetches the document from (required) | —                  |
| `title`          | Page title and header text                          | `"API reference"`  |
| `renderer`       | `"swagger"` or `"redoc"`                            | `"swagger"`        |
| `logo`           | Header logo, or `false` for none                    | Zudo wordmark      |
| `favicon`        | Favicon URL or data URI, or `false`                 | Zudo favicon       |
| `customCss`      | CSS appended after the built-in theme               | —                  |
| `assetsBaseUrl`  | Where the viewer's own JS and CSS load from         | public CDN         |
| `swaggerOptions` | Forwarded to `SwaggerUIBundle`; ignored by ReDoc    | —                  |

`assetsBaseUrl` points the viewer's assets at a self-hosted copy, which is what
an air-gapped deployment needs — the default CDN renders a blank page with no
egress. Swagger UI loads `swagger-ui.css` and `swagger-ui-bundle.js` from that
base; ReDoc loads `redoc.standalone.js`.

```typescript
manager.toUIResponse({ specUrl: "/openapi.json", assetsBaseUrl: "/vendor/swagger" });
```

Caller-supplied text is escaped, and input that would break out of the page is
refused rather than mangled: a `javascript:` or `vbscript:` URL throws, an
empty `specUrl` throws, and `customCss` containing `</style>` throws — that
sequence ends the style block and lets the rest be parsed as HTML.

## Branding

ReDoc, Scalar and several other viewers read a logo from the non-standard
`info["x-logo"]` field. Generated documents carry the Zudo mark there by
default, so a spec opened in one of them shows a logo rather than nothing.

```typescript
new OpenAPIManager({ info }).generate().info["x-logo"];
// { url: "data:image/svg+xml;…", href: "https://zudo.dev", altText: "Zudo", … }
```

The `branding` option controls it, and the same value is used by
`toUIResponse` for the page header:

- omitted or `true` — the Zudo mark
- `false` — no `x-logo`, and no logo on the page
- an `OpenAPILogo` (`{ url, href?, altText?, backgroundColor? }`) — your own

```typescript
new OpenAPIManager({ info, branding: false });
new OpenAPIManager({
  info,
  branding: { url: "https://acme.example/logo.svg", href: "https://acme.example", altText: "Acme" },
});
```

A logo already present on `info["x-logo"]` is never overwritten, whatever
`branding` says.

The brand assets are exported as inline SVG strings and as data URIs, so a page
can show them without a network request: `ZUDO_MARK_SVG`, `ZUDO_MARK_DARK_SVG`,
`ZUDO_WORDMARK_SVG`, `ZUDO_WORDMARK_DARK_SVG`, `ZUDO_FAVICON_SVG`, a
`*_DATA_URI` counterpart for each, plus `ZUDO_SITE_URL`, `zudoLogo(overrides?)`
and `svgToDataUri(svg)`. The types are `OpenAPIUIOptions`,
`OpenAPIUIRenderer`, `OpenAPIUIResponse` and `OpenAPILogo`.

## Schemas

`addSchema` converts a `@zudojs/schema` schema into an OpenAPI component and
registers it.

```typescript
import {
  objectSchema,
  stringSchema,
  numberSchema,
  optionalSchema,
} from "@zudojs/schema";

manager.addSchema(
  "User",
  objectSchema({
    id: stringSchema().uuid(),
    age: numberSchema().int().min(0),
    nickname: optionalSchema(stringSchema()),
  }),
);
```

produces

```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "age": { "type": "integer", "minimum": 0 },
    "nickname": { "type": "string" }
  },
  "required": ["id", "age"]
}
```

Objects, arrays, enums, literals, unions, discriminated unions,
intersections, records, tuples, sets, optionals, nullables, defaults,
refinements, transforms, lazy schemas and the coercion wrappers are all
converted, along with string and number constraints (`min`, `max`, `length`,
`pattern`, `format`, `int`, `multipleOf`, `gt`, `lt`).

Anything that cannot be expressed exactly produces a **warning** rather than a
silent `{}`:

```typescript
const manager = new OpenAPIManager({
  info,
  onSchemaWarning: (name, warnings) => logger.warn({ name, warnings }),
});

manager.schemaWarnings(); // Map<componentName, warnings>
```

### Version awareness

3.0 and 3.1 spell several keywords differently, and the difference is not
cosmetic: the 3.1 spelling in a 3.0 document is either rejected by a strict
tool or ignored by a lenient one, so the constraint silently disappears from
the published contract. The converter emits whichever spelling the target
version defines.

| Constraint       | 3.1.x                        | 3.0.x                                |
| ---------------- | ---------------------------- | ------------------------------------ |
| `gt(5)`          | `exclusiveMinimum: 5`        | `minimum: 5, exclusiveMinimum: true` |
| `lt(10)`         | `exclusiveMaximum: 10`       | `maximum: 10, exclusiveMaximum: true`|
| `positive()`     | `exclusiveMinimum: 0`        | `minimum: 0, exclusiveMinimum: true` |
| nullable         | `type: ["string", "null"]`   | `nullable: true`                     |
| literal          | `const: "yes"`               | `enum: ["yes"]`                      |
| tuple            | `prefixItems`                | `minItems` / `maxItems`              |

In 3.1 `exclusiveMinimum` carries the bound itself; in 3.0 it is a boolean
modifier on `minimum`. Emitting the number into a 3.0 document produced a
keyword of the wrong type, which is how a `gt(5)` constraint used to vanish
from a 3.0 spec. Both spellings are now correct, and no 3.1-only keyword
reaches a 3.0 document.

A regular expression's flags have nowhere to go: OpenAPI's `pattern` carries
the source and nothing else. A `/^abc$/i` pattern would therefore become
case-*sensitive* in the document — a published contract stricter than the code
validating against it. Rather than drop the flags silently, the converter
emits the source and raises a warning naming them.

Recursive schemas are detected and reported rather than overflowing the stack —
register the recursive type as a named component and reference it with `$ref`.

Use `convertSchema` directly when you want the conversion without the
registry:

```typescript
import { convertSchema } from "@zudojs/openapi";

const { schema, warnings } = convertSchema(mySchema, { version: "3.0.3" });
```

> The converter reads `@zudojs/schema`'s runtime fields structurally rather
> than importing its classes, which keeps it usable with any compatible
> object. The field names it depends on are listed at the top of
> `schemaConverter.core.ts` and covered by tests.

## Validation

```typescript
const result = manager.validate();
result.valid; // boolean
result.errors; // OpenAPIValidationIssue[]
result.warnings; // OpenAPIValidationIssue[]
```

The validator checks:

- required document fields, and that `openapi` is a supported version
- that every operation declares at least one response, keyed by a status
  code, a `4XX`-style range, or `default`, each with a description
- that path templates and `in: "path"` parameters agree in both directions —
  the classic "`{id}` is in the path but nowhere in `parameters`" mistake
- that path parameters are marked required, and that no parameter is declared
  twice
- `operationId` uniqueness and length
- that every `security` requirement names a scheme declared in
  `components.securitySchemes` — a typo there yields a document that _looks_
  protected
- that every local `$ref` resolves within the document
- that every non-local `$ref` uses a scheme a resolver may reasonably be
  pointed at — only `http` and `https`. A `$ref` is an instruction to whatever
  dereferences the document, so `file:///etc/passwd` or
  `http://169.254.169.254/latest/meta-data/` turns the spec into a file-read or
  SSRF sink in the resolver downstream. Any other scheme is an **error**; an
  http(s) or relative reference is legal OpenAPI and so is a **warning**,
  telling you something outside the document will be fetched
- that no path still uses `:id` instead of `{id}`

`assertValid` throws an `OpenAPIValidationError` that **carries the issues**:

```typescript
try {
  manager.generate(true);
} catch (error) {
  if (error instanceof OpenAPIValidationError) {
    console.error(error.format()); // one line per issue
    error.issues; // structured
  }
}
```

## Building a document by hand

```typescript
import { OpenAPIDocumentBuilder } from "@zudojs/openapi";

const document = new OpenAPIDocumentBuilder({
  info: { title: "Orders API", version: "1.2.0" },
})
  .addServer({ url: "https://api.example.com" })
  .addTag({ name: "orders" })
  .addSecurityScheme("bearerAuth", { type: "http", scheme: "bearer" })
  .addSecurity({ bearerAuth: [] })
  .addSchema("Order", { type: "object" })
  .addPath("/orders", {
    get: { responses: { "200": { description: "OK" } } },
    post: { responses: { "201": { description: "Created" } } },
  })
  .build();
```

The builder and the manager assemble documents through the same registry, so
both paths produce the same shape and obey the same rules.

## Serialization

`toOpenAPIJSON` and `toOpenAPIYAML` both take a document. The YAML output is
real YAML — a document is plain maps, arrays and scalars, and strings that YAML
would reinterpret (`true`, `null`, `1.0`, anything opening with a reserved
character) are quoted.

## References

```typescript
import { createComponentReference } from "@zudojs/openapi";

createComponentReference("schemas", "User");
// { $ref: "#/components/schemas/User" }
```

Component names are escaped per RFC 6901, so a name containing `/` or `~`
still produces a pointer that resolves.

## Errors

All errors extend `OpenAPIError` (a `BaseError` from `@zudojs/errors`) and
default to status 500, not exposed — these are failures while a service builds
or validates its own specification, not responses to a client request:

`OpenAPIValidationError` · `OpenAPIDocumentError` · `OpenAPIComponentError` ·
`OpenAPIComponentConflictError` · `OpenAPIReferenceError` ·
`OpenAPIRouteError` · `OpenAPISchemaError` · `OpenAPISerializationError` ·
`OpenAPIVersionError` · `OpenAPIOperationError`

Each accepts `statusCode` and `expose` overrides.

## Use Cases

- Generating API documentation from route metadata
- Serving a spec, and a branded Swagger UI or ReDoc page, from your own app
- Feeding client and server code generators
- Contract checks in CI
