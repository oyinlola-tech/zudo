/**
 * @zudojs/openapi/openApiUi
 *
 * Renders a branded documentation page (Swagger UI or ReDoc) for a served
 * OpenAPI document. The page carries the Zudo mark in its header and as its
 * favicon, and reads the specification from `specUrl`.
 *
 * The returned string is a complete HTML document; serve it with
 * `content-type: text/html`. {@link OpenAPIManager.toUIResponse} does that.
 */

import type { OpenAPILogo } from "../openApiTypes/openApiTypes.core.js";
import {
  ZUDO_FAVICON_DATA_URI,
  ZUDO_MARK_DATA_URI,
  ZUDO_SITE_URL,
  ZUDO_WORDMARK_DARK_DATA_URI,
} from "./openApiUi.brand.js";

/** Which viewer to render. */
export type OpenAPIUIRenderer = "swagger" | "redoc";

/** Options for {@link renderOpenAPIUI}. */
export interface OpenAPIUIOptions {
  /** URL the page fetches the specification from, e.g. `/openapi.json`. */
  readonly specUrl: string;
  /** Page title. Default: "API reference". */
  readonly title?: string;
  /** Viewer. Default: "swagger". */
  readonly renderer?: OpenAPIUIRenderer;
  /**
   * Logo shown in the page header. Default: the Zudo wordmark linking to
   * zudo.dev. Pass `false` to render no logo at all.
   */
  readonly logo?: OpenAPILogo | false;
  /** Favicon URL or data URI. Default: the Zudo favicon. */
  readonly favicon?: string | false;
  /** Extra CSS appended after the built-in theme. */
  readonly customCss?: string;
  /**
   * Base URL the viewer's own assets load from. Defaults to a public CDN:
   * `https://unpkg.com/swagger-ui-dist@5` for Swagger UI and
   * `https://cdn.redoc.ly/redoc/latest/bundles` for ReDoc. Point it at a
   * self-hosted copy for air-gapped deployments.
   */
  readonly assetsBaseUrl?: string;
  /** Options forwarded to `SwaggerUIBundle(...)`; ignored by ReDoc. */
  readonly swaggerOptions?: Readonly<Record<string, unknown>>;
}

const DEFAULT_TITLE = "API reference";
const SWAGGER_ASSETS = "https://unpkg.com/swagger-ui-dist@5";
const REDOC_ASSETS = "https://cdn.redoc.ly/redoc/latest/bundles";

/** The default logo used by every branded page and by `info["x-logo"]`. */
export function zudoLogo(overrides?: Partial<OpenAPILogo>): OpenAPILogo {
  return Object.freeze({
    url: ZUDO_MARK_DATA_URI,
    href: ZUDO_SITE_URL,
    altText: "Zudo",
    backgroundColor: "#FAFAF9",
    ...overrides,
  });
}

/** Escapes text for safe interpolation into HTML attribute or text nodes. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Serialises a value for an inline `<script>` without letting `</script>` through. */
function jsLiteral(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Rejects URLs that could execute script when placed in `src`/`href`. */
function safeUrl(value: string): string {
  const trimmed = value.trim();
  if (/^\s*(javascript|vbscript):/i.test(trimmed)) {
    throw new TypeError(`Refusing to render a "${trimmed.split(":")[0]}:" URL`);
  }
  return escapeHtml(trimmed);
}

const THEME_CSS = `
:root{--zd-ink:#1A1A2E;--zd-red:#C0392B;--zd-bg:#FAFAF9;--zd-border:#E5E7EB}
*{border-radius:0!important}
html,body{margin:0;background:var(--zd-bg);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
.zudo-bar{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:14px;height:56px;padding:0 20px;background:var(--zd-ink);color:var(--zd-bg);border-bottom:3px solid var(--zd-red)}
.zudo-bar a{display:inline-flex;align-items:center;color:inherit;text-decoration:none}
.zudo-bar img{height:22px;width:auto;display:block}
.zudo-bar .zudo-sep{width:1px;height:22px;background:rgba(250,250,249,.25)}
.zudo-bar .zudo-title{font-weight:800;font-size:14px;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zudo-bar .zudo-spec{margin-left:auto;font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em;text-transform:uppercase;color:rgba(250,250,249,.75);border:2px solid rgba(250,250,249,.3);padding:6px 10px}
.zudo-bar .zudo-spec:hover{border-color:var(--zd-bg);color:var(--zd-bg)}
.zudo-foot{padding:16px 20px;border-top:1px solid var(--zd-border);color:#6B7280;font-size:12px;display:flex;gap:8px;align-items:center}
.zudo-foot img{height:14px;width:auto}
.swagger-ui .topbar{display:none}
.swagger-ui .info .title{font-weight:900;letter-spacing:-.01em;color:var(--zd-ink)}
.swagger-ui .opblock{border-width:2px;box-shadow:none}
.swagger-ui .btn{border-width:2px;font-weight:700}
.swagger-ui .btn.execute{background:var(--zd-red);border-color:var(--zd-red)}
.swagger-ui .scheme-container{box-shadow:none;border-bottom:1px solid var(--zd-border);background:#fff}
`;

function header(options: OpenAPIUIOptions, title: string): string {
  const logo = options.logo === undefined ? zudoLogo({ url: ZUDO_WORDMARK_DARK_DATA_URI }) : options.logo;
  const logoHtml =
    logo === false
      ? ""
      : `<a class="zudo-logo" href="${safeUrl(logo.href ?? ZUDO_SITE_URL)}" rel="noopener"><img src="${safeUrl(logo.url)}" alt="${escapeHtml(logo.altText ?? "Zudo")}"></a><span class="zudo-sep" aria-hidden="true"></span>`;
  return (
    `<header class="zudo-bar">${logoHtml}<span class="zudo-title">${escapeHtml(title)}</span>` +
    `<a class="zudo-spec" href="${safeUrl(options.specUrl)}">Open spec</a></header>`
  );
}

function footer(): string {
  return `<footer class="zudo-foot"><span>Generated by</span><a href="${ZUDO_SITE_URL}" rel="noopener"><img src="${ZUDO_MARK_DATA_URI}" alt="Zudo"></a><span>@zudojs/openapi</span></footer>`;
}

function head(options: OpenAPIUIOptions, title: string, extra: string): string {
  const favicon =
    options.favicon === false
      ? ""
      : `<link rel="icon" href="${safeUrl(options.favicon ?? ZUDO_FAVICON_DATA_URI)}">`;
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="theme-color" content="#1A1A2E">` +
    `<title>${escapeHtml(title)}</title>${favicon}${extra}` +
    `<style>${THEME_CSS}${options.customCss ?? ""}</style></head>`
  );
}

/** Renders a complete, branded documentation page for `options.specUrl`. */
export function renderOpenAPIUI(options: OpenAPIUIOptions): string {
  if (!options || typeof options.specUrl !== "string" || !options.specUrl.trim()) {
    throw new TypeError("renderOpenAPIUI requires a specUrl");
  }
  const title = options.title ?? DEFAULT_TITLE;
  const renderer = options.renderer ?? "swagger";

  if (renderer === "redoc") {
    const base = (options.assetsBaseUrl ?? REDOC_ASSETS).replace(/\/+$/, "");
    return (
      head(options, title, "") +
      `<body>${header(options, title)}` +
      `<redoc spec-url="${safeUrl(options.specUrl)}" hide-hostname></redoc>` +
      `<script src="${safeUrl(base)}/redoc.standalone.js"></script>` +
      `${footer()}</body></html>`
    );
  }

  const base = (options.assetsBaseUrl ?? SWAGGER_ASSETS).replace(/\/+$/, "");
  const config = {
    url: options.specUrl,
    dom_id: "#zudo-openapi",
    deepLinking: true,
    displayRequestDuration: true,
    tryItOutEnabled: true,
    ...options.swaggerOptions,
  };
  return (
    head(options, title, `<link rel="stylesheet" href="${safeUrl(base)}/swagger-ui.css">`) +
    `<body>${header(options, title)}<div id="zudo-openapi"></div>` +
    `<script src="${safeUrl(base)}/swagger-ui-bundle.js" crossorigin></script>` +
    `<script>window.addEventListener("load",function(){window.ui=SwaggerUIBundle(${jsLiteral(config)});});</script>` +
    `${footer()}</body></html>`
  );
}
