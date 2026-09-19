---
title: "@zudojs/openapi — OpenAPI Specification Engine"
description: "Complete documentation for @zudojs/openapi — the OpenAPI specification generation, validation, and serialization engine for Zudojs."
source: https://zudojs.oyinlola.site/docs/packages-openapi
---

v1.2.0

# @zudojs/openapi

Turns your routes and schemas into an OpenAPI 3.0 or 3.1 document, checks that the document is valid, and serves it — together with a ready-made documentation page.

OPENAPI SPECIFICATION VALIDATION SWAGGER UI REDOC

## OVERVIEW

An **OpenAPI document** is a machine-readable description of an HTTP API. It lists every path, every method, what you send, and what comes back. It is normally written as one JSON or YAML file.

Because it is machine-readable, tools can read it and do work for you: render browsable documentation, generate a client library in another language, produce request collections, or check in CI that your API has not changed by accident.

Writing that file by hand goes stale the moment code changes. `@zudojs/openapi` builds it from the route metadata and schemas you already have, so the description and the code move together.

USE IT WHEN

- You expose an HTTP API and want documentation that cannot drift from the code.
- Someone needs a generated client or SDK for your API.
- You want a contract check in CI that fails when the spec becomes invalid.
- You want a Swagger UI or ReDoc page without wiring one up yourself.

SKIP IT WHEN

- Your service is internal-only and nobody reads a spec for it.
- You only need runtime input validation — that is [@zudojs/schema](https://zudojs.oyinlola.site/docs/packages-schema.md).
- Your API is GraphQL or RPC — OpenAPI describes HTTP endpoints.

> **In plain words:** this package writes the `openapi.json` file for you, tells you when that file is wrong, and hands you a web page that displays it.

## INSTALLATION

```bash
$ npm install @zudojs/openapi
```

The only runtime dependency is `@zudojs/errors`. Install `@zudojs/schema` too if you want to register schemas rather than hand-written OpenAPI objects:

```bash
$ npm install @zudojs/schema
```

Schemas are read structurally, not imported, so any object with the same runtime shape works.

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

## QUICK START

`OpenAPIManager` is the one class most applications use. You give it document metadata, add routes, then ask for the document.

```ts
import { OpenAPIManager } from "@zudojs/openapi";

const manager = new OpenAPIManager({
  version: "3.1.0",
  info: { title: "Orders API", version: "1.0.0" },
  servers: [{ url: "https://api.example.com" }],
});

manager.addRoute({
  method: "get",
  path: "/orders/:id",
  metadata: {
    openapi: {
      operationId: "orders.get",
      summary: "Get one order",
      parameters: [{ name: "id", in: "path", schema: { type: "string" } }],
      responses: {
        "200": { description: "The order" },
        "404": { description: "No such order" },
      },
    },
  },
});

const document = manager.generate(true); // true = validate while generating
console.log(Object.keys(document.paths));
// [ '/orders/{id}' ]

console.log(JSON.parse(manager.toJSON()).openapi);
// 3.1.0
```

Three things happened without you asking:

- `/orders/:id` became the OpenAPI path template `/orders/{id}`.
- The `id` parameter was marked `required: true`, because OpenAPI requires that of every path parameter.
- The document got a `info["x-logo"]` entry so viewers show a logo. See [Branding](#branding).

> **Tip:** `generate()` is safe to call as many times as you like. Every change to the manager throws away the cached document, so the next call sees your new routes.

## DESCRIBING ROUTES

A *route* here is a method, a path, and some metadata. The metadata lives under `metadata.openapi` and holds the fields OpenAPI calls an *operation*: what this endpoint is called, what it takes, and what it returns.

Every field is optional. This is the full set:

| Field | What it does |
| --- | --- |
| `operationId` | Unique name for the endpoint. Code generators turn it into a method name. |
| `summary` / `description` | Short and long human text. |
| `tags` | Groups endpoints together in the rendered page. |
| `parameters` | Path, query, header or cookie inputs. Each has `name`, `in`, and optionally `schema`, `required`, `example`. |
| `requestBody` | The body the endpoint accepts, keyed by media type. |
| `responses` | Keyed by status code, a `4XX`-style range, or `default`. Each needs a `description`. |
| `security` / `servers` / `externalDocs` | Per-operation overrides of the document-level values. |
| `deprecated` | Marks the endpoint as going away. |
| `hidden` | Leaves the route out of the generated document entirely. |

This adds a second route with a body and a tag, then prints the methods that ended up on the path:

```ts
import { OpenAPIManager } from "@zudojs/openapi";

const manager = new OpenAPIManager({
  info: { title: "Orders API", version: "1.0.0" },
});

manager.addRoute({
  method: "post",
  path: "/orders",
  metadata: {
    openapi: {
      operationId: "orders.create",
      tags: ["orders"],
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: { type: "object" } },
        },
      },
      responses: { "201": { description: "Order created" } },
    },
  },
});

const document = manager.generate();
console.log(Object.keys(document.paths["/orders"] ?? {}));
// [ 'post' ]
```

Use `addRoute` for a route you are adding once; it throws if the same method and path are already registered. Use `setRoute` when replacing is what you want, and `removeRoute(method, path)` to drop one.

> **Watch out:** OpenAPI has no optional or wildcard path segments. `/files/*` and `/users/:id?` both throw an `OpenAPIRouteError` instead of quietly producing a path template no tool understands.

## SCHEMAS

A *schema* describes the shape of a value: which fields exist, their types, and what counts as valid. OpenAPI has its own schema dialect, and `addSchema` translates a `@zudojs/schema` schema into it.

Registering a schema puts it in `components.schemas` under the name you give, so operations can point at it with a `$ref` instead of repeating it.

```ts
import { OpenAPIManager } from "@zudojs/openapi";
import { objectSchema, stringSchema, numberSchema } from "@zudojs/schema";

const manager = new OpenAPIManager({
  info: { title: "Orders API", version: "1.0.0" },
});

manager.addSchema(
  "Order",
  objectSchema({
    id: stringSchema().uuid(),
    total: numberSchema().min(0),
  }),
);

const document = manager.generate();
console.log(JSON.stringify(document.components?.schemas?.Order));
// {"type":"object","properties":{"id":{"type":"string","format":"uuid"},
//  "total":{"type":"number","minimum":0}},"required":["id","total"]}
```

`optional`, `default`, `any` and `unknown` fields are left out of `required`, matching what the runtime accepts; constraints on coerced schemas and factory defaults are carried into the document.

Point an operation at it with `createComponentReference`, which builds the `$ref` string and escapes names containing `/` or `~`:

```ts
import { createComponentReference } from "@zudojs/openapi";

console.log(createComponentReference("schemas", "Order"));
// { $ref: '#/components/schemas/Order' }
```

### When a constraint cannot be expressed

Some things your schema can say have no OpenAPI equivalent. Rather than emit an empty `{}` and let you find out in production, the converter records a *warning* and still emits everything it can.

```ts
import { convertSchema } from "@zudojs/openapi";
import { stringSchema } from "@zudojs/schema";

const { schema, warnings } = convertSchema(
  stringSchema().regex(/^abc$/i),
);

console.log(schema.pattern);   // '^abc$'
console.log(warnings.length); // 1 — the /i flag cannot be expressed
```

OpenAPI's `pattern` keyword carries the regular expression source and nothing else — there is no place to put `i` or `m`. A case-insensitive pattern would therefore become case-*sensitive* in the published document, which is stricter than the code that actually validates requests. The converter no longer lets that pass unremarked: the flags show up in a warning naming the pattern.

Warnings from a schema you registered are collected per component:

```ts
const manager = new OpenAPIManager({
  info: { title: "Orders API", version: "1.0.0" },
  onSchemaWarning: (name, warnings) => console.warn(name, warnings),
});

manager.schemaWarnings(); // Map<componentName, warnings>
```

Already have an OpenAPI schema object, hand-written or from somewhere else? Register it as-is with `addRawSchema(name, schema)`, which skips conversion.

## 3.0 VS 3.1

OpenAPI 3.0 and 3.1 spell several schema keywords differently. Emitting the 3.1 spelling into a 3.0 document does not fail loudly — a strict tool rejects the whole file and a lenient one drops the keyword, so the constraint is simply gone.

The converter takes the target version from the manager and emits the spelling that version defines. You choose the version once, in the constructor.

| Your constraint | 3.1.x | 3.0.x |
| --- | --- | --- |
| `gt(5)` | `exclusiveMinimum: 5` | `minimum: 5, exclusiveMinimum: true` |
| `lt(10)` | `exclusiveMaximum: 10` | `maximum: 10, exclusiveMaximum: true` |
| nullable value | `type: ["string", "null"]` | `nullable: true` |
| literal | `const: "yes"` | `enum: ["yes"]` |
| tuple | `prefixItems` | `minItems` / `maxItems` |

In 3.1, `exclusiveMinimum` holds the number. In 3.0 it is a *boolean* that modifies `minimum`. Both spellings now come out right:

```ts
import { convertSchema } from "@zudojs/openapi";
import { numberSchema } from "@zudojs/schema";

const price = numberSchema().gt(5);

console.log(convertSchema(price, { version: "3.1.0" }).schema);
// { type: 'number', exclusiveMinimum: 5 }

console.log(convertSchema(price, { version: "3.0.3" }).schema);
// { type: 'number', minimum: 5, exclusiveMinimum: true }
```

> **In plain words:** pick `"3.1.0"` unless a tool you depend on only reads 3.0. Either way the constraints you wrote survive the translation.

## VALIDATION

A document can be well-formed JSON and still be a broken OpenAPI file. The validator reads a finished document and reports what is wrong before a tool downstream trips over it.

`validate()` reports; it never throws:

```ts
import { OpenAPIManager } from "@zudojs/openapi";

const manager = new OpenAPIManager({
  info: { title: "Orders API", version: "1.0.0" },
});

manager.addRoute({
  method: "get",
  path: "/orders/:id",
  metadata: {
    openapi: { responses: { "200": { description: "OK" } } },
  },
});

const result = manager.validate();
console.log(result.valid);              // false
console.log(result.errors[0].message); // mentions the missing "id" parameter
```

The path says `{id}` but no parameter declares it, so the document claims a slot nothing fills. Add `parameters: [{ name: "id", in: "path" }]` and it passes.

### What it checks

- Required document fields are present and `openapi` names a supported version.
- Every operation declares at least one response, keyed by a status code, a `4XX`-style range or `default`, each with a description.
- Path templates and `in: "path"` parameters agree in both directions, path parameters are required, no parameter is declared twice in one list (an operation-level parameter may override a path-level one), and no two paths are identical apart from their template parameter names.
- `operationId` values are unique and within `MAX_OPERATION_ID_LENGTH`.
- Every `security` requirement names a scheme declared in `components.securitySchemes`, and every declared scheme is used somewhere.
- Every local `$ref` resolves inside the document, and every non-local one uses an allowed scheme.
- No path still uses `:id` instead of `{id}`.

### Where a $ref may point

A `$ref` is an instruction to whatever reads the document: *go fetch this and paste it here*. Most refs are local — `#/components/schemas/Order` — and the validator checks they resolve.

A ref that is not local is checked for its URI scheme. Only `http` and `https` are allowed. Anything else is an error.

```ts
import { createOpenAPIValidator } from "@zudojs/openapi";

const validator = createOpenAPIValidator();

const result = validator.validate({
  openapi: "3.1.0",
  info: { title: "Orders API", version: "1.0.0" },
  paths: {},
  components: { schemas: { Leak: { $ref: "file:///etc/passwd" } } },
});

console.log(result.valid);              // false
console.log(result.errors[0].message); // mentions the "file:" scheme
```

> **Danger:** before this check, any ref that did not start with `#` was accepted. A document carrying `file:///etc/passwd` or `http://169.254.169.254/latest/meta-data/` validated cleanly, and the resolver that later followed it turned your spec into a file read or a request to a cloud metadata endpoint. Non-fetchable schemes are now rejected outright.

An `https` or relative ref is legal OpenAPI, so it is a **warning**, not an error: the document stays valid, but you are told something outside it will be fetched. Bundle the target into `components` if the source is not fully trusted.

### Failing loudly

Pass `true` to `generate`, `toJSON` or `toYAML` and an invalid document throws instead. The error carries the issues:

```ts
import { OpenAPIValidationError } from "@zudojs/openapi";

try {
  manager.generate(true);
} catch (error) {
  if (error instanceof OpenAPIValidationError) {
    console.error(error.format()); // one line per issue
    console.error(error.issues);    // structured: { path, message, severity }
  }
}
```

> **Tip:** run `manager.generate(true)` in a CI test. The build fails the moment a route stops matching its documented contract.

## SERVING THE DOCS

Two endpoints are all you need. One serves the specification, the other serves a page that reads it.

- `toResponse()` — the document itself, as JSON or YAML.
- `toUIResponse({ specUrl })` — a complete HTML documentation page that fetches the spec from `specUrl`.

Both return the same plain shape — `{ status, headers, body }` — so any HTTP adapter can turn them into its own response type.

```ts
import { OpenAPIManager } from "@zudojs/openapi";

const manager = new OpenAPIManager({
  info: { title: "Orders API", version: "1.0.0" },
});

const spec = manager.toResponse({ format: "json" });
console.log(spec.status, spec.headers["content-type"]);
// 200 application/json; charset=utf-8

const page = manager.toUIResponse({ specUrl: "/openapi.json" });
console.log(page.status, page.headers["content-type"]);
// 200 text/html; charset=utf-8

console.log(page.body.startsWith("<!doctype html>")); // true
```

Wired into an HTTP framework, that is two handlers:

```ts
// pseudo-code for whatever router you use
app.get("/openapi.json", () => manager.toResponse());
app.get("/docs", () => manager.toUIResponse({ specUrl: "/openapi.json" }));
```

Open `/docs` and you get a browsable page: every endpoint listed by tag, expandable request and response shapes, and a "try it out" button that sends a real request.

### Swagger UI or ReDoc

**Swagger UI** is the default: interactive, good for poking at an API by hand. **ReDoc** renders a three-column reference document — better for reading, no try-it-out. Choose with `renderer`.

```ts
manager.toUIResponse({ specUrl: "/openapi.json", renderer: "redoc" });
```

You can also render the page on its own, without a manager, with `renderOpenAPIUI`. It returns the HTML string; serve it with `content-type: text/html`.

```ts
import { renderOpenAPIUI } from "@zudojs/openapi";

const html = renderOpenAPIUI({
  specUrl: "/openapi.json",
  title: "Orders API",
  renderer: "swagger",
});

console.log(html.includes("swagger-ui-bundle.js")); // true
```

| Option | What it does | Default |
| --- | --- | --- |
| `specUrl` | Where the page fetches the document from. Required. | — |
| `title` | Page title and header text. | `"API reference"` |
| `renderer` | `"swagger"` or `"redoc"`. | `"swagger"` |
| `logo` | Header logo, or `false` for none. | Zudo wordmark |
| `favicon` | Favicon URL or data URI, or `false`. | Zudo favicon |
| `customCss` | CSS appended after the built-in theme. | — |
| `assetsBaseUrl` | Where the viewer's own JS and CSS load from. | public CDN |
| `swaggerOptions` | Extra options passed to `SwaggerUIBundle`. Ignored by ReDoc. | — |

### Air-gapped deployments

By default the page loads Swagger UI or ReDoc from a public CDN. A machine with no internet access renders a blank page. Host the viewer's files yourself and point `assetsBaseUrl` at them:

```ts
manager.toUIResponse({
  specUrl: "/openapi.json",
  assetsBaseUrl: "/vendor/swagger",
});
// the page now loads /vendor/swagger/swagger-ui.css
// and /vendor/swagger/swagger-ui-bundle.js
```

For ReDoc the file needed under that base is `redoc.standalone.js`.

> **Watch out:** `renderOpenAPIUI` refuses input that would break out of the page. A `javascript:` or `vbscript:` URL throws a `TypeError` (the scheme is read after stripping control characters, so `java\nscript:` is caught), a `data:` URL that is not an image throws, an empty `specUrl` throws, and `customCss` containing `</style>` throws rather than being mangled — that sequence would end the style block and let the rest be parsed as HTML.

## BRANDING

ReDoc, Scalar and several other viewers look for a logo in a non-standard `info["x-logo"]` field. Generated documents carry one by default, so a spec opened in any of those tools shows a logo instead of nothing.

```ts
import { OpenAPIManager } from "@zudojs/openapi";

const document = new OpenAPIManager({
  info: { title: "Orders API", version: "1.0.0" },
}).generate();

console.log(document.info["x-logo"].altText); // 'Zudo'
console.log(document.info["x-logo"].href);    // 'https://zudo.dev'
```

The `branding` option controls it. There are three ways to use it:

| Value | Result |
| --- | --- |
| omitted or `true` | The Zudo mark, in `x-logo` and in the UI page header. |
| `false` | No `x-logo` at all, and no logo on the page. |
| `{ url, href, altText }` | Your own logo, used in both places. |

```ts
const ownBrand = new OpenAPIManager({
  info: { title: "Orders API", version: "1.0.0" },
  branding: {
    url: "https://acme.example/logo.svg",
    href: "https://acme.example",
    altText: "Acme",
  },
});

console.log(ownBrand.generate().info["x-logo"].altText); // 'Acme'

const plain = new OpenAPIManager({
  info: { title: "Orders API", version: "1.0.0" },
  branding: false,
});

console.log(plain.generate().info["x-logo"]); // undefined
```

A logo you put on `info` yourself is never overwritten — set `info["x-logo"]` directly and that is what the document carries, whatever `branding` says.

The brand assets are exported too, as inline SVG strings and as data URIs, so a page can use them with no extra network request:

```ts
import {
  zudoLogo,
  svgToDataUri,
  ZUDO_MARK_SVG,
  ZUDO_SITE_URL,
} from "@zudojs/openapi";

console.log(zudoLogo().href);        // 'https://zudo.dev'
console.log(ZUDO_SITE_URL);          // 'https://zudo.dev'

const uri = svgToDataUri(ZUDO_MARK_SVG);
console.log(uri.startsWith("data:image/svg+xml;charset=utf-8,")); // true
```

The full set: `ZUDO_MARK_SVG`, `ZUDO_MARK_DARK_SVG`, `ZUDO_WORDMARK_SVG`, `ZUDO_WORDMARK_DARK_SVG`, `ZUDO_FAVICON_SVG`, and a `_DATA_URI` counterpart for each.

## BUILDING BY HAND

If you are not generating from routes — describing an API you did not write, or assembling a document in a script — use `OpenAPIDocumentBuilder`. Every method returns the builder, so calls chain, and `build()` returns the finished document.

```ts
import { OpenAPIDocumentBuilder, toOpenAPIYAML } from "@zudojs/openapi";

const document = new OpenAPIDocumentBuilder({
  info: { title: "Orders API", version: "1.0.0" },
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

console.log(toOpenAPIYAML(document).split("\n")[0]);
// openapi: 3.1.0
```

The builder and the manager assemble documents through the same registry, so both produce the same shape and obey the same rules.

Serialize any document with `toOpenAPIJSON` or `toOpenAPIYAML`. The YAML is real YAML: strings that YAML would otherwise reinterpret — `true`, `null`, `1.0`, anything starting with a reserved character — come out quoted.

## API REFERENCE

### Classes

| Name | What it does | Notes |
| --- | --- | --- |
| `OpenAPIManager` | Collects routes and schemas, generates, validates, serializes and serves. | The class most apps use. `createOpenAPIManager(options)` is the factory. |
| `OpenAPIDocumentBuilder` | Chainable builder for a document written by hand. | `createOpenAPIDocumentBuilder(options)` is the factory. |
| `OpenAPIRegistryImpl` | The low-level store of paths, components and metadata. | Used by both of the above. Reach for it only if you need direct control. |
| `OpenAPIRouteScannerImpl` | Holds routes and converts them to operations. | `addRoute`, `setRoute`, `removeRoute`, `scan`, `clear`. |
| `OpenAPIValidatorImpl` | Validates a finished document. | `createOpenAPIValidator()` is the factory. |
| `SchemaRegistryImpl` | Converts and stores named component schemas. | Collects conversion warnings per name. |

### OpenAPIManager methods

| Name | What it does | Notes |
| --- | --- | --- |
| `addRoute(route)` | Registers a route. | Throws on a duplicate method + path. |
| `setRoute(route)` | Registers a route, replacing any existing one. | — |
| `removeRoute(method, path)` | Removes a route. | Returns whether one was removed. |
| `addSchema(name, schema)` | Converts a `@zudojs/schema` schema and registers it. | Conversion warnings land in `schemaWarnings()`. |
| `addRawSchema(name, schema)` | Registers an already-converted OpenAPI schema. | No conversion. |
| `setInfo`, `addServer`, `addTag` | Set document metadata. | Chainable. |
| `addSecurityScheme(name, scheme)` | Declares an authentication scheme. | Pair with `addSecurityRequirement`. |
| `addSecurityRequirement(req)` | Requires a scheme document-wide. | Validated against declared schemes. |
| `generate(validate?)` | Builds the document. | Idempotent. `true` throws on an invalid result. |
| `getDocument(validate?)` | Returns the document, using the cache when fresh. | Rebuilds when stale or absent. |
| `validate()` | Validates without throwing. | Returns `{ valid, errors, warnings }`. |
| `toJSON(validate?)` / `toYAML(validate?)` | Serializes the document. | — |
| `toResponse(options?)` | HTTP response carrying the document. | `format`, `validate`, `cacheControl`. |
| `toUIResponse(options)` | HTTP response carrying a documentation page. | Takes the `renderOpenAPIUI` options. |
| `schemaWarnings()` | Conversion warnings, keyed by component name. | Read-only map. |
| `invalidateCache()` | Drops the cached document. | Every mutation calls it for you. |
| `reset()` | Drops every route, component and the cache. | Use instead of the deprecated `invalidate()`. |
| `version` | The version this manager emits. | Getter. |

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| `renderOpenAPIUI(options)` | Returns a complete HTML documentation page. | Swagger UI or ReDoc. |
| `zudoLogo(overrides?)` | The default logo object. | Frozen; pass overrides for a variant. |
| `svgToDataUri(svg)` | Encodes an SVG string as a compact data URI. | No network request needed to show it. |
| `convertSchema(schema, options?)` | Converts one schema without a registry. | Returns `{ schema, warnings }`. |
| `createSchemaConverter(options?)` | A reusable converter bound to options. | — |
| `isVersion31(version)` | Whether a version string is 3.1.x. | — |
| `createComponentReference(section, name)` | Builds a `$ref` object. | Escapes names per RFC 6901. |
| `escapeJsonPointerSegment` / `unescapeJsonPointerSegment` | Escape and unescape one pointer segment. | `~` and `/`. |
| `toOpenAPIPath(path)` | `/users/:id` → `/users/{id}`. | Throws on wildcard or optional segments. |
| `extractPathParameters(path)` | Parameter names in a path template. | — |
| `convertRouteToOpenAPI(method, path, metadata?)` | Turns one route into an operation. | — |
| `buildResponses(metadata?)` | The `responses` object for an operation. | Synthesizes a `200` only when none are declared. |
| `isOpenAPIMethod(method)` | Whether a string is an OpenAPI method. | Type guard. |
| `toOpenAPIJSON(document)` / `toOpenAPIYAML(document)` | Serialize a document. | YAML quotes ambiguous strings. |
| `createOpenAPIError` / `isOpenAPIError` / `formatIssuePath` | Error helpers. | `formatIssuePath` renders an issue path as `paths./orders.get`. |

### Types

| Name | What it does | Notes |
| --- | --- | --- |
| `OpenAPIManagerOptions` | Constructor options. | `version`, `info`, `servers`, `tags`, `security`, `cacheTtlMs`, `onSchemaWarning`, `branding`, `now`. |
| `OpenAPIUIOptions` | Options for the documentation page. | See the table in [Serving](#serving). |
| `OpenAPIUIRenderer` | `"swagger" \| "redoc"`. | — |
| `OpenAPIUIResponse` | `{ status, headers, body }` for the page. | Returned by `toUIResponse`. |
| `OpenAPIDocumentResponse` | `{ status, headers, body }` for the spec. | Returned by `toResponse`. |
| `OpenAPILogo` | `{ url, href?, altText?, backgroundColor? }`. | The shape of `info["x-logo"]`. |
| `RouteInfo` / `RouteMetadata` / `RouteOpenAPIMetadata` / `RouteParameterMetadata` | What `addRoute` accepts. | — |
| `OpenAPIValidationResult` / `OpenAPIValidationIssue` | Validator output. | An issue is `{ path, message, severity }`. |
| `SchemaConversionResult` / `SchemaConversionOptions` | Converter input and output. | — |
| `OpenAPIDocument`, `OpenAPIOperation`, `OpenAPISchema`, … | The specification object types. | Mirror the OpenAPI standard; all exported from the package root. |

### Errors

All extend `OpenAPIError`, itself a `BaseError` from [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md). They default to status 500 and are not exposed to clients — these are failures while your service builds its own specification, not answers to a request.

| Name | Thrown when | Notes |
| --- | --- | --- |
| `OpenAPIValidationError` | A document fails validation. | Carries `issues` and a `format()` summary. |
| `OpenAPIRouteError` | A path or method cannot become an operation. | Wildcards, optional parameters, unsupported methods. |
| `OpenAPISchemaError` | A schema cannot be converted. | Includes unresolvable recursion. |
| `OpenAPIComponentConflictError` | A component name is registered twice with different content. | Extends `OpenAPIComponentError`. |
| `OpenAPIVersionError` | An unsupported version is requested. | See `SUPPORTED_OPENAPI_VERSIONS`. |
| `OpenAPIDocumentError`, `OpenAPIComponentError`, `OpenAPIReferenceError`, `OpenAPISerializationError`, `OpenAPIOperationError` | The remaining failure kinds. | Each accepts `statusCode` and `expose` overrides. |

### Constants

| Name | Value | Notes |
| --- | --- | --- |
| `DEFAULT_OPENAPI_VERSION` | `"3.1.0"` | Used when you pass no version. |
| `SUPPORTED_OPENAPI_VERSIONS` | `3.0.0`–`3.0.3`, `3.1.0`, `3.1.1` | Anything else is rejected. |
| `MAX_OPERATION_ID_LENGTH` | `128` | Longer ids fail validation. |
| `COMPONENT_REF_PREFIX` | `"#/components"` | Prefix of every local `$ref`. |
| `DEFAULT_MEDIA_TYPE` | `"application/json"` | Content type of `toResponse()`. |
| `DEFAULT_SERVER_URL` | `"http://localhost"` | Fallback server URL. |
| `DOCUMENT_CACHE_TTL_MS` | `300000` | Five minutes. Override with `cacheTtlMs`. |
| `STATUS_CODE_CATEGORIES` | `1XX`…`5XX` | The range keys OpenAPI allows. |
| `RESPONSE_KEY_PATTERN` | RegExp | What a valid response key looks like. |
| `PATH_TEMPLATE_PARAMETER` | RegExp | Matches `{name}` in a path. |
| `ZUDO_SITE_URL` and the `ZUDO_*` assets | SVG strings and data URIs | See [Branding](#branding). |

## COMMON MISTAKES

- **Leaving a path parameter out of `parameters`.**
   The path says `{id}` but nothing declares it, so validation fails and generated clients have no way to pass the value. Add `{ name: "id", in: "path" }`; you do not need to set `required`, it is forced to `true`.
- **Serving the spec but not a page, or a page but not the spec.**
   A `toUIResponse` page fetches `specUrl` at load time and shows an error if nothing answers. Register both handlers, and make `specUrl` match the route the spec is actually on.
- **Assuming a 3.1 document still means the same thing as 3.0.**
   Copying a document between versions silently drops exclusive bounds and nullability. Set `version` on the manager and let the converter emit the right spelling.
- **Ignoring schema warnings.**
   A dropped constraint — an unknown string format, a regex flag OpenAPI cannot express — is not an error, so nothing stops the build. Pass `onSchemaWarning` or read `schemaWarnings()` and log them.
- **Pasting a `$ref` from an untrusted document.**
   A non-`http(s)` ref is now an error, but an `https` one is only a warning — legal OpenAPI, and still a fetch your resolver will perform. Bundle the target into `components` when the source is not yours.
- **Calling the deprecated `invalidate()` expecting a cache drop.**
   It clears every registered route as well. Use `invalidateCache()` for the cache, `reset()` when you really mean to empty the manager.

## RELATED

- [@zudojs/schema](https://zudojs.oyinlola.site/docs/packages-schema.md) — defines the schemas `addSchema` converts. Start here if you have no schemas yet.
- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — the server that turns `{ status, headers, body }` into a real response.
- [@zudojs/api](https://zudojs.oyinlola.site/docs/packages-api.md) — defines the operations whose metadata feeds `addRoute`.
- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the `BaseError` every OpenAPI error extends.
- [@zudojs/validation](https://zudojs.oyinlola.site/docs/packages-validation.md) — checks incoming requests at runtime, which OpenAPI only describes.

## COMPLETE EXPORT INDEX

Every name `@zudojs/openapi` exports from its package root at v1.2.0 — **117** in total, generated from the package&rsquo;s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 117 exports**

Classes (17)

`OpenAPIComponentConflictError` `OpenAPIComponentError` `OpenAPIDocumentBuilder` `OpenAPIDocumentError` `OpenAPIError` `OpenAPIManager` `OpenAPIOperationError` `OpenAPIReferenceError` `OpenAPIRegistryImpl` `OpenAPIRouteError` `OpenAPIRouteScannerImpl` `OpenAPISchemaError` `OpenAPISerializationError` `OpenAPIValidationError` `OpenAPIValidatorImpl` `OpenAPIVersionError` `SchemaRegistryImpl`

Functions (22)

`buildResponses` `convertRouteToOpenAPI` `convertSchema` `createComponentReference` `createOpenAPIDocumentBuilder` `createOpenAPIError` `createOpenAPIManager` `createOpenAPIValidator` `createSchemaConverter` `escapeJsonPointerSegment` `extractPathParameters` `formatIssuePath` `isOpenAPIError` `isOpenAPIMethod` `isVersion31` `renderOpenAPIUI` `svgToDataUri` `toOpenAPIJSON` `toOpenAPIPath` `toOpenAPIYAML` `unescapeJsonPointerSegment` `zudoLogo`

Interfaces (49)

`OpenAPIComponentRegistration` `OpenAPIComponents` `OpenAPIContact` `OpenAPIDiscriminator` `OpenAPIDocument` `OpenAPIDocumentOptions` `OpenAPIDocumentResponse` `OpenAPIEncoding` `OpenAPIErrorOptions` `OpenAPIExample` `OpenAPIExternalDocumentation` `OpenAPIHeader` `OpenAPIInfo` `OpenAPILicense` `OpenAPILink` `OpenAPILogo` `OpenAPIManagerOptions` `OpenAPIMediaType` `OpenAPIOAuthFlow` `OpenAPIOAuthFlows` `OpenAPIOperation` `OpenAPIParameter` `OpenAPIPathItem` `OpenAPIReference` `OpenAPIRegistry` `OpenAPIRequestBody` `OpenAPIResponse` `OpenAPIRoute` `OpenAPISchema` `OpenAPISecurityRequirement` `OpenAPISecurityScheme` `OpenAPIServer` `OpenAPIServerVariable` `OpenAPITag` `OpenAPIUIOptions` `OpenAPIUIResponse` `OpenAPIValidationIssue` `OpenAPIValidationResult` `OpenAPIValidator` `OpenAPIXml` `RouteInfo` `RouteMetadata` `RouteOpenAPIMetadata` `RouteParameterMetadata` `SchemaConversionOptions` `SchemaConversionResult` `SchemaConverter` `SchemaRegistry` `SchemaRegistryOptions`

Type aliases (7)

`ComponentSection` `OpenAPIHttpMethod` `OpenAPIParameterLocation` `OpenAPIPaths` `OpenAPIResponses` `OpenAPIUIRenderer` `OpenAPIVersion`

Constants (22)

`COMPONENT_REF_PREFIX` `DEFAULT_MEDIA_TYPE` `DEFAULT_OPENAPI_VERSION` `DEFAULT_SERVER_URL` `DOCUMENT_CACHE_TTL_MS` `MAX_OPERATION_ID_LENGTH` `PATH_TEMPLATE_PARAMETER` `RESPONSE_KEY_PATTERN` `STATUS_CODE_CATEGORIES` `SUPPORTED_OPENAPI_VERSIONS` `ZUDO_FAVICON_DATA_URI` `ZUDO_FAVICON_SVG` `ZUDO_MARK_DARK_DATA_URI` `ZUDO_MARK_DARK_SVG` `ZUDO_MARK_DATA_URI` `ZUDO_MARK_SVG` `ZUDO_SITE_URL` `ZUDO_WORDMARK_DARK_DATA_URI` `ZUDO_WORDMARK_DARK_SVG` `ZUDO_WORDMARK_DATA_URI` `ZUDO_WORDMARK_SVG` `ZUDOLIB_TO_OPENAPI_METHODS`
