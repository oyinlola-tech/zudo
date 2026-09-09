---
"@zudojs/openapi": minor
---

Add branded documentation pages and the `x-logo` extension so the Zudo mark shows up wherever the generated spec is viewed.

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
