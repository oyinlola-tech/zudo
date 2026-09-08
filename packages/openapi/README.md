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

Nullability follows the target version: `type: ["string", "null"]` for 3.1,
`nullable: true` for 3.0.x. Recursive schemas are detected and reported rather
than overflowing the stack — register the recursive type as a named component
and reference it with `$ref`.

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
- that every local `$ref` resolves
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
- Serving a spec to Swagger UI, Redoc or Postman
- Feeding client and server code generators
- Contract checks in CI
