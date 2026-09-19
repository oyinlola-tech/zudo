/**
 * Content-Security-Policy for the documentation page.
 *
 * The page runs third-party viewer code on the API's own origin, so the
 * policy limits scripts to the viewer's asset origin plus the hash of the
 * page's single inline bootstrap script, forbids plugins, framing by other
 * origins and `<base>` rewrites, and limits `fetch` to the page's origin, the
 * spec URL and the servers the document declares ("Try it out" calls them).
 */

import { createHash } from "node:crypto";

import type { OpenAPIDocument } from "../openApiTypes/openApiTypes.core.js";
import type { OpenAPIUIOptions } from "./openApiUi.core.js";
import { DEFAULT_REDOC_ASSETS, DEFAULT_SWAGGER_ASSETS } from "./openApiUi.assets.js";
import { swaggerInitScript } from "./openApiUiPage/index.js";

/** Returns `'self'` for relative URLs, the origin for absolute http(s) ones. */
export function cspSourceFor(url: string): string | undefined {
  const trimmed = url.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !trimmed.startsWith("//")) {
    return "'self'";
  }
  try {
    const parsed = new URL(trimmed.startsWith("//") ? `https:${trimmed}` : trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
}

function unique(values: readonly (string | undefined)[]): string {
  return [...new Set(values.filter((v): v is string => v !== undefined))].join(" ");
}

/**
 * Builds the `content-security-policy` header value for a page rendered by
 * `renderOpenAPIUI(options)`.
 *
 * @param options - The same options the page was rendered with.
 * @param connectSources - Extra URLs or origins "Try it out" may call,
 *   typically the document's `servers`.
 */
export function buildOpenAPIUIContentSecurityPolicy(
  options: OpenAPIUIOptions,
  connectSources: readonly string[] = [],
): string {
  const renderer = options.renderer ?? "swagger";
  const assets =
    options.assetsBaseUrl ??
    (renderer === "redoc" ? DEFAULT_REDOC_ASSETS : DEFAULT_SWAGGER_ASSETS);
  const assetSource = cspSourceFor(assets) ?? "'self'";
  const scriptSources =
    renderer === "redoc"
      ? [assetSource]
      : [
          assetSource,
          `'sha256-${createHash("sha256")
            .update(swaggerInitScript(options))
            .digest("base64")}'`,
        ];
  const connect = unique([
    "'self'",
    cspSourceFor(options.specUrl),
    ...connectSources.map(cspSourceFor),
  ]);
  return [
    "default-src 'none'",
    `script-src ${unique(scriptSources)}`,
    `style-src ${unique([assetSource, "'unsafe-inline'"])}`,
    "img-src 'self' data: https:",
    `font-src ${unique([assetSource, "data:"])}`,
    `connect-src ${connect}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}

/** Every `servers[].url` in a document: top level, path items and operations. */
export function documentServerUrls(document: OpenAPIDocument): string[] {
  const urls = (document.servers ?? []).map((s) => s.url);
  for (const item of Object.values(document.paths ?? {})) {
    if (item === undefined || item === null) continue;
    for (const s of item.servers ?? []) urls.push(s.url);
    for (const value of Object.values(item)) {
      const servers = (value as { readonly servers?: unknown } | null)?.servers;
      if (!Array.isArray(servers)) continue;
      for (const s of servers as { readonly url?: unknown }[]) {
        if (typeof s?.url === "string") urls.push(s.url);
      }
    }
  }
  return urls;
}
