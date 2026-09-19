---
"@zudojs/openapi": minor
---

Round 10 fixes.

- **edge/OPENAPI-01:** string and array schemas without an explicit `.max()` now emit the effective ceiling `@zudojs/schema` enforces at parse time (`maxLength: 255`, `maxItems: 1000`), so clients generated from the document no longer send payloads the server rejects. Behaviour change: generated documents gain these `maxLength` / `maxItems` keywords.
- **edge/OPENAPI-02 (security):** the documentation page loads exact, pinned viewer versions (`swagger-ui-dist@5.33.0`, `redoc@2.5.4` from cdn.jsdelivr.net) with Subresource Integrity hashes instead of the floating `swagger-ui-dist@5` / `redoc/latest` tags. `toUIResponse` now sends `x-content-type-options: nosniff` and a restrictive `content-security-policy` (scripts only from the asset origin plus the hash of the page's inline bootstrap script; `connect-src` limited to the page origin, spec URL and the document's servers). New opt-in options: `assetIntegrity`, `contentSecurityPolicy` (string or `false`), `connectSources`. New exports: `buildOpenAPIUIContentSecurityPolicy`, `SWAGGER_UI_VERSION`, `REDOC_VERSION`, `OpenAPIUIAssetIntegrity`. Behaviour change: the default asset host moved from unpkg / cdn.redoc.ly to cdn.jsdelivr.net, and a self-hosted `assetsBaseUrl` gets no `integrity` attribute unless `assetIntegrity` is passed.
- **edge/OPENAPI-03:** `ZUDO_SITE_URL` (the default logo link on the docs page and in `info["x-logo"].href`) is now `https://zudojs.oyinlola.site` instead of `https://zudo.dev`.

Round 10 phase 2:

- CONV-02: `OpenAPIError` and `OpenAPIErrorOptions` are re-exported from `@zudojs/errors` (same code, category, 500 / not exposed defaults). `createOpenAPIError`, `isOpenAPIError` and the subclasses are unchanged and now extend the shared class.
- The schema converter reads `SCHEMA_DEFAULT_MAX_STRING_LENGTH` / `SCHEMA_DEFAULT_MAX_ARRAY_LENGTH` from `@zudojs/constants`; the internal mirror (`openApiConstants.schemaLimits.ts`) is deleted. No output change.
