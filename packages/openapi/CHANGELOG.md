# @zudojs/openapi

## 1.2.0

### Minor Changes

- - Schema conversion: constraints on `coerce.number()` / `coerce.string()` (`int`, `min`, `max`, `pattern`, …) are now carried into the document instead of a bare `type`; `s.transform(schema, fn)` converts to its source schema instead of `{}`; a `.default(() => value)` factory is invoked and its value emitted rather than the function (which JSON dropped silently); `s.bigint()` converts like `coerce.bigint()`.
  - Schema conversion: object properties with a `default`, or typed `any` / `unknown`, are no longer listed as `required`, matching what the object parser accepts; `.required()` still forces every key on.
  - `OpenAPIManager.removeRoute()` (and hiding a route via `setRoute`) now takes effect on the next `generate()`; previously a route stayed in every later document once one had been generated. `OpenAPIRegistryImpl` gains `removeRoute(method, path)` and `clearRoutes()`.
  - `OpenAPIManager.toUIResponse()` renders a custom `branding` logo in the page header, as documented, instead of always showing the default wordmark.
  - Documentation page: URL guards strip ASCII control characters before reading the scheme, so `java\nscript:` / `java\tscript:` URLs are refused; a `data:` URL that is not `data:image/*` is refused (the assets base is interpolated into `<script src>`).
  - Validator: local `$ref`s are resolved against own properties only (`#/components/schemas/constructor` no longer validates); an operation-level parameter overriding a path-level one is accepted instead of reported as a duplicate; two paths identical apart from template parameter names are reported as an error.
  - YAML serializer: quotes `.inf` / `.nan`, hex / octal / binary integers, `_`-grouped digits, sexagesimal numbers, dates and timestamps, `=` and `<<`, and control characters, all of which a YAML parser turned into non-string values (an `info.version` of `2024-01-01` became a date, an enum value `0x1F` became `31`).

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1

## 1.1.0

### Minor Changes

- [`ff883a7`](https://github.com/oyinlola-tech/zudo/commit/ff883a799aefd7aa2abfc3c3c54bc18dc0b43797) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Add branded documentation pages and the `x-logo` extension so the Zudo mark shows up wherever the generated spec is viewed.

  **`OpenAPIManager.toUIResponse({ specUrl })`** returns a ready-to-serve HTML
  page (`{ status, headers, body }`, like `toResponse()`) that renders Swagger UI
  by default or ReDoc with `renderer: "redoc"`. The page carries a Zudo header
  bar with the wordmark, the Zudo favicon, a link to the raw spec and a footer
  credit, themed to match the framework's design system. Assets load from a
  public CDN by default; `assetsBaseUrl` points them at a self-hosted copy.

  ```ts
  app.get("/openapi.json", () => manager.toResponse());
  app.get("/docs", () => manager.toUIResponse({ specUrl: "/openapi.json" }));
  ```

  **`info["x-logo"]` is now typed (`OpenAPILogo`) and set by default.** The
  generated document carries the Zudo mark as a data URI in `info["x-logo"]`, so
  ReDoc, Scalar and other viewers that honour the extension show it without any
  page of ours involved. Pass `branding: false` to the manager to emit no logo,
  or `branding: { url, href, altText }` to use your own; a logo already present
  on `info` is never overwritten.

  **New exports:** `renderOpenAPIUI`, `zudoLogo`, `svgToDataUri`, the
  `ZUDO_*_SVG` / `ZUDO_*_DATA_URI` brand constants, `ZUDO_SITE_URL`, and the
  `OpenAPIUIOptions`, `OpenAPIUIRenderer`, `OpenAPIUIResponse`, `OpenAPILogo`
  types.

  Titles, spec URLs and Swagger options are HTML/JS-escaped before interpolation
  and `javascript:` URLs are rejected, so untrusted `info.title` values cannot
  inject markup into the page.

## 1.0.0

### Major Changes

- [`16f14c3`](https://github.com/oyinlola-tech/zudo/commit/16f14c36d05f664d914bc6e1b9de70f67ff55860) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - BREAKING CHANGE: Rename all packages from `@zudojs/*` to `@zudojs/*` and `@zudojs/cli` to `zudojs-cli`.

  - Scoped packages: `@zudojs/adapters`, `@zudojs/api`, `@zudojs/auth`, etc.
  - CLI package: `zudojs-cli` (unscoped)
  - All internal imports, docs, CI, and examples updated

  Migration:

  ```bash
  # Old
  npm install @zudojs/cli
  npm install @zudojs/errors

  # New
  npm install zudojs-cli
  npm install @zudojs/errors
  ```

### Patch Changes

- Updated dependencies [[`16f14c3`](https://github.com/oyinlola-tech/zudo/commit/16f14c36d05f664d914bc6e1b9de70f67ff55860)]:
  - @zudojs/constants@1.0.0
  - @zudojs/errors@1.0.0
  - @zudojs/schema@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/constants@0.1.2
  - @zudojs/schema@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/constants@0.1.1
  - @zudojs/schema@0.1.1
